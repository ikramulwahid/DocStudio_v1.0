/**
 * P02-M5 — Document metadata panel editing verification
 * ═══════════════════════════════════════════════════════════════════════════
 * Exercises the ACTUAL modules behind the Document Information panel:
 *   • src/services/metadata-fields.ts  (field specs + normalization)
 *   • src/services/document-actions.ts (updateDocumentMetadata + lifecycle)
 *   • src/services/document-file.ts    (serialize/deserialize round-trip)
 * compiled with tsc and run in Node with the built-in assert module —
 * no testing framework is introduced.
 *
 * The React panel itself binds controlled inputs directly to
 * `activeDocument.metadata`; test 8 asserts the exact values those inputs
 * read (`metadata[key] ?? ''`) after a save → reopen cycle, and the
 * in-app manual test (recorded in the roadmap) covers the live controls.
 *
 * Usage: node verify_p02_m5.mjs   (or: npm run verify:p02-m5)
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
const outDir = mkdtempSync(path.join(tmpdir(), 'ds-p02-m5-'));
execSync(
  'npx tsc src/services/document-actions.ts src/services/document-file.ts src/services/metadata-fields.ts' +
    ' src/types/blocks.ts src/types/document.ts src/types/defaults.ts src/types/index.ts' +
    ` --outDir "${outDir}" --module commonjs --target es2020 --moduleResolution node --esModuleInterop --skipLibCheck`,
  { cwd: root, stdio: 'inherit' },
);

const actions = require(path.join(outDir, 'services', 'document-actions.js'));
const df = require(path.join(outDir, 'services', 'document-file.js'));
const defaults = require(path.join(outDir, 'types', 'defaults.js'));
const fields = require(path.join(outDir, 'services', 'metadata-fields.js'));

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
async function testAsync(name, fn) {
  try {
    await fn();
    passed += 1;
    console.log(`PASS  ${name}`);
  } catch (e) {
    failed.push(name);
    console.error(`FAIL  ${name}\n      ${e.message}`);
  }
}

const T0 = '2026-10-15T10:00:00.000Z';
const T1 = '2026-10-15T11:00:00.000Z';
const T2 = '2026-10-16T09:30:00.000Z';

/** Document with a richly populated metadata object. */
function mkFixture() {
  const doc = defaults.createDefaultDocument(defaults.newUUID(), T0);
  doc.metadata = {
    ...doc.metadata,
    subtitle: 'Round-trip subtitle',
    issueNumber: 'Issue 2',
    issueDate: '2026-09-01',
    documentHolder: 'A. Holder',
    revisionLabel: 'v2.1',
    amendmentNumber: 'A1',
    effectiveDate: '2026-10-01',
    reviewDate: '2027-09-01',
    documentType: 'Quality Manual',
    preparedBy: 'P. Author',
    reviewedBy: 'R. Reviewer',
    approvedBy: 'A. Approver',
    department: 'Quality Assurance',
    applicableStandard: 'ISO/IEC 17025:2017',
    clauseReferences: 'Clause 7.2, 7.7',
    supersedes: 'SOP-LAB-001 (Rev 2)',
    customFields: [{ id: defaults.newUUID(), label: 'Project Code', value: 'PRJ-42' }],
  };
  return doc;
}

/** Metadata compared as serialized JSON (drops undefined-vs-missing nuance). */
const jsonMeta = (meta) => JSON.parse(JSON.stringify(meta));

