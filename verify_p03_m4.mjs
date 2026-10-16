/**
 * P03-M4 — Template section customization
 * ═══════════════════════════════════════════════════════════════════════════
 * Exercises the ACTUAL modules:
 *   • src/services/template-customization.ts  (pure draft/section operations)
 *   • src/services/template-chooser.ts        (search/filter, guarded selection)
 *   • src/services/template-library/index.ts  (authoritative built-in catalog)
 *   • src/services/template-instantiation.ts  (precedence, deep-copy/remint)
 *   • src/services/template-samples.ts        (retained deterministic example SOP)
 *   • src/services/template-file.ts           (.dstemplate serialize/validate)
 *   • src/services/document-file.ts           (.docstudio serialize/validate)
 *   • src/services/lab-profile.ts             (profile normalize/serialize)
 *   • src/services/document-actions.ts        (guard/lifecycle smoke)
 * compiled with tsc and run in Node with the built-in assert module —
 * no testing framework is introduced.
 *
 * Coverage (mirrors the P03-M4 checklist, 22 items):
 *   1. A template draft is independent from the canonical built-in template.
 *   2. The original Example SOP and representative templates remain
 *      byte-identical after draft edits.
 *   3. Adding a section produces a fresh, unique ID and a valid section.
 *   4. Renaming changes only the intended fields and preserves ID/content.
 *   5. Empty section names (and other invalid edits) are handled safely.
 *   6. Removing a section preserves all other sections and content.
 *   7. Removing the last section follows the documented policy and leaves a
 *      valid template (still distinct from Blank Document).
 *   8. Moving sections up/down produces the correct order.
 *   9. Moving beyond the first/last position is prevented/safe.
 *  10. Descriptions and prompts can be edited and cleared.
 *  11. Unrelated tags, category, defaults, assets and metadata remain unchanged.
 *  12. The customized draft passes validateTemplate and .dstemplate round-trip.
 *  13. A document from the customized draft reflects add/remove/rename/reorder.
 *  14. Generated document IDs and block IDs obey the existing identity rules.
 *  15. Editing a generated document mutates neither draft nor canonical.
 *  16. Re-opening the chooser / re-requesting the catalog returns canonical.
 *  17. Selecting another template does not carry stale changes into its draft.
 *  18. Blank Document remains unaffected.
 *  19. Existing template search/category filtering remains functional.
 *  20. Existing saved Laboratory Profile precedence still works.
 *  21. New/Cancel and Save/Discard/Cancel session safety remains unchanged.
 *  22. Existing P02/P03 behavior has no regression (in-script smoke; the full
 *      regression evidence is the npm verify:p02-* / verify:p03-m1/m2/m3 suite
 *      executed alongside this script).
 *
 * Usage: node verify_p03_m4.mjs   (or: npm run verify:p03-m4)
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
const outDir = mkdtempSync(path.join(tmpdir(), 'ds-p03-m4-'));
execSync(
  'npx tsc src/services/template-customization.ts src/services/template-library/index.ts' +
    ' src/services/template-chooser.ts src/services/template-instantiation.ts' +
    ' src/services/template-samples.ts src/services/template-file.ts' +
    ' src/services/lab-profile.ts src/services/document-file.ts' +
    ' src/services/document-actions.ts' +
    ' src/types/template.ts src/types/template-defaults.ts src/types/lab-profile.ts' +
    ' src/types/blocks.ts src/types/document.ts src/types/defaults.ts src/types/index.ts' +
    ` --outDir "${outDir}" --module commonjs --target es2020 --moduleResolution node --esModuleInterop --skipLibCheck`,
  { cwd: root, stdio: 'inherit' },
);

const customization = require(path.join(outDir, 'services', 'template-customization.js'));
const chooser = require(path.join(outDir, 'services', 'template-chooser.js'));
const inst = require(path.join(outDir, 'services', 'template-instantiation.js'));
const tplSamples = require(path.join(outDir, 'services', 'template-samples.js'));
const tplFile = require(path.join(outDir, 'services', 'template-file.js'));
const docFile = require(path.join(outDir, 'services', 'document-file.js'));
const docActions = require(path.join(outDir, 'services', 'document-actions.js'));
const labProfile = require(path.join(outDir, 'services', 'lab-profile.js'));
const library = require(path.join(outDir, 'services', 'template-library', 'index.js'));
const tplTypes = require(path.join(outDir, 'types', 'template.js'));
const lpTypes = require(path.join(outDir, 'types', 'lab-profile.js'));

const {
  DEFAULT_NEW_SECTION_NAME,
  addSection,
  createTemplateDraft,
  draftFor,
  findDraftIssues,
  isTemplateDraftModified,
  moveSection,
  removeSection,
  renameSection,
  setSectionHeadingLevel,
  updateSectionDescription,
  updateSectionPrompt,
  withDraftResult,
} = customization;
const {
  BLANK_CHOICE_ID,
  buildChoiceList,
  filterTemplates,
  getBuiltinTemplates,
  isKnownCategory,
  matchesQuery,
  resolveChooserSelection,
} = chooser;
const { instantiateTemplate } = inst;
const { createExampleSopTemplate } = tplSamples;
const { serializeTemplate, deserializeTemplate, validateTemplate } = tplFile;
const { serializeDocument, deserializeDocument, validateDocument } = docFile;
const { serializeLabProfile, normalizeLabProfile } = labProfile;
const { getBuiltinCatalogTemplates } = library;
const { TEMPLATE_CATEGORIES, TEMPLATE_CATEGORY_IDS } = tplTypes;
const { createEmptyLabProfile, LAB_PROFILE_SIGNATURE, LAB_PROFILE_SCHEMA_VERSION } = lpTypes;

// ── Tiny async test harness ─────────────────────────────────────────────────
const tests = [];
function test(name, fn) {
  tests.push({ name, fn });
}

const EXAMPLE_SOP_ID = 'builtin.sops-work-instructions.example-sop';
const T0 = '2026-10-16T14:30:00.000Z';
const T1 = '2026-10-16T15:30:00.000Z';

const labelFor = (cat) => TEMPLATE_CATEGORIES.find((c) => c.id === cat)?.label ?? cat;
const emptyProfile = () => createEmptyLabProfile();

/** Fresh canonical catalog retrieval (deep-cloned per call). */
const catalog = () => getBuiltinTemplates();
const byId = (id) => {
  const tpl = catalog().find((t) => t.id === id);
  assert.ok(tpl, `catalog contains ${id}`);
  return tpl;
};

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

