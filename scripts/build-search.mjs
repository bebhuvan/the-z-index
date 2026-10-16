// Builds the Pagefind search index into dist/pagefind after `astro build`.
// Every piece (newsletter post, video, blog post) is a custom record whose URL is the original,
// indexed on its title, summary, source, series and full text (from data/text/). Pagefind splits
// the index into small fragments, so a search downloads only what it needs.
import { readFile } from 'node:fs/promises';
import * as pagefind from 'pagefind';
import { parse } from 'yaml';
import { fileURLToPath } from 'node:url';
import { loadText } from './textstore.mjs';
import { cleanTitles } from '../src/lib/display.js';

const root = new URL('../', import.meta.url);
// Clean titles for display; the original title stays in the indexed text so it still matches.
const raw = JSON.parse(await readFile(new URL('data/items.json', root), 'utf8'));
const items = cleanTitles(raw);
const rawTitle = new Map(raw.map((i) => [i.id, i.title]));
const { initiatives } = parse(await readFile(new URL('sources.yaml', root), 'utf8'));
const iniName = Object.fromEntries(initiatives.map((i) => [i.id, i.name]));
const shards = await loadText();
const FORMAT = { read: 'Newsletter', video: 'Video', audio: 'Podcast' };

const { index } = await pagefind.createIndex({ forceLanguage: 'en' });
let withText = 0;
for (const it of items) {
  const text = shards.get(it.date.slice(0, 7))?.[it.id] ?? '';
  if (text) withText++;
  // Body first so excerpts come from the text, not a repeat of the title shown above them.
  const content = [it.summary, text, it.section, rawTitle.get(it.id)].filter(Boolean).join('\n\n');
  await index.addCustomRecord({
    url: it.url,
    content,
    language: 'en',
    meta: {
      title: it.title,
      source: it.source,
      initiative: it.initiative,
      section: it.section ?? '',
      format: it.format,
      date: it.date,
      short: it.short ? '1' : '',
    },
    filters: {
      publication: [iniName[it.initiative] ?? it.initiative],
      format: [it.short ? 'Short' : FORMAT[it.format] ?? it.format],
    },
    sort: { date: it.date },
  });
}
const { errors } = await index.writeFiles({ outputPath: fileURLToPath(new URL('dist/pagefind', root)) });
if (errors?.length) { console.error(errors); process.exit(1); }
console.log(`search index: ${items.length} pieces, ${withText} with full text`);
await pagefind.close();
