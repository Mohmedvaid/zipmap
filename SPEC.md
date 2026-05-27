# zipmap — Product Spec

A free static web app where users paste a list of US zip codes and see them highlighted on a US Census ZCTA map. State-scoped, deployable to GitHub Pages, no backend.

---

## 1. Scope & Architecture

### 1.1 Core architectural decision: state-scoped, not national

The app operates on **one state at a time**. Users pick a state before pasting zips; the map renders only that state's ZCTAs. Rationale:

- ZCTA GeoJSON for all of the US is ~500MB raw, ~20MB heavily simplified. Per-state files are ~1MB each.
- Most real use cases (sales territories, real-estate analyses, store-locator audits) are state-bounded.
- Per-state URLs (/tx, /ca, /il, …) double as SEO landing pages.

### 1.2 Tech stack (load-bearing constraints)

- **Vanilla HTML / CSS / JS.** No framework, no bundler, no transpiler. Files in the repo are the files that ship.
- **Map: Leaflet** + **CartoDB Positron** base tiles (free, no API key, light-gray for max contrast).
- **Geometry: US Census 2024 ZCTA GeoJSON**, simplified per-state.
- **Hosting: GitHub Pages.** Static only. No server, no API routes, no runtime secrets.
- **Data delivery:** state ZCTA files served from **jsDelivr** with a pinned data version (see §4).
- **One small runtime dep:** `lz-string` for URL paste compression (~3KB).

### 1.3 Out of scope for v1

- Multi-state pastes (cross-state inputs are warned, not rendered).
- Choropleth / value-per-zip rendering. Single-color highlight only.
- Groups (multiple labeled lists with different colors).
- Server-side short links.
- Analytics.
- Ad slots (no inventory reserved in layout).
- Account/auth, saved searches.

These should be **possible to add later without rewriting** — keep the data model, URL scheme, and DOM friendly to layering them on.

---

## 2. User Experience

### 2.1 Layout

- **Desktop:** side-by-side. Left panel ~30% width for paste + results, right panel ~70% for the map.
- **Mobile:** stacks vertically. Map is full-bleed; paste input collapses into a drawer/sheet that overlays the map. Drawer expands on focus/tap.

### 2.2 First-visit empty state

When the user lands on `/` with no state selected:

- Title + one-sentence value prop above paste box ("Paste US zip codes, see them on a map. Free, no signup.").
- One-sentence instruction ("Pick a state, paste your zips, hit Enter.").
- Paste textarea shows greyed-out placeholder: `e.g. 73301, 78701, 78702, 78703…`
- **"Try with sample data"** button below the textarea.
- Map shows full-US view (zoomed-out), no overlays.

When the user **selects a state** but hasn't pasted yet:

- Map zooms to the state's bounding box.
- The state's outer boundary is drawn (subtle thin stroke, no fill). Nothing else on the map.

### 2.3 Paste & result UI

As the user types/pastes into the textarea, **live-update** a small counter row above the map:

- **Valid** (matched to a ZCTA in the selected state) — count
- **Invalid** (not a real ZCTA, or belongs to another state) — count
- **Duplicates** (de-duped silently) — count

After paste finishes (debounce ~150ms):

1. Map renders matched ZCTAs with the highlight style (§2.4).
2. Map **auto-fits** bounds to the matched ZCTAs.
3. Below the textarea, two collapsible lists appear:
   - **Mapped (N):** list of valid zips.
   - **Unmapped (M):** list of inputs with a per-row reason (`not a US zip` / `belongs to CA` / `no ZCTA exists`).
4. Top of the result panel shows a single line: **"X of Y zips mapped to Texas."**
5. **Bidirectional list ↔ map hover:**
   - Hovering a row in the Mapped list flashes the corresponding polygon (brighter fill + thicker stroke for ~600ms, or sustained while hovered).
   - Hovering a polygon on the map highlights its row in the Mapped list (scroll into view if offscreen, highlight background).
   - Hovering an Unmapped row is a visual no-op on the map.
6. On the map, **hover/click on a polygon → popup with the zip code**. On touch devices, tap shows popup (click outside dismisses).

### 2.4 Highlight style

- **Solid fill + thin stroke.** Single brand color (TBD — start with a saturated blue like `#2563eb`).
- Default state: ~55% opacity fill, 1px stroke same color at 100% opacity.
- Hover state: 100% opacity fill, 2px stroke.

