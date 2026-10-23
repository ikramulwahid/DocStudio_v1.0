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
 * WHAT IS CAPTURED (P07-M2, its content coverage completed by the
 * P07-M2-R1 correction; §12.1)
 * ──────────────────────────────────────────────────────────────────────
 * Every family below is captured from the SAME immutable editing paths at
 * the single App seam - there is no second capture mechanism and no
 * parallel event format; the P07-M1 model is preserved unchanged.
 * • HEADING (`text`, `level`, `numbered`, `hAlign`) and PARAGRAPH
 *   (`spans` text projection, styling, `hAlign`, `indentLevel`).
 * • TABLE: cell text/spans/alignment (addressed by STABLE row+cell ids),
 *   caption, `hasHeaderRow`, `headerStyle`.  A removed row/column
 *   surfaces as per-cell text-deletion events; rebuilding a removed row
 *   from a field-level payload is not supported (see REVERSAL SCOPE).
 * • LIST: item text/spans (stable item ids), item `depth`, checklist
 *   `checked` toggles, `listType`/`bulletStyle`/`numberStyle`.
 * • CALLOUT: `title`, body text/spans, `variant`.
 * • FORMULA: `latex`, `formulaNumber`, `whereLabelOverride`, `hAlign`,
 *   `displayMode`, variable-definition `symbol`/`definition`/`unit`.
 *   There is no calculation engine - only authored text is tracked.
 * • IMAGE: slot `caption` text and deterministic asset-reference swaps
 *   (`images[{id}].assetId`, recorded from the actual asset records).
 *   Image size/crop/layout/alignment are non-text designer properties
 *   and stay inside the open owner-boundary question (roadmap P07-M2-R1).
 * • SIGNATURE: signer `role`/`name`/`designation`/`department`/`date`.
 *   The 1-3 signer rule and the signer-row alignment are service/editor
 *   concerns, not text - no auth or identity claim is made anywhere.
 * • STRUCTURAL: section-break `title`; revision-history entry
 *   `revision`/`date`/`author`/`description`; reference `title` plus
 *   entry `key`/`citation`/`url`; exhibit `label`/`title`/`notes` and
 *   its asset reference.  A page break has no text; a horizontal rule
 *   has no text field in the model; `metadata-block.visibleFields` is a
 *   selection list (owner-boundary question), not text.
 * • LABORATORY (all six P06-M5 families, field-level - never whole-block
 *   replacement): procedure `sectionTitle` + step text/spans/`level`/
 *   `stepNumber`; equipment `title` + item `name`/`assetTag`/
 *   `manufacturer`/`modelNumber`/`calibrationDue`/`mandatory`;
 *   observation `title` + row `parameter`/`observedValue`/`remarks`;
 *   measurement `title` + column `header`/`unit` + per-cell values +
 *   `uncertaintyNote`; calculation `title` + step `label`/`latex`/
 *   `substitution`/`result`/`note` + `conclusionText`; acceptance
 *   `title` + criterion `criterion`/`specification`/`measuredValue`/
 *   `result`/`remarks` + `overallResult`.
 * • Spacing: `spacing.topPt` / `spacing.bottomPt` on any block (property).
 * • Block operations: create (insert + duplicate), delete, reorder -
 *   all block types.
 * • Metadata: the five scalar leaves (`title`, `subtitle`,
 *   `organizationName`, `documentId`, `status`).  `customFields` stays
 *   untracked (ambiguous per-leaf representation - owner-boundary
 *   question).  `createdAt`/`modifiedAt` are app-managed, never tracked.
 * • Settings: the 14 P07-M2 leaves (page setup / typography / theme) -
 *   unchanged.  ADDITIONALLY the designer TEXT values (P07-M2-R1 task I)
 *   are captured as settings events on their own dotted paths:
 *   `frontPage.synopsis`, `watermark.text`, and per-cell
 *   `headerFooter.{header|footer}.rows[{rowId}].cells[{cellId}].content`.
 *   Non-text designer configuration (themes, flags, sizes, logos, grid
 *   geometry, visible metadata fields, `fontFallbacks`) stays inside the
 *   open owner-boundary question - unchanged from the P07-M2 decision.
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
 * • repeatable children are addressed by their STABLE ids, NEVER by
 *   index, so a later reorder can never misdirect a reversal:
 *   `rows[{rowId}].cells[{cellId}].text|.spans|.hAlign`,
 *   `items[{itemId}].text|.spans|.depth|.checked`,
 *   `variableDefinitions[{id}].symbol|definition|unit`,
 *   `images[{imageId}].caption|.assetId`,
 *   `signers[{signerId}].role|name|designation|department|date`,
 *   `entries[{entryId}].<field>`, `steps[{stepId}].<field>`,
 *   `criteria[{criterionId}].<field>`, `columns[{columnId}].<field>`,
 *   `rows[{rowId}].values[{columnId}]` (measurement cell value).
 * • block-level family fields: `caption`, `hasHeaderRow`, `headerStyle`,
 *   `listType`, `bulletStyle`, `numberStyle`, `title`, `sectionTitle`,
 *   `variant`, `text`/`spans` (callout body), `latex`, `formulaNumber`,
 *   `whereLabelOverride`, `hAlign`, `displayMode`, `conclusionText`,
 *   `uncertaintyNote`, `overallResult`, `label`, `notes`.
 * • metadata / settings targets use dotted document-leaf paths, e.g.
 *   `title`, `pageSetup.margins.topMm`, `frontPage.synopsis`,
 *   `headerFooter.header.rows[{rowId}].cells[{cellId}].content`.
 *
 * TEXT LIMITATION (P07-M1 semantics, restated for consumers)
 * ─────────────────────────────────────────────────────────────────
 * Events store FIELD-LEVEL before/after strings; fine-grained inserted /
 * deleted fragments shown in markup are DERIVED by the common
 * prefix/suffix diff (`deriveTextSegments`) exactly as the P07-M1 record
 * anticipates.  Rejecting a text event restores the original plain text
 * WITHOUT the inline styling that later accumulated on the field (spans
 * are rebuilt via `plainTextToSpans`) - documented.
 *
 * REVERSAL SCOPE (the honest boundaries of Reject, §12.1 "where supported")
 * ──────────────────────────────────────────────────────────────────────
 * • In-place edits (a child field's text/spans/scalar changed while the
 *   child still exists) reverse through the SAME immutable content
 *   services that made them, guarded by the recorded replacement value -
 *   a target that moved again outside tracked flow is stale and fails
 *   explicitly; nothing is silently dropped.
 * • STRUCTURAL child operations are CAPTURED and marked, but rejecting
 *   them fails honestly instead of corrupting the structure: a removed
 *   row/cell/item/entry/signer/step/criterion cannot be rebuilt from a
 *   field-level payload (its identity and position are gone), and an
 *   added child's required-field seeds cannot always be cleared (the
 *   validating services refuse the empty state).  Both surface as
 *   explicit failures; the events stay pending until accepted.
 * • Child REORDERING (same ids, same text, new order) changes no text
 *   and produces no event - block-level reorder is the tracked event;
 *   representing a reorder as positional text events would fabricate
 *   text changes that never happened and make rejection unsafe.
 * • Rejecting an image asset swap restores the recorded asset reference
 *   only while the original asset record still exists in `doc.assets`
 *   (the swap action itself dropped the slot's crop - an excluded,
 *   non-text side effect that this checkpoint does not reverse).
 * • A styling-only (identical text) change on a TABLE CELL is captured
 *   but cannot be reversed: no content service writes raw cell spans
 *   (fails honestly as unsupported rather than rewriting the text).
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

import type {
  BulletStyle,
  CriteriaResult,
  InlineSpan,
  ListType,
  MeasurementRow,
  NumberStyle,
  ParagraphAlignment,
  ProcedureStepLevel,
  TableHeaderStyle,
  TableRow,
} from '../types/blocks';
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
import { setTableCellAlignment, setTableCellText, updateTableSettings } from './table-content';
import {
  indentListItem,
  outdentListItem,
  setItemChecked,
  updateCalloutContent,
  updateListItemText,
  updateListSettings,
} from './list-callout-content';
import { updateFormulaContent, updateVariableDefinition } from './formula-content';
import { setImageCaption, setSignerField } from './image-signature-content';
import {
  updateExhibitContent,
  updateReferenceEntry,
  updateReferenceTitle,
  updateRevisionEntry,
  updateSectionBreakContent,
} from './structural-block-content';
import {
  setAcceptanceOverallResult,
  setCalculationConclusion,
  setMeasurementCell,
  setMeasurementUncertaintyNote,
  updateAcceptanceCriterion,
  updateAcceptanceTitle,
  updateCalculationStep,
  updateCalculationTitle,
  updateEquipmentItem,
  updateEquipmentTitle,
  updateMeasurementColumn,
  updateMeasurementTitle,
  updateObservationRow,
  updateObservationTitle,
  updateProcedureStep,
  updateProcedureTitle,
} from './lab-block-content';
import { updateFrontPage } from './front-page';
import { applyHeaderFooterPatch, applyWatermarkPatch } from './header-footer-settings';
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

