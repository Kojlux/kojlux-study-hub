// jsPDF's built-in fonts (helvetica, times, courier) only support the
// WinAnsi (~Latin-1) character set. Any character outside that range
// silently renders as a missing/garbled glyph — and the usual "quick fix"
// (a regex replace) can make things *worse* instead of better if the
// regex can match a zero-length string.
//
// Example of the exact bug that produced "&2&.& &W&h&a&t&":
//
//   "What".replace(/x*/g, '&')   // -> "&W&h&a&t&"
//
// There's no "x" in "What", so /x*/g matches an empty string at every
// single position. String.replace() still substitutes at each of those
// zero-length matches, so '&' gets stitched between every character
// while the real text just rides along untouched. Any `*`-quantified
// (zero-or-more) global regex used for "stripping" or "escaping" text
// has this failure mode the moment the target character ISN'T present —
// which is exactly when normal, uncorrupted text goes through it.
//
// This module sanitizes text for jsPDF without any variable-length or
// zero-width regex — it walks the string one Unicode code point at a
// time, so it can never produce an empty match.

// Typographic / Unicode -> WinAnsi-safe ASCII equivalents. A lookup
// table can never produce a zero-width match, unlike a regex — extend
// this table instead of reaching for `.replace(/.../g, ...)`.
const CHAR_MAP: Record<string, string> = {
  // Quotes & apostrophes
  '\u2018': "'", '\u2019': "'", '\u201A': "'", '\u201B': "'",
  '\u201C': '"', '\u201D': '"', '\u201E': '"', '\u201F': '"',
  // Dashes
  '\u2013': '-', '\u2014': '-', '\u2212': '-',
  // Ellipsis
  '\u2026': '...',
  // Bullets
  '\u2022': '-', '\u25CF': '-', '\u25E6': '-',
  // Odd spaces
  '\u00A0': ' ', '\u2007': ' ', '\u2009': ' ',
  // Math symbols
  '\u00D7': 'x', '\u00F7': '/', '\u2260': '!=', '\u2264': '<=', '\u2265': '>=',
  '\u221A': 'sqrt', '\u221E': 'inf', '\u2248': '~=', '\u00B1': '+/-',
  // Arrows
  '\u2192': '->', '\u2190': '<-', '\u21D2': '=>',
  // Superscript digits (e.g. exponents typed as unicode instead of LaTeX)
  '\u00B2': '^2', '\u00B3': '^3', '\u00B9': '^1', '\u2070': '^0',
  '\u2074': '^4', '\u2075': '^5', '\u2076': '^6', '\u2077': '^7',
  '\u2078': '^8', '\u2079': '^9',
  // Subscript digits
  '\u2080': '_0', '\u2081': '_1', '\u2082': '_2', '\u2083': '_3',
  '\u2084': '_4', '\u2085': '_5', '\u2086': '_6', '\u2087': '_7',
  '\u2088': '_8', '\u2089': '_9',
  // Misc
  '\u00B0': ' deg', '\u2122': '(TM)', '\u00A9': '(c)', '\u00AE': '(R)',
};

// Zero-width / invisible characters that should just disappear.
const INVISIBLE = new Set<number>([0x200b, 0x200c, 0x200d, 0xfeff]);

// --- Repairing already-corrupted text ------------------------------
//
// The character-mapping pass above prevents *new* corruption at the
// jsPDF boundary, but it can't undo damage already baked into a string
// before it ever reaches this file — e.g. text that already looks like
// "&W&h&a&t&" by the time it's sitting in quizData.question. That shape
// comes from a `str.replace(/somethingThatNeverMatches*/g, '&')` bug
// upstream (see pdfTextSanitizer's file header) — every real character
// ends up isolated by a lone '&'. Ordinary text never looks like this
// (not even "Q&A" or "R&D" — those have far more non-'&' characters
// than '&' ones), so it's safe to detect and repair without touching
// genuine content.
function isAmpersandCorrupted(str: string): boolean {
  if (str.indexOf('&') === -1) return false;
  const parts = str.split('&').filter((p) => p.length > 0);
  // Too short to judge reliably one way or the other — leave it alone.
  if (parts.length < 6) return false;
  const singleCharParts = parts.filter((p) => p.length === 1).length;
  // Corrupted text is *overwhelmingly* lone characters between '&'s;
  // real prose with the occasional '&' never clears this bar.
  return singleCharParts / parts.length > 0.9;
}

