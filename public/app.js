// ─── State ────────────────────────────────────────────────────────────────────
const state = {
  currentPage: 'home',
  anilistId: null,
  animeName: '',
  audio: 'sub',
  episodes: { sub: [], dub: [] },
  currentEp: null,
  streams: [],
  hls: null,
};

// ─── DOM Refs ─────────────────────────────────────────────────────────────────
const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => document.querySelectorAll(sel);

// Utility functions for escaping strings to prevent HTML injection and breaking JS strings
const escHtml = (str) => String(str).replace(/[&<>"'`=\/]/g, s => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;', '/': '&#x2F;', '`': '&#x60;', '=': '&#x3D;'
})[s]);
const escJs = (str) => String(str).replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/"/g, '\\"');

const searchInput   = $('#searchInput');
const searchResults = $('#searchResults');
const searchLoading = $('#searchLoading');
const homePage      = $('#homePage');
const animePage     = $('#animePage');
const watchPage     = $('#watchPage');
const animeHeader   = $('#animeHeader');
const episodeList   = $('#episodeList');
const episodeLoading = $('#episodeLoading');
const videoPlayer   = $('#videoPlayer');
const playerLoading = $('#playerLoading');
const playerError   = $('#playerError');
const playerErrorMsg = $('#playerErrorMsg');
const watchTitle    = $('#watchTitle');
const watchEpInfo   = $('#watchEpInfo');
const serverList    = $('#serverList');
const sidebarEps    = $('#sidebarEpisodes');

// ─── Navigation ───────────────────────────────────────────────────────────────
function showPage(name) {
  state.currentPage = name;
  [homePage, animePage, watchPage].forEach(p => p.classList.remove('active'));
  if (name === 'home') homePage.classList.add('active');
  else if (name === 'anime') animePage.classList.add('active');
  else if (name === 'watch') watchPage.classList.add('active');
  window.scrollTo(0, 0);
}

// ─── Search ───────────────────────────────────────────────────────────────────
let searchTimeout = null;

searchInput.addEventListener('input', () => {
  clearTimeout(searchTimeout);
  const q = searchInput.value.trim();
  if (!q) { searchResults.innerHTML = ''; return; }
  searchTimeout = setTimeout(() => fetchSearch(q), 400);
});

async function fetchSearch(keyword) {
  if (!keyword) return;
  showPage('home');
  searchResults.innerHTML = '';
  searchLoading.classList.remove('hidden');
  $('.home-hero').style.display = 'none';

  try {
    const res = await fetch(`/api/search?q=${encodeURIComponent(keyword)}`);
    const json = await res.json();
    
    if (json.error) throw new Error(json.error);
    
    if (!json.results || json.results.length === 0) {
      searchResults.innerHTML = '<p style="color:var(--text-muted);grid-column:1/-1;text-align:center;padding:30px;">No results found</p>';
      return;
    }

    renderSearchResults(json.results);
  } catch (err) {
    searchResults.innerHTML = `<p style="color:var(--danger);grid-column:1/-1;text-align:center;padding:30px;">Error: ${err.message}</p>`;
  } finally {
    searchLoading.classList.add('hidden');
  }
}

function renderSearchResults(results) {
  searchResults.innerHTML = results.map(r => `
    <div class="card" onclick="openAnime('${escJs(r.slug)}', '${escJs(r.titleEn || r.titleJp)}')">
      ${r.image
        ? `<img class="card-img" src="${r.image}" alt="${escHtml(r.titleEn || r.slug)}" loading="lazy" onerror="this.style.display='none';this.nextElementSibling.style.display='flex'"><div class="card-img-fallback" style="display:none">🎬</div>`
        : `<div class="card-img" style="display:flex;align-items:center;justify-content:center;color:var(--text-muted);font-size:2rem;">🎬</div>`
      }
      <div class="card-body">
        <div class="card-title">${escHtml(r.titleEn || r.slug)}</div>
        <div class="card-meta">${r.year || '?'} · ${r.type || '?'}</div>
      </div>
    </div>
  `).join('');
}

