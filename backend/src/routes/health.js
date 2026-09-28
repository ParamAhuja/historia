const express = require('express');
const { getCatalogCount } = require('../services/catalogService');
const { createLogger } = require('../utils/logger');

const router = express.Router();
const log = createLogger('routes/health');

/**
 * GET /api/health
 *
 * Enhanced health check that includes catalog status so you can see at a
 * glance whether the product catalog is populated and how many products
 * are indexed.
 */
router.get('/', async (req, res) => {
  try {
    const catalogCount = await getCatalogCount();
    res.json({
      status: 'ok',
      time: new Date().toISOString(),
      catalog: {
        productCount: catalogCount,
        isWarm: catalogCount >= 900,
      },
    });
  } catch (err) {
    log.warn('health_check_partial_failure', { error: err });
    // Health endpoint should always respond, even if catalog check fails
    res.json({
      status: 'ok',
      time: new Date().toISOString(),
      catalog: { error: 'Could not check catalog status' },
    });
  }
});

module.exports = router;
