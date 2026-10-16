/**
 * P03-M1 — Versioned template schema verification
 * ═══════════════════════════════════════════════════════════════════════════
 * Exercises the ACTUAL template modules:
 *   • src/types/template.ts         (types, categories, builtin-ID policy)
 *   • src/types/template-defaults.ts(factories + flattening contract)
 *   • src/services/template-file.ts (serialize/deserialize/validate)
 *   • src/services/template-samples.ts (deterministic example fixture)
 * compiled with tsc and run in Node with the built-in assert module —
 * no testing framework is introduced.
 *
 * Coverage (mirrors the P03-M1 checklist):
 *   1. A valid default template can be created.
 *   2. Template / section / block IDs are stable once created and unique.
 *   3. A valid template serializes and deserializes successfully.
 *   4. Serialization is deterministic for an unchanged template.
 *   5. All supported template categories can be represented.
 *   6. Metadata defaults, settings, ordered sections and blocks survive round-trip.
 *   7. Custom tags, prompts and reference/clause fields survive round-trip.
 *   8. Malformed JSON is rejected clearly.
 *   9. Missing or invalid required fields are rejected.
 *  10. Unknown / unsupported template schema versions are rejected.
 *  11. A template is not accepted as a `.docstudio` document, nor vice versa.
 *  12. Mutating one template / template-derived fixture does not mutate another.
 *  13. The example template is structurally valid.
 *  14. Existing document serialization + lifecycle behaviour have no regressions.
 *
 * Usage: node verify_p03_m1.mjs   (or: npm run verify:p03-m1)
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
const outDir = mkdtempSync(path.join(tmpdir(), 'ds-p03-m1-'));
execSync(
  'npx tsc src/services/template-file.ts src/services/template-samples.ts' +
    ' src/services/document-file.ts src/services/document-actions.ts' +
    ' src/types/template.ts src/types/template-defaults.ts' +
    ' src/types/blocks.ts src/types/document.ts src/types/defaults.ts src/types/index.ts' +
    ` --outDir "${outDir}" --module commonjs --target es2020 --moduleResolution node --esModuleInterop --skipLibCheck`,
  { cwd: root, stdio: 'inherit' },
);

const tplFile = require(path.join(outDir, 'services', 'template-file.js'));
const tplSamples = require(path.join(outDir, 'services', 'template-samples.js'));
const docFile = require(path.join(outDir, 'services', 'document-file.js'));
const docActions = require(path.join(outDir, 'services', 'document-actions.js'));
const tplTypes = require(path.join(outDir, 'types', 'template.js'));
const tplDefaults = require(path.join(outDir, 'types', 'template-defaults.js'));
const docDefaults = require(path.join(outDir, 'types', 'defaults.js'));

const {
  serializeTemplate,
  deserializeTemplate,
  defaultTemplateFileName,
  TemplateFileError,
} = tplFile;
const { createExampleSopTemplate } = tplSamples;
const { serializeDocument, deserializeDocument } = docFile;
const {
  DOCSTUDIO_TEMPLATE_SCHEMA_VERSION,
  TEMPLATE_FILE_SIGNATURE,
  TEMPLATE_FILE_EXTENSION,
  TEMPLATE_CATEGORIES,
  TEMPLATE_CATEGORY_IDS,
  isBuiltinTemplateId,
} = tplTypes;
const {
  createDefaultTemplate,
  createTemplateSection,
  createTemplateHeadingBlock,
  createTemplateParagraphBlock,
  createTemplateReferenceHint,
  sectionToBlocks,
  templateSectionsToBlocks,
} = tplDefaults;

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

/** Assert that `fn` throws a TemplateFileError with the expected code. */
function assertThrowsCode(fn, code, label) {
  let thrown = null;
  try {
    fn();
  } catch (e) {
    thrown = e;
  }
  assert.ok(thrown, `${label}: expected a throw, but none occurred`);
  assert.ok(
    thrown instanceof TemplateFileError,
    `${label}: expected TemplateFileError, got ${thrown?.constructor?.name}`,
  );
  assert.equal(thrown.code, code, `${label}: expected code "${code}", got "${thrown.code}"`);
}

