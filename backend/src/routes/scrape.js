const express = require('express');
const { requireCronSecret } = require('../middleware/auth');
const { runScheduledScrape } = require('../scraper/scraperEngine');
const { createLogger } = require('../utils/logger');

const router = express.Router();
const log = createLogger('routes/scrape');

/**
 * POST /api/scrape/run
 *
 * cron-job.org calls this once every 2 hours (see infra/cron-job-setup.md).
 * A full run over several tracked items — each with retries and slow-content
 * waits — can easily take longer than a typical HTTP/cron client timeout, so
 * this responds 202 immediately and keeps scraping in the background on the
 * same (now-awake) Render instance. The run's own result is recorded in
 * scrape_runs / scrape_attempts, which the dashboard reads, so nothing is
 * lost even though the HTTP response doesn't wait for it.
 */
router.post('/run', requireCronSecret, (req, res) => {
  const requestId = req.requestId;
  log.info('scrape_run_triggered', { requestId, trigger: 'cron', method: 'POST' });

  res.status(202).json({
    accepted: true,
    message: 'Scrape run started in background',
    requestId,
  });

  runScheduledScrape({ trigger: 'cron' }).catch((err) => {
    log.error('background_scrape_run_failed', { requestId, error: err });
  });
});

// GET /api/scrape/run — convenience for manually triggering from a browser
// or curl during development/demo, guarded the same way.
router.get('/run', requireCronSecret, (req, res) => {
  const requestId = req.requestId;
  log.info('scrape_run_triggered', { requestId, trigger: 'manual', method: 'GET' });

  res.status(202).json({
    accepted: true,
    message: 'Scrape run started in background',
    requestId,
  });

  runScheduledScrape({ trigger: 'manual' }).catch((err) => {
    log.error('background_scrape_run_failed', { requestId, error: err });
  });
});

module.exports = router;
