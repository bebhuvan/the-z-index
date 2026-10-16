import rss from '@astrojs/rss';
import { items as all } from './data.js';

const LABEL = { read: 'Read', video: 'Watch', audio: 'Listen' };

export function feed(context, { title, description, filter = () => true, limit = 150 }) {
  return rss({
    title,
    description,
    site: context.site,
    items: all.filter(filter).slice(0, limit).map((it) => ({
      title: `${it.source}: ${it.title}`,
      link: it.url,
      pubDate: new Date(it.date),
      description: it.summary || '',
      categories: [it.source, it.section, LABEL[it.format]].filter(Boolean),
    })),
  });
}
