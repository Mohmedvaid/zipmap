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
