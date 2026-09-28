const supabase = require('../config/supabaseClient');
const env = require('../config/env');
const { CATALOG, STORE_BASE_URL } = require('../scraper/config');
const { syncAllPagesHttp } = require('../scraper/httpCatalogScraper');
const { BrowserManager } = require('../scraper/browserManager');
const { createLogger } = require('../utils/logger');

const log = createLogger('catalog');

// ── Sync state ──────────────────────────────────────────────────────
let warmupPromise = null;
let lastSyncAt = 0;      // timestamp of last successful sync
let syncInProgress = false;

// ─── SKU parsing ────────────────────────────────────────────────────
function parseSkuText(skuText) {
  const match = (skuText || '').match(/SK-(\d+)-([A-Z0-9]+)?/i);
  return match ? { storeProductId: match[1], sku: skuText.trim() } : null;
}

// ─── Supabase helpers ───────────────────────────────────────────────

/**
 * Returns the count of products currently in the catalog.
 */
async function getCatalogCount() {
  const { count, error } = await supabase
    .from('products')
    .select('*', { count: 'exact', head: true });
  if (error) throw error;
  return count || 0;
}

/**
 * Upserts a batch of product rows into the catalog.
 * Batches in groups of 50 to stay within Supabase's payload limits.
 */
async function upsertCatalogRows(rows) {
  let inserted = 0;
  for (let i = 0; i < rows.length; i += 50) {
    const batch = rows.slice(i, i + 50);
    const { error } = await supabase
      .from('products')
      .upsert(batch, { onConflict: 'store_product_id' });
    if (error) {
      log.error('catalog_upsert_error', { batchStart: i, batchSize: batch.length, error: error });
      throw error;
    }
    inserted += batch.length;
  }
  return inserted;
}

// ─── Search (database-only, < 200ms) ───────────────────────────────

// ── In-memory catalog cache for <5ms instant search ─────────────────
let catalogCache = null;
let catalogCacheLoadedAt = 0;
const CATALOG_CACHE_TTL_MS = 5 * 60 * 1000;

function invalidateCatalogCache() {
  catalogCache = null;
  catalogCacheLoadedAt = 0;
}

async function getCachedCatalog() {
  const now = Date.now();
  if (catalogCache && now - catalogCacheLoadedAt < CATALOG_CACHE_TTL_MS) {
    return catalogCache;
  }
  const { data, error } = await supabase
    .from('products')
    .select('id, store_product_id, name, product_url, metadata_json, updated_at')
    .order('name', { ascending: true });
  if (error) {
    if (catalogCache) return catalogCache;
    throw error;
  }
  catalogCache = data || [];
  catalogCacheLoadedAt = now;
  return catalogCache;
}

// ── Text & Fuzzy Matching Helpers ────────────────────────────────────

/**
 * Normalizes a word token for search:
 * - lowercase
 * - strips non-alphanumeric characters
 * - stems common English plural and gerund suffixes (e.g. tablets -> tablet, cameras -> camera, watches -> watch)
 */
function normalizeToken(token) {
  if (!token) return '';
  let t = token.toLowerCase().replace(/[^a-z0-9]/g, '');
  if (t.endsWith('ies') && t.length > 4) t = t.slice(0, -3) + 'y';
  else if (t.endsWith('es') && t.length > 4) t = t.slice(0, -2);
  else if (t.endsWith('s') && !t.endsWith('ss') && t.length > 3) t = t.slice(0, -1);
  return t;
}

/**
 * Computes standard Levenshtein distance between two strings.
 */
function levenshtein(a, b) {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  const matrix = [];
  for (let i = 0; i <= b.length; i++) matrix[i] = [i];
  for (let j = 0; j <= a.length; j++) matrix[0][j] = j;

  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      if (b.charAt(i - 1) === a.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1,
          matrix[i][j - 1] + 1,
          matrix[i - 1][j] + 1
        );
      }
    }
  }
  return matrix[b.length][a.length];
}

/**
 * Evaluates how closely a search token matches a target word:
 * - Returns match score (0 if no match, up to 30 for exact match)
 */
