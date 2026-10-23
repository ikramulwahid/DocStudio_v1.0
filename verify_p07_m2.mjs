/**
 * DocStudio — P07-M2 verification suite (Track Changes visible + persisted)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Verifies the P07-M2 checkpoint (spec §12.1): tracked edits are captured
 * through the accepted P07-M1 event model, persisted additively in schema
 * v1, visible as markup in the editor and the rendered PDF, reviewable with
 * individual/bulk accept and reject, and exportable as markup or clean.
 *
 * Groups:
 *  1. module surface of the new `track-changes` service.
 *  2. capture through the real mutation services (heading/paragraph text,
 *     spans styling, heading properties, spacing, block create/delete/
 *     reorder, metadata, settings leaves) + no-op/disabled/atomic rules.
 *  3. accept/reject semantics (keep/reverse content, stale-target,
 *     dependent-changes, block-conflict, already-resolved, not-found).
 *  4. bulk accept/reject (reverse-order unwinding, honest failures).
 *  5. markup derivation (text segments, styled runs, ghost placement,
 *     cue lines, review descriptions).
 *  6. persistence: additive schema v1 round-trips, old documents open
 *     unchanged, malformed event logs are rejected, byte-stability.
 *  7. renderer: markup PDF carries struck/underlined fragments and cue
 *     text; clean PDF never does; documents without PENDING events are
 *     BYTE-IDENTICAL in both modes; accepted-only logs add nothing.
 *  8. DOM: TrackChangesPanel review surface + EditorPanel markup (badges,
 *     inline strike/underline strip, ghost cards) under a real jsdom +
 *     real React runtime, including clean-view inertness.
 *
 * HONEST SCOPE NOTES (mirrored in project_roadmap.md P07-M2)
 *  • The P07-M1 model suite (`verify_p07_m1.mjs`) is the regression target
 *    for the event model and is run separately; this suite never modifies
 *    it and never regenerates any baseline/fixture.
 *  • Coverage gaps: the PDF.js PREVIEW rendering inside PocViewer and the
 *    native save dialog are not exercised (no WebView2 in CI); the
 *    preview==export identity is covered at the byte level instead. Other
 *    block types' inner content, `customFields`, `fontFallbacks` and the
 *    front-page/header-footer/watermark surfaces are deliberately UNTRACKED
 *    in P07-M2 (documented capture scope) and are asserted as such only
 *    where cheap.
 *  • `UPDATE_ARTIFACTS=1` is never used; nothing under `fixtures/` is read
 *    or written.
 *
 * Usage: node verify_p07_m2.mjs   (or: npm run verify:p07-m2)
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
const CACHE = path.join(root, 'node_modules', '.cache', 'ds-p07-m2-verify');

// ─────────────────────────────────────────────────────────────────────────────
// Tiny harness (same conventions as the other verify suites)
// ─────────────────────────────────────────────────────────────────────────────
let passed = 0;
let failed = 0;
let currentGroup = '';

const group = (name) => {
  currentGroup = name;
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
  'src/services/track-changes.ts',
  'src/services/document-file.ts',
  'src/services/document-actions.ts',
  'src/renderer/poc/poc-render.ts',
  'src/renderer/poc/ChangeViewSelector.tsx',
  'src/components/left-panel/TrackChangesPanel.tsx',
  'src/components/editor-panel/EditorPanel.tsx',
];
console.log('P07-M2 verification suite');
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

// Component modules import their stylesheet; tsc does not copy .css files,
// so create empty placeholders next to the compiled output (same approach
// as verify_p06_m1.mjs) and register an empty loader.
for (const stub of [
  path.join(CACHE, 'components', 'left-panel', 'LeftPanel.css'),
  path.join(CACHE, 'components', 'editor-panel', 'EditorPanel.css'),
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

const trackChanges = pick(
  path.join(CACHE, 'services', 'track-changes.js'),
  path.join(CACHE, 'src', 'services', 'track-changes.js'),
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
const pageTypography = pick(
  path.join(CACHE, 'services', 'page-typography.js'),
  path.join(CACHE, 'src', 'services', 'page-typography.js'),
);
const richText = pick(
  path.join(CACHE, 'services', 'rich-text.js'),
  path.join(CACHE, 'src', 'services', 'rich-text.js'),
);
const defaults = pick(
  path.join(CACHE, 'types', 'defaults.js'),
  path.join(CACHE, 'src', 'types', 'defaults.js'),
);
const pocRender = pick(
  path.join(CACHE, 'renderer', 'poc', 'poc-render.js'),
  path.join(CACHE, 'src', 'renderer', 'poc', 'poc-render.js'),
);
// P07-M2-R1: the family content services (real immutable editors used by the
// capture fixtures and the reversal tests) + the extracted PDF-view control.
const tableContent = pick(
  path.join(CACHE, 'services', 'table-content.js'),
  path.join(CACHE, 'src', 'services', 'table-content.js'),
);
const listCalloutContent = pick(
  path.join(CACHE, 'services', 'list-callout-content.js'),
  path.join(CACHE, 'src', 'services', 'list-callout-content.js'),
);
const formulaContent = pick(
  path.join(CACHE, 'services', 'formula-content.js'),
  path.join(CACHE, 'src', 'services', 'formula-content.js'),
);
const imageSignatureContent = pick(
  path.join(CACHE, 'services', 'image-signature-content.js'),
  path.join(CACHE, 'src', 'services', 'image-signature-content.js'),
);
const structuralContent = pick(
  path.join(CACHE, 'services', 'structural-block-content.js'),
  path.join(CACHE, 'src', 'services', 'structural-block-content.js'),
);
const labContent = pick(
  path.join(CACHE, 'services', 'lab-block-content.js'),
  path.join(CACHE, 'src', 'services', 'lab-block-content.js'),
);
const frontPageService = pick(
  path.join(CACHE, 'services', 'front-page.js'),
  path.join(CACHE, 'src', 'services', 'front-page.js'),
);
const headerFooterService = pick(
  path.join(CACHE, 'services', 'header-footer-settings.js'),
  path.join(CACHE, 'src', 'services', 'header-footer-settings.js'),
);
const changeViewSelector = pick(
  path.join(CACHE, 'renderer', 'poc', 'ChangeViewSelector.js'),
  path.join(CACHE, 'src', 'renderer', 'poc', 'ChangeViewSelector.js'),
);

const {
  documentChangeEvents,
  hasPendingChanges,
  loadEditorLabel,
  writeEditorLabel,
  EDITOR_LABEL_STORAGE_KEY,
  deriveChangeDrafts,
  commitTrackedChange,
  appendChangeEvents,
  acceptChange,
  rejectChange,
  acceptAllChanges,
  rejectAllChanges,
  deriveTextSegments,
  sliceSpanRange,
  markupRuns,
  buildChangeViewContext,
  buildDocumentChangeViewContext,
  pendingTextEventFor,
  describeBlockMarkupCues,
  describePendingTextCues,
  describeChangeEvent,
} = trackChanges;
const { serializeDocument, deserializeDocument, DocumentFileError } = documentFile;
const { clearDocumentContents, updateDocumentMetadata } = documentActions;
const { insertBlock, duplicateBlock, reorderBlock, deleteBlock, updateBlockSpacing, indexOfBlock } =
  blockActions;
const { updateHeadingContent, updateParagraphContent } = blockContent;
const { updatePageSetup, updateTypography } = pageTypography;
const { spansToPlainText, plainTextToSpans } = richText;
const { createDefaultDocument } = defaults;
const { renderDocPdfBytes } = pocRender;
const { ChangeViewSelector } = changeViewSelector;
const {
  addTableColumn,
  addTableRow,
  removeTableColumn,
  removeTableRow,
  setTableCellAlignment,
  setTableCellText,
  updateTableSettings,
} = tableContent;
const {
  addListItem,
  indentListItem,
  moveListItem,
  removeListItem,
  setItemChecked,
  updateCalloutContent,
  updateListItemText,
  updateListSettings,
} = listCalloutContent;
const { updateFormulaContent, updateVariableDefinition } = formulaContent;
const {
  SIGNER_SEED_DESIGNATION,
  addSigner,
  attachImageAsset,
  removeSigner,
  setSignerField,
  setImageCaption,
} = imageSignatureContent;
const {
  updateExhibitContent,
  updateReferenceEntry,
  updateReferenceTitle,
  updateRevisionEntry,
  updateSectionBreakContent,
} = structuralContent;
const {
  setAcceptanceOverallResult,
  setCalculationConclusion,
  setMeasurementCell,
  setMeasurementUncertaintyNote,
  updateAcceptanceCriterion,
  updateCalculationStep,
  updateEquipmentItem,
  updateMeasurementColumn,
  updateObservationRow,
  updateProcedureStep,
  updateProcedureTitle,
} = labContent;
const { updateFrontPage } = frontPageService;
const { applyHeaderFooterPatch, applyWatermarkPatch } = headerFooterService;

// ─────────────────────────────────────────────────────────────────────────────
// Deterministic fixtures (real services; no committed artifacts)
// ─────────────────────────────────────────────────────────────────────────────
const T0 = '2026-10-22T10:00:00.000Z';
const T1 = '2026-10-22T11:30:00.000Z';
let idSeq = 0;
const nextId = () => `00000000-0000-4000-8000-${String(++idSeq).padStart(12, '0')}`;
const opts = (extra = {}) => ({ now: T0, genId: nextId, ...extra });

const must = (result, what) => {
  if (!result.ok) throw new Error(`${what} failed: ${result.message}`);
  return result;
};

/** Base document: heading + 2 paragraphs, tracking ON, no events yet. */
function buildBase({ tracking = true } = {}) {
  let doc = createDefaultDocument(nextId(), T0);
  const h = must(insertBlock(doc, 'heading', { kind: 'end' }, opts()), 'insert heading');
  const headingId = h.blockId;
  const p = must(insertBlock(h.doc, 'paragraph', { kind: 'end' }, opts()), 'insert p1');
  const paraId = p.blockId;
  const p2 = must(insertBlock(p.doc, 'paragraph', { kind: 'end' }, opts()), 'insert p2');
  const para2Id = p2.blockId;
  const ht = must(
    updateHeadingContent(p2.doc, headingId, { text: 'Section alpha' }, opts()),
    'heading text',
  );
  const pt = must(
    updateParagraphContent(ht.doc, paraId, { spans: plainTextToSpans('Sample alpha text') }, opts()),
    'paragraph text',
  );
  doc = { ...pt.doc, trackChangesEnabled: tracking };
  return { doc, headingId, paraId, para2Id };
}

/** Capture through the single App seam with deterministic injection. */
const capture = (before, after, hint, extra = {}) => {
  const outcome = commitTrackedChange(before, after, hint, {
    now: T0,
    genId: nextId,
    ...extra,
  });
  if (outcome.error !== null) {
    throw new Error(`capture unexpectedly failed: ${outcome.error}`);
  }
  return outcome;
};

const lastEvent = (doc) => documentChangeEvents(doc)[documentChangeEvents(doc).length - 1];

// ── P07-M2-R1 family fixtures (real services through the single App seam) ───

/** The `data` of one block by id. */
const blockData = (doc, blockId) => doc.blocks.find((b) => b.id === blockId).data;

/** Every PENDING event of a document, in log order. */
const pendingEvents = (doc) => documentChangeEvents(doc).filter((e) => e.status === 'pending');

/** The one pending event addressed at `field`; asserts exactly one exists. */
function pendingOn(doc, field) {
  const hits = pendingEvents(doc).filter((e) => e.target.field === field);
  assert.equal(
    hits.length,
    1,
    `expected exactly one pending event on ${field}, got ${hits.length}`,
  );
  return hits[0];
}

/**
 * A base document plus one inserted block of `type`, captured through the
 * real block-create seam and settled, so family tests start from an empty
 * pending log (only the accepted create remains).
 */
function baseWithBlock(type) {
  const base = buildBase();
  const ins = must(insertBlock(base.doc, type, { kind: 'end' }, opts()), `insert ${type}`);
  const doc = capture(base.doc, ins.doc, { kind: 'block-create', blockId: ins.blockId }).doc;
  return { doc: acceptAllChanges(doc, { now: T1 }).doc, blockId: ins.blockId };
}

/** Apply a family service result through the App seam and return the doc. */
const edit = (doc, blockId, result, what) =>
  capture(doc, must(result, what).doc, { kind: 'block-content', blockId }).doc;

/** A deterministic PNG asset record (schema-v1 envelope fields only). */
function makeAsset(id, filename) {
  return {
    id,
    filename,
    mimeType: 'image/png',
    sizeBytes: 68,
    addedAt: T0,
    base64Data:
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  };
}

// ═════════════════════════════════════════════════════════════════════════════
group('1. module surface (P07-M2 track-changes service)');
// ═════════════════════════════════════════════════════════════════════════════

test('1.1 every documented P07-M2 entry point is exported', () => {
  const expectedFns = [
    'documentChangeEvents', 'hasPendingChanges', 'loadEditorLabel', 'writeEditorLabel',
    'deriveChangeDrafts', 'commitTrackedChange', 'appendChangeEvents',
    'acceptChange', 'rejectChange', 'acceptAllChanges', 'rejectAllChanges',
    'deriveTextSegments', 'sliceSpanRange', 'markupRuns',
    'buildChangeViewContext', 'buildDocumentChangeViewContext',
    'pendingTextEventFor', 'describeBlockMarkupCues', 'describeChangeEvent',
  ];
  for (const name of expectedFns) {
    assert.equal(typeof trackChanges[name], 'function', `${name} must be a function`);
  }
  assert.equal(EDITOR_LABEL_STORAGE_KEY, 'docstudio_editor_label');
});

test('1.2 documentChangeEvents tolerates old documents (absent key = empty log)', () => {
  const { doc } = buildBase();
  assert.equal(doc.changeEvents, undefined);
  assert.deepEqual(documentChangeEvents(doc), []);
  assert.equal(hasPendingChanges(doc), false);
});

// ═════════════════════════════════════════════════════════════════════════════
group('2. capture through the real service paths (single App seam)');
// ═════════════════════════════════════════════════════════════════════════════

test('2.1 heading text edit records ONE field-level text event', () => {
  const { doc, headingId } = buildBase();
  const after = must(
    updateHeadingContent(doc, headingId, { text: 'Section alpha v2' }, opts()),
    'edit',
  ).doc;
  const outcome = capture(doc, after, { kind: 'block-content', blockId: headingId }, {
    editorLabel: 'Ikram',
  });
  assert.equal(outcome.recorded, true);
  assert.equal(outcome.events.length, 1);
  const event = outcome.events[0];
  assert.equal(event.type, 'text');
  assert.equal(event.status, 'pending');
  assert.equal(event.target.kind, 'block-field');
  assert.equal(event.target.blockId, headingId);
  assert.equal(event.target.field, 'text');
  assert.equal(event.payload.original, 'Section alpha');
  assert.equal(event.payload.replacement, 'Section alpha v2');
  assert.equal(event.at, T0);
  assert.equal(event.editorLabel, 'Ikram');
  assert.equal(outcome.doc.changeEvents.length, 1);
  // The content edit stands regardless of tracking.
  const block = outcome.doc.blocks[indexOfBlock(outcome.doc, headingId)];
  assert.equal(block.data.text, 'Section alpha v2');
});

test('2.2 paragraph text edit records plain-text original/replacement', () => {
  const { doc, paraId } = buildBase();
  const after = must(
    updateParagraphContent(
      doc,
      paraId,
      { spans: plainTextToSpans('Sample beta text') },
      opts(),
    ),
    'edit',
  ).doc;
  const outcome = capture(doc, after, { kind: 'block-content', blockId: paraId });
  assert.equal(outcome.recorded, true);
  const event = outcome.events[0];
  assert.equal(event.type, 'text');
  assert.equal(event.payload.original, 'Sample alpha text');
  assert.equal(event.payload.replacement, 'Sample beta text');
});

test('2.3 paragraph styling-only edit records a spans formatting event', () => {
  const { doc, paraId } = buildBase();
  const after = must(
    updateParagraphContent(
      doc,
      paraId,
      { spans: [{ text: 'Sample alpha text', bold: true }] },
      opts(),
    ),
    'style',
  ).doc;
  const outcome = capture(doc, after, { kind: 'block-content', blockId: paraId });
  assert.equal(outcome.recorded, true);
  const event = outcome.events[0];
  assert.equal(event.type, 'formatting');
  assert.equal(event.target.field, 'spans');
  assert.equal(event.payload.kind, 'spans');
  assert.equal(event.payload.original[0].bold, undefined);
  assert.equal(event.payload.replacement[0].bold, true);
});

test('2.4 heading level/alignment edits record formatting property events', () => {
  const { doc, headingId } = buildBase();
  const originalLevel = doc.blocks[indexOfBlock(doc, headingId)].data.level;
  const targetLevel = originalLevel + 1;
  const after = must(
    updateHeadingContent(doc, headingId, { level: targetLevel, hAlign: 'center' }, opts()),
    'level',
  ).doc;
  const outcome = capture(doc, after, { kind: 'block-content', blockId: headingId });
  assert.equal(outcome.recorded, true);
  assert.equal(outcome.events.length, 2);
  const level = outcome.events.find((e) => e.target.field === 'level');
  const align = outcome.events.find((e) => e.target.field === 'hAlign');
  assert.equal(level.payload.kind, 'property');
  assert.equal(level.payload.original, originalLevel);
  assert.equal(level.payload.replacement, targetLevel);
  assert.equal(align.payload.replacement, 'center');
});

test('2.5 spacing edit records spacing.topPt formatting property', () => {
  const { doc, headingId } = buildBase();
  const after = must(updateBlockSpacing(doc, headingId, 'topPt', 24, opts()), 'spacing').doc;
  const outcome = capture(doc, after, { kind: 'block-content', blockId: headingId });
  assert.equal(outcome.recorded, true);
  const event = outcome.events[0];
  assert.equal(event.type, 'formatting');
  assert.equal(event.target.field, 'spacing.topPt');
  assert.equal(event.payload.replacement, 24);
});

