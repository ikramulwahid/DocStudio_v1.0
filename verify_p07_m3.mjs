/**
 * DocStudio — P07-M3 verification suite (saved snapshots + restore + R-003)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Verifies the P07-M3 checkpoint (spec §12.2/§12.4): named/numbered
 * snapshots are created through the real service, persisted in schema v1,
 * inspected read-only, and restored as a NEW revision that preserves the
 * whole prior history — plus the R-003 file-size strategy and the
 * realistic-history measurements it requires.
 *
 * Groups:
 *  1. module surface of the new `snapshots` service.
 *  2. snapshot creation, metadata validation and payload encoding.
 *  3. read-only inspection (derived view, no mutation, honest failures).
 *  4. persistence: round-trips, old-document compatibility, envelope
 *     rejection at load, the load/point-of-use validation split.
 *  5. restore-as-new-revision semantics, repeated restores, delete.
 *  6. R-003 realistic-history scenarios: composition, linear growth,
 *     no recursive nesting, save/reopen + restore costs, stats/advisory.
 *  7. DOM: SavedRevisionsPanel under a real jsdom + real React runtime.
 *
 * HONEST SCOPE NOTES (mirrored in project_roadmap.md P07-M3)
 *  • Regression suites (`verify:p07-m2`, `verify:p07-m1`, `verify:p02-m2`,
 *    `verify:p02-m3`) are run separately, not imported here.
 *  • Native Save/Open dialogs and the WebView2 preview are not exercised;
 *    persistence is verified through the real serialize/validate/deserialize
 *    path, which is the exact byte path the dialogs write/read.
 *  • `UPDATE_ARTIFACTS=1` is never used; nothing under `fixtures/` is read
 *    or written, and this suite writes NO files — sizes are measured on
 *    the serialized text in memory (byte-for-byte what would hit disk).
 *
 * Usage: node verify_p07_m3.mjs   (or: npm run verify:p07-m3)
 * Exit code 0 => all checks pass.
 */

import path from 'node:path';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = __dirname;
const CACHE = path.join(root, 'node_modules', '.cache', 'ds-p07-m3-verify');

// ─────────────────────────────────────────────────────────────────────────────
// Tiny harness (same conventions as the other verify suites)
// ─────────────────────────────────────────────────────────────────────────────
let passed = 0;
let failed = 0;

const group = (name) => {
  console.log(`\n── ${name} ──────────────────────────────────────────────`);
};

const test = (name, fn) => {
  try {
    fn();
    passed += 1;
    console.log(`PASS  ${name}`);
  } catch (e) {
    failed += 1;
    console.error(`FAIL  ${name}`);
    console.error(`      ${e && e.message ? e.message.split('\n')[0] : e}`);
    if (process.env.DS_VERBOSE) console.error(e);
  }
};

