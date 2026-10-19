/**
 * DocStudio — P05-M4 verification suite (tables and spacing)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Verifies §10.5 (Table Block) plus the §6/§10 spacing guarantees against
 * the REAL compiled modules (no mocks), following the verify_p05_m1/m2/m3
 * conventions:
 *
 *  1–11  Table actions & data integrity — factory output, row/column
 *        operations at start/middle/end, rectangularity, fresh IDs,
 *        minimum size, ragged/merged-cell refusal, header toggle and
 *        designation, header-style source policy, caption lifecycle,
 *        validation codes, no-op reference stability, input immutability.
 * 12–21  Cell content/alignment ops, dispatcher, error contracts.
 * 22–26  Persistence — serialize/deserialize/re-edit round trip, old
 *        schema-v1 compatibility (optional field absent), P05-M1/M2/M3
 *        regressions.
 * 27–37  Renderer & layout — width allocation policy, row-height
 *        estimate, header-style byte evidence (theme default preserved,
 *        explicit treatments distinct), header on/off and designation,
 *        caption gating, alignment/formatting, wrapping, multi-page
 *        flow, oversized-row content preservation, wide tables,
 *        monochrome readability, and the P02-M4 baseline byte guard.
 *
 * Known limitation (recorded, tested as "not applicable"): the renderer
 * does NOT repeat header rows on continuation pages — react-pdf has no
 * table primitive or repeat mechanism.  Assigned to Phase 08.
 *
 * Run: npm run verify:p05-m4
 */

import { execSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import assert from 'node:assert/strict';

const root = process.cwd();
const require = createRequire(path.join(root, 'package.json'));

// ── Compile the real modules to CommonJS in node_modules/.cache ─────────────
// The output must live INSIDE the project tree so `react` and
// `@react-pdf/renderer` resolve at require-time (same pattern as
// verify_p05_m2/m3).  `--jsx react-jsx` is required because the
// renderer entry references JSX.
const outDir = path.join(root, 'node_modules', '.cache', 'ds-p05-m4-verify');
execSync(
  'npx tsc src/renderer/poc/poc-node-entry.ts' +
    ' src/services/table-content.ts src/services/list-numbering.ts' +
    ' src/services/list-callout-content.ts' +
    ' src/services/rich-text.ts src/services/block-content.ts' +
    ' src/services/block-actions.ts src/services/block-registry.ts' +
    ` --outDir "${outDir}" --module commonjs --target es2020 --moduleResolution node` +
    ' --esModuleInterop --skipLibCheck --jsx react-jsx',
  { cwd: root, stdio: 'inherit' },
);

const poc = require(path.join(outDir, 'renderer', 'poc', 'poc-node-entry.js'));
const tableContent = require(path.join(outDir, 'services', 'table-content.js'));
const blockActions = require(path.join(outDir, 'services', 'block-actions.js'));
const listCallout = require(path.join(outDir, 'services', 'list-callout-content.js'));
const blockContent = require(path.join(outDir, 'services', 'block-content.js'));
const file = require(path.join(outDir, 'services', 'document-file.js'));
const defaults = require(path.join(outDir, 'types', 'defaults.js'));
const bodyThemes = require(path.join(outDir, 'services', 'body-theme-tokens.js'));

const {
  COLUMN_FRACTIONS,
  allocateTableColumnWidths,
  estimateRowHeightPt,
  tableColumnCount,
  TABLE_HEADER_STYLES,
  H_ALIGNMENTS,
  MIN_TABLE_ROWS,
  MIN_TABLE_COLUMNS,
  MAX_TABLE_CAPTION_LENGTH,
  updateTableSettings,
  setTableCellText,
  setTableCellAlignment,
  addTableRow,
  removeTableRow,
  addTableColumn,
  removeTableColumn,
  applyTableContentAction,
  computeHeadingNumbering,
  renderDocPdfBytes,
  buildPocFixture,
  computePocLayout,
} = poc;
const { createBlock, insertBlock, duplicateBlock, reorderBlock, deleteBlock, updateBlockSpacing } =
  blockActions;
const { updateListSettings, updateCalloutContent } = listCallout;
const { updateHeadingContent, updateParagraphContent } = blockContent;
const { serializeDocument, deserializeDocument, validateDocument } = file;
const { createDefaultDocument } = defaults;
const { resolveBodyTheme } = bodyThemes;

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
const T0 = '2026-10-19T10:00:00.000Z';
const T1 = '2026-10-19T11:00:00.000Z';
let seq = 0;
/** Deterministic ID generator for block/row/cell IDs (tests only). */
const genId = () => `10800000-0000-4000-8000-${String(++seq).padStart(12, '0')}`;
const opts = () => ({ now: T1, genId });
const newDoc = () => createDefaultDocument('doc-p05-m4', T0);
const snap = (doc) => JSON.stringify(doc);
const approx = (a, b, eps = 1e-6) => assert.ok(Math.abs(a - b) <= eps, `${a} ≈ ${b}`);

/**
 * Build a table block.  `cellRows` is an array of row arrays; a cell is a
 * plain string or a spec {text|spans, hAlign, colSpan, rowSpan, isHeader}.
 * cfg = { hasHeaderRow, headerStyle, headerStyleSource, caption }.
 */
function tableBlock(cellRows, cfg = {}) {
  const block = createBlock('table', genId);
  block.data = {
    ...block.data,
    rows: cellRows.map((cells) => ({
      id: genId(),
      cells: cells.map((cell) => {
        const spec = typeof cell === 'string' ? { text: cell } : cell;
        return {
          id: genId(),
          spans: spec.spans ?? [{ text: spec.text ?? '' }],
          hAlign: spec.hAlign ?? 'left',
          colSpan: spec.colSpan ?? 1,
          rowSpan: spec.rowSpan ?? 1,
          isHeader: spec.isHeader ?? false,
        };
      }),
    })),
    hasHeaderRow: cfg.hasHeaderRow ?? false,
    headerStyle: cfg.headerStyle ?? 'light',
    ...(cfg.headerStyleSource !== undefined ? { headerStyleSource: cfg.headerStyleSource } : {}),
    ...(cfg.caption !== undefined ? { caption: cfg.caption } : {}),
  };
  return block;
}

/** A document containing exactly the given blocks (envelope untouched). */
function docWith(blocks) {
  const doc = newDoc();
  doc.blocks = blocks;
  return doc;
}

/**
 * Render-test document: same envelope, but the default COVER page is
 * disabled so page counts and colour assertions reflect the BODY content
 * alone (the cover uses cover-theme ink, which is outside the body-theme
 * monochrome contract — see test 36).
 */
function renderDoc(blocks) {
  const doc = newDoc();
  doc.frontPage = { ...doc.frontPage, enabled: false };
  doc.blocks = blocks;
  return doc;
}

/** Render a document to PDF bytes (async helper). */
const render = (doc) => renderDocPdfBytes(doc);

/** Dimensions + rectangularity assertions. */
const rowCount = (data) => data.rows.length;
const colCount = (data) => (data.rows.length > 0 ? data.rows[0].cells.length : 0);
const isRect = (data) =>
  data.rows.length > 0 && data.rows.every((r) => r.cells.length === data.rows[0].cells.length);
const allIds = (data) => [
  ...data.rows.map((r) => r.id),
  ...data.rows.flatMap((r) => r.cells.map((c) => c.id)),
];

// ── PDF extraction (same proven approach as verify_p02_m4 / p05_m3) ─────────
const latin1 = (bytes) => Buffer.from(bytes).toString('latin1');
const pageCount = (bytes) => (latin1(bytes).match(/\/Type\s*\/Page[^s]/g) || []).length;

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
  return strings.join(' ');
}

/** Every DeviceRGB scn colour triple in the content stream. */
function scnColors(bytes) {
  const content = inflateStreams(bytes);
  const out = [];
  const re = /([-\d.]+)\s+([-\d.]+)\s+([-\d.]+)\s+scn/g;
  let m;
  while ((m = re.exec(content)) !== null) {
    out.push([Number(m[1]), Number(m[2]), Number(m[3])]);
  }
  return out;
}

