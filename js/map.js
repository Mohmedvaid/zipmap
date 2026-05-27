// Continental US bounds, used as the initial camera before any state is loaded.
const US_BOUNDS = [[24.5, -125.0], [49.4, -66.9]];

const HIGHLIGHT_STYLE = {
  color: '#2563eb',
  weight: 1,
  opacity: 1,
  fillColor: '#2563eb',
  fillOpacity: 0.5,
};

let map = null;
let layer = null;

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

export function renderZips(features) {
  if (!map) return;
  if (layer) {
    map.removeLayer(layer);
    layer = null;
  }
  if (!features.length) return;

  const fc = { type: 'FeatureCollection', features };
  layer = L.geoJSON(fc, {
    style: () => HIGHLIGHT_STYLE,
    onEachFeature: (feature, lyr) => {
      const zip = feature.properties && feature.properties.zip;
      if (zip) lyr.bindPopup(String(zip));
    },
  }).addTo(map);

  const bounds = layer.getBounds();
  if (bounds.isValid()) map.fitBounds(bounds, { padding: [24, 24] });
}

export function resetToUS() {
  if (!map) return;
  if (layer) {
    map.removeLayer(layer);
    layer = null;
  }
  map.fitBounds(US_BOUNDS);
}
