# HawkerGoWhere Web

Map and list view of NEA hawker-centre closures. It runs as a single Cloudflare Worker that serves both the API and the static frontend. It also works as a Telegram Mini App.

```
web/
├── worker/index.ts      API: fetches data/latest_data.json from GitHub, normalises it, caches it
├── shared/              types and normalisation shared by the Worker and the frontend
└── src/                 React 19 + Tailwind v4 + MapLibre frontend
```

## API

| Route | Returns |
| --- | --- |
| `GET /api/hawkers` | All hawkers, normalised (`shared/types.ts`). Supports ETag / `If-None-Match`. |
| `GET /api/hawkers/:id` | One hawker by slug, e.g. `hong-lim-food-centre-and-market` |
| `GET /api/closures?date=YYYY-MM-DD` | Hawkers closed on a date (default: today in SGT). Meant for the bot and future notifications. |
| `GET /api/health` | Source timestamps and whether a stale copy is being served |

Normalisation turns `d/m/yyyy` dates into ISO dates and `TBC`/`NA`/`nil` into `null` or `tbc: true`. It splits names like `Upper Cross Street Blk 531A (Hong Lim Food Centre and Market)` into a common name and a location name, upgrades photo URLs to https, and gives each hawker a stable slug ID.

Caching works in three layers: isolate memory, then the Cache API, then GitHub. A copy is fresh for `CACHE_TTL_SECONDS` (900 by default). After that, a stale copy is served for up to a day while a refresh runs in the background. If GitHub is down, the last good copy is still served.

## Develop

```bash
cd web
npm install
npm run dev                      # http://localhost:5181, Worker and frontend on one origin
```

To test inside Telegram, expose the dev server over HTTPS (for example `cloudflared tunnel --url http://localhost:5181`) and set that URL as the Mini App URL in BotFather.

## Deploy

```bash
cd web
npx wrangler login
npm run deploy                         # vite build + wrangler deploy
```

This serves the app at https://hawker.bongzy.me (`routes` in `wrangler.jsonc`); wrangler creates the DNS record and certificate on first deploy. Data updates need no redeploy: the Worker re-reads `latest_data.json` every 15 minutes.

The repo is public, so no GitHub token is needed. If it ever goes private, run `npx wrangler secret put GITHUB_TOKEN` (fine-grained PAT, Contents: read-only, this repo only) and copy `.dev.vars.example` to `.dev.vars` for local dev.

### Telegram Mini App

1. BotFather → `/mybots` → HawkerGoWhereBot → **Bot Settings → Configure Mini App**, and set the URL to `https://hawker.bongzy.me`.
2. Optionally, BotFather → `/newapp` to get a `t.me/HawkerGoWhereBot/<short_name>` link, and put it in `.env` as `VITE_TG_APP_LINK` so share links open inside Telegram.
3. Optionally, add a menu button or an inline `web_app` button in `hawker_go_where_bot.py` that opens the URL.

Inside Telegram the app picks up the user's theme colours and uses the native back button and haptics. It disables vertical swipes, so panning the map doesn't close the app. It respects safe-area insets, opens `?startapp=h_<id>` deep links, and syncs favourites through Telegram CloudStorage.
