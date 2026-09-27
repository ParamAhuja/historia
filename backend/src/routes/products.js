const express = require('express');
const { BrowserManager } = require('../scraper/browserManager');
const { searchProducts, fetchProductOptions } = require('../scraper/productSearch');
const logger = require('../utils/logger');

const router = express.Router();

// GET /api/products/search?q=phone
router.get('/search', async (req, res, next) => {
  const q = (req.query.q || '').toString();
  if (!q.trim()) {
    return res.status(400).json({ error: 'Query parameter "q" is required' });
  }

  const browserManager = new BrowserManager({});
  try {
    const { page, context } = await browserManager.newPage();
    try {
      const results = await searchProducts(page, q);
      return res.json({ query: q, results });
    } finally {
      await context.close().catch(() => {});
    }
  } catch (err) {
    logger.error('product_search_failed', { q, error: err.message });
    return next(err);
  } finally {
    await browserManager.close();
  }
});

// GET /api/products/options?url=https://demo.inelabteamdev.com/product/abc
router.get('/options', async (req, res, next) => {
  const url = (req.query.url || '').toString();
  if (!url) {
    return res.status(400).json({ error: 'Query parameter "url" is required' });
  }

  const browserManager = new BrowserManager({});
  try {
    const { page, context } = await browserManager.newPage();
    try {
      const options = await fetchProductOptions(page, url);
      return res.json({ url, options });
    } finally {
      await context.close().catch(() => {});
    }
  } catch (err) {
    logger.error('product_options_failed', { url, error: err.message });
    return next(err);
  } finally {
    await browserManager.close();
  }
});

module.exports = router;
