/**
 * DocStudio - Track Changes integration service (P07-M2)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Wires the accepted P07-M1 change-event model (`types/change-events` +
 * `services/change-events`, whose docblocks remain the authoritative model
 * semantics) into the running application: event capture from the real
 * immutable editing paths, schema-v1 additive persistence helpers, the
 * accept/reject operations and the markup-derivation helpers the editor
 * and the PDF renderer consume.  `project_details.md` §12.1, roadmap 7.2.
 *
 * Conventions (mirrors `block-actions` / `document-actions`)
 * ─────────────────────────────────────────────────────────────
 * • Pure module: no React/DOM/Tauri imports; every document transformation
 *   returns a NEW document (inputs are never mutated); same-reference
 *   returns mean "nothing changed".
 * • Construction of events REUSES the P07-M1 `createChangeEvent` service -
 *   no second validation implementation exists here.
 * • Failures return `{ ok: false, code, message }` with an understandable
 *   message; a failed operation never partially mutates the document.
 * • Injected clock/ID (`nowISO`/`newUUID` defaults) keep suites
 *   deterministic - same pattern as every block service.
 *
 * CAPTURE MODEL (roadmap 7.2 "capture edits in the actual application")
 * ────────────────────────────────────────────────────────────────────
 * Every App mutation handler already funnels through the immutable
 * services and ends in `setActiveDocument(after)`.  Capture therefore
 * happens at that single seam via `commitTrackedChange(before, after,
 * hint)`, which DIFFS the before/after documents along the known field
 * paths of the fired handler (`ChangeCaptureHint`).  Deriving events from
 * real before/after pairs (instead of instrumenting every service) makes
 * false records impossible at the source: a no-op service result is the
 * same reference and produces no events, and the recorded values are
 * exactly what the authoritative services committed.
 *
 * WHAT IS CAPTURED IN P07-M2 (documented scope, §12.1 feasibility clause)
 * ──────────────────────────────────────────────────────────────────────
 * • Text/formatting: HEADING (`text`, `level`, `numbered`, `hAlign`) and
 *   PARAGRAPH (`spans` text projection, styling, `hAlign`, `indentLevel`)
 *   - the two P05-M2 field-level text editors.  Other block types' inner
 *   content (list items, callouts, tables, formula, image/signature,
 *   laboratory blocks) is NOT captured in P07-M2; their whole-block
 *   create/delete/reorder IS.  Recorded as an explicit checkpoint
 *   limitation, not silently as coverage.
 * • Spacing: `spacing.topPt` / `spacing.bottomPt` on any block (property).
 * • Block operations: create (insert + duplicate), delete, reorder -
 *   all block types.
 * • Metadata: the five scalar leaves (`title`, `subtitle`,
 *   `organizationName`, `documentId`, `status`).  `customFields` add /
 *   remove / rename is not representable per-leaf in this model - a
 *   documented P07-M2 limitation.  `createdAt`/`modifiedAt` are
 *   app-managed and never tracked.
 * • Settings: page setup (size, orientation, margin preset and the four
 *   custom-margin leaves), typography (fontFamily, baseFontSizePt,
 *   lineHeight, paragraphSpacingPt - `fontFallbacks` is an array and is
 *   excluded), body theme id, monochrome, display header.  Front-page
 *   designer, header/footer grid and watermark editing are NOT captured
 *   in P07-M2 (rich composite structures) - documented limitation.
 * • The tracking toggle itself is not an event (recording control, not
 *   document authorship); new/open/duplicate/clear/reset are lifecycle
 *   operations, not tracked edits.
 *
 * FIELD-LOCATOR GRAMMAR (P07-M1 left `block-field.field` opaque; P07-M2
 * owns and records it here - display/disambiguation only, never an anchor)
 * ──────────────────────────────────────────────────────────────────────
 * • heading:  `text` | `level` | `numbered` | `hAlign`
 *             | `spacing.topPt` | `spacing.bottomPt`
 * • paragraph: `text` (plain-text projection of `spans`) | `spans`
 *             | `hAlign` | `indentLevel` | `spacing.topPt` | `spacing.bottomPt`
 * • metadata / settings targets use dotted document-leaf paths, e.g.
 *   `title`, `pageSetup.margins.topMm`, `pageTypography.typography.lineHeight`.
 *
 * TEXT LIMITATION (P07-M1 semantics, restated for consumers)
 * ─────────────────────────────────────────────────────────
 * Events store FIELD-LEVEL before/after strings; fine-grained inserted /
 * deleted fragments shown in markup are DERIVED by the common
 * prefix/suffix diff (`deriveTextSegments`) exactly as the P07-M1 record
 * anticipates.  Rejecting a paragraph text event restores the original
 * plain text WITHOUT the inline styling that later accumulated on the
 * field (spans are rebuilt via `plainTextToSpans`) - documented.
 *
 * PERSISTENCE (schema v1, additive-optional)
 * ──────────────────────────────────────────
 * `DocStudioDocument.changeEvents?: ChangeEvent[]` is optional; absence
 * means an empty log (`?? []` everywhere).  `document-file` validates
 * every persisted event through the P07-M1 validator when the key is
 * present; the serializer writes it only when set, so pre-P07-M2 files
 * round-trip byte-identically.  `DOCSTUDIO_SCHEMA_VERSION` stays 1.
 * R-003 (revision-data growth) stays OPEN and belongs to P07-M3; this
 * checkpoint adds no cap and no pruning policy.
 *
 * ACCEPT / REJECT (§12.1; planned behavior of P07-M1 is implemented here)
 * ──────────────────────────────────────────────────────────────────────
 * • Accept keeps the CURRENT document content and marks the event
 *   `accepted` (content already reflects the edit).
 * • Reject reverses the recorded change through the same immutable
 *   services, then marks the event `rejected`; a reversal that is stale
 *   (the target moved again outside tracked flow), unsafe (dependent
 *   pending changes) or unresolvable fails with an explicit message and
 *   leaves the document AND the event untouched - never silently dropped.
 * • Reject-all applies pending events in REVERSE log order (the
 *   recorded application order inverted) and reports per-event failures
 *   honestly instead of aborting or partially applying a failed event.
 * • Events and statuses are preserved as recorded history; nothing here
 *   is tamper-proof or an audit trail (§12.1/§12.4).
 */

import type { InlineSpan, ParagraphAlignment } from '../types/blocks';
import { BLOCK_REGISTRY } from './block-registry';
import type {
  ContentBlock,
  DocStudioDocument,
  DocUUID,
  HAlignment,
  ISODateString,
  PageOrientation,
  PageSize,
} from '../types/document';
import type {
  ChangeEvent,
  ChangeEventDraft,
  ChangeEventOfType,
  ChangeScalarValue,
  ChangeStatus,
} from '../types/change-events';
import { MAX_EDITOR_LABEL_LENGTH } from '../types/change-events';
import { createChangeEvent } from './change-events';
import { spansToPlainText, plainTextToSpans } from './rich-text';
import {
  deleteBlock,
  indexOfBlock,
  moveBlockTo,
  updateBlockSpacing,
} from './block-actions';
import { updateHeadingContent, updateParagraphContent } from './block-content';
import {
  updateBodyTheme,
  updateDisplayHeader,
  updatePageSetup,
  updateTypography,
} from './page-typography';
import { updateDocumentMetadata } from './document-actions';
import { nowISO } from '../types/defaults';

