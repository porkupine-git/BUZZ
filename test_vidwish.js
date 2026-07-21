const scraper = require('./scraper.js');

(async () => {
  try {
    const watchData = await scraper.getWatch("154587", "sub", "1");
    console.log(JSON.stringify(watchData, null, 2));
  } catch(e) {
    console.error(e);
  }
})();
