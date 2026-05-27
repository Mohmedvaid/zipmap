import { CDN_BASE } from './config.js';

const cache = new Map();

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