// ── Coverage guard: no schema-supported field may be silently omitted ───────
test('0. field specs cover every editable DocumentMetadata key exactly once', () => {
  const specKeys = fields.METADATA_FIELD_SPECS.map((s) => s.key);
  // The full key list of DocumentMetadata (schema v1), asserted against a
  // real default + fixture object so it cannot drift from the schema.
  const allKeys = [
    'title', 'subtitle', 'organizationName', 'documentId', 'status',
    'createdAt', 'modifiedAt', 'issueNumber', 'issueDate', 'documentHolder',
    'documentType', 'revisionLabel', 'amendmentNumber', 'effectiveDate', 'reviewDate',
    'preparedBy', 'reviewedBy', 'approvedBy', 'department', 'applicableStandard',
    'clauseReferences', 'supersedes', 'customFields',
  ];
  const sample = defaults.createDefaultMetadata(T0);
  const fixture = mkFixture();
  for (const key of allKeys) {
    assert.ok(key in sample || key in fixture.metadata, `schema key missing from fixtures: ${key}`);
  }

  const editable = allKeys.filter((k) => k !== 'createdAt' && k !== 'modifiedAt' && k !== 'customFields');
  assert.deepEqual([...specKeys].sort(), [...editable].sort(), 'specs must cover every editable key');
  assert.equal(new Set(specKeys).size, specKeys.length, 'no duplicate specs');

  // Required project_details.md §6 fields present and non-optional:
  for (const key of ['title', 'subtitle', 'organizationName', 'documentId', 'status']) {
    const spec = fields.METADATA_FIELD_SPECS.find((s) => s.key === key);
    assert.ok(spec, `required field spec missing: ${key}`);
    assert.equal(spec.optional, false, `${key} must be non-optional`);
  }
});

// ── 1. Each required field updates the authoritative document ───────────────
test('1. required metadata fields each update the authoritative document', () => {
  const base = mkFixture();
  const cases = [
    ['title', 'New Title'],
    ['subtitle', 'New Subtitle'],
    ['organizationName', 'New Lab'],
    ['documentId', 'SOP-X-999'],
    ['status', 'Approved'],
  ];
  for (const [key, value] of cases) {
    const next = actions.updateDocumentMetadata(base, { [key]: value }, T1);
    assert.notEqual(next, base, 'a real change must return a new document');
    assert.equal(next.metadata[key], value, `${key} updated`);
    assert.notEqual(base.metadata[key], value, 'source document never mutated');
    // Every OTHER required field untouched (modifiedAt handled by policy):
    for (const [other] of cases) {
      if (other === key) continue;
      assert.equal(next.metadata[other], base.metadata[other], `unrelated ${other} untouched`);
    }
    assert.equal(next.metadata.createdAt, T0, 'createdAt untouched');
  }
});

// ── 2. Editing one field preserves all unrelated metadata ───────────────────
test('2. editing one field preserves all unrelated metadata fields', () => {
  const base = mkFixture();
  const next = actions.updateDocumentMetadata(base, { department: 'Metrology' }, T1);
  const before = jsonMeta(base.metadata);
  const after = jsonMeta(next.metadata);
  const EXPECTED = { ...before, department: 'Metrology', modifiedAt: T1 };
  assert.deepEqual(after, EXPECTED, 'only the edited field and modifiedAt may differ');
});

// ── 3. Edits mark the document Modified ────────────────────────────────────
test('3. a metadata edit marks the document Modified', () => {
  const doc = mkFixture();
  const baseline = actions.sessionFingerprint(doc);
  assert.equal(actions.isDirty(baseline, baseline), false);
  assert.equal(actions.deriveSessionStatus(baseline, baseline, true), 'Saved');

  const edited = actions.updateDocumentMetadata(doc, { title: 'Edited Title' }, T1);
  const fp = actions.sessionFingerprint(edited);
  assert.equal(actions.isDirty(fp, baseline), true, 'fingerprint differs after edit');
  assert.equal(actions.deriveSessionStatus(fp, baseline, true), 'Modified', 'topbar shows Modified');
  assert.equal(actions.deriveSessionStatus(fp, baseline, false), 'Modified', 'Modified even without a file path');
});

// ── 4. Saved + unchanged document is not falsely Modified ───────────────────
test('4. a saved unchanged document does not become falsely Modified', () => {
  // Simulate a successful save: stamp, then the baseline becomes the stamp.
  const doc = mkFixture();
  const stamped = actions.stampModifiedAt(doc, T1);
  const baseline = actions.sessionFingerprint(stamped);

  // Redundant input events (typing the same value back) are true no-ops:
  const sameTitle = actions.updateDocumentMetadata(stamped, { title: stamped.metadata.title }, T2);
  assert.equal(sameTitle, stamped, 'no-op patch returns the SAME reference');
  const sameStatus = actions.updateDocumentMetadata(stamped, { status: stamped.metadata.status }, T2);
  assert.equal(sameStatus, stamped, 're-selecting the same status is a no-op');
  const sameCustom = actions.updateDocumentMetadata(stamped, { customFields: stamped.metadata.customFields }, T2);
  assert.equal(sameCustom, stamped, 'identical customFields array is a no-op');

  const fp = actions.sessionFingerprint(stamped);
  assert.equal(actions.isDirty(fp, baseline), false);
  assert.equal(actions.deriveSessionStatus(fp, baseline, true), 'Saved');
  assert.equal(actions.deriveSessionStatus(fp, baseline, false), 'New');
});

