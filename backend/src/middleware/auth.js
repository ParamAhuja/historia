const env = require('../config/env');

/**
 * Protects POST /api/scrape/run so a random visitor can't trigger scrapes
 * (or spam the store) by hitting a guessable URL. cron-job.org is configured
 * to send this header on every request (see infra/cron-job-setup.md).
 */
function requireCronSecret(req, res, next) {
  const provided = req.header('x-cron-secret');
  if (!provided || provided !== env.CRON_SECRET) {
    return res.status(401).json({ error: 'Unauthorized: missing or invalid x-cron-secret header' });
  }
  return next();
}

module.exports = { requireCronSecret };