// ─── Open Anime from Search Card ──────────────────────────────────────────────

// If user types a number and hits Enter, treat as AniList ID
searchInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    const val = searchInput.value.trim();
    if (/^\d+$/.test(val)) {
      loadAnime(parseInt(val), `Anime #${val}`);
    }
  }
});

async function openAnime(slug, name) {
  showPage('anime');
  animeHeader.innerHTML = `
    <button class="back-btn" onclick="goHome()">← Back</button>
    <h1>${escHtml(name)}</h1>
    <p style="color:var(--text-muted);font-size:0.85rem;">Resolving...</p>
  `;
  episodeList.innerHTML = '';
  episodeLoading.classList.remove('hidden');

  try {
    // Auto-resolve slug → AniList ID
    const infoRes = await fetch(`/api/info/${encodeURIComponent(slug)}`);
    const info = await infoRes.json();
    if (info.error) throw new Error(info.error);

    const anilistId = info.anilistId;
    if (!anilistId) throw new Error(`Could not resolve AniList ID for "${name}". MAL ID: ${info.malId || 'unknown'}`);

    state.anilistId = anilistId;
    state.animeName = info.title || name;

    animeHeader.innerHTML = `
      <button class="back-btn" onclick="goHome()">← Back</button>
      <h1>${escHtml(info.title || name)}</h1>
      <p style="color:var(--text-muted);font-size:0.85rem;">AniList: ${anilistId} · MAL: ${info.malId || '?'} · ${info.totalEpisodes} episodes</p>
    `;

    // Now load episodes
    loadEpisodes(anilistId);
  } catch (err) {
    episodeLoading.classList.add('hidden');
    episodeList.innerHTML = `<p style="color:var(--danger);grid-column:1/-1;padding:20px;">Error: ${err.message}</p>`;
  }
}

async function loadAnime(anilistId, name) {
  state.anilistId = anilistId;
  state.animeName = name;
  state.audio = 'sub';

  showPage('anime');
  animeHeader.innerHTML = `
    <button class="back-btn" onclick="goHome()">← Back</button>
    <h1>${escHtml(name)}</h1>
    <p style="color:var(--text-muted);font-size:0.85rem;">AniList ID: ${anilistId}</p>
  `;
  episodeList.innerHTML = '';
  episodeLoading.classList.remove('hidden');

  // Setup audio tabs
  $$('.tab').forEach(tab => {
    tab.classList.toggle('active', tab.dataset.audio === 'sub');
    tab.onclick = () => switchAudio(tab.dataset.audio);
  });

  loadEpisodes(anilistId);
}

async function loadEpisodes(anilistId) {
  try {
    const res = await fetch(`/api/episodes/${anilistId}`);
    const json = await res.json();
    if (json.error) throw new Error(json.error);
    state.episodes = json.episodes;

    const hasSub = state.episodes.sub && state.episodes.sub.length > 0;
    const hasDub = state.episodes.dub && state.episodes.dub.length > 0;

    // Auto-switch to available audio if current is empty
    if (state.audio === 'sub' && !hasSub && hasDub) state.audio = 'dub';
    if (state.audio === 'dub' && !hasDub && hasSub) state.audio = 'sub';

    // Setup audio tabs visibility and active state
    $$('.tab').forEach(tab => {
      const isSub = tab.dataset.audio === 'sub';
      tab.style.display = (isSub && !hasSub) || (!isSub && !hasDub) ? 'none' : 'inline-block';
      tab.classList.toggle('active', tab.dataset.audio === state.audio);
      tab.onclick = () => switchAudio(tab.dataset.audio);
    });

    renderEpisodes();
  } catch (err) {
    episodeList.innerHTML = `<p style="color:var(--danger);grid-column:1/-1;padding:20px;">Error: ${err.message}</p>`;
  } finally {
    episodeLoading.classList.add('hidden');
  }
}

function switchAudio(audio) {
  state.audio = audio;
  $$('.tab').forEach(t => t.classList.toggle('active', t.dataset.audio === audio));
  renderEpisodes();
}

