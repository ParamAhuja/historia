const { STORE_BASE_URL, SELECTORS, TIMING } = require('./config');
const { firstMatch, firstMatchAll, textOf } = require('./dom');
const { TransientScrapeError } = require('./errorClassification');
const { fetchProductOptionsHttp } = require('./httpItemScraper');
const { createLogger } = require('../utils/logger');

const log = createLogger('product-search');

/**
 * Extracts a store_product_id from a product page URL. Handles both
 * path-style (/item/2104) and query-string style (?id=2104) URLs.
 */
function extractStoreProductId(url) {
  try {
    const u = new URL(url, STORE_BASE_URL);
    const qId = u.searchParams.get('id') || u.searchParams.get('productId');
    if (qId) return qId;
    const parts = u.pathname.split('/').filter(Boolean);
    return parts[parts.length - 1] || url;
  } catch {
    return url;
  }
}

/**
 * Extracts the numeric store product ID from a SKU text like "SK-2104-AB3".
 */
function extractStoreProductIdFromSku(skuText) {
  const match = (skuText || '').match(/SK-(\d+)-/i);
  return match ? match[1] : null;
}

/**
 * Loads a single product page via Playwright and returns the available option
 * labels (e.g. "128GB", "256GB") so the frontend can let the user pick which
 * one to track.
 *
 * STRATEGY: Try HTTP + Cheerio first (< 1 second), then fall back to
 * Playwright (5-8 seconds) only if the page requires JS to render options.
 */
async function fetchProductOptions(page, productUrl) {
  // Phase 1: Try HTTP first (fast path)
  log.info('fetching_options_http_first', { productUrl });
  const httpOptions = await fetchProductOptionsHttp(productUrl);
  if (httpOptions !== null) {
    log.info('options_found_via_http', { productUrl, count: httpOptions.length });
    return httpOptions;
  }

  // Phase 2: Fall back to Playwright (the page needs JS rendering)
  log.info('falling_back_to_playwright', { productUrl });
  try {
    await page.goto(productUrl, { waitUntil: 'domcontentloaded', timeout: TIMING.navTimeoutMs });
  } catch (err) {
    throw new TransientScrapeError(`Failed to load product page: ${err.message}`, 'NAV_TIMEOUT');
  }
  await page.waitForTimeout(TIMING.contentWaitMs);

  // Try <select> dropdowns
  const select = await firstMatch(page, SELECTORS.optionSelect, { timeoutMs: 2000 });
  if (select) {
    const optionEls = select.locator.locator('option');
    const n = await optionEls.count();
    const options = [];
    for (let i = 0; i < n; i += 1) {
      const label = (await optionEls.nth(i).innerText().catch(() => '')).trim();
      if (label && label.toLowerCase() !== 'select' && label.toLowerCase() !== 'choose') {
        options.push({ label, key: label.toLowerCase().replace(/\s+/g, '_') });
      }
    }
    if (options.length) {
      log.info('options_found_via_playwright_select', { productUrl, count: options.length });
      return options;
    }
  }

  // Try button groups
  const group = await firstMatchAll(page, SELECTORS.optionButton, { timeoutMs: 2000 });
  if (group) {
    const n = Math.min(await group.locator.count(), 20);
    const options = [];
    for (let i = 0; i < n; i += 1) {
      const label = (await group.locator.nth(i).innerText().catch(() => '')).trim();
      if (label && label.length < 60) {
        options.push({ label, key: label.toLowerCase().replace(/\s+/g, '_') });
      }
    }
    if (options.length) {
      log.info('options_found_via_playwright_buttons', { productUrl, count: options.length });
      return options;
    }
  }

  // No distinct options found — treat as a single "Default" option
  log.info('no_options_found_using_default', { productUrl });
  return [{ label: 'Default', key: 'default' }];
}

module.exports = { fetchProductOptions, extractStoreProductId, extractStoreProductIdFromSku };
