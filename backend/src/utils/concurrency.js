/**
 * Runs `worker(item)` for every item in `items`, at most `limit` at a time.
 * A slow item can't starve the rest of the batch, and one item throwing
 * doesn't stop the others (errors are caught by the caller's worker).
 */
async function mapWithConcurrency(items, limit, worker) {
  const results = new Array(items.length);
  let nextIndex = 0;

  async function runNext() {
    const current = nextIndex;
    nextIndex += 1;
    if (current >= items.length) return;
    results[current] = await worker(items[current], current);
    await runNext();
  }

  const workers = Array.from({ length: Math.min(limit, items.length) }, () => runNext());
  await Promise.all(workers);
  return results;
}

module.exports = { mapWithConcurrency };
