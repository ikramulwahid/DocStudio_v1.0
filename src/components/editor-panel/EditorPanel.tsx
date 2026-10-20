import React, { useEffect, useMemo, useState } from 'react';
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
import { computeHeadingNumbering } from '../../services/heading-numbering';
import { HeadingContentEditor } from './HeadingContentEditor';
import { ParagraphContentEditor } from './ParagraphContentEditor';
import { ListContentEditor } from './ListContentEditor';
import { CalloutContentEditor } from './CalloutContentEditor';
import { TableContentEditor } from './TableContentEditor';
import type {
  ContentActionResult,
  HeadingContentPatch,
  ParagraphContentPatch,
} from '../../services/block-content';
import type {
  CalloutContentActionResult,
  CalloutContentPatch,
  ListContentAction,
  ListContentActionResult,
} from '../../services/list-callout-content';
import type {
  TableContentAction,
  TableContentActionResult,
} from '../../services/table-content';
import type {
  StructuralContentAction,
  StructuralContentActionResult,
} from '../../services/structural-block-content';
import {
  HorizontalLineEditor,
  MetadataBlockEditor,
  PageBreakMarker,
  ReferenceEditor,
  RevisionHistoryEditor,
  SectionBreakEditor,
  ExhibitEditor,
} from './StructuralContentEditor';
import type { AssetRecord, CustomMetadataField } from '../../types/document';
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
  /** Commit a heading content patch (P05-M2, §10.1). */
  onHeadingContentChange: (
    blockId: DocUUID,
    patch: HeadingContentPatch,
  ) => ContentActionResult;
  /** Commit a paragraph content patch (P05-M2, §10.2). */
  onParagraphContentChange: (
    blockId: DocUUID,
    patch: ParagraphContentPatch,
  ) => ContentActionResult;
  /** Dispatch one validated list action (P05-M3, §10.4). */
  onListContentAction: (
    blockId: DocUUID,
    action: ListContentAction,
  ) => ListContentActionResult;
  /** Commit a callout content patch (P05-M3, §10.3). */
  onCalloutContentChange: (
    blockId: DocUUID,
    patch: CalloutContentPatch,
  ) => CalloutContentActionResult;
  /** Dispatch one validated table action (P05-M4, §10.5). */
  onTableContentAction: (
    blockId: DocUUID,
    action: TableContentAction,
  ) => TableContentActionResult;
  /** Dispatch one validated structural action (P06-M2, §6.2). */
  onStructuralAction: (
    blockId: DocUUID,
    action: StructuralContentAction,
  ) => StructuralContentActionResult;
  /** Document custom fields — labels/ids for the metadata block picker. */
  customFields?: readonly CustomMetadataField[];
  /** Embedded assets — the exhibit block may reference an image asset. */
  assets?: readonly AssetRecord[];
  /** Ask the App to confirm a content-losing action (table column removal). */
  onRequestConfirm: (
    title: string,
    message: string,
    confirmLabel: string,
    onConfirm: () => void,
  ) => void;
}

interface EditorNotice {
  severity: 'error' | 'info';
  text: string;
}