// ─────────────────────────────────────────────────────────────────────────────
// Shared helpers
// ─────────────────────────────────────────────────────────────────────────────

/** The persisted event log of a document (absent key = empty log). */
export function documentChangeEvents(doc: DocStudioDocument): readonly ChangeEvent[] {
  return doc.changeEvents ?? [];
}

/**
 * Which visual variant of the document is shown or exported (§12.1:
 * users control whether tracked-change markup appears in the exported
 * PDF).  `clean` renders current content with NO review markup;
 * `markup` additionally marks pending tracked changes (and is a
 * decoration-free no-op when the document has none).
 */
export type DocumentChangeView = 'clean' | 'markup';

/** True when the document holds at least one PENDING tracked change. */
export function hasPendingChanges(doc: DocStudioDocument): boolean {
  return documentChangeEvents(doc).some((event) => event.status === 'pending');
}

/** Injection options for deterministic capture/transition (tests). */
export interface TrackChangeOptions {
  now?: ISODateString;
  genId?: () => DocUUID;
  /** Locally configured editor name stamped on NEW events (blank = none). */
  editorLabel?: string | null;
}

const normalizeLabel = (label: string | null | undefined): string | undefined => {
  if (label === null || label === undefined) return undefined;
  const trimmed = label.trim();
  if (trimmed === '' || trimmed.length > MAX_EDITOR_LABEL_LENGTH) return undefined;
  return trimmed;
};

// ─────────────────────────────────────────────────────────────────────────────
// Editor label store (locally configured, user-supplied, unauthenticated)
// ─────────────────────────────────────────────────────────────────────────────

/** localStorage key for the locally configured editor name (§12.1). */
export const EDITOR_LABEL_STORAGE_KEY = 'docstudio_editor_label';

/**
 * Read the locally configured editor name.  Session-local preference
 * (like the theme mode), deliberately NOT document schema: §12.1 requires
 * it only as optional per-event metadata, and it is user-supplied text -
 * never authenticated identity.  Returns '' outside a browser (suites).
 */
export function loadEditorLabel(): string {
  try {
    if (typeof localStorage === 'undefined') return '';
    return localStorage.getItem(EDITOR_LABEL_STORAGE_KEY) ?? '';
  } catch {
    return '';
  }
}

