const scraper = require('./scraper');

async function test() {
  try {
    const res = await scraper.getWatch(195600, 'sub', 1);
    console.log("Provider:", res.ssub.provider);
    res.ssub.streams.forEach(s => console.log(s.server, s.type, s.url.substring(0, 50)));
  } catch (e) {
    console.error("Error:", e.message);
  }
}
test();
