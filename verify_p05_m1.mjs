/**
 * P05-M1 — Block Model and Insertion Framework verification
 * ═══════════════════════════════════════════════════════════════════════════
 * Compiles the REAL pure modules (`services/block-registry.ts`,
 * `services/block-actions.ts`, `services/document-file.ts`,
 * `services/document-actions.ts`) to CommonJS in a temp dir and exercises
 * them in Node with `node:assert/strict`.  No test framework is introduced.
 *
 * Covers (task §6):
 * • Registry: every BLOCK_TYPES member has an entry with metadata, icon,
 *   category, default factory and structural summary; unknown types are
 *   handled explicitly (isBlockType / getBlockRegistryEntry / createBlock
 *   throws RangeError / insertBlock rejects with 'unknown-block-type').
 * • Defaults: schema-valid data, valid spacing (finite, ≥ 0), fresh unique
 *   envelope IDs, type invariant (entry.type === block.data.type).
 * • Insertion: start / middle / end, before/after an existing block,
 *   preservation of existing IDs/content/order (reference equality),
 *   invalid indexes and missing IDs rejected explicitly.
 * • Duplicate: new ID, deep-copied independent content + spacing.
 * • Reorder: IDs/content preserved, boundary and missing-ID errors,
 *   moveBlockTo absolute moves + no-op + invalid indexes.
 * • Delete: removes exactly one block; empty/single-block documents;
 *   missing-ID errors.
 * • Spacing: one field changes at a time; negative / NaN / Infinity /
 *   string / bad-field input rejected; same-value no-op returns the same
 *   reference; modifiedAt stamped only on real changes.
 * • Immutability: source documents are compared by value (JSON snapshot)
 *   before/after every transformation — nothing mutates in place.
 * • Persistence: a document with ALL 21 block types (inserted, spaced,
 *   duplicated, reordered) round-trips serializeDocument →
 *   deserializeDocument unchanged; validator positive/negative behavior;
 *   fingerprint/dirty lifecycle; selection never exists inside the
 *   document (it is App session state — live-verified in the app).
 *
 * Template/document-flow regression evidence comes from the prior suites
 * (verify:p02-*, verify:p03-*, verify:p04-*), which are run unchanged
 * alongside this script — no template behavior is re-implemented here.
 *
 * Usage: node verify_p05_m1.mjs   (or: npm run verify:p05-m1)
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
// `--jsx react-jsx` is required because block-registry type-imports
// IconName from the Icon component (type-only; erased at compile time, no
// React runtime dependency in the compiled service).
const outDir = mkdtempSync(path.join(tmpdir(), 'ds-p05-m1-'));
execSync(
  'npx tsc src/services/block-registry.ts src/services/block-actions.ts' +
    ' src/services/document-file.ts src/services/document-actions.ts' +
    ' src/types/defaults.ts src/types/blocks.ts src/types/document.ts' +
    ` --outDir "${outDir}" --module commonjs --target es2020 --moduleResolution node` +
    ' --esModuleInterop --skipLibCheck --jsx react-jsx',
  { cwd: root, stdio: 'inherit' },
);

const registry = require(path.join(outDir, 'services', 'block-registry.js'));
const actions = require(path.join(outDir, 'services', 'block-actions.js'));
const file = require(path.join(outDir, 'services', 'document-file.js'));
const docActions = require(path.join(outDir, 'services', 'document-actions.js'));
const defaults = require(path.join(outDir, 'types', 'defaults.js'));
const blocks = require(path.join(outDir, 'types', 'blocks.js'));

const {
  BLOCK_CATEGORIES,
  BLOCK_REGISTRY,
  blockTypesInCategory,
  getBlockRegistryEntry,
  isBlockType,
  summarizeBlockData,
} = registry;
const {
  createBlock,
  deleteBlock,
  duplicateBlock,
  insertBlock,
  moveBlockTo,
  reorderBlock,
  updateBlockSpacing,
} = actions;
const { serializeDocument, deserializeDocument } = file;
const { sessionFingerprint, isDirty, deriveSessionStatus } = docActions;
const { createDefaultDocument } = defaults;
const { BLOCK_TYPES } = blocks;

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
const T0 = '2026-10-18T09:00:00.000Z';
let seq = 0;
/** Deterministic ID generator for envelope block IDs (tests only). */
const genId = () => `10500000-0000-4000-8000-${String(++seq).padStart(12, '0')}`;
const opts = () => ({ now: T0, genId });
const newDoc = () => createDefaultDocument('doc-p05-m1', T0);
const snap = (doc) => JSON.stringify(doc);
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/** The 24 icon names of the existing Icon component (compile-checked type). */
const ICON_NAMES = [
  'logo', 'new', 'save', 'open', 'export', 'clear', 'palette', 'sun', 'moon',
  'chevron-down', 'info', 'cover', 'typography', 'header-footer', 'statistics',
  'actions', 'zoom-in', 'zoom-out', 'fit-width', 'fit-page', 'margin-guide',
  'document', 'plus', 'check',
];

