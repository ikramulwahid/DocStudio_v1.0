/**
 * P03-M2 — Template chooser, document initialization, laboratory profile
 * ═══════════════════════════════════════════════════════════════════════════
 * Exercises the ACTUAL modules:
 *   • src/services/template-chooser.ts        (catalog, search/filter, guarded selection)
 *   • src/services/template-instantiation.ts  (precedence, deep-copy/remint, asset remap)
 *   • src/services/lab-profile.ts             (normalize/parse/serialize/validate)
 *   • src/services/lab-profile-store.ts       (persistence + safe fallback)
 *   • src/services/template-samples.ts        (deterministic example fixture)
 *   • src/services/template-file.ts           (.dstemplate serialize/validate)
 *   • src/services/document-file.ts           (.docstudio serialize/validate)
 *   • src/services/document-actions.ts        (unsaved-change guard, lifecycle)
 * compiled with tsc and run in Node with the built-in assert module —
 * no testing framework is introduced.
 *
 * Coverage (mirrors the P03-M2 checklist, 18 items):
 *   1. The chooser discovers the example template and blank-document option.
 *   2. Search matches a template by name, description and tag.
 *   3. Category filtering uses the centralized category list.
 *   4. No-match and chooser-cancel behavior is correct.
 *   5. Blank creation produces a valid, fresh, default document.
 *   6. Template instantiation applies all declared partial defaults correctly
 *      under the documented precedence (app defaults -> template defaults ->
 *      saved Lab Profile identity wins).
 *   7. Missing nested settings remain valid through fallback merging.
 *   8. The document contains sections/blocks in the specified order.
 *   9. New document and block IDs are fresh where required.
 *  10. Mutating instantiated blocks cannot mutate the source template.
 *  11. Mutating the new document cannot mutate the saved Laboratory Profile.
 *  12. Template assets and their references survive instantiation correctly.
 *  13. Document, template and profile serialization/validation remain distinct.
 *  14. Lab Profile changes persist and are loaded after an application restart.
 *  15. Lab Profile changes do not retroactively alter existing documents or templates.
 *  16. Save / Discard / Cancel behavior remains correct for chooser selection.
 *  17. Cancelled save or save failure aborts pending document replacement.
 *  18. Existing P02/P03 behavior has no regression.
 *
 * Usage: node verify_p03_m2.mjs   (or: npm run verify:p03-m2)
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
const outDir = mkdtempSync(path.join(tmpdir(), 'ds-p03-m2-'));
execSync(
  'npx tsc src/services/template-chooser.ts src/services/template-instantiation.ts' +
    ' src/services/lab-profile.ts src/services/lab-profile-store.ts' +
    ' src/services/template-samples.ts src/services/template-file.ts' +
    ' src/services/document-file.ts src/services/document-actions.ts' +
    ' src/types/template.ts src/types/template-defaults.ts src/types/lab-profile.ts' +
    ' src/types/blocks.ts src/types/document.ts src/types/defaults.ts src/types/index.ts' +
    ` --outDir "${outDir}" --module commonjs --target es2020 --moduleResolution node --esModuleInterop --skipLibCheck`,
  { cwd: root, stdio: 'inherit' },
);

const chooser = require(path.join(outDir, 'services', 'template-chooser.js'));
const inst = require(path.join(outDir, 'services', 'template-instantiation.js'));
const labProfile = require(path.join(outDir, 'services', 'lab-profile.js'));
const labStore = require(path.join(outDir, 'services', 'lab-profile-store.js'));
const tplSamples = require(path.join(outDir, 'services', 'template-samples.js'));
const tplFile = require(path.join(outDir, 'services', 'template-file.js'));
const docFile = require(path.join(outDir, 'services', 'document-file.js'));
const docActions = require(path.join(outDir, 'services', 'document-actions.js'));
const tplTypes = require(path.join(outDir, 'types', 'template.js'));
const tplDefaults = require(path.join(outDir, 'types', 'template-defaults.js'));
const lpTypes = require(path.join(outDir, 'types', 'lab-profile.js'));
const docDefaults = require(path.join(outDir, 'types', 'defaults.js'));

const {
  BLANK_CHOICE_ID,
  getBuiltinTemplates,
  buildChoiceList,
  filterTemplates,
  matchesQuery,
  isKnownCategory,
  resolveChooserSelection,
} = chooser;
const { createBlankDocument, instantiateTemplate, deepMerge } = inst;
const {
  normalizeLabProfile,
  parseLabProfileJson,
  serializeLabProfile,
  validateLabProfileInput,
  isValidEmail,
  isValidWebsite,
} = labProfile;
const { loadLabProfile, saveLabProfile, clearLabProfile } = labStore;
const { createExampleSopTemplate } = tplSamples;
const { serializeTemplate, deserializeTemplate, validateTemplate, TemplateFileError } = tplFile;
const { serializeDocument, deserializeDocument, validateDocument } = docFile;
const { resolveUnsavedChanges } = docActions;
const { TEMPLATE_CATEGORIES, TEMPLATE_CATEGORY_IDS } = tplTypes;
const { createDefaultTemplate, createTemplateSection } = tplDefaults;
const {
  LAB_PROFILE_SIGNATURE,
  LAB_PROFILE_SCHEMA_VERSION,
  LAB_PROFILE_STORAGE_KEY,
  createEmptyLabProfile,
} = lpTypes;
const {
  createDefaultPageSetup,
  createDefaultPageTypography,
  createDefaultHeaderFooter,
  createDefaultFrontPage,
} = docDefaults;

// ── Tiny async test harness ─────────────────────────────────────────────────
const tests = [];
function test(name, fn) {
  tests.push({ name, fn });
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

/** Assert that `fn` throws ANY DocStudio error carrying the expected `code`. */
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

