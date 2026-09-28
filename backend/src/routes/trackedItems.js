const express = require('express');
const trackedItemService = require('../services/trackedItemService');
const historyService = require('../services/historyService');
const { scrapeTrackedItem } = require('../scraper/scraperEngine');
const { BrowserManager } = require('../scraper/browserManager');
const repo = require('../services/scrapeRepository');
const { createLogger } = require('../utils/logger');

const router = express.Router();
const log = createLogger('routes/tracked-items');

// GET /api/tracked-items
router.get('/', async (req, res, next) => {
  try {
    const startedAt = Date.now();
    const items = await trackedItemService.listTrackedItems();
    log.info('list_tracked_items', {
      requestId: req.requestId,
      count: items.length,
      durationMs: Date.now() - startedAt,
    });
    res.json({ items });
  } catch (err) {
    log.error('list_tracked_items_failed', { requestId: req.requestId, error: err });
    next(err);
  }
});

// POST /api/tracked-items
// body: { storeProductId, name, productUrl, optionLabel, optionKey, intervalMinutes }
router.post('/', async (req, res, next) => {
  try {
    const { storeProductId, name, productUrl, optionLabel, optionKey, intervalMinutes } = req.body;

    // Validate required fields
    const missing = [];
    if (!storeProductId) missing.push('storeProductId');
    if (!name) missing.push('name');
    if (!productUrl) missing.push('productUrl');
    if (!optionLabel) missing.push('optionLabel');
    if (!optionKey) missing.push('optionKey');

    if (missing.length > 0) {
      return res.status(400).json({
        error: `Missing required fields: ${missing.join(', ')}`,
        requestId: req.requestId,
      });
    }

    const item = await trackedItemService.createTrackedItem({
      storeProductId,
      name,
      productUrl,
      optionLabel,
      optionKey,
      intervalMinutes,
    });

    log.info('tracked_item_created', {
      requestId: req.requestId,
      trackedItemId: item.id,
      storeProductId,
      name,
      optionLabel,
    });

    return res.status(201).json({ item });
  } catch (err) {
    log.error('create_tracked_item_failed', { requestId: req.requestId, error: err });
    return next(err);
  }
});

// PATCH /api/tracked-items/:id  body: { isActive?, intervalMinutes? }
router.patch('/:id', async (req, res, next) => {
  try {
    const item = await trackedItemService.updateTrackedItem(req.params.id, req.body);
    log.info('tracked_item_updated', {
      requestId: req.requestId,
      trackedItemId: req.params.id,
      patch: req.body,
    });
    res.json({ item });
  } catch (err) {
    log.error('update_tracked_item_failed', {
      requestId: req.requestId,
      trackedItemId: req.params.id,
      error: err,
    });
    next(err);
  }
});

// DELETE /api/tracked-items/:id
router.delete('/:id', async (req, res, next) => {
  try {
    await trackedItemService.deleteTrackedItem(req.params.id);
    log.info('tracked_item_deleted', {
      requestId: req.requestId,
      trackedItemId: req.params.id,
    });
    res.status(204).end();
  } catch (err) {
    log.error('delete_tracked_item_failed', {
      requestId: req.requestId,
      trackedItemId: req.params.id,
      error: err,
    });
    next(err);
  }
});

// GET /api/tracked-items/:id/history
router.get('/:id/history', async (req, res, next) => {
  try {
    const startedAt = Date.now();
    const history = await historyService.getPriceHistory(req.params.id);
    log.info('price_history_fetched', {
      requestId: req.requestId,
      trackedItemId: req.params.id,
      records: history.length,
      durationMs: Date.now() - startedAt,
    });
    res.json({ history });
  } catch (err) {
    log.error('price_history_failed', {
      requestId: req.requestId,
      trackedItemId: req.params.id,
      error: err,
    });
    next(err);
  }
});

// GET /api/tracked-items/:id/logs
router.get('/:id/logs', async (req, res, next) => {
  try {
    const startedAt = Date.now();
    const logs = await historyService.getScrapeLog(req.params.id);
    log.info('scrape_log_fetched', {
      requestId: req.requestId,
      trackedItemId: req.params.id,
      records: logs.length,
      durationMs: Date.now() - startedAt,
    });
    res.json({ logs });
  } catch (err) {
    log.error('scrape_log_failed', {
      requestId: req.requestId,
      trackedItemId: req.params.id,
      error: err,
    });
    next(err);
  }
});

// POST /api/tracked-items/:id/scrape-now - manual on-demand scrape, useful
// for demoing and for filling in history right after adding a new product.
router.post('/:id/scrape-now', async (req, res, next) => {
  const trackedItemId = req.params.id;
  const browserManager = new BrowserManager({});

  try {
    const item = await repo.getTrackedItemById(trackedItemId);
    if (!item) {
      return res.status(404).json({
        error: `Tracked item ${trackedItemId} not found`,
        requestId: req.requestId,
      });
    }

    log.info('manual_scrape_started', {
      requestId: req.requestId,
      trackedItemId,
      productName: item.products?.name,
    });

    const result = await scrapeTrackedItem(item, { browserManager, scrapeRunId: null });

    log.info('manual_scrape_completed', {
      requestId: req.requestId,
      trackedItemId,
      outcome: result.outcome,
      attempts: result.attempts,
    });

    res.json({ result });
  } catch (err) {
    log.error('manual_scrape_failed', {
      requestId: req.requestId,
      trackedItemId,
      error: err,
    });
    next(err);
  } finally {
    await browserManager.close();
  }
});

module.exports = router;
