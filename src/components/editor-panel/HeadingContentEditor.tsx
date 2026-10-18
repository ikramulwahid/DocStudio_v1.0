import React from 'react';
import { HEADING_LEVELS } from '../../services/heading-numbering';
import type {
  ContentActionResult,
  HeadingContentPatch,
} from '../../services/block-content';
import type { HeadingBlockData } from '../../types/blocks';
import type { DocUUID, HAlignment } from '../../types/document';

interface HeadingContentEditorProps {
  /** Stable ID of the heading block being edited. */
  blockId: DocUUID;
  /** Authoritative heading data rendered straight from the document model. */
  data: HeadingBlockData;
  /** Derived numbering prefix (§10.1) when this heading is numbered —
   *  the SAME value the renderer prints; `undefined` for plain headings. */
  numberingPrefix?: string;
  /** Commit a validated heading content patch (P05-M2). */
  onHeadingContentChange: (
    blockId: DocUUID,
    patch: HeadingContentPatch,
  ) => ContentActionResult;
}

const HEADING_ALIGNMENTS: readonly HAlignment[] = ['left', 'center', 'right'];

/**
 * Content editor for the selected HEADING block (project_details §10.1).
 *
 * Level (H1–H4), numbered/plain mode, plain text and alignment are all
 * committed through the immutable `updateHeadingContent` service — the
 * inputs below are controlled directly by the document model, so there is
 * no second copy of the heading state in component memory.  The derived
 * numbering prefix is DISPLAYED here (never edited, never stored) so the
 * editor, preview and export always agree.
 */
export const HeadingContentEditor: React.FC<HeadingContentEditorProps> = ({
  blockId,
  data,
  numberingPrefix,
  onHeadingContentChange,
}) => (
  <div className="block-content-panel" aria-label="Heading content">
    <span className="content-panel-title">Heading content</span>
    <div className="content-row">
      <label className="content-field" htmlFor={`ds-heading-level-${blockId}`}>
        <span className="content-field-label">Level</span>
        <select
          id={`ds-heading-level-${blockId}`}
          className="content-select"
          value={String(data.level)}
          onChange={(e) =>
            onHeadingContentChange(blockId, { level: Number(e.target.value) })
          }
        >
          {HEADING_LEVELS.map((level) => (
            <option key={level} value={level}>
              H{level}
            </option>
          ))}
        </select>
      </label>
      <label className="content-field content-field--check" htmlFor={`ds-heading-numbered-${blockId}`}>
        <input
          id={`ds-heading-numbered-${blockId}`}
          type="checkbox"
          checked={data.numbered}
          onChange={(e) => onHeadingContentChange(blockId, { numbered: e.target.checked })}
        />
        <span className="content-field-label">Automatic numbering</span>
      </label>
      <label className="content-field" htmlFor={`ds-heading-align-${blockId}`}>
        <span className="content-field-label">Alignment</span>
        <select
          id={`ds-heading-align-${blockId}`}
          className="content-select"
          value={data.hAlign}
          onChange={(e) =>
            onHeadingContentChange(blockId, { hAlign: e.target.value as HAlignment })
          }
        >
          {HEADING_ALIGNMENTS.map((align) => (
            <option key={align} value={align}>
              {align.charAt(0).toUpperCase() + align.slice(1)}
            </option>
          ))}
        </select>
      </label>
    </div>
    <label className="content-field content-field--grow" htmlFor={`ds-heading-text-${blockId}`}>
      <span className="content-field-label">Text</span>
      <input
        id={`ds-heading-text-${blockId}`}
        className="content-text-input"
        type="text"
        value={data.text}
        placeholder="Heading text"
        onChange={(e) => onHeadingContentChange(blockId, { text: e.target.value })}
      />
    </label>
    {/* Derived numbering preview — the exact prefix the renderer prints. */}
    <p className="content-derived-hint">
      {data.numbered
        ? `Numbered as “${numberingPrefix ?? '—'}” in preview and export (derived automatically — never typed into the text).`
        : 'Plain heading — no numbering prefix is printed.'}
    </p>
  </div>
);
