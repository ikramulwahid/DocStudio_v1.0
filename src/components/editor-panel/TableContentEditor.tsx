import React, { useEffect, useRef, useState } from 'react';
import type { TableBlockData, TableHeaderStyle, TableCell } from '../../types/blocks';
import type { DocUUID, HAlignment } from '../../types/document';
import {
  H_ALIGNMENTS,
  MAX_TABLE_CAPTION_LENGTH,
  TABLE_HEADER_STYLES,
  type TableContentAction,
  type TableContentActionResult,
} from '../../services/table-content';
import { spansToPlainText } from '../../services/rich-text';

interface TableContentEditorProps {
  /** Stable ID of the table block being edited. */
  blockId: DocUUID;
  /** Authoritative table data rendered straight from the document model. */
  data: TableBlockData;
  /** Commit one validated table action (P05-M4 dispatcher). */
  onTableContentAction: (
    blockId: DocUUID,
    action: TableContentAction,
  ) => TableContentActionResult;
  /** App-owned confirmation modal (used before content-losing column removal). */
  onRequestConfirm: (
    title: string,
    message: string,
    confirmLabel: string,
    onConfirm: () => void,
  ) => void;
  /** Surface a service-level rejection inline. */
  onLocalError: (message: string) => void;
}

/** Human labels for the model's header styles (editor select). */
const HEADER_STYLE_LABELS: Record<TableHeaderStyle, string> = {
  light: 'Light',
  medium: 'Medium',
  heavy: 'Heavy',
};

/** Human labels for horizontal cell alignment (editor select). */
const ALIGN_LABELS: Record<HAlignment, string> = {
  left: 'Left',
  center: 'Center',
  right: 'Right',
};

interface CellAddress {
  rowIndex: number;
  cellIndex: number;
}

/**
 * Content editor for the selected TABLE block (project_details §10.5).
 *
 * Every control commits through the immutable table actions (P05-M4) —
 * the inputs are controlled by the document model, so there is no second
 * copy of the table in component memory.  Cell text edits replay onto
 * the cell's spans with the P05-M2 `remapSpansAfterTextEdit` algebra, so
 * inline formatting survives normal editing.  Row/column controls carry
 * truthful disabled states at the 1×1 minimum, keyboard focus follows
 * the structure the user just created, column removal that would delete
 * content is confirmed through the App's dialog, and the service
 * re-validates every action regardless.
 */
