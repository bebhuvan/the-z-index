import { items, initiatives, abs } from '../lib/data.js';

export function GET({ site }) {
  const latest = items[0]?.date ?? new Date().toISOString();
  const lastFor = (pred) => items.find(pred)?.date ?? latest;
  const years = [...new Set(items.map((i) => i.date.slice(0, 4)))];
  const urls = [
    { loc: abs(site, ''), lastmod: latest, changefreq: 'hourly', priority: '1.0' },
    { loc: abs(site, 'publications/'), lastmod: latest, changefreq: 'weekly', priority: '0.8' },
    ...initiatives.map((ini) => ({
      loc: abs(site, `publications/${ini.id}/`),
      lastmod: lastFor((i) => i.initiative === ini.id),
      changefreq: 'daily',
      priority: '0.8',
    })),
    { loc: abs(site, 'archive/'), lastmod: latest, changefreq: 'daily', priority: '0.5' },
    ...years.map((y) => ({
      loc: abs(site, `archive/${y}/`),
      lastmod: lastFor((i) => i.date.startsWith(y)),
      changefreq: y === new Date().getFullYear().toString() ? 'daily' : 'yearly',
      priority: '0.4',
    })),
  ];
  const body = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map((u) => `  <url><loc>${u.loc}</loc><lastmod>${u.lastmod.slice(0, 10)}</lastmod><changefreq>${u.changefreq}</changefreq><priority>${u.priority}</priority></url>`).join('\n')}
</urlset>
`;
  return new Response(body, { headers: { 'Content-Type': 'application/xml; charset=utf-8' } });
}
