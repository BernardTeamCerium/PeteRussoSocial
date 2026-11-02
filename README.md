# Pete Russo Social Command Center

One place to monitor and report on **Pete Russo** and **PeteRusso.com**:

| Area | What you get |
|---|---|
| **Web mentions** | Every time "Pete Russo" / "PeteRusso.com" appears in Google News, Google web results, Reddit, YouTube, Hacker News and global news (GDELT). Each mention gets a relevance score so results about *other* Pete/Peter Russos (the *House of Cards* character, the Australian footballer, …) are filtered out. Mentions are also scored for sentiment and flagged when they don't link to PeteRusso.com, which makes them backlink outreach opportunities. |
| **Social engagement** | Followers, growth, likes, comments, shares, views and engagement rate for Instagram, Facebook, X and YouTube via their APIs. LinkedIn, TikTok and Threads are entered manually. |
| **Rankings & SEO** | Google Search Console positions, clicks, impressions and CTR for every query; tracked keywords with history; optional live rank checks (SerpAPI); an automated on-page audit of PeteRusso.com (title, meta, H1, Person schema, sameAs, canonical, OG, sitemap, robots, alt text) plus Google PageSpeed / Core Web Vitals. |
| **Website analytics** | GA4 users, sessions, page views, engagement, conversions, channels, top pages, sources, countries and devices. |
| **Action plan** | A prioritised list of what to do next to keep Pete Russo and PeteRusso.com ranking, generated from all of the data above, with a team checklist. |
| **Sharing** | Read-only report links (pick sections, period and expiry; revocable), a copy-paste summary, print/PDF, CSV export of mentions, and an optional weekly Slack digest. |

The app has **no npm dependencies**. It runs on Node.js ≥ 22.13, uses the built-in SQLite, and ships Chart.js in `public/assets/vendor`. Until a data source is connected, its section shows clearly labelled **demo data**, so the dashboard is usable on day one. Demo rows are deleted automatically as soon as real data arrives.

## Branding

The dashboard and the shared reports use PeteRusso.com's look: the site's navy, blue (#2a97fd) and mint (#02f5a3) colors, its Bebas Neue and Plus Jakarta Sans fonts (self-hosted in `public/assets/fonts`, SIL Open Font License), and Pete's photos from the site (`public/assets/brand/`). The colors are CSS variables at the top of `public/assets/styles.css`. To use a new photo, replace the two JPEGs in `public/assets/brand/`. `BRAND_TAGLINE` sets the banner text.

## Quick start

```bash
cp .env.example .env      # then fill in what you have
npm start                 # http://localhost:3000  (user: admin, password: ADMIN_PASSWORD)
```

Other commands:

```bash
npm run collect           # pull fresh data once (good for a cron job)
npm test                  # run the test suite
```

The server also collects automatically every `COLLECT_INTERVAL_MINUTES` (default: 6 hours).

### Deploy

Any host that runs Node 22 or Docker works (Render, Railway, Fly.io, a VPS…). Mount a persistent volume for the database:

```bash
docker build -t peterusso-social .
docker run -d -p 3000:3000 --env-file .env -v peterusso-data:/data -v $PWD/credentials:/app/credentials:ro peterusso-social
```

Set `ADMIN_PASSWORD` and `BASE_URL` (the public URL, used in share links) in production. If the server reaches the internet through an HTTP proxy, also set `NODE_USE_ENV_PROXY=1`. Node's built-in fetch ignores `HTTPS_PROXY` otherwise.

## Connecting data sources

Everything is configured in `.env`. The **Settings & sources** tab shows what is connected and the last result for each source.

### Web mentions
- **Google News, Reddit, Hacker News, GDELT**: no key needed.
- **Google web results**: `SERPAPI_KEY` from [serpapi.com](https://serpapi.com). The same key powers live rank tracking.
- **YouTube**: `YOUTUBE_API_KEY` (Google Cloud → APIs & Services → enable *YouTube Data API v3* → Credentials → API key).
- **Tuning relevance**: set `BRAND_CONTEXT_KEYWORDS` to words that describe Pete (his industry, city, company, show names). Mentions with these words score higher. `BRAND_EXCLUDE_KEYWORDS` lists words that indicate a different Pete Russo. In the feed, **Not him** hides a mention for good.

### Social accounts
- **Instagram + Facebook**: Pete's Instagram must be a Business/Creator account linked to a Facebook Page. Create a Meta app, generate a long-lived token with `instagram_basic`, `instagram_manage_insights`, `pages_read_engagement` and `pages_show_list`, then set `META_ACCESS_TOKEN`, `INSTAGRAM_BUSINESS_ID` and `FACEBOOK_PAGE_ID`.
- **X**: `X_BEARER_TOKEN` (developer.x.com; the Basic tier or above is needed to read tweets) and `X_USERNAME`.
- **YouTube channel**: `YOUTUBE_API_KEY` + `YOUTUBE_CHANNEL_ID`.
- **LinkedIn / TikTok / Threads**: their APIs need partner approval, so use the **Enter numbers manually** form on the Social tab (weekly is enough).

### Google Search Console + GA4 (rankings and website analytics)
1. In Google Cloud, create a project, enable the **Google Search Console API** and the **Google Analytics Data API**, then create a **service account** and download its JSON key to `credentials/service-account.json` (this folder is git-ignored).
2. Search Console → PeteRusso.com property → Settings → Users and permissions → add the service account email (Restricted is enough). Set `GSC_SITE_URL` (`sc-domain:peterusso.com` for a domain property, or `https://peterusso.com/`).
3. GA4 → Admin → Property access management → add the service account email as **Viewer**. Set `GA4_PROPERTY_ID` (Admin → Property settings).

### Site audit / PageSpeed
Runs against `https://BRAND_DOMAIN/` on every collection. `PAGESPEED_API_KEY` is optional; set it to avoid rate limits.

### Slack
Set `SLACK_WEBHOOK_URL` to an incoming-webhook URL. A 7-day summary is posted weekly after a scheduled collection, and the Share tab gets a **Post to Slack** button.

## Project layout

```
src/
  server.js              HTTP server + scheduler
  app.js                 routes (dashboard API, share links)
  config.js, db.js       env config, SQLite schema
  connectors/            mentions, social, seo (GSC, SerpAPI, audit, PageSpeed), analytics (GA4)
  services/
    collector.js         runs every connector, swaps demo data for real data
    store.js             saving and aggregation queries
    recommendations.js   "what we need to keep ranking" engine
    reports.js           report builder, share links, markdown/Slack, CSV
    demo.js              sample data
  lib/                   http, text/RSS parsing, Google service-account auth, relevance & sentiment
public/                  dashboard (index.html) and shared report page (report.html)
test/                    node:test suite
```