/** In-memory KeyValueStorage (optionally over a shared map = "disk"). */
function makeStorage(map = new Map()) {
  return {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => {
      map.set(k, String(v));
    },
    removeItem: (k) => {
      map.delete(k);
    },
  };
}

const labelFor = (cat) => TEMPLATE_CATEGORIES.find((c) => c.id === cat)?.label ?? cat;
const T0 = '2026-10-16T08:00:00.000Z';
const T1 = '2026-10-16T09:00:00.000Z';
const T2 = '2026-10-16T10:00:00.000Z';
const T3 = '2026-10-16T11:00:00.000Z';

/** Deep-clone `value` with every `id` field removed (defaults mint fresh UUIDs). */
function stripIds(value) {
  return JSON.parse(
    JSON.stringify(value, (key, val) => (key === 'id' ? undefined : val)),
  );
}

const emptyProfile = () => createEmptyLabProfile();
const exampleChoice = () =>
  buildChoiceList(getBuiltinTemplates(), labelFor).find((c) => c.id !== BLANK_CHOICE_ID);

// ── 1. Chooser discovers the example template and blank-document option ─────
test('1. chooser discovers blank-document option and the example template', () => {
  const catalog = getBuiltinTemplates();
  assert.equal(catalog.length, 1, 'P03-M2 catalog = the single example SOP');
  assert.equal(catalog[0].id, 'builtin.sops-work-instructions.example-sop');
  validateTemplate(catalog[0]); // only structurally valid templates are offered

  const choices = buildChoiceList(catalog, labelFor);
  assert.equal(choices.length, 2);

  // Blank Document is first-class: always present, listed first, no source template.
  assert.equal(choices[0].id, BLANK_CHOICE_ID);
  assert.equal(choices[0].name, 'Blank Document');
  assert.equal(choices[0].template, undefined);
  assert.deepEqual(choices[0].sections, []);

  // Example template entry carries catalog metadata + ordered section preview.
  const ex = choices[1];
  assert.equal(ex.id, catalog[0].id);
  assert.equal(ex.template, catalog[0]);
  assert.equal(ex.category, 'sops-work-instructions');
  assert.equal(ex.categoryLabel, TEMPLATE_CATEGORIES.find((c) => c.id === ex.category).label);
  assert.deepEqual([...ex.tags], [...catalog[0].tags]);
  assert.equal(ex.sections.length, 2);
  assert.equal(ex.sections[0].name, 'Scope');
  assert.ok(ex.sections[0].description, 'section description previewed');
  assert.ok(ex.sections[0].prompt, 'section prompt previewed');
  assert.equal(ex.sections[1].name, 'Responsibilities');
});

// ── 2. Search matches by name, description and tag ──────────────────────────
test('2. search matches a template by name, description and tag', () => {
  const ex = getBuiltinTemplates()[0];

  // Name path (case-insensitive; leading/trailing whitespace is trimmed).
  assert.ok(matchesQuery(ex, 'standard operating procedure'), 'name match');
  assert.ok(matchesQuery(ex, '  Example Stan  '), 'trim + case-insensitive name match');
  // Description path (phrase absent from the name).
  assert.ok(matchesQuery(ex, 'DETERMINISTIC STARTER'), 'description match');
  // Tag path: a synthetic template whose tag appears in neither name nor description.
  const synthetic = createDefaultTemplate({
    createdAt: T0,
    name: 'Alpha',
    description: 'Beta',
    tags: ['gamma-unique-tag'],
  });
  assert.ok(matchesQuery(synthetic, 'gamma-unique-tag'), 'tag-only match');
  assert.ok(!matchesQuery(synthetic, 'delta'), 'no false-positive match');
  // Blank query matches everything.
  assert.ok(matchesQuery(ex, '   '), 'blank query matches all');
  // End-to-end through the filter used by the chooser.
  assert.equal(filterTemplates([ex], 'deterministic starter', null).length, 1);
  assert.equal(filterTemplates([ex], 'no-such-thing', null).length, 0);
});