// Canonical byte-snapshots taken BEFORE any draft work (re-asserted later).
const CATALOG_SNAPSHOT = JSON.stringify(catalog());
const EXAMPLE_NAMES = byId(EXAMPLE_SOP_ID).sections.map((s) => s.name);
const QP_ID = 'builtin.management-system.quality-policy';
const QP_NAMES = byId(QP_ID).sections.map((s) => s.name);

// ── 1. Draft is independent from the canonical built-in template ────────────
test('1. a template draft is independent from the canonical built-in template', () => {
  const src = byId(QP_ID);
  const draft = createTemplateDraft(src);
  assert.notEqual(draft, src, 'draft is a different object');
  assert.notEqual(draft.sections, src.sections, 'draft sections array is a different object');
  assert.notEqual(draft.sections[0], src.sections[0], 'draft section objects are copied');
  assert.equal(JSON.stringify(draft), JSON.stringify(src), 'initially identical content');
  // Creating the draft does not disturb the catalog either.
  assert.equal(JSON.stringify(catalog()), CATALOG_SNAPSHOT, 'catalog untouched by draft creation');
  // Editing the draft leaves the source alone.
  const renamed = renameSection(draft, draft.sections[0].id, 'Edited in draft');
  assert.equal(renamed.ok, true);
  assert.equal(src.sections[0].name, QP_NAMES[0], 'source name unchanged after draft rename');
  assert.equal(JSON.stringify(src), JSON.stringify(catalog().find((t) => t.id === QP_ID)), 'source object itself was never mutated');
  assert.notEqual(renamed.draft.sections[0].name, QP_NAMES[0], 'draft holds the new name');
  assert.equal(isTemplateDraftModified(renamed.draft, src), true, 'modified flag detects the edit');
  assert.equal(isTemplateDraftModified(createTemplateDraft(src), src), false, 'fresh clone is not modified');
});

// ── 2. Example SOP + representatives stay byte-identical after edits ────────
test('2. Example SOP and representative templates stay byte-identical after draft edits', () => {
  const reps = [EXAMPLE_SOP_ID, QP_ID, 'builtin.financial-administrative.quotation'];
  const before = Object.fromEntries(reps.map((id) => [id, JSON.stringify(byId(id))]));

  // Heavy edit session on each representative's draft.
  for (const id of reps) {
    let draft = createTemplateDraft(byId(id));
    draft = renameSection(draft, draft.sections[0].id, 'Edited name').draft;
    draft = addSection(draft, 'Brand new section').draft;
    draft = moveSection(draft, draft.sections[draft.sections.length - 1].id, 'up').draft;
    if (draft.sections.length > 1) {
      draft = removeSection(draft, draft.sections[1].id).draft;
    }
    draft = updateSectionDescription(draft, draft.sections[0].id, 'Touched').draft;
    assert.equal(isTemplateDraftModified(draft, byId(id)), true);
  }

  for (const id of reps) {
    assert.equal(JSON.stringify(byId(id)), before[id], `${id} byte-identical after draft edits`);
  }
  assert.equal(JSON.stringify(catalog()), CATALOG_SNAPSHOT, 'whole catalog still byte-identical');
  // The retained example is still exactly the P03-M1 fixture.
  assert.equal(
    JSON.stringify(byId(EXAMPLE_SOP_ID)),
    JSON.stringify(createExampleSopTemplate()),
    'example SOP still equals the P03-M1 fixture',
  );
});

// ── 3. Adding a section → fresh unique id + valid section ───────────────────
test('3. adding a section produces a fresh unique ID and a valid section', () => {
  const src = byId(EXAMPLE_SOP_ID);
  const existingIds = new Set(collectIds(src));
  const draft = createTemplateDraft(src);

  const res = addSection(draft, 'Added Section');
  assert.equal(res.ok, true);
  assert.equal(res.draft.sections.length, src.sections.length + 1, 'one section appended');
  const added = res.draft.sections[res.draft.sections.length - 1];
  assert.ok(!existingIds.has(added.id), 'added section id is fresh (no collision)');
  assert.match(added.id, /^[0-9a-f-]{36}$/, 'added id is a UUID');
  assert.equal(added.name, 'Added Section');
  assert.equal(added.headingLevel, 2, 'suitable default heading level');
  assert.deepEqual(added.blocks, [], 'no starter blocks');
  assert.equal(added.description, undefined);
  assert.equal(added.prompt, undefined);
  assert.equal(src.sections.length, 2, 'source section count unchanged');

  // Defaults and explicit options.
  const def = addSection(createTemplateDraft(src));
  assert.equal(def.ok, true);
  assert.equal(def.draft.sections[2].name, DEFAULT_NEW_SECTION_NAME, 'non-empty default name');
  const withOpts = addSection(draft, 'Rich Section', {
    description: 'Why it exists',
    prompt: 'Fill this in',
    headingLevel: 3,
  });
  assert.equal(withOpts.ok, true);
  const rich = withOpts.draft.sections[withOpts.draft.sections.length - 1];
  assert.equal(rich.description, 'Why it exists');
  assert.equal(rich.prompt, 'Fill this in');
  assert.equal(rich.headingLevel, 3);
});

