const { createLogger } = require('../utils/logger');

const log = createLogger('dom');

/**
 * Tries each selector in `selectors` (in order) against `scope` (a Page or
 * Locator). Returns the first one with at least one visible match, along
 * with which selector string matched — this is stored as `parse_strategy` so
 * the scrape log shows exactly which fallback level is being used in
 * production, making it obvious the moment the site's markup changes.
 */
async function firstMatch(scope, selectors, { timeoutMs = 2000 } = {}) {
  for (const selector of selectors) {
    try {
      const locator = scope.locator(selector).first();
      await locator.waitFor({ state: 'attached', timeout: timeoutMs });
      const visible = await locator.isVisible().catch(() => false);
      if (visible || (await locator.count()) > 0) {
        return { locator, matchedSelector: selector };
      }
    } catch {
      // this selector didn't match in time — try the next fallback
    }
  }
  return null;
}

async function firstMatchAll(scope, selectors, { timeoutMs = 2000 } = {}) {
  for (const selector of selectors) {
    try {
      const locator = scope.locator(selector);
      await locator.first().waitFor({ state: 'attached', timeout: timeoutMs });
      const count = await locator.count();
      if (count > 0) {
        return { locator, matchedSelector: selector, count };
      }
    } catch {
      // try next
    }
  }
  return null;
}

async function textOf(locator) {
  try {
    const text = await locator.innerText();
    return (text || '').trim();
  } catch {
    return '';
  }
}

module.exports = { firstMatch, firstMatchAll, textOf };
