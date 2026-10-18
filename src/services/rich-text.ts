/**
 * DocStudio — Rich-text inline span algebra and sanitizers (P05-M2)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * `project_details.md` §10.2 requires paragraph formatting (bold, italic,
 * underline, strikethrough, hyperlinks, highlight, font colour) to be
 * stored as DOCUMENT DATA on `InlineSpan[]`, never as transient browser
 * state.  This module is the pure, dependency-free core that both the
 * editor UI and the verification suite use, so the same rules apply
 * everywhere:
 *
 * • Range algebra   — `applySpanFormatting` turns a character range over
 *   plain text into styled spans by splitting at range boundaries,
 *   toggling the requested style, then re-merging neighbours that ended
 *   up identically styled.  Pure and deterministic.
 * • Link safety     — `sanitizeHref` accepts only http(s) and mailto
 *   targets.  `javascript:`, `data:`, `vbscript:` and every other scheme
 *   are rejected; scheme-less input is interpreted as https for bare
 *   hosts and rejected for anything else.  Used at EDIT time (toolbar)
 *   and at RENDER time (PoC renderer), so an unsafe href can never
 *   reach the editor display or the exported PDF.
 * • Colour safety   — `normalizeHexColor` accepts only #RGB, #RRGGBB or
 *   #RRGGBBAA and returns a canonical lowercase form; anything else is
 *   rejected (never stored, never rendered).
 * • Normalisation   — `normalizeSpans` drops empty runs, promotes the
 *   schema default (no style flags) and merges adjacent identical runs,
 *   so saved documents stay small and stable.
 *
 * Everything here is pure: no DOM, no React, no I/O.  The DOM-dependent
 * serialization (contentEditable → spans) lives in the editor component
 * and funnels through these functions.
 *
 * @module services/rich-text
 */

import type { InlineSpan } from '../types/blocks';

// ─────────────────────────────────────────────────────────────────────────────
// Shared types
// ─────────────────────────────────────────────────────────────────────────────

/** A half-open character range [start, end) over a span list's plain text. */
export interface CharRange {
  readonly start: number;
  readonly end: number;
}

/** The boolean style flags a formatting toggle can change. */
export type SpanStyleFlag = 'bold' | 'italic' | 'underline' | 'strikethrough';

/** Deterministic failure codes for rich-text operations. */
export type RichTextErrorCode =
  | 'invalid-range'
  | 'invalid-style'
  | 'invalid-color'
  | 'invalid-href';

export interface RichTextError {
  readonly ok: false;
  readonly code: RichTextErrorCode;
  readonly message: string;
}

const fail = (code: RichTextErrorCode, message: string): RichTextError => ({
  ok: false,
  code,
  message,
});

// ─────────────────────────────────────────────────────────────────────────────
// Plain-text projection
// ─────────────────────────────────────────────────────────────────────────────

/** Concatenate every span's text — the character space ranges address. */
export function spansToPlainText(spans: readonly InlineSpan[]): string {
  return spans.map((span) => span.text).join('');
}

/** A single unstyled span from plain text (schema-valid by construction). */
export function plainTextToSpans(text: string): InlineSpan[] {
  return text === '' ? [] : [{ text }];
}

// ─────────────────────────────────────────────────────────────────────────────
// Colour normalisation
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Canonicalise a CSS hex colour.  Accepts `#RGB`, `#RRGGBB` and
 * `#RRGGBBAA` (case-insensitive, optional leading '#'); returns the
 * lowercase `#rrggbb` / `#rrggbbaa` form.  Returns `null` for anything
 * else — named colours, `rgb()`, malformed hex, non-strings.  Callers
 * must treat `null` as REJECTED input, never as a fallback colour.
 */
export function normalizeHexColor(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const raw = value.trim().startsWith('#') ? value.trim().slice(1) : value.trim();
  if (!/^[0-9a-fA-F]+$/.test(raw)) return null;
  if (raw.length === 3) {
    const expanded = raw
      .toLowerCase()
      .split('')
      .map((c) => c + c)
      .join('');
    return `#${expanded}`;
  }
  if (raw.length === 6 || raw.length === 8) {
    return `#${raw.toLowerCase()}`;
  }
  return null;
}

/** Valid span colour, already canonicalised, or the rejection error. */
export type ColorResult = { ok: true; color: string | null } | RichTextError;

/** Type predicate that narrows in BOTH strict and non-strict compiles. */
function isColorError(result: ColorResult): result is RichTextError {
  return result.ok === false;
}