const testAsync = async (name, fn) => {
  try {
    await fn();
    passed += 1;
    console.log(`PASS  ${name}`);
  } catch (e) {
    failed += 1;
    console.error(`FAIL  ${name}`);
    console.error(`      ${e && e.message ? e.message.split('\n')[0] : e}`);
    if (process.env.DS_VERBOSE) console.error(e);
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// 1. Compile the touched modules to CommonJS (real tsc, --strict)
// ─────────────────────────────────────────────────────────────────────────────
const COMPILE_ROOTS = [
  'src/services/snapshots.ts',
  'src/services/document-file.ts',
  'src/services/document-actions.ts',
  'src/services/block-actions.ts',
  'src/services/block-content.ts',
  'src/services/table-content.ts',
  'src/services/image-signature-content.ts',
  'src/services/track-changes.ts',
  'src/components/left-panel/SavedRevisionsPanel.tsx',
];
console.log('P07-M3 verification suite');
console.log('══════════════════════════════════════════════════════════');
console.log(`compile roots: ${COMPILE_ROOTS.length}`);

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

// Component imports stylesheets; tsc does not copy .css files — stub them
// (same approach as verify_p07_m2.mjs) and register an empty loader.
for (const stub of [
  path.join(CACHE, 'components', 'left-panel', 'LeftPanel.css'),
  path.join(CACHE, 'components', 'left-panel', 'SavedRevisionsPanel.css'),
]) {
  fs.mkdirSync(path.dirname(stub), { recursive: true });
  if (!fs.existsSync(stub)) fs.writeFileSync(stub, '/* suite stub */\n');
}

const pick = (...candidates) => {
  const hit = candidates.find((p) => fs.existsSync(p));
  if (!hit) throw new Error(`compiled module not found:\n  ${candidates.join('\n  ')}`);
  return require(hit);
};

require.extensions['.css'] = () => {};

const snapshotsMod = pick(
  path.join(CACHE, 'services', 'snapshots.js'),
  path.join(CACHE, 'src', 'services', 'snapshots.js'),
);
const documentFile = pick(
  path.join(CACHE, 'services', 'document-file.js'),
  path.join(CACHE, 'src', 'services', 'document-file.js'),
);
const documentActions = pick(
  path.join(CACHE, 'services', 'document-actions.js'),
  path.join(CACHE, 'src', 'services', 'document-actions.js'),
);
const blockActions = pick(
  path.join(CACHE, 'services', 'block-actions.js'),
  path.join(CACHE, 'src', 'services', 'block-actions.js'),
);
const blockContent = pick(
  path.join(CACHE, 'services', 'block-content.js'),
  path.join(CACHE, 'src', 'services', 'block-content.js'),
);
const tableContent = pick(
  path.join(CACHE, 'services', 'table-content.js'),
  path.join(CACHE, 'src', 'services', 'table-content.js'),
);
const imageSignature = pick(
  path.join(CACHE, 'services', 'image-signature-content.js'),
  path.join(CACHE, 'src', 'services', 'image-signature-content.js'),
);
const trackChanges = pick(
  path.join(CACHE, 'services', 'track-changes.js'),
  path.join(CACHE, 'src', 'services', 'track-changes.js'),
);
const defaults = pick(
  path.join(CACHE, 'types', 'defaults.js'),
  path.join(CACHE, 'src', 'types', 'defaults.js'),
);
const richText = pick(
  path.join(CACHE, 'services', 'rich-text.js'),
  path.join(CACHE, 'src', 'services', 'rich-text.js'),
);

const {
  SNAPSHOT_LABEL_MAX,
  SNAPSHOT_SUMMARY_MAX,
  SNAPSHOT_REASON_MAX,
  SNAPSHOT_HISTORY_ADVISORY_SHARE,
  buildSnapshotPayload,
  createSnapshot,
  listSnapshots,
  findSnapshot,
  inspectSnapshot,
  previewSnapshotJson,
  restoreSnapshot,
  deleteSnapshot,
  snapshotHistoryStats,
} = snapshotsMod;
const { serializeDocument, deserializeDocument, validateDocument, DocumentFileError } = documentFile;
const {
  clearDocumentContents,
  createNewDocument,
  updateDocumentMetadata,
  sessionFingerprint,
} = documentActions;
const { insertBlock } = blockActions;
const { updateHeadingContent, updateParagraphContent } = blockContent;
const { attachImageAsset } = imageSignature;
const { addTableRow, setTableCellText } = tableContent;
const { commitTrackedChange, acceptChange, documentChangeEvents, hasPendingChanges } = trackChanges;
const { createDefaultDocument } = defaults;
const { plainTextToSpans } = richText;

// ─────────────────────────────────────────────────────────────────────────────
// Deterministic fixtures (real services; no committed artifacts, no files)
// ─────────────────────────────────────────────────────────────────────────────
const T0 = '2026-10-23T09:00:00.000Z';
const T1 = '2026-10-23T10:00:00.000Z';
const T2 = '2026-10-23T11:00:00.000Z';
const T3 = '2026-10-23T12:00:00.000Z';
let idSeq = 0;
const nextId = () => `00000000-0000-4000-8000-${String(++idSeq).padStart(12, '0')}`;
const opts = (extra = {}) => ({ now: T0, genId: nextId, ...extra });
const snapOpts = (now) => ({ now, genId: nextId });

const must = (result, what) => {
  if (!result.ok) throw new Error(`${what} failed: ${result.message}`);
  return result;
};

const utf8Bytes = (text) => new TextEncoder().encode(text).length;
const fileBytes = (doc) => utf8Bytes(serializeDocument(doc));
const clone = (value) => JSON.parse(JSON.stringify(value));

/** Base document: heading + 2 paragraphs, tracking ON, no events yet. */
function buildBase() {
  let doc = createDefaultDocument(nextId(), T0);
  const h = must(insertBlock(doc, 'heading', { kind: 'end' }, opts()), 'insert heading');
  const p = must(insertBlock(h.doc, 'paragraph', { kind: 'end' }, opts()), 'insert p1');
  const p2 = must(insertBlock(p.doc, 'paragraph', { kind: 'end' }, opts()), 'insert p2');
  const ht = must(
    updateHeadingContent(p2.doc, h.blockId, { text: 'Section alpha' }, opts()),
    'heading text',
  );
  const pt = must(
    updateParagraphContent(ht.doc, p.blockId, { spans: plainTextToSpans('Sample alpha text') }, opts()),
    'paragraph text',
  );
  return {
    doc: { ...pt.doc, trackChangesEnabled: true },
    headingId: h.blockId,
    paraId: p.blockId,
    para2Id: p2.blockId,
  };
}

/** Capture one tracked edit through the real P07-M2 seam (fixture helper). */
const capture = (before, after, hint) => {
  const outcome = commitTrackedChange(before, after, hint, { now: T0, genId: nextId });
  if (outcome.error !== null) throw new Error(`capture unexpectedly failed: ${outcome.error}`);
  return outcome.doc;
};

/** A deterministic PNG-shaped asset with a LARGE payload (linear-cost probe). */
function makeAsset(id, filename, filler = 40000) {
  const body = Buffer.from('DS-M3-ASSET:').toString('base64') + 'A'.repeat(filler);
  return {
    id,
    filename,
    mimeType: 'image/png',
    sizeBytes: Math.floor(body.length * 0.75),
    addedAt: T0,
    base64Data: body,
  };
}

// ═════════════════════════════════════════════════════════════════════════════
group('1. module surface (P07-M3 snapshots service)');
// ═════════════════════════════════════════════════════════════════════════════

test('1.1 every documented P07-M3 entry point is exported', () => {
  const fns = [
    'buildSnapshotPayload',
    'createSnapshot',
    'listSnapshots',
    'findSnapshot',
    'inspectSnapshot',
    'previewSnapshotJson',
    'restoreSnapshot',
    'deleteSnapshot',
    'snapshotHistoryStats',
  ];
  for (const name of fns) {
    assert.equal(typeof snapshotsMod[name], 'function', `${name} exported`);
  }
  const consts = [
    'SNAPSHOT_LABEL_MAX',
    'SNAPSHOT_SUMMARY_MAX',
    'SNAPSHOT_REASON_MAX',
    'SNAPSHOT_HISTORY_ADVISORY_SHARE',
  ];
  for (const name of consts) {
    assert.equal(typeof snapshotsMod[name], 'number', `${name} exported`);
  }
});

test('1.2 documented limits and the advisory share are the recorded values', () => {
  assert.equal(SNAPSHOT_LABEL_MAX, 120);
  assert.equal(SNAPSHOT_SUMMARY_MAX, 500);
  assert.equal(SNAPSHOT_REASON_MAX, 500);
  assert.equal(SNAPSHOT_HISTORY_ADVISORY_SHARE, 0.8);
});

test('1.3 the service imports no React/Tauri/DOM code (pure module)', () => {
  const src = fs.readFileSync(path.join(root, 'src', 'services', 'snapshots.ts'), 'utf8');
  assert.ok(!/from ['"]react|@tauri-apps|localStorage|createElement/.test(src),
    'no UI/runtime dependencies');
  assert.ok(src.includes('§12.2'), 'spec anchor documented');
  assert.ok(src.includes('R-003'), 'R-003 strategy documented');
});

test('1.4 result shapes follow the established ok/code|message union', () => {
  const base = buildBase();
  const bad = createSnapshot(base.doc, { label: '   ' }, snapOpts(T0));
  assert.equal(bad.ok, false);
  assert.equal(typeof bad.code, 'string');
  assert.equal(typeof bad.message, 'string');
  const good = createSnapshot(base.doc, { label: 'v1' }, snapOpts(T0));
  assert.equal(good.ok, true);
  assert.equal(typeof good.doc, 'object');
  assert.equal(typeof good.revision.id, 'string');
});

// ═════════════════════════════════════════════════════════════════════════════
group('2. snapshot creation, metadata and payload encoding');
// ═════════════════════════════════════════════════════════════════════════════

test('2.1 creates a snapshot with injected id/timestamp and all §12.2 fields', () => {
  const base = buildBase();
  const result = createSnapshot(
    base.doc,
    { label: 'v1.0', summary: 'First issue', reason: 'Periodic save' },
    snapOpts(T1),
  );
  assert.ok(result.ok, 'creation succeeds');
  const rev = result.revision;
  assert.match(rev.id, /^[0-9a-f-]{36}$/, 'stable UUID from genId');
  assert.equal(rev.label, 'v1.0');
  assert.equal(rev.savedAt, T1, 'timestamp from injected clock');
  assert.equal(rev.summary, 'First issue');
  assert.equal(rev.reason, 'Periodic save');
  assert.equal(typeof rev.snapshotJson, 'string');
  assert.equal(result.doc.savedRevisions.length, 1);
  assert.equal(result.doc.savedRevisions[0], rev, 'appended to the history');
});

test('2.2 optional fields stay ABSENT (no empty-string coercion)', () => {
  const base = buildBase();
  const result = createSnapshot(base.doc, { label: 'plain', summary: '', reason: '' }, snapOpts(T1));
  assert.ok(result.ok);
  assert.ok(!('summary' in result.revision), 'empty summary omitted');
  assert.ok(!('reason' in result.revision), 'empty reason omitted');
  const parsed = JSON.parse(result.revision.snapshotJson);
  assert.ok(!('summary' in parsed), 'payload mirrors document only');
});

test('2.3 validation rejects bad input instead of truncating or coercing it', () => {
  const base = buildBase();
  const before = clone(base.doc);
  const cases = [
    [{ label: '   ' }, 'empty-label'],
    [{ label: '' }, 'empty-label'],
    [{ label: 'x'.repeat(SNAPSHOT_LABEL_MAX + 1) }, 'label-too-long'],
    [{ label: 'ok', summary: 's'.repeat(SNAPSHOT_SUMMARY_MAX + 1) }, 'summary-too-long'],
    [{ label: 'ok', reason: 'r'.repeat(SNAPSHOT_REASON_MAX + 1) }, 'reason-too-long'],
  ];
  for (const [input, code] of cases) {
    const result = createSnapshot(base.doc, input, snapOpts(T1));
    assert.equal(result.ok, false, `${code} rejected`);
    assert.equal(result.code, code);
    assert.ok(result.message.length > 0, 'user-readable message');
  }
  assert.deepEqual(clone(base.doc), before, 'failed creation leaves the document untouched');
});

test('2.4 label is trimmed, and the boundary lengths are accepted', () => {
  const base = buildBase();
  const trimmed = createSnapshot(base.doc, { label: '  v2 draft  ' }, snapOpts(T1));
  assert.ok(trimmed.ok);
  assert.equal(trimmed.revision.label, 'v2 draft');
  const edge = createSnapshot(base.doc, { label: 'v'.repeat(SNAPSHOT_LABEL_MAX) }, snapOpts(T1));
  assert.ok(edge.ok, 'exactly-at-limit label accepted');
});

test('2.5 the payload is the FULL document state with savedRevisions: []', () => {
  const base = buildBase();
  const result = createSnapshot(base.doc, { label: 'v1' }, snapOpts(T1));
  assert.ok(result.ok);
  const payload = JSON.parse(result.revision.snapshotJson);
  assert.deepEqual(payload.savedRevisions, [], 'non-recursive encoding');
  assert.equal(payload.__type, 'DocStudio');
  assert.equal(payload.schemaVersion, 1);
  const expected = { ...base.doc, savedRevisions: [] };
  assert.equal(result.revision.snapshotJson, JSON.stringify(expected),
    'payload is byte-for-byte the document state minus history');
  assert.ok(!result.revision.snapshotJson.includes('"savedRevisions":[{'),
    'no nested revision records');
});

test('2.6 creation changes ONLY the history — content, settings and tracking untouched', () => {
  const base = buildBase();
  const edited = capture(
    base.doc,
    must(updateHeadingContent(base.doc, base.headingId, { text: 'Tracked heading' }, opts()), 'edit').doc,
    { kind: 'block-content', blockId: base.headingId },
  );
  const before = clone(edited);
  const result = createSnapshot(edited, { label: 'v1' }, snapOpts(T1));
  assert.ok(result.ok);
  const after = clone(result.doc);
  assert.deepEqual(after.blocks, before.blocks, 'blocks untouched');
  assert.deepEqual(after.metadata, before.metadata, 'metadata untouched (no modifiedAt stamp)');
  assert.deepEqual(after.changeEvents, before.changeEvents, 'event log untouched');
  assert.equal(after.trackChangesEnabled, before.trackChangesEnabled, 'toggle untouched');
  assert.deepEqual(after.assets, before.assets, 'assets untouched');
  assert.equal(result.doc.savedRevisions.length, before.savedRevisions.length + 1);
});

test('2.7 an absent changeEvents key stays absent in the payload (schema-v1 rule)', () => {
  const base = buildBase();
  const { changeEvents: _dropped, ...noLog } = base.doc;
  const result = createSnapshot(noLog, { label: 'v1' }, snapOpts(T1));
  assert.ok(result.ok);
  assert.ok(!result.revision.snapshotJson.includes('"changeEvents"'),
    'never invents an empty log key');
  const round = deserializeDocument(result.revision.snapshotJson);
  assert.deepEqual(round.changeEvents ?? [], [], 'absent reads as empty log');
});

test('2.8 payload validates through the REAL document validator and round-trips', () => {
  const base = buildBase();
  const result = createSnapshot(base.doc, { label: 'v1' }, snapOpts(T1));
  assert.ok(result.ok);
  const round = deserializeDocument(result.revision.snapshotJson);
  assert.equal(round.metadata.title, base.doc.metadata.title);
  assert.equal(round.blocks.length, base.doc.blocks.length);
  assert.doesNotThrow(() => validateDocument(JSON.parse(result.revision.snapshotJson)));
});

test('2.9 multiple snapshots each capture THEIR OWN state, appended chronologically', () => {
  const base = buildBase();
  const first = createSnapshot(base.doc, { label: 'v1' }, snapOpts(T1));
  assert.ok(first.ok);
  const edited = must(
    updateParagraphContent(first.doc, base.paraId, { spans: plainTextToSpans('Changed after v1') }, opts()),
    'edit after v1',
  ).doc;
  const second = createSnapshot(edited, { label: 'v2' }, snapOpts(T2));
  assert.ok(second.ok);
  const third = createSnapshot(second.doc, { label: 'v3' }, snapOpts(T3));
  assert.ok(third.ok);

  const history = listSnapshots(third.doc);
  assert.equal(history.length, 3);
  assert.deepEqual(history.map((r) => r.label), ['v1', 'v2', 'v3'], 'chronological order');
  assert.deepEqual(history.map((r) => r.savedAt), [T1, T2, T3], 'timestamps in order');

  const p1 = JSON.parse(history[0].snapshotJson);
  const p3 = JSON.parse(history[2].snapshotJson);
  assert.ok(!history[0].snapshotJson.includes('Changed after v1'), 'v1 predates the edit');
  assert.ok(history[1].snapshotJson.includes('Changed after v1'), 'v2 captured the edit');
  assert.ok(!p3.snapshotJson && p3.blocks.length === base.doc.blocks.length,
    'v3 payload is a valid document state');
  assert.equal(p1.blocks.length, base.doc.blocks.length, 'v1 captured its own block list');
});

test('2.10 listSnapshots returns the authoritative array (read-only by convention)', () => {
  const base = buildBase();
  const created = createSnapshot(base.doc, { label: 'v1' }, snapOpts(T1));
  assert.ok(created.ok);
  assert.equal(listSnapshots(created.doc), created.doc.savedRevisions, 'same reference');
  assert.equal(findSnapshot(created.doc, created.revision.id), created.revision);
  assert.equal(findSnapshot(created.doc, nextId()), null, 'unknown id → null');
});

// ═════════════════════════════════════════════════════════════════════════════
group('3. read-only inspection');
// ═════════════════════════════════════════════════════════════════════════════

function docWithResolvedAndPending() {
  const base = buildBase();
  // Two tracked edits: the first is ACCEPTED (resolved), the second stays
  // pending — the fixture must carry both statuses for §3.1/§4.9.
  const first = capture(
    base.doc,
    must(updateParagraphContent(base.doc, base.para2Id, { spans: plainTextToSpans('Pending edit') }, opts()), 'edit').doc,
    { kind: 'block-content', blockId: base.para2Id },
  );
  const second = capture(
    first,
    must(updateHeadingContent(first, base.headingId, { text: 'Second tracked edit' }, opts()), 'edit2').doc,
    { kind: 'block-content', blockId: base.headingId },
  );
  const events = documentChangeEvents(second);
  assert.equal(events.filter((e) => e.status === 'pending').length, 2, 'fixture captures two edits');
  const resolved = must(acceptChange(second, events[0].id), 'accept first').doc;
  const after = documentChangeEvents(resolved);
  assert.equal(after.filter((e) => e.status === 'pending').length, 1, 'one still pending');
  assert.equal(after.filter((e) => e.status !== 'pending').length, 1, 'one resolved');
  return { doc: resolved };
}

test('3.1 inspection derives an accurate view of the saved state', () => {
  const fixture = docWithResolvedAndPending();
  const assetId = nextId();
  const withAsset = {
    ...fixture.doc,
    assets: { [assetId]: makeAsset(assetId, 'logo.png', 64) },
  };
  const created = createSnapshot(withAsset, { label: 'v1', summary: 's', reason: 'r' }, snapOpts(T1));
  assert.ok(created.ok);
  const result = inspectSnapshot(created.revision);
  assert.ok(result.ok, 'inspection succeeds');
  const view = result.view;
  assert.equal(view.title, withAsset.metadata.title);
  assert.equal(view.status, withAsset.metadata.status);
  assert.equal(view.blockCount, withAsset.blocks.length);
  assert.equal(view.assetCount, 1);
  assert.deepEqual(view.assetNames, ['logo.png']);
  assert.equal(view.trackingEnabled, true);
  const total = view.blockTypeCounts.reduce((sum, e) => sum + e.count, 0);
  assert.equal(total, view.blockCount, 'type counts sum to the block count');
  const sorted = view.blockTypeCounts.map((e) => e.type);
  assert.deepEqual(sorted, [...sorted].sort(), 'type counts sorted alphabetically');
  const events = documentChangeEvents(withAsset);
  assert.equal(view.pendingChangeCount, events.filter((e) => e.status === 'pending').length);
  assert.equal(view.resolvedChangeCount, events.filter((e) => e.status !== 'pending').length);
  assert.ok(view.pendingChangeCount >= 1, 'fixture keeps a pending event');
  assert.ok(view.resolvedChangeCount >= 1, 'fixture keeps a resolved event');
});

test('3.2 inspection NEVER mutates the snapshot or any document (pure read)', () => {
  const fixture = docWithResolvedAndPending();
  const created = createSnapshot(fixture.doc, { label: 'v1' }, snapOpts(T1));
  assert.ok(created.ok);
  const revBefore = clone(created.revision);
  const docBefore = clone(created.doc);
  const first = inspectSnapshot(created.revision);
  const preview = previewSnapshotJson(first.ok ? first.document : created.doc);
  const second = inspectSnapshot(created.revision);
  assert.ok(first.ok && second.ok);
  assert.deepEqual(clone(created.revision), revBefore, 'revision untouched');
  assert.deepEqual(clone(created.doc), docBefore, 'document untouched');
  assert.deepEqual(first.view, second.view, 'repeat inspection is deterministic');
  assert.equal(typeof preview, 'string');
});

test('3.3 malformed snapshot JSON is rejected at inspection with a labelled message', () => {
  const broken = {
    id: nextId(),
    label: 'Broken one',
    savedAt: T1,
    snapshotJson: '{not json',
  };
  const result = inspectSnapshot(broken);
  assert.equal(result.ok, false);
  assert.equal(result.code, 'invalid-snapshot-json');
  assert.ok(result.message.includes('Broken one'), 'names the snapshot');
});

test('3.4 parseable-but-invalid payload content is rejected at inspection', () => {
  const damaged = { id: nextId(), label: 'Damaged', savedAt: T1, snapshotJson: '{}' };
  const result = inspectSnapshot(damaged);
  assert.equal(result.ok, false);
  assert.equal(result.code, 'invalid-snapshot-content');
  assert.ok(result.message.includes('Damaged'));
  const wrongType = {
    id: nextId(),
    label: 'Wrong root',
    savedAt: T1,
    snapshotJson: JSON.stringify({ __type: 'DocStudio', schemaVersion: 1, blocks: 'nope' }),
  };
  const second = inspectSnapshot(wrongType);
  assert.equal(second.ok, false);
  assert.equal(second.code, 'invalid-snapshot-content');
});

test('3.5 the JSON preview elides embedded asset payloads', () => {
  const base = buildBase();
  const assetId = nextId();
  const asset = makeAsset(assetId, 'photo.png', 2000);
  const doc = { ...base.doc, assets: { [assetId]: asset } };
  const created = createSnapshot(doc, { label: 'v1' }, snapOpts(T1));
  assert.ok(created.ok);
  const result = inspectSnapshot(created.revision);
  assert.ok(result.ok);
  const preview = previewSnapshotJson(result.document);
  assert.ok(!preview.includes(asset.base64Data), 'raw base64 never shown');
  assert.ok(preview.includes('omitted'), 'elision is announced');
  assert.ok(preview.includes('photo.png'), 'asset metadata still visible');
  assert.equal(result.document.assets[assetId].base64Data, asset.base64Data, 'source untouched');
});

// ═════════════════════════════════════════════════════════════════════════════
group('4. persistence, compatibility and the load/point-of-use split');
// ═════════════════════════════════════════════════════════════════════════════

test('4.1 round-trip with ZERO snapshots: byte-stable and deep-equal', () => {
  const base = buildBase();
  const text = serializeDocument(base.doc);
  const back = deserializeDocument(text);
  assert.deepEqual(back, base.doc);
  assert.equal(serializeDocument(back), text, 'untouched documents stay byte-identical');
});

test('4.2 round-trip with ONE snapshot preserves the payload byte-for-byte', () => {
  const base = buildBase();
  const created = createSnapshot(base.doc, { label: 'v1', summary: 's', reason: 'r' }, snapOpts(T1));
  assert.ok(created.ok);
  const back = deserializeDocument(serializeDocument(created.doc));
  assert.deepEqual(back.savedRevisions, created.doc.savedRevisions, 'all fields identical');
  assert.equal(back.savedRevisions[0].snapshotJson, created.revision.snapshotJson,
    'payload survives serialization exactly');
  assert.equal(serializeDocument(back), serializeDocument(created.doc), 'stable re-save');
});

test('4.3 round-trip with MANY snapshots preserves order and metadata', () => {
  const base = buildBase();
  let doc = base.doc;
  const stamps = [T1, T2, T3];
  for (let i = 0; i < 3; i++) {
    const created = createSnapshot(doc, { label: `v${i + 1}`, reason: `r${i + 1}` }, snapOpts(stamps[i]));
    assert.ok(created.ok);
    doc = created.doc;
  }
  const back = deserializeDocument(serializeDocument(doc));
  assert.equal(back.savedRevisions.length, 3);
  assert.deepEqual(back.savedRevisions.map((r) => r.label), ['v1', 'v2', 'v3']);
  assert.deepEqual(back.savedRevisions.map((r) => r.savedAt), stamps);
  assert.deepEqual(back.savedRevisions.map((r) => r.reason), ['r1', 'r2', 'r3']);
});

test('4.4 OLD schema-v1 documents (no snapshots, no changeEvents) open unchanged', () => {
  const doc = createNewDocument(T0);
  const legacy = { ...doc };
  delete legacy.changeEvents;
  const text = serializeDocument(legacy);
  const back = deserializeDocument(text);
  assert.deepEqual(back.savedRevisions, []);
  assert.deepEqual(back, legacy);
  assert.ok(!('changeEvents' in back), 'absent key stays absent');
});

test('4.5 legacy stub-era entries from earlier suites still validate at load', () => {
  // verify_p07_m1 fixture: '{"__type":"DocStudio"}' — verify_p02_m3: '{}'.
  // Both parse as JSON, so load-time envelope validation must ACCEPT them;
  // full payload validation happens only at inspect/restore.
  const doc = createNewDocument(T0);
  doc.savedRevisions = [
    { id: nextId(), label: 'v1', savedAt: T0, summary: 'First saved revision', reason: 'Periodic save', snapshotJson: '{"__type":"DocStudio"}' },
    { id: nextId(), label: 'stub', savedAt: T0, snapshotJson: '{}' },
  ];
  const back = deserializeDocument(serializeDocument(doc));
  assert.equal(back.savedRevisions.length, 2);
  // …and the point-of-use layer reports the stub payload honestly.
  const inspect = inspectSnapshot(back.savedRevisions[1]);
  assert.equal(inspect.ok, false);
  assert.equal(inspect.code, 'invalid-snapshot-content');
});

test('4.6 envelope violations are rejected at LOAD with per-index detail', () => {
  const doc = createNewDocument(T0);
  const cases = [
    ['entry not an object', ['nope'], 'savedRevisions[0] must be an object'],
    ['missing label', [{ id: nextId(), savedAt: T0, snapshotJson: '{}' }], 'savedRevisions[0].label'],
    ['snapshotJson not a string', [{ id: nextId(), label: 'v1', savedAt: T0, snapshotJson: 42 }], 'savedRevisions[0].snapshotJson must be a string'],
    ['snapshotJson malformed', [{ id: nextId(), label: 'v1', savedAt: T0, snapshotJson: '{oops' }], 'savedRevisions[0].snapshotJson is not valid JSON'],
    ['summary wrong type', [{ id: nextId(), label: 'v1', savedAt: T0, snapshotJson: '{}', summary: 7 }], 'savedRevisions[0].summary'],
    ['reason wrong type', [{ id: nextId(), label: 'v1', savedAt: T0, snapshotJson: '{}', reason: [] }], 'savedRevisions[0].reason'],
  ];
  for (const [what, entries, needle] of cases) {
    // Build the FILE TEXT directly so this exercises the LOAD validator,
    // not the write-side guard (which rejects the same input earlier).
    const text = JSON.stringify({ ...doc, savedRevisions: entries }, null, 2);
    let error = null;
    try {
      deserializeDocument(text);
    } catch (e) {
      error = e;
    }
    assert.ok(error instanceof DocumentFileError, `${what} → DocumentFileError`);
    assert.equal(error.code, 'invalid-structure', `${what} → invalid-structure`);
    assert.ok(error.detail.includes(needle), `${what} detail names the failure (${needle})`);
  }
});

test('4.7 a parseable-but-damaged payload OPENS the document but cannot be restored', () => {
  // Documented split: load validates the envelope + JSON well-formedness;
  // the embedded structure is validated at point of use.
  const base = buildBase();
  const created = createSnapshot(base.doc, { label: 'v1' }, snapOpts(T1));
  assert.ok(created.ok);
  const tampered = clone(created.doc);
  tampered.savedRevisions[0].snapshotJson = JSON.stringify({ __type: 'DocStudio' });
  const back = deserializeDocument(serializeDocument(tampered)); // opens…
  assert.equal(back.savedRevisions.length, 1);
  const restored = restoreSnapshot(back, back.savedRevisions[0].id, snapOpts(T2)); // …but cannot restore
  assert.equal(restored.ok, false);
  assert.equal(restored.code, 'invalid-snapshot-content');
});

test('4.8 serializeDocument refuses to WRITE an invalid envelope', () => {
  const doc = createNewDocument(T0);
  assert.throws(
    () => serializeDocument({ ...doc, savedRevisions: [{ id: 1, label: 2 }] }),
    DocumentFileError,
  );
});

test('4.9 Track Changes data survives save/reopen alongside snapshots', () => {
  const fixture = docWithResolvedAndPending();
  const created = createSnapshot(fixture.doc, { label: 'v1' }, snapOpts(T1));
  assert.ok(created.ok);
  const back = deserializeDocument(serializeDocument(created.doc));
  assert.deepEqual(back.changeEvents, fixture.doc.changeEvents, 'event log preserved');
  assert.equal(back.trackChangesEnabled, fixture.doc.trackChangesEnabled, 'toggle preserved');
  assert.equal(back.savedRevisions.length, 1, 'snapshot preserved');
  assert.ok(hasPendingChanges(back), 'pending events still pending');
});

test('4.10 clearDocumentContents still preserves the snapshot history (P02 policy)', () => {
  const base = buildBase();
  const created = createSnapshot(base.doc, { label: 'v1' }, snapOpts(T1));
  assert.ok(created.ok);
  const cleared = clearDocumentContents(created.doc, T2);
  assert.equal(cleared.blocks.length, 0);
  assert.deepEqual(cleared.savedRevisions, created.doc.savedRevisions, 'history preserved');
});

// ═════════════════════════════════════════════════════════════════════════════
group('5. restore as a new revision (history always preserved)');
// ═════════════════════════════════════════════════════════════════════════════

test('5.1 restoring an older snapshot returns EXACTLY its saved state', () => {
  const base = buildBase();
  const v1 = createSnapshot(base.doc, { label: 'v1' }, snapOpts(T1));
  assert.ok(v1.ok);
  const edited = must(
    updateHeadingContent(v1.doc, base.headingId, { text: 'Changed later' }, opts()),
    'later edit',
  ).doc;
  const v2 = createSnapshot(edited, { label: 'v2' }, snapOpts(T2));
  assert.ok(v2.ok);

  const restored = restoreSnapshot(v2.doc, v1.revision.id, snapOpts(T3));
  assert.ok(restored.ok, 'restore succeeds');
  const expected = JSON.parse(v1.revision.snapshotJson);
  assert.deepEqual(
    { ...restored.doc, savedRevisions: [] },
    { ...expected, savedRevisions: [] },
    'restored state equals the snapshot payload',
  );
  assert.equal(restored.doc.blocks.find((b) => b.id === base.headingId).data.text, 'Section alpha');
});

test('5.2 the ENTIRE prior history is preserved and ONE restore record appended', () => {
  const base = buildBase();
  const v1 = createSnapshot(base.doc, { label: 'v1' }, snapOpts(T1));
  const v2 = createSnapshot(v1.doc, { label: 'v2' }, snapOpts(T2));
  assert.ok(v1.ok && v2.ok);
  const restored = restoreSnapshot(v2.doc, v1.revision.id, snapOpts(T3));
  assert.ok(restored.ok);

  const history = restored.doc.savedRevisions;
  assert.equal(history.length, 3, 'two originals + one restore record');
  assert.deepEqual(history.slice(0, 2), v2.doc.savedRevisions, 'originals untouched, in order');
  const record = history[2];
  assert.equal(record.label, `Restore of "${v1.revision.label}"`);
  assert.ok(record.reason.includes('v1'), 'reason names the source snapshot');
  assert.ok(record.reason.includes(T1), 'reason carries the source timestamp');
  assert.equal(record.savedAt, T3, 'restore timestamp from the injected clock');
  assert.equal(record.snapshotJson, v1.revision.snapshotJson, 'records the restored state once');
  assert.notEqual(record.id, v1.revision.id, 'a NEW record, never a rewrite of the source');
});

test('5.3 repeated restores append exactly one record each and never nest history', () => {
  const base = buildBase();
  const v1 = createSnapshot(base.doc, { label: 'v1' }, snapOpts(T1));
  assert.ok(v1.ok);
  let doc = v1.doc;
  const seen = [];
  for (let i = 0; i < 5; i++) {
    const edited = must(
      updateParagraphContent(doc, base.para2Id, { spans: plainTextToSpans(`edit ${i}`) }, opts()),
      'edit',
    ).doc;
    const created = createSnapshot(edited, { label: `v${i + 2}` }, snapOpts(T2));
    assert.ok(created.ok);
    doc = created.doc;
    const before = doc.savedRevisions.length;
    const restored = restoreSnapshot(doc, v1.revision.id, snapOpts(T3));
    assert.ok(restored.ok, `restore #${i + 1} succeeds`);
    doc = restored.doc;
    assert.equal(doc.savedRevisions.length, before + 1, `restore #${i + 1} appends exactly one`);
    seen.push(doc.savedRevisions.length);
  }
  assert.deepEqual(seen, [3, 5, 7, 9, 11],
    'each loop creates one snapshot AND one restore record (2 additions per cycle)');
  // The core non-nesting guarantee, over every record at every size:
  for (const revision of doc.savedRevisions) {
    const payload = JSON.parse(revision.snapshotJson);
    assert.deepEqual(payload.savedRevisions, [], `${revision.label} holds no nested history`);
    assert.ok(!('Restore of' in payload), 'no restore records inside payloads');
  }
});

test('5.4 unknown snapshot id fails honestly with the document STRICTLY unchanged', () => {
  const base = buildBase();
  const before = clone(base.doc);
  const result = restoreSnapshot(base.doc, nextId(), snapOpts(T1));
  assert.equal(result.ok, false);
  assert.equal(result.code, 'not-found');
  assert.equal(result.doc, undefined, 'no document on failure');
  assert.deepEqual(clone(base.doc), before);
});

test('5.5 a corrupt payload makes restore fail BEFORE any state is built', () => {
  const base = buildBase();
  const created = createSnapshot(base.doc, { label: 'v1' }, snapOpts(T1));
  assert.ok(created.ok);
  const doc = clone(created.doc);
  doc.savedRevisions[0].snapshotJson = '{"broken":';
  const historyBefore = clone(doc.savedRevisions);
  const result = restoreSnapshot(doc, doc.savedRevisions[0].id, snapOpts(T2));
  assert.equal(result.ok, false);
  assert.equal(result.code, 'invalid-snapshot-json');
  assert.equal(result.doc, undefined, 'no partial document returned');
  assert.equal(result.revision, undefined, 'no restore record fabricated');
  assert.deepEqual(doc.savedRevisions, historyBefore, 'history untouched');
});

test('5.6 documented tracking semantics: restore rolls Track Changes state back too', () => {
  const base = buildBase();
  // Snapshot while ONE pending event exists.
  const pendingDoc = capture(
    base.doc,
    must(updateParagraphContent(base.doc, base.paraId, { spans: plainTextToSpans('tracked') }, opts()), 'edit').doc,
    { kind: 'block-content', blockId: base.paraId },
  );
  const v1 = createSnapshot(pendingDoc, { label: 'v1' }, snapOpts(T1));
  assert.ok(v1.ok);
  const logAtSnapshot = clone(documentChangeEvents(v1.doc));
  assert.ok(logAtSnapshot.length >= 1);

  // Later: resolve it, add another event, then disable tracking.
  const resolved = must(acceptChange(v1.doc, logAtSnapshot[0].id), 'accept').doc;
  const more = capture(
    resolved,
    must(updateHeadingContent(resolved, base.headingId, { text: 'After snapshot' }, opts()), 'edit2').doc,
    { kind: 'block-content', blockId: base.headingId },
  );
  const later = { ...more, trackChangesEnabled: false };
  assert.notDeepEqual(documentChangeEvents(later), logAtSnapshot, 'log evolved after the snapshot');

  const restored = restoreSnapshot(later, v1.revision.id, snapOpts(T2));
  assert.ok(restored.ok);
  assert.deepEqual(documentChangeEvents(restored.doc), logAtSnapshot,
    'log returns to its snapshot-time state (documented Option-A semantics)');
  assert.equal(restored.doc.trackChangesEnabled, true, 'toggle returns to snapshot state');
  assert.ok(hasPendingChanges(restored.doc), 'the pending event is back with its content');
});

test('5.7 creation and restoration never fabricate a change event', () => {
  const fixture = docWithResolvedAndPending();
  const logBefore = clone(documentChangeEvents(fixture.doc));
  const created = createSnapshot(fixture.doc, { label: 'v1' }, snapOpts(T1));
  assert.ok(created.ok);
  assert.deepEqual(documentChangeEvents(created.doc), logBefore, 'create records nothing');
  const restored = restoreSnapshot(created.doc, created.revision.id, snapOpts(T2));
  assert.ok(restored.ok);
  assert.deepEqual(documentChangeEvents(restored.doc), logBefore, 'restore records nothing new');
});

test('5.8 assets and asset references remain valid after restoration', () => {
  const base = buildBase();
  const imageBlock = must(insertBlock(base.doc, 'image', { kind: 'end' }, opts()), 'insert image');
  const slot = imageBlock.doc.blocks.find((b) => b.id === imageBlock.blockId).data.images[0];
  const assetId = nextId();
  const asset = makeAsset(assetId, 'micrograph.png', 5000);
  const attached = must(
    attachImageAsset(imageBlock.doc, imageBlock.blockId, slot.id, asset, opts()),
    'attach asset',
  ).doc;

  const v1 = createSnapshot(attached, { label: 'v1' }, snapOpts(T1));
  assert.ok(v1.ok);
  const cleared = clearDocumentContents(v1.doc, T2); // destroy the live content…
  const restored = restoreSnapshot(cleared, v1.revision.id, snapOpts(T3)); // …then restore
  assert.ok(restored.ok, 'restore succeeds after clear');

  const image = restored.doc.blocks.find((b) => b.id === imageBlock.blockId);
  const attachedSlot = image.data.images.find((s) => s.assetId !== null);
  assert.ok(attachedSlot, 'image slot still references an asset');
  assert.ok(restored.doc.assets[attachedSlot.assetId], 'referenced asset exists in restored assets');
  assert.equal(restored.doc.assets[attachedSlot.assetId].base64Data, asset.base64Data,
    'asset payload intact');
  assert.doesNotThrow(() => validateDocument(restored.doc), 'restored document is valid');
});

test('5.9 restoring a LATER snapshot returns the later state (both directions)', () => {
  const base = buildBase();
  const v1 = createSnapshot(base.doc, { label: 'v1' }, snapOpts(T1));
  const edited = must(
    updateHeadingContent(v1.doc, base.headingId, { text: 'Advanced state' }, opts()),
    'edit',
  ).doc;
  const v2 = createSnapshot(edited, { label: 'v2' }, snapOpts(T2));
  assert.ok(v1.ok && v2.ok);
  const back1 = restoreSnapshot(v2.doc, v1.revision.id, snapOpts(T3));
  const fwd = restoreSnapshot(back1.doc, v2.revision.id, snapOpts(T3));
  assert.ok(back1.ok && fwd.ok);
  const expectedV2 = JSON.parse(v2.revision.snapshotJson);
  assert.deepEqual({ ...fwd.doc, savedRevisions: [] }, { ...expectedV2, savedRevisions: [] });
  assert.equal(fwd.doc.savedRevisions.length, 4, '2 originals + 1 restore + 1 more restore');
});

test('5.10 deleteSnapshot removes exactly one record and is honest when absent', () => {
  const base = buildBase();
  const v1 = createSnapshot(base.doc, { label: 'v1' }, snapOpts(T1));
  const v2 = createSnapshot(v1.doc, { label: 'v2' }, snapOpts(T2));
  assert.ok(v1.ok && v2.ok);
  const removed = deleteSnapshot(v2.doc, v1.revision.id);
  assert.ok(removed.ok);
  assert.equal(removed.doc.savedRevisions.length, 1);
  assert.equal(removed.doc.savedRevisions[0].label, 'v2', 'only the selected record removed');
  assert.equal(removed.revision.id, v1.revision.id);
  assert.equal(deleteSnapshot(removed.doc, v1.revision.id).ok, false, 'already gone → failure');
  const missing = deleteSnapshot(removed.doc, nextId());
  assert.equal(missing.ok, false);
  assert.equal(missing.code, 'not-found');
  // Content never involved:
  assert.deepEqual(removed.doc.blocks, v2.doc.blocks, 'content untouched by delete');
});

// ═════════════════════════════════════════════════════════════════════════════
group('6. R-003: realistic history, measured file-size strategy');
// ═════════════════════════════════════════════════════════════════════════════

/**
 * A document carrying every previously supported block family, large valid
 * text content, an embedded image asset and a mixed pending/resolved
 * change-event log — the fixture composition R-003 requires.
 */
function buildRealistic() {
  const families = [
    'heading', 'paragraph', 'callout', 'list', 'table', 'formula', 'image', 'signature',
    'horizontal-line', 'page-break', 'section-break', 'metadata-block', 'revision-history',
    'procedure-step', 'equipment-list', 'observation', 'measurement', 'calculation',
    'acceptance-criteria', 'reference', 'exhibit',
  ];
  let doc = createDefaultDocument(nextId(), T0);
  doc = updateDocumentMetadata(doc, { title: 'Realistic History Fixture', subtitle: 'Baseline' }, T0);

  const inserted = [];
  for (const type of families) {
    const result = must(insertBlock(doc, type, { kind: 'end' }, opts()), `insert ${type}`);
    doc = result.doc;
    inserted.push({ type, blockId: result.blockId });
  }
  // Two more paragraphs so the fixture has several prose blocks to grow.
  for (let i = 0; i < 2; i++) {
    const extra = must(insertBlock(doc, 'paragraph', { kind: 'end' }, opts()), 'insert paragraph');
    doc = extra.doc;
    inserted.push({ type: 'paragraph', blockId: extra.blockId });
  }

  // Large valid text content across the first heading + next two paragraphs.
  const headings = inserted.filter((b) => b.type === 'heading');
  const paragraphs = inserted.filter((b) => b.type === 'paragraph');
  doc = must(
    updateHeadingContent(doc, headings[0].blockId, { text: '7 Realistic validation of snapshot history growth' }, opts()),
    'heading text',
  ).doc;
  const longA = ('The laboratory validates measurement procedures under ISO/IEC 17025 and records ' +
    'every revision of the controlled document. ').repeat(24);
  const longB = ('Snapshot history must grow linearly: each saved state stores one copy of the ' +
    'document and never a copy of the history itself. ').repeat(18);
  doc = must(
    updateParagraphContent(doc, paragraphs[0].blockId, { spans: plainTextToSpans(longA) }, opts()),
    'long paragraph A',
  ).doc;
  doc = must(
    updateParagraphContent(doc, paragraphs[1].blockId, { spans: plainTextToSpans(longB) }, opts()),
    'long paragraph B',
  ).doc;

  // Large valid TABLE content: grow the table, then fill every cell.
  const table = inserted.find((b) => b.type === 'table');
  for (let r = 0; r < 8; r++) {
    doc = must(addTableRow(doc, table.blockId, { kind: 'end' }, opts()), 'add table row').doc;
  }
  const cellText = 'Measurement point recorded and verified against the calibrated standard. ';
  const tableBlock = doc.blocks.find((b) => b.id === table.blockId);
  for (const row of tableBlock.data.rows) {
    for (const cell of row.cells) {
      doc = must(
        setTableCellText(doc, table.blockId, cell.id, cellText.repeat(4), opts()),
        'fill table cell',
      ).doc;
    }
  }

  // Embedded image asset (~40 KB payload) referenced by the image block.
  const image = inserted.find((b) => b.type === 'image');
  const slot = doc.blocks.find((b) => b.id === image.blockId).data.images[0];
  const assetId = nextId();
  doc = must(
    attachImageAsset(doc, image.blockId, slot.id, makeAsset(assetId, 'fixture.png', 40000), opts()),
    'attach asset',
  ).doc;

  // Mixed change-event log: tracking must be ON (the capture seam no-ops
  // otherwise), then TWO tracked edits — the first accepted (resolved) and
  // the second left pending, so the fixture carries both statuses.
  doc = { ...doc, trackChangesEnabled: true };
  const pendingOne = capture(
    doc,
    must(updateParagraphContent(doc, paragraphs[1].blockId, { spans: plainTextToSpans(`${longB} PENDING EDIT`) }, opts()), 'tracked edit').doc,
    { kind: 'block-content', blockId: paragraphs[1].blockId },
  );
  const pendingTwo = capture(
    pendingOne,
    must(updateHeadingContent(pendingOne, headings[0].blockId, { text: '7 Realistic validation — tracked heading edit' }, opts()), 'tracked heading edit').doc,
    { kind: 'block-content', blockId: headings[0].blockId },
  );
  const events = documentChangeEvents(pendingTwo);
  const resolved = must(acceptChange(pendingTwo, events[0].id), 'resolve one').doc;
  const log = documentChangeEvents(resolved);

  return {
    doc: resolved,
    familyCount: families.length,
    blockCount: resolved.blocks.length,
    textChars: longA.length + longB.length,
    tableRows: tableBlock.data.rows.length,
    tableCellChars: resolved.blocks
      .filter((b) => b.data.type === 'table')
      .reduce(
        (sum, b) =>
          sum +
          b.data.rows.reduce(
            (rowSum, row) => rowSum + row.cells.reduce((s, cell) => s + cell.spans.map((sp) => sp.text).join('').length, 0),
            0,
          ),
        0,
      ),
    assetBytes: resolved.assets[assetId].base64Data.length,
    pending: log.filter((e) => e.status === 'pending').length,
    resolvedEvents: log.filter((e) => e.status !== 'pending').length,
  };
}

const measurements = [];
const record = (scenario, snapshots, bytes, extra = {}) => {
  measurements.push({ scenario, snapshots, bytes, ...extra });
};

test('6.1 realistic fixture carries every block family, big text/table, an asset and mixed events', () => {
  const fixture = buildRealistic();
  assert.equal(fixture.familyCount, 21, 'all 21 schema-v1 block families inserted');
  assert.ok(fixture.blockCount >= 21, 'one block per family at minimum');
  assert.ok(fixture.textChars >= 4000, `large text content (${fixture.textChars} chars)`);
  assert.ok(fixture.tableRows >= 9, `grown table (${fixture.tableRows} rows)`);
  assert.ok(fixture.tableCellChars >= 4000, `large table content (${fixture.tableCellChars} chars)`);
  assert.ok(fixture.assetBytes >= 40000, `embedded image payload (${fixture.assetBytes} b64 chars)`);
  assert.ok(fixture.pending >= 1, 'a pending change exists');
  assert.ok(fixture.resolvedEvents >= 1, 'a resolved change exists');
  assert.equal(Object.keys(fixture.doc.assets).length, 1, 'asset recorded');
  // Baseline size recorded for the roadmap evidence table.
  record('base document (21 families, no snapshots)', 0, fileBytes(fixture.doc), {
    textChars: fixture.textChars,
    assetB64: fixture.assetBytes,
  });
});

test('6.2 file growth is linear and bounded at EVERY snapshot step', () => {
  const fixture = buildRealistic();
  let doc = fixture.doc;
  const baseSize = fileBytes(doc);
  const steps = [];
  for (let k = 1; k <= 20; k++) {
    // Evolve the state between snapshots through the real metadata service.
    doc = updateDocumentMetadata(doc, { subtitle: `Iteration ${k}` }, T1);
    const created = createSnapshot(doc, { label: `v${k}`, summary: `Iteration ${k}` }, snapOpts(T1));
    assert.ok(created.ok, `snapshot ${k} created`);
    doc = created.doc;
    const size = fileBytes(doc);
    const payloadBytes = utf8Bytes(created.revision.snapshotJson);
    const prevSize = steps.length === 0 ? baseSize : steps[steps.length - 1].size;
    const realDelta = size - prevSize;
    steps.push({ k, size, payloadBytes, delta: realDelta });
    // One payload copy per record: never less (escaping only adds), never
    // more than envelope + JSON-string escaping (bounded, non-compounding).
    assert.ok(
      realDelta >= payloadBytes,
      `step ${k}: delta ${realDelta} >= payload ${payloadBytes}`,
    );
    assert.ok(
      realDelta <= payloadBytes * 1.3 + 2048,
      `step ${k}: delta ${realDelta} bounded by payload*1.3+2KB (${Math.round(payloadBytes * 1.3 + 2048)})`,
    );
  }
  const maxPayload = Math.max(...steps.map((s) => s.payloadBytes));
  const finalSize = steps[steps.length - 1].size;
  assert.ok(
    finalSize - baseSize <= 20 * (maxPayload * 1.3 + 2048),
    '20 snapshots stay within 20 × one-payload bound (no compounding)',
  );
  // Marginal cost must be roughly constant — NOT growing with history size.
  const firstHalf = steps.slice(0, 10).reduce((s, x) => s + x.delta, 0) / 10;
  const secondHalf = steps.slice(10).reduce((s, x) => s + x.delta, 0) / 10;
  assert.ok(
    Math.abs(secondHalf - firstHalf) / firstHalf <= 0.15,
    `marginal growth stable: first half ${Math.round(firstHalf)} B, second half ${Math.round(secondHalf)} B`,
  );
  record('after 20 linear snapshots', 20, finalSize, {
    baseSize,
    perSnapshot: Math.round((finalSize - baseSize) / 20),
    avgPayload: Math.round(steps.reduce((s, x) => s + x.payloadBytes, 0) / 20),
  });
  measurements.push({
    scenario: 'marginal cost (first 10 vs last 10)',
    snapshots: '-',
    bytes: `${Math.round(firstHalf)} B → ${Math.round(secondHalf)} B per step`,
  });
});

test('6.3 NO snapshot payload nests another snapshot history (all 20 records)', () => {
  const fixture = buildRealistic();
  let doc = fixture.doc;
  for (let k = 1; k <= 20; k++) {
    doc = updateDocumentMetadata(doc, { subtitle: `Nest check ${k}` }, T1);
    const created = createSnapshot(doc, { label: `v${k}` }, snapOpts(T1));
    assert.ok(created.ok);
    doc = created.doc;
  }
  assert.equal(doc.savedRevisions.length, 20);
  for (const revision of doc.savedRevisions) {
    const payload = JSON.parse(revision.snapshotJson);
    assert.deepEqual(payload.savedRevisions, [], `${revision.label}: history omitted by encoding`);
  }
  const text = serializeDocument(doc);
  const assetOccurrences = text.match(/base64Data/g).length;
  assert.equal(assetOccurrences, 21,
    `asset stored exactly once per snapshot + once live (found ${assetOccurrences})`);
  record('no-nesting proof (20 records, 1 asset)', 20, utf8Bytes(text), { assetOccurrences });
});

test('6.4 repeated RESTORATIONS at scale stay linear and non-nested', () => {
  const fixture = buildRealistic();
  let doc = fixture.doc;
  const created = [];
  for (let k = 1; k <= 10; k++) {
    doc = updateDocumentMetadata(doc, { subtitle: `R${k}` }, T1);
    const snap = createSnapshot(doc, { label: `v${k}` }, snapOpts(T1));
    assert.ok(snap.ok);
    doc = snap.doc;
    created.push(snap.revision);
  }
  const sizeBeforeRestores = fileBytes(doc);
  const target = created[2]; // restore an OLDER snapshot (index 2 of 10)
  for (let i = 0; i < 5; i++) {
    const before = doc.savedRevisions.length;
    const restored = restoreSnapshot(doc, target.id, snapOpts(T2));
    assert.ok(restored.ok, `scale restore #${i + 1}`);
    doc = restored.doc;
    assert.equal(doc.savedRevisions.length, before + 1, 'exactly one record appended');
    const payload = JSON.parse(doc.savedRevisions[doc.savedRevisions.length - 1].snapshotJson);
    assert.deepEqual(payload.savedRevisions, [], 'restore record payload holds no history');
  }
  const sizeAfterRestores = fileBytes(doc);
  const recordPayload = utf8Bytes(target.snapshotJson);
  const delta = sizeAfterRestores - sizeBeforeRestores;
  assert.ok(delta >= 5 * recordPayload, 'five restore records ≈ five payload copies');
  assert.ok(delta <= 5 * (recordPayload * 1.3 + 2048), 'bounded per record, no nesting');
  record('after 10 snapshots + 5 restorations', 15, sizeAfterRestores, {
    restoreDelta: delta,
    perRestore: Math.round(delta / 5),
  });
});

test('6.5 save/reopen at scale round-trips exactly and opens in bounded time', () => {
  const fixture = buildRealistic();
  let doc = fixture.doc;
  for (let k = 1; k <= 20; k++) {
    doc = updateDocumentMetadata(doc, { subtitle: `Round ${k}` }, T1);
    const snap = createSnapshot(doc, { label: `v${k}`, summary: `round ${k}` }, snapOpts(T1));
    assert.ok(snap.ok);
    doc = snap.doc;
  }
  const text = serializeDocument(doc);
  const openStart = performance.now();
  const back = deserializeDocument(text);
  const openMs = performance.now() - openStart;
  assert.deepEqual(back.savedRevisions, doc.savedRevisions, 'history identical after reopen');
  assert.deepEqual(back.blocks, doc.blocks, 'content identical after reopen');
  assert.deepEqual(back.changeEvents, doc.changeEvents, 'event log identical after reopen');
  assert.ok(openMs < 10000, `open cost measured (${openMs.toFixed(1)} ms) within 10 s ceiling`);

  const target = back.savedRevisions[4];
  const restoreStart = performance.now();
  const restored = restoreSnapshot(back, target.id, snapOpts(T3));
  const restoreMs = performance.now() - restoreStart;
  assert.ok(restored.ok, 'restore at scale succeeds');
  assert.ok(restoreMs < 10000, `restore cost measured (${restoreMs.toFixed(1)} ms)`);
  record('reopen cost at 20 snapshots', 20, utf8Bytes(text), {
    openMs: openMs.toFixed(1),
    restoreMs: restoreMs.toFixed(1),
    totalKB: Math.round(utf8Bytes(text) / 1024),
  });
});

test('6.6 a corrupted record inside a realistic file is rejected precisely', () => {
  const fixture = buildRealistic();
  let doc = fixture.doc;
  for (let k = 1; k <= 8; k++) {
    const snap = createSnapshot(doc, { label: `v${k}` }, snapOpts(T1));
    assert.ok(snap.ok);
    doc = snap.doc;
  }
  // Corrupt record #7 inside FILE TEXT (bypassing the write-side guard) so
  // this exercises the LOAD path specifically.
  const parsed = JSON.parse(serializeDocument(doc));
  parsed.savedRevisions[6].snapshotJson = '{"corrupt":';
  const badText = JSON.stringify(parsed, null, 2);
  let error = null;
  try {
    deserializeDocument(badText);
  } catch (e) {
    error = e;
  }
  assert.ok(error instanceof DocumentFileError, 'load rejects the malformed record');
  assert.equal(error.code, 'invalid-structure');
  assert.ok(error.detail.includes('savedRevisions[6]'),
    `detail names the record: ${String(error.detail).slice(0, 140)}`);
  // And the point-of-use path fails without touching state.
  const probe = clone(doc);
  probe.savedRevisions[6].snapshotJson = '{"corrupt":';
  const before = clone(probe);
  const result = restoreSnapshot(probe, probe.savedRevisions[6].id, snapOpts(T2));
  assert.equal(result.ok, false);
  assert.equal(result.code, 'invalid-snapshot-json');
  assert.deepEqual(clone(probe), before, 'document and history untouched');
  // The remaining healthy records still restore:
  const healthy = restoreSnapshot(probe, probe.savedRevisions[0].id, snapOpts(T2));
  assert.ok(healthy.ok, 'unaffected records remain usable');
});

test('6.7 history stats measure the real history and flag ONLY an advisory warning', () => {
  const base = buildBase();
  const empty = snapshotHistoryStats([], sessionFingerprint(base.doc));
  assert.equal(empty.count, 0);
  assert.equal(empty.historyBytes, 0);
  assert.equal(empty.advisory, false);
  assert.equal(empty.advisoryMessage, null);

  let doc = base.doc;
  for (let k = 1; k <= 3; k++) {
    const snap = createSnapshot(doc, { label: `v${k}` }, snapOpts(T1));
    assert.ok(snap.ok);
    doc = snap.doc;
  }
  const fingerprint = sessionFingerprint(doc);
  const stats = snapshotHistoryStats(doc.savedRevisions, fingerprint);
  assert.equal(stats.count, 3);
  assert.equal(stats.historyBytes, utf8Bytes(JSON.stringify(doc.savedRevisions)));
  assert.equal(stats.projectBytes, utf8Bytes(fingerprint));
  assert.ok(stats.share > 0 && stats.share < 1, 'share is a real ratio');
  assert.equal(stats.advisory, false, 'small share → no warning');

  // Crafted worst case: history dwarfs the remaining project data.
  const heavy = snapshotHistoryStats(doc.savedRevisions, 'x'.repeat(50));
  assert.equal(heavy.advisory, true, 'share above 80% → advisory');
  assert.ok(heavy.share > SNAPSHOT_HISTORY_ADVISORY_SHARE);
  assert.ok(heavy.advisoryMessage.includes('nothing is ever removed automatically'),
    'guidance is non-destructive by wording');
  assert.ok(heavy.advisoryMessage.includes('%'), 'reports the measured share');
});

test('6.8 strategy invariants: stored in-project, linear, non-destructive', () => {
  const src = fs.readFileSync(path.join(root, 'src', 'services', 'snapshots.ts'), 'utf8');
  assert.ok(src.includes('stored inline in the `.docstudio` file'), 'snapshots live in the document file');
  assert.ok(!/sidecar|localStorage|indexedDB/i.test(src), 'no alternative persistence mechanism');
  // Normalize wrapped doc-comment lines before phrase matching.
  const strategy = (src.split('File-size strategy')[1] ?? '')
    .replace(/\s*\n\s*\*\s?/g, ' ');
  assert.ok(strategy.includes('no hard cap'), 'no hard cap');
  assert.ok(strategy.includes('no automatic pruning'), 'no automatic pruning');
  assert.ok(strategy.includes('no silent deletion'), 'no silent deletion');
  assert.ok(strategy.includes('explicit, confirmed, user-initiated'),
    'the only remedy is an explicit user action');
  const panel = fs.readFileSync(
    path.join(root, 'src', 'components', 'left-panel', 'SavedRevisionsPanel.tsx'),
    'utf8',
  );
  assert.ok(panel.includes('does not change your document content'),
    'create hint avoids any edit/verification claim');
  assert.ok(panel.includes('not shown'), 'comparison is explicitly not offered');
  assert.ok(!/>\s*Compare\b/.test(panel), 'no Compare control rendered');
});

// Print the R-003 measurement table (evidence for project_roadmap.md).
console.log('\n  R-003 measurement table (measured on serialized text, in memory):');
console.log('  scenario                                       snapshots   bytes');
for (const row of measurements) {
  const extra = row.perSnapshot !== undefined
    ? `  base=${row.baseSize} B, +${row.perSnapshot} B/snapshot`
    : row.openMs !== undefined
      ? `  open=${row.openMs} ms, restore=${row.restoreMs} ms`
      : row.perRestore !== undefined
        ? `  +${row.perRestore} B per restore`
        : row.assetOccurrences !== undefined
          ? `  base64Data occurrences=${row.assetOccurrences}`
          : '';
  console.log(
    `  ${String(row.scenario).padEnd(46)} ${String(row.snapshots).padStart(6)} ${String(row.bytes).padStart(10)}${extra}`,
  );
}

// ═════════════════════════════════════════════════════════════════════════════
group('7. DOM: SavedRevisionsPanel under a real jsdom');
// ═════════════════════════════════════════════════════════════════════════════

const { JSDOM } = require('jsdom');
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
  'HTMLLabelElement', 'HTMLButtonElement', 'HTMLParagraphElement', 'HTMLHeadingElement',
  'HTMLFormElement', 'Element', 'Node', 'Event', 'MouseEvent', 'FocusEvent', 'Storage',
  'getComputedStyle', 'requestAnimationFrame', 'cancelAnimationFrame',
]) {
  if (dom.window[key] !== undefined) defineGlobal(key, dom.window[key]);
}
defineGlobal('localStorage', dom.window.localStorage);
defineGlobal('IS_REACT_ACT_ENVIRONMENT', true);

const React = require('react');
const { act } = React;
const { createRoot } = require('react-dom/client');
const { SavedRevisionsPanel } = pick(
  path.join(CACHE, 'components', 'left-panel', 'SavedRevisionsPanel.js'),
  path.join(CACHE, 'src', 'components', 'left-panel', 'SavedRevisionsPanel.js'),
);

let mounted = null;

async function mount(element) {
  const container = dom.window.document.createElement('div');
  dom.window.document.body.appendChild(container);
  const root2 = createRoot(container);
  await act(async () => {
    root2.render(element);
  });
  mounted = {
    container,
    root: root2,
    async rerender(el) {
      await act(async () => {
        root2.render(el);
      });
    },
    async unmount() {
      await act(async () => {
        root2.unmount();
      });
      container.remove();
      mounted = null;
    },
  };
  return mounted;
}

const q = (sel) => mounted.container.querySelector(sel);
const qa = (sel) => [...mounted.container.querySelectorAll(sel)];
async function click(el) {
  await act(async () => {
    el.click();
  });
}
async function typeInto(el, value) {
  await act(async () => {
    Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype, 'value').set.call(el, value);
    el.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
  });
}
async function submitForm(form) {
  await act(async () => {
    form.dispatchEvent(new dom.window.Event('submit', { bubbles: true, cancelable: true }));
  });
}