/** A three-block document with deterministic IDs A < B < C. */
function docABC() {
  const a = createBlock('paragraph', genId);
  const b = createBlock('heading', genId);
  const c = createBlock('list', genId);
  const doc = newDoc();
  return { doc: { ...doc, blocks: [a, b, c] }, a, b, c };
}

const expectReject = (result, code) => {
  assert.equal(result.ok, false, `expected rejection (${code}), got ok:true`);
  assert.equal(result.code, code);
  assert.equal(typeof result.message, 'string');
  assert.ok(result.message.length > 0, 'rejection must carry a message');
};

// ═══════════════════════════════════════════════════════════════════════════
// 1. Registry coverage and metadata
// ═══════════════════════════════════════════════════════════════════════════
await test('1. registry covers every block type, no extras, 21 types total', () => {
  assert.equal(BLOCK_TYPES.length, 21);
  assert.deepEqual([...Object.keys(BLOCK_REGISTRY)].sort(), [...BLOCK_TYPES].sort());
});

await test('2. every entry has display name, description, valid icon and category', () => {
  const categoryIds = BLOCK_CATEGORIES.map((c) => c.id);
  for (const type of BLOCK_TYPES) {
    const entry = BLOCK_REGISTRY[type];
    assert.equal(entry.type, type);
    assert.ok(entry.displayName.length > 0, `${type}: empty displayName`);
    assert.ok(entry.description.length > 0, `${type}: empty description`);
    assert.ok(ICON_NAMES.includes(entry.icon), `${type}: icon "${entry.icon}" not in Icon system`);
    assert.ok(categoryIds.includes(entry.category), `${type}: unknown category`);
  }
});

await test('3. categories are populated and blockTypesInCategory partitions all types', () => {
  const seen = [];
  for (const category of BLOCK_CATEGORIES) {
    const members = blockTypesInCategory(category.id);
    assert.ok(members.length > 0, `category ${category.id} is empty`);
    for (const type of members) {
      assert.equal(BLOCK_REGISTRY[type].category, category.id);
      seen.push(type);
    }
  }
  assert.deepEqual([...seen].sort(), [...BLOCK_TYPES].sort());
});

await test('4. every default factory produces a valid, type-correct block', () => {
  for (const type of BLOCK_TYPES) {
    const block = BLOCK_REGISTRY[type].createDefault();
    assert.match(block.id, UUID_RE, `${type}: envelope id is not a UUID`);
    assert.equal(block.data.type, type, `${type}: factory produced "${block.data.type}" data`);
    for (const field of ['topPt', 'bottomPt']) {
      const v = block.spacing[field];
      assert.ok(Number.isFinite(v), `${type}: spacing.${field} not finite`);
      assert.ok(v >= 0, `${type}: spacing.${field} negative`);
    }
    JSON.stringify(block); // schema must stay JSON-serializable
  }
});

await test('5. factories mint fresh unique envelope IDs on every call', () => {
  const ids = new Set();
  for (let round = 0; round < 2; round += 1) {
    for (const type of BLOCK_TYPES) {
      const id = BLOCK_REGISTRY[type].createDefault().id;
      assert.ok(!ids.has(id), `${type}: envelope id repeated across factory calls`);
      ids.add(id);
    }
  }
  assert.equal(ids.size, 42);
});

