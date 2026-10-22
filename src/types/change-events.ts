/**
 * DocStudio - Change event model and history semantics (P07-M1, Phase 07)
 * ���������������������������������������������������������������������������
 *
 * Typed foundation for Track Changes (`project_details.md` 12.1, roadmap
 * Phase 07 scope 7.1).  This module DEFINES the change-event model and its
 * semantics; it does not implement any user-visible tracking.  Nothing here
 * is wired into the editor, the preview, the renderer or the persistence
 * layer - those belong to `P07-M2` (Track Changes visible and persisted).
 *
 * This is the AUTHORITATIVE semantics record for the model.  The roadmap
 * `P07-M1` checkpoint entry records the checkpoint evidence and points here.
 *
 * WHAT IS TRACKED (7.1) - the seven event types
 * ---------------------------------------------
 * - `text`       - a text field's content was replaced within one block
 *                  (target: `block-field`; payload: before/after strings).
 *                  Insertions and deletions are the degenerate cases of the
 *                  same representation (empty `original` = insertion, empty
 *                  `replacement` = deletion).  A replacement MAY be RENDERED
 *                  as an adjacent deleted + inserted fragment, but it is
 *                  STORED as one event so accept/reject stays atomic per
 *                  edit (roadmap 7.1: "the distinction between an inserted
 *                  fragment and a replacement ... represented as a deletion
 *                  followed by an insertion" is a rendering concern, not a
 *                  storage concern).
 * - `formatting` - inline style attributes changed while the plain text of
 *                  the field stayed identical (`kind: 'spans'`), or a scalar
 *                  style property of a block changed, e.g. heading level or
 *                  alignment (`kind: 'property'`).  Both are feasible under
 *                  the existing architecture: every such change flows
 *                  through the immutable content/block services as an
 *                  observable before/after pair (P05-M2 span algebra).
 * - `block-create` - a block was inserted (payload carries the full created
 *                  block + its position: index and preceding-neighbour id).
 * - `block-delete` - a block was removed (payload carries the full deleted
 *                  block + its last position - enough for a future reject to
 *                  reinsert it).
 * - `block-reorder` - an existing block moved (payload carries origin and
 *                  destination index + preceding-neighbour ids).
 * - `metadata`   - a document metadata field changed (target `document`;
 *                  payload: before/after scalar).
 * - `settings`   - a document settings field changed - page setup,
 *                  typography, themes, front page, header/footer (target
 *                  `document`; payload: before/after scalar).
 *
 * TEXT REPRESENTATION AND ITS LIMITATION (7.1)
 * -------------------------------------------
 * Events record FIELD-LEVEL before/after content, not character ranges.
 * The editors are textarea-surfaces that re-normalize a whole field through
 * the P05-M2 span algebra on every edit; they do not emit per-keystroke
 * deltas, so reliable character-level range identity does not exist at the
 * service boundary.  Fine-grained inserted/deleted fragments are DERIVED by
 * the consumer (P07-M2) with a common-prefix/suffix diff of
 * `original`/`replacement` when markup is rendered.  The model does not
 * claim character-level coverage and later checkpoints must not either
 * unless the editor architecture changes and this record is revised.
 *
 * Targets prefer STABLE IDENTIFIERS: every block-anchored event resolves by
 * `target.blockId` (the `ContentBlock.id` UUID, stable across reorder,
 * duplicate and save/reopen).  The `block-field` `field` string is an
 * OPAQUE LOCATOR (e.g. `text`, `title`, `body`, `items[2].text`,
 * `cells[0][1].spans`) used for display and disambiguation only; it is
 * validated as a non-empty string, its grammar is owned by the emitting
 * instrumentation (`P07-M2`), and it is never the authoritative anchor.
 * This is deliberate: a rigid field-path grammar across all 21 block types
 * would be a fragile parallel schema; block identity is not.
 *
 * METADATA / SETTINGS GRANULARITY
 * -------------------------------
 * Document changes are recorded per LEAF SCALAR (`ChangeScalarValue` =
 * string | number | boolean | null) under a dotted field path (e.g.
 * `title`, `documentId`, `pageSetup.pageSize`, `headerFooter.footer
 * .enabled`).  Composite values (e.g. custom margins) are recorded as one
 * event per changed leaf by the emitting instrumentation; a composite-only
 * change without leaf decomposition is NOT representable in this model and
 * is explicitly deferred to `P07-M2`, which must either decompose it or
 * record the gap.  Derived values (heading numbering prefixes, statistics,
 * renderer-computed layout) are never stored in the document and therefore
 * never tracked.
 *
 * WHAT IS NOT TRACKED IN P07-M1 (explicitly deferred or unsupported)
 * ------------------------------------------------------------------
 * - Nothing is tracked YET in the running application: this checkpoint is
 *   the model + semantics only (`P07-M2` builds the on/off toggle, the
 *   markup, the accept/reject operations and the persistence wiring).
 * - Selection/cursor/panel/UI state is not document data and is never an
 *   event.
 * - Undo/redo does not exist in DocStudio and is NOT part of this model -
 *   it is `P09-M2` (see the four-way distinction below).
 * - Snapshots (`SavedRevision`), comparison and restore are `P07-M3`/
 *   `P07-M4`; the formal revision-history page is `P07-M5`.  No event type
 *   represents them.
 * - Character-level range identity (limitation above), composite settings
 *   without leaf decomposition (granularity above).
 *
 * EVENT STRUCTURE AND LIFECYCLE (7.1, 12.1)
 * -----------------------------------------
 * Every event is an immutable envelope + typed payload:
 * - `id`     - stable UUID assigned at creation (injected `genId` for
 *              deterministic tests, `newUUID()` in production); identity
 *              never changes afterwards.
 * - `type`   - one of the seven `CHANGE_EVENT_TYPES` (discriminated union).
 * - `target` - who/what changed (block, block field, or document field),
 *              with the correlation rules above (a block event's
 *              `target.blockId` MUST equal the carried block's id).
 * - `at`     - ISO 8601 timestamp from the existing `nowISO` convention
 *              (injected clock for tests).
 * - `status` - lifecycle: created as `pending`; planned transitions to
 *              `accepted` / `rejected` by the accept/reject operations
 *              (`P07-M2`).  The MODEL defines the field and its values;
 *              no transition operation exists yet.
 * - `editorLabel?` - optional locally configured editor name (<= 200 chars,
 *              blank rejected).  USER-SUPPLIED METADATA, NOT AUTHENTICATED
 *              IDENTITY (12.1: "not authenticated identity"; 7.6: no
 *              accounts).  Its absence is normal and legal.
 * - `groupId?` - optional UUID grouping several events into ONE logical
 *              compound operation (e.g. a multi-block paste); future
 *              accept/reject treats a group atomically (planned).
 * A change event MUST describe an actual change: construction rejects
 * identical before/after values (`unchanged-value`) - callers must not emit
 * events for no-op edits.
 *
 * ORDERING AND CONSISTENCY (7.1/E)
 * --------------------------------
 * - The event log is an ORDERED, APPEND-ONLY array: array position is the
 *   authoritative application order; `at` timestamps are informational
 *   (wall clock; equal or non-monotonic values are possible and legal).
 * - Repeated edits to the same field produce INDEPENDENT sequential events.
 *   The model does not coalesce them (coalescing, if ever added, must
 *   preserve the recorded semantics).
 * - An edit followed by its reversal produces two events (A->B, B->A); the
 *   model does NOT auto-neutralize pairs.  Each resolves independently.
 * - Events are never rewritten or deleted to reflect later document state.
 *   An event whose target no longer resolves in the current document (e.g.
 *   its block was deleted by a later accepted change) is STALE - a
 *   documented condition that the future accept/reject logic must resolve
 *   honestly (planned: resolve against current state, report honestly, and
 *   never silently drop).
 * - Guarantees: stable identities, validated payloads, ordered append-only
 *   log.  NON-guarantees: no tamper-proofing, no cryptographic signing, no
 *   independently verified authorship, timestamps are not trusted time.
 *
 * ATTRIBUTION AND TIME (7.6, 12.1)
 * --------------------------------
 * DocStudio has no identity, login or account system.  `editorLabel` is
 * locally configured, user-supplied metadata exactly like the document
 * metadata it sits beside; the model never claims the label identifies the
 * actual human who made the edit, and nothing here signs, seals or
 * protects events against editing or deletion.
 *
 * ACCEPT / REJECT - PLANNED BEHAVIOR (`P07-M2`), NOT IMPLEMENTED HERE
 * -------------------------------------------------------------------
 * - Accept a `text`/`formatting` event: apply `replacement` to the target
 *   field if it still resolves; reject: restore `original`.
 * - Accept a `block-create` event: keep the block; reject: remove it.
 * - Accept a `block-delete` event: keep the removal; reject: reinsert the
 *   carried block near its recorded position (resolved against current
 *   state).
 * - Accept/reject `block-reorder`: keep/restore the previous order.
 * - Accept/reject `metadata`/`settings`: keep `replacement`/restore
 *   `original`.
 * - Individual and all-changes operations, group atomicity and stale-target
 *   reporting are all PLANNED (`P07-M2`); no operation exists in this
 *   checkpoint.
 *
 * RENDERING: CLEAN VS MARKED-UP - PLANNED (`P07-M2`, 7.2)
 * -------------------------------------------------------
 * The model stores data only.  How markup renders in the editor, preview
 * and PDF (and the user's markup-vs-clean export choice) is `P07-M2`'s
 * decision; this checkpoint makes no rendering claim.
 *
 * FOUR-WAY DISTINCTION (12.4, 7.1) - related, NOT interchangeable
 * ---------------------------------------------------------------
 * 1. LIVE TRACKED EDIT  = a `ChangeEvent` from this model - marks an edit
 *    while editing (behavior: `P07-M2`).
 * 2. UNDOABLE OPERATION = a future command-history concern (undo/redo),
 *    owned by `P09-M2`.  DocStudio has NO undo/redo today; a change event
 *    is not an undo command.  Accept/reject resolves tracked markup
 *    against document state; undo/redo replays editor operations - related
 *    intents, different mechanisms and lifetimes.
 * 3. SAVED SNAPSHOT     = a `SavedRevision` (schema-v1 stub, P02-M1) - a
 *    persisted content state for inspection/comparison/restoration,
 *    owned by `P07-M3`.  Snapshots are NOT derived from change events and
 *    change events are not stored in snapshots; the two mechanisms are
 *    independent.
 * 4. PRINTED REVISION-HISTORY ENTRY = a `RevisionHistoryEntry` inside the
 *    revision-history BLOCK (P06-M2, manually edited) - printed document
 *    content that the user edits like any other content.  It is NOT an
 *    event log, is never generated from change events, and its P06-M2
 *    behavior is unchanged by this checkpoint.  `P07-M5` may SUGGEST
 *    entries from saved-revision metadata (editable, never automatic).
 *
 * PERSISTENCE AND SCHEMA v1 - NOTHING PERSISTS IN P07-M1 (documented choice)
 * -------------------------------------------------------------------------
 * `DOCSTUDIO_SCHEMA_VERSION` stays 1; the schema-v1 stubs
 * `trackChangesEnabled: boolean` and `savedRevisions: SavedRevision[]`
 * keep their exact meaning (defaults: false / []; validated by
 * `document-file`).  P07-M1 is the definitional checkpoint (7.1) - the
 * typed domain model lives in memory only; no persisted event collection
 * is added.  Rationale: "preserve tracking data on save and reopen"
 * (12.1) is the Track Changes FEATURE requirement assigned to `P07-M2`
 * ("visible and persisted"), the schema stub's own comment anticipates a
 * per-block storage shape that no concrete contract has yet exercised, and
 * the file-size strategy for revision data is assigned to `P07-M3`
 * (risk R-003).  Choosing a storage format now would invent a contract
 * ahead of the checkpoint that must live with it.  `P07-M2` owns the
 * additive schema-v1 extension (following the established additive-optional
 * field pattern) and must update the stub comment then.
 *
 * R-003 (revision-data growth / file-size strategy) stays OPEN: this
 * checkpoint creates no persisted data, so it neither triggers nor
 * mitigates the risk; `P07-M3` owns the persistence strategy and the
 * realistic-history validation.
 *
 * BOUNDARIES (7.6)
 * ----------------
 * History is local and editable.  Track Changes is a document-authoring
 * aid - NOT an audit-proof record, secure audit trail or tamper-proof log,
 * and not a substitute for a controlled document-management system.  No
 * approval routing, distribution control or central register exists or is
 * implied by this model.
 */

