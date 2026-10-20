/**
 * P06-M1 Verification Suite — Header/Footer Grid and Numbering
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Proves, against the REAL compiled modules (no mocks):
 *  1. service semantics — defaults, toggles, immutability, no-op identity,
 *     timestamp policy, deterministic rejection codes;
 *  2. grid invariants — structural add/remove row/column, documented caps,
 *     confirm-required for content-discarding removals, corrupt/merged grid
 *     rejection, cell content limits, alignment validation;
 *  3. page-number modes — exactly the four §9 formats end-to-end
 *     (`formatPageNumber` + real probe renders), per-band
 *     `suppressOnFirstPage`, the §8.4 `displayHeader` master switch;
 *  4. token resolution — `{pageNumber}` / `{documentId}` /
 *     `{organizationName}`, empty metadata → empty text, unknown tokens
 *     preserved literally;
 *  5. watermark validation ranges + real rendered operators (alpha, colour,
 *     font size), rotation/position geometry, blank-text policy;
 *  6. persistence — `serializeDocument`/`deserializeDocument` round-trip,
 *     `duplicateDocument` settings identity;
 *  7. probe PDFs — the settings-driven `PocConfiguredFurniture` grid and
 *     watermark rendered per physical page by the REAL react-pdf engine
 *     (preserved as supplementary evidence after DEC-008 activation);
 *  8. real-path (DEC-008 option (a), authorized 2026-10-20) — the grids
 *     are ACTIVE inside `PocDocument`: committed-baseline byte identity,
 *     per-band switches, all four page-number modes, token resolution,
 *     first-body-page suppression + cover exclusion, `displayHeader`
 *     scoping, watermark drawn exactly once, and pdfjs-verified band
 *     LAYOUT positions (on-page, in the margin bands, no body overlap);
 *  9. panel behaviour under a real jsdom + real React runtime.
 *
 * HONEST SCOPE NOTES (also recorded in project_roadmap.md)
 * ───────────────────────────────────────────────────────
 * • The draft wording "removing the last row disables the band" is
 *   implemented as a REJECTION (`too-few-rows`) instead: a band always
 *   keeps at least one row.  The actual behaviour is asserted as-is.
 * • DEC-008 activation changed the committed P02-M4 baseline and this
 *   suite's real-path watermark artifact; regeneration is ONLY via
 *   `UPDATE_ARTIFACTS=1` (normal runs fail on a missing/stale artifact
 *   and never write).  Test 10.5 asserts the activated boundary (grid
 *   patches DO change `PocDocument` output now).
 * • The native Windows colour-picker UI itself cannot be driven from
 *   Node — the panel's authoritative native-listener apply path IS
 *   driven here (11.11); the picker dialog remains an owner retest.
 *
 * Usage: node verify_p06_m1.mjs   (or: npm run verify:p06-m1)
 * Exit code 0 => all checks pass.
 */

import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { execSync } from 'node:child_process';
import { JSDOM } from 'jsdom';

