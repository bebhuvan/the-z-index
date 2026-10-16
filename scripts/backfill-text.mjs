// One-time (and resumable) backfill of full text for Substack posts already in the archive.
// Substack's archive list omits post bodies, so this fetches /api/v1/posts/<slug> one at a time.
// Run from a normal connection, not CI:   node scripts/backfill-text.mjs
// Paid posts return only their free preview, which is still useful for search.
import { readFile } from 'node:fs/promises';
import { loadText, hasText, putText, saveText, htmlToText } from './textstore.mjs';

const UA = 'Mozilla/5.0 (compatible; ZerodhaContentHub/1.0)';
const GAP_MS = 1300;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const items = JSON.parse(await readFile(new URL('../data/items.json', import.meta.url), 'utf8'));
const shards = await loadText();
const todo = items.filter((i) => i.sourceType === 'newsletter' && /\/p\/[^/?#]+/.test(i.url) && !hasText(shards, i));
console.log(`${todo.length} posts need text`);

let done = 0, failed = 0;
for (const it of todo) {
  const u = new URL(it.url);
  const slug = u.pathname.match(/\/p\/([^/?#]+)/)[1];
  try {
    let res;
    for (let attempt = 0; attempt < 4; attempt++) {
      res = await fetch(`${u.origin}/api/v1/posts/${slug}`, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(30_000) });
      if (res.status !== 429 && res.status < 500) break;
      await sleep(15_000 * (attempt + 1)); // back off hard on rate limits
    }
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const post = await res.json();
    putText(shards, it, htmlToText(post.body_html || post.truncated_body_text || ''));
    done++;
  } catch (e) {
    failed++;
    console.warn(`  ✗ ${it.url}: ${e.message}`);
  }
  if ((done + failed) % 25 === 0) {
    await saveText(shards);
    console.log(`  ${done + failed}/${todo.length} (${failed} failed)`);
  }
  await sleep(GAP_MS);
}
await saveText(shards);
console.log(`done: ${done} saved, ${failed} failed`);
