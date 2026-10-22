/**
 * P06-M5 Verification Suite — Laboratory-Specific Blocks
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Proves, against the REAL compiled modules (no mocks, no reimplementation):
 *  1. module surface — every P06-M5 export reachable from the node entry;
 *  2. the block registry — the six laboratory types are registered in the
 *     `lab` insertion category with schema-valid default factories and
 *     structural summaries;
 *  3. the lab content service — every action family of the six types:
 *     add/edit/remove/reorder of steps, items, rows, columns and
 *     criteria, required-field and boundary validation (empty required
 *     fields, over-limit titles/text, invalid enums, invalid dates,
 *     the 12-column worksheet cap), LaTeX validation THROUGH the real
 *     MathJax engine, measurement cell keys, author-entered verdict
 *     rules, every rejection code, no-op identity, `modifiedAt`
 *     stamping, source immutability and dispatcher safety;
 *  4. serialization — schema-v1 round trips with all six laboratory
 *     types, stable ids and no content loss;
 *  5. editor components — the six editors rendered with
 *     react-dom/server (real markup: labels, caps, selects, buttons)
 *     plus the App → Workspace → EditorPanel `onLabAction` wiring;
 *  6. PDF output (REAL `PocDocument` + pdfjs) — text presence for every
 *     laboratory block family, auto/manual step numbering, honest empty
 *     states, honest invalid-LaTeX fallback, vector math painting for
 *     calculation steps, handwriting-space row geometry, page-margin
 *     containment for wide worksheet tables, interaction with
 *     page/section breaks, headers/footers, formulas, images,
 *     signatures and structural blocks, and absence of unsupported-block
 *     fallback markers;
 *  7. the four representative sample documents (SOP, technical
 *     procedure, worksheet/rough datasheet, exhibit) — authoring,
 *     serialization round trips, rendering and text assertions;
 *  8. regression — the committed P02-M4 baseline still renders
 *     byte-identically (read-only), no new artifacts are written and
 *     the schema version stays 1.
 *
 * FIXTURES AND BASELINES: this suite reads the committed P02-M4 baseline
 * READ-ONLY and writes no files outside node_modules/.cache.
 * `UPDATE_ARTIFACTS` is not read or written here.
 *
 * @module verify_p06_m5
 */

/* eslint-disable no-console */

import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { execSync } from 'node:child_process';

