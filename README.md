# Living Stones

A mobile-first visual MVP for painted stones that travel between people. The interface is in English and uses five fictional stones with 25 seeded finds. There is no backend, database, account system, or server-side find verification.

Live site: https://romanduris.github.io/LivingStones/

## Run locally

Run `python3 -m http.server 8000` and open http://localhost:8000. The root entry point uses assets from `docs/`. Alternatively serve `docs/` directly. Both entry points support `?stone=A1`, `B2`, `C3`, `D4`, or `E5`. Opening a story never records a find.

## Try a find

On a phone or tablet, open a stone and choose **I found this stone**. Device detection preserves the original user-agent, Client Hints and iPad touch checks; narrow desktop windows do not enable the mobile flow.

| Stone       | ID  | Demo Find Code |
| ----------- | --- | -------------- |
| Sunny Side  | A1  | SUN24          |
| Little Luna | B2  | MOON7          |
| Slow Bloom  | C3  | GROW3          |
| Wildheart   | D4  | LOVE4          |
| Ocean Echo  | E5  | WAVE5          |

Enter the code, explicitly request device location or choose a clearly labelled demo city, then optionally add a nickname and message. Submission updates cards, statistics, last location, journey map and timeline immediately. Additions persist under `livingstones.demo.finds.v1` in local storage; blocked storage falls back to memory. Remove that key in browser devtools to reset local finds. Codes are intentionally visible demo data, not secure verification.

GPS requires a secure context (HTTPS or localhost) and browser permission. The button sends coordinates to Photon/Komoot for reverse lookup with an eight-second timeout; failure preserves coordinates. GPS denial, timeout or unavailability can be retried or bypassed with a demo city. No IP lookup, GPS request or location-service call happens merely by opening a page or stone.

## Architecture and assets

`docs/data.js` holds realistic fictional journeys. `stoneRepository` in `docs/app.js` isolates reads and writes so an API can replace demo persistence later. URL state, native modal focus/escape behavior, browser history, sharing, chronological finds and maps are handled by the presentation layer.

Original stone illustrations live in `docs/assets/stone-*.svg`. The self-hosted world silhouette is derived from [Natural Earth 1:110m land](https://github.com/nvkelso/natural-earth-vector/blob/master/geojson/ne_110m_land.geojson), public-domain geographic data. Maps use equirectangular coordinates and support zoom/reset. Numbered route markers match the chronological timeline; they illustrate connections between finds, not actual travel paths. Maps and illustrations need no external API. Google Fonts supplies optional fonts; local fallbacks work offline.

## Validation and publication

Run `node --test tests/page.test.cjs` for model/device/location checks. Browser tests live in `tests/browser.cjs` and require Playwright (`npm install --no-save --package-lock=false playwright`, then `npx playwright install chromium`) and Python 3. Run `node tests/browser.cjs`; it starts its own temporary server on port 8137.

GitHub Pages serves `main` at the repository root. Keep root and docs HTML identical apart from asset paths. Commit and push confirmed changes to `main`, then verify the live publication.