test('2.6 block insert records block-create with position data', () => {
  const { doc } = buildBase();
  const ins = must(insertBlock(doc, 'callout', { kind: 'end' }, opts()), 'insert');
  const outcome = capture(doc, ins.doc, { kind: 'block-create', blockId: ins.blockId });
  assert.equal(outcome.recorded, true);
  const event = outcome.events[0];
  assert.equal(event.type, 'block-create');
  assert.equal(event.payload.block.id, ins.blockId);
  assert.equal(event.payload.block.data.type, 'callout');
  assert.equal(event.payload.index, 3);
  assert.equal(event.payload.afterBlockId, doc.blocks[2].id);
});

test('2.7 block duplicate records a block-create for the NEW block', () => {
  const { doc, paraId } = buildBase();
  const dup = must(duplicateBlock(doc, paraId, opts()), 'duplicate');
  const outcome = capture(doc, dup.doc, { kind: 'block-create', blockId: dup.blockId });
  assert.equal(outcome.recorded, true);
  assert.notEqual(dup.blockId, paraId);
  assert.equal(outcome.events[0].payload.block.id, dup.blockId);
});

test('2.8 block delete records block-delete carrying the removed block', () => {
  const { doc, para2Id } = buildBase();
  const del = must(deleteBlock(doc, para2Id, opts()), 'delete');
  const outcome = capture(doc, del.doc, { kind: 'block-delete', blockId: para2Id });
  assert.equal(outcome.recorded, true);
  const event = outcome.events[0];
  assert.equal(event.type, 'block-delete');
  assert.equal(event.payload.block.id, para2Id);
  assert.equal(event.payload.index, 2);
  assert.equal(event.payload.afterBlockId, doc.blocks[1].id);
  // The payload carries the block exactly as it was (default paragraph text).
  assert.equal(spansToPlainText(event.payload.block.data.spans), 'New paragraph.');
});

test('2.9 block reorder records block-reorder with both neighbours', () => {
  const { doc, headingId } = buildBase();
  const moved = must(reorderBlock(doc, headingId, 'down', opts()), 'move');
  const outcome = capture(doc, moved.doc, { kind: 'block-reorder', blockId: headingId });
  assert.equal(outcome.recorded, true);
  const event = outcome.events[0];
  assert.equal(event.type, 'block-reorder');
  assert.equal(event.payload.fromIndex, 0);
  assert.equal(event.payload.toIndex, 1);
  assert.equal(event.payload.fromAfterBlockId, null);
  // After the move the heading sits directly after para1 (old index 1).
  assert.equal(event.payload.toAfterBlockId, doc.blocks[1].id);
});

test('2.10 metadata title edit records a metadata event', () => {
  const { doc } = buildBase();
  const after = updateDocumentMetadata(doc, { title: 'New title' }, T0);
  const outcome = capture(doc, after, { kind: 'metadata' });
  assert.equal(outcome.recorded, true);
  const event = outcome.events[0];
  assert.equal(event.type, 'metadata');
  assert.equal(event.target.field, 'title');
  assert.equal(event.payload.original, doc.metadata.title);
  assert.equal(event.payload.replacement, 'New title');
});

test('2.11 page-setup and typography edits record settings leaves', () => {
  const { doc } = buildBase();
  const sized = must(updatePageSetup(doc, { field: 'size', size: 'Letter' }, T0), 'size').doc;
  const outcome = capture(doc, sized, { kind: 'settings' });
  assert.equal(outcome.recorded, true);
  assert.equal(outcome.events.length, 1);
  assert.equal(outcome.events[0].type, 'settings');
  assert.equal(outcome.events[0].target.field, 'pageSetup.size');
  assert.equal(outcome.events[0].payload.replacement, 'Letter');

  const ty = must(updateTypography(sized, { field: 'lineHeight', value: 1.75 }, T0), 'lh').doc;
  const outcome2 = capture(sized, ty, { kind: 'settings' });
  assert.equal(outcome2.recorded, true);
  assert.equal(outcome2.events[0].target.field, 'pageTypography.typography.lineHeight');
});

test('2.12 no-op (same reference) records nothing', () => {
  const { doc } = buildBase();
  const outcome = commitTrackedChange(doc, doc, { kind: 'metadata' });
  assert.equal(outcome.recorded, false);
  assert.deepEqual(outcome.events, []);
  assert.equal(outcome.error, null);
});

test('2.13 tracking disabled records nothing and PRESERVES existing events', () => {
  const { doc, headingId } = buildBase();
  const tracked = capture(
    doc,
    must(updateHeadingContent(doc, headingId, { text: 'Edited once' }, opts()), 'e1').doc,
    { kind: 'block-content', blockId: headingId },
  ).doc;
  assert.equal(tracked.changeEvents.length, 1);

  const disabled = { ...tracked, trackChangesEnabled: false };
  const after = must(
    updateHeadingContent(disabled, headingId, { text: 'Edited while off' }, opts()),
    'e2',
  ).doc;
  const outcome = commitTrackedChange(disabled, after, { kind: 'block-content', blockId: headingId });
  assert.equal(outcome.recorded, false);
  assert.equal(outcome.error, null);
  // The edit stands, no new event, existing pending event untouched.
  const block = outcome.doc.blocks[indexOfBlock(outcome.doc, headingId)];
  assert.equal(block.data.text, 'Edited while off');
  assert.equal(outcome.doc.changeEvents.length, 1);
  assert.equal(outcome.doc.changeEvents[0].status, 'pending');
});

test('2.14 an invalid draft fails the append ATOMICALLY with a surfaced error', () => {
  const { doc } = buildBase();
  const goodDraft = {
    type: 'metadata',
    target: { kind: 'document', field: 'title' },
    payload: { original: doc.metadata.title, replacement: 'Valid title' },
  };
  const badDraft = {
    type: 'metadata',
    target: { kind: 'document', field: 'title' },
    payload: { original: 'X', replacement: 'X' }, // unchanged value -> invalid
  };
  const result = appendChangeEvents(doc, [goodDraft, badDraft], { now: T0, genId: nextId });
  assert.equal(result.ok, false);
  assert.ok(result.message.length > 0);
  // Atomic: the document is untouched, no partial log.
  assert.equal(result.doc, undefined);
  assert.equal(doc.changeEvents, undefined);
});

test('2.15 unsupported surfaces contribute nothing (documented scope)', () => {
  const { doc } = buildBase();
  // customFields edit with a metadata hint: outside the tracked metadata leaves.
  const after = {
    ...doc,
    metadata: {
      ...doc.metadata,
      customFields: [{ id: nextId(), label: 'Lot', value: 'X-1' }],
    },
  };
  const drafts = deriveChangeDrafts(doc, after, { kind: 'metadata' });
  assert.equal(drafts.length, 0);
  // fontFallbacks edit with a settings hint: array-valued leaf, untracked.
  const ty = must(
    updateTypography(doc, { field: 'fontFallbacks', value: ['Verdana'] }, T0),
    'fallbacks',
  ).doc;
  assert.equal(deriveChangeDrafts(doc, ty, { kind: 'settings' }).length, 0);
});

// ═════════════════════════════════════════════════════════════════════════════
group('3. accept and reject (§12.1 review operations)');
// ═════════════════════════════════════════════════════════════════════════════

/** Fixture doc with one pending heading text event (alpha -> beta). */
function docWithTextEvent() {
  const { doc, headingId } = buildBase();
  const tracked = capture(
    doc,
    must(updateHeadingContent(doc, headingId, { text: 'Section beta' }, opts()), 'edit').doc,
    { kind: 'block-content', blockId: headingId },
  ).doc;
  return { doc: tracked, headingId, eventId: lastEvent(tracked).id };
}

test('3.1 accept keeps current content and marks the event accepted', () => {
  const { doc, headingId, eventId } = docWithTextEvent();
  const result = must(acceptChange(doc, eventId, { now: T1 }), 'accept');
  assert.equal(result.ok, true);
  const block = result.doc.blocks[indexOfBlock(result.doc, headingId)];
  assert.equal(block.data.text, 'Section beta'); // content untouched
  assert.equal(result.doc.changeEvents[0].status, 'accepted');
  assert.equal(result.doc.changeEvents[0].id, eventId, 'event identity preserved');
});

test('3.2 reject restores the ORIGINAL value through the same services', () => {
  const { doc, headingId, eventId } = docWithTextEvent();
  const result = must(rejectChange(doc, eventId, { now: T1 }), 'reject');
  assert.equal(result.ok, true);
  const block = result.doc.blocks[indexOfBlock(result.doc, headingId)];
  assert.equal(block.data.text, 'Section alpha'); // original restored
  assert.equal(result.doc.changeEvents[0].status, 'rejected');
});

test('3.3 rejecting a formatting property restores the property', () => {
  const { doc, headingId } = buildBase();
  const tracked = capture(
    doc,
    must(updateHeadingContent(doc, headingId, { level: 3 }, opts()), 'level').doc,
    { kind: 'block-content', blockId: headingId },
  ).doc;
  const event = lastEvent(tracked);
  const result = must(rejectChange(tracked, event.id, { now: T1 }), 'reject');
  const block = result.doc.blocks[indexOfBlock(result.doc, headingId)];
  const originalLevel = doc.blocks[indexOfBlock(doc, headingId)].data.level;
  assert.equal(block.data.level, originalLevel);
  assert.equal(result.doc.changeEvents[0].status, 'rejected');
});

test('3.4 rejecting a spans styling event restores the exact original spans', () => {
  const { doc, paraId } = buildBase();
  const originalSpans = doc.blocks[indexOfBlock(doc, paraId)].data.spans;
  const tracked = capture(
    doc,
    must(
      updateParagraphContent(doc, paraId, { spans: [{ text: 'Sample alpha text', bold: true }] }, opts()),
      'style',
    ).doc,
    { kind: 'block-content', blockId: paraId },
  ).doc;
  const result = must(rejectChange(tracked, lastEvent(tracked).id, { now: T1 }), 'reject');
  const block = result.doc.blocks[indexOfBlock(result.doc, paraId)];
  assert.deepEqual(block.data.spans, originalSpans);
});

test('3.5 a stale edit makes the first event non-reversible (stale-target)', () => {
  const { doc, headingId, eventId } = docWithTextEvent();
  // The field changed again AFTER the tracked edit (tracking still on).
  const second = capture(
    doc,
    must(updateHeadingContent(doc, headingId, { text: 'Section gamma' }, opts()), 'edit2').doc,
    { kind: 'block-content', blockId: headingId },
  ).doc;
  const result = rejectChange(second, eventId, { now: T1 });
  assert.equal(result.ok, false);
  assert.equal(result.code, 'stale-target');
  // The failed operation mutates nothing.
  assert.equal(result.doc, undefined);
  assert.equal(second.changeEvents[0].status, 'pending');
});

test('3.6 accept of a created block keeps it; reject removes it', () => {
  const { doc } = buildBase();
  const ins = must(insertBlock(doc, 'callout', { kind: 'end' }, opts()), 'insert');
  const tracked = capture(doc, ins.doc, { kind: 'block-create', blockId: ins.blockId }).doc;
  const event = lastEvent(tracked);

  const accepted = must(acceptChange(tracked, event.id, { now: T1 }), 'accept');
  assert.ok(indexOfBlock(accepted.doc, ins.blockId) >= 0, 'block stays after accept');

  const rejected = must(rejectChange(tracked, event.id, { now: T1 }), 'reject');
  assert.equal(indexOfBlock(rejected.doc, ins.blockId), -1, 'block removed after reject');
  assert.equal(rejected.doc.changeEvents[0].status, 'rejected');
});

test('3.7 rejecting a creation with pending dependents is blocked', () => {
  const { doc } = buildBase();
  const ins = must(insertBlock(doc, 'heading', { kind: 'end' }, opts()), 'insert');
  const tracked = capture(doc, ins.doc, { kind: 'block-create', blockId: ins.blockId }).doc;
  const createEvent = lastEvent(tracked);
  // A second tracked edit touches the created block.
  const withContent = capture(
    tracked,
    must(
      updateHeadingContent(tracked, ins.blockId, { text: 'Created heading' }, opts()),
      'content',
    ).doc,
    { kind: 'block-content', blockId: ins.blockId },
  ).doc;
  assert.equal(withContent.changeEvents.length, 2);

  const result = rejectChange(withContent, createEvent.id, { now: T1 });
  assert.equal(result.ok, false);
  assert.equal(result.code, 'dependent-changes');
  assert.equal(result.doc, undefined, 'failed operation mutates nothing');

  // Resolve the dependent first, then the creation reverses cleanly.
  const dependentId = lastEvent(withContent).id;
  const afterAccept = must(acceptChange(withContent, dependentId, { now: T1 }), 'accept dep');
  const afterReject = must(rejectChange(afterAccept.doc, createEvent.id, { now: T1 }), 'reject create');
  assert.equal(indexOfBlock(afterReject.doc, ins.blockId), -1);
});

test('3.8 deleting a block restores it at the recorded position on reject', () => {
  const { doc, para2Id } = buildBase();
  const del = must(deleteBlock(doc, para2Id, opts()), 'delete');
  const tracked = capture(doc, del.doc, { kind: 'block-delete', blockId: para2Id }).doc;

  // Reject restores order [heading, para1, para2].
  const result = must(rejectChange(tracked, lastEvent(tracked).id, { now: T1 }), 'reject');
  assert.deepEqual(
    result.doc.blocks.map((b) => b.id),
    [doc.blocks[0].id, doc.blocks[1].id, para2Id],
  );
  // Accept keeps it deleted.
  const accepted = must(acceptChange(tracked, lastEvent(tracked).id, { now: T1 }), 'accept');
  assert.equal(indexOfBlock(accepted.doc, para2Id), -1);
});

test('3.9 a re-created identity blocks a delete-reversal (block-conflict)', () => {
  const { doc, para2Id } = buildBase();
  const del = must(deleteBlock(doc, para2Id, opts()), 'delete');
  const tracked = capture(doc, del.doc, { kind: 'block-delete', blockId: para2Id }).doc;
  // A block with the same id exists again (simulated re-creation): re-add
  // the ORIGINAL block (deleted from `del.doc`, still present in `doc`).
  const conflicted = { ...tracked, blocks: [...tracked.blocks, doc.blocks[2]] };
  const result = rejectChange(conflicted, lastEvent(tracked).id, { now: T1 });
  assert.equal(result.ok, false);
  assert.equal(result.code, 'block-conflict');
});

test('3.10 reject of reorder restores the original order', () => {
  const { doc, headingId } = buildBase();
  const moved = must(reorderBlock(doc, headingId, 'down', opts()), 'move');
  const tracked = capture(doc, moved.doc, { kind: 'block-reorder', blockId: headingId }).doc;
  const result = must(rejectChange(tracked, lastEvent(tracked).id, { now: T1 }), 'reject');
  assert.deepEqual(
    result.doc.blocks.map((b) => b.id),
    doc.blocks.map((b) => b.id),
  );
});

test('3.11 reject of metadata/settings restores the recorded originals', () => {
  const { doc } = buildBase();
  const md = updateDocumentMetadata(doc, { subtitle: 'Old subtitle changed' }, T0);
  const trackedMd = capture(doc, md, { kind: 'metadata' }).doc;
  const r1 = must(rejectChange(trackedMd, lastEvent(trackedMd).id, { now: T1 }), 'reject md');
  assert.equal(r1.doc.metadata.subtitle, doc.metadata.subtitle);

  const sized = must(updatePageSetup(doc, { field: 'size', size: 'Letter' }, T0), 'size').doc;
  const trackedS = capture(doc, sized, { kind: 'settings' }).doc;
  const r2 = must(rejectChange(trackedS, lastEvent(trackedS).id, { now: T1 }), 'reject settings');
  assert.equal(r2.doc.pageSetup.size, doc.pageSetup.size);
});

test('3.12 invalid review actions surface deterministic errors', () => {
  const { doc, eventId } = docWithTextEvent();
  // Unknown id.
  const missing = rejectChange(doc, nextId(), { now: T1 });
  assert.equal(missing.ok, false);
  assert.equal(missing.code, 'event-not-found');
  // Already resolved.
  const accepted = must(acceptChange(doc, eventId, { now: T1 }), 'accept');
  const again = acceptChange(accepted.doc, eventId, { now: T1 });
  assert.equal(again.ok, false);
  assert.equal(again.code, 'already-resolved');
  const rejected = rejectChange(accepted.doc, eventId, { now: T1 });
  assert.equal(rejected.ok, false);
  assert.equal(rejected.code, 'already-resolved');
});

// ═════════════════════════════════════════════════════════════════════════════
group('4. bulk accept / reject');
// ═════════════════════════════════════════════════════════════════════════════

test('4.1 accept-all resolves every pending event, content untouched', () => {
  const { doc, headingId, paraId } = buildBase();
  const t1 = capture(
    doc,
    must(updateHeadingContent(doc, headingId, { text: 'H edited' }, opts()), 'h').doc,
    { kind: 'block-content', blockId: headingId },
  ).doc;
  const t2 = capture(
    t1,
    must(
      updateParagraphContent(t1, paraId, { spans: plainTextToSpans('P edited') }, opts()),
      'p',
    ).doc,
    { kind: 'block-content', blockId: paraId },
  ).doc;
  assert.equal(t2.changeEvents.length, 2);

  const result = acceptAllChanges(t2, { now: T1 });
  assert.equal(result.ok, true);
  assert.equal(result.resolved, 2);
  assert.ok(result.doc.changeEvents.every((e) => e.status === 'accepted'));
  assert.equal(
    result.doc.blocks[indexOfBlock(result.doc, headingId)].data.text,
    'H edited',
    'accept-all never mutates content',
  );
  // No pending left.
  assert.equal(hasPendingChanges(result.doc), false);
});

test('4.2 accept-all on a log with nothing pending is a same-reference no-op', () => {
  const { doc } = buildBase();
  const result = acceptAllChanges(doc, { now: T1 });
  assert.equal(result.resolved, 0);
  assert.equal(result.doc, doc);
});