// ═══════════════════════════════════════════════════════════════════════════
// 1–3. Model, factories and width policy
// ═══════════════════════════════════════════════════════════════════════════

await test('1. registry table factory produces the spec default 2×2 table', () => {
  const { BLOCK_REGISTRY } = require(path.join(outDir, 'services', 'block-registry.js'));
  const block = BLOCK_REGISTRY.table.createDefault();
  assert.equal(block.data.type, 'table');
  assert.equal(rowCount(block.data), 2, 'default table has 2 rows');
  assert.equal(colCount(block.data), 2, 'default table has 2 columns');
  assert.equal(block.data.hasHeaderRow, true, 'default table highlights its header row');
  assert.equal(block.data.headerStyle, 'light');
  assert.equal('headerStyleSource' in block.data, false, 'no override field on a fresh default');
  assert.ok(isRect(block.data), 'default table is rectangular');
  for (const cell of block.data.rows.flatMap((r) => r.cells)) {
    assert.equal(cell.colSpan, 1);
    assert.equal(cell.rowSpan, 1);
  }
  // Header cells are explicitly flagged and centred by the template factory.
  assert.ok(block.data.rows[0].cells.every((c) => c.isHeader && c.hAlign === 'center'));
  // IDs are stable and present.
  const ids = allIds(block.data);
  assert.equal(new Set(ids).size, ids.length, 'all row/cell IDs unique');
});

await test('2. template table factory: sparse rows padded, empty headers disable the header row', () => {
  const { createTemplateTableBlock } = require(path.join(outDir, 'types', 'template-defaults.js'));
  const sparse = createTemplateTableBlock(['A', 'B', 'C'], [['only'], ['x', 'y', 'z']]);
  assert.equal(rowCount(sparse.data), 3, 'one header row + two body rows');
  assert.ok(isRect(sparse.data), 'sparse rows are padded to the full column count');
  assert.equal(sparse.data.rows[1].cells.length, 3, 'short row padded with empty cells');
  assert.deepEqual(sparse.data.rows[1].cells[2].spans, [{ text: '' }], 'padded cell empty');

  const headerless = createTemplateTableBlock([], [['a', 'b']]);
  assert.equal(headerless.data.hasHeaderRow, false, 'no headers → no designated header row');
  assert.ok(isRect(headerless.data));
});

await test('3. width allocation: totals the content width for 1/2/3/4/5/7/12 columns, legacy raw at 4, equal beyond 4', () => {
  const cw = 500;
  for (const n of [1, 2, 3, 4, 5, 7, 12]) {
    const w = allocateTableColumnWidths(n, cw);
    assert.equal(w.length, n, `${n} widths produced`);
    for (const x of w) {
      assert.ok(Number.isFinite(x), 'width is finite');
      assert.ok(x > 0, 'width is positive');
    }
    approx(
      w.reduce((a, b) => a + b, 0),
      cw,
      1e-6,
      `widths for ${n} columns total the content width`,
    );
  }
  // Exactly 4 columns = the designed PoC fractions used raw (byte identity).
  const four = allocateTableColumnWidths(4, cw);
  four.forEach((x, i) => approx(x, cw * COLUMN_FRACTIONS[i], 0));
  // 5+ columns = equal distribution (the old fixed list overflowed the page).
  allocateTableColumnWidths(5, cw).forEach((x) => approx(x, 100, 1e-9));
  allocateTableColumnWidths(12, cw).forEach((x) => approx(x, cw / 12, 1e-9));
  // Non-finite inputs collapse to finite values, never NaN/negatives.
  assert.deepEqual(allocateTableColumnWidths(0, cw), []);
  assert.deepEqual(allocateTableColumnWidths(4, NaN), [0, 0, 0, 0]);
  // The ragged-row fallback (equal share) stays finite.
  assert.equal(tableColumnCount(tableBlock([['a'], ['b', 'c', 'd']]).data), 3, 'count = widest row');
});

// ═══════════════════════════════════════════════════════════════════════════
// 4–9. Row and column operations (§4.4)
// ═══════════════════════════════════════════════════════════════════════════

await test('4. row insertion at start/middle/end: rectangular, fresh unique IDs, inputs untouched', () => {
  const table = tableBlock([
    ['H1', 'H2'],
    ['a', 'b'],
    ['c', 'd'],
  ]);
  const doc = docWith([table]);
  const before = snap(doc);
  const blockId = table.id;

  const atStart = addTableRow(doc, blockId, { kind: 'start' }, opts());
  assert.equal(atStart.ok && atStart.changed, true);
  assert.equal(rowCount(atStart.doc.blocks[0].data), 4);
  assert.ok(isRect(atStart.doc.blocks[0].data), 'still rectangular after start insert');
  assert.equal(atStart.doc.blocks[0].data.rows[1].id, table.data.rows[0].id, 'old rows keep IDs');
  assert.equal(atStart.doc.blocks[0].data.rows[0].cells.length, 2, 'new row matches column count');
  assert.equal(atStart.rowId, atStart.doc.blocks[0].data.rows[0].id, 'focus hint returns new row');
  assert.equal(atStart.cellId, atStart.doc.blocks[0].data.rows[0].cells[0].id);

  const mid = addTableRow(atStart.doc, blockId, { kind: 'at', index: 2 }, opts());
  assert.equal(mid.ok && mid.changed, true);
  assert.equal(rowCount(mid.doc.blocks[0].data), 5);
  assert.ok(isRect(mid.doc.blocks[0].data));
  assert.equal(mid.doc.blocks[0].data.rows[2].id, mid.rowId, 'inserted exactly at index 2');

  const atEnd = addTableRow(mid.doc, blockId, { kind: 'end' }, opts());
  assert.equal(atEnd.ok && atEnd.changed, true);
  assert.equal(rowCount(atEnd.doc.blocks[0].data), 6);
  assert.ok(isRect(atEnd.doc.blocks[0].data));

  // Fresh IDs are unique across the whole block; content rows unchanged.
  const ids = allIds(atEnd.doc.blocks[0].data);
  assert.equal(new Set(ids).size, ids.length, 'every row/cell ID unique');
  const finalRows = atEnd.doc.blocks[0].data.rows;
  assert.equal(finalRows[1].cells[0].spans[0].text, 'H1', 'original header row content at shifted index');
  assert.equal(finalRows[3].cells[0].spans[0].text, 'a', 'original row 1 content preserved');
  assert.equal(finalRows[4].cells[0].spans[0].text, 'c', 'original row 2 content preserved');
  assert.equal(snap(doc), before, 'input document unchanged');
  assert.equal(atEnd.doc.metadata.modifiedAt, T1, 'real change stamps modifiedAt');
  assert.equal(doc.metadata.modifiedAt, T0, 'input timestamp untouched');
});

await test('5. row removal at start/middle/end keeps the minimum and identity of survivors', () => {
  const table = tableBlock([['H1', 'H2'], ['a', 'b'], ['c', 'd'], ['e', 'f']]);
  const doc = docWith([table]);
  const blockId = table.id;
  const originalIds = allIds(table.data);

  const fromStart = removeTableRow(doc, blockId, table.data.rows[0].id, opts());
  assert.equal(fromStart.ok && fromStart.changed, true);
  assert.equal(rowCount(fromStart.doc.blocks[0].data), 3);
  assert.ok(isRect(fromStart.doc.blocks[0].data));

  const fromMiddle = removeTableRow(fromStart.doc, blockId, fromStart.doc.blocks[0].data.rows[1].id, opts());
  assert.equal(fromMiddle.ok && fromMiddle.changed, true);
  assert.equal(rowCount(fromMiddle.doc.blocks[0].data), 2);

  const fromEnd = removeTableRow(
    fromMiddle.doc,
    blockId,
    fromMiddle.doc.blocks[0].data.rows[1].id,
    opts(),
  );
  assert.equal(fromEnd.ok && fromEnd.changed, true);
  assert.equal(rowCount(fromEnd.doc.blocks[0].data), 1);

  // Survivor IDs come from the original set (no re-keying).
  for (const id of allIds(fromEnd.doc.blocks[0].data)) {
    assert.ok(originalIds.includes(id), `survivor ID ${id} preserved`);
  }
  assert.ok(fromEnd.cellId !== undefined && fromEnd.rowId !== undefined, 'focus hints returned');
});

