# Living Stones

Painted stones, shared journeys. English, map-first website: https://livingstones.rodulab.com/. The original https://romanduris.github.io/LivingStones/ address redirects to the custom domain.

Cloudflare DNS points `livingstones.rodulab.com` to `romanduris.github.io` with a DNS-only CNAME. GitHub Pages serves the site and its HTTPS certificate; the root `CNAME` file preserves the custom domain on each publication. GitHub Pages publishes the root of `main`. The root `index.html` uses assets from `docs/`; `docs/index.html` serves the same UI with relative asset paths. Keep both entry points in sync.

## Live data

Cloudflare Worker **livingstones-api** serves the API at https://livingstones-api.livingstones-romanduris.workers.dev. Its `DB` binding points only to D1 **livingstones-db**. The frontend reads stones, finds and messages through the API; it does not use hardcoded stone journeys or browser storage as its data source. Cloudflare management credentials never enter the frontend.

Fourteen fictional stones are marked **Demo**, with numeric Find Codes **8451–8464** (Sunny Side: **8451**). Opening the find form focuses its heading rather than the input, so the keyboard waits for a tap on the code field. Numeric demo codes request the numeric keyboard. Stones with `is_demo = 0` show **Real**; their Find Codes are never returned by the API. Creators are stored independently of finders in `stones.creator`. The seed contains 70 finds and 70 finder notes around Bratislava, Austria and Hungary. `fixtures/demo-data.js` is input for seeding and tests, not a browser script. The homepage opens with a responsive card grid, name/place search, age sorting (oldest first), distance/recency sorting, and Cards/List controls. Cards initially show at most three rows, with a visible/total counter and a button to reveal three more rows. The overview map can collapse to a Map tab while statistics and cards remain visible. Estimated distances sum each recorded straight-line route leg (haversine formula) multiplied by 1.5; only the final displayed total is rounded. Existing SVG images can later be replaced with asset paths or full photo URLs.

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

Public find/comment writes require JSON, the allowed frontend Origin, and `code`. Find/comment submissions also require an `Idempotency-Key`. The Worker supplies timestamps and record IDs. Authenticated management endpoints live under `/api/admin/` (login/logout, stone reads/updates/deletion, find and comment updates/deletion). Authenticated `POST /api/admin/stones` creates an uninitialized real stone and returns its private Find Code for the current editor session. Create new stone requests an authenticated `POST /api/admin/stone-drafts` preview without inserting a stone. Add an optional private note and press Create stone to persist that exact preview, then download its QR/Find Code label. No name, image, theme, or birth location is required in management.

### QR codes and traffic statistics

Management has separate **Management** and **Stats** tabs. Each stone editor generates a local, black-on-white QR code for its public HTTPS story URL, with error correction H and a four-module quiet zone. The preview, SVG and high-resolution PNG downloads include the public stone logo and black Living Stones wordmark on white above the QR, the border and a larger Find Code caption underneath, outside the quiet zone. Demo and real Find Codes are shown automatically, including after reload or sign-in. Migration 0012 adds `label_code` for reprinting; only authenticated admin reads expose it as `privateCode` for real stones. Public reads never select this column, and verification still uses `code_hash`. Creation and explicit code changes save both values atomically. `node scripts/recover-label-codes.cjs --remote` restores existing four-digit labels by matching hashes, without changing codes or printing them. Legacy longer codes can be entered once using authenticated `/api/admin/stones/:id/label-code`; a valid code is retained for future labels. Codes are never added to session storage. The management header and favicon use a red stone with a gear. The QR contains the public stone ID and `source=qr`, never the private Find Code. Only QR story links offer the find flow on supported mobile/tablet devices. Shared links, management public-story links, and stories opened from the overview omit this parameter; sharing and returning to the overview remove it. This is a UI distinction, not proof of scanning a QR code; Find Code verification remains required. Previously printed QR codes without `source=qr` must be regenerated from management to offer the find flow. The optional `story` field was removed from forms, fixtures, API, seed and D1 by migration 0008; find notes and comments remain.

Stats filters 7 / 30 / 90 days / all time and homepage / all stories / individual stones. Interactive charts show daily openings and cumulative all-time totals, with a per-page ranking. `POST /api/page-views` counts each homepage opening; direct story links count only the story. Returning from a story to the overview is another homepage opening. Admin browsing and form rerenders do not count. These are openings, including repeat visits, not unique visitors. Daily buckets use UTC; long periods are grouped for readable charts. Migration 0007 backfills dated stone events and preserves any older undated counts as an initial cumulative baseline. Homepage history begins at deployment; missing past traffic is not invented.