function repairAmpersandCorruption(str: string): string {
  return isAmpersandCorrupted(str) ? str.split('&').join('') : str;
}

/**
 * Sanitizes a single string for safe rendering with jsPDF's standard
 * fonts. Repairs the "&W&h&a&t&" corruption pattern if present, then
 * walks the string one code point at a time (handles surrogate pairs /
 * emoji correctly) — never uses a regex .replace(), so this function
 * cannot introduce that corruption itself.
 */
export function sanitizeForPdf(input: unknown): string {
  if (input === null || input === undefined) return '';
  const str = repairAmpersandCorruption(String(input));

  let out = '';
  for (const ch of str) {
    const code = ch.codePointAt(0)!;

    if (INVISIBLE.has(code)) continue;

    // Strip control characters except normal whitespace (also drops
    // stray \r, which can otherwise confuse splitTextToSize's line math).
    if (code < 0x20 && ch !== '\n' && ch !== '\t') continue;

    const mapped = CHAR_MAP[ch];
    if (mapped !== undefined) {
      out += mapped;
      continue;
    }

    // Anything else outside Latin-1 isn't in jsPDF's standard-font
    // encoding table. Rather than let it render as a broken glyph (or
    // corrupt the string the way a bad regex would), swap in a visible
    // placeholder so it's obvious something needs adding to CHAR_MAP.
    if (code > 0xff) {
      out += '?';
      continue;
    }

    out += ch;
  }

  return out;
}

/**
 * Recursively sanitizes every string leaf in an object/array (numbers,
 * booleans, null/undefined pass through untouched). Run this once on a
 * whole StructuredContent payload right before it reaches the PDF
 * renderer so nothing — table cells, formulas, timeline entries, link
 * labels — can slip through unsanitized.
 */
export function sanitizeDeep<T>(value: T): T {
  if (typeof value === 'string') {
    return sanitizeForPdf(value) as unknown as T;
  }
  if (Array.isArray(value)) {
    return value.map((v) => sanitizeDeep(v)) as unknown as T;
  }
  if (value && typeof value === 'object') {
    const result: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      result[k] = sanitizeDeep(v);
    }
    return result as T;
  }
  return value;
}

// --- Image-query anchoring -------------------------------------------
//
// Separate bug class, same underlying theme: an AI-generated imageQuery
// like "his physical appearance" or "the leader's early life" has no
// anchor once it's dropped into a bare Google Images link — there's
// nothing in the query itself tying it back to the actual subject, so
// results can drift anywhere (as with the Gaddafi search that surfaced
// Liberia photos instead). This is a *prompt-following* miss, not a
// search-engine bug, so the fix is to guarantee an anchor in code rather
// than trust the model to always include the name.

// Cheap heuristic: does this query already contain something that looks
// like a proper noun (a capitalized word)? Not perfect, but enough to
// avoid double-prefixing queries that are already anchored.
function looksAnchored(query: string): boolean {
  return /[A-Z][a-z]/.test(query);
}

/**
 * Ensures an image search query can't rely on context it doesn't
 * contain. If the query has no proper-noun-looking token and a
 * `topicName` (the actual subject, e.g. "Muammar Gaddafi") is supplied,
 * the topic name is prepended so "physical appearance" becomes
 * "Muammar Gaddafi physical appearance" instead of being searched on
 * its own.
 */
export function anchorImageQuery(query: string, topicName?: string): string {
  const q = query.trim();
  if (!topicName || looksAnchored(q)) return q;
  return `${topicName} ${q}`;
}