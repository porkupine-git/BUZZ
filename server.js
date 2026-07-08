const express = require('express');
const path = require('path');
const scraper = require('./scraper');

const app = express();
const PORT = process.env.PORT || 7860;

// Serve static files
app.use(express.static(path.join(__dirname, 'public')));

// Allow CORS for Anigo2 local testing
app.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept");
  if (req.method === "OPTIONS") return res.sendStatus(200);
  next();
});

// ─── API Routes ──────────────────────────────────────────────────────────────

// Search anime
app.get('/api/search', async (req, res) => {
  try {
    const keyword = req.query.q;
    if (!keyword) return res.json({ error: 'Missing ?q= parameter' });
    const results = await scraper.searchAnikoto(keyword);
    res.json({ results });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get episodes by AniList ID
app.get('/api/episodes/:anilistId', async (req, res) => {
  try {
    const data = await scraper.getEpisodes(parseInt(req.params.anilistId));
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get show info by Anikoto slug (resolves AniList ID automatically)
app.get('/api/info/:slug', async (req, res) => {
  try {
    const data = await scraper.getInfoBySlug(req.params.slug);
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get watch streams
app.get('/api/watch/:anilistId/:audio/:epNum', async (req, res) => {
  try {
    const { anilistId, audio, epNum } = req.params;
    const data = await scraper.getWatch(anilistId, audio, parseInt(epNum));
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// HLS Proxy to bypass CORS/Referer restrictions on CDNs
const axios = require('axios');
app.use('/api/proxy', async (req, res) => {
  if (req.method === 'OPTIONS') {
    res.set('Access-Control-Allow-Origin', '*');
    res.set('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.set('Access-Control-Allow-Headers', '*');
    return res.end();
  }
  try {
    const targetUrl = req.query.url;
    const referer = req.query.referer || 'https://megaplay.buzz/';
    
    if (!targetUrl) return res.status(400).send('Missing url parameter');

    const headers = {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
      'Referer': referer,
      'Origin': new URL(referer).origin
    };

    const response = await axios({
      method: 'get',
      url: targetUrl,
      headers: headers,
      responseType: targetUrl.includes('.m3u8') ? 'text' : 'stream',
      validateStatus: () => true
    });

    if (response.status >= 400) {
      return res.status(response.status).send('Upstream error: ' + response.status);
    }

    res.set('Access-Control-Allow-Origin', '*');
    if (response.headers['content-type']) {
      res.set('Content-Type', response.headers['content-type']);
    }

    if (targetUrl.includes('.m3u8')) {
      const targetBase = targetUrl.substring(0, targetUrl.lastIndexOf('/') + 1);
      
      const rewritten = response.data.split('\n').map(line => {
        const trimmed = line.trim();
        if (trimmed && !trimmed.startsWith('#')) {
          const absoluteUrl = trimmed.startsWith('http') ? trimmed : targetBase + trimmed;
          return `/api/proxy?url=${encodeURIComponent(absoluteUrl)}&referer=${encodeURIComponent(referer)}`;
        }
        if (trimmed.includes('URI="')) {
          return trimmed.replace(/URI="([^"]+)"/g, (match, uri) => {
            const absoluteUrl = uri.startsWith('http') ? uri : targetBase + uri;
            return `URI="/api/proxy?url=${encodeURIComponent(absoluteUrl)}&referer=${encodeURIComponent(referer)}"`;
          });
        }
        return trimmed;
      }).join('\n');
      
      return res.send(rewritten);
    } else {
      return response.data.pipe(res);
    }
  } catch (err) {
    console.error('Proxy Error:', err.message);
    res.status(500).send('Proxy Error');
  }
});

// SPA fallback — serve index.html for all non-API routes
app.get('{*path}', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`\n  🎬 Aniko running at http://localhost:${PORT}\n`);
});
