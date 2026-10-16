# The Z Index

An unofficial index of everything Zerodha publishes. It is not affiliated with or endorsed by Zerodha; every entry links to the original.

A single page that lists every Zerodha content initiative and a dated stream of everything
they publish: Substack newsletters, YouTube channels and the Z-Connect blog. It is a static Astro
site on GitHub Pages, rebuilt twice a day (8 am and 9 pm IST) by GitHub Actions.

## How it works

```
GitHub Actions (cron, 8 am and 9 pm IST)
  1. scripts/fetch.mjs reads sources.yaml and fetches each feed
       Substack  -> /feed through a Cloudflare proxy (Substack throttles GitHub's IPs)
       YouTube   -> each channel's public RSS (latest 15 videos; Shorts marked by /shorts/ links)
       Z-Connect -> WordPress RSS
  2. New items are merged into data/items.json; their full text goes to data/text/YYYY-MM.json.
     Both are committed back to the repo
  3. npm run build (astro build, then the Pagefind search index) -> deploy to GitHub Pages
```

- **The archive only grows.** Substack feeds expose about 20 posts, so history accumulates in
  `data/items.json`. If a source fails, its existing items stay on the site, and the run fails only
  when every source fails.
- **Substack requests are kept light.** Normal runs call only `/feed`. The heavier archive API
  (sections, cover images, history) is called to backfill a newly added publication, and once for
  each batch of new posts to pick up section tags. If that call is rate-limited, the post still
  appears and gets tagged on a later run.
- **Shorts** are hidden by default and left out of the RSS feeds. The YouTube feed links them as
  `/shorts/<id>`, which is how they are detected.

Outputs: `/` (last 21 days, with a sticky sidebar holding search, the publications and their
counts for the last seven days, and feed links), `/search/`, `/publications/` (every initiative) and
`/publications/<id>/` (one page per initiative, with its description, channels and latest pieces),
`/archive/` (a year index) and `/archive/<year>/` (everything that year, by month, as compact rows), `/feed.xml`
(combined RSS), `/feeds/<initiative>.xml` (one feed per initiative) and `/opml.xml` (import
everything into a reader). Filters are reflected in the URL, so links like `?i=varsity&f=video`
can be shared.

## Search

`/search/` searches the **full text** of every post and video description, not just titles. It
uses [Pagefind](https://pagefind.app): `scripts/build-search.mjs` indexes each piece after
`astro build` and writes a split index to `dist/pagefind/`. A search downloads only the slices it
needs, so it stays fast with thousands of long posts. There are filters for publication and format,
and results can be ordered by relevance or date.

The full text is stored in `data/text/` (one JSON file per month, `{ id: text }`). It is only
used to build the search index and is never shown on the site. New posts get their text from the
RSS feed (`content:encoded`), and videos from their full description. Older posts were filled in
once with:

```sh
node scripts/backfill-text.mjs   # resumable; about 1.3 s per post; run from a normal connection
```

Paid posts only have their free preview, which is all Substack serves.

## Speed, SEO and AI search

- **Speed.** A single self-hosted font, Schibsted Grotesk, is subset and preloaded (35 KB; rebuild it
  with `python3 scripts/build-fonts.py`). Metric-matched fallback fonts mean nothing shifts when the fonts
  load. CSS is inlined, so nothing blocks rendering. The default view is rendered on the server, so
  the filter script does no work until a reader uses a filter. Off-screen day groups skip rendering
  (`content-visibility`). Lighthouse on a throttled mobile run scores 100 in every category on the home
  and initiative pages, with zero layout shift.
- **Design.** Zerodha's own register: a white ground, navy ink, Zerodha blue and one grotesk
  typeface. The one expressive device is the publishing tape. The homepage shows the last seven
  days, one tick per piece at the hour it went out (IST), coloured by initiative, and its key doubles
  as the filter. Initiative pages use a half-hour histogram of the last 90 days instead. Everything
  else is kept quiet: sentence case, no eyebrow labels, no decoration. Initiative colours are
  `--c-<id>` in `src/styles/global.css`.
- **SEO.** Each page has a canonical URL, a description, Open Graph and Twitter tags with a share image
  (`public/og.png`, a screenshot of `scripts/og.html`) and schema.org JSON-LD. That covers WebSite,
  Organization for each initiative (`sameAs` lists its channels), CollectionPage with an ItemList of
  articles and videos, and BreadcrumbList. There is also `sitemap.xml` and `robots.txt`. Note that
  `robots.txt` only works at a domain root: on a `github.io/<repo>/` project site, submit the sitemap in
  Google Search Console instead.
- **AI search (GEO).** `/llms.txt` gives a plain-text map of every initiative, its channels with
  one-line descriptions, and its latest pieces. The `about` text in `sources.yaml` feeds this file and
  the initiative pages, so keep it factual.

## Setup (one time)

1. **Push this folder to a GitHub repo.** Then go to Settings → Pages → Source and choose
   **GitHub Actions**.
2. **Proxy** (Settings → Secrets and variables → Actions → Variables): set `FEED_PROXY`. Either:
   - use the existing Pages proxy:
     `https://smallweb-rss.pages.dev/api/fetch-rss?url=`
   - or deploy the stricter Worker in `worker/`, which requires a key, only fetches allowlisted
     hosts and caches at the edge:
     ```sh
     cd worker
     npx wrangler login
     npx wrangler deploy
     npx wrangler secret put PROXY_KEY     # any long random string
     ```
     Then set `FEED_PROXY` to the Worker URL, and add the same key as the secret `PROXY_KEY`.
3. **YouTube key (optional).** No key is needed: channels are read from their public RSS. If you
   add a YouTube Data API v3 key as the `YT_API_KEY` secret, the fetcher uses it instead. That gets
   50 videos per channel and exact durations, and it costs about 2 units per channel per run, far
   below the free 10,000 units per day. If the API fails, the fetcher falls back to RSS.
4. **First run:** Actions → *Fetch feeds and deploy* → *Run workflow*.

## Adding or changing a source

Edit `sources.yaml`. Each initiative has a list of properties:

- `type: newsletter` with a `feed:` URL is fetched. A Substack feed also gets backfilled with
  about 200 posts on its first run.
- `type: youtube` with a `channel_id:` is fetched from the channel's RSS. Confirm a channel ID by
  opening `https://www.youtube.com/feeds/videos.xml?channel_id=<id>` and checking the `<title>`.
- `x`, `instagram`, `linkedin`, `whatsapp`, `telegram` and `web` are listed in the directory only.
- `status: dormant` keeps a property listed, marked as an archive, below the active ones.

If a new source lives on a host other than `substack.com` or `zerodha.com` and you use the Worker,
add that host to `ALLOWED_SUFFIXES` in `worker/wrangler.toml`. Each initiative gets a colour
in `src/styles/global.css` (`--c-<id>`).

## Local development

```sh
npm install
node scripts/fetch.mjs   # optional; the site builds from the committed archive
npm run dev        # search needs the index: use `npm run build && npm run preview` to try it
```

### Full Substack backfill

```sh
FULL_BACKFILL=1 node scripts/fetch.mjs
```

This walks every Substack's entire archive. Run it from a normal connection, not CI: Substack
rate-limits its archive API from proxy and datacenter IPs. The last run, on 15 Oct 2026, took about
5 minutes and brought the archive to 1,921 items. Only rerun it if a publication's history goes
missing. YouTube history beyond each feed's latest 15 videos needs `YT_API_KEY`.
