const env = require('../config/env');

const STORE_BASE_URL = env.STORE_BASE_URL;

const PRICE_TEXT_REGEX = /(?:₹|rs\.?|inr|\$|€|£)?\s*[\d,.]+(?:\.\d{1,2})?/i;

const SELECTORS = {
  searchInput: [
    'input[type="search"]',
    'input[placeholder*="search" i]',
    'input[type="text"]',
    '[data-testid="search-input"]',
  ],
  productCard: [
    '[data-testid="product-card"]',
    'article:has-text("OPEN ITEM")',
    'section:has-text("OPEN ITEM")',
    'li:has-text("OPEN ITEM")',
    'article:has(a[href*="/product/"])',
    'li:has(a[href*="/product/"])',
    'a[href*="/product/"]',
  ],
  productCardName: [
    '[data-testid="product-name"]',
    '.product-name',
    'h1',
    'h2',
    'h3',
    '.title',
  ],
  productCardLink: ['a:has-text("OPEN ITEM")', 'a[href*="/product/"]', 'a[href]'],
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
  price: [
    '[data-testid="price"]',
    '.price',
    '[class*="price"]',
    'span:has-text("₹")',
    'span:has-text("$")',
  ],
  stock: [
    '[data-testid="stock"]',
    '.stock',
    '[class*="stock"]',
    'text=/in stock|out of stock|sold out|available/i',
  ],
  outOfStockMarkers: ['out of stock', 'sold out', 'unavailable', 'currently unavailable'],
  inStockMarkers: ['in stock', 'available'],
};

const TIMING = {
  headless: env.SCRAPER_HEADLESS,
  navTimeoutMs: env.SCRAPER_NAV_TIMEOUT_MS,
  contentWaitMs: env.SCRAPER_CONTENT_WAIT_MS,
  maxAttempts: env.SCRAPER_MAX_ATTEMPTS,
  backoffBaseMs: env.SCRAPER_BACKOFF_BASE_MS,
  backoffMaxMs: env.SCRAPER_BACKOFF_MAX_MS,
  concurrency: env.SCRAPER_CONCURRENCY,
  lockStaleMinutes: env.SCRAPER_LOCK_STALE_MINUTES,
};

module.exports = {
  STORE_BASE_URL,
  PRICE_TEXT_REGEX,
  SELECTORS,
  TIMING,
};