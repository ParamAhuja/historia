const supabase = require('../config/supabaseClient');

const HEADERS = [
  'store_product_id',
  'product_name',
  'selected_option',
  'timestamp_utc',
  'price',
  'stock',
  'outcome',
];

function csvEscape(value) {
  if (value === null || value === undefined) return '';
  const str = String(value);
  if (/[",\n]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

/**
 * Builds the CSV required by the assignment: one row per scrape ATTEMPT
 * (not per successful reading), including failed attempts with price/stock
 * left empty. Pulls straight from scrape_attempts joined through
 * tracked_items -> products, so the export always matches exactly what the
 * scrape log shows on screen.
 */
async function buildScrapeHistoryCsv() {
  const { data, error } = await supabase
    .from('scrape_attempts')
    .select(
      `attempted_at_utc, outcome, normalized_price, normalized_stock,
       tracked_items ( selected_option_label, products ( store_product_id, name ) )`,
    )
    .order('attempted_at_utc', { ascending: true });
  if (error) throw error;

  const rows = data.map((attempt) => {
    const trackedItem = attempt.tracked_items || {};
    const product = trackedItem.products || {};
    const isSuccess = attempt.outcome === 'success';
    return [
      product.store_product_id || '',
      product.name || '',
      trackedItem.selected_option_label || '',
      attempt.attempted_at_utc,
      isSuccess ? attempt.normalized_price : '',
      isSuccess ? attempt.normalized_stock : '',
      attempt.outcome,
    ];
  });

  const lines = [HEADERS.join(',')];
  for (const row of rows) {
    lines.push(row.map(csvEscape).join(','));
  }
  return lines.join('\n');
}

module.exports = { buildScrapeHistoryCsv };
