import {
  colorFor,
  legendEntries,
  NO_DATA_COLOR,
  TOP_CODE,
  isUnreliable,
  formatMoney,
} from './income.js';

// Continental US bounds, used as the initial camera before any state is loaded.
const US_BOUNDS = [[24.5, -125.0], [49.4, -66.9]];

const STYLES = {
  blue: { color: '#2563eb', weight: 1, opacity: 1, fillColor: '#2563eb', fillOpacity: 0.5 },
  red:  { color: '#dc2626', weight: 1, opacity: 1, fillColor: '#dc2626', fillOpacity: 0.5 },
};

let map = null;
let blueLayer = null;
let redLayer = null;
let legend = null;

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

// In income mode the list color moves from the fill to the stroke: the fill is
// spoken for by the choropleth, and a burgundy "wealthy" fill sitting next to a
// red "competitor" fill is unreadable. Outlining instead keeps both facts on
// one map — which list a zip came from, and what it earns.
function styleFor(colorName, feature, income) {
  const base = STYLES[colorName];
  if (!income) return base;
  const zip = feature.properties && feature.properties.zip;
  const rec = zip ? income.byZip.get(zip) : null;
  return {
    color: base.color,
    weight: 2,
    opacity: 1,
    fillColor: rec ? colorFor(rec[0]) : NO_DATA_COLOR,
    fillOpacity: 0.85,
  };
}

function popupText(zip, income) {
  if (!income) return String(zip);
  const rec = income.byZip.get(zip);
  if (!rec) return `${zip}\nNo income estimate published`;

  const [est, moe] = rec;
  const lines = [String(zip), `${formatMoney(est)} median household income`];
  if (moe != null) lines.push(`±${formatMoney(moe)}`);
  if (est >= TOP_CODE) {
    lines.push('At the ACS reporting ceiling — the real figure may be higher.');
  }
  if (isUnreliable(est, moe)) {
    lines.push('Small sample — too noisy to rely on.');
  }
  return lines.join('\n');
}

function buildLayer(features, colorName, income) {
  if (!features.length) return null;
  const fc = { type: 'FeatureCollection', features };
  return L.geoJSON(fc, {
    style: (feature) => styleFor(colorName, feature, income),
    onEachFeature: (feature, lyr) => {
      const zip = feature.properties && feature.properties.zip;
      if (zip) lyr.bindPopup(popupText(zip, income));
    },
  });
}

function renderLegend(income) {
  if (legend) {
    map.removeControl(legend);
    legend = null;
  }
  if (!income) return;

  legend = L.control({ position: 'bottomright' });
  legend.onAdd = () => {
    const div = L.DomUtil.create('div', 'legend');
    // Reversed so the legend reads high-to-low top-to-bottom, matching how the
    // eye scans a wealth ramp.
    const rows = legendEntries()
      .slice()
      .reverse()
      .map(
        ({ color, label }) =>
          `<div class="legend__row"><i style="background:${color}"></i>${label}</div>`,
      )
      .join('');
    const vintage = income.meta && income.meta.vintage;
    div.innerHTML =
      '<div class="legend__title">Median household income</div>' +
      rows +
      `<div class="legend__row"><i style="background:${NO_DATA_COLOR}"></i>No data</div>` +
      (vintage ? `<div class="legend__source">Census ACS ${vintage}</div>` : '');
    // Without this, dragging or scrolling over the legend fights the map.
    L.DomEvent.disableClickPropagation(div);
    L.DomEvent.disableScrollPropagation(div);
    return div;
  };
  legend.addTo(map);
}

export function renderColored({ blue = [], red = [], income = null, fit = true } = {}) {
  if (!map) return;
  if (blueLayer) { map.removeLayer(blueLayer); blueLayer = null; }
  if (redLayer) { map.removeLayer(redLayer); redLayer = null; }

  blueLayer = buildLayer(blue, 'blue', income);
  redLayer = buildLayer(red, 'red', income);

  // Add blue first so red paints on top — matters when a zip somehow ends up
  // in both layers; the red-wins rule in app.js already keeps that from
  // happening, but the z-order makes the intent visible if it ever slips.
  if (blueLayer) blueLayer.addTo(map);
  if (redLayer) redLayer.addTo(map);

  renderLegend(income);

  if (!fit) return;
  const bounds = L.latLngBounds([]);
  if (blueLayer) bounds.extend(blueLayer.getBounds());
  if (redLayer) bounds.extend(redLayer.getBounds());
  if (bounds.isValid()) map.fitBounds(bounds, { padding: [24, 24] });
}

export function resetToUS() {
  if (!map) return;
  if (blueLayer) { map.removeLayer(blueLayer); blueLayer = null; }
  if (redLayer) { map.removeLayer(redLayer); redLayer = null; }
  renderLegend(null);
  map.fitBounds(US_BOUNDS);
}
