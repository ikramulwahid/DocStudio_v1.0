import React, { useState } from 'react';
import type { DocUUID, SavedRevision } from '../../types/document';
import {
  SNAPSHOT_LABEL_MAX,
  SNAPSHOT_REASON_MAX,
  SNAPSHOT_SUMMARY_MAX,
  inspectSnapshot,
  previewSnapshotJson,
  type SnapshotCreateResult,
  type SnapshotHistoryStats,
  type SnapshotInput,
} from '../../services/snapshots';
import './LeftPanel.css';
import './SavedRevisionsPanel.css';

/**
 * DocStudio — Saved Revisions panel (P07-M3, §12.2)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * The user-facing snapshot surface: create a named/numbered snapshot,
 * browse the chronological history with its metadata, inspect one saved
 * snapshot READ-ONLY, and trigger Restore / Delete — both of which the
 * App confirms before touching the document.
 *
 * Boundaries honored here:
 * • Inspection is structural reading only (`inspectSnapshot` is pure) —
 *   it cannot edit the live document, and no comparison of two snapshots
 *   is offered (P07-M4 owns comparison; this panel never implies it).
 * • Creating a snapshot stores the current state; the hint text says so
 *   plainly — it does not claim the content was edited, reviewed or
 *   technically/regulatorily verified.
 * • Delete is an explicit, confirmed user action (the R-003 size remedy);
 *   nothing is ever removed automatically.
 */
export interface SavedRevisionsPanelProps {
  /** Authoritative `document.savedRevisions` (chronological, oldest first). */
  revisions: readonly SavedRevision[];
  /** Measured history-vs-project size report (R-003, advisory only). */
  history: SnapshotHistoryStats;
  /** Save a snapshot; returns the service result for inline feedback. */
  onCreate: (input: SnapshotInput) => SnapshotCreateResult;
  /** Request a restore — the App runs the unsaved guard + confirmation. */
  onRestore: (revisionId: DocUUID) => void;
  /** Request a delete — the App runs the confirmation. */
  onDelete: (revisionId: DocUUID) => void;
}

const formatBytes = (bytes: number): string =>
  bytes < 1024
    ? `${bytes} B`
    : bytes < 1024 * 1024
      ? `${(bytes / 1024).toFixed(1)} KB`
      : `${(bytes / (1024 * 1024)).toFixed(1)} MB`;

const utf8Bytes = (text: string): number => new TextEncoder().encode(text).length;

type Notice = { kind: 'error' | 'success'; text: string };

