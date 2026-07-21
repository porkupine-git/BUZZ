const axios = require('axios');
const scraper = require('./scraper.js');

(async () => {
  try {
    const watchData = await scraper.getWatch("154587", "sub", "1");
    const megaStream = watchData.ssub.streams.find(s => s.server === "Megaplay" && s.type === "hls");
    console.log("Megaplay stream:", megaStream.url);

    const res = await axios.get(megaStream.url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        'Referer': 'https://megaplay.buzz/',
        'Origin': 'https://megaplay.buzz'
      }
    });
    console.log("Status:", res.status);
    console.log(res.data.substring(0, 100));
  } catch(e) {
    console.error("Error:", e.response ? e.response.status : e.message);
  }
})();
