const { v4: uuidv4 } = require('uuid');

/**
 * Structured JSON logger with correlation-ID propagation.
 *
 * Every log line contains:
 *   ts, level, component, message, requestId?, runId?, itemId?, durationMs?, ...extra
 *
 * `child({ runId, itemId })` returns a new logger instance that inherits the
 * parent's context plus the extra fields, so a single scrape-run logger
 * automatically stamps its runId onto every child-item log without the caller
 * having to thread it through manually.
 */

const LOG_LEVELS = { debug: 0, info: 1, warn: 2, error: 3 };
const MIN_LEVEL = LOG_LEVELS[process.env.LOG_LEVEL || (process.env.NODE_ENV === 'production' ? 'info' : 'debug')] || 0;

function formatEntry(level, component, message, meta, context) {
  const entry = {
    ts: new Date().toISOString(),
    level,
    component: component || 'app',
    message,
    ...context,
    ...meta,
  };

  // Always include stack traces for errors
  if (meta?.error instanceof Error) {
    entry.errorMessage = meta.error.message;
    entry.errorStack = meta.error.stack;
    entry.errorName = meta.error.name;
    if (meta.error.code) entry.errorCode = meta.error.code;
    delete entry.error;
  } else if (meta?.stack) {
    entry.errorStack = meta.stack;
  }

  return entry;
}

function emit(level, component, message, meta, context) {
  if (LOG_LEVELS[level] < MIN_LEVEL) return;

  const entry = formatEntry(level, component, message, meta, context);
  const line = JSON.stringify(entry);

  if (level === 'error') {
    console.error(line);
  } else if (level === 'warn') {
    console.warn(line);
  } else {
    console.log(line);
  }
}

function createLogger(component = 'app', context = {}) {
  const logger = {
    debug: (message, meta) => emit('debug', component, message, meta, context),
    info: (message, meta) => emit('info', component, message, meta, context),
    warn: (message, meta) => emit('warn', component, message, meta, context),
    error: (message, meta) => emit('error', component, message, meta, context),

    /**
     * Returns a child logger that inherits this logger's context plus any
     * additional fields. Use for scoping logs to a specific run, item, or
     * request without losing the parent context.
     *
     *   const runLogger = logger.child({ runId: 'abc' });
     *   runLogger.info('started'); // { ...parentContext, runId: 'abc', message: 'started' }
     */
    child: (extraContext) =>
      createLogger(extraContext?.component || component, { ...context, ...extraContext }),

    /**
     * Times an async operation and logs its duration. On success logs at
     * 'info', on failure logs at 'error' with the full error object, then
     * re-throws.
     *
     *   const result = await logger.time('catalog_sync', async () => { ... });
     */
    time: async (label, fn, meta = {}) => {
      const start = Date.now();
      try {
        const result = await fn();
        const durationMs = Date.now() - start;
        emit('info', component, `${label}_completed`, { ...meta, durationMs }, context);
        return result;
      } catch (err) {
        const durationMs = Date.now() - start;
        emit('error', component, `${label}_failed`, { ...meta, durationMs, error: err }, context);
        throw err;
      }
    },

    /**
     * Generates a new correlation ID (UUID v4). Useful for creating runId or
     * requestId when one isn't already provided by the framework.
     */
    generateId: () => uuidv4(),
  };

  return logger;
}

// Default root logger instance, used when callers just `require('./logger')`
// without needing scoping.
module.exports = createLogger();
module.exports.createLogger = createLogger;