await test('6. isBlockType accepts every real type and rejects junk', () => {
  for (const type of BLOCK_TYPES) assert.equal(isBlockType(type), true);
  for (const junk of ['nope', '', 'Heading', 42, null, undefined, {}, ['heading']]) {
    assert.equal(isBlockType(junk), false, `${JSON.stringify(junk)} must not be a block type`);
  }
});

await test('7. getBlockRegistryEntry returns entries for real types, undefined otherwise', () => {
  assert.equal(getBlockRegistryEntry('heading'), BLOCK_REGISTRY.heading);
  assert.equal(getBlockRegistryEntry('nope'), undefined);
});

await test('8. summarizeBlockData is defined for all 21 defaults and key shapes', () => {
  for (const type of BLOCK_TYPES) {
    const summary = summarizeBlockData(BLOCK_REGISTRY[type].createDefault().data);
    assert.ok(typeof summary === 'string' && summary.length > 0, `${type}: empty summary`);
  }
  assert.match(summarizeBlockData(BLOCK_REGISTRY.heading.createDefault().data), /H2/);
  assert.equal(summarizeBlockData({ type: 'page-break' }), 'page break');
  assert.match(
    summarizeBlockData({ type: 'paragraph', spans: [{ text: '' }], hAlign: 'left', indentLevel: 0 }),
    /no text yet/,
  );
});

// ═══════════════════════════════════════════════════════════════════════════
// 2. createBlock
// ═══════════════════════════════════════════════════════════════════════════
await test('9. createBlock honours an injected deterministic ID', () => {
  const block = createBlock('callout', genId);
  assert.match(block.id, UUID_RE);
  assert.equal(block.data.type, 'callout');
  const fixed = createBlock('table', () => 'fixed-id-0000-4000-8000-000000000009');
  assert.equal(fixed.id, 'fixed-id-0000-4000-8000-000000000009');
});

await test('10. createBlock throws RangeError for an unregistered type', () => {
  assert.throws(() => createBlock('nope'), RangeError);
});

// ═══════════════════════════════════════════════════════════════════════════
// 3. Insertion
// ═══════════════════════════════════════════════════════════════════════════
await test('11. insert into an empty document (end) stamps modifiedAt, keeps createdAt', () => {
  const doc = newDoc();
  const result = insertBlock(doc, 'paragraph', { kind: 'end' }, opts());
  assert.equal(result.ok, true);
  assert.equal(result.changed, true);
  assert.equal(result.blockId, result.doc.blocks[0].id);
  assert.equal(result.doc.blocks.length, 1);
  assert.equal(result.doc.blocks[0].id, result.blockId);
  assert.equal(result.doc.metadata.modifiedAt, T0);
  assert.equal(result.doc.metadata.createdAt, T0);
  assert.equal(doc.blocks.length, 0, 'source document mutated');
});

await test('12. insert at start / end / middle preserves existing blocks by reference', () => {
  const { doc, a, b, c } = docABC();
  const before = [a.id, b.id, c.id];
  const beforeJSON = JSON.stringify([a, b, c]);

  const atStart = insertBlock(doc, 'callout', { kind: 'start' }, opts());
  assert.deepEqual(atStart.doc.blocks.slice(1).map((x) => x.id), before);
  assert.equal(atStart.doc.blocks[1], a, 'block A reference lost');
  assert.equal(atStart.doc.blocks[2], b);
  assert.equal(atStart.doc.blocks[3], c);

  const atEnd = insertBlock(doc, 'callout', { kind: 'end' }, opts());
  assert.deepEqual(atEnd.doc.blocks.slice(0, 3).map((x) => x.id), before);
  assert.equal(atEnd.doc.blocks[3].data.type, 'callout');

  const middle = insertBlock(doc, 'callout', { kind: 'at', index: 1 }, opts());
  assert.deepEqual(middle.doc.blocks.map((x) => x.id), [a.id, middle.blockId, b.id, c.id]);

  // Deep content preservation: the untouched blocks' JSON is identical.
  assert.equal(JSON.stringify([a, b, c]), beforeJSON);
});