function renderEpisodes() {
  const eps = state.episodes[state.audio] || [];
  if (!eps.length) {
    episodeList.innerHTML = `<p style="color:var(--text-muted);grid-column:1/-1;text-align:center;padding:30px;">No ${state.audio.toUpperCase()} episodes available</p>`;
    return;
  }
  episodeList.innerHTML = eps.map(ep => `
    <button class="ep-btn${ep.filler ? ' filler' : ''}" onclick="watchEpisode(${ep.number})" title="${escHtml(ep.title || '')}">
      Ep ${ep.number}
    </button>
  `).join('');
}

// ─── Watch ────────────────────────────────────────────────────────────────────
async function watchEpisode(epNum) {
  state.currentEp = epNum;
  showPage('watch');

  watchTitle.textContent = state.animeName;
  watchEpInfo.textContent = `Episode ${epNum} · ${state.audio.toUpperCase()}`;
  serverList.innerHTML = '';
  playerLoading.classList.remove('hidden');
  playerError.classList.add('hidden');

  // Render sidebar episodes
  const eps = state.episodes[state.audio] || [];
  sidebarEps.innerHTML = eps.map(ep => `
    <button class="sidebar-ep${ep.number === epNum ? ' active' : ''}" onclick="watchEpisode(${ep.number})">
      <span class="ep-num">${ep.number}</span>
      <span class="ep-title">${escHtml(ep.title || `Episode ${ep.number}`)}</span>
    </button>
  `).join('');

  // Scroll active episode into view
  setTimeout(() => {
    const activeEl = sidebarEps.querySelector('.sidebar-ep.active');
    if (activeEl) activeEl.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }, 100);

  // Fetch skip times asynchronously
  fetchSkipTimes(state.anilistId, epNum);

  try {
    const res = await fetch(`/api/watch/${state.anilistId}/${state.audio}/${epNum}`);
    const json = await res.json();
    if (json.error) throw new Error(json.error);

    const key = state.audio === 'sub' ? 'ssub' : 'sdub';
    const data = json[key];
    if (!data?.streams?.length) throw new Error('No streams found');

    state.streams = data.streams;
    renderServers(data.streams);

    // Load subtitles
    if (data.subtitles?.length) {
      loadSubtitles(data.subtitles);
    } else {
      loadSubtitles([]);
    }

    // Auto-play first HLS stream
    const hlsStream = data.streams.find(s => s.type === 'hls');
    if (hlsStream) {
      playHLS(hlsStream.url);
    } else {
      playerLoading.classList.add('hidden');
      playerError.classList.remove('hidden');
      playerErrorMsg.textContent = 'No direct stream available. Try an embed server.';
    }
  } catch (err) {
    playerLoading.classList.add('hidden');
    playerError.classList.remove('hidden');
    playerErrorMsg.textContent = err.message;
  }
}

function renderServers(streams) {
  serverList.innerHTML = streams.map((s, i) => `
    <button class="server-btn${i === 0 ? ' active' : ''}" onclick="selectServer(${i})" data-idx="${i}">
      ${escHtml(s.server)}
      <span class="server-type">${s.type.toUpperCase()}</span>
    </button>
  `).join('');
}

function selectServer(idx) {
  const stream = state.streams[idx];
  if (!stream) return;

  $$('.server-btn').forEach(b => b.classList.toggle('active', parseInt(b.dataset.idx) === idx));

  if (stream.type === 'hls') {
    playHLS(stream.url, stream.referer);
  } else if (stream.type === 'embed') {
    playEmbed(stream.url);
  }
}

