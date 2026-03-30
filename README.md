# Patrick Tech Media

Patrick Tech Media is a lightweight Node newsroom for a bilingual `VI/EN` tech media site. It ships with:

- editorial-first newsroom content and a more magazine-style presentation
- verification states: `trend`, `emerging`, `verified`
- ad guardrails so `trend` pages stay indexable but do not render ads
- bilingual article routes under `/vi/...` and `/en/...`
- article cover artwork, live desk refresh, topic pages, authors, policy pages, human sitemap, `sitemap.xml`, and `robots.txt`
- a file-based publishing pipeline so stories can update without code edits

## Run locally

1. Copy `.env.example` to `.env` if you want to customize the site URL or connect AdSense.
2. Start the server:

```powershell
npm start
```

3. Open `http://localhost:3000`.

## Environment

```env
PORT=3000
SITE_URL=https://patricktech.media
PATRICK_TECH_STORE_URL=https://store.patricktech.media
NEWSROOM_CONTENT_PATH=data/newsroom-content.json
NEWSROOM_PULL_URL=
NEWSROOM_PULL_TOKEN=
GOOGLE_ADSENSE_CLIENT=
GOOGLE_ADSENSE_SLOT_HERO=
GOOGLE_ADSENSE_SLOT_INLINE=
GOOGLE_ADSENSE_SLOT_MID=
```

If AdSense values are empty, the site renders clearly marked reserved ad placeholders only on ad-eligible surfaces. Trend pages still render no ad container.

`NEWSROOM_CONTENT_PATH` points to the JSON file that powers the live newsroom. If the file is missing, the app falls back to the built-in editorial seed data.

## Key routes

- `/vi/`
- `/en/`
- `/vi/dashboard`
- `/en/dashboard`
- `/vi/radar`
- `/en/radar`
- `/vi/workflow`
- `/en/workflow`
- `/vi/feed.json`
- `/en/feed.xml`
- `/vi/tin-tuc/:slug`
- `/en/news/:slug`
- `/vi/topics/:slug`
- `/en/topics/:slug`
- `/vi/authors`
- `/en/authors`
- `/sitemap.xml`
- `/robots.txt`
- `/api/newsroom/overview`
- `/api/newsroom/articles?lang=vi`
- `/api/newsroom/radar?lang=vi`
- `/api/newsroom/dashboard?lang=vi`
- `/api/newsroom/live?lang=vi`

## Test

```powershell
npm test
```

## Publish new stories

Merge a JSON payload into the live newsroom file:

```powershell
npm run newsroom:publish -- --input .\incoming\batch.json
```

Replace the newsroom file completely:

```powershell
npm run newsroom:publish -- --input .\incoming\batch.json --replace
```

The input can be either a raw array of articles or an object shaped like `{ "articles": [...] }`.

## Continuous refresh

Pull a fresh JSON payload from an external feed:

```powershell
npm run newsroom:refresh
```

The refresh flow reads:

- `NEWSROOM_PULL_URL`: URL returning JSON article payloads
- `NEWSROOM_PULL_TOKEN`: optional bearer token
- `NEWSROOM_CONTENT_PATH`: destination file for the merged newsroom

A ready-to-enable GitHub Actions workflow is included at `.github/workflows/newsroom-refresh.yml`. Once the two secrets above are added in GitHub, the workflow can refresh the newsroom on a schedule and trigger a new Vercel deploy.
