// Build-time data: the source inventory (sources.yaml) and the fetched archive (data/items.json).
import { readFileSync, existsSync } from 'node:fs';
import { parse } from 'yaml';
import { pathToFileURL } from 'node:url';
import { cleanTitles, mergeStories, safeItems } from './display.js';

// Bundling relocates this module, so resolve from the project root (cwd) rather than import.meta.url.
const root = pathToFileURL(process.cwd() + '/');
const read = (p) => readFileSync(new URL(p, root), 'utf8');

export const sources = parse(read('sources.yaml'));
export const initiatives = sources.initiatives;
export const initiativeById = Object.fromEntries(initiatives.map((i) => [i.id, i]));

export const items = dropBoilerplate(safeItems(JSON.parse(read('data/items.json'))));

// Some publications open every post with the same intro ("Welcome to Aftermarket Report, ...").
// A summary that repeats across several posts of one source says nothing, so blank it.
function dropBoilerplate(list) {
  const key = (it) => `${it.source}\u0000${(it.summary || '').slice(0, 60)}`;
  const counts = new Map();
  for (const it of list) if (it.summary) counts.set(key(it), (counts.get(key(it)) ?? 0) + 1);
  return list.map((it) => (it.summary && counts.get(key(it)) >= 3 ? { ...it, summary: '' } : it));
}
export const status = existsSync(new URL('data/status.json', root))
  ? JSON.parse(read('data/status.json'))
  : { generated: new Date().toISOString(), sources: [] };

// Only initiatives that actually have items get a filter chip.
export const activeInitiatives = initiatives.filter((i) => items.some((it) => it.initiative === i.id));

export const TYPE_LABEL = {
  newsletter: 'Newsletter',
  youtube: 'YouTube',
  blog: 'Blog',
  web: 'Website',
  x: 'X',
  instagram: 'Instagram',
  linkedin: 'LinkedIn',
  whatsapp: 'WhatsApp',
  telegram: 'Telegram',
  podcast: 'Podcast',
};

const TZ = 'Asia/Kolkata';
const dayKeyFmt = new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' });
const dayLabelFmt = new Intl.DateTimeFormat('en-IN', { timeZone: TZ, weekday: 'long', day: 'numeric', month: 'long' });
const monthFmt = new Intl.DateTimeFormat('en-IN', { timeZone: TZ, month: 'long', year: 'numeric' });
const timeFmt = new Intl.DateTimeFormat('en-IN', { timeZone: TZ, hour: 'numeric', minute: '2-digit', hour12: true });

export const dayKey = (iso) => dayKeyFmt.format(new Date(iso));
export const dayLabel = (iso) => dayLabelFmt.format(new Date(iso));
export const monthLabel = (iso) => monthFmt.format(new Date(iso));
export const timeLabel = (iso) => timeFmt.format(new Date(iso)).replace(' ', ' ').toLowerCase();

export function groupBy(list, keyFn, labelFn) {
  const groups = [];
  for (const it of list) {
    const key = keyFn(it.date);
    if (groups.at(-1)?.key !== key) groups.push({ key, label: labelFn(it.date), items: [] });
    groups.at(-1).items.push(it);
  }
  return groups;
}

export const duration = (s) => {
  if (!s) return '';
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
  return h ? `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}` : `${m}:${String(sec).padStart(2, '0')}`;
};

// Join a path onto the deploy base (GitHub project pages live under /<repo>/).
export const url = (path = '') => `${import.meta.env.BASE_URL.replace(/\/$/, '')}/${path.replace(/^\//, '')}`;

// ---------- site identity (SEO / structured data) ----------

export const SITE_NAME = 'The Z Index';
export const SITE_DESCRIPTION =
  'An unofficial index of every newsletter, video and explainer Zerodha publishes: The Daily Brief, Varsity, ' +
  'Subtext, In The Money, Zero1, The Climate Brief and more, newest first. Not affiliated with Zerodha.';
// Shown in the footer of every page and in llms.txt.
export const DISCLAIMER = 'An unofficial index, not affiliated with or endorsed by Zerodha. Every entry links to the original.';

// Zerodha publishes the pieces this site indexes; it does not publish this site. So `publisher`
// is attached to items and initiatives in JSON-LD, never to the WebSite.
export const publisher = {
  '@type': 'Organization',
  '@id': 'https://zerodha.com/#organization',
  name: 'Zerodha',
  url: 'https://zerodha.com',
  sameAs: ['https://x.com/zerodhaonline', 'https://www.youtube.com/@zerodhaonline', 'https://www.linkedin.com/company/zerodha'],
};

// Absolute URL for a site path (needed in feeds, sitemaps and JSON-LD).
export const abs = (site, path = '') => new URL(url(path), site).toString();

// Collapse YAML folded text into one line.
export const oneLine = (s = '') => s.replace(/\s+/g, ' ').trim();

export const itemsFor = (id) => items.filter((i) => i.initiative === id);

// schema.org ItemList of pieces, for CollectionPage structured data.
export const itemListLd = (list) => ({
  '@type': 'ItemList',
  itemListOrder: 'https://schema.org/ItemListOrderDescending',
  numberOfItems: list.length,
  itemListElement: list.map((it, i) => ({
    '@type': 'ListItem',
    position: i + 1,
    item: {
      '@type': it.format === 'video' ? 'VideoObject' : 'Article',
      name: it.title,
      url: it.url,
      ...(it.format === 'video'
        ? { uploadDate: it.date, thumbnailUrl: it.image, description: it.summary || it.title }
        : { headline: it.title, datePublished: it.date, ...(it.image ? { image: it.image } : {}) }),
      isPartOf: { '@type': it.format === 'video' ? 'CreativeWorkSeries' : 'Periodical', name: it.source },
      publisher: { '@id': publisher['@id'] },
    },
  })),
});

// schema.org description of an initiative and where it publishes.
export const initiativeLd = (ini, site) => ({
  '@type': 'Organization',
  '@id': abs(site, `publications/${ini.id}/`) + '#org',
  name: ini.name,
  description: oneLine(ini.about ?? ini.blurb),
  url: abs(site, `publications/${ini.id}/`),
  parentOrganization: { '@id': publisher['@id'] },
  sameAs: ini.properties.map((p) => p.url).filter((u) => u?.startsWith('http')),
});

// Minutes since midnight IST, for placing a piece on the 24-hour tape.
const hm = new Intl.DateTimeFormat('en-GB', { timeZone: TZ, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
export const istMinutes = (iso) => {
  const [h, m] = hm.format(new Date(iso)).split(':').map(Number);
  return h * 60 + m;
};

// Title cleanup and story merging live in display.js (shared with the search index builder).
export const displayItems = mergeStories(cleanTitles(items));
