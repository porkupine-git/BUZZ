const axios = require('axios');
const cheerio = require('cheerio');

async function testAnikoto() {
  const url = 'https://anikototv.to/watch/daemons-of-the-shadow-realm-hxj32/ep-1';
  try {
    const { data } = await axios.get(url, {
      headers: { "User-Agent": "Mozilla/5.0", "Referer": "https://anikototv.to/" }
    });
    
    console.log("Iframe URLs:");
    const $ = cheerio.load(data);
    $('iframe').each((i, el) => console.log($(el).attr('src')));
    
    console.log("Any vidtube in HTML?", data.includes('vidtube'));
  } catch(e) {
    console.error(e.message);
  }
}
testAnikoto();
