# Patrick Tech Media

Patrick Tech Media is a lightweight Node newsroom for a bilingual `VI/EN` tech media site. It ships with:

- editorial-first newsroom content and a more magazine-style presentation
- verification states: `trend`, `emerging`, `verified`
- ad guardrails so `trend` pages stay indexable but do not render ads
- bilingual article routes under `/vi/...` and `/en/...`
- source-first article images with attribution, live desk refresh, topic pages, authors, policy pages, human sitemap, `sitemap.xml`, and `robots.txt`
- writer accounts, admin review, automatic story scoring, and Binance withdrawal requests
- a file-based publishing pipeline so stories can update without code edits
- optional Neon Postgres storage so newsroom, platform state, and OpenClaw web control survive redeploys
- an OpenClaw control layer that can tune the front page, update core web files, commit newsroom state, and deploy by Git push

## Run locally

1. Copy `.env.example` to `.env` if you want to customize the site URL, connect AdSense, or point storage to Neon.
2. Start the server:

```powershell
npm start
```

3. Open `http://localhost:3000`.

## Environment

```env
PORT=3000
SITE_URL=https://patricktechmedia.com
PATRICK_TECH_STORE_URL=https://patricktechmedia.store
NEWSROOM_CONTENT_PATH=data/newsroom-content.json
OPENCLAW_WEB_STATE_PATH=data/openclaw-web-state.json
PLATFORM_STATE_PATH=data/platform-state.json
DATABASE_URL=
DOCUMENT_STORE_REQUIRE_DATABASE=
SESSION_SECRET=replace-with-a-long-random-secret
ADMIN_GOOGLE_EMAILS=hphumail@gmail.com,phupunpin@gmail.com,hoangphupatrick@gmail.com
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
NEWSROOM_PULL_URL=
NEWSROOM_PULL_TOKEN=
NEWSROOM_PULL_FILE=
NEWSROOM_REQUIRE_BILINGUAL_PAIR=0
NEWSROOM_TRANSLATION_ENDPOINT=
NEWSROOM_TRANSLATION_API_KEY=
NEWSROOM_TRANSLATION_MODEL=
NEWSROOM_GEMINI_API_KEY=
NEWSROOM_GEMINI_MODEL=gemini-1.5-flash
NEWSROOM_GEMINI_LIMIT=20
NEWSROOM_MAX_ACTIVE_FEEDS=180
NEWSROOM_FEED_ITEM_LIMIT=12
NEWSROOM_FEED_LIMIT_MULTIPLIER=1.5
NEWSROOM_AUTOPUBLISH_LIMIT=20
NEWSROOM_AUTOPUBLISH_MIN_VI=12
OPENCLAW_NEWSROOM_URL=
OPENCLAW_NEWSROOM_TOKEN=
OPENCLAW_NEWSROOM_FILE=data/openclaw-hidden-feed.json
OPENCLAW_OWNER_BRIEF_PATH=data/openclaw-owner-brief.json
OPENCLAW_MANAGER_NAME=OpenClaw
OPENCLAW_MANAGER_STATE_PATH=data/openclaw-manager-state.json
OPENCLAW_TRUST_MODE=owner
OPENCLAW_GIT_AUTOPUSH=
OPENCLAW_GIT_SKIP_TESTS=
OPENCLAW_GIT_COMMIT_MESSAGE=
GOOGLE_ADSENSE_CLIENT=
GOOGLE_ADSENSE_SLOT_HERO=
GOOGLE_ADSENSE_SLOT_INLINE=
GOOGLE_ADSENSE_SLOT_MID=
```

If AdSense values are empty, the site renders clearly marked reserved ad placeholders only on ad-eligible surfaces. Trend pages still render no ad container.

`DATABASE_URL` can point to Neon Postgres. When it is present, the app stores the newsroom, platform state, and OpenClaw web-control state in Postgres while still mirroring a safe local JSON fallback. Set `DOCUMENT_STORE_REQUIRE_DATABASE=1` in production after seeding the database if you want Vercel to fail loudly instead of falling back to local JSON when storage is unavailable.

`NEWSROOM_CONTENT_PATH` points to the JSON file that powers the live newsroom. If the file is missing, the app falls back to the built-in editorial seed data.

