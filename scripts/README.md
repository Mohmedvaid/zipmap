# scripts/

Build-time tooling. The zipmap app itself has no runtime npm dependencies;
everything in this directory exists to produce static artifacts that are
either committed to the repo or published as GitHub Release assets.

## `build-state-data.mjs`

Builds the per-state ZCTA GeoJSON files and the global `zip-to-state.json`
lookup from US Census [Cartographic Boundary files][cb] (`cb_2020`, the most
recent vintage that includes ZCTAs — ZCTAs are tied to the decennial census).

[cb]: https://www.census.gov/geographies/mapping-files/time-series/geo/cartographic-boundary.html

### Inputs (downloaded automatically, cached under `.cache/`)

- `cb_2020_us_zcta520_500k.zip` — national ZCTA shapefile, generalized for
  1:500,000-scale cartographic display.
- `tab20_zcta520_state20_natl.txt` — Census ZCTA-to-state crosswalk. A ZCTA
  can straddle a state line; the script assigns it to the state holding the
  largest land-area part.

### Outputs

- `dist/states/<abbr>.geojson` — 51 files (50 states + DC), each containing
  the ZCTAs whose centroid-of-mass belongs to that state. Each feature has a
  single property: `zip` (5-digit ZCTA code).
- `dist/zip-to-state.json` — flat object `{ "12345": "ny", ... }` for the
  runtime parser to classify pasted zips as belonging-to-current-state vs
  belonging-elsewhere vs not-a-ZCTA.

### Run

```sh
npm install              # one-time, installs mapshaper
npm run build:state-data
```

Expect ~2-5 minutes total: ~30s to download Census files, ~1-2 min for
mapshaper simplification, ~30s to split per state.

### Publishing artifacts

The `dist/` directory is **not committed to `main`**. Publishing the data
involves two pieces:

1. **A versioned Git tag whose tree contains the data files.** jsDelivr's
   `@<tag>` URLs serve the repo tree at that tag — not Release assets — so
   the data must live in some commit's tree. We use an **orphan branch**
   (`data`) whose history is independent from `main`, so the data doesn't
   bloat normal development history.
2. **A GitHub Release on the same tag, with the same files attached.** This
   gives users a direct-download path (`wget`, `curl`) and keeps the
   artifact set browsable on github.com.

Steps:

```sh
TAG=data-2024  # bump for re-builds (data-2025, data-2026, ...)

# 1) Build the data
npm run build:state-data

# 2) Use a temporary worktree to build an orphan commit that contains
#    only the data files (rooted at the repo root, not under dist/).
WT=$(mktemp -d)
git worktree add --orphan -B "$TAG-tree" "$WT"
cp -r dist/states "$WT/"
cp dist/zip-to-state.json "$WT/"
cd "$WT"
git add states zip-to-state.json
git commit -m "$TAG data"
git tag -f "$TAG"
cd -
git worktree remove --force "$WT"
git branch -D "$TAG-tree"  # branch is disposable; the tag is what we need

# 3) Push the tag
git push origin "$TAG" --force  # force in case the tag already exists

# 4) Publish the Release with the same files
gh release delete "$TAG" --yes 2>/dev/null || true
gh release create "$TAG" \
  --title "ZCTA data $TAG" \
  --notes "Built from Census cb_2020 ZCTA + 2020 ZCTA-to-county crosswalk." \
  dist/zip-to-state.json \
  dist/states/*.geojson
```

The app then fetches state files from:

```
https://cdn.jsdelivr.net/gh/Mohmedvaid/zipmap@<TAG>/states/<abbr>.geojson
https://cdn.jsdelivr.net/gh/Mohmedvaid/zipmap@<TAG>/zip-to-state.json
```

### Updating data

ZCTAs only change with the decennial census, so a yearly rebuild is rarely
necessary. Rebuild when:

- Census ships a new `cb_YYYY_us_zcta520_500k.zip` (update the URL in the
  script).
- A simplification tweak (different tolerance) changes file sizes
  meaningfully.

Bump the tag (`data-2024` → `data-2025`), publish the new Release, then bump
`DATA_VERSION` in `js/config.js` in a normal app PR.

---

## `build-income-data.mjs`

Builds `dist/income.json` — a global ZCTA → median household income lookup —
from the Census [ACS 5-Year Summary File][sf], table **B19013**.

[sf]: https://www.census.gov/programs-surveys/acs/data/summary-file.html

### Why the bulk file and not `api.census.gov`

The API now rejects keyless requests. A build-time key would be one more secret
to carry for data that doesn't change between releases, so we read the
table-based Summary File over plain HTTPS instead — same numbers, no account.

### Inputs (downloaded automatically, cached under `.cache/`)

- `acsdt5y2024-b19013.dat` (~18MB) — pipe-delimited, one row per geography,
  columns `GEO_ID|B19013_E001|B19013_M001`. ZCTA rows are prefixed `860Z200US`,
  so no separate geography file is needed.

ACS publishes ZCTA-level data **only in the 5-year series** — the 1-year series
doesn't reach geographies this small. Conveniently, ZCTA is the same key
`states/*.geojson` uses, so the runtime join is direct.

### Output

- `dist/income.json` — `{ meta, data: { "60077": [estimate, moe], ... } }`.
  ~650KB raw / ~257KB gzipped for ~30.5k ZCTAs.

The script traps ACS's negative sentinel "jam values" (`-666666666` no estimate,
`-222222222` MOE n/a, `-333333333` estimate controlled). This matters: untrapped
they parse as ordinary numbers and paint 3,225 ZCTAs as the poorest in the
country. ZCTAs with no estimate are omitted entirely — a missing key is smaller
than a null and the client treats absent as no-data.

### Run

```sh
npm run build:income-data
```

Expect ~30s, nearly all of it the download.

### Publishing

Same orphan-tree mechanism as the ZCTA data, but a **separate tag** —
`income-YYYY`, not `data-YYYY`. ACS ships a vintage every December while ZCTA
boundaries only move with the decennial census; sharing one tag would mean
republishing ~50MB of unchanged polygons to bump a year.

```sh
TAG=income-2024  # ACS 5-year vintage: "2024" = the 2020-2024 estimates

npm run build:income-data

WT=$(mktemp -d)
git worktree add --orphan -B "$TAG-tree" "$WT"
cp dist/income.json "$WT/"
cd "$WT"
git add income.json
git commit -m "$TAG data"
git tag -f "$TAG"
cd -
git worktree remove --force "$WT"
git branch -D "$TAG-tree"

git push origin "$TAG" --force

gh release delete "$TAG" --yes 2>/dev/null || true
gh release create "$TAG" \
  --title "Income data $TAG" \
  --notes "Census ACS 5-Year (2020-2024) table B19013, median household income by ZCTA." \
  dist/income.json
```

The app then fetches:

```
https://cdn.jsdelivr.net/gh/Mohmedvaid/zipmap@<TAG>/income.json
```

### Updating income data

Unlike ZCTA geometry, this **is** worth rebuilding yearly — Census ships a new
5-year vintage each December. Bump `VINTAGE` in the script, rebuild, publish
`income-2025`, then bump `INCOME_VERSION` in `js/config.js` in a normal app PR.

If the breaks in `js/income.js` stop matching the distribution as incomes drift,
re-check them against the new vintage rather than assuming they still hold.
