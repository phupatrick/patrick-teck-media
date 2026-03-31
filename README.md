# Patrick Tech Media

Patrick Tech Media is a lightweight Node newsroom for a bilingual `VI/EN` tech media site. It ships with:

- editorial-first newsroom content and a more magazine-style presentation
- verification states: `trend`, `emerging`, `verified`
- ad guardrails so `trend` pages stay indexable but do not render ads
- bilingual article routes under `/vi/...` and `/en/...`
- source-first article images with attribution, live desk refresh, topic pages, authors, policy pages, human sitemap, `sitemap.xml`, and `robots.txt`
- writer accounts, admin review, automatic story scoring, and Binance withdrawal requests
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
SITE_URL=https://patricktechmedia.vercel.app
PATRICK_TECH_STORE_URL=https://patricktechstore.vercel.app
NEWSROOM_CONTENT_PATH=data/newsroom-content.json
PLATFORM_STATE_PATH=data/platform-state.json
SESSION_SECRET=replace-with-a-long-random-secret
ADMIN_GOOGLE_EMAILS=hphumail@gmail.com,phupunpin@gmail.com,hoangphupatrick@gmail.com
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
NEWSROOM_PULL_URL=
NEWSROOM_PULL_TOKEN=
NEWSROOM_PULL_FILE=
OPENCLAW_NEWSROOM_URL=
OPENCLAW_NEWSROOM_TOKEN=
OPENCLAW_NEWSROOM_FILE=data/openclaw-hidden-feed.json
OPENCLAW_MANAGER_NAME=OpenClaw
OPENCLAW_MANAGER_STATE_PATH=data/openclaw-manager-state.json
GOOGLE_ADSENSE_CLIENT=
GOOGLE_ADSENSE_SLOT_HERO=
GOOGLE_ADSENSE_SLOT_INLINE=
GOOGLE_ADSENSE_SLOT_MID=
```

If AdSense values are empty, the site renders clearly marked reserved ad placeholders only on ad-eligible surfaces. Trend pages still render no ad container.

`NEWSROOM_CONTENT_PATH` points to the JSON file that powers the live newsroom. If the file is missing, the app falls back to the built-in editorial seed data.

`PLATFORM_STATE_PATH` stores users, submissions, and withdrawal requests. In local development it writes to the project file. In locked-down serverless environments, the app falls back to a temp file automatically so the account flow can still run without crashing.

Google admin login is restricted to:

- `hphumail@gmail.com`
- `phupunpin@gmail.com`
- `hoangphupatrick@gmail.com`

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
- `/vi/login`
- `/en/login`
- `/vi/portal`
- `/en/portal`
- `/vi/admin`
- `/en/admin`
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

## Contributor workflow

1. Writers create a local account at `/vi/login` or `/en/login`.
2. Writers submit stories through the writer portal.
3. The system scores each submission automatically:
   - title, dek, summary length
   - section depth
   - source count
   - reference image availability
   - promotional language penalty
4. Approved stories appear on the public newsroom automatically.
5. Revenue is tracked per story with an `80 / 20` writer/platform split.
6. Writers can request Binance withdrawals and admins can mark payouts as paid.

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

To show collected reference images, pass either:

```json
{
  "image": {
    "src": "https://cdn.example.com/story.jpg",
    "alt": "Reference image alt text",
    "caption": "Reference image from the source story.",
    "credit": "Source publication",
    "source_url": "https://example.com/source-story"
  }
}
```

or attach image metadata to a source item:

```json
{
  "source_set": [
    {
      "source_name": "Source publication",
      "source_url": "https://example.com/source-story",
      "image_url": "https://cdn.example.com/story.jpg",
      "image_caption": "Reference image from the source story.",
      "image_credit": "Source publication"
    }
  ]
}
```

If a story has no valid reference image yet, the site renders a neutral placeholder instead of generating an illustration.

## Continuous refresh

Pull a fresh JSON payload from an external feed:

```powershell
npm run newsroom:refresh
```

The refresh flow reads:

- `NEWSROOM_PULL_URL`: URL returning JSON article payloads
- `NEWSROOM_PULL_TOKEN`: optional bearer token
- `NEWSROOM_PULL_FILE`: local JSON payload file returning article objects
- `OPENCLAW_NEWSROOM_URL`: optional alias for the same pull URL
- `OPENCLAW_NEWSROOM_TOKEN`: optional alias for the same bearer token
- `OPENCLAW_NEWSROOM_FILE`: optional alias for a local hidden-feed JSON file
- `NEWSROOM_CONTENT_PATH`: destination file for the merged newsroom

Generate the hidden OpenClaw feed locally:

```powershell
npm run openclaw:feed
```

## OpenClaw manager cycle

Run the full autonomous newsroom cycle:

```powershell
npm run openclaw:manage
```

This manager cycle:

- refreshes the public newsroom file from `NEWSROOM_PULL_URL` or `OPENCLAW_NEWSROOM_URL`
- can also read a local hidden feed from `NEWSROOM_PULL_FILE` or `OPENCLAW_NEWSROOM_FILE`
- auto-generates `data/openclaw-hidden-feed.json` before refresh when no external URL/file is configured
- falls back to curated RSS sources when no hidden feed is configured
- re-checks writer submissions through the automatic editorial gate
- auto-publishes only stories that still clear the publish bar
- writes a private machine state snapshot to `OPENCLAW_MANAGER_STATE_PATH`

The ready-to-enable GitHub Actions workflow at `.github/workflows/newsroom-refresh.yml` now runs this OpenClaw manager cycle on an hourly schedule and commits:

- `data/newsroom-content.json`
- `data/platform-state.json`
- `data/openclaw-manager-state.json`
