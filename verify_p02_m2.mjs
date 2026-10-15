/**
 * P02-M2 — Native `.docstudio` round-trip and validation checks
 * ═══════════════════════════════════════════════════════════════════════════
 * Exercises the ACTUAL project-file modules
 * (src/services/document-file.ts + src/types/*) compiled with tsc, using
 * Node's built-in assert — no testing framework is introduced.
 *
 * Usage: node verify_p02_m2.mjs   (or: npm run verify:p02-m2)
 */

import { execSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';

const require = createRequire(import.meta.url);
const root = path.dirname(new URL(import.meta.url).pathname.replace(/^\//, ''));

// ── Compile the real modules to CommonJS in a temp dir ──────────────────────
const outDir = mkdtempSync(path.join(tmpdir(), 'ds-p02-m2-'));
execSync(
  'npx tsc src/services/document-file.ts src/types/blocks.ts src/types/document.ts src/types/defaults.ts' +
    ` --outDir "${outDir}" --module commonjs --target es2020 --moduleResolution node --esModuleInterop --skipLibCheck`,
  { cwd: root, stdio: 'inherit' },
);

const df = require(path.join(outDir, 'services', 'document-file.js'));
const defaults = require(path.join(outDir, 'types', 'defaults.js'));

// ── Tiny test harness ───────────────────────────────────────────────────────
let passed = 0;
const failed = [];
function test(name, fn) {
  try {
    fn();
    passed += 1;
    console.log(`PASS  ${name}`);
  } catch (e) {
    failed.push(name);
    console.error(`FAIL  ${name}\n      ${e.message}`);
  }
}

function expectDocFileError(fn, code) {
  let caught = null;
  try {
    fn();
  } catch (e) {
    caught = e;
  }
  assert.ok(caught, `expected a DocumentFileError, but nothing was thrown`);
  assert.equal(caught.name, 'DocumentFileError', `expected DocumentFileError, got ${caught}: ${caught?.message}`);
  if (code) assert.equal(caught.code, code, `expected code "${code}", got "${caught.code}"`);
  return caught;
}

// ── Fixtures ────────────────────────────────────────────────────────────────
const now = '2026-10-15T10:00:00.000Z';
const doc = defaults.createDefaultDocument(defaults.newUUID(), now);

const assetId = defaults.newUUID();
const base64Data = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

const mkBlock = (data) => ({ id: defaults.newUUID(), spacing: { topPt: 6, bottomPt: 6 }, data });
const imageSlotId = defaults.newUUID();
const colId = defaults.newUUID();

const representativeBlocks = [
  mkBlock({ type: 'heading', level: 2, text: 'Scope', numbered: true, hAlign: 'left' }),
  mkBlock({ type: 'paragraph', spans: [{ text: 'All work ', bold: true }, { text: 'shall be performed…' }], hAlign: 'justify', indentLevel: 0 }),
  mkBlock({ type: 'list', listType: 'bullet', bulletStyle: 'arrow', numberStyle: 'decimal', items: [{ id: defaults.newUUID(), spans: [{ text: 'Item one' }], depth: 0 }] }),
  mkBlock({
    type: 'table',
    hasHeaderRow: true,
    headerStyle: 'light',
    caption: 'Results',
    rows: [0, 1].map(() => ({
      id: defaults.newUUID(),
      cells: [0, 1].map(() => ({ id: defaults.newUUID(), spans: [{ text: 'cell' }], hAlign: 'center', colSpan: 1, rowSpan: 1, isHeader: false })),
    })),
  }),
  mkBlock({ type: 'formula', latex: 'E = mc^2', hAlign: 'center', displayMode: true, variableDefinitions: [{ id: defaults.newUUID(), symbol: 'E', definition: 'Energy' }] }),
  mkBlock({
    type: 'image',
    layout: 'single',
    images: [{ id: imageSlotId, assetId, caption: 'Figure 1', captionPlacement: 'top', figureLabel: 'Figure 1', crop: { x: 0.1, y: 0.1, width: 0.5, height: 0.5 }, widthFraction: 0.6, hAlign: 'center' }],
  }),
  mkBlock({
    type: 'signature',
    hAlign: 'center',
    signers: [
      { id: defaults.newUUID(), role: 'Prepared by', name: 'A. Rahman', designation: 'Researcher', department: 'Chemistry', date: now },
      { id: defaults.newUUID(), role: 'Reviewed by', designation: 'Quality Manager' },
      { id: defaults.newUUID(), role: 'Approved by', name: 'K. Wahid' },
    ],
  }),
  mkBlock({ type: 'procedure-step', sectionTitle: 'Sample Preparation', steps: [{ id: defaults.newUUID(), level: 'main', spans: [{ text: 'Weigh 5 g of sample.' }] }] }),
  mkBlock({ type: 'measurement', columns: [{ id: colId, header: 'Frequency', unit: 'Hz' }], rows: [{ id: defaults.newUUID(), values: { [colId]: '100' } }] }),
  mkBlock({ type: 'acceptance-criteria', criteria: [{ id: defaults.newUUID(), criterion: 'Repeatability', specification: '≤ 0.5 %', result: 'pass' }] }),
];

doc.assets[assetId] = {
  id: assetId,
  filename: 'figure-1.png',
  mimeType: 'image/png',
  sizeBytes: 68,
  addedAt: now,
  base64Data,
};
doc.blocks = representativeBlocks;
doc.metadata.subtitle = 'Round-trip subtitle';
doc.metadata.preparedBy = 'A. Rahman';
doc.frontPage.visibleFields.push('createdAt', 'modifiedAt', 'department');

const json = df.serializeDocument(doc);

// ── 1. Default document serializes and deserializes ─────────────────────────
test('1. default document serializes and deserializes successfully', () => {
  const bare = defaults.createDefaultDocument(defaults.newUUID(), now);
  const roundTripped = df.deserializeDocument(df.serializeDocument(bare));
  assert.equal(roundTripped.__type, 'DocStudio');
  assert.equal(roundTripped.schemaVersion, 1);
  assert.equal(roundTripped.id, bare.id);
  // Stability: serialize → deserialize → serialize is byte-identical.
  assert.equal(df.serializeDocument(roundTripped), df.serializeDocument(bare));
});

// ── 2. Metadata and settings survive unchanged ──────────────────────────────
test('2. metadata and all settings survive the round-trip unchanged', () => {
  const rt = df.deserializeDocument(json);
  assert.deepEqual(rt.metadata, doc.metadata);
  assert.deepEqual(rt.labProfile, doc.labProfile);
  assert.deepEqual(rt.pageSetup, doc.pageSetup);
  assert.deepEqual(rt.pageTypography, doc.pageTypography);
  assert.deepEqual(rt.frontPage, doc.frontPage);
  assert.deepEqual(rt.headerFooter, doc.headerFooter);
  assert.deepEqual(rt.savedRevisions, doc.savedRevisions);
  assert.equal(rt.trackChangesEnabled, doc.trackChangesEnabled);
  assert.equal(rt.id, doc.id);
});

// ── 3. Representative blocks survive ────────────────────────────────────────
test('3. standard and laboratory-specific blocks survive the round-trip', () => {
  const rt = df.deserializeDocument(json);
  assert.equal(rt.blocks.length, representativeBlocks.length);
  assert.deepEqual(rt.blocks, representativeBlocks);
  const types = rt.blocks.map((b) => b.data.type);
  for (const expected of ['heading', 'paragraph', 'list', 'table', 'formula', 'image', 'signature', 'procedure-step', 'measurement', 'acceptance-criteria']) {
    assert.ok(types.includes(expected), `missing block type ${expected}`);
  }
});

// ── 4. Asset records and data survive ───────────────────────────────────────
test('4. asset records and embedded data survive the round-trip', () => {
  const rt = df.deserializeDocument(json);
  assert.ok(rt.assets[assetId], 'asset missing after round-trip');
  assert.deepEqual(rt.assets[assetId], doc.assets[assetId]);
  assert.equal(rt.assets[assetId].base64Data, base64Data);
});

// ── 5. Wrong document signature rejected ────────────────────────────────────
test('5. JSON with the wrong document signature is rejected', () => {
  const bad = JSON.stringify({ ...doc, __type: 'NotDocStudio' });
  const err = expectDocFileError(() => df.deserializeDocument(bad), 'invalid-structure');
  assert.match(err.message, /not a DocStudio project/i);
});

// ── 6. Malformed JSON rejected ──────────────────────────────────────────────
test('6. malformed JSON is rejected', () => {
  expectDocFileError(() => df.deserializeDocument('{ this is not json {{{'), 'invalid-json');
});

// ── 7. Missing/invalid required structures rejected ─────────────────────────
test('7. missing required structures are rejected', () => {
  const variants = [
    ['no pageSetup', (d) => delete d.pageSetup],
    ['no metadata', (d) => delete d.metadata],
    ['metadata.title not a string', (d) => delete d.metadata.title],
    ['blocks not an array', (d) => (d.blocks = 'nope')],
    ['empty block list entry', (d) => (d.blocks = [{}])],
    ['unknown block type', (d) => (d.blocks = [{ id: 'x', spacing: { topPt: 0, bottomPt: 0 }, data: { type: 'hologram' } }])],
    ['no headerFooter', (d) => delete d.headerFooter],
    ['watermark missing opacity', (d) => delete d.headerFooter.watermark.opacity],
    ['assets not an object', (d) => (d.assets = [1, 2, 3])],
    ['asset id/key mismatch', (d) => (d.assets = { wrongKey: d.assets[assetId] })],
  ];
  for (const [label, mutate] of variants) {
    const copy = JSON.parse(json);
    mutate(copy);
    const err = expectDocFileError(() => df.deserializeDocument(JSON.stringify(copy)), 'invalid-structure');
    assert.ok(err.detail, `expected diagnostic detail for: ${label}`);
  }
});

// ── 8. Unsupported schema versions rejected ─────────────────────────────────
test('8. unsupported schema versions are rejected', () => {
  const future = JSON.stringify({ ...doc, schemaVersion: 2 });
  const errFuture = expectDocFileError(() => df.deserializeDocument(future), 'unsupported-version');
  assert.match(errFuture.message, /newer version/i);
  // While v1 is the FIRST schema there is no legitimate older version:
  // zero, fractional and non-numeric versions are structurally invalid.
  // (The 'no-migration' branch becomes reachable once a future release
  // bumps DOCSTUDIO_SCHEMA_VERSION beyond 1.)
  expectDocFileError(() => df.deserializeDocument(JSON.stringify({ ...doc, schemaVersion: 0 })), 'invalid-structure');
  expectDocFileError(() => df.deserializeDocument(JSON.stringify({ ...doc, schemaVersion: 1.5 })), 'invalid-structure');
  expectDocFileError(() => df.deserializeDocument(JSON.stringify({ ...doc, schemaVersion: '1' })), 'invalid-structure');
});

// ── 9. Failed load does not replace the active document ─────────────────────
test('9. a failed load never replaces the active document', () => {
  // Mirrors the App open-handler pattern: deserialize first, assign only
  // on success.  A rejected file must leave the active document untouched.
  let active = df.deserializeDocument(json); // active document
  const before = JSON.stringify(active);
  const attempt = (text) => {
    try {
      active = df.deserializeDocument(text);
      return true;
    } catch {
      return false;
    }
  };
  assert.equal(attempt('{ not json'), false);
  assert.equal(attempt(JSON.stringify({ __type: 'Other' })), false);
  assert.equal(attempt(JSON.stringify({ ...doc, schemaVersion: 99 })), false);
  assert.equal(JSON.stringify(active), before, 'active document was modified by a failed load');
  // A successful load still replaces it.
  assert.equal(attempt(json), true);
  assert.equal(active.id, doc.id);
});

// ── Bonus: invalid in-memory documents are never serializable to disk ───────
test('bonus. serializeDocument refuses structurally invalid documents', () => {
  const broken = { ...doc, blocks: [{ id: 'x', spacing: { topPt: 0, bottomPt: 0 }, data: { type: 'hologram' } }] };
  expectDocFileError(() => df.serializeDocument(broken), 'invalid-structure');
});

test('bonus. defaultProjectFileName sanitizes illegal filename characters', () => {
  assert.equal(df.defaultProjectFileName('SOP: Lab/Report? 2026'), 'SOP- Lab-Report- 2026.docstudio');
  assert.equal(df.defaultProjectFileName('   '), 'Untitled.docstudio');
});

// ── Summary ─────────────────────────────────────────────────────────────────
rmSync(outDir, { recursive: true, force: true });
console.log(`\n${passed} passed, ${failed.length} failed`);
if (failed.length > 0) {
  console.error(`Failed: ${failed.join('; ')}`);
  process.exit(1);
}
