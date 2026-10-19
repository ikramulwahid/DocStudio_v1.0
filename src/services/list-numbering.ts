/**
 * DocStudio — Deterministic numbering for list blocks (P05-M3)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * `project_details.md` §10.4 requires numbered lists with decimal,
 * upper/lower Roman and upper/lower alphabetic sequences, plus sensible
 * nesting.  This module is the ONE numbering engine shared by the editor
 * panel and the PoC renderer, so the same ordered item list always
 * produces the same displayed markers — exactly like `heading-numbering`
 * (P05-M2) for headings.
 *
 * Markers are DERIVED, never stored: `ListItem.spans` remains the
 * author's content and is never mutated with a numbering prefix, so
 * repeated rendering or serialization can never accumulate duplicates.
 *
 * Numbering rules (documented, deterministic)
 * ───────────────────────────────────────────
 * • Counters are per-depth: an item at depth D increments the depth-D
 *   counter and RESETS counters for depths D+1…MAX (a new nested
 *   sequence restarts at its first level).
 * • A marker joins the EXISTING counters 0…D with dots.  Depth levels
 *   that have not begun in the current context (counter zero/absent —
 *   e.g. a list whose first item sits at depth 1) are OMITTED, following
 *   the §10.1 heading precedent; "0" is never printed.
 * • Ancestor segments (everything except the deepest) always print as
 *   DECIMAL — "1.a.", "2.b.c." — because the schema carries ONE
 *   `numberStyle` per list block; only the item's own level uses that
 *   style.  A depth-0 decimal item prints "1.", "2.", … — byte-identical
 *   to the P04-M3 renderer output.
 * • Alphabetic is bijective base-26: 1→a, 26→z, 27→aa, 52→az, 53→ba.
 * • Roman numerals follow the standard additive/subtractive algorithm up
 *   to `ROMAN_MAX` (3999, the classic notation limit).  Values beyond it
 *   fall back to DECIMAL — a documented, deterministic policy; the item
 *   is never dropped or renumbered wrongly.
 *
 * @module services/list-numbering
 */

import type { NumberStyle } from '../types/blocks';

/** Classic Roman-notation limit; beyond this, markers fall back to decimal. */
export const ROMAN_MAX = 3999;

/** Maximum list nesting depth (schema `ListItem.depth` range 0…8). */
export const MAX_LIST_DEPTH = 8;

// ─────────────────────────────────────────────────────────────────────────────
// Single-value formatters
// ─────────────────────────────────────────────────────────────────────────────

/** Decimal marker body — "1", "2", … (no suffix). */
export function formatDecimal(value: number): string {
  return String(Math.max(1, Math.floor(value)));
}

const LOWER = 'abcdefghijklmnopqrstuvwxyz';
const UPPER = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';

/**
 * Bijective base-26 alphabetic marker body — 1→a/A, 26→z/Z,
 * 27→aa/AA, 52→az/AZ, 53→ba/BA.
 */
export function formatAlpha(value: number, upper: boolean): string {
  let n = Math.max(1, Math.floor(value));
  const alphabet = upper ? UPPER : LOWER;
  let out = '';
  while (n > 0) {
    const rem = (n - 1) % 26;
    out = alphabet[rem] + out;
    n = Math.floor((n - 1) / 26);
  }
  return out;
}

const ROMAN_MAP: readonly (readonly [number, string])[] = [
  [1000, 'm'],
  [900, 'cm'],
  [500, 'd'],
  [400, 'cd'],
  [100, 'c'],
  [90, 'xc'],
  [50, 'l'],
  [40, 'xl'],
  [10, 'x'],
  [9, 'ix'],
  [5, 'v'],
  [4, 'iv'],
  [1, 'i'],
];

/**
 * Standard Roman numeral marker body (lower-case base; callers case it).
 * Values are clamped into 1…`ROMAN_MAX` — the caller applies the
 * documented decimal fallback for anything above the cap.
 */
export function formatRoman(value: number): string {
  let n = Math.min(ROMAN_MAX, Math.max(1, Math.floor(value)));
  let out = '';
  for (const [amount, glyph] of ROMAN_MAP) {
    while (n >= amount) {
      out += glyph;
      n -= amount;
    }
  }
  return out;
}

/**
 * Format ONE counter value with the list's `numberStyle` (marker body,
 * no trailing period).  The documented Roman fallback applies here:
 * values above `ROMAN_MAX` print as decimal.
 */
export function formatListCounter(value: number, style: NumberStyle): string {
  switch (style) {
    case 'lower-alpha':
      return formatAlpha(value, false);
    case 'upper-alpha':
      return formatAlpha(value, true);
    case 'lower-roman':
      return value > ROMAN_MAX ? formatDecimal(value) : formatRoman(value).toLowerCase();
    case 'upper-roman':
      return value > ROMAN_MAX ? formatDecimal(value) : formatRoman(value).toUpperCase();
    case 'decimal':
    default:
      return formatDecimal(value);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Sequence computation
// ─────────────────────────────────────────────────────────────────────────────

/** Anything with a depth is enough to compute a marker (see module doc). */
export interface ListItemDepth {
  readonly depth: number;
}

/**
 * Compute the derived marker text for every item of a NUMBERED list, in
 * item order.  Returns one string per item, e.g. `['1.', '1.1.', '2.']`.
 *
 * Deterministic and pure: the same ordered item list always yields the
 * same labels.  Callers (editor preview, renderer) must pass the
 * AUTHORITATIVE `items` order so both surfaces agree.  Bullet and
 * checklist lists draw shape/checkbox markers instead and do not call
 * this function.
 */
export function computeListLabels(
  items: readonly ListItemDepth[],
  numberStyle: NumberStyle,
): string[] {
  const counters: number[] = [];
  return items.map((item) => {
    const depth = Number.isFinite(item.depth)
      ? Math.max(0, Math.min(MAX_LIST_DEPTH, Math.floor(item.depth)))
      : 0;
    counters[depth] = (counters[depth] ?? 0) + 1;
    counters.length = depth + 1; // reset deeper counters (new nested sequence)

    // Join existing counters 0…depth; the deepest segment uses the list's
    // numberStyle, ancestors always print decimal (module doc).
    const segments: string[] = [];
    for (let level = 0; level <= depth; level += 1) {
      const counter = counters[level];
      if (counter === undefined || counter === 0) continue; // not begun yet
      segments.push(
        level === depth ? formatListCounter(counter, numberStyle) : formatDecimal(counter),
      );
    }
    return `${segments.join('.')}.`;
  });
}
