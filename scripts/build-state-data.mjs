#!/usr/bin/env node
// Build per-state ZCTA GeoJSON files plus a global zip-to-state lookup from
// US Census Cartographic Boundary data (cb_2020 ZCTA + ZCTA-to-state crosswalk).
//
// Usage:  node scripts/build-state-data.mjs
//
// Outputs:
//   dist/states/<abbr>.geojson   (51 files: 50 states + DC)
//   dist/zip-to-state.json       (global ZCTA -> USPS state abbrev lookup)
//
// These artifacts are published as a GitHub Release tagged "data-2024"
// (see scripts/README.md) and served at runtime via jsDelivr.

import { spawnSync } from 'node:child_process';
import {
  mkdirSync,
  writeFileSync,
  readFileSync,
  existsSync,
  statSync,
} from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const CACHE = join(ROOT, '.cache', 'data-build');
const OUT_STATES = join(ROOT, 'dist', 'states');
const OUT_LOOKUP = join(ROOT, 'dist', 'zip-to-state.json');

const ZCTA_ZIP_URL =
  'https://www2.census.gov/geo/tiger/GENZ2020/shp/cb_2020_us_zcta520_500k.zip';
// Census does not publish a direct ZCTA-to-state crosswalk for 2020. We use
// the ZCTA-to-county file and derive state FIPS from the first 2 digits of
// the county FIPS code (county FIPS is always state-FIPS + 3-digit county).
const REL_URL =
  'https://www2.census.gov/geo/docs/maps-data/data/rel2020/zcta520/tab20_zcta520_county20_natl.txt';

const ZCTA_ZIP = join(CACHE, 'cb_2020_us_zcta520_500k.zip');
const REL_FILE = join(CACHE, 'tab20_zcta520_county20_natl.txt');
const SIMPLIFIED_GEOJSON = join(CACHE, 'zcta_simplified.geojson');

// USPS abbreviations for all 50 states + DC. Keyed by 2-digit state FIPS.
// PR (72), VI (78), GU (66), AS (60), MP (69) intentionally omitted —
// they aren't in cb_2020 ZCTA cartographic boundaries and aren't in scope.
const FIPS_TO_ABBR = {
  '01': 'al', '02': 'ak', '04': 'az', '05': 'ar', '06': 'ca', '08': 'co',
  '09': 'ct', '10': 'de', '11': 'dc', '12': 'fl', '13': 'ga', '15': 'hi',
  '16': 'id', '17': 'il', '18': 'in', '19': 'ia', '20': 'ks', '21': 'ky',
  '22': 'la', '23': 'me', '24': 'md', '25': 'ma', '26': 'mi', '27': 'mn',
  '28': 'ms', '29': 'mo', '30': 'mt', '31': 'ne', '32': 'nv', '33': 'nh',
  '34': 'nj', '35': 'nm', '36': 'ny', '37': 'nc', '38': 'nd', '39': 'oh',
  '40': 'ok', '41': 'or', '42': 'pa', '44': 'ri', '45': 'sc', '46': 'sd',
  '47': 'tn', '48': 'tx', '49': 'ut', '50': 'vt', '51': 'va', '53': 'wa',
  '54': 'wv', '55': 'wi', '56': 'wy',
};

function log(msg) {
  console.log(`[build-state-data] ${msg}`);
}

function sh(cmd, args) {
  log(`$ ${cmd} ${args.join(' ')}`);
  const r = spawnSync(cmd, args, { stdio: 'inherit' });
  if (r.status !== 0) {
    throw new Error(`Command failed (${r.status}): ${cmd} ${args.join(' ')}`);
  }
}

async function download(url, dest) {
  if (existsSync(dest) && statSync(dest).size > 0) {
    log(`cached: ${dest}`);
    return;
  }
  log(`downloading: ${url}`);
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`fetch ${url} -> ${res.status} ${res.statusText}`);
  }
  const buf = Buffer.from(await res.arrayBuffer());
  writeFileSync(dest, buf);
  log(`wrote ${dest} (${(buf.length / 1e6).toFixed(1)} MB)`);
}

