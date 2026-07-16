// Tokenize textarea contents into a deduped, ordered list of 5-digit zip strings.
//
// Two passes, run against the same dedupe set so the result is stable:
//
//   1. Strict tokenizer — splits on whitespace/comma/semicolon/pipe and
//      slices-or-pads each token's leading digits. Handles clean lists and
//      the "1234" → "01234" / "604001234" → "60400" edge cases.
//   2. Noisy extractor — pulls any remaining 5-digit run at a word boundary
//      out of whatever the strict pass didn't catch. Lets the user paste
//      city-name listings like "United States: (60426), (60428), …" or
//      "Addison (60101), Aurora (60503)" and get zips without manual cleanup.
const SEPARATOR = /[\s,;|]+/;
const LEADING_DIGITS = /^\d+/;
const FIVE_DIGIT_WORD = /\b\d{5}\b/g;

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

  for (const m of text.matchAll(FIVE_DIGIT_WORD)) {
    const zip = m[0];
    if (seen.has(zip)) continue;
    seen.add(zip);
    out.push(zip);
  }

  return out;
}
