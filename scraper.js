const axios = require('axios');

// ─── Constants ───────────────────────────────────────────────────────────────
const ANIKOTO   = "https://anikototv.to";
const MEGAPLAY  = "https://megaplay.buzz";
const VIDTUBE   = "https://vidtube.site";
const VIDWISH   = "https://vidwish.live";
const ANIZIP    = "https://api.ani.zip/mappings";
const MAPPER    = "https://mapper.mewcdn.online/api/mal";
const JIKAN     = "https://api.jikan.moe/v4";
const SPOOF_REF = "https://hianimes.re/";
const UA        = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

const LANG_MAP = {
  en: "en", english: "en",
  ja: "ja", japanese: "ja",
  fr: "fr", french: "fr",
  de: "de", german: "de",
  es: "es", spanish: "es",
  pt: "pt", portuguese: "pt",
  it: "it", italian: "it",
  ar: "ar", arabic: "ar",
  ko: "ko", korean: "ko",
  zh: "zh", chinese: "zh",
};

// ─── HTTP Helpers (with Retry Logic) ─────────────────────────────────────────
function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function httpGet(url, extraHeaders = {}) {
  try {
    const { data } = await axios.get(url, {
      headers: { "User-Agent": UA, Accept: "text/html,*/*", ...extraHeaders },
    });
    return data;
  } catch (error) {
    const err = new Error(`HTTP ${error.response?.status || "ERR"} fetching ${url}`);
    err.rawBody = error.response?.data || null;
    throw err;
  }
}

async function getJSON(url, extraHeaders = {}, retries = 4) {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const { data, status } = await axios.get(url, {
        headers: { "User-Agent": UA, Accept: "application/json, */*", ...extraHeaders },
        validateStatus: (s) => s < 500 || s === 429,
      });
      if (status === 429) {
        const wait = (attempt + 1) * 1000;
        if (attempt < retries) { await sleep(wait); continue; }
        throw new Error(`HTTP 429 fetching ${url} (exhausted retries)`);
      }
      return data;
    } catch (error) {
      if (attempt === retries) throw error;
      await sleep((attempt + 1) * 500);
    }
  }
}

// ─── HTML Parsers ────────────────────────────────────────────────────────────
function extractEpisodes(html) {
  const episodes = [];
  const re = /<a\s[^>]*data-id="[^"]*"[^>]*>/g;
  let m;
  while ((m = re.exec(html)) !== null) {
    const tag = m[0];
    const get = (a) => { const x = tag.match(new RegExp(`data-${a}="([^"]*)"`)); return x ? x[1] : ""; };
    const id = get("id"), num = get("num");
    if (!id || !num) continue;
    episodes.push({
      id, num: parseInt(num), slug: get("slug"), mal: get("mal"),
      timestamp: get("timestamp"), hasSub: get("sub") === "1",
      hasDub: get("dub") === "1", ids: get("ids"),
    });
  }
  return episodes;
}

function extractSearchCandidates(html) {
  const results = [];
  const re = /<a class="item" href="https:\/\/anikototv\.to\/watch\/([^"]+)"([\s\S]*?)<\/a>/g;
  let m;
  while ((m = re.exec(html)) !== null) {
    const block = m[2];
    const enM = block.match(/class="name d-title"[^>]*>([^<]*)</);
    const jpM = block.match(/data-jp="([^"]*)"/);
    const yearM = block.match(/<span class="dot">(\d{4})<\/span>/);
    const typeM = block.match(/<span class="dot">(TV|Movie|OVA|ONA|Special)<\/span>/);
    const imgM = block.match(/<img\s+src="([^"]+)"/);
    results.push({
      slug: m[1],
      titleEn: enM ? enM[1].trim() : "",
      titleJp: jpM ? jpM[1].trim() : "",
      year: yearM ? yearM[1] : "",
      type: typeM ? typeM[1] : "",
      image: imgM ? imgM[1] : null,
    });
  }
  return results;
}

function extractServerItems(html, audio) {
  const items = [];
  const typeRe = /<div class="type" data-type="([a-z]*(sub|dub))">([\s\S]*?)<\/ul>\s*<\/div>/g;
  let typeM;
  while ((typeM = typeRe.exec(html)) !== null) {
    if (!typeM[1].endsWith(audio)) continue;
    for (const li of typeM[3].matchAll(/<li\s+([^>]*data-link-id[^>]*)>([\s\S]*?)<\/li>/g)) {
      const linkId = li[1].match(/data-link-id="([^"]+)"/)?.[1];
      const name = li[2].replace(/<[^>]+>/g, "").trim();
      if (linkId) items.push({ linkId, name });
    }
  }
  return items;
}