await test('13. insert before / after an existing block by stable ID', () => {
  const { doc, a, b, c } = docABC();
  const afterB = insertBlock(doc, 'formula', { kind: 'after', blockId: b.id }, opts());
  assert.deepEqual(afterB.doc.blocks.map((x) => x.id), [a.id, b.id, afterB.blockId, c.id]);

  const beforeB = insertBlock(doc, 'formula', { kind: 'before', blockId: b.id }, opts());
  assert.deepEqual(beforeB.doc.blocks.map((x) => x.id), [a.id, beforeB.blockId, b.id, c.id]);
});

await test('14. insertion rejects unknown types, invalid indexes and missing anchors', () => {
  const { doc, a } = docABC();
  const before = snap(doc);

  expectReject(insertBlock(doc, 'nope', { kind: 'end' }, opts()), 'unknown-block-type');
  expectReject(insertBlock(doc, 'heading', { kind: 'at', index: -1 }, opts()), 'invalid-index');
  expectReject(insertBlock(doc, 'heading', { kind: 'at', index: 4 }, opts()), 'invalid-index');
  expectReject(insertBlock(doc, 'heading', { kind: 'at', index: 1.5 }, opts()), 'invalid-index');
  expectReject(
    insertBlock(doc, 'heading', { kind: 'after', blockId: 'ghost-id' }, opts()),
    'missing-block',
  );
  expectReject(
    insertBlock(doc, 'heading', { kind: 'sideways', blockId: a.id }, opts()),
    'invalid-placement',
  );
  assert.equal(snap(doc), before, 'a rejected insertion changed the document');
});

await test('15. every registered type inserts a valid block (all 21 in order)', () => {
  let doc = newDoc();
  const inserted = [];
  for (const type of BLOCK_TYPES) {
    const result = insertBlock(doc, type, { kind: 'end' }, opts());
    assert.equal(result.ok, true, `${type} failed to insert`);
    assert.equal(result.doc.blocks[result.doc.blocks.length - 1].data.type, type);
    doc = result.doc;
    inserted.push(result.blockId);
  }
  assert.equal(doc.blocks.length, 21);
  assert.deepEqual(doc.blocks.map((x) => x.data.type), [...BLOCK_TYPES]);
  assert.equal(new Set(inserted).size, 21, 'inserted block IDs are not unique');
});

// ═══════════════════════════════════════════════════════════════════════════
// 4. Duplication
// ═══════════════════════════════════════════════════════════════════════════
await test('16. duplicate creates an independent copy with a new ID after the source', () => {
  const { doc, a, b, c } = docABC();
  const result = duplicateBlock(doc, b.id, opts());
  assert.equal(result.ok, true);
  assert.notEqual(result.blockId, b.id);
  assert.match(result.blockId, UUID_RE);
  assert.deepEqual(result.doc.blocks.map((x) => x.id), [a.id, b.id, result.blockId, c.id]);

  const copy = result.doc.blocks[2];
  assert.deepEqual(copy.data, b.data, 'duplicated data differs from the source');
  assert.deepEqual(copy.spacing, b.spacing, 'duplicated spacing differs from the source');
  assert.equal(doc.blocks.length, 3, 'source document mutated');
});

await test('17. the duplicate is value-independent: mutating it never touches the original', () => {
  const { doc, a, b, c } = docABC(); // c is the list block (items → spans)
  const result = duplicateBlock(doc, c.id, opts());
  const beforeSource = snap(doc);

  // Deep mutation through the copy (list block → items → spans → text).
  const copy = result.doc.blocks[3];
  copy.data.items[0].spans[0].text = 'MUTATED';
  copy.data.items.push({ id: genId(), spans: [{ text: 'x' }], depth: 0 });
  copy.spacing.topPt = 99;

  assert.equal(snap(doc), beforeSource, 'mutating the duplicate changed the source document');
  assert.deepEqual(result.doc.blocks.slice(0, 3), [a, b, c], 'unrelated blocks changed');
});

await test('18. duplicate rejects a missing block and stamps modifiedAt', () => {
  const { doc, a } = docABC();
  const before = snap(doc);
  expectReject(duplicateBlock(doc, 'ghost-id', opts()), 'missing-block');
  assert.equal(snap(doc), before);

  const result = duplicateBlock(doc, a.id, opts());
  assert.equal(result.doc.metadata.modifiedAt, T0);
  assert.equal(result.doc.metadata.createdAt, T0);
});