function tokenMatchesWord(token, word) {
  const normToken = normalizeToken(token);
  const normWord = normalizeToken(word);
  if (!normToken || !normWord) return 0;

  // Exact match
  if (normWord === normToken) return 30;

  // Prefix match
  if (normWord.startsWith(normToken)) return 22;

  // Substring match
  if (normWord.includes(normToken)) return 16;

  // Fuzzy match with Levenshtein distance:
  // length 4-6 allows distance 1 (e.g. camra -> camera, hedset -> headset)
  // length 7+ allows distance 2 (e.g. brightwel -> brightwell)
  const maxDistance = normToken.length >= 7 ? 2 : normToken.length >= 4 ? 1 : 0;
  if (maxDistance > 0 && Math.abs(normToken.length - normWord.length) <= maxDistance) {
    if (levenshtein(normToken, normWord) <= maxDistance) {
      return 12;
    }
  }

  return 0;
}

/**
 * Calculates a relevance score for a product given search tokens.
 */
function scoreProduct(product, tokens, fullQuery) {
  const meta = product.metadata_json || {};
  const name = product.name || '';
  const brand = meta.brand || '';
  const dept = meta.department || '';
  const sku = meta.sku || '';
  const storeId = product.store_product_id || '';

  const nameLower = name.toLowerCase();
  const brandLower = brand.toLowerCase();
  const deptLower = dept.toLowerCase();
  const skuLower = sku.toLowerCase();
  const storeIdLower = storeId.toLowerCase();

  let score = 0;

  // 1. Full phrase exact substring matches
  if (fullQuery) {
    if (nameLower.includes(fullQuery)) score += 80;
    if (brandLower.includes(fullQuery)) score += 40;
    if (deptLower.includes(fullQuery)) score += 30;
    if (skuLower.includes(fullQuery) || storeIdLower === fullQuery) score += 60;
  }

  if (tokens.length === 0) {
    return score + 10;
  }

  // Tokenize product fields into words
  const nameWords = nameLower.split(/[\s\-_/]+/).filter(Boolean);
  const brandWords = brandLower.split(/[\s\-_/]+/).filter(Boolean);
  const deptWords = deptLower.split(/[\s\-_/]+/).filter(Boolean);
  const skuWords = skuLower.split(/[\s\-_/]+/).filter(Boolean);

  let matchedTokensCount = 0;

  for (const token of tokens) {
    let bestTokenScore = 0;

    // Check store ID directly
    if (storeIdLower === token || storeIdLower.includes(token)) {
      bestTokenScore = Math.max(bestTokenScore, 45);
    }

    // Check name words (highest priority)
    for (const w of nameWords) {
      const s = tokenMatchesWord(token, w);
      if (s * 1.5 > bestTokenScore) bestTokenScore = s * 1.5;
    }

    // Check brand words
    for (const w of brandWords) {
      const s = tokenMatchesWord(token, w);
      if (s * 1.2 > bestTokenScore) bestTokenScore = s * 1.2;
    }

    // Check department words
    for (const w of deptWords) {
      const s = tokenMatchesWord(token, w);
      if (s > bestTokenScore) bestTokenScore = s;
    }

    // Check SKU words
    for (const w of skuWords) {
      const s = tokenMatchesWord(token, w);
      if (s * 1.1 > bestTokenScore) bestTokenScore = s * 1.1;
    }

    if (bestTokenScore > 0) {
      matchedTokensCount++;
      score += bestTokenScore;
    }
  }

  // If none of the tokens matched at all, reject
  if (matchedTokensCount === 0) return 0;

  // Significant bonus if ALL tokens matched
  if (matchedTokensCount === tokens.length) {
    score += 40 * tokens.length;
  } else {
    // Penalize partial token matches when user typed multiple specific words
    score -= (tokens.length - matchedTokensCount) * 15;
  }

  return score;
}

/**
 * Searches catalog products using multi-token, stemming, and fuzzy matching,
 * combined with category filtering.
 */
