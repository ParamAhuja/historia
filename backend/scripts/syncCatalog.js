const { syncCatalogFromStore } = require('../src/services/catalogService');
const { createLogger } = require('../src/utils/logger');

const log = createLogger('script/sync-catalog');

async function main() {
  try {
    log.info('manual_catalog_sync_starting');
    const result = await syncCatalogFromStore({ headed: false });
    log.info('manual_catalog_sync_completed', result);
    console.log(JSON.stringify(result, null, 2));
    process.exit(0);
  } catch (error) {
    log.error('manual_catalog_sync_failed', { error: error });
    console.error(error);
    process.exit(1);
  }
}

main();