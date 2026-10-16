// Full-text store used only for the search index (never rendered on the site).
// Sharded by month (data/text/YYYY-MM.json, { id: text }) so a routine update rewrites one small file.
import { readFile, writeFile, readdir, mkdir } from 'node:fs/promises';

const DIR = new URL('../data/text/', import.meta.url);
const MAX = 40_000; // characters per piece; plenty for search, bounded for repo size

export function htmlToText(html = '') {
  return html
    .replace(/<(script|style|svg|button)[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<\/(p|div|h[1-6]|li|blockquote|figcaption|tr)>/gi, '\n')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;|&#x27;|&rsquo;/g, '’')
    .replace(/&lsquo;/g, '‘').replace(/&ldquo;/g, '“').replace(/&rdquo;/g, '”').replace(/&mdash;/g, '—').replace(/&ndash;/g, '–')
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(+n))
    .replace(/[ \t]+/g, ' ').replace(/\s*\n\s*/g, '\n').trim()
    .slice(0, MAX);
}

export async function loadText() {
  await mkdir(DIR, { recursive: true });
  const shards = new Map();
  for (const f of await readdir(DIR)) {
    if (f.endsWith('.json')) shards.set(f.slice(0, -5), JSON.parse(await readFile(new URL(f, DIR), 'utf8')));
  }
  return shards;
}

export function hasText(shards, item) {
  return Boolean(shards.get(item.date.slice(0, 7))?.[item.id]);
}

export function putText(shards, item, text) {
  if (!text) return false;
  const key = item.date.slice(0, 7);
  const shard = shards.get(key) ?? {};
  if (shard[item.id] === text) return false;
  shard[item.id] = text;
  shards.set(key, shard);
  shards.dirty = (shards.dirty ?? new Set()).add(key);
  return true;
}

export async function saveText(shards) {
  for (const key of shards.dirty ?? []) {
    const shard = shards.get(key);
    const sorted = Object.fromEntries(Object.keys(shard).sort().map((k) => [k, shard[k]]));
    await writeFile(new URL(`${key}.json`, DIR), JSON.stringify(sorted, null, 0) + '\n');
  }
  shards.dirty = new Set();
}
