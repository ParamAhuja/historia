const express = require('express');
const { BrowserManager } = require('../scraper/browserManager');
const { fetchProductOptions } = require('../scraper/productSearch');
const { searchProducts, ensureCatalogWarm } = require('../services/catalogService');
const { createLogger } = require('../utils/logger');

const router = express.Router();
const log = createLogger('routes/products');

/**
 * GET /api/products/search?q=phone
 *
 * Searches the pre-synced product catalog in Supabase. This endpoint is
 * FAST (< 200ms) because it never launches a browser — it queries the
 * database directly.
 *
 * If the catalog is empty (first boot), returns a helpful message and
 * triggers a background sync.
 */
router.get('/search', async (req, res, next) => {
  const q = (req.query.q || '').toString();
  const requestId = req.requestId;

  if (!q.trim()) {
    return res.status(400).json({ error: 'Query parameter "q" is required', requestId });
  }

  try {
    const startedAt = Date.now();
    const searchResult = await searchProducts(q);
    const durationMs = Date.now() - startedAt;

    log.info('product_search_completed', {
      requestId,
      q,
      results: searchResult.results.length,
      catalogStatus: searchResult.catalogStatus,
      durationMs,
    });

    return res.json({
      query: q,
      results: searchResult.results,
      catalogStatus: searchResult.catalogStatus,
      message: searchResult.message || undefined,
      durationMs,
    });
  } catch (err) {
    log.error('product_search_failed', { requestId, q, error: err });
    return next(err);
  }
});

/**
 * GET /api/products/options?url=https://demo.inelabteamdev.com/item/2104
 *
 * Fetches available options for a product. Tries HTTP+Cheerio first (< 1s),
 * falls back to Playwright only if the page requires JS rendering.
 */
router.get('/options', async (req, res, next) => {
  const url = (req.query.url || '').toString();
  const requestId = req.requestId;

  if (!url) {
    return res.status(400).json({ error: 'Query parameter "url" is required', requestId });
  }

  const browserManager = new BrowserManager({});
  try {
    const { page, context } = await browserManager.newPage();
    try {
      const startedAt = Date.now();
      const options = await fetchProductOptions(page, url);
      const durationMs = Date.now() - startedAt;

      log.info('product_options_fetched', {
        requestId,
        url,
        optionsCount: options.length,
        durationMs,
      });

      return res.json({ url, options, durationMs });
    } finally {
      await context.close().catch(() => {});
    }
  } catch (err) {
    log.error('product_options_failed', { requestId, url, error: err });
    return next(err);
  } finally {
    await browserManager.close();
  }
});

/**
 * POST /api/products/sync-catalog
 *
 * Manually triggers a full catalog sync. Useful for initial setup or
 * after the store's product lineup changes. Returns 202 and syncs in
 * the background.
 */
router.post('/sync-catalog', async (req, res) => {
  const requestId = req.requestId;
  log.info('manual_catalog_sync_triggered', { requestId });

  res.status(202).json({
    accepted: true,
    message: 'Catalog sync started in background',
    requestId,
  });

  ensureCatalogWarm({ force: true }).catch((err) => {
    log.error('manual_catalog_sync_failed', { requestId, error: err });
  });
});

module.exports = router;