// ── 4. Renaming touches only the name ───────────────────────────────────────
test('4. renaming changes only the intended fields and preserves id/content', () => {
  const src = byId(QP_ID);
  const draft = createTemplateDraft(src);
  const target = draft.sections[1];
  const res = renameSection(draft, target.id, 'A Brand New Heading');
  assert.equal(res.ok, true);

  const expected = JSON.stringify({ ...target, name: 'A Brand New Heading' });
  assert.equal(JSON.stringify(res.draft.sections[1]), expected, 'only the name differs (key order included)');
  assert.equal(res.draft.sections[1].id, target.id, 'id preserved');
  assert.deepEqual(res.draft.sections[1].blocks, target.blocks, 'blocks preserved');
  assert.equal(res.draft.sections[1].headingLevel, target.headingLevel, 'heading level preserved');
  assert.equal(res.draft.sections[1].description, target.description, 'description preserved');
  assert.equal(res.draft.sections[1].prompt, target.prompt, 'prompt preserved');
  assert.equal(res.draft.sections[1].references, undefined);
  // Every other section is deep-equal.
  assert.equal(JSON.stringify(res.draft.sections[0]), JSON.stringify(draft.sections[0]));
  assert.equal(JSON.stringify(res.draft.sections.slice(2)), JSON.stringify(draft.sections.slice(2)));
  // Original array order of untouched sections preserved.
  assert.deepEqual(res.draft.sections.map((s) => s.id), draft.sections.map((s) => s.id));
});

// ── 5. Empty/invalid edits rejected safely (all deterministic codes) ────────
test('5. empty names, missing/duplicate ids and invalid fields are handled safely', () => {
  const src = byId(EXAMPLE_SOP_ID);
  const draft = createTemplateDraft(src);
  const id0 = draft.sections[0].id;

  const expectFail = (res, code, input) => {
    assert.equal(res.ok, false, `${code} must fail`);
    assert.equal(res.code, code);
    assert.ok(typeof res.message === 'string' && res.message.length > 0, 'human-readable message');
    assert.equal(res.draft, input, 'failure returns the input untouched');
  };

  expectFail(renameSection(draft, id0, ''), 'empty-name', draft);
  expectFail(renameSection(draft, id0, '   '), 'empty-name', draft);
  expectFail(addSection(draft, ''), 'empty-name', draft);
  expectFail(addSection(draft, '  \t '), 'empty-name', draft);
  expectFail(renameSection(draft, '', 'X'), 'missing-section', draft);
  expectFail(renameSection(draft, 'does-not-exist', 'X'), 'missing-section', draft);
  expectFail(removeSection(draft, 'does-not-exist'), 'missing-section', draft);
  expectFail(moveSection(draft, 'does-not-exist', 'up'), 'missing-section', draft);
  expectFail(updateSectionDescription(draft, id0, 42), 'invalid-field', draft);
  expectFail(updateSectionPrompt(draft, id0, null), 'invalid-field', draft);
  expectFail(moveSection(draft, id0, 'sideways'), 'invalid-field', draft);
  expectFail(setSectionHeadingLevel(draft, id0, 7), 'invalid-heading-level', draft);
  expectFail(setSectionHeadingLevel(draft, id0, 2.5), 'invalid-heading-level', draft);
  expectFail(addSection(draft, 'Fine', { headingLevel: 0 }), 'invalid-heading-level', draft);

  // Duplicate section id → ambiguous, never guessed.
  const dup = JSON.parse(JSON.stringify(draft));
  dup.sections.push(JSON.parse(JSON.stringify(draft.sections[0])));
  expectFail(renameSection(dup, id0, 'X'), 'duplicate-section-id', dup);
  expectFail(removeSection(dup, id0), 'duplicate-section-id', dup);
  assert.deepEqual(findDraftIssues(dup), ['duplicate-section-id'], 'lint reports exactly the duplicate');
  assert.deepEqual(findDraftIssues(draft), [], 'clean draft has no issues');

  // Successful heading-level rule.
  const leveled = setSectionHeadingLevel(draft, id0, 4);
  assert.equal(leveled.ok, true);
  assert.equal(leveled.draft.sections[0].headingLevel, 4);

  // Draft content untouched by all the rejected attempts above.
  assert.equal(JSON.stringify(draft), JSON.stringify(createTemplateDraft(src)));
});

// ── 6. Removing a section preserves everything else ─────────────────────────
test('6. removing a section preserves all other sections and content', () => {
  const src = byId(QP_ID);
  const draft = createTemplateDraft(src);
  const victim = draft.sections[2];
  const idsBefore = draft.sections.map((s) => s.id);
  const res = removeSection(draft, victim.id);
  assert.equal(res.ok, true);
  assert.equal(res.draft.sections.length, src.sections.length - 1, 'exactly one removed');
  assert.ok(!res.draft.sections.some((s) => s.id === victim.id), 'victim gone');
  assert.deepEqual(
    res.draft.sections.map((s) => s.id),
    idsBefore.filter((id) => id !== victim.id),
    'remaining ids keep their original order',
  );
  for (const section of res.draft.sections) {
    const original = draft.sections.find((s) => s.id === section.id);
    assert.equal(JSON.stringify(section), JSON.stringify(original), `${section.name} content byte-identical`);
  }
  assert.equal(draft.sections.length, src.sections.length, 'input draft untouched on success copy');
  assert.equal(JSON.stringify(draft), JSON.stringify(src));
});

