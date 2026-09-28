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
      // Allow non-browser requests (curl, cron-job.org, health checks)
      if (!origin) return callback(null, true);

      // If '*' is in allowed origins, permit all origins
      if (env.CORS_ORIGINS.includes('*') || env.CORS_ORIGINS.some((o) => o.trim() === '*')) {
        return callback(null, true);
      }

      // Check configured origins
      if (env.CORS_ORIGINS.includes(origin)) {
        return callback(null, true);
      }

      // Automatically allow all Vercel domains (*.vercel.app) and localhost
      if (origin.endsWith('.vercel.app') || origin.includes('localhost') || origin.includes('127.0.0.1')) {
        return callback(null, true);
      }

      log.warn('cors_rejected', { origin, allowed: env.CORS_ORIGINS });
      return callback(new Error(`Origin ${origin} not allowed by CORS`));
    },
    methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Request-Id', 'x-cron-secret'],
    credentials: true,
  }),
);

// Explicit preflight handling
app.options('*', cors());

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
