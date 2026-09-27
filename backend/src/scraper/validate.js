const { PRICE_TEXT_REGEX, SELECTORS } = require('./config');
const { ValidationError } = require('./errorClassification');

const MAX_SANE_PRICE = 1_000_000;

/**
 * Turns raw scraped price text (e.g. "₹1,299.00", "$49.99") into a validated
 * number. Throws ValidationError - never returns a guess - if the text
 * doesn't contain a plausible price, so the caller can log a failed attempt
 * instead of writing wrong data to price_history.
 */
function parsePrice(rawText) {
  if (!rawText || !rawText.trim()) {
    throw new ValidationError('Price text was empty', 'PRICE_EMPTY');
  }
  const match = rawText.match(PRICE_TEXT_REGEX);
  if (!match) {
    throw new ValidationError(`Could not find a price-like token in "${rawText}"`, 'PRICE_UNPARSEABLE');
  }
  const cleaned = match[0]
    .replace(/rs\.?/gi, '')
    .replace(/inr/gi, '')
    .replace(/usd/gi, '')
    .replace(/[₹$€£\s]/g, '')
    .replace(/,/g, '');
  const value = parseFloat(cleaned);
  if (Number.isNaN(value)) {
    throw new ValidationError(`Price token "${match[0]}" did not parse to a number`, 'PRICE_UNPARSEABLE');
  }
  if (value <= 0 || value > MAX_SANE_PRICE) {
    throw new ValidationError(`Parsed price ${value} failed sanity check`, 'PRICE_OUT_OF_RANGE');
  }
  return Math.round(value * 100) / 100;
}

/**
 * Turns raw scraped stock text into a normalized enum plus, when present, a
 * numeric quantity. Returns 'unknown' (rather than guessing in_stock) only
 * when the text truly gives no signal - callers treat 'unknown' as a
 * successful-but-uninformative scrape, not a failure, since the price itself
 * is still valid and worth recording.
 */
function parseStock(rawText) {
  if (!rawText || !rawText.trim()) {
    return { normalized: 'unknown', quantity: null };
  }
  const text = rawText.toLowerCase();

  const qtyMatch = text.match(/(\d+)\s*(?:left|in stock|available|units?)/);
  const quantity = qtyMatch ? parseInt(qtyMatch[1], 10) : null;

  if (SELECTORS.outOfStockMarkers.some((m) => text.includes(m))) {
    return { normalized: 'out_of_stock', quantity: quantity ?? 0 };
  }
  if (SELECTORS.inStockMarkers.some((m) => text.includes(m)) || quantity !== null) {
    return { normalized: 'in_stock', quantity };
  }
  return { normalized: 'unknown', quantity };
}

module.exports = { parsePrice, parseStock, MAX_SANE_PRICE };