// ── 7. Removing the last section (documented policy) ────────────────────────
test('7. removing the last section yields a valid template, distinct from Blank', async () => {
  const src = byId(EXAMPLE_SOP_ID);
  let draft = createTemplateDraft(src);
  draft = removeSection(draft, draft.sections[0].id).draft;
  assert.equal(draft.sections.length, 1, 'one left');
  draft = removeSection(draft, draft.sections[0].id).draft;
  assert.equal(draft.sections.length, 0, 'documented policy: an empty section list is allowed');

  validateTemplate(draft); // shared validator accepts sections: []
  assert.deepEqual(findDraftIssues(draft), [], 'no lint issues on the empty draft');

  // It instantiates into a valid, truly starter-less document...
  const doc = instantiateTemplate(draft, emptyProfile(), T0);
  validateDocument(doc);
  assert.deepEqual(doc.blocks, [], 'no starter blocks');
  // ...but it is NOT Blank Document: template identity/defaults still apply.
  assert.equal(doc.metadata.title, src.defaults.metadata.title, 'template title default applied');
  assert.notEqual(doc.metadata.title, 'Untitled Document', 'not the blank-document title');

  // Chooser level: the choice keeps the template id (never the blank sentinel).
  const choices = buildChoiceList([draft], labelFor);
  assert.equal(choices[0].id, BLANK_CHOICE_ID, 'blank still first');
  assert.equal(choices[1].id, EXAMPLE_SOP_ID, 'empty-section template keeps its id');
  assert.notEqual(choices[1].id, BLANK_CHOICE_ID);
  assert.deepEqual(choices[1].sections, [], 'preview shows no sections');
  const doc2 = await resolveChooserSelection(choices[1], emptyProfile(), T0, async () => 'proceed');
  validateDocument(doc2);
  assert.deepEqual(doc2.blocks, [], 'creating it yields a document without starter blocks');

  // The zero-section draft also round-trips through .dstemplate.
  const text = serializeTemplate(draft);
  assert.equal(serializeTemplate(deserializeTemplate(text)), text, 'byte-stable round-trip');
});

// ── 8. Moving sections produces the correct order ───────────────────────────
test('8. moving sections up/down produces the correct ordered list', () => {
  const src = byId(QP_ID); // 6 sections
  const draft = createTemplateDraft(src);
  const ids = draft.sections.map((s) => s.id);
  const contentById = Object.fromEntries(draft.sections.map((s) => [s.id, JSON.stringify(s)]));

  // last → up, last → up (now at index 3), first → down.
  let next = moveSection(draft, ids[5], 'up').draft;
  assert.deepEqual(next.sections.map((s) => s.id), [ids[0], ids[1], ids[2], ids[3], ids[5], ids[4]]);
  next = moveSection(next, ids[5], 'up').draft;
  assert.deepEqual(next.sections.map((s) => s.id), [ids[0], ids[1], ids[2], ids[5], ids[3], ids[4]]);
  next = moveSection(next, ids[0], 'down').draft;
  assert.deepEqual(next.sections.map((s) => s.id), [ids[1], ids[0], ids[2], ids[5], ids[3], ids[4]]);
  // Move back to the original order, one step at a time.
  next = moveSection(next, ids[0], 'up').draft;
  next = moveSection(next, ids[5], 'down').draft;
  next = moveSection(next, ids[5], 'down').draft;
  assert.deepEqual(next.sections.map((s) => s.id), ids, 'round-trip restores the original order');

  // Every moved section kept its complete content.
  for (const section of next.sections) {
    assert.equal(JSON.stringify(section), contentById[section.id], `${section.id} content preserved`);
  }
  assert.equal(JSON.stringify(draft), JSON.stringify(src), 'input untouched');
});

// ── 9. Out-of-range moves are prevented/safe ────────────────────────────────
test('9. moving beyond the first/last position is prevented safely', () => {
  const draft = createTemplateDraft(byId(QP_ID));
  const first = draft.sections[0];
  const last = draft.sections[draft.sections.length - 1];

  const up = moveSection(draft, first.id, 'up');
  assert.equal(up.ok, false);
  assert.equal(up.code, 'out-of-range');
  assert.equal(up.draft, draft, 'input returned untouched');
  assert.ok(up.message.includes('already first'), 'understandable message');

  const down = moveSection(draft, last.id, 'down');
  assert.equal(down.ok, false);
  assert.equal(down.code, 'out-of-range');
  assert.equal(down.draft, draft);
  assert.ok(down.message.includes('already last'));

  // Single-section template: both directions out of range.
  const one = createTemplateDraft(draft);
  one.sections = one.sections.slice(0, 1);
  assert.equal(moveSection(one, one.sections[0].id, 'up').ok, false);
  assert.equal(moveSection(one, one.sections[0].id, 'down').ok, false);
  assert.equal(JSON.stringify(draft), JSON.stringify(createTemplateDraft(byId(QP_ID))));
});

// ── 10. Descriptions and prompts: edit + clean clearing ─────────────────────
test('10. descriptions and prompts can be edited and cleared cleanly', () => {
  const src = byId(EXAMPLE_SOP_ID);
  const draft = createTemplateDraft(src);
  const id0 = draft.sections[0].id;
  const original0 = JSON.stringify(draft.sections[0]);

  const setDesc = updateSectionDescription(draft, id0, 'Purpose of this section');
  assert.equal(setDesc.ok, true);
  assert.equal(setDesc.draft.sections[0].description, 'Purpose of this section');
  // The example section started WITH a description, so restoring its original
  // value must reproduce the original section byte-for-byte.
  assert.equal(
    JSON.stringify({ ...setDesc.draft.sections[0], description: src.sections[0].description }),
    original0,
    'only the description changed',
  );

  const setPrompt = updateSectionPrompt(setDesc.draft, id0, 'Replace with your own text.');
  assert.equal(setPrompt.ok, true);
  assert.equal(setPrompt.draft.sections[0].prompt, 'Replace with your own text.');
  assert.equal(setPrompt.draft.sections[0].description, 'Purpose of this section', 'description kept');

  // Clearing removes the KEY (clean JSON shape), never leaves ''.
  const cleared = updateSectionDescription(setPrompt.draft, id0, '');
  assert.equal(cleared.ok, true);
  assert.equal('description' in cleared.draft.sections[0], false, 'description key removed');
  const clearedWs = updateSectionPrompt(cleared.draft, id0, '   ');
  assert.equal(clearedWs.ok, true);
  assert.equal('prompt' in clearedWs.draft.sections[0], false, 'prompt key removed');

  // Blocks / references / heading level / name / id all intact throughout.
  const final0 = clearedWs.draft.sections[0];
  assert.equal(final0.id, id0);
  assert.equal(final0.name, src.sections[0].name);
  assert.equal(final0.headingLevel, src.sections[0].headingLevel);
  assert.deepEqual(final0.blocks, src.sections[0].blocks);
  assert.equal(JSON.stringify(clearedWs.draft.sections[1]), JSON.stringify(src.sections[1]));
  assert.equal(JSON.stringify(draft), JSON.stringify(src), 'input draft untouched');
});

