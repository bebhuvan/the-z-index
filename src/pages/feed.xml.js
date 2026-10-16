import { feed } from '../lib/feed.js';

export const GET = (context) =>
  feed(context, {
    title: 'The Z Index: everything Zerodha publishes',
    description: 'An unofficial feed of newsletters and videos from Markets by Zerodha, Varsity, Subtext, Zero1, Rainmatter and more. Not affiliated with Zerodha.',
    // Shorts would drown out everything else in a reader.
    filter: (i) => !i.short,
  });
