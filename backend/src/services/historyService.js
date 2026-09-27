const supabase = require('../config/supabaseClient');

async function getPriceHistory(trackedItemId, { limit = 500 } = {}) {
  const { data, error } = await supabase
    .from('price_history')
    .select('*')
    .eq('tracked_item_id', trackedItemId)
    .order('observed_at_utc', { ascending: true })
    .limit(limit);
  if (error) throw error;
  return data;
}

async function getScrapeLog(trackedItemId, { limit = 200 } = {}) {
  const { data, error } = await supabase
    .from('scrape_attempts')
    .select('*')
    .eq('tracked_item_id', trackedItemId)
    .order('attempted_at_utc', { ascending: false })
    .limit(limit);
  if (error) throw error;
  return data;
}

module.exports = { getPriceHistory, getScrapeLog };
