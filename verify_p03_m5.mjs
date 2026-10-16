/**
 * P03-M5 — Custom template persistence
 * ═══════════════════════════════════════════════════════════════════════════
 * Exercises the ACTUAL modules:
 *   • src/services/user-template-library.ts   (pure identity/import/load-store policies)
 *   • src/services/template-file.ts           (.dstemplate serialize/validate)
 *   • src/services/template-customization.ts  (draft operations)
 *   • src/services/template-chooser.ts        (search/filter, guarded selection)
 *   • src/services/template-library/index.ts  (authoritative built-in catalog)
 *   • src/services/template-instantiation.ts  (precedence, deep-copy/remint)
 *   • src/services/template-samples.ts        (retained deterministic example SOP)
 *   • src/services/lab-profile.ts             (profile normalize/serialize)
 *   • src/services/document-file.ts           (.docstudio serialize/validate)
 *   • src/services/document-actions.ts        (guard/lifecycle smoke)
 * compiled with tsc and run in Node with the built-in assert module —
 * no testing framework is introduced.  Storage is a TEMPORARY-DIRECTORY
 * adapter implementing the real `UserTemplateStorage` contract (atomic
 * temp+rename writes) — tests never touch a real user's application-data
 * files, and the Tauri adapter/dialog modules are covered by the live
 * `npx tauri dev` review rather than this Node suite.
 *
 * Coverage (mirrors the P03-M5 checklist; item 18 is live-tested only):
 *   1. Existing `.dstemplate` valid round-trip remains stable.
 *   2. Save built-in/customized draft → distinct user template, fresh identity.
 *   3. Saving an existing user template preserves ID and createdAt, updates
 *      updatedAt; mismatched/invalid updates are rejected.
 *   4. Persistent save/load/reopen returns equivalent validated templates.
 *   5. Entries survive reconstruction of the store (fresh-session simulation).
 *   6. Exported `.dstemplate` can be imported and reused later.
 *   7. Imported built-in identity/origin is normalized and can never replace
 *      a canonical built-in.
 *   8. Invalid JSON, invalid schema, unsupported schema version and
 *      unreadable files produce safe, actionable errors (corrupt files are
 *      skipped, never deleted; valid entries survive).
 *   9. Duplicate-ID and duplicate-import policies work as documented
 *      (replace/copy/cancel; first-file-wins for on-disk id duplicates).
 *  10. Write failure does not silently corrupt or remove a previously valid
 *      saved template (atomic-write contract).
 *  11. Canonical built-in catalog remains unchanged after save/import.
 *  12. A customized P03-M4 draft is saved with its section order, names,
 *      descriptions, prompts and content preserved.
 *  13. User-template entries work with existing search/category/preview
 *      chooser behavior (and per-template drafts still resolve).
 *  14. Creating multiple documents from one user template preserves source
 *      isolation and fresh document/block IDs.
 *  15. Laboratory Profile identity precedence remains unchanged.
 *  16. Cancelled and malformed imports leave the library and drafts unchanged.
 *  17. Existing blank-document behavior and unsaved-changes guard unchanged.
 *  18. Accessible save/import controls, validation messages and keyboard/
 *      focus behavior — LIVE-TESTED in `npx tauri dev` (not runnable here).
 *  19. Store hygiene: absent directory = empty library; stray temp files are
 *      ignored; empty save names are rejected before any write.
 *
 * Usage: node verify_p03_m5.mjs   (or: npm run verify:p03-m5)
 */

import { execSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { existsSync, promises as fsp } from 'node:fs';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';

const require = createRequire(import.meta.url);
const root = path.dirname(new URL(import.meta.url).pathname.replace(/^\//, ''));

// ── Compile the real modules to CommonJS in a temp dir ──────────────────────
const outDir = mkdtempSync(path.join(tmpdir(), 'ds-p03-m5-'));
execSync(
  'npx tsc src/services/user-template-library.ts' +
    ' src/services/template-file.ts src/services/template-customization.ts' +
    ' src/services/template-chooser.ts src/services/template-instantiation.ts' +
    ' src/services/template-library/index.ts src/services/template-samples.ts' +
    ' src/services/lab-profile.ts src/services/document-file.ts' +
    ' src/services/document-actions.ts' +
    ' src/types/template.ts src/types/template-defaults.ts src/types/lab-profile.ts' +
    ' src/types/blocks.ts src/types/document.ts src/types/defaults.ts src/types/index.ts' +
    ` --outDir "${outDir}" --module commonjs --target es2020 --moduleResolution node --esModuleInterop --skipLibCheck`,
  { cwd: root, stdio: 'inherit' },
);

const utl = require(path.join(outDir, 'services', 'user-template-library.js'));
const tplFile = require(path.join(outDir, 'services', 'template-file.js'));
const customization = require(path.join(outDir, 'services', 'template-customization.js'));
const chooser = require(path.join(outDir, 'services', 'template-chooser.js'));
const inst = require(path.join(outDir, 'services', 'template-instantiation.js'));
const library = require(path.join(outDir, 'services', 'template-library', 'index.js'));
const labProfile = require(path.join(outDir, 'services', 'lab-profile.js'));
const docFile = require(path.join(outDir, 'services', 'document-file.js'));
const docActions = require(path.join(outDir, 'services', 'document-actions.js'));
const tplTypes = require(path.join(outDir, 'types', 'template.js'));
const lpTypes = require(path.join(outDir, 'types', 'lab-profile.js'));

const {
  UserTemplateError,
  applyImportPlan,
  createUserTemplateFrom,
  isUserTemplate,
  loadUserTemplates,
  normalizeImportedTemplate,
  planImport,
  saveTemplateToStorage,
  templateContentFingerprint,
  updateUserTemplate,
  userTemplateFileName,
} = utl;
const { deserializeTemplate, serializeTemplate, validateTemplate } = tplFile;
const {
  DEFAULT_NEW_SECTION_NAME,
  addSection,
  createTemplateDraft,
  draftFor,
  isTemplateDraftModified,
  moveSection,
  renameSection,
  updateSectionDescription,
  updateSectionPrompt,
  withDraftResult,
} = customization;
const { BLANK_CHOICE_ID, buildChoiceList, filterTemplates, resolveChooserSelection } = chooser;
const { instantiateTemplate } = inst;
const { getBuiltinCatalogTemplates } = library;
const { normalizeLabProfile } = labProfile;
const { validateDocument } = docFile;
const { createEmptyLabProfile } = lpTypes;

// ── Fixtures ────────────────────────────────────────────────────────────────
const T0 = '2026-10-16T14:00:00.000Z';
const T1 = '2026-10-16T15:00:00.000Z';
const T2 = '2026-10-16T16:00:00.000Z';

const EXAMPLE_SOP_ID = 'builtin.sops-work-instructions.example-sop';
const QP_ID = 'builtin.management-system.quality-policy';

const catalog = () => getBuiltinCatalogTemplates(); // deep-clones per call
const byId = (id) => {
  const tpl = catalog().find((t) => t.id === id);
  assert.ok(tpl, `catalog contains ${id}`);
  return tpl;
};
const emptyProfile = () => createEmptyLabProfile();

// ── Temporary-directory storage adapter (implements UserTemplateStorage) ────
function createFsAdapter(dir) {
  return {
    async ensureDirectory() {
      await fsp.mkdir(dir, { recursive: true });
    },
    async list() {
      const entries = await fsp.readdir(dir, { withFileTypes: true });
      return entries.filter((e) => e.isFile()).map((e) => e.name);
    },
    async read(name) {
      return fsp.readFile(path.join(dir, name), 'utf8');
    },
    async write(name, text) {
      // Atomic semantics mirroring the Tauri adapter: temp file + rename.
      const tmp = path.join(dir, `${name}.tmp`);
      await fsp.writeFile(tmp, text, 'utf8');
      await fsp.rename(tmp, path.join(dir, name));
    },
    async remove(name) {
      await fsp.rm(path.join(dir, name), { force: true });
    },
  };
}

const storeDir = mkdtempSync(path.join(tmpdir(), 'ds-p03-m5-lib-'));
const storage = createFsAdapter(storeDir);
const fileIn = (name) => path.join(storeDir, name);

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
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// 1. Existing `.dstemplate` valid round-trip remains stable
// ═══════════════════════════════════════════════════════════════════════════
await test('1. .dstemplate round-trip remains byte-stable and validated', () => {
  for (const id of [EXAMPLE_SOP_ID, QP_ID]) {
    const source = byId(id);
    const text = serializeTemplate(source);
    const back = deserializeTemplate(text);
    assert.deepEqual(back, source, 'round-trip is content-identical');
    assert.equal(serializeTemplate(back), text, 'double round-trip is byte-stable');
    validateTemplate(back);
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// 2. Save built-in/customized draft → distinct user template, fresh identity
// ═══════════════════════════════════════════════════════════════════════════
await test('2. saving a built-in or its draft creates an independent user template', () => {
  const source = byId(EXAMPLE_SOP_ID);
  const sourceBefore = JSON.stringify(source);
  const saved = createUserTemplateFrom(source, '  My Example SOP  ', T0);

  assert.notEqual(saved.id, source.id, 'fresh identity');
  assert.equal(saved.origin, 'user');
  assert.equal(saved.name, 'My Example SOP', 'name is trimmed');
  assert.equal(saved.createdAt, T0);
  assert.equal(saved.updatedAt, T0);
  assert.ok(!tplTypes.isBuiltinTemplateId(saved.id), 'no builtin. prefix');
  assert.ok(isUserTemplate(saved));
  assert.deepEqual(saved.sections, source.sections, 'sections preserved');
  assert.deepEqual(saved.defaults, source.defaults, 'defaults preserved');
  assert.deepEqual(saved.assets, source.assets, 'assets preserved');
  assert.deepEqual(saved.tags, source.tags, 'tags preserved');
  validateTemplate(saved);
  assert.equal(JSON.stringify(source), sourceBefore, 'source untouched');

  // A customized draft saves with its customizations, again independently.
  let draft = createTemplateDraft(byId(QP_ID));
  draft = addSection(draft, 'Lab Addendum').draft;
  const savedDraft = createUserTemplateFrom(draft, 'My QP', T0);
  assert.notEqual(savedDraft.id, draft.id);
  assert.equal(savedDraft.origin, 'user');
  assert.ok(savedDraft.sections.some((s) => s.name === 'Lab Addendum'));
  assert.equal(isTemplateDraftModified(draft, byId(QP_ID)), true);

  // Filename helper is deterministic and extension-correct.
  assert.equal(userTemplateFileName(saved.id), `${saved.id}.dstemplate`);
});

// ═══════════════════════════════════════════════════════════════════════════
// 3. Update preserves id/createdAt, bumps updatedAt; invalid updates rejected
// ═══════════════════════════════════════════════════════════════════════════
await test('3. updating a user template preserves identity and creation time', () => {
  const stored = createUserTemplateFrom(byId(EXAMPLE_SOP_ID), 'My SOP', T0);
  let draft = createTemplateDraft(stored);
  draft = renameSection(draft, draft.sections[0].id, 'Renamed Scope').draft;
  const updated = updateUserTemplate(stored, draft, T1);

  assert.equal(updated.id, stored.id, 'identity preserved');
  assert.equal(updated.createdAt, T0, 'createdAt preserved');
  assert.equal(updated.updatedAt, T1, 'updatedAt bumped');
  assert.equal(updated.sections[0].name, 'Renamed Scope', 'content updated');
  assert.equal(stored.sections[0].name !== 'Renamed Scope', true, 'stored input untouched');

  // A draft with a different id is rejected — identity never changes silently.
  const other = createUserTemplateFrom(byId(QP_ID), 'Other', T0);
  assert.throws(
    () => updateUserTemplate(stored, other, T2),
    (e) => e instanceof UserTemplateError && e.code === 'id-mismatch',
  );
  // Built-in "stored" templates can never be updated (overwriting is impossible).
  assert.throws(
    () => updateUserTemplate(byId(EXAMPLE_SOP_ID), draft, T2),
    (e) => e instanceof UserTemplateError && e.code === 'builtin-identity',
  );
  // Empty names are rejected before anything happens.
  assert.throws(
    () => createUserTemplateFrom(stored, '   ', T2),
    (e) => e instanceof UserTemplateError && e.code === 'empty-name',
  );
});

// ═══════════════════════════════════════════════════════════════════════════
// 4 + 5. Persistent save/load and fresh-session reconstruction
// ═══════════════════════════════════════════════════════════════════════════
await test('4+5. saved templates survive save/load and store reconstruction', async () => {
  // Empty (but existing) directory → empty library, no warnings.
  const emptyDir = mkdtempSync(path.join(tmpdir(), 'ds-p03-m5-empty-'));
  const emptyLoad = await loadUserTemplates(createFsAdapter(emptyDir));
  assert.deepEqual(emptyLoad.templates, []);
  assert.deepEqual(emptyLoad.warnings, []);

  const a = createUserTemplateFrom(byId(EXAMPLE_SOP_ID), 'Session A', T0);
  const b = createUserTemplateFrom(byId(QP_ID), 'Session B', T0);
  await saveTemplateToStorage(storage, a);
  await saveTemplateToStorage(storage, b);

  const loaded = await loadUserTemplates(storage);
  assert.deepEqual(loaded.warnings, []);
  assert.equal(loaded.templates.length, 2);
  const la = loaded.templates.find((t) => t.id === a.id);
  const lb = loaded.templates.find((t) => t.id === b.id);
  assert.deepEqual(la, a, 'stored template equals loaded template');
  assert.deepEqual(lb, b);
  validateTemplate(la);
  validateTemplate(lb);

  // Fresh-session simulation: a brand-new adapter over the same directory
  // (exactly what the app does after a restart) returns the same entries.
  const restarted = await loadUserTemplates(createFsAdapter(storeDir));
  assert.deepEqual(
    restarted.templates.map((t) => t.id).sort(),
    [a.id, b.id].sort(),
    'same templates after reconstruction',
  );

  // Update → load reflects the new version only (in-place, atomic replace).
  const aNext = updateUserTemplate(a, addSection(createTemplateDraft(a), 'Extra').draft, T1);
  await saveTemplateToStorage(storage, aNext);
  const afterUpdate = await loadUserTemplates(storage);
  assert.equal(afterUpdate.templates.length, 2, 'no duplicate entry after update');
  const la2 = afterUpdate.templates.find((t) => t.id === a.id);
  assert.equal(la2.updatedAt, T1);
  assert.ok(la2.sections.some((s) => s.name === 'Extra'));
  assert.equal(la2.createdAt, T0, 'createdAt still preserved across update+reload');
});

// ═══════════════════════════════════════════════════════════════════════════
// 6. Exported `.dstemplate` can be imported and reused later
// ═══════════════════════════════════════════════════════════════════════════
await test('6. export → import round-trip reuses the exported template', async () => {
  // Export: exactly what the manager writes through the native Save dialog.
  const source = createUserTemplateFrom(byId(QP_ID), 'Exported QP', T0);
  await saveTemplateToStorage(storage, source);
  const exportDir = mkdtempSync(path.join(tmpdir(), 'ds-p03-m5-export-'));
  const exportPath = path.join(exportDir, 'Exported QP.dstemplate');
  await fsp.writeFile(exportPath, serializeTemplate(source), 'utf8');

  // Import: read + validate + classify against the current library.
  const before = await loadUserTemplates(storage);
  const imported = deserializeTemplate(await fsp.readFile(exportPath, 'utf8'));
  const plan = planImport(before.templates, imported, T2);
  // The exported file carries its own id and content, and that exact entry
  // is already in the library → 'duplicate' no-op.
  assert.equal(plan.kind, 'duplicate', 're-importing the same export is a no-op');
  assert.equal(applyImportPlan(plan, 'add', T2).status, 'noop');
  const afterDup = await loadUserTemplates(storage);
  assert.equal(afterDup.templates.length, before.templates.length, 'no unbounded duplicates');

  // An EDITED version exported under the same identity (id kept, content
  // changed) is a conflict — never a silent overwrite — and is resolved
  // explicitly via 'replace', then reusable after reload.
  const variant = updateUserTemplate(
    source,
    addSection(createTemplateDraft(source), 'Exported Extra').draft,
    T1,
  );
  const variantPath = path.join(exportDir, 'Exported QP v2.dstemplate');
  await fsp.writeFile(variantPath, serializeTemplate(variant), 'utf8');
  const variantPlan = planImport(
    afterDup.templates,
    deserializeTemplate(await fsp.readFile(variantPath, 'utf8')),
    T2,
  );
  assert.equal(variantPlan.kind, 'conflict', 'same id + changed content is a conflict');
  const applied = applyImportPlan(variantPlan, 'replace', T2);
  assert.equal(applied.status, 'ok');
  assert.equal(applied.template.id, source.id, 'explicit replace keeps the identity');
  await saveTemplateToStorage(storage, applied.template);
  const afterImport = await loadUserTemplates(storage);
  const importedBack = afterImport.templates.find((t) => t.id === applied.template.id);
  assert.ok(importedBack, 'imported template is stored and reusable');
  assert.ok(importedBack.sections.some((s) => s.name === 'Exported Extra'), 'content preserved');
  assert.equal(afterImport.templates.length, before.templates.length, 'replace stayed in-place');
  validateTemplate(importedBack);
});

// ═══════════════════════════════════════════════════════════════════════════
// 7. Imported built-in identity is normalized; built-ins can never be replaced
// ═══════════════════════════════════════════════════════════════════════════
await test('7. imported built-in identity is normalized and cannot shadow a built-in', async () => {
  // A hand-copied built-in FILE: valid content, but builtin id/origin.
  const fakeFile = JSON.parse(serializeTemplate(byId(EXAMPLE_SOP_ID)));
  const before = await loadUserTemplates(storage);
  const catalogBefore = JSON.stringify(catalog());

  const normalized = normalizeImportedTemplate(fakeFile, T2);
  assert.notEqual(normalized.id, EXAMPLE_SOP_ID, 'id re-minted');
  assert.equal(normalized.origin, 'user', 'origin rewritten');
  assert.ok(!tplTypes.isBuiltinTemplateId(normalized.id));
  assert.deepEqual(normalized.sections, byId(EXAMPLE_SOP_ID).sections, 'content preserved');

  const plan = planImport(before.templates, fakeFile, T2);
  assert.equal(plan.kind, 'new');
  const applied = applyImportPlan(plan, 'add', T2);
  assert.equal(applied.status, 'ok');
  await saveTemplateToStorage(storage, applied.template);

  // The stored entry can never be selected AS the built-in, and the
  // canonical catalog is untouched.
  const after = await loadUserTemplates(storage);
  const entry = after.templates.find((t) => t.id === applied.template.id);
  assert.equal(entry.origin, 'user');
  assert.ok(isUserTemplate(entry));
  assert.equal(JSON.stringify(catalog()), catalogBefore, 'canonical catalog unchanged');
  assert.ok(
    catalog().some((t) => t.id === EXAMPLE_SOP_ID && t.origin === 'builtin'),
    'built-in still present and canonical',
  );

  // A stored FILE claiming built-in identity (hand-edited on disk) is
  // skipped with a warning, never surfaced as a user template.
  const spoofPath = fileIn(userTemplateFileName('spoof.builtin.looking'));
  await fsp.writeFile(spoofPath, serializeTemplate(byId(QP_ID)), 'utf8');
  const warned = await loadUserTemplates(storage);
  assert.ok(
    warned.templates.every((t) => t.id !== QP_ID),
    'built-in-identity file never surfaces as a user template',
  );
  assert.ok(warned.warnings.some((w) => w.message.includes('built-in template identity')));
  assert.ok(existsSync(spoofPath), 'skipped file is NOT deleted');
  await fsp.rm(spoofPath, { force: true });
});

// ═══════════════════════════════════════════════════════════════════════════
// 8. Invalid inputs produce safe, actionable errors; corruption is contained
// ═══════════════════════════════════════════════════════════════════════════
await test('8. invalid JSON/version/structure and unreadable files are handled safely', async () => {
  // Direct deserialization failures carry actionable messages + codes.
  assert.throws(
    () => deserializeTemplate('{not json'),
    (e) => e.code === 'invalid-json' && e.message.length > 0,
  );
  assert.throws(
    () => deserializeTemplate(JSON.stringify({ hello: 'world' })),
    (e) => e.code === 'invalid-signature',
  );
  const future = JSON.parse(serializeTemplate(byId(EXAMPLE_SOP_ID)));
  future.schemaVersion = 99;
  assert.throws(
    () => deserializeTemplate(JSON.stringify(future)),
    (e) => e.code === 'unsupported-version' && e.message.includes('newer version'),
  );
  const broken = JSON.parse(serializeTemplate(byId(EXAMPLE_SOP_ID)));
  broken.sections[0].headingLevel = 9;
  assert.throws(
    () => deserializeTemplate(JSON.stringify(broken)),
    (e) => e.code === 'invalid-structure',
  );

  // Stored-file level: corrupt / future-version / unreadable files are
  // skipped with warnings, never deleted, and never lose valid entries.
  const valid = createUserTemplateFrom(byId(QP_ID), 'Survivor', T0);
  const isolatedDir = mkdtempSync(path.join(tmpdir(), 'ds-p03-m5-corrupt-'));
  const isoStorage = createFsAdapter(isolatedDir);
  await saveTemplateToStorage(isoStorage, valid);
  const corruptPath = path.join(isolatedDir, 'aaa-corrupt.dstemplate');
  await fsp.writeFile(corruptPath, '{definitely not json', 'utf8');
  const versionPath = path.join(isolatedDir, 'bbb-future.dstemplate');
  await fsp.writeFile(versionPath, JSON.stringify(future), 'utf8');

  const readFailDir = mkdtempSync(path.join(tmpdir(), 'ds-p03-m5-unread-'));
  const readFailBase = createFsAdapter(readFailDir);
  const victim = createUserTemplateFrom(byId(EXAMPLE_SOP_ID), 'Victim', T0);
  await saveTemplateToStorage(readFailBase, valid);
  await saveTemplateToStorage(readFailBase, victim);
  const unreadable = {
    ...readFailBase,
    async read(name) {
      if (name.includes(victim.id)) throw new Error('EACCES: permission denied');
      return fsp.readFile(path.join(readFailDir, name), 'utf8');
    },
  };

  for (const [label, s] of [
    ['corrupt+future', isoStorage],
    ['unreadable', unreadable],
  ]) {
    const result = await loadUserTemplates(s);
    assert.equal(result.templates.length, 1, `${label}: valid entry still loads`);
    assert.equal(result.templates[0].id, valid.id);
    assert.ok(result.warnings.length > 0, `${label}: warning surfaced`);
    assert.ok(
      result.warnings.every((w) => w.message.length > 0),
      `${label}: warnings are user-facing text`,
    );
  }
  assert.ok(existsSync(corruptPath), 'corrupt file still on disk — never silently deleted');

  // A completely broken store directory (readDir fails) degrades to an
  // empty library plus ONE warning — the chooser never crashes.
  const brokenStore = {
    ...createFsAdapter(isolatedDir),
    async list() {
      throw new Error('dir vanished');
    },
  };
  const degraded = await loadUserTemplates(brokenStore);
  assert.deepEqual(degraded.templates, []);
  assert.equal(degraded.warnings.length, 1);
  assert.ok(degraded.warnings[0].message.includes('unavailable'));
});

// ═══════════════════════════════════════════════════════════════════════════
// 9. Duplicate-ID and duplicate-import policies
// ═══════════════════════════════════════════════════════════════════════════
await test('9. duplicate and conflict import policies behave as documented', async () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'ds-p03-m5-conflict-'));
  const s = createFsAdapter(dir);
  const stored = createUserTemplateFrom(byId(QP_ID), 'Conflict Base', T0);
  await saveTemplateToStorage(s, stored);

  // Same id, different content → 'conflict', resolved only explicitly.
  const incomingRaw = JSON.parse(serializeTemplate(stored));
  incomingRaw.name = 'Different Content';
  const existing = (await loadUserTemplates(s)).templates;
  const plan = planImport(existing, incomingRaw, T2);
  assert.equal(plan.kind, 'conflict');

  // cancel → nothing changes.
  assert.equal(applyImportPlan(plan, 'cancel', T2).status, 'cancelled');
  assert.equal((await loadUserTemplates(s)).templates[0].name, 'Conflict Base');

  // replace → stored id + createdAt preserved, content + updatedAt replaced.
  const replaced = applyImportPlan(plan, 'replace', T2);
  assert.equal(replaced.status, 'ok');
  assert.equal(replaced.template.id, stored.id, 'replace keeps the identity');
  assert.equal(replaced.template.createdAt, T0, 'replace keeps createdAt');
  assert.equal(replaced.template.updatedAt, T2, 'replace stamps updatedAt');
  assert.equal(replaced.template.name, 'Different Content');
  await saveTemplateToStorage(s, replaced.template);
  const afterReplace = await loadUserTemplates(s);
  assert.equal(afterReplace.templates.length, 1, 'replace is in-place, not additive');

  // copy → fresh identity; both entries coexist.
  const copied = applyImportPlan(plan, 'copy', T2);
  assert.equal(copied.status, 'ok');
  assert.notEqual(copied.template.id, stored.id, 'copy gets a fresh identity');
  assert.equal(copied.template.name, 'Different Content');
  await saveTemplateToStorage(s, copied.template);
  const both = await loadUserTemplates(s);
  assert.equal(both.templates.length, 2, 'replace target + copy coexist');

  // Identical content under a different identity → 'duplicate' no-op.
  const dupPlan = planImport(both.templates, JSON.parse(serializeTemplate(copied.template)), T2);
  assert.equal(dupPlan.kind, 'duplicate');

  // Fingerprint sanity: identity/timestamps aside, content decides.
  const reStamped = { ...JSON.parse(serializeTemplate(stored)), createdAt: T2, updatedAt: T2 };
  assert.equal(
    templateContentFingerprint(reStamped),
    templateContentFingerprint(stored),
    'fingerprint ignores identity and timestamps',
  );

  // On-disk id duplicates: two DIFFERENT FILENAMES carrying the same id —
  // first (sorted) file wins, the other is skipped with a warning.
  const dupDir = mkdtempSync(path.join(tmpdir(), 'ds-p03-m5-dupids-'));
  const dupA = createUserTemplateFrom(byId(EXAMPLE_SOP_ID), 'First File', T0);
  const dupB = { ...JSON.parse(serializeTemplate(dupA)), name: 'Second File' };
  validateTemplate(dupB);
  await fsp.writeFile(path.join(dupDir, 'a-first.dstemplate'), serializeTemplate(dupA), 'utf8');
  await fsp.writeFile(path.join(dupDir, 'b-second.dstemplate'), serializeTemplate(dupB), 'utf8');
  const dupLoad = await loadUserTemplates(createFsAdapter(dupDir));
  assert.equal(dupLoad.templates.length, 1, 'one entry per id');
  assert.equal(dupLoad.templates[0].name, 'First File', 'sorted first file wins');
  assert.ok(dupLoad.warnings.some((w) => w.message.includes('duplicates the id')));
});

// ═══════════════════════════════════════════════════════════════════════════
// 10. Write failure never corrupts or removes a previously valid template
// ═══════════════════════════════════════════════════════════════════════════
await test('10. a failed write leaves the previously saved template intact', async () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'ds-p03-m5-writefail-'));
  const good = createFsAdapter(dir);
  const v1 = createUserTemplateFrom(byId(EXAMPLE_SOP_ID), 'Crash Safe', T0);
  await saveTemplateToStorage(good, v1);
  const v1Text = await good.read(userTemplateFileName(v1.id));

  const failing = {
    ...createFsAdapter(dir),
    async write() {
      throw new Error('ENOSPC: disk full');
    },
  };
  const v2 = updateUserTemplate(v1, addSection(createTemplateDraft(v1), 'Almost Lost').draft, T1);
  await assert.rejects(
    () => saveTemplateToStorage(failing, v2),
    (e) => e instanceof UserTemplateError && e.code === 'io-write' && e.message.includes('My Templates'),
  );

  // The stored file is byte-identical to before the failed save.
  assert.equal(await good.read(userTemplateFileName(v1.id)), v1Text, 'file untouched by failed write');
  const reload = await loadUserTemplates(good);
  assert.equal(reload.templates.length, 1);
  assert.deepEqual(reload.templates[0], v1, 'previously valid template survives intact');
  assert.ok(!reload.templates[0].sections.some((s) => s.name === 'Almost Lost'));
  assert.deepEqual(reload.warnings, []);

  // Serializing an INVALID template fails BEFORE any write is attempted.
  const invalid = JSON.parse(serializeTemplate(v1));
  invalid.sections[0].name = '';
  await assert.rejects(() => saveTemplateToStorage(good, invalid));
  assert.equal(await good.read(userTemplateFileName(v1.id)), v1Text, 'still untouched');
});