import type { InlineSpan } from './blocks';
import type { ContentBlock, DocUUID, ISODateString } from './document';

// ─────────────────────────────────────────────────────────────────────────────
// Event types
// ─────────────────────────────────────────────────────────────────────────────

/**
 * The exhaustive list of change-event types (roadmap 7.1).
 * Extend this array AND the `ChangeEvent` union together; the compile-time
 * `satisfies` clause catches a missing union member.
 */
export const CHANGE_EVENT_TYPES = [
  'text',
  'formatting',
  'block-create',
  'block-delete',
  'block-reorder',
  'metadata',
  'settings',
] as const satisfies readonly string[];

/** Discriminant of a tracked change event. */
export type ChangeEventType = (typeof CHANGE_EVENT_TYPES)[number];

/** Type guard for the `ChangeEventType` union (runtime values). */
export function isChangeEventType(value: unknown): value is ChangeEventType {
  return (
    typeof value === 'string' && (CHANGE_EVENT_TYPES as readonly string[]).includes(value)
  );
}

/** A change event narrowed to one type of the discriminated union. */
export type ChangeEventOfType<T extends ChangeEventType> = Extract<
  ChangeEvent,
  { readonly type: T }
>;

// ─────────────────────────────────────────────────────────────────────────────
// Lifecycle status
// ─────────────────────────────────────────────────────────────────────────────

