# Quickstart Instructions & Runbook

Step-by-step guide to run, test, and verify the **INE Product Price Tracker** locally.

---

## 📋 Prerequisites
- **Node.js**: v18.0.0 or higher (`node -v`)
- **npm**: v9.0.0 or higher (`npm -v`)
- **Supabase Account**: A free project created on [supabase.com](https://supabase.com)

---

## 1️⃣ Database Setup (Supabase)

1. Open your Supabase Project dashboard.
2. In the left navigation, open the **SQL Editor**.
3. Copy and run the script from [`backend/src/db/schema.sql`](file:///d:/Param/param_programs/ine_assignment/backend/src/db/schema.sql).
4. If prompted with *"This query creates tables without enabling Row Level Security"*, choose **Enable Row Level Security (RLS)**.
5. In **Project Settings → API**, copy:
   - **Project URL**
   - **`service_role` secret key** (needed by the backend to bypass RLS)

---

## 2️⃣ Backend Setup & Boot

Open a terminal and run:

```bash
# 1. Navigate to backend directory
cd backend

# 2. Configure environment file
cp .env.example .env
```

Open `backend/.env` and update the database credentials:
```env
PORT=8080
CORS_ORIGINS=http://localhost:5173
SUPABASE_URL=https://<your-project-id>.supabase.co
SUPABASE_SERVICE_ROLE_KEY=<your-service-role-key>
STORE_BASE_URL=https://demo.inelabteamdev.com
CRON_SECRET=my-cron-secret-token
SCRAPER_HEADLESS=true
```

Install packages and Chromium for Playwright:
```bash
# 3. Install npm dependencies
npm install

# 4. Install Playwright browser binaries
npx playwright install --with-deps chromium

# 5. Start the backend server
npm run dev
```

The backend server will start on: **`http://localhost:8080`**.

---

## 3️⃣ Frontend Setup & Boot

Open a **new terminal window**:

```bash
# 1. Navigate to frontend directory
cd frontend

# 2. Configure environment file
cp .env.example .env
```

Ensure `frontend/.env` contains:
```env
VITE_API_BASE_URL=http://localhost:8080
```

Install packages and start the Vite development server:
```bash
# 3. Install frontend dependencies
npm install

# 4. Start the frontend
npm run dev
```

Open **`http://localhost:5173`** in your browser.

---

## 4️⃣ Verification & Testing

Once both services are running, verify each feature:

### 1. Health & DB Check
In PowerShell or browser:
```powershell
curl.exe http://localhost:8080/api/health
```
Expected output:
```json
{ "status": "ok", "database": "connected" }
```

### 2. High-Speed Product Search (< 100ms)
```powershell
curl.exe "http://localhost:8080/api/products/search?q=phone"
```
Returns matching products instantly from the pre-indexed database.

### 3. Track a Product via Dashboard
1. Go to `http://localhost:5173`.
2. Type a product name in the search box (e.g. `Headphones` or `Watch`).
3. Select an available variant (e.g., storage size, color, or kit).
4. Click **Track Product**.
5. The item will appear in your tracking dashboard.

### 4. Trigger an Immediate Scrape
- Click the **Scrape Now** button next to any tracked item in the dashboard.
- The scraper runs in the background, updates the latest price/stock, and logs the attempt.

### 5. Export Full Scrape History
- Click **Export CSV** in the top navigation of the dashboard, or call:
```powershell
curl.exe -o scrape_history.csv http://localhost:8080/api/export/csv
```
This saves an RFC-4180 compliant CSV containing all historical scrape attempts (`success`, `retried`, `failed`).

---

## 5️⃣ Useful CLI Commands

Run these from the `backend/` folder:

| Task | Command | Description |
|---|---|---|
| **Sync Full Catalog** | `npm run catalog:sync` | Scrapes all 48 store pages and populates Supabase |
| **Run Scheduled Scrape** | `npm run scrape:once` | Triggers one complete scrape cycle for all active items |
| **Headed Browser Demo** | `npm run scrape:headed` | Opens a visible Chromium window demonstrating dynamic button clicks and variant parsing |

---

## 6️⃣ Production Deployment Checklist

1. **Supabase**: Run [`backend/src/db/schema.sql`](file:///d:/Param/param_programs/ine_assignment/backend/src/db/schema.sql) with RLS enabled.
2. **Render (Backend)**:
   - Root directory: `backend`
   - Build command: `npm install && npx playwright install --with-deps chromium`
   - Start command: `npm start`
   - Set environment variables (`SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `CRON_SECRET`, `CORS_ORIGINS`).
3. **Vercel (Frontend)**:
   - Root directory: `frontend`
   - Environment variable: `VITE_API_BASE_URL` set to your Render backend URL.
4. **cron-job.org (Scheduler)**:
   - Target URL: `https://<your-render-url>/api/scrape/run`
   - Method: `POST`
   - Schedule: Every 2 hours (`0 */2 * * *`)
   - Header: `x-cron-secret: <CRON_SECRET>`