// ── 3. Category filtering uses the centralized category list ────────────────
test('3. category filtering and labels come from the centralized category list', () => {
  const catalog = getBuiltinTemplates();
  assert.equal(TEMPLATE_CATEGORIES.length, TEMPLATE_CATEGORY_IDS.length);
  for (const id of TEMPLATE_CATEGORY_IDS) {
    assert.ok(isKnownCategory(id), `${id} must be a known category`);
    const filtered = filterTemplates(catalog, '', id);
    if (id === 'sops-work-instructions') {
      assert.equal(filtered.length, 1, 'example must pass its own category filter');
    } else {
      assert.equal(filtered.length, 0, `example must be excluded from ${id}`);
    }
  }
  assert.ok(!isKnownCategory('not-a-category'), 'unknown id rejected');
  assert.ok(!isKnownCategory(BLANK_CHOICE_ID), 'blank sentinel is not a category');
  assert.equal(filterTemplates(catalog, '', null).length, 1, 'null category = all');

  // The rendered label is looked up from TEMPLATE_CATEGORIES (no second registry).
  const exChoice = buildChoiceList(catalog, labelFor).find((c) => c.id === catalog[0].id);
  assert.equal(
    exChoice.categoryLabel,
    TEMPLATE_CATEGORIES.find((c) => c.id === catalog[0].category).label,
  );
});

// ── 4. No-match and chooser-cancel behavior ─────────────────────────────────
test('4. no-match leaves the blank choice; chooser cancel never runs the guard', async () => {
  const catalog = getBuiltinTemplates();
  assert.deepEqual(filterTemplates(catalog, 'no-such-template', null), [], 'no matches');
  assert.deepEqual(filterTemplates(catalog, '', 'quality-manuals'), [], 'wrong category');

  // Even with zero template matches, Blank Document remains selectable.
  const onlyBlank = buildChoiceList([], labelFor);
  assert.equal(onlyBlank.length, 1);
  assert.equal(onlyBlank[0].id, BLANK_CHOICE_ID);

  // Cancel (null choice): result is null AND the guard must never be invoked,
  // so opening/cancelling the chooser cannot touch the active session.
  let guardCalls = 0;
  const res = await resolveChooserSelection(null, emptyProfile(), T0, async () => {
    guardCalls += 1;
    return 'proceed';
  });
  assert.equal(res, null, 'cancel yields no replacement document');
  assert.equal(guardCalls, 0, 'cancel must not invoke the unsaved-change guard');
});

// ── 5. Blank creation produces a valid, fresh, default document ─────────────
test('5. blank creation produces a valid, fresh, default document with profile identity', () => {
  const profile = normalizeLabProfile({
    name: 'My Lab',
    address: '1 Main St',
    location: 'Peshawar, PK',
    phone: '+92 300 0000000',
    email: 'lab@example.com',
    website: 'example.com/lab',
    documentIdPrefix: 'MY-',
  });

  const doc = createBlankDocument(profile, T0);
  validateDocument(doc); // must be a structurally valid document

  // Fresh, default, app-managed instance state.
  assert.equal(doc.metadata.createdAt, T0);
  assert.equal(doc.metadata.modifiedAt, T0);
  assert.equal(doc.metadata.title, 'Untitled Document');
  assert.equal(doc.metadata.documentId, '', 'no document code is auto-assigned');
  assert.deepEqual(doc.blocks, [], 'blank document has no content blocks');
  assert.deepEqual(doc.assets, {}, 'blank document has no assets');
  assert.deepEqual(doc.metadata.customFields, []);
  assert.deepEqual(doc.savedRevisions, []);
  assert.equal(doc.trackChangesEnabled, false);

  // Saved profile identity is applied to the snapshot and organization field.
  assert.equal(doc.labProfile.name, 'My Lab');
  assert.equal(doc.labProfile.address, '1 Main St');
  assert.equal(doc.labProfile.location, 'Peshawar, PK');
  assert.equal(doc.labProfile.email, 'lab@example.com');
  assert.equal(doc.labProfile.documentIdPrefix, 'MY-');
  assert.equal(doc.labProfile.logoAssetId, undefined, 'no dangling logo reference');
  assert.equal(doc.metadata.organizationName, 'My Lab');

  // Fresh id on every call.
  const again = createBlankDocument(profile, T0);
  assert.notEqual(again.id, doc.id, 'each blank document gets a fresh id');
});