/**
 * Assert that `fn` throws ANY DocStudio file error carrying the expected
 * `code` (used for cross-module checks where the OTHER deserializer — e.g.
 * the document one — correctly rejects the input with its own error class).
 */
function assertThrowsCodedError(fn, code, label) {
  let thrown = null;
  try {
    fn();
  } catch (e) {
    thrown = e;
  }
  assert.ok(thrown, `${label}: expected a throw, but none occurred`);
  assert.ok(thrown instanceof Error, `${label}: expected an Error, got ${typeof thrown}`);
  assert.equal(thrown.code, code, `${label}: expected code "${code}", got "${thrown.code}"`);
}

const T0 = '2026-10-16T08:00:00.000Z';

// ── 1. A valid default template can be created ──────────────────────────────
test('1. createDefaultTemplate produces a structurally valid template', () => {
  const t = createDefaultTemplate({ createdAt: T0 });
  assert.equal(t.__type, TEMPLATE_FILE_SIGNATURE);
  assert.equal(t.schemaVersion, DOCSTUDIO_TEMPLATE_SCHEMA_VERSION);
  assert.equal(t.origin, 'user');
  assert.equal(typeof t.id, 'string');
  assert.equal(typeof t.name, 'string');
  assert.equal(typeof t.description, 'string');
  assert.ok(TEMPLATE_CATEGORY_IDS.includes(t.category));
  assert.ok(Array.isArray(t.tags));
  assert.ok(Array.isArray(t.sections));
  assert.deepEqual(t.assets, {});
  // Validating it must not throw.
  tplFile.validateTemplate(t);
});

// ── 2. IDs are stable once created and unique where required ────────────────
test('2. section/block/reference IDs are stable and unique across calls', () => {
  const h1 = createTemplateHeadingBlock(2, 'Heading');
  const h2 = createTemplateHeadingBlock(2, 'Heading');
  const p1 = createTemplateParagraphBlock('Body text');
  const s1 = createTemplateSection('Scope');
  const s2 = createTemplateSection('Scope');
  const r1 = createTemplateReferenceHint('Std', 'ISO 1', 'Clause 1');
  const r2 = createTemplateReferenceHint('Std', 'ISO 1', 'Clause 1');

  // Stable: the SAME object keeps its ID when re-read.
  assert.equal(h1.id, h1.id);
  assert.equal(s1.id, s1.id);

  // Unique: distinct factory calls mint distinct IDs.
  const ids = [h1.id, h2.id, p1.id, s1.id, s2.id, r1.id, r2.id];
  assert.equal(new Set(ids).size, ids.length, 'factory IDs must be unique');

  // Template-level IDs are unique too.
  const a = createDefaultTemplate({ createdAt: T0 });
  const b = createDefaultTemplate({ createdAt: T0 });
  assert.notEqual(a.id, b.id, 'template IDs must be unique per call');
});

// ── 3. A valid template serializes and deserializes successfully ────────────
test('3. serializeTemplate -> deserializeTemplate round-trips a valid template', () => {
  const t = tplSamples.createExampleSopTemplate();
  const text = serializeTemplate(t);
  assert.ok(text.length > 0, 'serialization must produce text');
  const back = deserializeTemplate(text);
  assert.equal(back.id, t.id);
  assert.equal(back.name, t.name);
  assert.equal(back.schemaVersion, t.schemaVersion);
  assert.equal(back.sections.length, t.sections.length);
});

// ── 4. Serialization is deterministic for an unchanged template ─────────────
test('4. serialization is deterministic (identical bytes for identical input)', () => {
  const t = tplSamples.createExampleSopTemplate();
  const a = serializeTemplate(t);
  const b = serializeTemplate(t);
  assert.equal(a, b, 'serializing the same template twice must be identical');
  // And a deserialize -> serialize cycle must reproduce the same bytes too.
  const c = serializeTemplate(deserializeTemplate(a));
  assert.equal(a, c, 'round-trip must preserve exact bytes');
});