test('4.3 reject-all unwinds dependent chains in REVERSE order', () => {
  const { doc, headingId } = buildBase();
  // E1: alpha -> beta. E2 (dependent on E1): beta -> gamma.
  const e1 = capture(
    doc,
    must(updateHeadingContent(doc, headingId, { text: 'Section beta' }, opts()), 'e1').doc,
    { kind: 'block-content', blockId: headingId },
  ).doc;
  const e2 = capture(
    e1,
    must(updateHeadingContent(e1, headingId, { text: 'Section gamma' }, opts()), 'e2').doc,
    { kind: 'block-content', blockId: headingId },
  ).doc;
  assert.equal(e2.changeEvents.length, 2);

  const result = rejectAllChanges(e2, { now: T1 });
  assert.equal(result.ok, true);
  assert.equal(result.resolved, 2);
  assert.deepEqual(result.failures, []);
  // Reverse unwinding: gamma -> beta -> alpha, ending at the ORIGINAL.
  assert.equal(
    result.doc.blocks[indexOfBlock(result.doc, headingId)].data.text,
    'Section alpha',
  );
  assert.ok(result.doc.changeEvents.every((e) => e.status === 'rejected'));
});

test('4.4 reject-all reports unresolvable events honestly, keeps them pending', () => {
  const { doc, headingId, eventId } = docWithTextEvent();
  // An UNTRACKED intervening edit makes the tracked event stale (the field
  // changed again while recording was off, so no compensating event exists).
  const off = { ...doc, trackChangesEnabled: false };
  const stale = {
    ...must(updateHeadingContent(off, headingId, { text: 'Section gamma' }, opts()), 'stale').doc,
    trackChangesEnabled: true,
  };
  assert.equal(stale.changeEvents.length, 1, 'the disabled edit recorded nothing');
  const withSecond = capture(
    stale,
    updateDocumentMetadata(stale, { subtitle: 'Another change' }, T0),
    { kind: 'metadata' },
  ).doc;

  const result = rejectAllChanges(withSecond, { now: T1 });
  assert.equal(result.ok, true);
  assert.equal(result.resolved, 1, 'the reversible metadata event resolves');
  assert.equal(result.failures.length, 1);
  assert.equal(result.failures[0].id, eventId);
  const remaining = result.doc.changeEvents.find((e) => e.id === eventId);
  assert.equal(remaining.status, 'pending', 'unreversible event stays pending, never dropped');
  assert.equal(
    result.doc.blocks[indexOfBlock(result.doc, headingId)].data.text,
    'Section gamma',
    'the failed event leaves its content untouched',
  );
});

// ═════════════════════════════════════════════════════════════════════════════
group('5. markup derivation (segments, runs, ghosts, cues, descriptions)');
// ═════════════════════════════════════════════════════════════════════════════

test('5.1 deriveTextSegments splits common prefix/suffix correctly', () => {
  assert.deepEqual(deriveTextSegments('Same', 'Same'), [{ kind: 'equal', text: 'Same' }]);
  assert.deepEqual(deriveTextSegments('', ''), []);
  assert.deepEqual(deriveTextSegments('abc', 'abc'), [{ kind: 'equal', text: 'abc' }]);
  // Pure insertion in the middle.
  const ins = deriveTextSegments('Hello world', 'Hello brave world');
  assert.deepEqual(ins, [
    { kind: 'equal', text: 'Hello ' },
    { kind: 'insert', text: 'brave ' },
    { kind: 'equal', text: 'world' },
  ]);
  // Pure deletion in the middle.
  const del = deriveTextSegments('Hello brave world', 'Hello world');
  assert.deepEqual(del, [
    { kind: 'equal', text: 'Hello ' },
    { kind: 'delete', text: 'brave ' },
    { kind: 'equal', text: 'world' },
  ]);
  // Replacement: shared trailing 'a' is kept as the common suffix, so the
  // derived middles are 'alph' / 'bet' (documented prefix/suffix trim).
  const rep = deriveTextSegments('alpha', 'beta');
  assert.deepEqual(rep, [
    { kind: 'delete', text: 'alph' },
    { kind: 'insert', text: 'bet' },
    { kind: 'equal', text: 'a' },
  ]);
});

test('5.2 markupRuns forces strikethrough on deletes, underline on inserts', () => {
  const originalSpans = [{ text: 'alpha', italic: true }];
  const replacementSpans = [{ text: 'beta', bold: true }];
  const runs = markupRuns('alpha', 'beta', originalSpans, replacementSpans);
  // delete 'alph' + insert 'bet' + shared-suffix equal 'a' (see 5.1).
  assert.equal(runs.length, 3);
  const [del, ins] = runs;
  assert.equal(del.mark, 'delete');
  assert.equal(del.text, 'alph');
  assert.equal(del.spans[0].strikethrough, true, 'deleted fragment is struck');
  assert.equal(del.spans[0].italic, true, 'deleted fragment keeps original styling');
  assert.equal(del.spans[0].underline, undefined, 'underline is never inherited by deletes');
  assert.equal(ins.mark, 'insert');
  assert.equal(ins.text, 'bet');
  assert.equal(ins.spans[0].underline, true, 'inserted fragment is underlined');
  assert.equal(ins.spans[0].bold, true, 'inserted fragment keeps replacement styling');
});

test('5.3 markupRuns character accounting matches original + replacement', () => {
  // Strings with NO shared affix, so delete/insert runs cover the full diff.
  const original = 'Sample alpha text';
  const replacement = 'Sample beta label';
  const runs = markupRuns(original, replacement, plainTextToSpans(original), plainTextToSpans(replacement));
  const kept = runs.filter((r) => r.mark !== 'delete').map((r) => r.text).join('');
  const deleted = runs.filter((r) => r.mark === 'delete').map((r) => r.text).join('');
  assert.equal(kept, replacement, 'non-deleted runs reassemble the replacement');
  assert.equal(deleted, 'alpha text', 'deleted runs carry the removed fragment');
});

test('5.4 sliceSpanRange slices across span boundaries', () => {
  const spans = [{ text: 'abc', bold: true }, { text: 'def', italic: true }];
  assert.deepEqual(sliceSpanRange(spans, 1, 5), [
    { text: 'bc', bold: true },
    { text: 'de', italic: true },
  ]);
  assert.deepEqual(sliceSpanRange(spans, 0, 3), [{ text: 'abc', bold: true }]);
  assert.deepEqual(sliceSpanRange(spans, 3, 3), []);
});

test('5.5 buildChangeViewContext: null with nothing pending, ghosts resolved', () => {
  const { doc, para2Id } = buildBase();
  assert.equal(buildChangeViewContext(doc.blocks, []), null);
  assert.equal(buildDocumentChangeViewContext(doc), null);

  const del = must(deleteBlock(doc, para2Id, opts()), 'delete');
  const tracked = capture(doc, del.doc, { kind: 'block-delete', blockId: para2Id }).doc;
  const ctx = buildDocumentChangeViewContext(tracked);
  assert.ok(ctx !== null);
  assert.equal(ctx.ghosts.length, 1);
  // Neighbour (para1, index 1) still exists -> ghost renders directly after it.
  assert.equal(ctx.ghosts[0].afterBlockId, doc.blocks[1].id);
  assert.equal(ctx.ghosts[0].afterIndex, 1);
  assert.equal(ctx.byBlock.size, 0, 'block-delete ghosts are not per-block events');
});

test('5.6 ghost with a missing neighbour clamps to the recorded index', () => {
  const { doc, headingId } = buildBase();
  const del = must(deleteBlock(doc, headingId, opts()), 'delete heading');
  const tracked = capture(doc, del.doc, { kind: 'block-delete', blockId: headingId }).doc;
  const ctx = buildDocumentChangeViewContext(tracked);
  assert.equal(ctx.ghosts[0].afterBlockId, null);
  assert.equal(ctx.ghosts[0].afterIndex, -1, 'deleted-at-start ghost renders before block 1');
});

test('5.7 pendingTextEventFor returns the OLDEST pending text event', () => {
  const { doc, headingId } = buildBase();
  const e1 = capture(
    doc,
    must(updateHeadingContent(doc, headingId, { text: 'B' }, opts()), 'e1').doc,
    { kind: 'block-content', blockId: headingId },
  ).doc;
  const e2 = capture(
    e1,
    must(updateHeadingContent(e1, headingId, { text: 'C' }, opts()), 'e2').doc,
    { kind: 'block-content', blockId: headingId },
  ).doc;
  const events = documentChangeEvents(e2);
  const oldest = pendingTextEventFor(events);
  assert.equal(oldest.id, events[0].id);
  assert.equal(oldest.payload.original, 'Section alpha');
  // Once resolved, no pending text event remains for the block.
  const accepted = acceptAllChanges(e2, { now: T1 }).doc;
  assert.equal(pendingTextEventFor(documentChangeEvents(accepted)), undefined);
});

test('5.8 describeBlockMarkupCues emits textual, non-color cues', () => {
  const { doc, headingId } = buildBase();
  const ins = must(insertBlock(doc, 'callout', { kind: 'end' }, opts()), 'insert');
  const created = capture(doc, ins.doc, { kind: 'block-create', blockId: ins.blockId }).doc;
  const cueEvents = documentChangeEvents(created);
  assert.deepEqual(describeBlockMarkupCues(cueEvents), ['Inserted']);
  assert.deepEqual(describeBlockMarkupCues(undefined), []);

  const moved = capture(
    created,
    must(reorderBlock(created, headingId, 'down', opts()), 'move').doc,
    { kind: 'block-reorder', blockId: headingId },
  ).doc;
  const movedCues = describeBlockMarkupCues(
    documentChangeEvents(moved).filter((e) => e.type === 'block-reorder'),
  );
  assert.deepEqual(movedCues, ['Moved']);
});

test('5.9 describeChangeEvent produces human-readable review text', () => {
  const { doc, headingId, eventId } = docWithTextEvent();
  const event = documentChangeEvents(doc).find((e) => e.id === eventId);
  const desc = describeChangeEvent(event, doc.blocks);
  assert.equal(desc.title, 'Text change');
  assert.equal(desc.target, 'Heading — text');
  assert.equal(desc.before, 'Section alpha');
  assert.equal(desc.after, 'Section beta');
});

test('5.10 pending events for an existing block appear in byBlock', () => {
  const { doc, headingId } = docWithTextEvent();
  const ctx = buildDocumentChangeViewContext(doc);
  assert.equal(ctx.byBlock.size, 1);
  assert.equal(ctx.byBlock.get(headingId).length, 1);
  assert.equal(ctx.byBlock.get(headingId)[0].type, 'text');
});

// ═════════════════════════════════════════════════════════════════════════════
group('6. persistence: additive schema v1 round-trips');
// ═════════════════════════════════════════════════════════════════════════════

/** A document carrying pending + accepted + rejected events. */
function docWithFullLog() {
  const { doc, headingId, paraId } = buildBase();
  const t1 = capture(
    doc,
    must(updateHeadingContent(doc, headingId, { text: 'Persisted heading' }, opts()), 'h').doc,
    { kind: 'block-content', blockId: headingId },
  ).doc;
  const accepted = acceptAllChanges(t1, { now: T1 }).doc;
  const t2 = capture(
    accepted,
    must(
      updateParagraphContent(accepted, paraId, { spans: plainTextToSpans('Pending paragraph') }, opts()),
      'p',
    ).doc,
    { kind: 'block-content', blockId: paraId },
  ).doc;
  const rejectedDoc = must(
    rejectChange(t2, lastEvent(t2).id, { now: T1 }),
    'reject the paragraph edit',
  ).doc;
  return rejectedDoc;
}

test('6.1 documents WITH events round-trip losslessly', () => {
  const doc = docWithFullLog();
  assert.equal(doc.changeEvents.length, 2);
  const json = serializeDocument(doc);
  const back = deserializeDocument(json);
  assert.deepEqual(back, doc);
  assert.equal(back.schemaVersion, 1);
});

test('6.2 documents WITHOUT events serialize byte-identically to before', () => {
  const { doc } = buildBase();
  const json = serializeDocument(doc);
  assert.ok(!json.includes('changeEvents'), 'the optional key is never written when absent');
  const back = deserializeDocument(json);
  assert.equal(back.changeEvents, undefined);
  assert.deepEqual(back, doc);
});

test('6.3 serialization is deterministic (double round-trip is byte-stable)', () => {
  const doc = docWithFullLog();
  const once = serializeDocument(doc);
  const twice = serializeDocument(deserializeDocument(once));
  assert.equal(twice, once, 'byte-identical re-serialization');
});

test('6.4 OLD documents (pre-P07-M2 shape) open with defaults', () => {
  const { doc } = buildBase();
  // A v1 document exactly as P02..P06 wrote it: no changeEvents key.
  const json = serializeDocument(doc);
  const parsed = JSON.parse(json);
  assert.equal('changeEvents' in parsed, false);
  const opened = deserializeDocument(json);
  assert.deepEqual(documentChangeEvents(opened), []);
  assert.equal(opened.trackChangesEnabled, doc.trackChangesEnabled, 'stub meaning preserved');
});

test('6.5 malformed event logs are rejected with a precise message', () => {
  const { doc } = buildBase();
  const base = JSON.parse(serializeDocument(doc));
  // DocumentFileError carries the user message in `message` and the
  // bullet-list of validation details (incl. per-index errors) in `detail`.
  const detailOf = (fn) => {
    try {
      fn();
    } catch (e) {
      assert.ok(e instanceof DocumentFileError, `expected DocumentFileError, got ${e && e.name}`);
      return String(e.detail ?? '');
    }
    throw new assert.AssertionError({ message: 'expected deserializeDocument to throw' });
  };

  // Not an array.
  assert.match(
    detailOf(() => deserializeDocument(JSON.stringify({ ...base, changeEvents: 'nope' }))),
    /changeEvents/,
    'non-array changeEvents is reported by name',
  );
  // Bad element.
  assert.match(
    detailOf(() => deserializeDocument(JSON.stringify({ ...base, changeEvents: [42] }))),
    /changeEvents\[0\]/,
    'the failing index is reported precisely',
  );
  // Structurally invalid element.
  assert.match(
    detailOf(() =>
      deserializeDocument(
        JSON.stringify({
          ...base,
          changeEvents: [{ type: 'text', status: 'pending' }],
        }),
      ),
    ),
    /changeEvents\[0\]/,
    'an invalid event is rejected on load, file refused',
  );
});

test('6.6 a full-log document survives save->open->review (end to end)', () => {
  const doc = docWithFullLog();
  const opened = deserializeDocument(serializeDocument(doc));
  // Every persisted event validates and can still be reviewed.
  for (const event of documentChangeEvents(opened)) {
    assert.ok(['pending', 'accepted', 'rejected'].includes(event.status));
  }
  assert.equal(hasPendingChanges(opened), false);
  // A fresh tracked edit appends to the LOADED log without disturbing it.
  const headingId = opened.blocks[0].id;
  const before = documentChangeEvents(opened).length;
  const afterEdit = must(
    updateHeadingContent(opened, headingId, { text: 'After reopen' }, opts()),
    'edit',
  ).doc;
  const tracked = capture(opened, afterEdit, { kind: 'block-content', blockId: headingId }).doc;
  assert.equal(documentChangeEvents(tracked).length, before + 1);
  assert.equal(tracked.changeEvents[0].status, 'accepted', 'older events keep identity and order');
});

test('6.7 clearDocumentContents clears the event log (documented policy)', () => {
  const doc = docWithFullLog();
  const cleared = clearDocumentContents(doc);
  assert.equal(cleared.changeEvents, undefined);
  assert.equal(cleared.blocks.length, 0);
  // Old documents without the key behave identically.
  const { doc: plain } = buildBase();
  assert.equal(clearDocumentContents(plain).changeEvents, undefined);
});

// ═════════════════════════════════════════════════════════════════════════════
group('7. renderer: markup vs clean PDF bytes and text');
// ═════════════════════════════════════════════════════════════════════════════

/** pdfjs wrapper (same options as verify_p06_m1/m3). */
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

/** Extracted text of every page, space-joined. */
async function pdfText(buf) {
  return withPdf(buf, async (pdf) => {
    const out = [];
    for (let i = 1; i <= pdf.numPages; i += 1) {
      const page = await pdf.getPage(i);
      const content = await page.getTextContent();
      for (const item of content.items) {
        if (item.str && item.str.trim() !== '') out.push(item.str);
      }
    }
    return out.join(' ');
  });
}

/**
 * Whitespace-free text of every page.  pdfjs often splits a styled run into
 * SEPARATE extraction items (e.g. `[` and `Inserted]`), so cue assertions
 * must compare against a compacted string.
 */
async function pdfTextCompact(buf) {
  return (await pdfText(buf)).replace(/\s+/g, '');
}

/** Raw extraction items of ALL pages (for run-structure assertions). */
async function pdfItemsAll(buf) {
  return withPdf(buf, async (pdf) => {
    const out = [];
    for (let i = 1; i <= pdf.numPages; i += 1) {
      const page = await pdf.getPage(i);
      const content = await page.getTextContent();
      for (const item of content.items) {
        if (item.str && item.str.trim() !== '') out.push(item.str);
      }
    }
    return out;
  });
}

/** Fixture with pending text + create + delete events (heading 'Section alpha'). */
function docWithPendingMarkup() {
  const { doc, headingId, paraId, para2Id } = buildBase();
  // Text event on the heading: a whole-string replacement with NO shared
  // prefix/suffix, so the markup PDF carries the original as ONE struck
  // text run and the replacement as ONE inserted run (robust to pdfjs
  // splitting each styled <Text> into its own extraction item).
  const t1 = capture(
    doc,
    must(updateHeadingContent(doc, headingId, { text: 'Zulu' }, opts()), 'h').doc,
    { kind: 'block-content', blockId: headingId },
  ).doc;
  // A created block.
  const ins = must(insertBlock(t1, 'callout', { kind: 'end' }, opts()), 'insert');
  const t2 = capture(t1, ins.doc, { kind: 'block-create', blockId: ins.blockId }).doc;
  // A deleted block (para2 with distinct text).
  const t3base = capture(
    t2,
    must(
      updateParagraphContent(t2, para2Id, { spans: plainTextToSpans('Ghost paragraph text') }, opts()),
      'p2',
    ).doc,
    { kind: 'block-content', blockId: para2Id },
  ).doc;
  const del = must(deleteBlock(t3base, para2Id, opts()), 'delete');
  const final = capture(t3base, del.doc, { kind: 'block-delete', blockId: para2Id }).doc;
  return { doc: final, headingId, paraId };
}