// ── 6. Instantiation applies declared partial defaults (precedence policy) ──
test('6. instantiation applies template defaults; saved profile identity wins', () => {
  const ex = getBuiltinTemplates()[0];

  // --- Empty profile: template defaults apply over app defaults. ---
  const doc = instantiateTemplate(ex, emptyProfile(), T0);
  validateDocument(doc);
  // Declared template metadata defaults.
  assert.equal(doc.metadata.title, 'Standard Operating Procedure');
  assert.equal(doc.metadata.subtitle, 'Replace with the procedure title');
  assert.equal(doc.metadata.documentType, 'SOP');
  assert.equal(doc.metadata.department, 'Laboratory');
  assert.equal(doc.metadata.applicableStandard, 'ISO/IEC 17025:2017');
  // Omitted metadata keys keep app defaults.
  assert.equal(doc.metadata.status, 'Draft');
  assert.equal(doc.metadata.documentId, '');
  assert.deepEqual(doc.metadata.customFields, []);
  // Declared page/front-page defaults.
  assert.equal(doc.pageSetup.size, 'A4');
  assert.equal(doc.pageSetup.orientation, 'portrait');
  assert.equal(doc.frontPage.enabled, true);
  // Template lab-profile defaults apply when no profile is saved.
  assert.equal(doc.labProfile.name, 'Example Laboratory');
  assert.equal(doc.labProfile.documentIdPrefix, 'LAB-SOP-');
  assert.equal(doc.metadata.organizationName, 'Example Laboratory');
  // App-managed instance fields.
  assert.equal(doc.metadata.createdAt, T0);
  assert.equal(doc.metadata.modifiedAt, T0);
  assert.deepEqual(doc.savedRevisions, []);
  assert.equal(doc.trackChangesEnabled, false);

  // --- Named profile: profile identity wins over the generic template value. ---
  const profile = normalizeLabProfile({
    name: 'My Real Lab',
    address: 'Addr 9',
    documentIdPrefix: 'REAL-',
  });
  const docP = instantiateTemplate(ex, profile, T0);
  validateDocument(docP);
  assert.equal(docP.labProfile.name, 'My Real Lab', 'profile name wins over template');
  assert.equal(docP.metadata.organizationName, 'My Real Lab', 'profile wins on organizationName');
  assert.equal(docP.labProfile.address, 'Addr 9');
  assert.equal(docP.labProfile.documentIdPrefix, 'REAL-', 'profile prefix wins over LAB-SOP-');
  // Template content/metadata defaults still apply where intended.
  assert.equal(docP.metadata.title, 'Standard Operating Procedure');
  assert.equal(docP.pageSetup.size, 'A4');
  assert.equal(docP.metadata.documentId, '', 'documentId stays blank');
});

// ── 7. Missing nested settings remain valid through fallback merging ────────
test('7. missing nested settings stay valid through fallback merging', () => {
  // Template declaring only ONE nested key of pageSetup.
  const sparse = createDefaultTemplate({
    createdAt: T0,
    name: 'Sparse',
    defaults: { pageSetup: { size: 'Letter' } },
  });
  const doc = instantiateTemplate(sparse, emptyProfile(), T0);
  validateDocument(doc);
  assert.equal(doc.pageSetup.size, 'Letter', 'declared key applied');
  assert.deepEqual(doc.pageSetup.margins, createDefaultPageSetup().margins, 'omitted sibling kept');
  // (ids are stripped: header/footer cells mint a fresh UUID per creation.)
  assert.deepEqual(doc.pageTypography, createDefaultPageTypography(), 'unspecified block = default');
  assert.deepEqual(stripIds(doc.headerFooter), stripIds(createDefaultHeaderFooter()), 'unspecified block = default');
  assert.deepEqual(stripIds(doc.frontPage), stripIds(createDefaultFrontPage()), 'unspecified block = default');

  // deepMerge: an explicit undefined never clobbers a real value; base untouched.
  const merged = deepMerge({ a: 1, n: { x: 1 } }, { a: undefined, n: { y: 2 } });
  assert.deepEqual(merged, { a: 1, n: { x: 1, y: 2 } });
  const base = { a: 1 };
  deepMerge(base, { a: 2 });
  assert.equal(base.a, 1, 'deepMerge must not mutate its base');

  // Template with NO defaults at all still yields fully-populated settings.
  const bare = createDefaultTemplate({ createdAt: T0 });
  const bareDoc = instantiateTemplate(bare, emptyProfile(), T0);
  validateDocument(bareDoc);
  assert.deepEqual(bareDoc.pageSetup, createDefaultPageSetup());
  assert.deepEqual(stripIds(bareDoc.headerFooter), stripIds(createDefaultHeaderFooter()));
});

// ── 8. Sections/blocks appear in the specified order ────────────────────────
test('8. the document contains sections and blocks in the specified order', () => {
  const ex = getBuiltinTemplates()[0];
  const doc = instantiateTemplate(ex, emptyProfile(), T0);

  assert.equal(doc.blocks.length, 5, '2 sections => 2 headings + 3 paragraphs');
  assert.deepEqual(
    doc.blocks.map((b) => b.data.type),
    ['heading', 'paragraph', 'heading', 'paragraph', 'paragraph'],
  );
  assert.equal(doc.blocks[0].data.text, 'Scope');
  assert.equal(doc.blocks[0].data.level, 2, 'heading level from section.headingLevel');
  assert.equal(
    doc.blocks[1].data.spans[0].text,
    'Describe the purpose and scope of this procedure. Replace this guidance with your own text.',
  );
  assert.equal(doc.blocks[2].data.text, 'Responsibilities');
  assert.equal(
    doc.blocks[3].data.spans[0].text,
    'List the roles responsible for performing and reviewing this procedure.',
  );
  assert.equal(
    doc.blocks[4].data.spans[0].text,
    'Add supporting detail, hand-offs and authorisation requirements here.',
  );
  // Spacing survives the copy.
  assert.deepEqual(doc.blocks[1].spacing, { topPt: 0, bottomPt: 6 });
});