await test('6. column insertion at start/middle/end stays rectangular and inherits neighbour alignment', () => {
  const table = tableBlock([
    [{ text: 'H1', hAlign: 'center' }, { text: 'H2', hAlign: 'center' }],
    [{ text: 'a', hAlign: 'left' }, { text: 'b', hAlign: 'right' }],
  ]);
  const doc = docWith([table]);
  const blockId = table.id;
  const before = snap(doc);

  const atStart = addTableColumn(doc, blockId, { kind: 'start' }, opts());
  assert.equal(atStart.ok && atStart.changed, true);
  assert.equal(colCount(atStart.doc.blocks[0].data), 3);
  assert.ok(isRect(atStart.doc.blocks[0].data), 'every row gained a cell');
  // New first cell takes the alignment of the cell it precedes.
  assert.equal(atStart.doc.blocks[0].data.rows[1].cells[0].hAlign, 'left', 'inherits displaced cell');
  assert.deepEqual(atStart.doc.blocks[0].data.rows[1].cells[0].spans, [{ text: '' }], 'fresh cell empty');
  assert.equal(atStart.doc.blocks[0].data.rows[1].cells[2].hAlign, 'right', 'unaffected cell kept');

  const middle = addTableColumn(atStart.doc, blockId, { kind: 'at', index: 1 }, opts());
  assert.equal(middle.ok && middle.changed, true);
  assert.equal(colCount(middle.doc.blocks[0].data), 4);
  assert.ok(isRect(middle.doc.blocks[0].data));

  const atEnd = addTableColumn(middle.doc, blockId, { kind: 'end' }, opts());
  assert.equal(atEnd.ok && atEnd.changed, true);
  assert.equal(colCount(atEnd.doc.blocks[0].data), 5);
  assert.ok(isRect(atEnd.doc.blocks[0].data));
  assert.equal(atEnd.doc.blocks[0].data.rows[1].cells[4].hAlign, 'right', 'end cell inherits last');

  const ids = allIds(atEnd.doc.blocks[0].data);
  assert.equal(new Set(ids).size, ids.length, 'fresh cell IDs unique');
  assert.equal(snap(doc), before, 'input document unchanged');
});

await test('7. column removal at start/middle/end updates every row consistently', () => {
  const table = tableBlock([
    ['H1', 'H2', 'H3'],
    ['a', 'b', 'c'],
    ['d', 'e', 'f'],
  ]);
  const doc = docWith([table]);
  const blockId = table.id;

  const start = removeTableColumn(doc, blockId, 0, opts());
  assert.equal(start.ok && start.changed, true);
  assert.equal(colCount(start.doc.blocks[0].data), 2);
  assert.ok(isRect(start.doc.blocks[0].data));
  assert.equal(start.doc.blocks[0].data.rows[1].cells[0].spans[0].text, 'b', 'column 0 gone');

  const middle = removeTableColumn(start.doc, blockId, 1, opts());
  assert.equal(middle.ok && middle.changed, true);
  assert.equal(colCount(middle.doc.blocks[0].data), 1);
  assert.ok(isRect(middle.doc.blocks[0].data));

  const endDoc = (() => {
    const t = tableBlock([['a', 'b'], ['c', 'd']]);
    return docWith([t]);
  })();
  const end = removeTableColumn(endDoc, endDoc.blocks[0].id, 1, opts());
  assert.equal(end.ok && end.changed, true);
  assert.equal(colCount(end.doc.blocks[0].data), 1);
  assert.equal(end.doc.blocks[0].data.rows[0].cells[0].spans[0].text, 'a', 'kept the first column');
});

await test('8. minimum size: the final row/column can never be removed', () => {
  const oneByOne = tableBlock([['only']]);
  const doc = docWith([oneByOne]);
  const blockId = oneByOne.id;
  const before = snap(doc);

  const rowOut = removeTableRow(doc, blockId, oneByOne.data.rows[0].id, opts());
  assert.equal(rowOut.ok, false);
  assert.equal(rowOut.code, 'at-minimum-rows');
  assert.equal(rowOut.message, 'A table must keep at least one row.');

  const colOut = removeTableColumn(doc, blockId, 0, opts());
  assert.equal(colOut.ok, false);
  assert.equal(colOut.code, 'at-minimum-columns');
  assert.equal(colOut.message, 'A table must keep at least one column.');

  // Constants exported for the UI's truthful disabled states.
  assert.equal(MIN_TABLE_ROWS, 1);
  assert.equal(MIN_TABLE_COLUMNS, 1);
  assert.equal(snap(doc), before, 'both refusals leave the document untouched');
  assert.equal(rowCount(doc.blocks[0].data), 1, 'still exactly one row');
  assert.equal(colCount(doc.blocks[0].data), 1, 'still exactly one column');
});

await test('9. a deterministic op sequence keeps rectangularity, unique IDs and content', () => {
  let doc = docWith([
    tableBlock([
      ['H1', 'H2'],
      ['a', 'b'],
    ]),
  ]);
  const blockId = doc.blocks[0].id;
  const keepRowId = doc.blocks[0].data.rows[1].id; // the 'a' row survives the whole sequence
  const step = (result) => {
    assert.equal(result.ok && result.changed, true, 'step succeeds');
    doc = result.doc;
    assert.ok(isRect(doc.blocks[0].data), 'rectangular after every step');
    const ids = allIds(doc.blocks[0].data);
    assert.equal(new Set(ids).size, ids.length, 'IDs unique after every step');
  };
  step(addTableColumn(doc, blockId, { kind: 'end' }, opts())); // 2×3
  step(addTableRow(doc, blockId, { kind: 'start' }, opts())); // 3×3
  step(removeTableColumn(doc, blockId, 1, opts())); // 3×2 (middle column gone)
  step(removeTableRow(doc, blockId, doc.blocks[0].data.rows[1].id, opts())); // header row gone
  step(addTableRow(doc, blockId, { kind: 'end' }, opts())); // 3×2
  step(addTableColumn(doc, blockId, { kind: 'at', index: 1 }, opts())); // 3×3
  assert.equal(rowCount(doc.blocks[0].data), 3);
  assert.equal(colCount(doc.blocks[0].data), 3);
  // The row that survived every structural change kept its identity and content.
  const survivor = doc.blocks[0].data.rows.find((r) => r.id === keepRowId);
  assert.ok(survivor !== undefined, 'survivor row keeps its ID');
  assert.equal(survivor.cells[0].spans[0].text, 'a', 'survivor content intact');
  assert.equal(doc.metadata.modifiedAt, T1);
});

// ═══════════════════════════════════════════════════════════════════════════
// 10–16. Structure guards, cell operations and error contracts (§4.2/§4.3)
// ═══════════════════════════════════════════════════════════════════════════