// ── 11. Unrelated template metadata remains unchanged ───────────────────────
test('11. tags, category, defaults, assets and template metadata remain unchanged', () => {
  const src = byId(QP_ID);
  let draft = createTemplateDraft(src);
  draft = renameSection(draft, draft.sections[0].id, 'Renamed').draft;
  draft = addSection(draft, 'Added').draft;
  draft = removeSection(draft, draft.sections[1].id).draft;
  draft = moveSection(draft, draft.sections[0].id, 'down').draft;
  draft = updateSectionDescription(draft, draft.sections[0].id, 'D').draft;
  draft = updateSectionPrompt(draft, draft.sections[0].id, 'P').draft;

  // EVERY top-level key except `sections` is byte-identical.
  assert.equal(
    JSON.stringify({ ...draft, sections: null }),
    JSON.stringify({ ...src, sections: null }),
    'all top-level fields except sections unchanged',
  );
  assert.deepEqual(draft.tags, src.tags, 'tags unchanged');
  assert.equal(draft.category, src.category, 'category unchanged');
  assert.equal(draft.name, src.name, 'template name unchanged (read-only by design)');
  assert.equal(draft.description, src.description);
  assert.equal(draft.id, src.id, 'template id unchanged (never converted/renamed)');
  assert.equal(draft.origin, src.origin);
  assert.equal(draft.createdAt, src.createdAt);
  assert.equal(draft.updatedAt, src.updatedAt, 'updatedAt deliberately not bumped');
  assert.deepEqual(draft.defaults, src.defaults, 'defaults deep-identical');
  assert.deepEqual(draft.assets, src.assets, 'assets deep-identical');
  assert.equal(draft.__type, src.__type);
  assert.equal(draft.schemaVersion, src.schemaVersion);
  // And no operation ever writes into the source object.
  assert.equal(JSON.stringify(src), JSON.stringify(catalog().find((t) => t.id === QP_ID)));
});

// ── 12. Draft passes validateTemplate + .dstemplate round-trip ──────────────
test('12. customized drafts pass validateTemplate and .dstemplate round-trip', () => {
  const heavy = () => {
    let draft = createTemplateDraft(byId('builtin.technical-procedures.testing-calibration-procedure'));
    draft = renameSection(draft, draft.sections[0].id, 'Scope and Application').draft;
    draft = addSection(draft, 'Custom Records', { headingLevel: 3, description: 'd', prompt: 'p' }).draft;
    draft = moveSection(draft, draft.sections[draft.sections.length - 1].id, 'up').draft;
    draft = removeSection(draft, draft.sections[2].id).draft;
    draft = updateSectionDescription(draft, draft.sections[0].id, '').draft;
    draft = updateSectionPrompt(draft, draft.sections[1].id, 'Check values').draft;
    return draft;
  };

  const draft = heavy();
  validateTemplate(draft); // shared validator accepts the customized draft
  assert.deepEqual(findDraftIssues(draft), [], 'no lint issues');
  const text = serializeTemplate(draft);
  const back = deserializeTemplate(text);
  assert.equal(JSON.stringify(back), JSON.stringify(draft), 'deep-equal after round-trip');
  assert.equal(serializeTemplate(back), text, 'byte-stable round-trip');
  assert.equal(back.id, draft.id, 'template id preserved through the file round-trip');
  assert.equal(back.sections.length, draft.sections.length);

  // Customized (renamed + re-leveled) example draft round-trips too.
  let simple = createTemplateDraft(byId(EXAMPLE_SOP_ID));
  simple = renameSection(simple, simple.sections[0].id, 'Scope of Work').draft;
  simple = setSectionHeadingLevel(simple, simple.sections[0].id, 3).draft;
  validateTemplate(simple);
  assert.equal(
    serializeTemplate(deserializeTemplate(serializeTemplate(simple))),
    serializeTemplate(simple),
    'example customization round-trips byte-stable',
  );
});

// ── 13. Document reflects add/remove/rename/reorder ──────────────────────────
test('13. a document from the customized draft reflects all section edits', () => {
  let draft = createTemplateDraft(byId(EXAMPLE_SOP_ID));
  const scopeId = draft.sections[0].id; // "Scope"
  const respId = draft.sections[1].id; // "Responsibilities"

  draft = renameSection(draft, scopeId, 'Scope and Purpose').draft;
  draft = removeSection(draft, respId).draft;
  const added = addSection(draft, 'Records').draft;
  draft = added;
  const recordsId = added.sections[added.sections.length - 1].id;
  draft = moveSection(draft, recordsId, 'up').draft;

  assert.deepEqual(draft.sections.map((s) => s.name), ['Records', 'Scope and Purpose']);

  const doc = instantiateTemplate(draft, emptyProfile(), T0);
  validateDocument(doc);
  const headings = doc.blocks.filter((b) => b.data.type === 'heading');
  assert.deepEqual(
    headings.map((h) => h.data.text),
    ['Records', 'Scope and Purpose'],
    'document headings follow the customized names AND order',
  );
  assert.ok(!headings.some((h) => h.data.text === 'Responsibilities'), 'removed section absent');
  // Flattening contract: 1 heading (Records, no blocks) + 1 heading + 1 paragraph.
  assert.deepEqual(
    doc.blocks.map((b) => b.data.type),
    ['heading', 'heading', 'paragraph'],
  );
  assert.equal(doc.blocks[2].data.spans[0].text, 'Describe the purpose and scope of this procedure. Replace this guidance with your own text.', 'original starter block content survives');
  // Heading level from the section (default 2).
  assert.equal(headings[0].data.level, 2);
});