// ─── Smart Matching ──────────────────────────────────────────────────────────
function normalize(s) {
  return s.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function scoreCandidate(c, jikan) {
  let score = 0;
  const normEn  = normalize(jikan?.title_english ?? jikan?.title ?? "");
  const normJp  = normalize(jikan?.title_japanese ?? "");
  const normRom = normalize(jikan?.title ?? "");
  const cEn = normalize(c.titleEn), cJp = normalize(c.titleJp);

  if (normEn && cEn === normEn) score += 50;
  else if (normRom && cEn === normRom) score += 45;
  else if (normEn && cEn.startsWith(normEn)) score += 15;
  if (normJp && cJp === normJp) score += 40;
  else if (normRom && cJp === normRom) score += 35;

  const jikanType = jikan?.type ?? "";
  if (c.type && jikanType) {
    if (c.type.toLowerCase() === jikanType.toLowerCase()) score += 20;
    else score -= 30;
  }
  const jikanYear = jikan?.year ?? (jikan?.aired?.from ? new Date(jikan.aired.from).getFullYear() : null);
  if (c.year && jikanYear) {
    if (parseInt(c.year) === jikanYear) score += 20;
    else score -= 15;
  }
  return score;
}

// ─── Subtitle / Track Helpers ────────────────────────────────────────────────
function mapTrack(t, source) {
  return {
    file: t.file,
    label: t.label ?? "",
    kind: t.kind ?? "captions",
    default: t.default ?? false,
    language: LANG_MAP[(t.label ?? "").toLowerCase()] ?? "und",
    format: "vtt",
    encoding: "utf-8",
    source,
  };
}

function skipRange(value) {
  if (Array.isArray(value)) return { start: Number(value[0]) || 0, end: Number(value[1]) || 0 };
  if (value && typeof value === "object") return value;
  return null;
}

// ─── Core Anikoto Functions ──────────────────────────────────────────────────

/**
 * Search anime on Anikoto (AJAX + filter page fallback)
 */
async function searchAnikoto(keyword) {
  const [data, html] = await Promise.all([
    getJSON(
      `${ANIKOTO}/ajax/anime/search?keyword=${encodeURIComponent(keyword)}`,
      { "X-Requested-With": "XMLHttpRequest", Referer: `${ANIKOTO}/` }
    ).catch(() => null),
    httpGet(
      `${ANIKOTO}/filter?keyword=${encodeURIComponent(keyword)}`,
      { Referer: `${ANIKOTO}/` }
    ).catch(() => "")
  ]);

  const results = extractSearchCandidates(data?.result?.html ?? "");

  for (const m of html.matchAll(/<a class="name d-title" href="https:\/\/anikototv\.to\/watch\/([^"/]+)(?:\/ep-\d+)?" data-jp="([^"]*)">([\s\S]*?)<\/a>/g)) {
    results.push({
      slug: m[1],
      titleEn: m[3].replace(/<[^>]*>/g, "").trim(),
      titleJp: m[2].trim(),
      year: "", type: "",
    });
  }

  const seen = new Set();
  return results.filter((r) => { if (seen.has(r.slug)) return false; seen.add(r.slug); return true; });
}

/**
 * Find Anikoto show by title (smart matching with Jikan metadata)
 */
async function findAnikotoShow(enTitle, jikanData) {
  const jpTitle  = jikanData?.data?.title_japanese ?? "";
  const romTitle = jikanData?.data?.title ?? "";
  const keywords = [...new Set([enTitle, romTitle, jpTitle].filter(Boolean))];

  const searches = await Promise.all(keywords.map((k) => searchAnikoto(k).catch(() => [])));
  const seen = new Set();
  const candidates = searches.flat().filter((c) => { if (seen.has(c.slug)) return false; seen.add(c.slug); return true; });

  if (!candidates.length) throw new Error(`Anime not found on Anikoto: "${enTitle}"`);

  let chosenSlug;
  if (jikanData?.data) {
    const scored = candidates.map((c) => ({ ...c, score: scoreCandidate(c, jikanData.data) })).sort((a, b) => b.score - a.score);
    chosenSlug = scored[0].slug;
  } else {
    chosenSlug = candidates[0].slug;
  }

  const pageHtml = await httpGet(`${ANIKOTO}/watch/${chosenSlug}`, { Referer: `${ANIKOTO}/` });
  const idM = pageHtml.match(/data-id="(\d+)"/);
  if (!idM) throw new Error(`Could not find show ID for slug: ${chosenSlug}`);
  return { slug: chosenSlug, showId: idM[1] };
}

// ─── Embed Source Extractors ─────────────────────────────────────────────────

/**
 * Extract raw sources from any embed URL (Megaplay, VidWish, VidTube, etc.)
 */
async function extractEmbedSource(embedUrl, referer) {
  try {
    const page = await httpGet(embedUrl, { Referer: referer ?? SPOOF_REF, "Accept-Language": "en-US,en;q=0.9" });
    const m = page.match(/data-id="([^"]*)"/);
    if (!m?.[1]) return null;
    const fileId = m[1];
    const origin = new URL(embedUrl).origin;
    const data = await getJSON(
      `${origin}/stream/getSources?id=${fileId}&id=${fileId}`,
      { Referer: `${origin}/`, "X-Requested-With": "XMLHttpRequest" }
    );
    return { fileId, data };
  } catch { return null; }
}