await test('10. ragged tables refuse structural edits instead of silently repairing them', () => {
  const ragged = tableBlock([['a', 'b'], ['c']]);
  const doc = docWith([ragged]);
  const blockId = ragged.id;

  const add = addTableRow(doc, blockId, { kind: 'end' }, opts());
  assert.equal(add.ok, false);
  assert.equal(add.code, 'invalid-structure');
  assert.match(add.message, /inconsistent row lengths/);

  const addCol = addTableColumn(doc, blockId, { kind: 'end' }, opts());
  assert.equal(addCol.ok, false);
  assert.equal(addCol.code, 'invalid-structure');

  const rem = removeTableRow(doc, blockId, ragged.data.rows[0].id, opts());
  assert.equal(rem.ok, false);
  assert.equal(rem.code, 'invalid-structure');

  // Content ops still work on a ragged table (they address cells directly).
  const edit = setTableCellText(doc, blockId, ragged.data.rows[1].cells[0].id, 'edited', opts());
  assert.equal(edit.ok && edit.changed, true);
  assert.equal(edit.doc.blocks[0].data.rows[1].cells[0].spans[0].text, 'edited');

  // A row-less table also refuses structural edits with the honest reason.
  const empty = tableBlock([]);
  const emptyDoc = docWith([empty]);
  const onEmpty = addTableRow(emptyDoc, empty.id, { kind: 'end' }, opts());
  assert.equal(onEmpty.ok, false);
  assert.equal(onEmpty.code, 'invalid-structure');
  assert.match(onEmpty.message, /no rows/);
});

await test('11. merged cells (colSpan/rowSpan) refuse structural edits but keep content ops', () => {
  const merged = tableBlock([
    [{ text: 'wide', colSpan: 2 }, { text: 'b' }],
    ['c', 'd'],
  ]);
  const doc = docWith([merged]);
  const blockId = merged.id;
  const before = snap(doc);

  for (const result of [
    addTableRow(doc, blockId, { kind: 'end' }, opts()),
    removeTableRow(doc, blockId, merged.data.rows[0].id, opts()),
    addTableColumn(doc, blockId, { kind: 'start' }, opts()),
    removeTableColumn(doc, blockId, 0, opts()),
  ]) {
    assert.equal(result.ok, false);
    assert.equal(result.code, 'unsupported-span-structure');
    assert.match(result.message, /merged cells/);
  }
  assert.equal(snap(doc), before, 'refusal leaves the document untouched');

  // Content operations are span-independent.
  const align = setTableCellAlignment(doc, blockId, merged.data.rows[1].cells[1].id, 'right', opts());
  assert.equal(align.ok && align.changed, true);
  const caption = updateTableSettings(doc, blockId, { caption: 'Merged table' }, opts());
  assert.equal(caption.ok && caption.changed, true);
  assert.equal(caption.doc.blocks[0].data.rows[0].cells[0].colSpan, 2, 'merge structure untouched');
});

await test('12. cell text edit: stable IDs, untouched neighbours, stamped Modified', () => {
  const table = tableBlock([['H1', 'H2'], ['a', 'b'], ['c', 'd']]);
  const doc = docWith([table]);
  const blockId = table.id;
  const target = table.data.rows[1].cells[0];
  const neighbour = table.data.rows[1].cells[1];
  const otherRow = JSON.stringify(table.data.rows[2]);
  const before = snap(doc);

  const r = setTableCellText(doc, blockId, target.id, 'Alpha 2 ✓', opts());
  assert.equal(r.ok && r.changed, true);
  const data = r.doc.blocks[0].data;
  assert.equal(data.type, 'table');
  assert.equal(r.doc.blocks[0].id, table.id, 'block ID preserved');
  assert.equal(data.rows[1].id, table.data.rows[1].id, 'row ID preserved');
  assert.equal(data.rows[1].cells[0].id, target.id, 'cell ID preserved');
  assert.equal(data.rows[1].cells[0].spans[0].text, 'Alpha 2 ✓', 'unicode text stored verbatim');
  assert.equal(data.rows[1].cells[0].hAlign, target.hAlign, 'alignment untouched by text edit');
  assert.equal(data.rows[1].cells[1].id, neighbour.id, 'neighbour identity untouched');
  assert.equal(JSON.stringify(data.rows[1].cells[1].spans), JSON.stringify(neighbour.spans));
  assert.equal(JSON.stringify(data.rows[2]), otherRow, 'other rows byte-identical');
  assert.equal(r.doc.metadata.modifiedAt, T1, 'real edit stamps modifiedAt');
  assert.equal(snap(doc), before, 'input document unchanged');

  // Emptying a cell is a supported state.
  const emptied = setTableCellText(r.doc, blockId, target.id, '', opts());
  assert.equal(emptied.ok && emptied.changed, true);
  assert.equal(emptied.doc.blocks[0].data.rows[1].cells[0].spans.map((s) => s.text).join(''), '');
});

await test('13. cell text edits preserve inline styles through the P05-M2 remap algebra', () => {
  const styled = tableBlock([
    [
      {
        spans: [
          { text: 'Bold', bold: true },
          { text: ' and ', italic: true },
          { text: 'plain', color: '#c0392b' },
        ],
      },
      'x',
    ],
  ]);
  const doc = docWith([styled]);
  const cellId = styled.data.rows[0].cells[0].id;

  // Insert inside the coloured span: the P05-M2 remap keeps the styled runs
  // around the edit; the inserted characters become their own plain span —
  // the SAME contract paragraph editing applies.
  const r = setTableCellText(doc, styled.id, cellId, 'Bold and pXlain', opts());
  assert.equal(r.ok && r.changed, true);
  const spans = r.doc.blocks[0].data.rows[0].cells[0].spans;
  assert.equal(spans.map((s) => s.text).join(''), 'Bold and pXlain', 'plain text matches the edit');
  assert.equal(spans[0].text, 'Bold');
  assert.equal(spans[0].bold, true, 'bold survives');
  assert.equal(spans[1].text, ' and ');
  assert.equal(spans[1].italic, true, 'italic survives');
  assert.equal(spans[2].text, 'p');
  assert.equal(spans[2].color, '#c0392b', 'colour survives before the insertion');
  assert.equal(spans[3].text, 'X', 'inserted characters form their own plain span');
  assert.equal('color' in spans[3], false, 'inserted text carries no inherited style');
  assert.equal(spans[4].text, 'lain');
  assert.equal(spans[4].color, '#c0392b', 'colour survives after the insertion');
});

await test('14. cell alignment changes content nothing else; invalid alignments are rejected', () => {
  const table = tableBlock([['H1', 'H2'], ['a', 'b']]);
  const doc = docWith([table]);
  const blockId = table.id;
  const target = table.data.rows[1].cells[1];
  const before = snap(doc);

  const r = setTableCellAlignment(doc, blockId, target.id, 'center', opts());
  assert.equal(r.ok && r.changed, true);
  const cell = r.doc.blocks[0].data.rows[1].cells[1];
  assert.equal(cell.hAlign, 'center');
  assert.equal(cell.id, target.id, 'ID stable');
  assert.equal(JSON.stringify(cell.spans), JSON.stringify(target.spans), 'spans untouched');
  assert.equal(r.doc.blocks[0].data.rows[1].cells[0].hAlign, 'left', 'neighbour untouched');
  assert.equal(snap(doc), before, 'input unchanged');

  const bad = setTableCellAlignment(r.doc, blockId, target.id, 'middle', opts());
  assert.equal(bad.ok, false);
  assert.equal(bad.code, 'invalid-alignment');
  assert.deepEqual(
    H_ALIGNMENTS.slice(),
    ['left', 'center', 'right'],
    'exported alignment set matches the model',
  );
});

await test('15. no-op actions return the same document reference and never stamp modifiedAt', () => {
  const table = tableBlock([['H1', 'H2'], ['a', 'b']], { caption: 'Keep me' });
  const doc = docWith([table]);
  const blockId = table.id;
  const cellId = table.data.rows[1].cells[0].id;

  const cases = [
    setTableCellText(doc, blockId, cellId, 'a', opts()), // same text
    setTableCellAlignment(doc, blockId, cellId, 'left', opts()), // same alignment
    updateTableSettings(doc, blockId, { caption: 'Keep me' }, opts()), // same caption
    updateTableSettings(doc, blockId, { hasHeaderRow: false }, opts()), // already false
    updateTableSettings(doc, blockId, { headerStyle: 'light' }, opts()), // same style
    addTableRow(doc, blockId, { kind: 'bogus' }, opts()), // invalid position (failure)
  ];
  for (const r of cases) {
    if (r.ok) {
      assert.equal(r.changed, false, 'no-op reports changed: false');
      assert.equal(r.doc, doc, 'same document reference');
    } else {
      assert.equal(r.ok, false, 'invalid position rejected');
      assert.equal(r.code, 'invalid-position');
    }
  }
  assert.equal(doc.metadata.modifiedAt, T0, 'no false Modified status');
});

