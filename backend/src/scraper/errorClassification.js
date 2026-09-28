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

class PriceButtonError extends Error {
  constructor(message, code) {
    super(message);
    this.name = 'PriceButtonError';
    this.code = code || 'PRICE_BUTTON_ERROR';
  }
}

class StructureChangeError extends Error {
  constructor(message, code) {
    super(message);
    this.name = 'StructureChangeError';
    this.code = code || 'STRUCTURE_CHANGED';
  }
}

/**
 * Decides whether an error is worth retrying.
 *
 *   - transient: timeouts, connection resets, 5xx-style failures, our own
 *     TransientScrapeError, price button not found (might be a timing issue)
 *     — the site was just slow or briefly unavailable.
 *
 *   - permanent: the page told us the product genuinely doesn't exist, or
 *     the option isn't available, or the page structure has fundamentally
 *     changed — retrying can't fix that.
 *
 * Anything we don't recognize is treated as transient, since assuming a
 * flaky, unfamiliar failure is "unfixable by retry" is the riskier mistake —
 * it would mean giving up (and marking the product failed) on the first
 * hiccup, exactly what the assignment says the scraper must not do.
 */
function classify(err) {
  if (err instanceof PermanentScrapeError) return 'permanent';
  if (err instanceof StructureChangeError) return 'permanent';
  if (err instanceof ValidationError) return 'permanent';
  if (err instanceof TransientScrapeError) return 'transient';
  if (err instanceof PriceButtonError) return 'transient'; // might be a timing issue

  const msg = (err.message || '').toLowerCase();
  const name = err.name || '';

  // Timeouts — always transient
  if (name === 'TimeoutError') return 'transient';
  if (msg.includes('timeout')) return 'transient';

  // Network errors — transient
  if (msg.includes('net::err') || msg.includes('econnreset') || msg.includes('econnrefused')) {
    return 'transient';
  }
  if (msg.includes('econnaborted') || msg.includes('socket hang up')) return 'transient';
  if (msg.includes('fetch failed') || msg.includes('aborted')) return 'transient';

  // Navigation failures — transient
  if (msg.includes('navigation') && msg.includes('failed')) return 'transient';

  // HTTP 5xx — server-side, transient
  if (msg.includes('500') || msg.includes('502') || msg.includes('503') || msg.includes('504')) {
    return 'transient';
  }

  // HTTP 429 — rate limited, transient (we'll back off)
  if (msg.includes('429') || msg.includes('rate limit') || msg.includes('too many requests')) {
    return 'transient';
  }

  // HTTP 404 — product not found, permanent
  if (msg.includes('404') || msg.includes('not found')) return 'permanent';

  // Browser context errors — transient (browser might have crashed)
  if (msg.includes('browser') && (msg.includes('closed') || msg.includes('disconnected'))) {
    return 'transient';
  }
  if (msg.includes('target closed') || msg.includes('page closed')) return 'transient';

  // Price element missing — transient (content may not have loaded yet)
  if (msg.includes('price element') || msg.includes('price_element_missing')) return 'transient';

  // Default: assume transient (safer to retry than to give up)
  return 'transient';
}

/**
 * Extracts a machine-readable error code from an error object.
 */
function errorCode(err) {
  if (err.code) return err.code;
  if (err.name === 'TimeoutError') return 'NAV_TIMEOUT';
  if (err.name === 'PriceButtonError') return 'PRICE_BUTTON_ERROR';
  if (err.name === 'StructureChangeError') return 'STRUCTURE_CHANGED';
  if (err.name === 'ValidationError') return 'VALIDATION_ERROR';

  const msg = (err.message || '').toLowerCase();
  if (msg.includes('timeout')) return 'TIMEOUT';
  if (msg.includes('net::err')) return 'NETWORK_ERROR';
  if (msg.includes('econnreset')) return 'CONNECTION_RESET';
  if (msg.includes('429')) return 'RATE_LIMITED';
  if (msg.includes('404')) return 'NOT_FOUND';
  if (msg.includes('price')) return 'PRICE_ERROR';

  return 'UNKNOWN_ERROR';
}

module.exports = {
  TransientScrapeError,
  PermanentScrapeError,
  ValidationError,
  PriceButtonError,
  StructureChangeError,
  classify,
  errorCode,
};
