const app = require('./app');
const env = require('./config/env');
const logger = require('./utils/logger');

const server = app.listen(env.PORT, () => {
  logger.info('server_started', { port: env.PORT, env: env.NODE_ENV });
});

// Never let one unexpected rejection (e.g. a stray Playwright promise from a
// background scrape run) silently kill the whole process - log it and keep
// serving requests. The scraper's own try/catch/finally blocks already
// guarantee locks get released and attempts get recorded even on failure;
// this is just a last-resort safety net for genuinely unforeseen bugs.
process.on('unhandledRejection', (reason) => {
  logger.error('unhandled_rejection', { reason: reason?.message || String(reason) });
});

process.on('SIGTERM', () => {
  logger.info('server_shutting_down');
  server.close(() => process.exit(0));
});

module.exports = server;