async function searchCatalogProducts(query, { category = null, limit = 50 } = {}) {
  const allProducts = await getCachedCatalog();
  const qClean = (query || '').trim().toLowerCase();
  const catClean = (category || '').trim().toUpperCase();

  // Step 1: Filter by category if specified (and not 'ALL')
  let pool = allProducts;
  if (catClean && catClean !== 'ALL') {
    pool = pool.filter((p) => {
      const dept = (p.metadata_json?.department || '').toUpperCase();
      return dept === catClean || dept.includes(catClean);
    });
  }

  // Step 2: If no search query, return the category products (or recent)
  if (!qClean) {
    return formatSearchResults(pool.slice(0, limit));
  }

  // Step 3: Tokenize query
  const tokens = qClean
    .split(/[\s,]+/)
    .map((t) => t.trim())
    .filter(Boolean);

  // Step 4: Score each product
  const scored = [];
  for (const product of pool) {
    const score = scoreProduct(product, tokens, qClean);
    if (score > 0) {
      scored.push({ product, score });
    }
  }

  // Step 5: Sort by score descending
  scored.sort((a, b) => b.score - a.score);

  return formatSearchResults(scored.slice(0, limit).map((s) => s.product));
}

function formatSearchResults(rows) {
  return rows.map((row) => ({
    name: row.name,
    productUrl: row.product_url,
    storeProductId: row.store_product_id,
    metadata: row.metadata_json || null,
  }));
}

// ─── Catalog sync (HTTP-first, Playwright fallback) ─────────────────

/**
 * Syncs the product catalog from the mock store into Supabase.
 *
 * Strategy:
 *   1. Try HTTP + Cheerio for all 48 pages (fast, ~30 seconds)
 *   2. If HTTP fails (e.g. the listing is client-side rendered), fall back
 *      to Playwright (slow but guaranteed to work, ~5 minutes)
 *
 * Products are uniquely identified by store_product_id (from the SKU).
 * The jumbling on refresh doesn't matter because we upsert by that ID.
 */
async function syncCatalogFromStore({ headed = false, browserManager } = {}) {
  if (syncInProgress) {
    log.warn('catalog_sync_already_in_progress');
    return { skipped: true, reason: 'sync_in_progress' };
  }

  syncInProgress = true;
  const startedAt = Date.now();

  try {
    // Phase 1: Try HTTP + Cheerio (fast path)
    log.info('catalog_sync_started', { method: 'http' });

    try {
      const httpResult = await syncAllPagesHttp();

      if (httpResult.rows.length > 0) {
        const inserted = await upsertCatalogRows(httpResult.rows);
        lastSyncAt = Date.now();
        const durationMs = Date.now() - startedAt;

        log.info('catalog_sync_completed_http', {
          pages: httpResult.pages,
          rows: inserted,
          failedPages: httpResult.failedPages.length,
          durationMs,
        });

        return { method: 'http', pages: httpResult.pages, rows: inserted, durationMs };
      }

      log.warn('http_sync_returned_no_rows_falling_back_to_playwright');
    } catch (httpError) {
      log.warn('http_catalog_sync_failed_falling_back', { error: httpError });
    }

    // Phase 2: Fall back to Playwright (slow path)
    log.info('catalog_sync_falling_back_to_playwright', { headed });
    return await syncCatalogPlaywright({ headed, browserManager });
  } finally {
    syncInProgress = false;
  }
}

/**
 * Playwright-based catalog sync. Used as a fallback when the listing pages
 * require JavaScript rendering (which HTTP+Cheerio can't handle).
 */
async function syncCatalogPlaywright({ headed = false, browserManager } = {}) {
  const manager = browserManager || new BrowserManager({ headed });
  const createdManager = !browserManager;
  const startedAt = Date.now();
  let totalRows = 0;
  let pageCount = 0;

  try {
    const { page, context } = await manager.newPage();
    try {
      for (let pageNumber = 1; pageNumber <= CATALOG.totalPages; pageNumber += 1) {
        try {
          const rows = await syncSinglePagePlaywright(page, pageNumber);
          if (rows.length > 0) {
            const inserted = await upsertCatalogRows(rows);
            totalRows += inserted;
          }
          log.info('catalog_page_synced', { pageNumber, rows: rows.length });
        } catch (error) {
          log.error('catalog_page_sync_skipped', { pageNumber, error: error });
        } finally {
          pageCount += 1;
        }
      }
    } finally {
      await context.close().catch(() => {});
    }
  } finally {
    if (createdManager) await manager.close().catch(() => {});
  }

  lastSyncAt = Date.now();
  const durationMs = Date.now() - startedAt;

  log.info('catalog_sync_completed_playwright', {
    pages: pageCount,
    rows: totalRows,
    durationMs,
  });

  return { method: 'playwright', pages: pageCount, rows: totalRows, durationMs };
}