// ═══════════════════════════════════════════════════════════════════════════
// 11. Canonical catalog unchanged after every save/import operation
// ═══════════════════════════════════════════════════════════════════════════
await test('11. the canonical built-in catalog is never mutated', () => {
  const snapshot = JSON.stringify(catalog());
  // Retrieve, customize, save, plan imports, normalize — repeatedly.
  for (let i = 0; i < 3; i += 1) {
    for (const id of [EXAMPLE_SOP_ID, QP_ID]) {
      const draft = createTemplateDraft(byId(id));
      const saved = createUserTemplateFrom(draft, `Round ${i}`, T0);
      validateTemplate(saved);
      normalizeImportedTemplate(byId(id), T0);
      templateContentFingerprint(byId(id));
    }
  }
  assert.equal(JSON.stringify(catalog()), snapshot, 'catalog bytes identical after operations');
  assert.equal(catalog().length, 16, 'still the 16 built-in templates');
});

// ═══════════════════════════════════════════════════════════════════════════
// 12. Customized P03-M4 draft saved with full section fidelity
// ═══════════════════════════════════════════════════════════════════════════
await test('12. a customized draft saves and reloads with sections fully preserved', async () => {
  let draft = createTemplateDraft(byId(EXAMPLE_SOP_ID));
  draft = renameSection(draft, draft.sections[0].id, 'Renamed Scope').draft;
  draft = updateSectionDescription(draft, draft.sections[0].id, 'What this SOP covers.').draft;
  draft = updateSectionPrompt(draft, draft.sections[0].id, 'Keep wording aligned with QA-01.').draft;
  draft = addSection(draft, 'Custom Addendum', {
    description: 'Extra work.',
    prompt: 'Fill after testing.',
  }).draft;
  draft = moveSection(draft, draft.sections[0].id, 'down').draft;
  assert.equal(findNoIssues(draft), true, 'draft is structurally clean');

  const saved = createUserTemplateFrom(draft, 'My Custom SOP', T0);
  await saveTemplateToStorage(storage, saved);
  const loaded = (await loadUserTemplates(storage)).templates.find((t) => t.id === saved.id);
  assert.ok(loaded, 'saved draft is loadable');
  assert.deepEqual(loaded.sections, draft.sections, 'section order/names/descriptions/prompts/blocks preserved');
  assert.deepEqual(loaded.defaults, draft.defaults);
  assert.deepEqual(loaded.assets, draft.assets);
  validateTemplate(loaded);

  // Instantiating from the LOADED copy reproduces the customized structure.
  const doc = instantiateTemplate(loaded, emptyProfile(), T0);
  validateDocument(doc);
  const headings = doc.blocks.filter((b) => b.data.type === 'heading').map((b) => b.data.text);
  assert.equal(headings[0], draft.sections[0].name, 'flattened order matches saved order');
  assert.ok(headings.includes('Custom Addendum'));
});