/** The three lifecycle values a change event can hold. */
export const CHANGE_STATUSES = ['pending', 'accepted', 'rejected'] as const;

/**
 * Event lifecycle status.
 * `pending` - the default at creation; the tracked change has not been
 *   resolved.  `accepted` / `rejected` - PLANNED transitions performed by
 *   the accept/reject operations (`P07-M2`); no transition code exists yet.
 */
export type ChangeStatus = (typeof CHANGE_STATUSES)[number];

/** Type guard for the `ChangeStatus` union (runtime values). */
export function isChangeStatus(value: unknown): value is ChangeStatus {
  return typeof value === 'string' && (CHANGE_STATUSES as readonly string[]).includes(value);
}

// ─────────────────────────────────────────────────────────────────────────────
// Provenance constants
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Maximum length of the optional `editorLabel` (locally configured editor
 * name).  Mirrors the 200-character metadata-title cap; service-enforced
 * practical guard, not a `project_details.md` limit.
 */
export const MAX_EDITOR_LABEL_LENGTH = 200;

// ─────────────────────────────────────────────────────────────────────────────
// Targets
// ─────────────────────────────────────────────────────────────────────────────

/** Target for whole-block operations (`block-create` / `block-delete` / `block-reorder`). */
export interface BlockChangeTarget {
  readonly kind: 'block';
  /** The stable `ContentBlock.id` UUID of the affected block. */
  readonly blockId: DocUUID;
}

