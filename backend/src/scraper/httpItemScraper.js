const cheerio = require('cheerio');
const { STORE_BASE_URL, CATALOG } = require('./config');
const { createLogger } = require('../utils/logger');

const log = createLogger('http-item');

/**
 * Fetches a single item page via HTTP and extracts the available options
 * (e.g. storage sizes, pack sizes) from the static HTML.
 *
 * The item page at /item/{id} may render options as:
 *   1. A <select> dropdown with <option> elements
 *   2. A group of buttons
 *
 * If options are rendered server-side, this is 100x faster than Playwright.
 * If the page requires JavaScript to render options, returns null so the
 * caller can fall back to Playwright.
 */
async function fetchProductOptionsHttp(productUrl) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), CATALOG.httpTimeoutMs);

  try {
    const response = await fetch(productUrl, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'PriceTrackerBot/2.0 (+options-check)',
        'Accept': 'text/html',
      },
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status} for ${productUrl}`);
    }

    const html = await response.text();
    return parseItemPageOptions(html);
  } catch (error) {
    log.warn('http_item_options_failed', { productUrl, error: error });
    return null; // signal caller to fall back to Playwright
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Parses the HTML of an item page and extracts options.
 * Returns an array of { label, key } or null if no options found in static HTML.
 */
function parseItemPageOptions(html) {
  const $ = cheerio.load(html);
  const options = [];

  // Try <select> dropdowns first
  const selectSelectors = ['select[name*="option" i]', 'select[id*="option" i]', 'select'];
  for (const sel of selectSelectors) {
    const selectEl = $(sel).first();
    if (selectEl.length > 0) {
      selectEl.find('option').each((_, el) => {
        const label = $(el).text().trim();
        const value = $(el).attr('value') || '';
        if (label && label.toLowerCase() !== 'select' && label.toLowerCase() !== 'choose') {
          options.push({
            label,
            key: (value || label).toLowerCase().replace(/\s+/g, '_'),
          });
        }
      });
      if (options.length > 0) return options;
    }
  }

  // Try button groups
  const buttonSelectors = ['button[role="option"]', 'button[data-option]', '.variant button', '.option button'];
  for (const sel of buttonSelectors) {
    $(sel).each((_, el) => {
      const label = $(el).text().trim();
      if (label && label.length < 60) {
        options.push({
          label,
          key: label.toLowerCase().replace(/\s+/g, '_'),
        });
      }
    });
    if (options.length > 0) return options;
  }

  // If the HTML is mostly empty / a JS shell, return null to trigger fallback
  const bodyText = $('body').text().trim();
  if (bodyText.length < 200) {
    log.debug('item_page_appears_js_rendered', { bodyLength: bodyText.length });
    return null; // JS-rendered page — need Playwright
  }

  // Options found in HTML but none matched our selectors — return default
  return [{ label: 'Default', key: 'default' }];
}

module.exports = { fetchProductOptionsHttp, parseItemPageOptions };