function findNoIssues(draft) {
  return customization.findDraftIssues(draft).length === 0;
}

// ═══════════════════════════════════════════════════════════════════════════
// 13. User templates integrate with search/category/preview and drafts
// ═══════════════════════════════════════════════════════════════════════════
await test('13. user templates work with chooser search, filter, preview and drafts', async () => {
  const user = createUserTemplateFrom(byId('builtin.financial-administrative.quotation'), 'Zeta Quote Master', T0);
  await saveTemplateToStorage(storage, user);
  const loaded = (await loadUserTemplates(storage)).templates;

  // The chooser pipeline: user templates listed alongside built-ins.
  const merged = [...loaded, ...catalog()];
  const labelFor = (c) => tplTypes.TEMPLATE_CATEGORIES.find((x) => x.id === c)?.label ?? c;

  const searchHit = filterTemplates(merged, 'zeta quote', null);
  assert.deepEqual(searchHit.map((t) => t.id), [user.id], 'free-text search finds the user template');
  assert.equal(filterTemplates(merged, 'zeta quote', 'management-system').length, 0, 'category filter applies');
  assert.ok(
    filterTemplates(merged, 'zeta quote', user.category).some((t) => t.id === user.id),
    'correct category keeps it visible',
  );

  const choices = buildChoiceList(filterTemplates(merged, '', null), labelFor);
  assert.equal(choices[0].id, BLANK_CHOICE_ID, 'Blank Document stays first');
  const choice = choices.find((c) => c.id === user.id);
  assert.ok(choice, 'user template becomes a selectable choice');
  assert.equal(choice.template.origin, 'user', 'origin flows through for badging');
  assert.equal(choice.sections.length, user.sections.length, 'section preview intact');
  assert.ok(choice.sections.every((s) => typeof s.name === 'string'));

  // Per-template drafts still resolve for user templates (P03-M4 semantics).
  let drafts = {};
  const edited = addSection(createTemplateDraft(user), 'User Draft Section').draft;
  drafts = withDraftResult(drafts, user.id, { ok: true, draft: edited });
  const resolved = draftFor(drafts, user);
  assert.ok(resolved.sections.some((s) => s.name === 'User Draft Section'));
  const other = catalog()[0];
  assert.equal(draftFor(drafts, other).id, other.id, 'other templates unaffected');
});

