// Fetches every feed listed in sources.yaml and merges new items into data/items.json.
//
// The archive only ever grows: Substack feeds expose ~20 recent posts, so history
// accumulates here across runs. A failed source keeps its existing items.
//
// Env:
//   FEED_PROXY   proxy to route Substack fetches through (optional; direct fetch if unset).
//                Either a base URL (worker/ in this repo: https://x.workers.dev) or a full
//                prefix ending in "url=" (e.g. https://smallweb-rss.pages.dev/api/fetch-rss?url=)
//   PROXY_KEY    shared secret sent as x-proxy-key (needed by worker/, ignored by others)
//   YT_API_KEY   optional YouTube Data API v3 key. Without it, channels are read from their
//                public RSS (latest 15 videos, no durations), which is enough at a 30-min cadence.
//   BACKFILL     pages of Substack archive to walk for a source with no history (default 8 ≈ 200 posts)
//   FULL_BACKFILL=1  walk every Substack's entire archive, even for sources with history. Run this
//                once from a normal connection (not CI): Substack rate-limits its archive API from
//                datacenter and proxy IPs.

import { readFile, writeFile } from 'node:fs/promises';
import { parse as parseYaml } from 'yaml';
import { XMLParser } from 'fast-xml-parser';
import { loadText, putText, saveText, htmlToText } from './textstore.mjs';

const ROOT = new URL('../', import.meta.url);
const ITEMS_PATH = new URL('data/items.json', ROOT);
const STATUS_PATH = new URL('data/status.json', ROOT);
const SECTIONS_PATH = new URL('data/sections.json', ROOT);

const { FEED_PROXY, PROXY_KEY, YT_API_KEY } = process.env;
const FULL = process.env.FULL_BACKFILL === '1';
const BACKFILL = FULL ? Infinity : Number(process.env.BACKFILL ?? 8);
const UA = 'Mozilla/5.0 (compatible; ZerodhaContentHub/1.0; +https://github.com)';
const PAGE = 25; // Substack's archive API caps a page at roughly this

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---------- HTTP ----------

async function fetchOnce(url, viaProxy) {
  const prefix = /url=$/.test(FEED_PROXY ?? '') ? FEED_PROXY : `${(FEED_PROXY ?? '').replace(/\/$/, '')}/?url=`;
  const target = viaProxy ? prefix + encodeURIComponent(url) : url;
  const headers = { 'User-Agent': UA, Accept: '*/*' };
  if (viaProxy && PROXY_KEY) headers['x-proxy-key'] = PROXY_KEY;
  const res = await fetch(target, { headers, signal: AbortSignal.timeout(30_000) });
  if (!res.ok) {
    const err = new Error(`HTTP ${res.status} for ${url}${viaProxy ? ' (via proxy)' : ''}`);
    err.status = res.status;
    throw err;
  }
  return res.text();
}

// Proxy first (Substack throttles datacenter IPs), then direct.
// 5xx and network errors are retried with backoff; a 429 moves straight to the next route,
// since a rate limit won't clear in a few seconds.
async function get(url, { proxy = true, directFirst = false } = {}) {
  const routes = !proxy || !FEED_PROXY ? [false] : directFirst ? [false, true] : [true, false];
  let last;
  for (const viaProxy of routes) {
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        return await fetchOnce(url, viaProxy);
      } catch (e) {
        last = e;
        const transient = !e.status || e.status >= 500;
        if (!transient || attempt === 2) {
          if (routes.length > 1 && viaProxy === routes[0]) console.warn(`  ${e.message}; trying ${viaProxy ? 'direct' : 'proxy'}`);
          break;
        }
        await sleep(1500 * 2 ** attempt);
      }
    }
  }
  throw last;
}

const getJson = async (url, opts) => JSON.parse(await get(url, opts));

// ---------- helpers ----------

