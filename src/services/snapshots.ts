/**
 * DocStudio — Saved snapshot lifecycle (P07-M3, spec §12.2 / §12.4)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * This module is the AUTHORITATIVE semantics record for saved snapshots —
 * creation, listing, read-only inspection, restoration and explicit
 * deletion.  It is free of React/Tauri/DOM imports so every rule below is
 * directly testable (see verify_p07_m3.mjs).
 *
 * Snapshot content (documented decision, spec §12.2/§12.4)
 * ────────────────────────────────────────────────────────
 * A snapshot captures the COMPLETE schema-v1 document state at the moment
 * it is saved — envelope, metadata, laboratory-profile snapshot, page
 * setup/typography, front page, header/footer/watermark, ordered blocks
 * (with stable IDs), embedded asset records, `trackChangesEnabled` and the
 * full `changeEvents` log — EXCEPT `savedRevisions` itself, which is always
 * encoded as `[]` inside the payload.  The live document's `savedRevisions`
 * array is the single authoritative history; nesting it would make every
 * snapshot carry all previous snapshots (recursive growth).  This is the
 * non-recursive encoding strategy (R-003).
 *
 * Because the tracking state is part of the captured state, RESTORING a
 * snapshot returns content AND Track Changes state to their snapshot-time
 * values (events logged after the snapshot are part of the state being
 * rolled back; they survive only inside later snapshots, if any).  This is
 * stated in the restore confirmation dialog — it is never silent — and the
 * whole behavior is pinned by the suite.
 *
 * Restore semantics (§12.2 "restoring an earlier snapshot as a new current
 * state without silently erasing the previous snapshots")
 * ──────────────────────────────────────────────────────────────────────────
 * 1. The selected snapshot is found by ID.
 * 2. Its `snapshotJson` is parsed and validated with the REAL
 *    `validateDocument` service — malformed/corrupt content is rejected
 *    BEFORE any document state is built.
 * 3. The parsed state becomes the new active document state.
 * 4. The authoritative `savedRevisions` history is preserved verbatim and
 *    ONE new `SavedRevision` ("Restore of …") is appended, recording the
 *    restoration as a new revision instead of rewriting history in place.
 * 5. Every failure path returns before construction, so a failed restore
 *    leaves the current document and the snapshot list untouched (same
 *    object reference).
 *
 * Loading vs point-of-use validation (documented decision)
 * ────────────────────────────────────────────────────────
 * `document-file.ts` validates each `savedRevisions` entry's ENVELOPE at
 * load (object shape, string fields, `snapshotJson` parses as JSON) with
 * the established `DocumentFileError` reporting.  Full embedded-document
 * validation runs at INSPECTION and RESTORE through the real validator, so
 * a parseable-but-damaged snapshot payload is reported precisely at point
 * of use instead of making the whole project unopenable.  This keeps open
 * cost linear in total payload bytes and matches §4.C's "reject … without
 * partially modifying the current document".
 *
 * File-size strategy (R-003)
 * ──────────────────────────
 * Snapshots are stored inline in the `.docstudio` file (`savedRevisions`),
 * as §12.2 requires ("store history locally with the project, subject to a
 * documented file-size strategy").  Growth is LINEAR: each record adds one
 * payload copy of the document state plus a small envelope; no record ever
 * contains another record's history.  `snapshotHistoryStats` measures the
 * history against the project data for the panel's size report, and flags
 * an ADVISORY (never enforced) warning above
 * `SNAPSHOT_HISTORY_ADVISORY_SHARE`.  There is no hard cap, no automatic
 * pruning and no silent deletion — the only size remedy is the explicit,
 * confirmed, user-initiated `deleteSnapshot`, which removes exactly the
 * one selected record.
 *
 * @module services/snapshots
 */

import {
  type DocStudioDocument,
  type DocUUID,
  type ISODateString,
  type SavedRevision,
} from '../types/document';
import { newUUID, nowISO } from '../types/defaults';
import { validateDocument, DocumentFileError } from './document-file';

// ─────────────────────────────────────────────────────────────────────────────
// Limits and advisory threshold (validation, never coerced)
// ─────────────────────────────────────────────────────────────────────────────

/** Maximum length of a user-entered snapshot label (characters). */
export const SNAPSHOT_LABEL_MAX = 120;
/** Maximum length of the optional summary (characters). */
export const SNAPSHOT_SUMMARY_MAX = 500;
/** Maximum length of the optional reason (characters). */
export const SNAPSHOT_REASON_MAX = 500;
/**
 * Advisory share of project data occupied by snapshot payloads above which
 * the panel shows a non-blocking size hint.  Chosen so the hint stays quiet
 * while the history is a small part of the project: `share` compares the
 * history against the WHOLE project (which includes the history), so
 * `share > 0.8` means the saved snapshots hold more than 4× the live
 * document state.  Purely informational: it caps nothing and deletes
 * nothing.
 */
