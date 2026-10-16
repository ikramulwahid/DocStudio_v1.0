/**
 * P03-M3 — Core laboratory and administrative template library
 * ═══════════════════════════════════════════════════════════════════════════
 * Exercises the ACTUAL modules:
 *   • src/services/template-library/index.ts     (authoritative built-in catalog)
 *   • src/services/template-library/*.ts         (per-category template builders)
 *   • src/services/template-chooser.ts           (catalog consumption, search/filter, blank)
 *   • src/services/template-instantiation.ts     (precedence, deep-copy/remint)
 *   • src/services/template-samples.ts           (retained deterministic example SOP)
 *   • src/services/template-file.ts              (.dstemplate serialize/validate)
 *   • src/services/document-file.ts              (.docstudio serialize/validate)
 *   • src/services/lab-profile.ts                (profile normalize/serialize)
 *   • src/services/document-actions.ts           (guard/lifecycle smoke)
 * compiled with tsc and run in Node with the built-in assert module —
 * no testing framework is introduced.
 *
 * Coverage (mirrors the P03-M3 checklist, 18 items):
 *   1. At least 16 distinct built-in templates exist.
 *   2. All eight category ids are represented by at least two templates each.
 *   3. The retained example SOP keeps its id/content.
 *   4. Every catalog template passes validateTemplate.
 *   5. Every catalog template round-trips through .dstemplate without data loss.
 *   6. Root ids are unique, in the reserved builtin.<category>.<slug> form,
 *      and stable across repeated catalog retrieval.
 *   7. Section/reference/starter-block ids collide nowhere within a template.
 *   8. Repeated retrieval never mutates or corrupts the canonical catalog.
 *   9. Names, descriptions, categories, tags, authors and ordered sections
 *      are populated appropriately.
 *  10. Every template instantiates into a valid document.
 *  11. Every instantiated document gets fresh identity and instance timestamps.
 *  12. Starter content and partial defaults survive instantiation.
 *  13. Saved Laboratory Profile precedence still holds for representative
 *      templates (and no template hardcodes a fictitious laboratory name).
 *  14. Mutating an instantiated document never mutates the source template.
 *  15. Chooser search/category filter finds every template.
 *  16. Blank Document remains a first-class, unaffected choice.
 *  17. Templates do not all share an identical generic set of sections/content.
 *  18. Existing P02/P03 behavior has no regression (in-script smoke; the full
 *      regression evidence is the npm verify:p02-* / verify:p03-m1 /m2 suite
 *      executed alongside this script).
 *
 * Usage: node verify_p03_m3.mjs   (or: npm run verify:p03-m3)
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
const outDir = mkdtempSync(path.join(tmpdir(), 'ds-p03-m3-'));
execSync(
  'npx tsc src/services/template-library/index.ts src/services/template-chooser.ts' +
    ' src/services/template-instantiation.ts src/services/template-samples.ts' +
    ' src/services/template-file.ts src/services/lab-profile.ts' +
    ' src/services/document-file.ts src/services/document-actions.ts' +
    ' src/types/template.ts src/types/template-defaults.ts src/types/lab-profile.ts' +
    ' src/types/blocks.ts src/types/document.ts src/types/defaults.ts src/types/index.ts' +
    ` --outDir "${outDir}" --module commonjs --target es2020 --moduleResolution node --esModuleInterop --skipLibCheck`,
  { cwd: root, stdio: 'inherit' },
);

const library = require(path.join(outDir, 'services', 'template-library', 'index.js'));
const chooser = require(path.join(outDir, 'services', 'template-chooser.js'));
const inst = require(path.join(outDir, 'services', 'template-instantiation.js'));
const tplSamples = require(path.join(outDir, 'services', 'template-samples.js'));
const tplFile = require(path.join(outDir, 'services', 'template-file.js'));
const docFile = require(path.join(outDir, 'services', 'document-file.js'));
const docActions = require(path.join(outDir, 'services', 'document-actions.js'));
const labProfile = require(path.join(outDir, 'services', 'lab-profile.js'));
const tplTypes = require(path.join(outDir, 'types', 'template.js'));
const lpTypes = require(path.join(outDir, 'types', 'lab-profile.js'));

const { getBuiltinCatalogTemplates } = library;
const {
  BLANK_CHOICE_ID,
  getBuiltinTemplates,
  buildChoiceList,
  filterTemplates,
  matchesQuery,
  isKnownCategory,
  resolveChooserSelection,
} = chooser;
const { instantiateTemplate } = inst;
const { createExampleSopTemplate } = tplSamples;
const { serializeTemplate, deserializeTemplate, validateTemplate } = tplFile;
const { serializeDocument, deserializeDocument, validateDocument } = docFile;
const { serializeLabProfile, normalizeLabProfile } = labProfile;
const { TEMPLATE_CATEGORIES, TEMPLATE_CATEGORY_IDS } = tplTypes;
const { createEmptyLabProfile, LAB_PROFILE_SIGNATURE, LAB_PROFILE_SCHEMA_VERSION } = lpTypes;

// ── Tiny async test harness ─────────────────────────────────────────────────
const tests = [];
function test(name, fn) {
  tests.push({ name, fn });
}

const EXAMPLE_SOP_ID = 'builtin.sops-work-instructions.example-sop';
const T0 = '2026-10-16T12:30:00.000Z';
const T1 = '2026-10-16T13:30:00.000Z';

const catalog = () => getBuiltinTemplates(); // deep-cloned per call
const labelFor = (cat) => TEMPLATE_CATEGORIES.find((c) => c.id === cat)?.label ?? cat;
const emptyProfile = () => createEmptyLabProfile();

/** Recursively collect every value stored under a key named `id`. */
function collectIds(value, out = []) {
  if (Array.isArray(value)) {
    for (const v of value) collectIds(v, out);
  } else if (value && typeof value === 'object') {
    for (const [k, v] of Object.entries(value)) {
      if (k === 'id' && typeof v === 'string') out.push(v);
      else collectIds(v, out);
    }
  }
  return out;
}

