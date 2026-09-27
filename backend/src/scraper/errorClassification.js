/**
 * Custom error types the scraper throws, so classify() can make a retry
 * decision without parsing free-text messages everywhere.
 */
class TransientScrapeError extends Error {
  constructor(message, code) {
    super(message);
    this.name = 'TransientScrapeError';
    this.code = code;
  }
}

class PermanentScrapeError extends Error {
  constructor(message, code) {
    super(message);
    this.name = 'PermanentScrapeError';
    this.code = code;
  }
}

class ValidationError extends Error {
  constructor(message, code) {
    super(message);
    this.name = 'ValidationError';
    this.code = code;
  }
}

/**
 * Decides whether an error is worth retrying.
 *   - transient: timeouts, connection resets, 5xx-style failures, our own
 *     TransientScrapeError - the site was just slow or briefly unavailable.
 *   - permanent: the page told us the product genuinely doesn't exist, or
 *     the option isn't available - retrying can't fix that.
 * Anything we don't recognize is treated as transient, since assuming a
 * flaky, unfamiliar failure is "unfixable by retry" is the riskier mistake -
 * it would mean giving up (and marking the product failed) on the first
 * hiccup, exactly what the assignment says the scraper must not do.
 */
function classify(err) {
  if (err instanceof PermanentScrapeError) return 'permanent';
  if (err instanceof ValidationError) return 'permanent';
  if (err instanceof TransientScrapeError) return 'transient';

  const msg = (err.message || '').toLowerCase();
  const name = err.name || '';

  if (name === 'TimeoutError') return 'transient';
  if (msg.includes('timeout')) return 'transient';
  if (msg.includes('net::err') || msg.includes('econnreset') || msg.includes('econnrefused')) {
    return 'transient';
  }
  if (msg.includes('navigation') && msg.includes('failed')) return 'transient';
  if (msg.includes('500') || msg.includes('502') || msg.includes('503') || msg.includes('504')) {
    return 'transient';
  }
  if (msg.includes('404') || msg.includes('not found')) return 'permanent';

  return 'transient';
}

function errorCode(err) {
  if (err.code) return err.code;
  if (err.name === 'TimeoutError') return 'NAV_TIMEOUT';
  return 'UNKNOWN_ERROR';
}

module.exports = { TransientScrapeError, PermanentScrapeError, ValidationError, classify, errorCode };