// ── 9. New document and block IDs are fresh where required ──────────────────
test('9. document and block IDs are fresh (never reused from the template)', () => {
  const tpl = createExampleSopTemplate();
  const d1 = instantiateTemplate(tpl, emptyProfile(), T0);
  const d2 = instantiateTemplate(tpl, emptyProfile(), T0);

  assert.notEqual(d1.id, tpl.id, 'document id differs from template id');
  assert.notEqual(d1.id, d2.id, 'each instantiation mints a fresh document id');

  const templateBlockIds = tpl.sections.flatMap((s) => s.blocks.map((b) => b.id));
  assert.equal(templateBlockIds.length, 3);
  const d1Ids = d1.blocks.map((b) => b.id);
  assert.equal(new Set(d1Ids).size, d1Ids.length, 'document block ids are unique');
  for (const id of templateBlockIds) {
    assert.ok(!d1Ids.includes(id), `template block id ${id} must not leak into the document`);
  }
  // Two instantiations share no block ids either.
  const d2Ids = new Set(d2.blocks.map((b) => b.id));
  for (const id of d1Ids) assert.ok(!d2Ids.has(id), 'block ids differ per instantiation');
  assert.equal(d1.metadata.createdAt, T0, 'timestamps stamped from the supplied now');
});

// ── 10. Mutating instantiated blocks cannot mutate the source template ──────
test('10. mutating instantiated blocks cannot mutate the source template', () => {
  const tpl = createExampleSopTemplate();
  const tplSnapshot = JSON.stringify(tpl);

  const doc = instantiateTemplate(tpl, emptyProfile(), T0);
  doc.blocks[0].data.text = 'MUTATED';
  doc.blocks[1].data.spans[0].text = 'MUTATED';
  doc.blocks[1].spacing.topPt = 999;
  doc.blocks.push({
    id: 'injected-block',
    spacing: { topPt: 0, bottomPt: 0 },
    data: { type: 'paragraph', hAlign: 'left', indentLevel: 0, spans: [{ text: 'injected' }] },
  });
  doc.metadata.title = 'MUTATED';
  doc.labProfile.name = 'MUTATED';

  assert.equal(JSON.stringify(tpl), tplSnapshot, 'template must be byte-identical');
  validateTemplate(tpl); // and still structurally valid

  // The copied blocks also share no reference with the template.
  const doc2 = instantiateTemplate(tpl, emptyProfile(), T0);
  doc2.blocks[1].data.spans[0].text = 'MUTATED-AGAIN';
  assert.equal(JSON.stringify(tpl), tplSnapshot, 'second copy is isolated too');
});

// ── 11. Mutating the new document cannot mutate the saved profile ───────────
test('11. mutating the new document cannot mutate the saved Laboratory Profile', () => {
  const profile = normalizeLabProfile({
    name: 'Lab A',
    address: 'Addr A',
    location: 'City A',
    documentIdPrefix: 'A-',
  });
  const profileSnapshot = JSON.stringify(profile);

  const doc = instantiateTemplate(getBuiltinTemplates()[0], profile, T0);
  doc.labProfile.name = 'Changed';
  doc.labProfile.address = 'Changed';
  doc.metadata.organizationName = 'Changed';
  assert.equal(JSON.stringify(profile), profileSnapshot, 'profile untouched by template doc');

  const blank = createBlankDocument(profile, T0);
  blank.labProfile.name = 'Changed';
  blank.labProfile.location = 'Changed';
  assert.equal(JSON.stringify(profile), profileSnapshot, 'profile untouched by blank doc');
});