const require = createRequire(import.meta.url);
const root = path.dirname(new URL(import.meta.url).pathname.replace(/^\//, ''));
const OUT_DIR = path.join(root, 'fixtures', 'p06-m1');
const CACHE = path.join(root, 'node_modules', '.cache', 'ds-p06-m1-verify');
// DEC-008 baseline policy: committed artifacts are APPROVED evidence.
// Normal runs verify and never write; UPDATE_ARTIFACTS=1 regenerates.
const UPDATE_ARTIFACTS = process.env.UPDATE_ARTIFACTS === '1';

// ── Test harness ────────────────────────────────────────────────────────────
let passed = 0;
const failed = [];
async function test(name, fn) {
  try {
    await fn();
    passed += 1;
    console.log(`PASS  ${name}`);
  } catch (e) {
    failed.push(name);
    console.error(`FAIL  ${name}\n      ${e && e.message ? e.message : e}`);
  }
}
function group(title) {
  console.log(`\n── ${title} ${'─'.repeat(Math.max(0, 66 - title.length))}`);
}

// ── Compile the real modules under test ─────────────────────────────────────
// Compiled (not bundled) inside node_modules/.cache so bare imports resolve
// to the REAL installed packages — same pattern as verify_p02_m4/verify_p05.
group('compile');
const COMPILE_ROOTS = [
  'src/renderer/poc/poc-node-entry.ts',
  'src/components/left-panel/HeaderFooterPanel.tsx',
];
try {
  execSync(
    'npx tsc ' + COMPILE_ROOTS.join(' ') +
      ` --outDir "${CACHE}" --module commonjs --target es2020` +
      ' --moduleResolution node --esModuleInterop --skipLibCheck' +
      ' --jsx react-jsx --strict',
    { cwd: root, stdio: 'pipe' },
  );
  console.log(`PASS  TypeScript compile of ${COMPILE_ROOTS.length} roots (--strict)`);
  passed += 1;
} catch (e) {
  console.error(String(e.stdout || '') + String(e.stderr || ''));
  console.error('FATAL: TypeScript compilation failed.');
  process.exit(1);
}

const pick = (...candidates) => {
  const hit = candidates.find((p) => fs.existsSync(p));
  if (!hit) throw new Error(`compiled module not found:\n  ${candidates.join('\n  ')}`);
  return require(hit);
};

// The panel imports its stylesheet.  tsc does not copy .css files, and Node
// resolves the request BEFORE consulting require.extensions — so an empty
// placeholder must exist next to the compiled component.
for (const dir of [
  path.join(CACHE, 'components', 'left-panel'),
  path.join(CACHE, 'src', 'components', 'left-panel'),
]) {
  if (fs.existsSync(dir)) fs.writeFileSync(path.join(dir, 'HeaderFooterPanel.css'), '/* stub for Node verification */\n');
}

const pocNode = pick(
  path.join(CACHE, 'renderer', 'poc', 'poc-node-entry.js'),
  path.join(CACHE, 'src', 'renderer', 'poc', 'poc-node-entry.js'),
);
const defaults = pick(
  path.join(CACHE, 'types', 'defaults.js'),
  path.join(CACHE, 'src', 'types', 'defaults.js'),
);
const documentFile = pick(
  path.join(CACHE, 'services', 'document-file.js'),
  path.join(CACHE, 'src', 'services', 'document-file.js'),
);

const {
  buildPocFixture,
  renderDocPdfBytes,
  renderFurnitureProbePdfBytes,
  renderThemeGalleryPdfBytes,
  POC_CREATED_AT,
  HF_MAX_ROWS,
  HF_MAX_COLUMNS,
  HF_CELL_CONTENT_MAX_LENGTH,
  WATERMARK_OPACITY_RANGE,
  WATERMARK_ROTATION_DEG_RANGE,
  WATERMARK_FONT_SIZE_PT_RANGE,
  WATERMARK_POSITION_RANGE,
  WATERMARK_TEXT_MAX_LENGTH,
  PAGE_NUMBER_FORMATS,
  DOCUMENTED_TOKENS,
  applyHeaderFooterPatch,
  applyWatermarkPatch,
  formatPageNumber,
  resolveCellText,
  serializeDocument,
  duplicateDocument,
} = pocNode;
const { createDefaultDocument, createDefaultHeaderFooter } = defaults;
const { deserializeDocument } = documentFile;

// ── Fixtures and service helpers ────────────────────────────────────────────
const T0 = POC_CREATED_AT;
const STAMP = '2026-10-20T12:00:00.000Z';
const CONTROL = String.fromCharCode(7); // ASCII BEL — a control character
let idSeq = 0;
const genId = () => `06000000-0000-4000-8000-${String(++idSeq).padStart(12, '0')}`;
const newDoc = (id = 'hf-doc-1') => createDefaultDocument(id, T0);

/** Apply a band patch through the REAL service (deterministic ids/time). */
const bandPatch = (doc, kind, patch, now = STAMP) => applyHeaderFooterPatch(doc, kind, patch, now, genId);
/** Apply a watermark patch through the REAL service. */
const wmPatch = (doc, patch, now = STAMP) => applyWatermarkPatch(doc, patch, now);

function applied(res, label) {
  assert.equal(
    res.ok,
    true,
    `${label}: expected ok, got ${res.ok ? '' : `${res.code} — ${res.message}`}`,
  );
  assert.equal(res.changed, true, `${label}: expected a real change`);
  return res.doc;
}
function rejected(res, code, label) {
  assert.equal(res.ok, false, `${label}: expected rejection, the patch was applied`);
  assert.equal(res.code, code, `${label}: error code (message: ${res.message})`);
}
function noOp(res, sourceDoc, label) {
  assert.equal(res.ok, true, `${label}: no-ops are still ok`);
  assert.equal(res.changed, false, `${label}: expected changed=false`);
  assert.equal(res.doc, sourceDoc, `${label}: no-op returns the SAME reference`);
}
const bandOf = (doc, kind) => doc.headerFooter[kind];

/** Set one cell's content through the service; returns the NEW document. */
function setCell(doc, kind, rowIndex, cellIndex, value, now = STAMP) {
  const row = bandOf(doc, kind).rows[rowIndex];
  const cell = row.cells[cellIndex];
  return applied(
    bandPatch(doc, kind, { field: 'cellContent', rowId: row.id, cellId: cell.id, value }, now),
    `setCell ${kind}[${rowIndex}][${cellIndex}]`,
  );
}
/**
 * Apply a simple band field patch; returns the document (tolerates a
 * legitimate no-op, e.g. re-selecting a band's default value).
 */
function setBand(doc, kind, patch, now = STAMP) {
  const res = bandPatch(doc, kind, patch, now);
  assert.equal(res.ok, true, `setBand ${kind}.${patch.field}: ${res.ok ? '' : `${res.code} — ${res.message}`}`);
  return res.doc;
}
/** Apply a watermark field patch; tolerates a legitimate no-op. */
function setWm(doc, patch, now = STAMP) {
  const res = wmPatch(doc, patch, now);
  assert.equal(res.ok, true, `setWm ${patch.field}: ${res.ok ? '' : `${res.code} — ${res.message}`}`);
  return res.doc;
}

// ═══════════════════════════════════════════════════════════════════════════
// 1. Service: defaults and documented constants
// ═══════════════════════════════════════════════════════════════════════════
group('service: defaults and constants');

await test('1.1 default header/footer bands (§9 default layout)', () => {
  const hf = createDefaultHeaderFooter();
  assert.equal(hf.header.enabled, true, 'header on by default');
  assert.equal(hf.footer.enabled, true, 'footer on by default');
  for (const kind of ['header', 'footer']) {
    const b = hf[kind];
    assert.equal(b.rows.length, 1, `${kind}: one row`);
    assert.equal(b.columnCount, 2, `${kind}: two columns`);
    assert.equal(b.rows[0].cells.length, 2, `${kind}: row agrees with columnCount`);
    assert.equal(b.pageNumberFormat, 'Page X of Y', `${kind}: default numbering`);
    assert.equal(b.suppressOnFirstPage, true, `${kind}: suppresses the first body page`);
    assert.ok(b.rows[0].cells.every((c) => c.colSpan === 1), `${kind}: no merged cells`);
  }
  const [h0, h1] = hf.header.rows[0].cells;
  assert.equal(h0.content, '{documentId}');
  assert.equal(h0.hAlign, 'left');
  assert.equal(h1.content, '{pageNumber}');
  assert.equal(h1.hAlign, 'right');
  const [f0, f1] = hf.footer.rows[0].cells;
  assert.equal(f0.content, '{organizationName}');
  assert.equal(f0.hAlign, 'left');
  assert.equal(f1.content, '{pageNumber}');
  assert.equal(f1.hAlign, 'right');
});

await test('1.2 default watermark is disabled with documented values', () => {
  const wm = createDefaultHeaderFooter().watermark;
  assert.equal(wm.enabled, false, 'watermark off by default');
  assert.equal(wm.text, 'DRAFT');
  assert.equal(wm.opacity, 0.15);
  assert.equal(wm.rotationDeg, 45);
  assert.equal(wm.fontSizePt, 72);
  assert.equal(wm.color, '#aaaaaa');
  assert.equal(wm.positionX, 0.5);
  assert.equal(wm.positionY, 0.5);
});

await test('1.3 documented constants and the exact four §9 page-number formats', () => {
  assert.equal(HF_MAX_ROWS, 10);
  assert.equal(HF_MAX_COLUMNS, 8);
  assert.equal(HF_CELL_CONTENT_MAX_LENGTH, 200);
  assert.equal(WATERMARK_TEXT_MAX_LENGTH, 80);
  assert.deepEqual(WATERMARK_OPACITY_RANGE, { min: 0, max: 1 });
  assert.deepEqual(WATERMARK_ROTATION_DEG_RANGE, { min: -360, max: 360 });
  assert.deepEqual(WATERMARK_FONT_SIZE_PT_RANGE, { min: 6, max: 200 });
  assert.deepEqual(WATERMARK_POSITION_RANGE, { min: 0, max: 1 });
  assert.deepEqual([...PAGE_NUMBER_FORMATS], ['Page X of Y', 'X/Y', 'X', 'none']);
  assert.deepEqual([...DOCUMENTED_TOKENS], ['{documentId}', '{organizationName}', '{pageNumber}']);
});

// ═══════════════════════════════════════════════════════════════════════════
// 2. Service: toggles, immutability, timestamps, error codes
// ═══════════════════════════════════════════════════════════════════════════
group('service: toggles, immutability, timestamps');

await test('2.1 band enable toggles are isolated and non-mutating', () => {
  const docA = newDoc('hf-toggle-a');
  const docB = newDoc('hf-toggle-b');
  const snapA = JSON.stringify(docA);

  // Default is ON → re-asserting ON is a true no-op (same reference).
  noOp(bandPatch(docA, 'header', { field: 'enabled', value: true }), docA, 'enable-when-on');

  const off = applied(bandPatch(docA, 'header', { field: 'enabled', value: false }), 'disable header');
  assert.equal(off.headerFooter.header.enabled, false);
  assert.equal(off.headerFooter.footer.enabled, true, 'footer untouched');
  assert.notEqual(off, docA, 'a real change returns a NEW document');
  assert.equal(off.metadata.modifiedAt, STAMP, 'modifiedAt stamped with the injected time');
  assert.equal(bandOf(off, 'footer'), bandOf(docA, 'footer'), 'untouched band shares its reference');
  assert.equal(off.headerFooter.watermark, docA.headerFooter.watermark, 'watermark shares its reference');

  const on = applied(bandPatch(off, 'header', { field: 'enabled', value: true }), 're-enable header');
  assert.equal(on.headerFooter.header.enabled, true);

  // Independent documents are unaffected.
  assert.equal(bandOf(docB, 'header').enabled, true, 'other documents untouched');
  assert.equal(JSON.stringify(docA), snapA, 'source document never mutated');
});

await test('2.2 no-op patches do not stamp modifiedAt (no false Modified status)', () => {
  const doc = newDoc('hf-noop');
  const res = bandPatch(doc, 'footer', { field: 'pageNumberFormat', value: 'Page X of Y' });
  noOp(res, doc, 'same page-number format');
  assert.equal(res.doc.metadata.modifiedAt, doc.metadata.modifiedAt, 'stamp unchanged');
});

await test('2.3 deterministic rejection codes for bad toggles / unknown targets', () => {
  const doc = newDoc('hf-badtoggle');
  rejected(bandPatch(doc, 'header', { field: 'enabled', value: 'yes' }), 'invalid-boolean', 'enabled string');
  rejected(bandPatch(doc, 'header', { field: 'suppressOnFirstPage', value: 1 }), 'invalid-boolean', 'suppress number');
  rejected(
    applyHeaderFooterPatch(doc, 'sideline', { field: 'enabled', value: false }, STAMP, genId),
    'unknown-band',
    'unknown band',
  );
  rejected(bandPatch(doc, 'header', { field: 'bogus', value: 1 }), 'unknown-field', 'unknown band field');
  rejected(wmPatch(doc, { field: 'bogus', value: 1 }), 'unknown-field', 'unknown watermark field');
  rejected(wmPatch(doc, { field: 'enabled', value: 'on' }), 'invalid-boolean', 'watermark enabled string');
});

// ═══════════════════════════════════════════════════════════════════════════
// 3. Service: grid structure invariants
// ═══════════════════════════════════════════════════════════════════════════
group('service: grid structure invariants');

await test('3.1 addRow appends a matching row with fresh ids, old cells verbatim', () => {
  const doc = newDoc('hf-addrow');
  const before = bandOf(doc, 'header');
  const next = applied(bandPatch(doc, 'header', { field: 'addRow' }), 'addRow');
  const after = bandOf(next, 'header');
  assert.equal(after.rows.length, 2);
  assert.equal(after.rows[0].id, before.rows[0].id, 'surviving row keeps its id');
  assert.equal(after.rows[0].cells[0].content, before.rows[0].cells[0].content, 'content verbatim');
  assert.equal(after.rows[1].cells.length, after.columnCount, 'new row matches columnCount');
  assert.ok(after.rows[1].id.startsWith('06000000-'), 'fresh row id from the id factory');
  for (const c of after.rows[1].cells) {
    assert.ok(c.id.startsWith('06000000-'), 'fresh cell id');
    assert.equal(c.content, '', 'new cell empty');
    assert.equal(c.colSpan, 1);
    assert.equal(c.vAlign, 'middle');
  }

  // atIndex inserts at the requested position.
  const doc2 = newDoc('hf-addrow-idx');
  const next2 = applied(bandPatch(doc2, 'header', { field: 'addRow', atIndex: 0 }), 'addRow atIndex 0');
  assert.notEqual(bandOf(next2, 'header').rows[0].id, bandOf(doc2, 'header').rows[0].id, 'new row first');
});

await test('3.2 row/column caps reject beyond the documented maxima', () => {
  let doc = newDoc('hf-caps');
  for (let i = 0; i < HF_MAX_ROWS - 1; i += 1) {
    doc = applied(bandPatch(doc, 'header', { field: 'addRow' }), `addRow #${i + 2}`);
  }
  assert.equal(bandOf(doc, 'header').rows.length, HF_MAX_ROWS, 'cap reached');
  rejected(bandPatch(doc, 'header', { field: 'addRow' }), 'too-many-rows', 'row cap');

  let doc2 = newDoc('hf-caps-col');
  while (bandOf(doc2, 'header').columnCount < HF_MAX_COLUMNS) {
    doc2 = applied(bandPatch(doc2, 'header', { field: 'addColumn' }), 'addColumn to cap');
  }
  assert.equal(bandOf(doc2, 'header').columnCount, HF_MAX_COLUMNS, 'column cap reached');
  assert.ok(bandOf(doc2, 'header').rows.every((r) => r.cells.length === HF_MAX_COLUMNS));
  rejected(bandPatch(doc2, 'header', { field: 'addColumn' }), 'too-many-columns', 'column cap');
});

await test('3.3 addColumn grows EVERY row; removeColumn drops the index', () => {
  let doc = newDoc('hf-cols');
  doc = setBand(doc, 'header', { field: 'addRow' }); // 2 × 2 now
  const rowIds = bandOf(doc, 'header').rows.map((r) => r.id);
  doc = applied(bandPatch(doc, 'header', { field: 'addColumn' }), 'addColumn');
  const after = bandOf(doc, 'header');
  assert.equal(after.columnCount, 3);
  assert.ok(after.rows.every((r) => r.cells.length === 3), 'every row grew');
  assert.deepEqual(after.rows.map((r) => r.id), rowIds, 'row ids stable');
  assert.ok(after.rows.every((r) => r.cells[2].content === '' && r.cells[2].colSpan === 1));

  // Removing an EMPTY appended column needs no confirmation.
  doc = applied(bandPatch(doc, 'header', { field: 'removeColumn', columnIndex: 2 }), 'remove empty column');
  assert.equal(bandOf(doc, 'header').columnCount, 2);
  assert.equal(bandOf(doc, 'header').rows[0].cells[2], undefined);

  // Out-of-range column index → not-found.
  rejected(bandPatch(doc, 'header', { field: 'removeColumn', columnIndex: 9 }), 'not-found', 'bad column index');
});

await test('3.4 content-discarding removals require confirmation (force flag)', () => {
  // Row with text: refused until force.
  let doc = newDoc('hf-confirm-row');
  doc = setBand(doc, 'header', { field: 'addRow' });
  doc = setCell(doc, 'header', 0, 0, 'KEEP-ME');
  const rowId = bandOf(doc, 'header').rows[0].id;
  rejected(bandPatch(doc, 'header', { field: 'removeRow', rowId }), 'confirm-required', 'row with text');
  assert.equal(bandOf(doc, 'header').rows.length, 2, 'nothing removed without confirmation');
  doc = applied(bandPatch(doc, 'header', { field: 'removeRow', rowId, force: true }), 'forced row removal');
  assert.equal(bandOf(doc, 'header').rows.length, 1);

  // Empty row: removed without confirmation.
  let doc2 = newDoc('hf-confirm-row-empty');
  doc2 = setBand(doc2, 'header', { field: 'addRow' });
  const emptyRowId = bandOf(doc2, 'header').rows[1].id;
  doc2 = applied(bandPatch(doc2, 'header', { field: 'removeRow', rowId: emptyRowId }), 'empty row removal');
  assert.equal(bandOf(doc2, 'header').rows.length, 1);

  // Column with text: refused until force; id/content of survivors intact.
  let doc3 = newDoc('hf-confirm-col');
  const keepCellId = bandOf(doc3, 'header').rows[0].cells[1].id;
  rejected(bandPatch(doc3, 'header', { field: 'removeColumn', columnIndex: 0 }), 'confirm-required', 'column with text');
  assert.equal(bandOf(doc3, 'header').columnCount, 2, 'nothing removed without confirmation');
  doc3 = applied(
    bandPatch(doc3, 'header', { field: 'removeColumn', columnIndex: 0, force: true }),
    'forced column removal',
  );
  assert.equal(bandOf(doc3, 'header').columnCount, 1);
  assert.equal(bandOf(doc3, 'header').rows[0].cells[0].id, keepCellId, 'surviving cell keeps id');
});

await test('3.5 DEVIATION (recorded): the LAST row/column cannot be removed — rejection, not auto-disable', () => {
  const doc = newDoc('hf-last-row');
  const rowId = bandOf(doc, 'header').rows[0].id;
  // The draft wording said "removing the last row disables the band";
  // the implemented rule is a hard rejection that keeps ≥ 1 row.
  rejected(bandPatch(doc, 'header', { field: 'removeRow', rowId, force: true }), 'too-few-rows', 'last row');
  assert.equal(bandOf(doc, 'header').rows.length, 1, 'grid keeps one row');
  assert.equal(bandOf(doc, 'header').enabled, true, 'band stays enabled (no silent mode change)');

  // Shrink to a single column first; then THAT column is the last one.
  let one = newDoc('hf-last-col');
  const survivorId = bandOf(one, 'header').rows[0].cells[0].id;
  one = applied(bandPatch(one, 'header', { field: 'removeColumn', columnIndex: 1, force: true }), 'shrink to 1 column');
  assert.equal(bandOf(one, 'header').columnCount, 1);
  rejected(bandPatch(one, 'header', { field: 'removeColumn', columnIndex: 0, force: true }), 'too-few-columns', 'last column');
  assert.equal(bandOf(one, 'header').columnCount, 1, 'grid keeps one column');
  assert.equal(bandOf(one, 'header').rows[0].cells[0].id, survivorId, 'survivor unchanged');
});

await test('3.6 corrupt grids are REJECTED, never silently repaired', () => {
  // Row/column mismatch.
  const doc = newDoc('hf-mismatch');
  bandOf(doc, 'header').rows[0].cells = [bandOf(doc, 'header').rows[0].cells[0]];
  rejected(bandPatch(doc, 'header', { field: 'addRow' }), 'row-column-mismatch', 'short row');
  rejected(bandPatch(doc, 'header', { field: 'removeColumn', columnIndex: 0, force: true }), 'row-column-mismatch', 'short row (removeColumn)');
  assert.equal(bandOf(doc, 'header').rows[0].cells.length, 1, 'corruption NOT repaired');

  // Merged cells are not editable.
  const doc2 = newDoc('hf-merged');
  bandOf(doc2, 'header').rows[0].cells[0].colSpan = 2;
  rejected(bandPatch(doc2, 'header', { field: 'addRow' }), 'merged-cells-unsupported', 'colSpan 2');
  rejected(bandPatch(doc2, 'header', { field: 'addColumn' }), 'merged-cells-unsupported', 'colSpan 2 (addColumn)');
  assert.equal(bandOf(doc2, 'header').rows[0].cells[0].colSpan, 2, 'grid untouched');

  // Unknown row id.
  let doc3 = newDoc('hf-notfound');
  doc3 = setBand(doc3, 'header', { field: 'addRow' });
  rejected(bandPatch(doc3, 'header', { field: 'removeRow', rowId: genId() }), 'not-found', 'missing row');
});

// ═══════════════════════════════════════════════════════════════════════════
// 4. Service: cell content and alignment
// ═══════════════════════════════════════════════════════════════════════════
group('service: cell content and alignment');

await test('4.1 cell content limits: 200 chars ok, 201 rejected, no coercion', () => {
  const doc = newDoc('hf-cell');
  const row = bandOf(doc, 'header').rows[0];
  const cell = row.cells[0];
  const atCap = 'x'.repeat(HF_CELL_CONTENT_MAX_LENGTH);
  const capped = applied(
    bandPatch(doc, 'header', { field: 'cellContent', rowId: row.id, cellId: cell.id, value: atCap }),
    '200 chars',
  );
  assert.equal(bandOf(capped, 'header').rows[0].cells[0].content, atCap);
  rejected(
    bandPatch(doc, 'header', { field: 'cellContent', rowId: row.id, cellId: cell.id, value: 'x'.repeat(201) }),
    'text-too-long',
    '201 chars',
  );
  rejected(
    bandPatch(doc, 'header', { field: 'cellContent', rowId: row.id, cellId: cell.id, value: `a${CONTROL}b` }),
    'invalid-text',
    'control character',
  );
  rejected(
    bandPatch(doc, 'header', { field: 'cellContent', rowId: row.id, cellId: cell.id, value: 42 }),
    'invalid-text',
    'non-string',
  );
  rejected(
    bandPatch(doc, 'header', { field: 'cellContent', rowId: genId(), cellId: cell.id, value: 'ok' }),
    'not-found',
    'missing row id',
  );
  assert.equal(bandOf(doc, 'header').rows[0].cells[0].content, '{documentId}', 'source untouched by rejections');
});

await test('4.2 identical cell content is a no-op (same reference)', () => {
  const doc = newDoc('hf-cell-noop');
  const row = bandOf(doc, 'header').rows[0];
  noOp(
    bandPatch(doc, 'header', { field: 'cellContent', rowId: row.id, cellId: row.cells[0].id, value: '{documentId}' }),
    doc,
    'same content',
  );
});

await test('4.3 alignment validation: horizontal ≠ vertical vocabulary', () => {
  const doc = newDoc('hf-align');
  const row = bandOf(doc, 'header').rows[0];
  const cellId = row.cells[0].id;
  const h1 = applied(bandPatch(doc, 'header', { field: 'cellHAlign', rowId: row.id, cellId, value: 'right' }), 'hAlign right');
  assert.equal(bandOf(h1, 'header').rows[0].cells[0].hAlign, 'right');
  rejected(bandPatch(doc, 'header', { field: 'cellHAlign', rowId: row.id, cellId, value: 'middle' }), 'unknown-alignment', 'middle as H');
  rejected(bandPatch(doc, 'header', { field: 'cellHAlign', rowId: row.id, cellId, value: 'top' }), 'unknown-alignment', 'top as H');

  const v1 = applied(bandPatch(doc, 'header', { field: 'cellVAlign', rowId: row.id, cellId, value: 'bottom' }), 'vAlign bottom');
  assert.equal(bandOf(v1, 'header').rows[0].cells[0].vAlign, 'bottom');
  rejected(bandPatch(doc, 'header', { field: 'cellVAlign', rowId: row.id, cellId, value: 'center' }), 'unknown-alignment', 'center as V');
  rejected(bandPatch(doc, 'header', { field: 'cellVAlign', rowId: row.id, cellId: genId(), value: 'top' }), 'not-found', 'missing cell');

  // Re-asserting the current alignment is a no-op.
  noOp(bandPatch(doc, 'header', { field: 'cellHAlign', rowId: row.id, cellId, value: 'left' }), doc, 'same alignment');
});

// ═══════════════════════════════════════════════════════════════════════════
// 5. Service: page-number formats and first-body-page suppression
// ═══════════════════════════════════════════════════════════════════════════
group('service: numbering and suppression');

await test('5.1 all four §9 formats apply per band; unknown formats rejected', () => {
  for (const fmt of PAGE_NUMBER_FORMATS) {
    const doc = newDoc(`hf-fmt-${fmt.replace(/[^a-z]/g, '')}`);
    const next = setBand(doc, 'footer', { field: 'pageNumberFormat', value: fmt });
    assert.equal(bandOf(next, 'footer').pageNumberFormat, fmt, `footer format ${fmt}`);
    assert.equal(bandOf(next, 'header').pageNumberFormat, 'Page X of Y', 'header band independent');
  }
  const doc = newDoc('hf-fmt-bad');
  rejected(
    bandPatch(doc, 'footer', { field: 'pageNumberFormat', value: 'page-of-total' }),
    'unknown-page-number-format',
    'foreign format',
  );
});

await test('5.2 suppressOnFirstPage toggles per band', () => {
  const doc = newDoc('hf-suppress');
  const next = setBand(doc, 'header', { field: 'suppressOnFirstPage', value: false });
  assert.equal(bandOf(next, 'header').suppressOnFirstPage, false);
  assert.equal(bandOf(next, 'footer').suppressOnFirstPage, true, 'footer independent');
  noOp(bandPatch(doc, 'header', { field: 'suppressOnFirstPage', value: true }), doc, 'same suppression');
});

// ═══════════════════════════════════════════════════════════════════════════
// 6. Service: watermark validation
// ═══════════════════════════════════════════════════════════════════════════
group('service: watermark validation');

await test('6.1 numeric ranges: in-range applies, out-of-range rejects (never clamped)', () => {
  const doc = newDoc('hf-wm-range');
  let next = setWm(doc, { field: 'enabled', value: true });
  next = setWm(next, { field: 'opacity', value: WATERMARK_OPACITY_RANGE.max });
  assert.equal(next.headerFooter.watermark.opacity, 1);
  next = setWm(next, { field: 'opacity', value: 0 });
  assert.equal(next.headerFooter.watermark.opacity, 0);
  rejected(wmPatch(doc, { field: 'opacity', value: -0.1 }), 'out-of-range', 'opacity < 0');
  rejected(wmPatch(doc, { field: 'opacity', value: 1.4 }), 'out-of-range', 'opacity > 1');
  rejected(wmPatch(doc, { field: 'opacity', value: Number.NaN }), 'invalid-number', 'opacity NaN');
  rejected(wmPatch(doc, { field: 'opacity', value: '0.5' }), 'invalid-number', 'opacity string');
  rejected(wmPatch(doc, { field: 'opacity', value: '' }), 'invalid-number', 'opacity empty draft');

  const r1 = setWm(doc, { field: 'rotationDeg', value: -360 });
  assert.equal(r1.headerFooter.watermark.rotationDeg, -360);
  const r2 = setWm(doc, { field: 'rotationDeg', value: 360 });
  assert.equal(r2.headerFooter.watermark.rotationDeg, 360);
  rejected(wmPatch(doc, { field: 'rotationDeg', value: -361 }), 'out-of-range', 'rotation < -360');
  rejected(wmPatch(doc, { field: 'rotationDeg', value: 361 }), 'out-of-range', 'rotation > 360');

  const f1 = setWm(doc, { field: 'fontSizePt', value: WATERMARK_FONT_SIZE_PT_RANGE.min });
  assert.equal(f1.headerFooter.watermark.fontSizePt, 6);
  const f2 = setWm(doc, { field: 'fontSizePt', value: WATERMARK_FONT_SIZE_PT_RANGE.max });
  assert.equal(f2.headerFooter.watermark.fontSizePt, 200);
  rejected(wmPatch(doc, { field: 'fontSizePt', value: 5 }), 'out-of-range', 'font < 6');
  rejected(wmPatch(doc, { field: 'fontSizePt', value: 201 }), 'out-of-range', 'font > 200');

  for (const field of ['positionX', 'positionY']) {
    const p = setWm(doc, { field, value: 1 });
    assert.equal(p.headerFooter.watermark[field], 1, `${field} = 1`);
    const p0 = setWm(doc, { field, value: 0 });
    assert.equal(p0.headerFooter.watermark[field], 0, `${field} = 0`);
    rejected(wmPatch(doc, { field, value: -0.01 }), 'out-of-range', `${field} < 0`);
    rejected(wmPatch(doc, { field, value: 1.01 }), 'out-of-range', `${field} > 1`);
  }
});

await test('6.2 watermark text: ≤80 chars, no control characters, verbatim storage', () => {
  const doc = newDoc('hf-wm-text');
  const atCap = 'W'.repeat(WATERMARK_TEXT_MAX_LENGTH);
  const ok1 = setWm(doc, { field: 'text', value: atCap });
  assert.equal(ok1.headerFooter.watermark.text, atCap);
  rejected(wmPatch(doc, { field: 'text', value: 'x'.repeat(81) }), 'text-too-long', '81 chars');
  rejected(wmPatch(doc, { field: 'text', value: `a${CONTROL}b` }), 'invalid-text', 'control character');
  rejected(wmPatch(doc, { field: 'text', value: null }), 'invalid-text', 'non-string');
  const spaced = setWm(doc, { field: 'text', value: '  DRAFT copy  ' });
  assert.equal(spaced.headerFooter.watermark.text, '  DRAFT copy  ', 'stored verbatim (case/space)');
  noOp(wmPatch(doc, { field: 'text', value: 'DRAFT' }), doc, 'same text');
});

await test('6.3 watermark colour: hex only, canonicalised, never coerced', () => {
  const doc = newDoc('hf-wm-color');
  const c1 = setWm(doc, { field: 'color', value: '#123abc' });
  assert.equal(c1.headerFooter.watermark.color, '#123abc');
  const c2 = setWm(doc, { field: 'color', value: '#AABBCC' });
  assert.equal(c2.headerFooter.watermark.color, '#aabbcc', 'canonicalised to lowercase');
  const c3 = setWm(doc, { field: 'color', value: 'abc' });
  assert.equal(c3.headerFooter.watermark.color, '#aabbcc', '#RGB expanded');
  rejected(wmPatch(doc, { field: 'color', value: 'puce' }), 'invalid-color', 'named colour');
  rejected(wmPatch(doc, { field: 'color', value: 'rgb(1,2,3)' }), 'invalid-color', 'rgb()');
  rejected(wmPatch(doc, { field: 'color', value: '#12345' }), 'invalid-color', 'malformed hex');
  assert.equal(doc.headerFooter.watermark.color, '#aaaaaa', 'source untouched');
});

await test('6.4 watermark patches leave both bands untouched (reference-stable)', () => {
  const doc = newDoc('hf-wm-isolated');
  const next = setWm(doc, { field: 'enabled', value: true });
  assert.equal(bandOf(next, 'header'), bandOf(doc, 'header'));
  assert.equal(bandOf(next, 'footer'), bandOf(doc, 'footer'));
  assert.equal(next.metadata.modifiedAt, STAMP, 'modifiedAt stamped on a real change');
});

// ═══════════════════════════════════════════════════════════════════════════
// 7. Pure functions: page-number formatting and token resolution
// ═══════════════════════════════════════════════════════════════════════════
group('service: formatPageNumber and resolveCellText');

await test('7.1 formatPageNumber implements exactly the four §9 modes', () => {
  const page = { pageNumber: 2, totalPages: 7 };
  assert.equal(formatPageNumber('Page X of Y', page), 'Page 2 of 7');
  assert.equal(formatPageNumber('X/Y', page), '2/7');
  assert.equal(formatPageNumber('X', page), '2');
  assert.equal(formatPageNumber('none', page), '');
});

await test('7.2 resolveCellText: tokens, empty metadata, unknown tokens literal', () => {
  const ctx = { pageNumber: 2, totalPages: 7, documentId: ' SOP-1 ', organizationName: '  Lab  ' };
  assert.equal(resolveCellText('{documentId}|{organizationName}', 'Page X of Y', ctx), 'SOP-1|Lab', 'trimmed metadata');
  assert.equal(resolveCellText('{pageNumber}', 'Page X of Y', ctx), 'Page 2 of 7', 'band format drives the number');
  assert.equal(resolveCellText('{pageNumber}', 'X/Y', ctx), '2/7');
  assert.equal(resolveCellText('{pageNumber}', 'X', ctx), '2');
  assert.equal(resolveCellText('{pageNumber}', 'none', ctx), '', 'none suppresses the NUMBER token only');
  assert.equal(resolveCellText('A {pageNumber} B', 'none', ctx), 'A  B', 'surrounding text kept verbatim');
  assert.equal(resolveCellText('{pageNumber}-{pageNumber}', 'X/Y', ctx), '2/7-2/7', 'every occurrence replaced');

  const empty = { pageNumber: 1, totalPages: 3, documentId: '', organizationName: '   ' };
  assert.equal(resolveCellText('{documentId}/{organizationName}', 'X', empty), '/', 'empty metadata → empty string');
  assert.equal(resolveCellText('{documentId}', 'X', empty), '', 'never undefined / token remnant');

  assert.equal(resolveCellText('{organizationName} / {title}', 'X/Y', ctx), 'Lab / {title}', 'unknown token stays literal');
});

// ═══════════════════════════════════════════════════════════════════════════
// 8. Persistence: round-trip and duplication
// ═══════════════════════════════════════════════════════════════════════════
group('persistence: serialize / deserialize / duplicate');

await test('8.1 headerFooter settings survive a full serialize→deserialize round-trip', () => {
  let doc = buildPocFixture();
  doc = setCell(doc, 'header', 0, 0, 'PERSIST-CELL {pageNumber}');
  doc = setBand(doc, 'footer', { field: 'pageNumberFormat', value: 'X/Y' });
  doc = setWm(doc, { field: 'enabled', value: true });
  doc = setWm(doc, { field: 'text', value: 'PERSIST-WATERMARK' });
  const json = serializeDocument(doc);
  const back = deserializeDocument(json);
  assert.equal(JSON.stringify(back.headerFooter), JSON.stringify(doc.headerFooter), 'deep-equal after round-trip');
  assert.equal(back.headerFooter.header.rows[0].cells[0].content, 'PERSIST-CELL {pageNumber}');
});

await test('8.2 a structurally corrupt band is REFUSED by serializeDocument (never written)', () => {
  // The serializer validates the envelope (types + required fields); the
  // service guarantees row/column consistency going forward.  Here we assert
  // the corruptions the validator actually rejects.
  const corrupt = (mutate) => {
    const doc = newDoc('hf-corrupt');
    mutate(doc.headerFooter.header);
    return doc;
  };
  assert.throws(
    () => serializeDocument(corrupt((h) => { h.rows[0].cells = 'nope'; })),
    /invalid-structure|damaged/i,
    'cells not an array',
  );
  assert.throws(
    () => serializeDocument(corrupt((h) => { delete h.rows[0].cells[0].content; })),
    /invalid-structure|damaged/i,
    'cell missing content',
  );
  assert.throws(
    () => serializeDocument(corrupt((h) => { h.enabled = 'yes'; })),
    /invalid-structure|damaged/i,
    'band enabled not a boolean',
  );
  assert.throws(
    () => serializeDocument(corrupt((h) => { h.columnCount = 'two'; })),
    /invalid-structure|damaged/i,
    'columnCount not a number',
  );
});

await test('8.3 duplicateDocument preserves headerFooter settings verbatim (ids stable)', () => {
  let doc = buildPocFixture();
  doc = setCell(doc, 'header', 0, 0, 'DUP-CELL');
  const dup = duplicateDocument(doc, STAMP);
  assert.equal(JSON.stringify(dup.headerFooter), JSON.stringify(doc.headerFooter), 'settings identical');
  assert.equal(dup.metadata.createdAt, STAMP, 'duplicate re-stamped');
  assert.equal(dup.headerFooter.header.rows[0].cells[0].id, doc.headerFooter.header.rows[0].cells[0].id, 'ids stable');
});

// ═══════════════════════════════════════════════════════════════════════════
// 9. Renderer: configured-furniture probe PDFs (BEFORE any jsdom globals)
// ═══════════════════════════════════════════════════════════════════════════
group('renderer: configured furniture probe');

const latin1 = (buf) => buf.toString('latin1');
const isPdf = (buf) => buf.length > 8 && latin1(buf.subarray(0, 5)) === '%PDF-' && latin1(buf).includes('%%EOF');
function pdfPageCount(buf) {
  const m = latin1(buf).match(/\/Type\s*\/Page[^s]/g);
  return m ? m.length : 0;
}
/** Resolve each page object to its inflated content stream(s). */
function pdfPages(buf) {
  const text = latin1(buf);
  const pages = [];
  const pageRe = /(\d+)\s+0\s+obj[\s\S]*?\/Type\s*\/Page[^s][\s\S]*?endobj/g;
  let m;
  while ((m = pageRe.exec(text)) !== null) {
    const refs = [];
    const single = m[0].match(/\/Contents\s+(\d+)\s+\d+\s+R/);
    if (single) refs.push(Number(single[1]));
    const arr = m[0].match(/\/Contents\s+\[([^\]]+)\]/);
    if (arr) for (const r of arr[1].matchAll(/(\d+)\s+\d+\s+R/g)) refs.push(Number(r[1]));
    let content = '';
    for (const ref of refs) {
      const om = new RegExp(`${ref}\\s+0\\s+obj[\\s\\S]*?stream\\r?\\n`).exec(text);
      if (!om) continue;
      const start = om.index + om[0].length;
      const end = text.indexOf('endstream', start);
      if (end < 0) continue;
      const slice = buf.subarray(start, end);
      try {
        content += zlib.inflateSync(slice).toString('latin1');
      } catch {
        content += slice.toString('latin1');
      }
    }
    pages.push({ objNum: Number(m[1]), content });
  }
  return pages;
}
/** Visible text of one page: hex TJ runs + literal Tj strings, space-joined. */
function pageText(page) {
  const out = [];
  const tjRe = /\[((?:<[0-9A-Fa-f]+>|\s|[-\d.])+)\]\s*TJ/g;
  let m;
  while ((m = tjRe.exec(page.content)) !== null) {
    const runs = m[1].match(/<[0-9A-Fa-f]+>/g) || [];
    out.push(runs.map((r) => Buffer.from(r.slice(1, -1), 'hex').toString('latin1')).join(' '));
  }
  const litRe = /\(((?:[^()\\]|\\.)*)\)\s*Tj/g;
  while ((m = litRe.exec(page.content)) !== null) {
    out.push(m[1].replace(/\\([()\\])/g, '$1'));
  }
  return out.join(' ');
}
/** Every inflated content stream concatenated (for colour/font operator checks). */
const allContent = (buf) => pdfPages(buf).map((p) => p.content).join('\n');
/** Whitespace-insensitive containment (pdfkit splits runs at kerning pairs). */
const compact = (s) => s.replace(/\s+/g, '');
const has = (text, needle) => compact(text).includes(compact(needle));
const countOf = (text, needle) => compact(text).split(compact(needle)).length - 1;

const probeBuffer = async (doc) => Buffer.from(await renderFurnitureProbePdfBytes(doc));
const probeTexts = async (doc) => pdfPages(await probeBuffer(doc)).map((p) => pageText(p));
/**
 * Committed-artifact policy (DEC-008): a normal run verifies the fresh
 * render against the committed artifact and FAILS when it is missing or
 * stale — it NEVER writes.  `UPDATE_ARTIFACTS=1` is the explicit
 * opt-in regeneration path.
 */
const storeArtifact = (name, buf) => {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const p = path.join(OUT_DIR, name);
  if (UPDATE_ARTIFACTS) {
    fs.writeFileSync(p, buf);
    console.log(`      regenerated artifact ${name} (${buf.length} B)`);
    return;
  }
  assert.ok(fs.existsSync(p),
    `${name}: committed artifact missing - run UPDATE_ARTIFACTS=1 to generate it`);
  assert.ok(buf.equals(fs.readFileSync(p)),
    `${name}: fresh render must byte-match the committed artifact (run UPDATE_ARTIFACTS=1 to regenerate)`);
  console.log(`      verified artifact ${name} (${buf.length} B) matches committed copy`);
};

await test('9.1 default probe: 3 pages, default grid tokens on body pages, first page suppressed', async () => {
  const doc = buildPocFixture();
  const bytes = await probeBuffer(doc);
  assert.ok(isPdf(bytes), 'valid PDF');
  assert.equal(pdfPageCount(bytes), 3, 'fixture paginates to 3 pages');
  const again = await probeBuffer(doc);
  assert.ok(bytes.equals(again), 'probe render is deterministic');

  // Committed-artifact guard (never silently rewritten): storeArtifact
  // byte-verifies against fixtures/p06-m1/furniture-probe-default.pdf.
  storeArtifact('furniture-probe-default.pdf', bytes);

  const texts = pdfPages(bytes).map((p) => pageText(p));
  const [p1, p2, p3] = texts;
  assert.ok(has(p2, 'SOP-POC-004'), 'header {documentId} token renders on body page 2');
  assert.ok(has(p2, 'DocStudio Proof-of-Concept Laboratory'), 'footer {organizationName} token renders');
  assert.ok(has(p2, 'Page 2 of 3'), 'default format “Page X of Y” renders (pdfkit splits runs; match compacted)');
  assert.ok(has(p3, 'Page 3 of 3'), 'page number tracks the physical page');
  assert.ok(!has(p1, 'SOP-POC-004'), 'first body page suppressed by default');
  assert.ok(!has(p1, 'Page 1 of 3'), 'no page number on the suppressed first body page');
  for (const t of texts) {
    assert.ok(!t.includes('undefined'), 'no “undefined” ever printed');
    assert.ok(!has(t, 'DocStudio Renderer Proof of Concept'), 'probe renders the configured grid, not the legacy furniture');
  }
});

await test('9.2 configured sentinels: per-page numbers in header AND footer cells', async () => {
  let doc = buildPocFixture();
  doc = setCell(doc, 'header', 0, 0, 'H|{pageNumber}|H');
  doc = setCell(doc, 'header', 0, 1, 'HLIT');
  doc = setCell(doc, 'footer', 0, 0, 'F|{pageNumber}|F');
  doc = setCell(doc, 'footer', 0, 1, 'FLIT');
  doc = setBand(doc, 'header', { field: 'suppressOnFirstPage', value: false });
  doc = setBand(doc, 'footer', { field: 'suppressOnFirstPage', value: false });
  const texts = await probeTexts(doc);
  assert.equal(texts.length, 3);
  for (let i = 0; i < 3; i += 1) {
    const n = i + 1;
    assert.ok(has(texts[i], `H|Page ${n} of 3|H`), `page ${n}: header sentinel with the REAL page number`);
    assert.ok(has(texts[i], `F|Page ${n} of 3|F`), `page ${n}: footer sentinel with the REAL page number`);
    assert.ok(has(texts[i], 'HLIT'), `page ${n}: literal header text`);
    assert.ok(has(texts[i], 'FLIT'), `page ${n}: literal footer text`);
    assert.ok(!texts[i].includes('undefined'), `page ${n}: no “undefined”`);
    assert.ok(!has(texts[i], 'DocStudio Renderer Proof of Concept'), `page ${n}: no legacy furniture`);
  }
});

await test('9.3 all four page-number modes render their exact literals', async () => {
  const expected = {
    'Page X of Y': ['[Page 1 of 3]', '[Page 3 of 3]'],
    'X/Y': ['[1/3]', '[3/3]'],
    X: ['[1]', '[3]'],
    none: ['[]', '[]'],
  };
  const rendered = new Map();
  for (const fmt of PAGE_NUMBER_FORMATS) {
    let doc = buildPocFixture();
    doc = setCell(doc, 'footer', 0, 0, '[{pageNumber}]');
    doc = setCell(doc, 'footer', 0, 1, '');
    doc = setBand(doc, 'footer', { field: 'pageNumberFormat', value: fmt });
    doc = setBand(doc, 'footer', { field: 'suppressOnFirstPage', value: false });
    doc = setBand(doc, 'header', { field: 'suppressOnFirstPage', value: false });
    const bytes = await probeBuffer(doc);
    rendered.set(fmt, bytes);
    const texts = pdfPages(bytes).map((p) => pageText(p));
    const [onFirst, onThird] = expected[fmt];
    assert.ok(has(texts[0], onFirst), `mode ${fmt}: page 1 renders ${onFirst}`);
    assert.ok(has(texts[2], onThird), `mode ${fmt}: page 3 renders ${onThird}`);
    assert.ok(!texts[0].includes('undefined'), `mode ${fmt}: no “undefined”`);
  }
  const distinct = new Set([...rendered.values()].map((b) => latin1(b)));
  assert.equal(distinct.size, PAGE_NUMBER_FORMATS.length, 'the four modes produce four different PDFs');
  for (const [name, buf] of rendered) {
    storeArtifact(`furniture-probe-pn-${name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/-+$/, '')}.pdf`, buf);
  }
});

await test('9.4 suppressOnFirstPage hides the band on page 1 only; toggling shows it', async () => {
  let doc = buildPocFixture();
  doc = setCell(doc, 'header', 0, 0, '[{pageNumber}]H');
  doc = setCell(doc, 'footer', 0, 0, '[{pageNumber}]F');
  // Defaults: both bands suppress the first body page.
  let texts = await probeTexts(doc);
  assert.ok(!has(texts[0], '[Page 1'), 'page 1: header AND footer suppressed');
  assert.equal(countOf(texts[1], '[Page 2 of 3]'), 2, 'page 2: header + footer both render');
  assert.equal(countOf(texts[2], '[Page 3 of 3]'), 2, 'page 3: header + footer both render');

  doc = setBand(doc, 'header', { field: 'suppressOnFirstPage', value: false });
  doc = setBand(doc, 'footer', { field: 'suppressOnFirstPage', value: false });
  texts = await probeTexts(doc);
  assert.equal(countOf(texts[0], '[Page 1 of 3]'), 2, 'after toggling, page 1 carries both bands');
});

await test('9.5 §8.4 displayHeader is the master switch for the header grid only', async () => {
  let doc = buildPocFixture();
  doc = setCell(doc, 'header', 0, 0, 'DISPLAY-HDR');
  doc = setCell(doc, 'footer', 0, 0, 'FOOTER-OK');
  doc = setBand(doc, 'header', { field: 'suppressOnFirstPage', value: false });
  doc = setBand(doc, 'footer', { field: 'suppressOnFirstPage', value: false });
  let texts = await probeTexts(doc);
  assert.ok(texts.every((t) => has(t, 'DISPLAY-HDR')), 'header renders while both switches are on');

  doc.pageTypography = { ...doc.pageTypography, displayHeader: false };
  texts = await probeTexts(doc);
  assert.ok(texts.every((t) => !has(t, 'DISPLAY-HDR')), 'displayHeader=false suppresses the header grid');
  assert.ok(texts.every((t) => has(t, 'FOOTER-OK')), 'footer unaffected by displayHeader (never gated it)');
});

await test('9.6 header band switch: disabled band renders nothing', async () => {
  let doc = buildPocFixture();
  doc = setCell(doc, 'header', 0, 0, 'SECRET-HDR');
  doc = setCell(doc, 'footer', 0, 0, 'FOOTER-OK');
  doc = setBand(doc, 'header', { field: 'suppressOnFirstPage', value: false });
  doc = setBand(doc, 'footer', { field: 'suppressOnFirstPage', value: false });
  doc = setBand(doc, 'header', { field: 'enabled', value: false });
  const texts = await probeTexts(doc);
  assert.ok(texts.every((t) => !has(t, 'SECRET-HDR')), 'disabled header renders nothing');
  assert.ok(texts.every((t) => has(t, 'FOOTER-OK')), 'footer still renders');
});

await test('9.7 a designed cover page never carries bands or the watermark', async () => {
  let doc = buildPocFixture();
  doc = { ...doc, frontPage: { ...doc.frontPage, enabled: true } };
  doc = setCell(doc, 'header', 0, 0, 'COVER-HDR');
  doc = setCell(doc, 'footer', 0, 0, 'COVER-FTR');
  doc = setBand(doc, 'header', { field: 'suppressOnFirstPage', value: false });
  doc = setBand(doc, 'footer', { field: 'suppressOnFirstPage', value: false });
  doc = setWm(doc, { field: 'enabled', value: true });
  doc = setWm(doc, { field: 'text', value: 'COVER-WM' });
  const bytes = await probeBuffer(doc);
  const texts = pdfPages(bytes).map((p) => pageText(p));
  assert.equal(texts.length, 4, 'cover + 3 body pages');
  assert.ok(!has(texts[0], 'COVER-HDR'), 'cover: no header');
  assert.ok(!has(texts[0], 'COVER-FTR'), 'cover: no footer');
  assert.ok(!has(texts[0], 'COVER-WM'), 'cover: no watermark');
  assert.ok(has(texts[1], 'COVER-HDR'), 'first BODY page carries the header');
  assert.ok(has(texts[1], 'COVER-FTR'), 'first BODY page carries the footer');
  assert.ok(has(texts[1], 'COVER-WM'), 'first BODY page carries the watermark');
});

await test('9.8 empty metadata resolves to EMPTY text — never “undefined”', async () => {
  let doc = buildPocFixture();
  doc = { ...doc, metadata: { ...doc.metadata, documentId: '', organizationName: '' } };
  doc = setCell(doc, 'header', 0, 0, '{documentId}|H');
  doc = setCell(doc, 'footer', 0, 0, '{organizationName}|F');
  doc = setBand(doc, 'header', { field: 'suppressOnFirstPage', value: false });
  doc = setBand(doc, 'footer', { field: 'suppressOnFirstPage', value: false });
  const texts = await probeTexts(doc);
  assert.ok(has(texts[1], '|H'), 'header cell: token → empty, separator kept');
  assert.ok(has(texts[1], '|F'), 'footer cell: token → empty, separator kept');
  for (const t of texts) assert.ok(!t.includes('undefined'), 'no “undefined” anywhere');
});

await test('9.9 watermark: text on every body page + real alpha/colour/font operators', async () => {
  let doc = buildPocFixture();
  doc = setWm(doc, { field: 'enabled', value: true });
  doc = setWm(doc, { field: 'text', value: 'WM-SENTINEL' });
  doc = setWm(doc, { field: 'opacity', value: 0.42 });
  doc = setWm(doc, { field: 'rotationDeg', value: 70.7 });
  doc = setWm(doc, { field: 'fontSizePt', value: 64 });
  doc = setWm(doc, { field: 'color', value: '#ff0000' });
  const bytes = await probeBuffer(doc);
  storeArtifact('furniture-probe-watermark.pdf', bytes);
  const texts = pdfPages(bytes).map((p) => pageText(p));
  assert.equal(texts.length, 3);
  for (let i = 0; i < 3; i += 1) {
    assert.ok(has(texts[i], 'WM-SENTINEL'), `page ${i + 1}: watermark text present`);
  }
  assert.ok(/\/ca\s+0\.42/.test(latin1(bytes)), 'opacity 0.42 emitted as /ca 0.42 (ExtGState, uncompressed)');
  const ops = allContent(bytes);
  assert.ok(/1(?:\.0+)?\s+0(?:\.0+)?\s+0(?:\.0+)?\s+scn/.test(ops), '#ff0000 emitted as fill colour 1 0 0 scn');
  assert.ok(/\/F\d+\s+64(?:\.0+)?\s+Tf/.test(ops), 'font size 64 pt emitted as Tf');

  // Rotation and position change the emitted geometry (not just labels).
  let flat = buildPocFixture();
  flat = setWm(flat, { field: 'enabled', value: true });
  flat = setWm(flat, { field: 'text', value: 'WM-SENTINEL' });
  flat = setWm(flat, { field: 'opacity', value: 0.42 });
  flat = setWm(flat, { field: 'fontSizePt', value: 64 });
  flat = setWm(flat, { field: 'color', value: '#ff0000' });
  flat = setWm(flat, { field: 'rotationDeg', value: 0 });
  const flatBytes = await probeBuffer(flat);
  assert.ok(!bytes.equals(flatBytes), 'rotation changes the rendered operators');

  const moved = setWm(doc, { field: 'positionX', value: 0.1 });
  const movedBytes = await probeBuffer(moved);
  assert.ok(!bytes.equals(movedBytes), 'positionX changes the rendered geometry');
});

await test('9.10 watermark disabled or blank renders NOTHING (byte-identical pair)', async () => {
  // NOTE (engine fact, P06-M1): react-pdf HYPHENATES watermark text that is
  // too wide for the remaining line box — a 16-char sentinel at the default
  // 72 pt renders as "WM-OFF-SEN-"/"TINEL" across two lines.  A sentinel that
  // fits renders verbatim, which is what we assert here; the hyphenation
  // behaviour is recorded in project_roadmap.md as an engine characteristic.
  const SENTINEL = 'WM-OFF';
  let enabled = buildPocFixture();
  enabled = setWm(enabled, { field: 'enabled', value: true });
  enabled = setWm(enabled, { field: 'text', value: SENTINEL });
  const onBytes = await probeBuffer(enabled);
  const onTexts = pdfPages(onBytes).map((p) => pageText(p));
  assert.ok(onTexts.every((t) => has(t, SENTINEL)), 'sentinel renders on every body page');

  const disabled = setWm(enabled, { field: 'enabled', value: false });
  const offBytes = await probeBuffer(disabled);
  const offTexts = pdfPages(offBytes).map((p) => pageText(p));
  assert.ok(offTexts.every((t) => !has(t, SENTINEL)), 'disabled watermark renders no text (inflated streams)');
  assert.ok(!onBytes.equals(offBytes), 'on and off renders genuinely differ');

  // Enabled + BLANK text = documented silent policy → same bytes as disabled.
  const blank = setWm(enabled, { field: 'text', value: '   ' });
  const blankBytes = await probeBuffer(blank);
  const blankTexts = pdfPages(blankBytes).map((p) => pageText(p));
  assert.ok(blankTexts.every((t) => !has(t, SENTINEL)), 'blank text renders no text');
  assert.ok(blankBytes.equals(offBytes), 'blank text byte-identical to disabled (layer not mounted)');
});

// ═══════════════════════════════════════════════════════════════════════════
// 10. Real path: PocDocument integration + committed-baseline guards
// ═══════════════════════════════════════════════════════════════════════════
group('real path: activated furniture (DEC-008) + byte-identity guards');

let freshRender = null;

await test('10.1 fresh fixture render byte-matches the committed approved baseline (DEC-008 transition)', async () => {
  freshRender = Buffer.from(await renderDocPdfBytes(buildPocFixture()));
  assert.ok(isPdf(freshRender), 'valid PDF');
  // The APPROVED baseline is the committed working-tree fixture; a
  // missing or stale fixture fails here (regenerate ONLY via
  // UPDATE_ARTIFACTS=1 on verify_p02_m4.mjs).
  const committedPath = path.join(root, 'fixtures', 'p02-m4', 'renderer-poc-output.pdf');
  assert.ok(fs.existsSync(committedPath),
    'committed baseline missing - run UPDATE_ARTIFACTS=1 (verify_p02_m4) to approve it');
  const committed = fs.readFileSync(committedPath);
  assert.equal(freshRender.length, committed.length,
    `fresh ${freshRender.length} B vs committed ${committed.length} B`);
  assert.ok(freshRender.equals(committed), 'byte-identical to the committed approved baseline');
  // The PRE-transition baseline stays retrievable from git history, and
  // the authorized DEC-008 activation genuinely superseded it.
  const blob = execSync('git show 2f31e02:fixtures/p02-m4/renderer-poc-output.pdf', {
    cwd: root,
    maxBuffer: 64 * 1024 * 1024,
    encoding: 'buffer',
  });
  assert.ok(isPdf(blob), 'pre-transition baseline preserved in git history');
  assert.ok(!freshRender.equals(blob),
    'renderer intentionally diverged under the authorized DEC-008 transition');
});

await test('10.2 theme-gallery artifacts byte-match fresh renders (P04-M3 regression guard)', async () => {
  const colour = Buffer.from(await renderThemeGalleryPdfBytes(false));
  const committedColour = fs.readFileSync(path.join(root, 'fixtures', 'p04-m3', 'theme-gallery.pdf'));
  assert.ok(colour.equals(committedColour), 'colour gallery byte-identical');

  const mono = Buffer.from(await renderThemeGalleryPdfBytes(true));
  const committedMono = fs.readFileSync(path.join(root, 'fixtures', 'p04-m3', 'theme-gallery-monochrome.pdf'));
  assert.ok(mono.equals(committedMono), 'monochrome gallery byte-identical');
});

await test('10.3 watermark reaches the REAL PocDocument path with its operators', async () => {
  // Patch with now=T0 so modifiedAt stays at the fixture's creation time
  // (the PDF embeds it; a different stamp would change the bytes).
  let doc = buildPocFixture();
  doc = setWm(doc, { field: 'enabled', value: true }, T0);
  doc = setWm(doc, { field: 'text', value: 'REALPATH-SENTINEL' }, T0);
  doc = setWm(doc, { field: 'opacity', value: 0.5 }, T0);
  doc = setWm(doc, { field: 'rotationDeg', value: 20 }, T0);
  doc = setWm(doc, { field: 'fontSizePt', value: 55 }, T0);
  doc = setWm(doc, { field: 'color', value: '#00ff00' }, T0);
  const bytes = Buffer.from(await renderDocPdfBytes(doc));
  storeArtifact('poc-document-watermark-realpath.pdf', bytes);
  const texts = pdfPages(bytes).map((p) => pageText(p));
  assert.ok(texts.length >= 3, `multipage render (${texts.length} pages)`);
  for (let i = 0; i < texts.length; i += 1) {
    assert.ok(has(texts[i], 'REALPATH-SENTINEL'), `page ${i + 1}: watermark rendered on EVERY body page`);
  }
  const ops = allContent(bytes);
  assert.ok(/\/ca\s+0\.5/.test(latin1(bytes)), 'opacity 0.5 emitted');
  assert.ok(/0(?:\.0+)?\s+1(?:\.0+)?\s+0(?:\.0+)?\s+scn/.test(ops), '#00ff00 emitted as 0 1 0 scn');
  assert.ok(/\/F\d+\s+55(?:\.0+)?\s+Tf/.test(ops), 'font size 55 pt emitted as Tf');
});

await test('10.4 watermark on→off returns the exact baseline bytes (byte-neutral layer)', async () => {
  let doc = buildPocFixture();
  doc = setWm(doc, { field: 'enabled', value: true }, T0);
  doc = setWm(doc, { field: 'text', value: 'REALPATH-SENTINEL' }, T0);
  doc = setWm(doc, { field: 'opacity', value: 0.5 }, T0);
  const off = setWm(doc, { field: 'enabled', value: false }, T0);
  assert.equal(off.metadata.modifiedAt, T0, 'modifiedAt preserved at the fixture creation time (no new stamp)');
  const offBytes = Buffer.from(await renderDocPdfBytes(off));
  assert.equal(offBytes.length, freshRender.length, 'same length as baseline');
  assert.ok(offBytes.equals(freshRender), 'byte-identical to the committed baseline');
});

await test('10.5 DEC-008 ACTIVATED: grid patches change PocDocument output and render configured text', async () => {
  let doc = buildPocFixture();
  doc = setCell(doc, 'header', 0, 0, 'GRID-SENTINEL', T0);
  const bytes = Buffer.from(await renderDocPdfBytes(doc));
  assert.ok(!bytes.equals(freshRender), 'grid cell patch changed the bytes - bands are ACTIVE in PocDocument');
  const texts = pdfPages(bytes).map((p) => pageText(p));
  const [p1, p2] = texts;
  assert.ok(has(p2, 'GRID-SENTINEL'), 'configured header cell text renders on body pages');
  assert.ok(!has(p1, 'GRID-SENTINEL'), 'first body page still suppressed (page-1 rule unaffected)');
  assert.ok(!has(p2, 'DocStudio Renderer Proof of Concept'),
    'legacy hard-coded header is gone from the real path');
  // Structural grid changes reach the output too.
  const grew = Buffer.from(await renderDocPdfBytes(setBand(doc, 'header', { field: 'addRow' }, T0)));
  assert.ok(!grew.equals(bytes), 'structural grid change (addRow) changed the bytes');
  // The legacy fixed footer rendered "Page 1 of 3" on EVERY page including
  // the first; the configured footer is suppressed there instead.
  assert.ok(!has(p1, 'Page 1 of 3'), 'legacy page-1 footer is gone (first page suppressed instead)');
});

// ── DEC-008 real-path coverage (§9/§3.4-3.8 of the follow-up task) ──────────

await test('10.6 per-band switches are independent (real path): a disabled band emits no content', async () => {
  // Header OFF, footer kept.
  let headerOff = buildPocFixture();
  headerOff = setCell(headerOff, 'header', 0, 0, 'HDR-SENTINEL', T0);
  headerOff = setCell(headerOff, 'footer', 0, 0, 'FTR-SENTINEL', T0);
  headerOff = setBand(headerOff, 'header', { field: 'enabled', value: false }, T0);
  const hPages = pdfPages(Buffer.from(await renderDocPdfBytes(headerOff))).map((p) => pageText(p));
  assert.ok(hPages.length >= 3, `multipage (${hPages.length} pages)`);
  hPages.forEach((t, i) => {
    assert.ok(!has(t, 'HDR-SENTINEL'), `page ${i + 1}: disabled header emits no cell text`);
    assert.ok(!has(t, 'SOP-POC-004'), `page ${i + 1}: default header cell absent too`);
  });
  assert.ok(has(hPages[1], 'FTR-SENTINEL') && has(hPages[2], 'FTR-SENTINEL'),
    'footer band unaffected by the header switch');
  assert.equal(countOf(hPages[1], 'Page 2 of 3'), 1,
    'page 2 numbered only by the footer (header right cell gone)');

  // Footer OFF, header kept.
  let footerOff = buildPocFixture();
  footerOff = setCell(footerOff, 'header', 0, 0, 'HDR-SENTINEL', T0);
  footerOff = setCell(footerOff, 'footer', 0, 0, 'FTR-SENTINEL', T0);
  footerOff = setBand(footerOff, 'footer', { field: 'enabled', value: false }, T0);
  const fPages = pdfPages(Buffer.from(await renderDocPdfBytes(footerOff))).map((p) => pageText(p));
  fPages.forEach((t, i) => {
    assert.ok(!has(t, 'FTR-SENTINEL'), `page ${i + 1}: disabled footer emits no cell text`);
    assert.ok(!has(t, 'DocStudio Proof-of-Concept Laboratory'), `page ${i + 1}: default footer cell absent too`);
  });
  assert.ok(has(fPages[1], 'HDR-SENTINEL') && has(fPages[2], 'HDR-SENTINEL'),
    'header band unaffected by the footer switch');
  assert.equal(countOf(fPages[1], 'Page 2 of 3'), 1,
    'page 2 numbered only by the header (footer right cell gone)');
});

await test('10.7 all four 9 page-number modes render their exact literals (real path, multipage)', async () => {
  const modes = [
    { value: 'Page X of Y', page2: 'NUM Page 2 of 3', page3: 'NUM Page 3 of 3' },
    { value: 'X/Y', page2: 'NUM 2/3', page3: 'NUM 3/3' },
    { value: 'X', page2: 'NUM 2', page3: 'NUM 3' },
    { value: 'none', page2: 'NUM', page3: 'NUM' },
  ];
  for (const mode of modes) {
    let d = buildPocFixture();
    d = setCell(d, 'footer', 0, 1, 'NUM{pageNumber}', T0);
    d = setBand(d, 'footer', { field: 'pageNumberFormat', value: mode.value }, T0);
    const pages = pdfPages(Buffer.from(await renderDocPdfBytes(d))).map((p) => pageText(p));
    assert.ok(has(pages[1], mode.page2), `mode "${mode.value}": page 2 shows "${mode.page2}"`);
    assert.ok(has(pages[2], mode.page3), `mode "${mode.value}": page 3 shows "${mode.page3}"`);
    assert.ok(!has(pages[0], 'NUM'), `mode "${mode.value}": suppressed page 1 carries no band text`);
    if (mode.value === 'none') {
      assert.ok(!has(pages[1], 'NUM 2') && !has(pages[1], 'NUM Page'),
        'mode "none": number suppressed, sentinel alone remains');
    }
  }
});

await test('10.8 token substitution resolves; unknown/empty values never render "undefined" (real path)', async () => {
  let d = buildPocFixture();
  d = setCell(d, 'header', 0, 0, '{documentId}|{organizationName}|{pageNumber}', T0);
  d = setBand(d, 'header', { field: 'pageNumberFormat', value: 'X/Y' }, T0);
  d = setCell(d, 'footer', 0, 0, 'TC-{pageCount}|{organizationName}', T0);
  const pages = pdfPages(Buffer.from(await renderDocPdfBytes(d))).map((p) => pageText(p));
  assert.ok(has(pages[1], 'SOP-POC-004|DocStudio Proof-of-Concept Laboratory|2/3'),
    'documentId + organizationName + formatted pageNumber resolve on page 2');
  assert.ok(has(pages[2], 'SOP-POC-004|DocStudio Proof-of-Concept Laboratory|3/3'),
    'the same cell resolves per physical page on page 3');
  // `{pageCount}` is NOT one of the existing contract's tokens
  // (DOCUMENTED_TOKENS = documentId / organizationName / pageNumber):
  // unknown tokens are preserved literally, and the total page count
  // reaches cells through the §9 formats ("Page X of Y", "X/Y" above).
  assert.ok(has(pages[1], 'TC-{pageCount}|DocStudio Proof-of-Concept Laboratory'),
    'unknown {pageCount} preserved literally per the existing service contract; org still resolves');

  // Empty metadata -> empty text, never "undefined".
  let empty = buildPocFixture();
  empty.metadata = { ...empty.metadata, documentId: '', organizationName: '' };
  empty = setCell(empty, 'header', 0, 0, '[{documentId}][{organizationName}]', T0);
  const ePages = pdfPages(Buffer.from(await renderDocPdfBytes(empty))).map((p) => pageText(p));
  ePages.forEach((t, i) => {
    assert.ok(!t.includes('undefined'), `page ${i + 1}: no "undefined" anywhere in the text`);
  });
  assert.ok(has(ePages[1], '[][]'), 'empty metadata resolves to empty strings');
});

await test('10.9 cover never carries bands; suppressOnFirstPage hides the first BODY page (real path)', async () => {
  let d = buildPocFixture();
  d = setCell(d, 'header', 0, 0, 'BAND-HDR', T0);
  d = setCell(d, 'footer', 0, 0, 'BAND-FTR', T0);
  d.frontPage = { ...d.frontPage, enabled: true };
  const pages = pdfPages(Buffer.from(await renderDocPdfBytes(d))).map((p) => pageText(p));
  assert.equal(pages.length, 4, `cover + 3 body pages (got ${pages.length})`);
  // Physical page 1 = designed cover: NO body furniture whatsoever.
  assert.ok(!has(pages[0], 'BAND-HDR') && !has(pages[0], 'BAND-FTR'), 'cover carries no bands');
  assert.ok(!has(pages[0], 'Page 1 of 4'), 'cover carries no page numbering');
  // Physical page 2 = first BODY page: default suppressOnFirstPage hides it.
  assert.ok(!has(pages[1], 'BAND-HDR') && !has(pages[1], 'BAND-FTR'),
    'first body page suppressed by its own rule');
  // Later body pages carry both bands with document-global numbering.
  assert.ok(has(pages[2], 'BAND-HDR') && has(pages[2], 'BAND-FTR'),
    'second body page carries both bands');
  assert.ok(has(pages[2], 'Page 3 of 4'), 'numbering uses PHYSICAL page numbers (cover counts)');
  assert.ok(has(pages[3], 'Page 4 of 4'), 'last page numbered');
});

await test('10.10 8.4 displayHeader suppresses ONLY the header grid (real path; footer unaffected)', async () => {
  let d = buildPocFixture();
  d = setCell(d, 'header', 0, 0, 'DISPLAY-HDR', T0);
  d = setCell(d, 'footer', 0, 0, 'DISPLAY-FTR', T0);
  d.pageTypography = { ...d.pageTypography, displayHeader: false };
  const pages = pdfPages(Buffer.from(await renderDocPdfBytes(d))).map((p) => pageText(p));
  pages.forEach((t, i) => {
    assert.ok(!has(t, 'DISPLAY-HDR'), `page ${i + 1}: header grid suppressed by displayHeader=false`);
    assert.ok(!has(t, 'SOP-POC-004'), `page ${i + 1}: default header cell suppressed too`);
  });
  assert.ok(!has(pages[0], 'DISPLAY-FTR'),
    'page 1 footer suppressed by its own first-page rule (not by displayHeader)');
  assert.ok(has(pages[1], 'DISPLAY-FTR') && has(pages[2], 'DISPLAY-FTR'),
    'footer unaffected by displayHeader');
});

await test('10.11 watermark drawn EXACTLY ONCE per body page; blank text renders nothing (real path)', async () => {
  let d = buildPocFixture();
  d = setWm(d, { field: 'enabled', value: true }, T0);
  d = setWm(d, { field: 'text', value: 'WM-ONCE' }, T0);
  const onPages = pdfPages(Buffer.from(await renderDocPdfBytes(d))).map((p) => pageText(p));
  assert.ok(onPages.length >= 3, `multipage (${onPages.length} pages)`);
  onPages.forEach((t, i) => {
    assert.equal(countOf(t, 'WM-ONCE'), 1, `page ${i + 1}: watermark drawn exactly once`);
  });
  // Enabled + blank text: the layer is not mounted - byte-identical to
  // the watermark-off baseline render (nothing rendered at all).
  const blank = setWm(d, { field: 'text', value: '' }, T0);
  const blankBytes = Buffer.from(await renderDocPdfBytes(blank));
  assert.ok(blankBytes.equals(freshRender),
    'enabled-but-blank watermark is byte-identical to the baseline (layer not mounted)');
});

await test('10.12 band LAYOUT: on-page, inside the margin bands, no body overlap (pdfjs positions)', async () => {
  // Real glyph positions from pdfjs (not props, not raw stream guesses).
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const task = pdfjs.getDocument({
    data: new Uint8Array(freshRender), // COPY: pdfjs detaches its input
    useWorkerFetch: false,
    isEvalSupported: false,
    useSystemFonts: false,
    standardFontDataUrl:
      path.join(root, 'node_modules', 'pdfjs-dist', 'standard_fonts').replace(/\\/g, '/') + '/',
    verbosity: 0,
  });
  const pdf = await task.promise;
  try {
    assert.equal(pdf.numPages, 3, 'multipage default fixture');
    const A4 = { w: 595.28, h: 841.89 };
    const margin = 25 * (72 / 25.4); // fixture margins: 25 mm = 70.87 pt
    const HEADER_Y = 775; // above the content top (771.0) = top margin band
    const FOOTER_Y = 65; // below the content bottom (70.87) = bottom margin band
    for (let i = 1; i <= pdf.numPages; i += 1) {
      const page = await pdf.getPage(i);
      const items = (await page.getTextContent()).items
        .filter((it) => it.str && it.str.trim() !== '')
        .map((it) => ({ x: it.transform[4], y: it.transform[5], s: it.str }));
      for (const it of items) {
        assert.ok(it.y > -1 && it.y < A4.h + 1,
          `page ${i}: every glyph ON the page (y=${it.y.toFixed(1)}: ${JSON.stringify(it.s.slice(0, 28))})`);
        assert.ok(it.x > -1 && it.x < A4.w + 1,
          `page ${i}: every glyph within the page width (x=${it.x.toFixed(1)})`);
      }
      const header = items.filter((it) => it.y > HEADER_Y);
      const footer = items.filter((it) => it.y < FOOTER_Y);
      const body = items.filter((it) => it.y >= FOOTER_Y && it.y <= HEADER_Y);
      const textOf = (arr) => arr.map((it) => it.s).join(' ');
      if (i === 1) {
        assert.equal(header.length, 0, 'page 1: header band suppressed (nothing above the content area)');
        assert.equal(footer.length, 0, 'page 1: footer band suppressed (nothing below the content area)');
        continue;
      }
      assert.ok(has(textOf(header), 'SOP-POC-004'), `page ${i}: header cell inside the top margin band`);
      assert.ok(has(textOf(header), `Page ${i} of 3`), `page ${i}: header numbering inside the top band`);
      assert.ok(has(textOf(footer), 'DocStudio Proof-of-Concept Laboratory'),
        `page ${i}: footer cell inside the bottom margin band`);
      assert.ok(has(textOf(footer), `Page ${i} of 3`),
        `page ${i}: footer numbering VISIBLE at the bottom (DEC-006 class fixed on this path)`);
      // No overlap: body strictly between the two bands.
      const bodyTop = Math.max(...body.map((it) => it.y));
      const bodyBottom = Math.min(...body.map((it) => it.y));
      assert.ok(bodyTop < Math.min(...header.map((it) => it.y)),
        `page ${i}: body stays below the header band (bodyTop=${bodyTop.toFixed(1)} < header=${Math.min(...header.map((it) => it.y)).toFixed(1)})`);
      assert.ok(bodyBottom > Math.max(...footer.map((it) => it.y)),
        `page ${i}: body stays above the footer band (bodyBottom=${bodyBottom.toFixed(1)} > footer=${Math.max(...footer.map((it) => it.y)).toFixed(1)})`);
      // Printable column confinement (horizontal margins respected).
      for (const it of [...header, ...footer]) {
        assert.ok(it.x > margin - 5 && it.x < A4.w - margin,
          `page ${i}: band glyph inside the printable column (x=${it.x.toFixed(1)})`);
      }
      // Per-cell alignment from the settings: default grid = left cell
      // left-aligned, right cell right-aligned within its half-column.
      const leftCell = header.find((it) => it.s.includes('SOP-POC-004'));
      const rightCell = header.find((it) => it.s.includes(`Page ${i} of 3`));
      assert.ok(leftCell && rightCell, `page ${i}: both header cells located`);
      assert.ok(leftCell.x < A4.w / 2 && rightCell.x > A4.w / 2,
        `page ${i}: cell alignment honored (left x=${leftCell.x.toFixed(1)}, right x=${rightCell.x.toFixed(1)})`);
    }
  } finally {
    await pdf.destroy();
  }
});

await test('10.13 DEC-006 evidence: real path clean, legacy gallery surface still defective (stays OPEN)', () => {
  const inflateAll = (buf) => {
    const text = latin1(buf);
    const out = [];
    const re = /\bstream\r?\n/g;
    let m;
    while ((m = re.exec(text)) !== null) {
      const start = m.index + m[0].length;
      const end = text.indexOf('endstream', start);
      if (end === -1) break;
      try { out.push(zlib.inflateSync(buf.subarray(start, end)).toString('latin1')); } catch { /* skip */ }
      re.lastIndex = end;
    }
    return out.join('\n');
  };
  // Real document path: configured grid - NO off-page footer transform.
  const freshSig = inflateAll(freshRender).match(/1 0 0 1 0 -\d[\d.]* cm/g) || [];
  assert.equal(freshSig.length, 0,
    'real path carries no off-page footer transforms (DEC-006 class fixed here by DEC-008)');
  // Legacy surface: the P04-M3 gallery still mounts `PocPageFurniture`,
  // whose bottom-anchored `render` footer keeps the recorded defect - so
  // DEC-006 REMAINS APPLICABLE and stays OPEN (disposition updated with
  // this evidence in project_roadmap.md).
  const gallery = fs.readFileSync(path.join(root, 'fixtures', 'p04-m3', 'theme-gallery.pdf'));
  const legacySig = inflateAll(gallery).match(/1 0 0 1 0 -\d[\d.]* cm/g) || [];
  console.log(`      (legacy gallery off-page transforms: ${legacySig.slice(0, 3).join(', ')}${legacySig.length > 3 ? ', ...' : ''})`);
  assert.ok(legacySig.length > 0,
    'legacy PocPageFurniture footer defect still present in the P04-M3 gallery - DEC-006 stays OPEN');
});

// ═══════════════════════════════════════════════════════════════════════════
// 11. Panel: real jsdom + real React runtime (AFTER all PDF rendering)
// ═══════════════════════════════════════════════════════════════════════════
group('panel: HeaderFooterPanel under a real jsdom');

const dom = new JSDOM('<!doctype html><html><body></body></html>', {
  url: 'http://localhost/',
  pretendToBeVisual: true,
});
const defineGlobal = (key, value) =>
  Object.defineProperty(globalThis, key, { value, configurable: true, writable: true });
defineGlobal('window', dom.window);
defineGlobal('document', dom.window.document);
defineGlobal('navigator', dom.window.navigator);
for (const key of [
  'HTMLElement', 'HTMLInputElement', 'HTMLSelectElement', 'HTMLTextAreaElement',
  'Element', 'Node', 'Event', 'MouseEvent', 'FocusEvent',
  'getComputedStyle', 'requestAnimationFrame', 'cancelAnimationFrame',
]) {
  if (dom.window[key] !== undefined) defineGlobal(key, dom.window[key]);
}
defineGlobal('IS_REACT_ACT_ENVIRONMENT', true);

// The panel imports its stylesheet; in CommonJS that import is stubbed here.
require.extensions['.css'] = () => {};

const React = require('react');
const { act } = React;
const { createRoot } = require('react-dom/client');
const { HeaderFooterPanel } = pick(
  path.join(CACHE, 'components', 'left-panel', 'HeaderFooterPanel.js'),
  path.join(CACHE, 'src', 'components', 'left-panel', 'HeaderFooterPanel.js'),
);

// ── Mount harness: real component + real service (mirrors App handlers) ─────
let mounted = null;

async function mount(initialDoc = buildPocFixture()) {
  const container = dom.window.document.createElement('div');
  dom.window.document.body.appendChild(container);
  const root = createRoot(container);
  const api = { bandCalls: 0, wmCalls: 0, getDoc: () => initialDoc };

  function Harness() {
    const [doc, setDoc] = React.useState(initialDoc);
    const docRef = React.useRef(initialDoc);
    React.useEffect(() => {
      docRef.current = doc;
    });
    api.getDoc = () => docRef.current;
    const onBandChange = React.useCallback((kind, patch) => {
      api.bandCalls += 1;
      const result = applyHeaderFooterPatch(docRef.current, kind, patch, STAMP, genId);
      if (result.ok && result.changed) {
        docRef.current = result.doc;
        setDoc(result.doc);
      }
      return result;
    }, []);
    const onWatermarkChange = React.useCallback((patch) => {
      api.wmCalls += 1;
      const result = applyWatermarkPatch(docRef.current, patch, STAMP);
      if (result.ok && result.changed) {
        docRef.current = result.doc;
        setDoc(result.doc);
      }
      return result;
    }, []);
    return React.createElement(HeaderFooterPanel, {
      headerFooter: doc.headerFooter,
      displayHeaderEnabled: doc.pageTypography.displayHeader,
      onBandChange,
      onWatermarkChange,
    });
  }

  await act(async () => {
    root.render(React.createElement(Harness));
  });
  mounted = { container, root, api };
  return mounted;
}

async function unmount() {
  if (mounted === null) return;
  const { container, root } = mounted;
  await act(async () => {
    root.unmount();
  });
  container.remove();
  mounted = null;
}

// ── DOM / interaction helpers ──────────────────────────────────────────────
const q = (sel) => mounted.container.querySelector(sel);
const qa = (sel) => [...mounted.container.querySelectorAll(sel)];
const byButtonText = (text) => qa('button').find((b) => b.textContent.trim() === text);
const confirmButtons = () => [...q('.hf-confirm').querySelectorAll('button')];
const hf = () => mounted.api.getDoc().headerFooter;

/** Deliver text through the REAL controlled-input path (native value setter). */
async function typeInto(el, value) {
  await act(async () => {
    Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype, 'value').set.call(el, value);
    el.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
  });
}
/** Change a <select> the way the engine does (native setter + change). */
async function choose(el, value) {
  await act(async () => {
    Object.getOwnPropertyDescriptor(dom.window.HTMLSelectElement.prototype, 'value').set.call(el, value);
    el.dispatchEvent(new dom.window.Event('change', { bubbles: true }));
  });
}
async function click(el) {
  await act(async () => {
    el.click();
  });
}
const activeInput = () => dom.window.document.activeElement;

