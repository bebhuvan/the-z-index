// Feed proxy for the content hub build.
//
// GitHub Actions runners share datacenter IPs that Substack throttles. The build calls
//   GET https://<worker>/?url=<encoded feed URL>   (header: x-proxy-key)
// and this Worker fetches from Cloudflare's network, caching responses at the edge.
//
// It is deliberately not an open proxy: requests need the shared key, and only hosts
// under ALLOWED_SUFFIXES are fetched.

const CACHE_TTL = 600; // seconds; the build runs twice a day, so 10 min only absorbs retries within one run

export default {
  async fetch(request, env, ctx) {
    if (request.method !== 'GET') return new Response('Method not allowed', { status: 405 });
    if (!env.PROXY_KEY || request.headers.get('x-proxy-key') !== env.PROXY_KEY) {
      return new Response('Forbidden', { status: 403 });
    }

    let target;
    try {
      target = new URL(new URL(request.url).searchParams.get('url'));
    } catch {
      return new Response('Missing or invalid ?url=', { status: 400 });
    }
    const allowed = (env.ALLOWED_SUFFIXES || '').split(',').map((s) => s.trim()).filter(Boolean);
    const hostOk = allowed.some((s) => target.hostname === s || target.hostname.endsWith('.' + s));
    if (target.protocol !== 'https:' || !hostOk) return new Response('Host not allowed', { status: 403 });

    const cache = caches.default;
    const cacheKey = new Request(target.toString());
    const hit = await cache.match(cacheKey);
    if (hit) return withHeader(hit, 'x-proxy-cache', 'HIT');

    const upstream = await fetch(target.toString(), {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; ZerodhaContentHub/1.0)',
        Accept: 'application/rss+xml, application/json, text/html;q=0.8, */*;q=0.5',
      },
      redirect: 'follow',
    });

    const res = new Response(upstream.body, {
      status: upstream.status,
      headers: {
        'content-type': upstream.headers.get('content-type') || 'application/octet-stream',
        'cache-control': `public, max-age=${CACHE_TTL}`,
      },
    });
    // Only cache successes so a transient 429 doesn't stick for ten minutes.
    if (upstream.ok) ctx.waitUntil(cache.put(cacheKey, res.clone()));
    return withHeader(res, 'x-proxy-cache', 'MISS');
  },
};

function withHeader(res, k, v) {
  const r = new Response(res.body, res);
  r.headers.set(k, v);
  return r;
}
