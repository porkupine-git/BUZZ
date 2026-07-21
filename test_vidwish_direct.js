const axios = require('axios');

(async () => {
  try {
    const page = await axios.get('https://vidwish.live/stream/s-2/107257/sub', {
      headers: {
        'Referer': 'https://hianimes.re/',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'
      }
    });
    console.log("Status:", page.status);
    console.log(page.data.substring(0, 1000));
  } catch(e) {
    console.error("Error:", e.message);
  }
})();