await test('11.1 panel renders both band editors, watermark group, default grid 1 × 2', async () => {
  await mount();
  assert.ok(q('[role="group"][aria-label="Header and footer settings"]'), 'panel root');
  assert.ok(q('fieldset[aria-label="Header band"]'), 'header editor');
  assert.ok(q('fieldset[aria-label="Footer band"]'), 'footer editor');
  assert.ok(q('fieldset[aria-label="Watermark"]'), 'watermark editor');
  assert.equal(q('#hf-header-enabled').checked, true, 'header starts enabled');
  assert.equal(q('#hf-header-suppress').checked, true, 'header starts suppressing page 1');
  assert.equal(q('#hf-header-page-number').value, 'Page X of Y', 'numbering select bound to the document');
  assert.equal(q('.hf-grid-size').textContent.trim(), '1 × 2', 'grid size readout');
  assert.equal(qa('input[aria-label^="Header row"]').length, 2, 'two header cell inputs');
  assert.equal(qa('input[aria-label^="Footer row"]').length, 2, 'two footer cell inputs');
  assert.ok(byButtonText('+ Row'), 'add-row button');
  assert.ok(byButtonText('+ Column'), 'add-column button');
  assert.equal(q('#hf-watermark-enabled').checked, false, 'watermark starts disabled');
  await unmount();
});

