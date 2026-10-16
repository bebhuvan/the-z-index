// One feed per initiative, e.g. /feeds/varsity.xml
import { feed } from '../../lib/feed.js';
import { activeInitiatives } from '../../lib/data.js';

export const getStaticPaths = () => activeInitiatives.map((ini) => ({ params: { id: ini.id }, props: { ini } }));

export const GET = (context) => {
  const { ini } = context.props;
  return feed(context, {
    title: `${ini.name} · The Z Index`,
    description: ini.blurb,
    filter: (i) => i.initiative === ini.id && !i.short,
  });
};
