# The Z Index (Zerodha content hub)

## Identity (decided 2026-10-16)
- The site is called **The Z Index**: `SITE_NAME` in `src/lib/data.js`. It is unofficial. Keep "Zerodha" out of the site name and out of anything that could pass as Zerodha's own branding.
- `DISCLAIMER` in `data.js` goes in the footer of every page and in llms.txt. The top bar says "Unofficial" next to the name (hidden below 420px, where the footer and the home dek still say it). The home dek, `SITE_DESCRIPTION` and the feed descriptions all say unofficial.
- In JSON-LD, Zerodha is the `publisher` of the indexed pieces and the parent of each initiative, never of the WebSite. Don't add `twitter:site` for a Zerodha account.
- The share image is `public/og.png`, a 1200×630 headless-Chrome screenshot of `scripts/og.html`. The favicon is a navy Z.

Static Astro 7 site (GitHub Pages) indexing all Zerodha content. See README.md for setup.

## Layout
- Restart the dev server after editing `sources.yaml`; it is read once at startup.
- `sources.yaml`: the single source of truth for initiatives and properties. The directory, filters and fetching all derive from it.
- `scripts/fetch.mjs`: fetcher. Merges into `data/items.json`, the append-only archive that is committed by CI. Also writes `data/status.json` and `data/sections.json`, a cache of Substack section id → name.
- `src/lib/data.js`: build-time loading. Resolves from cwd, because bundling breaks `import.meta.url`. Also removes boilerplate summaries that repeat 3 or more times within one source.
- Archive pages: `src/pages/archive/index.astro` (year index) and `[year].astro`, split by year to keep each page under about 1 MB.
- `src/components/Stream.astro`: date-grouped list with client-side filters (`?i=`, `?f=`, `?shorts=1`).
- `src/pages/publications/`: an index of every initiative plus one page per initiative. `about` text comes from `sources.yaml`.
- `src/pages/{sitemap.xml,robots.txt,llms.txt}.js` and the JSON-LD helpers (`itemListLd`, `initiativeLd`) in `src/lib/data.js`.
- `scripts/build-fonts.py`: writes the Schibsted Grotesk subset to `public/fonts/`. The fallback metric overrides in `global.css` were computed against Arial.
- Design rules (the user rejected a cream, serif, all-caps editorial template as generic): Zerodha register (white, navy `#102033`, blue `#387ed1`), one grotesk, sentence case, no eyebrows, no middle-dot separators, no `→` on links. The expressive element is the tape: `WeekTape.astro` on the homepage, `Rhythm.astro` (half-hour histogram) on initiative pages. `Legend.astro` is both the colour key and the filter (it uses `short` names from sources.yaml).
- Layout: a 736px reading column, a 64px gap and a 256px sticky `Sidebar.astro` (search box, publications with their count for the last 7 days, feed links) on every page. Below 1000px the sidebar moves under the content. Feed rows are text-first and have no thumbnails: title, a one-line summary, then a meta line. `FormatIcon.astro` line icons (newsletter, video, audio) sit under the time. The user found the earlier sidebar and thumbnail rows clumsy and asked for this sidebar to come back looking nicer.
- `displayItems` in `data.js` (logic in `src/lib/display.js`, shared with the search builder) is used for on-page streams only. It drops trailing hashtags and emoji from video titles, drops a summary that only restates its title (80% of its words are in the title), strips recurring and date segments from video titles (the series name becomes the section) and merges a newsletter post with its same-story video (same initiative, within 20h, headline Jaccard ≥ 0.4; checked by hand on 11 pairs, all correct). Feeds and JSON-LD use raw `items`.
- `worker/`: optional keyed Cloudflare Worker proxy. The alternative is the open Pages proxy at smallweb-rss.pages.dev (bebhuvan/rss-proxy).

## Design system (refinement pass, 2026-10-15)
All values are tokens in `:root` of `src/styles/global.css`. Don't add a size, space, weight or radius that isn't one of these.
- Type, five steps, each with its own line height: `--t1` 13/20 (meta, counts, axis), `--t2` 15/24 (UI, summaries, sidebar, lists; the body default), `--t3` 17/24 (row titles; prose such as the dek uses 17/28), `--t4` 22/28 (every h2 in the reading column, publication names, archive years), `--t5` page title 32/36, 44/48 from 640px.
- Weights: 400 and 600 only.
- Space: 4px base, `--s1`…`--s9` = 4, 8, 12, 16, 24, 32, 48, 64, 96. Page head: 64 top, 32 bottom (32/24 on phones). Sections are 48 apart and open with a hairline, 24 above the h2 and 24 below it. Days in the stream are 32 apart. Rows are 16 top and bottom (12 in compact archive rows). Sidebar blocks are 48 apart, and the sidebar's top padding equals the head's, so the search box lines up with the page title.
- Rules: one hairline colour `--rule`. `--edge` is only for the borders of form controls (search fields, theme button), at 3:1 or more. No dark rules.
- Radius: one, `--radius` 2px (fields, swatches, focus ring, highlight). Everything else is square, including tape ticks and histogram bars.
- Swatch: `--swatch` 8px everywhere.
- Time column: `--when` 80px in the feed, compact archive rows and search results. Search dates stack the day and month over the year to fit it. The week tape's day-label column is `--when` minus the 16px gap, so the plot starts exactly where row titles start. Row grids use `align-items: first baseline`, so the time sits on the title's baseline.
- Selected state: `.tab` is the single style for nav links, the colour key and every filter: `--ink-2`, then `--ink` on hover, `--ink` plus a 2px ink underline when `aria-pressed="true"` or `aria-current="page"`. Focus is a 2px `--blue` outline everywhere; fields show a 2px blue border instead.
- Icons: 16px, 1.5 stroke (format icons and the search icon).
- Numbers: tabular figures only for short counts and axes. Not on anything that can contain a comma ("1,408"), because this font's tabular comma is wide.
- Copy: the unit is "pieces". Sidebar count label is "Last 7 days". Empty states say what to do next.
- Checked on 2026-10-15: Lighthouse 100/100/100/100 with CLS 0 on `/`, `/publications/`, `/publications/markets/`, `/search/`, `/archive/` and `/archive/2025/`; no horizontal overflow at 360 or 390px in either theme; text tokens are 5.2:1 or better in both themes.