`NEWSROOM_REQUIRE_BILINGUAL_PAIR=1` enables the Media 2.0 publishing guard: a newly
published `cluster_id` must contain both `vi` and `en` articles in the same batch. Keep
it at `0` until the newsroom translation provider is configured; existing published
articles are intentionally not removed during the phased migration.

For the GitHub Actions workflow, add `NEWSROOM_TRANSLATION_ENDPOINT`,
`NEWSROOM_TRANSLATION_API_KEY`, and `NEWSROOM_TRANSLATION_MODEL` as repository
secrets before using `/publish_pair <url>` in the newsroom Telegram bot. The command
enables the pair guard for that one run only. If the provider is absent or translation
fails validation, the source draft stays in the pending queue for a later retry.

`OPENCLAW_WEB_STATE_PATH` stores the front-page control state that OpenClaw uses to tune homepage copy and ranking without hard-editing templates.

`OPENCLAW_OWNER_BRIEF_PATH` points to the owner brief that captures the product, editorial, design, SEO, monetization, and operational rules OpenClaw should treat as standing instructions.

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
- updates `data/openclaw-learning-state.json` from quality checks, owner feedback, reactions, and comments
- updates `data/openclaw-web-state.json` so OpenClaw can tune front-page copy and ranking
- reads `data/openclaw-owner-brief.json` so each cycle keeps the same owner instructions
- re-checks writer submissions through the automatic editorial gate
- auto-publishes only stories that still clear the publish bar
- writes a private machine state snapshot to `OPENCLAW_MANAGER_STATE_PATH`
- can run in `OPENCLAW_TRUST_MODE=owner`, which records OpenClaw as an owner-delegated actor for direct newsroom writes and code-managed updates

OpenClaw should follow this editorial playbook on every refresh:

- keep topic classification tied to reader intent, not only feed labels
- keep provider-specific AI stories aligned all the way through title, copy, and image choice
- avoid rendering thin topic bands or unfinished cards on the homepage
- treat rough, repeated, or machine-looking Vietnamese copy as not publish-ready
- keep a story out of priority homepage slots if the image is missing or clearly belongs to another company or product

Generate or refresh only the web-control layer:

```powershell
npm run openclaw:web
```

Let OpenClaw run tests and commit the generated newsroom files:

```powershell
npm run openclaw:git-sync
```

The GitHub Actions workflow at `.github/workflows/newsroom-refresh.yml` runs this OpenClaw manager cycle every 15 minutes and commits:

- `data/newsroom-content.json`
- `data/platform-state.json`
- `data/openclaw-manager-state.json`
- `data/openclaw-web-state.json`
- `data/openclaw-learning-state.json`
- `data/openclaw-owner-brief.json`

## Cloud mode

To let Patrick Tech Media keep updating without your machine being turned on:

1. Keep the site deployed on Vercel with `SITE_URL=https://patricktechmedia.com`.
2. Add these GitHub Actions secrets:
   - `DATABASE_URL`
   - `OPENCLAW_NEWSROOM_URL` and `OPENCLAW_NEWSROOM_TOKEN` if you have a private feed
   - or `NEWSROOM_PULL_URL` and `NEWSROOM_PULL_TOKEN` if you use a generic newsroom feed
3. Add the same `DATABASE_URL`, `SESSION_SECRET`, `GOOGLE_CLIENT_ID`, and `GOOGLE_CLIENT_SECRET` values to Vercel production env vars.
4. Run a one-time cloud seed after setting `DATABASE_URL`:

```powershell
npm run storage:sync
```

5. In Vercel production environment variables, set `DOCUMENT_STORE_REQUIRE_DATABASE=1` after the seed succeeds.

After that, GitHub Actions can run the OpenClaw manager every 15 minutes, sync the refreshed newsroom into Neon, and Vercel can deploy the site without your local machine staying online.

The Vercel function is configured to exclude the largest generated JSON files from the serverless bundle:

- `data/newsroom-content.json`
- `data/openclaw-hidden-feed.json`
- temporary newsroom batch files under `data/`

That keeps the deployed function lighter. The live site should use `DATABASE_URL` as the data source before you rely on that dataless deployment path.

## Telegram seller bot

