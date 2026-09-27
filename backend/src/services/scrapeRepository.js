const supabase = require('../config/supabaseClient');

function nowIso() {
  return new Date().toISOString();
}

async function getTrackedItemById(id) {
  const { data, error } = await supabase
    .from('tracked_items')
    .select('*, products(*)')
    .eq('id', id)
    .single();

  if (error) throw error;
  return data;
}

async function getDueTrackedItems() {
  const { data, error } = await supabase
    .from('tracked_items')
    .select('*, products(*)')
    .eq('is_active', true)
    .eq('is_locked', false)
    .order('created_at', { ascending: true });

  if (error) throw error;

  const now = Date.now();
  return (data || []).filter((item) => {
    if (!item.last_scraped_at) return true;
    const lastScrape = new Date(item.last_scraped_at).getTime();
    const intervalMs = (item.scrape_interval_minutes || 120) * 60_000;
    return Number.isFinite(lastScrape) && now - lastScrape >= intervalMs;
  });
}

async function createScrapeRun({ triggerSource }) {
  const { data, error } = await supabase
    .from('scrape_runs')
    .insert({
      triggered_at: nowIso(),
      trigger_source: triggerSource || 'cron',
      run_status: 'running',
    })
    .select()
    .single();

  if (error) throw error;
  return data;
}

async function finishScrapeRun(id, { status, itemsTotal, itemsSuccess, itemsFailed, summary }) {
  const { data, error } = await supabase
    .from('scrape_runs')
    .update({
      finished_at: nowIso(),
      run_status: status,
      items_total: itemsTotal,
      items_success: itemsSuccess,
      items_failed: itemsFailed,
      summary_json: summary || null,
    })
    .eq('id', id)
    .select()
    .single();

  if (error) throw error;
  return data;
}

async function recordAttempt(payload) {
  const { data, error } = await supabase
    .from('scrape_attempts')
    .insert({
      tracked_item_id: payload.trackedItemId,
      scrape_run_id: payload.scrapeRunId,
      attempted_at_utc: nowIso(),
      attempt_number: payload.attemptNumber,
      outcome: payload.outcome,
      error_code: payload.errorCode || null,
      error_message: payload.errorMessage || null,
      raw_price_text: payload.rawPriceText || null,
      raw_stock_text: payload.rawStockText || null,
      normalized_price: payload.normalizedPrice ?? null,
      normalized_stock: payload.normalizedStock || null,
      stock_quantity: payload.stockQuantity ?? null,
      parse_strategy: payload.parseStrategy || null,
      duration_ms: payload.durationMs ?? null,
    })
    .select()
    .single();

  if (error) throw error;
  return data;
}

async function recordPriceHistory(payload) {
  const { data, error } = await supabase
    .from('price_history')
    .insert({
      tracked_item_id: payload.trackedItemId,
      scrape_attempt_id: payload.scrapeAttemptId,
      observed_at_utc: nowIso(),
      price: payload.price,
      stock: payload.stock,
      stock_quantity: payload.stockQuantity ?? null,
    })
    .select()
    .single();

  if (error) throw error;
  return data;
}

async function markItemScraped(trackedItemId, { success }) {
  const updates = {
    last_scraped_at: nowIso(),
    updated_at: nowIso(),
  };

  if (success) {
    updates.last_success_at = nowIso();
  }

  const { data, error } = await supabase
    .from('tracked_items')
    .update(updates)
    .eq('id', trackedItemId)
    .select()
    .single();

  if (error) throw error;
  return data;
}

module.exports = {
  getTrackedItemById,
  getDueTrackedItems,
  createScrapeRun,
  finishScrapeRun,
  recordAttempt,
  recordPriceHistory,
  markItemScraped,
};