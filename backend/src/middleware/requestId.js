const { v4: uuidv4 } = require('uuid');

/**
 * Assigns a unique X-Request-Id to every incoming request so that all log
 * lines emitted while handling that request can be correlated. The ID is
 * also returned in the response headers for client-side debugging.
 */
function requestId(req, res, next) {
  const id = req.headers['x-request-id'] || uuidv4();
  req.requestId = id;
  res.setHeader('X-Request-Id', id);
  next();
}

module.exports = { requestId };