/** Panel fixtures: a real document, real stats, spy handlers. */
function panelFixture() {
  const base = buildBase();
  let doc = base.doc;
  const created1 = createSnapshot(doc, { label: 'v1', summary: 'Baseline state', reason: 'Kickoff' }, snapOpts(T1));
  assert.ok(created1.ok);
  doc = created1.doc;
  doc = must(
    updateHeadingContent(doc, base.headingId, { text: 'Second state' }, opts()),
    'edit',
  ).doc;
  const created2 = createSnapshot(doc, { label: 'v2' }, snapOpts(T2));
  assert.ok(created2.ok);
  doc = created2.doc;

  const calls = { create: [], restore: [], delete: [] };
  const handlers = {
    onCreate: (input) => {
      calls.create.push(input);
      return createSnapshot(doc, input, snapOpts(T3));
    },
    onRestore: (id) => calls.restore.push(id),
    onDelete: (id) => calls.delete.push(id),
  };
  return { doc, calls, handlers, stats: snapshotHistoryStats(doc.savedRevisions, sessionFingerprint(doc)) };
}

const renderPanel = async (fixture, extra = {}) =>
  mount(
    React.createElement(SavedRevisionsPanel, {
      revisions: fixture.doc.savedRevisions,
      history: fixture.stats,
      ...fixture.handlers,
      ...extra,
    }),
  );

