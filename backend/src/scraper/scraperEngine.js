const { BrowserManager } = require('./browserManager');
const { scrapeProductOption } = require('./productPageScraper');
const { parsePrice, parseStock } = require('./validate');
const { classify, errorCode } = require('./errorClassification');
const { retryWithBackoff } = require('../utils/retry');
const { mapWithConcurrency } = require('../utils/concurrency');
const { TIMING } = require('./config');
const lock = require('../utils/lock');
const repo = require('../services/scrapeRepository');
const logger = require('../utils/logger');

/**
 * Scrapes a single tracked item, retrying transient failures with backoff.
 * Writes one scrape_attempts row per try (outcome: 'success' | 'retried' |
 * 'failed') and, only on success, one price_history row. Never writes
 * price_history for a failed/ambiguous parse - that guarantee lives here so
 * every caller (scheduled run, manual "scrape now", headed demo script) gets
 * it for free.
 */
async function scrapeTrackedItem(trackedItem, { browserManager, scrapeRunId }) {
  const gotLock = await lock.acquireItemLock(trackedItem.id);
  if (!gotLock) {
    logger.warn('item_skipped_locked', { trackedItemId: trackedItem.id });
    return { trackedItemId: trackedItem.id, skipped: true, reason: 'locked' };
  }

  let finalOutcome = 'failed';
  try {
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
          const raw = await scrapeProductOption(page, {
            productUrl: trackedItem.products.product_url,
            optionKey: trackedItem.selected_option_key,
            optionLabel: trackedItem.selected_option_label,
          });
          const price = parsePrice(raw.rawPriceText);
          const stock = parseStock(raw.rawStockText);
          const durationMs = Date.now() - start;
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
    return { trackedItemId: trackedItem.id, outcome: finalOutcome, attempts: outcome.attempts };
  } catch (err) {
    // Defensive: a bug here must not crash the whole batch or leave the item
    // locked forever. Log it as a failed attempt rather than losing it silently.
    logger.error('scrape_item_unexpected_error', { trackedItemId: trackedItem.id, error: err.message });
    await repo
      .recordAttempt({
        trackedItemId: trackedItem.id,
        scrapeRunId,
        attemptNumber: 1,
        outcome: 'failed',
        errorCode: 'ENGINE_ERROR',
        errorMessage: err.message,
      })
      .catch(() => {});
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
 * always releases the lock and records a scrape_runs summary - even if
 * individual items failed.
 */
async function runScheduledScrape({ trigger = 'cron', headed = false } = {}) {
  await lock.clearStaleGlobalLock(TIMING.lockStaleMinutes);
  await lock.clearStaleItemLocks(TIMING.lockStaleMinutes);

  const acquired = await lock.acquireGlobalLock(null);
  if (!acquired) {
    logger.warn('scheduled_run_skipped_locked');
    return { status: 'skipped_locked' };
  }

  const run = await repo.createScrapeRun({ triggerSource: trigger });
  const browserManager = new BrowserManager({ headed });

  try {
    const items = await repo.getDueTrackedItems();
    logger.info('scheduled_run_started', { runId: run.id, dueItems: items.length });

    const results = await mapWithConcurrency(items, TIMING.concurrency, (item) =>
      scrapeTrackedItem(item, { browserManager, scrapeRunId: run.id }),
    );

    const succeeded = results.filter((r) => r.outcome === 'success').length;
    const failed = results.filter((r) => r.outcome === 'failed').length;
    const status = failed > 0 ? 'completed_with_errors' : 'completed';

    await repo.finishScrapeRun(run.id, {
      status,
      itemsTotal: items.length,
      itemsSuccess: succeeded,
      itemsFailed: failed,
      summary: { results },
    });

    logger.info('scheduled_run_finished', { runId: run.id, status, succeeded, failed });
    return { status, runId: run.id, total: items.length, succeeded, failed, results };
  } catch (err) {
    logger.error('scheduled_run_crashed', { runId: run.id, error: err.message });
    await repo.finishScrapeRun(run.id, {
      status: 'completed_with_errors',
      itemsTotal: 0,
      itemsSuccess: 0,
      itemsFailed: 0,
      summary: { crash: err.message },
    });
    throw err;
  } finally {
    await browserManager.close();
    await lock.releaseGlobalLock();
  }
}

module.exports = { scrapeTrackedItem, runScheduledScrape };