// ═══════════════════════════════════════════════════════════════════════════
// 14. Multiple documents from one user template stay isolated
// ═══════════════════════════════════════════════════════════════════════════
await test('14. documents created from a user template are independent and fresh', async () => {
  const loaded = (await loadUserTemplates(storage)).templates;
  const user = loaded.find((t) => t.name === 'My Custom SOP');
  assert.ok(user, 'user template available');
  const storedText = JSON.stringify(user);

  const d1 = instantiateTemplate(user, emptyProfile(), T0);
  const d2 = instantiateTemplate(user, emptyProfile(), T1);
  validateDocument(d1);
  validateDocument(d2);
  assert.notEqual(d1.id, user.id, 'document id differs from the template id');
  assert.notEqual(d1.id, d2.id, 'fresh document id per instantiation');
  assert.equal(d1.metadata.documentId, '', 'document code never preassigned');
  const ids1 = d1.blocks.map((b) => b.id);
  const ids2 = d2.blocks.map((b) => b.id);
  assert.equal(new Set([...ids1, ...ids2]).size, ids1.length + ids2.length, 'fresh block ids');

  // Editing one document reaches neither the other nor the stored template.
  d1.blocks[0].data.text = 'Edited in doc one';
  assert.notEqual(d2.blocks[0].data.text, 'Edited in doc one');
  const reloaded = (await loadUserTemplates(storage)).templates.find((t) => t.id === user.id);
  assert.equal(JSON.stringify(reloaded), storedText, 'stored user template never mutated');
});

