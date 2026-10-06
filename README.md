# Living Stones

Painted stones, shared journeys. English, map-first website: https://livingstones.rodulab.com/. The original https://romanduris.github.io/LivingStones/ address redirects to the custom domain.

Cloudflare DNS points `livingstones.rodulab.com` to `romanduris.github.io` with a DNS-only CNAME. GitHub Pages serves the site and its HTTPS certificate; the root `CNAME` file preserves the custom domain on each publication. GitHub Pages publishes the root of `main`. The root `index.html` uses assets from `docs/`; `docs/index.html` serves the same UI with relative asset paths. Keep both entry points in sync.

## Live data

Cloudflare Worker **livingstones-api** serves the API at https://livingstones-api.livingstones-romanduris.workers.dev. Its `DB` binding points only to D1 **livingstones-db**. The frontend reads stones, finds and messages through the API; it does not use hardcoded stone journeys or browser storage as its data source. Cloudflare management credentials never enter the frontend.

Nine fictional stones are marked **Demo**, with numeric Find Codes **8451–8459** (Sunny Side: **8451**). Opening the find form focuses its heading rather than the input, so the keyboard waits for a tap on the code field. Numeric demo codes request the numeric keyboard. Stones with `is_demo = 0` show **Real**; their Find Codes are never returned by the API. Creators are stored independently of finders in `stones.creator`. The seed contains 45 finds and 45 finder notes around Bratislava, Austria and Hungary. `fixtures/demo-data.js` is input for seeding and tests, not a browser script. The homepage opens with a responsive card grid, name/place search, age sorting (oldest first), distance/recency sorting, and Cards/List controls. Estimated distances sum each recorded straight-line route leg (haversine formula) multiplied by 1.5; only the final displayed total is rounded. Existing SVG images can later be replaced with asset paths or full photo URLs.

Opening a stone or its shared `?stone=A1` link records a story view, without recording a find. Desktop visitors see its story. Phones and tablets can record a find using a Find Code, GPS and an optional nickname/note. After permission, a preview map displays the location and GPS accuracy; Photon provides a street/area name when available. When GPS is unavailable, a discreet city search uses Photon autocomplete and previews an approximate city location. Select a result before continuing; these finds are labelled Manual for both demo and real stones. Only a successful database write updates the history, maps and totals.

The standalone Leave a note button has been removed; existing standalone notes remain visible. New messages are attached to finds and remain after refresh. Alive means found in the last 90 days. All public form text is rendered as text, not HTML.

Requests have stable idempotency keys so retries after lost responses cannot create duplicate records. Find and associated note writes are transactional. The API validates codes, text lengths, coordinates and request origins, uses bound SQL parameters, and limits write attempts. CORS allows `https://romanduris.github.io` and `https://livingstones.rodulab.com`; it is not authentication. Demo codes remain public for testing. Real Find Codes must be sufficiently random and kept on the physical stones. Coordinates, nicknames and messages are public; no raw IP addresses are stored in the write limiter.

## Management

`https://livingstones.rodulab.com/management/` provides an owner dashboard for all stones, view totals, search/type filters and sorting, stone details/appearance/Find Codes, finds and attached or standalone comments. Changes use authenticated admin API endpoints and the same D1 database as the public website. Deleting a stone removes its finds, comments, idempotency records and deduplication events in a transaction. Historical daily traffic totals remain under a deleted-stone label. Deleting a comment keeps the find. A stone retains its birth location; edit it instead of deleting it, or delete the entire stone. Birth and encounter dates stay chronologically valid. Converting Demo to Real requires a new private Find Code.

Authentication uses a generated 256-bit password, with only its SHA-256 hash in the Worker's `ADMIN_PASSWORD_HASH` secret. No admin credential belongs in source or frontend configuration. Sign-in attempts are limited separately from public finds. Session tokens have 256 bits of randomness, are stored only as hashes in D1, expire after four hours, and are revoked on sign-out. The owner browser stores its token in sessionStorage (per-tab); admin writes require an allowed Origin and Bearer authorization. The admin UI has a restrictive Content Security Policy and escapes public content. Anonymous visitors can load only the sign-in shell; admin reads and writes fail without a valid session, including at the direct workers.dev endpoint.

After applying migrations, create or rotate the owner password:

```sh
npm run management:password
```

The command installs the hash as a Worker secret, revokes existing sessions, and writes a private local access file (mode 0600). It prints only the file path. Keep the password in a password manager. Never commit the access file. Rotation changes only LivingStones resources.