/** Distinct `data.type` values across every block of a list of documents. */
function blockTypeCensus(docs) {
  const types = new Set();
  for (const doc of docs) for (const b of doc.blocks) types.add(b.data.type);
  return types;
}

// ── 1. At least 16 distinct built-in templates ──────────────────────────────
test('1. catalog holds at least 16 distinct built-in templates', () => {
  const tpl = catalog();
  assert.ok(tpl.length >= 16, `expected >= 16 templates, got ${tpl.length}`);
  const ids = tpl.map((t) => t.id);
  const names = tpl.map((t) => t.name);
  assert.equal(new Set(ids).size, ids.length, 'root ids are distinct');
  assert.equal(new Set(names).size, names.length, 'template names are distinct');
  for (const t of tpl) assert.ok(t.origin === 'builtin' || t.origin === 'user', 'valid origin');
});

// ── 2. Every category has at least two templates ────────────────────────────
test('2. all eight categories carry at least two templates each', () => {
  const tpl = catalog();
  assert.equal(TEMPLATE_CATEGORY_IDS.length, 8, 'eight categories per specification');
  for (const id of TEMPLATE_CATEGORY_IDS) {
    assert.ok(isKnownCategory(id), `${id} known`);
    const inCategory = tpl.filter((t) => t.category === id);
    assert.ok(
      inCategory.length >= 2,
      `category ${id} has ${inCategory.length} templates (expected >= 2)`,
    );
  }
  // No template sits in a category outside the centralized list.
  for (const t of tpl) {
    assert.ok(
      TEMPLATE_CATEGORY_IDS.includes(t.category),
      `${t.id} category "${t.category}" is a registered id`,
    );
  }
});

