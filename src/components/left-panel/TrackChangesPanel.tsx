import React from 'react';
import type { ChangeEvent } from '../../types/change-events';
import type { ContentBlock, DocUUID } from '../../types/document';
import type { DocumentChangeView } from '../../services/track-changes';
import { describeChangeEvent } from '../../services/track-changes';
import './LeftPanel.css';

/**
 * DocStudio - Track Changes panel (P07-M2, §12.1)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * The user-facing review surface: the recording toggle (backed by the
 * persisted `document.trackChangesEnabled`), the locally configured
 * editor name, the markup/clean view choice, and the pending-change list
 * with per-event accept/reject plus accept-all/reject-all.  Every entry
 * renders the AUTHORITATIVE event envelope (`describeChangeEvent` reads
 * the real `ChangeEvent`; no separate review record exists).  The editor
 * label is user-supplied local metadata, never authenticated identity
 * (§12.1 "not authenticated identity"; no account system exists).
 */
export interface TrackChangesPanelProps {
  /** Authoritative `document.trackChangesEnabled` (the recording toggle). */
  trackChangesEnabled: boolean;
  /** Toggle recording. Never deletes/accepts/rejects existing events. */
  onTrackChangesToggle: (enabled: boolean) => void;
  /** The document's persisted change-event log (append-only order). */
  changeEvents: readonly ChangeEvent[];
  /** Current blocks, for human-readable target descriptions. */
  blocks: readonly ContentBlock[];
  /** Accept one pending change (keeps current content, marks accepted). */
  onAccept: (eventId: DocUUID) => void;
  /** Reject one pending change (reverses it, marks rejected). */
  onReject: (eventId: DocUUID) => void;
  /** Accept every pending change at once. */
  onAcceptAll: () => void;
  /** Reject every pending change (reverse order, failures reported). */
  onRejectAll: () => void;
  /** Markup/clean view mode (editor + preview + default PDF choice). */
  viewMode: DocumentChangeView;
  onViewModeChange: (mode: DocumentChangeView) => void;
  /** Locally configured editor name (stamped on NEW events). */
  editorLabel: string;
  onEditorLabelChange: (label: string) => void;
}

const STATUS_LABELS: Record<ChangeEvent['status'], string> = {
  pending: 'Pending',
  accepted: 'Accepted',
  rejected: 'Rejected',
};