function playHLS(url, referer) {
  const proxyUrl = `/api/proxy?url=${encodeURIComponent(url)}&referer=${encodeURIComponent(referer || 'https://megaplay.buzz/')}`;

  if (state.hls) { state.hls.destroy(); state.hls = null; }

  playerLoading.classList.remove('hidden');
  playerError.classList.add('hidden');
  
  const plyrEl = $('.plyr');
  if (plyrEl) plyrEl.style.display = 'block';
  else videoPlayer.style.display = 'block';

  const oldIframe = $('#playerContainer iframe');
  if (oldIframe) oldIframe.remove();
  
  if (!document.getElementById('videoPlayer')) {
    $('#playerContainer').insertAdjacentHTML('afterbegin', '<video id="videoPlayer" crossorigin playsinline></video>');
    videoPlayer = $('#videoPlayer');
    state.plyr = null;
  }

  // Initialize Plyr only once. We use standard qualities for these servers.
  if (!state.plyr && window.Plyr) {
    state.plyr = new Plyr(videoPlayer, {
      controls: ['play-large', 'progress', 'play', 'mute', 'volume', 'current-time', 'duration', 'rewind', 'fast-forward', 'settings', 'pip', 'airplay', 'fullscreen'],
      settings: ['captions', 'quality', 'speed'],
      quality: {
        default: 0,
        options: [0, 1080, 720, 480, 360],
        forced: true,
        onChange: (newQuality) => {
          if (!state.hls) return;
          if (newQuality === 0) state.hls.currentLevel = -1;
          else state.hls.levels.forEach((level, idx) => {
            if (level.height === newQuality) state.hls.currentLevel = idx;
          });
        }
      },
      i18n: { qualityLabel: { 0: 'Auto' } },
      keyboard: { focused: true, global: true }
    });

    // Inject Skip Button UI
    const skipBtn = document.createElement('div');
    skipBtn.id = 'skipButton';
    skipBtn.className = 'aniskip-btn';
    skipBtn.innerHTML = `<span>Skip Intro</span> <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="5 4 15 12 5 20 5 4"></polygon><line x1="19" y1="5" x2="19" y2="19"></line></svg>`;
    skipBtn.onclick = () => {
      if (state.currentSkip && state.plyr) {
        state.plyr.currentTime = state.currentSkip.end;
      }
    };
    $('.plyr').appendChild(skipBtn);

    // Watch playback time to show/hide skip button
    state.plyr.on('timeupdate', () => {
      if (!state.skipTimes || !state.skipTimes.length) {
        skipBtn.classList.remove('show');
        return;
      }
      
      const currentTime = state.plyr.currentTime;
      const activeSkip = state.skipTimes.find(skip => currentTime >= skip.start && currentTime <= skip.end);
      
      if (activeSkip) {
        state.currentSkip = activeSkip;
        let btnText = 'Skip';
        if (activeSkip.type === 'op' || activeSkip.type === 'mixed-op') btnText = 'Skip Intro';
        if (activeSkip.type === 'ed' || activeSkip.type === 'mixed-ed') btnText = 'Skip Ending';
        if (activeSkip.type === 'recap') btnText = 'Skip Recap';
        skipBtn.querySelector('span').textContent = btnText;
        skipBtn.classList.add('show');
      } else {
        state.currentSkip = null;
        skipBtn.classList.remove('show');
      }
    });
  }

  if (Hls.isSupported()) {
    const hls = new Hls();
    state.hls = hls;
    
    // Attach media first, then load source on MEDIA_ATTACHED
    hls.attachMedia(videoPlayer);
    hls.on(Hls.Events.MEDIA_ATTACHED, () => {
      hls.loadSource(proxyUrl);
    });
    
    hls.on(Hls.Events.MANIFEST_PARSED, () => {
      playerLoading.classList.add('hidden');
      videoPlayer.play().catch(() => {});
    });
    
    hls.on(Hls.Events.ERROR, (_, data) => {
      if (data.fatal) {
        playerLoading.classList.add('hidden');
        playerError.classList.remove('hidden');
        playerErrorMsg.textContent = 'Stream failed to load. Try another server.';
      }
    });
  } else if (videoPlayer.canPlayType('application/vnd.apple.mpegurl')) {
    videoPlayer.src = proxyUrl;
    videoPlayer.addEventListener('loadeddata', () => {
      playerLoading.classList.add('hidden');
      videoPlayer.play().catch(() => {});
    }, { once: true });
  } else {
    playerLoading.classList.add('hidden');
    playerError.classList.remove('hidden');
    playerErrorMsg.textContent = 'HLS not supported in this browser.';
  }
}