// ── 14. Generated identity obeys the existing rules ─────────────────────────
test('14. generated document IDs and block IDs obey the existing identity rules', () => {
  let draft = createTemplateDraft(byId(QP_ID));
  draft = addSection(draft, 'Extra Section').draft;
  const templateBlockIds = draft.sections.flatMap((s) => s.blocks.map((b) => b.id));
  const draftIds = new Set(collectIds(draft));

  const d1 = instantiateTemplate(draft, emptyProfile(), T0);
  const d2 = instantiateTemplate(draft, emptyProfile(), T1);
  validateDocument(d1);
  validateDocument(d2);

  assert.notEqual(d1.id, draft.id, 'document id differs from the draft id');
  assert.notEqual(d1.id, d2.id, 'fresh document id per instantiation');
  assert.ok(!draftIds.has(d1.id), 'document id never collides with template-level ids');
  const b1 = d1.blocks.map((b) => b.id);
  const b2 = d2.blocks.map((b) => b.id);
  assert.equal(new Set(b1).size, b1.length, 'doc block ids unique');
  for (const id of templateBlockIds) assert.ok(!b1.includes(id), `template block id ${id} reminted`);
  const set2 = new Set(b2);
  for (const id of b1) assert.ok(!set2.has(id), 'block ids differ per instantiation');

  assert.equal(d1.metadata.createdAt, T0);
  assert.equal(d1.metadata.modifiedAt, T0);
  assert.equal(d2.metadata.createdAt, T1);
  assert.deepEqual(d1.savedRevisions, []);
  assert.equal(d1.trackChangesEnabled, false);
  assert.equal(d1.metadata.documentId, '', 'no preassigned document code');
});

// ── 15. Editing the document mutates neither draft nor canonical ────────────
test('15. editing a generated document does not mutate the draft or the built-in', () => {
  const src = byId(EXAMPLE_SOP_ID);
  let draft = createTemplateDraft(src);
  draft = renameSection(draft, draft.sections[0].id, 'Editable Scope').draft;
  const draftSnapshot = JSON.stringify(draft);
  const srcSnapshot = JSON.stringify(src);
  const catalogSnapshot = JSON.stringify(catalog());

  const doc = instantiateTemplate(draft, emptyProfile(), T0);
  doc.metadata.title = 'Edited document title';
  doc.metadata.organizationName = 'Edited org';
  doc.labProfile.name = 'Edited lab';
  if (doc.blocks[0]?.data?.type === 'heading') doc.blocks[0].data.text = 'EDITED HEADING';
  const withSpans = doc.blocks.find((b) => Array.isArray(b.data?.spans));
  if (withSpans) withSpans.data.spans[0].text = 'EDITED TEXT';
  doc.blocks.push({
    id: 'injected-block',
    spacing: { topPt: 0, bottomPt: 0 },
    data: { type: 'paragraph', hAlign: 'left', indentLevel: 0, spans: [{ text: 'injected' }] },
  });

  assert.equal(JSON.stringify(draft), draftSnapshot, 'customized draft untouched by document edits');
  assert.equal(JSON.stringify(src), srcSnapshot, 'source template untouched');
  assert.equal(JSON.stringify(catalog()), catalogSnapshot, 'canonical catalog untouched');
  // And a NEW document from the same draft still shows the draft content.
  const fresh = instantiateTemplate(draft, emptyProfile(), T0);
  assert.equal(fresh.blocks[0].data.text, 'Editable Scope', 'next document gets the draft content, not edits');
  assert.notEqual(fresh.id, doc.id, 'independent documents');
});

// ── 16. Re-opening / re-requesting the catalog returns original content ─────
test('16. re-opening the chooser or re-requesting the catalog returns canonical content', () => {
  // Simulate a fresh chooser session after heavy draft editing elsewhere.
  const fresh = getBuiltinCatalogTemplates();
  const example = fresh.find((t) => t.id === EXAMPLE_SOP_ID);
  assert.deepEqual(example.sections.map((s) => s.name), EXAMPLE_NAMES, 'example sections original');
  assert.equal(JSON.stringify(example), JSON.stringify(createExampleSopTemplate()), 'example byte-identical to fixture');
  const qp = fresh.find((t) => t.id === QP_ID);
  assert.deepEqual(qp.sections.map((s) => s.name), QP_NAMES, 'quality-policy sections original');
  assert.equal(JSON.stringify(fresh), CATALOG_SNAPSHOT, 'whole catalog byte-identical to session start');

  // Choices built from canonical sources show the original preview.
  const choices = buildChoiceList(fresh, labelFor);
  const qpChoice = choices.find((c) => c.id === QP_ID);
  assert.deepEqual(
    qpChoice.sections.map((s) => s.name),
    QP_NAMES,
    'chooser preview shows canonical sections for a new session',
  );
  // While a draft map is kept it serves the in-progress draft; once discarded
  // (chooser closed → fresh session with a missing entry) the canonical
  // source is used again — and no stale edit can reach the catalog.
  const staleDraft = renameSection(createTemplateDraft(qp), qp.sections[0].id, 'Stale edit').draft;
  const keptMap = withDraftResult({}, qp.id, { ok: true, draft: staleDraft });
  assert.equal(draftFor(keptMap, qp), staleDraft, 'kept map serves the in-progress draft');
  assert.strictEqual(draftFor({}, qp), qp, 'discarded map → canonical source is used again');
  assert.equal(JSON.stringify(getBuiltinCatalogTemplates()), CATALOG_SNAPSHOT, 'still canonical');
});