// ═══════════════════════════════════════════════════════════════════════════
// 15. Laboratory Profile identity precedence unchanged for user templates
// ═══════════════════════════════════════════════════════════════════════════
await test('15. saved Laboratory Profile identity still wins for user templates', async () => {
  const profile = normalizeLabProfile({
    name: 'Precedence Laboratory',
    documentIdPrefix: 'PC-',
    address: '1 Test Lane',
  });
  const loaded = (await loadUserTemplates(storage)).templates;
  const user = loaded.find((t) => t.name === 'My Custom SOP');
  const doc = instantiateTemplate(user, profile, T0);
  validateDocument(doc);
  assert.equal(doc.labProfile.name, 'Precedence Laboratory');
  assert.equal(doc.metadata.organizationName, 'Precedence Laboratory');
  assert.equal(doc.labProfile.documentIdPrefix, 'PC-');
  assert.equal(doc.metadata.documentId, '', 'document code never preassigned');
  assert.equal(
    doc.metadata.applicableStandard,
    user.defaults?.metadata?.applicableStandard,
    'template defaults still apply',
  );
});

// ═══════════════════════════════════════════════════════════════════════════
// 16. Cancelled / malformed imports change nothing
// ═══════════════════════════════════════════════════════════════════════════
await test('16. cancelled and malformed imports leave library and drafts unchanged', async () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'ds-p03-m5-cancel-'));
  const s = createFsAdapter(dir);
  let writes = 0;
  const counting = { ...s, async write(n, t) { writes += 1; return s.write(n, t); } };
  const keep = createUserTemplateFrom(byId(QP_ID), 'Keep Me', T0);
  await saveTemplateToStorage(counting, keep);
  const before = await loadUserTemplates(s);
  const beforeText = JSON.stringify(before.templates);
  writes = 0;

  // A draft map in the chooser is untouched by import flows (imports never
  // take or return drafts) — assert the pure contract directly.
  const drafts = { [keep.id]: createTemplateDraft(keep) };
  const draftsBefore = JSON.stringify(drafts);

  // Malformed candidate → planImport is never reached (validation fails
  // first, exactly like the manager's beginImport); no write happens.
  let malformedRejected = false;
  try {
    deserializeTemplate('{"__type":"DocStudioTemplate", broken');
  } catch {
    malformedRejected = true;
  }
  assert.equal(malformedRejected, true);

  // Cancelling a conflict plan performs no write.
  const incomingRaw = JSON.parse(serializeTemplate(keep));
  incomingRaw.name = 'Cancel Victim';
  const plan = planImport(before.templates, incomingRaw, T2);
  assert.equal(plan.kind, 'conflict');
  assert.equal(applyImportPlan(plan, 'cancel', T2).status, 'cancelled');

  assert.equal(writes, 0, 'zero storage writes during cancelled/malformed import');
  assert.equal(JSON.stringify((await loadUserTemplates(s)).templates), beforeText, 'library unchanged');
  assert.equal(JSON.stringify(drafts), draftsBefore, 'drafts unchanged');
});