// ── 5. Date created remains stable during metadata editing ──────────────────
test('5. createdAt stays byte-identical across every metadata edit', () => {
  let doc = mkFixture();
  assert.equal(doc.metadata.createdAt, T0);
  doc = actions.updateDocumentMetadata(doc, { title: 'One' }, T1);
  assert.equal(doc.metadata.createdAt, T0);
  doc = actions.updateDocumentMetadata(doc, { approvedBy: 'B. Approver' }, T2);
  assert.equal(doc.metadata.createdAt, T0);
  doc = actions.updateDocumentMetadata(doc, { status: 'Issued' }, T2);
  assert.equal(doc.metadata.createdAt, T0);
  // Direct attempts to patch the timestamps are stripped:
  const attempt = actions.updateDocumentMetadata(doc, { createdAt: '1999-01-01T00:00:00.000Z' }, T2);
  assert.equal(attempt, doc, 'timestamp-only patch is a no-op (stripped)');
  const attempt2 = actions.updateDocumentMetadata(doc, { modifiedAt: '1999-01-01T00:00:00.000Z', title: 'Two' }, T2);
  assert.equal(attempt2.metadata.createdAt, T0, 'createdAt still protected when another field changes');
  assert.equal(attempt2.metadata.modifiedAt, T2, 'modifiedAt comes from the policy, not the patch');
});

// ── 6. Date modified follows the documented policy ──────────────────────────
test('6. modifiedAt updates on real changes only (documented policy)', () => {
  const doc = mkFixture(); // createdAt = modifiedAt = T0
  // No-op → modifiedAt unchanged:
  const noop = actions.updateDocumentMetadata(doc, { title: doc.metadata.title }, T1);
  assert.equal(noop.metadata.modifiedAt, T0, 'no-op does not advance modifiedAt');
  // Real change → modifiedAt = provided now:
  const changed = actions.updateDocumentMetadata(doc, { title: 'Changed' }, T1);
  assert.equal(changed.metadata.modifiedAt, T1, 'real edit stamps modifiedAt');
  // Save path (existing policy) still stamps:
  const saved = actions.stampModifiedAt(changed, T2);
  assert.equal(saved.metadata.modifiedAt, T2, 'save stamps modifiedAt');
});

// ── 7. Serialization round-trip preserves edited values ─────────────────────
test('7. serialize/deserialize preserves edited metadata values', () => {
  const doc = mkFixture();
  const edited = actions.updateDocumentMetadata(
    doc,
    { title: 'Edited Title', issueNumber: 'Issue 9', effectiveDate: '2027-01-15', approvedBy: 'C. Approver' },
    T1,
  );
  const restored = df.deserializeDocument(df.serializeDocument(edited));
  assert.deepEqual(jsonMeta(restored.metadata), jsonMeta(edited.metadata), 'full metadata survives the round-trip');
  assert.equal(restored.metadata.title, 'Edited Title');
  assert.equal(restored.metadata.effectiveDate, '2027-01-15');
});

// ── 8. Save/reopen restores the values the inputs display ───────────────────
test('8. save → reopen restores every value the controlled inputs read', () => {
  const doc = mkFixture();
  const edited = actions.updateDocumentMetadata(doc, { title: 'Reopen Test', documentHolder: 'H. Person' }, T1);
  const savedJson = df.serializeDocument(actions.stampModifiedAt(edited, T2)); // save path
  const reopened = df.deserializeDocument(savedJson); // open path

  // Exactly what the controlled inputs bind: metadata[key] ?? ''
  for (const spec of fields.METADATA_FIELD_SPECS) {
    const shown = reopened.metadata[spec.key] ?? '';
    const expected = edited.metadata[spec.key] ?? '';
    assert.equal(shown, expected, `input for "${spec.key}" restored`);
  }
  assert.equal(reopened.metadata.status, edited.metadata.status, 'status select restored');
  for (const field of reopened.metadata.customFields) {
    const src = edited.metadata.customFields.find((f) => f.id === field.id);
    assert.ok(src, 'custom field restored');
    assert.equal(field.label, src.label);
    assert.equal(field.value, src.value);
  }
});