// ── 12. Template assets and references survive instantiation ────────────────
test('12. template assets are copied with fresh IDs and references remapped', () => {
  const ASSET_ID = '7c2b0000-0000-4000-8000-000000000001';
  const IMG_BLOCK_ID = '7c2b0000-0000-4000-8000-000000000011';
  const IMG_ITEM_ID = '7c2b0000-0000-4000-8000-000000000012';

  const tpl = createDefaultTemplate({
    createdAt: T0,
    name: 'Asset Template',
    defaults: { frontPage: { enabled: true, logoAssetId: ASSET_ID } },
    assets: {
      [ASSET_ID]: {
        id: ASSET_ID,
        filename: 'lab-logo.png',
        mimeType: 'image/png',
        sizeBytes: 13,
        addedAt: T0,
        base64Data: 'aGVsbG8=',
      },
    },
    sections: [
      createTemplateSection('Figures', {
        blocks: [
          {
            id: IMG_BLOCK_ID,
            spacing: { topPt: 6, bottomPt: 6 },
            data: {
              type: 'image',
              layout: 'single',
              images: [{ id: IMG_ITEM_ID, assetId: ASSET_ID, widthFraction: 0.5, hAlign: 'center' }],
            },
          },
        ],
      }),
    ],
  });
  validateTemplate(tpl);
  const tplSnapshot = JSON.stringify(tpl);

  const doc = instantiateTemplate(tpl, emptyProfile(), T0);
  validateDocument(doc);

  // Bundle copied with a fresh ID, payload preserved, key matches id.
  const newIds = Object.keys(doc.assets);
  assert.equal(newIds.length, 1);
  assert.notEqual(newIds[0], ASSET_ID, 'asset must get a fresh ID');
  const rec = doc.assets[newIds[0]];
  assert.equal(rec.id, newIds[0], 'asset key matches record id');
  assert.equal(rec.filename, 'lab-logo.png');
  assert.equal(rec.mimeType, 'image/png');
  assert.equal(rec.sizeBytes, 13);
  assert.equal(rec.base64Data, 'aGVsbG8=', 'payload preserved');

  // Every reference remaps to an asset that RESOLVES in the new document.
  assert.equal(doc.frontPage.logoAssetId, newIds[0], 'front-page logo remapped');
  assert.ok(doc.assets[doc.frontPage.logoAssetId], 'front-page logo resolves');
  const img = doc.blocks.find((b) => b.data.type === 'image');
  assert.ok(img, 'image block copied');
  assert.equal(img.data.images[0].assetId, newIds[0], 'block asset reference remapped');
  assert.ok(doc.assets[img.data.images[0].assetId], 'block asset reference resolves');

  // The source template keeps its own original references.
  assert.equal(JSON.stringify(tpl), tplSnapshot, 'template assets untouched');
  assert.equal(tpl.defaults.frontPage.logoAssetId, ASSET_ID);
  assert.equal(tpl.sections[0].blocks[0].data.images[0].assetId, ASSET_ID);
});

// ── 13. Document, template and profile serialization stay distinct ──────────
test('13. document, template and profile serialization/validation stay distinct', () => {
  const profile = normalizeLabProfile({ name: 'Distinct Lab', email: 'a@b.co' });
  const doc = instantiateTemplate(getBuiltinTemplates()[0], profile, T0);
  const docText = serializeDocument(doc);
  const tplText = serializeTemplate(createExampleSopTemplate());
  const profText = serializeLabProfile(profile);

  // Each format round-trips through its own parser.
  assert.equal(deserializeDocument(docText).id, doc.id);
  assert.equal(deserializeTemplate(tplText).id, 'builtin.sops-work-instructions.example-sop');
  assert.equal(parseLabProfileJson(profText).name, 'Distinct Lab');

  // Cross-feeding is rejected in both directions.
  assertThrowsCode(() => deserializeTemplate(docText), 'invalid-signature', 'document as template');
  assert.equal(parseLabProfileJson(docText), null, 'document is not a profile');
  assertThrowsCodedError(() => deserializeDocument(tplText), 'invalid-structure', 'template as document');
  assert.equal(parseLabProfileJson(tplText), null, 'template is not a profile');
  assertThrowsCodedError(() => deserializeDocument(profText), 'invalid-structure', 'profile as document');
  assertThrowsCode(() => deserializeTemplate(profText), 'invalid-signature', 'profile as template');

  // Profile parser enforces its own signature and version.
  const wrongVersion = JSON.parse(profText);
  wrongVersion.schemaVersion = LAB_PROFILE_SCHEMA_VERSION + 1;
  assert.equal(parseLabProfileJson(JSON.stringify(wrongVersion)), null, 'newer profile version rejected');
  assert.equal(parseLabProfileJson('{malformed'), null, 'malformed JSON rejected');
  assert.equal(parseLabProfileJson(null), null, 'missing data rejected');
  assert.equal(LAB_PROFILE_SIGNATURE, 'DocStudioLabProfile', 'profile signature is distinct');
});