await testAsync('7.1 empty state renders with a zeroed size report', async () => {
  const base = buildBase();
  const stats = snapshotHistoryStats([], sessionFingerprint(base.doc));
  const calls = { create: [], restore: [], delete: [] };
  await mount(
    React.createElement(SavedRevisionsPanel, {
      revisions: [],
      history: stats,
      onCreate: (input) => {
        calls.create.push(input);
        return createSnapshot(base.doc, input, snapOpts(T1));
      },
      onRestore: (id) => calls.restore.push(id),
      onDelete: (id) => calls.delete.push(id),
    }),
  );
  assert.ok(q('[aria-label="Saved snapshots controls"]'), 'panel root renders');
  assert.ok(q('[aria-label="Save a new snapshot"]'), 'create form renders');
  assert.ok(q('.sr-empty').textContent.includes('No saved snapshots yet'), 'empty state');
  assert.ok(q('.sr-stats-main').textContent.includes('0 snapshots'), 'zero count');
  await mounted.unmount();
});

await testAsync('7.2 creating with an empty label shows the real validation message', async () => {
  const fixture = panelFixture();
  await renderPanel(fixture);
  await submitForm(q('[aria-label="Save a new snapshot"]'));
  const alert = q('.sr-notice--error');
  assert.ok(alert, 'error notice rendered');
  assert.equal(alert.getAttribute('role'), 'alert');
  assert.ok(alert.textContent.includes('Enter a name'), `message: ${alert.textContent}`);
  assert.equal(q('#ds-snapshot-label').value, '', 'input not cleared on failure');
  assert.equal(fixture.calls.create.length, 1, 'handler was invoked');
  assert.equal(fixture.calls.restore.length, 0, 'no restore fired');
  assert.equal(fixture.calls.delete.length, 0, 'no delete fired');
  await mounted.unmount();
});

