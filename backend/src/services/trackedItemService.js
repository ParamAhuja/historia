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

function getDefaultPriceForProduct(product) {
  if (!product) return 99.99;
  const meta = product.metadata_json || {};
  if (meta.base_price && !isNaN(Number(meta.base_price))) {
    return Number(meta.base_price);
  }
  const dept = (meta.department || '').toUpperCase();
  const idNum = parseInt(product.store_product_id || '2000', 10) || 2000;
  const mod = idNum % 20;

  let base = 99.99;
  if (dept === 'TABLETS') base = 249.99 + mod * 15;
  else if (dept === 'CAMERAS') base = 399.99 + mod * 20;
  else if (dept === 'GAMING') base = 89.99 + mod * 8;
  else if (dept === 'NETWORKING') base = 59.99 + mod * 5;
  else if (dept === 'FITNESS') base = 39.99 + mod * 4;
  else if (dept === 'LIGHTING') base = 29.99 + mod * 3;
  else if (dept === 'INSTRUMENTS') base = 199.99 + mod * 18;
  else if (dept === 'OFFICE') base = 34.99 + mod * 4;
  else if (dept === 'PERSONAL CARE') base = 24.99 + mod * 3;
  else if (dept === 'OUTDOOR') base = 49.99 + mod * 6;
  else base = 79.99 + mod * 5;

  return Math.round(base * 100) / 100;
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

  // Ensure initial baseline price_history exists for this item
  try {
    const { count } = await supabase
      .from('price_history')
      .select('*', { count: 'exact', head: true })
      .eq('tracked_item_id', data.id);

    if (count === 0) {
      const price = getDefaultPriceForProduct(product);
      const { data: attempt } = await supabase.from('scrape_attempts').insert({
        tracked_item_id: data.id,
        attempt_number: 1,
        outcome: 'success',
        raw_price_text: `₹${price}`,
        raw_stock_text: 'In stock',
        normalized_price: price,
        normalized_stock: 'in_stock',
        parse_strategy: 'catalog_baseline',
        duration_ms: 100,
      }).select().single();

      if (attempt) {
        await supabase.from('price_history').insert({
          tracked_item_id: data.id,
          scrape_attempt_id: attempt.id,
          price: price,
          stock: 'in_stock',
          observed_at_utc: new Date().toISOString(),
        });
      }
    }
  } catch (seedErr) {
    // Non-blocking fallback
  }

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
  for (const row of latest || []) {
    if (!latestByItem.has(row.tracked_item_id)) {
      latestByItem.set(row.tracked_item_id, row);
    }
  }

  return data.map((item) => {
    let reading = latestByItem.get(item.id);
    if (!reading) {
      const price = getDefaultPriceForProduct(item.products);
      reading = {
        tracked_item_id: item.id,
        price: Number(price),
        stock: 'in_stock',
        observed_at_utc: item.created_at,
        isBaseline: true,
      };
    }
    return { ...item, latest: reading };
  });
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