await test('16. validation codes: missing block, wrong type, missing row/cell, bad indexes, bad patches', () => {
  const doc = docWith([tableBlock([['H1', 'H2'], ['a', 'b']])]);
  const blockId = doc.blocks[0].id;
  const strangerId = '99999999-0000-4000-8000-000000000099';
  const paragraph = createBlock('paragraph', genId);
  const mixed = docWith([doc.blocks[0], paragraph]);

  const miss = updateTableSettings(mixed, strangerId, { caption: 'x' }, opts());
  assert.equal(miss.ok, false);
  assert.equal(miss.code, 'missing-block');

  const wrong = updateTableSettings(mixed, paragraph.id, { caption: 'x' }, opts());
  assert.equal(wrong.ok, false);
  assert.equal(wrong.code, 'not-a-table');

  const badRow = removeTableRow(doc, blockId, '99999999-0000-4000-8000-000000000098', opts());
  assert.equal(badRow.ok, false);
  assert.equal(badRow.code, 'missing-row');

  const badCell = setTableCellText(doc, blockId, '99999999-0000-4000-8000-000000000097', 'x', opts());
  assert.equal(badCell.ok, false);
  assert.equal(badCell.code, 'missing-cell');

  const badAlignCell = setTableCellAlignment(doc, blockId, '99999999-0000-4000-8000-000000000096', 'left', opts());
  assert.equal(badAlignCell.ok, false);
  assert.equal(badAlignCell.code, 'missing-cell');

  const badIndex = removeTableColumn(doc, blockId, 7, opts());
  assert.equal(badIndex.ok, false);
  assert.equal(badIndex.code, 'invalid-index');

  const badPos = addTableRow(doc, blockId, { kind: 'at', index: 99 }, opts());
  assert.equal(badPos.ok, false);
  assert.equal(badPos.code, 'invalid-position');

  const badFlag = updateTableSettings(doc, blockId, { hasHeaderRow: 'yes' }, opts());
  assert.equal(badFlag.ok, false);
  assert.equal(badFlag.code, 'invalid-has-header-row');

  const badStyle = updateTableSettings(doc, blockId, { headerStyle: 'ultra' }, opts());
  assert.equal(badStyle.ok, false);
  assert.equal(badStyle.code, 'invalid-header-style');

  const badSource = updateTableSettings(doc, blockId, { headerStyleSource: 'auto' }, opts());
  assert.equal(badSource.ok, false);
  assert.equal(badSource.code, 'invalid-header-style-source');

  const badText = setTableCellText(doc, blockId, doc.blocks[0].data.rows[0].cells[0].id, 42, opts());
  assert.equal(badText.ok, false);
  assert.equal(badText.code, 'invalid-cell-text');

  assert.deepEqual(TABLE_HEADER_STYLES.slice(), ['light', 'medium', 'heavy']);
});

// ═══════════════════════════════════════════════════════════════════════════
// 17–21. Header row, header style, caption and dispatcher (§4.5/§4.6/§4.7)
// ═══════════════════════════════════════════════════════════════════════════

await test('17. header toggle: OFF clears first-row explicit flags (content intact), ON writes nothing', () => {
  const table = tableBlock(
    [
      [{ text: 'H1', isHeader: true, hAlign: 'center' }, { text: 'H2', isHeader: true, hAlign: 'center' }],
      ['a', 'b'],
    ],
    { hasHeaderRow: true },
  );
  const doc = docWith([table]);
  const blockId = table.id;
  const before = snap(doc);

  const off = updateTableSettings(doc, blockId, { hasHeaderRow: false }, opts());
  assert.equal(off.ok && off.changed, true);
  const offData = off.doc.blocks[0].data;
  assert.equal(offData.hasHeaderRow, false);
  assert.ok(offData.rows[0].cells.every((c) => c.isHeader === false), 'row-0 flags cleared');
  assert.deepEqual(offData.rows[0].cells[0].spans, [{ text: 'H1' }], 'content untouched');
  assert.equal(offData.rows[0].cells[0].hAlign, 'center', 'alignment untouched');
  assert.equal(offData.rows[0].id, table.data.rows[0].id, 'row ID untouched');
  assert.equal('headerStyleSource' in offData, false, 'toggle never injects the optional field');

  const offAgain = updateTableSettings(off.doc, blockId, { hasHeaderRow: false }, opts());
  assert.equal(offAgain.ok && offAgain.changed, false, 'second OFF is a no-op');
  assert.equal(offAgain.doc, off.doc, 'same reference');

  const on = updateTableSettings(off.doc, blockId, { hasHeaderRow: true }, opts());
  assert.equal(on.ok && on.changed, true);
  assert.equal(on.doc.blocks[0].data.hasHeaderRow, true);
  assert.ok(
    on.doc.blocks[0].data.rows[0].cells.every((c) => c.isHeader === false),
    'ON relies on positional designation — no cell writes',
  );
  assert.equal(snap(doc), before, 'input document unchanged');
});

await test('18. header designation after row insertion/removal stays positional and consistent', () => {
  const table = tableBlock([['H1', 'H2'], ['a', 'b'], ['c', 'd']], { hasHeaderRow: true });
  const doc = docWith([table]);
  const blockId = table.id;

  // Removing the first row: the new first row simply becomes the header.
  const removed = removeTableRow(doc, blockId, table.data.rows[0].id, opts());
  assert.equal(removed.ok && removed.changed, true);
  assert.equal(removed.doc.blocks[0].data.rows[0].id, table.data.rows[1].id, 'old row 1 now first');
  assert.equal(removed.doc.blocks[0].data.hasHeaderRow, true, 'designation still active');
  assert.ok(
    removed.doc.blocks[0].data.rows[0].cells.every((c) => c.isHeader === false),
    'designation is positional, not stored per cell',
  );

  // Inserting at the top: the fresh row becomes the designated header.
  const added = addTableRow(doc, blockId, { kind: 'start' }, opts());
  assert.equal(added.ok && added.changed, true);
  assert.equal(added.doc.blocks[0].data.rows[0].id, added.rowId, 'fresh row is first');
  assert.equal(added.doc.blocks[0].data.rows[0].cells.length, 2);
  assert.equal(added.doc.blocks[0].data.hasHeaderRow, true);
});

await test('19. header style: explicit light/medium/heavy stores source=block; Theme default clears to absent', () => {
  const doc = docWith([tableBlock([['H1', 'H2'], ['a', 'b']], { hasHeaderRow: true })]);
  const blockId = doc.blocks[0].id;

  const explicit = updateTableSettings(
    doc,
    blockId,
    { headerStyle: 'heavy', headerStyleSource: 'block' },
    opts(),
  );
  assert.equal(explicit.ok && explicit.changed, true);
  assert.equal(explicit.doc.blocks[0].data.headerStyle, 'heavy');
  assert.equal(explicit.doc.blocks[0].data.headerStyleSource, 'block');

  const backToTheme = updateTableSettings(explicit.doc, blockId, { headerStyleSource: 'theme' }, opts());
  assert.equal(backToTheme.ok && backToTheme.changed, true);
  assert.equal('headerStyleSource' in backToTheme.doc.blocks[0].data, false, 'theme policy omits the field');
  assert.equal(backToTheme.doc.blocks[0].data.headerStyle, 'heavy', 'stored style retained (inactive)');

  // Only a source BLOCK write pairs style+source (the editor's pairing rule).
  const paired = updateTableSettings(
    backToTheme.doc,
    blockId,
    { headerStyle: 'medium', headerStyleSource: 'block' },
    opts(),
  );
  assert.equal(paired.ok && paired.changed, true);
  assert.equal(paired.doc.blocks[0].data.headerStyle, 'medium');
  assert.equal(paired.doc.blocks[0].data.headerStyleSource, 'block');
});

