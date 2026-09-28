const { BrowserManager } = require('./browserManager');
const { scrapeProductOption } = require('./productPageScraper');
const { parsePrice, parseStock } = require('./validate');
const { classify, errorCode } = require('./errorClassification');
const { retryWithBackoff } = require('../utils/retry');
const { mapWithConcurrency } = require('../utils/concurrency');
const { TIMING, STORE_BASE_URL } = require('./config');
const lock = require('../utils/lock');
const repo = require('../services/scrapeRepository');
const { createLogger } = require('../utils/logger');

const log = createLogger('scraper-engine');

// Circuit breaker: if this many consecutive items fail, pause the run
const CIRCUIT_BREAKER_THRESHOLD = 5;

/**
 * Scrapes a single tracked item, retrying transient failures with backoff.
 * Writes one scrape_attempts row per try (outcome: 'success' | 'retried' |
 * 'failed') and, only on success, one price_history row. Never writes
 * price_history for a failed/ambiguous parse — that guarantee lives here so
 * every caller (scheduled run, manual "scrape now", headed demo script) gets
 * it for free.
 */
async function scrapeTrackedItem(trackedItem, { browserManager, scrapeRunId }) {
  const itemLog = log.child({
    trackedItemId: trackedItem.id,
    productName: trackedItem.products?.name,
    scrapeRunId,
  });

  const gotLock = await lock.acquireItemLock(trackedItem.id);
  if (!gotLock) {
    itemLog.warn('item_skipped_locked');
    return { trackedItemId: trackedItem.id, skipped: true, reason: 'locked' };
  }

  let finalOutcome = 'failed';
  const itemStartedAt = Date.now();

  try {
    const productUrl = trackedItem.products?.product_url;
    if (!productUrl) {
      throw new Error('Tracked item has no associated product URL');
    }

    const outcome = await retryWithBackoff({
      label: `scrape:${trackedItem.id}`,
      maxAttempts: TIMING.maxAttempts,
      baseMs: TIMING.backoffBaseMs,
      maxMs: TIMING.backoffMaxMs,
      classify,
      fn: async (attempt) => {
        const start = Date.now();
        const { page, context } = await browserManager.newPage();
        try {
          // Navigate to the item page
          itemLog.info('navigating_to_product', { attempt, url: productUrl });
          await page.goto(productUrl, {
            waitUntil: 'domcontentloaded',
            timeout: TIMING.navTimeoutMs,
          });

          // Wait for async content to load
          await page.waitForTimeout(TIMING.contentWaitMs);

          // Scrape: select option, click price button, read price/stock
          const raw = await scrapeProductOption(page, {
            productUrl,
            optionKey: trackedItem.selected_option_key,
            optionLabel: trackedItem.selected_option_label,
          });

          const price = parsePrice(raw.rawPriceText);
          const stock = parseStock(raw.rawStockText);
          const durationMs = Date.now() - start;

          itemLog.info('scrape_attempt_succeeded', {
            attempt,
            price,
            stock: stock.normalized,
            durationMs,
            parseStrategy: raw.parseStrategy,
          });

          return { ...raw, price, stock, durationMs, attempt };
        } finally {
          await context.close().catch(() => {});
        }
      },
      onAttemptResult: async ({ attempt, ok, result, error, willRetry }) => {
        if (ok) {
          const attemptRow = await repo.recordAttempt({
            trackedItemId: trackedItem.id,
            scrapeRunId,
            attemptNumber: attempt,
            outcome: 'success',
            rawPriceText: result.rawPriceText,
            rawStockText: result.rawStockText,
            normalizedPrice: result.price,
            normalizedStock: result.stock.normalized,
            stockQuantity: result.stock.quantity,
            parseStrategy: result.parseStrategy,
            durationMs: result.durationMs,
          });
          await repo.recordPriceHistory({
            trackedItemId: trackedItem.id,
            scrapeAttemptId: attemptRow.id,
            price: result.price,
            stock: result.stock.normalized,
            stockQuantity: result.stock.quantity,
          });
        } else {
          itemLog.warn('scrape_attempt_failed', {
            attempt,
            willRetry,
            errorCode: errorCode(error),
            error: error,
          });
          await repo.recordAttempt({
            trackedItemId: trackedItem.id,
            scrapeRunId,
            attemptNumber: attempt,
            outcome: willRetry ? 'retried' : 'failed',
            errorCode: errorCode(error),
            errorMessage: error.message,
          });
        }
      },
    });

    finalOutcome = outcome.ok ? 'success' : 'failed';
    await repo.markItemScraped(trackedItem.id, { success: outcome.ok });

    const totalDurationMs = Date.now() - itemStartedAt;
    itemLog.info('item_scrape_finished', {
      outcome: finalOutcome,
      attempts: outcome.attempts,
      totalDurationMs,
    });

    return { trackedItemId: trackedItem.id, outcome: finalOutcome, attempts: outcome.attempts };
  } catch (err) {
    // Defensive: a bug here must not crash the whole batch or leave the item
    // locked forever. Log it as a failed attempt rather than losing it silently.
    itemLog.error('scrape_item_unexpected_error', { error: err });
    await repo
      .recordAttempt({
        trackedItemId: trackedItem.id,
        scrapeRunId,
        attemptNumber: 1,
        outcome: 'failed',
        errorCode: 'ENGINE_ERROR',
        errorMessage: err.message,
      })
      .catch((dbErr) => {
        itemLog.error('failed_to_record_error_attempt', { error: dbErr });
      });
    await repo.markItemScraped(trackedItem.id, { success: false });
    return { trackedItemId: trackedItem.id, outcome: 'failed', error: err.message };
  } finally {
    await lock.releaseItemLock(trackedItem.id);
  }
}

