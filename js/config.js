export const DATA_VERSION = 'data-2024';

// Income data is versioned separately from ZCTA geometry on purpose. Census
// ships a new ACS 5-year vintage every December, while ZCTA boundaries only
// move with the decennial census — one shared tag would mean republishing
// ~50MB of unchanged polygons to bump a year.
export const INCOME_VERSION = 'income-2024';

// Add ?data=local to read from a locally built dist/ instead of the published
// CDN tags. Opt-in, so the default path is untouched and a fresh clone still
// works with no build step.
//
// This is the only way to check a data rebuild before publishing it: a jsDelivr
// tag is effectively immutable once the CDN has cached it, so "publish and see"
// is a bad trade. Requires `npm run build:state-data` / `build:income-data`
// first — dist/ is gitignored.
const USE_LOCAL_DATA =
  typeof location !== 'undefined' &&
  new URLSearchParams(location.search).get('data') === 'local';

export const CDN_BASE = USE_LOCAL_DATA
  ? '/dist'
  : `https://cdn.jsdelivr.net/gh/Mohmedvaid/zipmap@${DATA_VERSION}`;

export const INCOME_BASE = USE_LOCAL_DATA
  ? '/dist'
  : `https://cdn.jsdelivr.net/gh/Mohmedvaid/zipmap@${INCOME_VERSION}`;
