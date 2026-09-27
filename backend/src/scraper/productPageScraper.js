const { SELECTORS, TIMING } = require('./config');
const { firstMatch, textOf } = require('./dom');
const { TransientScrapeError } = require('./errorClassification');

async function selectDesiredOption(page, { optionLabel, optionKey }) {
  const selectMatch = await firstMatch(page, SELECTORS.optionSelect, { timeoutMs: 1500 });
  if (selectMatch) {
    const selectLocator = selectMatch.locator;
    const options = selectLocator.locator('option');
    const count = await options.count();

    for (let index = 0; index < count; index += 1) {
      const option = options.nth(index);
      const label = (await option.innerText().catch(() => '')).trim();
      const value = (await option.getAttribute('value').catch(() => '') || '').trim();
      const normalized = `${label} ${value}`.toLowerCase();

      if (
        normalized.includes((optionLabel || '').toLowerCase()) ||
        normalized.includes((optionKey || '').toLowerCase())
      ) {
        if (value) {
          await selectLocator.selectOption({ value });
        } else {
          await selectLocator.selectOption({ label: label || optionLabel || optionKey || '' });
        }
        return `select:${selectMatch.matchedSelector}`;
      }
    }

    if (count > 0) {
      const first = options.first();
      const value = await first.getAttribute('value').catch(() => null);
      const label = await first.innerText().catch(() => '');
      if (value) {
        await selectLocator.selectOption({ value });
      } else {
        await selectLocator.selectOption({ label: label.trim() });
      }
      return `select:${selectMatch.matchedSelector}:fallback`;
    }
  }

  const buttonMatch = await firstMatch(page, SELECTORS.optionButton, { timeoutMs: 1500 });
  if (buttonMatch) {
    const count = await buttonMatch.locator.count();
    for (let index = 0; index < count; index += 1) {
      const button = buttonMatch.locator.nth(index);
      const label = (await button.innerText().catch(() => '')).trim();
      const normalized = label.toLowerCase();
      if (
        normalized.includes((optionLabel || '').toLowerCase()) ||
        normalized.includes((optionKey || '').toLowerCase())
      ) {
        await button.click();
        return `button:${buttonMatch.matchedSelector}`;
      }
    }

    await buttonMatch.locator.first().click().catch(() => {});
    return `button:${buttonMatch.matchedSelector}:fallback`;
  }

  return 'default';
}

async function readTextFromSelectors(page, selectors) {
  for (const selector of selectors) {
    const locator = page.locator(selector).first();
    try {
      await locator.waitFor({ state: 'attached', timeout: 1200 });
      const text = await textOf(locator);
      if (text) return { text, selector };
    } catch {
      // try the next fallback selector
    }
  }
  return { text: '', selector: null };
}

async function scrapeProductOption(page, { productUrl, optionKey, optionLabel }) {
  if (!productUrl) {
    throw new TransientScrapeError('Product URL is required', 'PRODUCT_URL_MISSING');
  }

  const parseStrategy = await selectDesiredOption(page, { optionLabel, optionKey });
  await page.waitForTimeout(Math.max(250, Math.floor(TIMING.contentWaitMs / 2)));

  const priceMatch = await readTextFromSelectors(page, SELECTORS.price);
  const stockMatch = await readTextFromSelectors(page, SELECTORS.stock);

  if (!priceMatch.text) {
    throw new TransientScrapeError('Could not locate a price element on the product page', 'PRICE_ELEMENT_MISSING');
  }

  return {
    rawPriceText: priceMatch.text,
    rawStockText: stockMatch.text,
    parseStrategy: `${parseStrategy};price=${priceMatch.selector || 'missing'};stock=${stockMatch.selector || 'missing'}`,
  };
}

module.exports = { scrapeProductOption };