### 2.5 Camera behavior

- **Auto-fit to pasted zips** every time the matched set changes (after paste, after edit).
- No "lock" toggle in v1.

### 2.6 Export options

- **Download PNG** of the map (use `leaflet-image` or canvas-based capture).
- **Download CSV** of the input list with three columns: `zip,status,reason` where status ∈ `mapped|unmapped` and reason explains unmapped cases.

---

## 3. Input Parsing

Apply these rules to the textarea contents, in order:

1. **Split on any non-digit run.** Commas, newlines, spaces, tabs, semicolons, pipes — all treated as separators.
2. **For each token, take the first 5 leading digits.** This handles `12345-6789` (Zip+4) by taking `12345`. Tokens with fewer than 5 digits (e.g. `1234`) are left-padded with zeros to 5 (`01234`).
3. **Discard empty tokens and tokens with no digits.**
4. **Trim whitespace** (implicit in tokenization above).
5. **Deduplicate** silently, preserving first occurrence order.
6. **Classify each unique zip:**
   - In the loaded state file → **mapped**.
   - Has a known US zip→state mapping but not the selected state → **unmapped (belongs to XX)**.
   - Not a recognized US zip at all → **unmapped (not a US zip)**.

The classifier needs a global zip→state lookup (see §4.3).

**Out of scope:** "junk-tolerant CSV row" parsing (e.g. `12345, John Smith, $400`). The non-digit-split rule already handles delimiters; we don't try to be smart about ignoring trailing data on a line.

---

## 4. Data Pipeline

### 4.1 Build script

A one-off Node script in `/scripts/build-state-data.mjs`:

1. Download Census **TIGER/Line 2024 ZCTA shapefile** (national).
2. Use **mapshaper** programmatically to:
   - Reproject to WGS84.
   - Simplify with Douglas-Peucker at `~0.001` tolerance.
   - Filter to keep `ZCTA5CE` + state assignment as properties.
3. **Split by state** using the ZCTA→state assignment.
4. Write to `dist/states/<lowercase-state-abbrev>.geojson` (e.g. `dist/states/tx.geojson`).
5. Target file size: ~1MB per state file. Texas (~1,900 ZCTAs) will be the largest.
6. Also emit `dist/zip-to-state.json` — a global lookup `{ "12345": "NY", … }` for cross-state classification.

This script is **manually run** by the maintainer when Census ships new ZCTA data (yearly). It is **not** part of the app's runtime or per-deploy build.

### 4.2 Distribution

State files are **not committed to `main`**. Distribution uses two
coordinated artifacts on the same tag:

- An **orphan-branch Git tag** named `data-YYYY` (e.g. `data-2024`) whose
  *tree* contains the data files at the repo root (`states/<abbr>.geojson`,
  `zip-to-state.json`). jsDelivr's `@<tag>` URL serves the repo tree at the
  tagged commit — not Release assets — so the data has to live in some
  commit's tree. Using an orphan branch (no parent on `main`) means the
  data never appears in normal development history.
- A **GitHub Release** on the same tag with the same files attached as
  downloadable assets. This is for direct-download / browsability;
  jsDelivr is what the app actually fetches from.

The runtime fetches from:

```
https://cdn.jsdelivr.net/gh/Mohmedvaid/zipmap@data-2024/states/<state>.geojson
https://cdn.jsdelivr.net/gh/Mohmedvaid/zipmap@data-2024/zip-to-state.json
```

Rationale:

- Keeps `main` lean (~20MB of data lives on the orphan tag, not in normal history).
- **Version pinning** — app references a specific data tag, so a bad rebuild can be rolled back trivially.
- jsDelivr provides global CDN + browser caching via `Cache-Control` headers automatically.
- Requires the repo to be **public** (jsDelivr and free-tier GitHub Pages both require this).

The data version (`data-2024`) is defined as a **single constant in the app**:

```js
// js/config.js
export const DATA_VERSION = 'data-2024';
```

### 4.3 zip→state lookup

Shipped alongside state files as `zip-to-state.json` (also via jsDelivr). Approximately 33,000 entries. Compact format: a flat `{ "12345": "NY" }` object. Gzipped size should be well under 100KB.