// ── 3. The retained example SOP keeps its identity and content ──────────────
test('3. retained example SOP keeps its id, name, structure and defaults', () => {
  const tpl = catalog();
  const example = tpl.find((t) => t.id === EXAMPLE_SOP_ID);
  assert.ok(example, 'example SOP present');
  assert.equal(example.origin, 'builtin');
  assert.equal(example.name, 'Example Standard Operating Procedure');
  assert.equal(example.category, 'sops-work-instructions');
  assert.deepEqual([...example.tags], ['sop', 'procedure', 'example']);
  assert.equal(example.sections.length, 2);
  assert.equal(example.sections[0].name, 'Scope');
  assert.equal(example.sections[1].name, 'Responsibilities');
  assert.equal(example.defaults.metadata.title, 'Standard Operating Procedure');
  assert.equal(example.defaults.metadata.documentType, 'SOP');
  assert.equal(example.defaults.metadata.applicableStandard, 'ISO/IEC 17025:2017');
  // Byte-identical to a fresh P03-M1 build: the catalog did not fork the fixture.
  assert.equal(
    JSON.stringify(example),
    JSON.stringify(createExampleSopTemplate()),
    'catalog example === P03-M1 fixture',
  );
});

// ── 4. Every catalog template passes the shared validator ───────────────────
test('4. every catalog template passes validateTemplate', () => {
  const tpl = catalog();
  for (const t of tpl) {
    try {
      validateTemplate(t);
    } catch (e) {
      assert.fail(`${t.id} failed validateTemplate: ${e.message}`);
    }
  }
  assert.ok(tpl.length >= 16, 'validator did not drop any expected template');
});

// ── 5. .dstemplate round-trip without data loss ─────────────────────────────
test('5. every template round-trips through .dstemplate without data loss', () => {
  for (const t of catalog()) {
    const text = serializeTemplate(t);
    const back = deserializeTemplate(text);
    assert.equal(JSON.stringify(back), JSON.stringify(t), `${t.id}: deep-equal after round-trip`);
    assert.equal(serializeTemplate(back), text, `${t.id}: byte-stable round-trip`);
    assert.equal(back.id, t.id, `${t.id}: id preserved`);
    assert.equal(back.sections.length, t.sections.length, `${t.id}: sections preserved`);
  }
});

// ── 6. Root ids unique, reserved-form, stable across retrieval ──────────────
test('6. root ids are unique, reserved builtin.<category>.<slug> and stable', () => {
  const a = catalog();
  const b = catalog();
  assert.deepEqual(a.map((t) => t.id), b.map((t) => t.id), 'id list stable across retrieval');
  const seen = new Set();
  for (const t of a) {
    assert.ok(!seen.has(t.id), `duplicate root id ${t.id}`);
    seen.add(t.id);
    assert.ok(t.id.startsWith('builtin.'), `${t.id} uses the reserved builtin. prefix`);
    const slug = t.id.slice('builtin.'.length);
    assert.equal(slug, `${t.category}.${t.id.split('.').slice(2).join('.')}`, `${t.id} category segment matches t.category`);
    assert.ok(t.id.split('.').length >= 3, `${t.id} has a slug segment`);
    assert.ok(/^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(slug), `${t.id} slug is lowercase-kebab`);
  }
  assert.equal(seen.size, a.length);
  // Full deep identity: two retrievals serialize to identical bytes.
  assert.equal(JSON.stringify(a), JSON.stringify(b), 'retrieval is byte-stable (stable sub-ids)');
});

// ── 7. No id collisions within (or across) templates ────────────────────────
test('7. section/reference/starter-block ids never collide within a template', () => {
  const allAcrossCatalog = [];
  for (const t of catalog()) {
    const ids = collectIds(t);
    assert.ok(ids.length >= t.sections.length, `${t.id}: ids collected`);
    assert.equal(new Set(ids).size, ids.length, `${t.id}: no id collisions anywhere in template`);
    allAcrossCatalog.push(...ids);
  }
  assert.equal(
    new Set(allAcrossCatalog).size,
    allAcrossCatalog.length,
    'no id collisions across the whole catalog',
  );
});