## Schedule
- CI runs twice a day, at 8:00 am and 9:00 pm IST (`cron: '30 2,15 * * *'` in UTC, in `.github/workflows/build.yml`), plus on push and on manual dispatch. Changed from every 30 minutes on 2026-10-16. The homepage dek and llms.txt state the times, so update them if the schedule changes. A 12-hour gap is safe: no channel publishes more than its feed window (15 YouTube videos, about 20 Substack posts) in 12 hours.

## Known constraints (verified 2026-10-15)
- YouTube RSS (`feeds/videos.xml`) is the default source. It returned 404 everywhere on the morning of 2026-10-15, then worked again later that day, so expect occasional outages. Shorts are detected from `/shorts/` links. `YT_API_KEY` is optional; when set, the Data API is used, falling back to RSS.
- The Pages proxy also sometimes returns 429 on plain Substack `/feed` requests. The direct-fetch fallback covers this.
- Substack 429s its `/api/v1/archive` through the Cloudflare proxy, while `/feed` is fine. Steady-state runs must therefore use `/feed` only. The archive API is reserved for backfill and one-off enrichment of new posts.
- The archive API returns fewer posts than `limit` (23 for 25), so pagination advances by the count returned.
- The full Substack backfill (`FULL_BACKFILL=1`) ran locally on 2026-10-15 with no 429s and brought the archive to 1,921 items.
- The merge must never overwrite a non-empty field with null or empty, because the RSS fallback lacks sections and images.

## Search
- `scripts/build-search.mjs` writes Pagefind custom records (url = the original piece; filters `publication` and `format`; sort `date`) using full text from `data/text/`. `npm run build` runs it after Astro. In dev the index doesn't exist; use preview.
- `scripts/textstore.mjs` handles the monthly shards. `fetch.mjs` stores `_text` from RSS `content:encoded` and YouTube descriptions. `backfill-text.mjs` fetches `/api/v1/posts/<slug>` for older posts.
- Always convert file URLs with `fileURLToPath` before passing a string path to a tool. The project path contains spaces, and `URL.pathname` gives `%20`, which once wrote the index to a stray `Bhuvan%20projects/` folder.

## Gotchas
- Font and asset URLs must go through `url()`, which applies the base path. That's why the web `@font-face` rules live in `Base.astro`, not in CSS.
- Filters render on the server: `Stream.astro` computes the default counts and hidden state at build time, and the client script runs only once a filter is used. Keep it that way, because running it on load cost 300 to 700 ms of main-thread blocking.
- `[hidden]` needs `display: none !important`, because `.item { display: grid }` overrides it otherwise.
- Don't use `pkill -f` with a pattern that also appears in the shell's own command line. Run `astro preview` as a background task instead.

## Status
- Full-text backfill completed on 2026-10-15 (1,676 posts, 0 failures). Search has full text for 1,878 of 1,921 pieces; the other 43 are videos with empty YouTube descriptions, and their titles are still indexed. `data/text/` is about 29 MB in 35 monthly files, with the current month at about 0.8 MB. The Pagefind output is about 30 MB, but each search downloads only small fragments.
- Live since 2026-10-16 at https://bebhuvan.github.io/the-z-index/ (repo: github.com/bebhuvan/the-z-index, public, because free GitHub Pages needs that). Pages builds from Actions. `FEED_PROXY` is set to the open Pages proxy; no `PROXY_KEY` or `YT_API_KEY` yet.
- CI commits "Update feed archive" to main, so run `git pull --rebase` before pushing.
- `docs/design-brief.md` is gitignored: it's an internal note that names the owner and their employer, which doesn't belong in a public repo for an unofficial site.
- Feed URLs that aren't http(s) are dropped (`safeItems` in `display.js`), and the JSON-LD escapes `<`. Keep both, because feed content is untrusted.
- Social accounts: only X @zerodhamarkets is listed so far.