await testAsync('7.1 documents WITHOUT pending events are byte-identical in both modes', async () => {
  const { doc } = buildBase();
  const clean = await renderDocPdfBytes(doc, { changeView: 'clean' });
  const markup = await renderDocPdfBytes(doc, { changeView: 'markup' });
  assert.equal(Buffer.compare(Buffer.from(clean), Buffer.from(markup)), 0,
    'markup rendering adds NOTHING when nothing is pending');
});

await testAsync('7.2 an ACCEPTED-only log adds no decoration (context is null)', async () => {
  const { doc, headingId } = buildBase();
  const tracked = capture(
    doc,
    must(updateHeadingContent(doc, headingId, { text: 'Section beta' }, opts()), 'edit').doc,
    { kind: 'block-content', blockId: headingId },
  ).doc;
  const accepted = acceptAllChanges(tracked, { now: T1 }).doc;
  const clean = await renderDocPdfBytes(accepted, { changeView: 'clean' });
  const markup = await renderDocPdfBytes(accepted, { changeView: 'markup' });
  assert.equal(Buffer.compare(Buffer.from(clean), Buffer.from(markup)), 0,
    'resolved events never decorate the output');
});

await testAsync('7.3 markup PDF carries struck originals; clean PDF never does', async () => {
  const { doc } = docWithPendingMarkup();
  const cleanBuf = await renderDocPdfBytes(doc, { changeView: 'clean' });
  const markupBuf = await renderDocPdfBytes(doc, { changeView: 'markup' });
  assert.notEqual(Buffer.compare(Buffer.from(cleanBuf), Buffer.from(markupBuf)), 0,
    'pending events change the rendered bytes');

  const cleanText = await pdfText(cleanBuf);
  const markupText = await pdfText(markupBuf);
  // pdfjs splits bracketed cue runs into separate items (`[` / `Inserted]`),
  // so cue presence is checked against the whitespace-free text.
  const cleanCue = await pdfTextCompact(cleanBuf);
  const markupCue = await pdfTextCompact(markupBuf);

  // Clean: only the current content.
  assert.ok(cleanText.includes('Zulu'), 'clean shows the current heading text');
  assert.ok(!cleanText.includes('Section alpha'), 'clean never shows the struck original');
  assert.ok(!cleanCue.includes('[Inserted]'), 'clean has no cue lines');
  assert.ok(!cleanCue.includes('[Deleted—Paragraph]'), 'clean has no deletion cues');
  assert.ok(!cleanText.includes('Ghost paragraph text'), 'clean has no deleted-block ghosts');

  // Markup: struck original + inserted replacement + cue text + ghost.
  assert.ok(markupText.includes('Section alpha'), 'markup shows the struck original fragment');
  assert.ok(markupText.includes('Zulu'), 'markup shows the replacement');
  assert.ok(markupCue.includes('[Inserted]'), 'markup cues the created block textually');
  assert.ok(markupCue.includes('[Deleted'), 'markup cues the ghost deletion textually');
  assert.ok(markupText.includes('Ghost paragraph text'), 'markup ghost-renders the deleted block');
});

await testAsync('7.4 the struck original is a SEPARATE styled text run in markup', async () => {
  const { doc } = docWithPendingMarkup();
  const markupBuf = await renderDocPdfBytes(doc, { changeView: 'markup' });
  const cleanBuf = await renderDocPdfBytes(doc, { changeView: 'clean' });
  // Both must be valid PDFs; the markup one carries the deleted fragment as
  // its OWN extraction item — the structural signature of a separate (struck)
  // text run rather than part of the current-content run.  Content may land
  // on any page (the document opens with a metadata page), so ALL pages are
  // scanned.
  const markupItems = await pdfItemsAll(markupBuf);
  assert.ok(
    markupItems.includes('Section alpha'),
    'the deleted fragment is emitted as one struck run (got: ' +
      JSON.stringify(markupItems) +
      ')',
  );
  const cleanItems = await pdfItemsAll(cleanBuf);
  assert.ok(!cleanItems.includes('Section alpha'), 'clean emits no such run at all');
  assert.ok(cleanItems.includes('Zulu'), 'clean emits the current text as one run');
  assert.ok(!cleanItems.includes('Ghost paragraph text'), 'clean drops the deleted block entirely');
  assert.ok(markupItems.includes('Ghost paragraph text'), 'markup keeps the ghost run');
});

// ═════════════════════════════════════════════════════════════════════════════
group('8. DOM: TrackChangesPanel + EditorPanel under a real jsdom');
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
  'Element', 'Node', 'Event', 'MouseEvent', 'FocusEvent', 'Storage',
  'getComputedStyle', 'requestAnimationFrame', 'cancelAnimationFrame',
]) {
  if (dom.window[key] !== undefined) defineGlobal(key, dom.window[key]);
}
defineGlobal('localStorage', dom.window.localStorage);
defineGlobal('IS_REACT_ACT_ENVIRONMENT', true);

const React = require('react');
const { act } = React;
const { createRoot } = require('react-dom/client');
const { TrackChangesPanel } = pick(
  path.join(CACHE, 'components', 'left-panel', 'TrackChangesPanel.js'),
  path.join(CACHE, 'src', 'components', 'left-panel', 'TrackChangesPanel.js'),
);
const { EditorPanel } = pick(
  path.join(CACHE, 'components', 'editor-panel', 'EditorPanel.js'),
  path.join(CACHE, 'src', 'components', 'editor-panel', 'EditorPanel.js'),
);

let mounted = null;

async function mount(element) {
  const container = dom.window.document.createElement('div');
  dom.window.document.body.appendChild(container);
  const root = createRoot(container);
  await act(async () => {
    root.render(element);
  });
  mounted = {
    container,
    root,
    async rerender(el) {
      await act(async () => {
        root.render(el);
      });
    },
    async unmount() {
      await act(async () => {
        root.unmount();
      });
      container.remove();
      mounted = null;
    },
  };
  return mounted;
}

const q = (sel) => mounted.container.querySelector(sel);
const qa = (sel) => [...mounted.container.querySelectorAll(sel)];
const byText = (sel, text) => qa(sel).find((el) => el.textContent.includes(text));
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

// ── 8A. TrackChangesPanel review surface ────────────────────────────────────

await testAsync('8.1 the panel lists pending and resolved sections with statuses', async () => {
  const base = docWithFullLog(); // 1 accepted + 1 rejected
  const edited = must(
    updateHeadingContent(base, base.blocks[0].id, { text: 'Panel edit' }, opts()),
    'edit',
  ).doc;
  const withPending = capture(base, edited, {
    kind: 'block-content',
    blockId: base.blocks[0].id,
  }).doc;

  await mount(
    React.createElement(TrackChangesPanel, {
      trackChangesEnabled: withPending.trackChangesEnabled,
      onTrackChangesToggle: () => {},
      changeEvents: documentChangeEvents(withPending),
      blocks: withPending.blocks,
      onAccept: () => {},
      onReject: () => {},
      onAcceptAll: () => {},
      onRejectAll: () => {},
      viewMode: 'markup',
      onViewModeChange: () => {},
      editorLabel: '',
      onEditorLabelChange: () => {},
    }),
  );

  assert.ok(q('[aria-label="Track Changes controls"]'), 'panel root renders');
  assert.ok(byText('.tc-section-title', 'Pending changes (1)'));
  assert.ok(byText('.tc-section-title', 'Resolved changes (2)'));
  const pending = qa('.tc-event[data-event-status="pending"]');
  assert.equal(pending.length, 1);
  assert.ok(byText('.tc-event-title', 'Text change'));
  assert.ok(byText('.tc-event-target', 'Heading — text'));
  // Bulk buttons present and enabled with pending work.
  const acceptAll = byText('button', 'Accept all');
  assert.ok(acceptAll);
  assert.equal(acceptAll.disabled, false);
  await mounted.unmount();
});

await testAsync('8.2 Accept/Reject buttons dispatch the event id', async () => {
  const { doc, eventId } = docWithTextEvent(); // one pending event
  const calls = { accept: [], reject: [] };
  await mount(
    React.createElement(TrackChangesPanel, {
      trackChangesEnabled: true,
      onTrackChangesToggle: () => {},
      changeEvents: documentChangeEvents(doc),
      blocks: doc.blocks,
      onAccept: (id) => calls.accept.push(id),
      onReject: (id) => calls.reject.push(id),
      onAcceptAll: () => calls.accept.push('ALL'),
      onRejectAll: () => calls.reject.push('ALL'),
      viewMode: 'markup',
      onViewModeChange: () => {},
      editorLabel: '',
      onEditorLabelChange: () => {},
    }),
  );
  // Scoped to the pending event card: the bulk row uses the same classes.
  const acceptBtn = q('.tc-event[data-event-status="pending"] .tc-action-btn--accept');
  const rejectBtn = q('.tc-event[data-event-status="pending"] .tc-action-btn--reject');
  assert.ok(acceptBtn && rejectBtn, 'the pending event renders both review actions');
  await click(acceptBtn);
  await click(rejectBtn);
  assert.deepEqual(calls.accept, [eventId], 'Accept dispatches exactly this event id');
  assert.deepEqual(calls.reject, [eventId], 'Reject dispatches exactly this event id');
  await mounted.unmount();
});

await testAsync('8.3 the toggle fires with the requested state', async () => {
  const doc = docWithFullLog();
  const toggles = [];
  await mount(
    React.createElement(TrackChangesPanel, {
      trackChangesEnabled: true,
      onTrackChangesToggle: (enabled) => toggles.push(enabled),
      changeEvents: documentChangeEvents(doc),
      blocks: doc.blocks,
      onAccept: () => {},
      onReject: () => {},
      onAcceptAll: () => {},
      onRejectAll: () => {},
      viewMode: 'markup',
      onViewModeChange: () => {},
      editorLabel: '',
      onEditorLabelChange: () => {},
    }),
  );
  const toggle = q('#ds-track-toggle');
  assert.equal(toggle.checked, true);
  await click(toggle);
  assert.deepEqual(toggles, [false], 'disabling tracking never touches the event list');
  await mounted.unmount();
});

await testAsync('8.4 view-mode radios dispatch markup/clean', async () => {
  const doc = docWithFullLog();
  const modes = [];
  await mount(
    React.createElement(TrackChangesPanel, {
      trackChangesEnabled: true,
      onTrackChangesToggle: () => {},
      changeEvents: documentChangeEvents(doc),
      blocks: doc.blocks,
      onAccept: () => {},
      onReject: () => {},
      onAcceptAll: () => {},
      onRejectAll: () => {},
      viewMode: 'markup',
      onViewModeChange: (mode) => modes.push(mode),
      editorLabel: '',
      onEditorLabelChange: () => {},
    }),
  );
  const cleanRadio = qa('input[type="radio"]').find((r) => r.value === 'clean');
  await click(cleanRadio);
  assert.deepEqual(modes, ['clean']);
  await mounted.unmount();
});

await testAsync('8.5 the editor-label input persists to localStorage', async () => {
  const doc = docWithFullLog();
  const labels = [];
  // Mirrors App.tsx `handleEditorLabelChange`: state keeps the controlled
  // input in sync while the service persists the session preference.
  const Harness = () => {
    const [label, setLabel] = React.useState(() => loadEditorLabel());
    return React.createElement(TrackChangesPanel, {
      trackChangesEnabled: true,
      onTrackChangesToggle: () => {},
      changeEvents: documentChangeEvents(doc),
      blocks: doc.blocks,
      onAccept: () => {},
      onReject: () => {},
      onAcceptAll: () => {},
      onRejectAll: () => {},
      viewMode: 'markup',
      onViewModeChange: () => {},
      editorLabel: label,
      onEditorLabelChange: (next) => {
        labels.push(next);
        setLabel(next);
        writeEditorLabel(next); // App handler: session preference via service
      },
    });
  };
  await mount(React.createElement(Harness));
  const input = q('#ds-track-editor-label');
  await typeInto(input, '  Ikram  ');
  assert.deepEqual(labels, ['  Ikram  ']);
  assert.equal(loadEditorLabel(), 'Ikram', 'store trims and persists');
  assert.equal(dom.window.localStorage.getItem(EDITOR_LABEL_STORAGE_KEY), 'Ikram');
  await typeInto(input, '');
  assert.deepEqual(labels, ['  Ikram  ', ''], 'the blank edit is reported too');
  assert.equal(loadEditorLabel(), '', 'blank removes the stored label');
  assert.equal(dom.window.localStorage.getItem(EDITOR_LABEL_STORAGE_KEY), null,
    'the storage key is removed, not blanked');
  await mounted.unmount();
});

// ── 8B. EditorPanel markup view ─────────────────────────────────────────────

/** Minimal neutral props for the editor panel (handlers are spies). */
const neutralResult = { ok: false, changed: false, code: 'unused', message: 'not exercised' };
function editorProps(doc, extra = {}) {
  return {
    blocks: doc.blocks,
    selectedBlockId: null,
    onSelectBlock: () => {},
    onInsertBlock: () => neutralResult,
    onDuplicateBlock: () => neutralResult,
    onMoveBlock: () => neutralResult,
    onDeleteBlock: () => {},
    onSpacingChange: () => neutralResult,
    onHeadingContentChange: () => neutralResult,
    onParagraphContentChange: () => neutralResult,
    onListContentAction: () => neutralResult,
    onCalloutContentChange: () => neutralResult,
    onTableContentAction: () => neutralResult,
    onStructuralAction: () => neutralResult,
    onFormulaAction: () => neutralResult,
    onImageSignatureAction: () => neutralResult,
    onLabAction: () => neutralResult,
    onPickImage: async () => ({ ok: false, message: 'not exercised' }),
    onRequestConfirm: () => {},
    changeEvents: documentChangeEvents(doc),
    changeView: 'markup',
    ...extra,
  };
}

await testAsync('8.6 markup view renders cue badges, inline strip and ghost cards', async () => {
  const { doc } = docWithPendingMarkup();
  await mount(React.createElement(EditorPanel, editorProps(doc)));

  // Cue badges (textual, data-attributed).
  const badges = qa('.tc-badge').map((el) => el.textContent.trim());
  assert.ok(badges.includes('Inserted'), `badges include Inserted (got: ${badges.join(', ')})`);

  // Inline text strip: struck original -> inserted replacement.
  const strip = q('.tc-block-strip');
  assert.ok(strip, 'the pending text event renders an inline strip');
  assert.equal(q('.tc-strip-del').textContent.trim(), 'Section alpha');
  assert.equal(q('.tc-strip-ins').textContent.trim(), 'Zulu');

  // Ghost card for the deleted paragraph.
  const ghost = q('.block-card--ghost');
  assert.ok(ghost, 'the deleted block ghost-renders in markup view');
  assert.ok(ghost.textContent.includes('Ghost paragraph text'));
  assert.ok(ghost.textContent.includes('Deleted'));

  await mounted.unmount();
});

await testAsync('8.7 clean view renders NONE of the markup (inert by construction)', async () => {
  const { doc } = docWithPendingMarkup();
  await mount(React.createElement(EditorPanel, editorProps(doc, { changeView: 'clean' })));

  assert.equal(q('.tc-block-strip'), null, 'no inline strip in clean view');
  assert.equal(q('.tc-badge'), null, 'no cue badges in clean view');
  assert.equal(q('.block-card--ghost'), null, 'no ghost cards in clean view');
  // Content itself is present.
  assert.ok(mounted.container.textContent.includes('Zulu'));

  await mounted.unmount();
});

await testAsync('8.8 markup view with NO pending events renders no markup', async () => {
  const { doc } = buildBase();
  await mount(React.createElement(EditorPanel, editorProps(doc)));
  assert.equal(q('.tc-block-strip'), null);
  assert.equal(q('.tc-badge'), null);
  assert.equal(q('.block-card--ghost'), null);
  await mounted.unmount();
});

await testAsync('8.9 typing into a tracked field captures an event end to end', async () => {
  const { doc, headingId } = buildBase();
  let state = doc;
  const Harness = () => {
    const [docState, setDocState] = React.useState(doc);
    React.useEffect(() => {
      state = docState;
    });
    return React.createElement(EditorPanel, {
      ...editorProps(docState, {
        selectedBlockId: headingId,
        // Mirrors the App seam: service edit -> commitTrackedChange.
        onHeadingContentChange: (blockId, patch) => {
          const result = updateHeadingContent(state, blockId, patch, opts());
          if (result.ok && result.changed) {
            const outcome = commitTrackedChange(state, result.doc, {
              kind: 'block-content',
              blockId,
            });
            setDocState(outcome.doc);
          }
          return result;
        },
      }),
    });
  };
  await mount(React.createElement(Harness));

  const input = q(`#ds-heading-text-${headingId}`);
  assert.ok(input, 'the heading text editor renders for the selected block');
  await typeInto(input, 'Section alpha edited');

  assert.equal(state.changeEvents.length, 1, 'one pending event captured');
  assert.equal(state.changeEvents[0].type, 'text');
  assert.equal(state.changeEvents[0].payload.original, 'Section alpha');
  assert.equal(state.changeEvents[0].payload.replacement, 'Section alpha edited');
  // The markup strip reflects the captured event immediately.
  assert.equal(q('.tc-strip-del').textContent.trim(), 'Section alpha');
  assert.equal(q('.tc-strip-ins').textContent.trim(), 'Section alpha edited');

  await mounted.unmount();
});

// ── 8C. PDF-view radiogroup (P07-M2-R1: the real control, now testable) ────

