// Tokenize textarea contents into a deduped, ordered list of 5-digit zip strings.
//
// Splitter does NOT include hyphen so "12345-6789" stays one token and the
// leading-digit extractor returns "12345" — that's how zip+4 gets handled.
// A bare 4-digit token is left-padded with a zero ("1234" → "01234"); e.g. a
// New England zip that lost its leading zero in a spreadsheet round-trip.
const SEPARATOR = /[\s,;|]+/;
const LEADING_DIGITS = /^\d+/;

export function parseZips(text) {
  if (!text) return [];
  const seen = new Set();
  const out = [];
  for (const raw of text.split(SEPARATOR)) {
    if (!raw) continue;
    const m = raw.match(LEADING_DIGITS);
    if (!m) continue;
    const digits = m[0];
    const zip = digits.length >= 5 ? digits.slice(0, 5) : digits.padStart(5, '0');
    if (seen.has(zip)) continue;
    seen.add(zip);
    out.push(zip);
  }
  return out;
}