// ── 9. New and Open replace the displayed metadata ──────────────────────────
test('9. New and Open replace displayed metadata with the right document', () => {
  const doc = mkFixture();
  const edited = actions.updateDocumentMetadata(doc, { title: 'Edited Title', documentId: 'EDITED-1' }, T1);

  // New (App.handleNew) → defaults, not the edited values:
  const fresh = actions.createNewDocument(T2);
  assert.equal(fresh.metadata.title, 'Untitled Document', 'New shows default title');
  assert.notEqual(fresh.metadata.documentId, 'EDITED-1');

  // Open (App.handleOpen) → the deserialized file's values, not the edited ones:
  const other = mkFixture();
  other.metadata.title = 'Other Document';
  other.metadata.documentId = 'OTHER-42';
  const opened = df.deserializeDocument(df.serializeDocument(other));
  assert.equal(opened.metadata.title, 'Other Document', 'Open shows the file values');
  assert.equal(opened.metadata.documentId, 'OTHER-42');
  assert.notEqual(opened.metadata.title, edited.metadata.title, 'edited values are gone after replacement');
});

// ── 10. Duplicate / clear / reset / unsaved protection unaffected ───────────
test('10. duplicate, clear, reset and the unsaved guard still behave correctly', () => {
  const doc = mkFixture();
  const edited = actions.updateDocumentMetadata(doc, { title: 'Guarded' }, T1);

  // Duplicate: copy rules preserved; source untouched.
  const copy = actions.duplicateDocument(edited, T2);
  assert.equal(copy.metadata.title, 'Guarded (Copy)');
  assert.equal(copy.metadata.documentId, '');
  assert.equal(copy.metadata.department, edited.metadata.department, 'duplicate keeps metadata');
  assert.equal(edited.metadata.title, 'Guarded', 'source unchanged by duplicate');

  // Clear: metadata preserved (modifiedAt stamped by policy).
  const cleared = actions.clearDocumentContents(edited, T2);
  assert.equal(cleared.metadata.title, 'Guarded');
  assert.equal(cleared.metadata.applicableStandard, 'ISO/IEC 17025:2017');
  assert.equal(cleared.metadata.modifiedAt, T2);

  // Reset: metadata preserved.
  const reset = actions.resetDocumentSettings(edited, T2);
  assert.equal(reset.metadata.title, 'Guarded');
  assert.deepEqual(jsonMeta(reset.metadata.customFields), jsonMeta(edited.metadata.customFields));

  // Unsaved guard on a metadata-only edit:
  const dirty = actions.isDirty(actions.sessionFingerprint(edited), actions.sessionFingerprint(doc));
  assert.equal(dirty, true, 'metadata edits are protected by the guard');
});

// ── 10b. Unsaved-change guard decisions around metadata edits ───────────────
await testAsync('10b. unsaved guard: cancel/discard/save outcomes on metadata edits', async () => {
  assert.equal(await actions.resolveUnsavedChanges(false, async () => 'cancel', async () => true), 'proceed');
  assert.equal(await actions.resolveUnsavedChanges(true, async () => 'cancel', async () => true), 'abort');
  assert.equal(await actions.resolveUnsavedChanges(true, async () => 'discard', async () => false), 'proceed');
  assert.equal(await actions.resolveUnsavedChanges(true, async () => 'save', async () => false), 'abort', 'failed save blocks replacement');
  assert.equal(await actions.resolveUnsavedChanges(true, async () => 'save', async () => true), 'proceed');
});

