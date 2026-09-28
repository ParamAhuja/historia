# INE Product Price Tracker (Web Scraping & Monitoring Platform)

A full-stack, production-grade price and stock tracking application built for the **INE Software Engineer Intern Assignment**.

This platform enables users to search for products from INE's hosted mock store, select specific product options/variants (e.g. storage sizes, kit variants), and automatically monitor prices and stock levels over time via an unattended, fault-tolerant scraping engine running on a 2-hour schedule.

---

## 📌 Table of Contents
1. [Key Architecture & Solutions](#-key-architecture--solutions)
   - [Handling 48 Pages & 960 Products](#1-handling-48-pages--960-products)
   - [High-Speed Search (< 100ms)](#2-high-speed-search--100ms)
   - [Product Jumbling & Shuffling Resistance](#3-product-jumbling--shuffling-resistance)
   - [Dynamic Mock Price Button Interaction](#4-dynamic-mock-price-button-interaction)
   - [Fault Tolerance & Store Outage Resilience](#5-fault-tolerance--store-outage-resilience)
   - [2-Hour Unattended Scheduling (Render Sleep-Safe)](#6-2-hour-unattended-scheduling-render-sleep-safe)
2. [Tech Stack](#-tech-stack)
3. [System Architecture](#-system-architecture)
4. [Database Schema & Row Level Security (RLS)](#-database-schema--row-level-security-rls)
5. [API Reference](#-api-reference)
6. [Local Setup Guide](#-local-setup-guide)
7. [Deployment Guide](#-deployment-guide)
8. [CSV Export Specification](#-csv-export-specification)
9. [CLI Scripts & Headed Mode Recording](#-cli-scripts--headed-mode-recording)

---

## 💡 Key Architecture & Solutions

The INE mock storefront (`https://demo.inelabteamdev.com`) presents deliberate real-world web scraping hurdles. Here is how each core challenge is solved:

### 1. Handling 48 Pages & 960 Products
* **Challenge:** The storefront spreads ~960 products across 48 paginated pages (`/?page=1` through `/?page=48`), with 20 items per page.
* **Solution:** We implemented a high-performance **Hybrid Catalog Sync** (`httpCatalogScraper.js`):
  - Fetches pages concurrently in bounded batches using lightweight HTTP requests and Cheerio HTML parsing.
  - Syncs the entire 48-page catalog in **~30 seconds** (compared to 5+ minutes with full headless browser navigation).
  - Automatically falls back to Playwright if JavaScript rendering is strictly required.

### 2. High-Speed Search (< 100ms)
* **Challenge:** Live browser scraping for user searches resulted in 1-2 minute response times or browser timeout crashes.
* **Solution:** 
  - Products are pre-synced and cached into PostgreSQL (`products` table).
  - We enabled the PostgreSQL `pg_trgm` extension and created a **GIN Trigram Index** (`gin (name gin_trgm_ops)`).
  - Search queries execute via indexed ILIKE matching (`/api/products/search?q=phone`), returning instant results in **< 50ms**.
  - A background warmup process ensures the catalog stays fresh without blocking user requests.

### 3. Product Jumbling & Shuffling Resistance
* **Challenge:** On each page refresh, the mock store randomizes product order across cards and pages.
* **Solution:**
  - The app never relies on DOM position or page order.
  - Every product is keyed by its canonical store identifier (`store_product_id` parsed from SKU or URL, e.g. `/item/2104`).
  - Catalog updates use PostgreSQL upserts (`ON CONFLICT (store_product_id) DO UPDATE`), making catalog jumbling completely harmless.

### 4. Dynamic Mock Price Button Interaction
* **Challenge:** On the product detail page, price data loads dynamically upon clicking the `"Check today's price"` button, which updates asynchronously to `"Check again"` and presents a randomized price.
* **Solution:**
  - Automated with Playwright (`productPageScraper.js`):
    1. Navigates to the product page and selects the user's targeted option/variant.
    2. Locates and clicks the dynamic action button (`button:has-text("Check today's price")` or `button:has-text("Check again")`).
    3. Waits for DOM mutation and network idle states to settle.
    4. Parses and sanitizes the updated price number and stock availability string.

### 5. Fault Tolerance & Store Outage Resilience
* **Challenge:** The mock store experiences slow responses, intermittent 5xx errors, delayed element hydration, and complete DNS downtime (such as `NXDOMAIN` outages).
* **Solution:**
  - **Structured Exponential Backoff:** Retries transient failures with randomized jitter (`SCRAPER_BACKOFF_BASE_MS` to `SCRAPER_BACKOFF_MAX_MS`).
  - **Per-Item Distributed Locking:** Uses an atomic database lease lock (`is_locked`, `locked_at`) with TTL expiration to prevent overlapping cron runs or duplicate manual scrapes.
  - **Honest Scrape Audit Logging:** Every single scrape attempt is logged in `scrape_attempts` with its exact outcome (`success`, `retried`, `failed`), HTTP status code, duration, and error message.
  - **DNS / Network Outage Isolation:** If the store's domain cannot be reached, the server logs the error cleanly, records the failed attempt in the database, and continues serving the frontend and historical charts without crashing.

### 6. 2-Hour Unattended Scheduling (Render Sleep-Safe)
* **Challenge:** Free-tier cloud backend instances (e.g. Render) spin down during periods of inactivity, causing in-memory `setInterval` or `node-cron` timers to freeze.
* **Solution:**
  - The backend exposes a secured batch trigger endpoint: `POST /api/scrape/run`, protected by a shared header secret (`x-cron-secret`).
  - An external cron service ([cron-job.org](https://cron-job.org)) calls this endpoint **every 2 hours**.
  - The request automatically wakes up the sleeping Render instance.
  - The endpoint responds immediately with `202 Accepted` to satisfy HTTP client timeouts and runs the scrape pipeline asynchronously in the background.

---

## 🛠 Tech Stack

| Layer | Technology | Purpose |
|---|---|---|
| **Frontend** | React 18, Vite | High-performance dashboard SPA |
| **Styling & Icons** | Vanilla CSS / CSS Modules, Lucide React | Clean, responsive UI with smooth interactions |
| **Data Visualization**| Recharts | Interactive price trend and stock history charts |
| **Backend API** | Node.js, Express | RESTful API server with structured logging & validation |
| **Scraping Engine** | Playwright (Chromium) | Dynamic JavaScript interaction & variant extraction |
| **Fast Ingestion** | Cheerio, Axios | Ultra-fast HTTP catalog synchronization |
| **Database** | Supabase (PostgreSQL 15) | Relational storage with `pg_trgm`, `pgcrypto`, and RLS |
| **Scheduling** | cron-job.org | Unattended 2-hour cron trigger |
| **Hosting** | Vercel (Frontend), Render (Backend) | Production cloud deployment |

---

## 🏗 System Architecture

```mermaid
flowchart TD
    User([User Browser]) -->|HTTPS| Frontend[React + Vite Frontend (Vercel)]
    Cron[External Cron: cron-job.org\nEvery 2 Hours] -->|POST /api/scrape/run\nx-cron-secret| Backend

    Frontend -->|REST API Requests| Backend[Express.js Backend (Render)]

    subgraph Backend Engine
        API[Express Route Handlers]
        CatalogService[Catalog Sync Service]
        Scraper[Playwright Scraper Engine]
        Logger[Structured Logger & Error Classifier]
    end

    Backend --> Supabase[(Supabase PostgreSQL)]
    Scraper -->|Scrapes Price & Options| MockStore[INE Mock Store\ndemo.inelabteamdev.com]
    CatalogService -->|Fast 48-Page Ingestion| MockStore

    subgraph Database Tables
        T1[(products\nTrigram GIN Index)]
        T2[(tracked_items\nLease Locking)]
        T3[(scrape_runs\nBatch Records)]
        T4[(scrape_attempts\nAudit Log & History)]
    end

    Supabase --- T1 & T2 & T3 & T4
```

---

## 🗄 Database Schema & Row Level Security (RLS)

All database tables are initialized via [`backend/src/db/schema.sql`](file:///d:/Param/param_programs/ine_assignment/backend/src/db/schema.sql).

### Tables Overview
1. **`products`**: Stores normalized products discovered across all 48 store pages.
   - `id` (UUID), `store_product_id` (Unique Text), `name`, `product_url`, `metadata_json`, `created_at`, `updated_at`.
   - **GIN Trigram Index:** `idx_products_name_trgm` provides instant fuzzy and substring search.
2. **`tracked_items`**: User-selected items and variant combinations being monitored.
   - `id` (UUID), `product_id` (FK), `selected_option_label`, `selected_option_key`, `is_active`, `scrape_interval_minutes` (default 120), `is_locked`, `locked_at`.
3. **`scrape_runs`**: Records each scheduled or manual batch execution.
   - `id` (UUID), `triggered_at`, `finished_at`, `run_status`, `total_items`, `successful_items`, `failed_items`.
4. **`scrape_attempts`**: Granular per-attempt audit log.
   - `id` (UUID), `tracked_item_id` (FK), `scrape_run_id` (FK), `attempt_number`, `outcome` (`success` | `retried` | `failed`), `price`, `stock_status`, `error_message`, `duration_ms`, `created_at`.

### Row Level Security (RLS)
- **Enabled on all tables:** Ensures that public clients using the Supabase `anon` key cannot read or tamper with internal tracker tables.
- **Backend Access:** The backend connects using the elevated `SUPABASE_SERVICE_ROLE_KEY`, which automatically bypasses RLS safely on the server side.

---

## 🔌 API Reference

### Health & System
| Method | Path | Description |
|---|---|---|
| `GET` | `/api/health` | Service health check, database connectivity, and catalog status |

### Catalog & Search
| Method | Path | Description |
|---|---|---|
| `GET` | `/api/products/search?q=:query` | Fast (<100ms) database trigram search on product names |
| `GET` | `/api/products/options?url=:itemUrl` | Extracts available options/variants for a product |
| `POST` | `/api/products/sync-catalog` | Manually triggers background sync for all 48 pages |

### Tracked Items & Monitoring
| Method | Path | Description |
|---|---|---|
| `GET` | `/api/tracked-items` | Lists all tracked items with latest price, stock, and status |
| `POST` | `/api/tracked-items` | Adds a new product + variant to track |
| `PATCH` | `/api/tracked-items/:id` | Updates item tracking state (`isActive`, `intervalMinutes`) |
| `DELETE` | `/api/tracked-items/:id` | Stops tracking an item |
| `POST` | `/api/tracked-items/:id/scrape-now` | Triggers an immediate scrape for a specific tracked item |
| `GET` | `/api/tracked-items/:id/history` | Fetches successful price and stock history for charts |
| `GET` | `/api/tracked-items/:id/logs` | Fetches full attempt audit log (`success`, `retried`, `failed`) |

### Export & Scheduling
| Method | Path | Description |
|---|---|---|
| `GET` | `/api/export/csv` | Downloads complete scrape history as an RFC-4180 CSV file |
| `POST` | `/api/scrape/run` | Triggers a full scheduled batch scrape (requires `x-cron-secret` header) |

---

## 💻 Local Setup Guide

### Prerequisites
- **Node.js** >= 18.0.0
- **npm** >= 9.0.0
- A free **Supabase** account ([supabase.com](https://supabase.com))

### Step 1: Database Setup
1. Create a new project in the Supabase dashboard.
2. Navigate to the **SQL Editor**.
3. Paste and run the entire contents of [`backend/src/db/schema.sql`](file:///d:/Param/param_programs/ine_assignment/backend/src/db/schema.sql).
4. When Supabase prompts about Row Level Security (RLS), **Enable RLS**.
5. Go to **Project Settings → API** and copy:
   - **Project URL**
   - **`service_role` Secret Key** (used by backend server)

### Step 2: Backend Setup
```bash
cd backend

# Create environment configuration
cp .env.example .env
```

Edit `backend/.env` with your values:
```env
PORT=8080
CORS_ORIGINS=http://localhost:5173
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key-here
STORE_BASE_URL=https://demo.inelabteamdev.com
CRON_SECRET=your-chosen-secret-token
SCRAPER_HEADLESS=true
```

Install dependencies and Playwright browser binaries:
```bash
npm install
npx playwright install --with-deps chromium
```

Start the backend:
```bash
npm run dev
```
The backend will boot on `http://localhost:8080`.

### Step 3: Frontend Setup
In a new terminal:
```bash
cd frontend

# Create environment configuration
cp .env.example .env
```

Ensure `frontend/.env` points to your backend:
```env
VITE_API_BASE_URL=http://localhost:8080
```

Install dependencies and start the Vite dev server:
```bash
npm install
npm run dev
```
Open **`http://localhost:5173`** in your browser.

---

## ☁ Deployment Guide

### 1. Backend on Render
1. Create a new **Web Service** on [Render](https://render.com) connected to your GitHub repository.
2. Configure settings:
   - **Root Directory:** `backend`
   - **Environment:** `Node`
   - **Build Command:** `npm install && npx playwright install --with-deps chromium`
   - **Start Command:** `npm start`
3. Add Environment Variables in the Render dashboard:
   - `SUPABASE_URL`
   - `SUPABASE_SERVICE_ROLE_KEY`
   - `CRON_SECRET`
   - `CORS_ORIGINS` (set to your Vercel frontend URL, e.g. `https://your-app.vercel.app`)
   - `STORE_BASE_URL` (`https://demo.inelabteamdev.com`)
   - `SCRAPER_HEADLESS` (`true`)

### 2. Frontend on Vercel
1. Import your GitHub repository into [Vercel](https://vercel.com).
2. Configure settings:
   - **Root Directory:** `frontend`
   - **Framework Preset:** `Vite`
3. Add Environment Variable:
   - `VITE_API_BASE_URL`: Your Render backend URL (e.g. `https://your-backend.onrender.com`)
4. Click **Deploy**.

### 3. Unattended 2-Hour Scheduling via cron-job.org
To satisfy the requirement that the scraper runs unattended every 2 hours without relying on sleeping backend processes:
1. Create a free account at [cron-job.org](https://cron-job.org).
2. Click **Create Cronjob**.
3. Fill in the job details:
   - **Title:** `INE Price Tracker 2-Hour Run`
   - **URL:** `https://your-backend.onrender.com/api/scrape/run`
   - **Request Method:** `POST`
   - **Schedule:** Every 2 hours (`0 */2 * * *`)
4. Under **Advanced Settings → Headers**, add:
   - `x-cron-secret: <YOUR_CRON_SECRET>`
5. Under **Request Timeout**, set **60 seconds** (giving Render instances time to wake from cold sleep).
6. Save and click **Execute Now** to verify you receive a `202 Accepted` response.

---

## 📊 CSV Export Specification

Clicking the **Export CSV** button in the dashboard (or calling `GET /api/export/csv`) downloads the complete scrape history formatted according to the assignment requirements:

```csv
store_product_id,product_name,selected_option,scraped_at,price,stock,outcome
2104,"Wireless Noise-Canceling Headphones","128GB Black",2026-09-28T08:00:00.000Z,249.99,"In Stock",success
2104,"Wireless Noise-Canceling Headphones","128GB Black",2026-09-28T10:00:00.000Z,259.99,"In Stock",success
1042,"Smart Fitness Tracker","Standard Kit",2026-09-28T12:00:00.000Z,,,failed
```

- **One row per attempt:** Includes all outcomes (`success`, `retried`, `failed`).
- **Failed rows:** Transparently leave `price` and `stock` blank while preserving timestamp and product context.
- **Timestamps:** Standard ISO-8601 in UTC format.

---

## 🎬 CLI Scripts & Headed Mode Recording

The backend includes purpose-built CLI scripts:

### 1. Manual Full Catalog Sync
Syncs all 48 catalog pages into Supabase:
```bash
npm run catalog:sync
```

### 2. Manual Scrape Cycle
Executes a single scheduled-style scrape across all due tracked items:
```bash
npm run scrape:once
```

### 3. Headed Browser Mode (For Video Recording)
Launches a visible Chromium window demonstrating the scraper interacting with the mock storefront, selecting variants, clicking the dynamic price button, and extracting values:
```bash
npm run scrape:headed
```

---

## 🛡 License
MIT License. Built for the INE Software Engineering Intern Assessment.
