#!/usr/bin/env node
// Build a global ZCTA -> median household income lookup from the US Census
// ACS 5-Year Summary File (table B19013).
//
// Usage:  node scripts/build-income-data.mjs
//
// Outputs:
//   dist/income.json   (ZCTA -> [estimate, marginOfError])
//
// Published as a GitHub Release tagged "income-2024" and served at runtime via
// jsDelivr. Deliberately a *separate* tag from the "data-2024" ZCTA geometry:
// ACS ships a new vintage every December, while ZCTA boundaries only move with
// the decennial census. Keeping them apart means refreshing income doesn't
// republish ~50MB of unchanged polygons.
//
// We read the bulk Summary File rather than api.census.gov because the API now
// rejects keyless requests, and a build-time API key would be one more secret
// to carry for data that never changes between releases.

import { mkdirSync, writeFileSync, readFileSync, existsSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const CACHE = join(ROOT, '.cache', 'income-build');
const OUT_INCOME = join(ROOT, 'dist', 'income.json');

// ACS 5-Year vintage. "2024" means the 2020-2024 five-year estimates.
// ZCTA-level data is only published for the 5-year series — the 1-year series
// doesn't go to geographies this small.
const VINTAGE = '2024';
const TABLE = 'b19013';
const SF_URL =
  `https://www2.census.gov/programs-surveys/acs/summary_file/${VINTAGE}` +
  `/table-based-SF/data/5YRData/acsdt5y${VINTAGE}-${TABLE}.dat`;
const SF_FILE = join(CACHE, `acsdt5y${VINTAGE}-${TABLE}.dat`);

// Summary File GEO_IDs are prefixed by summary level. 860Z200US = ZCTA.
const ZCTA_PREFIX = '860Z200US';

// ACS encodes "no value" as large negative sentinels ("jam values") rather than
// blanks. Left untrapped these parse as ordinary numbers and render as the
// poorest ZCTAs on the map, which is both wrong and the most alarming way to be
// wrong. See Census "Notes on ACS Estimate and Annotation Values".
const JAM_NO_ESTIMATE = -666666666; // estimate unavailable / suppressed
const JAM_MOE_NA = -222222222; // paired with an unavailable estimate
const JAM_MOE_CONTROLLED = -333333333; // estimate is controlled; MOE not meaningful

// ACS top-codes ZCTA median household income at this value. It is a ceiling,
// not a measurement: a $250,001 ZCTA may really be $260k or $2M.
const TOP_CODE = 250001;

function log(msg) {
  console.log(`[build-income-data] ${msg}`);
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

function buildIncome() {
  log(`parsing ${TABLE.toUpperCase()} summary file`);
  const raw = readFileSync(SF_FILE, 'utf8').replace(/^﻿/, '');
  const lines = raw.split(/\r?\n/).filter(Boolean);

  const header = lines.shift().split('|');
  const idxGeo = header.indexOf('GEO_ID');
  const idxEst = header.findIndex((h) => /_E001$/.test(h));
  const idxMoe = header.findIndex((h) => /_M001$/.test(h));
  if (idxGeo < 0 || idxEst < 0 || idxMoe < 0) {
    throw new Error(`unexpected summary file columns: ${header.join(', ')}`);
  }

  const data = {};
  let seen = 0;
  let noEstimate = 0;
  let controlled = 0;
  let topCoded = 0;
  let unreliable = 0;

  for (const line of lines) {
    const cols = line.split('|');
    const geoId = cols[idxGeo];
    if (!geoId.startsWith(ZCTA_PREFIX)) continue; // other summary levels
    seen++;

    const zcta = geoId.slice(ZCTA_PREFIX.length);
    const est = Number(cols[idxEst]);
    if (!Number.isFinite(est) || est === JAM_NO_ESTIMATE) {
      // Omit rather than emit null: a missing key is smaller on the wire and
      // the client treats "not present" as no-data anyway.
      noEstimate++;
      continue;
    }

    const rawMoe = Number(cols[idxMoe]);
    let moe = null;
    if (rawMoe === JAM_MOE_CONTROLLED) {
      controlled++;
    } else if (Number.isFinite(rawMoe) && rawMoe !== JAM_MOE_NA && rawMoe >= 0) {
      moe = rawMoe;
    }

    if (est === TOP_CODE) topCoded++;
    if (moe !== null && est > 0 && moe / est > 0.25) unreliable++;

    data[zcta] = [est, moe];
  }

  const kept = Object.keys(data).length;
  log(`ZCTA rows seen: ${seen}`);
  log(`  kept:           ${kept}`);
  log(`  no estimate:    ${noEstimate} (omitted; render as "no data")`);
  log(`  MOE controlled: ${controlled} (estimate kept, MOE null)`);
  log(`  top-coded:      ${topCoded} (at $${TOP_CODE.toLocaleString()})`);
  log(`  MOE >25% of estimate: ${unreliable} (${((unreliable / kept) * 100).toFixed(1)}% — kept, flagged at runtime)`);

  if (kept < 25000) {
    throw new Error(`suspiciously few ZCTAs kept (${kept}); refusing to write`);
  }

  return data;
}

function main() {
  mkdirSync(CACHE, { recursive: true });
  mkdirSync(dirname(OUT_INCOME), { recursive: true });

  return download(SF_URL, SF_FILE).then(() => {
    const data = buildIncome();
    const out = {
      meta: {
        source: 'US Census Bureau, American Community Survey 5-Year Estimates',
        table: 'B19013 (Median Household Income in the Past 12 Months)',
        vintage: `${Number(VINTAGE) - 4}-${VINTAGE}`,
        dollars: `${VINTAGE} inflation-adjusted dollars`,
        topCode: TOP_CODE,
        note: 'Values are [estimate, marginOfError]. MOE null means the estimate is controlled. ZCTAs with no published estimate are omitted.',
      },
      data,
    };
    writeFileSync(OUT_INCOME, JSON.stringify(out));
    log(`wrote ${OUT_INCOME} (${(statSync(OUT_INCOME).size / 1024) | 0} KB)`);
    log('done.');
  });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
