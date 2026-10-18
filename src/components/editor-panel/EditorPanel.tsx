import React, { useEffect, useState } from 'react';
import { Icon } from '../common/Icon';
import {
  BLOCK_CATEGORIES,
  BLOCK_REGISTRY,
  blockTypesInCategory,
  summarizeBlockData,
} from '../../services/block-registry';
import {
  parseNumberDraft,
} from '../../services/page-typography';
import type {
  BlockActionResult,
  BlockPlacement,
  BlockSpacingField,
} from '../../services/block-actions';
import type { BlockType } from '../../types/blocks';
import type { ContentBlock, DocUUID } from '../../types/document';
import './EditorPanel.css';

interface EditorPanelProps {
  /** Authoritative `document.blocks` (P05-M1) — the single source of truth. */
  blocks: readonly ContentBlock[];
  /** Selected block's stable ID (P05-M1 session state, never persisted). */
  selectedBlockId: DocUUID | null;
  /** Select a block by its stable ID. */
  onSelectBlock: (blockId: DocUUID) => void;
  /** Insert a new block of `type` at `placement` in the active document. */
  onInsertBlock: (type: BlockType, placement: BlockPlacement) => BlockActionResult;
  /** Duplicate the identified block (App owns selection + confirmation). */
  onDuplicateBlock: (blockId: DocUUID) => BlockActionResult;
  /** Move the identified block one position up or down. */
  onMoveBlock: (blockId: DocUUID, direction: 'up' | 'down') => BlockActionResult;
  /** Request deletion — the App runs the confirmation dialog before deleting. */
  onDeleteBlock: (blockId: DocUUID) => void;
  /** Commit one validated spacing field (points) for the identified block. */
  onSpacingChange: (
    blockId: DocUUID,
    field: BlockSpacingField,
    value: number,
  ) => BlockActionResult;
}

interface EditorNotice {
  severity: 'error' | 'info';
  text: string;
}

/**
 * The modular document editor (P05-M1 block framework).
 *
 * Renders the AUTHORITATIVE `document.blocks` list and wires every action
 * to the App through immutable `block-actions` operations — there is no
 * second block store in component state.  Selection is session state owned
 * by the App, so selecting never dirties the document; content editors for
 * headings/paragraphs (P05-M2), lists/callouts (P05-M3) and tables (P05-M4)
 * arrive in later checkpoints — inserted blocks currently show truthful
 * structural summaries.
 */