async function syncSinglePagePlaywright(page, pageNumber) {
  const url = `${STORE_BASE_URL}/?page=${pageNumber}`;
  let lastError = null;

  for (let attempt = 1; attempt <= CATALOG.playwrightPageRetries + 1; attempt += 1) {
    try {
      await page.goto(url, {
        waitUntil: 'domcontentloaded',
        timeout: CATALOG.playwrightPageTimeoutMs,
      });
      await page.waitForTimeout(800);

      const cards = page.locator('article.card');
      const count = await cards.count();
      const rows = [];

      for (let index = 0; index < count; index += 1) {
        const card = cards.nth(index);
        const title = (await card.locator('.card-title').innerText().catch(() => '')).trim();
        const brand = (await card.locator('.card-maker').innerText().catch(() => '')).trim();
        const department = (await card.locator('.dept-label').innerText().catch(() => '')).trim();
        const skuText = (await card.locator('.card-code').innerText().catch(() => '')).trim();
        const skuData = parseSkuText(skuText);
        if (!title || !skuData) continue;

        rows.push({
          store_product_id: skuData.storeProductId,
          name: title,
          product_url: `${STORE_BASE_URL}/item/${skuData.storeProductId}`,
          metadata_json: {
            brand: brand || null,
            department: department || null,
            sku: skuText || null,
            catalog_page_number: pageNumber,
            catalog_page_index: index,
          },
          updated_at: new Date().toISOString(),
        });
      }

      return rows;
    } catch (error) {
      lastError = error;
      log.warn('catalog_page_playwright_attempt_failed', {
        pageNumber,
        attempt,
        error: error,
      });
      if (attempt <= CATALOG.playwrightPageRetries) {
        await page.waitForTimeout(500 * attempt).catch(() => {});
      }
    }
  }

  throw lastError;
}

// ─── Warmup (non-blocking) ──────────────────────────────────────────

/**
 * Ensures the catalog is populated. If the catalog has enough rows, returns
 * immediately. If not, triggers a background sync.
 *
 * CRITICAL: This function NEVER blocks. It returns immediately and syncs
 * in the background. The search endpoint should never wait for this.
 */
async function ensureCatalogWarm({ force = false, headed = false } = {}) {
  // If a sync is already running, just wait for it
  if (warmupPromise) return warmupPromise;

  // Check cooldown — don't sync too frequently
  if (!force && Date.now() - lastSyncAt < CATALOG.syncCooldownMs) {
    return { skipped: true, reason: 'cooldown' };
  }

  warmupPromise = (async () => {
    const count = await getCatalogCount();
    if (!force && count >= CATALOG.minCatalogRows) {
      return { skipped: true, count };
    }
    log.info('catalog_warmup_triggered', { currentCount: count, force, headed });
    return syncCatalogFromStore({ headed });
  })();

  warmupPromise.catch((err) => {
    log.error('catalog_warmup_failed', { error: err });
  }).finally(() => {
    warmupPromise = null;
  });

  return warmupPromise;
}

/**
 * Search function exposed to routes. Searches the DB immediately —
 * never blocks on catalog warmup.
 *
 * If the catalog is empty and a sync isn't running, it triggers a
 * background sync and returns a helpful message.
 */
/**
 * Search function exposed to routes. Searches the DB immediately —
 * never blocks on catalog warmup.
 *
 * If the catalog is empty and a sync isn't running, it triggers a
 * background sync and returns a helpful message.
 */
async function searchProducts(query, { category = null, limit = 50 } = {}) {
  const results = await searchCatalogProducts(query, { category, limit });

  if (results.length === 0) {
    // Check if catalog is empty
    const count = await getCatalogCount();
    if (count === 0) {
      // Trigger background sync without blocking
      ensureCatalogWarm({ force: true }).catch(() => {});
      return {
        results: [],
        catalogStatus: 'syncing',
        message: 'Catalog is empty and syncing in background. Try again in ~30 seconds.',
      };
    }

    // Catalog has data but no matches
    return { results: [], catalogStatus: 'ready' };
  }

  return { results, catalogStatus: 'ready' };
}

module.exports = {
  searchProducts,
  searchCatalogProducts,
  syncCatalogFromStore,
  ensureCatalogWarm,
  getCatalogCount,
  invalidateCatalogCache,
};