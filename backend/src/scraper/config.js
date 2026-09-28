const env = require('../config/env');

const STORE_BASE_URL = env.STORE_BASE_URL;

/**
 * Regex for extracting a price value from arbitrary text. Supports:
 *   ₹1,299.00  |  $49.99  |  Rs. 1299  |  INR 500  |  €19.50  |  £25
 */
const PRICE_TEXT_REGEX = /(?:₹|rs\.?\s*|inr\s*|\$|€|£)?\s*[\d,]+(?:\.\d{1,2})?/i;

// ─── DOM selectors ─────────────────────────────────────────────────────
//
// The mock store at demo.inelabteamdev.com uses these known structures:
//
// LISTING PAGE (/?page=N):
//   - Product cards: <article class="card"> containing:
//     - Name:       .card-title
//     - Brand:      .card-maker
//     - Department: .dept-label
//     - SKU code:   .card-code  (text like "SK-2104-AB3")
//     - Link:       a button/link with text "OPEN ITEM" → /item/{id}
//
// ITEM PAGE (/item/{id}):
//   - Options:      <select> dropdown or button group for variants
//   - Price button: button with text "Check today's price" (first visit)
//                   or "Check again" (subsequent)
//   - Price text:   appears ONLY AFTER clicking the price button
//   - Stock info:   may appear alongside or near the price
//
// Each selector array is a priority-ordered fallback chain: we try the most
// specific first and fall back to generic selectors if the site changes.

const SELECTORS = {
  // ── Catalog / listing page ────────────────────────────────────────
  catalogCard: [
    'article.card',
    '[data-testid="product-card"]',
    'article:has(.card-title)',
    'li:has(.card-title)',
  ],
  catalogCardName: [
    '.card-title',
    '[data-testid="product-name"]',
    'h2',
    'h3',
    '.title',
  ],
  catalogCardBrand: [
    '.card-maker',
    '.brand',
    '[class*="maker"]',
  ],
  catalogCardDepartment: [
    '.dept-label',
    '.department',
    '[class*="dept"]',
  ],
  catalogCardSku: [
    '.card-code',
    '[class*="code"]',
    '[class*="sku"]',
  ],
  catalogCardLink: [
    'a:has-text("OPEN ITEM")',
    'a[href*="/item/"]',
    'a[href*="/product/"]',
    'a[href]',
  ],

  // ── Search input (if the store has one — used only by Playwright fallback) ─
  searchInput: [
    'input[type="search"]',
    'input[placeholder*="search" i]',
    'input[type="text"]',
    '[data-testid="search-input"]',
  ],

  // ── Item page: option pickers ─────────────────────────────────────
  optionSelect: [
    'select[name*="option" i]',
    'select[id*="option" i]',
    'select',
  ],
  optionButton: [
    'button[role="option"]',
    'button[data-option]',
    '.variant button',
    '.option button',
  ],

  // ── Item page: the "Check today's price" / "Check again" button ───
  priceCheckButton: [
    'button:has-text("Check today\'s price")',
    'button:has-text("Check again")',
    'button:has-text("check")',
    'button:has-text("price")',
    '[data-testid="check-price"]',
    'button.check-price',
  ],

  // ── Item page: price element (visible ONLY after clicking the button) ─
  price: [
    '[data-testid="price"]',
    '.price',
    '[class*="price"]',
    'span:has-text("₹")',
    'span:has-text("$")',
    '.product-price',
    '#price',
  ],

  // ── Item page: stock info ──────────────────────────────────────────
  stock: [
    '[data-testid="stock"]',
    '.stock',
    '[class*="stock"]',
    '.availability',
    'text=/in stock|out of stock|sold out|available/i',
  ],

  outOfStockMarkers: ['out of stock', 'sold out', 'unavailable', 'currently unavailable'],
  inStockMarkers: ['in stock', 'available', 'in-stock'],
};

// ─── Timing / behaviour config ──────────────────────────────────────
const TIMING = {
  headless: env.SCRAPER_HEADLESS,
  navTimeoutMs: env.SCRAPER_NAV_TIMEOUT_MS,
  contentWaitMs: env.SCRAPER_CONTENT_WAIT_MS,
  maxAttempts: env.SCRAPER_MAX_ATTEMPTS,
  backoffBaseMs: env.SCRAPER_BACKOFF_BASE_MS,
  backoffMaxMs: env.SCRAPER_BACKOFF_MAX_MS,
  concurrency: env.SCRAPER_CONCURRENCY,
  lockStaleMinutes: env.SCRAPER_LOCK_STALE_MINUTES,

  // How long to wait after clicking "Check today's price" for the price to appear
  priceButtonWaitMs: 5000,
  // How long to wait for the price check button itself to appear
  priceButtonTimeoutMs: 3000,
};

// ─── Catalog sync constants ─────────────────────────────────────────
const CATALOG = {
  totalPages: 48,
  productsPerPage: 20,
  expectedTotalProducts: 48 * 20,  // 960
  minCatalogRows: 400,             // consider catalog "warm" if >= this (we have 457 cached products)
  httpConcurrency: 5,              // how many pages to fetch in parallel via HTTP
  httpTimeoutMs: 15_000,           // per-page HTTP fetch timeout
  httpRetries: 2,                  // retries per page on HTTP failure
  playwrightPageRetries: 2,        // retries per page on Playwright failure
  playwrightPageTimeoutMs: 30_000, // per-page Playwright timeout
  syncCooldownMs: 5 * 60 * 1000,  // minimum time between full syncs (5 min)
};

module.exports = {
  STORE_BASE_URL,
  PRICE_TEXT_REGEX,
  SELECTORS,
  TIMING,
  CATALOG,
};