import { CDN_BASE, INCOME_BASE } from './config.js';

const cache = new Map();
let incomePromise = null;

export async function fetchStateGeoJSON(stateCode) {
  if (cache.has(stateCode)) return cache.get(stateCode);
  const url = `${CDN_BASE}/states/${stateCode}.geojson`;
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Failed to load ${stateCode}.geojson (HTTP ${res.status})`);
  }
  const geo = await res.json();
  cache.set(stateCode, geo);
  return geo;
}

// National ZCTA -> [estimate, marginOfError] median household income.
//
// ~257KB gzipped for the whole country, fetched only when the user first turns
// the income toggle on and cached for the tab's lifetime. National rather than
// per-state because the file is a fifth of a single state's geometry, the
// breaks are national anyway, and one file means one cache entry.
//
// The in-flight promise is cached so two rapid toggles don't race two fetches;
// a failure clears it so the next toggle retries rather than sticking.
export async function fetchIncome() {
  if (incomePromise) return incomePromise;
  incomePromise = (async () => {
    const url = `${INCOME_BASE}/income.json`;
    const res = await fetch(url);
    if (!res.ok) {
      throw new Error(`Failed to load income data (HTTP ${res.status})`);
    }
    const json = await res.json();
    if (!json || !json.data) {
      throw new Error('Income data is malformed.');
    }
    return { meta: json.meta || {}, byZip: new Map(Object.entries(json.data)) };
  })().catch((err) => {
    incomePromise = null;
    throw err;
  });
  return incomePromise;
}