// ── 8. Retrieval never mutates or corrupts the canonical catalog ────────────
test('8. repeated retrieval never mutates or corrupts the canonical catalog', () => {
  const snapshot = JSON.stringify(catalog());

  const first = catalog();
  assert.equal(JSON.stringify(first), snapshot, 'consecutive retrievals byte-identical');

  // A hostile consumer trims and edits its copy...
  first.splice(0, first.length);
  const hostile = getBuiltinTemplates();
  hostile[0].name = 'CORRUPTED';
  hostile[0].sections.length = 0;
  delete hostile[1].description;
  hostile[1].tags.push('injected');

  // ...and the canonical library is untouched.
  const after = catalog();
  assert.equal(JSON.stringify(after), snapshot, 'canonical survived consumer mutation');
  assert.ok(after.every((t) => t.name !== 'CORRUPTED'), 'no corrupted names leak');
  assert.ok(after.every((t) => t.sections.length > 0), 'no emptied templates leak');
  assert.ok(after.every((t) => typeof t.description === 'string'), 'no deleted descriptions leak');

  // The shared entry points return separate clone arrays (not one aliased list).
  assert.notEqual(getBuiltinTemplates(), getBuiltinTemplates(), 'fresh array per retrieval');
});

// ── 9. Catalog metadata and ordered sections are populated ──────────────────
test('9. names, descriptions, tags, authors and ordered sections are populated', () => {
  const tpl = catalog();
  for (const t of tpl) {
    assert.ok(t.name && t.name.trim().length >= 4, `${t.id}: meaningful name`);
    assert.ok(t.description && t.description.trim().length >= 40, `${t.id}: informative description`);
    assert.ok(isKnownCategory(t.category), `${t.id}: valid category`);
    assert.ok(TEMPLATE_CATEGORY_IDS.includes(t.category), `${t.id}: registered category`);
    assert.ok(Array.isArray(t.tags) && t.tags.length >= 3, `${t.id}: >= 3 searchable tags`);
    assert.equal(new Set(t.tags).size, t.tags.length, `${t.id}: tags distinct`);
    assert.ok(t.tags.every((tag) => typeof tag === 'string' && tag.length > 0), `${t.id}: tags non-empty`);
    assert.ok(t.author && t.author.trim().length > 0, `${t.id}: author present`);
    assert.ok(t.createdAt && t.updatedAt, `${t.id}: deterministic timestamps present`);

    assert.ok(t.sections.length >= 2, `${t.id}: has sections`);
    const sectionNames = t.sections.map((s) => s.name);
    assert.equal(
      new Set(sectionNames).size,
      sectionNames.length,
      `${t.id}: section names distinct within template`,
    );
    t.sections.forEach((s, i) => {
      assert.ok(s.name && s.name.trim().length >= 3, `${t.id}: section ${i} named`);
      // Order is the array position itself (TemplateSection has no order field);
      // the instantiated heading sequence is asserted in test 12.
      assert.ok(s.headingLevel >= 1 && s.headingLevel <= 4, `${t.id}: headingLevel in 1..4`);
      assert.ok(s.description || s.prompt, `${t.id}: section "${s.name}" carries guidance`);
    });

    assert.equal(typeof t.defaults.metadata, 'object', `${t.id}: defaults.metadata shape`);
    assert.ok(t.defaults.metadata !== null, `${t.id}: defaults.metadata present`);
    assert.equal(typeof t.defaults.metadata.title, 'string', `${t.id}: title default`);
  }
  // The fifteen new library templates are substantial starting structures.
  for (const t of tpl.filter((x) => x.id !== EXAMPLE_SOP_ID)) {
    assert.ok(t.sections.length >= 5, `${t.id}: >= 5 sections (got ${t.sections.length})`);
    const totalBlocks = t.sections.reduce((n, s) => n + s.blocks.length, 0);
    assert.ok(totalBlocks >= 5, `${t.id}: >= 5 starter blocks (got ${totalBlocks})`);
  }
});

// ── 10. Every template instantiates into a valid document ───────────────────
test('10. every template instantiates into a valid document', () => {
  const profile = normalizeLabProfile({ name: 'Verifier Lab', documentIdPrefix: 'VF-' });
  for (const t of catalog()) {
    try {
      const doc = instantiateTemplate(t, profile, T0);
      validateDocument(doc);
      assert.ok(t.defaults.metadata.title, `${t.id}: declares a title default`);
      assert.equal(doc.metadata.title, t.defaults.metadata.title, `${t.id}: title default applied`);
    } catch (e) {
      assert.fail(`${t.id} instantiation/validate failed: ${e.message}`);
    }
  }
});