function buildZipToState() {
  log('parsing ZCTA-to-county relationship file');
  // The file starts with a BOM; strip it before splitting columns.
  const raw = readFileSync(REL_FILE, 'utf8').replace(/^﻿/, '');
  const lines = raw.split(/\r?\n/).filter(Boolean);
  const header = lines.shift().split('|');
  const idxZcta = header.indexOf('GEOID_ZCTA5_20');
  const idxCounty = header.indexOf('GEOID_COUNTY_20');
  const idxArea = header.indexOf('AREALAND_PART');
  if (idxZcta < 0 || idxCounty < 0 || idxArea < 0) {
    throw new Error(
      `unexpected relationship file columns: ${header.join(', ')}`,
    );
  }

  // Each row is a ZCTA-county intersection. The leading rows in this file
  // are county-only entries with an empty ZCTA — skip them.
  // A ZCTA can intersect counties in multiple states; sum AREALAND_PART per
  // state, then pick the state with the largest total.
  const totals = new Map(); // zcta -> Map(stateAbbr -> totalArea)
  for (const line of lines) {
    const cols = line.split('|');
    const zcta = cols[idxZcta];
    if (!zcta) continue;
    const stateFips = cols[idxCounty].slice(0, 2);
    const abbr = FIPS_TO_ABBR[stateFips];
    if (!abbr) continue; // territory or unknown
    const area = Number(cols[idxArea]) || 0;
    let perState = totals.get(zcta);
    if (!perState) {
      perState = new Map();
      totals.set(zcta, perState);
    }
    perState.set(abbr, (perState.get(abbr) || 0) + area);
  }

  const lookup = {};
  let crossState = 0;
  for (const [zcta, perState] of totals) {
    if (perState.size > 1) crossState++;
    let bestAbbr = null;
    let bestArea = -1;
    for (const [abbr, area] of perState) {
      if (area > bestArea) {
        bestArea = area;
        bestAbbr = abbr;
      }
    }
    lookup[zcta] = bestAbbr;
  }
  log(
    `zip-to-state: ${Object.keys(lookup).length} ZCTAs (${crossState} cross multiple states; assigned to the state with the largest land-area share)`,
  );
  return lookup;
}

function simplifyToGeoJSON() {
  if (existsSync(SIMPLIFIED_GEOJSON) && statSync(SIMPLIFIED_GEOJSON).size > 0) {
    log(`cached: ${SIMPLIFIED_GEOJSON}`);
    return;
  }
  // mapshaper reads .zip directly when it contains a shapefile.
  // Visvalingam 10% retention keeps recognizable shapes at state-level zoom
  // while dropping file size dramatically. `keep-shapes` prevents tiny ZCTAs
  // from collapsing to a point.
  sh('npx', [
    '--yes',
    'mapshaper',
    ZCTA_ZIP,
    '-rename-fields', 'zip=ZCTA5CE20',
    '-filter-fields', 'zip',
    '-simplify', '10%', 'keep-shapes',
    '-o', 'format=geojson', 'precision=0.00001', SIMPLIFIED_GEOJSON,
  ]);
}

function splitPerState(zipToState) {
  log('splitting national GeoJSON into per-state files');
  const fc = JSON.parse(readFileSync(SIMPLIFIED_GEOJSON, 'utf8'));
  if (fc.type !== 'FeatureCollection') {
    throw new Error(`unexpected GeoJSON type: ${fc.type}`);
  }

  const buckets = new Map(); // abbr -> Feature[]
  let unassigned = 0;
  for (const feat of fc.features) {
    const zip = feat.properties?.zip;
    if (!zip) continue;
    const abbr = zipToState[zip];
    if (!abbr) {
      unassigned++;
      continue;
    }
    if (!buckets.has(abbr)) buckets.set(abbr, []);
    buckets.get(abbr).push(feat);
  }
  if (unassigned > 0) {
    log(`warning: ${unassigned} ZCTAs had no state assignment (skipped)`);
  }

  let totalOut = 0;
  const sizes = [];
  for (const [abbr, features] of [...buckets.entries()].sort()) {
    const out = { type: 'FeatureCollection', features };
    const dest = join(OUT_STATES, `${abbr}.geojson`);
    const body = JSON.stringify(out);
    writeFileSync(dest, body);
    totalOut += features.length;
    sizes.push({ abbr, count: features.length, kb: (body.length / 1024) | 0 });
  }
  sizes.sort((a, b) => b.kb - a.kb);
  log(`wrote ${buckets.size} state files (${totalOut} features total)`);
  log('largest 5:');
  for (const s of sizes.slice(0, 5)) {
    log(`  ${s.abbr.toUpperCase()}: ${s.count} ZCTAs, ${s.kb} KB`);
  }
}

async function main() {
  mkdirSync(CACHE, { recursive: true });
  mkdirSync(OUT_STATES, { recursive: true });
  mkdirSync(dirname(OUT_LOOKUP), { recursive: true });

  await download(ZCTA_ZIP_URL, ZCTA_ZIP);
  await download(REL_URL, REL_FILE);

  const zipToState = buildZipToState();
  writeFileSync(OUT_LOOKUP, JSON.stringify(zipToState));
  log(`wrote ${OUT_LOOKUP} (${(statSync(OUT_LOOKUP).size / 1024) | 0} KB)`);

  simplifyToGeoJSON();
  splitPerState(zipToState);

  log('done.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
