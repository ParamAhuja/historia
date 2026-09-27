# Setting up the 2-hour scheduled trigger (cron-job.org)

The backend has no internal timer - Render's free tier puts idle instances to
sleep, so anything running inside the Node process itself would simply stop
firing. Instead, an external cron service calls a secured endpoint, which
both wakes the instance and starts a scrape run.

## Steps

1. Create a free account at https://cron-job.org.
2. Click **Create cronjob**.
3. **Title:** `INE price tracker - scheduled scrape`
4. **URL:** `https://<your-render-service>.onrender.com/api/scrape/run`
5. **Request method:** `POST`
6. **Schedule:** every 2 hours (`0 */2 * * *`, or use the UI's "every 2
   hours" preset).
7. Under **Advanced → Headers**, add:
   - `x-cron-secret: <the same value as CRON_SECRET in your backend .env>`
8. Under **Advanced → Request timeout**, set a generous value (e.g. 60-90
   seconds) - the endpoint responds `202 Accepted` almost immediately, but a
   cold Render instance can take 20-50 seconds just to wake up before it can
   even send that response.
9. Enable **"Notify me by email if execution fails"** so a genuinely broken
   endpoint (not just a slow one) gets noticed quickly.
10. Save, then click **Execute now** once to confirm you get a `202` back
    and that a new row appears in the `scrape_runs` table in Supabase shortly
    after.

## Why 202-and-forget instead of waiting for the full run

Scraping several tracked items - each with up to `SCRAPER_MAX_ATTEMPTS`
retries and an explicit wait for slow-loading content - can take well over a
minute in total. Most cron/HTTP clients (including cron-job.org's default
timeout) aren't built to hang open that long. `POST /api/scrape/run` returns
`202 Accepted` immediately and continues the actual scraping in the
background on the same (now-awake) Node process; the real result lands in
`scrape_runs` and `scrape_attempts` regardless of whether the HTTP client
stuck around to see it.

## Verifying it's actually running unattended

- Check the **Execution history** tab on cron-job.org for a `202` every 2
  hours.
- Check the `scrape_runs` table in Supabase for a new row on the same
  cadence, with `run_status` moving from `running` to `completed` (or
  `completed_with_errors`, which is expected occasionally and is exactly
  what the assignment wants to see handled gracefully).
- The dashboard's per-product scrape log is reading from the same data, so
  the easiest sanity check is simply watching the live site.
