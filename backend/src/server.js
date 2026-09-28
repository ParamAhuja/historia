const app = require('./app');
const env = require('./config/env');
const { createLogger } = require('./utils/logger');
const { ensureCatalogWarm } = require('./services/catalogService');

const log = createLogger('server');

const server = app.listen(env.PORT, () => {
  log.info('server_started', { port: env.PORT, env: env.NODE_ENV });

  // Trigger catalog warmup in the background — NEVER block server startup.
  // The search endpoint works immediately (returns whatever is in the DB),
  // and the catalog fills in asynchronously.
  ensureCatalogWarm({ force: false, headed: false }).catch((error) => {
    log.warn('catalog_warmup_failed', { error: error });
  });
});

// Never let one unexpected rejection (e.g. a stray Playwright promise from a
// background scrape run) silently kill the whole process — log it with full
// stack trace and keep serving requests.
process.on('unhandledRejection', (reason) => {
  log.error('unhandled_rejection', {
    error: reason instanceof Error ? reason : new Error(String(reason)),
  });
});

process.on('uncaughtException', (error) => {
  log.error('uncaught_exception', { error: error });
  // Give the logger a moment to flush, then exit
  setTimeout(() => process.exit(1), 1000);
});

process.on('SIGTERM', () => {
  log.info('server_shutting_down');
  server.close(() => process.exit(0));
});

module.exports = server;