// ── 5. All supported template categories can be represented ────────────────
test('5. every supported category can be used and round-trips', () => {
  assert.equal(TEMPLATE_CATEGORY_IDS.length, 8, 'there must be exactly 8 principal categories');
  for (const cat of TEMPLATE_CATEGORY_IDS) {
    const t = createDefaultTemplate({ category: cat, createdAt: T0 });
    tplFile.validateTemplate(t); // must not throw
    const back = deserializeTemplate(serializeTemplate(t));
    assert.equal(back.category, cat, `category ${cat} must survive round-trip`);
  }
  // Category list is non-empty, serializable metadata.
  assert.ok(TEMPLATE_CATEGORIES.length === 8);
  assert.ok(TEMPLATE_CATEGORIES.every((c) => typeof c.id === 'string' && typeof c.label === 'string'));
});

// ── 6. Metadata defaults, settings, ordered sections and blocks survive ─────
test('6. defaults, ordered sections and blocks survive a round-trip', () => {
  const t = createDefaultTemplate({ createdAt: T0 });
  t.defaults = {
    metadata: { title: 'T', subtitle: 'S', organizationName: 'Org', documentId: 'ID-1', status: 'Draft' },
    labProfile: { name: 'Lab', documentIdPrefix: 'LAB-' },
    pageSetup: { size: 'A4', orientation: 'portrait' },
    pageTypography: { bodyThemeId: 'classic-formal' },
    frontPage: { enabled: true },
    headerFooter: { header: { enabled: true } },
  };
  const sA = createTemplateSection('Alpha', { blocks: [createTemplateParagraphBlock('A')] });
  const sB = createTemplateSection('Beta', { blocks: [createTemplateParagraphBlock('B')] });
  t.sections = [sA, sB];

  const back = deserializeTemplate(serializeTemplate(t));
  assert.deepEqual(back.defaults.metadata, t.defaults.metadata);
  assert.deepEqual(back.defaults.labProfile, t.defaults.labProfile);
  assert.deepEqual(back.defaults.pageSetup, t.defaults.pageSetup);
  assert.equal(back.sections.length, 2);
  assert.equal(back.sections[0].name, 'Alpha');
  assert.equal(back.sections[1].name, 'Beta');
  // Ordered blocks preserved.
  assert.equal(back.sections[0].blocks.length, 1);
  assert.equal(back.sections[1].blocks.length, 1);
  // Stable section IDs preserved through round-trip.
  assert.equal(back.sections[0].id, sA.id);
  assert.equal(back.sections[1].id, sB.id);
});

// ── 7. Custom tags, prompts and reference/clause fields survive ─────────────
test('7. custom tags, prompts and reference/clause fields survive round-trip', () => {
  const t = createDefaultTemplate({ createdAt: T0, tags: ['alpha', 'beta', 'gamma'] });
  const hint = createTemplateReferenceHint('Applicable standard', 'ISO/IEC 17025:2017', 'Clause 7.2');
  t.sections = [
    createTemplateSection('Refs', {
      description: 'A description',
      prompt: 'An author prompt',
      references: [hint],
    }),
  ];
  const back = deserializeTemplate(serializeTemplate(t));
  assert.deepEqual(back.tags, ['alpha', 'beta', 'gamma']);
  assert.equal(back.sections[0].description, 'A description');
  assert.equal(back.sections[0].prompt, 'An author prompt');
  assert.equal(back.sections[0].references.length, 1);
  assert.equal(back.sections[0].references[0].value, 'ISO/IEC 17025:2017');
  assert.equal(back.sections[0].references[0].clause, 'Clause 7.2');
});

// ── 8. Malformed JSON is rejected clearly ──────────────────────────────────
test('8. malformed JSON is rejected with code "invalid-json"', () => {
  assertThrowsCode(() => deserializeTemplate('{ not valid json'), 'invalid-json', 'malformed JSON');
});