/**
 * Extract VidWish sources directly using realId
 */
async function extractVidWish(realId, audio) {
  try {
    const page = await httpGet(`${VIDWISH}/stream/s-2/${realId}/${audio}`, { Referer: SPOOF_REF, "Accept-Language": "en-US,en;q=0.9" });
    const m = page.match(/data-id="([^"]*)"/);
    if (!m?.[1]) return null;
    const fileId = m[1];
    const data = await getJSON(
      `${VIDWISH}/stream/getSources?id=${fileId}&id=${fileId}`,
      { Referer: `${VIDWISH}/`, "X-Requested-With": "XMLHttpRequest" }
    );
    return { fileId, data };
  } catch { return null; }
}

// ─── Episode Lookup by AniList ID ────────────────────────────────────────────

/**
 * Find a specific episode on Anikoto using AniList ID
 */
async function getAnikotoEpisode(anilistId, epNum) {
  const anizip = await getJSON(`${ANIZIP}?anilist_id=${anilistId}`);
  const enTitle = anizip.titles?.en ?? Object.values(anizip.titles ?? {})[0] ?? "";
  const malId = anizip.mappings?.mal_id;
  const jikanShow = malId ? await getJSON(`${JIKAN}/anime/${malId}`).catch(() => null) : null;

  const { showId, slug } = await findAnikotoShow(enTitle, jikanShow);
  const listData = await getJSON(
    `${ANIKOTO}/ajax/episode/list/${showId}`,
    { "X-Requested-With": "XMLHttpRequest", Referer: `${ANIKOTO}/watch/${slug}` }
  );
  return extractEpisodes(listData.result ?? "").find((e) => e.num === epNum) ?? null;
}

// ─── Raw Stream Extraction (Anikoto Servers) ─────────────────────────────────

/**
 * Extract raw .m3u8 streams from Anikoto's own servers
 */
async function extractRawAnikotoStreams(anilistId, audio, epNum) {
  const ep = await getAnikotoEpisode(anilistId, epNum);
  if (!ep?.ids) return { streams: [], subtitles: [], intro: null, outro: null };

  const serverData = await getJSON(
    `${ANIKOTO}/ajax/server/list?servers=${encodeURIComponent(ep.ids)}`,
    { "X-Requested-With": "XMLHttpRequest", Referer: `${ANIKOTO}/` }
  );
  const items = extractServerItems(serverData.result ?? "", audio);

  const streams = [], subtitles = [];
  let intro = null, outro = null;
  const seen = new Set();

  await Promise.all(items.map(async (item) => {
    const resolved = await getJSON(
      `${ANIKOTO}/ajax/server?get=${encodeURIComponent(item.linkId)}`,
      { "X-Requested-With": "XMLHttpRequest", Referer: `${ANIKOTO}/` }
    ).catch(() => null);

    const embedUrl = resolved?.result?.url;
    if (!embedUrl || seen.has(embedUrl)) return;
    seen.add(embedUrl);

    const origin = new URL(embedUrl).origin;
    const extracted = await extractEmbedSource(embedUrl, SPOOF_REF);

    if (extracted?.data?.sources?.file) {
      streams.push({ url: extracted.data.sources.file, type: "hls", referer: `${origin}/`, server: item.name, priority: 5, default: streams.length === 0 });
      for (const t of extracted.data.tracks ?? []) subtitles.push(mapTrack(t, item.name));
      intro ??= extracted.data.intro ?? skipRange(resolved?.result?.skip_data?.intro) ?? null;
      outro ??= extracted.data.outro ?? skipRange(resolved?.result?.skip_data?.outro) ?? null;
    }
    streams.push({ url: embedUrl, type: "embed", referer: `${origin}/`, server: `${item.name}-embed`, priority: 4 });
  }));
  return { streams, subtitles, intro, outro };
}