// ═══════════════════════════════════════════════════════════════════════════
// 5. Reordering
// ═══════════════════════════════════════════════════════════════════════════
await test('19. reorder up/down moves blocks, preserving IDs, content and references', () => {
  const { doc, a, b, c } = docABC();
  const bJSON = JSON.stringify(b);

  const up = reorderBlock(doc, b.id, 'up', opts());
  assert.equal(up.ok, true);
  assert.deepEqual(up.doc.blocks.map((x) => x.id), [b.id, a.id, c.id]);
  assert.equal(up.doc.blocks[0], b, 'block B reference lost on move');
  assert.equal(JSON.stringify(up.doc.blocks[0]), bJSON, 'block B content changed on move');
  assert.equal(up.doc.metadata.modifiedAt, T0);

  const down = reorderBlock(doc, a.id, 'down', opts());
  assert.deepEqual(down.doc.blocks.map((x) => x.id), [b.id, a.id, c.id]);
  assert.equal(down.doc.blocks[1], a);
});

await test('20. reorder rejects boundaries, empty documents and missing IDs', () => {
  const { doc, a, c } = docABC();
  const before = snap(doc);
  expectReject(reorderBlock(doc, a.id, 'up', opts()), 'at-boundary');
  expectReject(reorderBlock(doc, c.id, 'down', opts()), 'at-boundary');
  expectReject(reorderBlock(doc, 'ghost-id', 'up', opts()), 'missing-block');
  expectReject(reorderBlock(newDoc(), 'ghost-id', 'down', opts()), 'missing-block');
  assert.equal(snap(doc), before, 'a rejected reorder changed the document');
});

await test('21. moveBlockTo: absolute move, no-op same reference, invalid indexes', () => {
  const { doc, a, b, c } = docABC();
  const moved = moveBlockTo(doc, a.id, 2, opts());
  assert.equal(moved.ok, true);
  assert.deepEqual(moved.doc.blocks.map((x) => x.id), [b.id, c.id, a.id]);
  assert.equal(moved.doc.blocks[2], a);

  const noop = moveBlockTo(moved.doc, a.id, 2, opts());
  assert.equal(noop.ok, true);
  assert.equal(noop.changed, false);
  assert.equal(noop.doc, moved.doc, 'no-op move must return the same document reference');

  expectReject(moveBlockTo(doc, a.id, 3, opts()), 'invalid-index');
  expectReject(moveBlockTo(doc, a.id, -1, opts()), 'invalid-index');
  expectReject(moveBlockTo(doc, a.id, 1.5, opts()), 'invalid-index');
  expectReject(moveBlockTo(doc, 'ghost-id', 0, opts()), 'missing-block');
});

// ═══════════════════════════════════════════════════════════════════════════
// 6. Deletion
// ═══════════════════════════════════════════════════════════════════════════
await test('22. delete removes exactly the identified block, neighbors by reference', () => {
  const { doc, a, b, c } = docABC();
  const result = deleteBlock(doc, b.id, opts());
  assert.equal(result.ok, true);
  assert.deepEqual(result.doc.blocks.map((x) => x.id), [a.id, c.id]);
  assert.equal(result.doc.blocks[0], a, 'neighbor A reference lost');
  assert.equal(result.doc.blocks[1], c, 'neighbor C reference lost');
  assert.equal(result.doc.metadata.modifiedAt, T0);
  assert.equal(doc.blocks.length, 3, 'source document mutated');
});

await test('23. delete handles single-block and empty documents; missing IDs rejected', () => {
  const single = newDoc();
  const only = createBlock('heading', genId);
  single.blocks = [only];
  const emptied = deleteBlock(single, only.id, opts());
  assert.equal(emptied.ok, true);
  assert.deepEqual(emptied.doc.blocks, []);

  const empty = newDoc();
  expectReject(deleteBlock(empty, 'ghost-id', opts()), 'missing-block');
  expectReject(deleteBlock(emptied.doc, only.id, opts()), 'missing-block');
});