await testAsync('8.10 the PDF-view radiogroup switches Markup/Clean via onChange', async () => {
  const seen = [];
  const Harness = () => {
    const [view, setView] = React.useState('markup');
    return React.createElement(ChangeViewSelector, {
      value: view,
      onChange: (next) => {
        seen.push(`click:${next}`);
        setView(next);
      },
    });
  };
  await mount(React.createElement(Harness));

  const groupEl = q('[role="radiogroup"]');
  assert.ok(groupEl, 'the selector renders as an accessible radiogroup');
  assert.ok(
    groupEl.getAttribute('aria-label').includes('PDF'),
    'the group is labelled for the rendered/exported PDF',
  );
  const radios = qa('input[type="radio"]');
  assert.equal(radios.length, 2);
  assert.equal(radios[0].value, 'markup');
  assert.equal(radios[1].value, 'clean');
  assert.equal(radios[0].checked, true, 'markup is the default selection');

  // Real interaction: click Clean -> the controlled value follows.
  await click(radios[1]);
  assert.ok(seen.includes('click:clean'), 'onChange fired with "clean"');
  assert.equal(qa('input[type="radio"]')[1].checked, true, 'clean is now selected');
  assert.equal(qa('input[type="radio"]')[0].checked, false);

  // And back to Markup.
  await click(qa('input[type="radio"]')[0]);
  assert.ok(seen.includes('click:markup'), 'onChange fired with "markup"');
  assert.equal(qa('input[type="radio"]')[0].checked, true);

  await mounted.unmount();
});

// ═════════════════════════════════════════════════════════════════════════════
group('9. P07-M2-R1: content-family capture (stable-id locators)');
// ═════════════════════════════════════════════════════════════════════════════

test('9.1 table: cell text, cell alignment, caption and settings carry stable-id locators', () => {
  const { doc, blockId } = baseWithBlock('table');
  const data = blockData(doc, blockId);
  const bodyRow = data.rows[data.rows.length - 1];
  const [cellA] = bodyRow.cells;

  let d = edit(doc, blockId, setTableCellText(doc, blockId, cellA.id, 'Sample cell', opts()), 'cell text');
  d = edit(d, blockId, setTableCellAlignment(d, blockId, cellA.id, 'right', opts()), 'cell align');
  d = edit(d, blockId, updateTableSettings(d, blockId, { caption: 'Table caption' }, opts()), 'caption');
  d = edit(d, blockId, updateTableSettings(d, blockId, { headerStyle: 'heavy' }, opts()), 'style');

  assert.equal(pendingEvents(d).length, 4);

  const cellEvent = pendingOn(d, `rows[${bodyRow.id}].cells[${cellA.id}].text`);
  assert.equal(cellEvent.type, 'text');
  assert.equal(cellEvent.target.blockId, blockId);
  assert.equal(cellEvent.payload.original, '');
  assert.equal(cellEvent.payload.replacement, 'Sample cell');

  const alignEvent = pendingOn(d, `rows[${bodyRow.id}].cells[${cellA.id}].hAlign`);
  assert.equal(alignEvent.type, 'formatting');
  assert.equal(alignEvent.payload.kind, 'property');
  assert.equal(alignEvent.payload.replacement, 'right');

  assert.equal(pendingOn(d, 'caption').payload.replacement, 'Table caption');
  const styleEvent = pendingOn(d, 'headerStyle');
  assert.equal(styleEvent.type, 'formatting');
  assert.equal(styleEvent.payload.replacement, 'heavy');
  // Ownership boundary: cell spans styling (colSpan/rowSpan/isHeader) is NOT
  // a text change - only TEXT content and alignment are captured here.
  assert.ok(pendingEvents(d).every((e) => !/\.(colSpan|rowSpan|isHeader)$/.test(e.target.field)));
});

test('9.2 table: one cell fires alone; reorder fires nothing; row removal marks deletions', () => {
  const { doc, blockId } = baseWithBlock('table');
  const rows = blockData(doc, blockId).rows;
  const bodyRow = rows[rows.length - 1];
  const [cellA, cellB] = bodyRow.cells;

  // One-of-many: editing ONE of two cells produces exactly its own event.
  const d1 = edit(doc, blockId, setTableCellText(doc, blockId, cellA.id, 'Alpha', opts()), 'cell A');
  assert.equal(pendingEvents(d1).length, 1);
  pendingOn(d1, `rows[${bodyRow.id}].cells[${cellA.id}].text`);
  assert.equal(
    pendingEvents(d1).some((e) => e.target.field.includes(cellB.id)),
    false,
    'the untouched sibling cell records nothing',
  );

  // A pure reorder (an immutable rows reversal - what a move action does):
  // same ids, same text -> NO events (reorders never fabricate text events).
  const moved = {
    ...d1,
    blocks: d1.blocks.map((b) =>
      b.id === blockId ? { ...b, data: { ...b.data, rows: [...b.data.rows].reverse() } } : b,
    ),
  };
  const d2 = capture(d1, moved, { kind: 'block-content', blockId }).doc;
  assert.equal(pendingEvents(d2).length, 1, 'a pure row reorder captures nothing');

  // A new EMPTY row is silent ...
  const d3 = edit(d2, blockId, addTableRow(d2, blockId, { kind: 'end' }, opts()), 'add row');
  assert.equal(pendingEvents(d3).length, 1, 'an empty added row seeds no text');
  const grownRows = blockData(d3, blockId).rows;
  const newRow = grownRows[grownRows.length - 1];
  const newCell = newRow.cells[0];

  // ... until it holds text; removing that row records per-cell deletions.
  const d4 = edit(d3, blockId, setTableCellText(d3, blockId, newCell.id, 'Doomed', opts()), 'doom');
  const settled = acceptAllChanges(d4, { now: T1 }).doc;
  const removed = capture(
    settled,
    must(removeTableRow(settled, blockId, newRow.id, opts()), 'remove row').doc,
    { kind: 'block-content', blockId },
  ).doc;
  const deletion = pendingOn(removed, `rows[${newRow.id}].cells[${newCell.id}].text`);
  assert.equal(deletion.payload.original, 'Doomed');
  assert.equal(deletion.payload.replacement, '', 'row removal surfaces as text deletion events');
  assert.equal(pendingEvents(removed).length, 1);
});

test('9.3 table: an empty column add is silent; column removal marks its cells', () => {
  const { doc, blockId } = baseWithBlock('table');
  const grown = edit(doc, blockId, addTableColumn(doc, blockId, { kind: 'end' }, opts()), 'add col');
  assert.equal(pendingEvents(grown).length, 0, 'an empty column seeds no text');

  // Seed the new HEADER cell (the only non-empty cell of that column).
  const headerRow = blockData(grown, blockId).rows[0];
  const newHeaderCell = headerRow.cells[headerRow.cells.length - 1];
  const withText = edit(
    grown,
    blockId,
    setTableCellText(grown, blockId, newHeaderCell.id, 'Extra', opts()),
    'header cell',
  );
  const settled = acceptAllChanges(withText, { now: T1 }).doc;
  const colIndex = blockData(settled, blockId).rows[0].cells.length - 1;
  const removed = capture(
    settled,
    must(removeTableColumn(settled, blockId, colIndex, opts()), 'remove col').doc,
    { kind: 'block-content', blockId },
  ).doc;
  const deletion = pendingOn(removed, `rows[${headerRow.id}].cells[${newHeaderCell.id}].text`);
  assert.equal(deletion.payload.original, 'Extra');
  assert.equal(deletion.payload.replacement, '');
  assert.equal(pendingEvents(removed).length, 1, 'empty removed cells record nothing');
});

test('9.4 list: item text, settings, checked toggle and removal; reorder is silent', () => {
  const { doc, blockId } = baseWithBlock('list');
  const items0 = blockData(doc, blockId).items;
  assert.equal(items0.length, 1);

  // Item text through the real editor service.
  const d1 = edit(
    doc,
    blockId,
    updateListItemText(doc, blockId, items0[0].id, plainTextToSpans('First item'), opts()),
    'item text',
  );
  assert.equal(pendingOn(d1, `items[${items0[0].id}].text`).payload.replacement, 'First item');

  // A newly ADDED empty item seeds no events.
  const d2 = edit(d1, blockId, addListItem(d1, blockId, null, opts()), 'add item');
  const items1 = blockData(d2, blockId).items;
  assert.equal(items1.length, 2);
  assert.equal(pendingEvents(d2).length, 1, 'an empty added item seeds no text');

  // A pure reorder via the real move action captures nothing.
  const moved = must(moveListItem(d2, blockId, items1[1].id, 'up', opts()), 'move').doc;
  const d3 = capture(d2, moved, { kind: 'block-content', blockId }).doc;
  assert.equal(pendingEvents(d3).length, 1, 'a pure item reorder captures nothing');

  // Switching to a checklist tracks the listType; the seeded per-item
  // `checked: false` is a structural seed, NOT a tracked text change.
  const d4 = edit(d3, blockId, updateListSettings(d3, blockId, { listType: 'checklist' }, opts()), 'checklist');
  assert.equal(pendingOn(d4, 'listType').payload.replacement, 'checklist');
  assert.equal(pendingEvents(d4).length, 2, 'checklist seeding contributes no per-item events');

  // A real checkbox toggle on the checklist IS tracked.
  const settled = acceptAllChanges(d4, { now: T1 }).doc;
  const d5 = edit(settled, blockId, setItemChecked(settled, blockId, items0[0].id, true, opts()), 'tick');
  assert.equal(pendingOn(d5, `items[${items0[0].id}].checked`).payload.replacement, true);

  // Removing that item records its text as deleted (settling first so the
  // log keeps exactly one event per concern).
  const settled2 = acceptAllChanges(d5, { now: T1 }).doc;
  const gone = capture(
    settled2,
    must(removeListItem(settled2, blockId, items0[0].id, opts()), 'remove item').doc,
    { kind: 'block-content', blockId },
  ).doc;
  const deletion = pendingOn(gone, `items[${items0[0].id}].text`);
  assert.equal(deletion.payload.original, 'First item');
  assert.equal(deletion.payload.replacement, '');
  assert.equal(pendingEvents(gone).length, 1);
});

test('9.5 callout: title, body text and variant; styling-only body; tracking off stays silent', () => {
  const { doc, blockId } = baseWithBlock('callout');
  let d = edit(doc, blockId, updateCalloutContent(doc, blockId, { title: 'Heads up' }, opts()), 'title');
  d = edit(d, blockId, updateCalloutContent(d, blockId, { spans: plainTextToSpans('Body updated') }, opts()), 'body');
  d = edit(d, blockId, updateCalloutContent(d, blockId, { variant: 'warning' }, opts()), 'variant');

  assert.equal(pendingOn(d, 'title').payload.replacement, 'Heads up');
  assert.equal(pendingOn(d, 'text').payload.replacement, 'Body updated');
  const variantEvent = pendingOn(d, 'variant');
  assert.equal(variantEvent.type, 'formatting');
  assert.equal(variantEvent.payload.replacement, 'warning');
  assert.equal(pendingEvents(d).length, 3);

  // Styling-only body change (identical plain text): a spans event, not text.
  const styled = must(
    updateCalloutContent(d, blockId, { spans: [{ text: 'Body updated', bold: true }] }, opts()),
    'style',
  ).doc;
  const d2 = capture(d, styled, { kind: 'block-content', blockId }).doc;
  const spansEvent = pendingOn(d2, 'spans');
  assert.equal(spansEvent.type, 'formatting');
  assert.equal(spansEvent.payload.kind, 'spans');
  assert.equal(spansEvent.payload.replacement[0].bold, true);

  // Tracking OFF: the edit stands but nothing is recorded; the log survives.
  const off = { ...d2, trackChangesEnabled: false };
  const edited = must(updateCalloutContent(off, blockId, { title: 'Silent' }, opts()), 'off edit').doc;
  const d3 = capture(off, edited, { kind: 'block-content', blockId }).doc;
  assert.equal(blockData(d3, blockId).title, 'Silent', 'the content edit itself stands');
  assert.equal(pendingEvents(d3).length, 4, 'tracking-off adds no events');
  assert.equal(documentChangeEvents(d3).length, documentChangeEvents(d2).length, 'log untouched');
});

test('9.6 formula: latex, number, alignment and variable definitions (no auto-calculation)', () => {
  // Fixture: one variable definition as if added in an earlier session.
  const { doc: raw, blockId } = baseWithBlock('formula');
  const seeded = {
    ...raw,
    blocks: raw.blocks.map((b) =>
      b.id === blockId
        ? { ...b, data: { ...b.data, variableDefinitions: [{ id: nextId(), symbol: 'm', definition: 'mass' }] } }
        : b,
    ),
  };
  const entryId = blockData(seeded, blockId).variableDefinitions[0].id;

  let d = edit(seeded, blockId, updateFormulaContent(seeded, blockId, { action: 'update-formula', latex: 'E = mc^2 + kT' }, opts()), 'latex');
  d = edit(d, blockId, updateFormulaContent(d, blockId, { action: 'update-formula', formulaNumber: '(1)' }, opts()), 'number');
  d = edit(d, blockId, updateFormulaContent(d, blockId, { action: 'update-formula', hAlign: 'left' }, opts()), 'align');
  d = edit(d, blockId, updateVariableDefinition(d, blockId, entryId, { unit: 'kg' }, opts()), 'unit');

  assert.equal(pendingOn(d, 'latex').payload.replacement, 'E = mc^2 + kT');
  assert.equal(pendingOn(d, 'formulaNumber').payload.replacement, '(1)');
  assert.equal(pendingOn(d, 'hAlign').payload.replacement, 'left');
  assert.equal(pendingOn(d, `variableDefinitions[${entryId}].unit`).payload.replacement, 'kg');
  assert.equal(pendingEvents(d).length, 4);
  // No calculation runs anywhere: only authored text/properties are tracked.
  assert.ok(pendingEvents(d).every((e) => e.type === 'text' || e.type === 'formatting'));
});

test('9.7 image: caption text and deterministic asset-reference swaps are captured', () => {
  const { doc: raw, blockId } = baseWithBlock('image');
  const assetA = makeAsset(nextId(), 'original.png');
  const assetB = makeAsset(nextId(), 'replacement.png');
  const doc = { ...raw, assets: { ...raw.assets, [assetA.id]: assetA, [assetB.id]: assetB } };
  const imageId = blockData(doc, blockId).images[0].id;

  // Attach A (records the initial reference), settle, then swap to B.
  const withA = edit(doc, blockId, attachImageAsset(doc, blockId, imageId, assetA, opts()), 'attach A');
  const settled = acceptAllChanges(withA, { now: T1 }).doc;
  const swapped = edit(settled, blockId, attachImageAsset(settled, blockId, imageId, assetB, opts()), 'swap B');
  const swapEvent = pendingOn(swapped, `images[${imageId}].assetId`);
  assert.equal(swapEvent.type, 'text');
  assert.equal(swapEvent.payload.original, assetA.id, 'original is the previous asset record id');
  assert.equal(swapEvent.payload.replacement, assetB.id, 'replacement is the new asset record id');

  // Caption text.
  const captioned = edit(swapped, blockId, setImageCaption(swapped, blockId, imageId, 'Figure 1 - trace', opts()), 'caption');
  assert.equal(pendingOn(captioned, `images[${imageId}].caption`).payload.replacement, 'Figure 1 - trace');
  assert.equal(pendingEvents(captioned).length, 2);

  // Owner-boundary pins: size/crop/layout stay OUT of text capture.
  assert.ok(
    pendingEvents(captioned).every((e) => !/(widthFraction|hAlign|crop|layout|captionPlacement)/.test(e.target.field)),
    'image size/crop/layout remain in the open owner-decision bucket',
  );
});

test('9.8 signature: signer field edits, add-seed insertion, removal deletions', () => {
  const { doc, blockId } = baseWithBlock('signature');
  const signer0 = blockData(doc, blockId).signers[0];

  // Edit an existing field.
  const d1 = edit(doc, blockId, setSignerField(doc, blockId, signer0.id, 'role', 'Reviewed by', opts()), 'role');
  assert.equal(pendingOn(d1, `signers[${signer0.id}].role`).payload.replacement, 'Reviewed by');

  // Add a second signer (1 -> 2, within the 1-3 rule): only the seeded
  // designation is non-empty -> ONE insertion event; empty fields stay silent.
  const grown = edit(d1, blockId, addSigner(d1, blockId, opts()), 'add signer');
  const signers = blockData(grown, blockId).signers;
  assert.equal(signers.length, 2, 'the 1-3 signer rule is respected');
  const signer1 = signers[1];
  const seed = pendingOn(grown, `signers[${signer1.id}].designation`);
  assert.equal(seed.payload.original, '');
  assert.equal(seed.payload.replacement, SIGNER_SEED_DESIGNATION);
  assert.equal(pendingEvents(grown).length, 2, 'only the seeded designation fires on add');

  // Removal (2 -> 1, still >= 1): the removed signer's text becomes deletions.
  const settled = acceptAllChanges(grown, { now: T1 }).doc;
  const gone = capture(
    settled,
    must(removeSigner(settled, blockId, signer1.id, opts()), 'remove signer').doc,
    { kind: 'block-content', blockId },
  ).doc;
  const deletion = pendingOn(gone, `signers[${signer1.id}].designation`);
  assert.equal(deletion.payload.original, SIGNER_SEED_DESIGNATION);
  assert.equal(deletion.payload.replacement, '');
  assert.equal(pendingEvents(gone).length, 1, 'empty removed fields record nothing');
  // Owner-boundary pin: signer ROW alignment is layout, not text.
  assert.ok(pendingEvents(gone).every((e) => !e.target.field.includes('hAlign')));
});