const require = createRequire(import.meta.url);
const root = path.dirname(new URL(import.meta.url).pathname.replace(/^\//, ''));
const CACHE = path.join(root, 'node_modules', '.cache', 'ds-p06-m5-verify');

// ── Test harness ────────────────────────────────────────────────────────────
let passed = 0;
const failed = [];
async function test(name, fn) {
  try {
    await fn();
    passed += 1;
    console.log(`PASS  ${name}`);
  } catch (e) {
    failed.push(name);
    console.error(`FAIL  ${name}\n      ${e && e.message ? e.message : e}`);
  }
}
function group(title) {
  console.log(`\n── ${title} ${'─'.repeat(Math.max(0, 66 - title.length))}`);
}

// ── Compile the real modules under test ─────────────────────────────────────
// Compiled (not bundled) inside node_modules/.cache so bare imports resolve
// to the REAL installed packages — same pattern as verify_p06_m1..m4.
group('compile');
const COMPILE_ROOTS = [
  'src/renderer/poc/poc-node-entry.ts',
  'src/services/block-registry.ts',
  // The P06-M5 editors are rendered with react-dom/server below so the
  // controls and states are asserted from real component output.
  'src/components/editor-panel/LabContentEditor.tsx',
];
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

const pick = (...candidates) => {
  const hit = candidates.find((p) => fs.existsSync(p));
  if (!hit) throw new Error(`compiled module not found:\n  ${candidates.join('\n  ')}`);
  return require(hit);
};

const pocNode = pick(
  path.join(CACHE, 'renderer', 'poc', 'poc-node-entry.js'),
  path.join(CACHE, 'src', 'renderer', 'poc', 'poc-node-entry.js'),
);
const registry = pick(
  path.join(CACHE, 'services', 'block-registry.js'),
  path.join(CACHE, 'src', 'services', 'block-registry.js'),
);
const defaults = pick(
  path.join(CACHE, 'types', 'defaults.js'),
  path.join(CACHE, 'src', 'types', 'defaults.js'),
);
const documentFile = pick(
  path.join(CACHE, 'services', 'document-file.js'),
  path.join(CACHE, 'src', 'services', 'document-file.js'),
);
const editorModule = pick(
  path.join(CACHE, 'components', 'editor-panel', 'LabContentEditor.js'),
  path.join(CACHE, 'src', 'components', 'editor-panel', 'LabContentEditor.js'),
);

const {
  renderDocPdfBytes,
  buildPocFixture,
  POC_CREATED_AT,
  computePocLayout,
  createBlock,
  serializeDocument,
  // P06-M5 surface
  MAX_LAB_TEXT_LENGTH,
  MAX_LAB_TITLE_LENGTH,
  MAX_LAB_STEP_NUMBER_LENGTH,
  MAX_LAB_UNIT_LENGTH,
  MAX_MEASUREMENT_COLUMNS,
  PROCEDURE_STEP_LEVELS,
  PROCEDURE_LEVEL_LABELS,
  CRITERIA_RESULTS,
  CRITERIA_RESULT_LABELS,
  LAB_DATE_PATTERN,
  applyLabAction,
  buildLabSopSampleDoc,
  buildLabProcedureSampleDoc,
  buildLabWorksheetSampleDoc,
  buildLabExhibitSampleDoc,
  LAB_SAMPLE_CREATED_AT,
} = pocNode;
const { BLOCK_REGISTRY, summarizeBlockData } = registry;
const { createDefaultDocument, newUUID } = defaults;
const { serializeDocument: serialize, deserializeDocument } = documentFile;
const { renderToStaticMarkup } = require('react-dom/server');
const React = require('react');

// ── Fixtures and service helpers ────────────────────────────────────────────
const T0 = POC_CREATED_AT;
const STAMP = '2026-10-22T10:00:00.000Z';
let idSeq = 0;
const genId = () => `06500000-0000-4000-8000-${String(++idSeq).padStart(12, '0')}`;
/**
 * Suite documents start with the cover page DISABLED so that page-count
 * assertions describe BODY pagination only (same policy as verify_p06_m2/m3/m4).
 */
const newDoc = (id = 'lab-doc-1') => {
  const doc = createDefaultDocument(id, T0);
  return doc.frontPage === undefined || doc.frontPage.enabled === undefined
    ? doc
    : { ...doc, frontPage: { ...doc.frontPage, enabled: false } };
};

function applied(res, label) {
  assert.equal(
    res.ok,
    true,
    `${label}: expected ok, got ${res.ok ? '' : `${res.code} — ${res.message}`}`,
  );
  assert.equal(res.changed, true, `${label}: expected a real change`);
  return res.doc;
}
function rejected(res, code, label) {
  assert.equal(res.ok, false, `${label}: expected rejection, the change was applied`);
  assert.equal(res.code, code, `${label}: error code (message: ${res.message})`);
}
function noOp(res, sourceDoc, label) {
  assert.equal(res.ok, true, `${label}: no-ops are still ok`);
  assert.equal(res.changed, false, `${label}: expected changed=false`);
  assert.equal(res.doc, sourceDoc, `${label}: no-op returns the SAME reference`);
}
/** Append a registry-default block of `type` (real factory). */
function insertBlock(doc, type) {
  const block = createBlock(type, genId);
  return { doc: { ...doc, blocks: [...doc.blocks, block] }, block };
}
/** Address the single block of `type` (asserts exactly one exists). */
const only = (doc, type) => {
  const hits = doc.blocks.filter((b) => b.data.type === type);
  assert.equal(hits.length, 1, `fixture must hold exactly one ${type}`);
  return hits[0];
};
/**
 * Find a lab entry by id inside a list (asserts it exists).
 * Registry defaults ship ONE starter entry per list, so tests target the
 * entry the service actually created rather than index 0.
 */
const entryOf = (list, id, what) => {
  const hit = list.find((e) => e.id === id);
  assert.ok(hit !== undefined, `${what} entry ${id} must exist`);
  return hit;
};
/** Dispatch one action through the real P06-M5 dispatcher. */
const act = (doc, blockId, action, now = STAMP) =>
  applyLabAction(doc, blockId, action, { now, genId });

// ═══════════════════════════════════════════════════════════════════════════
group('1 · module surface');
// ═══════════════════════════════════════════════════════════════════════════

await test('1.1 every P06-M5 export is reachable from the node entry', () => {
  const expected = [
    'MAX_LAB_TEXT_LENGTH', 'MAX_LAB_TITLE_LENGTH', 'MAX_LAB_STEP_NUMBER_LENGTH',
    'MAX_LAB_UNIT_LENGTH', 'MAX_MEASUREMENT_COLUMNS', 'PROCEDURE_STEP_LEVELS',
    'PROCEDURE_LEVEL_LABELS', 'CRITERIA_RESULTS', 'CRITERIA_RESULT_LABELS',
    'LAB_DATE_PATTERN', 'applyLabAction',
    'addProcedureStep', 'updateProcedureStep', 'removeProcedureStep', 'moveProcedureStep',
    'addEquipmentItem', 'updateEquipmentItem', 'removeEquipmentItem', 'moveEquipmentItem',
    'addObservationRow', 'updateObservationRow', 'removeObservationRow', 'moveObservationRow',
    'addMeasurementColumn', 'updateMeasurementColumn', 'removeMeasurementColumn',
    'moveMeasurementColumn', 'addMeasurementRow', 'setMeasurementCell',
    'removeMeasurementRow', 'moveMeasurementRow', 'setMeasurementUncertaintyNote',
    'addCalculationStep', 'updateCalculationStep', 'removeCalculationStep',
    'moveCalculationStep', 'setCalculationConclusion',
    'addAcceptanceCriterion', 'updateAcceptanceCriterion', 'removeAcceptanceCriterion',
    'moveAcceptanceCriterion', 'setAcceptanceOverallResult',
    'buildLabSopSampleDoc', 'buildLabProcedureSampleDoc', 'buildLabWorksheetSampleDoc',
    'buildLabExhibitSampleDoc', 'LAB_SAMPLE_CREATED_AT',
  ];
  for (const name of expected) {
    assert.notEqual(pocNode[name], undefined, `poc-node-entry must export ${name}`);
  }
});

await test('1.2 contract constants carry the documented values', () => {
  assert.equal(MAX_LAB_TEXT_LENGTH, 4000, 'free-text cap');
  assert.equal(MAX_LAB_TITLE_LENGTH, 200, 'title cap');
  assert.equal(MAX_LAB_STEP_NUMBER_LENGTH, 40, 'step-number cap');
  assert.equal(MAX_LAB_UNIT_LENGTH, 60, 'unit cap');
  assert.equal(MAX_MEASUREMENT_COLUMNS, 12, 'worksheet column cap');
  assert.deepEqual([...PROCEDURE_STEP_LEVELS], ['main', 'sub', 'note', 'warning', 'caution']);
  assert.deepEqual([...CRITERIA_RESULTS], ['pass', 'fail', 'inconclusive', 'not-applicable', 'pending']);
  assert.equal(CRITERIA_RESULT_LABELS['not-applicable'], 'N/A', 'verdict label');
  assert.equal(PROCEDURE_LEVEL_LABELS.warning, 'Warning', 'level label');
  assert.equal(LAB_DATE_PATTERN.test('2027-01-31'), true, 'date pattern accepts YYYY-MM-DD');
  assert.equal(LAB_DATE_PATTERN.test('31/01/2027'), false, 'date pattern rejects other formats');
});

// ═══════════════════════════════════════════════════════════════════════════
group('2 · block registry and insertion');
// ═══════════════════════════════════════════════════════════════════════════

const LAB_TYPES = [
  'procedure-step', 'equipment-list', 'observation',
  'measurement', 'calculation', 'acceptance-criteria',
];

await test('2.1 all six laboratory types are registered in the `lab` category', () => {
  for (const type of LAB_TYPES) {
    const entry = BLOCK_REGISTRY[type];
    assert.ok(entry, `${type} must be registered`);
    assert.equal(entry.category, 'lab', `${type} category`);
    assert.ok(entry.displayName.length > 0, `${type} displayName`);
    assert.ok(entry.description.length > 0, `${type} description`);
    assert.ok(entry.icon, `${type} icon`);
    assert.equal(typeof entry.createDefault, 'function', `${type} factory`);
  }
  assert.equal(typeof summarizeBlockData, 'function', 'summaries use the standalone helper');
});

await test('2.2 default factories produce schema-valid blocks with stable IDs', () => {
  for (const type of LAB_TYPES) {
    const block = BLOCK_REGISTRY[type].createDefault();
    assert.equal(block.data.type, type, `${type} discriminant`);
    assert.equal(typeof block.id, 'string', `${type} block id`);
    assert.ok(block.id.length > 0, `${type} block id non-empty`);
    assert.equal(typeof block.spacing.topPt, 'number', `${type} spacing top`);
    assert.equal(typeof block.spacing.bottomPt, 'number', `${type} spacing bottom`);
    // The document must round-trip through the REAL serializer.
    const doc = { ...newDoc(`reg-${type}`), blocks: [block] };
    const round = deserializeDocument(serialize(doc));
    assert.deepEqual(round.blocks[0], block, `${type} survives the serializer`);
  }
});

await test('2.3 structural summaries are honest and type-specific', () => {
  let doc = newDoc('sum');
  const texts = {};
  for (const type of LAB_TYPES) {
    doc = insertBlock(doc, type).doc;
    const block = only(doc, type);
    texts[type] = summarizeBlockData(block.data);
    assert.ok(texts[type].length > 0, `${type} summary non-empty`);
    assert.ok(!texts[type].includes('undefined'), `${type} summary has no undefined`);
  }
  assert.ok(texts['procedure-step'].includes('step'), 'procedure summary mentions steps');
  assert.ok(texts['equipment-list'].includes('item'), 'equipment summary mentions items');
  assert.ok(texts.measurement.includes('column'), 'measurement summary mentions columns');
});

// ═══════════════════════════════════════════════════════════════════════════
group('3 · procedure-step service');
// ═══════════════════════════════════════════════════════════════════════════

await test('3.1 add step: fresh stable id, entryId hint, stamped', () => {
  let doc = newDoc('proc-1');
  const created = insertBlock(doc, 'procedure-step');
  doc = created.doc;
  const block = only(doc, 'procedure-step');
  const res = act(doc, block.id, { action: 'add-procedure-step' });
  doc = applied(res, 'add step');
  assert.ok(res.entryId, 'the fresh entry id is returned');
  const data = only(doc, 'procedure-step').data;
  // The registry default ships one starter step; the add appends ONE more.
  assert.equal(data.steps.length, 2, 'starter + one added step stored');
  assert.equal(data.steps[0].spans[0].text, 'Procedure step description.', 'starter untouched');
  const added = entryOf(data.steps, res.entryId, 'procedure step');
  assert.equal(added.level, 'main', 'default level');
  assert.deepEqual(added.spans, [], 'default spans');
  assert.equal(doc.metadata.modifiedAt, STAMP, 'modifiedAt stamped');
});

await test('3.2 update step: level, step number and spans commit independently', () => {
  let doc = newDoc('proc-2');
  doc = insertBlock(doc, 'procedure-step').doc;
  const block = only(doc, 'procedure-step');
  const added = act(doc, block.id, { action: 'add-procedure-step' });
  doc = applied(added, 'add step');
  const stepId = added.entryId;
  const stepOf = () => entryOf(only(doc, 'procedure-step').data.steps, stepId, 'procedure step');

  doc = applied(
    act(doc, block.id, { action: 'update-procedure-step', stepId, patch: { level: 'warning' } }),
    'set level',
  );
  assert.equal(stepOf().level, 'warning');

  doc = applied(
    act(doc, block.id, { action: 'update-procedure-step', stepId, patch: { stepNumber: '4.1' } }),
    'set step number',
  );
  assert.equal(stepOf().stepNumber, '4.1');

  doc = applied(
    act(doc, block.id, {
      action: 'update-procedure-step', stepId, patch: { spans: [{ text: 'Weigh the sample.' }] },
    }),
    'set spans',
  );
  assert.equal(stepOf().spans[0].text, 'Weigh the sample.');

  // Clearing the step number returns it to auto-numbering.
  doc = applied(
    act(doc, block.id, { action: 'update-procedure-step', stepId, patch: { stepNumber: '' } }),
    'clear step number',
  );
  assert.equal(stepOf().stepNumber, undefined, 'cleared');
});

await test('3.3 update step rejections: level, step number, spans, missing entry', () => {
  let doc = newDoc('proc-3');
  doc = insertBlock(doc, 'procedure-step').doc;
  const block = only(doc, 'procedure-step');
  const added = act(doc, block.id, { action: 'add-procedure-step' });
  doc = applied(added, 'add step');
  const stepId = added.entryId;

  rejected(
    act(doc, block.id, { action: 'update-procedure-step', stepId, patch: { level: 'critical' } }),
    'invalid-level', 'invalid level rejected',
  );
  rejected(
    act(doc, block.id, {
      action: 'update-procedure-step', stepId, patch: { stepNumber: 'x'.repeat(MAX_LAB_STEP_NUMBER_LENGTH + 1) },
    }),
    'invalid-step-number', 'over-long step number rejected',
  );
  rejected(
    act(doc, block.id, { action: 'update-procedure-step', stepId, patch: { spans: 'not-an-array' } }),
    'invalid-spans', 'non-array spans rejected',
  );
  rejected(
    act(doc, block.id, { action: 'update-procedure-step', stepId: genId(), patch: { level: 'sub' } }),
    'missing-entry', 'unknown step id rejected',
  );
  // The document is untouched by every rejection.
  const untouched = entryOf(only(doc, 'procedure-step').data.steps, stepId, 'procedure step');
  assert.equal(untouched.level, 'main', 'no partial change to the added step');
  assert.deepEqual(untouched.spans, [], 'no partial span change');
});

await test('3.4 reorder: middle move changes order, edges are no-ops', () => {
  let doc = newDoc('proc-4');
  doc = insertBlock(doc, 'procedure-step').doc;
  const block = only(doc, 'procedure-step');
  // Drop the starter step so the reorder math starts from a clean list.
  doc = applied(
    act(doc, block.id, {
      action: 'remove-procedure-step',
      stepId: only(doc, 'procedure-step').data.steps[0].id,
    }),
    'remove starter step',
  );
  for (let i = 0; i < 3; i += 1) {
    doc = applied(act(doc, block.id, { action: 'add-procedure-step' }), `add step ${i}`);
  }
  let data = only(doc, 'procedure-step').data;
  const [a, b, c] = data.steps.map((s) => s.id);

  doc = applied(act(doc, block.id, { action: 'move-procedure-step', stepId: c, direction: 'up' }), 'move up');
  assert.deepEqual(only(doc, 'procedure-step').data.steps.map((s) => s.id), [a, c, b], 'order after up');

  noOp(
    act(doc, block.id, { action: 'move-procedure-step', stepId: a, direction: 'up' }),
    doc, 'moving the first up is a no-op',
  );
  noOp(
    act(doc, block.id, { action: 'move-procedure-step', stepId: b, direction: 'down' }),
    doc, 'moving the last (b) down is a no-op',
  );
  rejected(
    act(doc, block.id, { action: 'move-procedure-step', stepId: a, direction: 'sideways' }),
    'invalid-direction', 'invalid direction rejected',
  );
});

await test('3.5 remove to zero keeps the block honest; title set/clear/no-op', () => {
  let doc = newDoc('proc-5');
  doc = insertBlock(doc, 'procedure-step').doc;
  const block = only(doc, 'procedure-step');
  const starterId = only(doc, 'procedure-step').data.steps[0].id;
  const added = act(doc, block.id, { action: 'add-procedure-step' });
  doc = applied(added, 'add step');
  assert.equal(only(doc, 'procedure-step').data.steps.length, 2, 'starter + added step');
  const stepId = added.entryId;
  doc = applied(act(doc, block.id, { action: 'remove-procedure-step', stepId }), 'remove added step');
  doc = applied(act(doc, block.id, { action: 'remove-procedure-step', stepId: starterId }), 'remove starter step');
  assert.equal(only(doc, 'procedure-step').data.steps.length, 0, 'empty step list allowed');
  rejected(
    act(doc, block.id, { action: 'remove-procedure-step', stepId }),
    'missing-entry', 'removing an unknown step rejected',
  );

  doc = applied(act(doc, block.id, { action: 'update-procedure-title', title: 'Procedure' }), 'set title');
  assert.equal(only(doc, 'procedure-step').data.sectionTitle, 'Procedure', 'sectionTitle stored');
  noOp(
    act(doc, block.id, { action: 'update-procedure-title', title: 'Procedure' }),
    doc, 'same title is a no-op',
  );
  doc = applied(act(doc, block.id, { action: 'update-procedure-title', title: null }), 'clear title');
  assert.equal(only(doc, 'procedure-step').data.sectionTitle, undefined, 'cleared');
  rejected(
    act(doc, block.id, { action: 'update-procedure-title', title: 't'.repeat(MAX_LAB_TITLE_LENGTH + 1) }),
    'invalid-title', 'over-long title rejected',
  );
});

// ═══════════════════════════════════════════════════════════════════════════
group('4 · equipment-list service');
// ═══════════════════════════════════════════════════════════════════════════

await test('4.1 add/update item: required name, optional fields, flags, dates', () => {
  let doc = newDoc('eq-1');
  doc = insertBlock(doc, 'equipment-list').doc;
  const block = only(doc, 'equipment-list');
  const res = act(doc, block.id, { action: 'add-equipment-item' });
  doc = applied(res, 'add item');
  const itemId = res.entryId;
  assert.ok(itemId, 'entryId hint returned');

  rejected(
    act(doc, block.id, { action: 'update-equipment-item', itemId, patch: { name: '' } }),
    'invalid-name', 'empty name rejected',
  );
  doc = applied(
    act(doc, block.id, { action: 'update-equipment-item', itemId, patch: { name: 'Analytical balance' } }),
    'set name',
  );
  doc = applied(
    act(doc, block.id, { action: 'update-equipment-item', itemId, patch: { assetTag: 'LAB-B01' } }),
    'set asset tag',
  );
  doc = applied(
    act(doc, block.id, { action: 'update-equipment-item', itemId, patch: { calibrationDue: '2027-01-31' } }),
    'set calibration date',
  );
  rejected(
    act(doc, block.id, { action: 'update-equipment-item', itemId, patch: { calibrationDue: '31/01/2027' } }),
    'invalid-date', 'invalid date format rejected',
  );
  rejected(
    act(doc, block.id, { action: 'update-equipment-item', itemId, patch: { mandatory: 'yes' } }),
    'invalid-flag', 'non-boolean mandatory rejected',
  );
  doc = applied(
    act(doc, block.id, { action: 'update-equipment-item', itemId, patch: { mandatory: false } }),
    'clear mandatory',
  );
  const item = entryOf(only(doc, 'equipment-list').data.items, itemId, 'equipment item');
  assert.equal(item.name, 'Analytical balance');
  assert.equal(item.assetTag, 'LAB-B01');
  assert.equal(item.calibrationDue, '2027-01-31');
  assert.equal(item.mandatory, false);

  // Optional fields clear with '' back to undefined.
  doc = applied(
    act(doc, block.id, { action: 'update-equipment-item', itemId, patch: { assetTag: '' } }),
    'clear asset tag',
  );
  assert.equal(
    entryOf(only(doc, 'equipment-list').data.items, itemId, 'equipment item').assetTag,
    undefined,
    'cleared to undefined',
  );
  noOp(
    act(doc, block.id, { action: 'update-equipment-item', itemId, patch: { name: 'Analytical balance' } }),
    doc, 'identical patch is a no-op',
  );
});

await test('4.2 reorder and remove items; title and missing-entry safety', () => {
  let doc = newDoc('eq-2');
  doc = insertBlock(doc, 'equipment-list').doc;
  const block = only(doc, 'equipment-list');
  // Drop the starter item so the reorder math starts from a clean list.
  doc = applied(
    act(doc, block.id, { action: 'remove-equipment-item', itemId: only(doc, 'equipment-list').data.items[0].id }),
    'remove starter item',
  );
  for (const name of ['Oven', 'Balance', 'Desiccator']) {
    const res = act(doc, block.id, { action: 'add-equipment-item' });
    doc = applied(res, `add ${name}`);
    doc = applied(
      act(doc, block.id, { action: 'update-equipment-item', itemId: res.entryId, patch: { name } }),
      `name ${name}`,
    );
  }
  let ids = only(doc, 'equipment-list').data.items.map((i) => i.id);
  doc = applied(act(doc, block.id, { action: 'move-equipment-item', itemId: ids[2], direction: 'up' }), 'move up');
  ids = only(doc, 'equipment-list').data.items.map((i) => i.id);
  assert.equal(only(doc, 'equipment-list').data.items[1].name, 'Desiccator', 'reordered');

  doc = applied(act(doc, block.id, { action: 'remove-equipment-item', itemId: ids[1] }), 'remove middle');
  assert.equal(only(doc, 'equipment-list').data.items.length, 2, 'two left');
  rejected(
    act(doc, block.id, { action: 'remove-equipment-item', itemId: genId() }),
    'missing-entry', 'unknown item rejected',
  );
  doc = applied(act(doc, block.id, { action: 'update-equipment-title', title: 'Equipment' }), 'set title');
  assert.equal(only(doc, 'equipment-list').data.title, 'Equipment');
});

// ═══════════════════════════════════════════════════════════════════════════
group('5 · observation service');
// ═══════════════════════════════════════════════════════════════════════════

await test('5.1 add/update rows: required parameter, blank values allowed', () => {
  let doc = newDoc('obs-1');
  doc = insertBlock(doc, 'observation').doc;
  const block = only(doc, 'observation');
  const res = act(doc, block.id, { action: 'add-observation-row' });
  doc = applied(res, 'add row');
  const rowId = res.entryId;

  rejected(
    act(doc, block.id, { action: 'update-observation-row', rowId, patch: { parameter: '' } }),
    'invalid-parameter', 'empty parameter rejected',
  );
  doc = applied(
    act(doc, block.id, { action: 'update-observation-row', rowId, patch: { parameter: 'Appearance' } }),
    'set parameter',
  );
  // Blank observed value is legitimate (hand recording space); on an
  // already-blank field it is an ACCEPTED no-op, never a rejection.
  noOp(
    act(doc, block.id, { action: 'update-observation-row', rowId, patch: { observedValue: '' } }),
    doc, 'blank value allowed (no-op on an already-blank field)',
  );
  doc = applied(
    act(doc, block.id, { action: 'update-observation-row', rowId, patch: { observedValue: 'Clear', remarks: 'None' } }),
    'set value + remarks',
  );
  const row = entryOf(only(doc, 'observation').data.rows, rowId, 'observation row');
  assert.equal(row.parameter, 'Appearance');
  assert.equal(row.observedValue, 'Clear');
  assert.equal(row.remarks, 'None');

  // Writing blank over a recorded value IS a real change (clearing it).
  doc = applied(
    act(doc, block.id, { action: 'update-observation-row', rowId, patch: { observedValue: '' } }),
    'clear value back to blank',
  );
  assert.equal(
    entryOf(only(doc, 'observation').data.rows, rowId, 'observation row').observedValue ?? '',
    '',
    'value is blank after clearing',
  );

  doc = applied(
    act(doc, block.id, { action: 'update-observation-row', rowId, patch: { remarks: null } }),
    'clear remarks',
  );
  assert.equal(
    entryOf(only(doc, 'observation').data.rows, rowId, 'observation row').remarks,
    undefined,
    'null clears',
  );
});

await test('5.2 reorder/remove rows and title', () => {
  let doc = newDoc('obs-2');
  doc = insertBlock(doc, 'observation').doc;
  const block = only(doc, 'observation');
  // Drop the starter row so the reorder math starts from a clean list.
  doc = applied(
    act(doc, block.id, { action: 'remove-observation-row', rowId: only(doc, 'observation').data.rows[0].id }),
    'remove starter row',
  );
  for (const parameter of ['A', 'B', 'C']) {
    const res = act(doc, block.id, { action: 'add-observation-row' });
    doc = applied(res, `add ${parameter}`);
    doc = applied(
      act(doc, block.id, { action: 'update-observation-row', rowId: res.entryId, patch: { parameter } }),
      `name ${parameter}`,
    );
  }
  const ids = only(doc, 'observation').data.rows.map((r) => r.id);
  doc = applied(act(doc, block.id, { action: 'move-observation-row', rowId: ids[1], direction: 'down' }), 'move B down');
  assert.deepEqual(only(doc, 'observation').data.rows.map((r) => r.parameter), ['A', 'C', 'B']);
  doc = applied(act(doc, block.id, { action: 'remove-observation-row', rowId: ids[0] }), 'remove A');
  assert.equal(only(doc, 'observation').data.rows.length, 2);
  doc = applied(act(doc, block.id, { action: 'update-observation-title', title: 'Observations' }), 'set title');
  assert.equal(only(doc, 'observation').data.title, 'Observations');
});

// ═══════════════════════════════════════════════════════════════════════════
group('6 · measurement / worksheet service');
// ═══════════════════════════════════════════════════════════════════════════

await test('6.1 columns: add, rename, unit set/clear, the 12-column cap', () => {
  let doc = newDoc('ms-1');
  doc = insertBlock(doc, 'measurement').doc;
  const block = only(doc, 'measurement');
  // The registry default measurement starts with at least one column.
  const defaultColumns = only(doc, 'measurement').data.columns.length;
  assert.ok(defaultColumns >= 1, 'default has a column');

  const res = act(doc, block.id, { action: 'add-measurement-column' });
  doc = applied(res, 'add column');
  const columnId = res.entryId;
  rejected(
    act(doc, block.id, { action: 'update-measurement-column', columnId, patch: { header: '' } }),
    'invalid-column-header', 'empty header rejected',
  );
  doc = applied(
    act(doc, block.id, { action: 'update-measurement-column', columnId, patch: { header: 'Reading', unit: 'Hz' } }),
    'rename + unit',
  );
  rejected(
    act(doc, block.id, { action: 'update-measurement-column', columnId, patch: { unit: 'u'.repeat(MAX_LAB_UNIT_LENGTH + 1) } }),
    'invalid-unit', 'over-long unit rejected',
  );
  doc = applied(
    act(doc, block.id, { action: 'update-measurement-column', columnId, patch: { unit: '' } }),
    'clear unit',
  );
  assert.equal(only(doc, 'measurement').data.columns.find((c) => c.id === columnId).unit, undefined);

  // Fill to the cap, then one more must be rejected.
  let data = only(doc, 'measurement').data;
  while (data.columns.length < MAX_MEASUREMENT_COLUMNS) {
    doc = applied(act(doc, block.id, { action: 'add-measurement-column' }), 'fill column');
    data = only(doc, 'measurement').data;
  }
  rejected(
    act(doc, block.id, { action: 'add-measurement-column' }),
    'too-many-columns', 'column cap enforced',
  );
});

await test('6.2 column removal cascades cell values; move left/right; missing entry', () => {
  let doc = newDoc('ms-2');
  doc = insertBlock(doc, 'measurement').doc;
  const block = only(doc, 'measurement');
  const added = act(doc, block.id, { action: 'add-measurement-column' });
  doc = applied(added, 'add column');
  const columnId = added.entryId;
  doc = applied(act(doc, block.id, { action: 'add-measurement-row' }), 'add row');
  const rowId = only(doc, 'measurement').data.rows[0].id;
  doc = applied(
    act(doc, block.id, { action: 'set-measurement-cell', rowId, columnId, value: '12.5' }),
    'set cell',
  );
  assert.equal(only(doc, 'measurement').data.rows[0].values[columnId], '12.5');

  const ids = only(doc, 'measurement').data.columns.map((c) => c.id);
  doc = applied(act(doc, block.id, { action: 'move-measurement-column', columnId: ids[ids.length - 1], direction: 'up' }), 'move column left');
  doc = applied(act(doc, block.id, { action: 'remove-measurement-column', columnId }), 'remove column');
  const data = only(doc, 'measurement').data;
  assert.equal(data.columns.some((c) => c.id === columnId), false, 'column gone');
  assert.equal(Object.values(data.rows[0].values).includes('12.5'), false, 'cell values cascaded');
  rejected(
    act(doc, block.id, { action: 'remove-measurement-column', columnId }),
    'missing-entry', 'unknown column rejected',
  );
});

await test('6.3 rows and cells: blank allowed, unknown column, reorder, remove', () => {
  let doc = newDoc('ms-3');
  doc = insertBlock(doc, 'measurement').doc;
  const block = only(doc, 'measurement');
  // Drop the starter row so the row-order assertions start clean.
  doc = applied(
    act(doc, block.id, { action: 'remove-measurement-row', rowId: only(doc, 'measurement').data.rows[0].id }),
    'remove starter row',
  );
  const colA = only(doc, 'measurement').data.columns[0].id;
  const add = act(doc, block.id, { action: 'add-measurement-column' });
  doc = applied(add, 'add second column');
  const colB = add.entryId;

  const r1 = act(doc, block.id, { action: 'add-measurement-row' });
  doc = applied(r1, 'add row 1');
  const r2 = act(doc, block.id, { action: 'add-measurement-row' });
  doc = applied(r2, 'add row 2');

  // Blank cell write is legitimate (handwriting space) and a no-op for an
  // already-blank cell.
  noOp(
    act(doc, block.id, { action: 'set-measurement-cell', rowId: r1.entryId, columnId: colA, value: '' }),
    doc, 'blank cell on blank cell is a no-op',
  );
  doc = applied(
    act(doc, block.id, { action: 'set-measurement-cell', rowId: r1.entryId, columnId: colB, value: '42' }),
    'set value',
  );
  rejected(
    act(doc, block.id, { action: 'set-measurement-cell', rowId: r1.entryId, columnId: genId(), value: '1' }),
    'unknown-column', 'unknown column rejected',
  );
  rejected(
    act(doc, block.id, { action: 'set-measurement-cell', rowId: genId(), columnId: colA, value: '1' }),
    'missing-entry', 'unknown row rejected',
  );
  rejected(
    act(doc, block.id, { action: 'set-measurement-cell', rowId: r1.entryId, columnId: colA, value: { bad: true } }),
    'invalid-cell', 'non-text cell rejected',
  );

  doc = applied(act(doc, block.id, { action: 'move-measurement-row', rowId: r2.entryId, direction: 'up' }), 'reorder rows');
  assert.equal(only(doc, 'measurement').data.rows[0].id, r2.entryId, 'row moved up');
  doc = applied(act(doc, block.id, { action: 'remove-measurement-row', rowId: r2.entryId }), 'remove row');
  assert.equal(only(doc, 'measurement').data.rows.length, 1);
});

await test('6.4 uncertainty note set/clear/no-op; title', () => {
  let doc = newDoc('ms-4');
  doc = insertBlock(doc, 'measurement').doc;
  const block = only(doc, 'measurement');
  doc = applied(
    act(doc, block.id, { action: 'set-measurement-uncertainty-note', note: 'U = 0.05 mg (k = 2).' }),
    'set note',
  );
  assert.equal(only(doc, 'measurement').data.uncertaintyNote, 'U = 0.05 mg (k = 2).');
  noOp(
    act(doc, block.id, { action: 'set-measurement-uncertainty-note', note: 'U = 0.05 mg (k = 2).' }),
    doc, 'same note is a no-op',
  );
  doc = applied(act(doc, block.id, { action: 'set-measurement-uncertainty-note', note: null }), 'clear note');
  assert.equal(only(doc, 'measurement').data.uncertaintyNote, undefined);
  doc = applied(act(doc, block.id, { action: 'update-measurement-title', title: 'Raw data' }), 'set title');
  assert.equal(only(doc, 'measurement').data.title, 'Raw data');
});

// ═══════════════════════════════════════════════════════════════════════════
group('7 · calculation service');
// ═══════════════════════════════════════════════════════════════════════════

await test('7.1 add step; LaTeX validated through the REAL MathJax engine', () => {
  let doc = newDoc('calc-1');
  doc = insertBlock(doc, 'calculation').doc;
  const block = only(doc, 'calculation');
  const res = act(doc, block.id, { action: 'add-calculation-step' });
  doc = applied(res, 'add step');
  const stepId = res.entryId;

  rejected(
    act(doc, block.id, { action: 'update-calculation-step', stepId, patch: { latex: '' } }),
    'invalid-latex', 'empty latex rejected',
  );
  const bad = act(doc, block.id, {
    action: 'update-calculation-step', stepId, patch: { latex: '\\frac{1}{' },
  });
  rejected(bad, 'invalid-latex', 'unparseable latex rejected');
  assert.ok(bad.message.length > 0, 'the engine message surfaces');

  doc = applied(
    act(doc, block.id, {
      action: 'update-calculation-step', stepId,
      patch: { latex: '\\bar{x} = \\frac{x_1 + x_2}{2}', label: 'Mean', substitution: '= 7.04', result: '= 7.04', note: 'n = 2' },
    }),
    'valid latex + fields',
  );
  const step = entryOf(only(doc, 'calculation').data.steps, stepId, 'calculation step');
  assert.equal(step.latex, '\\bar{x} = \\frac{x_1 + x_2}{2}');
  assert.equal(step.label, 'Mean');
  assert.equal(step.result, '= 7.04');
});

await test('7.2 optional fields clear; reorder/remove; conclusion; title', () => {
  let doc = newDoc('calc-2');
  doc = insertBlock(doc, 'calculation').doc;
  const block = only(doc, 'calculation');
  // Drop the starter step so the reorder math starts from a clean list.
  doc = applied(
    act(doc, block.id, { action: 'remove-calculation-step', stepId: only(doc, 'calculation').data.steps[0].id }),
    'remove starter step',
  );
  const first = act(doc, block.id, { action: 'add-calculation-step' });
  doc = applied(first, 'add step 1');
  doc = applied(
    act(doc, block.id, { action: 'update-calculation-step', stepId: first.entryId, patch: { latex: 'a + b', label: 'Sum' } }),
    'fill step 1',
  );
  const second = act(doc, block.id, { action: 'add-calculation-step' });
  doc = applied(second, 'add step 2');
  doc = applied(
    act(doc, block.id, { action: 'update-calculation-step', stepId: second.entryId, patch: { latex: 'c \\times d' } }),
    'fill step 2',
  );
  doc = applied(
    act(doc, block.id, { action: 'update-calculation-step', stepId: first.entryId, patch: { label: '' } }),
    'clear label',
  );
  assert.equal(only(doc, 'calculation').data.steps[0].label, undefined, 'label cleared');

  doc = applied(act(doc, block.id, { action: 'move-calculation-step', stepId: second.entryId, direction: 'up' }), 'move up');
  assert.equal(only(doc, 'calculation').data.steps[0].latex, 'c \\times d', 'reordered');
  doc = applied(act(doc, block.id, { action: 'remove-calculation-step', stepId: second.entryId }), 'remove');
  assert.equal(only(doc, 'calculation').data.steps.length, 1);
  doc = applied(
    act(doc, block.id, { action: 'set-calculation-conclusion', text: 'Report to 2 dp.' }),
    'set conclusion',
  );
  assert.equal(only(doc, 'calculation').data.conclusionText, 'Report to 2 dp.');
  doc = applied(act(doc, block.id, { action: 'set-calculation-conclusion', text: '' }), 'clear conclusion');
  assert.equal(only(doc, 'calculation').data.conclusionText, undefined);
  doc = applied(act(doc, block.id, { action: 'update-calculation-title', title: 'Calculation' }), 'set title');
  assert.equal(only(doc, 'calculation').data.title, 'Calculation');
});

// ═══════════════════════════════════════════════════════════════════════════
group('8 · acceptance-criteria service');
// ═══════════════════════════════════════════════════════════════════════════

await test('8.1 add criterion: required fields, verdict enum, measured value', () => {
  let doc = newDoc('acc-1');
  doc = insertBlock(doc, 'acceptance-criteria').doc;
  const block = only(doc, 'acceptance-criteria');
  const res = act(doc, block.id, { action: 'add-acceptance-criterion' });
  doc = applied(res, 'add criterion');
  const criterionId = res.entryId;

  rejected(
    act(doc, block.id, { action: 'update-acceptance-criterion', criterionId, patch: { criterion: '' } }),
    'invalid-criterion', 'empty criterion rejected',
  );
  rejected(
    act(doc, block.id, { action: 'update-acceptance-criterion', criterionId, patch: { specification: '' } }),
    'invalid-specification', 'empty specification rejected',
  );
  rejected(
    act(doc, block.id, { action: 'update-acceptance-criterion', criterionId, patch: { result: 'maybe' } }),
    'invalid-result', 'invalid verdict rejected',
  );
  doc = applied(
    act(doc, block.id, {
      action: 'update-acceptance-criterion', criterionId,
      patch: { criterion: 'Moisture content', specification: '≤ 5.0 %', measuredValue: '4.3 %', result: 'pass', remarks: 'Within limit' },
    }),
    'full criterion',
  );
  const row = entryOf(only(doc, 'acceptance-criteria').data.criteria, criterionId, 'criterion');
  assert.equal(row.criterion, 'Moisture content');
  assert.equal(row.result, 'pass');
});

await test('8.2 overall verdict set/clear/invalid; reorder/remove; title', () => {
  let doc = newDoc('acc-2');
  doc = insertBlock(doc, 'acceptance-criteria').doc;
  const block = only(doc, 'acceptance-criteria');
  // Drop the starter criterion so the reorder math starts from a clean list.
  doc = applied(
    act(doc, block.id, {
      action: 'remove-acceptance-criterion',
      criterionId: only(doc, 'acceptance-criteria').data.criteria[0].id,
    }),
    'remove starter criterion',
  );
  for (const criterion of ['A', 'B']) {
    const res = act(doc, block.id, { action: 'add-acceptance-criterion' });
    doc = applied(res, `add ${criterion}`);
    doc = applied(
      act(doc, block.id, {
        action: 'update-acceptance-criterion', criterionId: res.entryId,
        patch: { criterion, specification: 'limit' },
      }),
      `fill ${criterion}`,
    );
  }
  const ids = only(doc, 'acceptance-criteria').data.criteria.map((c) => c.id);
  doc = applied(act(doc, block.id, { action: 'move-acceptance-criterion', criterionId: ids[1], direction: 'up' }), 'move B up');
  assert.deepEqual(only(doc, 'acceptance-criteria').data.criteria.map((c) => c.criterion), ['B', 'A']);
  doc = applied(act(doc, block.id, { action: 'remove-acceptance-criterion', criterionId: ids[0] }), 'remove A');
  assert.equal(only(doc, 'acceptance-criteria').data.criteria.length, 1);
  assert.equal(only(doc, 'acceptance-criteria').data.criteria[0].criterion, 'B', 'B remains');

  doc = applied(act(doc, block.id, { action: 'set-acceptance-overall', result: 'fail' }), 'set overall');
  assert.equal(only(doc, 'acceptance-criteria').data.overallResult, 'fail');
  rejected(
    act(doc, block.id, { action: 'set-acceptance-overall', result: 'compliant' }),
    'invalid-result', 'invalid overall rejected',
  );
  doc = applied(act(doc, block.id, { action: 'set-acceptance-overall', result: null }), 'clear overall');
  assert.equal(only(doc, 'acceptance-criteria').data.overallResult, undefined);
  doc = applied(act(doc, block.id, { action: 'update-acceptance-title', title: 'Criteria' }), 'set title');
  assert.equal(only(doc, 'acceptance-criteria').data.title, 'Criteria');
});

// ═══════════════════════════════════════════════════════════════════════════
group('9 · dispatcher safety and immutability');
// ═══════════════════════════════════════════════════════════════════════════

await test('9.1 unknown action, missing block and wrong block type reject cleanly', () => {
  const doc = newDoc('safe-1');
  rejected(
    act(doc, genId(), { action: 'teleport-procedure' }),
    'invalid-action', 'unknown action rejected',
  );
  rejected(
    act(doc, genId(), { action: 'add-procedure-step' }),
    'missing-block', 'unknown block rejected',
  );
  const withPara = insertBlock(doc, 'paragraph');
  rejected(
    act(withPara.doc, withPara.block.id, { action: 'add-procedure-step' }),
    'wrong-block-type', 'paragraph is not a procedure block',
  );
});

await test('9.2 sources are never mutated; no-ops keep the same reference', () => {
  let doc = newDoc('safe-2');
  doc = insertBlock(doc, 'equipment-list').doc;
  const block = only(doc, 'equipment-list');
  const source = doc;
  const before = JSON.stringify(doc);
  const res = act(doc, block.id, { action: 'add-equipment-item' });
  doc = applied(res, 'add item');
  // The service must never mutate the document it was handed.
  assert.equal(JSON.stringify(source), before, 'the source document is never mutated');
  assert.equal(source.blocks[0].data.items.length, 1, 'the starter item is untouched');
  assert.notEqual(res.doc, source, 'a real change returns a NEW document reference');

  // A no-op returns the SAME document reference (no Modified churn).
  noOp(
    act(doc, block.id, { action: 'update-equipment-title', title: undefined }),
    doc, 'undefined title is a no-op',
  );
});

await test('9.3 real changes stamp modifiedAt; the previous value is replaced', () => {
  let doc = newDoc('safe-3');
  doc = insertBlock(doc, 'observation').doc;
  const block = only(doc, 'observation');
  const earlier = '2020-01-01T00:00:00.000Z';
  doc = { ...doc, metadata: { ...doc.metadata, modifiedAt: earlier } };
  doc = applied(act(doc, block.id, { action: 'add-observation-row' }), 'add row');
  assert.equal(doc.metadata.modifiedAt, STAMP, 'stamped with the injected clock');
  assert.notEqual(doc.metadata.modifiedAt, earlier, 'the old stamp is replaced');
});

// ═══════════════════════════════════════════════════════════════════════════
group('10 · serialization round trips');
// ═══════════════════════════════════════════════════════════════════════════

/** A document carrying every laboratory block type with real content. */
function fullLabDoc(id) {
  let doc = newDoc(id);
  const ids = {};
  for (const type of LAB_TYPES) {
    const inserted = insertBlock(doc, type);
    doc = inserted.doc;
    ids[type] = inserted.block.id;
  }
  doc = applied(act(doc, ids['procedure-step'], { action: 'add-procedure-step' }), 'step');
  doc = applied(
    act(doc, ids['procedure-step'], {
      action: 'update-procedure-step', stepId: only(doc, 'procedure-step').data.steps[0].id,
      patch: { level: 'sub', spans: [{ text: 'Record the mass.', bold: true }] },
    }),
    'step text',
  );
  doc = applied(act(doc, ids['equipment-list'], { action: 'add-equipment-item' }), 'item');
  doc = applied(act(doc, ids.observation, { action: 'add-observation-row' }), 'row');
  doc = applied(act(doc, ids.measurement, { action: 'add-measurement-row' }), 'ms row');
  doc = applied(act(doc, ids.calculation, { action: 'add-calculation-step' }), 'calc step');
  doc = applied(
    act(doc, ids.calculation, {
      action: 'update-calculation-step', stepId: only(doc, 'calculation').data.steps[0].id,
      patch: { latex: 'x^{2}', label: 'Square' },
    }),
    'calc latex',
  );
  doc = applied(act(doc, ids['acceptance-criteria'], { action: 'add-acceptance-criterion' }), 'criterion');
  return { doc, ids };
}

await test('10.1 all six laboratory types survive serialize → deserialize', () => {
  const { doc } = fullLabDoc('ser-1');
  const round = deserializeDocument(serialize(doc));
  assert.deepEqual(round.blocks, doc.blocks, 'blocks identical after the round trip');
  assert.equal(round.schemaVersion, 1, 'schema version 1');
  assert.deepEqual(round.metadata, doc.metadata, 'metadata preserved');
});

await test('10.2 entry ids are stable across the round trip', () => {
  const { doc } = fullLabDoc('ser-2');
  const round = deserializeDocument(serialize(doc));
  for (const type of LAB_TYPES) {
    const before = doc.blocks.find((b) => b.data.type === type);
    const after = round.blocks.find((b) => b.data.type === type);
    assert.equal(after.id, before.id, `${type} block id stable`);
  }
  const beforeSteps = doc.blocks.find((b) => b.data.type === 'procedure-step').data.steps;
  const afterSteps = round.blocks.find((b) => b.data.type === 'procedure-step').data.steps;
  assert.equal(afterSteps[0].id, beforeSteps[0].id, 'step id stable');
  assert.equal(afterSteps[0].spans[0].bold, true, 'inline formatting preserved');
});

// ═══════════════════════════════════════════════════════════════════════════
group('11 · editor components (react-dom/server markup)');
// ═══════════════════════════════════════════════════════════════════════════

const {
  ProcedureStepEditor,
  EquipmentListEditor,
  ObservationEditor,
  MeasurementEditor,
  CalculationEditor,
  AcceptanceCriteriaEditor,
} = editorModule;

/** Record every dispatched action (real markup only — no DOM events under SSG). */
function recordingDispatch() {
  const calls = [];
  return {
    calls,
    onAction: (blockId, action) => {
      calls.push({ blockId, action });
      return { ok: true, changed: true, doc: {}, blockId };
    },
    onError: () => {},
    onRequestConfirm: () => {},
  };
}

await test('11.1 the procedure editor renders level select, number and text controls', () => {
  let doc = newDoc('ed-1');
  doc = insertBlock(doc, 'procedure-step').doc;
  doc = applied(act(doc, only(doc, 'procedure-step').id, { action: 'add-procedure-step' }), 'step');
  const block = only(doc, 'procedure-step');
  const dispatch = recordingDispatch();
  const html = renderToStaticMarkup(
    React.createElement(ProcedureStepEditor, {
      blockId: block.id, data: block.data,
      onAction: dispatch.onAction, onError: dispatch.onError,
    }),
  );
  assert.ok(html.includes('Section title'), 'title field');
  assert.ok(html.includes('Step number'), 'step number field');
  assert.ok(html.includes('Step text'), 'step text field');
  assert.ok(html.includes('Add step'), 'add button');
  assert.ok(html.includes('Remove step'), 'remove button');
  for (const level of PROCEDURE_STEP_LEVELS) {
    assert.ok(html.includes(PROCEDURE_LEVEL_LABELS[level]), `level option ${level}`);
  }
});

await test('11.2 the equipment editor renders item fields, calibration hint and checkbox', () => {
  let doc = newDoc('ed-2');
  doc = insertBlock(doc, 'equipment-list').doc;
  doc = applied(act(doc, only(doc, 'equipment-list').id, { action: 'add-equipment-item' }), 'item');
  const block = only(doc, 'equipment-list');
  const dispatch = recordingDispatch();
  const html = renderToStaticMarkup(
    React.createElement(EquipmentListEditor, {
      blockId: block.id, data: block.data,
      onAction: dispatch.onAction, onError: dispatch.onError,
    }),
  );
  assert.ok(html.includes('Name (required)'), 'required name');
  assert.ok(html.includes('Asset tag'), 'asset tag');
  assert.ok(html.includes('Calibration due'), 'calibration due');
  assert.ok(html.includes('YYYY-MM-DD'), 'date hint');
  assert.ok(html.includes('type="checkbox"'), 'mandatory checkbox');
  assert.ok(html.includes('Add item'), 'add button');
});

await test('11.3 the observation editor renders parameter/value/remarks and blank hint', () => {
  let doc = newDoc('ed-3');
  doc = insertBlock(doc, 'observation').doc;
  const block = only(doc, 'observation');
  const dispatch = recordingDispatch();
  // (a) The registry default carries one starter row — its controls render.
  const html = renderToStaticMarkup(
    React.createElement(ObservationEditor, {
      blockId: block.id, data: block.data,
      onAction: dispatch.onAction, onError: dispatch.onError,
    }),
  );
  assert.ok(html.includes('Parameter (required)'), 'starter row parameter field');
  assert.ok(html.includes('Observed value'), 'observed value field');
  assert.ok(html.includes('Remarks'), 'remarks field');
  assert.ok(html.includes('Remove row'), 'remove button');
  assert.ok(html.includes('Add observation row'), 'add button');
  // (b) An emptied list (a state the service explicitly allows) shows the
  //     honest empty hint instead of pretending rows exist.
  const emptyHtml = renderToStaticMarkup(
    React.createElement(ObservationEditor, {
      blockId: block.id, data: { ...block.data, rows: [] },
      onAction: dispatch.onAction, onError: dispatch.onError,
    }),
  );
  assert.ok(emptyHtml.includes('No observation rows yet'), 'honest empty hint');
});

await test('11.4 the measurement editor renders column cap, cells and the uncertainty note', () => {
  let doc = newDoc('ed-4');
  doc = insertBlock(doc, 'measurement').doc;
  doc = applied(act(doc, only(doc, 'measurement').id, { action: 'add-measurement-row' }), 'row');
  const block = only(doc, 'measurement');
  const dispatch = recordingDispatch();
  const html = renderToStaticMarkup(
    React.createElement(MeasurementEditor, {
      blockId: block.id, data: block.data,
      onAction: dispatch.onAction, onError: dispatch.onError,
      onRequestConfirm: dispatch.onRequestConfirm,
    }),
  );
  assert.ok(html.includes(`of ${MAX_MEASUREMENT_COLUMNS}`), 'column cap hint');
  assert.ok(html.includes('Uncertainty note'), 'uncertainty note');
  assert.ok(html.includes('Add column'), 'add column');
  assert.ok(html.includes('Add row'), 'add row');
});

await test('11.5 the calculation editor renders LaTeX + conclusion controls', () => {
  let doc = newDoc('ed-5');
  doc = insertBlock(doc, 'calculation').doc;
  const block = only(doc, 'calculation');
  const dispatch = recordingDispatch();
  const html = renderToStaticMarkup(
    React.createElement(CalculationEditor, {
      blockId: block.id, data: block.data,
      onAction: dispatch.onAction, onError: dispatch.onError,
    }),
  );
  assert.ok(html.includes('Formula (LaTeX, required)'), 'latex field');
  assert.ok(html.includes('Substitution'), 'substitution');
  assert.ok(html.includes('Conclusion'), 'conclusion');
  assert.ok(html.includes('Add calculation step'), 'add button');
});

await test('11.6 the acceptance editor renders verdict selects incl. the overall verdict', () => {
  let doc = newDoc('ed-6');
  doc = insertBlock(doc, 'acceptance-criteria').doc;
  const block = only(doc, 'acceptance-criteria');
  const dispatch = recordingDispatch();
  const html = renderToStaticMarkup(
    React.createElement(AcceptanceCriteriaEditor, {
      blockId: block.id, data: block.data,
      onAction: dispatch.onAction, onError: dispatch.onError,
    }),
  );
  assert.ok(html.includes('Specification or limit (required)'), 'specification field');
  assert.ok(html.includes('Overall result'), 'overall verdict select');
  assert.ok(html.includes('No overall verdict'), 'clearable overall');
  for (const result of CRITERIA_RESULTS) {
    assert.ok(html.includes(CRITERIA_RESULT_LABELS[result]), `verdict option ${result}`);
  }
});

await test('11.7 App → Workspace → EditorPanel wiring carries onLabAction end to end', () => {
  const appSrc = fs.readFileSync(path.join(root, 'src', 'App.tsx'), 'utf8');
  const wsSrc = fs.readFileSync(path.join(root, 'src', 'components', 'workspace', 'Workspace.tsx'), 'utf8');
  const epSrc = fs.readFileSync(path.join(root, 'src', 'components', 'editor-panel', 'EditorPanel.tsx'), 'utf8');
  assert.ok(appSrc.includes('applyLabAction'), 'App imports the real service');
  assert.ok(appSrc.includes('handleLabAction'), 'App defines the handler');
  assert.ok(appSrc.includes('onLabAction={handleLabAction}'), 'App passes the handler to Workspace');
  assert.ok(wsSrc.includes('onLabAction'), 'Workspace forwards the prop');
  assert.ok(epSrc.includes('onLabAction'), 'EditorPanel declares the prop');
  assert.ok(epSrc.includes('handleLab'), 'EditorPanel dispatches through handleLab');
  for (const type of LAB_TYPES) {
    assert.ok(epSrc.includes(`block.data.type === '${type}'`), `EditorPanel maps ${type} to an editor`);
  }
});

// ═══════════════════════════════════════════════════════════════════════════
group('12 · PDF rendering (real PocDocument + pdfjs)');
// ═══════════════════════════════════════════════════════════════════════════

// ── PDF helpers (inflated-stream text + pdfjs positions) ────────────────────
function pdfPages(buf) {
  const text = buf.toString('latin1');
  const pages = [];
  const pageRe = /(\d+)\s+0\s+obj[\s\S]{0,400}?\/Type\s*\/Page[^s][\s\S]{0,400}?endobj/g;
  let m;
  while ((m = pageRe.exec(text)) !== null) {
    const refs = [];
    const single = m[0].match(/\/Contents\s+(\d+)\s+\d+\s+R/);
    if (single) refs.push(Number(single[1]));
    const arr = m[0].match(/\/Contents\s*\[([^\]]+)\]/);
    if (arr) for (const r of arr[1].matchAll(/(\d+)\s+\d+\s+R/g)) refs.push(Number(r[1]));
    let content = '';
    for (const ref of refs) {
      const om = new RegExp(`${ref}\\s+0\\s+obj[\\s\\S]*?stream\\r?\\n`).exec(text);
      if (!om) continue;
      const start = om.index + om[0].length;
      const end = text.indexOf('endstream', start);
      if (end < 0) continue;
      const slice = buf.subarray(start, end);
      try {
        content += zlib.inflateSync(slice).toString('latin1');
      } catch {
        content += slice.toString('latin1');
      }
    }
    pages.push({ objNum: Number(m[1]), content });
  }
  return pages;
}
/** Visible text of one page: hex TJ runs + literal Tj strings, space-joined. */
function pageText(page) {
  const out = [];
  const tjRe = /\[((?:<[0-9A-Fa-f]+>|\s|[-\d.])+)\]\s*TJ/g;
  let m;
  while ((m = tjRe.exec(page.content)) !== null) {
    const runs = m[1].match(/<[0-9A-Fa-f]+>/g) || [];
    out.push(runs.map((r) => Buffer.from(r.slice(1, -1), 'hex').toString('latin1')).join(' '));
  }
  const litRe = /\(((?:[^()\\]|\\.)*)\)\s*Tj/g;
  while ((m = litRe.exec(page.content)) !== null) {
    out.push(m[1].replace(/\\([()\\])/g, '$1'));
  }
  return out.join(' ');
}
/** Whitespace-insensitive containment (pdfkit splits runs at kerning pairs). */
const compact = (s) => s.replace(/\s+/g, '');
const has = (text, needle) => compact(text).includes(compact(needle));
const render = async (doc) => Buffer.from(await renderDocPdfBytes(doc));
const pageTextsOf = async (doc) => (await pdfPages(await render(doc))).map((p) => pageText(p));
/** TRUE when the PoC fallback marker appears anywhere in the output. */
const fallbackMarker = (pages) =>
  pages.some((t) => t.includes('not yet mapped') || t.includes('not mapped'));

/** pdfjs wrapper (real glyph positions; same options as verify_p06_m1..m4). */
async function withPdf(buf, fn) {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const task = pdfjs.getDocument({
    data: new Uint8Array(buf), // COPY: pdfjs detaches its input
    useWorkerFetch: false,
    isEvalSupported: false,
    useSystemFonts: false,
    standardFontDataUrl:
      path.join(root, 'node_modules', 'pdfjs-dist', 'standard_fonts').replace(/\\/g, '/') + '/',
    verbosity: 0,
  });
  const pdf = await task.promise;
  try {
    return await fn(pdf);
  } finally {
    await pdf.destroy();
  }
}
async function pageItems(pdf, pageNo) {
  const page = await pdf.getPage(pageNo);
  return (await page.getTextContent())
    .items.filter((it) => it.str && it.str.trim() !== '')
    .map((it) => ({ x: it.transform[4], y: it.transform[5], width: it.width ?? 0, s: it.str }));
}
/** Count vector path constructions on a page (the math glyphs are vectors). */
async function pathCount(pdf, pageNo) {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const page = await pdf.getPage(pageNo);
  const ops = await page.getOperatorList();
  let n = 0;
  for (let i = 0; i < ops.fnArray.length; i += 1) {
    if (ops.fnArray[i] === pdfjs.OPS.constructPath) n += 1;
  }
  return n;
}

await test('12.1 every laboratory block renders its content — no fallback markers', async () => {
  let doc = newDoc('pdf-1');
  const ids = {};
  for (const type of LAB_TYPES) {
    const inserted = insertBlock(doc, type);
    doc = inserted.doc;
    ids[type] = inserted.block.id;
  }
  // Author realistic content through the service.
  doc = applied(act(doc, ids['procedure-step'], { action: 'update-procedure-title', title: 'Procedure' }), 'title');
  for (const [text, level, stepNumber] of [
    ['Weigh the sample.', 'main', undefined],
    ['Record the mass.', 'sub', undefined],
    ['Allow to cool.', 'warning', undefined],
    ['Note the colour.', 'note', undefined],
    ['Report the result.', 'main', '4.2'],
  ]) {
    const res = act(doc, ids['procedure-step'], { action: 'add-procedure-step' });
    doc = applied(res, `step ${text}`);
    doc = applied(
      act(doc, ids['procedure-step'], {
        action: 'update-procedure-step', stepId: res.entryId, patch: { level, ...(stepNumber ? { stepNumber } : {}), spans: [{ text }] },
      }),
      `fill ${text}`,
    );
  }
  const eq = act(doc, ids['equipment-list'], { action: 'add-equipment-item' });
  doc = applied(eq, 'equipment');
  doc = applied(
    act(doc, ids['equipment-list'], { action: 'update-equipment-item', itemId: eq.entryId, patch: { name: 'Analytical balance', assetTag: 'LAB-B01', calibrationDue: '2027-01-31' } }),
    'fill equipment',
  );
  const obs = act(doc, ids.observation, { action: 'add-observation-row' });
  doc = applied(obs, 'observation');
  doc = applied(
    act(doc, ids.observation, { action: 'update-observation-row', rowId: obs.entryId, patch: { parameter: 'Appearance', observedValue: 'Clear' } }),
    'fill observation',
  );
  const col = act(doc, ids.measurement, { action: 'add-measurement-column' });
  doc = applied(col, 'column');
  doc = applied(
    act(doc, ids.measurement, { action: 'update-measurement-column', columnId: col.entryId, patch: { header: 'Reading', unit: 'Hz' } }),
    'name column',
  );
  doc = applied(act(doc, ids.measurement, { action: 'set-measurement-uncertainty-note', note: 'U = 0.1 Hz (k = 2).' }), 'note');
  const calc = act(doc, ids.calculation, { action: 'add-calculation-step' });
  doc = applied(calc, 'calc step');
  doc = applied(
    act(doc, ids.calculation, {
      action: 'update-calculation-step', stepId: calc.entryId,
      patch: { label: 'Mean', latex: '\\bar{x} = \\frac{x_1 + x_2}{2}', substitution: '= 7.04', result: '= 7.04' },
    }),
    'fill calc step',
  );
  const crit = act(doc, ids['acceptance-criteria'], { action: 'add-acceptance-criterion' });
  doc = applied(crit, 'criterion');
  doc = applied(
    act(doc, ids['acceptance-criteria'], {
      action: 'update-acceptance-criterion', criterionId: crit.entryId,
      patch: { criterion: 'Moisture content', specification: '≤ 5.0 %', measuredValue: '4.3 %', result: 'pass' },
    }),
    'fill criterion',
  );
  doc = applied(act(doc, ids['acceptance-criteria'], { action: 'set-acceptance-overall', result: 'pass' }), 'overall');

  const pages = await pageTextsOf(doc);
  assert.equal(fallbackMarker(pages), false, 'no unsupported-block markers');
  const all = pages.join(' ');
  // Procedure: auto numbers, stored number and the level labels.
  assert.ok(has(all, '1.'), 'auto main number 1.');
  assert.ok(has(all, 'a.'), 'auto sub number a.');
  assert.ok(has(all, '4.2'), 'stored step number');
  assert.ok(has(all, '[WARNING]'), 'warning label');
  assert.ok(has(all, '[NOTE]'), 'note label');
  assert.ok(has(all, 'Weigh the sample.'), 'step text');
  // Equipment.
  assert.ok(has(all, 'Equipment / material'), 'equipment header');
  assert.ok(has(all, 'Analytical balance'), 'equipment name');
  assert.ok(has(all, 'LAB-B01'), 'asset tag');
  assert.ok(has(all, '2027-01-31'), 'calibration date');
  // Observation.
  assert.ok(has(all, 'Observed value'), 'observation header');
  assert.ok(has(all, 'Appearance'), 'observation parameter');
  // Measurement.
  assert.ok(has(all, '(Hz)'), 'unit in parentheses');
  assert.ok(has(all, 'U = 0.1 Hz (k = 2).'), 'uncertainty note');
  // Calculation.
  assert.ok(has(all, 'Mean'), 'calculation label');
  assert.ok(has(all, '= 7.04'), 'substitution/result text');
  // Acceptance.
  assert.ok(has(all, 'Specification'), 'specification header');
  assert.ok(has(all, 'Overall result: Pass'), 'overall verdict line');
});

await test('12.2 calculation formulas paint as PDF vectors (real math engine)', async () => {
  let doc = newDoc('pdf-2');
  doc = insertBlock(doc, 'calculation').doc;
  const block = only(doc, 'calculation');
  const res = act(doc, block.id, { action: 'add-calculation-step' });
  doc = applied(res, 'step');
  doc = applied(
    act(doc, block.id, { action: 'update-calculation-step', stepId: res.entryId, patch: { latex: 'x^{2} + y^{2} = z^{2}' } }),
    'latex',
  );
  const buf = await render(doc);
  const n = await withPdf(buf, (pdf) => pathCount(pdf, 1));
  assert.ok(n > 20, `the formula glyphs are vector paths (got ${n})`);
});

await test('12.3 an invalid stored LaTeX renders an honest marker, not silence', async () => {
  let doc = newDoc('pdf-3');
  doc = insertBlock(doc, 'calculation').doc;
  const block = only(doc, 'calculation');
  // Bypass the service on purpose: simulate an old/corrupt file.
  const blocks = [...doc.blocks];
  const idx = blocks.findIndex((b) => b.id === block.id);
  blocks[idx] = {
    ...blocks[idx],
    data: { ...blocks[idx].data, steps: [{ id: newUUID(), latex: '\\frac{1}{' }] },
  };
  doc = { ...doc, blocks };
  const pages = await pageTextsOf(doc);
  assert.ok(has(pages.join(' '), 'Formula could not be rendered'), 'honest formula failure marker');
});

await test('12.4 honest empty-state markers for empty laboratory blocks', async () => {
  // Registry defaults ship ONE starter entry per list, but empty lists are
  // a state the SERVICE explicitly allows (remove-to-zero above).  Strip
  // each default to its honest empty shape and render.
  const blocks = LAB_TYPES.map((type) => {
    const b = createBlock(type, genId);
    const data = { ...b.data };
    if (Array.isArray(data.steps)) data.steps = [];
    if (Array.isArray(data.items)) data.items = [];
    if (Array.isArray(data.rows)) data.rows = [];
    if (Array.isArray(data.criteria)) data.criteria = [];
    if (Array.isArray(data.columns)) data.columns = [];
    return { ...b, data };
  });
  const doc = { ...newDoc('pdf-4'), blocks };
  const all = (await pageTextsOf(doc)).join(' ');
  assert.ok(has(all, '[No procedure steps yet]'), 'procedure empty state');
  assert.ok(has(all, '[No equipment or materials listed]'), 'equipment empty state');
  assert.ok(has(all, '[No observations recorded]'), 'observation empty state');
  assert.ok(has(all, '[No measurement columns defined]'), 'measurement empty state');
  assert.ok(has(all, '[No calculation steps yet]'), 'calculation empty state');
  assert.ok(has(all, '[No acceptance criteria yet]'), 'acceptance empty state');
});

await test('12.5 a wide 12-column worksheet stays inside the page margins', async () => {
  let doc = newDoc('pdf-5');
  doc = insertBlock(doc, 'measurement').doc;
  const block = only(doc, 'measurement');
  let data = block.data;
  while (data.columns.length < MAX_MEASUREMENT_COLUMNS) {
    doc = applied(act(doc, block.id, { action: 'add-measurement-column' }), 'column');
    data = only(doc, 'measurement').data;
  }
  for (let i = 0; i < 6; i += 1) {
    doc = applied(act(doc, block.id, { action: 'add-measurement-row' }), 'row');
  }
  const buf = await render(doc);
  const layout = computePocLayout(doc);
  await withPdf(buf, async (pdf) => {
    assert.equal(pdf.numPages, 1, 'one page');
    const items = await pageItems(pdf, 1);
    assert.ok(items.length > 10, 'worksheet text present');
    for (const it of items) {
      assert.ok(
        it.x >= layout.marginLeft - 1,
        `text starts inside the left margin (x=${it.x.toFixed(1)}, margin=${layout.marginLeft.toFixed(1)})`,
      );
      assert.ok(
        it.x + it.width <= layout.pageWidthPt - layout.marginRight + 1,
        `text ends inside the right margin (x+w=${(it.x + it.width).toFixed(1)}, limit=${(layout.pageWidthPt - layout.marginRight).toFixed(1)})`,
      );
    }
  });
});

await test('12.6 a multi-row worksheet prints handwriting-space rows', async () => {
  let doc = newDoc('pdf-6');
  doc = insertBlock(doc, 'measurement').doc;
  const block = only(doc, 'measurement');
  for (let i = 0; i < 4; i += 1) {
    doc = applied(act(doc, block.id, { action: 'add-measurement-row' }), 'row');
  }
  const buf = await render(doc);
  // Blank rows must still paint their row separators (bottom borders).
  const n = await withPdf(buf, (pdf) => pathCount(pdf, 1));
  assert.ok(n >= 5, `blank worksheet rows paint separators (got ${n})`);
});

await test('12.7 mixed document: breaks, furniture, formulas, images, signatures coexist', async () => {
  let doc = newDoc('pdf-7');
  doc = {
    ...doc,
    metadata: { ...doc.metadata, documentId: 'MIXED-P06-M5', organizationName: 'DocStudio Synthetic Sample' },
    pageTypography: { ...doc.pageTypography, displayHeader: true },
  };
  // Existing block families.
  doc = { ...doc, blocks: [...doc.blocks] };
  const heading = createBlock('heading', genId);
  doc.blocks.push(heading);
  doc.blocks.push(createBlock('paragraph', genId));
  doc.blocks.push(createBlock('list', genId));
  doc.blocks.push(createBlock('table', genId));
  doc.blocks.push(createBlock('formula', genId));
  doc.blocks.push(createBlock('image', genId));
  doc.blocks.push(createBlock('signature', genId));
  doc.blocks.push(createBlock('reference', genId));
  doc.blocks.push(createBlock('exhibit', genId));
  doc.blocks.push(createBlock('horizontal-line', genId));
  doc.blocks.push(createBlock('page-break', genId));
  // Every laboratory family after the break.
  for (const type of LAB_TYPES) {
    const inserted = insertBlock(doc, type);
    doc = inserted.doc;
    if (type === 'procedure-step') {
      doc = applied(act(doc, inserted.block.id, { action: 'update-procedure-title', title: 'After the break' }), 'title');
    }
  }
  const pages = await pageTextsOf(doc);
  assert.ok(pages.length >= 2, `multi-page output (got ${pages.length})`);
  assert.equal(fallbackMarker(pages), false, 'no unsupported-block markers anywhere');
  // The page break pushed the laboratory content to page 2+.
  assert.ok(has(pages[1], 'After the break'), 'section content on page 2');
  // The default header band renders {documentId} on non-first pages
  // (suppressOnFirstPage), the footer renders {organizationName}.
  assert.ok(has(pages[1], 'MIXED-P06-M5'), 'header furniture on page 2');
  assert.ok(has(pages.join(' '), 'DocStudio Synthetic Sample'), 'footer furniture');
});

await test('12.8 rendering is byte-deterministic for laboratory documents', async () => {
  const { doc } = fullLabDoc('pdf-8');
  const [a, b] = [await render(doc), await render(doc)];
  assert.equal(Buffer.compare(a, b), 0, 'the same document renders byte-identical output');
});

// ═══════════════════════════════════════════════════════════════════════════
group('13 · representative sample documents');
// ═══════════════════════════════════════════════════════════════════════════

const SAMPLES = [
  {
    name: 'SOP',
    build: buildLabSopSampleDoc,
    expect: [
      'Standard Operating Procedure', 'Equipment and consumables', 'Analytical balance',
      'Weighing paper', 'Acceptance criteria', 'Moisture content (loss on drying)',
      'Report the result to one decimal place', 'References', 'Prepared by',
    ],
  },
  {
    name: 'technical procedure',
    build: buildLabProcedureSampleDoc,
    expect: [
      'Method steps', 'Calibrate the pH meter', 'Technical observations',
      'Sample temperature', 'Relative combined uncertainty', 'Report pH = 7.04',
      'Safety', 'Reporting',
    ],
  },
  {
    name: 'worksheet',
    build: buildLabWorksheetSampleDoc,
    expect: [
      'Rough Datasheet', 'Check weight', '100.0005', '+0.5', 'IW', 'CW-500',
      'Expanded uncertainty', 'Instrument condition', 'Performed by',
    ],
  },
  {
    name: 'exhibit',
    build: buildLabExhibitSampleDoc,
    expect: [
      'Annexure A', 'Instrument daily-use log sheet', 'Instruments covered by this log',
      'Daily use log', 'Record review', 'Overall result: Pass',
    ],
  },
];

await test('13.1 every sample document round-trips through the serializer', () => {
  for (const sample of SAMPLES) {
    const doc = sample.build();
    const round = deserializeDocument(serialize(doc));
    assert.deepEqual(round.blocks, doc.blocks, `${sample.name}: blocks survive the round trip`);
    assert.equal(round.schemaVersion, 1, `${sample.name}: schema version`);
  }
});

await test('13.2 every sample document renders its authored content', async () => {
  for (const sample of SAMPLES) {
    const doc = sample.build();
    const pages = await pageTextsOf(doc);
    assert.equal(fallbackMarker(pages), false, `${sample.name}: no fallback markers`);
    const all = pages.join(' ');
    for (const needle of sample.expect) {
      assert.ok(has(all, needle), `${sample.name}: rendered text must contain "${needle}"`);
    }
  }
});

await test('13.3 sample documents render byte-deterministically', async () => {
  for (const sample of SAMPLES) {
    const doc = sample.build();
    const [a, b] = [await render(doc), await render(doc)];
    assert.equal(Buffer.compare(a, b), 0, `${sample.name}: byte-deterministic`);
  }
});

await test('13.4 sample documents stay inside the page margins', async () => {
  for (const sample of SAMPLES) {
    // BODY pages only: the cover page follows the P04 cover-composition
    // geometry (its own verified suites), not the body margins.
    const doc = sample.build();
    doc.frontPage = { ...doc.frontPage, enabled: false };
    const layout = computePocLayout(doc);
    const buf = await render(doc);
    await withPdf(buf, async (pdf) => {
      for (let pageNo = 1; pageNo <= pdf.numPages; pageNo += 1) {
        const items = await pageItems(pdf, pageNo);
        for (const it of items) {
          assert.ok(
            it.x >= layout.marginLeft - 1,
            `${sample.name} p${pageNo}: left margin (x=${it.x.toFixed(1)})`,
          );
          assert.ok(
            it.x + it.width <= layout.pageWidthPt - layout.marginRight + 1,
            `${sample.name} p${pageNo}: right margin (x+w=${(it.x + it.width).toFixed(1)})`,
          );
        }
      }
    });
  }
});

// ═══════════════════════════════════════════════════════════════════════════
group('14 · regression and baseline safety');
// ═══════════════════════════════════════════════════════════════════════════

await test('14.1 the committed P02-M4 baseline still matches a fresh render (read-only)', async () => {
  const committed = fs.readFileSync(path.join(root, 'fixtures', 'p02-m4', 'renderer-poc-output.pdf'));
  const fresh = await render(buildPocFixture());
  assert.equal(
    Buffer.compare(fresh, committed),
    0,
    'the laboratory renderers change nothing for the committed fixture',
  );
});

await test('14.2 no artifacts were written; script registered; schema unchanged', () => {
  assert.equal(fs.existsSync(path.join(root, 'fixtures', 'p06-m5')), false, 'P06-M5 writes no committed artifacts');
  assert.ok(fs.existsSync(path.join(root, 'fixtures', 'p04-m3', 'theme-gallery.pdf')), 'earlier baselines still present');
  const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
  assert.equal(pkg.scripts['verify:p06-m5'], 'node verify_p06_m5.mjs', 'npm script registered');
  assert.equal(newDoc().schemaVersion, 1, 'the document schema version is unchanged');
});

await test('14.3 earlier verify suites are still registered and untouched', () => {
  const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
  for (const script of ['verify:p06-m1', 'verify:p06-m2', 'verify:p06-m3', 'verify:p06-m4']) {
    assert.ok(pkg.scripts[script], `${script} still registered`);
  }
});

// ── Summary ─────────────────────────────────────────────────────────────────
group('summary');
console.log(`\n${passed} passed, ${failed.length} failed`);
if (failed.length > 0) {
  console.error(`Failed checks:\n  - ${failed.join('\n  - ')}`);
  process.exit(1);
}
