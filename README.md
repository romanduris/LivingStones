# Living Stones

Painted stones, shared journeys. English, map-first website: https://romanduris.github.io/LivingStones/.

The frontend is published from `docs/` using GitHub Pages. The root `index.html` serves the same UI locally with `docs/` asset paths. Keep both entry points in sync.

## Live data

Cloudflare Worker **livingstones-api** serves the API at https://livingstones-api.livingstones-romanduris.workers.dev. Its `DB` binding points only to D1 **livingstones-db**. The frontend reads stones, finds and messages through the API; it does not use hardcoded stone journeys or browser storage as its data source. Cloudflare management credentials never enter the frontend.

Five fictional stones are marked **Demo**. Stones with `is_demo = 0` show **Real**; their Find Codes are never returned by the API. Creators are stored independently of finders in `stones.creator`. The seed contains 25 finds and 25 finder notes around Bratislava, Austria and Hungary. `fixtures/demo-data.js` is input for seeding and tests, not a browser script. Existing SVG images can later be replaced with asset paths or full photo URLs.

Opening a stone or its shared `?stone=A1` link only reads data. Desktop visitors see its story. Phones and tablets can record a find using a Find Code, GPS and an optional nickname/note. After permission, a preview map displays the location and GPS accuracy; Photon provides a street/area name when available. Demo stones also allow explicitly labelled fictional locations. Real stones require GPS. Only a successful database write updates the history, maps and totals.

**Leave a little note** stores a standalone message with a Find Code. It does not add a find, move the pin, or revive the stone. Both kinds of messages remain after refresh and are visible to other visitors. Alive means found in the last 90 days. All public form text is rendered as text, not HTML.

Requests have stable idempotency keys so retries after lost responses cannot create duplicate records. Find and associated note writes are transactional. The API validates codes, text lengths, coordinates and request origins, uses bound SQL parameters, and limits write attempts. CORS is configured for the GitHub Pages origin; it is not authentication. Demo codes remain public for testing. Real Find Codes must be sufficiently random and kept on the physical stones. Coordinates, nicknames and messages are public; no raw IP addresses are stored in the write limiter.

## Design

The sticky charcoal navigation, Baloo 2 headings and Nunito Sans text use local WOFF2 fonts with their licenses in `docs/assets/fonts/`. Purple, coral, teal and yellow accents match the painted pebble brand. Leaflet is locally vendored. OpenStreetMap tiles receive a subdued charcoal/purple filter, with lavender marker outlines and journey routes. Attribution remains visible. If tiles fail, location markers and controls still work.

The overview remains a table at phone sizes: The first visible data column is left aligned, the last is right aligned, and the middle columns are centered. Last Found includes a compact elapsed-day label. Less important columns disappear progressively and birth details move underneath the stone name. The overview starts with the map. Stone details begin with a personal introduction, creator and birthplace, followed by the route map, journey statistics and actions. The story feed combines finds and standalone notes, newest first, with date, city, flag and finder in its header, then the address and message. Standalone notes do not claim a location. URL/history/sharing support stays in the main page.

## Development and tests

```sh
npm ci
npx playwright install chromium
npm test
```

Tests cover the seed, devices, GPS accuracy/addresses, 90-day Alive calculation, real local D1 writes, input validation, private real codes, transaction/idempotency behavior, repeated seeding, write limiting, persistent finds/notes, URL behavior and responsive layouts. API tests create a temporary **local** D1 store; they never use the production database. Browser tests use isolated API fixtures to check UI behavior and refresh persistence.

To run the complete stack locally:

```sh
npx wrangler d1 migrations apply livingstones-local-db --local --config wrangler.local.jsonc
npx wrangler d1 execute livingstones-local-db --local --config wrangler.local.jsonc --file backend/seed.sql
npm run dev:api
# In another terminal:
python3 -m http.server 8137
```

Open http://127.0.0.1:8137. `docs/config.js` selects port 8787 on localhost and the public Worker elsewhere. The local configuration has a different database name/ID and allows only local frontend origins. Local state and environment files are ignored by Git.

## Production operations

Provide `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` as environment secrets. Do not commit or print their values. Production configuration and binding UUID are in `wrangler.jsonc`.

```sh
npm run seed
npx wrangler d1 migrations apply livingstones-db --remote --config wrangler.jsonc
npx wrangler d1 execute livingstones-db --remote --config wrangler.jsonc --file backend/seed.sql
npm run deploy
```

Seeding uses deterministic IDs and `INSERT OR IGNORE`; running it again preserves all new finds and messages. Add schema changes as new migration files. The GitHub Pages frontend deploys when `main` is pushed; Worker changes are deployed separately using the commands above. Readiness endpoint: `/api/health`.

BTSflighttickets resources are not part of either Wrangler configuration. Projects have separate Workers, databases and migrations; account quotas and billing remain shared.

## API

| Endpoint | Behavior |
| --- | --- |
| `GET /api/health` | Checks the database binding |
| `GET /api/stones` | Public journeys and messages |
| `GET /api/stones/:id` | Public stone detail |
| `POST /api/stones/:id/verify` | Validates Find Code before requesting GPS |
| `POST /api/stones/:id/finds` | Saves a confirmed find and optional message |
| `POST /api/stones/:id/comments` | Saves a note without a find |

Writes require JSON, the allowed frontend Origin, and `code`. Find/comment submissions also require an `Idempotency-Key`. The Worker supplies timestamps and record IDs. No administration or stone-creation endpoint is exposed in this first backend; real stones can be inserted through controlled D1 migrations/operations when ready.