// ── 11. Fresh document identity and instance timestamps ─────────────────────
test('11. instantiated documents get fresh identity and instance timestamps', () => {
  for (const t of catalog()) {
    const d1 = instantiateTemplate(t, emptyProfile(), T0);
    const d2 = instantiateTemplate(t, emptyProfile(), T1);

    assert.notEqual(d1.id, t.id, `${t.id}: document id differs from template id`);
    assert.notEqual(d1.id, d2.id, `${t.id}: fresh document id per instantiation`);
    assert.equal(d1.metadata.createdAt, T0, `${t.id}: createdAt stamped from supplied now`);
    assert.equal(d1.metadata.modifiedAt, T0, `${t.id}: modifiedAt stamped from supplied now`);
    assert.equal(d2.metadata.createdAt, T1, `${t.id}: second instantiation stamped T1`);

    const templateBlockIds = t.sections.flatMap((s) => s.blocks.map((b) => b.id));
    const docBlockIds = d1.blocks.map((b) => b.id);
    assert.equal(new Set(docBlockIds).size, docBlockIds.length, `${t.id}: doc block ids unique`);
    for (const id of templateBlockIds) {
      assert.ok(!docBlockIds.includes(id), `${t.id}: template block id ${id} must not leak`);
    }
    const d2BlockIds = new Set(d2.blocks.map((b) => b.id));
    for (const id of docBlockIds) {
      assert.ok(!d2BlockIds.has(id), `${t.id}: block ids differ per instantiation`);
    }
    // App-managed instance fields stay at their initial state.
    assert.deepEqual(d1.savedRevisions, [], `${t.id}: no revisions at creation`);
    assert.equal(d1.trackChangesEnabled, false, `${t.id}: track changes off at creation`);
    assert.equal(d1.metadata.documentId, '', `${t.id}: no preassigned document code`);
  }
});

// ── 12. Starter content and partial defaults survive instantiation ──────────
test('12. starter content and partial defaults survive instantiation', () => {
  const docs = [];
  for (const t of catalog()) {
    const doc = instantiateTemplate(t, emptyProfile(), T0);
    docs.push({ t, doc });

    // Flattening contract: one heading per section + every starter block.
    const expected = t.sections.length + t.sections.reduce((n, s) => n + s.blocks.length, 0);
    assert.equal(doc.blocks.length, expected, `${t.id}: flattened block count`);
    // Headings appear in section order.
    const headings = doc.blocks.filter((b) => b.data.type === 'heading');
    assert.deepEqual(
      headings.map((h) => h.data.text),
      t.sections.map((s) => s.name),
      `${t.id}: section headings in order`,
    );
    // Declared metadata defaults land on the document.
    for (const [key, value] of Object.entries(t.defaults.metadata)) {
      assert.deepEqual(doc.metadata[key], value, `${t.id}: defaults.metadata.${key} applied`);
    }
    // Document-instance fields are NOT taken from the template.
    assert.notEqual(doc.id, t.id);
    assert.equal(doc.metadata.createdAt, T0, `${t.id}: instance timestamp, not template timestamp`);
  }

  // Every starter block type used by the library survives into the document.
  const types = blockTypeCensus(docs.map((d) => d.doc));
  const required = [
    'heading', 'paragraph', 'table', 'list', 'callout', 'signature',
    'equipment-list', 'procedure-step', 'observation', 'measurement',
    'acceptance-criteria', 'calculation',
  ];
  for (const type of required) {
    assert.ok(types.has(type), `starter block type "${type}" present in instantiated documents`);
  }
  assert.ok(types.size >= required.length, `block-type diversity (got ${types.size})`);

  // Representative deep checks of specific rich content.
  const get = (id) => docs.find((d) => d.t.id === id).doc;
  const audit = get('builtin.quality-assurance.internal-audit-checklist');
  const auditTables = audit.blocks.filter((b) => b.data.type === 'table');
  assert.ok(auditTables.length >= 3, 'audit checklist keeps its tables (checklist + actions + id)');
  const quotation = get('builtin.financial-administrative.quotation');
  const qTable = quotation.blocks.find(
    (b) => b.data.type === 'table' && b.data.rows[0]?.cells.length === 6,
  );
  assert.ok(qTable, 'quotation keeps its 6-column item table');
  assert.equal(qTable.data.rows[0].cells[0].spans[0].text, '#', 'item table header survives');
  assert.equal(qTable.data.rows.length, 4, 'quotation table = header + 3 starter rows');
  const worksheet = get('builtin.worksheets-rough-datasheets.raw-observation-worksheet');
  const obs = worksheet.blocks.find((b) => b.data.type === 'observation');
  assert.equal(obs.data.rows.length, 4, 'worksheet observation rows survive');
  assert.ok(obs.data.rows.every((r) => r.observedValue === ''), 'worksheet starts empty (no invented results)');
  const uncertainty = get('builtin.final-datasheets-technical-records.measurement-uncertainty-summary');
  const calc = uncertainty.blocks.find((b) => b.data.type === 'calculation');
  assert.equal(calc.data.steps.length, 2, 'uncertainty formula steps survive');
  assert.ok(calc.data.steps[0].latex.includes('u_c'), 'generic combination formula present');
});

