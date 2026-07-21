const axios = require('axios');

(async () => {
  try {
    const res = await axios.get('http://localhost:7860/api/proxy', {
      params: {
        url: 'https://fxpy7.watching.onl/anime/bb6d2babd7797d94d8f4a8600bc9b44e/b7d51fb7e838ee9b60dcdb34b953bc07/master.m3u8',
        referer: 'https://hianimes.re/'
      }
    });
    console.log("Status:", res.status);
    console.log("Headers:", res.headers);
    console.log("Body length:", res.data.length);
    console.log(res.data.substring(0, 100));
  } catch (e) {
    console.error("Error:", e.response ? e.response.status : e.message);
  }
})();