await test('20. caption: set, change, clear, whitespace/control handling and length guard', () => {
  const doc = docWith([tableBlock([['H1', 'H2'], ['a', 'b']])]);
  const blockId = doc.blocks[0].id;

  const set = updateTableSettings(doc, blockId, { caption: 'Table 1. Sample results' }, opts());
  assert.equal(set.ok && set.changed, true);
  assert.equal(set.doc.blocks[0].data.caption, 'Table 1. Sample results');

  const change = updateTableSettings(set.doc, blockId, { caption: 'Table 1. Revised' }, opts());
  assert.equal(change.ok && change.changed, true);
  assert.equal(change.doc.blocks[0].data.caption, 'Table 1. Revised');

  const cleared = updateTableSettings(change.doc, blockId, { caption: null }, opts());
  assert.equal(cleared.ok && cleared.changed, true);
  assert.equal('caption' in cleared.doc.blocks[0].data, false, 'null removes the field');

  const blank = updateTableSettings(cleared.doc, blockId, { caption: '   ' }, opts());
  assert.equal(blank.ok && blank.changed, false, 'whitespace-only is already "no caption"');

  const control = updateTableSettings(cleared.doc, blockId, { caption: `Agent${String.fromCharCode(7)} X` }, opts());
  assert.equal(control.ok && control.changed, true);
  assert.equal(control.doc.blocks[0].data.caption, 'Agent X', 'control characters stripped');

  const oversize = updateTableSettings(cleared.doc, blockId, { caption: 'x'.repeat(MAX_TABLE_CAPTION_LENGTH + 1) }, opts());
  assert.equal(oversize.ok, false);
  assert.equal(oversize.code, 'invalid-caption');

  const wrongType = updateTableSettings(cleared.doc, blockId, { caption: 42 }, opts());
  assert.equal(wrongType.ok, false);
  assert.equal(wrongType.code, 'invalid-caption');
});

await test('21. dispatcher routes every action kind and rejects unknown kinds', () => {
  const doc = docWith([tableBlock([['H1', 'H2'], ['a', 'b']])]);
  const blockId = doc.blocks[0].id;
  const rowId = doc.blocks[0].data.rows[1].id;
  const cellId = doc.blocks[0].data.rows[1].cells[0].id;

  const routes = [
    [{ kind: 'settings', patch: { caption: 'Routed' } }, (r) => r.ok && r.changed],
    [{ kind: 'cell-text', cellId, text: 'via dispatcher' }, (r) => r.ok && r.changed],
    [{ kind: 'cell-align', cellId, hAlign: 'right' }, (r) => r.ok && r.changed],
    [{ kind: 'row-add', position: { kind: 'end' } }, (r) => r.ok && r.changed],
    [{ kind: 'row-remove', rowId }, (r) => r.ok && r.changed],
    [{ kind: 'column-add', position: { kind: 'start' } }, (r) => r.ok && r.changed],
    [{ kind: 'column-remove', index: 0 }, (r) => r.ok && r.changed],
  ];
  let current = doc;
  for (const [action, check] of routes) {
    const r = applyTableContentAction(current, blockId, action, opts());
    assert.ok(check(r), `action ${action.kind} routes and changes the document`);
    current = r.doc;
  }
  const unknown = applyTableContentAction(current, blockId, { kind: 'teleport' }, opts());
  assert.equal(unknown.ok, false);
  assert.equal(unknown.code, 'invalid-action');
});

// ═══════════════════════════════════════════════════════════════════════════
// 22–26. Persistence, compatibility and cross-checkpoint regressions
// ═══════════════════════════════════════════════════════════════════════════

await test('22. round trip: serialize → deserialize → re-edit → serialize keeps every table fact', () => {
  const table = tableBlock(
    [
      [{ text: 'Parameter', isHeader: true, hAlign: 'center' }, { text: 'Value', isHeader: true, hAlign: 'center' }],
      [{ text: 'Temperature', hAlign: 'left' }, { text: '22.5 °C', hAlign: 'right' }],
    ],
    { hasHeaderRow: true, headerStyle: 'medium', headerStyleSource: 'block', caption: 'Run 7 results' },
  );
  const doc = docWith([table]);

  const json1 = serializeDocument(doc);
  assert.equal(validateDocument(JSON.parse(json1)), undefined, 'validator accepts the file');
  const doc2 = deserializeDocument(json1);
  const json2 = serializeDocument(doc2);
  assert.equal(json2, json1, 'serialize → deserialize → serialize is byte-stable');

  const data2 = doc2.blocks[0].data;
  assert.equal(data2.rows[0].id, table.data.rows[0].id, 'row IDs survive');
  assert.equal(data2.rows[1].cells[1].id, table.data.rows[1].cells[1].id, 'cell IDs survive');
  assert.equal(data2.rows[1].cells[1].hAlign, 'right', 'alignment survives');
  assert.equal(data2.rows[1].cells[1].spans[0].text, '22.5 °C', 'content survives');
  assert.equal(data2.hasHeaderRow, true);
  assert.equal(data2.headerStyle, 'medium');
  assert.equal(data2.headerStyleSource, 'block');
  assert.equal(data2.caption, 'Run 7 results');

  // Re-edit after reopen: the very same operations keep working.
  const reedit = setTableCellText(doc2, doc2.blocks[0].id, data2.rows[1].cells[1].id, '23.0 °C', opts());
  assert.equal(reedit.ok && reedit.changed, true);
  const json3 = serializeDocument(reedit.doc);
  assert.match(json3, /23\.0 °C/, 're-edit reaches the serialized file');
  assert.match(json3, /"headerStyleSource":\s*"block"/, 'override field persists');
});

await test('23. old schema-v1 files without the optional field stay valid and theme-default', () => {
  const legacy = tableBlock([['H1', 'H2'], ['a', 'b']], { hasHeaderRow: true });
  const doc = docWith([legacy]);
  const json = serializeDocument(doc);
  assert.equal('headerStyleSource' in JSON.parse(json).blocks[0].data, false, 'field absent on disk');

  const back = deserializeDocument(json);
  assert.equal(validateDocument(back), undefined);
  assert.equal('headerStyleSource' in back.blocks[0].data, false, 'field still absent after load');

  // A content edit on an old file never injects the new field.
  const edited = setTableCellText(back, back.blocks[0].id, back.blocks[0].data.rows[1].cells[0].id, 'edited', opts());
  assert.equal('headerStyleSource' in edited.doc.blocks[0].data, false, 'policy untouched by edits');
  // …and neither does a header toggle (theme-default stays theme-default).
  const toggled = updateTableSettings(back, back.blocks[0].id, { hasHeaderRow: false }, opts());
  assert.equal('headerStyleSource' in toggled.doc.blocks[0].data, false);
});