// ── 13. Laboratory Profile precedence still holds ───────────────────────────
test('13. saved profile precedence holds; no template hardcodes a lab name', () => {
  const profile = normalizeLabProfile({
    name: 'Representative Laboratory',
    documentIdPrefix: 'REP-',
    address: '1 Verification Way',
  });
  const representative = [
    'builtin.management-system.quality-policy',
    'builtin.technical-procedures.testing-calibration-procedure',
    EXAMPLE_SOP_ID,
    'builtin.financial-administrative.quotation',
    'builtin.quality-assurance.internal-audit-checklist',
  ];
  for (const id of representative) {
    const t = catalog().find((x) => x.id === id);
    const doc = instantiateTemplate(t, profile, T0);
    assert.equal(doc.labProfile.name, 'Representative Laboratory', `${id}: profile name wins`);
    assert.equal(doc.metadata.organizationName, 'Representative Laboratory', `${id}: profile org wins`);
    assert.equal(doc.labProfile.documentIdPrefix, 'REP-', `${id}: profile prefix wins`);
    assert.equal(doc.metadata.documentId, '', `${id}: document code never preassigned`);
    assert.equal(doc.metadata.title, t.defaults.metadata.title, `${id}: template title default kept`);
  }

  // With NO saved profile, library templates must not invent an identity —
  // only the retained example SOP keeps its documented 'Example Laboratory' demo default.
  for (const t of catalog()) {
    const doc = instantiateTemplate(t, emptyProfile(), T0);
    if (t.id === EXAMPLE_SOP_ID) {
      assert.equal(doc.labProfile.name, 'Example Laboratory', 'example keeps its demo default');
      assert.equal(doc.metadata.organizationName, 'Example Laboratory');
    } else {
      assert.equal(doc.labProfile.name, '', `${t.id}: no hardcoded laboratory name`);
      assert.equal(doc.metadata.organizationName, '', `${t.id}: no hardcoded organizationName`);
      assert.equal(t.defaults.labProfile, undefined, `${t.id}: no labProfile identity in defaults`);
      assert.equal(
        t.defaults.metadata.organizationName,
        undefined,
        `${t.id}: no organizationName in defaults`,
      );
    }
  }
});

