const express = require('express');
const cors = require('cors');
const env = require('./config/env');
const { requestId } = require('./middleware/requestId');
const { notFound, errorHandler } = require('./middleware/errorHandler');
const { createLogger } = require('./utils/logger');

const healthRoutes = require('./routes/health');
const productRoutes = require('./routes/products');
const trackedItemRoutes = require('./routes/trackedItems');
const exportRoutes = require('./routes/export');
const scrapeRoutes = require('./routes/scrape');

const log = createLogger('app');
const app = express();

// ── Global middleware ──────────────────────────────────────────────────
app.use(requestId);

app.use(
  cors({
    origin: (origin, callback) => {
      // Allow non-browser requests (curl, cron-job.org) which send no Origin header.
      if (!origin || env.CORS_ORIGINS.includes(origin)) return callback(null, true);
      log.warn('cors_rejected', { origin });
      return callback(new Error(`Origin ${origin} not allowed by CORS`));
    },
  }),
);

app.use(express.json());

// Request logging — light-touch, just method + path + timing.
app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    const durationMs = Date.now() - start;
    // Only log API requests, not 404s for favicon etc.
    if (req.originalUrl.startsWith('/api')) {
      log.info('http_request', {
        requestId: req.requestId,
        method: req.method,
        path: req.originalUrl,
        status: res.statusCode,
        durationMs,
      });
    }
  });
  next();
});

// ── Routes ─────────────────────────────────────────────────────────────
app.use('/api/health', healthRoutes);
app.use('/api/products', productRoutes);
app.use('/api/tracked-items', trackedItemRoutes);
app.use('/api/export', exportRoutes);
app.use('/api/scrape', scrapeRoutes);

// ── Error handling ─────────────────────────────────────────────────────
app.use(notFound);
app.use(errorHandler);

module.exports = app;