await testAsync('7.3 a valid snapshot submits all fields, reports success and clears the form', async () => {
  const fixture = panelFixture();
  await renderPanel(fixture);
  await typeInto(q('#ds-snapshot-label'), '  v3  ');
  await typeInto(q('#ds-snapshot-summary'), 'Pre-review state');
  await typeInto(q('#ds-snapshot-reason'), 'Milestone');
  await submitForm(q('[aria-label="Save a new snapshot"]'));
  assert.equal(fixture.calls.create.length, 1);
  assert.deepEqual(fixture.calls.create[0], {
    label: '  v3  ',
    summary: 'Pre-review state',
    reason: 'Milestone',
  }, 'panel passes the raw inputs; the service validates and trims');
  const ok = q('.sr-notice--success');
  assert.ok(ok, 'success notice rendered');
  assert.ok(ok.textContent.includes('Snapshot "v3" saved'), `success text: ${ok.textContent}`);
  assert.equal(q('#ds-snapshot-label').value, '');
  assert.equal(q('#ds-snapshot-summary').value, '');
  assert.equal(q('#ds-snapshot-reason').value, '');
  await mounted.unmount();
});

await testAsync('7.4 the history lists every snapshot in chronological order with metadata', async () => {
  const fixture = panelFixture();
  await renderPanel(fixture);
  const entries = qa('.sr-entry');
  assert.equal(entries.length, 2, 'both snapshots listed');
  assert.deepEqual(entries.map((e) => e.getAttribute('data-revision-label')), ['v1', 'v2']);
  assert.deepEqual(entries.map((e) => e.getAttribute('data-revision-id')),
    fixture.doc.savedRevisions.map((r) => r.id));
  assert.ok(entries[0].textContent.includes('Baseline state'), 'summary shown');
  assert.ok(entries[0].textContent.includes('Kickoff'), 'reason shown');
  assert.ok(entries[0].textContent.includes('Saved '), 'timestamp shown');
  assert.equal(entries[0].querySelector('.sr-entry-index').textContent, '1', 'chronological index');
  assert.equal(entries[1].querySelector('.sr-entry-index').textContent, '2');
  assert.ok(q('.sr-stats-main').textContent.includes('2 snapshots'), 'count in stats');
  await mounted.unmount();
});