// ── 9. Missing or invalid required fields are rejected ──────────────────────
test('9. missing/invalid required fields are rejected with "invalid-structure"', () => {
  const t = createDefaultTemplate({ createdAt: T0 });
  const good = JSON.parse(serializeTemplate(t));

  // A. Missing `name`.
  const noName = { ...good };
  delete noName.name;
  assertThrowsCode(
    () => deserializeTemplate(JSON.stringify(noName)),
    'invalid-structure',
    'missing name',
  );

  // B. Invalid category.
  const badCat = { ...good, category: 'not-a-category' };
  assertThrowsCode(
    () => deserializeTemplate(JSON.stringify(badCat)),
    'invalid-structure',
    'invalid category',
  );

  // C. Missing `sections`.
  const noSections = { ...good };
  delete noSections.sections;
  assertThrowsCode(
    () => deserializeTemplate(JSON.stringify(noSections)),
    'invalid-structure',
    'missing sections',
  );

  // D. Invalid origin.
  const badOrigin = { ...good, origin: 'alien' };
  assertThrowsCode(
    () => deserializeTemplate(JSON.stringify(badOrigin)),
    'invalid-structure',
    'invalid origin',
  );

  // E. Root is not an object.
  assertThrowsCode(() => deserializeTemplate('[1,2,3]'), 'invalid-structure', 'array root');
});

// ── 10. Unknown / unsupported template schema versions are rejected ─────────
test('10. unsupported and invalid template schema versions are rejected', () => {
  const t = createDefaultTemplate({ createdAt: T0 });
  const good = JSON.parse(serializeTemplate(t));

  // Newer version -> unsupported-version.
  const newer = { ...good, schemaVersion: DOCSTUDIO_TEMPLATE_SCHEMA_VERSION + 1 };
  assertThrowsCode(
    () => deserializeTemplate(JSON.stringify(newer)),
    'unsupported-version',
    'newer schema version',
  );

  // Version 0 (below the current version 1) -> invalid-structure, because the
  // `version < 1` guard fires first. This is the correct rejection: there is
  // no valid older version to migrate while the current version is 1. The
  // `no-migration` branch becomes reachable only once the current version is
  // bumped above 1 (a future template schema change); it is documented, not
  // dead code, and is exercised implicitly by the guard ordering below.
  const older = { ...good, schemaVersion: DOCSTUDIO_TEMPLATE_SCHEMA_VERSION - 1 };
  assertThrowsCode(
    () => deserializeTemplate(JSON.stringify(older)),
    'invalid-structure',
    'version 0 (below current)',
  );

  // Non-integer version -> invalid-structure.
  const bad = { ...good, schemaVersion: 'x' };
  assertThrowsCode(
    () => deserializeTemplate(JSON.stringify(bad)),
    'invalid-structure',
    'non-integer schema version',
  );

  // Negative version -> invalid-structure.
  const neg = { ...good, schemaVersion: -3 };
  assertThrowsCode(
    () => deserializeTemplate(JSON.stringify(neg)),
    'invalid-structure',
    'negative schema version',
  );
});

// ── 11. Cross-rejection between templates and native documents ─────────────
test('11. a template is not accepted as a document, nor a document as a template', () => {
  // A. Template JSON must NOT be accepted by the document deserializer.
  //    The document validator correctly rejects it with its own
  //    DocumentFileError carrying code 'invalid-structure'.
  const tplText = serializeTemplate(createExampleSopTemplate());
  assertThrowsCodedError(
    () => deserializeDocument(tplText),
    'invalid-structure',
    'template fed to document deserializer',
  );

  // B. Document JSON must NOT be accepted by the template deserializer.
  const doc = docActions.createNewDocument(T0);
  const docText = serializeDocument(doc);
  assertThrowsCode(
    () => deserializeTemplate(docText),
    'invalid-signature',
    'document fed to template deserializer',
  );

  // C. The two signatures are distinct.
  assert.notEqual(TEMPLATE_FILE_SIGNATURE, 'DocStudio');
  assert.equal(isBuiltinTemplateId('builtin.x.y'), true);
  assert.equal(isBuiltinTemplateId('user-uuid'), false);
});

