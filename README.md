# Patrick Teck Media

Patrick Teck Media is a lightweight Node newsroom for a bilingual `VI/EN` tech media site. It ships with:

- OpenClaw-first editorial model and sample content
- verification states: `trend`, `emerging`, `verified`
- ad guardrails so `trend` pages stay indexable but do not render ads
- bilingual article routes under `/vi/...` and `/en/...`
- topic pages, authors, policy pages, human sitemap, `sitemap.xml`, and `robots.txt`

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
SITE_URL=https://patrickteck.media
PATRICK_TECH_STORE_URL=https://store.patrickteck.media
GOOGLE_ADSENSE_CLIENT=
GOOGLE_ADSENSE_SLOT_HERO=
GOOGLE_ADSENSE_SLOT_INLINE=
GOOGLE_ADSENSE_SLOT_MID=
```

If AdSense values are empty, the site renders clearly marked reserved ad placeholders only on ad-eligible surfaces. Trend pages still render no ad container.

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

## Test

```powershell
npm test
```