// ─── Full Watch Handler (Megaplay + VidWish + Mapper + Fallback) ─────────────

/**
 * The main watch function — same as Anivexa-API's handleWatch.
 * Takes AniList ID, audio type (sub/dub), and episode number.
 * Returns all available streams, subtitles, intro/outro skip times.
 */
async function getWatch(anilistId, audio, epNum) {
  if (audio !== "sub" && audio !== "dub") throw new Error("audio must be 'sub' or 'dub'");
  const audioKey = audio === "sub" ? "ssub" : "sdub";

  // Step 1: Try Megaplay direct embed
  let embedUrl = `${MEGAPLAY}/stream/ani/${anilistId}/${epNum}/${audio}`;
  let megaHtml = await httpGet(embedUrl, { Referer: SPOOF_REF, "Accept-Language": "en-US,en;q=0.9" }).catch(() => "");

  const frameSrc = megaHtml.match(/<iframe\b[^>]*src="([^"]+)"/i)?.[1];
  if (!megaHtml.match(/data-id="([^"]*)"/) && frameSrc) {
    embedUrl = frameSrc.startsWith("http") ? frameSrc : `${MEGAPLAY}${frameSrc}`;
    megaHtml = await httpGet(embedUrl, { Referer: SPOOF_REF, "Accept-Language": "en-US,en;q=0.9" }).catch(() => "");
  }

  const attr = (name) => { const m = megaHtml.match(new RegExp(`data-${name}="([^"]*)"`)); return m ? m[1] : null; };
  const fileId = attr("id");

  // Step 2: If Megaplay didn't have a player, fallback to raw Anikoto extraction
  if (!fileId) {
    const raw = await extractRawAnikotoStreams(anilistId, audio, epNum);
    return {
      [audioKey]: {
        streams: raw.streams,
        subtitles: raw.subtitles,
        intro: raw.intro ?? { start: 0, end: 0 },
        outro: raw.outro ?? { start: 0, end: 0 },
        provider: "anikoto-direct",
      },
    };
  }

  // Step 3: Fast providers (Megaplay, VidWish, VidTube)
  const realId = attr("realid");
  const [megaSources, vidwishResult, vidtubeResult] = await Promise.allSettled([
    getJSON(`${MEGAPLAY}/stream/getSources?id=${fileId}&id=${fileId}`, { Referer: `${MEGAPLAY}/`, "X-Requested-With": "XMLHttpRequest" }),
    realId ? extractVidWish(realId, audio) : Promise.resolve(null),
    getJSON(`${VIDTUBE}/stream/getSources?id=${fileId}&id=${fileId}`, { Referer: `${VIDTUBE}/`, "X-Requested-With": "XMLHttpRequest" }).catch(() => null),
  ]);

  const mega    = megaSources.status  === "fulfilled" ? megaSources.value  : null;
  const vidwish = vidwishResult.status === "fulfilled" ? vidwishResult.value : null;
  const vidtube = vidtubeResult.status === "fulfilled" ? vidtubeResult.value : null;

  // Build streams list (priority ordered)
  const streams = [];
  if (mega?.sources?.file) {
    streams.push({ url: mega.sources.file, type: "hls", referer: `${MEGAPLAY}/`, server: "Megaplay", priority: 5, default: true });
  }
  streams.push({ url: embedUrl, type: "embed", referer: `${MEGAPLAY}/`, server: "Megaplay-embed", priority: 4 });
  
  if (vidtube?.sources?.file) {
    streams.push({ url: vidtube.sources.file, type: "hls", referer: `${VIDTUBE}/`, server: "Vidtube", priority: 5 });
    streams.push({ url: `${VIDTUBE}/stream/ani/${anilistId}/${epNum}/${audio}`, type: "embed", referer: `${VIDTUBE}/`, server: "Vidtube-embed", priority: 4 });
  }

  if (vidwish?.data?.sources?.file) {
    streams.push({ url: vidwish.data.sources.file, type: "hls", referer: `${VIDWISH}/`, server: "VidWish", priority: 4 });
  }
  if (realId) {
    streams.push({ url: `${VIDWISH}/stream/s-2/${realId}/${audio}`, type: "embed", referer: `${VIDWISH}/`, server: "VidWish-embed", priority: 3 });
  }

  // Step 4: Slow Mapper fallback ONLY if fast providers yielded no HLS streams
  let mapper = null;
  const hasFastHls = streams.some(s => s.type === "hls");
  if (!hasFastHls) {
    try {
      const anizip = await getJSON(`${ANIZIP}?anilist_id=${anilistId}`);
      const enTitle = anizip.titles?.en ?? Object.values(anizip.titles ?? {})[0] ?? "";
      const malId = anizip.mappings?.mal_id;
      const jikanShow = malId ? await getJSON(`${JIKAN}/anime/${malId}`).catch(() => null) : null;
      const { showId } = await findAnikotoShow(enTitle, jikanShow);
      const listData = await getJSON(`${ANIKOTO}/ajax/episode/list/${showId}`, { "X-Requested-With": "XMLHttpRequest", Referer: `${ANIKOTO}/` });
      const ep = extractEpisodes(listData.result ?? "").find((e) => e.num === epNum);
      if (ep?.mal && ep?.slug && ep?.timestamp) {
        mapper = await getJSON(`${MAPPER}/${ep.mal}/${ep.slug}/${ep.timestamp}`, { Referer: `${ANIKOTO}/` });
      }
    } catch {}
  }

  if (mapper) {
    const { status: _s, ...providers } = mapper;
    for (const [name, data] of Object.entries(providers)) {
      if (/^kiwi.?stream/i.test(name)) continue;
      const url = audio === "sub" ? data.sub?.url : data.dub?.url;
      if (url) streams.push({ url, type: "embed", referer: `${ANIKOTO}/`, server: name, priority: 2 });
    }
  }

  // Build subtitles
  const subtitles = [
    ...(mega?.tracks ?? []).map((t) => mapTrack(t, "Megaplay")),
    ...(vidwish?.data?.tracks ?? []).map((t) => mapTrack(t, "VidWish")),
  ];

  return {
    [audioKey]: {
      streams,
      subtitles,
      intro: mega?.intro ?? vidwish?.sources?.intro ?? { start: 0, end: 0 },
      outro: mega?.outro ?? vidwish?.sources?.outro ?? { start: 0, end: 0 },
      provider: "megaplay+vidwish",
    },
  };
}