This repo now includes a Telegram seller bot that can manage a lightweight product catalog for a seller group.

## Telegram newsroom operator bot

The newsroom bot lets the owner control Patrick Tech Media from Telegram without keeping a local computer online. It runs as a Vercel webhook and delegates heavy refresh work to GitHub Actions/OpenClaw.

Supported commands:

- `/status` - web status, article count, latest story, OpenClaw queue health
- `/auto` - automatic schedule, webhook mode, and setup state
- `/latest` - latest published articles with links
- `/learn` - current adaptive learning profile
- `/feedback <good|bad|more|less|source|image|tone> <note>` - teach the bot what to repeat or avoid
- `/health` - live homepage and newsroom API health check
- `/web` - quick web management links
- `/id` - show Telegram chat id and user id for env setup
- `/setup` - Vercel setup checklist
- `/submit <url>` - read, verify, and publish a source link through the newsroom workflow
- `/refresh` - admin-only request to run the newsroom refresh workflow
- `/jobs` - recent OpenClaw jobs
- `/help` - command list

Admins can also send a plain article URL to the bot without a command. The bot dispatches the GitHub workflow with `article_url`; the refresh cycle fetches the page, removes boilerplate, checks technology relevance, keeps only a suitable source image, applies the newsroom quality gate, and appends the verified article instead of replacing the whole site.

The bot uses an adaptive editorial learning loop rather than CNN training. CNNs are not useful for lightweight text publishing on Vercel, so OpenClaw records feedback and engagement signals, builds topic/source/style weights, and applies those weights to future front-page ranking and editorial rules.

Configure these values in Vercel production env vars and GitHub Actions secrets where needed:

```powershell
TELEGRAM_NEWSROOM_BOT_TOKEN=
TELEGRAM_NEWSROOM_ALLOWED_CHAT_IDS=
TELEGRAM_NEWSROOM_ADMIN_USER_IDS=
TELEGRAM_NEWSROOM_REPORT_CHAT_IDS=
TELEGRAM_NEWSROOM_WEBHOOK_PATH=/api/telegram/newsroom/webhook
TELEGRAM_NEWSROOM_WEBHOOK_SECRET=
TELEGRAM_NEWSROOM_AUTO_WEBHOOK=1
OPENCLAW_LEARNING_STATE_PATH=data/openclaw-learning-state.json
GITHUB_WORKFLOW_DISPATCH_TOKEN=
GITHUB_WORKFLOW_REPOSITORY=phupatrick/patrick-teck-media
GITHUB_WORKFLOW_FILE=newsroom-refresh.yml
GITHUB_WORKFLOW_REF=main
CRON_SECRET=
FB_PAGE_ID=885195674667440
FB_PAGE_ACCESS_TOKEN=
SOCIAL_AI_PROVIDER=offline
SOCIAL_AI_API_KEY=
SOCIAL_AUTOPILOT_ENABLED=1
SOCIAL_AUTOPILOT_LIMIT=1
SOCIAL_AUTOPILOT_ROTATE_TOPICS=0
```

`TELEGRAM_NEWSROOM_ADMIN_USER_IDS` must include your Telegram numeric user id before `/refresh` can dispatch automation.

The Telegram webhook self-registers from Vercel when `TELEGRAM_NEWSROOM_AUTO_WEBHOOK=1`, `SITE_URL`, `TELEGRAM_NEWSROOM_BOT_TOKEN`, `TELEGRAM_NEWSROOM_WEBHOOK_PATH`, and `TELEGRAM_NEWSROOM_WEBHOOK_SECRET` are present. The 15-minute GitHub Actions cycle also wakes the production site so Vercel can refresh the webhook without your local machine running. The `telegram:newsroom:webhook:set` script remains only as a repair tool for local/manual recovery.

Delete it if you need to rotate tokens:

```powershell
npm run telegram:newsroom:webhook:delete
```

The Vercel cron route `/api/openclaw/cron` is enabled in `vercel.json` with schedule `0 1 * * *` UTC, which is 08:00 Asia/Ho_Chi_Minh. It dispatches the GitHub workflow as a daily fallback. Set `CRON_SECRET` in Vercel and send it as `Authorization: Bearer <CRON_SECRET>`; the route rejects unauthenticated requests whenever the secret is configured. The GitHub Actions workflow remains the high-frequency automation path at `*/15 * * * *`, while Vercel keeps the Telegram command webhook online.