/**
 * Validate an optional colour patch value.  `null`/`undefined`/`''`
 * means "clear the colour" (ok, no colour).  A string must normalise;
 * otherwise `invalid-color`.
 */
export function validateColorPatch(value: unknown): ColorResult {
  if (value === null || value === undefined || value === '') {
    return { ok: true, color: null };
  }
  const color = normalizeHexColor(value);
  if (color === null) {
    return fail(
      'invalid-color',
      'Colours must be hex values like #1a1a1a or #1a1a1a80.',
    );
  }
  return { ok: true, color };
}

// ─────────────────────────────────────────────────────────────────────────────
// Link safety
// ─────────────────────────────────────────────────────────────────────────────

/** URL schemes a document hyperlink may use.  Nothing else is ever stored. */
export const SAFE_HREF_SCHEMES = ['https:', 'http:', 'mailto:'] as const;

/**
 * Sanitise a hyperlink target (project_details.md §10.2 "safe links").
 *
 * Rules (deterministic, applied identically at edit and render time):
 * • Trimmed; empty input clears the link (returns `null`).
 * • Control characters (including newlines/tabs) are rejected — they are
 *   the classic vector for smuggling `javascript:` past naive parsers.
 * • Absolute targets must use `https:`, `http:` or `mailto:` (scheme
 *   compared case-insensitively; the URL constructor canonicalises it).
 * • A scheme-less target that looks like a bare host (`example.org`,
 *   `example.org/path`, `www.example.org`) is interpreted as `https://`.
 * • Every other scheme (`javascript:`, `data:`, `vbscript:`, `file:`,
 *   custom app schemes, …) is REJECTED — the function returns `null`
 *   and the caller must store no link.
 *
 * Note the asymmetry on purpose: for ABSOLUTE input a bad scheme returns
 * `null` (reject), while for SCHEME-LESS input `null` means "not a host,
 * reject".  Either way the caller stores nothing unsafe.
 */
