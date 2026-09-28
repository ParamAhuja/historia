const express = require('express');
const { buildScrapeHistoryCsv } = require('../services/csvExportService');
const { createLogger } = require('../utils/logger');

const router = express.Router();
const log = createLogger('routes/export');

// GET /api/export/csv
router.get('/csv', async (req, res, next) => {
  try {
    const startedAt = Date.now();
    const csv = await buildScrapeHistoryCsv();
    const durationMs = Date.now() - startedAt;

    log.info('csv_export_generated', {
      requestId: req.requestId,
      sizeBytes: Buffer.byteLength(csv, 'utf-8'),
      durationMs,
    });

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="scrape-history-${Date.now()}.csv"`);
    res.send(csv);
  } catch (err) {
    log.error('csv_export_failed', { requestId: req.requestId, error: err });
    next(err);
  }
});

module.exports = router;