/** Persist the locally configured editor name (trimmed, length-capped). */
export function writeEditorLabel(label: string): void {
  try {
    if (typeof localStorage === 'undefined') return;
    const trimmed = label.trim().slice(0, MAX_EDITOR_LABEL_LENGTH);
    if (trimmed === '') localStorage.removeItem(EDITOR_LABEL_STORAGE_KEY);
    else localStorage.setItem(EDITOR_LABEL_STORAGE_KEY, trimmed);
  } catch {
    /* storage unavailable - the label simply is not remembered */
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Capture: hints, derivation and the single App commit seam
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Which mutation handler fired.  The App passes this to
 * `commitTrackedChange` so only the relevant field paths are diffed -
 * one user action can never record events for unrelated parts of the
 * document that merely share a timestamp bump.
 */
export type ChangeCaptureHint =
  | { kind: 'block-create'; blockId: DocUUID }
  | { kind: 'block-delete'; blockId: DocUUID }
  | { kind: 'block-reorder'; blockId: DocUUID }
  | { kind: 'block-content'; blockId: DocUUID }
  | { kind: 'metadata' }
  | { kind: 'settings' };

/** Metadata leaves tracked in P07-M2 (app-managed timestamps excluded). */
const TRACKED_METADATA_KEYS = [
  'title',
  'subtitle',
  'organizationName',
  'documentId',
  'status',
] as const;

const deepCopy = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

const scalarOrNull = (value: unknown): ChangeScalarValue | undefined => {
  if (value === null || typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return value;
  }
  return undefined;
};

/** Preceding-neighbour id at `index`, or null at document start. */
const afterIdAt = (blocks: readonly ContentBlock[], index: number): DocUUID | null =>
  index > 0 ? (blocks[index - 1]?.id ?? null) : null;

const isSameScalar = (a: ChangeScalarValue, b: ChangeScalarValue): boolean =>
  a === b || (a === null && b === null);

function makeScalarDraft(
  type: 'metadata' | 'settings',
  field: string,
  original: ChangeScalarValue,
  replacement: ChangeScalarValue,
): ChangeEventDraft | null {
  if (isSameScalar(original, replacement)) return null;
  return { type, target: { kind: 'document', field }, payload: { original, replacement } };
}

/** A `formatting`/`property` draft for one scalar block property, or null on a no-op. */
function makeFormattingPropertyDraft(
  blockId: DocUUID,
  field: string,
  original: ChangeScalarValue,
  replacement: ChangeScalarValue,
): ChangeEventDraft | null {
  if (isSameScalar(original, replacement)) return null;
  return {
    type: 'formatting',
    target: { kind: 'block-field', blockId, field },
    payload: { kind: 'property', original, replacement },
  };
}

/** Diff one heading/paragraph/spacing block between before/after. */
function deriveBlockContentDrafts(
  before: ContentBlock,
  after: ContentBlock,
): ChangeEventDraft[] {
  const drafts: ChangeEventDraft[] = [];
  const target = { kind: 'block-field', blockId: after.id } as const;

  if (before.data.type === 'heading' && after.data.type === 'heading') {
    if (before.data.text !== after.data.text) {
      drafts.push({
        type: 'text',
        target: { ...target, field: 'text' },
        payload: { original: before.data.text, replacement: after.data.text },
      });
    }
    for (const key of ['level', 'numbered', 'hAlign'] as const) {
      const original = scalarOrNull(before.data[key]);
      const replacement = scalarOrNull(after.data[key]);
      if (original !== undefined && replacement !== undefined) {
        const draft = makeFormattingPropertyDraft(after.id, key, original, replacement);
        if (draft !== null) drafts.push(draft);
      }
    }
  } else if (before.data.type === 'paragraph' && after.data.type === 'paragraph') {
    const oldText = spansToPlainText(before.data.spans);
    const newText = spansToPlainText(after.data.spans);
    if (oldText !== newText) {
      drafts.push({
        type: 'text',
        target: { ...target, field: 'text' },
        payload: { original: oldText, replacement: newText },
      });
    } else if (JSON.stringify(before.data.spans) !== JSON.stringify(after.data.spans)) {
      // Plain text identical, styling differs: a genuine formatting event
      // (the P07-M1 validator re-checks the identical-text classification).
      drafts.push({
        type: 'formatting',
        target: { ...target, field: 'spans' },
        payload: {
          kind: 'spans',
          original: deepCopy(before.data.spans),
          replacement: deepCopy(after.data.spans),
        },
      });
    }
    if (before.data.hAlign !== after.data.hAlign) {
      const draft = makeFormattingPropertyDraft(
        after.id,
        'hAlign',
        before.data.hAlign,
        after.data.hAlign,
      );
      if (draft !== null) drafts.push(draft);
    }
    if (before.data.indentLevel !== after.data.indentLevel) {
      const draft = makeFormattingPropertyDraft(
        after.id,
        'indentLevel',
        before.data.indentLevel,
        after.data.indentLevel,
      );
      if (draft !== null) drafts.push(draft);
    }
  }

  for (const key of ['topPt', 'bottomPt'] as const) {
    if (before.spacing[key] !== after.spacing[key]) {
      const draft = makeFormattingPropertyDraft(
        after.id,
        `spacing.${key}`,
        before.spacing[key],
        after.spacing[key],
      );
      if (draft !== null) drafts.push(draft);
    }
  }
  return drafts;
}

/** Settings leaf paths tracked in P07-M2 (dotted document paths). */
const SETTINGS_LEAVES: ReadonlyArray<{
  path: string;
  read: (doc: DocStudioDocument) => ChangeScalarValue | undefined;
}> = [
  { path: 'pageSetup.size', read: (d) => d.pageSetup.size },
  { path: 'pageSetup.orientation', read: (d) => d.pageSetup.orientation },
  { path: 'pageSetup.margins.preset', read: (d) => d.pageSetup.margins.preset },
  { path: 'pageSetup.margins.topMm', read: (d) => d.pageSetup.margins.topMm },
  { path: 'pageSetup.margins.bottomMm', read: (d) => d.pageSetup.margins.bottomMm },
  { path: 'pageSetup.margins.leftMm', read: (d) => d.pageSetup.margins.leftMm },
  { path: 'pageSetup.margins.rightMm', read: (d) => d.pageSetup.margins.rightMm },
  { path: 'pageTypography.typography.fontFamily', read: (d) => d.pageTypography.typography.fontFamily },
  { path: 'pageTypography.typography.baseFontSizePt', read: (d) => d.pageTypography.typography.baseFontSizePt },
  { path: 'pageTypography.typography.lineHeight', read: (d) => d.pageTypography.typography.lineHeight },
  { path: 'pageTypography.typography.paragraphSpacingPt', read: (d) => d.pageTypography.typography.paragraphSpacingPt },
  { path: 'pageTypography.bodyThemeId', read: (d) => d.pageTypography.bodyThemeId },
  { path: 'pageTypography.monochrome', read: (d) => d.pageTypography.monochrome },
  { path: 'pageTypography.displayHeader', read: (d) => d.pageTypography.displayHeader },
];

/**
 * Derive the change-event drafts describing one tracked mutation, by
 * diffing the before/after documents along the fired handler's field
 * paths.  Pure; returns [] when nothing the model supports changed.
 * Unsupported surfaces (see module docblock) simply contribute nothing.
 */
export function deriveChangeDrafts(
  before: DocStudioDocument,
  after: DocStudioDocument,
  hint: ChangeCaptureHint,
): ChangeEventDraft[] {
  if (before === after) return [];

  switch (hint.kind) {
    case 'block-create': {
      const index = indexOfBlock(after, hint.blockId);
      if (index < 0) return [];
      return [
        {
          type: 'block-create',
          target: { kind: 'block', blockId: hint.blockId },
          payload: {
            block: deepCopy(after.blocks[index]),
            index,
            afterBlockId: afterIdAt(after.blocks, index),
          },
        },
      ];
    }
    case 'block-delete': {
      const index = indexOfBlock(before, hint.blockId);
      if (index < 0) return [];
      return [
        {
          type: 'block-delete',
          target: { kind: 'block', blockId: hint.blockId },
          payload: {
            block: deepCopy(before.blocks[index]),
            index,
            afterBlockId: afterIdAt(before.blocks, index),
          },
        },
      ];
    }
    case 'block-reorder': {
      const fromIndex = indexOfBlock(before, hint.blockId);
      const toIndex = indexOfBlock(after, hint.blockId);
      if (fromIndex < 0 || toIndex < 0 || fromIndex === toIndex) return [];
      return [
        {
          type: 'block-reorder',
          target: { kind: 'block', blockId: hint.blockId },
          payload: {
            fromIndex,
            toIndex,
            fromAfterBlockId: afterIdAt(before.blocks, fromIndex),
            toAfterBlockId: afterIdAt(after.blocks, toIndex),
          },
        },
      ];
    }
    case 'block-content': {
      const beforeIndex = indexOfBlock(before, hint.blockId);
      const afterIndex = indexOfBlock(after, hint.blockId);
      if (beforeIndex < 0 || afterIndex < 0) return [];
      return deriveBlockContentDrafts(before.blocks[beforeIndex], after.blocks[afterIndex]);
    }
    case 'metadata': {
      const drafts: ChangeEventDraft[] = [];
      for (const key of TRACKED_METADATA_KEYS) {
        const draft = makeScalarDraft(
          'metadata',
          key,
          before.metadata[key],
          after.metadata[key],
        );
        if (draft !== null) drafts.push(draft);
      }
      return drafts;
    }
    case 'settings': {
      const drafts: ChangeEventDraft[] = [];
      for (const leaf of SETTINGS_LEAVES) {
        const original = scalarOrNull(leaf.read(before));
        const replacement = scalarOrNull(leaf.read(after));
        if (original === undefined || replacement === undefined) continue;
        const draft = makeScalarDraft('settings', leaf.path, original, replacement);
        if (draft !== null) drafts.push(draft);
      }
      return drafts;
    }
  }
}

/** Outcome of the single tracked-commit seam (never throws). */
export interface TrackCaptureOutcome {
  /** The document to commit: events appended, or `after` unchanged. */
  doc: DocStudioDocument;
  /** Events appended by this commit (empty when nothing was recorded). */
  events: ChangeEvent[];
  /** True when tracked events were appended. */
  recorded: boolean;
  /** Human-readable tracking failure; the CONTENT edit still stands. */
  error: string | null;
}

/**
 * Append validated change events for one mutation - THE App commit seam.
 *
 * Rules (roadmap 7.2 "event creation and rejection handling"):
 * • No-op (`after === before`) records nothing.
 * • Tracking disabled records nothing and PRESERVES existing events.
 * • Drafts are validated by the P07-M1 service; an invalid draft fails
 *   the append ATOMICALLY (no partial log) and the ORIGINAL content
 *   edit is kept with a surfaced error - an edit is never lost to a
 *   tracking failure, and a rejected construction is never silent.
 */
export function commitTrackedChange(
  before: DocStudioDocument,
  after: DocStudioDocument,
  hint: ChangeCaptureHint,
  options: TrackChangeOptions = {},
): TrackCaptureOutcome {
  if (after === before || !before.trackChangesEnabled) {
    return { doc: after, events: [], recorded: false, error: null };
  }
  const drafts = deriveChangeDrafts(before, after, hint);
  if (drafts.length === 0) {
    return { doc: after, events: [], recorded: false, error: null };
  }
  const result = appendChangeEvents(after, drafts, options);
  if (!result.ok) {
    return { doc: after, events: [], recorded: false, error: result.message };
  }
  return { doc: result.doc, events: result.events, recorded: true, error: null };
}

// ─────────────────────────────────────────────────────────────────────────────
// Append (persistence-facing: the document field grows here)
// ─────────────────────────────────────────────────────────────────────────────

/** Result of appending validated events to the document log. */
export type AppendChangeEventsResult =
  | { ok: true; doc: DocStudioDocument; events: ChangeEvent[] }
  | { ok: false; code: string; message: string };

/**
 * Validate `drafts` through the P07-M1 construction service and append
 * them to `doc.changeEvents` (creating the optional key on first use).
 * ATOMIC: any invalid draft rejects the whole append with no document
 * change.  The log is append-only; existing events keep identity and
 * order.  `editorLabel` is stamped per event when provided.
 */
export function appendChangeEvents(
  doc: DocStudioDocument,
  drafts: readonly ChangeEventDraft[],
  options: TrackChangeOptions = {},
): AppendChangeEventsResult {
  if (drafts.length === 0) {
    return { ok: true, doc, events: [] };
  }
  const label = normalizeLabel(options.editorLabel);
  const events: ChangeEvent[] = [];
  for (const draft of drafts) {
    const shaped: ChangeEventDraft = label === undefined ? draft : { ...draft, editorLabel: label };
    const result = createChangeEvent(shaped, { now: options.now, genId: options.genId });
    if (!result.ok) {
      return { ok: false, code: result.code, message: result.message };
    }
    events.push(result.event);
  }
  return {
    ok: true,
    doc: { ...doc, changeEvents: [...documentChangeEvents(doc), ...events] },
    events,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Accept / reject operations (§12.1)
// ─────────────────────────────────────────────────────────────────────────────

/** Deterministic failure codes for accept/reject operations. */
export type TrackOpErrorCode =
  | 'event-not-found'
  | 'already-resolved'
  | 'stale-target'
  | 'dependent-changes'
  | 'block-conflict'
  | 'unsupported-reversal';

/** Result of one accept/reject operation. */
export type TrackOpResult =
  | { ok: true; doc: DocStudioDocument }
  | { ok: false; code: TrackOpErrorCode; message: string };

const opReject = (code: TrackOpErrorCode, message: string): TrackOpResult => ({
  ok: false,
  code,
  message,
});

interface LocatedEvent {
  event: ChangeEvent;
  index: number;
}

function locatePendingEvent(source: DocStudioDocument, eventId: DocUUID): TrackOpResult | LocatedEvent {
  const events = documentChangeEvents(source);
  const index = events.findIndex((event) => event.id === eventId);
  if (index < 0) {
    return opReject('event-not-found', 'This change event no longer exists in the document history.');
  }
  const event = events[index];
  if (event.status !== 'pending') {
    return opReject(
      'already-resolved',
      `This change was already ${event.status} and will not be resolved again.`,
    );
  }
  return { event, index };
}

/** Replace one event in the log (identity/order preserved elsewhere). */
function withEventStatus(
  source: DocStudioDocument,
  index: number,
  status: Exclude<ChangeStatus, 'pending'>,
  now: ISODateString,
): DocStudioDocument {
  const events = [...documentChangeEvents(source)];
  events[index] = { ...events[index], status };
  return {
    ...source,
    changeEvents: events,
    metadata: { ...source.metadata, modifiedAt: now },
  };
}

/**
 * Accept a pending change: the CURRENT document content stands (it
 * already reflects the edit) and the event is marked `accepted`.
 * Accepting is always resolvable - it never reverses content, so a
 * stale target cannot make it unsafe.
 */
export function acceptChange(
  source: DocStudioDocument,
  eventId: DocUUID,
  options: TrackChangeOptions = {},
): TrackOpResult {
  const located = locatePendingEvent(source, eventId);
  if ('ok' in located) return located;
  return {
    ok: true,
    doc: withEventStatus(source, located.index, 'accepted', options.now ?? nowISO()),
  };
}

const HEADING_PROPERTY_FIELDS = ['level', 'numbered', 'hAlign'] as const;
const PARAGRAPH_PROPERTY_FIELDS = ['hAlign', 'indentLevel'] as const;

/** Current field value for a block-field locator, when tracked in P07-M2. */
function readBlockFieldValue(
  block: ContentBlock,
  field: string,
): { value: ChangeScalarValue | undefined; spans?: readonly InlineSpan[] } {
  if (block.data.type === 'heading') {
    if (field === 'text') return { value: block.data.text };
    if ((HEADING_PROPERTY_FIELDS as readonly string[]).includes(field)) {
      return { value: scalarOrNull(block.data[field as 'level' | 'numbered' | 'hAlign']) };
    }
  } else if (block.data.type === 'paragraph') {
    if (field === 'text') return { value: spansToPlainText(block.data.spans), spans: block.data.spans };
    if (field === 'spans') return { value: undefined, spans: block.data.spans };
    if ((PARAGRAPH_PROPERTY_FIELDS as readonly string[]).includes(field)) {
      return { value: scalarOrNull(block.data[field as 'hAlign' | 'indentLevel']) };
    }
  }
  if (field === 'spacing.topPt') return { value: block.spacing.topPt };
  if (field === 'spacing.bottomPt') return { value: block.spacing.bottomPt };
  return { value: undefined };
}

/**
 * Restore a block-field value to its recorded original through the SAME
 * immutable content services the editors use.  Paragraph text restores
 * the original plain text without later inline styling (documented
 * limitation of the field-level text model).
 */
function restoreBlockField(
  doc: DocStudioDocument,
  block: ContentBlock,
  field: string,
  original: ChangeScalarValue | readonly InlineSpan[],
  now: ISODateString,
): TrackOpResult | { ok: true; doc: DocStudioDocument } {
  const fail = (message: string): TrackOpResult =>
    opReject('unsupported-reversal', message);
  if (block.data.type === 'heading') {
    if (field === 'text') {
      if (typeof original !== 'string') return fail('The recorded original heading text is not a string.');
      const result = updateHeadingContent(doc, block.id, { text: original }, { now });
      return result.ok ? { ok: true, doc: result.doc } : fail(result.message);
    }
    if (field === 'level') {
      if (original !== 1 && original !== 2 && original !== 3 && original !== 4) {
        return fail('The recorded original heading level is not 1-4.');
      }
      const result = updateHeadingContent(doc, block.id, { level: original }, { now });
      return result.ok ? { ok: true, doc: result.doc } : fail(result.message);
    }
    if (field === 'numbered') {
      if (typeof original !== 'boolean') return fail('The recorded original numbered flag is not a boolean.');
      const result = updateHeadingContent(doc, block.id, { numbered: original }, { now });
      return result.ok ? { ok: true, doc: result.doc } : fail(result.message);
    }
    if (field === 'hAlign') {
      if (original !== 'left' && original !== 'center' && original !== 'right') {
        return fail('The recorded original heading alignment is not supported.');
      }
      const result = updateHeadingContent(doc, block.id, { hAlign: original as HAlignment }, { now });
      return result.ok ? { ok: true, doc: result.doc } : fail(result.message);
    }
    return fail(`Reversing "${field}" on a heading is not supported in P07-M2.`);
  }
  if (block.data.type === 'paragraph') {
    if (field === 'text') {
      if (typeof original !== 'string') return fail('The recorded original paragraph text is not a string.');
      const result = updateParagraphContent(
        doc,
        block.id,
        { spans: plainTextToSpans(original) },
        { now },
      );
      return result.ok ? { ok: true, doc: result.doc } : fail(result.message);
    }
    if (field === 'spans') {
      const result = updateParagraphContent(doc, block.id, { spans: deepCopy(original as InlineSpan[]) }, { now });
      return result.ok ? { ok: true, doc: result.doc } : fail(result.message);
    }
    if (field === 'hAlign') {
      if (original !== 'left' && original !== 'center' && original !== 'right' && original !== 'justify') {
        return fail('The recorded original paragraph alignment is not supported.');
      }
      const result = updateParagraphContent(
        doc,
        block.id,
        { hAlign: original as ParagraphAlignment },
        { now },
      );
      return result.ok ? { ok: true, doc: result.doc } : fail(result.message);
    }
    if (field === 'indentLevel') {
      if (typeof original !== 'number' || !Number.isInteger(original) || original < 0) {
        return fail('The recorded original indent level is not a non-negative integer.');
      }
      const result = updateParagraphContent(doc, block.id, { indentLevel: original }, { now });
      return result.ok ? { ok: true, doc: result.doc } : fail(result.message);
    }
    return fail(`Reversing "${field}" on a paragraph is not supported in P07-M2.`);
  }
  if (field === 'spacing.topPt' || field === 'spacing.bottomPt') {
    if (typeof original !== 'number') return fail('The recorded original spacing is not a number.');
    const result = updateBlockSpacing(
      doc,
      block.id,
      field === 'spacing.topPt' ? 'topPt' : 'bottomPt',
      original,
      { now },
    );
    return result.ok ? { ok: true, doc: result.doc } : fail(result.message);
  }
  return fail(`Reversing "${field}" is not supported in P07-M2.`);
}

/** Read the current scalar at a tracked settings path. */
function readSettingsLeaf(doc: DocStudioDocument, path: string): ChangeScalarValue | undefined {
  const leaf = SETTINGS_LEAVES.find((entry) => entry.path === path);
  return leaf === undefined ? undefined : scalarOrNull(leaf.read(doc));
}

/** Restore one tracked settings leaf to `original` via the P04-M1 services. */
function restoreSettingsLeaf(
  doc: DocStudioDocument,
  path: string,
  original: ChangeScalarValue,
  now: ISODateString,
): TrackOpResult {
  const fail = (message: string): TrackOpResult =>
    opReject('unsupported-reversal', message);
  const settings = doc.pageSetup;
  switch (path) {
    case 'pageSetup.size': {
      const result = updatePageSetup(doc, { field: 'size', size: original as PageSize }, now);
      return result.ok ? { ok: true, doc: result.doc } : fail(result.message);
    }
    case 'pageSetup.orientation': {
      const result = updatePageSetup(
        doc,
        { field: 'orientation', orientation: original as PageOrientation },
        now,
      );
      return result.ok ? { ok: true, doc: result.doc } : fail(result.message);
    }
    case 'pageSetup.margins.preset': {
      const result = updatePageSetup(
        doc,
        { field: 'marginPreset', preset: original as typeof settings.margins.preset },
        now,
      );
      return result.ok ? { ok: true, doc: result.doc } : fail(result.message);
    }
    case 'pageSetup.margins.topMm':
    case 'pageSetup.margins.bottomMm':
    case 'pageSetup.margins.leftMm':
    case 'pageSetup.margins.rightMm': {
      if (typeof original !== 'number') return fail('The recorded original margin is not a number.');
      const margins = settings.margins;
      const result = updatePageSetup(
        doc,
        {
          field: 'customMargins',
          topMm: path.endsWith('.topMm') ? original : margins.topMm,
          bottomMm: path.endsWith('.bottomMm') ? original : margins.bottomMm,
          leftMm: path.endsWith('.leftMm') ? original : margins.leftMm,
          rightMm: path.endsWith('.rightMm') ? original : margins.rightMm,
        },
        now,
      );
      return result.ok ? { ok: true, doc: result.doc } : fail(result.message);
    }
    case 'pageTypography.typography.fontFamily': {
      if (typeof original !== 'string') return fail('The recorded original font family is not a string.');
      const result = updateTypography(doc, { field: 'fontFamily', value: original }, now);
      return result.ok ? { ok: true, doc: result.doc } : fail(result.message);
    }
    case 'pageTypography.typography.baseFontSizePt':
    case 'pageTypography.typography.lineHeight':
    case 'pageTypography.typography.paragraphSpacingPt': {
      if (typeof original !== 'number') return fail('The recorded original typography value is not a number.');
      const field = path.endsWith('baseFontSizePt')
        ? 'baseFontSizePt'
        : path.endsWith('lineHeight')
          ? 'lineHeight'
          : 'paragraphSpacingPt';
      const result = updateTypography(doc, { field, value: original }, now);
      return result.ok ? { ok: true, doc: result.doc } : fail(result.message);
    }
    case 'pageTypography.bodyThemeId': {
      const result = updateBodyTheme(doc, { field: 'bodyThemeId', value: original as never }, now);
      return result.ok ? { ok: true, doc: result.doc } : fail(result.message);
    }
    case 'pageTypography.monochrome': {
      if (typeof original !== 'boolean') return fail('The recorded original monochrome flag is not a boolean.');
      const result = updateBodyTheme(doc, { field: 'monochrome', value: original }, now);
      return result.ok ? { ok: true, doc: result.doc } : fail(result.message);
    }
    case 'pageTypography.displayHeader': {
      if (typeof original !== 'boolean') return fail('The recorded original display-header flag is not a boolean.');
      const result = updateDisplayHeader(doc, original, now);
      return result.ok ? { ok: true, doc: result.doc } : fail(result.message);
    }
    default:
      return fail(`Reversing the settings field "${path}" is not supported in P07-M2.`);
  }
}

const TRACKED_METADATA_KEYS_SET: ReadonlySet<string> = new Set(TRACKED_METADATA_KEYS);

/** Other PENDING events that still reference the same block. */
function pendingDependencies(
  events: readonly ChangeEvent[],
  blockId: DocUUID,
  excludeId: DocUUID,
): number {
  let count = 0;
  for (const event of events) {
    if (event.id === excludeId || event.status !== 'pending') continue;
    if (event.target.kind !== 'document' && event.target.blockId === blockId) count += 1;
  }
  return count;
}

/**
 * Reject a pending change: reverse the recorded edit through the same
 * immutable services, then mark the event `rejected`.
 *
 * Safety rules (§12.1 "where supported" + the P07-M1 stale-event policy):
 * • The reversal is applied ONLY when the target still resolves and its
 *   current value equals the event's recorded `replacement` - a target
 *   that moved again (outside tracked flow) is STALE and fails with an
 *   explicit message; the document and the event are untouched.
 * • Rejecting a `block-create` while other PENDING events reference the
 *   created block fails as DEPENDENT - resolve the dependents first.
 * • Every failure is explicit; nothing is silently dropped or partially
 *   applied (each operation is atomic by the underlying services).
 */
export function rejectChange(
  source: DocStudioDocument,
  eventId: DocUUID,
  options: TrackChangeOptions = {},
): TrackOpResult {
  const located = locatePendingEvent(source, eventId);
  if ('ok' in located) return located;
  const { event, index } = located;
  const now = options.now ?? nowISO();

  const done = (after: DocStudioDocument): TrackOpResult => ({
    ok: true,
    doc: withEventStatus(after, index, 'rejected', now),
  });

  switch (event.type) {
    case 'text':
    case 'formatting': {
      const blockIndex = indexOfBlock(source, event.target.blockId);
      if (blockIndex < 0) {
        return opReject(
          'stale-target',
          'The affected block no longer exists in this document, so this change can no longer be reversed.',
        );
      }
      const block = source.blocks[blockIndex];
      const field = event.target.field;

      if (event.type === 'text') {
        const current = readBlockFieldValue(block, field);
        if (current.value === undefined) {
          return opReject(
            'unsupported-reversal',
            `Reversing the text field "${field}" on this block type is not supported in P07-M2.`,
          );
        }
        if (current.value !== event.payload.replacement) {
          return opReject(
            'stale-target',
            `The field "${field}" changed again after this tracked edit, so restoring its original value is no longer safe.`,
          );
        }
        const restored = restoreBlockField(source, block, field, event.payload.original, now);
        if (!restored.ok) return restored;
        return done(restored.doc);
      }

      // formatting
      if (event.payload.kind === 'spans') {
        if (block.data.type !== 'paragraph' || field !== 'spans') {
          return opReject(
            'unsupported-reversal',
            'This formatting change can no longer be reversed on the current block.',
          );
        }
        if (JSON.stringify(block.data.spans) !== JSON.stringify(event.payload.replacement)) {
          return opReject(
            'stale-target',
            'The text styling changed again after this tracked change, so restoring the original styling is no longer safe.',
          );
        }
        const restored = restoreBlockField(source, block, field, event.payload.original, now);
        if (!restored.ok) return restored;
        return done(restored.doc);
      }

      const current = readBlockFieldValue(block, field);
      if (current.value === undefined) {
        return opReject(
          'unsupported-reversal',
          `Reversing "${field}" on this block type is not supported in P07-M2.`,
        );
      }
      if (!isSameScalar(current.value, event.payload.replacement)) {
        return opReject(
          'stale-target',
          `"${field}" changed again after this tracked change, so restoring its original value is no longer safe.`,
        );
      }
      const restored = restoreBlockField(source, block, field, event.payload.original, now);
      if (!restored.ok) return restored;
      return done(restored.doc);
    }

    case 'block-create': {
      const blockIndex = indexOfBlock(source, event.target.blockId);
      if (blockIndex < 0) {
        return opReject(
          'stale-target',
          'The created block is no longer in this document, so its creation can no longer be reversed.',
        );
      }
      const dependencies = pendingDependencies(documentChangeEvents(source), event.target.blockId, event.id);
      if (dependencies > 0) {
        return opReject(
          'dependent-changes',
          `This block still has ${dependencies} pending tracked change(s). Accept or reject them first, then reverse the block creation.`,
        );
      }
      const result = deleteBlock(source, event.target.blockId, { now });
      if (!result.ok) return opReject('stale-target', result.message);
      return done(result.doc);
    }

    case 'block-delete': {
      if (indexOfBlock(source, event.target.blockId) >= 0) {
        return opReject(
          'block-conflict',
          'A block with this identity already exists in the document, so the deletion cannot be reversed.',
        );
      }
      const { block, afterBlockId } = event.payload;
      let insertAt = 0;
      if (afterBlockId !== null) {
        const neighbour = indexOfBlock(source, afterBlockId);
        insertAt = neighbour >= 0 ? neighbour + 1 : Math.min(event.payload.index, source.blocks.length);
      } else {
        insertAt = 0;
      }
      const blocks = [...source.blocks];
      blocks.splice(insertAt, 0, deepCopy(block));
      return done({
        ...source,
        blocks,
        metadata: { ...source.metadata, modifiedAt: now },
      });
    }

    case 'block-reorder': {
      const currentIndex = indexOfBlock(source, event.target.blockId);
      if (currentIndex < 0) {
        return opReject(
          'stale-target',
          'The moved block no longer exists in this document, so the move can no longer be reversed.',
        );
      }
      let originIndex = event.payload.fromIndex;
      if (event.payload.fromAfterBlockId !== null) {
        const neighbour = indexOfBlock(source, event.payload.fromAfterBlockId);
        originIndex = neighbour >= 0 ? neighbour + 1 : event.payload.fromIndex;
      }
      originIndex = Math.max(0, Math.min(originIndex, source.blocks.length - 1));
      const result = moveBlockTo(source, event.target.blockId, originIndex, { now });
      if (!result.ok) return opReject('stale-target', result.message);
      return done(result.doc);
    }

    case 'metadata': {
      const field = event.target.field;
      if (!TRACKED_METADATA_KEYS_SET.has(field)) {
        return opReject(
          'unsupported-reversal',
          `Reversing the metadata field "${field}" is not supported in P07-M2.`,
        );
      }
      const current = scalarOrNull(source.metadata[field as 'title']);
      if (!isSameScalar(current ?? null, event.payload.replacement)) {
        return opReject(
          'stale-target',
          `The metadata field "${field}" changed again after this tracked change, so restoring its original value is no longer safe.`,
        );
      }
      const result = updateDocumentMetadata(
        source,
        { [field]: event.payload.original } as Partial<DocStudioDocument['metadata']>,
        now,
      );
      return done(result);
    }

    case 'settings': {
      const field = event.target.field;
      const current = readSettingsLeaf(source, field);
      if (current === undefined) {
        return opReject(
          'unsupported-reversal',
          `Reversing the settings field "${field}" is not supported in P07-M2.`,
        );
      }
      if (!isSameScalar(current, event.payload.replacement)) {
        return opReject(
          'stale-target',
          `The settings field "${field}" changed again after this tracked change, so restoring its original value is no longer safe.`,
        );
      }
      return restoreSettingsLeaf(source, field, event.payload.original, now);
    }
  }
}

/** Result of the bulk accept operation. */
export interface BulkAcceptResult {
  ok: true;
  doc: DocStudioDocument;
  resolved: number;
}

/**
 * Accept EVERY pending change at once: all pending events are marked
 * `accepted`; document content is untouched (accept never mutates
 * content), so the operation is trivially consistent.
 */
export function acceptAllChanges(
  source: DocStudioDocument,
  options: TrackChangeOptions = {},
): BulkAcceptResult {
  const events = documentChangeEvents(source);
  const resolved = events.filter((event) => event.status === 'pending').length;
  if (resolved === 0) return { ok: true, doc: source, resolved: 0 };
  const now = options.now ?? nowISO();
  const next = events.map((event) =>
    event.status === 'pending' ? { ...event, status: 'accepted' as const } : event,
  );
  return {
    ok: true,
    doc: {
      ...source,
      changeEvents: next,
      metadata: { ...source.metadata, modifiedAt: now },
    },
    resolved,
  };
}

/** One unresolvable event in a bulk rejection. */
export interface BulkRejectFailure {
  id: DocUUID;
  message: string;
}

/** Result of the bulk reject operation (partial success reported honestly). */
export interface BulkRejectResult {
  ok: true;
  doc: DocStudioDocument;
  resolved: number;
  failures: BulkRejectFailure[];
}

/**
 * Reject EVERY pending change, applying reversals in REVERSE log order
 * (the recorded application order inverted) so dependent chains unwind
 * consistently.  Each event is resolved atomically; an event that cannot
 * be reversed (stale, dependent, unsupported) stays PENDING, is listed
 * in `failures`, and never prevents the others from resolving - the
 * result is a consistent document plus an honest report, never a silent
 * drop or a partial mutation of a failed event.
 */
export function rejectAllChanges(
  source: DocStudioDocument,
  options: TrackChangeOptions = {},
): BulkRejectResult {
  let doc = source;
  let resolved = 0;
  const failures: BulkRejectFailure[] = [];
  const pendingIds = documentChangeEvents(source)
    .filter((event) => event.status === 'pending')
    .map((event) => event.id);
  for (let i = pendingIds.length - 1; i >= 0; i -= 1) {
    const result = rejectChange(doc, pendingIds[i], options);
    if (result.ok) {
      doc = result.doc;
      resolved += 1;
    } else {
      failures.push({ id: pendingIds[i], message: result.message });
    }
  }
  return { ok: true, doc, resolved, failures };
}

// ─────────────────────────────────────────────────────────────────────────────
// Markup derivation (editor + renderer consume these; §12.1 visibility)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * One derived fragment of a field-level text replacement.  Fine-grained
 * inserted/deleted fragments are DERIVED here (common prefix/suffix diff
 * of `original`/`replacement`) exactly as the P07-M1 record anticipates;
 * the stored event stays one atomic field-level replacement.
 */
export interface TextSegment {
  kind: 'equal' | 'delete' | 'insert';
  text: string;
}

/** Common prefix/suffix diff of a field-level before/after pair. */
export function deriveTextSegments(original: string, replacement: string): TextSegment[] {
  if (original === replacement) {
    return original === '' ? [] : [{ kind: 'equal', text: original }];
  }
  let prefix = 0;
  const maxPrefix = Math.min(original.length, replacement.length);
  while (prefix < maxPrefix && original[prefix] === replacement[prefix]) prefix += 1;
  let suffix = 0;
  const maxSuffix = Math.min(original.length, replacement.length) - prefix;
  while (
    suffix < maxSuffix &&
    original[original.length - 1 - suffix] === replacement[replacement.length - 1 - suffix]
  ) {
    suffix += 1;
  }
  const segments: TextSegment[] = [];
  if (prefix > 0) segments.push({ kind: 'equal', text: replacement.slice(0, prefix) });
  const oldMiddle = original.slice(prefix, original.length - suffix);
  const newMiddle = replacement.slice(prefix, replacement.length - suffix);
  if (oldMiddle !== '') segments.push({ kind: 'delete', text: oldMiddle });
  if (newMiddle !== '') segments.push({ kind: 'insert', text: newMiddle });
  if (suffix > 0) segments.push({ kind: 'equal', text: replacement.slice(replacement.length - suffix) });
  return segments;
}

/** Slice a span list to the half-open character range [start, end). */
export function sliceSpanRange(
  spans: readonly InlineSpan[],
  start: number,
  end: number,
): InlineSpan[] {
  const out: InlineSpan[] = [];
  let cursor = 0;
  for (const span of spans) {
    const spanStart = cursor;
    const spanEnd = cursor + span.text.length;
    cursor = spanEnd;
    if (spanEnd <= start || spanStart >= end) continue;
    const from = Math.max(start, spanStart) - spanStart;
    const to = Math.min(end, spanStart + span.text.length) - spanStart;
    const text = span.text.slice(from, to);
    if (text !== '') out.push({ ...span, text });
  }
  return out;
}

/** One styled run of markup rendering: text + spans + the applied mark. */
export interface MarkupRun {
  text: string;
  spans: InlineSpan[];
  mark: 'delete' | 'insert' | null;
}

/**
 * Turn a field-level text replacement into STYLED markup runs: equal and
 * inserted fragments keep the CURRENT (replacement) span styling, the
 * deleted fragment keeps the ORIGINAL span styling, deletions are forced
 * to strikethrough and insertions to underline - the non-color visual
 * convention required by §12.1 (readable without relying on color).
 */
export function markupRuns(
  original: string,
  replacement: string,
  originalSpans: readonly InlineSpan[],
  replacementSpans: readonly InlineSpan[],
): MarkupRun[] {
  const runs: MarkupRun[] = [];
  let rOffset = 0; // cursor into `replacement`
  let oOffset = 0; // cursor into `original`
  for (const segment of deriveTextSegments(original, replacement)) {
    if (segment.kind === 'delete') {
      const spans = sliceSpanRange(originalSpans, oOffset, oOffset + segment.text.length).map(
        (span) => {
          const next = { ...span };
          delete next.underline;
          next.strikethrough = true;
          return next;
        },
      );
      runs.push({ text: segment.text, spans, mark: 'delete' });
      oOffset += segment.text.length;
    } else {
      const spans = sliceSpanRange(replacementSpans, rOffset, rOffset + segment.text.length);
      if (segment.kind === 'insert') {
        runs.push({
          text: segment.text,
          spans: spans.map((span) => ({ ...span, underline: true })),
          mark: 'insert',
        });
      } else {
        runs.push({ text: segment.text, spans, mark: null });
      }
      rOffset += segment.text.length;
      oOffset += segment.text.length;
    }
  }
  return runs;
}

/** A pending block-delete event resolved to its ghost render position. */
export interface GhostPlacement {
  event: ChangeEventOfType<'block-delete'>;
  /** Render the ghost directly AFTER this existing block ... */
  afterBlockId: DocUUID | null;
  /** ... or, when the neighbour is gone, after this block INDEX (-1 = start). */
  afterIndex: number;
}

/** Per-block pending events + ghost placements for markup rendering. */
export interface ChangeViewContext {
  /** Pending events per EXISTING block (block-delete ghosts excluded). */
  byBlock: Map<DocUUID, ChangeEvent[]>;
  /** Pending deleted blocks to ghost-render at their recorded position. */
  ghosts: GhostPlacement[];
}

/**
 * Build the markup context for the editor and the PDF renderer from the
 * authoritative blocks + event log.  Returns NULL when no pending change
 * exists - the single guard that keeps every markup surface (and the
 * exported bytes) byte-identical to the pre-Track-Changes output when
 * there is nothing to mark.
 */
export function buildChangeViewContext(
  blocks: readonly ContentBlock[],
  events: readonly ChangeEvent[],
): ChangeViewContext | null {
  const byBlock = new Map<DocUUID, ChangeEvent[]>();
  const ghosts: GhostPlacement[] = [];
  for (const event of events) {
    if (event.status !== 'pending') continue;
    if (event.type === 'block-delete') {
      if (event.payload.afterBlockId === null) {
        // Deleted at document start: ghost renders before the first block.
        ghosts.push({ event, afterBlockId: null, afterIndex: -1 });
      } else {
        const neighbour = blocks.findIndex((block) => block.id === event.payload.afterBlockId);
        ghosts.push({
          event,
          afterBlockId: event.payload.afterBlockId,
          // Resolved neighbour index, or the recorded point-in-time index
          // clamped into the current document when the neighbour is gone.
          afterIndex: neighbour >= 0 ? neighbour : Math.min(event.payload.index, blocks.length) - 1,
        });
      }
      continue;
    }
    if (event.target.kind === 'document') continue;
    const list = byBlock.get(event.target.blockId);
    if (list === undefined) byBlock.set(event.target.blockId, [event]);
    else list.push(event);
  }
  if (byBlock.size === 0 && ghosts.length === 0) return null;
  return { byBlock, ghosts };
}

/** Convenience wrapper over the document's optional event log. */
export function buildDocumentChangeViewContext(
  doc: DocStudioDocument,
): ChangeViewContext | null {
  return buildChangeViewContext(doc.blocks, documentChangeEvents(doc));
}

/**
 * The OLDEST pending field-level text event for one block's events, when
 * any.  Markup renders the CUMULATIVE extent (oldest original → current
 * text) when several pending text edits stack on the same field, so the
 * visual always matches the live content at its edges.
 */
export function pendingTextEventFor(
  events: readonly ChangeEvent[] | undefined,
): ChangeEventOfType<'text'> | undefined {
  if (events === undefined) return undefined;
  return events.find(
    (event): event is ChangeEventOfType<'text'> =>
      event.status === 'pending' && event.type === 'text' && event.target.field === 'text',
  );
}

/**
 * Short, text-only markup cue lines for one block's pending events, in
 * log order — the non-color visual convention §12.1 requires (readable
 * in print without relying on color).  Text events are NOT cued here:
 * their inline deleted/inserted markup carries the signal.
 */
export function describeBlockMarkupCues(events: readonly ChangeEvent[] | undefined): string[] {
  if (events === undefined) return [];
  const cues: string[] = [];
  for (const event of events) {
    if (event.status !== 'pending') continue;
    switch (event.type) {
      case 'block-create':
        cues.push('Inserted');
        break;
      case 'block-reorder':
        cues.push('Moved');
        break;
      case 'formatting':
        if (event.payload.kind === 'spans') {
          cues.push(`Formatting: text styling changed (${event.target.field})`);
        } else {
          cues.push(
            `Formatting: ${event.target.field} ${String(event.payload.original)} → ${String(event.payload.replacement)}`,
          );
        }
        break;
      default:
        break;
    }
  }
  return cues;
}

// ─────────────────────────────────────────────────────────────────────────────
// Review-list descriptions (Track Changes panel)
// ─────────────────────────────────────────────────────────────────────────────

const MAX_PREVIEW_LENGTH = 120;

const preview = (value: string): string => {
  const collapsed = value.replace(/\s+/g, ' ').trim();
  if (collapsed === '') return '(empty)';
  return collapsed.length > MAX_PREVIEW_LENGTH
    ? `${collapsed.slice(0, MAX_PREVIEW_LENGTH - 1)}…`
    : collapsed;
};

/** Human-readable summary of one event for the review list. */
export interface ChangeDescription {
  /** Short category title, e.g. "Text change". */
  title: string;
  /** Affected block/field description. */
  target: string;
  /** Previous value preview, when the event carries one. */
  before?: string;
  /** Replacement value preview, when the event carries one. */
  after?: string;
}

const BLOCK_DELETE_LABELS: Record<string, string> = {
  'block-create': 'Block inserted',
  'block-delete': 'Block deleted',
  'block-reorder': 'Block moved',
};

/** Describe one change event for the review surface (§12.1 attribution). */
export function describeChangeEvent(
  event: ChangeEvent,
  blocks: readonly ContentBlock[],
): ChangeDescription {
  const blockAt = (id: DocUUID): ContentBlock | undefined =>
    blocks.find((block) => block.id === id);
  const blockName = (id: DocUUID): string => {
    const block = blockAt(id);
    if (block === undefined) return 'Block';
    return BLOCK_REGISTRY[block.data.type]?.displayName ?? 'Block';
  };

  switch (event.type) {
    case 'text':
      return {
        title: 'Text change',
        target: `${blockName(event.target.blockId)} — ${event.target.field}`,
        before: preview(event.payload.original),
        after: preview(event.payload.replacement),
      };
    case 'formatting':
      if (event.payload.kind === 'spans') {
        return {
          title: 'Formatting change',
          target: `${blockName(event.target.blockId)} — text styling`,
          before: '(styled text)',
          after: '(styled text)',
        };
      }
      return {
        title: 'Formatting change',
        target: `${blockName(event.target.blockId)} — ${event.target.field}`,
        before: preview(String(event.payload.original)),
        after: preview(String(event.payload.replacement)),
      };
    case 'block-create':
    case 'block-delete':
    case 'block-reorder':
      return {
        title: BLOCK_DELETE_LABELS[event.type] ?? 'Block change',
        target: `${blockName(event.target.blockId)} #${event.type === 'block-reorder' ? event.payload.toIndex + 1 : event.payload.index + 1}`,
      };
    case 'metadata':
      return {
        title: 'Metadata change',
        target: event.target.field,
        before: preview(String(event.payload.original)),
        after: preview(String(event.payload.replacement)),
      };
    case 'settings':
      return {
        title: 'Settings change',
        target: event.target.field,
        before: preview(String(event.payload.original)),
        after: preview(String(event.payload.replacement)),
      };
  }
}
