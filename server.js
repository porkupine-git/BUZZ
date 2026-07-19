const express = require('express');
const path = require('path');
const scraper = require('./scraper');
const NodeCache = require('node-cache');
const jwt = require('jsonwebtoken');
const compression = require('compression');

// Secret for signing tokens - you should put this in .env
const JWT_SECRET = process.env.JWT_SECRET || 'aniko-super-secret-key-123!';

const app = express();
const PORT = process.env.PORT || 7860;

// Enable gzip compression for API responses (applied later)
const shouldCompress = (req, res) => {
  if (req.path.startsWith('/api/proxy')) return false;
  return compression.filter(req, res);
};
app.use(compression({ filter: shouldCompress }));

// Initialize Cache
const apiCache = new NodeCache({ stdTTL: 3600 });

// Caching Middleware
const cacheMiddleware = (ttlSeconds) => {
  return (req, res, next) => {
    if (req.method !== 'GET') return next();

    const key = req.originalUrl;
    const cachedResponse = apiCache.get(key);

    if (cachedResponse) {
      console.log(`[CACHE HIT] ${key}`);
      res.set('Cache-Control', `public, max-age=${ttlSeconds}, s-maxage=${ttlSeconds}`);
      return res.json(cachedResponse);
    } else {
      console.log(`[CACHE MISS] ${key}`);
      res.originalJson = res.json;
      res.json = (body) => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          apiCache.set(key, body, ttlSeconds);
          res.set('Cache-Control', `public, max-age=${ttlSeconds}, s-maxage=${ttlSeconds}`);
        } else {
          // Do not cache errors
          res.set('Cache-Control', 'no-store, max-age=0');
        }
        res.originalJson(body);
      };
      next();
    }
  };
};

// Serve embed player static assets (CSS, JS)
app.use('/embed/assets', express.static(path.join(__dirname, 'public', 'embed')));

// ─── Rate Limiter (Anti-Scraping) ───────────────────────────────────────────
const rateLimitMap = new Map();
const RATE_LIMIT = 60;       // max requests
const RATE_WINDOW = 60000;   // per 1 minute

function getClientIp(req) {
  return req.headers['cf-connecting-ip'] || 
         req.headers['x-forwarded-for']?.split(',')[0]?.trim() || 
         req.ip || 
         req.connection?.remoteAddress || 
         'unknown';
}

app.use('/api', (req, res, next) => {
  const ip = getClientIp(req);

  // Whitelist localhost for testing
  if (ip === '127.0.0.1' || ip === '::1' || ip === '::ffff:127.0.0.1' || ip === 'unknown') {
    return next();
  }

  const now = Date.now();

  if (!rateLimitMap.has(ip)) {
    rateLimitMap.set(ip, { count: 1, start: now });
  } else {
    const entry = rateLimitMap.get(ip);
    if (now - entry.start > RATE_WINDOW) {
      // Reset window
      entry.count = 1;
      entry.start = now;
    } else {
      entry.count++;
      if (entry.count > RATE_LIMIT) {
        console.log(`[RATE LIMIT] Blocked IP: ${ip}`);
        return res.status(429).json({ error: 'Too many requests. Try again later.' });
      }
    }
  }
  next();
});

// Clean up rate limit map every 5 minutes
setInterval(() => {
  const now = Date.now();
  for (const [ip, entry] of rateLimitMap) {
    if (now - entry.start > RATE_WINDOW * 2) rateLimitMap.delete(ip);
  }
}, 300000);

// ─── Security & Anti-Scraping ───────────────────────────────────────────────
// Get the domain from the environment variable to restrict the API to this environment
let envDomain = null;
if (process.env.EMBED_URL) {
  try {
    envDomain = new URL(process.env.EMBED_URL).hostname;
  } catch (e) { }
}

const ALLOWED_DOMAINS = envDomain ? [envDomain, 'localhost', '127.0.0.1'] : ['localhost', '127.0.0.1'];