await test('11.2 displayHeader=false shows the §8.4 composition hint (no hidden switch)', async () => {
  const doc = buildPocFixture();
  doc.pageTypography = { ...doc.pageTypography, displayHeader: false };
  await mount(doc);
  const hint = q('fieldset[aria-label="Header band"] .hf-hint');
  assert.ok(hint && hint.textContent.includes('Display header'), 'hint explains both switches');
  await unmount();
});

await test('11.3 enable toggle commits through the real service', async () => {
  await mount();
  await click(q('#hf-header-enabled'));
  assert.equal(hf().header.enabled, false, 'header disabled in the document');
  assert.equal(hf().footer.enabled, true, 'footer untouched');
  assert.equal(mounted.api.bandCalls, 1, 'exactly one dispatch');
  assert.equal(q('#hf-header-enabled').checked, false, 'checkbox reflects the document');
  await click(q('#hf-header-enabled'));
  assert.equal(hf().header.enabled, true, 'toggled back on');
  await unmount();
});

await test('11.4 page-number select applies each §9 mode to the band', async () => {
  await mount();
  await choose(q('#hf-header-page-number'), 'none');
  assert.equal(hf().header.pageNumberFormat, 'none');
  assert.equal(q('#hf-header-page-number').value, 'none', 'controlled select shows the value');
  await choose(q('#hf-header-page-number'), 'X/Y');
  assert.equal(hf().header.pageNumberFormat, 'X/Y');
  assert.equal(hf().footer.pageNumberFormat, 'Page X of Y', 'footer band independent');
  await unmount();
});