Fetched once on first paste (lazy — not needed until user inputs something) and cached in memory.

---

## 5. Routing & URL Scheme

### 5.1 Per-state static routes

Ship one static HTML file per state:

- `/index.html` — landing page with no state pre-selected. State dropdown is the primary action.
- `/tx/index.html`, `/ca/index.html`, … one per state + DC (51 total).

Each per-state HTML file is **generated by a small build script** (`/scripts/build-state-pages.mjs`) from a single template `templates/state.html`. The generated files differ only in:

- `<title>` — `"Texas ZIP code map — zipmap"`
- `<meta name="description">` — `"Paste Texas ZIP codes and see them highlighted on a map. Free. No signup."`
- A `<script>` tag setting `window.__INITIAL_STATE__ = "tx"` so the JS pre-selects Texas on load.
- `<h1>` text — `"Texas ZIP code map"`.

GitHub Pages serves these as static files. SEO crawlers get state-specific titles/descriptions.

Generated state HTML files **are committed** to the repo (cheap to regenerate; means no per-deploy build step).

### 5.2 Encoded paste in URL

When the user has a pasted result, support a shareable URL of the form:

```
https://mohmedvaid.github.io/zipmap/tx/#z=<lz-string-base64>
```

- The **fragment** (`#`) is used (not the query string) to avoid the encoded paste being sent to servers/logs and to allow effectively unlimited length on most platforms.
- Encoded value: `LZString.compressToEncodedURIComponent(zips.join(','))`. For 2,000 zips, expect ~2-3KB.
- On page load, if a `#z=` is present, decode → populate textarea → trigger render.
- After a paste, **don't** auto-update the URL. Provide an explicit **"Copy share link"** button next to the result counter.

### 5.3 State-in-URL summary

| URL                                  | Behavior                                                           |
| ------------------------------------ | ------------------------------------------------------------------ |
| `/`                                  | Empty state, full-US map, state dropdown is the call to action.    |
| `/tx/`                               | Pre-selects Texas, state outline drawn, empty paste box.           |
| `/tx/#z=...`                         | Pre-selects Texas, decodes paste, renders map.                     |

If a `#z=` is present without a corresponding state route, do nothing with it (paste is meaningless without a state).

---

## 6. Performance

### 6.1 Initial paint

- Per-state HTML files are static and tiny — should serve in <100ms from GitHub Pages.
- Leaflet + CartoDB tiles load in parallel.
- State ZCTA GeoJSON file (~1MB) fetched in parallel with the page's render — should not block visual readiness of paste UI.

### 6.2 Polygon rendering budget

- Texas, the worst case, is ~1,900 ZCTAs. Rendering all of them is uncommon (users typically paste a subset), but the app must handle "paste everything" gracefully.
- Use Leaflet's `L.geoJSON` with default `canvas` renderer (`preferCanvas: true` on the map) for thousands of polygons — DOM-SVG renderer is too slow.
- Don't render ZCTAs outside the matched set. The state outline (when no paste) is one polygon; matched ZCTAs are <2,000 polygons.

### 6.3 Caching

- jsDelivr sets long `Cache-Control` on versioned URLs. State files cache in browser for the data version's lifetime.
- The app uses a single in-memory cache: once a state file is fetched in this tab, don't refetch.

---

## 7. Mobile

- Map height: use `100dvh` (dynamic viewport) where supported, fall back to `100vh` — accounts for iOS Safari's collapsing URL bar.
- Paste drawer: peeks ~80px from bottom on first load, expands on tap or focus to ~70% of viewport height.
- Touch interaction:
  - One-finger drag on map pans.
  - Two-finger pinch zooms.
  - One-finger drag on page outside map scrolls the page.
  - Tap a polygon → popup with zip.