// ═══════════════════════════════════════════════════════════════════════════
// 7. Spacing
// ═══════════════════════════════════════════════════════════════════════════
await test('24. spacing change touches only the one field of the one block', () => {
  const { doc, a, b, c } = docABC();
  const result = updateBlockSpacing(doc, a.id, 'topPt', 12.5, opts());
  assert.equal(result.ok, true);
  assert.equal(result.changed, true);
  assert.equal(result.doc.blocks[0].spacing.topPt, 12.5);
  assert.equal(result.doc.blocks[0].spacing.bottomPt, a.spacing.bottomPt, 'other field changed');
  assert.equal(result.doc.blocks[0].id, a.id, 'block ID changed');
  assert.equal(result.doc.blocks[0].data, a.data, 'block data reference lost');
  assert.equal(result.doc.blocks[1], b, 'unrelated block B changed');
  assert.equal(result.doc.blocks[2], c, 'unrelated block C changed');
  assert.equal(result.doc.metadata.modifiedAt, T0);
  assert.equal(result.doc.metadata.createdAt, T0);
});

await test('25. same-value spacing is a no-op returning the same reference', () => {
  const { doc, a } = docABC();
  const same = updateBlockSpacing(doc, a.id, 'topPt', a.spacing.topPt, opts());
  assert.equal(same.ok, true);
  assert.equal(same.changed, false);
  assert.equal(same.doc, doc, 'no-op spacing must return the same document reference');
});

await test('26. negative / NaN / Infinity / string / bad-field values are rejected', () => {
  const { doc, a } = docABC();
  const before = snap(doc);
  expectReject(updateBlockSpacing(doc, a.id, 'topPt', -1, opts()), 'invalid-spacing');
  expectReject(updateBlockSpacing(doc, a.id, 'bottomPt', -0.5, opts()), 'invalid-spacing');
  expectReject(updateBlockSpacing(doc, a.id, 'topPt', NaN, opts()), 'invalid-spacing');
  expectReject(updateBlockSpacing(doc, a.id, 'topPt', Infinity, opts()), 'invalid-spacing');
  expectReject(updateBlockSpacing(doc, a.id, 'topPt', -Infinity, opts()), 'invalid-spacing');
  expectReject(updateBlockSpacing(doc, a.id, 'topPt', '12', opts()), 'invalid-spacing');
  expectReject(updateBlockSpacing(doc, a.id, 'leftPt', 4, opts()), 'invalid-spacing');
  assert.equal(snap(doc), before, 'a rejected spacing change altered the document');
});

await test('27. spacing on a missing block is an explicit missing-block error', () => {
  const { doc } = docABC();
  expectReject(updateBlockSpacing(doc, 'ghost-id', 'topPt', 4, opts()), 'missing-block');
});

await test('28. valid zero spacing is accepted (0 pt is a legitimate setting)', () => {
  const { doc, a } = docABC();
  const raised = updateBlockSpacing(doc, a.id, 'topPt', 6, opts());
  assert.equal(raised.ok, true);
  const zeroed = updateBlockSpacing(raised.doc, a.id, 'topPt', 0, opts());
  assert.equal(zeroed.ok, true);
  assert.equal(zeroed.changed, true);
  assert.equal(zeroed.doc.blocks[0].spacing.topPt, 0);
});

// ═══════════════════════════════════════════════════════════════════════════
// 8. Persistence, round-trip and lifecycle
// ═══════════════════════════════════════════════════════════════════════════
/** Build a document exercising every block type + spacing + duplicate + move. */
function kitchenSinkDoc() {
  let doc = newDoc();
  for (const type of BLOCK_TYPES) {
    doc = insertBlock(doc, type, { kind: 'end' }, opts()).doc;
  }
  const first = doc.blocks[0];
  const last = doc.blocks[doc.blocks.length - 1];
  doc = updateBlockSpacing(doc, first.id, 'topPt', 11, opts()).doc;
  doc = updateBlockSpacing(doc, last.id, 'bottomPt', 7.5, opts()).doc;
  doc = duplicateBlock(doc, doc.blocks[4].id, opts()).doc;
  doc = reorderBlock(doc, doc.blocks[2].id, 'down', opts()).doc;
  return doc;
}