// ── 17. Selecting another template never carries stale changes ──────────────
test('17. selecting another template does not carry stale changes into its draft', () => {
  const srcA = byId(QP_ID);
  const srcB = byId('builtin.financial-administrative.quotation');
  const snapshotA = JSON.stringify(srcA);
  const snapshotB = JSON.stringify(srcB);

  // No draft yet → the source itself is shown (never mutated by ops).
  let map = {};
  assert.strictEqual(draftFor(map, srcA), srcA, 'missing entry falls back to source');

  // Edit A's draft through the same helpers the UI calls.
  const aSectionId = srcA.sections[0].id;
  map = withDraftResult(map, srcA.id, renameSection(draftFor(map, srcA), aSectionId, 'Renamed A Section'));
  assert.equal(map[srcA.id].sections[0].name, 'Renamed A Section');

  // Switching to B: B resolves to ITS OWN untouched source.
  assert.strictEqual(draftFor(map, srcB), srcB, 'B has no draft → canonical B');
  assert.deepEqual(draftFor(map, srcB).sections.map((s) => s.name), srcB.sections.map((s) => s.name));
  assert.ok(!JSON.stringify(draftFor(map, srcB)).includes('Renamed A Section'), "A's edits do not leak into B");

  // Edit B; each template keeps only its own draft edits.
  const bSectionId = srcB.sections[0].id;
  map = withDraftResult(map, srcB.id, renameSection(draftFor(map, srcB), bSectionId, 'Renamed B Section'));
  const draftA = draftFor(map, srcA);
  const draftB = draftFor(map, srcB);
  assert.ok(JSON.stringify(draftA).includes('Renamed A Section') && !JSON.stringify(draftA).includes('Renamed B Section'));
  assert.ok(JSON.stringify(draftB).includes('Renamed B Section') && !JSON.stringify(draftB).includes('Renamed A Section'));
  assert.notEqual(draftA.id, draftB.id, 'distinct template identities');

  // A failed edit stores NOTHING (map reference unchanged).
  const before = map;
  const failed = renameSection(draftFor(map, srcA), 'nope', 'X');
  map = withDraftResult(map, srcA.id, failed);
  assert.strictEqual(map, before, 'failed operation leaves the draft map untouched');

  // Sources never mutated through any of this.
  assert.equal(JSON.stringify(srcA), snapshotA, 'source A byte-identical');
  assert.equal(JSON.stringify(srcB), snapshotB, 'source B byte-identical');
});

// ── 18. Blank Document remains unaffected ───────────────────────────────────
test('18. Blank Document remains unaffected by customization', async () => {
  // A draft map full of edits never changes the blank choice.
  let map = {};
  const qp = byId(QP_ID);
  map = withDraftResult(map, qp.id, renameSection(createTemplateDraft(qp), qp.sections[0].id, 'Edited'));
  const display = catalog().map((t) => draftFor(map, t));
  const choices = buildChoiceList(display, labelFor);
  const blank = choices[0];
  assert.equal(blank.id, BLANK_CHOICE_ID);
  assert.equal(blank.name, 'Blank Document');
  assert.equal(blank.template, undefined, 'blank carries no template → no section controls');
  assert.deepEqual(blank.sections, []);

  const blankDoc = await resolveChooserSelection(blank, emptyProfile(), T0, async () => 'proceed');
  validateDocument(blankDoc);
  assert.deepEqual(blankDoc.blocks, [], 'blank document still has no blocks');
  assert.equal(blankDoc.metadata.title, 'Untitled Document');
  // Empty catalog → blank still offered first.
  const onlyBlank = buildChoiceList([], labelFor);
  assert.equal(onlyBlank.length, 1);
  assert.equal(onlyBlank[0].id, BLANK_CHOICE_ID);
});

// ── 19. Search/category filtering still functional (with drafts) ────────────
test('19. template search and category filtering remain functional with drafts', () => {
  let map = {};
  const sources = catalog(); // one stable array, as the App's memoized `templates` prop
  const qp = sources.find((t) => t.id === QP_ID);
  map = withDraftResult(map, qp.id, renameSection(createTemplateDraft(qp), qp.sections[0].id, 'Edited Name'));
  // UI composition: display list = drafts resolved over sources, THEN filtered.
  const display = sources.map((t) => draftFor(map, t));
  assert.equal(display.length, 16, 'still sixteen entries');
  assert.strictEqual(display.find((t) => t.id === qp.id), map[qp.id], 'display uses the draft');

  // Searchable fields are read-only, so canonical queries still find it.
  const byName = filterTemplates(display, 'quality policy', null);
  assert.ok(byName.some((t) => t.id === QP_ID), 'found by canonical name');
  const byTag = filterTemplates(display, 'quality', null);
  assert.ok(byTag.some((t) => t.id === QP_ID), 'found by tag/description');
  assert.ok(matchesQuery(map[qp.id], 'quality policy'), 'draft carries the canonical searchable fields');
  assert.ok(!isKnownCategory('nope'), 'unknown category still rejected');
  assert.equal(filterTemplates(display, '', null).length, 16, 'empty query = all');
  const inCat = filterTemplates(display, '', 'management-system');
  assert.ok(inCat.some((t) => t.id === QP_ID) && inCat.every((t) => t.category === 'management-system'), 'category filter correct');
  assert.ok(!filterTemplates(display, '', 'financial-administrative').some((t) => t.id === QP_ID));
  assert.deepEqual(filterTemplates(display, 'zzz-nothing', null), [], 'no false matches');
  // Other entries in the display list are the untouched sources.
  const quote = display.find((t) => t.id === 'builtin.financial-administrative.quotation');
  assert.strictEqual(quote, sources.find((t) => t.id === 'builtin.financial-administrative.quotation'));
});

