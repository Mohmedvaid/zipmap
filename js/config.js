export const DATA_VERSION = 'data-2024';

export const CDN_BASE = `https://cdn.jsdelivr.net/gh/Mohmedvaid/zipmap@${DATA_VERSION}`;

// Income data is versioned separately from ZCTA geometry on purpose. Census
// ships a new ACS 5-year vintage every December, while ZCTA boundaries only
// move with the decennial census — one shared tag would mean republishing
// ~50MB of unchanged polygons to bump a year.
export const INCOME_VERSION = 'income-2024';

export const INCOME_BASE = `https://cdn.jsdelivr.net/gh/Mohmedvaid/zipmap@${INCOME_VERSION}`;