// ─── Paginated Episodes Handler (single page) ───────────────────────────────

/**
 * Get episodes for an anime (single page, with pagination info).
 * This mirrors the Anivexa-API handleEpisodes endpoint.
 */
async function handleEpisodes(anilistId, page = 1) {
  const anizip = await getJSON(`${ANIZIP}?anilist_id=${anilistId}`);
  const malId = anizip.mappings?.mal_id;
  if (!malId) throw new Error("Could not find MAL ID from AniZip");
  const enTitle = anizip.titles?.en ?? Object.values(anizip.titles ?? {})[0] ?? "";

  const [jikanEps, jikanShow] = await Promise.all([
    getJSON(`${JIKAN}/anime/${malId}/episodes?page=${page}`),
    getJSON(`${JIKAN}/anime/${malId}`).catch(() => null),
  ]);
  if (!jikanEps.data?.length) throw new Error(`No episodes found on Jikan for MAL ID ${malId}`);

  let anikotoEpMap = new Map();
  try {
    const { showId } = await findAnikotoShow(enTitle, jikanShow);
    const listData = await getJSON(`${ANIKOTO}/ajax/episode/list/${showId}`, { "X-Requested-With": "XMLHttpRequest", Referer: `${ANIKOTO}/` });
    extractEpisodes(listData.result ?? "").forEach((e) => anikotoEpMap.set(e.num, { hasSub: e.hasSub, hasDub: e.hasDub }));
  } catch {}

  const hasSubFallback = anikotoEpMap.size === 0;
  const hasDubFallback = anikotoEpMap.size === 0;

  const episodes = jikanEps.data.map((ep) => {
    const epNum = ep.mal_id;
    const meta = anizip.episodes?.[String(epNum)] ?? {};
    const avail = anikotoEpMap.get(epNum);
    return {
      id: `watch/anikoto/${anilistId}/sub/anikoto-${epNum}`,
      number: epNum,
      title: ep.title ?? meta.title?.en ?? `Episode ${epNum}`,
      titleJapanese: ep.title_japanese ?? null,
      titleRomanji: ep.title_romanji ?? null,
      image: meta.image ?? null,
      airDate: ep.aired ?? meta.airDate ?? null,
      duration: meta.runtime ? meta.runtime * 60 : null,
      score: ep.score ?? null,
      filler: ep.filler,
      recap: ep.recap,
      description: meta.overview ?? null,
      hasSub: hasSubFallback ? true : (avail?.hasSub ?? false),
      hasDub: hasDubFallback ? false : (avail?.hasDub ?? false),
    };
  });

  return {
    episodes,
    pagination: {
      currentPage: page,
      lastPage: jikanEps.pagination.last_visible_page,
      hasNextPage: jikanEps.pagination.has_next_page,
    },
  };
}