// ── 14. Profile changes persist and load after a restart ────────────────────
test('14. Lab Profile changes persist and load after an application restart', () => {
  const disk = new Map(); // shared bytes = what survives a process restart
  const app1 = makeStorage(disk);

  const saved = normalizeLabProfile({
    name: 'Restart Lab',
    email: 'a@b.co',
    location: 'City',
    documentIdPrefix: 'RST-',
  });
  assert.equal(saveLabProfile(saved, app1), true, 'save succeeds');

  // "Restart": a brand-new storage handle reads the same persisted bytes.
  const app2 = makeStorage(disk);
  const { profile: loaded, fallbackUsed } = loadLabProfile(app2);
  assert.equal(fallbackUsed, false, 'no fallback for valid stored data');
  assert.equal(loaded.name, 'Restart Lab');
  assert.equal(loaded.email, 'a@b.co');
  assert.equal(loaded.location, 'City');
  assert.equal(loaded.documentIdPrefix, 'RST-');
  assert.equal(loaded.__type, LAB_PROFILE_SIGNATURE);
  assert.equal(loaded.schemaVersion, LAB_PROFILE_SCHEMA_VERSION);

  // Consuming a loaded profile never mutates the stored copy.
  loaded.name = 'Tampered';
  assert.equal(loadLabProfile(app2).profile.name, 'Restart Lab', 'stored bytes unchanged');

  // Corrupted stored data -> safe empty default + fallback flag + message.
  let errMsg = null;
  const corrupt = loadLabProfile(makeStorage(new Map([[LAB_PROFILE_STORAGE_KEY, '{corrupt']])), (m) => {
    errMsg = m;
  });
  assert.equal(corrupt.fallbackUsed, true, 'corrupt data triggers fallback');
  assert.equal(corrupt.profile.name, '', 'fallback is the clean empty profile');
  assert.ok(errMsg && errMsg.length > 0, 'load error is surfaced to the UI');

  // Wrong signature / wrong version also fall back safely.
  const wrongSig = loadLabProfile(
    makeStorage(new Map([[LAB_PROFILE_STORAGE_KEY, JSON.stringify({ __type: 'DocStudio', schemaVersion: 1 })]])),
  );
  assert.equal(wrongSig.fallbackUsed, true);
  assert.equal(wrongSig.profile.name, '');
  const wrongVer = loadLabProfile(
    makeStorage(
      new Map([[LAB_PROFILE_STORAGE_KEY, JSON.stringify({ __type: LAB_PROFILE_SIGNATURE, schemaVersion: 99 })]]),
    ),
  );
  assert.equal(wrongVer.fallbackUsed, true);
  assert.equal(wrongVer.profile.name, '');

  // Missing key -> clean default, NOT a fallback condition.
  const missing = loadLabProfile(makeStorage(new Map()));
  assert.equal(missing.fallbackUsed, false);
  assert.equal(missing.profile.name, '');

  // Reset-to-empty works, and without any storage save reports failure (Node).
  saveLabProfile(saved, app1);
  clearLabProfile(app1);
  assert.equal(loadLabProfile(app1).profile.name, '');
  assert.equal(saveLabProfile(saved), false, 'no storage available => save fails cleanly');

  // Editor validation rules (email/website) are enforced before saving.
  assert.deepEqual(validateLabProfileInput({ email: 'not-an-email' }), {
    email: 'Enter a valid email address, or leave it blank.',
  });
  assert.deepEqual(validateLabProfileInput({ website: 'nope' }), {
    website: 'Enter a valid website (e.g. example.com), or leave it blank.',
  });
  assert.deepEqual(validateLabProfileInput({ email: 'a@b.co', website: 'example.com' }), {});
  assert.ok(isValidEmail('a@b.co') && !isValidEmail('a@b'));
  assert.ok(isValidWebsite('example.com') && isValidWebsite('https://example.com/x') && !isValidWebsite('nope'));
});

// ── 15. Profile changes do not retroactively alter documents/templates ──────
test('15. profile changes never retroactively alter existing documents or templates', () => {
  const tpl = createExampleSopTemplate();
  const tplSnapshot = JSON.stringify(tpl);
  const profileA = normalizeLabProfile({ name: 'Lab One', address: 'Addr One' });

  const existingDoc = instantiateTemplate(tpl, profileA, T0);
  const docSnapshot = JSON.stringify(existingDoc);

  // The user edits and persists the profile afterwards.
  const profileB = normalizeLabProfile({ name: 'Lab Two', address: 'Addr Two' });
  const store = makeStorage(new Map());
  assert.equal(saveLabProfile(profileB, store), true);

  // The already-created document and the template are byte-identical.
  assert.equal(JSON.stringify(existingDoc), docSnapshot, 'existing document untouched');
  assert.equal(JSON.stringify(tpl), tplSnapshot, 'template untouched');

  // Only NEW documents pick up the changed profile.
  const freshDoc = instantiateTemplate(tpl, loadLabProfile(store).profile, T1);
  assert.equal(freshDoc.labProfile.name, 'Lab Two');
  assert.equal(freshDoc.metadata.organizationName, 'Lab Two');
  assert.equal(existingDoc.labProfile.name, 'Lab One');
  assert.notEqual(freshDoc.id, existingDoc.id);
});

