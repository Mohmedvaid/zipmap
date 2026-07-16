// Income choropleth scale: pure value -> color/label mapping.
//
// Deliberately knows nothing about Leaflet, the DOM, or which ZCTAs are on
// screen. The filter/export mode (SPEC §11) needs the same scale over a
// different set of features, so keeping this a pure function of the value
// means that mode is a new caller rather than a rewrite.

// Fixed *national* breaks, not per-state quantiles. Per-state quantiles would
// give every state maximum contrast, but then burgundy would mean "rich for
// Mississippi" on one map and "rich for Connecticut" on another — useless for
// deciding where to spend ad money. Fixed breaks mean a color means the same
// thing everywhere, at the cost of poor states looking uniformly pale.
//
// The edges are tuned to the actual 2020-2024 ZCTA distribution (national
// median ~$72k) rather than round decades. Even $20k steps put a third of all
// ZCTAs in a single bin; these keep every bin at 2-26% and give real
// resolution across $90-175k, which is where the affluent-targeting decisions
// actually get made.
export const BREAKS = [45000, 60000, 75000, 90000, 110000, 135000, 175000];

// ColorBrewer YlOrRd (8-class): pale yellow -> dark burgundy. Sequential and
// ordered by lightness, so it survives most color-vision deficiencies and
// greyscale printing.
export const COLORS = [
  '#ffffcc',
  '#ffeda0',
  '#fed976',
  '#feb24c',
  '#fd8d3c',
  '#fc4e2a',
  '#e31a1c',
  '#b10026',
];

export const NO_DATA_COLOR = '#cbd5e1';

// ACS ceiling for median household income. A ZCTA at exactly this value could
// really be $260k or $2M — the survey doesn't say.
export const TOP_CODE = 250001;

// Above this MOE-to-estimate ratio the estimate is too noisy to act on. ~30% of
// ZCTAs nationally fail this, mostly small rural and PO-box-only areas.
const UNRELIABLE_RATIO = 0.25;

export function colorFor(estimate) {
  if (estimate == null || !Number.isFinite(estimate)) return NO_DATA_COLOR;
  for (let i = 0; i < BREAKS.length; i++) {
    if (estimate < BREAKS[i]) return COLORS[i];
  }
  return COLORS[COLORS.length - 1];
}

export function isUnreliable(estimate, moe) {
  if (moe == null || !Number.isFinite(moe)) return false;
  if (!Number.isFinite(estimate) || estimate <= 0) return false;
  return moe / estimate > UNRELIABLE_RATIO;
}

export function formatMoney(n) {
  return `$${Math.round(n).toLocaleString('en-US')}`;
}

function compact(n) {
  return n % 1000 === 0 ? `$${n / 1000}k` : formatMoney(n);
}

// [{ color, label }] ordered low -> high, for the legend.
export function legendEntries() {
  const out = [];
  for (let i = 0; i < COLORS.length; i++) {
    let label;
    if (i === 0) label = `Under ${compact(BREAKS[0])}`;
    else if (i === COLORS.length - 1) label = `${compact(BREAKS[BREAKS.length - 1])}+`;
    else label = `${compact(BREAKS[i - 1])} – ${compact(BREAKS[i])}`;
    out.push({ color: COLORS[i], label });
  }
  return out;
}
