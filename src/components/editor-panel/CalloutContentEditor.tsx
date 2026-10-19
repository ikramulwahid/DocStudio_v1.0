import React, { useRef } from 'react';
import type { CalloutBlockData } from '../../types/blocks';
import type { DocUUID } from '../../types/document';
import {
  MAX_CALLOUT_TITLE_LENGTH,
  type CalloutContentActionResult,
  type CalloutContentPatch,
} from '../../services/list-callout-content';
import {
  remapSpansAfterTextEdit,
  spansToPlainText,
} from '../../services/rich-text';

interface CalloutContentEditorProps {
  /** Stable ID of the callout block being edited. */
  blockId: DocUUID;
  /** Authoritative callout data rendered straight from the document model. */
  data: CalloutBlockData;
  /** Commit a validated callout content patch (P05-M3). */
  onCalloutContentChange: (
    blockId: DocUUID,
    patch: CalloutContentPatch,
  ) => CalloutContentActionResult;
  /** Surface a service-level rejection inline. */
  onLocalError: (message: string) => void;
}

/** The five semantic variants (project_details §10.3). */
const KNOWN_VARIANTS: readonly { value: string; label: string }[] = [
  { value: 'info', label: 'Information' },
  { value: 'warning', label: 'Warning' },
  { value: 'success', label: 'Success' },
  { value: 'note', label: 'Note' },
  { value: 'danger', label: 'Danger' },
];

/** Characters a callout body must never store (see paragraph editor). */
// eslint-disable-next-line no-control-regex
const CONTROL_CHARS = /[\u0000-\u001f\u007f-\u009f]/g;

/**
 * Content editor for the selected CALLOUT block (project_details §10.3).
 *
 * The variant selector covers the five semantic variants; a stored
 * CUSTOM variant is preserved as its own option (never silently
 * rewritten to a known one).  The optional title is edited inline and
 * cleared deliberately with the Remove-title button (the service deletes
 * the field — no blank line is stored).  The body edits the PLAIN-TEXT
 * projection of the authoritative spans through the P05-M2
 * `remapSpansAfterTextEdit` algebra, so inline formatting survives
 * editing and pasted text is sanitised to plain text.  The preview below
 * mirrors the renderer's structure (label + optional title + body);
 * the authoritative appearance is the rendered document.
 */
export const CalloutContentEditor: React.FC<CalloutContentEditorProps> = ({
  blockId,
  data,
  onCalloutContentChange,
  onLocalError,
}) => {
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  const report = (patch: CalloutContentPatch): void => {
    const result = onCalloutContentChange(blockId, patch);
    if (!result.ok) onLocalError(result.message);
  };

  const plain = spansToPlainText(data.spans);
  const known = KNOWN_VARIANTS.find((entry) => entry.value === data.variant.toLowerCase());
  // Renderer mirror: known variants print their mapped label; a custom
  // variant prints its own stored name uppercased (poc-document.tsx).
  const previewLabel = known?.label.toUpperCase() ?? data.variant.toUpperCase();

  /** Replay a plain-text edit onto the body's span model. */
  const handleBodyChange = (nextPlain: string): void => {
    report({ spans: remapSpansAfterTextEdit(data.spans, nextPlain) });
    // Restore the caret the browser had before React re-rendered the
    // controlled textarea (same pattern as the paragraph editor).
    window.requestAnimationFrame(() => {
      const el = textareaRef.current;
      if (el !== null) el.setSelectionRange(el.selectionStart, el.selectionEnd);
    });
  };

  return (
    <div className="block-content-panel" aria-label="Callout content">
      <span className="content-panel-title">Callout content</span>
      <div className="content-row">
        <label className="content-field" htmlFor={`ds-callout-variant-${blockId}`}>
          <span className="content-field-label">Variant</span>
          <select
            id={`ds-callout-variant-${blockId}`}
            className="content-select"
            value={data.variant}
            onChange={(e) => report({ variant: e.target.value })}
          >
            {KNOWN_VARIANTS.map((entry) => (
              <option key={entry.value} value={entry.value}>
                {entry.label}
              </option>
            ))}
            {/* A stored custom variant keeps its own option (preserved). */}
            {known === undefined && (
              <option value={data.variant}>Custom — {data.variant}</option>
            )}
          </select>
        </label>
        <label className="content-field content-field--grow" htmlFor={`ds-callout-title-${blockId}`}>
          <span className="content-field-label">Title (optional)</span>
          <input
            id={`ds-callout-title-${blockId}`}
            className="content-text-input"
            type="text"
            value={data.title ?? ''}
            maxLength={MAX_CALLOUT_TITLE_LENGTH}
            placeholder="Callout title"
            onChange={(e) => report({ title: e.target.value })}
          />
        </label>
        <button
          type="button"
          className="rt-tool-btn"
          title="Remove the title entirely"
          aria-label="Remove callout title"
          disabled={data.title === undefined}
          onClick={() => report({ title: null })}
        >
          Clear title
        </button>
      </div>
      <label className="content-field content-field--grow" htmlFor={`ds-callout-body-${blockId}`}>
        <span className="content-field-label">Body</span>
        <textarea
          id={`ds-callout-body-${blockId}`}
          ref={textareaRef}
          className="rt-textarea"
          value={plain}
          placeholder="Callout body text"
          aria-label="Callout body text"
          onChange={(e) => handleBodyChange(e.target.value.replace(CONTROL_CHARS, ''))}
          onPaste={(e) => {
            // Plain-text insertion only (control codes stripped above).
            const text = e.clipboardData.getData('text/plain');
            e.preventDefault();
            handleBodyChange(`${plain.slice(0, textareaRef.current?.selectionStart ?? 0)}${text.replace(CONTROL_CHARS, '')}${plain.slice(textareaRef.current?.selectionEnd ?? 0)}`);
          }}
        />
      </label>
      {/* Structural preview — the label carries the meaning (renderer
          mirror); colours live in the rendered document, not here. */}
      <div className="content-preview">
        <span className="content-preview-title">Preview</span>
        <div className="callout-preview">
          <span className="callout-preview-label">{previewLabel}</span>
          {data.title !== undefined && data.title !== '' ? (
            <strong className="callout-preview-title-text">{data.title}</strong>
          ) : null}
          <p className="content-preview-body">
            {plain === '' ? (
              <span className="content-preview-empty">
                (empty callout body — the label and title still render)
              </span>
            ) : (
              plain
            )}
          </p>
        </div>
      </div>
    </div>
  );
};