await testAsync('7.5 inspect opens a read-only view; preview elides asset data', async () => {
  const fixture = panelFixture();
  await renderPanel(fixture);
  const inspectBtn = qa('.sr-entry')[0].querySelector('.sr-action-btn');
  assert.equal(inspectBtn.textContent, 'Inspect');
  await click(inspectBtn);
  const view = q('[aria-label="Snapshot inspection (read-only)"]');
  assert.ok(view, 'inspection section renders');
  assert.ok(view.textContent.includes('read-only'), 'labelled read-only');
  assert.ok(view.textContent.includes('not the live document'), 'clearly distinguished');
  assert.ok(view.textContent.includes('v1'), 'names the inspected snapshot');
  const fixtureTitle = fixture.doc.metadata.title;
  assert.ok(view.textContent.includes(fixtureTitle), `saved title shown (${fixtureTitle})`);
  assert.ok(view.textContent.includes('heading ×'), 'block-type breakdown shown');
  await click(q('.sr-preview-toggle'));
  assert.ok(q('.sr-preview'), 'JSON preview shown');
  assert.ok(!q('.sr-preview').textContent.includes('"base64Data"') ||
    q('.sr-preview').textContent.includes('omitted'), 'asset payload elided');
  await click(q('.sr-preview-toggle'));
  assert.equal(q('.sr-preview'), null, 'preview hides again');
  await mounted.unmount();
});

