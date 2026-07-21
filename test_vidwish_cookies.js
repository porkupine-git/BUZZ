const axios = require('axios');
const scraper = require('./scraper.js');

(async () => {
  try {
    const VIDWISH = "https://vidwish.live";
    const realId = "107257"; // from test_vidwish_direct.js
    const audio = "sub";
    
    console.log("Fetching stream page...");
    const pageResp = await axios.get(`${VIDWISH}/stream/s-2/${realId}/${audio}`, {
      headers: { 'Referer': 'https://hianimes.re/', 'User-Agent': 'Mozilla/5.0' }
    });
    
    const cookies = pageResp.headers['set-cookie'] || [];
    console.log("Cookies:", cookies);
    
    const m = pageResp.data.match(/data-id="([^"]*)"/);
    const fileId = m[1];
    
    console.log("Fetching sources...");
    const srcResp = await axios.get(`${VIDWISH}/stream/getSources?id=${fileId}&id=${fileId}`, {
      headers: {
        'Referer': `${VIDWISH}/`,
        'X-Requested-With': 'XMLHttpRequest',
        'User-Agent': 'Mozilla/5.0',
        'Cookie': cookies.map(c => c.split(';')[0]).join('; ')
      }
    });
    
    console.log("Sources cookies:", srcResp.headers['set-cookie'] || "none");
    const streamUrl = srcResp.data.sources.file;
    console.log("Stream URL:", streamUrl);
    
    console.log("Fetching stream m3u8...");
    const m3u8Resp = await axios.get(streamUrl, {
      headers: {
        'Referer': `${VIDWISH}/`,
        'Origin': VIDWISH,
        'User-Agent': 'Mozilla/5.0',
        'Cookie': cookies.map(c => c.split(';')[0]).join('; ')
      }
    });
    console.log("Status:", m3u8Resp.status);
    console.log(m3u8Resp.data.substring(0,100));
  } catch(e) {
    console.error("Error:", e.response ? e.response.status : e.message);
  }
})();
