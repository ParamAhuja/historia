const { chromium } = require('playwright');
const { TIMING } = require('./config');
const { createLogger } = require('../utils/logger');

const log = createLogger('browser-manager');

/**
 * Wraps Playwright launch/close so a single shared browser can be reused
 * across many tracked items in one scheduled run (launching a fresh browser
 * per item is slow and wastes the limited time we have before a free-tier
 * request/cron timeout). If the shared browser itself crashes mid-run,
 * `ensureBrowser` transparently relaunches it rather than taking down the
 * whole batch — one crashed browser should not silently stop the other items.
 */
class BrowserManager {
  constructor({ headed = false } = {}) {
    this.headed = headed;
    this.browser = null;
    this.launchCount = 0;
  }

  async ensureBrowser() {
    if (this.browser && this.browser.isConnected()) return this.browser;

    this.launchCount += 1;
    const isRelaunch = this.launchCount > 1;

    log.info('browser_launch', {
      headed: this.headed,
      launchCount: this.launchCount,
      isRelaunch,
    });

    this.browser = await chromium.launch({
      headless: this.headed ? false : TIMING.headless,
      // slowMo helps a human watch the headed run without needing to squint
      slowMo: this.headed ? 150 : 0,
      args: [
        '--disable-dev-shm-usage',     // Prevents crashes in Docker/limited-memory envs
        '--no-sandbox',                  // Required on some CI/hosting platforms
        '--disable-gpu',                 // Not needed for scraping
      ],
    });

    this.browser.on('disconnected', () => {
      log.warn('browser_disconnected', {
        launchCount: this.launchCount,
        note: 'Will relaunch on next page request',
      });
      this.browser = null;
    });

    return this.browser;
  }

  async newPage() {
    const browser = await this.ensureBrowser();
    const context = await browser.newContext({
      viewport: { width: 1366, height: 900 },
      userAgent:
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) ' +
        'Chrome/126.0.0.0 Safari/537.36 PriceTrackerBot/2.0',
    });
    const page = await context.newPage();
    page.setDefaultTimeout(TIMING.navTimeoutMs);
    page.setDefaultNavigationTimeout(TIMING.navTimeoutMs);
    return { context, page };
  }

  async close() {
    if (this.browser) {
      try {
        await this.browser.close();
        log.info('browser_closed', { launchCount: this.launchCount });
      } catch (err) {
        log.warn('browser_close_error', { error: err });
      }
      this.browser = null;
    }
  }
}

module.exports = { BrowserManager };
