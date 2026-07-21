const axios = require('axios');

async function testApi() {
  try {
    const { data } = await axios.get('http://localhost:7860/api/watch/195600/sub/1', {
      headers: { Origin: 'http://localhost:7860' }
    });
    console.log("Provider:", data.ssub.provider);
    console.log("Streams:");
    data.ssub.streams.forEach(s => console.log(s.server, s.type, s.url.substring(0, 50)));
  } catch (e) {
    console.error("API error:", e.message);
  }
}

testApi();
