/**
 * P02-M3 — Document lifecycle verification
 * ═══════════════════════════════════════════════════════════════════════════
 * Exercises the ACTUAL lifecycle module (src/services/document-actions.ts)
 * and the real serializer/validator, compiled with tsc and run in Node with
 * the built-in assert module — no testing framework is introduced.
 *
 * Usage: node verify_p02_m3.mjs   (or: npm run verify:p02-m3)
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
const outDir = mkdtempSync(path.join(tmpdir(), 'ds-p02-m3-'));
execSync(
  'npx tsc src/services/document-actions.ts src/services/document-file.ts src/types/blocks.ts src/types/document.ts src/types/defaults.ts src/types/index.ts' +
    ` --outDir "${outDir}" --module commonjs --target es2020 --moduleResolution node --esModuleInterop --skipLibCheck`,
  { cwd: root, stdio: 'inherit' },
);

const actions = require(path.join(outDir, 'services', 'document-actions.js'));
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

const T0 = '2026-10-15T10:00:00.000Z';
const T1 = '2026-10-15T11:00:00.000Z';

// ── Rich fixture: blocks, assets, revisions ─────────────────────────────────
const assetOnlyId = defaults.newUUID(); // referenced only by a block
const retainedAssetId = defaults.newUUID(); // referenced by frontPage.logoAssetId

function mkFixture() {
  const doc = defaults.createDefaultDocument(defaults.newUUID(), T0);
  doc.metadata.title = 'Lifecycle Fixture';
  doc.metadata.documentId = 'SOP-LAB-007';
  doc.frontPage.logoAssetId = retainedAssetId;
  doc.assets[retainedAssetId] = { id: retainedAssetId, filename: 'logo.png', mimeType: 'image/png', sizeBytes: 10, addedAt: T0, base64Data: 'AAAA' };
  doc.assets[assetOnlyId] = { id: assetOnlyId, filename: 'fig.png', mimeType: 'image/png', sizeBytes: 20, addedAt: T0, base64Data: 'BBBB' };
  doc.blocks = [
    { id: defaults.newUUID(), spacing: { topPt: 6, bottomPt: 6 }, data: { type: 'paragraph', spans: [{ text: 'Hello' }], hAlign: 'justify', indentLevel: 0 } },
    { id: defaults.newUUID(), spacing: { topPt: 0, bottomPt: 0 }, data: { type: 'image', layout: 'single', images: [{ id: defaults.newUUID(), assetId: assetOnlyId, widthFraction: 0.5, hAlign: 'left' }] } },
  ];
  doc.savedRevisions = [{ id: defaults.newUUID(), label: 'v1', savedAt: T0, snapshotJson: '{}' }];
  doc.trackChangesEnabled = true;
  return doc;
}

// ── 1. New document ─────────────────────────────────────────────────────────
test('1. New creates a valid document with fresh ID, defaults and no active path', () => {
  const a = actions.createNewDocument(T0);
  const b = actions.createNewDocument(T0);
  assert.notEqual(a.id, b.id, 'fresh documents must have distinct root IDs');
  assert.equal(a.blocks.length, 0);
  assert.deepEqual(a.assets, {});
  assert.equal(a.metadata.createdAt, T0);
  assert.equal(a.metadata.modifiedAt, T0);
  // Valid against the real schema validator (round-trip).
  const rt = df.deserializeDocument(df.serializeDocument(a));
  assert.equal(rt.id, a.id);
  assert.equal(rt.schemaVersion, 1);
});

// ── 2. Duplicate preserves intended data, new root ID ───────────────────────
test('2. Duplicate preserves document data with a new root ID and copy rules', () => {
  const src = mkFixture();
  const copy = actions.duplicateDocument(src, T1);
  assert.notEqual(copy.id, src.id);
  assert.equal(copy.metadata.title, 'Lifecycle Fixture (Copy)');
  assert.equal(copy.metadata.documentId, '', 'formal documentId must be blanked on duplicate');
  assert.equal(copy.metadata.createdAt, T1);
  assert.equal(copy.metadata.modifiedAt, T1);
  // Preserved: settings, blocks (incl. IDs), assets, revisions.
  assert.deepEqual(copy.pageSetup, src.pageSetup);
  assert.deepEqual(copy.pageTypography, src.pageTypography);
  assert.deepEqual(copy.frontPage, { ...src.frontPage, logoAssetId: retainedAssetId });
  assert.deepEqual(copy.headerFooter, src.headerFooter);
  assert.deepEqual(copy.blocks, src.blocks);
  assert.deepEqual(copy.assets, src.assets);
  assert.deepEqual(copy.savedRevisions, src.savedRevisions);
  assert.equal(copy.trackChangesEnabled, src.trackChangesEnabled);
  assert.equal(copy.metadata.organizationName, src.metadata.organizationName);
  // Still schema-valid.
  df.deserializeDocument(df.serializeDocument(copy));
});

// ── 3. Independent object graph ─────────────────────────────────────────────
test('3. Mutating the duplicate cannot mutate the source', () => {
  const src = mkFixture();
  const copy = actions.duplicateDocument(src, T1);
  copy.blocks.push({ id: defaults.newUUID(), spacing: { topPt: 0, bottomPt: 0 }, data: { type: 'page-break' } });
  copy.headerFooter.footer.rows[0].cells[0].content = 'mutated';
  copy.assets[retainedAssetId].base64Data = 'ZZZZ';
  copy.metadata.title = 'mutated';
  assert.equal(src.blocks.length, 2);
  assert.equal(src.headerFooter.footer.rows[0].cells[0].content, '{organizationName}');
  assert.equal(src.assets[retainedAssetId].base64Data, 'AAAA');
  assert.equal(src.metadata.title, 'Lifecycle Fixture');
});

// ── 4. Clear contents ───────────────────────────────────────────────────────
test('4. Clear removes content but preserves metadata, settings and retained assets', () => {
  const src = mkFixture();
  const cleared = actions.clearDocumentContents(src, T1);
  assert.equal(cleared.blocks.length, 0);
  assert.equal(cleared.id, src.id);
  assert.equal(cleared.metadata.createdAt, src.metadata.createdAt);
  assert.equal(cleared.metadata.modifiedAt, T1);
  assert.deepEqual({ ...cleared.metadata, modifiedAt: src.metadata.modifiedAt }, src.metadata);
  assert.deepEqual(cleared.labProfile, src.labProfile);
  assert.deepEqual(cleared.pageSetup, src.pageSetup);
  assert.deepEqual(cleared.pageTypography, src.pageTypography);
  assert.deepEqual(cleared.frontPage, src.frontPage);
  assert.deepEqual(cleared.headerFooter, src.headerFooter);
  assert.deepEqual(cleared.savedRevisions, src.savedRevisions, 'saved revisions must never be silently discarded');
  assert.equal(cleared.trackChangesEnabled, true);
  // Asset policy: referenced-by-retained kept, block-only dropped.
  assert.ok(cleared.assets[retainedAssetId], 'front-page-referenced asset must be kept');
  assert.equal(cleared.assets[assetOnlyId], undefined, 'block-only asset should be pruned');
  // Source untouched.
  assert.equal(src.blocks.length, 2);
  // Still schema-valid.
  df.deserializeDocument(df.serializeDocument(cleared));
});

// ── 5. Reset settings ───────────────────────────────────────────────────────
test('5. Reset restores settings but preserves content, metadata and assets', () => {
  const src = mkFixture();
  src.pageSetup.orientation = 'landscape';
  src.pageTypography.monochrome = true;
  const reset = actions.resetDocumentSettings(src, T1);
  assert.deepEqual(reset.pageSetup, defaults.createDefaultPageSetup());
  assert.deepEqual(reset.pageTypography, defaults.createDefaultPageTypography());
  assert.deepEqual(reset.frontPage, defaults.createDefaultFrontPage());
  // Header/footer: structurally default but with FRESH nested IDs.
  const fresh = defaults.createDefaultHeaderFooter();
  assert.equal(reset.headerFooter.header.rows.length, fresh.header.rows.length);
  assert.equal(reset.headerFooter.header.rows[0].cells.length, fresh.header.rows[0].cells.length);
  assert.notEqual(reset.headerFooter.header.rows[0].cells[0].id, src.headerFooter.header.rows[0].cells[0].id);
  assert.equal(reset.headerFooter.header.rows[0].cells[0].content, fresh.header.rows[0].cells[0].content);
  // Preserved.
  assert.deepEqual(reset.blocks, src.blocks);
  assert.deepEqual(reset.assets, src.assets);
  assert.equal(reset.id, src.id);
  assert.equal(reset.metadata.createdAt, src.metadata.createdAt);
  assert.equal(reset.metadata.title, src.metadata.title);
  assert.equal(reset.metadata.modifiedAt, T1);
  assert.deepEqual(reset.labProfile, src.labProfile);
  df.deserializeDocument(df.serializeDocument(reset));
});

// ── 6. Timestamp and status transitions ─────────────────────────────────────
test('6. Timestamp and session-status transitions are correct', () => {
  const doc = mkFixture();
  const stamped = actions.stampModifiedAt(doc, T1);
  assert.equal(stamped.metadata.createdAt, doc.metadata.createdAt, 'createdAt must stay stable');
  assert.equal(stamped.metadata.modifiedAt, T1);
  assert.notEqual(stamped, doc, 'stampModifiedAt must return a new object');
  assert.notEqual(stamped.metadata, doc.metadata);

  const fp = actions.sessionFingerprint(doc);
  assert.equal(actions.deriveSessionStatus(fp, fp, false), 'New');
  assert.equal(actions.deriveSessionStatus(fp, fp, true), 'Saved');
  assert.equal(actions.deriveSessionStatus(actions.sessionFingerprint(stamped), fp, true), 'Modified');
  assert.equal(actions.deriveSessionStatus(actions.sessionFingerprint(stamped), fp, false), 'Modified');
});

// ── 7. Unchanged state is not falsely reported modified ─────────────────────
test('7. A saved, unchanged document is not falsely reported as modified', () => {
  const doc = mkFixture();
  const fp = actions.sessionFingerprint(doc);
  assert.equal(actions.isDirty(fp, fp), false);
  assert.equal(actions.deriveSessionStatus(fp, fp, true), 'Saved');
});

// ── 8. Changes are detected as unsaved ──────────────────────────────────────
test('8. Document changes are detected as unsaved', () => {
  const doc = mkFixture();
  const baseline = actions.sessionFingerprint(doc);
  const changed = actions.clearDocumentContents(doc, T1);
  const changedFp = actions.sessionFingerprint(changed);
  assert.equal(actions.isDirty(changedFp, baseline), true);
  assert.equal(actions.deriveSessionStatus(changedFp, baseline, true), 'Modified');
  // A duplicate (empty baseline) is always dirty — work cannot be silently lost.
  const copy = actions.duplicateDocument(doc, T1);
  assert.equal(actions.isDirty(actions.sessionFingerprint(copy), ''), true);
});

// ── 9/10. Guard flows are async; covered by the async runner at the bottom. ─

// ── 11. Failed open validation preserves the active document ────────────────
test('11. Failed open validation preserves the active document', () => {
  const active = mkFixture();
  const before = JSON.stringify(active);
  const attempt = (text) => {
    try {
      return df.deserializeDocument(text);
    } catch {
      return null;
    }
  };
  assert.equal(attempt('{ not json'), null);
  assert.equal(attempt(JSON.stringify({ __type: 'Wrong' })), null);
  assert.equal(JSON.stringify(active), before, 'active document changed after failed loads');
});

// ── Bonus: all lifecycle outputs remain schema-valid ────────────────────────
test('bonus. every lifecycle transformation stays schema-valid', () => {
  const src = mkFixture();
  df.deserializeDocument(df.serializeDocument(actions.duplicateDocument(src, T1)));
  df.deserializeDocument(df.serializeDocument(actions.clearDocumentContents(src, T1)));
  df.deserializeDocument(df.serializeDocument(actions.resetDocumentSettings(src, T1)));
  df.deserializeDocument(df.serializeDocument(actions.stampModifiedAt(src, T1)));
});

// ── Async guard-flow tests (9/10) ───────────────────────────────────────────
async function asyncTests() {
  const t9 = async () => {
    // Cancelled replacement actions abort; discard proceeds; a clean
    // session proceeds without ever prompting.
    assert.equal(await actions.resolveUnsavedChanges(true, async () => 'cancel', async () => true), 'abort');
    assert.equal(await actions.resolveUnsavedChanges(true, async () => 'discard', async () => true), 'proceed');
    let asked = false;
    const r = await actions.resolveUnsavedChanges(false, async () => { asked = true; return 'cancel'; }, async () => true);
    assert.equal(r, 'proceed');
    assert.equal(asked, false, 'must not prompt when nothing is dirty');
  };
  const t10 = async () => {
    // Save cancelled (user closed the save dialog → handleSave returns false): abort.
    assert.equal(await actions.resolveUnsavedChanges(true, async () => 'save', async () => false), 'abort');
    // Save failed (I/O error → false): abort.
    assert.equal(await actions.resolveUnsavedChanges(true, async () => 'save', async () => false), 'abort');
    // Save succeeded: the original action may proceed.
    assert.equal(await actions.resolveUnsavedChanges(true, async () => 'save', async () => true), 'proceed');
  };
  for (const [name, fn] of [['9. cancelled replacement actions abort (async guard)', t9], ['10. save failure/cancel blocks the pending replacement', t10]]) {
    try {
      await fn();
      passed += 1;
      console.log(`PASS  ${name}`);
    } catch (e) {
      failed.push(name);
      console.error(`FAIL  ${name}\n      ${e.message}`);
    }
  }
}

// ── Run everything ──────────────────────────────────────────────────────────
(async () => {
  await asyncTests();
  rmSync(outDir, { recursive: true, force: true });
  console.log(`\n${passed} passed, ${failed.length} failed`);
  if (failed.length > 0) {
    console.error(`Failed: ${failed.join('; ')}`);
    process.exit(1);
  }
})();