// ── 16. Save / Discard / Cancel behavior for chooser selection ──────────────
test('16. Save / Discard / Cancel behavior remains correct for chooser selection', async () => {
  const choice = exampleChoice();
  assert.ok(choice, 'example choice available');

  // Not dirty -> proceed without prompting (ask/save never run).
  let askCalls = 0;
  let saveCalls = 0;
  let res = await resolveChooserSelection(
    choice,
    emptyProfile(),
    T0,
    () => resolveUnsavedChanges(false, async () => { askCalls += 1; return 'cancel'; }, async () => { saveCalls += 1; return true; }),
  );
  assert.ok(res, 'clean session proceeds');
  assert.equal(askCalls, 0, 'no prompt when not dirty');
  assert.equal(saveCalls, 0, 'no save when not dirty');
  assert.equal(res.blocks.length, 5, 'template content instantiated');

  // Dirty + Discard -> proceed, save must NOT run.
  saveCalls = 0;
  res = await resolveChooserSelection(
    choice,
    emptyProfile(),
    T0,
    () => resolveUnsavedChanges(true, async () => 'discard', async () => { saveCalls += 1; return true; }),
  );
  assert.ok(res, 'discard proceeds');
  assert.equal(saveCalls, 0, 'discard must not save');

  // Dirty + Save (success) -> proceed, save runs exactly once.
  saveCalls = 0;
  res = await resolveChooserSelection(
    choice,
    emptyProfile(),
    T0,
    () => resolveUnsavedChanges(true, async () => 'save', async () => { saveCalls += 1; return true; }),
  );
  assert.ok(res, 'successful save proceeds');
  assert.equal(saveCalls, 1, 'save runs exactly once');

  // Dirty + Cancel -> abort, no replacement document.
  res = await resolveChooserSelection(
    choice,
    emptyProfile(),
    T0,
    () => resolveUnsavedChanges(true, async () => 'cancel', async () => { throw new Error('save must not run'); }),
  );
  assert.equal(res, null, 'cancel aborts the replacement');
});

// ── 17. Cancelled save or save failure aborts pending replacement ───────────
test('17. cancelled save or save failure aborts pending document replacement', async () => {
  const choice = exampleChoice();
  const blank = buildChoiceList(getBuiltinTemplates(), labelFor)[0];

  // Save dialog cancelled -> save() reports false -> abort (no document).
  let res = await resolveChooserSelection(
    choice,
    emptyProfile(),
    T0,
    () => resolveUnsavedChanges(true, async () => 'save', async () => false),
  );
  assert.equal(res, null, 'cancelled save aborts replacement');

  // Write failure -> handleSave catches and reports false -> abort.
  res = await resolveChooserSelection(
    choice,
    emptyProfile(),
    T0,
    () => resolveUnsavedChanges(true, async () => 'save', async () => false),
  );
  assert.equal(res, null, 'failed save aborts replacement');

  // An unexpected guard exception must abort too (never replace unsafely).
  res = await resolveChooserSelection(choice, emptyProfile(), T0, async () => {
    throw new Error('boom');
  });
  assert.equal(res, null, 'guard exception aborts replacement');

  // The same guard semantics apply to the blank choice.
  res = await resolveChooserSelection(blank, emptyProfile(), T0, async () => 'abort');
  assert.equal(res, null, 'blank choice also guarded');
  res = await resolveChooserSelection(blank, emptyProfile(), T0, async () => 'proceed');
  assert.ok(res, 'blank choice proceeds when the guard passes');
  assert.deepEqual(res.blocks, [], 'the proceeding blank document really is blank');
});

// ── 18. Existing P02/P03 behavior has no regression ─────────────────────────
test('18. existing P02/P03 document and template behavior has no regression', () => {
  // Document round-trip + lifecycle (P02-M2/M3).
  const doc = docActions.createNewDocument(T0);
  const text = serializeDocument(doc);
  assert.equal(deserializeDocument(text).id, doc.id);
  assert.equal(deserializeDocument(text).schemaVersion, doc.schemaVersion);

  const edited = docActions.updateDocumentMetadata(doc, { title: 'X' }, T1);
  assert.notEqual(edited.metadata.modifiedAt, doc.metadata.modifiedAt, 'real edit stamps modifiedAt');
  assert.equal(docActions.updateDocumentMetadata(edited, { title: 'X' }, T2), edited, 'no-op returns same ref');
  const dup = docActions.duplicateDocument(edited, T3);
  assert.equal(dup.metadata.title, 'X (Copy)', 'duplicate keeps the (Copy) suffix');

  // Dirty/status helpers (P02-M3).
  const fp = docActions.sessionFingerprint(edited);
  assert.equal(docActions.isDirty(fp, docActions.sessionFingerprint(doc)), true);
  assert.equal(docActions.deriveSessionStatus(fp, fp, false), 'New');
  assert.equal(docActions.deriveSessionStatus(fp, fp, true), 'Saved');

  // Template round-trip is deterministic (P03-M1).
  const t = createExampleSopTemplate();
  const tText = serializeTemplate(t);
  assert.equal(serializeTemplate(deserializeTemplate(tText)), tText, 'deterministic round-trip');
  assert.equal(docDefaults.createDefaultDocument(docDefaults.newUUID(), T0).metadata.title, 'Untitled Document');
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
      console.error(`FAIL  ${t.name}\n      ${e && e.message}`);
    }
  }
  console.log(`\nP03-M2 verification: ${passed} passed, ${failed.length} failed.`);
  if (failed.length > 0) {
    console.error(`Failed: ${failed.join(', ')}`);
    process.exit(1);
  }
};

await run();