export function sanitizeHref(input: unknown): string | null {
  if (typeof input !== 'string') return null;
  const trimmed = input.trim();
  if (trimmed === '') return null;
  // eslint-disable-next-line no-control-regex
  if (/[\u0000-\u001F\u007F]/.test(trimmed)) return null;

  const hasScheme = /^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(trimmed);
  if (hasScheme) {
    let parsed: URL;
    try {
      parsed = new URL(trimmed);
    } catch {
      return null;
    }
    const scheme = parsed.protocol.toLowerCase();
    if (!(SAFE_HREF_SCHEMES as readonly string[]).includes(scheme)) {
      return null;
    }
    if (scheme === 'mailto:' && parsed.pathname === '') return null;
    return parsed.toString();
  }

  // Scheme-less: only a plausible bare host is accepted (as https).
  if (!/^[a-zA-Z0-9]([a-zA-Z0-9-]*[a-zA-Z0-9])?(\.[a-zA-Z0-9]([a-zA-Z0-9-]*[a-zA-Z0-9])?)+([/?#].*)?$/.test(trimmed)) {
    return null;
  }
  try {
    return new URL(`https://${trimmed}`).toString();
  } catch {
    return null;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Normalisation
// ─────────────────────────────────────────────────────────────────────────────

const styleSignature = (span: InlineSpan): string =>
  JSON.stringify([
    span.bold ?? false,
    span.italic ?? false,
    span.underline ?? false,
    span.strikethrough ?? false,
    span.color ?? null,
    span.highlight ?? null,
    span.href ?? null,
    span.verticalAlign ?? null,
    span.code ?? false,
  ]);

/**
 * Canonicalise a span list for storage (called by the content actions
 * before committing, and by the DOM serializer after reading):
 * • text must be a string (non-strings coerced defensively to ''),
 * • boolean flags stored only when true,
 * • colour/highlight normalised via `normalizeHexColor` (unsafe values
 *   are DROPPED, never rendered),
 * • href passed through `sanitizeHref` (unsafe links are REMOVED),
 * • empty-text spans dropped,
 * • adjacent identically-styled spans merged.
 * The result is always schema-valid and deterministic.
 */
export function normalizeSpans(spans: readonly InlineSpan[]): InlineSpan[] {
  const cleaned: InlineSpan[] = [];
  for (const span of spans) {
    if (span === null || typeof span !== 'object') continue;
    const text = typeof span.text === 'string' ? span.text : '';
    if (text === '') continue;

    const next: InlineSpan = { text };
    if (span.bold === true) next.bold = true;
    if (span.italic === true) next.italic = true;
    if (span.underline === true) next.underline = true;
    if (span.strikethrough === true) next.strikethrough = true;
    if (span.code === true) next.code = true;
    const color = normalizeHexColor(span.color);
    if (color !== null) next.color = color;
    const highlight = normalizeHexColor(span.highlight);
    if (highlight !== null) next.highlight = highlight;
    const href = sanitizeHref(span.href);
    if (href !== null) next.href = href;
    if (span.verticalAlign === 'super' || span.verticalAlign === 'sub') {
      next.verticalAlign = span.verticalAlign;
    }

    const prev = cleaned[cleaned.length - 1];
    if (prev !== undefined && styleSignature(prev) === styleSignature(next)) {
      cleaned[cleaned.length - 1] = { ...prev, text: prev.text + text };
    } else {
      cleaned.push(next);
    }
  }
  return cleaned;
}

// ─────────────────────────────────────────────────────────────────────────────
// Range formatting algebra
// ─────────────────────────────────────────────────────────────────────────────

const toggleFlag = (span: InlineSpan, flag: SpanStyleFlag, on: boolean): InlineSpan => {
  const next: InlineSpan = { ...span };
  if (on) next[flag] = true;
  else delete next[flag];
  return next;
};

/**
 * Apply or remove a style flag over the character range `[start, end)`.
 *
 * The range is clamped to the text bounds and must cover at least one
 * character (an empty or inverted range is `invalid-range` — the caller
 * should disable its control instead of silently doing nothing).  Spans
 * crossing either boundary are split so the flag change touches exactly
 * the selected characters; afterwards, identically-styled neighbours are
 * re-merged.  When `on` is false the flag is removed only inside the
 * range — everywhere else the existing styling is preserved.
 *
 * Pure: the input list is never mutated.  The result is normalised.
 */
export function applySpanFormatting(
  spans: readonly InlineSpan[],
  range: CharRange,
  flag: SpanStyleFlag,
  on: boolean,
): InlineSpan[] | RichTextError {
  if (!Number.isInteger(range.start) || !Number.isInteger(range.end)) {
    return fail('invalid-range', 'The selected text range is not valid.');
  }
  const text = spansToPlainText(spans);
  const start = Math.max(0, Math.min(range.start, text.length));
  const end = Math.max(start, Math.min(range.end, text.length));
  if (start === end) {
    return fail(
      'invalid-range',
      'Select some text before applying formatting.',
    );
  }
  if (flag !== 'bold' && flag !== 'italic' && flag !== 'underline' && flag !== 'strikethrough') {
    return fail('invalid-style', `"${String(flag)}" is not a supported text style.`);
  }

  const out: InlineSpan[] = [];
  let cursor = 0;
  for (const span of spans) {
    const spanStart = cursor;
    const spanEnd = cursor + span.text.length;
    cursor = spanEnd;
    if (spanEnd <= start || spanStart >= end) {
      out.push({ ...span });
      continue;
    }
    const cutStart = Math.max(start, spanStart) - spanStart;
    const cutEnd = Math.min(end, spanEnd) - spanStart;
    const before = span.text.slice(0, cutStart);
    const middle = span.text.slice(cutStart, cutEnd);
    const after = span.text.slice(cutEnd);
    if (before !== '') out.push({ ...span, text: before });
    if (middle !== '') out.push(toggleFlag({ ...span, text: middle }, flag, on));
    if (after !== '') out.push({ ...span, text: after });
  }
  return normalizeSpans(out);
}

/**
 * Set or clear the hyperlink target over `[start, end)`.
 * `href` goes through `sanitizeHref`; a rejected target clears the link
 * over the range (callers surface the rejection separately).  Unlike the
 * flag toggle, links are SET (replace whatever was there) or CLEARED —
 * there is no "toggle to opposite" semantic for links.
 */
export function applySpanLink(
  spans: readonly InlineSpan[],
  range: CharRange,
  href: string | null,
): InlineSpan[] | RichTextError {
  if (!Number.isInteger(range.start) || !Number.isInteger(range.end)) {
    return fail('invalid-range', 'The selected text range is not valid.');
  }
  const text = spansToPlainText(spans);
  const start = Math.max(0, Math.min(range.start, text.length));
  const end = Math.max(start, Math.min(range.end, text.length));
  if (start === end) {
    return fail('invalid-range', 'Select some text before adding a link.');
  }
  const safe = sanitizeHref(href);
  if (href !== null && href.trim() !== '' && safe === null) {
    return fail(
      'invalid-href',
      'Links must be web addresses (https://…) or email addresses (mailto:…). ' +
        'Scripts and other file types are not allowed.',
    );
  }

  const out: InlineSpan[] = [];
  let cursor = 0;
  for (const span of spans) {
    const spanStart = cursor;
    const spanEnd = cursor + span.text.length;
    cursor = spanEnd;
    if (spanEnd <= start || spanStart >= end) {
      out.push({ ...span });
      continue;
    }
    const cutStart = Math.max(start, spanStart) - spanStart;
    const cutEnd = Math.min(end, spanEnd) - spanStart;
    const before = span.text.slice(0, cutStart);
    const middle = span.text.slice(cutStart, cutEnd);
    const after = span.text.slice(cutEnd);
    if (before !== '') out.push({ ...span, text: before });
    if (middle !== '') {
      const target: InlineSpan = { ...span, text: middle };
      if (safe === null) delete target.href;
      else target.href = safe;
      out.push(target);
    }
    if (after !== '') out.push({ ...span, text: after });
  }
  return normalizeSpans(out);
}

/**
 * Set or clear a colour (`kind: 'color'`) or highlight (`kind:
 * 'highlight'`) over `[start, end)`.  `value` is validated via
 * `validateColorPatch`; invalid values return `invalid-color` and the
 * spans are untouched.  `null`/`''` clears the property over the range.
 */
export function applySpanColor(
  spans: readonly InlineSpan[],
  range: CharRange,
  kind: 'color' | 'highlight',
  value: string | null,
): InlineSpan[] | RichTextError {
  if (!Number.isInteger(range.start) || !Number.isInteger(range.end)) {
    return fail('invalid-range', 'The selected text range is not valid.');
  }
  const validated = validateColorPatch(value);
  if (isColorError(validated)) return validated;

  const text = spansToPlainText(spans);
  const start = Math.max(0, Math.min(range.start, text.length));
  const end = Math.max(start, Math.min(range.end, text.length));
  if (start === end) {
    return fail('invalid-range', 'Select some text before changing its colour.');
  }

  const out: InlineSpan[] = [];
  let cursor = 0;
  for (const span of spans) {
    const spanStart = cursor;
    const spanEnd = cursor + span.text.length;
    cursor = spanEnd;
    if (spanEnd <= start || spanStart >= end) {
      out.push({ ...span });
      continue;
    }
    const cutStart = Math.max(start, spanStart) - spanStart;
    const cutEnd = Math.min(end, spanEnd) - spanStart;
    const before = span.text.slice(0, cutStart);
    const middle = span.text.slice(cutStart, cutEnd);
    const after = span.text.slice(cutEnd);
    if (before !== '') out.push({ ...span, text: before });
    if (middle !== '') {
      const target: InlineSpan = { ...span, text: middle };
      if (validated.color === null) delete target[kind];
      else target[kind] = validated.color;
      out.push(target);
    }
    if (after !== '') out.push({ ...span, text: after });
  }
  return normalizeSpans(out);
}

/**
 * Remove EVERY style flag, colour, highlight and link from the range —
 * the "clear formatting" affordance.  Text is preserved verbatim.
 */
export function clearSpanFormatting(
  spans: readonly InlineSpan[],
  range: CharRange,
): InlineSpan[] | RichTextError {
  if (!Number.isInteger(range.start) || !Number.isInteger(range.end)) {
    return fail('invalid-range', 'The selected text range is not valid.');
  }
  const text = spansToPlainText(spans);
  const start = Math.max(0, Math.min(range.start, text.length));
  const end = Math.max(start, Math.min(range.end, text.length));
  if (start === end) {
    return fail('invalid-range', 'Select some text before clearing formatting.');
  }

  const out: InlineSpan[] = [];
  let cursor = 0;
  for (const span of spans) {
    const spanStart = cursor;
    const spanEnd = cursor + span.text.length;
    cursor = spanEnd;
    if (spanEnd <= start || spanStart >= end) {
      out.push({ ...span });
      continue;
    }
    const cutStart = Math.max(start, spanStart) - spanStart;
    const cutEnd = Math.min(end, spanEnd) - spanStart;
    const before = span.text.slice(0, cutStart);
    const middle = span.text.slice(cutStart, cutEnd);
    const after = span.text.slice(cutEnd);
    if (before !== '') out.push({ ...span, text: before });
    if (middle !== '') out.push({ text: middle });
    if (after !== '') out.push({ ...span, text: after });
  }
  return normalizeSpans(out);
}

/**
 * Does the style flag apply to EVERY character of the range?  Toolbar
 * buttons use this to show a pressed/active state that reflects the
 * document data rather than transient browser state (§10.2).
 */
export function isFlagActiveOverRange(
  spans: readonly InlineSpan[],
  range: CharRange,
  flag: SpanStyleFlag,
): boolean {
  const text = spansToPlainText(spans);
  if (range.start === range.end) return false;
  const start = Math.max(0, Math.min(range.start, text.length));
  const end = Math.max(start, Math.min(range.end, text.length));
  if (start === end) return false;

  let cursor = 0;
  let sawCharacter = false;
  for (const span of spans) {
    const spanStart = cursor;
    const spanEnd = cursor + span.text.length;
    cursor = spanEnd;
    if (spanEnd <= start || spanStart >= end) continue;
    sawCharacter = true;
    if (span[flag] !== true) return false;
  }
  return sawCharacter;
}

/** The href covering the range when it is uniform across it, else null. */
export function hrefOverRange(
  spans: readonly InlineSpan[],
  range: CharRange,
): string | null {
  const text = spansToPlainText(spans);
  const start = Math.max(0, Math.min(range.start, text.length));
  const end = Math.max(start, Math.min(range.end, text.length));
  if (start === end) return null;

  let found: string | null = null;
  let uniform = true;
  let cursor = 0;
  for (const span of spans) {
    const spanStart = cursor;
    const spanEnd = cursor + span.text.length;
    cursor = spanEnd;
    if (spanEnd <= start || spanStart >= end) continue;
    const href = span.href ?? null;
    if (found === null) found = href;
    else if (found !== href) uniform = false;
  }
  return uniform ? found : null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Plain-text edit remapping
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Remap a span list after the PLAIN TEXT was edited in a text surface
 * (the editor's textarea), preserving the formatting of everything that
 * was not touched.
 *
 * Algorithm (deterministic, documented): compute the longest common
 * prefix and suffix of the old and new plain text.  The differing
 * middle region is replaced — spans entirely before the region keep
 * their formatting, spans entirely after it keep theirs, spans crossing
 * the region's start keep their leading part, spans crossing its end
 * keep their trailing part, and the replacement text itself is inserted
 * as UNSTYLED text (formatting of newly typed characters is applied
 * afterwards with the toolbar — predictable, never inherited by
 * surprise).  The result is normalised.
 *
 * Pure: the input list is never mutated.
 */
export function remapSpansAfterTextEdit(
  spans: readonly InlineSpan[],
  newText: string,
): InlineSpan[] {
  const oldText = spansToPlainText(spans);
  if (newText === oldText) return normalizeSpans(spans);

  // Longest common prefix (stop at the first differing character).
  let prefix = 0;
  const maxPrefix = Math.min(oldText.length, newText.length);
  while (prefix < maxPrefix && oldText[prefix] === newText[prefix]) prefix += 1;

  // Longest common suffix (never overlapping the prefix).
  let suffix = 0;
  const maxSuffix = Math.min(oldText.length, newText.length) - prefix;
  while (
    suffix < maxSuffix &&
    oldText[oldText.length - 1 - suffix] === newText[newText.length - 1 - suffix]
  ) {
    suffix += 1;
  }

  const oldEnd = oldText.length - suffix; // exclusive, old text
  const newEnd = newText.length - suffix; // exclusive, new text
  const inserted = newText.slice(prefix, newEnd);

  const out: InlineSpan[] = [];
  let cursor = 0;
  for (const span of spans) {
    const spanStart = cursor;
    const spanEnd = cursor + span.text.length;
    cursor = spanEnd;

    if (spanEnd <= prefix) {
      out.push({ ...span }); // entirely before the edit
      continue;
    }
    if (spanStart >= oldEnd) {
      out.push({ ...span }); // entirely after the edit
      continue;
    }
    const before = span.text.slice(0, Math.max(0, prefix - spanStart));
    const after = span.text.slice(Math.max(0, oldEnd - spanStart));
    if (before !== '') out.push({ ...span, text: before });
    if (after !== '') out.push({ ...span, text: after });
  }
  if (inserted !== '') {
    const rebuilt: InlineSpan[] = [];
    let insertedPlaced = false;
    let seen = 0;
    for (const piece of out) {
      if (!insertedPlaced && seen >= prefix) {
        rebuilt.push({ text: inserted });
        insertedPlaced = true;
      }
      rebuilt.push(piece);
      seen += piece.text.length;
    }
    if (!insertedPlaced) rebuilt.push({ text: inserted });
    return normalizeSpans(rebuilt);
  }
  return normalizeSpans(out);
}
