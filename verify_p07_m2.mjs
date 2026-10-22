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

// ═════════════════════════════════════════════════════════════════════════════
// Summary
// ═════════════════════════════════════════════════════════════════════════════
console.log('\n══════════════════════════════════════════════════════════');
console.log(`P07-M2 verification: ${passed} passed, ${failed} failed`);
console.log('HONEST COVERAGE NOTES:');
console.log(' - PDF.js preview inside PocViewer and the native save dialog are NOT');
console.log('   exercised here (no WebView2 in the suite); preview == export is');
console.log('   covered at the byte level through renderDocPdfBytes directly.');
console.log(" - Untracked-by-design surfaces (other block types' inner content,");
console.log('   customFields, fontFallbacks, front page, header/footer, watermark)');
console.log('   are documented limitations of P07-M2, not defects.');
if (failed > 0) process.exit(1);