/**
 * Target for content/property changes inside one block (`text` /
 * `formatting`).
 * `blockId` is the authoritative anchor; `field` is an OPAQUE LOCATOR
 * (validated as a non-empty string, grammar owned by the emitting
 * instrumentation - see the module docblock).
 */
export interface BlockFieldChangeTarget {
  readonly kind: 'block-field';
  readonly blockId: DocUUID;
  /** Opaque locator naming the changed field/property within the block. */
  readonly field: string;
}

/** Target for document-level changes (`metadata` / `settings`). */
export interface DocumentChangeTarget {
  readonly kind: 'document';
  /** Dotted path of the changed leaf field (e.g. `title`, `pageSetup.pageSize`). */
  readonly field: string;
}

/** Who/what a change event affects. */
export type ChangeTarget = BlockChangeTarget | BlockFieldChangeTarget | DocumentChangeTarget;

// ─────────────────────────────────────────────────────────────────────────────
// Payloads
// ─────────────────────────────────────────────────────────────────────────────

/** A leaf scalar representable in document metadata/settings payloads. */
export type ChangeScalarValue = string | number | boolean | null;

/**
 * `text` payload: field-level before/after content.
 * Insertion = empty `original`; deletion = empty `replacement`; a
 * replacement (both non-empty) may be rendered as adjacent delete+insert
 * markup but is stored as this one event (module docblock, 7.1).
 */
export interface TextChangePayload {
  readonly original: string;
  readonly replacement: string;
}

/**
 * `formatting` payload (two variants, discriminated by `kind`):
 * - `spans`   - inline style attributes of a rich-text field changed while
 *               the plain text stayed IDENTICAL (enforced by validation via
 *               the same `spansToPlainText` projection the editor uses).
 * - `property` - a scalar style property of a block changed (e.g. heading
 *               `level`, alignment, block spacing).
 * A formatting event whose text/values actually changed is misclassified
 * and rejected (`invalid-payload` / `unchanged-value`).
 */