// ─── Full Episodes Handler (AniList ID → rich episode list) ──────────────────

/**
 * Get all episodes for an anime using AniList ID.
 * Returns sub/dub episode lists with metadata from Jikan + AniZip + Anikoto.
 */
async function getEpisodes(anilistId, ctx = {}) {
  const anizip = ctx.anizip ?? await getJSON(`${ANIZIP}?anilist_id=${anilistId}`);
  const malId  = ctx.media?.idMal ?? anizip.mappings?.mal_id ?? null;
  const enTitle = anizip.titles?.en
    ?? ctx.media?.title?.english
    ?? ctx.media?.title?.romaji
    ?? Object.values(anizip.titles ?? {})[0]
    ?? "";

  const jikanShow = malId
    ? (ctx.media ? { data: { title: ctx.media.title.romaji, title_english: ctx.media.title.english, title_japanese: ctx.media.title.native, year: ctx.media.seasonYear, type: ctx.media.format } }
      : await getJSON(`${JIKAN}/anime/${malId}`).catch(() => null))
    : (ctx.media ? { data: { title: ctx.media.title.romaji, title_english: ctx.media.title.english, title_japanese: ctx.media.title.native, year: ctx.media.seasonYear, type: ctx.media.format } }
      : null);

  // No MAL ID → use AniZip episodes as source
  if (!malId) {
    const anizipEps = anizip?.episodes ? Object.entries(anizip.episodes) : [];
    if (!anizipEps.length) throw new Error("Could not find MAL ID and no AniZip episodes available");

    let anikotoEpMap = new Map();
    if (enTitle) {
      try {
        const { showId } = await findAnikotoShow(enTitle, jikanShow);
        const listData = await getJSON(`${ANIKOTO}/ajax/episode/list/${showId}`, { "X-Requested-With": "XMLHttpRequest", Referer: `${ANIKOTO}/` });
        extractEpisodes(listData.result ?? "").forEach((e) => anikotoEpMap.set(e.num, { hasSub: e.hasSub, hasDub: e.hasDub }));
      } catch {}
    }
    const hasSubFallback = anikotoEpMap.size === 0;
    const hasDubFallback = anikotoEpMap.size === 0;
    const sub = [], dub = [];
    for (const [epKey, meta] of anizipEps) {
      const epNum = parseInt(epKey);
      if (isNaN(epNum)) continue;
      const avail = anikotoEpMap.get(epNum);
      const epHasSub = hasSubFallback ? true : (avail?.hasSub ?? false);
      const epHasDub = hasDubFallback ? true : (avail?.hasDub ?? false);
      const base = {
        number: epNum,
        title: meta.title?.en ?? meta.title?.["x-jat"] ?? `Episode ${epNum}`,
        duration: meta.runtime ? meta.runtime * 60 : null,
        filler: meta.filler ?? false, uncensored: false,
        description: meta.overview ?? null, image: meta.image ?? null,
        airDate: meta.airdate ?? null, hasSub: epHasSub, hasDub: epHasDub,
      };
      if (epHasSub) sub.push({ id: `watch/anikoto/${anilistId}/sub/anikoto-${epNum}`, ...base, audio: "sub" });
      if (epHasDub) dub.push({ id: `watch/anikoto/${anilistId}/dub/anikoto-${epNum}`, ...base, audio: "dub" });
    }
    sub.sort((a, b) => a.number - b.number);
    dub.sort((a, b) => a.number - b.number);
    return { meta: { malId: null }, episodes: { sub, dub } };
  }

  // Has MAL ID → fetch Jikan episodes and Anikoto episodes concurrently
  const [allEps, anikotoData] = await Promise.all([
    (async () => {
      if (ctx.jikanEps) return ctx.jikanEps;
      const first = await getJSON(`${JIKAN}/anime/${malId}/episodes?page=1`).catch(() => ({ data: [], pagination: {} }));
      const lastPage = first.pagination?.last_visible_page ?? 1;
      let eps = [...(first.data ?? [])];
      if (lastPage > 1) {
        const rest = await Promise.all(
          Array.from({ length: lastPage - 1 }, (_, i) => getJSON(`${JIKAN}/anime/${malId}/episodes?page=${i + 2}`))
        );
        for (const r of rest) eps = eps.concat(r.data ?? []);
      }
      return eps;
    })(),
    (async () => {
      let list = [];
      let map = new Map();
      try {
        const { showId } = await findAnikotoShow(enTitle, jikanShow);
        const listData = await getJSON(`${ANIKOTO}/ajax/episode/list/${showId}`, { "X-Requested-With": "XMLHttpRequest", Referer: `${ANIKOTO}/` });
        list = extractEpisodes(listData.result ?? "");
        list.forEach((e) => map.set(e.num, { hasSub: e.hasSub, hasDub: e.hasDub }));
      } catch {}
      return { list, map };
    })()
  ]);

  let anikotoEpList = anikotoData.list;
  let anikotoEpMap = anikotoData.map;

  // Fallback: if Jikan has no episodes, build from Anikoto + AniZip
  if (!allEps.length && anikotoEpList.length) {
    const sub = [], dub = [];
    for (const ep of anikotoEpList) {
      const meta = anizip.episodes?.[String(ep.num)] ?? {};
      const base = {
        number: ep.num,
        title: meta.title?.en ?? meta.title?.["x-jat"] ?? `Episode ${ep.num}`,
        duration: meta.runtime ? meta.runtime * 60 : null,
        filler: false, uncensored: false,
        description: meta.overview ?? null,
        image: meta.image ?? null,
        airDate: meta.airdate ?? null,
        hasSub: ep.hasSub, hasDub: ep.hasDub,
      };
      if (ep.hasSub) sub.push({ id: `watch/anikoto/${anilistId}/sub/anikoto-${ep.num}`, ...base, audio: "sub" });
      if (ep.hasDub) dub.push({ id: `watch/anikoto/${anilistId}/dub/anikoto-${ep.num}`, ...base, audio: "dub" });
    }
    sub.sort((a, b) => a.number - b.number);
    dub.sort((a, b) => a.number - b.number);
    return { meta: { malId }, episodes: { sub, dub } };
  }

  const hasSubFallback = anikotoEpMap.size === 0;
  const hasDubFallback = anikotoEpMap.size === 0;
  const sub = [], dub = [];

  for (const ep of allEps) {
    const epNum = ep.mal_id;
    const meta = anizip.episodes?.[String(epNum)] ?? {};
    const avail = anikotoEpMap.get(epNum);
    const epHasSub = hasSubFallback ? true : (avail?.hasSub ?? false);
    const epHasDub = hasDubFallback ? true : (avail?.hasDub ?? false);
    const base = {
      number: epNum,
      title: ep.title ?? meta.title?.en ?? `Episode ${epNum}`,
      titleJapanese: ep.title_japanese ?? null,
      titleRomanji: ep.title_romanji ?? null,
      image: meta.image ?? null,
      airDate: ep.aired ?? meta.airDate ?? null,
      duration: meta.runtime ? meta.runtime * 60 : null,
      score: ep.score ?? null,
      filler: ep.filler, recap: ep.recap,
      description: meta.overview ?? null,
      hasSub: epHasSub, hasDub: epHasDub,
    };
    if (epHasSub) sub.push({ id: `watch/anikoto/${anilistId}/sub/anikoto-${epNum}`, ...base, audio: "sub" });
    if (epHasDub) dub.push({ id: `watch/anikoto/${anilistId}/dub/anikoto-${epNum}`, ...base, audio: "dub" });
  }

  return { meta: { malId }, episodes: { sub, dub } };
}