await test('11.5 cell edit and alignment selects bind to the authoritative grid', async () => {
  await mount();
  const cellInput = q('input[aria-label="Header row 1 cell 1 content"]');
  assert.equal(cellInput.value, '{documentId}', 'controlled input shows stored content');
  await typeInto(cellInput, 'EDITED-HEADER-L');
  assert.equal(hf().header.rows[0].cells[0].content, 'EDITED-HEADER-L');
  assert.equal(cellInput.value, 'EDITED-HEADER-L', 'input stays controlled');

  await choose(q('select[aria-label="Header row 1 cell 1 horizontal alignment"]'), 'right');
  assert.equal(hf().header.rows[0].cells[0].hAlign, 'right');
  await choose(q('select[aria-label="Header row 1 cell 1 vertical alignment"]'), 'bottom');
  assert.equal(hf().header.rows[0].cells[0].vAlign, 'bottom');
  await unmount();
});

await test('11.6 “+ Row” grows the grid and focus FOLLOWS the new cell', async () => {
  await mount();
  await click(byButtonText('+ Row'));
  assert.equal(hf().header.rows.length, 2, 'row added to the document');
  assert.equal(q('.hf-grid-size').textContent.trim(), '2 × 2', 'readout updated');
  const newCell = q('input[aria-label="Header row 2 cell 1 content"]');
  assert.ok(newCell, 'new row cell rendered');
  assert.equal(activeInput(), newCell, 'focus followed the new cell');
  await unmount();
});

