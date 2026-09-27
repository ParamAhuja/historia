# INE Product Price Tracker

A full-stack app that lets you search INE's mock storefront, pick a product +
option to track, and scrapes its price/stock every 2 hours - reliably,
with retries, honest failure logging, and a CSV export of the full scrape
history.

- **Frontend:** React + Vite → deploy on Vercel
- **Backend:** Node.js + Express + Playwright → deploy on Render
- **Database:** Supabase (PostgreSQL)
- **Scheduling:** an external cron service (cron-job.org) hits a secured
  backend endpoint every 2 hours, since free Render instances sleep.

> **Read this before your first run:** the target store
> (`https://demo.inelabteamdev.com`) renders its product data client-side -
> fetching the raw HTML returns almost nothing but the page shell. The
> selectors in `backend/src/scraper/config.js` are structured, documented
> fallback chains but are **best-guess defaults**, not confirmed against the
> live rendered DOM. Open the store in a real browser, inspect the search
> box, a product card, the price element, the stock label, and the
> option/variant picker, and update `SELECTORS` in that file to match before
> relying on scrape results. Everything else (retry/backoff, locking,
> validation, logging, CSV export) works independently of the exact
> selectors.

---

## 1. Repository layout

```
product-price-tracker/
├── backend/                  Express API + Playwright scraper
│   ├── src/
│   │   ├── config/           env loading, Supabase client
│   │   ├── db/schema.sql     Postgres schema (run this first)
│   │   ├── scraper/          selectors, browser mgmt, retry engine, parsing
│   │   ├── services/         DB read/write helpers used by routes + scraper
│   │   ├── routes/           Express route handlers
│   │   ├── middleware/       auth (cron secret), error handling
│   │   └── utils/            logger, backoff, locks, concurrency
│   └── scripts/headedRun.js  headed-mode demo script (for the recording)
├── frontend/                 React + Vite dashboard
│   └── src/
│       ├── api/client.js     fetch wrapper
│       ├── components/       search, list, chart, log table, export button
│       └── pages/Dashboard.jsx
└── infra/cron-job-setup.md   step-by-step cron-job.org configuration
```

## 2. Database setup (Supabase)

1. Create a new Supabase project.
2. Open the SQL editor and run the contents of `backend/src/db/schema.sql`.
3. From **Project Settings → API**, copy the **Project URL** and the
   **service_role key** (not the anon key - the backend needs elevated
   access to write scrape logs).

## 3. Backend setup

```bash
cd backend
cp .env.example .env      # fill in SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, CRON_SECRET
npm install
npx playwright install --with-deps chromium   # downloads the browser binary
npm run dev                                    # http://localhost:8080
```

Environment variables (see `.env.example` for the full list with defaults):

| Variable | Purpose |
|---|---|
| `PORT` | Port the API listens on (Render sets this automatically in production) |
| `CORS_ORIGINS` | Comma-separated list of allowed frontend origins |
| `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` | Supabase project credentials (server-side only) |
| `STORE_BASE_URL` | The mock store's base URL |
| `CRON_SECRET` | Shared secret cron-job.org sends as `x-cron-secret` to trigger scrapes |
| `SCRAPER_HEADLESS` | `true` in production; the headed script always forces a visible browser regardless |
| `SCRAPER_MAX_ATTEMPTS`, `SCRAPER_BACKOFF_BASE_MS`, `SCRAPER_BACKOFF_MAX_MS` | Retry/backoff tuning |
| `SCRAPER_NAV_TIMEOUT_MS`, `SCRAPER_CONTENT_WAIT_MS` | Timeouts for navigation and for waiting out async-loaded content |
| `SCRAPER_CONCURRENCY` | How many tracked items scrape in parallel during a run |
| `SCRAPER_LOCK_STALE_MINUTES` | How long before an abandoned lock (e.g. a crashed process) is auto-released |

### Useful scripts

```bash
npm run dev            # local dev server, auto-restart on change
npm run scrape:once    # manually trigger one full scheduled-style run
npm run scrape:headed  # visible-browser run for the required screen recording
```

## 4. Frontend setup

```bash
cd frontend
cp .env.example .env   # set VITE_API_BASE_URL to your backend URL
npm install
npm run dev             # http://localhost:5173
```

## 5. Scraping schedule

The backend does **not** run its own timer/loop (free-tier Render instances
sleep when idle, so a `setInterval` would simply stop firing). Instead:

1. `POST /api/scrape/run` (header `x-cron-secret: <CRON_SECRET>`) triggers one
   full scrape of every active, due tracked item.
2. An external cron service (cron-job.org) is configured to call that
   endpoint **every 2 hours** - see `infra/cron-job-setup.md` for exact
   setup steps, including how the request also serves as the "wake up the
   sleeping instance" ping.
3. The endpoint responds `202 Accepted` immediately and keeps scraping in
   the background, since a full run (several products, each with retries)
   can take longer than a typical cron/HTTP client timeout. Progress and the
   final result are recorded in `scrape_runs` / `scrape_attempts`, which the
   dashboard reads - nothing depends on the HTTP response itself.

Each tracked item also stores its own `scrape_interval_minutes` (default
120); a run only scrapes items that are actually due, so triggering the
endpoint more often than every 2 hours is harmless.

## 6. Deployment

- **Render (backend):** New Web Service → point at `backend/`. Build command
  `npm install && npx playwright install --with-deps chromium`. Start command
  `npm start`. Add all backend env vars from the table above.
- **Vercel (frontend):** New Project → point at `frontend/`. Framework preset
  "Vite". Add `VITE_API_BASE_URL` pointing at the Render backend URL.
- **Supabase:** already hosted once the project is created; no further
  deployment needed.
- **cron-job.org:** see `infra/cron-job-setup.md`.

After deploying, add at least 2-3 real tracked products through the live
dashboard and let a few scheduled cycles run before submission, so the
history and scrape log reflect genuine unattended runs rather than seed data.

## 7. API reference (backend)

| Method & path | Purpose |
|---|---|
| `GET /api/health` | Liveness check |
| `GET /api/products/search?q=` | Live-scrapes the store's listing for matching products |
| `GET /api/products/options?url=` | Live-scrapes a product page for its available options |
| `GET /api/tracked-items` | List tracked items with their latest price/stock |
| `POST /api/tracked-items` | Start tracking a (product, option) pair |
| `PATCH /api/tracked-items/:id` | Update `isActive` / `intervalMinutes` |
| `DELETE /api/tracked-items/:id` | Stop tracking |
| `POST /api/tracked-items/:id/scrape-now` | Manually trigger one scrape of a single item |
| `GET /api/tracked-items/:id/history` | Successful price/stock readings over time |
| `GET /api/tracked-items/:id/logs` | Every scrape attempt (success/retried/failed) |
| `GET /api/export/csv` | Downloads the full scrape history as CSV |
| `POST /api/scrape/run` (auth) | Triggers a full scheduled-style run - called by cron-job.org |

## 8. Known limitations

- Selectors in `scraper/config.js` need tuning against the live rendered DOM
  (see the callout at the top of this file).
- The CSV export and scrape log both read from `scrape_attempts`, so a
  product removed from tracking still keeps its historical rows (by design -
  the assignment asks for honest history, not a moving target).
- Bounded concurrency (`SCRAPER_CONCURRENCY`, default 3) is a fixed number
  rather than adaptive; under heavier load you may want to lower it to
  reduce load on both the free Render instance and the mock store.
