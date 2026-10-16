// OPML so readers can import every feed at once. YouTube's per-channel RSS is
// unreliable, so videos come through the per-initiative feeds we publish instead.
import { initiatives, activeInitiatives } from '../lib/data.js';

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');

export function GET(context) {
  const abs = (p) => new URL(p, context.site + import.meta.env.BASE_URL.replace(/^\//, '')).toString();
  const lines = [];
  lines.push(`<outline text="Everything (combined)" type="rss" xmlUrl="${abs('feed.xml')}" />`);
  for (const ini of activeInitiatives) {
    lines.push(`<outline text="${esc(ini.name)}, all formats" type="rss" xmlUrl="${abs(`feeds/${ini.id}.xml`)}" />`);
  }
  for (const ini of initiatives) {
    for (const p of ini.properties) {
      if (p.feed && p.status !== 'dormant') {
        lines.push(`<outline text="${esc(p.name)}" type="rss" xmlUrl="${esc(p.feed)}" htmlUrl="${esc(p.url)}" />`);
      }
    }
  }
  const body = `<?xml version="1.0" encoding="UTF-8"?>
<opml version="2.0">
  <head><title>The Z Index: Zerodha publications (unofficial)</title></head>
  <body>
    ${lines.join('\n    ')}
  </body>
</opml>
`;
  return new Response(body, { headers: { 'Content-Type': 'text/x-opml; charset=utf-8' } });
}