await test('11.7 “+ Column” grows every row and focus FOLLOWS the new cell', async () => {
  await mount();
  await click(byButtonText('+ Column'));
  assert.equal(hf().header.columnCount, 3, 'column count grew');
  assert.ok(hf().header.rows.every((r) => r.cells.length === 3), 'every row grew');
  assert.equal(q('.hf-grid-size').textContent.trim(), '1 × 3', 'readout updated');
  const newCell = q('input[aria-label="Header row 1 cell 3 content"]');
  assert.ok(newCell, 'new column cell rendered');
  assert.equal(activeInput(), newCell, 'focus followed the new cell');
  await unmount();
});

await test('11.8 removing a text row is two-step: confirm-required → confirmed force', async () => {
  await mount();
  await click(byButtonText('+ Row')); // row 2 (empty)
  const newCell = q('input[aria-label="Header row 2 cell 1 content"]');
  await typeInto(newCell, 'TEMP-ROW');
  assert.equal(hf().header.rows[1].cells[0].content, 'TEMP-ROW');

  await click(q('button[aria-label="Remove header row 2"]'));
  assert.equal(hf().header.rows.length, 2, 'nothing removed before confirmation');
  assert.ok(q('.hf-confirm'), 'inline confirmation shown');
  assert.ok(q('.hf-confirm .hf-confirm-msg').textContent.includes('Confirm to remove'));
  assert.ok(!q('fieldset[aria-label="Header band"] .hf-error'), 'confirm-required is not an error');

  await click(confirmButtons().find((b) => b.textContent.trim() === 'Cancel'));
  assert.equal(hf().header.rows.length, 2, 'cancel keeps the row');
  assert.ok(!q('.hf-confirm'), 'confirmation dismissed');

  await click(q('button[aria-label="Remove header row 2"]'));
  await click(confirmButtons().find((b) => b.textContent.trim() === 'Remove'));
  assert.equal(hf().header.rows.length, 1, 'confirmed removal deleted the row');
  assert.ok(!q('.hf-confirm'), 'confirmation cleared');
  await unmount();
});

