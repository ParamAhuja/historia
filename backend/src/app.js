const express = require('express');
const cors = require('cors');
const env = require('./config/env');
const { notFound, errorHandler } = require('./middleware/errorHandler');

const healthRoutes = require('./routes/health');
const productRoutes = require('./routes/products');
const trackedItemRoutes = require('./routes/trackedItems');
const exportRoutes = require('./routes/export');
const scrapeRoutes = require('./routes/scrape');

const app = express();

app.use(
  cors({
    origin: (origin, callback) => {
      // Allow non-browser requests (curl, cron-job.org) which send no Origin header.
      if (!origin || env.CORS_ORIGINS.includes(origin)) return callback(null, true);
      return callback(new Error(`Origin ${origin} not allowed by CORS`));
    },
  }),
);
app.use(express.json());

app.use('/api/health', healthRoutes);
app.use('/api/products', productRoutes);
app.use('/api/tracked-items', trackedItemRoutes);
app.use('/api/export', exportRoutes);
app.use('/api/scrape', scrapeRoutes);

app.use(notFound);
app.use(errorHandler);

module.exports = app;
