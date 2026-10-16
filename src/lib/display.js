// Display preparation shared by the site (src/lib/data.js) and the search index (scripts/build-search.mjs).
// Feeds, sitemaps and JSON-LD use `items` as fetched. The on-page stream uses `displayItems`:
//  1. Video titles lose segments that repeat across a channel ("The Daily Brief #571",
//     "The Long & The Short Ep. 56") and date stamps; the series name becomes the item's section.
//  2. A newsletter post and the video of the same story (same initiative, within 20 hours,
//     similar headline) become one entry with both links, so a story isn't listed twice.

const normSeg = (s) => s.toLowerCase().replace(/\d+/g, '#').replace(/\s+/g, ' ').trim();
const isDateSeg = (s) => /^\s*\d{1,2}(st|nd|rd|th)?\s+[a-z]+\s+\d{4}\b/i.test(s);
const seriesName = (s) => s.replace(/\s*(#\s*\d+|ep(isode)?\.?\s*\d+|part\s*\d+)\s*$/i, '').trim();

// Clutter that no channel means as part of the headline: hashtags and emoji trailing a video title,
// and a summary that only restates the title (80% or more of its words are in the title).
const TRAILING_JUNK = /(\s*(#[\p{L}\p{N}_]+|\p{Extended_Pictographic}|\uFE0F|\u200D))+\s*$/u;
const words = (s) => s.toLowerCase().replace(/[^\p{L}\p{N}₹ ]/gu, ' ').split(/\s+/).filter((w) => w.length > 2);
function tidy(it) {
  const title = it.format === 'video' ? it.title.replace(TRAILING_JUNK, '').trim() || it.title : it.title;
  let summary = it.summary;
  if (summary) {
    const t = new Set(words(title)), w = words(summary.replace(/(\.\.\.|…)$/, ''));
    if (w.length && w.filter((x) => t.has(x)).length / w.length >= 0.8) summary = null;
  }
  return title === it.title && summary === it.summary ? it : { ...it, title, summary };
}

export function cleanTitles(list) {
  const freq = new Map();
  for (const it of list) if (it.format === 'video') for (const seg of it.title.split(' | ').slice(1)) {
    const k = `${it.source}\u0000${normSeg(seg)}`;
    freq.set(k, (freq.get(k) ?? 0) + 1);
  }
  return list.map((it) => {
    it = tidy(it);
    if (it.format !== 'video' || !it.title.includes(' | ')) return it;
    const [first, ...rest] = it.title.split(' | ');
    const keep = [first], drop = [];
    for (const s of rest) ((freq.get(`${it.source}\u0000${normSeg(s)}`) ?? 0) >= 3 || isDateSeg(s) ? drop : keep).push(s);
    const recurring = drop.find((s) => !isDateSeg(s));
    return { ...it, title: keep.join(' | '), section: it.section ?? (recurring ? seriesName(recurring) : null) };
  });
}

const STOP = new Set('the a an of to in on and for is are why how what with from at by its it this that be as or ft'.split(' '));
const headTokens = (t) => new Set(t.split(' | ')[0].toLowerCase().replace(/[^a-z0-9₹ ]/g, ' ').split(/\s+/).filter((w) => w.length > 2 && !STOP.has(w)));
const jaccard = (a, b) => { const n = [...a].filter((x) => b.has(x)).length; return n / (a.size + b.size - n || 1); };

export function mergeStories(list) {
  const videos = list.filter((i) => i.format === 'video' && !i.short);
  const used = new Set();
  const merged = new Map();
  for (const post of list.filter((i) => i.sourceType === 'newsletter')) {
    const tp = headTokens(post.title), t = Date.parse(post.date);
    let best = null, score = 0;
    for (const v of videos) {
      if (used.has(v.id) || v.initiative !== post.initiative || Math.abs(Date.parse(v.date) - t) > 20 * 3600e3) continue;
      const s = jaccard(tp, headTokens(v.title));
      if (s > score) { best = v; score = s; }
    }
    if (best && score >= 0.4) {
      used.add(best.id);
      merged.set(post.id, { ...post, formats: ['read', 'video'], also: [{ label: `Watch on ${best.source}`, url: best.url }] });
    }
  }
  return list.filter((i) => !used.has(i.id)).map((i) => merged.get(i.id) ?? i);
}

