const axios = require('axios');
const VIDTUBE = "https://vidtube.site";

async function testUrl(url) {
  try {
    const { data } = await axios.get(url, { headers: { "User-Agent": "Mozilla/5.0", "Referer": "https://hianimes.re/" }});
    console.log(url, "->", data.includes("Not Found") ? "NOT FOUND PAGE" : "VALID PAGE");
    if (!data.includes("Not Found")) {
      const m = data.match(/data-id="([^"]*)"/);
      console.log("data-id:", m ? m[1] : "NONE");
    }
  } catch (e) {
    console.log(url, "-> ERROR");
  }
}

(async () => {
  await testUrl(`${VIDTUBE}/stream/s-2/169744/sub`);
})();
