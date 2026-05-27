// Continental US bounds, used as the initial camera before any state is loaded.
const US_BOUNDS = [[24.5, -125.0], [49.4, -66.9]];

const STYLES = {
  blue: { color: '#2563eb', weight: 1, opacity: 1, fillColor: '#2563eb', fillOpacity: 0.5 },
  red:  { color: '#dc2626', weight: 1, opacity: 1, fillColor: '#dc2626', fillOpacity: 0.5 },
};

let map = null;
let blueLayer = null;
let redLayer = null;

export function initMap(containerId) {
  map = L.map(containerId, { preferCanvas: true });
  map.fitBounds(US_BOUNDS);

  L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
    attribution:
      '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> ' +
      '&copy; <a href="https://carto.com/attributions">CARTO</a>',
    subdomains: 'abcd',
    maxZoom: 19,
  }).addTo(map);

  return map;
}

function buildLayer(features, style) {
  if (!features.length) return null;
  const fc = { type: 'FeatureCollection', features };
  return L.geoJSON(fc, {
    style: () => style,
    onEachFeature: (feature, lyr) => {
      const zip = feature.properties && feature.properties.zip;
      if (zip) lyr.bindPopup(String(zip));
    },
  });
}

export function renderColored({ blue = [], red = [] } = {}) {
  if (!map) return;
  if (blueLayer) { map.removeLayer(blueLayer); blueLayer = null; }
  if (redLayer) { map.removeLayer(redLayer); redLayer = null; }

  blueLayer = buildLayer(blue, STYLES.blue);
  redLayer = buildLayer(red, STYLES.red);

  // Add blue first so red paints on top — matters when a zip somehow ends up
  // in both layers; the red-wins rule in app.js already keeps that from
  // happening, but the z-order makes the intent visible if it ever slips.
  if (blueLayer) blueLayer.addTo(map);
  if (redLayer) redLayer.addTo(map);

  const bounds = L.latLngBounds([]);
  if (blueLayer) bounds.extend(blueLayer.getBounds());
  if (redLayer) bounds.extend(redLayer.getBounds());
  if (bounds.isValid()) map.fitBounds(bounds, { padding: [24, 24] });
}

export function resetToUS() {
  if (!map) return;
  if (blueLayer) { map.removeLayer(blueLayer); blueLayer = null; }
  if (redLayer) { map.removeLayer(redLayer); redLayer = null; }
  map.fitBounds(US_BOUNDS);
}
