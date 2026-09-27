const express = require('express');
const { buildScrapeHistoryCsv } = require('../services/csvExportService');

const router = express.Router();

// GET /api/export/csv
router.get('/csv', async (req, res, next) => {
  try {
    const csv = await buildScrapeHistoryCsv();
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="scrape-history-${Date.now()}.csv"`);
    res.send(csv);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