/**
 * The modular document editor (P05-M1 block framework, extended P05-M2
 * and P05-M3).
 *
 * Renders the AUTHORITATIVE `document.blocks` list and wires every action
 * to the App through immutable `block-actions`/`block-content`/
 * `list-callout-content`/`table-content` operations — there is no second
 * block store in component state.  Selection is session state owned by the
 * App, so selecting never dirties the document.  The selected heading
 * (§10.1), paragraph (§10.2), list (§10.4), callout (§10.3) and table
 * (§10.5) blocks additionally show their content editors; the P06-M2
 * structural blocks (horizontal rule, section break, page break marker,
 * metadata, revision history, references, exhibit) show their own
 * content editors wired through `structural-block-content`; the
 * remaining lab-specific block types show truthful structural
 * summaries until their checkpoints.
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
  onHeadingContentChange,
  onParagraphContentChange,
  onListContentAction,
  onCalloutContentChange,
  onTableContentAction,
  onStructuralAction,
  customFields = [],
  assets = [],
  onRequestConfirm,
}) => {
  const [insertType, setInsertType] = useState<BlockType>('paragraph');
  const [notice, setNotice] = useState<EditorNotice | null>(null);
  const [spacingDrafts, setSpacingDrafts] = useState<{ top: string; bottom: string }>({
    top: '',
    bottom: '',
  });

  const selected =
    selectedBlockId !== null ? (blocks.find((block) => block.id === selectedBlockId) ?? null) : null;

  // §10.1 consistency: the editor shows the SAME derived numbering prefix
  // the renderer will print (never stored in the document).
  const headingPrefixes = useMemo(() => computeHeadingNumbering(blocks), [blocks]);

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

  /**
   * Structural content dispatch (P06-M2): every structural editor routes
   * its commits through the App's immutable
   * `applyStructuralAction` service.  Failures surface the service's
   * field-specific message; successes clear the notice.  A same-reference
   * no-op is NOT an error — it simply leaves the document (and its
   * Modified flag) untouched.
   */
  const handleStructural = (
    blockId: DocUUID,
    action: StructuralContentAction,
  ): StructuralContentActionResult => {
    const result = onStructuralAction(blockId, action);
    setNotice(
      result.ok ? null : { severity: 'error', text: result.message },
    );
    return result;
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
                Structure, order and spacing are editable now; heading, paragraph, list, callout
                and table content editing is available on the selected block.
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
                      <>
                        {block.data.type === 'heading' && (
                          <HeadingContentEditor
                            blockId={block.id}
                            data={block.data}
                            numberingPrefix={headingPrefixes.get(block.id)}
                            onHeadingContentChange={onHeadingContentChange}
                          />
                        )}
                        {block.data.type === 'paragraph' && (
                          <ParagraphContentEditor
                            blockId={block.id}
                            spans={block.data.spans}
                            hAlign={block.data.hAlign}
                            indentLevel={block.data.indentLevel}
                            onParagraphContentChange={onParagraphContentChange}
                            onLocalError={(text) => setNotice({ severity: 'error', text })}
                          />
                        )}
                        {block.data.type === 'list' && (
                          <ListContentEditor
                            blockId={block.id}
                            data={block.data}
                            onListContentAction={onListContentAction}
                            onLocalError={(text) => setNotice({ severity: 'error', text })}
                          />
                        )}
                        {block.data.type === 'callout' && (
                          <CalloutContentEditor
                            blockId={block.id}
                            data={block.data}
                            onCalloutContentChange={onCalloutContentChange}
                            onLocalError={(text) => setNotice({ severity: 'error', text })}
                          />
                        )}
                        {block.data.type === 'table' && (
                          <TableContentEditor
                            blockId={block.id}
                            data={block.data}
                            onTableContentAction={onTableContentAction}
                            onRequestConfirm={onRequestConfirm}
                            onLocalError={(text) => setNotice({ severity: 'error', text })}
                          />
                        )}
                        {block.data.type === 'horizontal-line' && (
                          <HorizontalLineEditor
                            blockId={block.id}
                            data={block.data}
                            onAction={handleStructural}
                            onError={(text) => setNotice({ severity: 'error', text })}
                          />
                        )}
                        {block.data.type === 'section-break' && (
                          <SectionBreakEditor
                            blockId={block.id}
                            data={block.data}
                            onAction={handleStructural}
                            onError={(text) => setNotice({ severity: 'error', text })}
                          />
                        )}
                        {block.data.type === 'page-break' && (
                          <PageBreakMarker data={block.data} />
                        )}
                        {block.data.type === 'metadata-block' && (
                          <MetadataBlockEditor
                            blockId={block.id}
                            data={block.data}
                            customFields={customFields}
                            onAction={handleStructural}
                            onError={(text) => setNotice({ severity: 'error', text })}
                          />
                        )}
                        {block.data.type === 'revision-history' && (
                          <RevisionHistoryEditor
                            blockId={block.id}
                            data={block.data}
                            onAction={handleStructural}
                            onError={(text) => setNotice({ severity: 'error', text })}
                          />
                        )}
                        {block.data.type === 'reference' && (
                          <ReferenceEditor
                            blockId={block.id}
                            data={block.data}
                            onAction={handleStructural}
                            onError={(text) => setNotice({ severity: 'error', text })}
                          />
                        )}
                        {block.data.type === 'exhibit' && (
                          <ExhibitEditor
                            blockId={block.id}
                            data={block.data}
                            assets={assets}
                            onAction={handleStructural}
                            onError={(text) => setNotice({ severity: 'error', text })}
                          />
                        )}
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
                      </>
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