// ═══════════════════════════════════════════════════════════════════════════
// 17. Blank Document and unsaved-changes guard behavior unchanged
// ═══════════════════════════════════════════════════════════════════════════
await test('17. Blank Document and the unsaved-changes guard are unchanged', async () => {
  let guardCalls = 0;
  const guard = (verdict) => async () => {
    guardCalls += 1;
    return verdict;
  };

  const cancelled = await resolveChooserSelection(null, emptyProfile(), T0, guard('proceed'));
  assert.equal(cancelled, null);
  assert.equal(guardCalls, 0, 'Cancel never runs the guard');

  const aborted = await resolveChooserSelection(
    buildChoiceList(catalog(), (c) => c)[1],
    emptyProfile(),
    T0,
    guard('abort'),
  );
  assert.equal(aborted, null);
  assert.equal(guardCalls, 1, 'guard ran once');

  const blank = buildChoiceList([], (c) => c)[0];
  const blankDoc = await resolveChooserSelection(blank, emptyProfile(), T0, guard('proceed'));
  validateDocument(blankDoc);
  assert.equal(blankDoc.blocks.length, 0, 'blank document stays empty');

  // A user template flows through the same guarded selection path.
  const loaded = (await loadUserTemplates(storage)).templates;
  const choice = buildChoiceList(loaded, (c) => c).find((c) => c.id === loaded[0].id);
  const doc = await resolveChooserSelection(choice, emptyProfile(), T0, guard('proceed'));
  validateDocument(doc);
  assert.equal(guardCalls, 3, 'guard ran for abort, blank and the user-template choice');
});

