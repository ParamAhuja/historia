const logger = require('./logger');

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Exponential backoff with full jitter, capped at maxDelayMs.
 * See: https://aws.amazon.com/blogs/architecture/exponential-backoff-and-jitter/
 */
function backoffDelay(attempt, baseMs, maxMs) {
  const exp = Math.min(maxMs, baseMs * 2 ** (attempt - 1));
  return Math.floor(Math.random() * exp);
}

/**
 * Runs `fn(attemptNumber)` up to `maxAttempts` times.
 *
 * `classify(error)` must return 'transient' or 'permanent'. Transient errors
 * are retried (with backoff); permanent errors fail immediately without
 * burning remaining attempts, since retrying a 404 or a genuine "product not
 * found" wastes time and can't succeed.
 *
 * `onAttemptResult({attempt, maxAttempts, ok, error, willRetry})` is called
 * after every attempt (success or failure) so the caller can persist a
 * scrape_attempts row per try, which is required by the assignment.
 */
async function retryWithBackoff({
  fn,
  maxAttempts,
  baseMs,
  maxMs,
  classify,
  onAttemptResult,
  label,
}) {
  let lastError;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      const result = await fn(attempt);
      if (onAttemptResult) {
        await onAttemptResult({ attempt, maxAttempts, ok: true, result, willRetry: false });
      }
      return { ok: true, result, attempts: attempt };
    } catch (err) {
      lastError = err;
      const kind = classify ? classify(err) : 'transient';
      const attemptsLeft = maxAttempts - attempt;
      const willRetry = kind === 'transient' && attemptsLeft > 0;

      logger.warn('retry_attempt_failed', {
        label,
        attempt,
        maxAttempts,
        kind,
        willRetry,
        error: err.message,
      });

      if (onAttemptResult) {
        await onAttemptResult({ attempt, maxAttempts, ok: false, error: err, willRetry, kind });
      }

      if (!willRetry) {
        return { ok: false, error: err, attempts: attempt };
      }

      const delay = backoffDelay(attempt, baseMs, maxMs);
      await sleep(delay);
    }
  }
  return { ok: false, error: lastError, attempts: maxAttempts };
}

module.exports = { retryWithBackoff, sleep, backoffDelay };