function playEmbed(url) {
  if (state.hls) { state.hls.destroy(); state.hls = null; }
  if (state.plyr) { state.plyr.pause(); }
  
  const plyrEl = $('.plyr');
  if (plyrEl) plyrEl.style.display = 'none';
  else videoPlayer.style.display = 'none';

  playerLoading.classList.add('hidden');
  playerError.classList.add('hidden');

  // Remove old iframe
  const old = $('#playerContainer iframe');
  if (old) old.remove();

  const iframe = document.createElement('iframe');
  iframe.src = url;
  iframe.style.cssText = 'width:100%;height:100%;border:none;position:absolute;inset:0;';
  iframe.setAttribute('allowfullscreen', '');
  iframe.setAttribute('allow', 'autoplay; encrypted-media');
  $('#playerContainer').appendChild(iframe);
}

function loadSubtitles(subs) {
  // Clear existing tracks
  videoPlayer.querySelectorAll('track').forEach(t => t.remove());

  // Add subtitle tracks (limit to 10 to avoid clutter)
  if (subs && subs.length) {
    subs.slice(0, 10).forEach((sub, i) => {
      const track = document.createElement('track');
      track.kind = 'subtitles';
      
      // Pass subtitle through proxy to avoid 403 Forbidden / CORS errors
      const ref = sub.source === 'VidWish' ? 'https://vidwish.live/' : 'https://megaplay.buzz/';
      track.src = `/api/proxy?url=${encodeURIComponent(sub.file)}&referer=${encodeURIComponent(ref)}`;
      
      track.srclang = sub.language || 'und';
      track.label = sub.label || `Track ${i + 1}`;
      if (sub.default || i === 0) track.default = true;
      videoPlayer.appendChild(track);
    });
  }

  // Force Plyr to recognize new tracks by recreating it
  if (state.plyr) {
    state.plyr.destroy();
    state.plyr = null;
  }
}

// ─── Navigation Helpers ───────────────────────────────────────────────────────
function goHome() {
  showPage('home');
  if (!searchResults.innerHTML) {
    $('.home-hero').style.display = '';
  }
}

// Logo click → home
$('.logo').addEventListener('click', (e) => {
  e.preventDefault();
  searchInput.value = '';
  searchResults.innerHTML = '';
  $('.home-hero').style.display = '';
  showPage('home');
});