Public `POST /api/stones/:id/views` counts a story opening without a Find Code. A generated view-event ID deduplicates retries/concurrent submissions transactionally. Reading the stone list, clicking a main-map popup, admin browsing, and rerendering a find form do not record story views. Counts start at zero; the former example value of 524 is not imported. View events expire after 30 days for bounded deduplication storage; total counts and daily aggregates remain. Counts measure openings, not unique people. Public view attempts have their own rate limiter. No raw IP addresses are stored.

## Design

The sticky charcoal navigation, Baloo 2 headings and Nunito Sans text use local WOFF2 fonts with their licenses in `docs/assets/fonts/`. Purple, coral, teal and yellow accents match the painted pebble brand. Leaflet is locally vendored. OpenStreetMap tiles receive a subdued charcoal/purple filter, with lavender marker outlines and journey routes. Attribution remains visible. If tiles fail, location markers and controls still work.

The overview remains a table at phone sizes: The first visible data column is left aligned, the last is right aligned, and the middle columns are centered. Last Found highlights elapsed days, with city and flag underneath; its heading stays on one line on phones. The redundant countries legend is removed. Age shows a compact day suffix, such as `542d`; Last Found uses `15d ago`. Numeric columns have equal widths and centered headings/values. All headings have smaller explanatory subtitles. The last commenter name uses the yellow accent. Finds and Countries are separate columns; the Countries heading remains a word on phones. Primary table lines share one bold font size and secondary lines a smaller regular size. Short stone taglines have been removed from the UI, API, seed and database. Less important columns disappear progressively and birth details move underneath the stone name. The overview starts with the map. Stone details show the stone image and Alive age in the header, followed by a personal introduction, creator, birthplace and age/encounter totals. The mobile find button, share icon and other-stones action sit in one row before the route map and journey statistics. The story feed combines finds and standalone notes, newest first, with date, city and flag on the left, the address directly underneath, and the finder on the right and the location-source badge after the address. The message follows beneath them. Standalone notes do not claim a location. URL/history/sharing support stays in the main page.

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
| `POST /api/stones/:id/views` | Records a deduplicated story opening |
| `POST /api/stones/:id/verify` | Validates Find Code before requesting GPS |
| `POST /api/stones/:id/finds` | Saves a confirmed find and optional message |
| `POST /api/stones/:id/comments` | Saves a note without a find |

Public find/comment writes require JSON, the allowed frontend Origin, and `code`. Find/comment submissions also require an `Idempotency-Key`. The Worker supplies timestamps and record IDs. Authenticated management endpoints live under `/api/admin/` (login/logout, stone reads/updates/deletion, find and comment updates/deletion). A stone-creation endpoint is not exposed yet; new real stones can be inserted through controlled D1 operations.

### QR codes and traffic statistics

Management has separate **Management** and **Stats** tabs. Each stone editor generates a local, black-on-white QR code for its public HTTPS story URL, with error correction H and a four-module quiet zone. SVG and high-resolution PNG downloads include the border and the Find Code underneath, outside the quiet zone. Demo Find Codes are shown automatically. For real stones only a hash is stored: the owner can enter the existing code in management; an authenticated `/api/admin/stones/:id/label-code` verification checks its hash before showing it. A newly saved code is also available for the current editor session. Private codes remain only in page memory and are cleared on sign-out/reload; they are not added to session storage or the public API. The management header and favicon use a red stone with a gear. The QR contains the public stone ID and `source=qr`, never the private Find Code. Only QR story links offer the find flow on supported mobile/tablet devices. Shared links, management public-story links, and stories opened from the overview omit this parameter; sharing and returning to the overview remove it. This is a UI distinction, not proof of scanning a QR code; Find Code verification remains required. Previously printed QR codes without `source=qr` must be regenerated from management to offer the find flow. The optional `story` field was removed from forms, fixtures, API, seed and D1 by migration 0008; find notes and comments remain.

Stats filters 7 / 30 / 90 days / all time and homepage / all stories / individual stones. Interactive charts show daily openings and cumulative all-time totals, with a per-page ranking. `POST /api/page-views` counts each homepage opening; direct story links count only the story. Returning from a story to the overview is another homepage opening. Admin browsing and form rerenders do not count. These are openings, including repeat visits, not unique visitors. Daily buckets use UTC; long periods are grouped for readable charts. Migration 0007 backfills dated stone events and preserves any older undated counts as an initial cumulative baseline. Homepage history begins at deployment; missing past traffic is not invented.

`GET /api/admin/stats?period=30` requires a management session. Daily aggregates survive event cleanup and stone deletion. Individual deduplication IDs are retained for 30 days. New view events share the existing separate view rate limit.

HTTPS is enforced by GitHub Pages for `livingstones.rodulab.com`; HTTP requests redirect to HTTPS with status 301. The frontend also retains an HTTPS redirect before fetching data.
