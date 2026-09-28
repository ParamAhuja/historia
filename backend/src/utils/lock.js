const supabase = require('../config/supabaseClient');
const { createLogger } = require('./logger');

const log = createLogger('lock');

/**
 * Tries to acquire the single global "scheduled_scrape" lock using an atomic
 * UPDATE ... WHERE is_locked = false. Postgres guarantees only one concurrent
 * request can win this race, which is what stops an overlapping cron trigger
 * from starting a second run on top of it.
 *
 * Returns true if the lock was acquired.
 */
async function acquireGlobalLock(runId) {
  try {
    const { data, error } = await supabase
      .from('system_locks')
      .update({ is_locked: true, locked_at: new Date().toISOString(), run_id: runId })
      .eq('lock_name', 'scheduled_scrape')
      .eq('is_locked', false)
      .select();

    if (error) {
      log.error('global_lock_acquire_error', { error: error });
      return false;
    }

    const acquired = Array.isArray(data) && data.length > 0;
    if (acquired) {
      log.info('global_lock_acquired', { runId });
    } else {
      log.warn('global_lock_already_held');
    }
    return acquired;
  } catch (err) {
    log.error('global_lock_acquire_exception', { error: err });
    return false;
  }
}

async function releaseGlobalLock() {
  try {
    const { error } = await supabase
      .from('system_locks')
      .update({ is_locked: false, locked_at: null, run_id: null })
      .eq('lock_name', 'scheduled_scrape');

    if (error) {
      log.error('global_lock_release_error', { error: error });
    } else {
      log.info('global_lock_released');
    }
  } catch (err) {
    log.error('global_lock_release_exception', { error: err });
  }
}

/**
 * Force-releases the global lock if it has been held longer than
 * `staleMinutes` (e.g. the previous process crashed mid-run and never
 * released it). This keeps a single crash from permanently wedging the
 * scheduler.
 */
async function clearStaleGlobalLock(staleMinutes) {
  try {
    const cutoff = new Date(Date.now() - staleMinutes * 60_000).toISOString();
    const { data, error } = await supabase
      .from('system_locks')
      .update({ is_locked: false, locked_at: null, run_id: null })
      .eq('lock_name', 'scheduled_scrape')
      .eq('is_locked', true)
      .lt('locked_at', cutoff)
      .select();

    if (error) {
      log.error('global_lock_stale_clear_error', { error: error });
      return;
    }
    if (data && data.length > 0) {
      log.warn('global_lock_stale_cleared', { cutoff, staleLockCount: data.length });
    }
  } catch (err) {
    log.error('global_lock_stale_clear_exception', { error: err });
  }
}

/**
 * Per-item lock: prevents the same tracked_item from being scraped twice
 * concurrently (e.g. a manual "scrape now" click while the scheduled run is
 * already processing that item).
 */
async function acquireItemLock(trackedItemId) {
  try {
    const { data, error } = await supabase
      .from('tracked_items')
      .update({ is_locked: true, locked_at: new Date().toISOString() })
      .eq('id', trackedItemId)
      .eq('is_locked', false)
      .select();

    if (error) {
      log.error('item_lock_acquire_error', { trackedItemId, error: error });
      return false;
    }

    const acquired = Array.isArray(data) && data.length > 0;
    log.debug('item_lock_acquire_result', { trackedItemId, acquired });
    return acquired;
  } catch (err) {
    log.error('item_lock_acquire_exception', { trackedItemId, error: err });
    return false;
  }
}

async function releaseItemLock(trackedItemId) {
  try {
    const { error } = await supabase
      .from('tracked_items')
      .update({ is_locked: false, locked_at: null })
      .eq('id', trackedItemId);

    if (error) {
      log.error('item_lock_release_error', { trackedItemId, error: error });
    }
  } catch (err) {
    log.error('item_lock_release_exception', { trackedItemId, error: err });
  }
}

async function clearStaleItemLocks(staleMinutes) {
  try {
    const cutoff = new Date(Date.now() - staleMinutes * 60_000).toISOString();
    const { data, error } = await supabase
      .from('tracked_items')
      .update({ is_locked: false, locked_at: null })
      .eq('is_locked', true)
      .lt('locked_at', cutoff)
      .select('id');

    if (error) {
      log.error('item_lock_stale_clear_error', { error: error });
      return;
    }
    if (data && data.length > 0) {
      log.warn('item_locks_stale_cleared', {
        count: data.length,
        itemIds: data.map((d) => d.id),
      });
    }
  } catch (err) {
    log.error('item_lock_stale_clear_exception', { error: err });
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