// ─── Handle direct AniList ID in URL hash ─────────────────────────────────────
// Usage: #/anime/21087 or #/watch/21087/sub/1
function handleHash() {
  const hash = window.location.hash;
  if (!hash) return;

  let m;
  m = hash.match(/^#\/anime\/(\d+)$/);
  if (m) { loadAnime(parseInt(m[1]), `Anime #${m[1]}`); return; }

  m = hash.match(/^#\/watch\/(\d+)\/(sub|dub)\/(\d+)$/);
  if (m) {
    const [, id, audio, ep] = m;
    state.anilistId = parseInt(id);
    state.audio = audio;
    // Load episodes first, then watch
    loadAnime(parseInt(id), `Anime #${id}`).then(() => {
      watchEpisode(parseInt(ep));
    });
  }
}

window.addEventListener('hashchange', handleHash);
handleHash();

// ─── Chromecast Support ────────────────────────────────────────────────────────
window.__onGCastApiAvailable = function(isAvailable) {
  if (isAvailable) {
    cast.framework.CastContext.getInstance().setOptions({
      receiverApplicationId: chrome.cast.media.DEFAULT_MEDIA_RECEIVER_APP_ID,
      autoJoinPolicy: chrome.cast.AutoJoinPolicy.ORIGIN_SCOPED
    });

    const context = cast.framework.CastContext.getInstance();
    context.addEventListener(cast.framework.CastContextEventType.SESSION_STATE_CHANGED, (event) => {
      switch (event.sessionState) {
        case cast.framework.SessionState.SESSION_STARTED:
        case cast.framework.SessionState.SESSION_RESUMED:
          castSession = context.getCurrentSession();
          loadMediaToChromecast();
          break;
        case cast.framework.SessionState.SESSION_ENDED:
          castSession = null;
          break;
      }
    });

    // Inject the cast button into the Plyr UI when it's created
    setInterval(() => {
      const controls = document.querySelector('.plyr__controls');
      if (controls && !document.querySelector('google-cast-launcher')) {
        const fullscreenBtn = controls.querySelector('[data-plyr="fullscreen"]');
        const castBtn = document.createElement('google-cast-launcher');
        castBtn.style.cssText = 'width: 20px; height: 20px; cursor: pointer; margin: 0 4px; --connected-color: #fff; --disconnected-color: #fff; display: flex; align-items: center; justify-content: center;';
        
        const wrapper = document.createElement('button');
        wrapper.className = 'plyr__control';
        wrapper.type = 'button';
        wrapper.appendChild(castBtn);

        if (fullscreenBtn) {
          fullscreenBtn.parentNode.insertBefore(wrapper, fullscreenBtn);
        } else {
          controls.appendChild(wrapper);
        }
      }
    }, 1000);
  }
};

let castSession = null;

function loadMediaToChromecast() {
  if (!castSession) return;
  
  // We need the current proxy URL.
  let currentUrl = '';
  if (state.hls && state.hls.url) {
    currentUrl = state.hls.url;
  } else if (videoPlayer && videoPlayer.src) {
    currentUrl = videoPlayer.src;
  }
  
  if (!currentUrl || currentUrl.includes('blob:')) {
      // HLS.js uses blob URLs, so we need to construct the proxy URL again if it's a blob
      // Wait, playHLS sets proxyUrl directly. Let's just track the last played URL in state.
      if (state.currentProxyUrl) currentUrl = state.currentProxyUrl;
      else return;
  }

  const mediaUrl = new URL(currentUrl, window.location.origin).href;
  const mediaInfo = new chrome.cast.media.MediaInfo(mediaUrl, 'application/x-mpegURL');
  
  const metadata = new chrome.cast.media.GenericMediaMetadata();
  const titleEl = document.getElementById('watchTitle');
  const epEl = document.getElementById('watchEpInfo');
  metadata.title = (titleEl ? titleEl.textContent : 'Anime') + (epEl ? ' - ' + epEl.textContent : '');
  mediaInfo.metadata = metadata;

  const request = new chrome.cast.media.LoadRequest(mediaInfo);
  
  castSession.loadMedia(request).then(
    () => console.log('Chromecast: Media loaded successfully'),
    (error) => console.error('Chromecast: Error loading media', error)
  );
}

// Hook playHLS to track proxy URL and cast
const originalPlayHLS = playHLS;
playHLS = function(url, referer) {
  state.currentProxyUrl = `/api/proxy?url=${encodeURIComponent(url)}&referer=${encodeURIComponent(referer || 'https://megaplay.buzz/')}`;
  originalPlayHLS(url, referer);
  if (castSession) {
    setTimeout(loadMediaToChromecast, 500);
  }
};

// ─── AniSkip Implementation ────────────────────────────────────────────────────
async function fetchSkipTimes(anilistId, epNum) {
  state.skipTimes = []; // Reset for new episode
  try {
    // 1. Get MAL ID
    const mappingRes = await fetch(`https://api.ani.zip/mappings?anilist_id=${anilistId}`);
    const mapping = await mappingRes.json();
    const malId = mapping?.mappings?.mal_id;
    if (!malId) return;

    // 2. Fetch AniSkip data
    const skipRes = await fetch(`https://api.aniskip.com/v2/skip-times/${malId}/${epNum}?types[]=op&types[]=ed&types[]=mixed-op&types[]=mixed-ed&types[]=recap&episodeLength=0`);
    const skipData = await skipRes.json();
    
    if (skipData.found && skipData.results) {
      state.skipTimes = skipData.results.map(res => ({
        type: res.skipType,
        start: res.interval.startTime,
        end: res.interval.endTime
      }));
      console.log('AniSkip: Loaded skip times', state.skipTimes);
    }
  } catch (err) {
    console.error('Failed to fetch skip times:', err);
  }
}