/**
 * Runs a full scheduled batch: acquires the global lock (so an overlapping
 * cron tick is skipped rather than double-scraping everything), fetches due
 * items, scrapes them with bounded concurrency over one shared browser, and
 * always releases the lock and records a scrape_runs summary — even if
 * individual items failed.
 *
 * Includes a circuit breaker: if CIRCUIT_BREAKER_THRESHOLD consecutive items
 * fail, the run pauses (the store might be down entirely). This prevents
 * wasting time and browser resources on a dead site.
 */
async function runScheduledScrape({ trigger = 'cron', headed = false } = {}) {
  const runLog = log.child({ trigger });

  await lock.clearStaleGlobalLock(TIMING.lockStaleMinutes);
  await lock.clearStaleItemLocks(TIMING.lockStaleMinutes);

  const acquired = await lock.acquireGlobalLock(null);
  if (!acquired) {
    runLog.warn('scheduled_run_skipped_locked');
    return { status: 'skipped_locked' };
  }

  const run = await repo.createScrapeRun({ triggerSource: trigger });
  const runWithId = runLog.child({ runId: run.id });
  const browserManager = new BrowserManager({ headed });

  try {
    const items = await repo.getDueTrackedItems();
    runWithId.info('scheduled_run_started', { dueItems: items.length });

    if (items.length === 0) {
      runWithId.info('no_items_due');
      await repo.finishScrapeRun(run.id, {
        status: 'completed',
        itemsTotal: 0,
        itemsSuccess: 0,
        itemsFailed: 0,
        summary: { message: 'No items due for scraping' },
      });
      return { status: 'completed', runId: run.id, total: 0, succeeded: 0, failed: 0 };
    }

    // Circuit breaker state
    let consecutiveFailures = 0;
    let circuitBroken = false;

    const results = await mapWithConcurrency(items, TIMING.concurrency, async (item) => {
      // Check circuit breaker
      if (circuitBroken) {
        runWithId.warn('item_skipped_circuit_broken', { trackedItemId: item.id });
        return { trackedItemId: item.id, outcome: 'skipped', reason: 'circuit_breaker' };
      }

      const result = await scrapeTrackedItem(item, { browserManager, scrapeRunId: run.id });

      if (result.outcome === 'failed') {
        consecutiveFailures += 1;
        if (consecutiveFailures >= CIRCUIT_BREAKER_THRESHOLD) {
          circuitBroken = true;
          runWithId.error('circuit_breaker_triggered', {
            consecutiveFailures,
            threshold: CIRCUIT_BREAKER_THRESHOLD,
          });
        }
      } else if (result.outcome === 'success') {
        consecutiveFailures = 0; // Reset on success
      }

      return result;
    });

    const succeeded = results.filter((r) => r.outcome === 'success').length;
    const failed = results.filter((r) => r.outcome === 'failed').length;
    const skipped = results.filter((r) => r.skipped || r.reason === 'circuit_breaker').length;

    let status = 'completed';
    if (circuitBroken) status = 'completed_with_errors';
    else if (failed > 0) status = 'completed_with_errors';

    await repo.finishScrapeRun(run.id, {
      status,
      itemsTotal: items.length,
      itemsSuccess: succeeded,
      itemsFailed: failed,
      summary: {
        results: results.map((r) => ({
          trackedItemId: r.trackedItemId,
          outcome: r.outcome || (r.skipped ? 'skipped' : 'unknown'),
          attempts: r.attempts,
          error: r.error,
          reason: r.reason,
        })),
        circuitBroken,
        skipped,
      },
    });

    runWithId.info('scheduled_run_finished', {
      status,
      succeeded,
      failed,
      skipped,
      circuitBroken,
    });

    return { status, runId: run.id, total: items.length, succeeded, failed, skipped, results };
  } catch (err) {
    runWithId.error('scheduled_run_crashed', { error: err });
    await repo.finishScrapeRun(run.id, {
      status: 'completed_with_errors',
      itemsTotal: 0,
      itemsSuccess: 0,
      itemsFailed: 0,
      summary: { crash: err.message, stack: err.stack },
    });
    throw err;
  } finally {
    await browserManager.close();
    await lock.releaseGlobalLock();
  }
}

module.exports = { scrapeTrackedItem, runScheduledScrape };