export const SavedRevisionsPanel: React.FC<SavedRevisionsPanelProps> = ({
  revisions,
  history,
  onCreate,
  onRestore,
  onDelete,
}) => {
  const [label, setLabel] = useState('');
  const [summary, setSummary] = useState('');
  const [reason, setReason] = useState('');
  const [notice, setNotice] = useState<Notice | null>(null);
  const [selectedId, setSelectedId] = useState<DocUUID | null>(null);
  const [showPreview, setShowPreview] = useState(false);

  const selected = selectedId !== null ? (revisions.find((r) => r.id === selectedId) ?? null) : null;
  const inspection = selected !== null ? inspectSnapshot(selected) : null;

  const handleCreate = (event: React.FormEvent): void => {
    event.preventDefault();
    const result = onCreate({ label, summary, reason });
    if (result.ok) {
      setLabel('');
      setSummary('');
      setReason('');
      setNotice({ kind: 'success', text: `Snapshot "${result.revision.label}" saved.` });
    } else {
      setNotice({ kind: 'error', text: result.message });
    }
  };

  const toggleInspect = (revisionId: DocUUID): void => {
    setShowPreview(false);
    setSelectedId((prev) => (prev === revisionId ? null : revisionId));
  };

  return (
    <div className="sr-panel" aria-label="Saved snapshots controls">
      {/* ── Create ─────────────────────────────────────────────────────── */}
      <form className="sr-create" onSubmit={handleCreate} aria-label="Save a new snapshot">
        <div className="sr-row">
          <label className="sr-field-label" htmlFor="ds-snapshot-label">
            Snapshot name or number
          </label>
          <input
            id="ds-snapshot-label"
            className="sr-input"
            type="text"
            maxLength={SNAPSHOT_LABEL_MAX}
            value={label}
            placeholder='e.g. "v1" or "Draft for review"'
            onChange={(e) => setLabel(e.target.value)}
          />
        </div>
        <div className="sr-row">
          <label className="sr-field-label" htmlFor="ds-snapshot-summary">
            Summary (optional)
          </label>
          <input
            id="ds-snapshot-summary"
            className="sr-input"
            type="text"
            maxLength={SNAPSHOT_SUMMARY_MAX}
            value={summary}
            placeholder="What changed"
            onChange={(e) => setSummary(e.target.value)}
          />
        </div>
        <div className="sr-row">
          <label className="sr-field-label" htmlFor="ds-snapshot-reason">
            Reason (optional)
          </label>
          <input
            id="ds-snapshot-reason"
            className="sr-input"
            type="text"
            maxLength={SNAPSHOT_REASON_MAX}
            value={reason}
            placeholder="Why it was saved"
            onChange={(e) => setReason(e.target.value)}
          />
        </div>
        <button type="submit" className="sr-save-btn">
          Save Snapshot
        </button>
        {notice !== null && (
          <p
            className={`sr-notice sr-notice--${notice.kind}`}
            role={notice.kind === 'error' ? 'alert' : 'status'}
          >
            {notice.text}
          </p>
        )}
        <span className="sr-hint">
          Stores the current document state — content, settings, assets and Track Changes
          state — under this name. It does not change your document content and does not
          verify it.
        </span>
      </form>

      {/* ── Measured history size (R-003, advisory only) ───────────────── */}
      <div className="sr-stats">
        <span className="sr-stats-main">
          {history.count} snapshot{history.count === 1 ? '' : 's'} · ≈{' '}
          {formatBytes(history.historyBytes)} of {formatBytes(history.projectBytes)} project data
        </span>
        <span className="sr-hint">
          Snapshots are stored inside the project file and grow linearly — never nested
          inside each other.
        </span>
        {history.advisory && history.advisoryMessage !== null && (
          <p className="sr-advisory" role="note">
            {history.advisoryMessage}
          </p>
        )}
      </div>

      {/* ── History list ───────────────────────────────────────────────── */}
      <section className="sr-list-section" aria-label="Saved snapshot history">
        <h3 className="sr-section-title">Saved snapshots</h3>
        {revisions.length === 0 ? (
          <p className="sr-empty">
            No saved snapshots yet. Use “Save Snapshot” above to keep the current state.
          </p>
        ) : (
          <ol className="sr-list">
            {revisions.map((revision, index) => (
              <li
                key={revision.id}
                className="sr-entry"
                data-revision-id={revision.id}
                data-revision-label={revision.label}
              >
                <header className="sr-entry-head">
                  <span className="sr-entry-index" aria-hidden="true">
                    {index + 1}
                  </span>
                  <span className="sr-entry-label">{revision.label}</span>
                  <span className="sr-entry-size" title="Approximate stored size">
                    {formatBytes(utf8Bytes(revision.snapshotJson))}
                  </span>
                </header>
                <p className="sr-entry-at" title={revision.savedAt}>
                  Saved {new Date(revision.savedAt).toLocaleString()}
                </p>
                {revision.summary !== undefined && (
                  <p className="sr-entry-note">
                    <span className="sr-note-key">Summary:</span> {revision.summary}
                  </p>
                )}
                {revision.reason !== undefined && (
                  <p className="sr-entry-note">
                    <span className="sr-note-key">Reason:</span> {revision.reason}
                  </p>
                )}
                <footer className="sr-entry-actions">
                  <button
                    type="button"
                    className="sr-action-btn"
                    onClick={() => toggleInspect(revision.id)}
                    aria-pressed={selectedId === revision.id}
                    title="Read the saved state of this snapshot without touching the document"
                  >
                    {selectedId === revision.id ? 'Hide' : 'Inspect'}
                  </button>
                  <button
                    type="button"
                    className="sr-action-btn sr-action-btn--restore"
                    onClick={() => onRestore(revision.id)}
                    title="Replace the current state with this snapshot — all snapshots are kept"
                  >
                    Restore
                  </button>
                  <button
                    type="button"
                    className="sr-action-btn sr-action-btn--delete"
                    onClick={() => onDelete(revision.id)}
                    title="Delete only this snapshot (asked first; never automatic)"
                  >
                    Delete
                  </button>
                </footer>
              </li>
            ))}
          </ol>
        )}
      </section>

      {/* ── Read-only inspection of the selected snapshot ──────────────── */}
      {selected !== null && inspection !== null && (
        <section
          className="sr-inspect"
          data-inspect-id={selected.id}
          aria-label="Snapshot inspection (read-only)"
        >
          <h3 className="sr-section-title">
            Inspecting “{selected.label}” — read-only
          </h3>
          {inspection.ok ? (
            <>
              <p className="sr-hint">
                Saved content shown for reading only — this is not the live document, and
                editing it is not possible here. Differences between snapshots are not shown
                (comparison arrives with a later checkpoint).
              </p>
              <dl className="sr-inspect-grid">
                <div className="sr-inspect-item">
                  <dt>Title</dt>
                  <dd>{inspection.view.title}</dd>
                </div>
                <div className="sr-inspect-item">
                  <dt>Status</dt>
                  <dd>{inspection.view.status}</dd>
                </div>
                <div className="sr-inspect-item">
                  <dt>Page</dt>
                  <dd>{inspection.view.pageSize}</dd>
                </div>
                <div className="sr-inspect-item">
                  <dt>Blocks</dt>
                  <dd>{inspection.view.blockCount}</dd>
                </div>
                <div className="sr-inspect-item">
                  <dt>Assets</dt>
                  <dd>
                    {inspection.view.assetCount}
                    {inspection.view.assetNames.length > 0
                      ? ` (${inspection.view.assetNames.join(', ')})`
                      : ''}
                  </dd>
                </div>
                <div className="sr-inspect-item">
                  <dt>Track Changes</dt>
                  <dd>
                    {inspection.view.trackingEnabled ? 'on' : 'off'} ·{' '}
                    {inspection.view.pendingChangeCount} pending ·{' '}
                    {inspection.view.resolvedChangeCount} resolved
                  </dd>
                </div>
                <div className="sr-inspect-item sr-inspect-item--wide">
                  <dt>Block types</dt>
                  <dd>
                    {inspection.view.blockTypeCounts.length === 0
                      ? 'none'
                      : inspection.view.blockTypeCounts
                          .map((entry) => `${entry.type} × ${entry.count}`)
                          .join(', ')}
                  </dd>
                </div>
              </dl>
              <button
                type="button"
                className="sr-action-btn sr-preview-toggle"
                onClick={() => setShowPreview((prev) => !prev)}
                aria-expanded={showPreview}
              >
                {showPreview ? 'Hide stored document' : 'Show stored document (JSON)'}
              </button>
              {showPreview && (
                <pre className="sr-preview" aria-label="Stored snapshot JSON (read-only)">
                  {previewSnapshotJson(inspection.document)}
                </pre>
              )}
            </>
          ) : (
            <p className="sr-notice sr-notice--error" role="alert">
              {inspection.message} The live document is untouched.
            </p>
          )}
        </section>
      )}
    </div>
  );
};

export default SavedRevisionsPanel;
