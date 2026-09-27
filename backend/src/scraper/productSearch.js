const { STORE_BASE_URL, SELECTORS, TIMING } = require('./config');
const { firstMatch, firstMatchAll, textOf } = require('./dom');
const { TransientScrapeError } = require('./errorClassification');

/**
 * Extracts a store_product_id from a product page URL. Handles both
 * path-style (/product/abc123) and query-string style (?id=abc123) URLs
 * since we don't know the real routing scheme ahead of time.
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
 * Loads the store home page and returns every product whose name contains
 * `query` (case-insensitive, partial match). If the store exposes a real
 * search input we use it (so we benefit from server/client-side filtering
 * and pagination); otherwise we fall back to scraping the full listing and
 * filtering client-side here.
 */
async function searchProducts(page, query) {
  try {
    await page.goto(STORE_BASE_URL, { waitUntil: 'domcontentloaded', timeout: TIMING.navTimeoutMs });
  } catch (err) {
    throw new TransientScrapeError(`Failed to load store home page: ${err.message}`, 'NAV_TIMEOUT');
  }

  const searchInput = await firstMatch(page, SELECTORS.searchInput, { timeoutMs: 3000 });
  if (searchInput && query) {
    try {
      await searchInput.locator.fill(query);
      await page.waitForTimeout(TIMING.contentWaitMs / 2);
    } catch {
      // fall through to client-side filtering below
    }
  }

  // Give async-loaded product grids a moment to render.
  await page.waitForTimeout(500);
  const cards = await firstMatchAll(page, SELECTORS.productCard, { timeoutMs: TIMING.contentWaitMs });
  if (!cards) {
    throw new TransientScrapeError('No product cards found on listing page (site may be slow or markup changed)', 'NO_PRODUCT_CARDS');
  }

  const results = [];
  const count = await cards.locator.count();
  for (let i = 0; i < count; i += 1) {
    const card = cards.locator.nth(i);
    const nameMatch = await firstMatch(card, SELECTORS.productCardName, { timeoutMs: 500 });
    const linkMatch = await firstMatch(card, SELECTORS.productCardLink, { timeoutMs: 500 });
    const name = nameMatch ? await textOf(nameMatch.locator) : (await textOf(card));
    let href = null;
    if (linkMatch) {
      href = await linkMatch.locator.getAttribute('href').catch(() => null);
    } else {
      href = await card.getAttribute('href').catch(() => null);
    }
    if (!name || !href) continue;

    const absoluteUrl = new URL(href, STORE_BASE_URL).toString();
    results.push({
      name,
      productUrl: absoluteUrl,
      storeProductId: extractStoreProductId(absoluteUrl),
    });
  }

  const q = (query || '').trim().toLowerCase();
  const filtered = q ? results.filter((r) => r.name.toLowerCase().includes(q)) : results;

  // De-duplicate by storeProductId (a product can appear more than once in
  // client-filtered listings).
  const seen = new Set();
  return filtered.filter((r) => {
    if (seen.has(r.storeProductId)) return false;
    seen.add(r.storeProductId);
    return true;
  });
}

/**
 * Loads a single product page and returns the available option labels
 * (e.g. "128GB", "256GB") so the frontend can let the user pick which one
 * to track.
 */
async function fetchProductOptions(page, productUrl) {
  try {
    await page.goto(productUrl, { waitUntil: 'domcontentloaded', timeout: TIMING.navTimeoutMs });
  } catch (err) {
    throw new TransientScrapeError(`Failed to load product page: ${err.message}`, 'NAV_TIMEOUT');
  }
  await page.waitForTimeout(TIMING.contentWaitMs / 2);

  const select = await firstMatch(page, SELECTORS.optionSelect, { timeoutMs: 1500 });
  if (select) {
    const optionEls = select.locator.locator('option');
    const n = await optionEls.count();
    const options = [];
    for (let i = 0; i < n; i += 1) {
      const label = (await optionEls.nth(i).innerText().catch(() => '')).trim();
      if (label) options.push({ label, key: label.toLowerCase().replace(/\s+/g, '_') });
    }
    if (options.length) return options;
  }

  const group = await firstMatchAll(page, SELECTORS.optionButton, { timeoutMs: 1500 });
  if (group) {
    const n = Math.min(await group.locator.count(), 20);
    const options = [];
    for (let i = 0; i < n; i += 1) {
      const label = (await group.locator.nth(i).innerText().catch(() => '')).trim();
      if (label && label.length < 60) {
        options.push({ label, key: label.toLowerCase().replace(/\s+/g, '_') });
      }
    }
    if (options.length) return options;
  }

  // No distinct options found - treat the product as having a single
  // implicit "default" option so it can still be tracked.
  return [{ label: 'Default', key: 'default' }];
}

module.exports = { searchProducts, fetchProductOptions, extractStoreProductId };