export const SNAPSHOT_HISTORY_ADVISORY_SHARE = 0.8;

// ─────────────────────────────────────────────────────────────────────────────
// Result shapes (same conventions as BlockActionResult / ChangeEventResult)
// ─────────────────────────────────────────────────────────────────────────────

export type SnapshotErrorCode =
  | 'empty-label' // label missing/whitespace-only
  | 'label-too-long' // label exceeds SNAPSHOT_LABEL_MAX
  | 'summary-too-long' // summary exceeds SNAPSHOT_SUMMARY_MAX
  | 'reason-too-long' // reason exceeds SNAPSHOT_REASON_MAX
  | 'not-found' // no snapshot with that ID
  | 'invalid-snapshot-json' // snapshotJson is not parseable JSON
  | 'invalid-snapshot-content'; // parsed payload is not a valid document

/** User input for creating one snapshot (§12.2 fields). */
export interface SnapshotInput {
  label: string;
  summary?: string;
  reason?: string;
}

/** Injection options for deterministic construction (tests / audit probes). */
export interface SnapshotOptions {
  now?: ISODateString;
  genId?: () => DocUUID;
}

export type SnapshotCreateResult =
  | { ok: true; doc: DocStudioDocument; revision: SavedRevision }
  | { ok: false; code: SnapshotErrorCode; message: string };

export type SnapshotRestoreResult =
  | { ok: true; doc: DocStudioDocument; source: SavedRevision; revision: SavedRevision }
  | { ok: false; code: SnapshotErrorCode; message: string };

export type SnapshotDeleteResult =
  | { ok: true; doc: DocStudioDocument; revision: SavedRevision }
  | { ok: false; code: SnapshotErrorCode; message: string };

/** Derived, read-only summary of one snapshot's saved content. */
export interface SnapshotView {
  /** `metadata.title` as saved. */
  title: string;
  /** `metadata.status` as saved. */
  status: string;
  /** `pageSetup.size` as saved. */
  pageSize: string;
  blockCount: number;
  /** Block counts by type, alphabetically by type. */
  blockTypeCounts: Array<{ type: string; count: number }>;
  assetCount: number;
  /** Asset filenames as saved (for display only). */
  assetNames: string[];
  /** Pending tracked changes in the SAVED log. */
  pendingChangeCount: number;
  /** Accepted/rejected tracked changes in the SAVED log. */
  resolvedChangeCount: number;
  /** `trackChangesEnabled` as saved. */
  trackingEnabled: boolean;
}

export type SnapshotInspectResult =
  | { ok: true; revision: SavedRevision; document: DocStudioDocument; view: SnapshotView }
  | { ok: false; code: SnapshotErrorCode; message: string };

const fail = (
  code: SnapshotErrorCode,
  message: string,
): { ok: false; code: SnapshotErrorCode; message: string } => ({ ok: false, code, message });

// ─────────────────────────────────────────────────────────────────────────────
// Encoding
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Encode the document state stored inside one `SavedRevision`.
 *
 * The result is the FULL document with `savedRevisions: []` — the single
 * non-recursive rule that keeps history growth linear (see module header).
 * An absent `changeEvents` key stays absent, so documents that never
 * tracked round-trip exactly like the accepted schema-v1 behavior.
 */
export function buildSnapshotPayload(doc: DocStudioDocument): string {
  return JSON.stringify({ ...doc, savedRevisions: [] });
}

// ─────────────────────────────────────────────────────────────────────────────
// Create
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Save the current document state as a new named/numbered snapshot.
 *
 * • Label is required (trimmed; whitespace-only rejected) and bounded —
 *   inputs are REJECTED when invalid, never silently truncated or coerced.
 * • The source document is never mutated: a fresh array and a fresh
 *   revision record are built, everything else is shared by reference.
 * • `metadata.modifiedAt` is deliberately NOT stamped: saving a snapshot
 *   does not edit document content or settings (§12.4) — the session still
 *   becomes Modified through the normal fingerprint because the file now
 *   carries new history.
 * • The snapshot is NOT recorded as a Track Changes event: snapshots are
 *   independent of the per-edit event log (§12.4).
 */