// ── 20. Saved Laboratory Profile precedence still works ─────────────────────
test('20. saved Laboratory Profile precedence still works for customized drafts', () => {
  const profile = normalizeLabProfile({
    name: 'Precedence Laboratory',
    documentIdPrefix: 'PC-',
    address: '1 Test Lane',
  });

  // Customized quality-policy draft: profile identity wins.
  let qpDraft = createTemplateDraft(byId(QP_ID));
  qpDraft = renameSection(qpDraft, qpDraft.sections[0].id, 'Custom Policy').draft;
  qpDraft = addSection(qpDraft, 'Custom Addendum').draft;
  const doc = instantiateTemplate(qpDraft, profile, T0);
  validateDocument(doc);
  assert.equal(doc.labProfile.name, 'Precedence Laboratory');
  assert.equal(doc.metadata.organizationName, 'Precedence Laboratory');
  assert.equal(doc.labProfile.documentIdPrefix, 'PC-');
  assert.equal(doc.metadata.documentId, '', 'document code never preassigned');
  assert.equal(doc.metadata.title, qpDraft.defaults.metadata.title, 'template title default kept');
  assert.equal(doc.metadata.applicableStandard, 'ISO/IEC 17025:2017', 'template default kept');

  // Empty profile: library drafts still invent no identity; example keeps its demo default.
  const qpEmpty = instantiateTemplate(qpDraft, emptyProfile(), T0);
  assert.equal(qpEmpty.labProfile.name, '');
  assert.equal(qpEmpty.metadata.organizationName, '');
  let exampleDraft = createTemplateDraft(byId(EXAMPLE_SOP_ID));
  exampleDraft = renameSection(exampleDraft, exampleDraft.sections[0].id, 'Renamed Scope').draft;
  const exampleEmpty = instantiateTemplate(exampleDraft, emptyProfile(), T0);
  assert.equal(exampleEmpty.metadata.organizationName, 'Example Laboratory', 'example demo default preserved through customization');

  // Customized starter content + profile coexist.
  assert.equal(doc.blocks[0].data.text, 'Custom Policy');
  assert.ok(doc.blocks.some((b) => b.data.type === 'heading' && b.data.text === 'Custom Addendum'));
});

// ── 21. New/Cancel and Save/Discard/Cancel safety unchanged ─────────────────
test('21. chooser session safety (Cancel / guard) is unchanged for customized choices', async () => {
  let guardCalls = 0;
  const guard = (verdict) => async () => {
    guardCalls += 1;
    return verdict;
  };

  // Cancel (null choice) → nothing happens, guard never runs.
  const cancelled = await resolveChooserSelection(null, emptyProfile(), T0, guard('proceed'));
  assert.equal(cancelled, null);
  assert.equal(guardCalls, 0, 'cancel must not run the guard');

  // Customized choice + aborted guard → document replacement aborted.
  let draft = createTemplateDraft(byId(EXAMPLE_SOP_ID));
  draft = renameSection(draft, draft.sections[0].id, 'Guarded Scope').draft;
  const choice = buildChoiceList([draft], labelFor)[1];
  const aborted = await resolveChooserSelection(choice, emptyProfile(), T0, guard('abort'));
  assert.equal(aborted, null, 'Save/Discard/Cancel-abort → no replacement');

  // Failed save → abort as well.
  const failedSave = await resolveChooserSelection(
    choice,
    emptyProfile(),
    T0,
    () => resolveUnsavedSim(true),
  );
  assert.equal(failedSave, null);

  // Guard exception → abort (never replace unsafely).
  const threw = await resolveChooserSelection(choice, emptyProfile(), T0, async () => {
    throw new Error('boom');
  });
  assert.equal(threw, null);

  // Proceed → the document comes from the CUSTOMIZED draft.
  const doc = await resolveChooserSelection(choice, emptyProfile(), T0, guard('proceed'));
  validateDocument(doc);
  assert.equal(doc.blocks[0].data.text, 'Guarded Scope', 'customized content used');
  assert.equal(doc.metadata.title, 'Standard Operating Procedure', 'template defaults applied');

  // The blank choice follows the same guarded path.
  const blank = buildChoiceList([], labelFor)[0];
  const blankDoc = await resolveChooserSelection(blank, emptyProfile(), T0, guard('proceed'));
  assert.deepEqual(blankDoc.blocks, []);
  assert.equal(guardCalls, 3, 'guard ran exactly for the real choices that used it (abort, proceed, proceed)');
});

/** Simulates a save dialog that fails (guard returns false → abort). */
async function resolveUnsavedSim(failed) {
  return failed ? 'abort' : 'proceed';
}

// ── 22. Existing P02/P03 behavior has no regression (in-script smoke) ───────
test('22. existing P02/P03 document, template and profile behavior has no regression', () => {
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

  // P03-M2: lab-profile serialize/parse distinct and stable.
  const prof = normalizeLabProfile({ name: 'Regression Lab', documentIdPrefix: 'RG-' });
  const profText = serializeLabProfile(prof);
  assert.ok(profText.includes(LAB_PROFILE_SIGNATURE), 'profile signature present');
  assert.equal(JSON.parse(profText).schemaVersion, LAB_PROFILE_SCHEMA_VERSION);
  assert.equal(JSON.parse(profText).name, 'Regression Lab');

  // P03-M3: the built-in catalog itself is stable across retrieval.
  assert.equal(JSON.stringify(getBuiltinCatalogTemplates()), CATALOG_SNAPSHOT, 'catalog byte-stable');
  assert.equal(catalog().length, 16, 'catalog still holds the 16 built-ins');

  // The full regression evidence is the sibling suite executed with this
  // script: verify:p02-m2/m3/m4/m5, verify:p03-m1, verify:p03-m2, verify:p03-m3
  // (see project_roadmap.md).
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
  console.log(`\nP03-M4 verification: ${passed} passed, ${failed.length} failed.`);
  if (failed.length > 0) {
    console.error(`Failed: ${failed.join(', ')}`);
    process.exit(1);
  }
};

await run();
