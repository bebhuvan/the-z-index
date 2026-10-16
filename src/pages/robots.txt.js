// Only honoured when the site is served from a domain root (custom domain or a
// <user>.github.io repo); for project pages, submit the sitemap in Search Console instead.
import { abs } from '../lib/data.js';

export const GET = ({ site }) =>
  new Response(`User-agent: *\nAllow: /\n\nSitemap: ${abs(site, 'sitemap.xml')}\n`, {
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  });