export const EditorPanel: React.FC<EditorPanelProps> = ({
  blocks,
  selectedBlockId,
  onSelectBlock,
  onInsertBlock,
  onDuplicateBlock,
  onMoveBlock,
  onDeleteBlock,
  onSpacingChange,
}) => {
  const [insertType, setInsertType] = useState<BlockType>('paragraph');
  const [notice, setNotice] = useState<EditorNotice | null>(null);
  const [spacingDrafts, setSpacingDrafts] = useState<{ top: string; bottom: string }>({
    top: '',
    bottom: '',
  });

  const selected =
    selectedBlockId !== null ? (blocks.find((block) => block.id === selectedBlockId) ?? null) : null;

  // Sync spacing drafts to the selection: runs only when the selected block
  // CHANGES (spacing commits update the document, not the selection, so
  // typing never resets its own drafts).
  useEffect(() => {
    setSpacingDrafts({
      top: selected ? String(selected.spacing.topPt) : '',
      bottom: selected ? String(selected.spacing.bottomPt) : '',
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedBlockId]);

  /** Surface a failed operation's message; clear the notice on success. */
  const report = (result: BlockActionResult): void => {
    if (!result.ok) {
      setNotice({ severity: 'error', text: result.message });
      return;
    }
    setNotice(null);
  };

  const handleInsert = (kind: 'end' | 'after'): void => {
    const placement: BlockPlacement =
      kind === 'after' && selectedBlockId !== null
        ? { kind: 'after', blockId: selectedBlockId }
        : { kind: 'end' };
    report(onInsertBlock(insertType, placement));
  };

  const handleSpacingInput = (field: BlockSpacingField, raw: string): void => {
    setSpacingDrafts((prev) => ({
      ...prev,
      [field === 'topPt' ? 'top' : 'bottom']: raw,
    }));
    if (selectedBlockId === null) return;
    // parseNumberDraft maps empty/non-numeric drafts to NaN, which the
    // service rejects with an understandable message — invalid input is
    // never silently coerced into a setting.
    report(onSpacingChange(selectedBlockId, field, parseNumberDraft(raw)));
  };

  return (
    <main className="editor-panel" aria-label="Document editor workspace">
      <div className="editor-header-bar">
        <div className="editor-header-left">
          <span className="editor-title">Document Editor</span>
          <span className="editor-phase-badge">Phase 05 · Block Framework</span>
        </div>
        <span className="editor-block-count">
          {blocks.length} {blocks.length === 1 ? 'block' : 'blocks'}
        </span>
      </div>

      <div className="editor-scroll-area">
        <div className="editor-canvas-container">
          {/* ── Insertion controls ─────────────────────────────────────── */}
          <section className="editor-insert-card" aria-label="Insert content block">
            <div className="insert-card-heading">
              <span className="insert-card-title">Insert block</span>
              <span className="insert-card-hint">
                Structure, order and spacing are editable now; rich content editing for headings,
                paragraphs, lists, callouts and tables arrives in P05-M2–M4.
              </span>
            </div>
            <div className="insert-controls">
              <label className="insert-type-label" htmlFor="ds-insert-type">
                Type
              </label>
              <select
                id="ds-insert-type"
                className="insert-type-select"
                value={insertType}
                onChange={(e) => setInsertType(e.target.value as BlockType)}
              >
                {BLOCK_CATEGORIES.map((category) => (
                  <optgroup key={category.id} label={category.label}>
                    {blockTypesInCategory(category.id).map((type) => (
                      <option key={type} value={type}>
                        {BLOCK_REGISTRY[type].displayName}
                      </option>
                    ))}
                  </optgroup>
                ))}
              </select>
              <button
                type="button"
                className="insert-btn insert-btn--primary"
                onClick={() => handleInsert('end')}
              >
                <Icon name="plus" size={14} />
                <span>Add block</span>
              </button>
              <button
                type="button"
                className="insert-btn"
                disabled={selected === null}
                title={selected === null ? 'Select a block first' : 'Insert below the selected block'}
                onClick={() => handleInsert('after')}
              >
                <span>Insert after selected</span>
              </button>
            </div>
            <p className="insert-selection-hint">
              {selected === null
                ? 'No block selected — “Add block” appends at the end of the document.'
                : `Selected: ${BLOCK_REGISTRY[selected.data.type].displayName} #${blocks.indexOf(selected) + 1} — inserted blocks appear below it.`}
            </p>
          </section>

          {/* ── Operation feedback ─────────────────────────────────────── */}
          {notice !== null && (
            <div
              className={`editor-notice ${notice.severity === 'error' ? 'is-error' : 'is-info'}`}
              role="status"
              aria-live="polite"
            >
              {notice.text}
            </div>
          )}

          {/* ── Block list / empty state ───────────────────────────────── */}
          {blocks.length === 0 ? (
            <section className="editor-empty-card" aria-label="Empty document">
              <h2 className="empty-card-title">No content blocks yet</h2>
              <p className="empty-card-desc">
                Insert your first block with the controls above — a Heading or Paragraph is a good
                start. Blocks can be selected, duplicated, reordered and spaced at any time.
              </p>
            </section>
          ) : (
            <ul className="block-list" aria-label="Document blocks">
              {blocks.map((block, index) => {
                const entry = BLOCK_REGISTRY[block.data.type];
                const isSelected = block.id === selectedBlockId;
                const position = index + 1;
                return (
                  <li
                    key={block.id}
                    className={`block-card${isSelected ? ' is-selected' : ''}`}
                    data-selected={isSelected ? 'true' : undefined}
                  >
                    <div className="block-card-main">
                      <button
                        type="button"
                        className="block-select-btn"
                        aria-pressed={isSelected}
                        aria-label={`Select ${entry.displayName} block ${position}`}
                        onClick={() => {
                          onSelectBlock(block.id);
                          setNotice(null);
                        }}
                      >
                        <span className="block-card-icon" aria-hidden="true">
                          <Icon name={entry.icon} size={15} />
                        </span>
                        <span className="block-card-body">
                          <span className="block-card-headline">
                            <span className="block-type-tag">{entry.displayName}</span>
                            <span className="block-index-tag">#{position}</span>
                            {isSelected && <span className="block-selected-tag">Selected</span>}
                          </span>
                          <span className="block-card-summary">{summarizeBlockData(block.data)}</span>
                          <span className="block-card-spacing">
                            Spacing: {block.spacing.topPt} pt above · {block.spacing.bottomPt} pt
                            below
                          </span>
                        </span>
                      </button>
                      <div className="block-card-actions">
                        <button
                          type="button"
                          className="block-action-btn"
                          disabled={index === 0}
                          title="Move up"
                          aria-label={`Move ${entry.displayName} block ${position} up`}
                          onClick={() => report(onMoveBlock(block.id, 'up'))}
                        >
                          <span aria-hidden="true">↑</span>
                        </button>
                        <button
                          type="button"
                          className="block-action-btn"
                          disabled={index === blocks.length - 1}
                          title="Move down"
                          aria-label={`Move ${entry.displayName} block ${position} down`}
                          onClick={() => report(onMoveBlock(block.id, 'down'))}
                        >
                          <span aria-hidden="true">↓</span>
                        </button>
                        <button
                          type="button"
                          className="block-action-btn block-action-btn--wide"
                          title="Duplicate this block"
                          aria-label={`Duplicate ${entry.displayName} block ${position}`}
                          onClick={() => report(onDuplicateBlock(block.id))}
                        >
                          Duplicate
                        </button>
                        <button
                          type="button"
                          className="block-action-btn block-action-btn--danger"
                          title="Delete this block"
                          aria-label={`Delete ${entry.displayName} block ${position}`}
                          onClick={() => onDeleteBlock(block.id)}
                        >
                          Delete
                        </button>
                      </div>
                    </div>

                    {isSelected && (
                      <div className="block-spacing-panel" aria-label={`Spacing for block ${position}`}>
                        <span className="block-spacing-title">Spacing (points)</span>
                        <label className="spacing-field" htmlFor={`ds-spacing-top-${block.id}`}>
                          <span className="spacing-field-label">Above</span>
                          <input
                            id={`ds-spacing-top-${block.id}`}
                            className="spacing-input"
                            type="number"
                            min={0}
                            step={0.5}
                            inputMode="decimal"
                            value={spacingDrafts.top}
                            aria-label={`Spacing above block ${position}, in points`}
                            onChange={(e) => handleSpacingInput('topPt', e.target.value)}
                          />
                          <span className="spacing-field-unit">pt</span>
                        </label>
                        <label className="spacing-field" htmlFor={`ds-spacing-bottom-${block.id}`}>
                          <span className="spacing-field-label">Below</span>
                          <input
                            id={`ds-spacing-bottom-${block.id}`}
                            className="spacing-input"
                            type="number"
                            min={0}
                            step={0.5}
                            inputMode="decimal"
                            value={spacingDrafts.bottom}
                            aria-label={`Spacing below block ${position}, in points`}
                            onChange={(e) => handleSpacingInput('bottomPt', e.target.value)}
                          />
                          <span className="spacing-field-unit">pt</span>
                        </label>
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>
    </main>
  );
};
