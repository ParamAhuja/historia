const logger = require('../utils/logger');
const env = require('../config/env');

// 404 handler - must be registered after all routes.
function notFound(req, res) {
  res.status(404).json({ error: `Not found: ${req.method} ${req.originalUrl}` });
}

// Central error handler - must be registered last, with 4 args so Express
// recognizes it as an error handler.
// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, next) {
  logger.error('unhandled_request_error', {
    path: req.originalUrl,
    method: req.method,
    error: err.message,
    stack: err.stack,
  });
  const status = err.status || 500;
  const message = err.publicMessage || (env.NODE_ENV === 'production' ? 'Internal server error' : err.message);
  res.status(status).json({ error: message });
}

module.exports = { notFound, errorHandler };