export const TrackChangesPanel: React.FC<TrackChangesPanelProps> = ({
  trackChangesEnabled,
  onTrackChangesToggle,
  changeEvents,
  blocks,
  onAccept,
  onReject,
  onAcceptAll,
  onRejectAll,
  viewMode,
  onViewModeChange,
  editorLabel,
  onEditorLabelChange,
}) => {
  const pending = changeEvents.filter((event) => event.status === 'pending');
  const resolved = changeEvents.filter((event) => event.status !== 'pending');
  // Newest-first within each group for review; the stored log itself
  // stays append-only and untouched (display order is a view concern).
  const newestFirst = (a: ChangeEvent, b: ChangeEvent): number => (a.at < b.at ? 1 : -1);

  const renderEvent = (event: ChangeEvent): React.ReactElement => {
    const description = describeChangeEvent(event, blocks);
    return (
      <article
        key={event.id}
        className="tc-event"
        data-event-id={event.id}
        data-event-status={event.status}
        data-event-type={event.type}
      >
        <header className="tc-event-head">
          <span className="tc-event-title">{description.title}</span>
          <span className={`tc-event-status tc-event-status--${event.status}`}>
            {STATUS_LABELS[event.status]}
          </span>
        </header>
        <p className="tc-event-target">{description.target}</p>
        {description.before !== undefined && description.after !== undefined && (
          <p className="tc-event-values">
            <span className="tc-event-before">{description.before}</span>
            <span className="tc-event-arrow" aria-hidden="true">
              →
            </span>
            <span className="tc-event-after">{description.after}</span>
          </p>
        )}
        <footer className="tc-event-foot">
          <span className="tc-event-at" title={event.at}>
            {new Date(event.at).toLocaleString()}
          </span>
          {event.editorLabel !== undefined && (
            <span className="tc-event-author" title="Locally configured editor name (not verified identity)">
              {event.editorLabel}
            </span>
          )}
          {event.status === 'pending' && (
            <span className="tc-event-actions">
              <button
                type="button"
                className="tc-action-btn tc-action-btn--accept"
                onClick={() => onAccept(event.id)}
                title="Keep the current content and mark this change accepted"
              >
                Accept
              </button>
              <button
                type="button"
                className="tc-action-btn tc-action-btn--reject"
                onClick={() => onReject(event.id)}
                title="Reverse this change and mark it rejected"
              >
                Reject
              </button>
            </span>
          )}
        </footer>
      </article>
    );
  };

  return (
    <div className="tc-panel" aria-label="Track Changes controls">
      <div className="tc-row">
        <label className="tc-toggle" htmlFor="ds-track-toggle">
          <input
            id="ds-track-toggle"
            type="checkbox"
            checked={trackChangesEnabled}
            onChange={(e) => onTrackChangesToggle(e.target.checked)}
          />
          <span>Track changes while editing</span>
        </label>
        <span className="tc-hint">
          Turning this off keeps every pending change for review — it never
          accepts, rejects or deletes anything.
        </span>
      </div>

      <div className="tc-row">
        <label className="tc-field-label" htmlFor="ds-track-editor-label">
          Editor name (local)
        </label>
        <input
          id="ds-track-editor-label"
          className="tc-input"
          type="text"
          maxLength={200}
          value={editorLabel}
          placeholder="e.g. Ikram"
          onChange={(e) => onEditorLabelChange(e.target.value)}
        />
        <span className="tc-hint">
          Optional, stored with new changes as local metadata — not verified identity.
        </span>
      </div>

      <fieldset className="tc-row tc-view-fieldset">
        <legend className="tc-field-label">View</legend>
        <label className="tc-radio">
          <input
            type="radio"
            name="tc-view-mode"
            value="markup"
            checked={viewMode === 'markup'}
            onChange={() => onViewModeChange('markup')}
          />
          <span>Markup (show pending changes)</span>
        </label>
        <label className="tc-radio">
          <input
            type="radio"
            name="tc-view-mode"
            value="clean"
            checked={viewMode === 'clean'}
            onChange={() => onViewModeChange('clean')}
          />
          <span>Clean (current content only)</span>
        </label>
      </fieldset>

      <div className="tc-row tc-bulk-row">
        <button
          type="button"
          className="tc-action-btn"
          onClick={onAcceptAll}
          disabled={pending.length === 0}
          title="Mark every pending change accepted (content stays as-is)"
        >
          Accept all ({pending.length})
        </button>
        <button
          type="button"
          className="tc-action-btn tc-action-btn--reject"
          onClick={onRejectAll}
          disabled={pending.length === 0}
          title="Reverse every pending change in reverse order"
        >
          Reject all
        </button>
      </div>

      <section className="tc-list-section" aria-label="Pending tracked changes">
        <h3 className="tc-section-title">Pending changes ({pending.length})</h3>
        {pending.length === 0 ? (
          <p className="tc-empty">No pending tracked changes.</p>
        ) : (
          <div className="tc-list">{pending.slice().sort(newestFirst).map(renderEvent)}</div>
        )}
      </section>

      {resolved.length > 0 && (
        <section className="tc-list-section" aria-label="Resolved tracked changes">
          <h3 className="tc-section-title">Resolved changes ({resolved.length})</h3>
          <div className="tc-list tc-list--resolved">
            {resolved.slice().sort(newestFirst).map(renderEvent)}
          </div>
        </section>
      )}
    </div>
  );
};

export default TrackChangesPanel;
