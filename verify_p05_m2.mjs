/**
 * P05-M2 — Headings and rich-text paragraph verification
 * ═══════════════════════════════════════════════════════════════════════════
 * Compiles the REAL modules (`services/heading-numbering.ts`,
 * `services/rich-text.ts`, `services/block-content.ts`,
 * `services/block-actions.ts`, `services/block-registry.ts`,
 * `services/document-file.ts`, `types/*`) and the REAL renderer
 * (`renderer/poc/*` → @react-pdf/renderer) to CommonJS in a temp dir and
 * exercises them in Node with `node:assert/strict`.  No test framework is
 * introduced.
 *
 * Covers (task §6):
 *  1 numbering rules: only `numbered: true` participates; plain headings
 *    are skipped entirely (no number consumed, no reset); level L
 *    increments L and resets deeper levels; zero segments are omitted;
 *    determinism and same-input/same-map.
 *  2 numbering purity: block list is never mutated.
 *  3 span algebra: spansToPlainText / plainTextToSpans round-trip.
 *  4 normalizeHexColor: #RGB/#RRGGBB/#RRGGBBAA, case-insensitive,
 *    optional '#'; rejects named colours, rgb(), malformed, non-strings.
 *  5 validateColorPatch: null/undefined/'' clears; valid normalises;
 *    invalid returns 'invalid-color' (never coerced).
 *  6 sanitizeHref: https/http/mailto accepted (canonicalised); bare host
 *    → https; javascript:/data:/vbscript:/file:/control chars REJECTED.
 *  7 normalizeSpans: empty runs dropped, neighbours merged, unsafe hrefs
 *    REMOVED, malformed colours dropped, flags stored only when true.
 *  8 applySpanFormatting: sets/removes one flag over a range, splitting
 *    and re-merging spans; empty range and unknown flags rejected.
 *  9 applySpanLink: sets a sanitised href over a range; unsafe target
 *    rejected before commit; null clears the link.
 * 10 applySpanColor: colour/highlight over a range; invalid value
 *    rejected; null clears.
 * 11 clearSpanFormatting: removes all style from the range, text kept
 *    verbatim.
 * 12 isFlagActiveOverRange / hrefOverRange: toolbar state reflects the
 *    DATA, not transient editor state.
 * 13 remapSpansAfterTextEdit: typing preserves formatting of untouched
 *    runs; inserted text is unstyled; deletion/replace behave the same.
 * 14 updateHeadingContent: level/text/numbered/hAlign validation with
 *    deterministic codes; same-reference no-op; immutability; modifiedAt
 *    stamped only on real changes; only the target block changes.
 * 15 updateParagraphContent: spans/hAlign/indentLevel validation;
 *    same-reference no-op; immutability; modifiedAt.
 * 16 model-boundary sanitisation: unsafe hrefs/colours arriving in a
 *    spans patch are sanitised by the service, not stored.
 * 17 serialization round-trip: a document with numbered headings and a
 *    formatted (bold/italic/underline/strikethrough/colour/highlight/
 *    link) paragraph survives serializeDocument → deserializeDocument
 *    unchanged.
 * 18 renderer: heading numbering prefixes appear in the rendered PDF
 *    text; strikethrough/colour/highlight/link are applied; the P02-M4
 *    baseline PoC fixture remains BYTE-IDENTICAL (renderer additions are
 *    deviation-only).
 *
 * Usage: node verify_p05_m2.mjs   (or: npm run verify:p05-m2)
 */

import { execSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { readFileSync, rmSync } from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import assert from 'node:assert/strict';

const require = createRequire(import.meta.url);
const root = path.dirname(new URL(import.meta.url).pathname.replace(/^\//, ''));

// ── Compile the real modules to CommonJS in node_modules/.cache ─────────────
// The output must live INSIDE the project tree so `react` and
// `@react-pdf/renderer` resolve at require-time (same pattern as
// verify_p04_m3).  `--jsx react-jsx` is required because the renderer
// entry (and block-registry's type-only IconName import) reference JSX.
const outDir = path.join(root, 'node_modules', '.cache', 'ds-p05-m2-verify');
rmSync(outDir, { recursive: true, force: true });
execSync(
  'npx tsc src/renderer/poc/poc-node-entry.ts' +
    ' src/services/heading-numbering.ts src/services/rich-text.ts' +
    ' src/services/block-content.ts src/services/block-actions.ts' +
    ' src/services/block-registry.ts' +
    ` --outDir "${outDir}" --module commonjs --target es2020 --moduleResolution node` +
    ' --esModuleInterop --skipLibCheck --jsx react-jsx',
  { cwd: root, stdio: 'inherit' },
);

const poc = require(path.join(outDir, 'renderer', 'poc', 'poc-node-entry.js'));
const numbering = require(path.join(outDir, 'services', 'heading-numbering.js'));
const richText = require(path.join(outDir, 'services', 'rich-text.js'));
const blockContent = require(path.join(outDir, 'services', 'block-content.js'));
const blockActions = require(path.join(outDir, 'services', 'block-actions.js'));
const registry = require(path.join(outDir, 'services', 'block-registry.js'));
const file = require(path.join(outDir, 'services', 'document-file.js'));
const defaults = require(path.join(outDir, 'types', 'defaults.js'));

const { computeHeadingNumbering, HEADING_PREFIX_SEPARATOR } = numbering;
const {
  spansToPlainText,
  plainTextToSpans,
  normalizeHexColor,
  validateColorPatch,
  sanitizeHref,
  normalizeSpans,
  applySpanFormatting,
  applySpanLink,
  applySpanColor,
  clearSpanFormatting,
  isFlagActiveOverRange,
  hrefOverRange,
  remapSpansAfterTextEdit,
} = richText;
const { updateHeadingContent, updateParagraphContent, MAX_PARAGRAPH_INDENT } = blockContent;
const { createBlock } = blockActions;
const { createDefaultDocument } = defaults;
const { serializeDocument, deserializeDocument } = file;
const { renderDocPdfBytes, buildPocFixture } = poc;

// ── Test runner (same style as the prior suites) ────────────────────────────
let passed = 0;
const failed = [];
async function test(name, fn) {
  try {
    await fn();
    passed += 1;
    console.log(`  ok  ${name}`);
  } catch (e) {
    failed.push({ name, e });
    console.error(`FAIL  ${name}\n      ${e && e.message ? e.message : e}`);
    if (e && e.stack) console.error(`      ${String(e.stack).split('\n').slice(1, 4).join('\n      ')}`);
  }
}

// ── Fixtures ────────────────────────────────────────────────────────────────
const T0 = '2026-10-18T10:00:00.000Z';
let seq = 0;
/** Deterministic ID generator for envelope block IDs (tests only). */
const genId = () => `10600000-0000-4000-8000-${String(++seq).padStart(12, '0')}`;
const opts = () => ({ now: T0, genId });
const newDoc = () => createDefaultDocument('doc-p05-m2', T0);
const snap = (doc) => JSON.stringify(doc);

/** Build a heading block with the given level/text/numbered/align. */
function heading(level, text, numbered = false, hAlign = 'left') {
  const block = createBlock('heading', genId);
  block.data = { ...block.data, level, text, numbered, hAlign };
  return block;
}

/** Build a paragraph block from spans (plus alignment/indent defaults). */
function paragraph(spans, hAlign = 'left', indentLevel = 0) {
  const block = createBlock('paragraph', genId);
  block.data = { ...block.data, spans, hAlign, indentLevel };
  return block;
}

/** A document containing exactly the given blocks (envelope untouched). */
function docWith(blocks) {
  const doc = newDoc();
  doc.blocks = blocks;
  return doc;
}

/** Render a document to PDF bytes (async helper). */
const render = (doc) => renderDocPdfBytes(doc);

// ── PDF text extraction (same proven approach as verify_p02_m4 / p04_m3) ───
const latin1 = (bytes) => Buffer.from(bytes).toString('latin1');

function inflateStreams(bytes) {
  const text = latin1(bytes);
  const out = [];
  const re = /\bstream\r?\n/g;
  let m;
  while ((m = re.exec(text)) !== null) {
    const start = m.index + m[0].length;
    const end = text.indexOf('endstream', start);
    if (end === -1) break;
    try {
      out.push(zlib.inflateSync(bytes.subarray(start, end)).toString('latin1'));
    } catch {
      /* not a Flate stream (or padding) — skip */
    }
    re.lastIndex = end;
  }
  return out.join('\n');
}

function extractedText(bytes) {
  const content = inflateStreams(bytes);
  const strings = [];
  const tjRe = /\[((?:<[0-9A-Fa-f]+>|\s|[-\d.])+)\]\s*TJ/g;
  let m;
  while ((m = tjRe.exec(content)) !== null) {
    const runs = m[1].match(/<[0-9A-Fa-f]+>/g) || [];
    strings.push(runs.map((r) => Buffer.from(r.slice(1, -1), 'hex').toString('latin1')).join(''));
  }
  const tjLiteralRe = /\(((?:[^()\\]|\\.)*)\)\s*Tj/g;
  while ((m = tjLiteralRe.exec(content)) !== null) {
    strings.push(m[1].replace(/\\([()\\])/g, '$1'));
  }
  return strings.join('\n');
}

// ═══════════════════════════════════════════════════════════════════════════
// 1–2. Heading numbering engine (§10.1)
// ═══════════════════════════════════════════════════════════════════════════

await test('1. numbering: only numbered headings participate; plain headings are skipped entirely', () => {
  const blocks = [
    heading(1, 'Scope', true),
    heading(2, 'Method', true),
    heading(1, 'Plain section', false), // skipped: consumes nothing, resets nothing
    heading(2, 'After plain', true), // continues the numbered sequence
  ];
  const map = computeHeadingNumbering(blocks);
  assert.equal(map.get(blocks[0].id), '1');
  assert.equal(map.get(blocks[1].id), '1.1');
  assert.equal(map.has(blocks[2].id), false, 'plain heading must have no prefix');
  assert.equal(map.get(blocks[3].id), '1.2', 'plain heading must not reset subordinate levels');
});

await test('2. numbering: level L increments L and resets deeper levels; zero segments omitted', () => {
  const blocks = [
    heading(1, 'One', true),
    heading(2, 'One-One', true),
    heading(3, 'One-One-One', true),
    heading(4, 'Deep', true),
    heading(2, 'One-Two', true), // increments L2, resets L3/L4
    heading(1, 'Two', true), // increments L1, resets L2..L4
    heading(3, 'Skip-H2', true), // zero L2 segment omitted → "2.1"
  ];
  const map = computeHeadingNumbering(blocks);
  assert.deepEqual(
    blocks.map((b) => map.get(b.id)),
    ['1', '1.1', '1.1.1', '1.1.1.1', '1.2', '2', '2.1'],
  );
});

await test('3. numbering: separator is two non-breaking spaces; determinism holds', () => {
  assert.equal(HEADING_PREFIX_SEPARATOR, '\u00A0\u00A0');
  const blocks = [heading(1, 'A', true), heading(2, 'B', true)];
  const first = computeHeadingNumbering(blocks);
  const second = computeHeadingNumbering(blocks);
  assert.deepEqual([...first.entries()], [...second.entries()], 'same input must yield same map');
});

await test('4. numbering: the block list is never mutated (purity)', () => {
  const blocks = [
    heading(1, 'A', true),
    heading(2, 'B', true),
    heading(1, 'Plain', false),
  ];
  const before = JSON.stringify(blocks);
  computeHeadingNumbering(blocks);
  assert.equal(JSON.stringify(blocks), before, 'computeHeadingNumbering mutated its input');
});

// ═══════════════════════════════════════════════════════════════════════════
// 5–13. Inline span algebra and sanitizers (§10.2)
// ═══════════════════════════════════════════════════════════════════════════

await test('5. plain-text projection: spansToPlainText / plainTextToSpans round-trip', () => {
  const spans = [{ text: 'Hello ' }, { text: 'world', bold: true }];
  assert.equal(spansToPlainText(spans), 'Hello world');
  assert.deepEqual(plainTextToSpans('Hello world'), [{ text: 'Hello world' }]);
  assert.deepEqual(plainTextToSpans(''), [], 'empty text is an empty span list');
});

await test('6. normalizeHexColor: canonicalises #RGB/#RRGGBB/#RRGGBBAA, rejects everything else', () => {
  assert.equal(normalizeHexColor('#ABC'), '#aabbcc', '3-digit expands');
  assert.equal(normalizeHexColor('ABC'), '#aabbcc', 'leading # optional');
  assert.equal(normalizeHexColor('#1A2b3C'), '#1a2b3c', 'case-insensitive');
  assert.equal(normalizeHexColor('#1a2b3c80'), '#1a2b3c80', '8-digit alpha kept');
  assert.equal(normalizeHexColor('red'), null, 'named colours rejected');
  assert.equal(normalizeHexColor('rgb(0,0,0)'), null, 'rgb() rejected');
  assert.equal(normalizeHexColor('#12'), null, 'wrong length rejected');
  assert.equal(normalizeHexColor('#gggggg'), null, 'non-hex digits rejected');
  assert.equal(normalizeHexColor(42), null, 'non-strings rejected');
});

await test("7. validateColorPatch: null/undefined/'' clears; invalid returns invalid-color", () => {
  assert.deepEqual(validateColorPatch(null), { ok: true, color: null });
  assert.deepEqual(validateColorPatch(undefined), { ok: true, color: null });
  assert.deepEqual(validateColorPatch(''), { ok: true, color: null });
  assert.deepEqual(validateColorPatch('#C0392B'), { ok: true, color: '#c0392b' });
  const bad = validateColorPatch('chartreuse-ish');
  assert.equal(bad.ok, false);
  assert.equal(bad.code, 'invalid-color');
});

await test('8. sanitizeHref: https/http/mailto kept; bare host becomes https; unsafe schemes rejected', () => {
  assert.equal(sanitizeHref('https://example.org/a'), 'https://example.org/a');
  assert.equal(sanitizeHref('HTTP://EXAMPLE.ORG'), 'http://example.org/', 'canonicalised to lowercase scheme+host');
  assert.equal(sanitizeHref('mailto:lab@example.org'), 'mailto:lab@example.org');
  assert.equal(sanitizeHref('example.org/doc'), 'https://example.org/doc', 'bare host → https');
  assert.equal(sanitizeHref('www.example.org'), 'https://www.example.org/');
  assert.equal(sanitizeHref('javascript:alert(1)'), null, 'javascript: rejected');
  assert.equal(sanitizeHref('JavaScript:alert(1)'), null, 'mixed-case javascript: rejected');
  assert.equal(sanitizeHref('data:text/html;base64,AAAA'), null, 'data: rejected');
  assert.equal(sanitizeHref('vbscript:msgbox'), null, 'vbscript: rejected');
  assert.equal(sanitizeHref('file:///etc/passwd'), null, 'file: rejected');
  assert.equal(sanitizeHref('https://example.org/\nX-Injected: 1'), null, 'control chars rejected');
  assert.equal(sanitizeHref('  '), null, 'empty clears');
  assert.equal(sanitizeHref(null), null, 'non-strings rejected');
});

await test('9. normalizeSpans: drops empty runs, merges neighbours, removes unsafe hrefs/colours', () => {
  const messy = [
    { text: 'a' },
    { text: 'b' }, // merges with previous (same style)
    { text: '' }, // dropped
    { text: 'c', bold: false }, // false flag not stored → same style → merges
    { text: 'd', href: 'javascript:alert(1)' }, // unsafe href REMOVED → merges
    { text: 'e', color: 'not-a-color' }, // malformed colour dropped → merges
    { text: 'f', bold: true },
    { text: 'g', bold: true }, // merges with previous (same style)
  ];
  assert.deepEqual(normalizeSpans(messy), [
    { text: 'abcde' }, // 'a'+'b'+'c'+'d'+'e' all plain after sanitisation
    { text: 'fg', bold: true },
  ]);
});

await test('10. applySpanFormatting: sets and removes one flag over a range, splitting and merging runs', () => {
  const spans = [{ text: 'Hello world' }];
  const bolded = applySpanFormatting(spans, { start: 0, end: 5 }, 'bold', true);
  assert.deepEqual(bolded, [{ text: 'Hello', bold: true }, { text: ' world' }]);
  // Toggle OFF only inside the range; the rest keeps its style.
  const cleared = applySpanFormatting(bolded, { start: 0, end: 5 }, 'bold', false);
  assert.deepEqual(cleared, [{ text: 'Hello world' }]);
  // Empty range and unknown flags are rejected, never silently applied.
  assert.equal(applySpanFormatting(spans, { start: 2, end: 2 }, 'bold', true).code, 'invalid-range');
  assert.equal(applySpanFormatting(spans, { start: 0, end: 3 }, 'blink', true).code, 'invalid-style');
});

await test('11. applySpanLink: sanitises the target; unsafe link rejected; null clears', () => {
  const spans = [{ text: 'ISO 17025 guide' }];
  const linked = applySpanLink(spans, { start: 0, end: 4 }, 'example.org/iso');
  assert.deepEqual(linked, [
    { text: 'ISO ', href: 'https://example.org/iso' }, // range [0,4) = "ISO "
    { text: '17025 guide' },
  ]);
  const bad = applySpanLink(spans, { start: 0, end: 4 }, 'javascript:alert(1)');
  assert.equal(bad.ok, false);
  assert.equal(bad.code, 'invalid-href');
  const cleared = applySpanLink(linked, { start: 0, end: 4 }, null);
  assert.deepEqual(cleared, [{ text: 'ISO 17025 guide' }], 'null clears the link');
});

await test('12. applySpanColor: colour and highlight over a range; invalid rejected; null clears', () => {
  const spans = [{ text: 'Warning text' }];
  const coloured = applySpanColor(spans, { start: 0, end: 7 }, 'color', '#C0392B');
  assert.deepEqual(coloured, [
    { text: 'Warning', color: '#c0392b' },
    { text: ' text' },
  ]);
  const marked = applySpanColor(coloured, { start: 0, end: 7 }, 'highlight', '#F9E79F');
  assert.deepEqual(marked[0], { text: 'Warning', color: '#c0392b', highlight: '#f9e79f' });
  const bad = applySpanColor(spans, { start: 0, end: 4 }, 'color', 'chartreuse');
  assert.equal(bad.ok, false);
  assert.equal(bad.code, 'invalid-color');
  const cleared = applySpanColor(marked, { start: 0, end: 7 }, 'color', null);
  assert.equal(cleared[0].color, undefined, 'null clears the colour');
  assert.equal(cleared[0].highlight, '#f9e79f', 'other properties preserved');
});

await test('13. clearSpanFormatting: removes all style from the range, text verbatim', () => {
  const spans = [
    { text: 'plain ', },
    { text: 'styled', bold: true, italic: true, underline: true, strikethrough: true, color: '#c0392b', highlight: '#f9e79f', href: 'https://example.org' },
  ];
  const cleared = clearSpanFormatting(spans, { start: 0, end: 12 });
  assert.deepEqual(cleared, [{ text: 'plain styled' }]);
  assert.equal(spansToPlainText(cleared), 'plain styled', 'text must never be lost');
});

await test('14. isFlagActiveOverRange / hrefOverRange: toolbar state reflects the DATA', () => {
  const spans = [{ text: 'bold', bold: true }, { text: ' plain' }];
  assert.equal(isFlagActiveOverRange(spans, { start: 0, end: 4 }, 'bold'), true);
  assert.equal(isFlagActiveOverRange(spans, { start: 0, end: 10 }, 'bold'), false, 'mixed range is not active');
  assert.equal(isFlagActiveOverRange(spans, { start: 0, end: 0 }, 'bold'), false, 'empty range is not active');
  const linked = [{ text: 'a', href: 'https://example.org' }, { text: 'b' }];
  assert.equal(hrefOverRange(linked, { start: 0, end: 1 }), 'https://example.org');
  assert.equal(hrefOverRange(linked, { start: 0, end: 2 }), null, 'mixed hrefs are not uniform');
});

await test('15. remapSpansAfterTextEdit: typing preserves untouched formatting; inserted text is unstyled', () => {
  const spans = [{ text: 'Hello', bold: true }, { text: ' world' }];
  // Insert in the middle: common prefix "Hello ", common suffix " world".
  const typed = remapSpansAfterTextEdit(spans, 'Hello brave world');
  assert.equal(spansToPlainText(typed), 'Hello brave world');
  assert.deepEqual(typed, [
    { text: 'Hello', bold: true },
    // " brave" (inserted, unstyled) merges with the plain tail run.
    { text: ' brave world' },
  ]);
  // Deletion keeps formatting of what remains.
  const deleted = remapSpansAfterTextEdit(spans, 'Hello');
  assert.deepEqual(deleted, [{ text: 'Hello', bold: true }]);
  // Replacement behaves identically to insert+delete.
  const replaced = remapSpansAfterTextEdit(spans, 'Hi world');
  assert.equal(spansToPlainText(replaced), 'Hi world');
  // Same text is a normalising no-op.
  assert.deepEqual(remapSpansAfterTextEdit(spans, 'Hello world'), normalizeSpans(spans));
});

// ═══════════════════════════════════════════════════════════════════════════
// 16–19. Heading content actions (§10.1)
// ═══════════════════════════════════════════════════════════════════════════

await test('16. updateHeadingContent: commits level/text/numbered/hAlign; stamps modifiedAt', () => {
  const h = heading(2, 'Old title');
  const doc = docWith([h]);
  const before = snap(doc);
  const result = updateHeadingContent(doc, h.id, { level: 3, text: 'New title', numbered: true, hAlign: 'center' }, opts());
  assert.equal(result.ok, true);
  assert.equal(result.changed, true);
  assert.equal(result.blockId, h.id);
  assert.equal(result.doc.blocks[0].data.level, 3);
  assert.equal(result.doc.blocks[0].data.text, 'New title');
  assert.equal(result.doc.blocks[0].data.numbered, true);
  assert.equal(result.doc.blocks[0].data.hAlign, 'center');
  assert.equal(result.doc.metadata.modifiedAt, T0, 'modifiedAt stamped');
  assert.equal(snap(doc), before, 'source document must not be mutated');
  assert.notEqual(result.doc, doc, 'a real change returns a NEW document');
});

await test('17. updateHeadingContent: validation failures use deterministic codes; document untouched', () => {
  const h = heading(2, 'Title');
  const doc = docWith([h]);
  const before = snap(doc);
  const cases = [
    [{ level: 5 }, 'invalid-level'],
    [{ level: 0 }, 'invalid-level'],
    [{ level: '2' }, 'invalid-level'],
    [{ text: 42 }, 'invalid-text'],
    [{ numbered: 'yes' }, 'invalid-numbered'],
    [{ hAlign: 'justify' }, 'invalid-alignment'],
    [{ hAlign: 'middle' }, 'invalid-alignment'],
  ];
  for (const [patch, code] of cases) {
    const result = updateHeadingContent(doc, h.id, patch, opts());
    assert.equal(result.ok, false, `expected rejection for ${JSON.stringify(patch)}`);
    assert.equal(result.code, code, `expected ${code} for ${JSON.stringify(patch)}`);
    assert.equal(typeof result.message, 'string');
    assert.ok(result.message.length > 0, 'rejection must carry an understandable message');
  }
  const missing = updateHeadingContent(doc, genId(), { text: 'x' }, opts());
  assert.equal(missing.code, 'missing-block');
  // A paragraph id in the SAME document is not a heading.
  const para = paragraph([{ text: 'p' }]);
  const mixed = docWith([h, para]);
  const wrongType = updateHeadingContent(mixed, para.id, { text: 'x' }, opts());
  assert.equal(wrongType.code, 'not-a-heading');
  assert.equal(snap(doc), before, 'rejected patches must leave the document untouched');
});

await test('18. updateHeadingContent: same-value patch is a same-reference no-op (no false Modified)', () => {
  const h = heading(3, 'Stable', true, 'right');
  const doc = docWith([h]);
  const before = snap(doc);
  const result = updateHeadingContent(doc, h.id, { level: 3, text: 'Stable', numbered: true, hAlign: 'right' }, opts());
  assert.equal(result.ok, true);
  assert.equal(result.changed, false);
  assert.equal(result.doc, doc, 'no-op must return the SAME document reference');
  assert.equal(snap(doc), before);
});

await test('19. updateHeadingContent: only the target block changes; identity/spacing/order preserved', () => {
  const first = heading(1, 'First', true);
  const target = heading(2, 'Target');
  const last = heading(3, 'Last');
  const doc = docWith([first, target, last]);
  const result = updateHeadingContent(doc, target.id, { text: 'Edited' }, opts());
  assert.equal(result.doc.blocks[0], first, 'other blocks keep reference equality');
  assert.equal(result.doc.blocks[2], last, 'other blocks keep reference equality');
  assert.equal(result.doc.blocks[1].id, target.id, 'block identity preserved');
  assert.deepEqual(result.doc.blocks[1].spacing, target.spacing, 'spacing copied verbatim');
  assert.equal(result.doc.blocks[1].data.text, 'Edited');
  assert.equal(result.doc.blocks[1].data.level, 2, 'unlisted fields untouched');
});

// ═══════════════════════════════════════════════════════════════════════════
// 20–23. Paragraph content actions (§10.2)
// ═══════════════════════════════════════════════════════════════════════════

await test('20. updateParagraphContent: commits spans/hAlign/indentLevel; stamps modifiedAt', () => {
  const p = paragraph([{ text: 'plain' }]);
  const doc = docWith([p]);
  const before = snap(doc);
  const result = updateParagraphContent(
    doc,
    p.id,
    { spans: [{ text: 'bold', bold: true }], hAlign: 'justify', indentLevel: 2 },
    opts(),
  );
  assert.equal(result.ok, true);
  assert.equal(result.changed, true);
  assert.deepEqual(result.doc.blocks[0].data.spans, [{ text: 'bold', bold: true }]);
  assert.equal(result.doc.blocks[0].data.hAlign, 'justify', 'paragraph alignment supports justify');
  assert.equal(result.doc.blocks[0].data.indentLevel, 2);
  assert.equal(result.doc.metadata.modifiedAt, T0);
  assert.equal(snap(doc), before, 'source document must not be mutated');
});

await test('21. updateParagraphContent: validation failures use deterministic codes; document untouched', () => {
  const p = paragraph([{ text: 'text' }]);
  const doc = docWith([p]);
  const before = snap(doc);
  const cases = [
    [{ spans: 'not-an-array' }, 'invalid-spans'],
    [{ hAlign: 'middle' }, 'invalid-alignment'],
    [{ indentLevel: -1 }, 'invalid-indent'],
    [{ indentLevel: MAX_PARAGRAPH_INDENT + 1 }, 'invalid-indent'],
    [{ indentLevel: 1.5 }, 'invalid-indent'],
    [{ indentLevel: '2' }, 'invalid-indent'],
  ];
  for (const [patch, code] of cases) {
    const result = updateParagraphContent(doc, p.id, patch, opts());
    assert.equal(result.ok, false, `expected rejection for ${JSON.stringify(patch)}`);
    assert.equal(result.code, code, `expected ${code} for ${JSON.stringify(patch)}`);
    assert.ok(result.message.length > 0, 'rejection must carry an understandable message');
  }
  const missing = updateParagraphContent(doc, genId(), { hAlign: 'center' }, opts());
  assert.equal(missing.code, 'missing-block');
  // A heading id in the SAME document is not a paragraph.
  const head = heading(1, 'H');
  const mixed = docWith([p, head]);
  const wrongType = updateParagraphContent(mixed, head.id, { hAlign: 'center' }, opts());
  assert.equal(wrongType.code, 'not-a-paragraph');
  assert.equal(snap(doc), before, 'rejected patches must leave the document untouched');
});

await test('22. updateParagraphContent: boundary sanitisation — unsafe href/colour in the PATCH is sanitised, never stored', () => {
  const p = paragraph([{ text: 'clean' }]);
  const doc = docWith([p]);
  const result = updateParagraphContent(
    doc,
    p.id,
    {
      spans: [
        { text: 'evil', href: 'javascript:alert(1)' }, // must be removed at the boundary
        { text: 'ok', href: 'example.org/spec' }, // must be canonicalised
        { text: 'bad', color: 'chartreuse' }, // must be dropped
      ],
    },
    opts(),
  );
  assert.equal(result.ok, true);
  assert.deepEqual(result.doc.blocks[0].data.spans, [
    { text: 'evil' },
    { text: 'ok', href: 'https://example.org/spec' },
    { text: 'bad' },
  ]);
});

await test('23. updateParagraphContent: same-value patch is a same-reference no-op', () => {
  const spans = [{ text: 'stable', bold: true }];
  const p = paragraph(spans, 'center', 3);
  const doc = docWith([p]);
  const before = snap(doc);
  const result = updateParagraphContent(doc, p.id, { hAlign: 'center', indentLevel: 3, spans }, opts());
  assert.equal(result.ok, true);
  assert.equal(result.changed, false);
  assert.equal(result.doc, doc, 'no-op must return the SAME document reference');
  assert.equal(snap(doc), before);
});

// ═══════════════════════════════════════════════════════════════════════════
// 24. Serialization round-trip with formatted content
// ═══════════════════════════════════════════════════════════════════════════

await test('24. persistence: formatted spans + numbered headings survive serialize → deserialize unchanged', () => {
  const h1 = heading(1, 'Scope', true);
  const h2 = heading(2, 'Method', true);
  const p = paragraph([
    { text: 'All laboratories shall ', bold: true },
    { text: 'demonstrate ', italic: true, underline: true },
    { text: 'traceability', strikethrough: true, color: '#c0392b', highlight: '#f9e79f' },
    { text: 'per ', },
    { text: 'ISO/IEC 17025', href: 'https://www.iso.org/standard/66912.html' },
  ], 'justify', 1);
  const doc = docWith([h1, h2, p]);
  const json = serializeDocument(doc);
  const reopened = deserializeDocument(json);
  assert.deepEqual(reopened.blocks, doc.blocks, 'formatted content must round-trip verbatim');
  // And the numbering engine agrees after the round-trip.
  assert.deepEqual(
    [...computeHeadingNumbering(reopened.blocks).entries()],
    [...computeHeadingNumbering(doc.blocks).entries()],
  );
});

// ═══════════════════════════════════════════════════════════════════════════
// 25–27. Renderer: numbering + formatting + byte-safe baseline
// ═══════════════════════════════════════════════════════════════════════════

await test('25. renderer: heading numbering prefixes appear in the rendered PDF text', async () => {
  const doc = docWith([
    heading(1, 'Scope of the method', true),
    heading(2, 'Principle', true),
    heading(1, 'Reagents', true),
    heading(2, 'Buffer preparation', true),
    heading(1, 'Plain appendix', false),
  ]);
  const bytes = await render(doc);
  assert.equal(latin1(bytes).startsWith('%PDF-'), true);
  // The NBSP separator forms its own TJ run, so the prefix and the heading
  // text arrive as separate extracted lines — strip the run boundaries and
  // compare the exact prefix+separator+text sequence.
  const text = extractedText(bytes).replace(/\n/g, '');
  assert.ok(text.includes(`1${HEADING_PREFIX_SEPARATOR}Scope of the method`), 'H1 "1" prefix present');
  assert.ok(text.includes(`1.1${HEADING_PREFIX_SEPARATOR}Principle`), 'H2 "1.1" prefix present');
  assert.ok(text.includes(`2${HEADING_PREFIX_SEPARATOR}Reagents`), 'second H1 "2" prefix present');
  assert.ok(text.includes(`2.1${HEADING_PREFIX_SEPARATOR}Buffer preparation`), 'reset H2 "2.1" prefix present');
  assert.ok(text.includes('Plain appendix'), 'plain heading text present');
  assert.equal(text.includes(`3${HEADING_PREFIX_SEPARATOR}Plain appendix`), false, 'plain heading has NO prefix');
});

await test('26. renderer: paragraph strikethrough/colour/highlight/link are applied to the output', async () => {
  const p = paragraph([
    { text: 'risk-based ', strikethrough: true, color: '#c0392b', highlight: '#f9e79f' },
    { text: 'sampling', href: 'https://example.org/sampling' },
  ]);
  const bytes = await render(docWith([p]));
  const raw = latin1(bytes);
  const text = extractedText(bytes);
  assert.ok(text.includes('risk-based'), 'strikethrough text still extracts');
  assert.ok(text.includes('sampling'), 'linked text still extracts');
  // The link target is emitted as a PDF URI annotation.
  assert.ok(raw.includes('/URI'), 'link annotation present');
  assert.ok(raw.includes('https://example.org/sampling'), 'link URI matches the sanitised target');
  // The colour #c0392b (192,57,43) appears as a DeviceRGB scn operator
  // (react-pdf uses scn with full float precision, not rg).
  assert.ok(
    /0\.75294\d*\s+0\.22352\d*\s+0\.16862\d*\s+scn/.test(inflateStreams(bytes)),
    'font colour scn operator present',
  );
});

await test('27. renderer: P02-M4 PoC fixture remains BYTE-IDENTICAL (renderer additions are deviation-only)', async () => {
  const baseline = readFileSync(path.join(root, 'fixtures', 'p02-m4', 'renderer-poc-output.pdf'));
  const bytes = await render(buildPocFixture());
  assert.equal(Buffer.compare(Buffer.from(bytes), baseline), 0, 'PoC fixture render must match the committed baseline byte-for-byte');
});

// ── Summary ─────────────────────────────────────────────────────────────────
console.log(`\n${passed} passed, ${failed.length} failed`);
if (failed.length > 0) process.exitCode = 1;