const strip = (html = '') =>
  html.replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&quot;/g, '"')
    .replace(/&#39;|&#x27;/g, "'").replace(/\s+/g, ' ').trim();

const clip = (s = '', n = 220) => (s.length > n ? s.slice(0, s.lastIndexOf(' ', n)).trimEnd() + '…' : s);

// Shrink Substack CDN images to thumbnail width.
const substackThumb = (src) => {
  if (!src) return null;
  const inner = src.includes('substackcdn.com/image/fetch/') ? src.split(/\/fetch\/[^/]*\//)[1] ?? src : src;
  const raw = inner.startsWith('http') ? encodeURIComponent(decodeURIComponent(inner)) : inner;
  return `https://substackcdn.com/image/fetch/w_264,h_148,c_fill,f_auto,q_auto:good/${raw}`;
};

// ISO-8601 duration -> seconds
const isoSeconds = (d = '') => {
  const m = d.match(/P(?:(\d+)D)?T?(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  if (!m) return 0;
  return (+m[1] || 0) * 86400 + (+m[2] || 0) * 3600 + (+m[3] || 0) * 60 + (+m[4] || 0);
};

// ---------- Substack ----------

// Section names live only in the homepage's preload blob. They are cached in data/sections.json
// and refreshed only when a post carries a section id we haven't seen, to keep requests low.
let sectionCache = {};

async function refreshSections(base) {
  try {
    const html = await get(base + '/');
    const m = html.match(/window\._preloads\s*=\s*JSON\.parse\(("(?:[^"\\]|\\.)*")\)/);
    const pub = JSON.parse(JSON.parse(m[1])).pub;
    sectionCache[base] = Object.fromEntries((pub.sections ?? []).map((s) => [s.id, s.name]));
  } catch (e) {
    console.warn(`  could not read sections for ${base}: ${e.message}`);
  }
}

function fromArchivePost(post, base, ctx) {
  return {
    id: `substack:${post.canonical_url}`,
    url: post.canonical_url,
    title: post.title?.trim(),
    summary: clip(strip(post.subtitle || post.description || post.truncated_body_text || '')),
    date: new Date(post.post_date).toISOString(),
    image: substackThumb(post.cover_image),
    format: post.type === 'podcast' ? 'audio' : post.type === 'video' ? 'video' : 'read',
    section: sectionCache[base]?.[post.section_id] ?? null,
    paid: post.audience === 'only_paid',
    enriched: true,
    ...ctx,
  };
}

async function archivePage(base, offset) {
  const batch = await getJson(`${base}/api/v1/archive?sort=new&offset=${offset}&limit=${PAGE}`);
  if (!Array.isArray(batch)) throw new Error('archive API returned no list');
  if (batch.some((p) => p.section_id && !sectionCache[base]?.[p.section_id])) await refreshSections(base);
  return batch.filter((p) => p.canonical_url && p.post_date);
}

// Substack: /feed is the endpoint built for polling, so steady-state runs use it alone.
// The archive API (sections, covers, paid flag, history beyond 20 posts) is heavier and
// more aggressively rate-limited, so it is called only to backfill a new source or to
// enrich posts that arrived via /feed. If enrichment is throttled, the next run retries it.
async function fetchSubstack(prop, ctx, existing) {
  const base = new URL(prop.url).origin;

  if (!existing.size || FULL) {
    const out = [];
    try {
      // Substack returns fewer posts than `limit` (23 for 25), so advance by what came back.
      for (let p = 0, offset = 0; p < BACKFILL; p++) {
        const batch = await archivePage(base, offset);
        if (!batch.length) break;
        offset += batch.length;
        out.push(...batch.map((post) => fromArchivePost(post, base, ctx)));
        if (FULL && p % 10 === 9) console.log(`    ${out.length} posts so far`);
        await sleep(1500);
      }
    } catch (e) {
      console.warn(`  backfill stopped: ${e.message}`);
    }
    if (out.length) return out;
  }

  const items = await fetchRss(prop.feed ?? `${base}/feed`, prop, ctx);
  const pending = items.filter((it) => !existing.get(it.url)?.enriched);
  if (!pending.length) return items;
  try {
    const posts = new Map((await archivePage(base, 0)).map((p) => [p.canonical_url, p]));
    return items.map((it) => (posts.has(it.url) ? { ...it, ...fromArchivePost(posts.get(it.url), base, ctx) } : it));
  } catch (e) {
    console.warn(`  enrichment deferred (${e.message})`);
    return items;
  }
}

// ---------- generic RSS / Atom ----------

const xml = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '@', cdataPropName: false });
const arr = (x) => (x == null ? [] : Array.isArray(x) ? x : [x]);
const text = (x) => (typeof x === 'object' && x !== null ? x['#text'] ?? '' : x ?? '');

async function fetchRss(feedUrl, prop, ctx) {
  const doc = xml.parse(await get(feedUrl));
  if (doc.rss) {
    return arr(doc.rss.channel?.item).map((it) => {
      const url = text(it.link);
      return {
        id: `rss:${text(it.guid) || url}`,
        url,
        title: strip(text(it.title)),
        summary: clip(strip(text(it.description)).replace(/The post .* appeared first on .*$/, '').trim()),
        date: new Date(text(it.pubDate)).toISOString(),
        image: it.enclosure?.['@url'] ? substackThumb(it.enclosure['@url']) : null,
        format: 'read',
        section: null,
        _text: htmlToText(text(it['content:encoded']) || text(it.description)),
        ...ctx,
      };
    });
  }
  if (doc.feed) {
    return arr(doc.feed.entry).map((e) => {
      const link = arr(e.link).find((l) => !l['@rel'] || l['@rel'] === 'alternate')?.['@href'];
      return {
        id: `atom:${text(e.id) || link}`,
        url: link,
        title: strip(text(e.title)),
        summary: clip(strip(text(e.summary) || text(e.content))),
        date: new Date(text(e.published) || text(e.updated)).toISOString(),
        image: null,
        format: 'read',
        section: null,
        ...ctx,
      };
    });
  }
  throw new Error(`Unrecognised feed format at ${feedUrl}`);
}

// ---------- YouTube ----------

// A description's first useful line: skip promo lines (links, sign-up pitches).
const firstLine = (desc = '') => desc.split('\n').map((l) => l.trim()).find((l) => l && !/https?:\/\//.test(l)) ?? '';

async function fetchYouTubeRss(prop, ctx) {
  const feed = `https://www.youtube.com/feeds/videos.xml?channel_id=${prop.channel_id}`;
  const doc = xml.parse(await get(feed, { directFirst: true }));
  return arr(doc.feed?.entry).map((e) => {
    const id = text(e['yt:videoId']);
    const link = arr(e.link).find((l) => l['@rel'] === 'alternate')?.['@href'] ?? '';
    return {
      id: `youtube:${id}`,
      url: `https://www.youtube.com/watch?v=${id}`,
      title: strip(text(e.title)),
      summary: clip(firstLine(text(e['media:group']?.['media:description'])), 160),
      _text: text(e['media:group']?.['media:description']),
      date: new Date(text(e.published)).toISOString(),
      image: `https://i.ytimg.com/vi/${id}/mqdefault.jpg`,
      format: 'video',
      // The feed links Shorts as /shorts/<id>.
      short: link.includes('/shorts/'),
      section: null,
      ...ctx,
    };
  });
}

// With an API key: up to 50 recent uploads with exact durations and live-stream handling.
async function fetchYouTubeApi(prop, ctx) {
  const uploads = 'UU' + prop.channel_id.slice(2);
  const api = 'https://www.googleapis.com/youtube/v3';
  const list = await getJson(
    `${api}/playlistItems?part=contentDetails&maxResults=50&playlistId=${uploads}&key=${YT_API_KEY}`,
    { proxy: false },
  );
  const ids = list.items.map((i) => i.contentDetails.videoId);
  if (!ids.length) return [];
  const vids = await getJson(
    `${api}/videos?part=snippet,contentDetails,liveStreamingDetails,status&id=${ids.join(',')}&key=${YT_API_KEY}`,
    { proxy: false },
  );
  return vids.items
    .filter((v) => v.status?.privacyStatus === 'public' && v.snippet.liveBroadcastContent !== 'upcoming')
    .map((v) => {
      const secs = isoSeconds(v.contentDetails.duration);
      return {
        id: `youtube:${v.id}`,
        url: `https://www.youtube.com/watch?v=${v.id}`,
        title: v.snippet.title,
        summary: clip(firstLine(v.snippet.description), 160),
        _text: v.snippet.description,
        date: new Date(v.liveStreamingDetails?.actualStartTime ?? v.snippet.publishedAt).toISOString(),
        image: `https://i.ytimg.com/vi/${v.id}/mqdefault.jpg`,
        format: 'video',
        // Shorts can run up to 3 minutes.
        short: secs > 0 && secs <= 180,
        duration: secs,
        section: null,
        ...ctx,
      };
    });
}

async function fetchYouTube(prop, ctx) {
  if (YT_API_KEY) {
    try {
      return await fetchYouTubeApi(prop, ctx);
    } catch (e) {
      console.warn(`  YouTube API failed (${e.message}); using RSS`);
    }
  }
  return fetchYouTubeRss(prop, ctx);
}

// ---------- main ----------

async function main() {
  const sources = parseYaml(await readFile(new URL('sources.yaml', ROOT), 'utf8'));
  const archive = JSON.parse(await readFile(ITEMS_PATH, 'utf8'));
  const byId = new Map(archive.map((i) => [i.id, i]));
  const byUrl = new Map(archive.map((i) => [i.url, i.id]));
  sectionCache = JSON.parse(await readFile(SECTIONS_PATH, 'utf8').catch(() => '{}'));
  const textShards = await loadText();
  const status = { generated: new Date().toISOString(), sources: [] };

  for (const ini of sources.initiatives) {
    for (const prop of ini.properties) {
      const fetchable =
        (prop.type === 'youtube' && prop.channel_id) ||
        (['newsletter', 'blog'].includes(prop.type) && (prop.feed || prop.url)?.startsWith('http'));
      if (!fetchable) continue;

      const ctx = { initiative: ini.id, source: prop.name, sourceType: prop.type };
      const existing = new Map(archive.filter((i) => i.source === prop.name).map((i) => [i.url, i]));
      const started = Date.now();
      try {
        let items;
        if (prop.type === 'youtube') items = await fetchYouTube(prop, ctx);
        else if (/substack\.com|\.zerodha\.com/.test(new URL(prop.url).host) && prop.type === 'newsletter')
          items = await fetchSubstack(prop, ctx, existing);
        else items = await fetchRss(prop.feed, prop, ctx);

        let added = 0;
        for (const it of items) {
          if (!it.url || !it.title || Number.isNaN(Date.parse(it.date))) continue;
          // Same post can arrive via API and RSS with different ids; URL is the stable key.
          const existingId = byUrl.get(it.url);
          const id = existingId ?? it.id;
          if (!byId.has(id)) added++;
          // Full text goes to the search-only text store, not the archive.
          const { _text, ...fields } = it;
          // Fill fields but never blank them: an RSS fallback lacks sections and images.
          const merged = { ...byId.get(id) };
          for (const [k, v] of Object.entries(fields)) if (v != null && v !== '') merged[k] = v;
          byId.set(id, { ...merged, id });
          byUrl.set(it.url, id);
          if (_text) putText(textShards, { id, date: merged.date }, _text);
        }
        console.log(`✓ ${prop.name}: ${items.length} fetched, ${added} new`);
        status.sources.push({ name: prop.name, ok: true, fetched: items.length, added, ms: Date.now() - started });
      } catch (e) {
        console.warn(`✗ ${prop.name}: ${e.message}`);
        status.sources.push({ name: prop.name, ok: false, error: e.message });
      }
      await sleep(1500);
    }
  }

  const items = [...byId.values()].sort((a, b) => b.date.localeCompare(a.date));
  await writeFile(ITEMS_PATH, JSON.stringify(items, null, 1) + '\n');
  await writeFile(STATUS_PATH, JSON.stringify(status, null, 1) + '\n');
  await writeFile(SECTIONS_PATH, JSON.stringify(sectionCache, null, 1) + '\n');
  await saveText(textShards);

  const failed = status.sources.filter((s) => !s.ok);
  console.log(`\n${items.length} items in archive; ${failed.length}/${status.sources.length} sources failed`);
  // Fail the run only if everything failed: the build would otherwise publish stale data silently.
  if (status.sources.length && failed.length === status.sources.length) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
