-- INE Product Price Tracker - database schema
-- Run this in the Supabase SQL editor (or via `psql`) before starting the backend.
-- All timestamps are stored as `timestamptz` and written in UTC by the app.

create extension if not exists "pgcrypto";

-- Enable trigram extension for fast LIKE/ILIKE searches on product names.
-- This makes the search endpoint respond in < 200ms even with 960+ products.
create extension if not exists "pg_trgm";

-- ---------------------------------------------------------------------------
-- products: one row per distinct product page on the mock store
-- ---------------------------------------------------------------------------
create table if not exists products (
  id                uuid primary key default gen_random_uuid(),
  store_product_id  text not null,              -- id as shown in the product page URL
  name              text not null,
  product_url       text not null,
  metadata_json     jsonb,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  unique (store_product_id)
);

create index if not exists idx_products_name on products (name);
create index if not exists idx_products_store_product_id on products (store_product_id);

-- Trigram index for fast case-insensitive LIKE/ILIKE queries.
-- Required by the search endpoint: SELECT * FROM products WHERE name ILIKE '%phone%'
create index if not exists idx_products_name_trgm on products using gin (name gin_trgm_ops);

-- ---------------------------------------------------------------------------
-- tracked_items: a (product, option) pair the user has chosen to track
-- ---------------------------------------------------------------------------
create table if not exists tracked_items (
  id                      uuid primary key default gen_random_uuid(),
  product_id              uuid not null references products (id) on delete cascade,
  selected_option_label   text not null,
  selected_option_key     text not null,          -- normalized identifier for the option
  is_active               boolean not null default true,
  scrape_interval_minutes integer not null default 120,
  last_scraped_at         timestamptz,             -- last attempt of any outcome
  last_success_at         timestamptz,             -- last attempt that succeeded
  -- per-item lock, so a slow-running scrape can't be double-triggered by an
  -- overlapping cron run
  is_locked               boolean not null default false,
  locked_at               timestamptz,
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now(),
  unique (product_id, selected_option_key)
);

create index if not exists idx_tracked_items_active on tracked_items (is_active);

-- ---------------------------------------------------------------------------
-- scrape_runs: one row per scheduled/manual batch trigger (all tracked items)
-- Created before scrape_attempts because scrape_attempts references it.
-- ---------------------------------------------------------------------------
create table if not exists scrape_runs (
  id              uuid primary key default gen_random_uuid(),
  triggered_at    timestamptz not null default now(),
  finished_at     timestamptz,
  trigger_source  text not null default 'cron', -- 'cron' | 'manual' | 'headed'
  run_status      text not null default 'running', -- 'running' | 'completed' | 'completed_with_errors' | 'skipped_locked'
  items_total     integer default 0,
  items_success   integer default 0,
  items_failed    integer default 0,
  summary_json    jsonb
);

-- ---------------------------------------------------------------------------
-- scrape_attempts: one row PER ATTEMPT (including retries and failures)
-- ---------------------------------------------------------------------------
create table if not exists scrape_attempts (
  id                  uuid primary key default gen_random_uuid(),
  tracked_item_id     uuid not null references tracked_items (id) on delete cascade,
  scrape_run_id       uuid references scrape_runs (id) on delete set null,
  attempted_at_utc    timestamptz not null default now(),
  attempt_number      integer not null,
  outcome             text not null check (outcome in ('success', 'retried', 'failed')),
  error_code          text,                     -- e.g. NAV_TIMEOUT, HTTP_5XX, VALIDATION_ERROR
  error_message       text,
  raw_price_text      text,
  raw_stock_text      text,
  normalized_price    numeric(12, 2),
  normalized_stock    text,                     -- 'in_stock' | 'out_of_stock' | 'unknown'
  stock_quantity      integer,
  parse_strategy      text,                     -- which selector/fallback strategy matched
  parser_version      text not null default 'v2',
  duration_ms         integer
);

create index if not exists idx_scrape_attempts_item on scrape_attempts (tracked_item_id, attempted_at_utc desc);
create index if not exists idx_scrape_attempts_run on scrape_attempts (scrape_run_id);

-- ---------------------------------------------------------------------------
-- price_history: one row per SUCCESSFUL scrape only
-- ---------------------------------------------------------------------------
create table if not exists price_history (
  id                uuid primary key default gen_random_uuid(),
  tracked_item_id   uuid not null references tracked_items (id) on delete cascade,
  scrape_attempt_id uuid not null references scrape_attempts (id) on delete cascade,
  observed_at_utc   timestamptz not null default now(),
  price             numeric(12, 2) not null,
  stock             text not null,              -- 'in_stock' | 'out_of_stock' | 'unknown'
  stock_quantity    integer
);

create index if not exists idx_price_history_item on price_history (tracked_item_id, observed_at_utc desc);

-- ---------------------------------------------------------------------------
-- system_locks: single-row advisory lock so overlapping cron triggers don't
-- run concurrently (Postgres row-level UPDATE ... WHERE is used as an atomic
-- compare-and-set, which works fine on Supabase without needing a raw
-- pg_advisory_lock RPC).
-- ---------------------------------------------------------------------------
create table if not exists system_locks (
  lock_name   text primary key,
  is_locked   boolean not null default false,
  locked_at   timestamptz,
  run_id      uuid
);

insert into system_locks (lock_name, is_locked)
values ('scheduled_scrape', false)
on conflict (lock_name) do nothing;
