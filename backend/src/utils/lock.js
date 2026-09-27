const supabase = require('../config/supabaseClient');
const logger = require('./logger');

/**
 * Tries to acquire the single global "scheduled_scrape" lock using an atomic
 * UPDATE ... WHERE is_locked = false. Postgres guarantees only one concurrent
 * request can win this race, which is what stops an overlapping cron trigger
 * (e.g. a slow run still in progress when the next 2-hour tick fires) from
 * starting a second run on top of it.
 *
 * Returns true if the lock was acquired.
 */
async function acquireGlobalLock(runId) {
  const { data, error } = await supabase
    .from('system_locks')
    .update({ is_locked: true, locked_at: new Date().toISOString(), run_id: runId })
    .eq('lock_name', 'scheduled_scrape')
    .eq('is_locked', false)
    .select();

  if (error) {
    logger.error('global_lock_acquire_error', { error: error.message });
    return false;
  }
  return Array.isArray(data) && data.length > 0;
}

async function releaseGlobalLock() {
  const { error } = await supabase
    .from('system_locks')
    .update({ is_locked: false, locked_at: null, run_id: null })
    .eq('lock_name', 'scheduled_scrape');
  if (error) {
    logger.error('global_lock_release_error', { error: error.message });
  }
}

/**
 * Force-releases the global lock if it has been held longer than
 * `staleMinutes` (e.g. the previous process crashed mid-run and never
 * released it). This keeps a single crash from permanently wedging the
 * scheduler.
 */
async function clearStaleGlobalLock(staleMinutes) {
  const cutoff = new Date(Date.now() - staleMinutes * 60_000).toISOString();
  const { data, error } = await supabase
    .from('system_locks')
    .update({ is_locked: false, locked_at: null, run_id: null })
    .eq('lock_name', 'scheduled_scrape')
    .eq('is_locked', true)
    .lt('locked_at', cutoff)
    .select();
  if (error) {
    logger.error('global_lock_stale_clear_error', { error: error.message });
    return;
  }
  if (data && data.length > 0) {
    logger.warn('global_lock_stale_cleared', { cutoff });
  }
}

/**
 * Per-item lock: prevents the same tracked_item from being scraped twice
 * concurrently (e.g. a manual "scrape now" click while the scheduled run is
 * already processing that item).
 */
async function acquireItemLock(trackedItemId) {
  const { data, error } = await supabase
    .from('tracked_items')
    .update({ is_locked: true, locked_at: new Date().toISOString() })
    .eq('id', trackedItemId)
    .eq('is_locked', false)
    .select();

  if (error) {
    logger.error('item_lock_acquire_error', { trackedItemId, error: error.message });
    return false;
  }
  return Array.isArray(data) && data.length > 0;
}

async function releaseItemLock(trackedItemId) {
  const { error } = await supabase
    .from('tracked_items')
    .update({ is_locked: false, locked_at: null })
    .eq('id', trackedItemId);
  if (error) {
    logger.error('item_lock_release_error', { trackedItemId, error: error.message });
  }
}

async function clearStaleItemLocks(staleMinutes) {
  const cutoff = new Date(Date.now() - staleMinutes * 60_000).toISOString();
  const { data, error } = await supabase
    .from('tracked_items')
    .update({ is_locked: false, locked_at: null })
    .eq('is_locked', true)
    .lt('locked_at', cutoff)
    .select('id');
  if (error) {
    logger.error('item_lock_stale_clear_error', { error: error.message });
    return;
  }
  if (data && data.length > 0) {
    logger.warn('item_locks_stale_cleared', { count: data.length });
  }
}

module.exports = {
  acquireGlobalLock,
  releaseGlobalLock,
  clearStaleGlobalLock,
  acquireItemLock,
  releaseItemLock,
  clearStaleItemLocks,
};
