/**
 * P04-M1 — Page Setup & Typography verification
 * ═══════════════════════════════════════════════════════════════════════════
 * Compiles the REAL pure services (`services/page-typography.ts`,
 * `services/typography-tokens.ts`, `services/document-actions.ts`,
 * `services/document-file.ts`) to CommonJS in a temp dir and exercises them
 * in Node with `node:assert/strict`.  No test framework is introduced.
 *
 * Covers (task §5): defaults; every size × orientation; normal/narrow/wide/
 * custom margins; validation of invalid custom margins and typography
 * values; base font size + derived heading scale; line spacing, paragraph
 * spacing and fallback updates; immutability/unrelated-field preservation;
 * no-op updates and dirty-state; `.docstudio` round-trip; Reset Settings;
 * display-header preference vs. front page; duplication.
 *
 * Usage: node verify_p04_m1.mjs   (or: npm run verify:p04-m1)
 */

import { execSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';

const require = createRequire(import.meta.url);
const root = path.dirname(new URL(import.meta.url).pathname.replace(/^\//, ''));

// ── Compile the real modules to CommonJS in a temp dir ──────────────────────
const outDir = mkdtempSync(path.join(tmpdir(), 'ds-p04-m1-'));
execSync(
  'npx tsc src/services/page-typography.ts src/services/typography-tokens.ts' +
    ' src/services/document-actions.ts src/services/document-file.ts' +
    ' src/types/document.ts src/types/defaults.ts src/types/blocks.ts src/types/index.ts' +
    ` --outDir "${outDir}" --module commonjs --target es2020 --moduleResolution node --esModuleInterop --skipLibCheck`,
  { cwd: root, stdio: 'inherit' },
);

const pt = require(path.join(outDir, 'services', 'page-typography.js'));
const tokens = require(path.join(outDir, 'services', 'typography-tokens.js'));
const actions = require(path.join(outDir, 'services', 'document-actions.js'));
const file = require(path.join(outDir, 'services', 'document-file.js'));
const defaults = require(path.join(outDir, 'types', 'defaults.js'));

const {
  PAGE_DIMENSIONS_MM,
  MARGIN_PRESETS_MM,
  MIN_USABLE_CONTENT_MM,
  SUPPORTED_PAGE_SIZES,
  SUPPORTED_ORIENTATIONS,
  SUPPORTED_MARGIN_PRESETS,
  FONT_SIZE_PT_RANGE,
  LINE_HEIGHT_RANGE,
  PARAGRAPH_SPACING_PT_RANGE,
  effectivePageDimensionsMm,
  parseNumberDraft,
  updatePageSetup,
  updateTypography,
  updateDisplayHeader,
} = pt;
const { HEADING_SCALE_FACTORS, deriveHeadingSizesPt, DEFAULT_BASE_FONT_SIZE_PT } = tokens;
const { duplicateDocument, resetDocumentSettings, sessionFingerprint, isDirty } = actions;
const { serializeDocument, deserializeDocument, validateDocument } = file;
const { createDefaultDocument } = defaults;

// ── Test runner (same style as the P02/P03 suites) ──────────────────────────
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
const T0 = '2026-10-16T10:00:00.000Z';
const T1 = '2026-10-16T11:00:00.000Z';
const newDoc = () => createDefaultDocument('doc-p04-m1', T0);

// ═══════════════════════════════════════════════════════════════════════════
// 1. Default page setup and typography values
// ═══════════════════════════════════════════════════════════════════════════
await test('1. defaults match the documented specification', () => {
  const doc = newDoc();
  assert.deepEqual(doc.pageSetup, {
    size: 'A4',
    orientation: 'portrait',
    margins: { preset: 'normal', topMm: 25, bottomMm: 25, leftMm: 25, rightMm: 25 },
  });
  assert.equal(doc.pageTypography.bodyThemeId, 'classic-formal');
  assert.equal(doc.pageTypography.monochrome, false);
  assert.equal(doc.pageTypography.displayHeader, true);
  assert.deepEqual(doc.pageTypography.typography, {
    fontFamily: 'Segoe UI',
    fontFallbacks: ['system-ui', 'Arial', 'sans-serif'],
    baseFontSizePt: 11,
    lineHeight: 1.5,
    paragraphSpacingPt: 6,
  });
  // Documented constants
  assert.deepEqual({ ...MARGIN_PRESETS_MM }, { normal: 25, narrow: 12.7, wide: 38.1 });
  assert.deepEqual([...SUPPORTED_PAGE_SIZES], ['A4', 'A3', 'A5', 'Letter', 'Legal']);
  assert.deepEqual([...SUPPORTED_ORIENTATIONS], ['portrait', 'landscape']);
  assert.deepEqual([...SUPPORTED_MARGIN_PRESETS], ['normal', 'narrow', 'wide', 'custom']);
  assert.equal(MIN_USABLE_CONTENT_MM, 50);
  assert.equal(DEFAULT_BASE_FONT_SIZE_PT, 11);
  validateDocument(doc); // still schema-valid by construction
});

// ═══════════════════════════════════════════════════════════════════════════
// 2. Every supported page size and orientation
// ═══════════════════════════════════════════════════════════════════════════
await test('2. all five sizes and both orientations apply; geometry helpers agree', () => {
  const expected = {
    A4: [210, 297],
    A3: [297, 420],
    A5: [148, 210],
    Letter: [215.9, 279.4],
    Legal: [215.9, 355.6],
  };
  for (const size of SUPPORTED_PAGE_SIZES) {
    for (const orientation of SUPPORTED_ORIENTATIONS) {
      let doc = newDoc();
      const rSize = updatePageSetup(doc, { field: 'size', size }, T1);
      assert.equal(rSize.ok, true);
      assert.equal(rSize.doc.pageSetup.size, size);
      const rOrient = updatePageSetup(rSize.doc, { field: 'orientation', orientation }, T1);
      assert.equal(rOrient.ok, true);
      assert.equal(rOrient.doc.pageSetup.orientation, orientation);
      const [w, h] = expected[size];
      assert.deepEqual([...effectivePageDimensionsMm(size, orientation)], orientation === 'landscape' ? [h, w] : [w, h]);
      // Margins, typography and every other field survive both edits.
      assert.equal(rOrient.doc.pageSetup.margins.preset, 'normal');
      assert.deepEqual(rOrient.doc.pageTypography.typography, doc.pageTypography.typography);
    }
  }
  // Runtime guard: junk sizes are rejected, not committed.
  const bad = updatePageSetup(newDoc(), { field: 'size', size: 'B5' }, T1);
  assert.equal(bad.ok, false);
  assert.equal(bad.code, 'unknown-size');
  const badOrient = updatePageSetup(newDoc(), { field: 'orientation', orientation: 'sideways' }, T1);
  assert.equal(badOrient.ok, false);
  assert.equal(badOrient.code, 'unknown-orientation');
});

// ═══════════════════════════════════════════════════════════════════════════
// 3. Normal, narrow, wide and custom margins
// ═══════════════════════════════════════════════════════════════════════════
await test('3. margin presets write documented values; custom stays associated', () => {
  let doc = newDoc();
  for (const preset of ['narrow', 'wide', 'normal']) {
    const r = updatePageSetup(doc, { field: 'marginPreset', preset }, T1);
    assert.equal(r.ok, true);
    assert.equal(r.doc.pageSetup.margins.preset, preset);
    const v = MARGIN_PRESETS_MM[preset];
    assert.deepEqual(
      [r.doc.pageSetup.margins.topMm, r.doc.pageSetup.margins.bottomMm, r.doc.pageSetup.margins.leftMm, r.doc.pageSetup.margins.rightMm],
      [v, v, v, v],
    );
    doc = r.doc;
  }
  // Custom from the current stored values, then edited values are authoritative.
  const toCustom = updatePageSetup(doc, { field: 'marginPreset', preset: 'custom' }, T1);
  assert.equal(toCustom.ok, true);
  assert.equal(toCustom.doc.pageSetup.margins.preset, 'custom');
  assert.equal(toCustom.doc.pageSetup.margins.topMm, 25); // kept from normal
  const custom = updatePageSetup(
    toCustom.doc,
    { field: 'customMargins', topMm: 15, bottomMm: 18, leftMm: 20, rightMm: 12 },
    T1,
  );
  assert.equal(custom.ok, true);
  assert.equal(custom.doc.pageSetup.margins.preset, 'custom');
  assert.deepEqual(
    [custom.doc.pageSetup.margins.topMm, custom.doc.pageSetup.margins.bottomMm, custom.doc.pageSetup.margins.leftMm, custom.doc.pageSetup.margins.rightMm],
    [15, 18, 20, 12],
  );
  // Unrelated edits must not lose the custom values.
  const sizeEdit = updatePageSetup(custom.doc, { field: 'size', size: 'A3' }, T1);
  assert.deepEqual(sizeEdit.doc.pageSetup.margins, custom.doc.pageSetup.margins);
  const typoEdit = updateTypography(sizeEdit.doc, { field: 'baseFontSizePt', value: 12 }, T1);
  assert.deepEqual(typoEdit.doc.pageSetup.margins, custom.doc.pageSetup.margins);
  // Switching back to a named preset overwrites with the preset values.
  const back = updatePageSetup(typoEdit.doc, { field: 'marginPreset', preset: 'wide' }, T1);
  assert.equal(back.doc.pageSetup.margins.topMm, MARGIN_PRESETS_MM.wide);
  const badPreset = updatePageSetup(newDoc(), { field: 'marginPreset', preset: 'gigantic' }, T1);
  assert.equal(badPreset.ok, false);
  assert.equal(badPreset.code, 'unknown-preset');
});

// ═══════════════════════════════════════════════════════════════════════════
// 4. Validation for invalid custom margins and typography values
// ═══════════════════════════════════════════════════════════════════════════
await test('4. invalid margins/typography are rejected with codes and no changes', () => {
  const doc = newDoc();
  const before = JSON.parse(JSON.stringify(doc));
  const marginCases = [
    [{ field: 'customMargins', topMm: NaN, bottomMm: 20, leftMm: 20, rightMm: 20 }, 'invalid-number'],
    [{ field: 'customMargins', topMm: 20, bottomMm: 20, leftMm: Infinity, rightMm: 20 }, 'invalid-number'],
    [{ field: 'customMargins', topMm: -1, bottomMm: 20, leftMm: 20, rightMm: 20 }, 'negative-margin'],
    // A5 is 148 × 210 mm portrait: 100 + 100 leaves < 50 mm usable width.
    [{ field: 'customMargins', topMm: 20, bottomMm: 20, leftMm: 100, rightMm: 100 }, 'no-usable-page-area'],
    // 200 mm top on A4 portrait leaves < 50 mm usable height.
    [{ field: 'customMargins', topMm: 200, bottomMm: 20, leftMm: 20, rightMm: 20 }, 'no-usable-page-area'],
  ];
  let small = updatePageSetup(doc, { field: 'size', size: 'A5' }, T1).doc;
  for (const [patch, code] of marginCases) {
    const r = updatePageSetup(small, patch, T1);
    assert.equal(r.ok, false, `expected rejection for ${JSON.stringify(patch)}`);
    assert.equal(r.code, code);
    assert.deepEqual(r.doc, undefined, 'a rejected patch never returns a document');
  }
  // Legal-size landscape check: 38.1 mm wide preset still fits (355.6 - 76.2 = 279.4 mm).
  const legal = updatePageSetup(doc, { field: 'size', size: 'Legal' }, T1).doc;
  const wide = updatePageSetup(legal, { field: 'marginPreset', preset: 'wide' }, T1);
  assert.equal(wide.ok, true);

  const typoCases = [
    [{ field: 'baseFontSizePt', value: 5 }, 'out-of-range'],
    [{ field: 'baseFontSizePt', value: 100 }, 'out-of-range'],
    [{ field: 'baseFontSizePt', value: NaN }, 'invalid-number'],
    [{ field: 'lineHeight', value: 0.5 }, 'out-of-range'],
    [{ field: 'lineHeight', value: 4 }, 'out-of-range'],
    [{ field: 'lineHeight', value: NaN }, 'invalid-number'],
    [{ field: 'paragraphSpacingPt', value: -1 }, 'out-of-range'],
    [{ field: 'paragraphSpacingPt', value: 80 }, 'out-of-range'],
    [{ field: 'paragraphSpacingPt', value: NaN }, 'invalid-number'],
    [{ field: 'fontFamily', value: '   ' }, 'empty-font-family'],
    [{ field: 'fontFallbacks', value: ['Arial', ''] }, 'invalid-fallbacks'],
    [{ field: 'fontFallbacks', value: new Array(9).fill('F') }, 'invalid-fallbacks'],
  ];
  for (const [patch, code] of typoCases) {
    const r = updateTypography(doc, patch, T1);
    assert.equal(r.ok, false, `expected rejection for ${JSON.stringify(patch)}`);
    assert.equal(r.code, code);
    assert.deepEqual(r.doc, undefined);
  }
  // Empty/whitespace drafts must NEVER become 0 (Number('') === 0 trap):
  // parseNumberDraft maps them to NaN, which every validator rejects.
  assert.ok(Number.isNaN(parseNumberDraft('')), "Number('') would be 0 — must be NaN");
  assert.ok(Number.isNaN(parseNumberDraft('   ')), 'whitespace-only must be NaN');
  assert.equal(parseNumberDraft(' 12.5 '), 12.5);
  assert.equal(parseNumberDraft('-3.5'), -3.5);
  assert.ok(Number.isNaN(parseNumberDraft('abc')));
  // End-to-end: an emptied paragraph-spacing field is rejected, not stored as 0.
  const emptyPara = updateTypography(doc, { field: 'paragraphSpacingPt', value: parseNumberDraft('') }, T1);
  assert.equal(emptyPara.ok, false);
  assert.equal(emptyPara.code, 'invalid-number');
  const emptyMargin = updatePageSetup(
    doc,
    { field: 'customMargins', topMm: parseNumberDraft(''), bottomMm: 20, leftMm: 20, rightMm: 20 },
    T1,
  );
  assert.equal(emptyMargin.ok, false);
  assert.equal(emptyMargin.code, 'invalid-number');
  // No rejected patch touched anything.
  assert.deepEqual(JSON.parse(JSON.stringify(doc)), before);
  // Range constants are the documented ones.
  assert.deepEqual({ ...FONT_SIZE_PT_RANGE }, { min: 6, max: 72 });
  assert.deepEqual({ ...LINE_HEIGHT_RANGE }, { min: 1.0, max: 3.0 });
  assert.deepEqual({ ...PARAGRAPH_SPACING_PT_RANGE }, { min: 0, max: 72 });
});

// ═══════════════════════════════════════════════════════════════════════════
// 5. Base font size and derived heading scale
// ═══════════════════════════════════════════════════════════════════════════
await test('5. heading scale derives from base size via centralized tokens', () => {
  // Historical PoC steps reproduced exactly at the default base (no output change).
  assert.deepEqual(deriveHeadingSizesPt(11), { 1: 18, 2: 14, 3: 12, 4: 11 });
  for (const base of [9, 10, 11, 12, 14, 16, 18, 24]) {
    const sizes = deriveHeadingSizesPt(base);
    for (const level of [1, 2, 3, 4]) {
      assert.equal(sizes[level], Math.round(base * HEADING_SCALE_FACTORS[level]), `level ${level} at base ${base}`);
    }
    // Monotonic and ordered: H1 > H2 > H3 ≥ H4, all ≥ base except none below H4.
    assert.ok(sizes[1] > sizes[2] && sizes[2] > sizes[3] && sizes[3] >= sizes[4]);
  }
  // A larger base always yields headings ≥ the smaller base's.
  const s11 = deriveHeadingSizesPt(11);
  const s14 = deriveHeadingSizesPt(14);
  for (const level of [1, 2, 3, 4]) assert.ok(s14[level] > s11[level]);
  // Defensive fallback on invalid input.
  assert.deepEqual(deriveHeadingSizesPt(NaN), s11);
  assert.deepEqual(deriveHeadingSizesPt(-5), s11);
  // The configured base itself commits to the document.
  const r = updateTypography(newDoc(), { field: 'baseFontSizePt', value: 14 }, T1);
  assert.equal(r.ok, true);
  assert.equal(r.doc.pageTypography.typography.baseFontSizePt, 14);
  assert.notDeepEqual(deriveHeadingSizesPt(r.doc.pageTypography.typography.baseFontSizePt), s11);
});

// ═══════════════════════════════════════════════════════════════════════════
// 6. Line spacing, paragraph spacing and font fallback updates
// ═══════════════════════════════════════════════════════════════════════════
await test('6. spacing and fallback updates commit without touching siblings', () => {
  let doc = newDoc();
  const r1 = updateTypography(doc, { field: 'lineHeight', value: 1.75 }, T1);
  assert.equal(r1.ok, true);
  assert.equal(r1.doc.pageTypography.typography.lineHeight, 1.75);
  const r2 = updateTypography(r1.doc, { field: 'paragraphSpacingPt', value: 8 }, T1);
  assert.equal(r2.doc.pageTypography.typography.paragraphSpacingPt, 8);
  assert.equal(r2.doc.pageTypography.typography.lineHeight, 1.75);
  const r3 = updateTypography(r2.doc, { field: 'fontFallbacks', value: ['Arial', 'sans-serif'] }, T1);
  assert.deepEqual(r3.doc.pageTypography.typography.fontFallbacks, ['Arial', 'sans-serif']);
  assert.equal(r3.doc.pageTypography.typography.paragraphSpacingPt, 8);
  const r4 = updateTypography(r3.doc, { field: 'fontFamily', value: '  Times New Roman  ' }, T1);
  assert.equal(r4.doc.pageTypography.typography.fontFamily, 'Times New Roman'); // trimmed, not coerced
  assert.deepEqual(r4.doc.pageTypography.typography.fontFallbacks, ['Arial', 'sans-serif']);
  doc = r4.doc;
  // Boundary values are legal.
  assert.equal(updateTypography(doc, { field: 'lineHeight', value: 1.0 }, T1).ok, true);
  assert.equal(updateTypography(doc, { field: 'lineHeight', value: 3.0 }, T1).ok, true);
  assert.equal(updateTypography(doc, { field: 'baseFontSizePt', value: 6 }, T1).ok, true);
  assert.equal(updateTypography(doc, { field: 'baseFontSizePt', value: 72 }, T1).ok, true);
  assert.equal(updateTypography(doc, { field: 'paragraphSpacingPt', value: 0 }, T1).ok, true);
  // Empty fallback list is legal (user may clear fallbacks deliberately).
  const cleared = updateTypography(doc, { field: 'fontFallbacks', value: [] }, T1);
  assert.equal(cleared.ok, true);
  assert.deepEqual(cleared.doc.pageTypography.typography.fontFallbacks, []);
});

// ═══════════════════════════════════════════════════════════════════════════
// 7. Immutable updates and unrelated-field preservation
// ═══════════════════════════════════════════════════════════════════════════
await test('7. updates are immutable and preserve unrelated document state', () => {
  const doc = newDoc();
  doc.blocks.push({
    id: 'blk-1',
    data: { type: 'paragraph', spans: [{ text: 'Body' }] },
  });
  doc.metadata.title = 'P04 Fixture';
  doc.metadata.customFields.push({ id: 'fld-1', label: 'Method', value: 'GC-MS' });
  const snapshot = JSON.parse(JSON.stringify(doc));

  const r = updatePageSetup(doc, { field: 'size', size: 'A3' }, T1);
  assert.equal(r.ok, true);
  // The source was never mutated.
  assert.deepEqual(JSON.parse(JSON.stringify(doc)), snapshot);
  // Only pageSetup (+ modifiedAt) changed in the result.
  const expectedDoc = JSON.parse(JSON.stringify(snapshot));
  expectedDoc.pageSetup.size = 'A3';
  expectedDoc.metadata.modifiedAt = T1;
  assert.deepEqual(JSON.parse(JSON.stringify(r.doc)), expectedDoc);

  const r2 = updateTypography(r.doc, { field: 'lineHeight', value: 2 }, T1);
  const expectedDoc2 = JSON.parse(JSON.stringify(expectedDoc));
  expectedDoc2.pageTypography.typography.lineHeight = 2;
  expectedDoc2.metadata.modifiedAt = T1; // same T1 → equal
  assert.deepEqual(JSON.parse(JSON.stringify(r2.doc)), expectedDoc2);

  // createdAt never changes; assets/labProfile/revisions/trackChanges preserved.
  assert.equal(r2.doc.metadata.createdAt, T0);
  assert.equal(r2.doc.metadata.modifiedAt, T1);
  assert.deepEqual(r2.doc.assets, doc.assets);
  assert.deepEqual(r2.doc.labProfile, doc.labProfile);
  assert.deepEqual(r2.doc.savedRevisions, doc.savedRevisions);
  assert.equal(r2.doc.trackChangesEnabled, doc.trackChangesEnabled);
  assert.deepEqual(r2.doc.frontPage, doc.frontPage);
  assert.deepEqual(r2.doc.headerFooter, doc.headerFooter);
});

// ═══════════════════════════════════════════════════════════════════════════
// 8. No-op updates and dirty-state behavior
// ═══════════════════════════════════════════════════════════════════════════
await test('8. no-op patches return the same reference and create no dirty state', () => {
  // The schema default has the front page ENABLED (§8.4), so the
  // display-header preference is only editable with the cover off — model
  // that state here (the cover toggle UI belongs to P04-M4).
  const fresh = newDoc();
  const doc = { ...fresh, frontPage: { ...fresh.frontPage, enabled: false } };
  const baseline = sessionFingerprint(doc);
  assert.equal(isDirty(baseline, baseline), false);

  const cases = [
    updatePageSetup(doc, { field: 'size', size: 'A4' }, T1),
    updatePageSetup(doc, { field: 'orientation', orientation: 'portrait' }, T1),
    updatePageSetup(doc, { field: 'marginPreset', preset: 'normal' }, T1),
    updateTypography(doc, { field: 'baseFontSizePt', value: 11 }, T1),
    updateTypography(doc, { field: 'lineHeight', value: 1.5 }, T1),
    updateTypography(doc, { field: 'paragraphSpacingPt', value: 6 }, T1),
    updateTypography(doc, { field: 'fontFamily', value: 'Segoe UI' }, T1),
    updateTypography(doc, { field: 'fontFallbacks', value: ['system-ui', 'Arial', 'sans-serif'] }, T1),
    updateDisplayHeader(doc, true, T1),
  ];
  for (const r of cases) {
    assert.equal(r.ok, true);
    assert.equal(r.changed, false, 'expected no-op');
    assert.equal(r.doc, doc, 'same reference → React bails out');
    assert.equal(sessionFingerprint(r.doc), baseline, 'fingerprint unchanged → not dirty');
  }
  // Re-entering the stored custom values is also a no-op.
  const custom = updatePageSetup(doc, { field: 'marginPreset', preset: 'custom' }, T1).doc;
  const sameCustom = updatePageSetup(
    custom,
    { field: 'customMargins', topMm: 25, bottomMm: 25, leftMm: 25, rightMm: 25 },
    T1,
  );
  assert.equal(sameCustom.changed, false);
  // A real change DOES create dirty state and stamps modifiedAt.
  const real = updatePageSetup(doc, { field: 'size', size: 'A5' }, T1);
  assert.equal(real.changed, true);
  assert.notEqual(sessionFingerprint(real.doc), baseline);
  assert.equal(isDirty(sessionFingerprint(real.doc), baseline), true);
  assert.equal(real.doc.metadata.modifiedAt, T1);
});

// ═══════════════════════════════════════════════════════════════════════════
// 9. `.docstudio` serialization preserves every changed setting
// ═══════════════════════════════════════════════════════════════════════════
await test('9. serialize → deserialize round-trips all customized settings', () => {
  let doc = newDoc();
  doc = updatePageSetup(doc, { field: 'size', size: 'Legal' }, T1).doc;
  doc = updatePageSetup(doc, { field: 'orientation', orientation: 'landscape' }, T1).doc;
  doc = updatePageSetup(doc, { field: 'marginPreset', preset: 'custom' }, T1).doc;
  doc = updatePageSetup(doc, { field: 'customMargins', topMm: 12, bottomMm: 12, leftMm: 18, rightMm: 18 }, T1).doc;
  doc = updateTypography(doc, { field: 'fontFamily', value: 'Cambria' }, T1).doc;
  doc = updateTypography(doc, { field: 'fontFallbacks', value: ['Georgia', 'serif'] }, T1).doc;
  doc = updateTypography(doc, { field: 'baseFontSizePt', value: 12.5 }, T1).doc;
  doc = updateTypography(doc, { field: 'lineHeight', value: 1.3 }, T1).doc;
  doc = updateTypography(doc, { field: 'paragraphSpacingPt', value: 4.5 }, T1).doc;
  // Cover off (default is on, §8.4) → the display-header preference is editable.
  doc = { ...doc, frontPage: { ...doc.frontPage, enabled: false } };
  doc = updateDisplayHeader(doc, false, T1).doc;

  const text = serializeDocument(doc);
  const back = deserializeDocument(text);
  assert.deepEqual(back.pageSetup, doc.pageSetup);
  assert.deepEqual(back.pageTypography, doc.pageTypography);
  assert.deepEqual(back, doc); // full document survives the round-trip
  validateDocument(back);
});

// ═══════════════════════════════════════════════════════════════════════════
// 10. Reset Settings restores defaults without clearing content/metadata
// ═══════════════════════════════════════════════════════════════════════════
await test('10. Reset Settings keeps content and metadata, restores defaults', () => {
  let doc = newDoc();
  doc.blocks.push({ id: 'blk-r', data: { type: 'paragraph', spans: [{ text: 'Keep me' }] } });
  doc.metadata.title = 'Reset Fixture';
  doc.metadata.documentId = 'LAB-042';
  doc.metadata.customFields.push({ id: 'fld-r', label: 'Column', value: 'Chemistry' });
  doc = updatePageSetup(doc, { field: 'size', size: 'A3' }, T1).doc;
  doc = updatePageSetup(doc, { field: 'marginPreset', preset: 'narrow' }, T1).doc;
  doc = updateTypography(doc, { field: 'baseFontSizePt', value: 16 }, T1).doc;
  // Cover off (default is on, §8.4) → the display-header preference is editable.
  doc = { ...doc, frontPage: { ...doc.frontPage, enabled: false } };
  doc = updateDisplayHeader(doc, false, T1).doc;

  const reset = resetDocumentSettings(doc, T1);
  // Settings back to factory defaults.
  assert.deepEqual(reset.pageSetup, createDefaultDocument('x', T0).pageSetup);
  assert.deepEqual(reset.pageTypography, createDefaultDocument('x', T0).pageTypography);
  // Content, metadata (incl. custom fields and formal documentId), assets preserved.
  assert.deepEqual(reset.blocks, doc.blocks);
  assert.equal(reset.metadata.title, 'Reset Fixture');
  assert.equal(reset.metadata.documentId, 'LAB-042');
  assert.deepEqual(reset.metadata.customFields, doc.metadata.customFields);
  assert.equal(reset.metadata.createdAt, T0);
  assert.equal(reset.metadata.modifiedAt, T1);
  assert.deepEqual(reset.labProfile, doc.labProfile);
});

// ═══════════════════════════════════════════════════════════════════════════
// 11. Display-header preference retained while the front page is enabled
// ═══════════════════════════════════════════════════════════════════════════
await test('11. display header: §8.4 disable rule preserves the stored choice', () => {
  // Schema default: the front page is ENABLED and displayHeader is ON —
  // the control is unavailable on a fresh document, and the stored choice
  // is untouched by any refused attempt.
  const fresh = newDoc();
  assert.equal(fresh.frontPage.enabled, true, 'front page defaults to enabled');
  assert.equal(fresh.pageTypography.displayHeader, true);
  const refusedFresh = updateDisplayHeader(fresh, false, T1);
  assert.equal(refusedFresh.ok, false);
  assert.equal(refusedFresh.code, 'front-page-enabled');
  assert.deepEqual(refusedFresh.doc, undefined);
  assert.equal(fresh.pageTypography.displayHeader, true); // preserved

  // User turns the cover off (P04-M4 UI; modeled here) → the control
  // becomes available and the stored choice can change again.
  let doc = { ...fresh, frontPage: { ...fresh.frontPage, enabled: false } };
  const turnedOff = updateDisplayHeader(doc, false, T1);
  assert.equal(turnedOff.ok, true);
  assert.equal(turnedOff.changed, true);
  doc = turnedOff.doc;
  assert.equal(doc.pageTypography.displayHeader, false);

  // Front page re-enabled: the control is refused, the preference is untouched.
  const withCover = { ...doc, frontPage: { ...doc.frontPage, enabled: true } };
  const refused = updateDisplayHeader(withCover, true, T1);
  assert.equal(refused.ok, false);
  assert.equal(refused.code, 'front-page-enabled');
  assert.deepEqual(refused.doc, undefined);
  assert.equal(withCover.pageTypography.displayHeader, false); // preserved

  // Front page disabled again: the stored choice is intact and toggleable.
  const coverOff = { ...withCover, frontPage: { ...withCover.frontPage, enabled: false } };
  assert.equal(coverOff.pageTypography.displayHeader, false);
  const restored = updateDisplayHeader(coverOff, true, T1);
  assert.equal(restored.ok, true);
  assert.equal(restored.doc.pageTypography.displayHeader, true);
  // Non-boolean input is rejected.
  const bad = updateDisplayHeader(coverOff, 'yes', T1);
  assert.equal(bad.ok, false);
});

// ═══════════════════════════════════════════════════════════════════════════
// 12. Duplication preserves settings
// ═══════════════════════════════════════════════════════════════════════════
await test('12. duplicateDocument carries every page/typography setting into the copy', () => {
  let doc = newDoc();
  doc = updatePageSetup(doc, { field: 'size', size: 'A5' }, T1).doc;
  doc = updatePageSetup(doc, { field: 'orientation', orientation: 'landscape' }, T1).doc;
  doc = updatePageSetup(doc, { field: 'marginPreset', preset: 'custom' }, T1).doc;
  doc = updatePageSetup(doc, { field: 'customMargins', topMm: 10, bottomMm: 10, leftMm: 10, rightMm: 10 }, T1).doc;
  doc = updateTypography(doc, { field: 'fontFamily', value: 'Georgia' }, T1).doc;
  doc = updateTypography(doc, { field: 'baseFontSizePt', value: 13 }, T1).doc;
  // Cover off (default is on, §8.4) → the display-header preference is editable.
  doc = { ...doc, frontPage: { ...doc.frontPage, enabled: false } };
  doc = updateDisplayHeader(doc, false, T1).doc;

  const copy = duplicateDocument(doc, '2026-10-16T12:00:00.000Z');
  assert.deepEqual(copy.pageSetup, doc.pageSetup);
  assert.deepEqual(copy.pageTypography, doc.pageTypography);
  assert.notEqual(copy.id, doc.id); // independent identity
  // The copy is a deep copy — mutating it cannot reach the source.
  copy.pageTypography.typography.baseFontSizePt = 30;
  assert.equal(doc.pageTypography.typography.baseFontSizePt, 13);
});

// ── Summary ─────────────────────────────────────────────────────────────────
console.log('');
if (failed.length === 0) {
  console.log(`P04-M1 verification: ${passed} passed, 0 failed.`);
  process.exit(0);
} else {
  console.error(`P04-M1 verification: ${passed} passed, ${failed.length} FAILED.`);
  process.exit(1);
}
