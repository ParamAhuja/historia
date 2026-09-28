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

/**
 * Searches the pre-synced product catalog in Supabase. This is the PRIMARY
 * search function — it never launches a browser or touches the mock store.
 *
 * Uses PostgreSQL ILIKE for case-insensitive substring matching.
 * If trigram indexes are installed, this will be fast even on large catalogs.
 *
 * Target latency: < 200ms (down from ~120s with the old Playwright approach).
 */
async function searchCatalogProducts(query, { limit = 50 } = {}) {
  const q = (query || '').trim().toLowerCase();

  if (!q) {
    // No query — return most recently updated products
    const { data, error } = await supabase
      .from('products')
      .select('id, store_product_id, name, product_url, metadata_json, updated_at')
      .order('updated_at', { ascending: false })
      .limit(limit);
    if (error) throw error;
    return formatSearchResults(data || []);
  }

  // Strategy 1: ILIKE search on name (works without pg_trgm extension)
  const { data, error } = await supabase
    .from('products')
    .select('id, store_product_id, name, product_url, metadata_json, updated_at')
    .ilike('name', `%${q}%`)
    .order('name', { ascending: true })
    .limit(limit);

  if (error) throw error;

  let results = data || [];

  // Strategy 2: If name search returned nothing, search in metadata fields too
  if (results.length === 0) {
    const { data: allData, error: allErr } = await supabase
      .from('products')
      .select('id, store_product_id, name, product_url, metadata_json, updated_at')
      .order('updated_at', { ascending: false });
    if (allErr) throw allErr;

    results = (allData || []).filter((row) => {
      const meta = row.metadata_json || {};
      const haystack = [row.name, row.store_product_id, meta.brand, meta.sku, meta.department]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return haystack.includes(q);
    }).slice(0, limit);
  }

  return formatSearchResults(results);
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
async function searchProducts(query) {
  const results = await searchCatalogProducts(query);

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
};