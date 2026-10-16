// llms.txt (https://llmstxt.org): a plain-text map of the site for language models and AI search.
import { initiatives, items, itemsFor, abs, oneLine, TYPE_LABEL, SITE_NAME, SITE_DESCRIPTION, DISCLAIMER, status } from '../lib/data.js';

export function GET({ site }) {
  const L = [];
  L.push(`# ${SITE_NAME}`, '');
  L.push(`> ${SITE_DESCRIPTION}`, '');
  L.push(
    `This site indexes the publications of Zerodha, the Indian stock broker, and Rainmatter Foundation, the non-profit it set up. ` +
    `It holds ${items.length.toLocaleString('en-IN')} pieces and is updated twice a day, at 8 am and 9 pm IST; ` +
    `last update ${status.generated}. ${DISCLAIMER}`,
    '',
  );
  L.push('## Site', '');
  L.push(`- [Latest](${abs(site, '')}): everything published in the last three weeks, newest first`);
  L.push(`- [Publications](${abs(site, 'publications/')}): every initiative, newsletter and channel`);
  L.push(`- [Archive](${abs(site, 'archive/')}): everything, by year`);
  L.push(`- [Combined RSS feed](${abs(site, 'feed.xml')})`);
  L.push(`- [OPML](${abs(site, 'opml.xml')}): import every feed into a reader`, '');

  for (const ini of initiatives) {
    L.push(`## ${ini.name}`, '');
    L.push(oneLine(ini.about), '');
    L.push(`- [${ini.name} on this site](${abs(site, `publications/${ini.id}/`)})`);
    if (itemsFor(ini.id).length) L.push(`- [RSS feed](${abs(site, `feeds/${ini.id}.xml`)})`);
    for (const p of ini.properties) {
      if (!p.url?.startsWith('http')) continue;
      const tag = `${TYPE_LABEL[p.type] ?? p.type}${p.status === 'dormant' ? ', no longer updated' : ''}`;
      L.push(`- [${p.name}](${p.url}) (${tag}): ${p.about ?? ''}`.trimEnd());
    }
    const latest = itemsFor(ini.id).filter((i) => !i.short).slice(0, 5);
    if (latest.length) {
      L.push('', 'Latest:');
      for (const it of latest) L.push(`- ${it.date.slice(0, 10)} [${it.title}](${it.url}) (${it.source})`);
    }
    L.push('');
  }
  return new Response(L.join('\n'), { headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
}