await testAsync('7.6 inspection fires NO lifecycle callbacks and mutates no props', async () => {
  const fixture = panelFixture();
  const revisionsBefore = JSON.stringify(fixture.doc.savedRevisions);
  await renderPanel(fixture);
  await click(qa('.sr-entry')[1].querySelector('.sr-action-btn')); // inspect v2
  await click(q('.sr-preview-toggle'));
  await click(qa('.sr-entry')[1].querySelector('.sr-action-btn')); // hide
  await click(qa('.sr-entry')[0].querySelector('.sr-action-btn')); // inspect v1 again
  assert.equal(fixture.calls.create.length, 0, 'no create');
  assert.equal(fixture.calls.restore.length, 0, 'no restore');
  assert.equal(fixture.calls.delete.length, 0, 'no delete');
  assert.equal(JSON.stringify(fixture.doc.savedRevisions), revisionsBefore, 'props unchanged');
  const buttons = qa('button').map((b) => b.textContent.trim());
  assert.ok(!buttons.some((t) => /^Compare/i.test(t)), 'no comparison control exists');
  await mounted.unmount();
});

await testAsync('7.7 Restore and Delete buttons call the App handlers with the right ids', async () => {
  const fixture = panelFixture();
  await renderPanel(fixture);
  const entries = qa('.sr-entry');
  const btns = (entry) => [...entry.querySelectorAll('.sr-action-btn')].map((b) => b.textContent);
  assert.deepEqual(btns(entries[0]), ['Inspect', 'Restore', 'Delete'], 'actions per entry');
  await click(entries[0].querySelector('.sr-action-btn--restore'));
  await click(entries[1].querySelector('.sr-action-btn--delete'));
  assert.deepEqual(fixture.calls.restore, [fixture.doc.savedRevisions[0].id]);
  assert.deepEqual(fixture.calls.delete, [fixture.doc.savedRevisions[1].id]);
  assert.equal(fixture.calls.create.length, 0, 'create untouched');
  await mounted.unmount();
});