// ─── Slug → Info Resolver ────────────────────────────────────────────────────

/**
 * Resolve an Anikoto slug to show info (AniList ID, MAL ID, title, episodes).
 * This allows the frontend to work without knowing the AniList ID upfront.
 */
async function getInfoBySlug(slug) {
  // Step 1: Fetch the show page to get showId
  const pageHtml = await httpGet(`${ANIKOTO}/watch/${slug}`, { Referer: `${ANIKOTO}/` });
  const idM = pageHtml.match(/data-id="(\d+)"/);
  if (!idM) throw new Error(`Could not find show ID for slug: ${slug}`);
  const showId = idM[1];

  // Extract title from page — use <title> tag: "Watch [Title] in HD Online for Free - Anikoto"
  const titleM = pageHtml.match(/<title>Watch\s+(.+?)\s+in HD Online/);
  const jpTitleM = pageHtml.match(/data-jp="([^"]*)"/);
  const title = titleM ? titleM[1].trim() : (jpTitleM ? jpTitleM[1].trim() : slug);

  // Step 2: Get episode list
  const listData = await getJSON(
    `${ANIKOTO}/ajax/episode/list/${showId}`,
    { "X-Requested-With": "XMLHttpRequest", Referer: `${ANIKOTO}/watch/${slug}` }
  );
  const episodes = extractEpisodes(listData.result ?? "");

  // Step 3: Get MAL ID from episode data
  const malId = episodes.find(e => e.mal)?.mal || null;

  // Step 4: Reverse lookup AniList ID via AniZip
  let anilistId = null;
  if (malId) {
    try {
      const anizip = await getJSON(`${ANIZIP}?mal_id=${malId}`);
      anilistId = anizip.mappings?.anilist_id ?? null;
    } catch {}
  }

  return {
    slug,
    showId,
    title,
    titleJp: jpTitleM ? jpTitleM[1].trim() : "",
    malId: malId ? parseInt(malId) : null,
    anilistId,
    totalEpisodes: episodes.length,
    hasSub: episodes.some(e => e.hasSub),
    hasDub: episodes.some(e => e.hasDub),
  };
}

