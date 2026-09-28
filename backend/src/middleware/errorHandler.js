const { createLogger } = require('../utils/logger');

const log = createLogger('middleware');

// 404 handler - must be registered after all routes.
function notFound(req, res) {
  const requestId = req.requestId || 'unknown';
  log.warn('route_not_found', {
    requestId,
    method: req.method,
    path: req.originalUrl,
  });
  res.status(404).json({
    error: `Not found: ${req.method} ${req.originalUrl}`,
    requestId,
  });
}

/**
 * Central error handler — must be registered last, with 4 args so Express
 * recognizes it as an error-handling middleware.
 *
 * Always logs the full stack trace (even in production) so we can diagnose
 * issues from Render's log viewer. The *response* hides internals in
 * production, but the *log* never does.
 */
// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, next) {
  const requestId = req.requestId || 'unknown';
  const status = err.status || err.statusCode || 500;

  log.error('unhandled_request_error', {
    requestId,
    method: req.method,
    path: req.originalUrl,
    status,
    error: err,               // logger.js will extract message + stack
  });

  const isProduction = process.env.NODE_ENV === 'production';
  const message = err.publicMessage || (isProduction ? 'Internal server error' : err.message);

  res.status(status).json({
    error: message,
    requestId,
    ...(isProduction ? {} : { stack: err.stack }),
  });
}

module.exports = { notFound, errorHandler };