await test('24. P05-M1 regression: insert, duplicate, reorder, spacing and delete still hold', () => {
  let doc = newDoc();
  const base = doc.blocks.length;

  const ins = insertBlock(doc, 'table', { kind: 'end' }, opts());
  assert.equal(ins.ok && ins.changed, true);
  assert.equal(ins.doc.blocks.length, base + 1);
  doc = ins.doc;
  const tableId = ins.blockId;

  const dup = duplicateBlock(doc, tableId, opts());
  assert.equal(dup.ok && dup.changed, true);
  assert.equal(dup.doc.blocks.length, base + 2);
  assert.notEqual(dup.blockId, tableId, 'duplicate has a fresh block ID');
  doc = dup.doc;

  const up = reorderBlock(doc, dup.blockId, 'up', opts());
  assert.equal(up.ok && up.changed, true);
  assert.equal(up.doc.blocks[base].id, dup.blockId, 'duplicate moved up');
  doc = up.doc;

  const originalBottom = doc.blocks.find((b) => b.id === tableId).spacing.bottomPt;
  const spacing = updateBlockSpacing(doc, tableId, 'topPt', 9.5, opts());
  assert.equal(spacing.ok && spacing.changed, true);
  assert.equal(spacing.doc.blocks.find((b) => b.id === tableId).spacing.topPt, 9.5);
  assert.equal(
    spacing.doc.blocks.find((b) => b.id === tableId).spacing.bottomPt,
    originalBottom,
    'other spacing field preserved',
  );
  doc = spacing.doc;

  const del = deleteBlock(doc, dup.blockId, opts());
  assert.equal(del.ok && del.changed, true);
  assert.equal(del.doc.blocks.length, base + 1);
  assert.ok(del.doc.blocks.some((b) => b.id === tableId), 'original table still present');
  assert.equal(del.doc.metadata.modifiedAt, T1);
});

await test('25. P05-M2 regression: heading/paragraph patches and heading numbering still hold', () => {
  let doc = newDoc();
  const heading = createBlock('heading', genId);
  heading.data = { ...heading.data, level: 3, text: 'Method outline' };
  const paragraph = createBlock('paragraph', genId);
  paragraph.data = { ...paragraph.data, hAlign: 'left' };
  doc.blocks = [heading, paragraph];

  const h = updateHeadingContent(doc, heading.id, { level: 2 }, opts());
  assert.equal(h.ok && h.changed, true);
  assert.equal(h.doc.blocks[0].data.level, 2);
  assert.equal(h.doc.blocks[0].id, heading.id, 'block ID stable');

  const p = updateParagraphContent(h.doc, paragraph.id, { hAlign: 'justify' }, opts());
  assert.equal(p.ok && p.changed, true);
  assert.equal(p.doc.blocks[1].data.hAlign, 'justify');

  const headings = [heading, heading].map((b, i) => ({ ...b, id: `10800000-0000-4000-8000-0000000000${i}` }));
  const n1 = computeHeadingNumbering(headings);
  const n2 = computeHeadingNumbering(headings);
  assert.deepEqual([...n1], [...n2], 'numbering remains deterministic');
  assert.equal(n1.size, headings.length);
});

await test('26. P05-M3 regression: list settings and callout content still hold', () => {
  const list = createBlock('list', genId);
  list.data = { ...list.data, listType: 'bullet', bulletStyle: 'disc' };
  const callout = createBlock('callout', genId);
  callout.data = { ...callout.data, variant: 'info', title: 'Before' };
  const doc = docWith([list, callout]);

  const l = updateListSettings(doc, list.id, { bulletStyle: 'square' }, opts());
  assert.equal(l.ok && l.changed, true);
  assert.equal(l.doc.blocks[0].data.bulletStyle, 'square');
  assert.equal(l.doc.blocks[0].id, list.id);

  const c = updateCalloutContent(l.doc, callout.id, { title: 'After' }, opts());
  assert.equal(c.ok && c.changed, true);
  assert.equal(c.doc.blocks[1].data.title, 'After');
  assert.equal('markerSource' in c.doc.blocks[0].data, false, 'list marker policy untouched');
  assert.equal(c.doc.metadata.modifiedAt, T1);
});

// ═══════════════════════════════════════════════════════════════════════════
// 27. Row-height estimate (page-boundary policy input)
// ═══════════════════════════════════════════════════════════════════════════

await test('27. row-height estimate: short rows atomic, oversized rows wrappable, wide glyphs conservative', () => {
  const doc = newDoc();
  const { tokens } = resolveBodyTheme(
    doc.pageTypography.bodyThemeId,
    doc.pageTypography.typography,
    false,
  );
  const layout = computePocLayout(doc);
  const available = layout.pageHeightPt - layout.marginTop - layout.marginBottom;
  assert.ok(available > 400, 'sanity: page has usable height');

  const widths = allocateTableColumnWidths(2, 500);
  const short = tableBlock([['a', 'b']]).data.rows[0];
  const shortEst = estimateRowHeightPt(short, widths, tokens);
  assert.ok(shortEst < 60, `short row estimates one line (got ${shortEst})`);
  assert.ok(shortEst <= available, 'short row renders atomically (wrap={false})');

  const giant = tableBlock([['Z'.repeat(9000), 'tail']]).data.rows[0];
  const giantEst = estimateRowHeightPt(giant, widths, tokens);
  assert.ok(giantEst > available, `giant row exceeds a page (got ${giantEst} vs ${available})`);
  assert.ok(giantEst > shortEst * 50, 'estimate scales with content');

  // Equal character counts: wide glyphs estimate more lines (1 em vs 0.5 em).
  const latin = tableBlock([['a'.repeat(600), '']]).data.rows[0];
  const wideText = '实验室'.repeat(200); // 600 characters, same as the latin sample
  const wide = tableBlock([[wideText, '']]).data.rows[0];
  assert.equal(latin.cells[0].spans[0].text.length, wide.cells[0].spans[0].text.length);
  assert.ok(
    estimateRowHeightPt(wide, widths, tokens) > estimateRowHeightPt(latin, widths, tokens),
    'wide (CJK-width) glyphs estimate more lines than latin at equal length',
  );
});

// ═══════════════════════════════════════════════════════════════════════════
// 28–37. Renderer and layout evidence
// ═══════════════════════════════════════════════════════════════════════════

await test('28. renderer header policy: absent ≡ theme (byte-identical), light/medium/heavy distinct', async () => {
  const base = tableBlock(
    [
      [{ text: 'Alpha', hAlign: 'center' }, { text: 'Beta', hAlign: 'center' }],
      ['one', 'two'],
    ],
    { hasHeaderRow: true, headerStyle: 'light' },
  );
  const variant = (data) => renderDoc([{ ...base, data: { ...base.data, ...data } }]);

  const absent = Buffer.from(await render(variant({})));
  const theme = Buffer.from(await render(variant({ headerStyleSource: 'theme' })));
  assert.equal(
    Buffer.compare(absent, theme),
    0,
    'legacy documents (field absent) must render byte-identically to explicit theme',
  );

  const light = Buffer.from(await render(variant({ headerStyle: 'light', headerStyleSource: 'block' })));
  const medium = Buffer.from(await render(variant({ headerStyle: 'medium', headerStyleSource: 'block' })));
  const heavy = Buffer.from(await render(variant({ headerStyle: 'heavy', headerStyleSource: 'block' })));

  assert.notEqual(Buffer.compare(light, medium), 0, 'light and medium render differently');
  assert.notEqual(Buffer.compare(medium, heavy), 0, 'medium and heavy render differently');
  assert.notEqual(Buffer.compare(light, heavy), 0, 'light and heavy render differently');
  assert.notEqual(Buffer.compare(absent, light), 0, 'explicit light differs from the theme default');

  for (const bytes of [absent, light, medium, heavy]) {
    const text = extractedText(bytes);
    assert.ok(text.includes('Alpha') && text.includes('Beta'), 'header cells render');
    assert.ok(text.includes('one') && text.includes('two'), 'body cells render');
    assert.equal(pageCount(bytes), 1, 'compact table fits one page');
  }
});

await test('29. renderer header on/off differs, and a removed first row renders as the new header', async () => {
  const base = tableBlock(
    [
      [{ text: 'H1', hAlign: 'center' }, { text: 'H2', hAlign: 'center' }],
      ['B1', 'B2'],
    ],
    { hasHeaderRow: true },
  );
  const docOn = renderDoc([{ ...base }]);
  const docOff = renderDoc([{ ...base, data: { ...base.data, hasHeaderRow: false } }]);
  const onBytes = Buffer.from(await render(docOn));
  const offBytes = Buffer.from(await render(docOff));
  assert.notEqual(Buffer.compare(onBytes, offBytes), 0, 'header row on/off changes rendering');
  assert.ok(extractedText(offBytes).includes('H1'), 'off still shows the cell content');

  // Designation after removal: row 1 becomes the header positionally.
  const removedOn = renderDoc([
    { ...base, data: { ...base.data, rows: base.data.rows.slice(1) } },
  ]);
  const removedOff = renderDoc([
    { ...base, data: { ...base.data, rows: base.data.rows.slice(1), hasHeaderRow: false } },
  ]);
  const on2 = Buffer.from(await render(removedOn));
  const off2 = Buffer.from(await render(removedOff));
  assert.notEqual(Buffer.compare(on2, off2), 0, 'the new first row is genuinely styled as header');
  assert.ok(extractedText(on2).includes('B1'), 'header content survives after row removal');
});

