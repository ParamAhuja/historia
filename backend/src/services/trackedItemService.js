const supabase = require('../config/supabaseClient');

async function upsertProduct({ storeProductId, name, productUrl, metadata }) {
  const { data, error } = await supabase
    .from('products')
    .upsert(
      { store_product_id: storeProductId, name, product_url: productUrl, metadata_json: metadata || null, updated_at: new Date().toISOString() },
      { onConflict: 'store_product_id' },
    )
    .select()
    .single();
  if (error) throw error;
  return data;
}

async function createTrackedItem({ storeProductId, name, productUrl, optionLabel, optionKey, intervalMinutes }) {
  const product = await upsertProduct({ storeProductId, name, productUrl });

  const { data, error } = await supabase
    .from('tracked_items')
    .upsert(
      {
        product_id: product.id,
        selected_option_label: optionLabel,
        selected_option_key: optionKey,
        scrape_interval_minutes: intervalMinutes || 120,
        is_active: true,
      },
      { onConflict: 'product_id,selected_option_key' },
    )
    .select('*, products(*)')
    .single();
  if (error) throw error;
  return data;
}

async function listTrackedItems() {
  const { data, error } = await supabase
    .from('tracked_items')
    .select('*, products(*)')
    .order('created_at', { ascending: false });
  if (error) throw error;

  // Attach the latest price/stock reading so the dashboard list doesn't need
  // a second round trip per row.
  const ids = data.map((d) => d.id);
  if (ids.length === 0) return data;

  const { data: latest, error: latestErr } = await supabase
    .from('price_history')
    .select('tracked_item_id, price, stock, observed_at_utc')
    .in('tracked_item_id', ids)
    .order('observed_at_utc', { ascending: false });
  if (latestErr) throw latestErr;

  const latestByItem = new Map();
  for (const row of latest) {
    if (!latestByItem.has(row.tracked_item_id)) latestByItem.set(row.tracked_item_id, row);
  }

  return data.map((item) => ({ ...item, latest: latestByItem.get(item.id) || null }));
}

async function updateTrackedItem(id, patch) {
  const allowed = {};
  if (typeof patch.isActive === 'boolean') allowed.is_active = patch.isActive;
  if (Number.isInteger(patch.intervalMinutes)) allowed.scrape_interval_minutes = patch.intervalMinutes;
  allowed.updated_at = new Date().toISOString();

  const { data, error } = await supabase.from('tracked_items').update(allowed).eq('id', id).select().single();
  if (error) throw error;
  return data;
}

async function deleteTrackedItem(id) {
  const { error } = await supabase.from('tracked_items').delete().eq('id', id);
  if (error) throw error;
}

module.exports = { createTrackedItem, listTrackedItems, updateTrackedItem, deleteTrackedItem };