// ── 14. Mutating an instantiated document never mutates the template ────────
test('14. mutating an instantiated document never mutates the source template', () => {
  for (const t of catalog()) {
    const snapshot = JSON.stringify(t);
    const doc = instantiateTemplate(t, emptyProfile(), T0);
    const docBefore = JSON.stringify(doc);

    // Deep mutation attempt: metadata, identity, nested starter content, blocks.
    doc.metadata.title = 'MUTATED TITLE';
    doc.metadata.organizationName = 'MUTATED ORG';
    doc.labProfile.name = 'MUTATED LAB';
    if (doc.blocks[0]?.data?.type === 'heading') doc.blocks[0].data.text = 'MUTATED HEADING';
    const withSpans = doc.blocks.find((b) => Array.isArray(b.data?.spans));
    if (withSpans) withSpans.data.spans[0].text = 'MUTATED TEXT';
    const withTable = doc.blocks.find((b) => b.data?.type === 'table');
    if (withTable) withTable.data.rows[0].cells[0].spans[0].text = 'MUTATED CELL';
    doc.blocks.push({
      id: 'mutated-injected-block',
      spacing: { topPt: 0, bottomPt: 0 },
      data: { type: 'paragraph', hAlign: 'left', indentLevel: 0, spans: [{ text: 'injected' }] },
    });

    assert.notEqual(JSON.stringify(doc), docBefore, `${t.id}: document mutation took effect`);
    assert.equal(JSON.stringify(t), snapshot, `${t.id}: source template untouched`);
  }
});

// ── 15. Search and category filter find every template ──────────────────────
test('15. chooser search and category filter find every template', () => {
  const tpl = catalog();
  for (const t of tpl) {
    assert.ok(matchesQuery(t, t.name.toLowerCase()), `${t.id}: found by name`);
    assert.ok(matchesQuery(t, t.name.toUpperCase()), `${t.id}: found by name (case-insensitive)`);
    const firstTag = t.tags[0];
    assert.ok(matchesQuery(t, firstTag), `${t.id}: found by tag "${firstTag}"`);
    assert.ok(
      filterTemplates(tpl, t.name.toLowerCase(), null).some((x) => x.id === t.id),
      `${t.id}: survives name filter end-to-end`,
    );
    const byCategory = filterTemplates(tpl, '', t.category);
    assert.ok(byCategory.some((x) => x.id === t.id), `${t.id}: found via category filter`);
    for (const x of byCategory) {
      assert.equal(x.category, t.category, `${t.id}: category filter contains only ${t.category}`);
    }
  }
  // No-match still yields an empty template list (blank handled in test 16).
  assert.deepEqual(filterTemplates(tpl, 'zzz-nothing-matches-this', null), [], 'no false matches');
});

// ── 16. Blank Document remains first-class and unaffected ───────────────────
test('16. Blank Document remains a first-class, unaffected choice', async () => {
  const tpl = catalog();
  assert.equal(typeof BLANK_CHOICE_ID, 'string');

  const choices = buildChoiceList(tpl, labelFor);
  assert.equal(choices.length, tpl.length + 1, 'blank + every template');
  assert.equal(choices[0].id, BLANK_CHOICE_ID, 'blank listed first');
  assert.equal(choices[0].name, 'Blank Document');
  assert.equal(choices[0].template, undefined, 'blank carries no template');
  assert.deepEqual(choices[0].sections, []);

  // Blank survives filtering with zero template matches.
  const onlyBlank = buildChoiceList(filterTemplates(tpl, 'zzz-nothing', null), labelFor);
  assert.equal(onlyBlank.length, 1);
  assert.equal(onlyBlank[0].id, BLANK_CHOICE_ID);

  // Choosing blank creates a valid, truly empty document through the same flow.
  const blankChoice = choices[0];
  const doc = await resolveChooserSelection(blankChoice, emptyProfile(), T0, async () => 'proceed');
  assert.ok(doc, 'blank selection yields a document');
  validateDocument(doc);
  assert.deepEqual(doc.blocks, [], 'blank document has no blocks');
  assert.notEqual(doc.id, BLANK_CHOICE_ID, 'document id is not the choice sentinel');
});