// ─────────────────────────────────────────────────────────────────────────────
// P07-M2-R1: content-family capture helpers (stable-id child diffing)
// ─────────────────────────────────────────────────────────────────────────────

/** Optional stored strings project as '' (the event's empty degenerate). */
const textOf = (value: string | undefined | null): string => value ?? '';

/** A `text` draft for one block field, or null when nothing changed. */
function makeTextDraft(
  blockId: DocUUID,
  field: string,
  original: string,
  replacement: string,
): ChangeEventDraft | null {
  if (original === replacement) return null;
  return {
    type: 'text',
    target: { kind: 'block-field', blockId, field },
    payload: { original, replacement },
  };
}

/** One tracked field of a repeatable (stable-id) child collection. */
interface ChildFieldSpec<T> {
  /** Locator field name: `text` for span carriers, else the stored name. */
  field: string;
  /** Plain-text projection for string fields. */
  text?: (child: T) => string;
  /** Rich-text carrier: `text` projection + `spans` styling events. */
  spans?: (child: T) => readonly InlineSpan[];
  /** Scalar property; emitted only when BOTH sides are defined. */
  scalar?: (child: T) => ChangeScalarValue | undefined;
}

/**
 * Diff one repeatable child collection between before/after by STABLE id.
 *
 * • Removed children contribute text-deletion events (their fields to '');
 *   rejecting such an event cannot rebuild the child and fails honestly.
 * • Added children contribute text-insertion events for their seeded
 *   fields; rejecting one clears the field through the real service.
 * • Common children are diffed field by field (text / spans styling /
 *   scalar), so a pure reorder (same ids and text, new order) yields NO
 *   events - a reorder is not a text change.
 */
function deriveChildDrafts<T extends { id: DocUUID }>(
  blockId: DocUUID,
  collection: string,
  beforeChildren: readonly T[],
  afterChildren: readonly T[],
  specs: readonly ChildFieldSpec<T>[],
): ChangeEventDraft[] {
  const drafts: ChangeEventDraft[] = [];
  const beforeById = new Map<string, T>(beforeChildren.map((child) => [child.id, child]));
  const afterById = new Map<string, T>(afterChildren.map((child) => [child.id, child]));

  // Plain-text projection of one spec (string fields and rich-text carriers
  // alike), so STRUCTURAL add/remove records text deletions/insertions for
  // spans-carrying children too (list items, table cells, procedure steps).
  const project = (child: T, spec: ChildFieldSpec<T>): string => {
    if (spec.text !== undefined) return spec.text(child);
    if (spec.spans !== undefined) {
      return spansToPlainText(spec.spans(child) as InlineSpan[]);
    }
    return '';
  };

  for (const child of beforeChildren) {
    if (afterById.has(child.id)) continue;
    for (const spec of specs) {
      const original = project(child, spec);
      if (original === '') continue;
      drafts.push({
        type: 'text',
        target: {
          kind: 'block-field',
          blockId,
          field: `${collection}[${child.id}].${spec.field}`,
        },
        payload: { original, replacement: '' },
      });
    }
  }

  for (const child of afterChildren) {
    if (beforeById.has(child.id)) continue;
    for (const spec of specs) {
      const replacement = project(child, spec);
      if (replacement === '') continue;
      drafts.push({
        type: 'text',
        target: {
          kind: 'block-field',
          blockId,
          field: `${collection}[${child.id}].${spec.field}`,
        },
        payload: { original: '', replacement },
      });
    }
  }

  for (const child of afterChildren) {
    const previous = beforeById.get(child.id);
    if (previous === undefined) continue;
    for (const spec of specs) {
      const base = `${collection}[${child.id}].${spec.field}`;
      if (spec.spans !== undefined) {
        const beforeSpans = spec.spans(previous);
        const afterSpans = spec.spans(child);
        const beforeText = spansToPlainText(beforeSpans as InlineSpan[]);
        const afterText = spansToPlainText(afterSpans as InlineSpan[]);
        if (beforeText !== afterText) {
          drafts.push({
            type: 'text',
            target: { kind: 'block-field', blockId, field: base },
            payload: { original: beforeText, replacement: afterText },
          });
        } else if (JSON.stringify(beforeSpans) !== JSON.stringify(afterSpans)) {
          drafts.push({
            type: 'formatting',
            target: { kind: 'block-field', blockId, field: `${collection}[${child.id}].spans` },
            payload: {
              kind: 'spans',
              original: deepCopy(beforeSpans),
              replacement: deepCopy(afterSpans),
            },
          });
        }
      } else if (spec.text !== undefined) {
        const draft = makeTextDraft(blockId, base, spec.text(previous), spec.text(child));
        if (draft !== null) drafts.push(draft);
      }
      if (spec.scalar !== undefined) {
        const original = spec.scalar(previous);
        const replacement = spec.scalar(child);
        if (original !== undefined && replacement !== undefined) {
          const draft = makeFormattingPropertyDraft(blockId, base, original, replacement);
          if (draft !== null) drafts.push(draft);
        }
      }
    }
  }
  return drafts;
}