await test('29. all 21 block types (spaced, duplicated, reordered) round-trip intact', () => {
  const doc = kitchenSinkDoc();
  const json = serializeDocument(doc);
  const back = deserializeDocument(json);
  assert.deepEqual(back, doc, 'round-trip changed the document');
  assert.equal(sessionFingerprint(back), sessionFingerprint(doc), 'fingerprint unstable on round-trip');
  assert.equal(back.blocks.length, 22, 'duplicated block lost');
  assert.equal(serializeDocument(back), json, 're-serialization differs from the stored file');
});

await test('30. serializer preserves block IDs, order, data and spacing verbatim', () => {
  const doc = kitchenSinkDoc();
  const back = deserializeDocument(serializeDocument(doc));
  assert.deepEqual(back.blocks.map((b) => b.id), doc.blocks.map((b) => b.id));
  assert.deepEqual(
    back.blocks.map((b) => b.spacing),
    doc.blocks.map((b) => b.spacing),
  );
  assert.deepEqual(
    back.blocks.map((b) => b.data.type),
    doc.blocks.map((b) => b.data.type),
  );
});

await test('31. validator rejects unknown block types and malformed spacing on open', () => {
  const doc = kitchenSinkDoc();
  const raw = JSON.parse(serializeDocument(doc));

  const badType = structuredClone(raw);
  badType.blocks[3].data.type = 'ghost-block';
  assert.throws(
    () => deserializeDocument(JSON.stringify(badType)),
    (e) =>
      e.name === 'DocumentFileError' &&
      /not a supported block type/.test(String(e.detail ?? e.message)),
  );

  const badSpacing = structuredClone(raw);
  badSpacing.blocks[0].spacing.topPt = 'x';
  assert.throws(
    () => deserializeDocument(JSON.stringify(badSpacing)),
    (e) => e.name === 'DocumentFileError',
  );

  // Documented current boundary: file-level validation checks that spacing
  // is numeric; input-time negativity checks live in block-actions (test
  // 26).  A future validator change should flip this assertion deliberately.
  const negative = structuredClone(raw);
  negative.blocks[0].spacing.topPt = -5;
  assert.doesNotThrow(() => deserializeDocument(JSON.stringify(negative)));
});

await test('32. block operations drive the Modified/Saved lifecycle correctly', () => {
  const doc = newDoc();
  const baseline = sessionFingerprint(doc);
  assert.equal(isDirty(baseline, baseline), false);
  assert.equal(deriveSessionStatus(baseline, baseline, false), 'New');
  assert.equal(deriveSessionStatus(baseline, baseline, true), 'Saved');

  const inserted = insertBlock(doc, 'heading', { kind: 'end' }, opts()).doc;
  const fp = sessionFingerprint(inserted);
  assert.equal(isDirty(fp, baseline), true, 'insert did not dirty the document');
  assert.equal(deriveSessionStatus(fp, baseline, true), 'Modified');

  // Saving (round-trip to the baseline) clears the dirty state.
  const reopenedFingerprint = sessionFingerprint(deserializeDocument(serializeDocument(inserted)));
  assert.equal(isDirty(reopenedFingerprint, fp), false);

  // Selection is App session state — it must never exist inside the document.
  assert.equal(snap(doc).includes('"selected'), false);
  assert.equal(snap(inserted).includes('"selected'), false);
});

await test('33. a document opened from an existing schema-v1 file accepts new blocks', () => {
  // Simulates "open a P02–P04 era document, insert a block, save again":
  // the deserialized legacy document is untouched apart from the new block.
  const legacy = newDoc();
  legacy.blocks = [createBlock('paragraph', genId)];
  legacy.blocks[0].spacing = { topPt: 0, bottomPt: 6 };
  const json = serializeDocument(legacy);

  const opened = deserializeDocument(json);
  const before = snap(opened);
  const result = insertBlock(opened, 'table', { kind: 'end' }, opts());
  assert.equal(result.ok, true);
  assert.equal(result.doc.blocks[0].data.type, 'paragraph', 'pre-existing block changed');
  assert.equal(JSON.stringify(opened), before, 'insertion mutated the opened document');
  assert.doesNotThrow(() => deserializeDocument(serializeDocument(result.doc)));
});

// ── Summary ─────────────────────────────────────────────────────────────────
console.log(`\n${passed} passed, ${failed.length} failed`);
if (failed.length > 0) process.exitCode = 1;
