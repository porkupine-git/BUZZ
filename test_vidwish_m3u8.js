const axios = require('axios');

(async () => {
  try {
    const res = await axios.get('https://fxpy7.watching.onl/anime/bb6d2babd7797d94d8f4a8600bc9b44e/b7d51fb7e838ee9b60dcdb34b953bc07/master.m3u8', {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        'Referer': 'https://vidwish.live/',
        'Origin': 'https://vidwish.live',
        'Accept': '*/*',
        'Accept-Language': 'en-US,en;q=0.9',
        'Sec-Fetch-Dest': 'empty',
        'Sec-Fetch-Mode': 'cors',
        'Sec-Fetch-Site': 'cross-site'
      }
    });
    console.log("Status:", res.status);
    console.log(res.data.substring(0, 100));
  } catch (e) {
    console.error("Error:", e.response ? e.response.status : e.message);
  }
})();
