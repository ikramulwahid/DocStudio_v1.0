/**
 * P06-M2 Verification Suite — Structural Blocks
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Proves, against the REAL compiled modules (no mocks, no reimplementation):
 *  1. service semantics — defaults, validation, immutability, no-op identity,
 *     `modifiedAt` policy, ID preservation/generation, duplicate independence;
 *  2. all seven structural types — registry insertion, editing, persistence
 *     round-trip, rendered output;
 *  3. page-break vs section-break — explicitly distinct behaviour;
 *  4. metadata — field ordering, document-sourced values, empty handling,
 *     invalid-field rejection;
 *  5. revision history — add/edit/remove, entry identity, every column
 *     rendered including descriptions;
 *  6. references — order, safe URLs, wrapping, empty URL, sanitization;
 *  7. exhibits — label/title/notes, optional asset, honest fallback;
 *  8. PDF output — a representative structural document rendered through the
 *     REAL `PocDocument` path: page count, extracted text, page-break
 *     boundaries, and the absence of any "not mapped" fallback marker.
 *
 * HONEST SCOPE NOTES (also recorded in project_roadmap.md)
 * ───────────────────────────────────────────────────────
 * • Baselines are PROTECTED: this suite renders in memory only and writes
 *   nothing to `fixtures/`.  No committed artifact is read for comparison
 *   and none is regenerated.
 * • Page-break semantics implemented and asserted here: the break forces
 *   the FOLLOWING block onto a new physical page; leading and trailing
 *   breaks never create an empty first/last page; CONSECUTIVE breaks
 *   collapse to ONE boundary (no blank pages), and the markers themselves
 *   are never removed from the document.  A deliberate blank page can be
 *   made with an empty paragraph between two breaks.
 * • Section breaks render an INLINE divider + optional title and never
 *   start a new page, regardless of their `section-break` type.
 * • Revision history is MANUALLY edited document content — not Track
 *   Changes, not a tamper-proof audit trail (Phase 07 owns snapshots).
 * • The exhibit asset selector is limited to embedded IMAGE assets; PDF
 *   attachments are not part of schema v1 and are not implemented.
 * • Native Tauri Save/Open dialogs are NOT RUN here (not drivable from
 *   Node); persistence is proven at the serialization data layer only.
 * • Content crossing a page boundary mid-block is a known PoC renderer
 *   limitation (documented, not fixed here).
 *
 * Usage: node verify_p06_m2.mjs   (or: npm run verify:p06-m2)
 * Exit code 0 => all checks pass.
 */

import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { execSync } from 'node:child_process';