`GET /api/admin/stats?period=30` requires a management session. Daily aggregates survive event cleanup and stone deletion. Individual deduplication IDs are retained for 30 days. New view events share the existing separate view rate limit.

HTTPS is enforced by GitHub Pages for `livingstones.rodulab.com`; HTTP requests redirect to HTTPS with status 301. The frontend also retains an HTTPS redirect before fetching data.

## Stone Watchdog

The bell in each stone’s detail opens the Watchdog email form. `POST /api/stones/:id/watchdog` accepts `{ "email": "reader@example.com" }` from the allowed website origins without a Find Code. Migration 0009 stores subscriptions in `stone_watchers`, with one normalized email per stone and a creation timestamp. A stone can have multiple subscribers; the same email can watch several stones. Retrying a signup returns the same `{ "ok": true, "notificationsEnabled": false }` response. The endpoint validates email addresses and limits requests separately from finds.

Emails are private: public stone responses never include subscriptions, and there is no public subscriber-list endpoint. Removing a stone also removes its subscriptions. This currently only saves email addresses; there is no email delivery, movement notification, or background notification job.

## New stone setup

The same printed `?stone=ID&source=qr` URL opens `initialize/?stone=ID` while a stone is awaiting birth, then its ordinary story after initialization. Pending stones appear in management (including the Not born filter) and are excluded from the public collection. Migration 0010 marks all existing stones as initialized, so their printed QR codes and stories continue to work.

The standalone setup page matches the charcoal, lavender and teal design, explains painted-stone journeys, and links to the main website. Its EN/SK/HU/DE language switch translates instructions, themes, portrait labels, dates and status messages without clearing entered fields, portrait selection or birthplace. The language preference is remembered locally. The creator enters Name, Painted by and the physical Find Code, chooses an online portrait and theme, and requests GPS with an explicit button. Birth needs a valid Find Code and a selected GPS or manual city location; declining GPS permission leaves the form intact for another attempt or city search. The subtle “Location not working? Choose a city” control uses the same Photon suggestions and approximate-location marker as the find form. Typing a city does not choose a birthplace: the creator must select a result. Both GPS and manual choices have a map preview. Place-name lookup uses Photon with coordinates as a fallback. The Worker supplies the current birth timestamp and records the first journey point together with the stone details.

Forty unique SVG portraits extend the editable illustrations in `docs/assets/birth-stones/`. `GET /api/stones/:id/images` returns up to ten random unclaimed portraits and the remaining count. Selection is only committed when the stone is born. A transactional database claim ensures concurrent creators cannot adopt the same portrait or initialize the same stone twice. On a portrait conflict, the form retains its name and location and offers another selection. Deleting a stone returns its portrait to the stock in the same database transaction. Deleted Demo SVGs are also registered in the stock and can be adopted by new real stones. Shared images are offered only after the last stone using them is removed; the inventory never duplicates an image path. Migration 0011 also releases orphaned portraits from earlier deletions, while preserving any portrait still in use. An exhausted inventory displays an explicit message; it never offers a portrait that is still assigned. `scripts/generate-birth-stones.cjs` deterministically reproduces the 40 assets, manifest and initial inventory migration; do not rerun an applied migration in production to refill stock.

`POST /api/stones/:id/initialize` requires an allowed Origin, the Find Code, GPS and an Idempotency-Key. Birth retries return the saved stone, while changed or competing requests cannot overwrite it. The management creation button also uses an Idempotency-Key so a lost response can be retried without creating a second label. New private codes contain exactly four numeric digits, including leading zeros. They are derived from the random creation key and the server-only management secret; verification uses their hash, and public responses never contain the creation key or private code. Management privately retains the printable code so the label is available after reload or signing in again.

Management displays the number of available portraits, including returned Demo SVGs. The draft note is saved atomically by Create stone; QR downloads become available only after that save. Cancelling a draft leaves no stone record. Each saved pending or initialized stone has a separate **My private note** editor (up to 2,000 characters), saved with authenticated `PATCH /api/admin/stones/:id/note`. Notes are returned only by admin stone reads; public lists, stories, initialization and find responses never contain them. Editing public details keeps the private note intact. Notes are removed with their stone.

The setup theme preview shows the selected portrait against the exact background colour used in the collection list, with a short explanation of each theme. Choosing a theme changes that background; it does not replace the selected SVG portrait. Previously printed Find Codes remain valid; newly created or explicitly changed codes use four digits.