export const TableContentEditor: React.FC<TableContentEditorProps> = ({
  blockId,
  data,
  onTableContentAction,
  onRequestConfirm,
  onLocalError,
}) => {
  const inputRefs = useRef<Record<string, HTMLInputElement | null>>({});
  const [focusCellId, setFocusCellId] = useState<DocUUID | null>(null);
  const [selectedCellId, setSelectedCellId] = useState<DocUUID | null>(null);

  // After a structural change, move keyboard focus to the fresh cell.
  useEffect(() => {
    if (focusCellId === null) return;
    inputRefs.current[focusCellId]?.focus();
    setFocusCellId(null);
  }, [focusCellId, data.rows]);

  const { rows } = data;
  const columnCount = rows.length > 0 ? rows[0].cells.length : 0;

  /** Locate the alignment-target cell in the CURRENT model (never stale). */
  const selectedAddress: (CellAddress & { cell: TableCell }) | null = (() => {
    if (selectedCellId === null) return null;
    for (let r = 0; r < rows.length; r += 1) {
      const c = rows[r].cells.findIndex((cell) => cell.id === selectedCellId);
      if (c >= 0) return { rowIndex: r, cellIndex: c, cell: rows[r].cells[c] };
    }
    return null;
  })();

  const report = (action: TableContentAction): void => {
    const result = onTableContentAction(blockId, action);
    if (!result.ok) onLocalError(result.message);
  };

  /** Structural action: report errors, then focus the fresh cell. */
  const runWithFocus = (action: TableContentAction): void => {
    const result = onTableContentAction(blockId, action);
    if (!result.ok) {
      onLocalError(result.message);
      return;
    }
    if (result.cellId !== undefined) setFocusCellId(result.cellId);
  };

  /** Replay a plain-text edit onto the cell's span model. */
  const handleCellText = (cellId: DocUUID, nextPlain: string): void => {
    report({ kind: 'cell-text', cellId, text: nextPlain });
    // The document round-trips synchronously; restore the caret the
    // browser had before React re-rendered the controlled input.
    window.requestAnimationFrame(() => {
      const el = inputRefs.current[cellId];
      if (el !== null && el !== undefined) {
        const pos = el.selectionStart;
        el.setSelectionRange(pos, pos);
      }
    });
  };

  const columnHasContent = (index: number): boolean =>
    rows.some((row) => {
      const cell = row.cells[index];
      return cell !== undefined && spansToPlainText(cell.spans).trim() !== '';
    });

  /** Removing a non-empty column deletes a full column of content — confirm. */
  const removeColumnAt = (index: number): void => {
    const action: TableContentAction = { kind: 'column-remove', index };
    if (!columnHasContent(index)) {
      runWithFocus(action);
      return;
    }
    onRequestConfirm(
      `Remove column ${index + 1}?`,
      `Column ${index + 1} and its contents will be removed from every row.`,
      'Remove column',
      () => runWithFocus(action),
    );
  };

  const headerStyleValue =
    data.headerStyleSource === 'block' ? data.headerStyle : 'theme';

  return (
    <div className="block-content-panel" aria-label="Table content">
      <span className="content-panel-title">Table content</span>

      {/* Honest dimensions — straight from the model. */}
      <p className="content-derived-hint">
        {rows.length} {rows.length === 1 ? 'row' : 'rows'} × {columnCount}{' '}
        {columnCount === 1 ? 'column' : 'columns'} · header row{' '}
        {data.hasHeaderRow ? 'on (first row)' : 'off'}
        {data.caption !== undefined ? ' · caption shown' : ''}
      </p>

      <div className="content-row">
        <label
          className="content-field content-field--check"
          htmlFor={`ds-table-header-${blockId}`}
        >
          <input
            id={`ds-table-header-${blockId}`}
            className="table-check"
            type="checkbox"
            checked={data.hasHeaderRow}
            onChange={(e) =>
              report({ kind: 'settings', patch: { hasHeaderRow: e.target.checked } })
            }
          />
          <span className="content-field-label">Header row</span>
        </label>
        <label className="content-field" htmlFor={`ds-table-style-${blockId}`}>
          <span className="content-field-label">Header style</span>
          <select
            id={`ds-table-style-${blockId}`}
            className="content-select"
            value={headerStyleValue}
            disabled={!data.hasHeaderRow}
            title={
              data.hasHeaderRow
                ? 'Treatment of the designated header row'
                : 'Enable the header row first'
            }
            onChange={(e) => {
              const value = e.target.value;
              report(
                value === 'theme'
                  ? { kind: 'settings', patch: { headerStyleSource: 'theme' } }
                  : {
                      kind: 'settings',
                      patch: {
                        headerStyle: value as TableHeaderStyle,
                        headerStyleSource: 'block',
                      },
                    },
              );
            }}
          >
            <option value="theme">Theme default</option>
            {TABLE_HEADER_STYLES.map((style) => (
              <option key={style} value={style}>
                {HEADER_STYLE_LABELS[style]}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="content-row">
        <label
          className="content-field content-field--grow"
          htmlFor={`ds-table-caption-${blockId}`}
        >
          <span className="content-field-label">Caption (optional)</span>
          <input
            id={`ds-table-caption-${blockId}`}
            className="content-text-input"
            type="text"
            value={data.caption ?? ''}
            placeholder="No caption"
            maxLength={MAX_TABLE_CAPTION_LENGTH}
            aria-label="Table caption"
            onChange={(e) => report({ kind: 'settings', patch: { caption: e.target.value } })}
          />
        </label>
        {data.caption !== undefined && (
          <button
            type="button"
            className="rt-tool-btn"
            title="Remove the caption"
            aria-label="Clear caption"
            onClick={() => report({ kind: 'settings', patch: { caption: null } })}
          >
            <span aria-hidden="true">✕</span>
          </button>
        )}
      </div>

      {/* Column structure controls — one cluster per column. */}
      <div className="table-cols" role="group" aria-label="Column controls">
        {Array.from({ length: columnCount }, (_, c) => (
          <span className="table-col-tools" key={`col-${c}`}>
            <span className="table-col-label">Col {c + 1}</span>
            <button
              type="button"
              className="rt-tool-btn"
              title={`Add a column before column ${c + 1}`}
              aria-label={`Add column before column ${c + 1}`}
              onClick={() => runWithFocus({ kind: 'column-add', position: { kind: 'at', index: c } })}
            >
              <span aria-hidden="true">+←</span>
            </button>
            <button
              type="button"
              className="rt-tool-btn"
              title={`Add a column after column ${c + 1}`}
              aria-label={`Add column after column ${c + 1}`}
              onClick={() =>
                runWithFocus({ kind: 'column-add', position: { kind: 'at', index: c + 1 } })
              }
            >
              <span aria-hidden="true">+→</span>
            </button>
            <button
              type="button"
              className="rt-tool-btn"
              title={
                columnCount <= 1
                  ? 'A table must keep at least one column'
                  : `Remove column ${c + 1}`
              }
              aria-label={`Remove column ${c + 1}`}
              disabled={columnCount <= 1}
              onClick={() => removeColumnAt(c)}
            >
              <span aria-hidden="true">✕</span>
            </button>
          </span>
        ))}
      </div>

      {/* Cell grid — every input is controlled by the document model. */}
      {rows.length === 0 ? (
        <p className="content-derived-hint">
          This table has no rows — structural edits are disabled rather than silently
          repairing it. Insert a fresh table instead.
        </p>
      ) : (
        <div className="table-grid" role="group" aria-label="Table cells">
          {rows.map((row, r) => (
            <div className="table-grid__row" key={row.id}>
              <span className="table-row-label">Row {r + 1}</span>
              <div className="table-grid__cells">
                {row.cells.map((cell, c) => (
                  <input
                    key={cell.id}
                    ref={(el) => {
                      inputRefs.current[cell.id] = el;
                    }}
                    data-ds-cell-input={cell.id}
                    className="content-text-input table-cell-input"
                    type="text"
                    value={spansToPlainText(cell.spans)}
                    placeholder={`R${r + 1}·C${c + 1}`}
                    aria-label={`Row ${r + 1} column ${c + 1}`}
                    onFocus={() => setSelectedCellId(cell.id)}
                    onChange={(e) => handleCellText(cell.id, e.target.value)}
                  />
                ))}
              </div>
              <span className="table-row-actions">
                <button
                  type="button"
                  className="rt-tool-btn"
                  title={`Add a row above row ${r + 1}`}
                  aria-label={`Add row above row ${r + 1}`}
                  onClick={() => runWithFocus({ kind: 'row-add', position: { kind: 'at', index: r } })}
                >
                  <span aria-hidden="true">+↑</span>
                </button>
                <button
                  type="button"
                  className="rt-tool-btn"
                  title={`Add a row below row ${r + 1}`}
                  aria-label={`Add row below row ${r + 1}`}
                  onClick={() =>
                    runWithFocus({ kind: 'row-add', position: { kind: 'at', index: r + 1 } })
                  }
                >
                  <span aria-hidden="true">+↓</span>
                </button>
                <button
                  type="button"
                  className="rt-tool-btn"
                  title={
                    rows.length <= 1
                      ? 'A table must keep at least one row'
                      : `Remove row ${r + 1}`
                  }
                  aria-label={`Remove row ${r + 1}`}
                  disabled={rows.length <= 1}
                  onClick={() => runWithFocus({ kind: 'row-remove', rowId: row.id })}
                >
                  <span aria-hidden="true">✕</span>
                </button>
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Alignment applies to the focused cell only. */}
      <div className="content-row">
        <label className="content-field" htmlFor={`ds-table-align-${blockId}`}>
          <span className="content-field-label">
            Cell alignment
            {selectedAddress !== null
              ? ` — row ${selectedAddress.rowIndex + 1}, column ${selectedAddress.cellIndex + 1}`
              : ''}
          </span>
          <select
            id={`ds-table-align-${blockId}`}
            className="content-select"
            value={selectedAddress !== null ? selectedAddress.cell.hAlign : ''}
            disabled={selectedAddress === null}
            onChange={(e) => {
              if (selectedCellId === null) return;
              report({
                kind: 'cell-align',
                cellId: selectedCellId,
                hAlign: e.target.value as HAlignment,
              });
            }}
          >
            {selectedAddress === null && <option value="">Select a cell</option>}
            {H_ALIGNMENTS.map((align) => (
              <option key={align} value={align}>
                {ALIGN_LABELS[align]}
              </option>
            ))}
          </select>
        </label>
      </div>

      <p className="content-derived-hint">
        {selectedAddress !== null
          ? 'Alignment applies to the focused cell only — its content, styles and ID stay untouched.'
          : 'Focus a cell above to change its alignment.'}{' '}
        {data.headerStyleSource === 'block'
          ? `Header renders with the explicit ${HEADER_STYLE_LABELS[data.headerStyle].toLowerCase()} treatment.`
          : 'Header treatment follows the document theme.'}{' '}
        Column widths are distributed by the renderer (equal beyond four columns).
      </p>
    </div>
  );
};