// ── 17. Templates are meaningfully distinct (no boilerplate cloning) ─────────
test('17. templates do not share an identical generic set of sections/content', () => {
  const tpl = catalog();

  // (a) Every template has its own section-name signature.
  const signatures = tpl.map((t) => t.sections.map((s) => s.name).join(' | '));
  assert.equal(new Set(signatures).size, signatures.length, 'section signatures all distinct');

  // (b) Templates within the same category differ from each other.
  for (const cat of TEMPLATE_CATEGORY_IDS) {
    const inCat = tpl.filter((t) => t.category === cat);
    const sigs = inCat.map((t) => t.sections.map((s) => s.name).join(' | '));
    assert.equal(new Set(sigs).size, sigs.length, `${cat}: templates differ within category`);
  }

  // (c) The catalog is built from many distinct section names, not a small shell.
  const distinctSectionNames = new Set(tpl.flatMap((t) => t.sections.map((s) => s.name)));
  assert.ok(
    distinctSectionNames.size >= 60,
    `expected >= 60 distinct section names, got ${distinctSectionNames.size}`,
  );

  // (d) Starter block content differs: not every template repeats one text.
  const firstParagraphs = tpl.map((t) => {
    for (const s of t.sections) {
      const p = s.blocks.find((b) => b.data.type === 'paragraph');
      if (p) return p.data.spans[0].text;
    }
    return null;
  });
  const nonEmpty = firstParagraphs.filter(Boolean);
  assert.ok(
    new Set(nonEmpty).size === nonEmpty.length,
    'no two templates open with identical starter paragraph text',
  );

  // (e) Descriptions are distinct too (chooser list must read distinctly).
  const descriptions = tpl.map((t) => t.description);
  assert.equal(new Set(descriptions).size, descriptions.length, 'descriptions all distinct');
});

// ── 18. Existing P02/P03 behavior has no regression (in-script smoke) ───────
test('18. existing P02/P03 document, template and profile behavior has no regression', () => {
  // P02-M2/M3: document round-trip + lifecycle.
  const doc = docActions.createNewDocument(T0);
  const text = serializeDocument(doc);
  assert.equal(deserializeDocument(text).id, doc.id);
  assert.equal(deserializeDocument(text).schemaVersion, doc.schemaVersion);
  const edited = docActions.updateDocumentMetadata(doc, { title: 'X' }, T1);
  assert.notEqual(edited.metadata.modifiedAt, doc.metadata.modifiedAt, 'real edit stamps modifiedAt');
  const fp = docActions.sessionFingerprint(edited);
  assert.equal(docActions.isDirty(fp, docActions.sessionFingerprint(doc)), true);
  assert.equal(docActions.deriveSessionStatus(fp, fp, false), 'New');
  assert.equal(docActions.deriveSessionStatus(fp, fp, true), 'Saved');

  // P03-M1: deterministic example-template round-trip.
  const t = createExampleSopTemplate();
  const tText = serializeTemplate(t);
  assert.equal(serializeTemplate(deserializeTemplate(tText)), tText, 'deterministic round-trip');
  assert.equal(t.id, EXAMPLE_SOP_ID);

  // P03-M2: lab-profile serialize/parse stays distinct and stable.
  const prof = normalizeLabProfile({ name: 'Regression Lab', documentIdPrefix: 'RG-' });
  const profText = serializeLabProfile(prof);
  assert.ok(profText.includes(LAB_PROFILE_SIGNATURE), 'profile signature present');
  const parsed = JSON.parse(profText);
  assert.equal(parsed.schemaVersion, LAB_PROFILE_SCHEMA_VERSION, 'profile schema version stable');
  assert.equal(parsed.name, 'Regression Lab');

  // The full regression evidence is the sibling suite executed with this script:
  // verify:p02-m2/m3/m4/m5, verify:p03-m1, verify:p03-m2 (see project_roadmap.md).
});

// ── Summary ─────────────────────────────────────────────────────────────────
const run = async () => {
  let passed = 0;
  const failed = [];
  for (const t of tests) {
    try {
      await t.fn();
      passed += 1;
      console.log(`PASS  ${t.name}`);
    } catch (e) {
      failed.push(t.name);
      console.error(`FAIL  ${t.name}\n      ${e && e.message}\n${e && e.stack ? String(e.stack).split('\n').slice(1, 4).map((l) => `      ${l.trim()}`).join('\n') : ''}`);
    }
  }
  console.log(`\nP03-M3 verification: ${passed} passed, ${failed.length} failed.`);
  if (failed.length > 0) {
    console.error(`Failed: ${failed.join(', ')}`);
    process.exit(1);
  }
};

await run();
