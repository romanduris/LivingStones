# Living Stones

An English visual MVP for painted stones that pass between people. An introduction explains how painted stones come to life through shared encounters and invites finders to carry them to another town or country. Maps lead both the home page and each stone detail. A compact overview table shows miniature stone images, origins, age, find counts, last addresses and latest notes; on smaller screens it remains a table, with horizontal scrolling and a pinned stone identity column. Five fictional stones have 25 finds around Bratislava, all within 100 km of the city, including nearby Austria and Hungary.

Live site: https://romanduris.github.io/LivingStones/

## Run locally

Run `python3 -m http.server 8000`, then open http://localhost:8000. Alternatively serve `docs/` directly. Both entry points support `?stone=A1`, `B2`, `C3`, `D4`, or `E5`. Opening or sharing a stone never records a find.

## Try a find

Computers show the map, stone story and find history. Phones and tablets additionally show **I found this stone**. Detection uses user-agent, Client Hints and iPad touch checks; resizing a computer window does not enable the mobile flow.

| Stone       | ID  | Demo Find Code |
| ----------- | --- | -------------- |
| Sunny Side  | A1  | SUN24          |
| Little Luna | B2  | MOON7          |
| Slow Bloom  | C3  | GROW3          |
| Wildheart   | D4  | LOVE4          |
| Ocean Echo  | E5  | WAVE5          |

Enter the code and select **Continue & locate** to request device location. After permission, the UI shows a location preview with the reported GPS accuracy and a reverse-geocoded street/area. Alternatively select a fictional nearby location. Add an optional nickname and note, then submit to preview a new chapter. Overview rows, statistics, the overview map, journey route and address table update immediately. The new marker is purple and labelled **Your new find**.

Finds are held only in JavaScript memory for the current visit. Refreshing clears them. There is no localStorage/sessionStorage persistence, backend, database, or server-side verification. Demo codes are intentionally visible examples. Older prototype storage is ignored.

Finders are invited to take the stone along, enjoy its company, and leave it somewhere new — ideally another town — where someone else can find it.

## Maps and location

The self-hosted [Leaflet 1.9.4](https://leafletjs.com/) library uses [OpenStreetMap](https://www.openstreetmap.org/copyright) tiles, following the map implementation of the supplied BTS Flight Scanner reference. Maps support dragging, zooming, marker popups and reset controls. The overview shows last known locations; numbered detail markers and a dashed line follow the chronological table. Connections illustrate the sequence of finds rather than actual travel paths. External tile requests require internet access; if tiles fail, markers and controls remain available with a status message. Leaflet's BSD license is included under `docs/vendor/leaflet/LICENSE`.

GPS needs HTTPS or localhost and browser permission. No GPS or reverse-geocoding request occurs simply by viewing a stone. After a valid code and the explicit **Continue & locate** action, GPS is requested with a 15-second timeout. Coordinates are sent to [Photon](https://photon.komoot.io/) only to look up the address/area (eight-second timeout). Address lookup failure preserves exact coordinates; denied, unavailable or timed-out GPS can be retried or replaced with a demo location. Streets and house numbers are omitted when reported accuracy exceeds 150 m. Addresses are map estimates, not verified postal addresses. Canceling a pending request discards its result.

## Data and UI

`docs/data.js` contains the fictional local journeys, birthplaces, addresses and finder messages. `stoneRepository` in `docs/app.js` isolates reads and visit-only writes so an API can replace the data source later. The rest of the UI handles URL state, the native modal, browser history, sharing and maps. The five original stone illustrations are in `docs/assets/stone-*.svg`. The `image` field accepts an asset path or full photo URL, so real photos can replace the illustrations without changing the overview or detail layout. A strong desaturation filter applies only to the map tiles; stone markers and route colours remain vivid. Headings and navigation use Baloo 2; body text and tables use Nunito Sans. Subset WOFF2 fonts are served locally under `docs/assets/fonts/`, alongside their SIL Open Font Licenses, with system fallbacks. Purple, coral, teal and yellow accents complement the white layout and painted pebble logo. The top navigation stays visible while scrolling, with anchor offsets to keep section headings visible.

## Validation and publication

Run `node --test tests/page.test.cjs` for data, distance, device detection, coordinate/address and memory-only repository checks.

Browser checks require Python 3 and Playwright (`npm install --no-save --package-lock=false playwright`, then `npx playwright install chromium`). Run `node tests/browser.cjs`; it starts a temporary local server on port 8137. Tests cover map-first ordering, map controls/markers, mobile-only finding, automatic GPS after code confirmation, address lookup, permission failures, canceled requests, preview-only data, URL/history/sharing, safe user text, unavailable map tiles and responsive layouts.

GitHub Pages serves `main` at the repository root. Keep root and docs HTML identical apart from asset paths. Commit and push confirmed changes to `main`, then verify the live publication.
