const express = require('express');
const trackedItemService = require('../services/trackedItemService');
const historyService = require('../services/historyService');
const { scrapeTrackedItem } = require('../scraper/scraperEngine');
const { BrowserManager } = require('../scraper/browserManager');
const repo = require('../services/scrapeRepository');

const router = express.Router();

// GET /api/tracked-items
router.get('/', async (req, res, next) => {
  try {
    const items = await trackedItemService.listTrackedItems();
    res.json({ items });
  } catch (err) {
    next(err);
  }
});

// POST /api/tracked-items
// body: { storeProductId, name, productUrl, optionLabel, optionKey, intervalMinutes }
router.post('/', async (req, res, next) => {
  try {
    const { storeProductId, name, productUrl, optionLabel, optionKey, intervalMinutes } = req.body;
    if (!storeProductId || !name || !productUrl || !optionLabel || !optionKey) {
      return res.status(400).json({ error: 'storeProductId, name, productUrl, optionLabel and optionKey are required' });
    }
    const item = await trackedItemService.createTrackedItem({
      storeProductId,
      name,
      productUrl,
      optionLabel,
      optionKey,
      intervalMinutes,
    });
    return res.status(201).json({ item });
  } catch (err) {
    return next(err);
  }
});

// PATCH /api/tracked-items/:id  body: { isActive?, intervalMinutes? }
router.patch('/:id', async (req, res, next) => {
  try {
    const item = await trackedItemService.updateTrackedItem(req.params.id, req.body);
    res.json({ item });
  } catch (err) {
    next(err);
  }
});

// DELETE /api/tracked-items/:id
router.delete('/:id', async (req, res, next) => {
  try {
    await trackedItemService.deleteTrackedItem(req.params.id);
    res.status(204).end();
  } catch (err) {
    next(err);
  }
});

// GET /api/tracked-items/:id/history
router.get('/:id/history', async (req, res, next) => {
  try {
    const history = await historyService.getPriceHistory(req.params.id);
    res.json({ history });
  } catch (err) {
    next(err);
  }
});

// GET /api/tracked-items/:id/logs
router.get('/:id/logs', async (req, res, next) => {
  try {
    const logs = await historyService.getScrapeLog(req.params.id);
    res.json({ logs });
  } catch (err) {
    next(err);
  }
});

// POST /api/tracked-items/:id/scrape-now - manual on-demand scrape, useful
// for demoing and for filling in history right after adding a new product.
router.post('/:id/scrape-now', async (req, res, next) => {
  const browserManager = new BrowserManager({});
  try {
    const item = await repo.getTrackedItemById(req.params.id);
    const result = await scrapeTrackedItem(item, { browserManager, scrapeRunId: null });
    res.json({ result });
  } catch (err) {
    next(err);
  } finally {
    await browserManager.close();
  }
});

module.exports = router;