app.use((req, res, next) => {
  const origin = req.headers.origin || req.headers.referer;

  // 1. Prevent iframe embedding on unauthorized sites
  const cspDomains = ALLOWED_DOMAINS.map(d => {
    if (d === 'localhost' || d === '127.0.0.1') return `http://${d}:*`;
    return `*${d}`;
  }).join(' ');
  res.header("Content-Security-Policy", `frame-ancestors 'self' ${cspDomains}`);

  let isAllowed = false;
  if (origin) {
    try {
      const hostname = new URL(origin).hostname;
      if (ALLOWED_DOMAINS.some(d => hostname === d || hostname.endsWith('.' + d))) {
        isAllowed = true;
      }
    } catch (e) { }
  }

  // 2. Anti-Scraping: Validate Sec-Fetch-* headers (browser fingerprinting)
  // These headers are set by the browser and CANNOT be spoofed via JS (forbidden headers).
  // Scrapers (curl, Python, Postman) either don't send them or send wrong values.
  const isProtectedPath = req.path.startsWith('/api') ||
    (req.path.startsWith('/embed/') && !req.path.startsWith('/embed/assets'));

  if (isProtectedPath) {
    const secFetchSite = req.headers['sec-fetch-site'];   // cross-site, same-origin, same-site, none
    const secFetchMode = req.headers['sec-fetch-mode'];   // navigate, cors, no-cors, same-origin
    const secFetchDest = req.headers['sec-fetch-dest'];   // iframe, document, empty, etc.
    const isPlayerRoute = req.path.startsWith('/embed/');

    // If Sec-Fetch headers exist, validate them strictly
    if (secFetchSite) {
      // Scraper detection: if sec-fetch-site is 'none' it means direct browser/curl access
      // For API calls from iframe: sec-fetch-site should be 'same-origin' or 'same-site'
      // For iframe embed from allowed site: sec-fetch-site should be 'cross-site' or 'same-origin'

      const validSites = ['same-origin', 'same-site', 'cross-site'];
      if (!validSites.includes(secFetchSite)) {
        console.log(`[BLOCKED] sec-fetch-site: ${secFetchSite}, IP: ${getClientIp(req)}`);
        return res.status(403).json({ error: 'Access denied' });
      }

      // Player route must be loaded as iframe, not as document (direct tab visit)
      if (isPlayerRoute && secFetchDest && secFetchDest !== 'iframe') {
        return res.status(403).send(`
          <body style="background:#0f0f14;color:#fff;font-family:sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;">
            <h3>🚫 Direct Access Not Allowed. This player can only be embedded.</h3>
          </body>
        `);
      }
    } else {
      // No Sec-Fetch headers = likely a scraper (curl, Python, Postman, etc.)
      // Real browsers ALWAYS send these headers (Chrome 76+, Firefox 90+, Safari 16.4+)
      if (!isAllowed) {
        console.log(`[BLOCKED] No Sec-Fetch headers, IP: ${getClientIp(req)}`);
        return res.status(403).json({
          error: "Forbidden: Access denied. Scraping or unauthorized embedding is not allowed."
        });
      }
    }

    // Domain check still applies as secondary layer
    if (!isAllowed) {
      return res.status(403).json({
        error: "Forbidden: Unauthorized domain."
      });
    }
  }

  // 3. Strict CORS configuration
  if (isAllowed && req.headers.origin) {
    res.header("Access-Control-Allow-Origin", req.headers.origin);
  } else {
    // Fallback so local docs page works
    res.header("Access-Control-Allow-Origin", "http://localhost:7860");
  }

  res.header("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept");

  if (req.method === "OPTIONS") return res.sendStatus(200);
  next();
});

// ─── Embed Provider Routes ───────────────────────────────────────────────────

// Docs / landing page or Embed Player (if token provided) at /embed
app.get('/embed', (req, res) => {
  if (req.query.token) {
    return res.sendFile(path.join(__dirname, 'public', 'embed', 'player.html'));
  }
  res.redirect('/');
});

// Simple URL embed (AniList ID)
app.get('/embed/ani/:anilistId/:epNum/:audio', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'embed', 'player.html'));
});

// Direct URL embed
app.get('/embed/url', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'embed', 'player.html'));
});

