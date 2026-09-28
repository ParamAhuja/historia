const { SELECTORS, TIMING, STORE_BASE_URL } = require('./config');
const { firstMatch, textOf } = require('./dom');
const { TransientScrapeError } = require('./errorClassification');
const { createLogger } = require('../utils/logger');

const log = createLogger('product-page-scraper');

/**
 * Finds and selects the desired option on the product page (dropdown or button).
 * Returns a string describing which strategy was used, for the scrape log.
 */
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

    // No exact match — select the first option as fallback
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

/**
 * Clicks the "Check today's price" button (or "Check again") and waits
 * for the price to appear. This is the KEY fix — the mock store doesn't
 * show the price until this button is clicked, and the price is a random
 * mock value that changes each time.
 *
 * Returns the strategy string describing which button selector matched.
 */
async function clickPriceCheckButton(page) {
  log.debug('looking_for_price_button');

  // Try each selector for the price check button
  for (const selector of SELECTORS.priceCheckButton) {
    try {
      const button = page.locator(selector).first();
      const isVisible = await button.isVisible({ timeout: TIMING.priceButtonTimeoutMs / SELECTORS.priceCheckButton.length })
        .catch(() => false);

      if (isVisible) {
        const buttonText = await button.innerText().catch(() => '');
        log.info('price_button_found', { selector, buttonText: buttonText.trim() });

        await button.click();
        log.info('price_button_clicked', { selector });

        // Wait for price to appear after clicking
        await page.waitForTimeout(1000);
        return `priceButton:${selector}`;
      }
    } catch {
      // Try next selector
    }
  }

  // Broader fallback: look for any button whose text contains "price" or "check"
  try {
    const buttons = page.locator('button');
    const count = await buttons.count();

    for (let i = 0; i < count; i += 1) {
      const btn = buttons.nth(i);
      const text = (await btn.innerText().catch(() => '')).trim().toLowerCase();
      if (
        text.includes('check') && text.includes('price') ||
        text.includes("today's price") ||
        text.includes('check again')
      ) {
        log.info('price_button_found_by_text', { text, index: i });
        await btn.click();
        await page.waitForTimeout(1000);
        return `priceButton:text-scan:${text}`;
      }
    }
  } catch (err) {
    log.warn('price_button_text_scan_failed', { error: err });
  }

  log.warn('price_button_not_found', {
    note: 'Could not find price-check button — price may already be visible or page structure changed',
  });
  return 'priceButton:not_found';
}

/**
 * Reads text from the first matching selector in the list.
 */
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

/**
 * Waits for a price element to become visible after clicking the price button.
 * Polls multiple selectors with a timeout.
 */
async function waitForPriceElement(page, timeoutMs = TIMING.priceButtonWaitMs) {
  const deadline = Date.now() + timeoutMs;
  const pollInterval = 500;

  while (Date.now() < deadline) {
    const result = await readTextFromSelectors(page, SELECTORS.price);
    if (result.text) {
      log.debug('price_element_found', { text: result.text, selector: result.selector });
      return result;
    }
    await page.waitForTimeout(pollInterval);
  }

  log.warn('price_element_wait_timeout', { timeoutMs });
  return { text: '', selector: null };
}

/**
 * Scrapes a single product option from the item page.
 *
 * CRITICAL: This function handles the mock store's price-check pattern:
 *   1. Navigate to the item page
 *   2. Select the desired option (if applicable)
 *   3. Click the "Check today's price" button
 *   4. Wait for the price to appear
 *   5. Read the price and stock text
 *
 * The page must already be navigated to the product URL before calling.
 */
async function scrapeProductOption(page, { productUrl, optionKey, optionLabel }) {
  if (!productUrl) {
    throw new TransientScrapeError('Product URL is required', 'PRODUCT_URL_MISSING');
  }

  // Step 1: Select the desired option
  const optionStrategy = await selectDesiredOption(page, { optionLabel, optionKey });
  log.debug('option_selected', { strategy: optionStrategy });

  // Brief wait for option selection to take effect
  await page.waitForTimeout(Math.max(250, Math.floor(TIMING.contentWaitMs / 3)));

  // Step 2: Click the "Check today's price" / "Check again" button
  const priceButtonStrategy = await clickPriceCheckButton(page);

  // Step 3: Wait for the price element to appear after the button click
  const priceResult = await waitForPriceElement(page);

  // Step 4: If polling didn't find it, try one more direct read
  let priceMatch = priceResult;
  if (!priceMatch.text) {
    priceMatch = await readTextFromSelectors(page, SELECTORS.price);
  }

  // Step 5: Read stock info
  const stockMatch = await readTextFromSelectors(page, SELECTORS.stock);

  if (!priceMatch.text) {
    throw new TransientScrapeError(
      'Could not locate a price element after clicking the price-check button',
      'PRICE_ELEMENT_MISSING',
    );
  }

  const parseStrategy = [
    optionStrategy,
    priceButtonStrategy,
    `price=${priceMatch.selector || 'missing'}`,
    `stock=${stockMatch.selector || 'missing'}`,
  ].join(';');

  return {
    rawPriceText: priceMatch.text,
    rawStockText: stockMatch.text,
    parseStrategy,
  };
}

module.exports = { scrapeProductOption, clickPriceCheckButton, selectDesiredOption };