// ── 11. Normalization and date handling are deterministic ───────────────────
test('11. date/input normalization and status options are deterministic', () => {
  // Date picker mapping:
  assert.equal(fields.toDatePickerValue(undefined), '');
  assert.equal(fields.toDatePickerValue('2026-09-01'), '2026-09-01');
  assert.equal(fields.toDatePickerValue('2026-09-01T00:00:00.000Z'), '2026-09-01', 'full ISO → date part');
  assert.equal(fields.toDatePickerValue('garbage'), '', 'unparseable → empty picker');

  const optionalDate = fields.METADATA_FIELD_SPECS.find((s) => s.key === 'issueDate');
  const optionalText = fields.METADATA_FIELD_SPECS.find((s) => s.key === 'approvedBy');
  const requiredText = fields.METADATA_FIELD_SPECS.find((s) => s.key === 'title');
  const optionalTextMulti = fields.METADATA_FIELD_SPECS.find((s) => s.key === 'clauseReferences');

  // Empty optional → undefined (type-then-clear returns to a clean value):
  assert.equal(fields.normalizeFieldValue(optionalDate, ''), undefined);
  assert.equal(fields.normalizeFieldValue(optionalText, ''), undefined);
  assert.equal(fields.normalizeFieldValue(optionalTextMulti, ''), undefined);
  // Required always keeps a string:
  assert.equal(fields.normalizeFieldValue(requiredText, ''), '');
  assert.equal(fields.normalizeFieldValue(requiredText, 'X'), 'X');
  // Non-empty date outside YYYY-MM-DD passes through unchanged (never dropped):
  assert.equal(fields.normalizeFieldValue(optionalDate, 'not-a-date'), 'not-a-date');
  assert.equal(fields.normalizeFieldValue(optionalDate, '2027-01-15'), '2027-01-15');

  // Clearing a never-set optional field is a true no-op at the document level:
  const doc = mkFixture();
  delete doc.metadata.issueNumber;
  assert.equal(actions.updateDocumentMetadata(doc, { issueNumber: undefined }, T1), doc, 'absent + undefined = no-op');

  // Status options: presets plus any custom current value:
  const options = fields.statusOptions('My Custom Status');
  assert.deepEqual(options, [...fields.STATUS_PRESETS, 'My Custom Status']);
  assert.deepEqual(fields.statusOptions('Draft'), [...fields.STATUS_PRESETS]);

  // Timestamp display: invalid → raw fallback; valid → readable, ≠ raw ISO.
  assert.equal(fields.formatTimestampForDisplay('not-a-date'), 'not-a-date');
  const shown = fields.formatTimestampForDisplay(T0);
  assert.ok(shown.length > 0 && shown !== T0, 'valid timestamp renders in readable form');
});

// ── 12. Custom (additional) fields edit, add and remove safely ──────────────
test('12. custom field add/edit/remove works and removing a missing row is a no-op', () => {
  const doc = mkFixture();
  const original = doc.metadata.customFields;
  assert.equal(original.length, 1);

  // Add:
  const added = actions.updateDocumentMetadata(
    doc,
    { customFields: [...original, { id: defaults.newUUID(), label: 'Site', value: 'Lab B' }] },
    T1,
  );
  assert.equal(added.metadata.customFields.length, 2, 'field added');
  assert.equal(added.metadata.customFields[0].label, 'Project Code', 'existing row untouched');

  // Edit a row:
  const edited = actions.updateDocumentMetadata(
    added,
    { customFields: added.metadata.customFields.map((f, i) => (i === 1 ? { ...f, value: 'Lab C' } : f)) },
    T2,
  );
  assert.equal(edited.metadata.customFields[1].value, 'Lab C');
  assert.equal(edited.metadata.customFields[0].value, 'PRJ-42', 'other rows untouched');

  // Remove:
  const removed = actions.updateDocumentMetadata(
    edited,
    { customFields: edited.metadata.customFields.filter((_, i) => i !== 0) },
    T2,
  );
  assert.equal(removed.metadata.customFields.length, 1);
  assert.equal(removed.metadata.customFields[0].label, 'Site');

  // Removing a row that does not exist yields an identical array → no-op:
  const filtered = removed.metadata.customFields.filter((_, i) => i !== 5);
  assert.equal(actions.updateDocumentMetadata(removed, { customFields: filtered }, T2), removed, 'no-op removal returns same reference');
});

// ── Summary ────────────────────────────────────────────────────────────────
console.log(`\n${passed} passed, ${failed.length} failed`);
if (failed.length > 0) {
  console.error(`Failed: ${failed.join(' | ')}`);
  process.exit(1);
}
if (passed < 14) {
  console.error(`Expected 14 tests, only ${passed} ran`);
  process.exit(1);
}
rmSync(outDir, { recursive: true, force: true });