// ─── API Routes ──────────────────────────────────────────────────────────────

// Search anime
app.get('/api/search', cacheMiddleware(86400), async (req, res) => {
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
app.get('/api/episodes/:anilistId', cacheMiddleware(21600), async (req, res) => {
  try {
    const data = await scraper.getEpisodes(parseInt(req.params.anilistId));
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get show info by Anikoto slug (resolves AniList ID automatically)
app.get('/api/info/:slug', cacheMiddleware(43200), async (req, res) => {
  try {
    const data = await scraper.getInfoBySlug(req.params.slug);
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get watch streams (Simple Path-based API)
app.get('/api/watch/:anilistId/:audio/:epNum', cacheMiddleware(1800), async (req, res) => {
  try {
    const { anilistId, audio, epNum } = req.params;

    // Server-level anti-scraping already ensures only allowed domains or direct embedded iframes can hit this.
    const data = await scraper.getWatch(anilistId, audio, parseInt(epNum));
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Token generation route removed because we switched to simple path-based endpoints.

// HLS Proxy to bypass CORS/Referer restrictions on CDNs
const axios = require('axios');
const http = require('http');
const https = require('https');

const httpAgent = new http.Agent({ keepAlive: true, maxSockets: 50 });
const httpsAgent = new https.Agent({ keepAlive: true, maxSockets: 50 });

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

    const isM3u8 = targetUrl.includes('.m3u8');
    const isSubtitle = /\.(vtt|srt|ass|ssa)(\?|$)/i.test(targetUrl);

    const response = await axios({
      method: 'get',
      url: targetUrl,
      headers: headers,
      responseType: (isM3u8 || isSubtitle) ? 'text' : 'stream',
      validateStatus: () => true,
      httpAgent,
      httpsAgent,
      timeout: 15000 // 15 seconds timeout
    });

    if (response.status >= 400) {
      return res.status(response.status).send('Upstream error: ' + response.status);
    }

    res.set('Access-Control-Allow-Origin', '*');
    if (isSubtitle) {
      // Ensure correct Content-Type for subtitle files
      const ext = targetUrl.match(/\.(vtt|srt|ass|ssa)/i)?.[1]?.toLowerCase();
      const subtitleTypes = { vtt: 'text/vtt', srt: 'text/srt', ass: 'text/plain', ssa: 'text/plain' };
      res.set('Content-Type', subtitleTypes[ext] || 'text/vtt');
      res.set('charset', 'utf-8');
      return res.send(response.data);
    } else if (response.headers['content-type']) {
      res.set('Content-Type', response.headers['content-type']);
    }

    if (isM3u8) {
      const targetBase = targetUrl.substring(0, targetUrl.lastIndexOf('/') + 1);
      const proxyBase = `${req.headers['x-forwarded-proto'] || req.protocol}://${req.get('host')}`;

      const rewritten = response.data.split('\n').map(line => {
        const trimmed = line.trim();
        if (trimmed && !trimmed.startsWith('#')) {
          const absoluteUrl = trimmed.startsWith('http') ? trimmed : targetBase + trimmed;
          return `${proxyBase}/api/proxy?url=${encodeURIComponent(absoluteUrl)}&referer=${encodeURIComponent(referer)}`;
        }
        if (trimmed.includes('URI="')) {
          return trimmed.replace(/URI="([^"]+)"/g, (match, uri) => {
            const absoluteUrl = uri.startsWith('http') ? uri : targetBase + uri;
            return `URI="${proxyBase}/api/proxy?url=${encodeURIComponent(absoluteUrl)}&referer=${encodeURIComponent(referer)}"`;
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

// Serve the frontend documentation / landing page
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});
app.use(express.static(path.join(__dirname, 'public')));

// Fallback for unknown API routes
app.use((req, res) => {
  res.json({
    status: "ok",
    message: "Aniko Embed Provider is active! 🚀",
    docs: "/",
    usage: "/embed/ani/:anilistId/:epNum/:audio"
  });
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`\n  🎬 Aniko running at http://localhost:${PORT}\n`);
});