await test('11.9 empty-row removal skips confirmation; last-row button is disabled', async () => {
  await mount();
  await click(byButtonText('+ Row'));
  await click(q('button[aria-label="Remove header row 2"]'));
  assert.equal(hf().header.rows.length, 1, 'empty row removed directly');
  assert.ok(!q('.hf-confirm'), 'no confirmation needed for empty content');
  const lastRemove = q('button[aria-label="Remove header row 1"]');
  assert.equal(lastRemove.disabled, true, 'last row cannot be removed from the UI');
  await unmount();
});

await test('11.10 watermark controls: enable, text, numeric drafts, range error inline', async () => {
  await mount();
  await click(q('#hf-watermark-enabled'));
  assert.equal(hf().watermark.enabled, true);

  await typeInto(q('#hf-watermark-text'), 'DRAFT-ONLY');
  assert.equal(hf().watermark.text, 'DRAFT-ONLY');

  await typeInto(q('#hf-watermark-opacity'), '0.77');
  assert.equal(hf().watermark.opacity, 0.77, 'draft parsed to a number');
  await typeInto(q('#hf-watermark-rotation'), '30');
  assert.equal(hf().watermark.rotationDeg, 30);
  await typeInto(q('#hf-watermark-font-size'), '80');
  assert.equal(hf().watermark.fontSizePt, 80);
  await typeInto(q('#hf-watermark-pos-x'), '0.25');
  assert.equal(hf().watermark.positionX, 0.25);
  await typeInto(q('#hf-watermark-pos-y'), '0.75');
  assert.equal(hf().watermark.positionY, 0.75);

  // Out-of-range input: inline error, nothing committed.
  await typeInto(q('#hf-watermark-opacity'), '5');
  assert.equal(hf().watermark.opacity, 0.77, 'out-of-range NOT committed');
  const err = q('fieldset[aria-label="Watermark"] .hf-error');
  assert.ok(err, 'inline error shown');
  assert.ok(err.textContent.includes('between 0 and 1'), `understandable message: “${err.textContent}”`);

  // A valid value clears the error again.
  await typeInto(q('#hf-watermark-opacity'), '0.6');
  assert.equal(hf().watermark.opacity, 0.6);
  assert.ok(!q('fieldset[aria-label="Watermark"] .hf-error'), 'error cleared after a valid fix');
  await unmount();
});