test('9.9 structural: section, revision, reference, exhibit text; no-text blocks stay silent', () => {
  // Section break title.
  const s = baseWithBlock('section-break');
  const ds = edit(s.doc, s.blockId, updateSectionBreakContent(s.doc, s.blockId, { title: 'Part I' }, opts()), 'section title');
  assert.equal(pendingOn(ds, 'title').payload.replacement, 'Part I');

  // Revision entry fields (stable-id child locator).
  const r = baseWithBlock('revision-history');
  const entryId = blockData(r.doc, r.blockId).entries[0].id;
  let dr = edit(r.doc, r.blockId, updateRevisionEntry(r.doc, r.blockId, entryId, { description: 'Initial issue' }, opts()), 'desc');
  dr = edit(dr, r.blockId, updateRevisionEntry(dr, r.blockId, entryId, { author: 'I. Wahid' }, opts()), 'author');
  assert.equal(pendingOn(dr, `entries[${entryId}].description`).payload.replacement, 'Initial issue');
  assert.equal(pendingOn(dr, `entries[${entryId}].author`).payload.replacement, 'I. Wahid');

  // Reference block title + entry url.
  const ref = baseWithBlock('reference');
  const refEntryId = blockData(ref.doc, ref.blockId).entries[0].id;
  let dref = edit(ref.doc, ref.blockId, updateReferenceTitle(ref.doc, ref.blockId, { title: 'Bibliography' }, opts()), 'ref title');
  dref = edit(dref, ref.blockId, updateReferenceEntry(dref, ref.blockId, refEntryId, { url: 'https://www.iso.org/17025' }, opts()), 'url');
  assert.equal(pendingOn(dref, 'title').payload.replacement, 'Bibliography');
  assert.equal(pendingOn(dref, `entries[${refEntryId}].url`).payload.replacement, 'https://www.iso.org/17025');

  // Exhibit notes (block-level text).
  const x = baseWithBlock('exhibit');
  const dx = edit(x.doc, x.blockId, updateExhibitContent(x.doc, x.blockId, { notes: 'See attachment' }, opts()), 'notes');
  assert.equal(pendingOn(dx, 'notes').payload.replacement, 'See attachment');

  // Page break has NO text: its spacing stays tracked but no text event exists.
  const pgb = baseWithBlock('page-break');
  const dpgb = edit(pgb.doc, pgb.blockId, updateBlockSpacing(pgb.doc, pgb.blockId, 'topPt', 12, opts()), 'spacing');
  assert.equal(
    pendingEvents(dpgb).filter((e) => e.type === 'text').length,
    0,
    'a page break has no text content to capture (page-break no-content is not a gap)',
  );

  // metadata-block.visibleFields and horizontal-line colour are configuration,
  // not text: a direct config change captures NOTHING (owner-decision bucket).
  const mb = baseWithBlock('metadata-block');
  const reconfigured = {
    ...mb.doc,
    blocks: mb.doc.blocks.map((b) =>
      b.id === mb.blockId ? { ...b, data: { ...b.data, visibleFields: ['title'] } } : b,
    ),
  };
  const dmb = capture(mb.doc, reconfigured, { kind: 'block-content', blockId: mb.blockId }).doc;
  assert.equal(pendingEvents(dmb).length, 0, 'visibleFields is not tracked (open owner decision)');

  const hl = baseWithBlock('horizontal-line');
  const recolored = {
    ...hl.doc,
    blocks: hl.doc.blocks.map((b) =>
      b.id === hl.blockId ? { ...b, data: { ...b.data, color: '#ff0000' } } : b,
    ),
  };
  const dhl = capture(hl.doc, recolored, { kind: 'block-content', blockId: hl.blockId }).doc;
  assert.equal(pendingEvents(dhl).length, 0, 'a horizontal line has no text content');
});

test('9.10 procedure-step and equipment-list: field-level lab capture', () => {
  const p = baseWithBlock('procedure-step');
  const stepId = blockData(p.doc, p.blockId).steps[0].id;
  let dp = edit(p.doc, p.blockId, updateProcedureStep(p.doc, p.blockId, stepId, { spans: plainTextToSpans('Weigh the sample.') }, opts()), 'step text');
  dp = edit(dp, p.blockId, updateProcedureStep(dp, p.blockId, stepId, { level: 'warning' }, opts()), 'level');
  dp = edit(dp, p.blockId, updateProcedureTitle(dp, p.blockId, 'Sample preparation', opts()), 'section title');
  assert.equal(pendingOn(dp, `steps[${stepId}].text`).payload.replacement, 'Weigh the sample.');
  assert.equal(pendingOn(dp, `steps[${stepId}].level`).payload.replacement, 'warning');
  assert.equal(pendingOn(dp, 'sectionTitle').payload.replacement, 'Sample preparation');
  assert.equal(pendingEvents(dp).length, 3);

  const e = baseWithBlock('equipment-list');
  const itemId = blockData(e.doc, e.blockId).items[0].id;
  let de = edit(e.doc, e.blockId, updateEquipmentItem(e.doc, e.blockId, itemId, { name: 'Analytical balance' }, opts()), 'name');
  de = edit(de, e.blockId, updateEquipmentItem(de, e.blockId, itemId, { assetTag: 'LAB-0042' }, opts()), 'asset tag');
  de = edit(de, e.blockId, updateEquipmentItem(de, e.blockId, itemId, { mandatory: false }, opts()), 'mandatory');
  assert.equal(pendingOn(de, `items[${itemId}].name`).payload.replacement, 'Analytical balance');
  assert.equal(pendingOn(de, `items[${itemId}].assetTag`).payload.replacement, 'LAB-0042');
  const mandatoryEvent = pendingOn(de, `items[${itemId}].mandatory`);
  assert.equal(mandatoryEvent.type, 'formatting');
  assert.equal(mandatoryEvent.payload.replacement, false, 'default mandatory is true -> false');
  assert.equal(pendingEvents(de).length, 3);
});

test('9.11 observation and measurement: row values, column units, uncertainty note', () => {
  const o = baseWithBlock('observation');
  const obsRowId = blockData(o.doc, o.blockId).rows[0].id;
  let dobs = edit(o.doc, o.blockId, updateObservationRow(o.doc, o.blockId, obsRowId, { observedValue: '25.4' }, opts()), 'value');
  dobs = edit(dobs, o.blockId, updateObservationRow(dobs, o.blockId, obsRowId, { remarks: 'Within tolerance' }, opts()), 'remarks');
  assert.equal(pendingOn(dobs, `rows[${obsRowId}].observedValue`).payload.replacement, '25.4');
  assert.equal(pendingOn(dobs, `rows[${obsRowId}].remarks`).payload.replacement, 'Within tolerance');
  assert.equal(pendingEvents(dobs).length, 2);

  const m = baseWithBlock('measurement');
  const mData = blockData(m.doc, m.blockId);
  const measRowId = mData.rows[0].id;
  const valueColumnId = mData.columns[1].id;
  let dm = edit(m.doc, m.blockId, setMeasurementCell(m.doc, m.blockId, measRowId, valueColumnId, '12.34', opts()), 'cell value');
  dm = edit(dm, m.blockId, updateMeasurementColumn(dm, m.blockId, valueColumnId, { unit: 'mg/L' }, opts()), 'unit');
  dm = edit(dm, m.blockId, setMeasurementUncertaintyNote(dm, m.blockId, 'k = 2', opts()), 'uncertainty');
  assert.equal(pendingOn(dm, `rows[${measRowId}].values[${valueColumnId}]`).payload.replacement, '12.34');
  assert.equal(pendingOn(dm, `columns[${valueColumnId}].unit`).payload.replacement, 'mg/L');
  assert.equal(pendingOn(dm, 'uncertaintyNote').payload.replacement, 'k = 2');
  assert.equal(pendingEvents(dm).length, 3);
});

test('9.12 calculation and acceptance-criteria: steps, conclusion, verdicts', () => {
  const c = baseWithBlock('calculation');
  const calcStepId = blockData(c.doc, c.blockId).steps[0].id;
  let dc = edit(c.doc, c.blockId, updateCalculationStep(c.doc, c.blockId, calcStepId, { result: '42.0' }, opts()), 'result');
  dc = edit(dc, c.blockId, setCalculationConclusion(dc, c.blockId, 'Meets the requirement', opts()), 'conclusion');
  assert.equal(pendingOn(dc, `steps[${calcStepId}].result`).payload.replacement, '42.0');
  assert.equal(pendingOn(dc, 'conclusionText').payload.replacement, 'Meets the requirement');
  assert.equal(pendingEvents(dc).length, 2);

  const a = baseWithBlock('acceptance-criteria');
  const critId = blockData(a.doc, a.blockId).criteria[0].id;
  let da = edit(a.doc, a.blockId, updateAcceptanceCriterion(a.doc, a.blockId, critId, { measuredValue: '0.42 %' }, opts()), 'measured');
  da = edit(da, a.blockId, updateAcceptanceCriterion(da, a.blockId, critId, { result: 'pass' }, opts()), 'verdict');
  da = edit(da, a.blockId, setAcceptanceOverallResult(da, a.blockId, 'pass', opts()), 'overall');
  assert.equal(pendingOn(da, `criteria[${critId}].measuredValue`).payload.replacement, '0.42 %');
  const verdictEvent = pendingOn(da, `criteria[${critId}].result`);
  assert.equal(verdictEvent.type, 'formatting');
  assert.equal(verdictEvent.payload.replacement, 'pass');
  assert.equal(pendingOn(da, 'overallResult').payload.replacement, 'pass');
  assert.equal(pendingEvents(da).length, 3);
});

test('9.13 designer TEXT values are captured; non-text designer config is pinned out', () => {
  const { doc } = buildBase();

  // Front-page synopsis (settings event on a dotted document path).
  const syn = must(updateFrontPage(doc, { field: 'synopsis', value: 'Lab report overview' }, T0), 'synopsis');
  const d1 = capture(doc, syn.doc, { kind: 'settings' }).doc;
  const synEvent = pendingOn(d1, 'frontPage.synopsis');
  assert.equal(synEvent.type, 'settings');
  assert.equal(synEvent.target.kind, 'document');
  assert.equal(synEvent.payload.original, '');
  assert.equal(synEvent.payload.replacement, 'Lab report overview');

  // Watermark text (the path is headerFooter.watermark, NOT doc.watermark).
  const wm = must(applyWatermarkPatch(d1, { field: 'text', value: 'CONFIDENTIAL' }, T0), 'watermark');
  const d2 = capture(d1, wm.doc, { kind: 'settings' }).doc;
  const wmEvent = pendingOn(d2, 'watermark.text');
  assert.equal(wmEvent.payload.original, 'DRAFT', 'reads the actual default watermark text');
  assert.equal(wmEvent.payload.replacement, 'CONFIDENTIAL');

  // Header cell content (per-row/per-cell stable-id document path).
  const row = d2.headerFooter.header.rows[0];
  const cell = row.cells[0];
  const hf = must(
    applyHeaderFooterPatch(d2, 'header', { field: 'cellContent', rowId: row.id, cellId: cell.id, value: 'ACME Lab — {documentId}' }, T0),
    'cell content',
  );
  const d3 = capture(d2, hf.doc, { kind: 'settings' }).doc;
  const cellEvent = pendingOn(d3, `headerFooter.header.rows[${row.id}].cells[${cell.id}].content`);
  assert.equal(cellEvent.type, 'settings');
  assert.equal(cellEvent.payload.original, '{documentId}', 'reads the real cell content');
  assert.equal(cellEvent.payload.replacement, 'ACME Lab — {documentId}');
  assert.equal(pendingEvents(d3).length, 3);

  // Pins: non-text designer configuration contributes no events (the open
  // owner-boundary question, unchanged from the P07-M2 decision).
  const rot = must(applyWatermarkPatch(d3, { field: 'rotationDeg', value: 30 }, T0), 'rotation');
  const d4 = capture(d3, rot.doc, { kind: 'settings' }).doc;
  const en = must(applyWatermarkPatch(d4, { field: 'enabled', value: true }, T0), 'enable');
  const d5 = capture(d4, en.doc, { kind: 'settings' }).doc;
  assert.equal(
    pendingEvents(d5).length,
    3,
    'watermark geometry/flags stay untracked pending the owner decision',
  );
});

test('9.14 no-op family edits and tracking-off edits fabricate nothing', () => {
  const { doc, blockId } = baseWithBlock('table');
  const data = blockData(doc, blockId);
  const headerCell = data.rows[0].cells[0];

  // Re-entering the identical cell text: the service reports NO change and
  // capture sees the same document -> zero events.
  const noop = setTableCellText(doc, blockId, headerCell.id, 'Column 1', opts());
  assert.equal(noop.changed, false, 'an identical value is a service no-op');
  assert.equal(noop.doc, doc, 'the service returns the source document unchanged');
  const d1 = capture(doc, noop.doc, { kind: 'block-content', blockId }).doc;
  assert.equal(pendingEvents(d1).length, 0);

  // Tracking OFF: a real edit stands, nothing is recorded, log preserved.
  const off = { ...doc, trackChangesEnabled: false };
  const edited = must(setTableCellText(off, blockId, headerCell.id, 'Recorded nowhere', opts()), 'off edit').doc;
  const d2 = capture(off, edited, { kind: 'block-content', blockId }).doc;
  assert.equal(pendingEvents(d2).length, 0, 'tracking-off records nothing');
  assert.equal(
    documentChangeEvents(d2).length,
    documentChangeEvents(doc).length,
    'the existing log is untouched',
  );
});

// ═════════════════════════════════════════════════════════════════════════════
group('10. P07-M2-R1: accept/reject reversals per family (honest boundaries)');
// ═════════════════════════════════════════════════════════════════════════════

test('10.1 table cell text: reject restores; out-of-order rejection is honestly stale', () => {
  const { doc, blockId } = baseWithBlock('table');
  const bodyRow = blockData(doc, blockId).rows[blockData(doc, blockId).rows.length - 1];
  const cell = bodyRow.cells[0];
  const cellPath = `rows[${bodyRow.id}].cells[${cell.id}].text`;

  // Two consecutive edits of the SAME cell -> a dependent chain.
  const d1 = edit(doc, blockId, setTableCellText(doc, blockId, cell.id, 'First tracked', opts()), 'e1');
  const ev1 = lastEvent(d1);
  assert.equal(ev1.target.field, cellPath);
  const d2 = edit(d1, blockId, setTableCellText(d1, blockId, cell.id, 'Second tracked', opts()), 'e2');
  const ev2 = lastEvent(d2);

  // Rejecting the FIRST event out of order: its replacement no longer holds.
  const stale = rejectChange(d2, ev1.id, { now: T1 });
  assert.equal(stale.ok, false, 'an out-of-order rejection must not guess');
  assert.equal(stale.code, 'stale-target');
  assert.equal(pendingEvents(d2).length, 2, 'a stale rejection changes nothing');

  // Reverse order (as reject-all does): newest first, then the original.
  const cellSpansAt = (docx) => {
    const row = blockData(docx, blockId).rows.find((r) => r.id === bodyRow.id);
    return spansToPlainText(row.cells[0].spans);
  };
  const back1 = rejectChange(d2, ev2.id, { now: T1 });
  assert.equal(back1.ok, true, back1.message);
  assert.equal(cellSpansAt(back1.doc), 'First tracked');
  const back2 = rejectChange(back1.doc, ev1.id, { now: T1 });
  assert.equal(back2.ok, true, back2.message);
  assert.equal(cellSpansAt(back2.doc), '');
  assert.equal(pendingEvents(back2.doc).length, 0, 'both rejections resolved');
  assert.ok(
    documentChangeEvents(back2.doc)
      .filter((e) => e.type === 'text')
      .every((e) => e.status === 'rejected'),
    'both text events are marked rejected',
  );
});

test('10.2 table caption and headerStyle reject cleanly back to the defaults', () => {
  const { doc, blockId } = baseWithBlock('table');
  const defaultHeaderStyle = blockData(doc, blockId).headerStyle;
  let d = edit(doc, blockId, updateTableSettings(doc, blockId, { caption: 'Tracked caption' }, opts()), 'caption');
  d = edit(d, blockId, updateTableSettings(d, blockId, { headerStyle: 'heavy' }, opts()), 'style');
  assert.equal(blockData(d, blockId).caption, 'Tracked caption');

  const r1 = rejectChange(d, pendingOn(d, 'caption').id, { now: T1 });
  assert.equal(r1.ok, true, r1.message);
  assert.equal(blockData(r1.doc, blockId).caption ?? '', '', 'the optional caption is cleared');

  const r2 = rejectChange(r1.doc, pendingOn(r1.doc, 'headerStyle').id, { now: T1 });
  assert.equal(r2.ok, true, r2.message);
  assert.equal(blockData(r2.doc, blockId).headerStyle, defaultHeaderStyle);
  assert.equal(hasPendingChanges(r2.doc), false);
});

test('10.3 structural removals fail rejection honestly and change nothing', () => {
  // Table row removal: the per-cell deletion cannot be rebuilt.
  const { doc, blockId } = baseWithBlock('table');
  const added = edit(doc, blockId, addTableRow(doc, blockId, { kind: 'end' }, opts()), 'add row');
  const newRow = blockData(added, blockId).rows[blockData(added, blockId).rows.length - 1];
  const filled = edit(added, blockId, setTableCellText(added, blockId, newRow.cells[0].id, 'Doomed', opts()), 'doom');
  const settled = acceptAllChanges(filled, { now: T1 }).doc;
  const removed = capture(
    settled,
    must(removeTableRow(settled, blockId, newRow.id, opts()), 'remove row').doc,
    { kind: 'block-content', blockId },
  ).doc;
  const deletionEvent = lastEvent(removed);
  assert.equal(deletionEvent.payload.original, 'Doomed');

  const before = JSON.stringify(removed);
  const attempt = rejectChange(removed, deletionEvent.id, { now: T1 });
  assert.equal(attempt.ok, false, 'a removed row cannot be rebuilt from a field payload');
  assert.equal(attempt.code, 'unsupported-reversal');
  assert.match(attempt.message, /no longer exists/i, 'the message says WHY honestly');
  assert.equal(JSON.stringify(attempt.doc ?? removed), before, 'the document is untouched');
  assert.equal(pendingEvents(removed).length, 1, 'the event stays pending after the refusal');
  assert.equal(pendingOn(removed, deletionEvent.target.field).id, deletionEvent.id);

  // The event can still be ACCEPTED afterwards.
  const resolved = acceptAllChanges(removed, { now: T1 });
  assert.equal(resolved.resolved, 1);
  assert.equal(hasPendingChanges(resolved.doc), false);

  // List item removal behaves identically.
  const l = baseWithBlock('list');
  const item0 = blockData(l.doc, l.blockId).items[0];
  const lText = edit(l.doc, l.blockId, updateListItemText(l.doc, l.blockId, item0.id, plainTextToSpans('Doomed item'), opts()), 'text');
  const lSettled = acceptAllChanges(lText, { now: T1 }).doc;
  const lGone = capture(
    lSettled,
    must(removeListItem(lSettled, l.blockId, item0.id, opts()), 'remove item').doc,
    { kind: 'block-content', blockId: l.blockId },
  ).doc;
  const lAttempt = rejectChange(lGone, lastEvent(lGone).id, { now: T1 });
  assert.equal(lAttempt.ok, false);
  assert.equal(lAttempt.code, 'unsupported-reversal');
  assert.match(lAttempt.message, /no longer exists/i);
  assert.equal(hasPendingChanges(lAttempt.doc ?? lGone), true, 'the deletion stays pending');
});