export function createSnapshot(
  doc: DocStudioDocument,
  input: SnapshotInput,
  options: SnapshotOptions = {},
): SnapshotCreateResult {
  const label = (input.label ?? '').trim();
  if (label.length === 0) {
    return fail('empty-label', 'Enter a name or number for this snapshot (e.g. "v1").');
  }
  if (label.length > SNAPSHOT_LABEL_MAX) {
    return fail(
      'label-too-long',
      `The snapshot name must be at most ${SNAPSHOT_LABEL_MAX} characters (entered ${label.length}).`,
    );
  }
  const summary = input.summary !== undefined && input.summary !== '' ? input.summary.trim() : undefined;
  const reason = input.reason !== undefined && input.reason !== '' ? input.reason.trim() : undefined;
  if (summary !== undefined && summary.length > SNAPSHOT_SUMMARY_MAX) {
    return fail(
      'summary-too-long',
      `The summary must be at most ${SNAPSHOT_SUMMARY_MAX} characters (entered ${summary.length}).`,
    );
  }
  if (reason !== undefined && reason.length > SNAPSHOT_REASON_MAX) {
    return fail(
      'reason-too-long',
      `The reason must be at most ${SNAPSHOT_REASON_MAX} characters (entered ${reason.length}).`,
    );
  }

  const now = options.now ?? nowISO();
  const revision: SavedRevision = {
    id: options.genId ? options.genId() : newUUID(),
    label,
    savedAt: now,
    snapshotJson: buildSnapshotPayload(doc),
    ...(summary !== undefined ? { summary } : {}),
    ...(reason !== undefined ? { reason } : {}),
  };

  return {
    ok: true,
    doc: { ...doc, savedRevisions: [...doc.savedRevisions, revision] },
    revision,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// List / find
// ─────────────────────────────────────────────────────────────────────────────

/**
 * The saved history in STORED order — chronological, oldest first (the
 * order records are appended and the order §12.2's history is displayed).
 * Returns the document's own array (read-only by convention).
 */
export function listSnapshots(doc: DocStudioDocument): readonly SavedRevision[] {
  return doc.savedRevisions;
}

/** Find one snapshot by its stable ID, or null when absent. */
export function findSnapshot(
  doc: DocStudioDocument,
  revisionId: DocUUID,
): SavedRevision | null {
  return doc.savedRevisions.find((revision) => revision.id === revisionId) ?? null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Inspect (read-only)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Parse and validate one snapshot's saved state and derive a read-only
 * view of it.  Pure: neither `revision` nor any document is ever mutated,
 * and nothing here can reach the live document — inspection is structural
 * reading only (comparison of two snapshots is P07-M4, deliberately absent).
 */
export function inspectSnapshot(revision: SavedRevision): SnapshotInspectResult {
  const parsed = parseSnapshot(revision);
  if (parsed.ok === false) return parsed;

  const doc = parsed.document;
  const counts = new Map<string, number>();
  for (const block of doc.blocks) {
    const type = block.data.type;
    counts.set(type, (counts.get(type) ?? 0) + 1);
  }
  const events = doc.changeEvents ?? [];
  const view: SnapshotView = {
    title: doc.metadata.title,
    status: doc.metadata.status,
    pageSize: doc.pageSetup.size,
    blockCount: doc.blocks.length,
    blockTypeCounts: [...counts.entries()]
      .map(([type, count]) => ({ type, count }))
      .sort((a, b) => a.type.localeCompare(b.type)),
    assetCount: Object.keys(doc.assets).length,
    assetNames: Object.values(doc.assets).map((asset) => asset.filename),
    pendingChangeCount: events.filter((event) => event.status === 'pending').length,
    resolvedChangeCount: events.filter((event) => event.status !== 'pending').length,
    trackingEnabled: doc.trackChangesEnabled,
  };

  return { ok: true, revision, document: doc, view };
}

/**
 * Read-only JSON preview of an inspected snapshot: pretty-printed with
 * embedded asset payloads elided, so a large `base64Data` blob can never
 * flood the panel.  Derived values only — the document is untouched.
 */
export function previewSnapshotJson(doc: DocStudioDocument): string {
  const elide = (value: unknown): unknown => {
    if (Array.isArray(value)) return value.map(elide);
    if (value !== null && typeof value === 'object') {
      const out: Record<string, unknown> = {};
      for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
        if (key === 'base64Data' && typeof item === 'string') {
          out[key] = `«embedded asset data omitted — ${item.length} characters»`;
        } else {
          out[key] = elide(item);
        }
      }
      return out;
    }
    return value;
  };
  return JSON.stringify(elide(doc), null, 2);
}

// ─────────────────────────────────────────────────────────────────────────────
// Restore
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Restore one snapshot as the new current state (§12.2).
 *
 * See the module header for the five-step semantics.  Validation happens
 * BEFORE construction, so every failure returns the original document
 * untouched; success preserves the whole history and appends the single
 * "Restore of …" record whose payload equals the restored state.
 */
export function restoreSnapshot(
  doc: DocStudioDocument,
  revisionId: DocUUID,
  options: SnapshotOptions = {},
): SnapshotRestoreResult {
  const source = findSnapshot(doc, revisionId);
  if (source === null) {
    return fail(
      'not-found',
      'That saved snapshot no longer exists in this document.',
    );
  }

  const parsed = parseSnapshot(source);
  if (parsed.ok === false) return parsed;

  const now = options.now ?? nowISO();
  const revision: SavedRevision = {
    id: options.genId ? options.genId() : newUUID(),
    label: `Restore of "${source.label}"`,
    savedAt: now,
    reason: `Restored from snapshot "${source.label}" saved ${source.savedAt}`,
    // The restored state IS the source payload — stored once, never nested.
    snapshotJson: source.snapshotJson,
  };

  return {
    ok: true,
    doc: {
      ...parsed.document,
      savedRevisions: [...doc.savedRevisions, revision],
    },
    source,
    revision,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Delete (explicit user action only — never automatic, never silent)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Remove exactly one snapshot from the history.  This is the documented
 * size remedy for R-003: always user-initiated and confirmed by the App,
 * it never runs on its own, never prunes automatically and never touches
 * other records or document content.
 */
export function deleteSnapshot(
  doc: DocStudioDocument,
  revisionId: DocUUID,
): SnapshotDeleteResult {
  const revision = findSnapshot(doc, revisionId);
  if (revision === null) {
    return fail('not-found', 'That saved snapshot no longer exists in this document.');
  }
  return {
    ok: true,
    doc: {
      ...doc,
      savedRevisions: doc.savedRevisions.filter((entry) => entry.id !== revisionId),
    },
    revision,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// History size measurement (R-003 reporting)
// ─────────────────────────────────────────────────────────────────────────────

export interface SnapshotHistoryStats {
  count: number;
  /** UTF-8 bytes of the serialized snapshot records (payloads + envelope). */
  historyBytes: number;
  /** UTF-8 bytes of the whole project state (compact JSON). */
  projectBytes: number;
  /** historyBytes / projectBytes, clamped to [0, 1]. */
  share: number;
  /** True above SNAPSHOT_HISTORY_ADVISORY_SHARE (informational only). */
  advisory: boolean;
  /** User-facing guidance when `advisory`, else null. */
  advisoryMessage: string | null;
}

const utf8Bytes = (text: string): number => new TextEncoder().encode(text).length;

const formatBytes = (bytes: number): string =>
  bytes < 1024
    ? `${bytes} B`
    : bytes < 1024 * 1024
      ? `${(bytes / 1024).toFixed(1)} KB`
      : `${(bytes / (1024 * 1024)).toFixed(1)} MB`;

/**
 * Measure the snapshot history against the project data for the panel's
 * size report.  `projectJson` is the already-computed session fingerprint
 * (compact JSON of the full document), so measuring costs one encode — no
 * extra serialization.  Advisory only: this function decides nothing and
 * deletes nothing.
 */
export function snapshotHistoryStats(
  revisions: readonly SavedRevision[],
  projectJson: string,
): SnapshotHistoryStats {
  const historyBytes = revisions.length === 0 ? 0 : utf8Bytes(JSON.stringify(revisions));
  const projectBytes = utf8Bytes(projectJson);
  const share =
    projectBytes > 0 ? Math.min(1, historyBytes / projectBytes) : revisions.length > 0 ? 1 : 0;
  const advisory = revisions.length > 0 && share > SNAPSHOT_HISTORY_ADVISORY_SHARE;
  return {
    count: revisions.length,
    historyBytes,
    projectBytes,
    share,
    advisory,
    advisoryMessage: advisory
      ? `Snapshots now hold about ${Math.round(share * 100)}% of this project's data ` +
        `(${formatBytes(historyBytes)} of ${formatBytes(projectBytes)}). ` +
        'If the file feels large, delete snapshots you no longer need below — ' +
        'nothing is ever removed automatically.'
      : null,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Shared payload parsing (point-of-use validation)
// ─────────────────────────────────────────────────────────────────────────────

type ParsedSnapshot =
  | { ok: true; document: DocStudioDocument }
  | { ok: false; code: SnapshotErrorCode; message: string };

/**
 * Parse and FULLY validate one snapshot payload with the real document
 * validator.  Used by inspection and restore — never by document load
 * (see the module header for the load-time/point-of-use split).
 */
function parseSnapshot(revision: SavedRevision): ParsedSnapshot {
  let raw: unknown;
  try {
    raw = JSON.parse(revision.snapshotJson);
  } catch (e) {
    return fail(
      'invalid-snapshot-json',
      `The saved snapshot "${revision.label}" cannot be read because its stored content is ` +
        `not valid JSON. ${e instanceof Error ? e.message : String(e)}`,
    );
  }
  try {
    validateDocument(raw);
  } catch (e) {
    return fail(
      'invalid-snapshot-content',
      `The saved snapshot "${revision.label}" contains an incomplete or damaged document ` +
        `and cannot be restored.` +
        (e instanceof DocumentFileError && e.detail ? ` ${e.detail}` : ''),
    );
  }
  return { ok: true, document: raw };
}
