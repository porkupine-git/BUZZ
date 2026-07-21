const axios = require('axios');
const cheerio = require('cheerio');

async function checkServers() {
  const url = process.argv[2];
  try {
    const { data } = await axios.get(url, { headers: { "User-Agent": "Mozilla/5.0" } });
    const $ = cheerio.load(data);
    const id = $('#watching-player').attr('data-id') || $('#player').attr('data-id') || $('div[data-id]').attr('data-id');
    console.log("Episode ID:", id);
    if (!id) return;
    
    const serverData = await axios.get(`https://anikototv.to/ajax/server/list?servers=${id}`, {
      headers: { "X-Requested-With": "XMLHttpRequest", "Referer": "https://anikototv.to/" }
    });
    console.log("Servers HTML:", serverData.data.result);
    
    const $s = cheerio.load(serverData.data.result);
    $s('.server-item').each((i, el) => {
      console.log(`Server: ${$s(el).text().trim()} | Type: ${$s(el).attr('data-type')} | Link ID: ${$s(el).attr('data-link-id')}`);
    });
  } catch(e) {
    console.error(e.message);
  }
}
checkServers();