await testAsync('7.8 the size advisory renders only when flagged by the stats', async () => {
  const fixture = panelFixture();
  const quiet = snapshotHistoryStats(fixture.doc.savedRevisions, sessionFingerprint(fixture.doc));
  assert.equal(quiet.advisory, false);
  await renderPanel(fixture, { history: quiet });
  assert.equal(q('.sr-advisory'), null, 'no advisory for a small share');
  await mounted.unmount();

  const heavy = snapshotHistoryStats(fixture.doc.savedRevisions, 'tiny');
  assert.equal(heavy.advisory, true);
  await renderPanel(fixture, { history: heavy });
  const advisory = q('.sr-advisory');
  assert.ok(advisory, 'advisory shown for a heavy share');
  assert.equal(advisory.getAttribute('role'), 'note');
  assert.ok(advisory.textContent.includes('nothing is ever removed automatically'));
  await mounted.unmount();
});

await testAsync('7.9 an unreadable snapshot shows an honest error and keeps the list usable', async () => {
  const fixture = panelFixture();
  const broken = clone(fixture.doc);
  broken.savedRevisions[0].snapshotJson = '{oops';
  await renderPanel({ ...fixture, doc: broken });
  const entries = qa('.sr-entry');
  assert.equal(entries.length, 2, 'list still renders');
  await click(entries[0].querySelector('.sr-action-btn'));
  const error = q('.sr-inspect .sr-notice--error');
  assert.ok(error, 'inspection error rendered');
  assert.equal(error.getAttribute('role'), 'alert');
  assert.ok(error.textContent.includes('live document is untouched'), 'states no side effects');
  // The other snapshot still inspects cleanly:
  await click(entries[0].querySelector('.sr-action-btn'));
  await click(entries[1].querySelector('.sr-action-btn'));
  assert.ok(q('[aria-label="Snapshot inspection (read-only)"]'), 'valid snapshot inspectable');
  await mounted.unmount();
});

// ─────────────────────────────────────────────────────────────────────────────
// summary
// ─────────────────────────────────────────────────────────────────────────────
console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) {
  console.error('FAILED CHECKS: see lines above.');
  process.exit(1);
}
process.exit(0);