- Sample data button visible in expanded drawer.
- Bidirectional list ↔ map hover: on touch, tapping a row in the mapped list pans/zooms briefly to that polygon and flashes it (since hover doesn't translate cleanly).

---

## 8. Edge Cases & Errors

| Case | Behavior |
|---|---|
| User pastes 0 valid zips | Show counter `0 of N mapped`. Show full unmapped list. Map shows state outline (no auto-fit). |
| User pastes zips, then changes state | Re-classify entire current paste against the new state. Re-render. |
| User clears the textarea | Remove all polygons. Map stays at current camera. Counters reset. |
| State file fetch fails | Inline error in the paste panel: "Couldn't load Texas data. Retry." button. Don't crash. |
| `zip-to-state.json` fetch fails | Fall back to a degraded mode: any zip not in the loaded state file is labeled `unmapped (not in <state>)` without distinguishing "wrong state" from "not a real zip". Log a warning to console. |
| User pastes a single non-numeric blob | Token splitter yields no 5-digit tokens. Show `0 mapped, 0 unmapped`. Don't show error — input was just empty. |
| Very long paste (>10,000 tokens) | Soft-cap parsing at 5,000 unique zips. If exceeded, show a notice: "Only the first 5,000 unique zips were processed." |
| URL with `#z=...` decode fails (corrupted link) | Silently ignore the fragment, treat as fresh state route load. |

---

## 9. Repository Layout (target)

```
/
├── index.html                # landing (state dropdown)
├── tx/index.html             # one per state (generated, committed)
├── ca/index.html
├── …
├── css/
│   └── styles.css
├── js/
│   ├── app.js                # entry: wire DOM, init map, route handling
│   ├── config.js             # DATA_VERSION constant
│   ├── parse.js              # input tokenization & classification
│   ├── map.js                # Leaflet setup, rendering, hover linking
│   ├── url.js                # lz-string encode/decode, hash sync
│   └── data.js               # fetch state file + zip-to-state, in-memory cache
├── lib/
│   ├── leaflet/              # vendored Leaflet (CSS + JS)
│   └── lz-string.min.js      # vendored
├── templates/
│   └── state.html            # source template for per-state HTML
├── scripts/
│   ├── build-state-data.mjs  # one-off: TIGER → per-state GeoJSON + Release
│   └── build-state-pages.mjs # regen 51 state HTML files from template
├── CLAUDE.md
├── README.md
├── SPEC.md
└── .gitignore
```

Notes:

- `lib/` is vendored (no `node_modules` at runtime). Leaflet and lz-string are dropped in directly.
- `scripts/` uses npm packages (mapshaper, etc.). A `package.json` exists only for the build scripts; **the app itself has no npm deps at runtime**.

---

## 10. Deployment

- **Host:** GitHub Pages, default branch (`main`) → site at `https://mohmedvaid.github.io/zipmap/`.
- **No build step on deploy.** GitHub Pages serves the repo verbatim.
- **Per-state HTML files** are regenerated locally with `node scripts/build-state-pages.mjs` and committed when the template changes.
- **Data updates** are independent: build new state files, create a new `data-YYYY` Release, bump `DATA_VERSION` in `js/config.js`, commit, push.
- **Custom domain:** deferred. Decision can happen later without code changes (just add `CNAME` file).

---

## 11. Open / Deferred Decisions

These are explicitly punted from v1. Listed so they don't block now and aren't forgotten later:

- **Exact brand color & favicon.** Pick during implementation; iterate.
- **Domain.** Stay on `github.io` until traffic warrants it.
- **Analytics.** Re-evaluate after launch.
- **Ad placement.** No layout reservation; revisit when traffic is meaningful.
- **Multi-state mode** (rendering across borders) — possible follow-up.
- **Groups / choropleth** — possible follow-up; data model should not block it.
- **Cross-state auto-detect / "switch to CA?" UX** — punted; v1 only warns.
- **Cookie/consent banner** — none in v1 (no analytics, no third-party cookies).

---

## 12. Definition of Done (v1)

The v1 ships when, on `https://mohmedvaid.github.io/zipmap/`:

1. Landing page loads in <1s on broadband, with full-US map and a working state dropdown.
2. Selecting a state (or visiting `/tx/`) loads the state file, draws the outline, focuses the camera.
3. Pasting a typical 50-zip list highlights matched ZCTAs within ~500ms of paste-end.
4. Unmapped zips are surfaced with per-row reasons.
5. Bidirectional hover linking works on desktop.
6. "Copy share link" produces a working URL that round-trips.
7. Mobile (iOS Safari, Android Chrome) renders the side-by-side → stacked layout correctly with a working paste drawer.
8. PNG and CSV export both work.
9. All 51 state pages exist and have distinct `<title>` / `<meta>`.
10. No console errors on a fresh page load with a valid state route.