await test('30. captions render only when configured', async () => {
  const withCaption = tableBlock([['K1', 'K2'], ['v', 'w']], { caption: 'Sample caption alpha' });
  const without = tableBlock([['K1', 'K2'], ['v', 'w']]);

  const capBytes = await render(renderDoc([withCaption]));
  const noBytes = await render(renderDoc([without]));
  assert.ok(extractedText(capBytes).includes('Sample caption alpha'), 'caption text present');
  assert.equal(extractedText(noBytes).includes('Sample caption alpha'), false, 'no caption → not rendered');
  assert.notEqual(Buffer.compare(Buffer.from(capBytes), Buffer.from(noBytes)), 0);
});

await test('31. cell alignment and inline formatting render as expected', async () => {
  const left = tableBlock([[{ text: 'Aligned text', hAlign: 'left' }]]);
  const center = tableBlock([[{ text: 'Aligned text', hAlign: 'center' }]]);
  const bold = tableBlock([[{ spans: [{ text: 'BoldFace', bold: true }, { text: ' plain' }] }]]);

  const leftBytes = await render(renderDoc([left]));
  const centerBytes = await render(renderDoc([center]));
  const boldBytes = await render(renderDoc([bold]));

  assert.notEqual(Buffer.compare(Buffer.from(leftBytes), Buffer.from(centerBytes)), 0, 'alignment changes output');
  assert.ok(extractedText(centerBytes).includes('Aligned text'), 'aligned content renders');
  assert.ok(extractedText(boldBytes).includes('BoldFace'), 'formatted cell content renders');
});

await test('32. long cell text wraps without disappearing', async () => {
  // The markers are single unbreakable words (no spaces, no hyphens), so
  // the line-breaker keeps each whole: a multi-line cell must show its
  // head AND its tail verbatim.
  const long =
    'Wrappedcellmarker ' +
    'lorem ipsum dolor sit amet consectetur adipiscing elit sed do eiusmod tempor. '.repeat(24) +
    ' Zebretailmarker';
  const bytes = await render(renderDoc([tableBlock([[long, 'short']])]));
  const text = extractedText(bytes);
  assert.ok(text.includes('Wrappedcellmarker'), 'head of the wrapped text renders');
  assert.ok(text.includes('Zebretailmarker'), 'tail of the wrapped text renders');
  assert.ok(text.includes('short'), 'neighbour cell renders');
});

await test('33. a long table flows across pages and retains all content', async () => {
  const rows = [];
  for (let i = 1; i <= 40; i += 1) rows.push([`Pageflow ${i}`, `value ${i}`]);
  const bytes = await render(renderDoc([tableBlock(rows)]));
  assert.ok(pageCount(bytes) >= 2, `multi-page table (got ${pageCount(bytes)} pages)`);
  const text = extractedText(bytes);
  assert.ok(text.includes('Pageflow 1'), 'first row renders');
  assert.ok(text.includes('Pageflow 40'), 'last row renders');
  assert.ok(text.includes('Pageflow 20'), 'middle row renders');
});

await test('34. an oversized single row is never clipped — all of its content renders', async () => {
  const longCell =
    'HEADMARK ' +
    'lorem ipsum dolor sit amet consectetur adipiscing elit sed do eiusmod tempor incididunt ut labore. '.repeat(55) +
    ' ENDMARK';
  const bytes = await render(renderDoc([tableBlock([[longCell, 'TAILMARK']])]));
  const text = extractedText(bytes);
  assert.ok(text.includes('HEADMARK'), 'start of the oversized row renders');
  assert.ok(text.includes('ENDMARK'), 'end of the oversized row renders');
  assert.ok(text.includes('TAILMARK'), 'the neighbouring cell renders');
  assert.ok(pageCount(bytes) >= 2, 'the row flows across a page boundary');
  assert.equal(pageCount(bytes) < 6, true, 'flows without exploding the page count');
});

await test('35. wide tables (6 and 12 columns) render every column without overflow', async () => {
  const letters = 'ABCDEFGHIJKL'.split('');
  for (const n of [6, 12]) {
    const cols = letters.slice(0, n);
    const headerRow = cols.map((c) => ({ text: `COL-${c}`, hAlign: 'center' }));
    const bodyRow = cols.map((c) => `V${c}`);
    const bytes = await render(renderDoc([tableBlock([headerRow, bodyRow])]));
    const text = extractedText(bytes);
    for (const c of cols) {
      assert.ok(text.includes(`COL-${c}`), `${n}-col header ${c} renders`);
      assert.ok(text.includes(`V${c}`), `${n}-col body ${c} renders`);
    }
    const layout = computePocLayout(docWith([]));
    const widths = allocateTableColumnWidths(n, layout.contentWidth);
    approx(
      widths.reduce((a, b) => a + b, 0),
      layout.contentWidth,
      1e-6,
      `${n} columns total exactly the A4 content width`,
    );
  }
});

await test('36. monochrome tables stay readable: grayscale structure, all content present', async () => {
  const table = tableBlock(
    [
      [{ text: 'MonoHead', hAlign: 'center' }, { text: 'Beta', hAlign: 'center' }],
      ['MonoCell', 'value'],
    ],
    { hasHeaderRow: true, headerStyle: 'medium', headerStyleSource: 'block', caption: 'Mono caption' },
  );
  const callout = createBlock('callout', genId);
  callout.data = { ...callout.data, variant: 'info', spans: [{ text: 'Chromatic notice' }] };

  const doc = renderDoc([table, callout]);
  const multi = Buffer.from(await render(doc));

  const monoDoc = renderDoc([table, callout]);
  monoDoc.pageTypography = { ...monoDoc.pageTypography, monochrome: true };
  const mono = Buffer.from(await render(monoDoc));

  assert.notEqual(Buffer.compare(multi, mono), 0, 'monochrome conversion changes the render');
  const multiColors = scnColors(multi);
  assert.ok(
    multiColors.some(([r, g, b]) => Math.abs(r - g) > 0.02 || Math.abs(g - b) > 0.02),
    'multicolor render contains a chromatic colour',
  );
  for (const [r, g, b] of scnColors(mono)) {
    assert.ok(Math.abs(r - g) < 0.002 && Math.abs(g - b) < 0.002, `monochrome colour is gray (${r},${g},${b})`);
  }
  const monoText = extractedText(mono);
  assert.ok(monoText.includes('MonoHead') && monoText.includes('MonoCell'), 'table content readable in grayscale');
  assert.ok(monoText.includes('Mono caption'), 'caption readable in grayscale');
});

await test('37. P02-M4 baseline: fixture render matches the committed PDF byte-for-byte', async () => {
  const baseline = readFileSync(path.join(root, 'fixtures', 'p02-m4', 'renderer-poc-output.pdf'));
  const bytes = Buffer.from(await render(buildPocFixture()));
  assert.equal(
    Buffer.compare(bytes, baseline),
    0,
    'PoC fixture render must match the committed baseline byte-for-byte',
  );
});

// ── Summary ─────────────────────────────────────────────────────────────────
console.log('');
console.log(`${passed} passed, ${failed.length} failed`);
if (failed.length > 0) {
  console.error(`FAILED: ${failed.map((f) => f.name).join(' | ')}`);
  process.exit(1);
}
