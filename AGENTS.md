# AGENTS.md

Guidance for AI coding agents working in this repository.

## Project

TaxiRouter SG is a web app for exploring available taxis and taxi stands in Singapore. It is vanilla JavaScript with no UI framework.

## Stack

- Parcel 3 alpha (`parcel@~3.0.0-0`) for bundling and the dev server
- mapbox-gl v3 for the map
- Turf v7 for geospatial helpers
- A mix of ES modules and CommonJS in `src/`

## Requirements

- Node.js 18+ (developed on Node 24). Parcel 3 itself is a standalone Rust binary, but the npm scripts still need Node.
- npm; `package-lock.json` is committed.

## Commands

- `npm install` — install dependencies
- `npm start` — dev server at http://localhost:1234 (runs with `--no-hmr`)
- `npm run start-https` — dev server with HTTPS
- `npm run build` — production build into `dist/`; `postbuild` copies `public/*` into `dist`
- `npm run taxi-stands` — fetch the latest LTA Taxi Stop GeoJSON from data.gov.sg and regenerate `data/taxi-stands.json`

## Layout

- `src/index.html` — Parcel entry point
- `src/app.js` — main app: map setup, layers, geolocation, service worker registration
- `src/app.css` — styles (imports mapbox-gl CSS)
- `src/sw.js` — service worker (Workbox loaded from CDN)
- `data/taxi-stands.json` — array of `[lng, lat]` pairs consumed by the app
- `scripts/fetch-taxi-stands.js` — fetches taxi stands from the data.gov.sg API
- `public/` — static files copied into `dist` at build time (CNAME, favicon)
- `.parcelrc` — Parcel config: disables SVG minification (HTML transformer options)

## Conventions and gotchas

- Import JSON with ESM (`import data from './data.json'`). Parcel 3's `require()` of JSON returns a module namespace (`{ default: ... }`), which silently breaks data passed to Turf.
- Turf packages are CommonJS; `require('@turf/foo').default` is the expected pattern.
- Parcel 3 removed `--no-cache`, `--no-autoinstall`, and on-disk caching. Do not reintroduce them.
- `.htmlnanorc` is no longer supported; HTML transformer options live in `.parcelrc`.
- Import Mapbox GL from its ESM entry (`import * as mapboxgl from 'mapbox-gl/esm'`) and set the token with `mapboxgl.setAccessToken(...)`. The namespace object is sealed, so assigning `mapboxgl.accessToken` throws. The ESM build lazy-loads its 3D/environment/high-detail renderer modules based on the style.
- The `~1.4 MB` app chunk warning is nearly all mapbox-gl's core/shared code. It is expected; serve assets with gzip/brotli.
- Do not add `manualSharedBundles` for mapbox-gl. In Parcel 3 alpha, splitting `core.js`/`shared.js` into a shared vendor bundle makes the lazy renderer chunks (and the map worker) re-use a duplicate module instance, so `type: 'model'` layers silently draw nothing in production builds — the GLB still loads and `map.listModels()` reports it, which makes this easy to misdiagnose. Verify 3D taxis with a production build, not just `npm start`.
- There is no test suite or linter configured. Verify changes with `npm run build` and by loading the app in a browser.

## Deployment

GitHub Actions (`.github/workflows/main.yml`) runs `npm ci && npm run build` on pushes to `master` and deploys `dist` to the `gh-pages` branch.
