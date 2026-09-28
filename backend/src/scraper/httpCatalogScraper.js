const cheerio = require('cheerio');
const { STORE_BASE_URL, CATALOG } = require('./config');
const { createLogger } = require('../utils/logger');
const { mapWithConcurrency } = require('../utils/concurrency');

const log = createLogger('http-catalog');

/**
 * Extracts the numeric store product ID from a SKU string like "SK-2104-AB3".
 * Returns null if the pattern doesn't match.
 */
function parseSkuText(skuText) {
  const match = (skuText || '').match(/SK-(\d+)-([A-Z0-9]+)?/i);
  return match ? { storeProductId: match[1], sku: skuText.trim() } : null;
}

/**
 * Fetches a single catalog listing page via HTTP and parses it with Cheerio.
 * Returns an array of product rows ready for upserting into the DB.
 *
 * This is ~100x faster than Playwright because there's no browser launch,
 * no JS execution, no screenshots — just an HTTP GET + HTML parsing.
 *
 * The mock store's listing pages render product cards as server-side HTML:
 *   <article class="card">
 *     <h2 class="card-title">Product Name</h2>
 *     <span class="card-maker">Brand</span>
 *     <span class="dept-label">Department</span>
 *     <span class="card-code">SK-2104-AB3</span>
 *     <a href="/item/2104">OPEN ITEM</a>
 *   </article>
 */
async function fetchCatalogPageHttp(pageNumber) {
  const url = `${STORE_BASE_URL}/?page=${pageNumber}`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), CATALOG.httpTimeoutMs);

  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'PriceTrackerBot/2.0 (+catalog-sync)',
        'Accept': 'text/html',
      },
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status} ${response.statusText} for ${url}`);
    }

    const html = await response.text();
    return parseCatalogPageHtml(html, pageNumber);
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Parses the HTML of a catalog listing page and extracts product data.
 */
function parseCatalogPageHtml(html, pageNumber) {
  const $ = cheerio.load(html);
  const rows = [];

  // Try multiple selectors for product cards in priority order
  const cardSelectors = ['article.card', '[data-testid="product-card"]', 'article'];
  let cards = $();

  for (const selector of cardSelectors) {
    cards = $(selector);
    if (cards.length > 0) break;
  }

  cards.each((index, el) => {
    const card = $(el);

    // Extract product name
    const title = (
      card.find('.card-title').text() ||
      card.find('h2').text() ||
      card.find('h3').text() ||
      ''
    ).trim();

    // Extract brand
    const brand = (
      card.find('.card-maker').text() ||
      card.find('.brand').text() ||
      ''
    ).trim();

    // Extract department
    const department = (
      card.find('.dept-label').text() ||
      card.find('.department').text() ||
      ''
    ).trim();

    // Extract SKU code
    const skuText = (
      card.find('.card-code').text() ||
      card.find('[class*="code"]').text() ||
      ''
    ).trim();

    const skuData = parseSkuText(skuText);
    if (!title || !skuData) return; // skip cards with missing essential data

    rows.push({
      store_product_id: skuData.storeProductId,
      name: title,
      product_url: `${STORE_BASE_URL}/item/${skuData.storeProductId}`,
      metadata_json: {
        brand: brand || null,
        department: department || null,
        sku: skuText || null,
        catalog_page_number: pageNumber,
        catalog_page_index: index,
      },
      updated_at: new Date().toISOString(),
    });
  });

  return rows;
}

/**
 * Fetches a single catalog page with retries.
 */
async function fetchCatalogPageWithRetry(pageNumber) {
  let lastError = null;

  for (let attempt = 1; attempt <= CATALOG.httpRetries + 1; attempt += 1) {
    try {
      const rows = await fetchCatalogPageHttp(pageNumber);
      return rows;
    } catch (error) {
      lastError = error;
      log.warn('catalog_page_http_failed', {
        pageNumber,
        attempt,
        maxAttempts: CATALOG.httpRetries + 1,
        error: error,
      });

      if (attempt <= CATALOG.httpRetries) {
        // Brief delay before retry, increasing with each attempt
        await new Promise((r) => setTimeout(r, 500 * attempt));
      }
    }
  }

  throw lastError;
}

/**
 * Syncs the entire catalog (all 48 pages) using HTTP + Cheerio.
 * Fetches pages in parallel batches of CATALOG.httpConcurrency.
 *
 * Returns { pages, rows, failedPages, durationMs }.
 */
async function syncAllPagesHttp() {
  const startedAt = Date.now();
  const pageNumbers = Array.from({ length: CATALOG.totalPages }, (_, i) => i + 1);
  const allRows = [];
  const failedPages = [];

  log.info('http_catalog_sync_started', {
    totalPages: CATALOG.totalPages,
    concurrency: CATALOG.httpConcurrency,
  });

  await mapWithConcurrency(pageNumbers, CATALOG.httpConcurrency, async (pageNumber) => {
    try {
      const rows = await fetchCatalogPageWithRetry(pageNumber);
      if (rows.length > 0) {
        allRows.push(...rows);
      }
      log.debug('catalog_page_fetched', { pageNumber, rows: rows.length });
    } catch (error) {
      failedPages.push(pageNumber);
      log.error('catalog_page_skipped', { pageNumber, error: error });
    }
  });

  const durationMs = Date.now() - startedAt;
  log.info('http_catalog_sync_finished', {
    pages: pageNumbers.length - failedPages.length,
    failedPages: failedPages.length,
    totalRows: allRows.length,
    durationMs,
  });

  return { rows: allRows, pages: pageNumbers.length - failedPages.length, failedPages, durationMs };
}

module.exports = {
  fetchCatalogPageHttp,
  fetchCatalogPageWithRetry,
  syncAllPagesHttp,
  parseCatalogPageHtml,
  parseSkuText,
};