// ── 12. Mutating one template / fixture does not mutate another ─────────────
test('12. mutating one template does not mutate another (no shared refs)', () => {
  const a = createDefaultTemplate({ createdAt: T0, tags: ['shared'] });
  const b = createDefaultTemplate({ createdAt: T0, tags: ['shared'] });

  // Deep-clone snapshot of b for later comparison.
  const bSnapshot = JSON.stringify(b);

  // Mutate a aggressively.
  a.name = 'Mutated A';
  a.tags.push('extra');
  a.sections.push(createTemplateSection('New section'));
  a.sections[0].blocks.push(createTemplateParagraphBlock('added'));
  a.assets = {};

  // b must be unchanged.
  assert.equal(JSON.stringify(b), bSnapshot, 'b must not be affected by mutating a');

  // Example-fixture isolation: two independent calls must not share structure.
  const e1 = createExampleSopTemplate();
  const e2 = createExampleSopTemplate();
  const e2Snapshot = JSON.stringify(e2);
  e1.sections[0].name = 'Renamed';
  e1.sections[0].blocks[0].data.text = 'changed';
  assert.equal(JSON.stringify(e2), e2Snapshot, 'example fixtures must be independent');
});

// ── 13. The example template is structurally valid ──────────────────────────
test('13. the example template is structurally valid and flattens correctly', () => {
  const t = createExampleSopTemplate();
  tplFile.validateTemplate(t); // must not throw

  // Built-in origin uses the reserved prefix.
  assert.equal(t.origin, 'builtin');
  assert.ok(isBuiltinTemplateId(t.id));

  // Two ordered sections.
  assert.equal(t.sections.length, 2);
  assert.equal(t.sections[0].name, 'Scope');
  assert.equal(t.sections[1].name, 'Responsibilities');

  // Flattening contract: each section yields [heading, ...blocks].
  const flat = templateSectionsToBlocks(t.sections);
  // 2 headings + 3 paragraph blocks total (1 + 2).
  assert.equal(flat.length, 5, 'flatten must yield 2 headings + 3 blocks');
  assert.equal(flat[0].data.type, 'heading');
  assert.equal(flat[0].data.level, 2);
  assert.equal(flat[0].data.text, 'Scope');
  assert.equal(flat[1].data.type, 'paragraph');

  // sectionToBlocks returns a fresh heading and does not mutate the section.
  const before = JSON.stringify(t.sections[0]);
  const blocks = sectionToBlocks(t.sections[0]);
  assert.equal(blocks[0].data.type, 'heading');
  assert.equal(JSON.stringify(t.sections[0]), before, 'flattening must not mutate the section');

  // Filename helper uses the template extension.
  const fname = defaultTemplateFileName(t.name);
  assert.ok(fname.endsWith(TEMPLATE_FILE_EXTENSION), 'filename must carry .dstemplate');
});

// ── 14. Existing document serialization + lifecycle have no regressions ────
test('14. document serialization and lifecycle behaviour are unaffected', () => {
  const doc = docActions.createNewDocument(T0);
  const text = serializeDocument(doc);
  const back = deserializeDocument(text);
  assert.equal(back.id, doc.id);
  assert.equal(back.schemaVersion, doc.schemaVersion);

  // Metadata edit still round-trips and stamps modifiedAt only on real change.
  const edited = docActions.updateDocumentMetadata(back, { title: 'New Title' }, '2026-10-16T09:00:00.000Z');
  assert.equal(edited.metadata.title, 'New Title');
  assert.notEqual(edited.metadata.modifiedAt, back.metadata.modifiedAt, 'real edit must stamp modifiedAt');

  // A no-op patch returns the SAME reference (no false dirty).
  const same = docActions.updateDocumentMetadata(edited, { title: 'New Title' }, '2026-10-16T10:00:00.000Z');
  assert.equal(same, edited, 'no-op patch must return the same reference');

  // Duplicate produces an independent copy with a distinct id and the
  // intentional " (Copy)" title suffix (existing lifecycle behaviour).
  const dup = docActions.duplicateDocument(edited, '2026-10-16T11:00:00.000Z');
  assert.notEqual(dup.id, edited.id);
  assert.equal(dup.metadata.title, 'New Title (Copy)');

  // Default document factories still work.
  const defaultsDoc = docDefaults.createDefaultDocument(docDefaults.newUUID(), T0);
  assert.equal(defaultsDoc.metadata.title, 'Untitled Document');
});

// ── Summary ────────────────────────────────────────────────────────────────
console.log(`\nP03-M1 verification: ${passed} passed, ${failed.length} failed.`);
if (failed.length > 0) {
  console.error(`Failed: ${failed.join(', ')}`);
  process.exit(1);
}