await test('11.11 watermark colour applies through the NATIVE listener (DEF-001 pattern)', async () => {
  await mount();
  const color = q('#hf-watermark-color');
  assert.ok(color && color.type === 'color');

  // Native path (the picker delivers through the internal setter).
  await act(async () => {
    Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype, 'value').set.call(color, '#123456');
    color.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
  });
  assert.equal(hf().watermark.color, '#123456', 'native input event applied the colour');

  // JS-setter path: React's value tracker stays fresh so its synthetic
  // onChange is SUPPRESSED — only the native listener can still apply it.
  await act(async () => {
    color.value = '#654321';
    color.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
  });
  assert.equal(hf().watermark.color, '#654321', 'native listener applied even when React onChange is suppressed');
  assert.equal(q('.hf-color-value').textContent, '#654321', 'swatch label follows the authoritative colour');

  // Uppercase input is canonicalised by the service.
  await act(async () => {
    Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype, 'value').set.call(color, '#AABBCC');
    color.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
  });
  assert.equal(hf().watermark.color, '#aabbcc', 'stored canonicalised');
  await unmount();
});

await test('11.12 token insert button writes the documented token at the caret', async () => {
  await mount();
  const cell = q('input[aria-label="Header row 1 cell 1 content"]');
  await act(async () => {
    cell.focus();
    cell.setSelectionRange(0, 0);
  });
  const tokenBtn = qa('button').find((b) => b.getAttribute('title') === 'Insert {pageNumber} at the cursor');
  assert.ok(tokenBtn, 'token button rendered');
  assert.equal(tokenBtn.disabled, false, 'enabled once a cell is focused');
  await click(tokenBtn);
  assert.equal(hf().header.rows[0].cells[0].content, '{pageNumber}{documentId}', 'token inserted at caret');
  await unmount();
});

await test('11.13 panel-edited settings survive serialize → deserialize', async () => {
  await mount();
  await click(q('#hf-header-enabled'));
  await typeInto(q('input[aria-label="Header row 1 cell 1 content"]'), 'PANEL-PERSIST');
  await click(q('#hf-watermark-enabled'));
  await typeInto(q('#hf-watermark-text'), 'PANEL-WM');
  const doc = mounted.api.getDoc();
  const back = deserializeDocument(serializeDocument(doc));
  assert.equal(JSON.stringify(back.headerFooter), JSON.stringify(doc.headerFooter), 'settings round-trip intact');
  await unmount();
});

// ── Summary ────────────────────────────────────────────────────────────────
fs.rmSync(CACHE, { recursive: true, force: true });

console.log(`\nP06-M1: ${passed} passed, ${failed.length} failed`);
console.log('PDF artifacts: fixtures/p06-m1/');
if (failed.length > 0) {
  for (const name of failed) console.log(`  FAILED: ${name}`);
  process.exit(1);
}
process.exit(0);