test('10.4 list: text, nesting depth and checked-state reversals', () => {
  const { doc, blockId } = baseWithBlock('list');
  const item0 = blockData(doc, blockId).items[0];

  // Text reversal restores the plain original text.
  const d1 = edit(doc, blockId, updateListItemText(doc, blockId, item0.id, plainTextToSpans('Edited item'), opts()), 'text');
  const r1 = rejectChange(d1, pendingOn(d1, `items[${item0.id}].text`).id, { now: T1 });
  assert.equal(r1.ok, true, r1.message);
  assert.equal(spansToPlainText(blockData(r1.doc, blockId).items[0].spans), 'List item');

  // Depth reversal via the bounded outdent loop (needs a sibling to nest under).
  const added = edit(r1.doc, blockId, addListItem(r1.doc, blockId, null, opts()), 'add');
  const item1 = blockData(added, blockId).items[1];
  const indented = edit(added, blockId, indentListItem(added, blockId, item1.id, opts()), 'indent');
  const depthEvent = pendingOn(indented, `items[${item1.id}].depth`);
  assert.equal(depthEvent.payload.replacement, 1, 'the service indented the new item');
  const r2 = rejectChange(indented, depthEvent.id, { now: T1 });
  assert.equal(r2.ok, true, r2.message);
  const restoredItem = blockData(r2.doc, blockId).items.find((it) => it.id === item1.id);
  assert.equal(restoredItem.depth, 0, 'reject outdents back to the recorded nesting');

  // Checked-state reversal (a checklist is required to toggle).
  const checklist = edit(r2.doc, blockId, updateListSettings(r2.doc, blockId, { listType: 'checklist' }, opts()), 'checklist');
  const settled = acceptAllChanges(checklist, { now: T1 }).doc;
  const ticked = edit(settled, blockId, setItemChecked(settled, blockId, item1.id, true, opts()), 'tick');
  const checkedEvent = pendingOn(ticked, `items[${item1.id}].checked`);
  const r3 = rejectChange(ticked, checkedEvent.id, { now: T1 });
  assert.equal(r3.ok, true, r3.message);
  const checkedBack = blockData(r3.doc, blockId).items.find((it) => it.id === item1.id);
  assert.equal(checkedBack.checked, false);
  assert.equal(hasPendingChanges(r3.doc), false);
});

test('10.5 callout and formula reversals, plus an honest required-field refusal', () => {
  // Callout title rejection clears the optional field.
  const c = baseWithBlock('callout');
  const d1 = edit(c.doc, c.blockId, updateCalloutContent(c.doc, c.blockId, { title: 'Tracked title' }, opts()), 'title');
  const r1 = rejectChange(d1, pendingOn(d1, 'title').id, { now: T1 });
  assert.equal(r1.ok, true, r1.message);
  assert.equal(blockData(r1.doc, c.blockId).title ?? '', '');

  // Formula: latex and display-mode reversals.
  const f = baseWithBlock('formula');
  const d2 = edit(f.doc, f.blockId, updateFormulaContent(f.doc, f.blockId, { action: 'update-formula', latex: 'E = mc^2 + h\\nu' }, opts()), 'latex');
  const r2 = rejectChange(d2, pendingOn(d2, 'latex').id, { now: T1 });
  assert.equal(r2.ok, true, r2.message);
  assert.equal(blockData(r2.doc, f.blockId).latex, 'E = mc^2');

  const d3 = edit(d2, f.blockId, updateFormulaContent(d2, f.blockId, { action: 'update-formula', displayMode: false }, opts()), 'display');
  const r3 = rejectChange(d3, pendingOn(d3, 'displayMode').id, { now: T1 });
  assert.equal(r3.ok, true, r3.message);
  assert.equal(blockData(r3.doc, f.blockId).displayMode, true);

  // Honest refusal: rejecting a variable SYMBOL insertion would clear a
  // required field; the validating service refuses the empty symbol, so the
  // rejection fails explicitly instead of silently corrupting the entry.
  const emptyBase = {
    ...f.doc,
    blocks: f.doc.blocks.map((b) =>
      b.id === f.blockId
        ? { ...b, data: { ...b.data, variableDefinitions: [{ id: nextId(), symbol: '', definition: 'temperature' }] } }
        : b,
    ),
  };
  const entryId = blockData(emptyBase, f.blockId).variableDefinitions[0].id;
  const filled = must(
    updateVariableDefinition(emptyBase, f.blockId, entryId, { symbol: 'T' }, opts()),
    'symbol',
  ).doc;
  const ins = capture(emptyBase, filled, { kind: 'block-content', blockId: f.blockId }).doc;
  const insEvent = pendingOn(ins, `variableDefinitions[${entryId}].symbol`);
  assert.equal(insEvent.payload.original, '');
  assert.equal(insEvent.payload.replacement, 'T');
  const attempt = rejectChange(ins, insEvent.id, { now: T1 });
  assert.equal(attempt.ok, false, 'clearing a required symbol is refused honestly');
  assert.equal(attempt.code, 'unsupported-reversal');
  assert.equal(hasPendingChanges(attempt.doc ?? ins), true, 'the event stays pending');
});

test('10.6 image and exhibit asset swaps reverse while the original asset exists', () => {
  const { doc: raw, blockId } = baseWithBlock('image');
  const assetA = makeAsset(nextId(), 'original.png');
  const assetB = makeAsset(nextId(), 'replacement.png');
  const doc = { ...raw, assets: { ...raw.assets, [assetA.id]: assetA, [assetB.id]: assetB } };
  const imageId = blockData(doc, blockId).images[0].id;

  const withA = edit(doc, blockId, attachImageAsset(doc, blockId, imageId, assetA, opts()), 'attach');
  const settled = acceptAllChanges(withA, { now: T1 }).doc;
  const swapped = edit(settled, blockId, attachImageAsset(settled, blockId, imageId, assetB, opts()), 'swap');
  const swapEvent = pendingOn(swapped, `images[${imageId}].assetId`);

  const r1 = rejectChange(swapped, swapEvent.id, { now: T1 });
  assert.equal(r1.ok, true, r1.message);
  assert.equal(
    blockData(r1.doc, blockId).images[0].assetId,
    assetA.id,
    'the original asset reference is restored directly (no crop side effects)',
  );

  // Honest failure: the ORIGINAL asset record no longer exists in doc.assets.
  const pruned = { ...swapped, assets: { ...swapped.assets } };
  delete pruned.assets[assetA.id];
  const attempt = rejectChange(pruned, swapEvent.id, { now: T1 });
  assert.equal(attempt.ok, false, 'a missing original asset cannot be restored');
  assert.equal(attempt.code, 'unsupported-reversal');
  assert.match(attempt.message, /no longer embedded/i);
  assert.equal(JSON.stringify(attempt.doc ?? pruned), JSON.stringify(pruned), 'untouched');

  // The exhibit uses the same asset-reference machinery through its service.
  const x = baseWithBlock('exhibit');
  const xAsset = makeAsset(nextId(), 'exhibit.png');
  const xDoc = { ...x.doc, assets: { ...x.doc.assets, [xAsset.id]: xAsset } };
  const attached = must(updateExhibitContent(xDoc, x.blockId, { assetId: xAsset.id }, opts()), 'x attach').doc;
  const xTracked = capture(xDoc, attached, { kind: 'block-content', blockId: x.blockId }).doc;
  const xEvent = pendingOn(xTracked, 'assetId');
  assert.equal(xEvent.payload.original, '');
  assert.equal(xEvent.payload.replacement, xAsset.id);
  const xReject = rejectChange(xTracked, xEvent.id, { now: T1 });
  assert.equal(xReject.ok, true, xReject.message);
  assert.equal(blockData(xReject.doc, x.blockId).assetId ?? '', '', 'the reference is cleared');
});

test('10.7 signature: field reversal works; the add-seed rejection fails honestly', () => {
  const { doc, blockId } = baseWithBlock('signature');
  const signer0 = blockData(doc, blockId).signers[0];

  const d1 = edit(doc, blockId, setSignerField(doc, blockId, signer0.id, 'designation', 'I. Wahid, MSc', opts()), 'designation');
  const r1 = rejectChange(d1, pendingOn(d1, `signers[${signer0.id}].designation`).id, { now: T1 });
  assert.equal(r1.ok, true, r1.message);
  assert.equal(blockData(r1.doc, blockId).signers[0].designation, 'Name / designation');

  // The seeded designation of a NEW signer cannot be cleared (name is also
  // empty -> the service refuses an unnamed signer): honest refusal, and the
  // event stays pending rather than being silently dropped.
  const grown = edit(r1.doc, blockId, addSigner(r1.doc, blockId, opts()), 'add');
  const signer1 = blockData(grown, blockId).signers[1];
  const seedEvent = pendingOn(grown, `signers[${signer1.id}].designation`);
  const attempt = rejectChange(grown, seedEvent.id, { now: T1 });
  assert.equal(attempt.ok, false, 'clearing the seed would leave an anonymous signer');
  assert.equal(attempt.code, 'unsupported-reversal');
  assert.equal(pendingEvents(attempt.doc ?? grown).length, 1, 'the seed event stays pending');
});

test('10.8 designer text: reject restores; an out-of-band edit is honestly stale', () => {
  const { doc } = buildBase();

  // Watermark text reversal routes through the designer service.
  const wm = must(applyWatermarkPatch(doc, { field: 'text', value: 'CONFIDENTIAL' }, T0), 'wm');
  const d1 = capture(doc, wm.doc, { kind: 'settings' }).doc;
  const wmEvent = pendingOn(d1, 'watermark.text');
  const r1 = rejectChange(d1, wmEvent.id, { now: T1 });
  assert.equal(r1.ok, true, r1.message);
  assert.equal(r1.doc.headerFooter.watermark.text, 'DRAFT', 'restored through applyWatermarkPatch');

  // Header cell content: reject restores the recorded original.
  const row = d1.headerFooter.header.rows[0];
  const cell = row.cells[0];
  const cellPath = `headerFooter.header.rows[${row.id}].cells[${cell.id}].content`;
  const hf = must(
    applyHeaderFooterPatch(d1, 'header', { field: 'cellContent', rowId: row.id, cellId: cell.id, value: 'Tracked header' }, T0),
    'hf',
  );
  const d2 = capture(d1, hf.doc, { kind: 'settings' }).doc;
  const cellEvent = pendingOn(d2, cellPath);
  const r2 = rejectChange(d2, cellEvent.id, { now: T1 });
  assert.equal(r2.ok, true, r2.message);
  assert.equal(r2.doc.headerFooter.header.rows[0].cells[0].content, '{documentId}');

  // Two more tracked edits of the same cell: out-of-order is stale, the
  // newest-first order (reject-all semantics) unwinds the chain.
  const e1 = capture(
    r2.doc,
    must(applyHeaderFooterPatch(r2.doc, 'header', { field: 'cellContent', rowId: row.id, cellId: cell.id, value: 'First' }, T0), 'e1').doc,
    { kind: 'settings' },
  ).doc;
  const ev1 = lastEvent(e1);
  assert.equal(ev1.target.field, cellPath);
  const e2 = capture(
    e1,
    must(applyHeaderFooterPatch(e1, 'header', { field: 'cellContent', rowId: row.id, cellId: cell.id, value: 'Second' }, T0), 'e2').doc,
    { kind: 'settings' },
  ).doc;
  const stale = rejectChange(e2, ev1.id, { now: T1 });
  assert.equal(stale.ok, false);
  assert.equal(stale.code, 'stale-target');

  const back = rejectChange(e2, lastEvent(e2).id, { now: T1 });
  assert.equal(back.ok, true, back.message);
  assert.equal(back.doc.headerFooter.header.rows[0].cells[0].content, 'First');
  const back2 = rejectChange(back.doc, ev1.id, { now: T1 });
  assert.equal(back2.ok, true, back2.message);
  assert.equal(back2.doc.headerFooter.header.rows[0].cells[0].content, '{documentId}');
});

test('10.9 lab families reverse field by field', () => {
  // Measurement cell value + uncertainty note.
  const m = baseWithBlock('measurement');
  const mData = blockData(m.doc, m.blockId);
  const measRowId = mData.rows[0].id;
  const valueColumnId = mData.columns[1].id;
  let dm = edit(m.doc, m.blockId, setMeasurementCell(m.doc, m.blockId, measRowId, valueColumnId, '12.34', opts()), 'cell');
  dm = edit(dm, m.blockId, setMeasurementUncertaintyNote(dm, m.blockId, 'k = 2', opts()), 'note');
  const cellEvent = pendingOn(dm, `rows[${measRowId}].values[${valueColumnId}]`);
  const rCell = rejectChange(dm, cellEvent.id, { now: T1 });
  assert.equal(rCell.ok, true, rCell.message);
  assert.equal(blockData(rCell.doc, m.blockId).rows[0].values[valueColumnId] ?? '', '');
  const noteEvent = pendingOn(rCell.doc, 'uncertaintyNote');
  const rNote = rejectChange(rCell.doc, noteEvent.id, { now: T1 });
  assert.equal(rNote.ok, true, rNote.message);
  assert.equal(blockData(rNote.doc, m.blockId).uncertaintyNote ?? '', '');

  // Procedure step level + text.
  const p = baseWithBlock('procedure-step');
  const stepId = blockData(p.doc, p.blockId).steps[0].id;
  let dp = edit(p.doc, p.blockId, updateProcedureStep(p.doc, p.blockId, stepId, { level: 'warning' }, opts()), 'level');
  dp = edit(dp, p.blockId, updateProcedureStep(dp, p.blockId, stepId, { spans: plainTextToSpans('Tracked step') }, opts()), 'text');
  const levelEvent = pendingOn(dp, `steps[${stepId}].level`);
  const rl = rejectChange(dp, levelEvent.id, { now: T1 });
  assert.equal(rl.ok, true, rl.message);
  assert.equal(blockData(rl.doc, p.blockId).steps[0].level, 'main');
  const textEvent = pendingOn(rl.doc, `steps[${stepId}].text`);
  const rt = rejectChange(rl.doc, textEvent.id, { now: T1 });
  assert.equal(rt.ok, true, rt.message);
  assert.equal(spansToPlainText(blockData(rt.doc, p.blockId).steps[0].spans), 'Procedure step description.');
  assert.equal(hasPendingChanges(rt.doc), false);

  // Acceptance criterion verdict + overall result.
  const a = baseWithBlock('acceptance-criteria');
  const critId = blockData(a.doc, a.blockId).criteria[0].id;
  const defaultResult = blockData(a.doc, a.blockId).criteria[0].result;
  let da = edit(a.doc, a.blockId, updateAcceptanceCriterion(a.doc, a.blockId, critId, { result: 'pass' }, opts()), 'verdict');
  da = edit(da, a.blockId, setAcceptanceOverallResult(da, a.blockId, 'pass', opts()), 'overall');
  const verdictEvent = pendingOn(da, `criteria[${critId}].result`);
  const rv = rejectChange(da, verdictEvent.id, { now: T1 });
  assert.equal(rv.ok, true, rv.message);
  assert.equal(blockData(rv.doc, a.blockId).criteria[0].result, defaultResult, 'back to pending');
  const overallEvent = pendingOn(rv.doc, 'overallResult');
  const ro = rejectChange(rv.doc, overallEvent.id, { now: T1 });
  assert.equal(ro.ok, true, ro.message);
  assert.equal(blockData(ro.doc, a.blockId).overallResult ?? '', '', 'overall verdict cleared');
  assert.equal(hasPendingChanges(ro.doc), false);
});

test('10.10 reject-all: honest structural failure stays pending; accept-all finishes', () => {
  const { doc, blockId } = baseWithBlock('table');
  const rows0 = blockData(doc, blockId).rows;
  const bodyCell = rows0[rows0.length - 1].cells[0];

  // Structural event FIRST (honest-fail on reject): a filled row removed,
  // with its fill settled so only the deletion stays pending.
  const added = edit(doc, blockId, addTableRow(doc, blockId, { kind: 'end' }, opts()), 'add');
  const newRow = blockData(added, blockId).rows[blockData(added, blockId).rows.length - 1];
  const filled = edit(added, blockId, setTableCellText(added, blockId, newRow.cells[0].id, 'Doomed', opts()), 'doom');
  const settled = acceptAllChanges(filled, { now: T1 }).doc;
  const removed = capture(
    settled,
    must(removeTableRow(settled, blockId, newRow.id, opts()), 'remove row').doc,
    { kind: 'block-content', blockId },
  ).doc;

  // A reversible edit on TOP of the structural event.
  const d1 = edit(removed, blockId, setTableCellText(removed, blockId, bodyCell.id, 'Reversible', opts()), 'edit');
  assert.equal(pendingEvents(d1).length, 2);

  const result = rejectAllChanges(d1, { now: T1 });
  assert.equal(result.ok, true);
  assert.equal(result.resolved, 1, 'the reversible cell edit unwinds');
  assert.equal(result.failures.length, 1, 'the structural failure is reported honestly');
  assert.match(result.failures[0].message, /no longer exists/i);
  assert.equal(
    spansToPlainText(blockData(result.doc, blockId).rows[rows0.length - 1].cells[0].spans),
    '',
    'the reversible edit is restored',
  );
  assert.equal(pendingEvents(result.doc).length, 1, 'the structural event stays pending');
  const statuses = documentChangeEvents(result.doc).map((e) => `${e.type}:${e.status}`);
  assert.deepEqual(
    statuses,
    ['block-create:accepted', 'text:accepted', 'text:pending', 'text:rejected'],
    'newest resolved first; the honest failure stays pending; history preserved',
  );

  // Accept-all then finishes the honest failure without touching content.
  const afterRows = blockData(result.doc, blockId).rows.length;
  const finish = acceptAllChanges(result.doc, { now: T1 });
  assert.equal(finish.resolved, 1);
  assert.equal(hasPendingChanges(finish.doc), false);
  assert.equal(blockData(finish.doc, blockId).rows.length, afterRows, 'accept never mutates content');
});