/** Text/styling drafts for one block-level rich-text field (callout body). */
function deriveRichTextDrafts(
  blockId: DocUUID,
  textField: string,
  beforeSpans: readonly InlineSpan[],
  afterSpans: readonly InlineSpan[],
): ChangeEventDraft[] {
  const drafts: ChangeEventDraft[] = [];
  const beforeText = spansToPlainText(beforeSpans as InlineSpan[]);
  const afterText = spansToPlainText(afterSpans as InlineSpan[]);
  if (beforeText !== afterText) {
    drafts.push({
      type: 'text',
      target: { kind: 'block-field', blockId, field: textField },
      payload: { original: beforeText, replacement: afterText },
    });
  } else if (JSON.stringify(beforeSpans) !== JSON.stringify(afterSpans)) {
    drafts.push({
      type: 'formatting',
      target: { kind: 'block-field', blockId, field: 'spans' },
      payload: {
        kind: 'spans',
        original: deepCopy(beforeSpans),
        replacement: deepCopy(afterSpans),
      },
    });
  }
  return drafts;
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
  } else {
    drafts.push(...deriveFamilyContentDrafts(before, after));
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

/**
 * Diff one content block of any P07-M2-R1 tracked family (everything
 * except heading/paragraph, which keep their dedicated branches above).
 * Pure; returns [] when nothing the model supports changed, including
 * for families/fields deliberately held in the owner-boundary question.
 */
function deriveFamilyContentDrafts(
  before: ContentBlock,
  after: ContentBlock,
): ChangeEventDraft[] {
  const drafts: ChangeEventDraft[] = [];
  const blockId = after.id;
  const b = before.data;
  const a = after.data;
  if (b.type !== a.type) return drafts;

  const pushText = (field: string, original: string, replacement: string): void => {
    const draft = makeTextDraft(blockId, field, original, replacement);
    if (draft !== null) drafts.push(draft);
  };
  const pushProp = (
    field: string,
    original: ChangeScalarValue,
    replacement: ChangeScalarValue,
  ): void => {
    const draft = makeFormattingPropertyDraft(blockId, field, original, replacement);
    if (draft !== null) drafts.push(draft);
  };

  switch (a.type) {
    case 'callout': {
      if (b.type !== 'callout') break;
      pushText('title', textOf(b.title), textOf(a.title));
      drafts.push(...deriveRichTextDrafts(blockId, 'text', b.spans, a.spans));
      pushProp('variant', b.variant, a.variant);
      break;
    }
    case 'list': {
      if (b.type !== 'list') break;
      pushProp('listType', b.listType, a.listType);
      pushProp('bulletStyle', b.bulletStyle, a.bulletStyle);
      pushProp('numberStyle', b.numberStyle, a.numberStyle);
      drafts.push(
        ...deriveChildDrafts(blockId, 'items', b.items, a.items, [
          { field: 'text', spans: (item) => item.spans },
          { field: 'depth', scalar: (item) => item.depth },
          {
            field: 'checked',
            scalar: (item) => (typeof item.checked === 'boolean' ? item.checked : undefined),
          },
        ]),
      );
      break;
    }
    case 'table': {
      if (b.type !== 'table') break;
      pushText('caption', textOf(b.caption), textOf(a.caption));
      pushProp('hasHeaderRow', b.hasHeaderRow, a.hasHeaderRow);
      pushProp('headerStyle', b.headerStyle, a.headerStyle);
      const beforeRows = new Map<string, TableRow>(b.rows.map((row) => [row.id, row]));
      const afterRows = new Map<string, TableRow>(a.rows.map((row) => [row.id, row]));
      for (const row of b.rows) {
        if (afterRows.has(row.id)) continue;
        for (const cell of row.cells) {
          const text = spansToPlainText(cell.spans);
          if (text !== '') pushText(`rows[${row.id}].cells[${cell.id}].text`, text, '');
        }
      }
      for (const row of a.rows) {
        if (beforeRows.has(row.id)) continue;
        for (const cell of row.cells) {
          const text = spansToPlainText(cell.spans);
          if (text !== '') pushText(`rows[${row.id}].cells[${cell.id}].text`, '', text);
        }
      }
      for (const row of a.rows) {
        const previous = beforeRows.get(row.id);
        if (previous === undefined) continue;
        drafts.push(
          ...deriveChildDrafts(blockId, `rows[${row.id}].cells`, previous.cells, row.cells, [
            { field: 'text', spans: (cell) => cell.spans },
            { field: 'hAlign', scalar: (cell) => cell.hAlign },
          ]),
        );
      }
      break;
    }
    case 'formula': {
      if (b.type !== 'formula') break;
      pushText('latex', b.latex, a.latex);
      pushText('formulaNumber', textOf(b.formulaNumber), textOf(a.formulaNumber));
      pushText('whereLabelOverride', textOf(b.whereLabelOverride), textOf(a.whereLabelOverride));
      pushProp('hAlign', b.hAlign, a.hAlign);
      pushProp('displayMode', b.displayMode, a.displayMode);
      drafts.push(
        ...deriveChildDrafts(
          blockId,
          'variableDefinitions',
          b.variableDefinitions,
          a.variableDefinitions,
          [
            { field: 'symbol', text: (entry) => entry.symbol },
            { field: 'definition', text: (entry) => entry.definition },
            { field: 'unit', text: (entry) => textOf(entry.unit) },
          ],
        ),
      );
      break;
    }
    case 'image': {
      if (b.type !== 'image') break;
      drafts.push(
        ...deriveChildDrafts(blockId, 'images', b.images, a.images, [
          { field: 'caption', text: (image) => textOf(image.caption) },
          { field: 'assetId', text: (image) => textOf(image.assetId) },
        ]),
      );
      break;
    }
    case 'signature': {
      if (b.type !== 'signature') break;
      drafts.push(
        ...deriveChildDrafts(blockId, 'signers', b.signers, a.signers, [
          { field: 'role', text: (signer) => signer.role },
          { field: 'name', text: (signer) => textOf(signer.name) },
          { field: 'designation', text: (signer) => textOf(signer.designation) },
          { field: 'department', text: (signer) => textOf(signer.department) },
          { field: 'date', text: (signer) => textOf(signer.date) },
        ]),
      );
      break;
    }
    case 'section-break': {
      if (b.type !== 'section-break') break;
      pushText('title', textOf(b.title), textOf(a.title));
      break;
    }
    case 'revision-history': {
      if (b.type !== 'revision-history') break;
      drafts.push(
        ...deriveChildDrafts(blockId, 'entries', b.entries, a.entries, [
          { field: 'revision', text: (entry) => entry.revision },
          { field: 'date', text: (entry) => entry.date },
          { field: 'author', text: (entry) => entry.author },
          { field: 'description', text: (entry) => entry.description },
        ]),
      );
      break;
    }
    case 'reference': {
      if (b.type !== 'reference') break;
      pushText('title', textOf(b.title), textOf(a.title));
      drafts.push(
        ...deriveChildDrafts(blockId, 'entries', b.entries, a.entries, [
          { field: 'key', text: (entry) => entry.key },
          { field: 'citation', text: (entry) => entry.citation },
          { field: 'url', text: (entry) => textOf(entry.url) },
        ]),
      );
      break;
    }
    case 'exhibit': {
      if (b.type !== 'exhibit') break;
      pushText('label', b.label, a.label);
      pushText('title', textOf(b.title), textOf(a.title));
      pushText('notes', textOf(b.notes), textOf(a.notes));
      pushText('assetId', textOf(b.assetId), textOf(a.assetId));
      break;
    }
    case 'procedure-step': {
      if (b.type !== 'procedure-step') break;
      pushText('sectionTitle', textOf(b.sectionTitle), textOf(a.sectionTitle));
      drafts.push(
        ...deriveChildDrafts(blockId, 'steps', b.steps, a.steps, [
          { field: 'text', spans: (step) => step.spans },
          { field: 'stepNumber', text: (step) => textOf(step.stepNumber) },
          { field: 'level', scalar: (step) => step.level },
        ]),
      );
      break;
    }
    case 'equipment-list': {
      if (b.type !== 'equipment-list') break;
      pushText('title', textOf(b.title), textOf(a.title));
      drafts.push(
        ...deriveChildDrafts(blockId, 'items', b.items, a.items, [
          { field: 'name', text: (item) => item.name },
          { field: 'assetTag', text: (item) => textOf(item.assetTag) },
          { field: 'manufacturer', text: (item) => textOf(item.manufacturer) },
          { field: 'modelNumber', text: (item) => textOf(item.modelNumber) },
          { field: 'calibrationDue', text: (item) => textOf(item.calibrationDue) },
          { field: 'mandatory', scalar: (item) => item.mandatory },
        ]),
      );
      break;
    }
    case 'observation': {
      if (b.type !== 'observation') break;
      pushText('title', textOf(b.title), textOf(a.title));
      drafts.push(
        ...deriveChildDrafts(blockId, 'rows', b.rows, a.rows, [
          { field: 'parameter', text: (row) => row.parameter },
          { field: 'observedValue', text: (row) => textOf(row.observedValue) },
          { field: 'remarks', text: (row) => textOf(row.remarks) },
        ]),
      );
      break;
    }
    case 'measurement': {
      if (b.type !== 'measurement') break;
      pushText('title', textOf(b.title), textOf(a.title));
      pushText('uncertaintyNote', textOf(b.uncertaintyNote), textOf(a.uncertaintyNote));
      drafts.push(
        ...deriveChildDrafts(blockId, 'columns', b.columns, a.columns, [
          { field: 'header', text: (column) => column.header },
          { field: 'unit', text: (column) => textOf(column.unit) },
        ]),
      );
      const beforeRows = new Map<string, MeasurementRow>(b.rows.map((row) => [row.id, row]));
      const afterRows = new Map<string, MeasurementRow>(a.rows.map((row) => [row.id, row]));
      for (const row of b.rows) {
        if (afterRows.has(row.id)) continue;
        for (const columnId of Object.keys(row.values)) {
          const value = row.values[columnId] ?? '';
          if (value !== '') pushText(`rows[${row.id}].values[${columnId}]`, value, '');
        }
      }
      for (const row of a.rows) {
        if (beforeRows.has(row.id)) continue;
        for (const columnId of Object.keys(row.values)) {
          const value = row.values[columnId] ?? '';
          if (value !== '') pushText(`rows[${row.id}].values[${columnId}]`, '', value);
        }
      }
      for (const row of a.rows) {
        const previous = beforeRows.get(row.id);
        if (previous === undefined) continue;
        for (const columnId of Object.keys(row.values)) {
          pushText(
            `rows[${row.id}].values[${columnId}]`,
            previous.values[columnId] ?? '',
            row.values[columnId] ?? '',
          );
        }
      }
      break;
    }
    case 'calculation': {
      if (b.type !== 'calculation') break;
      pushText('title', textOf(b.title), textOf(a.title));
      pushText('conclusionText', textOf(b.conclusionText), textOf(a.conclusionText));
      drafts.push(
        ...deriveChildDrafts(blockId, 'steps', b.steps, a.steps, [
          { field: 'label', text: (step) => textOf(step.label) },
          { field: 'latex', text: (step) => step.latex },
          { field: 'substitution', text: (step) => textOf(step.substitution) },
          { field: 'result', text: (step) => textOf(step.result) },
          { field: 'note', text: (step) => textOf(step.note) },
        ]),
      );
      break;
    }
    case 'acceptance-criteria': {
      if (b.type !== 'acceptance-criteria') break;
      pushText('title', textOf(b.title), textOf(a.title));
      pushProp('overallResult', b.overallResult ?? null, a.overallResult ?? null);
      drafts.push(
        ...deriveChildDrafts(blockId, 'criteria', b.criteria, a.criteria, [
          { field: 'criterion', text: (criterion) => criterion.criterion },
          { field: 'specification', text: (criterion) => criterion.specification },
          { field: 'measuredValue', text: (criterion) => textOf(criterion.measuredValue) },
          { field: 'result', scalar: (criterion) => criterion.result },
          { field: 'remarks', text: (criterion) => textOf(criterion.remarks) },
        ]),
      );
      break;
    }
    default:
      break;
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

// ─────────────────────────────────────────────────────────────────────────────
// P07-M2-R1: designer TEXT capture (document-target settings events)
// ─────────────────────────────────────────────────────────────────────────────

/** The per-cell header/footer path grammar owned by P07-M2-R1. */
const DESIGNER_CELL_PATH =
  /^headerFooter\.(header|footer)\.rows\[([\w-]+)\]\.cells\[([\w-]+)\]\.content$/;

/** The designer TEXT paths tracked from P07-M2-R1 (text values only). */
function isDesignerTextPath(path: string): boolean {
  return path === 'frontPage.synopsis' || path === 'watermark.text' || DESIGNER_CELL_PATH.test(path);
}

/**
 * Diff the designer TEXT values of one mutation: the front-page synopsis,
 * the watermark text and every header/footer cell's content.  Non-text
 * designer configuration (themes, flags, sizes, logos, grid geometry)
 * deliberately contributes nothing - it belongs to the open owner-boundary
 * question recorded in roadmap P07-M2-R1.
 */
function deriveDesignerTextDrafts(
  before: DocStudioDocument,
  after: DocStudioDocument,
): ChangeEventDraft[] {
  const drafts: ChangeEventDraft[] = [];
  const synopsis = makeScalarDraft(
    'settings',
    'frontPage.synopsis',
    textOf(before.frontPage.synopsis),
    textOf(after.frontPage.synopsis),
  );
  if (synopsis !== null) drafts.push(synopsis);
  const watermark = makeScalarDraft(
    'settings',
    'watermark.text',
    textOf(before.headerFooter.watermark.text),
    textOf(after.headerFooter.watermark.text),
  );
  if (watermark !== null) drafts.push(watermark);

  for (const band of ['header', 'footer'] as const) {
    const beforeRows = new Map(before.headerFooter[band].rows.map((row) => [row.id, row]));
    const afterRows = new Map(after.headerFooter[band].rows.map((row) => [row.id, row]));
    const path = (rowId: string, cellId: string): string =>
      `headerFooter.${band}.rows[${rowId}].cells[${cellId}].content`;
    const push = (rowId: string, cellId: string, original: string, replacement: string): void => {
      if (original === replacement) return;
      drafts.push({
        type: 'settings',
        target: { kind: 'document', field: path(rowId, cellId) },
        payload: { original, replacement },
      });
    };
    for (const row of before.headerFooter[band].rows) {
      if (afterRows.has(row.id)) continue;
      for (const cell of row.cells) {
        if (cell.content === '') continue;
        push(row.id, cell.id, cell.content, '');
      }
    }
    for (const row of after.headerFooter[band].rows) {
      if (beforeRows.has(row.id)) continue;
      for (const cell of row.cells) {
        if (cell.content === '') continue;
        push(row.id, cell.id, '', cell.content);
      }
    }
    for (const row of after.headerFooter[band].rows) {
      const previous = beforeRows.get(row.id);
      if (previous === undefined) continue;
      const beforeCells = new Map(previous.cells.map((cell) => [cell.id, cell]));
      for (const cell of row.cells) {
        push(row.id, cell.id, beforeCells.get(cell.id)?.content ?? '', cell.content);
      }
    }
  }
  return drafts;
}

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
      drafts.push(...deriveDesignerTextDrafts(before, after));
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

// ─────────────────────────────────────────────────────────────────────────────
// P07-M2-R1: stable-id child locators (resolution for reversal)
// ─────────────────────────────────────────────────────────────────────────────

/** A parsed P07-M2-R1 child locator (`rows[{id}].cells[{id}].text`, ...). */
interface ChildLocator {
  collection: string;
  id: string;
  /** Nested collection segment (`cells` / `values`), when present. */
  sub: { collection: string; id: string } | null;
  /** The addressed field; '' for a nested map entry (measurement cell). */
  field: string;
}

const SINGLE_CHILD_LOCATOR = /^(\w+)\[([\w-]+)\]\.(\w+)$/;
const NESTED_CHILD_LOCATOR = /^(\w+)\[([\w-]+)\]\.(\w+)\[([\w-]+)\](?:\.(\w+))?$/;

/** Parse a P07-M2-R1 child locator, or null when the field is not one. */
function parseChildLocator(field: string): ChildLocator | null {
  const single = SINGLE_CHILD_LOCATOR.exec(field);
  if (single !== null) {
    return { collection: single[1], id: single[2], sub: null, field: single[3] };
  }
  const nested = NESTED_CHILD_LOCATOR.exec(field);
  if (nested !== null) {
    return {
      collection: nested[1],
      id: nested[2],
      sub: { collection: nested[3], id: nested[4] },
      field: nested[5] ?? '',
    };
  }
  return null;
}

/**
 * Current value at a stable-id child locator.  Returns `null` when the
 * locator does not apply to this block at all; `{ value: undefined }`
 * when it applies but the addressed child no longer exists (a removed
 * row/cell/item/entry/signer/step/criterion - the honest structural case).
 */
function readChildField(
  block: ContentBlock,
  loc: ChildLocator,
): { value: ChangeScalarValue | undefined; spans?: readonly InlineSpan[] } | null {
  const data = block.data;
  const find = <T extends { id: DocUUID }>(list: readonly T[], id: string): T | undefined =>
    list.find((entry) => entry.id === id);
  const missing = { value: undefined };

  if (data.type === 'table' && loc.collection === 'rows' && loc.sub?.collection === 'cells') {
    const row = find(data.rows, loc.id);
    const cell = row === undefined ? undefined : find(row.cells, loc.sub.id);
    if (cell === undefined) return missing;
    if (loc.field === 'text') return { value: spansToPlainText(cell.spans), spans: cell.spans };
    if (loc.field === 'spans') return { value: undefined, spans: cell.spans };
    if (loc.field === 'hAlign') return { value: cell.hAlign };
    return missing;
  }
  if (data.type === 'list' && loc.collection === 'items' && loc.sub === null) {
    const item = find(data.items, loc.id);
    if (item === undefined) return missing;
    if (loc.field === 'text') return { value: spansToPlainText(item.spans), spans: item.spans };
    if (loc.field === 'spans') return { value: undefined, spans: item.spans };
    if (loc.field === 'depth') return { value: item.depth };
    if (loc.field === 'checked') {
      return { value: typeof item.checked === 'boolean' ? item.checked : undefined };
    }
    return missing;
  }
  if (data.type === 'formula' && loc.collection === 'variableDefinitions' && loc.sub === null) {
    const entry = find(data.variableDefinitions, loc.id);
    if (entry === undefined) return missing;
    if (loc.field === 'symbol') return { value: entry.symbol };
    if (loc.field === 'definition') return { value: entry.definition };
    if (loc.field === 'unit') return { value: entry.unit ?? '' };
    return missing;
  }
  if (data.type === 'image' && loc.collection === 'images' && loc.sub === null) {
    const image = find(data.images, loc.id);
    if (image === undefined) return missing;
    if (loc.field === 'caption') return { value: image.caption ?? '' };
    if (loc.field === 'assetId') return { value: image.assetId ?? '' };
    return missing;
  }
  if (data.type === 'signature' && loc.collection === 'signers' && loc.sub === null) {
    const signer = find(data.signers, loc.id);
    if (signer === undefined) return missing;
    if (loc.field === 'role') return { value: signer.role };
    if (loc.field === 'name') return { value: signer.name ?? '' };
    if (loc.field === 'designation') return { value: signer.designation ?? '' };
    if (loc.field === 'department') return { value: signer.department ?? '' };
    if (loc.field === 'date') return { value: signer.date ?? '' };
    return missing;
  }
  if (data.type === 'revision-history' && loc.collection === 'entries' && loc.sub === null) {
    const entry = find(data.entries, loc.id);
    if (entry === undefined) return missing;
    if (loc.field === 'revision') return { value: entry.revision };
    if (loc.field === 'date') return { value: entry.date };
    if (loc.field === 'author') return { value: entry.author };
    if (loc.field === 'description') return { value: entry.description };
    return missing;
  }
  if (data.type === 'reference' && loc.collection === 'entries' && loc.sub === null) {
    const entry = find(data.entries, loc.id);
    if (entry === undefined) return missing;
    if (loc.field === 'key') return { value: entry.key };
    if (loc.field === 'citation') return { value: entry.citation };
    if (loc.field === 'url') return { value: entry.url ?? '' };
    return missing;
  }
  if (data.type === 'procedure-step' && loc.collection === 'steps' && loc.sub === null) {
    const step = find(data.steps, loc.id);
    if (step === undefined) return missing;
    if (loc.field === 'text') return { value: spansToPlainText(step.spans), spans: step.spans };
    if (loc.field === 'spans') return { value: undefined, spans: step.spans };
    if (loc.field === 'stepNumber') return { value: step.stepNumber ?? '' };
    if (loc.field === 'level') return { value: step.level };
    return missing;
  }
  if (data.type === 'equipment-list' && loc.collection === 'items' && loc.sub === null) {
    const item = find(data.items, loc.id);
    if (item === undefined) return missing;
    if (loc.field === 'name') return { value: item.name };
    if (loc.field === 'assetTag') return { value: item.assetTag ?? '' };
    if (loc.field === 'manufacturer') return { value: item.manufacturer ?? '' };
    if (loc.field === 'modelNumber') return { value: item.modelNumber ?? '' };
    if (loc.field === 'calibrationDue') return { value: item.calibrationDue ?? '' };
    if (loc.field === 'mandatory') return { value: item.mandatory };
    return missing;
  }
  if (data.type === 'observation' && loc.collection === 'rows' && loc.sub === null) {
    const row = find(data.rows, loc.id);
    if (row === undefined) return missing;
    if (loc.field === 'parameter') return { value: row.parameter };
    if (loc.field === 'observedValue') return { value: row.observedValue ?? '' };
    if (loc.field === 'remarks') return { value: row.remarks ?? '' };
    return missing;
  }
  if (data.type === 'measurement') {
    if (loc.collection === 'columns' && loc.sub === null) {
      const column = find(data.columns, loc.id);
      if (column === undefined) return missing;
      if (loc.field === 'header') return { value: column.header };
      if (loc.field === 'unit') return { value: column.unit ?? '' };
      return missing;
    }
    if (loc.collection === 'rows' && loc.sub?.collection === 'values') {
      const row = find(data.rows, loc.id);
      if (row === undefined) return missing;
      return { value: row.values[loc.sub.id] ?? '' };
    }
  }
  if (data.type === 'calculation' && loc.collection === 'steps' && loc.sub === null) {
    const step = find(data.steps, loc.id);
    if (step === undefined) return missing;
    if (loc.field === 'label') return { value: step.label ?? '' };
    if (loc.field === 'latex') return { value: step.latex };
    if (loc.field === 'substitution') return { value: step.substitution ?? '' };
    if (loc.field === 'result') return { value: step.result ?? '' };
    if (loc.field === 'note') return { value: step.note ?? '' };
    return missing;
  }
  if (data.type === 'acceptance-criteria' && loc.collection === 'criteria' && loc.sub === null) {
    const criterion = find(data.criteria, loc.id);
    if (criterion === undefined) return missing;
    if (loc.field === 'criterion') return { value: criterion.criterion };
    if (loc.field === 'specification') return { value: criterion.specification };
    if (loc.field === 'measuredValue') return { value: criterion.measuredValue ?? '' };
    if (loc.field === 'result') return { value: criterion.result };
    if (loc.field === 'remarks') return { value: criterion.remarks ?? '' };
    return missing;
  }
  return null;
}

/**
 * Read one BLOCK-LEVEL family field (P07-M2-R1) for the stale guard and the
 * reversal support check.  Returns `null` when the field is not a family
 * field of this block type, which `readBlockFieldValue` reports as
 * unsupported - so a captured field can never be silently un-reversible:
 * the reader and the capture grammar stay in lockstep.
 */
function readFamilyBlockField(
  block: ContentBlock,
  field: string,
): { value: ChangeScalarValue | undefined; spans?: readonly InlineSpan[] } | null {
  const data = block.data;
  switch (data.type) {
    case 'callout':
      if (field === 'text') return { value: spansToPlainText(data.spans), spans: data.spans };
      if (field === 'spans') return { value: undefined, spans: data.spans };
      if (field === 'title') return { value: textOf(data.title) };
      if (field === 'variant') return { value: data.variant };
      return null;
    case 'list':
      if (field === 'listType') return { value: data.listType };
      if (field === 'bulletStyle') return { value: data.bulletStyle };
      if (field === 'numberStyle') return { value: data.numberStyle };
      return null;
    case 'table':
      if (field === 'caption') return { value: textOf(data.caption) };
      if (field === 'hasHeaderRow') return { value: data.hasHeaderRow };
      if (field === 'headerStyle') return { value: data.headerStyle };
      return null;
    case 'formula':
      if (field === 'latex') return { value: data.latex };
      if (field === 'formulaNumber') return { value: textOf(data.formulaNumber) };
      if (field === 'whereLabelOverride') return { value: textOf(data.whereLabelOverride) };
      if (field === 'hAlign') return { value: data.hAlign };
      if (field === 'displayMode') return { value: data.displayMode };
      return null;
    case 'section-break':
      return field === 'title' ? { value: textOf(data.title) } : null;
    case 'reference':
      return field === 'title' ? { value: textOf(data.title) } : null;
    case 'exhibit':
      if (field === 'label') return { value: data.label };
      if (field === 'title') return { value: textOf(data.title) };
      if (field === 'notes') return { value: textOf(data.notes) };
      if (field === 'assetId') return { value: textOf(data.assetId) };
      return null;
    case 'procedure-step':
      return field === 'sectionTitle' ? { value: textOf(data.sectionTitle) } : null;
    case 'equipment-list':
      return field === 'title' ? { value: textOf(data.title) } : null;
    case 'observation':
      return field === 'title' ? { value: textOf(data.title) } : null;
    case 'measurement':
      if (field === 'title') return { value: textOf(data.title) };
      if (field === 'uncertaintyNote') return { value: textOf(data.uncertaintyNote) };
      return null;
    case 'calculation':
      if (field === 'title') return { value: textOf(data.title) };
      if (field === 'conclusionText') return { value: textOf(data.conclusionText) };
      return null;
    case 'acceptance-criteria':
      if (field === 'title') return { value: textOf(data.title) };
      // Absent reads as `null` (the capture records `?? null`), so clearing
      // the overall verdict on rejection stays a supported reversal.
      if (field === 'overallResult') return { value: scalarOrNull(data.overallResult ?? null) };
      return null;
    default:
      return null;
  }
}

/** Current field value for a block-field locator, when tracked in P07-M2. */
function readBlockFieldValue(
  block: ContentBlock,
  field: string,
): { value: ChangeScalarValue | undefined; spans?: readonly InlineSpan[] } {
  const child = parseChildLocator(field);
  if (child !== null) return readChildField(block, child) ?? { value: undefined };
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
  const family = readFamilyBlockField(block, field);
  if (family !== null) return family;
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
  const child = parseChildLocator(field);
  if (child !== null) return restoreChildField(doc, block, child, original, now);
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
    if (field !== 'spacing.topPt' && field !== 'spacing.bottomPt') {
      return fail(`Reversing "${field}" on a heading is not supported in P07-M2.`);
    }
  } else if (block.data.type === 'paragraph') {
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
    if (field !== 'spacing.topPt' && field !== 'spacing.bottomPt') {
      return fail(`Reversing "${field}" on a paragraph is not supported in P07-M2.`);
    }
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
  return restoreFamilyBlockField(doc, block, field, original, now);
}

// ─────────────────────────────────────────────────────────────────────────────
// P07-M2-R1: reversal through the family content services
// ─────────────────────────────────────────────────────────────────────────────

/** Common shape of every content-service result used for reversal. */
type ServiceOutcome =
  | { ok: true; doc: DocStudioDocument }
  | { ok: false; message: string };

/** Adapt a content-service result to the reversal result union. */
const via = (
  outcome: ServiceOutcome,
): TrackOpResult | { ok: true; doc: DocStudioDocument } =>
  outcome.ok
    ? { ok: true, doc: outcome.doc }
    : opReject('unsupported-reversal', outcome.message);

/** Max single reversal shift for list-item nesting (defensive bound). */
const MAX_DEPTH_REVERSAL_STEPS = 8;

const LIST_TYPES = ['bullet', 'numbered', 'checklist'];
const BULLET_STYLES = ['disc', 'circle', 'square', 'dash', 'arrow'];
const NUMBER_STYLES = ['decimal', 'lower-alpha', 'upper-alpha', 'lower-roman', 'upper-roman'];
const TABLE_HEADER_STYLES = ['light', 'medium', 'heavy'];
const CRITERIA_RESULT_VALUES = ['pass', 'fail', 'inconclusive', 'not-applicable', 'pending'];
const STEP_LEVELS = ['main', 'sub', 'note', 'warning', 'caution'];

/** Restore one tracked BLOCK-LEVEL family field via its content service. */
function restoreFamilyBlockField(
  doc: DocStudioDocument,
  block: ContentBlock,
  field: string,
  original: ChangeScalarValue | readonly InlineSpan[],
  now: ISODateString,
): TrackOpResult | { ok: true; doc: DocStudioDocument } {
  const fail = (message: string): TrackOpResult =>
    opReject('unsupported-reversal', message);
  const data = block.data;
  const text = typeof original === 'string' ? original : null;
  const optional = (): string | null | 'bad' => (text === null ? 'bad' : text === '' ? null : text);
  const cleared = (): string | null | 'bad' => {
    const value = optional();
    return value === 'bad' || value === null ? 'bad' : value;
  };

  switch (data.type) {
    case 'callout': {
      if (field === 'text') {
        if (text === null) return fail('The recorded original callout text is not a string.');
        return via(updateCalloutContent(doc, block.id, { spans: plainTextToSpans(text) }, { now }));
      }
      if (field === 'spans') {
        if (!Array.isArray(original)) return fail('The recorded original callout styling is not a span list.');
        return via(
          updateCalloutContent(doc, block.id, { spans: deepCopy(original as InlineSpan[]) }, { now }),
        );
      }
      if (field === 'title') {
        const value = optional();
        if (value === 'bad') return fail('The recorded original callout title is not a string.');
        return via(updateCalloutContent(doc, block.id, { title: value }, { now }));
      }
      if (field === 'variant') {
        if (text === null || text.trim() === '') {
          return fail('The recorded original callout variant is not a usable label.');
        }
        return via(updateCalloutContent(doc, block.id, { variant: text }, { now }));
      }
      return fail(`Reversing "${field}" on a callout is not supported.`);
    }
    case 'list': {
      if (field === 'listType') {
        if (text === null || !LIST_TYPES.includes(text)) {
          return fail('The recorded original list type is not supported.');
        }
        return via(updateListSettings(doc, block.id, { listType: text as ListType }, { now }));
      }
      if (field === 'bulletStyle') {
        if (text === null || !BULLET_STYLES.includes(text)) {
          return fail('The recorded original bullet style is not supported.');
        }
        return via(updateListSettings(doc, block.id, { bulletStyle: text as BulletStyle }, { now }));
      }
      if (field === 'numberStyle') {
        if (text === null || !NUMBER_STYLES.includes(text)) {
          return fail('The recorded original numbering style is not supported.');
        }
        return via(updateListSettings(doc, block.id, { numberStyle: text as NumberStyle }, { now }));
      }
      return fail(`Reversing "${field}" on a list is not supported.`);
    }
    case 'table': {
      if (field === 'caption') {
        const value = optional();
        if (value === 'bad') return fail('The recorded original table caption is not a string.');
        return via(updateTableSettings(doc, block.id, { caption: value }, { now }));
      }
      if (field === 'hasHeaderRow') {
        if (typeof original !== 'boolean') return fail('The recorded original header-row flag is not a boolean.');
        return via(updateTableSettings(doc, block.id, { hasHeaderRow: original }, { now }));
      }
      if (field === 'headerStyle') {
        if (text === null || !TABLE_HEADER_STYLES.includes(text)) {
          return fail('The recorded original header style is not supported.');
        }
        return via(updateTableSettings(doc, block.id, { headerStyle: text as TableHeaderStyle }, { now }));
      }
      return fail(`Reversing "${field}" on a table is not supported.`);
    }
    case 'formula': {
      if (field === 'latex') {
        if (text === null || text.trim() === '') {
          return fail('The recorded original formula source is not usable LaTeX.');
        }
        return via(updateFormulaContent(doc, block.id, { action: 'update-formula', latex: text }, { now }));
      }
      if (field === 'formulaNumber') {
        const value = optional();
        if (value === 'bad') return fail('The recorded original formula number is not a string.');
        return via(
          updateFormulaContent(doc, block.id, { action: 'update-formula', formulaNumber: value }, { now }),
        );
      }
      if (field === 'whereLabelOverride') {
        const value = optional();
        if (value === 'bad') return fail('The recorded original Where-label override is not a string.');
        return via(
          updateFormulaContent(
            doc,
            block.id,
            { action: 'update-formula', whereLabelOverride: value },
            { now },
          ),
        );
      }
      if (field === 'hAlign') {
        if (text !== 'left' && text !== 'center' && text !== 'right') {
          return fail('The recorded original formula alignment is not supported.');
        }
        return via(
          updateFormulaContent(doc, block.id, { action: 'update-formula', hAlign: text as HAlignment }, { now }),
        );
      }
      if (field === 'displayMode') {
        if (typeof original !== 'boolean') return fail('The recorded original display mode is not a boolean.');
        return via(
          updateFormulaContent(doc, block.id, { action: 'update-formula', displayMode: original }, { now }),
        );
      }
      return fail(`Reversing "${field}" on a formula is not supported.`);
    }
    case 'section-break': {
      if (field === 'title') {
        const value = optional();
        if (value === 'bad') return fail('The recorded original section title is not a string.');
        return via(updateSectionBreakContent(doc, block.id, { title: value }, { now }));
      }
      return fail(`Reversing "${field}" on a section break is not supported.`);
    }
    case 'reference': {
      if (field === 'title') {
        const value = optional();
        if (value === 'bad') return fail('The recorded original reference title is not a string.');
        return via(updateReferenceTitle(doc, block.id, { title: value }, { now }));
      }
      return fail(`Reversing "${field}" on a reference block is not supported.`);
    }
    case 'exhibit': {
      if (field === 'label') {
        const value = cleared();
        if (value === 'bad') return fail('The recorded original exhibit label is not usable.');
        return via(updateExhibitContent(doc, block.id, { label: value }, { now }));
      }
      if (field === 'title') {
        const value = optional();
        if (value === 'bad') return fail('The recorded original exhibit title is not a string.');
        return via(updateExhibitContent(doc, block.id, { title: value }, { now }));
      }
      if (field === 'notes') {
        const value = optional();
        if (value === 'bad') return fail('The recorded original exhibit notes are not a string.');
        return via(updateExhibitContent(doc, block.id, { notes: value }, { now }));
      }
      if (field === 'assetId') {
        const value = optional();
        if (value === 'bad') return fail('The recorded original exhibit asset reference is not a string.');
        return via(updateExhibitContent(doc, block.id, { assetId: value }, { now }));
      }
      return fail(`Reversing "${field}" on an exhibit is not supported.`);
    }
    case 'procedure-step': {
      if (field === 'sectionTitle') {
        const value = optional();
        if (value === 'bad') return fail('The recorded original section title is not a string.');
        return via(updateProcedureTitle(doc, block.id, value, { now }));
      }
      return fail(`Reversing "${field}" on a procedure block is not supported.`);
    }
    case 'equipment-list':
    case 'observation':
    case 'measurement':
    case 'calculation':
    case 'acceptance-criteria': {
      if (field === 'title') {
        const value = optional();
        if (value === 'bad') return fail('The recorded original title is not a string.');
        if (data.type === 'equipment-list') return via(updateEquipmentTitle(doc, block.id, value, { now }));
        if (data.type === 'observation') return via(updateObservationTitle(doc, block.id, value, { now }));
        if (data.type === 'measurement') return via(updateMeasurementTitle(doc, block.id, value, { now }));
        if (data.type === 'calculation') return via(updateCalculationTitle(doc, block.id, value, { now }));
        return via(updateAcceptanceTitle(doc, block.id, value, { now }));
      }
      if (data.type === 'measurement' && field === 'uncertaintyNote') {
        const value = optional();
        if (value === 'bad') return fail('The recorded original uncertainty note is not a string.');
        return via(setMeasurementUncertaintyNote(doc, block.id, value, { now }));
      }
      if (data.type === 'calculation' && field === 'conclusionText') {
        const value = optional();
        if (value === 'bad') return fail('The recorded original conclusion text is not a string.');
        return via(setCalculationConclusion(doc, block.id, value, { now }));
      }
      if (data.type === 'acceptance-criteria' && field === 'overallResult') {
        if (original !== null && !CRITERIA_RESULT_VALUES.includes(String(original))) {
          return fail('The recorded original overall result is not supported.');
        }
        return via(
          setAcceptanceOverallResult(
            doc,
            block.id,
            original === null ? null : (original as CriteriaResult),
            { now },
          ),
        );
      }
      return fail(`Reversing "${field}" on this laboratory block is not supported.`);
    }
  }
  return fail(`Reversing "${field}" is not supported.`);
}

/**
 * Restore one stable-id CHILD field to its recorded original through the
 * family content service that owns it.  Structural absences (the child
 * was removed together with its row/column/item) and states the
 * validating services refuse (clearing a required field) fail honestly -
 * the document and the event are left untouched.
 */
function restoreChildField(
  doc: DocStudioDocument,
  block: ContentBlock,
  loc: ChildLocator,
  original: ChangeScalarValue | readonly InlineSpan[],
  now: ISODateString,
): TrackOpResult | { ok: true; doc: DocStudioDocument } {
  const fail = (message: string): TrackOpResult =>
    opReject('unsupported-reversal', message);
  const data = block.data;
  const text = typeof original === 'string' ? original : null;
  const optional = (): string | null | 'bad' => (text === null ? 'bad' : text === '' ? null : text);

  if (data.type === 'table' && loc.collection === 'rows' && loc.sub?.collection === 'cells') {
    if (loc.field === 'text') {
      if (text === null) return fail('The recorded original cell text is not a string.');
      return via(setTableCellText(doc, block.id, loc.sub.id, text, { now }));
    }
    if (loc.field === 'hAlign') {
      if (text !== 'left' && text !== 'center' && text !== 'right') {
        return fail('The recorded original cell alignment is not supported.');
      }
      return via(setTableCellAlignment(doc, block.id, loc.sub.id, text as HAlignment, { now }));
    }
    return fail(
      'Reversing a styling-only change on this table cell is not supported (no content service writes raw cell styling).',
    );
  }
  if (data.type === 'list' && loc.collection === 'items' && loc.sub === null) {
    if (loc.field === 'text') {
      if (text === null) return fail('The recorded original list item text is not a string.');
      return via(updateListItemText(doc, block.id, loc.id, plainTextToSpans(text), { now }));
    }
    if (loc.field === 'spans') {
      if (!Array.isArray(original)) return fail('The recorded original list item styling is not a span list.');
      return via(updateListItemText(doc, block.id, loc.id, deepCopy(original as InlineSpan[]), { now }));
    }
    if (loc.field === 'depth') {
      if (typeof original !== 'number' || !Number.isInteger(original) || original < 0) {
        return fail('The recorded original list item nesting is not a supported depth.');
      }
      const item = data.items.find((entry) => entry.id === loc.id);
      if (item === undefined) return fail('The addressed list item no longer exists in this list.');
      const steps = Math.abs(original - item.depth);
      if (steps > MAX_DEPTH_REVERSAL_STEPS) {
        return fail('The recorded original nesting is too far from the current nesting to reverse safely.');
      }
      let cursor = doc;
      for (let i = 0; i < steps; i += 1) {
        const step =
          original < item.depth
            ? outdentListItem(cursor, block.id, loc.id, { now })
            : indentListItem(cursor, block.id, loc.id, { now });
        if (!step.ok) return fail(step.message);
        cursor = step.doc;
      }
      return { ok: true, doc: cursor };
    }
    if (loc.field === 'checked') {
      if (typeof original !== 'boolean') return fail('The recorded original checked state is not a boolean.');
      return via(setItemChecked(doc, block.id, loc.id, original, { now }));
    }
    return fail(`Reversing "${loc.field}" on a list item is not supported.`);
  }
  if (data.type === 'formula' && loc.collection === 'variableDefinitions' && loc.sub === null) {
    if (loc.field === 'symbol') {
      if (text === null || text.trim() === '') return fail('The recorded original variable symbol is not usable.');
      return via(updateVariableDefinition(doc, block.id, loc.id, { symbol: text }, { now }));
    }
    if (loc.field === 'definition') {
      if (text === null) return fail('The recorded original variable definition is not a string.');
      return via(updateVariableDefinition(doc, block.id, loc.id, { definition: text }, { now }));
    }
    if (loc.field === 'unit') {
      const value = optional();
      if (value === 'bad') return fail('The recorded original variable unit is not a string.');
      return via(updateVariableDefinition(doc, block.id, loc.id, { unit: value }, { now }));
    }
    return fail(`Reversing "${loc.field}" on a variable definition is not supported.`);
  }
  if (data.type === 'image' && loc.collection === 'images' && loc.sub === null) {
    if (loc.field === 'caption') {
      if (text === null) return fail('The recorded original image caption is not a string.');
      return via(setImageCaption(doc, block.id, loc.id, text, { now }));
    }
    if (loc.field === 'assetId') {
      if (text === null) return fail('The recorded original image asset reference is not a string.');
      const originalAssetId = text === '' ? null : text;
      const image = data.images.find((entry) => entry.id === loc.id);
      if (image === undefined) return fail('The addressed image slot no longer exists in this block.');
      if (originalAssetId !== null && doc.assets[originalAssetId] === undefined) {
        return fail(
          'The replaced image asset is no longer embedded in this document, so the swap cannot be reversed.',
        );
      }
      // Direct immutable transform: no service writes an assetId without
      // side effects (attach drops the slot's crop).  The reference itself
      // is restored; the excluded crop side effect of the original swap is
      // not (documented in the module docblock).
      const images = data.images.map((entry) =>
        entry.id === loc.id ? { ...entry, assetId: originalAssetId } : entry,
      );
      const blocks = doc.blocks.map((entry) =>
        entry.id === block.id ? { ...entry, data: { ...data, images } } : entry,
      );
      return {
        ok: true,
        doc: { ...doc, blocks, metadata: { ...doc.metadata, modifiedAt: now } },
      };
    }
    return fail(`Reversing "${loc.field}" on an image slot is not supported.`);
  }
  if (data.type === 'signature' && loc.collection === 'signers' && loc.sub === null) {
    if (
      loc.field === 'role' ||
      loc.field === 'name' ||
      loc.field === 'designation' ||
      loc.field === 'department' ||
      loc.field === 'date'
    ) {
      if (text === null) return fail('The recorded original signer field is not a string.');
      return via(setSignerField(doc, block.id, loc.id, loc.field, text, { now }));
    }
    return fail(`Reversing "${loc.field}" on a signer is not supported.`);
  }
  if (data.type === 'revision-history' && loc.collection === 'entries' && loc.sub === null) {
    if (text === null) return fail('The recorded original revision entry field is not a string.');
    if (loc.field === 'revision') {
      return via(updateRevisionEntry(doc, block.id, loc.id, { revision: text }, { now }));
    }
    if (loc.field === 'date') {
      return via(updateRevisionEntry(doc, block.id, loc.id, { date: text }, { now }));
    }
    if (loc.field === 'author') {
      return via(updateRevisionEntry(doc, block.id, loc.id, { author: text }, { now }));
    }
    if (loc.field === 'description') {
      return via(updateRevisionEntry(doc, block.id, loc.id, { description: text }, { now }));
    }
    return fail(`Reversing "${loc.field}" on a revision entry is not supported.`);
  }
  if (data.type === 'reference' && loc.collection === 'entries' && loc.sub === null) {
    if (text === null) return fail('The recorded original reference entry field is not a string.');
    if (loc.field === 'key') {
      return via(updateReferenceEntry(doc, block.id, loc.id, { key: text }, { now }));
    }
    if (loc.field === 'citation') {
      return via(updateReferenceEntry(doc, block.id, loc.id, { citation: text }, { now }));
    }
    if (loc.field === 'url') {
      return via(updateReferenceEntry(doc, block.id, loc.id, { url: text }, { now }));
    }
    return fail(`Reversing "${loc.field}" on a reference entry is not supported.`);
  }
  if (data.type === 'procedure-step' && loc.collection === 'steps' && loc.sub === null) {
    if (loc.field === 'text') {
      if (text === null) return fail('The recorded original step text is not a string.');
      return via(updateProcedureStep(doc, block.id, loc.id, { spans: plainTextToSpans(text) }, { now }));
    }
    if (loc.field === 'spans') {
      if (!Array.isArray(original)) return fail('The recorded original step styling is not a span list.');
      return via(updateProcedureStep(doc, block.id, loc.id, { spans: deepCopy(original as InlineSpan[]) }, { now }));
    }
    if (loc.field === 'stepNumber') {
      const value = optional();
      if (value === 'bad') return fail('The recorded original step number is not a string.');
      return via(updateProcedureStep(doc, block.id, loc.id, { stepNumber: value }, { now }));
    }
    if (loc.field === 'level') {
      if (text === null || !STEP_LEVELS.includes(text)) {
        return fail('The recorded original step level is not supported.');
      }
      return via(
        updateProcedureStep(doc, block.id, loc.id, { level: text as ProcedureStepLevel }, { now }),
      );
    }
    return fail(`Reversing "${loc.field}" on a procedure step is not supported.`);
  }
  if (data.type === 'equipment-list' && loc.collection === 'items' && loc.sub === null) {
    if (loc.field === 'mandatory') {
      if (typeof original !== 'boolean') return fail('The recorded original mandatory flag is not a boolean.');
      return via(updateEquipmentItem(doc, block.id, loc.id, { mandatory: original }, { now }));
    }
    if (loc.field === 'name') {
      if (text === null || text.trim() === '') return fail('The recorded original equipment name is not usable.');
      return via(updateEquipmentItem(doc, block.id, loc.id, { name: text }, { now }));
    }
    const value = optional();
    if (value === 'bad') return fail('The recorded original equipment field is not a string.');
    if (loc.field === 'assetTag') {
      return via(updateEquipmentItem(doc, block.id, loc.id, { assetTag: value }, { now }));
    }
    if (loc.field === 'manufacturer') {
      return via(updateEquipmentItem(doc, block.id, loc.id, { manufacturer: value }, { now }));
    }
    if (loc.field === 'modelNumber') {
      return via(updateEquipmentItem(doc, block.id, loc.id, { modelNumber: value }, { now }));
    }
    if (loc.field === 'calibrationDue') {
      return via(updateEquipmentItem(doc, block.id, loc.id, { calibrationDue: value }, { now }));
    }
    return fail(`Reversing "${loc.field}" on an equipment item is not supported.`);
  }
  if (data.type === 'observation' && loc.collection === 'rows' && loc.sub === null) {
    if (loc.field === 'parameter') {
      if (text === null || text.trim() === '') return fail('The recorded original observation parameter is not usable.');
      return via(updateObservationRow(doc, block.id, loc.id, { parameter: text }, { now }));
    }
    const value = optional();
    if (value === 'bad') return fail('The recorded original observation field is not a string.');
    if (loc.field === 'observedValue') {
      return via(updateObservationRow(doc, block.id, loc.id, { observedValue: value }, { now }));
    }
    if (loc.field === 'remarks') {
      return via(updateObservationRow(doc, block.id, loc.id, { remarks: value }, { now }));
    }
    return fail(`Reversing "${loc.field}" on an observation row is not supported.`);
  }
  if (data.type === 'measurement') {
    if (loc.collection === 'columns' && loc.sub === null) {
      if (loc.field === 'header') {
        if (text === null || text.trim() === '') return fail('The recorded original column header is not usable.');
        return via(updateMeasurementColumn(doc, block.id, loc.id, { header: text }, { now }));
      }
      if (loc.field === 'unit') {
        const value = optional();
        if (value === 'bad') return fail('The recorded original column unit is not a string.');
        return via(updateMeasurementColumn(doc, block.id, loc.id, { unit: value }, { now }));
      }
      return fail(`Reversing "${loc.field}" on a measurement column is not supported.`);
    }
    if (loc.collection === 'rows' && loc.sub?.collection === 'values') {
      if (text === null) return fail('The recorded original cell value is not a string.');
      return via(setMeasurementCell(doc, block.id, loc.id, loc.sub.id, text, { now }));
    }
  }
  if (data.type === 'calculation' && loc.collection === 'steps' && loc.sub === null) {
    if (loc.field === 'latex') {
      if (text === null || text.trim() === '') return fail('The recorded original step formula is not usable LaTeX.');
      return via(updateCalculationStep(doc, block.id, loc.id, { latex: text }, { now }));
    }
    const value = optional();
    if (value === 'bad') return fail('The recorded original calculation step field is not a string.');
    if (loc.field === 'label') {
      return via(updateCalculationStep(doc, block.id, loc.id, { label: value }, { now }));
    }
    if (loc.field === 'substitution') {
      return via(updateCalculationStep(doc, block.id, loc.id, { substitution: value }, { now }));
    }
    if (loc.field === 'result') {
      return via(updateCalculationStep(doc, block.id, loc.id, { result: value }, { now }));
    }
    if (loc.field === 'note') {
      return via(updateCalculationStep(doc, block.id, loc.id, { note: value }, { now }));
    }
    return fail(`Reversing "${loc.field}" on a calculation step is not supported.`);
  }
  if (data.type === 'acceptance-criteria' && loc.collection === 'criteria' && loc.sub === null) {
    if (loc.field === 'result') {
      if (text === null || !CRITERIA_RESULT_VALUES.includes(text)) {
        return fail('The recorded original criterion result is not supported.');
      }
      return via(
        updateAcceptanceCriterion(doc, block.id, loc.id, { result: text as CriteriaResult }, { now }),
      );
    }
    if (loc.field === 'criterion') {
      if (text === null || text.trim() === '') return fail('The recorded original criterion text is not usable.');
      return via(updateAcceptanceCriterion(doc, block.id, loc.id, { criterion: text }, { now }));
    }
    if (loc.field === 'specification') {
      if (text === null || text.trim() === '') return fail('The recorded original specification is not usable.');
      return via(updateAcceptanceCriterion(doc, block.id, loc.id, { specification: text }, { now }));
    }
    const value = optional();
    if (value === 'bad') return fail('The recorded original acceptance field is not a string.');
    if (loc.field === 'measuredValue') {
      return via(updateAcceptanceCriterion(doc, block.id, loc.id, { measuredValue: value }, { now }));
    }
    if (loc.field === 'remarks') {
      return via(updateAcceptanceCriterion(doc, block.id, loc.id, { remarks: value }, { now }));
    }
    return fail(`Reversing "${loc.field}" on an acceptance criterion is not supported.`);
  }
  return fail(`Reversing "${loc.field}" on a ${loc.collection} element is not supported.`);
}

/** Read a designer TEXT leaf (P07-M2-R1 tracked paths) of the document. */
function readDesignerText(
  doc: DocStudioDocument,
  path: string,
): { resolved: boolean; value: string } {
  if (path === 'frontPage.synopsis') {
    return { resolved: true, value: textOf(doc.frontPage.synopsis) };
  }
  if (path === 'watermark.text') {
    return { resolved: true, value: textOf(doc.headerFooter.watermark.text) };
  }
  const match = DESIGNER_CELL_PATH.exec(path);
  if (match !== null) {
    const band = doc.headerFooter[match[1] as 'header' | 'footer'];
    const row = band.rows.find((entry) => entry.id === match[2]);
    const cell = row?.cells.find((entry) => entry.id === match[3]);
    if (cell === undefined) return { resolved: false, value: '' };
    return { resolved: true, value: cell.content };
  }
  return { resolved: false, value: '' };
}

/** Restore one designer TEXT leaf to `original` via the designer services. */
function restoreDesignerText(
  doc: DocStudioDocument,
  path: string,
  original: ChangeScalarValue,
  now: ISODateString,
): TrackOpResult {
  const fail = (message: string): TrackOpResult =>
    opReject('unsupported-reversal', message);
  if (typeof original !== 'string') {
    return fail(`The recorded original value of "${path}" is not a string.`);
  }
  if (path === 'frontPage.synopsis') {
    return via(updateFrontPage(doc, { field: 'synopsis', value: original === '' ? undefined : original }, now));
  }
  if (path === 'watermark.text') {
    return via(applyWatermarkPatch(doc, { field: 'text', value: original }, now));
  }
  const match = DESIGNER_CELL_PATH.exec(path);
  if (match !== null) {
    return via(
      applyHeaderFooterPatch(
        doc,
        match[1] as 'header' | 'footer',
        { field: 'cellContent', rowId: match[2] as DocUUID, cellId: match[3] as DocUUID, value: original },
        now,
      ),
    );
  }
  return fail(`Reversing the designer text field "${path}" is not supported.`);
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
          const child = parseChildLocator(field);
          if (child !== null && readChildField(block, child) !== null) {
            return opReject(
              'unsupported-reversal',
              `The addressed ${child.collection} element no longer exists in this block (it was removed together with its row, column or item), so this recorded deletion cannot be reversed automatically.`,
            );
          }
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
        const current = readBlockFieldValue(block, field);
        if (current.spans === undefined) {
          return opReject(
            'unsupported-reversal',
            'This formatting change can no longer be reversed on the current block.',
          );
        }
        if (JSON.stringify(current.spans) !== JSON.stringify(event.payload.replacement)) {
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
      if (isDesignerTextPath(field)) {
        const current = readDesignerText(source, field);
        if (!current.resolved) {
          return opReject(
            'unsupported-reversal',
            `The addressed header/footer cell no longer exists in this document, so this recorded text change cannot be reversed automatically.`,
          );
        }
        if (current.value !== event.payload.replacement) {
          return opReject(
            'stale-target',
            `The field "${field}" changed again after this tracked change, so restoring its original value is no longer safe.`,
          );
        }
        return restoreDesignerText(source, field, event.payload.original, now);
      }
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

/**
 * Cue lines for one block's PENDING text events on families whose text
 * cannot be struck/underlined inline in the PDF (every family except
 * heading/paragraph, which carry their own inline markup).  Each line
 * shows the original and replacement strings, `(empty)` for the empty
 * side, truncated for the page - the same non-color, print-readable
 * convention as `describeBlockMarkupCues`.  A pure derivation helper;
 * never shows resolved events.
 */
export function describePendingTextCues(
  events: readonly ChangeEvent[] | undefined,
  maxLength = 60,
): string[] {
  if (events === undefined) return [];
  const side = (value: string): string => {
    if (value === '') return '(empty)';
    if (value.length <= maxLength) return value;
    return `${value.slice(0, Math.max(1, maxLength - 1))}\u2026`;
  };
  const cues: string[] = [];
  for (const event of events) {
    if (event.status !== 'pending' || event.type !== 'text') continue;
    const { original, replacement } = event.payload;
    if (original === '' && replacement === '') continue;
    cues.push(`Text: ${side(original)} \u2192 ${side(replacement)}`);
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