// ═══════════════════════════════════════════════════════════════════════════
// 19. Store hygiene: stray temp files ignored, missing dir = empty library
// ═══════════════════════════════════════════════════════════════════════════
await test('19. stray temp files are ignored and an absent directory is an empty library', async () => {
  // A crashed write can leave a .tmp sibling — it must never load.
  const strayPath = fileIn(`${userTemplateFileName('stray')}.tmp`);
  await fsp.writeFile(strayPath, '{ partial', 'utf8');
  const result = await loadUserTemplates(storage);
  assert.ok(
    result.templates.every((t) => t.id !== 'stray'),
    'temp file never surfaces as a template',
  );
  assert.ok(!result.warnings.some((w) => w.fileName && w.fileName.endsWith('.tmp')), 'temp file produces no warning');
  await fsp.rm(strayPath, { force: true });

  // Absent directory: load creates it and reports an empty library silently.
  const ghostDir = path.join(tmpdir(), `ds-p03-m5-ghost-${Date.now()}`);
  assert.equal(existsSync(ghostDir), false);
  const ghostLoad = await loadUserTemplates(createFsAdapter(ghostDir));
  assert.deepEqual(ghostLoad.templates, []);
  assert.deepEqual(ghostLoad.warnings, []);
  assert.ok(existsSync(ghostDir), 'store directory created on demand');
});

// ── Summary ─────────────────────────────────────────────────────────────────
console.log(`\nP03-M5 verification: ${passed} passed, ${failed.length} failed.`);
if (failed.length > 0) {
  failed.forEach(({ name, e }) => console.error(` - ${name}: ${e && e.message ? e.message : e}`));
  process.exit(1);
}