test('10.11 accepting family events never changes content', () => {
  const { doc, blockId } = baseWithBlock('table');
  const bodyRow = blockData(doc, blockId).rows[blockData(doc, blockId).rows.length - 1];
  const d1 = edit(doc, blockId, setTableCellText(doc, blockId, bodyRow.cells[0].id, 'Accepted cell', opts()), 'edit');
  const before = JSON.stringify(blockData(d1, blockId));
  const accepted = acceptAllChanges(d1, { now: T1 });
  assert.equal(accepted.resolved, 1);
  assert.equal(JSON.stringify(blockData(accepted.doc, blockId)), before, 'accept is content-neutral');
  assert.equal(hasPendingChanges(accepted.doc), false);
  assert.ok(documentChangeEvents(accepted.doc).every((e) => e.status === 'accepted'));
});

// ═════════════════════════════════════════════════════════════════════════════
group('11. P07-M2-R1: markup, PDF and DOM for the new families');
// ═════════════════════════════════════════════════════════════════════════════

test('11.1 describePendingTextCues renders printable old -> new cue lines', () => {
  const cues = describePendingTextCues([
    { status: 'pending', type: 'text', payload: { original: 'Old text', replacement: 'New text' } },
    { status: 'pending', type: 'text', payload: { original: '', replacement: 'Inserted' } },
    { status: 'pending', type: 'text', payload: { original: 'Removed', replacement: '' } },
    { status: 'pending', type: 'text', payload: { original: 'x'.repeat(200), replacement: 'y' } },
    { status: 'accepted', type: 'text', payload: { original: 'gone', replacement: 'gone too' } },
    { status: 'pending', type: 'formatting', payload: { kind: 'property', original: 1, replacement: 2 } },
    { status: 'pending', type: 'text', payload: { original: '', replacement: '' } },
  ]);
  assert.equal(cues.length, 4, 'only NON-EMPTY pending TEXT events cue');
  assert.equal(cues[0], 'Text: Old text → New text');
  assert.equal(cues[1], 'Text: (empty) → Inserted');
  assert.equal(cues[2], 'Text: Removed → (empty)');
  assert.ok(cues[3].includes('…'), 'the long side is truncated with an ellipsis');
  assert.ok(cues[3].length <= 'Text: '.length + 60 + ' → '.length + 60, 'truncated for the page');
  assert.deepEqual(describePendingTextCues(undefined), []);
  assert.deepEqual(describePendingTextCues([]), []);
});

test('11.2 view context routes family events per block; inline runs stay heading/paragraph-only', () => {
  const { doc, blockId } = baseWithBlock('table');
  const bodyRow = blockData(doc, blockId).rows[blockData(doc, blockId).rows.length - 1];
  const cell = bodyRow.cells[0];
  const d1 = edit(doc, blockId, setTableCellText(doc, blockId, cell.id, 'Context cell', opts()), 'edit');

  const ctx = buildDocumentChangeViewContext(d1);
  assert.ok(ctx !== null, 'pending family events produce a view context');
  assert.equal(ctx.byBlock.size, 1);
  assert.equal(ctx.byBlock.get(blockId).length, 1);
  assert.equal(ctx.byBlock.get(blockId)[0].type, 'text');

  // The inline heading/paragraph run selector ignores family locators
  // (family text is cue-lined in the PDF instead of struck inline).
  assert.equal(pendingTextEventFor(documentChangeEvents(d1)), undefined);

  // The review description disambiguates by the stable-id locator.
  const event = ctx.byBlock.get(blockId)[0];
  const desc = describeChangeEvent(event, d1.blocks);
  assert.equal(desc.title, 'Text change');
  assert.equal(desc.target, `Table — rows[${bodyRow.id}].cells[${cell.id}].text`);
  assert.equal(desc.after, 'Context cell');
});

await testAsync('11.3 PDF: family cue lines markup-only, clean shows current content, no clipping', async () => {
  const base = buildBase();
  const calloutIns = must(insertBlock(base.doc, 'callout', { kind: 'end' }, opts()), 'insert callout');
  const tableIns = must(insertBlock(calloutIns.doc, 'table', { kind: 'end' }, opts()), 'insert table');
  let d = capture(base.doc, calloutIns.doc, { kind: 'block-create', blockId: calloutIns.blockId }).doc;
  d = capture(d, tableIns.doc, { kind: 'block-create', blockId: tableIns.blockId }).doc;
  d = acceptAllChanges(d, { now: T1 }).doc;
  d = edit(
    d,
    calloutIns.blockId,
    updateCalloutContent(d, calloutIns.blockId, { spans: plainTextToSpans('Marked callout body') }, opts()),
    'callout body',
  );
  const tableRows = blockData(d, tableIns.blockId).rows;
  const tableCell = tableRows[tableRows.length - 1].cells[0];
  d = edit(d, tableIns.blockId, setTableCellText(d, tableIns.blockId, tableCell.id, 'Marked cell text', opts()), 'cell');
  assert.equal(pendingEvents(d).length, 2);

  const cleanBuf = await renderDocPdfBytes(d, { changeView: 'clean' });
  const markupBuf = await renderDocPdfBytes(d, { changeView: 'markup' });
  assert.notEqual(
    Buffer.compare(Buffer.from(cleanBuf), Buffer.from(markupBuf)),
    0,
    'pending family events change the PDF bytes',
  );

  const cleanText = await pdfText(cleanBuf);
  const markupText = await pdfText(markupBuf);
  const cleanCompact = await pdfTextCompact(cleanBuf);
  const markupCompact = await pdfTextCompact(markupBuf);

  // Clean renders current content only - never the struck original or cue.
  assert.ok(cleanText.includes('Marked callout body'), 'clean renders the current callout body');
  assert.ok(cleanText.includes('Marked cell text'), 'clean renders the current cell text');
  assert.ok(!cleanText.includes('Callout text.'), 'clean never shows the struck original');
  assert.ok(!cleanCompact.includes('Text:'), 'clean carries no cue lines');

  // Markup carries the cue lines (callout old -> new, cell (empty) -> new).
  assert.ok(markupText.includes('Callout text.'), 'markup cues the callout original');
  assert.ok(markupCompact.includes('Text:Callouttext.'), `markup cue for the callout (got: ${markupCompact.slice(0, 400)})`);
  assert.ok(markupCompact.includes('Text:(empty)'), 'markup cues the empty -> inserted cell text');

  // Clip safety: every extracted run sits inside the page box (markup does
  // not push text past the printable margins).
  await withPdf(markupBuf, async (pdf) => {
    for (let i = 1; i <= pdf.numPages; i += 1) {
      const page = await pdf.getPage(i);
      const { width, height } = page.getViewport({ scale: 1 });
      const content = await page.getTextContent();
      for (const item of content.items) {
        if (!item.str || item.str.trim() === '') continue;
        const x = item.transform[4];
        const y = item.transform[5];
        assert.ok(x >= -4 && x <= width + 4, `page ${i}: item x=${x.toFixed(1)} inside 0..${width}`);
        assert.ok(y >= -4 && y <= height + 4, `page ${i}: item y=${y.toFixed(1)} inside 0..${height}`);
      }
    }
  });
});

await testAsync('11.4 DOM: the editor markup strip renders family pending text generically', async () => {
  const { doc, blockId } = baseWithBlock('table');
  const bodyRow = blockData(doc, blockId).rows[blockData(doc, blockId).rows.length - 1];
  const cell = bodyRow.cells[0];
  // Seed the cell, settle, then edit - so BOTH strip sides are non-empty.
  const seeded = edit(doc, blockId, setTableCellText(doc, blockId, cell.id, 'Original cell', opts()), 'seed');
  const settled = acceptAllChanges(seeded, { now: T1 }).doc;
  const d1 = edit(settled, blockId, setTableCellText(settled, blockId, cell.id, 'Struck cell', opts()), 'edit');

  await mount(React.createElement(EditorPanel, editorProps(d1)));
  const strip = q('.tc-block-strip');
  assert.ok(strip, 'a family text event renders the same inline strip as heading/paragraph');
  assert.equal(q('.tc-strip-del').textContent.trim(), 'Original cell');
  assert.equal(q('.tc-strip-ins').textContent.trim(), 'Struck cell');
  await mounted.unmount();
});

await testAsync('11.5 DOM: the review panel lists family events with their locators', async () => {
  const { doc, blockId } = baseWithBlock('table');
  const bodyRow = blockData(doc, blockId).rows[blockData(doc, blockId).rows.length - 1];
  const cell = bodyRow.cells[0];
  const d1 = edit(doc, blockId, setTableCellText(doc, blockId, cell.id, 'Panel cell', opts()), 'edit');

  await mount(
    React.createElement(TrackChangesPanel, {
      trackChangesEnabled: d1.trackChangesEnabled,
      onTrackChangesToggle: () => {},
      changeEvents: documentChangeEvents(d1),
      blocks: d1.blocks,
      onAccept: () => {},
      onReject: () => {},
      onAcceptAll: () => {},
      onRejectAll: () => {},
      viewMode: 'markup',
      onViewModeChange: () => {},
      editorLabel: '',
      onEditorLabelChange: () => {},
    }),
  );
  assert.ok(byText('.tc-section-title', 'Pending changes (1)'));
  const titles = qa('.tc-event-title').map((el) => el.textContent.trim());
  assert.ok(titles.includes('Text change'), `family text events are listed (got: ${titles.join(', ')})`);
  const targets = qa('.tc-event-target').map((el) => el.textContent.trim());
  assert.ok(
    targets.some((t) => t.includes(`rows[${bodyRow.id}].cells[${cell.id}].text`)),
    `the stable-id locator is shown for disambiguation (got: ${targets.join(' | ')})`,
  );
  await mounted.unmount();
});

// ═════════════════════════════════════════════════════════════════════════════
group('12. P07-M2-R1: persistence of content-family and designer events');
// ═════════════════════════════════════════════════════════════════════════════

/** One document carrying pending events from four families + designer text. */
function docWithFamilyEvents() {
  const base = buildBase();
  const created = ['table', 'signature', 'measurement', 'callout'].reduce(
    (acc, type) => {
      const ins = must(insertBlock(acc.doc, type, { kind: 'end' }, opts()), `insert ${type}`);
      return {
        doc: capture(acc.doc, ins.doc, { kind: 'block-create', blockId: ins.blockId }).doc,
        blocks: { ...acc.blocks, [type]: ins.blockId },
      };
    },
    { doc: base.doc, blocks: {} },
  );
  const settled = acceptAllChanges(created.doc, { now: T1 }).doc;
  const blockIds = created.blocks;

  // Table cell text.
  const rows = blockData(settled, blockIds.table).rows;
  const cell = rows[rows.length - 1].cells[0];
  let d = edit(settled, blockIds.table, setTableCellText(settled, blockIds.table, cell.id, 'Persisted cell', opts()), 'cell');
  // Signature signer name.
  const signer = blockData(d, blockIds.signature).signers[0];
  d = edit(d, blockIds.signature, setSignerField(d, blockIds.signature, signer.id, 'name', 'Ikram ul Wahid', opts()), 'signer');
  // Measurement cell value.
  const mData = blockData(d, blockIds.measurement);
  d = edit(d, blockIds.measurement, setMeasurementCell(d, blockIds.measurement, mData.rows[0].id, mData.columns[1].id, '9.81', opts()), 'measured');
  // Callout title.
  d = edit(d, blockIds.callout, updateCalloutContent(d, blockIds.callout, { title: 'Persisted callout' }, opts()), 'callout');
  // Designer watermark text (settings event on a document path).
  const wm = must(applyWatermarkPatch(d, { field: 'text', value: 'PERSISTED' }, T0), 'wm');
  const final = capture(d, wm.doc, { kind: 'settings' }).doc;

  return { doc: final, blockIds, cellId: cell.id };
}

test('12.1 content-family and designer events round-trip losslessly at schema v1', () => {
  const { doc, blockIds } = docWithFamilyEvents();
  assert.equal(pendingEvents(doc).length, 5, 'four family events + one designer event');

  const json = serializeDocument(doc);
  const back = deserializeDocument(json);
  assert.deepEqual(back, doc, 'every event, stable-id locator and payload survives save/open');
  assert.equal(back.schemaVersion, 1, 'DOCSTUDIO_SCHEMA_VERSION stays 1');
  assert.equal(serializeDocument(back), json, 're-serialization is byte-stable');

  // The reopened log still reviews: locators resolve to real targets.
  assert.equal(hasPendingChanges(back), true);
  const targetFields = pendingEvents(back).map((e) => e.target.field);
  assert.ok(targetFields.some((f) => f.startsWith('rows[')), 'child locators persisted');
  assert.ok(targetFields.includes('watermark.text'), 'designer text persisted');
  assert.ok(targetFields.includes('title'), 'block-level family field persisted');
  assert.ok(
    pendingEvents(back).every((e) => back.blocks.some((b) => b.id === e.target.blockId || e.target.kind === 'document')),
    'every block-field event still addresses an existing block',
  );
  assert.ok(blockIds, 'fixture blocks recorded');
});

test('12.2 malformed family/designer events are rejected precisely on load', () => {
  const { doc } = docWithFamilyEvents();
  const base = JSON.parse(serializeDocument(doc));
  const textIndex = base.changeEvents.findIndex((e) => e.type === 'text');
  assert.ok(textIndex >= 0, 'the fixture carries at least one text event');

  // DocumentFileError carries the message and the per-index detail bullets.
  const detailOf = (fn) => {
    try {
      fn();
    } catch (e) {
      assert.ok(e instanceof DocumentFileError, `expected DocumentFileError, got ${e && e.name}`);
      return String(e.detail ?? '');
    }
    throw new assert.AssertionError({ message: 'expected deserializeDocument to throw' });
  };

  // The P07-M1 model: a text event MUST target a block field. Designer text
  // travels as a `settings` event - a document-targeted text event is refused.
  assert.match(
    detailOf(() =>
      deserializeDocument(
        JSON.stringify({
          ...base,
          changeEvents: base.changeEvents.map((e, i) =>
            i === textIndex
              ? { ...e, target: { kind: 'document', field: 'frontPage.synopsis' } }
              : e,
          ),
        }),
      ),
    ),
    new RegExp(`changeEvents\\[${textIndex}\\]`),
    'a document-targeted text event is refused',
  );

  // Non-string payload on a family text event.
  assert.match(
    detailOf(() =>
      deserializeDocument(
        JSON.stringify({
          ...base,
          changeEvents: base.changeEvents.map((e, i) =>
            i === textIndex ? { ...e, payload: { original: 42, replacement: 'x' } } : e,
          ),
        }),
      ),
    ),
    new RegExp(`changeEvents\\[${textIndex}\\]`),
    'non-string text payloads are refused',
  );
});

test('12.3 an old document opens and a fresh family edit appends cleanly', () => {
  const { doc, blockIds, cellId } = docWithFamilyEvents();
  const opened = deserializeDocument(serializeDocument(doc));
  const before = documentChangeEvents(opened).length;

  const afterEdit = must(
    setTableCellText(opened, blockIds.table, cellId, 'After reopen', opts()),
    'edit',
  ).doc;
  const tracked = capture(opened, afterEdit, { kind: 'block-content', blockId: blockIds.table }).doc;
  assert.equal(documentChangeEvents(tracked).length, before + 1, 'the fresh event appends');
  assert.equal(tracked.changeEvents[0].status, 'accepted', 'older events keep identity and order');
  const fresh = documentChangeEvents(tracked)[documentChangeEvents(tracked).length - 1];
  assert.equal(fresh.target.field, `rows[${blockData(opened, blockIds.table).rows[1].id}].cells[${cellId}].text`);
  assert.equal(fresh.payload.replacement, 'After reopen');
  assert.equal(hasPendingChanges(tracked), true);
});

// ═════════════════════════════════════════════════════════════════════════════
// Summary
// ═════════════════════════════════════════════════════════════════════════════
console.log('\n══════════════════════════════════════════════════════════');
console.log(`P07-M2 verification: ${passed} passed, ${failed} failed`);
console.log('HONEST COVERAGE NOTES:');
console.log(' - PDF.js preview inside PocViewer and the native save dialog are NOT');
console.log('   exercised here (no WebView2 in the suite); preview == export is');
console.log('   covered at the byte level through renderDocPdfBytes directly.');
console.log(' - Since P07-M2-R1 every text-bearing content family IS tracked');
console.log('   (tables, lists, callouts, formulas, image captions/asset refs,');
console.log('   signature text, structural text, all six lab blocks, designer');
console.log('   text).  Deliberate boundaries: structural child removals are');
console.log('   captured but their REJECT fails honestly; child reorders record');
console.log('   no text events; image size/crop/layout, signature hAlign,');
console.log('   non-text designer config, customFields and fontFallbacks stay in');
console.log('   the open owner-decision bucket (roadmap P07-M2-R1 / proposed');
console.log('   DEC-009).  A page break has no text by design.');
if (failed > 0) process.exit(1);
