const { runScheduledScrape } = require('../src/scraper/scraperEngine');

async function main() {
  try {
    const result = await runScheduledScrape({ trigger: 'headed', headed: true });
    console.log(JSON.stringify(result, null, 2));
    process.exit(0);
  } catch (error) {
    console.error(error);
    process.exit(1);
  }
}

main();