// ─── Exports ─────────────────────────────────────────────────────────────────
module.exports = {
  searchAnikoto,
  findAnikotoShow,
  getAnikotoEpisode,
  extractRawAnikotoStreams,
  getWatch,
  getEpisodes,
  handleEpisodes,
  extractEmbedSource,
  extractVidWish,
  getInfoBySlug,
};

// ─── Test Runner ─────────────────────────────────────────────────────────────
async function runTest() {
  console.log("╔══════════════════════════════════════════════════════════════╗");
  console.log("║        ANIKOTO SCRAPER — Full Feature Test                  ║");
  console.log("╚══════════════════════════════════════════════════════════════╝\n");

  // Test 1: Search
  console.log("━━━ TEST 1: Search Anime ━━━");
  const results = await searchAnikoto("Naruto");
  console.log(`Found ${results.length} results. Top 3:`);
  results.slice(0, 3).forEach((r, i) => console.log(`  ${i + 1}. ${r.titleEn || r.slug} (${r.year || "?"}) [${r.type || "?"}]`));

  // Test 2: Smart Find (using AniList ID for "One Punch Man" = 21087)
  console.log("\n━━━ TEST 2: Smart Find via AniList ID ━━━");
  const anilistId = 21087; // One Punch Man
  console.log(`AniList ID: ${anilistId} (One Punch Man)`);

  try {
    const anizip = await getJSON(`${ANIZIP}?anilist_id=${anilistId}`);
    const enTitle = anizip.titles?.en ?? Object.values(anizip.titles ?? {})[0] ?? "";
    const malId = anizip.mappings?.mal_id;
    console.log(`  Resolved: "${enTitle}" (MAL ID: ${malId})`);

    const jikanShow = malId ? await getJSON(`${JIKAN}/anime/${malId}`).catch(() => null) : null;
    const { slug, showId } = await findAnikotoShow(enTitle, jikanShow);
    console.log(`  Anikoto Match: slug="${slug}", showId=${showId}`);

    // Test 3: Get Episode List
    console.log("\n━━━ TEST 3: Episode List ━━━");
    const listData = await getJSON(`${ANIKOTO}/ajax/episode/list/${showId}`, { "X-Requested-With": "XMLHttpRequest", Referer: `${ANIKOTO}/` });
    const episodes = extractEpisodes(listData.result ?? "");
    console.log(`  Total episodes: ${episodes.length}`);
    if (episodes.length > 0) {
      console.log(`  Episode 1: num=${episodes[0].num}, hasSub=${episodes[0].hasSub}, hasDub=${episodes[0].hasDub}`);
    }

    // Test 4: Get Watch (full streams + subtitles + intro/outro)
    if (episodes.length > 0) {
      console.log("\n━━━ TEST 4: Full Watch (m3u8 + Subtitles + Skip Times) ━━━");
      console.log("  Fetching streams for Episode 1 (SUB)... (this takes a few seconds)");
      const watchData = await getWatch(anilistId, "sub", 1);
      const key = Object.keys(watchData)[0];
      const result = watchData[key];

      console.log(`\n  Provider: ${result.provider}`);
      console.log(`  Streams found: ${result.streams.length}`);
      result.streams.forEach((s) => {
        const urlShort = s.url.length > 80 ? s.url.substring(0, 77) + "..." : s.url;
        console.log(`    [${s.type.toUpperCase()}] ${s.server} (priority:${s.priority}) → ${urlShort}`);
      });
      console.log(`\n  Subtitles found: ${result.subtitles.length}`);
      result.subtitles.slice(0, 3).forEach((s) => console.log(`    ${s.label} (${s.language}) → ${s.file.substring(0, 60)}...`));
      console.log(`\n  Intro: ${JSON.stringify(result.intro)}`);
      console.log(`  Outro: ${JSON.stringify(result.outro)}`);
    }
  } catch (err) {
    console.error("Error:", err.message);
  }

  console.log("\n✅ All tests completed!");
}

// Run if called directly
if (require.main === module) {
  runTest().catch(console.error);
}