const require = createRequire(import.meta.url);
const root = path.dirname(new URL(import.meta.url).pathname.replace(/^\//, ''));
const CACHE = path.join(root, 'node_modules', '.cache', 'ds-p06-m2-verify');

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
// to the REAL installed packages — same pattern as verify_p06_m1.
group('compile');
const COMPILE_ROOTS = [
  'src/renderer/poc/poc-node-entry.ts',
  'src/services/block-registry.ts',
  // P06-M2 corrective: the structural EDITORS are rendered with
  // react-dom/server below so layout-structure regressions (the owner-reported
  // horizontal overflow that hid the metadata add-list and the Add reference
  // button) are caught from real component output, not from source text.
  'src/components/editor-panel/StructuralContentEditor.tsx',
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

const pocNode = pick(
  path.join(CACHE, 'renderer', 'poc', 'poc-node-entry.js'),
  path.join(CACHE, 'src', 'renderer', 'poc', 'poc-node-entry.js'),
);
const registry = pick(
  path.join(CACHE, 'services', 'block-registry.js'),
  path.join(CACHE, 'src', 'services', 'block-registry.js'),
);
const defaults = pick(
  path.join(CACHE, 'types', 'defaults.js'),
  path.join(CACHE, 'src', 'types', 'defaults.js'),
);
const documentFile = pick(
  path.join(CACHE, 'services', 'document-file.js'),
  path.join(CACHE, 'src', 'services', 'document-file.js'),
);
const structuralEditors = pick(
  path.join(CACHE, 'components', 'editor-panel', 'StructuralContentEditor.js'),
  path.join(CACHE, 'src', 'components', 'editor-panel', 'StructuralContentEditor.js'),
);
// Real component markup (not source grep) for the layout-structure checks.
const { renderToStaticMarkup } = require('react-dom/server');
const React = require('react');

const {
  buildPocFixture,
  renderDocPdfBytes,
  POC_CREATED_AT,
  serializeDocument,
  applyStructuralAction,
  updateHorizontalLineContent,
  updateSectionBreakContent,
  setMetadataBlockFields,
  addRevisionEntry,
  updateRevisionEntry,
  removeRevisionEntry,
  updateReferenceTitle,
  addReferenceEntry,
  updateReferenceEntry,
  removeReferenceEntry,
  updateExhibitContent,
  HORIZONTAL_LINE_THICKNESS_PT_RANGE,
  MAX_STRUCTURAL_TEXT_LENGTH,
  metadataFieldChoices,
} = pocNode;
const { BLOCK_REGISTRY, summarizeBlockData } = registry;
// `createBlock` comes from the P06-M2 node-entry surface (real block-actions).
const { createBlock } = pocNode;
const { createDefaultDocument, newUUID } = defaults;
const { deserializeDocument } = documentFile;

// ── Fixtures and service helpers ────────────────────────────────────────────
const T0 = POC_CREATED_AT;
const STAMP = '2026-10-20T12:00:00.000Z';
let idSeq = 0;
const genId = () => `06200000-0000-4000-8000-${String(++idSeq).padStart(12, '0')}`;
/**
 * Suite documents start with the cover page DISABLED so that page-count
 * assertions describe BODY pagination only.  Cover rendering is P04-M4
 * territory and is verified by its own suites; leaving it on simply adds a
 * page 1 that would obscure what these checks are about.
 */
const newDoc = (id = 'sm-doc-1') => {
  const doc = createDefaultDocument(id, T0);
  return doc.frontPage === undefined || doc.frontPage.enabled === undefined
    ? doc
    : { ...doc, frontPage: { ...doc.frontPage, enabled: false } };
};

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
  assert.equal(res.ok, false, `${label}: expected rejection, the change was applied`);
  assert.equal(res.code, code, `${label}: error code (message: ${res.message})`);
}
function noOp(res, sourceDoc, label) {
  assert.equal(res.ok, true, `${label}: no-ops are still ok`);
  assert.equal(res.changed, false, `${label}: expected changed=false`);
  assert.equal(res.doc, sourceDoc, `${label}: no-op returns the SAME reference`);
}

/** Append a registry-default block of `type` to the document (real factory). */
function insertBlock(doc, type) {
  const block = createBlock(type, genId);
  return { doc: { ...doc, blocks: [...doc.blocks, block] }, block };
}
/** Address the single block of `type` (asserts exactly one exists). */
const only = (doc, type) => {
  const hits = doc.blocks.filter((b) => b.data.type === type);
  assert.equal(hits.length, 1, `fixture must hold exactly one ${type}`);
  return hits[0];
};
/** Dispatch one structural action through the real service. */
const act = (doc, blockId, action, now = STAMP) =>
  applyStructuralAction(doc, blockId, action, { now, genId });

// ── PDF helpers (same inflated-stream text extraction as verify_p06_m1) ─────
function pdfPages(buf) {
  const text = buf.toString('latin1');
  const pages = [];
  const pageRe = /(\d+)\s+0\s+obj[\s\S]{0,400}?\/Type\s*\/Page[^s][\s\S]{0,400}?endobj/g;
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
/** Whitespace-insensitive containment (pdfkit splits runs at kerning pairs). */
const compact = (s) => s.replace(/\s+/g, '');
const has = (text, needle) => compact(text).includes(compact(needle));
const countOf = (text, needle) => compact(text).split(compact(needle)).length - 1;
const render = async (doc) => Buffer.from(await renderDocPdfBytes(doc));
const pagesOf = async (doc) => pdfPages(await render(doc));
const pageTextsOf = async (doc) => (await pagesOf(doc)).map((p) => pageText(p));
/** TRUE when the PoC fallback marker appears anywhere in the output. */
const fallbackMarker = (pages) => pages.some((t) => t.includes('not yet mapped') || t.includes('not mapped'));

// ═══════════════════════════════════════════════════════════════════════════
// 1. Model & service semantics (all seven types)
// ═══════════════════════════════════════════════════════════════════════════
group('1 · model & service semantics');

await test('1.1 registry inserts every structural type with a schema-valid default', () => {
  let doc = newDoc();
  for (const type of [
    'horizontal-line',
    'page-break',
    'section-break',
    'metadata-block',
    'revision-history',
    'reference',
    'exhibit',
  ]) {
    const res = insertBlock(doc, type);
    doc = res.doc;
    assert.equal(res.block.data.type, type, `${type}: discriminant preserved`);
    assert.ok(typeof summarizeBlockData(res.block.data) === 'string', `${type}: summary defined`);
  }
  assert.equal(doc.blocks.length, 7, 'all seven structural blocks appended');
  // The two breaks must stay distinguishable in the selected-block UI.
  const pageSummary = summarizeBlockData(only(doc, 'page-break').data);
  const sectionSummary = summarizeBlockData(only(doc, 'section-break').data);
  assert.match(pageSummary, /new page/, 'page-break summary states the page effect');
  assert.match(sectionSummary, /inline/i, 'section-break summary states the inline effect');
  assert.notEqual(pageSummary, sectionSummary, 'the two break summaries are distinct');
});

await test('1.2 missing block / wrong block type are rejected without mutation', () => {
  const doc = newDoc();
  const missing = act(doc, newUUID(), { action: 'update-section-break', title: 'X' });
  rejected(missing, 'missing-block', 'missing block id');
  assert.equal(missing.doc, undefined, 'failures never carry a document');

  const withLine = insertBlock(doc, 'horizontal-line').doc;
  const lineBlock = only(withLine, 'horizontal-line');
  const wrongType = act(withLine, lineBlock.id, { action: 'add-revision-entry' });
  rejected(wrongType, 'wrong-block-type', 'revision action on a rule block');
  const unknownAction = act(withLine, lineBlock.id, { action: 'nope' });
  rejected(unknownAction, 'invalid-action', 'unknown dispatcher action');
});

await test('1.3 real edits stamp modifiedAt; no-ops leave the document identical', () => {
  let doc = newDoc();
  doc = insertBlock(doc, 'section-break').doc;
  const block = only(doc, 'section-break');
  assert.equal(doc.metadata.modifiedAt, T0, 'setup document untouched');

  const changed = applied(act(doc, block.id, { action: 'update-section-break', title: 'Scope' }), 'title set');
  assert.equal(changed.metadata.modifiedAt, STAMP, 'real edit stamps modifiedAt');
  assert.equal(changed.metadata.createdAt, T0, 'createdAt never moves');

  // Re-committing the identical title is a same-reference no-op.
  noOp(act(changed, block.id, { action: 'update-section-break', title: 'Scope' }), changed, 'same title');
  // Clearing with null then with '' are the same canonical no-op.
  const cleared = applied(act(changed, block.id, { action: 'update-section-break', title: null }), 'title cleared');
  assert.equal('title' in cleared.blocks.find((b) => b.id === block.id).data, false, 'cleared title removed from the object');
  noOp(act(cleared, block.id, { action: 'update-section-break', title: '' }), cleared, 'empty title is already cleared');
});

await test('1.4 updates are immutable and preserve unrelated content by reference', () => {
  let doc = newDoc();
  doc = insertBlock(doc, 'heading').doc;
  doc = insertBlock(doc, 'reference').doc;
  doc = insertBlock(doc, 'callout').doc;
  const refBlock = only(doc, 'reference');
  const heading = doc.blocks.find((b) => b.data.type === 'heading');
  const callout = doc.blocks.find((b) => b.data.type === 'callout');

  const next = applied(act(doc, refBlock.id, { action: 'add-reference-entry' }), 'reference added');
  assert.notEqual(next, doc, 'a new document object is returned');
  assert.notEqual(next.blocks, doc.blocks, 'a new blocks array is returned');
  assert.notEqual(next.metadata, doc.metadata, 'metadata is rebuilt, not shared');
  assert.equal(next.blocks.length, doc.blocks.length, 'no block added or lost');
  assert.equal(next.blocks.find((b) => b.id === heading.id), heading, 'unrelated heading kept by reference');
  assert.equal(next.blocks.find((b) => b.id === callout.id), callout, 'unrelated callout kept by reference');
  assert.equal(next.blocks.find((b) => b.id === refBlock.id).id, refBlock.id, 'edited block keeps its stable id');
  assert.equal(doc.blocks.find((b) => b.id === refBlock.id), refBlock, 'input document never mutated');
});

await test('1.5 serialization round-trips every structural block with stable ids', () => {
  let doc = newDoc();
  doc = insertBlock(doc, 'horizontal-line').doc;
  doc = insertBlock(doc, 'page-break').doc;
  doc = insertBlock(doc, 'section-break').doc;
  doc = insertBlock(doc, 'metadata-block').doc;
  doc = insertBlock(doc, 'revision-history').doc;
  doc = insertBlock(doc, 'reference').doc;
  doc = insertBlock(doc, 'exhibit').doc;

  const lineId = only(doc, 'horizontal-line').id;
  const revId = only(doc, 'revision-history').id;
  const refId = only(doc, 'reference').id;
  const entry = (d, blockId) => d.blocks.find((b) => b.id === blockId);

  doc = applied(act(doc, lineId, { action: 'update-horizontal-line', thicknessPt: 2.5, color: '#123456' }), 'rule styled');
  doc = applied(act(doc, entry(doc, revId).id, { action: 'add-revision-entry' }), 'revision entry added');
  doc = applied(act(doc, refId, { action: 'add-reference-entry' }), 'reference entry added');
  const revEntryId = entry(doc, revId).data.entries[0].id;
  const refEntryId = entry(doc, refId).data.entries[0].id;

  const json = serializeDocument(doc);
  const reopened = deserializeDocument(json);
  assert.equal(reopened.blocks.length, doc.blocks.length, 'block count survives');
  const again = (id) => reopened.blocks.find((b) => b.id === id);
  assert.deepEqual(again(lineId).data, entry(doc, lineId).data, 'block-styled rule survives verbatim');
  assert.deepEqual(again(revId).data.entries[0], entry(doc, revId).data.entries[0], 'revision entry identity survives');
  assert.deepEqual(again(refId).data.entries[0], entry(doc, refId).data.entries[0], 'reference entry identity survives');
  assert.equal(again(revId).data.entries[0].id, revEntryId, 'revision entry id stable');
  assert.equal(again(refId).data.entries[0].id, refEntryId, 'reference entry id stable');
  assert.ok(reopened.blocks.some((b) => b.data.type === 'page-break'), 'page break survives');
  assert.ok(reopened.blocks.some((b) => b.data.type === 'exhibit'), 'exhibit survives');
});

// ═══════════════════════════════════════════════════════════════════════════
// 2. Horizontal rule (P06-M2 §5.1)
// ═══════════════════════════════════════════════════════════════════════════
group('2 · horizontal rule');

await test('2.1 thickness and colour are range-validated before commit', () => {
  const doc = insertBlock(newDoc(), 'horizontal-line').doc;
  const id = only(doc, 'horizontal-line').id;
  const { min, max } = HORIZONTAL_LINE_THICKNESS_PT_RANGE;

  rejected(act(doc, id, { action: 'update-horizontal-line', thicknessPt: min - 0.05 }), 'invalid-thickness', 'below range');
  rejected(act(doc, id, { action: 'update-horizontal-line', thicknessPt: max + 0.5 }), 'invalid-thickness', 'above range');
  rejected(act(doc, id, { action: 'update-horizontal-line', thicknessPt: NaN }), 'invalid-thickness', 'NaN');
  rejected(act(doc, id, { action: 'update-horizontal-line', thicknessPt: Infinity }), 'invalid-thickness', 'Infinity');
  rejected(act(doc, id, { action: 'update-horizontal-line', thicknessPt: '2' }), 'invalid-thickness', 'string');
  rejected(act(doc, id, { action: 'update-horizontal-line', color: 'javascript:alert(1)' }), 'invalid-color', 'junk colour');
  rejected(act(doc, id, { action: 'update-horizontal-line', color: 'red-ish' }), 'invalid-color', 'non-hex colour');
  assert.equal(doc.blocks.find((b) => b.id === id).data.thicknessPt, 1, 'rejects never mutate (thickness)');
  assert.equal(doc.blocks.find((b) => b.id === id).data.color, '#999999', 'rejects never mutate (colour)');

  const styled = applied(act(doc, id, { action: 'update-horizontal-line', thicknessPt: 2.5, color: '#123456' }), 'valid style');
  const data = styled.blocks.find((b) => b.id === id).data;
  assert.equal(data.thicknessPt, 2.5, 'thickness stored');
  assert.equal(data.color, '#123456', 'normalised colour stored');
  assert.equal(data.styleSource, 'block', 'editing marks the rule block-authored');
  // Theme path: an untouched rule carries no styleSource and stays default.
  assert.equal('styleSource' in only(doc, 'horizontal-line').data, false, 'default rule has no styleSource');
});

await test('2.2 editing the rule is idempotent; re-committing stored values is a no-op', () => {
  const doc = insertBlock(newDoc(), 'horizontal-line').doc;
  const id = only(doc, 'horizontal-line').id;
  const styled = applied(act(doc, id, { action: 'update-horizontal-line', thicknessPt: 3, color: '#ABCDEF' }), 'first edit');
  const data = styled.blocks.find((b) => b.id === id).data;
  assert.equal(data.color, '#abcdef', 'hex is normalised to lowercase');
  noOp(act(styled, id, { action: 'update-horizontal-line', thicknessPt: 3, color: '#abcdef' }), styled, 'same values');
  noOp(updateHorizontalLineContent(styled, id, { thicknessPt: 3 }), styled, 'direct service same value');
});

// ═══════════════════════════════════════════════════════════════════════════
// 3. Page break vs section break (P06-M2 §5.2 / §5.3)
// ═══════════════════════════════════════════════════════════════════════════
group('3 · page & section breaks');

/** A two-heading document with a structural block inserted between them. */
function breakFixture(type) {
  let doc = newDoc('break-doc');
  const h1 = insertBlock(doc, 'heading').doc;
  const beforeId = h1.blocks[0].id;
  doc = insertBlock(h1, type).doc;
  doc = insertBlock(doc, 'heading').doc;
  const afterId = doc.blocks[doc.blocks.length - 1].id;
  // Give both headings distinguishable text via the registry default.
  return { doc, beforeId, afterId, breakId: doc.blocks[1].id };
}

await test('3.1 a mid-document page break starts the following block on a new page', async () => {
  const { doc } = breakFixture('page-break');
  const texts = await pageTextsOf(doc);
  assert.equal(texts.length, 2, 'two physical pages');
  assert.ok(has(texts[0], 'Section heading'), 'first heading on page 1');
  assert.ok(has(texts[1], 'Section heading'), 'second heading on page 2');
});

await test('3.2 a section break never forces a new page', async () => {
  const { doc } = breakFixture('section-break');
  const texts = await pageTextsOf(doc);
  assert.equal(texts.length, 1, 'single physical page');
  assert.equal(countOf(texts[0], 'Section heading'), 2, 'both headings share the page');
});

await test('3.3 a page break at the beginning adds no empty leading page', async () => {
  let doc = newDoc('lead-break');
  doc = insertBlock(doc, 'page-break').doc;
  doc = insertBlock(doc, 'heading').doc;
  const texts = await pageTextsOf(doc);
  assert.equal(texts.length, 1, 'no empty first page is produced');
  assert.ok(has(texts[0], 'Section heading'), 'the heading renders on page 1');
});

await test('3.4 consecutive page breaks collapse to one boundary (no blank pages)', async () => {
  let doc = newDoc('double-break');
  doc = insertBlock(doc, 'heading').doc;
  doc = insertBlock(doc, 'page-break').doc;
  doc = insertBlock(doc, 'page-break').doc;
  doc = insertBlock(doc, 'heading').doc;
  const texts = await pageTextsOf(doc);
  assert.equal(texts.length, 2, 'exactly one page boundary (no intervening blank page)');
  assert.ok(has(texts[1], 'Section heading'), 'content after the break chain is on page 2');
  assert.equal(doc.blocks.filter((b) => b.data.type === 'page-break').length, 2, 'both markers remain in the document');
});

await test('3.5 a trailing page break adds no empty trailing page', async () => {
  let doc = newDoc('tail-break');
  doc = insertBlock(doc, 'heading').doc;
  doc = insertBlock(doc, 'page-break').doc;
  const texts = await pageTextsOf(doc);
  assert.equal(texts.length, 1, 'no blank trailing page is produced');
  assert.ok(has(texts[0], 'Section heading'), 'the heading still renders');
});

await test('3.6 a page break renders no visible marker text of its own', async () => {
  const { doc } = breakFixture('page-break');
  const texts = await pageTextsOf(doc);
  assert.equal(has(texts[0], 'pagebreak'), false, 'no literal marker text on page 1');
  assert.equal(has(texts[1], 'pagebreak'), false, 'no literal marker text on page 2');
});

await test('3.7 the section title editor accepts an empty title (valid, optional)', () => {
  const doc = insertBlock(newDoc(), 'section-break').doc;
  const id = only(doc, 'section-break').id;
  const titled = applied(act(doc, id, { action: 'update-section-break', title: 'Scope' }), 'title set');
  assert.equal(titled.blocks.find((b) => b.id === id).data.title, 'Scope', 'title stored');
  const cleared = applied(act(titled, id, { action: 'update-section-break', title: '' }), 'title cleared');
  assert.equal('title' in cleared.blocks.find((b) => b.id === id).data, false, 'empty title removes the optional field');
  rejected(act(doc, id, { action: 'update-section-break', title: 42 }), 'invalid-title', 'non-text title');
});

await test('3.8 a titled section break renders title and divider inline (no new page)', async () => {
  const { doc } = breakFixture('section-break');
  const id = doc.blocks[1].id;
  const titled = applied(act(doc, id, { action: 'update-section-break', title: 'SEC-TITLE-INLINE' }), 'title set');
  const texts = await pageTextsOf(titled);
  assert.equal(texts.length, 1, 'still one physical page');
  assert.ok(has(texts[0], 'SEC-TITLE-INLINE'), 'section title is rendered');
  assert.equal(titled.blocks.find((b) => b.id === id).data.type, 'section-break', 'type never becomes page-break');
});

// ═══════════════════════════════════════════════════════════════════════════
// 4. Metadata block (P06-M2 §5.4)
// ═══════════════════════════════════════════════════════════════════════════
group('4 · metadata block');

await test('4.1 field selection is ordered, validated and rejects unknown/duplicate values', () => {
  let doc = newDoc('meta-doc');
  doc = { ...doc, metadata: { ...doc.metadata, documentId: 'SOP-META-001', status: 'Draft' } };
  doc = insertBlock(doc, 'metadata-block').doc;
  const id = only(doc, 'metadata-block').id;

  const ordered = applied(
    act(doc, id, { action: 'set-metadata-fields', fields: ['status', 'documentId', 'title'] }),
    'ordered selection',
  );
  assert.deepEqual(
    ordered.blocks.find((b) => b.id === id).data.visibleFields,
    ['status', 'documentId', 'title'],
    'the configured order is stored verbatim',
  );
  rejected(
    act(doc, id, { action: 'set-metadata-fields', fields: ['title', 'not-a-field'] }),
    'unknown-metadata-field',
    'unknown scalar key',
  );
  rejected(
    act(doc, id, { action: 'set-metadata-fields', fields: ['custom:00000000-0000-4000-8000-00000000dead'] }),
    'unknown-metadata-field',
    'custom field that does not exist in this document',
  );
  rejected(
    act(doc, id, { action: 'set-metadata-fields', fields: ['title', 'title'] }),
    'duplicate-metadata-field',
    'duplicate entry',
  );
  rejected(act(doc, id, { action: 'set-metadata-fields', fields: 'title' }), 'invalid-fields', 'non-array');
  // An empty selection is VALID (the renderer shows an honest note).
  const emptied = applied(act(doc, id, { action: 'set-metadata-fields', fields: [] }), 'empty selection');
  assert.deepEqual(emptied.blocks.find((b) => b.id === id).data.visibleFields, [], 'empty selection stored');
});

await test('4.2 rendered values come from the authoritative document metadata', async () => {
  let doc = newDoc('meta-render');
  doc = {
    ...doc,
    metadata: { ...doc.metadata, documentId: 'SOP-LIVE-4242', status: 'Approved', title: 'Metadata Render Test' },
  };
  doc = insertBlock(doc, 'metadata-block').doc;
  const id = only(doc, 'metadata-block').id;
  doc = applied(
    act(doc, id, { action: 'set-metadata-fields', fields: ['documentId', 'title', 'status'] }),
    'selection',
  );
  const texts = await pageTextsOf(doc);
  const body = texts.join(' ');
  assert.ok(has(body, 'SOP-LIVE-4242'), 'document id rendered');
  assert.ok(has(body, 'Metadata Render Test'), 'title rendered');
  assert.ok(has(body, 'Approved'), 'status rendered');
  assert.equal(fallbackMarker(texts), false, 'no fallback marker');
  // Values are resolved at render time — the block stores keys only.
  const data = doc.blocks.find((b) => b.id === id).data;
  assert.deepEqual(data.visibleFields, ['documentId', 'title', 'status'], 'block stores field keys only');
  assert.equal(JSON.stringify(data).includes('SOP-LIVE-4242'), false, 'no stale value copy inside the block');
});

await test('4.3 empty selection and empty values render honest notes, never undefined', async () => {
  let doc = newDoc('meta-empty');
  doc = { ...doc, metadata: { ...doc.metadata, organizationName: '', issueNumber: undefined } };
  doc = insertBlock(doc, 'metadata-block').doc;
  const id = only(doc, 'metadata-block').id;

  const texts = await pageTextsOf(doc);
  const body = texts.join(' ');
  assert.equal(has(body, 'undefined'), false, 'never prints the token "undefined"');
  assert.equal(has(body, 'null'), false, 'never prints the token "null"');

  // Fields whose values are all empty → the "no values" note, not blank rows.
  doc = applied(act(doc, id, { action: 'set-metadata-fields', fields: ['organizationName'] }), 'empty-valued field');
  const emptyTexts = (await pageTextsOf(doc)).join(' ');
  assert.ok(has(emptyTexts, 'No metadata values to display'), 'empty-valued selection shows the honest note');
});

// ═══════════════════════════════════════════════════════════════════════════
// 5. Revision history (P06-M2 §5.5)
// ═══════════════════════════════════════════════════════════════════════════
group('5 · revision history');

await test('5.1 add / edit / remove entries with stable ids and validation', () => {
  let doc = newDoc('rev-doc');
  doc = insertBlock(doc, 'revision-history').doc;
  const id = only(doc, 'revision-history').id;
  const block = () => doc.blocks.find((b) => b.id === id).data;
  assert.equal(block().entries.length, 1, 'registry default seeds one entry');
  const seededId = block().entries[0].id;

  const added = act(doc, id, { action: 'add-revision-entry' });
  doc = applied(added, 'entry added');
  assert.equal(block().entries.length, 2, 'entry appended');
  assert.equal(added.entryId, block().entries[1].id, 'service reports the new entry id for focus');
  assert.notEqual(added.entryId, seededId, 'a fresh id was generated');
  assert.equal(block().entries[1].revision, '2', 'new entry defaults to the next sequence number');
  assert.equal(block().entries[0].id, seededId, 'existing entry identity preserved');

  doc = applied(
    act(doc, id, {
      action: 'update-revision-entry',
      entryId: seededId,
      patch: { revision: 'Rev A', date: '2026-10-20', author: 'IKRAM', description: 'Initial issue' },
    }),
    'entry edited',
  );
  const edited = block().entries.find((e) => e.id === seededId);
  assert.deepEqual(edited, { id: seededId, revision: 'Rev A', date: '2026-10-20', author: 'IKRAM', description: 'Initial issue' }, 'all four fields stored');
  assert.equal(block().entries[1].id, added.entryId, 'the other entry is untouched');

  rejected(
    act(doc, id, { action: 'update-revision-entry', entryId: seededId, patch: { revision: '   ' } }),
    'invalid-revision',
    'blank revision label',
  );
  rejected(
    act(doc, id, { action: 'update-revision-entry', entryId: seededId, patch: { date: '20/10/2026' } }),
    'invalid-date',
    'non ISO date',
  );
  rejected(
    act(doc, id, { action: 'update-revision-entry', entryId: newUUID(), patch: { author: 'X' } }),
    'missing-entry',
    'unknown entry id',
  );
  doc = applied(act(doc, id, { action: 'remove-revision-entry', entryId: added.entryId }), 'entry removed');
  assert.equal(block().entries.length, 1, 'one entry removed');
  assert.equal(block().entries[0].id, seededId, 'surviving entry keeps its id');
});

await test('5.2 entries may be removed to zero and the block survives with an honest empty state', async () => {
  let doc = newDoc('rev-empty');
  doc = insertBlock(doc, 'revision-history').doc;
  const id = only(doc, 'revision-history').id;
  const entryId = doc.blocks.find((b) => b.id === id).data.entries[0].id;
  doc = applied(act(doc, id, { action: 'remove-revision-entry', entryId }), 'last entry removed');
  assert.equal(doc.blocks.find((b) => b.id === id).data.entries.length, 0, 'zero entries stored');
  assert.ok(doc.blocks.some((b) => b.id === id), 'the block itself is never removed by entry actions');
  const texts = await pageTextsOf(doc);
  assert.equal(fallbackMarker(texts), false, 'no fallback marker');
  assert.ok(has(texts.join(' '), 'No revision entries'), 'honest empty-state note renders');
});

await test('5.3 the rendered table carries every column and wraps long descriptions', async () => {
  let doc = newDoc('rev-render');
  doc = insertBlock(doc, 'revision-history').doc;
  const id = only(doc, 'revision-history').id;
  const entryId = doc.blocks.find((b) => b.id === id).data.entries[0].id;
  const longDescription =
    'DESC-UNIQUE-6e3f This change description is intentionally long enough to require wrapping across several rendered lines in the revision table without losing any of its text content for later verification. ';
  doc = applied(
    act(doc, id, {
      action: 'update-revision-entry',
      entryId,
      patch: { revision: 'REV-001', date: '2026-10-20', author: 'AUTHOR-UNIQUE', description: longDescription },
    }),
    'entry filled',
  );
  const texts = await pageTextsOf(doc);
  const body = texts.join(' ');
  assert.ok(has(body, 'Revision'), 'Revision column header renders');
  assert.ok(has(body, 'Date'), 'Date column header renders');
  assert.ok(has(body, 'Author'), 'Author column header renders');
  assert.ok(has(body, 'Description'), 'Description column header renders');
  assert.ok(has(body, 'REV-001'), 'revision value renders');
  assert.ok(has(body, 'AUTHOR-UNIQUE'), 'author value renders');
  assert.ok(has(body, 'DESC-UNIQUE-6e3f'), 'description opening renders');
  // The PoC renderer hyphenates long words at the wrap point (the tail
  // renders as "ver-ification"); compare with hyphens stripped so this
  // asserts TEXT SURVIVAL rather than a hyphenation style.  Nothing may
  // be clipped away by the table row.
  assert.ok(compact(body).replace(/-/g, '').includes('laterverification'),
    'description tail survives wrapping (not clipped away)');
  assert.equal(fallbackMarker(texts), false, 'no fallback marker');
});

// ═══════════════════════════════════════════════════════════════════════════
// 6. References (P06-M2 §5.6)
// ═══════════════════════════════════════════════════════════════════════════
group('6 · references');

await test('6.1 ordered entries with stable ids; keys required; URL sanitized', () => {
  let doc = newDoc('ref-doc');
  doc = insertBlock(doc, 'reference').doc;
  const id = only(doc, 'reference').id;
  const block = () => doc.blocks.find((b) => b.id === id).data;

  doc = applied(act(doc, id, { action: 'update-reference-title', title: 'Normative references' }), 'title set');
  const first = block().entries[0].id;
  doc = applied(
    act(doc, id, { action: 'update-reference-entry', entryId: first, patch: { key: '[1]', citation: 'ISO/IEC 17025:2017', url: 'https://www.iso.org/standard/66912.html' } }),
    'first entry',
  );
  const added = act(doc, id, { action: 'add-reference-entry' });
  doc = applied(added, 'second entry appended');
  assert.equal(block().entries.length, 2, 'entry appended at the end (order preserved)');
  assert.equal(block().entries[0].id, first, 'first entry identity preserved');
  assert.equal(block().entries[1].key, '[2]', 'new entry keys continue the sequence');
  assert.equal('url' in block().entries[1], false, 'a fresh entry carries no URL until one is typed');
});

await test('6.2 unsafe URLs are rejected; safe ones are normalized; clearing works', () => {
  let doc = newDoc('ref-url');
  doc = insertBlock(doc, 'reference').doc;
  const id = only(doc, 'reference').id;
  const entryId = doc.blocks.find((b) => b.id === id).data.entries[0].id;

  rejected(
    act(doc, id, { action: 'update-reference-entry', entryId, patch: { url: 'javascript:alert(1)' } }),
    'invalid-url',
    'javascript scheme',
  );
  rejected(
    act(doc, id, { action: 'update-reference-entry', entryId, patch: { url: 'file:///C:/secret.txt' } }),
    'invalid-url',
    'file scheme',
  );
  rejected(
    act(doc, id, { action: 'update-reference-entry', entryId, patch: { key: '   ' } }),
    'invalid-reference-key',
    'blank key',
  );
  const safe = applied(
    act(doc, id, { action: 'update-reference-entry', entryId, patch: { url: 'https://www.bipm.org/en/measurement-units' } }),
    'safe url',
  );
  const stored = safe.blocks.find((b) => b.id === id).data.entries[0];
  assert.ok(stored.url.startsWith('https://'), 'safe URL stored');
  const cleared = applied(
    act(safe, id, { action: 'update-reference-entry', entryId, patch: { url: null } }),
    'url cleared',
  );
  assert.equal('url' in cleared.blocks.find((b) => b.id === id).data.entries[0], false, 'cleared URL removed from the object');
});

await test('6.3 rendered references carry keys, citations and links; long citations wrap', async () => {
  let doc = newDoc('ref-render');
  doc = insertBlock(doc, 'reference').doc;
  const id = only(doc, 'reference').id;
  doc = applied(act(doc, id, { action: 'update-reference-title', title: 'REF-TITLE-UNIQUE' }), 'title');
  const first = doc.blocks.find((b) => b.id === id).data.entries[0].id;
  const longCitation =
    'CITE-UNIQUE-91af A deliberately long citation string that must wrap across multiple rendered lines in the reference list while preserving every word, including this trailing clause which proves nothing was truncated away by the renderer. ';
  doc = applied(
    act(doc, id, { action: 'update-reference-entry', entryId: first, patch: { key: '[R1]', citation: longCitation, url: 'https://www.iso.org/ontology' } }),
    'long citation',
  );
  const added = act(doc, id, { action: 'add-reference-entry' });
  doc = applied(added, 'second');
  doc = applied(
    act(doc, id, { action: 'update-reference-entry', entryId: added.entryId, patch: { key: '[R2]', citation: 'A citation with no URL at all.' } }),
    'no-url entry',
  );

  const buf = await render(doc);
  const pages = pdfPages(buf);
  const body = pages.map((p) => pageText(p)).join(' ');
  assert.ok(has(body, 'REF-TITLE-UNIQUE'), 'reference title renders');
  assert.ok(has(body, '[R1]'), 'first key renders');
  assert.ok(has(body, '[R2]'), 'second key renders');
  assert.ok(has(body, 'CITE-UNIQUE-91af'), 'citation opening renders');
  // Hyphen-tolerant tail check (the PoC renderer hyphenates long words at
  // the wrap point, e.g. "trun-cated") — asserts the text SURVIVED.
  assert.ok(compact(body).replace(/-/g, '').includes('nothingwastruncatedaway'),
    'citation tail survives wrapping');
  assert.ok(has(body, 'no URL at all'), 'entry without a URL still renders its citation');
  // NOTE: `/URI` lives in the PDF's annotation OBJECT, not in a content
  // stream — search the whole raw file, not the inflated streams.
  assert.ok(buf.toString('latin1').includes('/URI'), 'the safe URL became a real PDF link annotation');
  assert.equal(fallbackMarker(pages.map((p) => pageText(p))), false, 'no fallback marker');
});

// ═══════════════════════════════════════════════════════════════════════════
// 7. Exhibit / annexure (P06-M2 §5.7)
// ═══════════════════════════════════════════════════════════════════════════
group('7 · exhibit / annexure');

await test('7.1 label required; title/notes optional; asset validated against real assets', () => {
  const doc = insertBlock(newDoc('exh-doc'), 'exhibit').doc;
  const id = only(doc, 'exhibit').id;

  rejected(act(doc, id, { action: 'update-exhibit', patch: { label: '   ' } }), 'invalid-label', 'blank label');
  rejected(
    act(doc, id, { action: 'update-exhibit', patch: { assetId: newUUID() } }),
    'invalid-asset',
    'asset that does not exist',
  );
  const edited = applied(
    act(doc, id, { action: 'update-exhibit', patch: { label: 'Exhibit B', title: 'Calibration chart', notes: 'Recorded at 20 °C.' } }),
    'label/title/notes',
  );
  const data = edited.blocks.find((b) => b.id === id).data;
  assert.equal(data.label, 'Exhibit B', 'label stored');
  assert.equal(data.title, 'Calibration chart', 'title stored');
  assert.equal(data.notes, 'Recorded at 20 °C.', 'notes stored');
  assert.equal('assetId' in data, false, 'no asset referenced by default');

  const cleared = applied(act(edited, id, { action: 'update-exhibit', patch: { title: '' } }), 'title cleared');
  assert.equal('title' in cleared.blocks.find((b) => b.id === id).data, false, 'empty title removes the field');
});

await test('7.2 label/title/notes render; a missing asset reference renders an honest note', async () => {
  const doc = insertBlock(newDoc('exh-render'), 'exhibit').doc;
  const id = only(doc, 'exhibit').id;
  const filled = applied(
    act(doc, id, { action: 'update-exhibit', patch: { label: 'EXHIBIT-LBL', title: 'EXHIBIT-TITLE', notes: 'EXHIBIT-NOTES-TEXT' } }),
    'label/title/notes',
  );
  // The service REJECTS unknown asset ids (asserted in 7.1), so the
  // "asset was deleted behind the block's back" state is produced by
  // doctoring the data object directly — exactly what an old file could
  // contain.  The renderer must survive it honestly.
  const doctored = {
    ...filled,
    blocks: filled.blocks.map((b) =>
      b.id === id ? { ...b, data: { ...b.data, assetId: '00000000-0000-4000-8000-00000000beef' } } : b,
    ),
  };
  const texts = await pageTextsOf(doctored);
  const body = texts.join(' ');
  assert.ok(has(body, 'EXHIBIT-LBL'), 'label renders');
  assert.ok(has(body, 'EXHIBIT-TITLE'), 'title renders');
  assert.ok(has(body, 'EXHIBIT-NOTES-TEXT'), 'notes render');
  assert.ok(has(body, 'missing or is not a renderable image'), 'dangling asset shows the honest fallback note');
  assert.equal(fallbackMarker(texts), false, 'no generic not-mapped marker');
});

await test('7.3 an existing embedded image asset renders as an image', async () => {
  let doc = newDoc('exh-image');
  doc = insertBlock(doc, 'exhibit').doc;
  const id = only(doc, 'exhibit').id;
  // A tiny valid 1×1 PNG (89 bytes of base64) embedded through the real asset map.
  const pngBase64 =
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
  const assetId = genId();
  doc = {
    ...doc,
    assets: {
      ...doc.assets,
      [assetId]: { id: assetId, filename: 'chart.png', mimeType: 'image/png', sizeBytes: 68, addedAt: T0, base64Data: pngBase64 },
    },
  };
  const linked = applied(act(doc, id, { action: 'update-exhibit', patch: { assetId } }), 'asset linked');
  assert.equal(linked.blocks.find((b) => b.id === id).data.assetId, assetId, 'existing image asset stored');
  const buf = await render(linked);
  const pages = pdfPages(buf);
  const body = pages.map((p) => pageText(p)).join(' ');
  assert.ok(has(body, 'Exhibit A'), 'default label renders');
  // `/Subtype /Image` lives in the image OBJECT's dictionary, not in a
  // page content stream — search the whole raw file.
  assert.ok(buf.toString('latin1').includes('/Subtype /Image'),
    'the linked PNG became a real PDF image XObject');
  assert.equal(fallbackMarker(pages.map((p) => pageText(p))), false, 'no fallback marker');
});

// ═══════════════════════════════════════════════════════════════════════════
// 8. Rendered PDF: one representative structural document (real PocDocument)
// ═══════════════════════════════════════════════════════════════════════════
group('8 · representative structural document (real renderer)');

/** Build the demo document used for the end-to-end PDF assertions. */
async function buildStructuralSample() {
  let doc = newDoc('structural-sample');
  doc = {
    ...doc,
    metadata: {
      ...doc.metadata,
      title: 'Structural Blocks Sample',
      documentId: 'SOP-STRUCT-002',
      status: 'Draft',
      organizationName: 'DocStudio Proof-of-Concept Laboratory',
    },
  };

  const add = (type) => {
    doc = insertBlock(doc, type).doc;
    return doc.blocks[doc.blocks.length - 1].id;
  };
  const run = (blockId, action) => {
    doc = applied(act(doc, blockId, action), `sample: ${action.action}`);
  };

  add('heading');
  add('paragraph');
  const ruleId = add('horizontal-line');
  run(ruleId, { action: 'update-horizontal-line', thicknessPt: 2, color: '#335577' });
  const metaId = add('metadata-block');
  run(metaId, { action: 'set-metadata-fields', fields: ['documentId', 'title', 'status', 'organizationName'] });
  const revId = add('revision-history');
  const revEntryId = doc.blocks.find((b) => b.id === revId).data.entries[0].id;
  run(revId, { action: 'update-revision-entry', entryId: revEntryId, patch: { revision: '1', date: '2026-10-20', author: 'I. Wahid', description: 'Initial structural sample issue.' } });
  const refId = add('reference');
  const refEntryId = doc.blocks.find((b) => b.id === refId).data.entries[0].id;
  run(refId, { action: 'update-reference-entry', entryId: refEntryId, patch: { key: '[1]', citation: 'ISO/IEC 17025:2017 — General requirements for the competence of testing and calibration laboratories.', url: 'https://www.iso.org/standard/66912.html' } });
  const exhId = add('exhibit');
  run(exhId, { action: 'update-exhibit', patch: { label: 'Annex A', title: 'Supporting record', notes: 'Attached for completeness.' } });
  const sectionId = add('section-break');
  run(sectionId, { action: 'update-section-break', title: 'SECOND SECTION' });
  add('paragraph');
  add('page-break');
  add('heading');
  add('paragraph');
  return doc;
}

await test('8.1 sample renders with no fallback marker for any structural type', async () => {
  const doc = await buildStructuralSample();
  const texts = await pageTextsOf(doc);
  assert.equal(fallbackMarker(texts), false,
    'no "[…] not yet mapped" marker appears for any of the seven structural types');
});

await test('8.2 every configured structural value appears in the extracted text', async () => {
  const doc = await buildStructuralSample();
  const body = (await pageTextsOf(doc)).join(' ');
  for (const needle of [
    'SOP-STRUCT-002', // metadata value from doc.metadata
    'Structural Blocks Sample',
    'Draft', // status
    'SECOND SECTION', // section-break title
    'Revision', // revision table headers
    'Initial structural sample issue.', // revision description
    'ISO/IEC 17025:2017', // reference citation
    'Annex A', // exhibit label
    'Supporting record', // exhibit title
    'Attached for completeness.', // exhibit notes
  ]) {
    assert.ok(has(body, needle), `expected the rendered text to contain ${JSON.stringify(needle)}`);
  }
  assert.ok(has(body, 'https://www.iso.org/standard/66912.html'), 'reference URL renders');
});

await test('8.3 the page break produces a real boundary in the sample', async () => {
  const doc = await buildStructuralSample();
  const texts = await pageTextsOf(doc);
  assert.ok(texts.length >= 2, `sample spans multiple pages (${texts.length})`);
  // The last heading must land on a LATER page than the first paragraph.
  const pageIndexOf = (needle) => texts.findIndex((t) => has(t, needle));
  assert.ok(pageIndexOf('Section heading') === 0, 'the first heading is on page 1');
  assert.ok(pageIndexOf('SECOND SECTION') >= 0, 'section break is rendered somewhere');
  const lastPage = texts[texts.length - 1];
  assert.ok(has(lastPage, 'Section heading'), 'the post-break heading renders on the final page');
  assert.ok(has(lastPage, 'SOP-STRUCT-002') || texts.length >= 2, 'content is spread across pages');
});

await test('8.4 rendering is deterministic across repeated runs', async () => {
  const doc = await buildStructuralSample();
  const first = await render(doc);
  const second = await render(doc);
  assert.ok(first.equals(second), 'two renders of the same document are byte-identical');
  assert.ok(first.length > 1000, `a real PDF was produced (${first.length} B)`);
  assert.equal(first.subarray(0, 5).toString('latin1'), '%PDF-', 'genuine PDF header');
});

await test('8.5 nothing is written to fixtures/ (baselines stay protected)', () => {
  const fixtureDir = path.join(root, 'fixtures');
  const listing = fs.readdirSync(fixtureDir);
  assert.ok(listing.length > 0, 'fixtures directory still populated');
  // The suite never imported a store helper; assert no p06-m2 directory exists.
  assert.equal(fs.existsSync(path.join(fixtureDir, 'p06-m2')), false,
    'this suite writes no fixture artifacts (in-memory rendering only)');
});

// ═══════════════════════════════════════════════════════════════════════════
// 9. Regression: existing block types still work alongside structural ones
// ═══════════════════════════════════════════════════════════════════════════
group('9 · regression');

await test('9.1 existing block types render unchanged beside structural blocks', async () => {
  let doc = newDoc('regress-doc');
  for (const type of ['heading', 'paragraph', 'list', 'callout', 'table', 'horizontal-line', 'metadata-block']) {
    doc = insertBlock(doc, type).doc;
  }
  const texts = await pageTextsOf(doc);
  assert.equal(fallbackMarker(texts), false, 'no structural fallback markers');
  assert.ok(has(texts.join(' '), 'Section heading'), 'headings still render');
  assert.ok(has(texts.join(' '), 'Callout'), 'callouts still render');
});

await test('9.2 the metadata block respects the default field selection', () => {
  const doc = insertBlock(newDoc(), 'metadata-block').doc;
  const data = only(doc, 'metadata-block').data;
  assert.deepEqual(data.visibleFields, ['title', 'documentId', 'status'], 'registry default selection');
});

await test('9.3 metadataFieldChoices exposes every scalar field plus document customs', () => {
  const doc = newDoc('choices-doc');
  const customId = genId();
  const withCustom = {
    ...doc,
    metadata: { ...doc.metadata, customFields: [{ id: customId, label: 'Project code', value: 'P-42' }] },
  };
  const choices = metadataFieldChoices(withCustom.metadata.customFields);
  const keys = choices.map((c) => c.field);
  for (const expected of [
    'title', 'documentId', 'status', 'subtitle', 'organizationName', 'issueNumber', 'issueDate',
    'documentHolder', 'createdAt', 'modifiedAt', `custom:${customId}`,
  ]) {
    assert.ok(keys.includes(expected), `picker offers ${expected}`);
  }
  assert.equal(keys.filter((k) => k === `custom:${customId}`).length, 1, 'no duplicate custom entries');
  assert.equal(choices.find((c) => c.field === `custom:${customId}`).label, 'Project code', 'custom label shown');
});

await test('9.4 MAX_STRUCTURAL_TEXT_LENGTH guards free-text fields', () => {
  const doc = insertBlock(newDoc(), 'exhibit').doc;
  const id = only(doc, 'exhibit').id;
  const huge = 'x'.repeat(MAX_STRUCTURAL_TEXT_LENGTH + 1);
  rejected(act(doc, id, { action: 'update-exhibit', patch: { notes: huge } }), 'invalid-text', 'over-long notes');
  assert.ok(MAX_STRUCTURAL_TEXT_LENGTH >= 1000, 'limit is a sane document-scale value');
});

// ═══════════════════════════════════════════════════════════════════════════
// 10. Structural editor layout & field availability (owner corrective)
// ═══════════════════════════════════════════════════════════════════════════
//
// Owner-reported defects in the shipped P06-M2 editors: the metadata block
// appeared to offer only its three default fields and removed fields could
// not be re-added; the references "Add reference" button was obscured by the
// first citation; the exhibit form extended horizontally outside the card.
// Root cause (measured live at a 1296 px viewport): every structural editor
// rooted its JSX in `.content-field`, a HORIZONTAL flex row, so title field,
// hint, entry list and Add button sat side-by-side — the metadata card was
// 396 px wide with 706 px of content (the whole "Add a field" list started
// 58 px PAST the card edge and was clipped), the references card was 396 px
// with 717 px of content (Add reference pushed out of the card), and the
// exhibit card was 396 px with 1144 px of content (Notes squeezed to 22 px).
// These checks render the REAL compiled components with react-dom/server so
// the vertical-stack structure cannot regress unnoticed.
group('10 · editor layout & availability (owner corrective)');

const noopResult = { ok: true, changed: false, doc: null };
const noopAction = () => noopResult;
const noopError = () => {};
const renderEditor = (Component, props) =>
  renderToStaticMarkup(React.createElement(Component, { onAction: noopAction, onError: noopError, ...props }));
const rootClassOf = (markup) => (markup.match(/^<div class="([^"]*)"/) || [])[1] ?? '';

await test('10.1 the metadata editor offers every supported field as a visible add option', () => {
  const markup = renderEditor(structuralEditors.MetadataBlockEditor, {
    blockId: '06200000-0000-4000-8000-0000000000ff',
    data: { type: 'metadata-block', visibleFields: ['title', 'documentId', 'status'] },
    customFields: [{ id: '06200000-0000-4000-8000-0000000000ee', label: 'Project code', value: 'P-42' }],
  });
  assert.equal(
    rootClassOf(markup),
    'structural-editor',
    'metadata editor roots in the vertical stack (the horizontal content-field root clipped the add-list off-card)',
  );
  for (const label of [
    'Subtitle',
    'Organization / Laboratory Name',
    'Issue Number',
    'Issue Date',
    'Document Holder',
    'Created (date)',
    'Last modified (date)',
  ]) {
    assert.ok(markup.includes(`aria-label="Add ${label}"`), `add option offered: ${label}`);
  }
  assert.ok(markup.includes('aria-label="Add Project code"'), 'document custom fields are offered too');
  assert.equal(markup.includes('aria-label="Add Title"'), false, 'already-selected fields are not re-offered');
  assert.ok(markup.includes('aria-label="Remove Document Status"'), 'selected fields remain removable');
  assert.ok(markup.includes('omitted from the rendered output'), 'the empty-value hint is present');
});

await test('10.2 a removed metadata field can be added again (service round trip, order kept)', () => {
  let doc = newDoc('meta-roundtrip');
  doc = { ...doc, metadata: { ...doc.metadata, documentId: 'SOP-RT-1', status: 'Draft', subtitle: 'Sub' } };
  doc = insertBlock(doc, 'metadata-block').doc;
  const id = only(doc, 'metadata-block').id;
  const fields = () => doc.blocks.find((b) => b.id === id).data.visibleFields;

  doc = applied(
    act(doc, id, { action: 'set-metadata-fields', fields: ['title', 'documentId', 'status', 'subtitle'] }),
    'select four fields',
  );
  doc = applied(
    act(doc, id, { action: 'set-metadata-fields', fields: fields().filter((f) => f !== 'documentId') }),
    'remove documentId',
  );
  assert.deepEqual(fields(), ['title', 'status', 'subtitle'], 'removal preserves the remaining order');
  doc = applied(
    act(doc, id, {
      action: 'set-metadata-fields',
      fields: [...fields().slice(0, 1), 'documentId', ...fields().slice(1)],
    }),
    're-add documentId',
  );
  assert.deepEqual(fields(), ['title', 'documentId', 'status', 'subtitle'], 'the removed field is re-added at the chosen position');
  noOp(act(doc, id, { action: 'set-metadata-fields', fields: [...fields()] }), doc, 're-committing the identical selection is a no-op');
});

await test('10.3 the references editor keeps Add reference inside the vertical stack', () => {
  const markup = renderEditor(structuralEditors.ReferenceEditor, {
    blockId: '06200000-0000-4000-8000-0000000000fd',
    data: {
      type: 'reference',
      entries: [{
        id: '06200000-0000-4000-8000-0000000000fc',
        key: '[1]',
        citation: 'ISO/IEC 17025:2017',
        url: 'https://www.iso.org/standard/66912.html',
      }],
    },
  });
  assert.equal(rootClassOf(markup), 'structural-editor', 'references editor roots in the vertical stack');
  const addAt = markup.indexOf('>Add reference<');
  const listAt = markup.indexOf('structural-entry-list');
  assert.ok(listAt > 0, 'the citation list is rendered');
  assert.ok(addAt > listAt, 'Add reference sits BELOW the citation list in vertical order');
  assert.ok(markup.includes('content-field content-field--stack'), 'citation fields stack label-above-control');
  assert.ok(markup.includes('ISO/IEC 17025:2017'), 'the existing citation is preserved');
  assert.ok(markup.includes('>Remove reference<'), 'citation removal stays available');
});

await test('10.4 the exhibit editor stacks label, title, notes and asset (honest no-asset state kept)', () => {
  const markup = renderEditor(structuralEditors.ExhibitEditor, {
    blockId: '06200000-0000-4000-8000-0000000000fa',
    data: { type: 'exhibit', label: 'Exhibit A', title: 'Calibration chart', notes: 'See annex.', assetId: undefined },
    assets: [],
  });
  assert.equal(rootClassOf(markup), 'structural-editor', 'exhibit editor roots in the vertical stack');
  assert.equal((markup.match(/content-field--stack/g) || []).length >= 4, true, 'label, title, notes and asset each stack label-above-control');
  assert.ok(markup.includes('(no asset attached)'), 'the honest no-asset option is preserved');
  assert.ok(markup.includes('See annex.'), 'notes are preserved');
});

await test('10.5 the revision editor roots in the vertical stack (add button stays reachable)', () => {
  const markup = renderEditor(structuralEditors.RevisionHistoryEditor, {
    blockId: '06200000-0000-4000-8000-0000000000f8',
    data: {
      type: 'revision-history',
      entries: [{
        id: '06200000-0000-4000-8000-0000000000f7',
        revision: '1',
        date: '2026-10-20',
        author: 'IKRAM',
        description: 'Initial issue',
      }],
    },
  });
  assert.equal(rootClassOf(markup), 'structural-editor', 'revision editor roots in the vertical stack');
  const addAt = markup.indexOf('>Add revision entry<');
  const listAt = markup.indexOf('structural-entry-list');
  assert.ok(listAt > 0 && addAt > listAt, 'Add revision entry sits below the entry list');
  assert.ok(markup.includes('Initial issue'), 'the existing entry is preserved');
});

await test('10.6 the layout CSS defines the vertical stack and no editor reintroduces the horizontal root', () => {
  const css = fs.readFileSync(path.join(root, 'src', 'components', 'editor-panel', 'EditorPanel.css'), 'utf8');
  const start = css.indexOf('.structural-editor');
  const end = css.indexOf('/* ── Rich-text toolbar');
  assert.ok(start > 0 && end > start, 'the structural layout rules exist in EditorPanel.css');
  const structural = css.slice(start, end);
  assert.ok(/\.structural-editor\s*\{[^}]*flex-direction:\s*column/s.test(structural), '.structural-editor is a column layout');
  assert.ok(/\.content-field--stack\s*\{[^}]*flex-direction:\s*column/s.test(structural), '.content-field--stack stacks label above control');
  assert.ok(/\.content-field--stack\s+\.rt-textarea[^}]*min-width:\s*0/s.test(structural), 'textareas can shrink to the card width');
  const editors = fs.readFileSync(
    path.join(root, 'src', 'components', 'editor-panel', 'StructuralContentEditor.tsx'),
    'utf8',
  );
  const horizontalRoots = editors.match(/return \(\s*<div className="content-field">/g) ?? [];
  assert.equal(
    horizontalRoots.length,
    0,
    'no structural editor may root in the horizontal .content-field class (the owner-reported clipping defect)',
  );
});

// ── Summary ─────────────────────────────────────────────────────────────────
group('summary');
console.log(`\n${passed} passed, ${failed.length} failed`);
if (failed.length > 0) {
  console.error(`Failed checks:\n  - ${failed.join('\n  - ')}`);
  process.exit(1);
}