export type FormattingChangePayload =
  | {
      readonly kind: 'spans';
      readonly original: readonly InlineSpan[];
      readonly replacement: readonly InlineSpan[];
    }
  | {
      readonly kind: 'property';
      readonly original: ChangeScalarValue;
      readonly replacement: ChangeScalarValue;
    };

/**
 * `block-create` / `block-delete` payload.
 * Carries the FULL block (as held by the live document at event time) plus
 * its position - enough for the future reject of a creation (remove) or the
 * reject of a deletion (reinsert).  Position fields are POINT-IN-TIME facts,
 * not persistent anchors; future operations resolve them against the
 * current document (module docblock, ordering section).
 */
export interface BlockPositionedChangePayload {
  readonly block: ContentBlock;
  /** 0-based index of the block at event time. */
  readonly index: number;
  /** Preceding neighbour's block id at event time, or null at document start. */
  readonly afterBlockId: DocUUID | null;
}

/**
 * `block-reorder` payload: origin and destination of the move.
 * Neighbour ids (not only indices) are recorded because indices shift as
 * other events resolve, while identities do not.
 */
export interface BlockReorderChangePayload {
  readonly fromIndex: number;
  readonly toIndex: number;
  readonly fromAfterBlockId: DocUUID | null;
  readonly toAfterBlockId: DocUUID | null;
}

/** `metadata` / `settings` payload: per-leaf before/after scalar. */
export interface DocumentFieldChangePayload {
  readonly original: ChangeScalarValue;
  readonly replacement: ChangeScalarValue;
}

// ─────────────────────────────────────────────────────────────────────────────
// Event union
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Envelope fields shared by every change event.
 * `id`/`at` are stamped at creation (injected clock/ID for deterministic
 * tests); `status` starts `pending`; `editorLabel` and `groupId` are
 * optional (module docblock, lifecycle section).
 */
export interface ChangeEventEnvelope {
  /** Stable event identity (UUID, assigned at creation, never changes). */
  readonly id: DocUUID;
  /** ISO 8601 creation time (`nowISO` convention; informational ordering). */
  readonly at: ISODateString;
  readonly status: ChangeStatus;
  /** Optional locally configured editor name - user-supplied, unauthenticated. */
  readonly editorLabel?: string;
  /** Optional compound-operation group; future accept/reject is atomic per group. */
  readonly groupId?: DocUUID;
}

/**
 * The tracked change event - a discriminated union over the seven
 * `CHANGE_EVENT_TYPES`.  Target correlation (validated by
 * `validateChangeEvent`):
 *   text/formatting -> `block-field`, block ops -> `block`,
 *   metadata/settings -> `document`.
 */
export type ChangeEvent =
  | (ChangeEventEnvelope & {
      readonly type: 'text';
      readonly target: BlockFieldChangeTarget;
      readonly payload: TextChangePayload;
    })
  | (ChangeEventEnvelope & {
      readonly type: 'formatting';
      readonly target: BlockFieldChangeTarget;
      readonly payload: FormattingChangePayload;
    })
  | (ChangeEventEnvelope & {
      readonly type: 'block-create';
      readonly target: BlockChangeTarget;
      readonly payload: BlockPositionedChangePayload;
    })
  | (ChangeEventEnvelope & {
      readonly type: 'block-delete';
      readonly target: BlockChangeTarget;
      readonly payload: BlockPositionedChangePayload;
    })
  | (ChangeEventEnvelope & {
      readonly type: 'block-reorder';
      readonly target: BlockChangeTarget;
      readonly payload: BlockReorderChangePayload;
    })
  | (ChangeEventEnvelope & {
      readonly type: 'metadata';
      readonly target: DocumentChangeTarget;
      readonly payload: DocumentFieldChangePayload;
    })
  | (ChangeEventEnvelope & {
      readonly type: 'settings';
      readonly target: DocumentChangeTarget;
      readonly payload: DocumentFieldChangePayload;
    });

/**
 * A creation draft: the event minus the envelope fields the service stamps
 * (`id`, `at`, `status`).  Typed per event type; JavaScript callers are
 * protected by `validateChangeEvent`'s runtime checks.
 */
export type ChangeEventDraft<T extends ChangeEventType = ChangeEventType> =
  ChangeEvent extends infer E
    ? E extends { readonly type: T }
      ? Omit<E, 'id' | 'at' | 'status'>
      : never
    : never;