Social Autopilot runs in production on the existing 15-minute GitHub Actions newsroom cadence, with a default maximum of two posts per run. Its daily quota remains five information posts, two AI-selected posts, and three eligible product promotions. It is enabled by default in production; set `SOCIAL_AUTOPILOT_ENABLED=0` only for an intentional pause. It selects recent Vietnamese newsroom articles that have no matching `source_key` in the social store, stores the Facebook id, uses a fallback technology image when the source has none, and reports successes to Telegram. Set `SOCIAL_AUTOPILOT_RUN_LIMIT` to change the per-run pacing, and `SOCIAL_AUTOPILOT_ROTATE_TOPICS=1` to use the small evergreen topic rotation only when no unpublished newsroom article is available. Never commit page tokens or API keys.

### Configure

Add these values to `.env`:

```env
SELLER_CATALOG_PATH=data/seller-catalog.json
SELLER_TIMEZONE=Asia/Ho_Chi_Minh
SELLER_TIMEZONE_OFFSET=+07:00
SELLER_TRANSLATION_MODE=fallback
SELLER_TRANSLATION_ENDPOINT=
SELLER_TRANSLATION_API_KEY=
SELLER_TRANSLATION_MODEL=
TELEGRAM_BOT_TOKEN=your-bot-token
TELEGRAM_BOT_POLL_TIMEOUT=20
TELEGRAM_SELLER_ALLOWED_CHAT_IDS=-1001234567890
TELEGRAM_SELLER_ADMIN_USER_IDS=123456789,987654321
TELEGRAM_SELLER_WEBHOOK_PATH=/api/telegram/seller/webhook
TELEGRAM_SELLER_WEBHOOK_SECRET=replace-with-a-random-secret
```

`TELEGRAM_SELLER_ALLOWED_CHAT_IDS` should contain your seller group chat id. Everyone inside that group can browse and search. `TELEGRAM_SELLER_ADMIN_USER_IDS` is the admin list that can add, edit, and delete products.
The catalog is USD-only. Product prices are always stored and rendered in `USD`.

### Run locally

```powershell
npm run telegram:seller:bot
```

The bot stores categories, products, temporary-product expiry, translations, and user language preferences in `data/seller-catalog.json` by default, and will use `DATABASE_URL` when available through the shared document-store layer. If you configure the `SELLER_TRANSLATION_*` values with an OpenAI-compatible endpoint, the bot can auto-translate admin-entered `English` or `Vietnamese` product content into `Myanmar`.
The active bot experience is now English-only so the catalog, menus, buttons, help copy, and admin commands stay simple and consistent.

### Run on webhook

Deploy the app so `SITE_URL` points to a public `https` URL, then register the webhook:

```powershell
npm start
npm run telegram:seller:webhook:set
```

The Telegram seller bot webhook is served by the main Node server at `TELEGRAM_SELLER_WEBHOOK_PATH`. Telegram will push updates to that route, so the bot can stay online without your local machine running as long as the deployed app is up.

### Commands

```text
/heybot
/find <keyword>
/addcat Category name
/add <category_id> | Name | Duration | Warranty | Price | Description
/addtemp Name | Duration | Warranty | Price | Description | YYYY-MM-DD
/edit <product_id> | name=... | category=... | duration=... | warranty=... | price=... | desc=... | until=... | status=active|inactive
/delete <id>
/summary
```

`/heybot` opens the inline-button catalog menu. Users can browse categories, open a product card that shows `name - duration - warranty - price`, tap into product details to read the description, and search products from the button flow. Temporary products can live under the temporary layer and will auto-disappear after their expiry date.

Examples:

```text
/addcat Tep GPT
/add tep-gpt | GPT Plus | 1 month | 7 days | 20 | Shared GPT Plus account
/add tep-gpt | GPT Pro | 1 month | 5 days | 18 | Shared GPT Pro account
/addtemp Gemini Ultra | 1 month | 3 days | 15 | Flash sale account | 2026-04-30
/edit prod_ab12cd34 | price=18 | warranty=5 days | desc=Updated package note
```
