/**
 * DocStudio — Immutable table content actions (P05-M4)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * `project_details.md` §10.5 requires a genuinely editable table block:
 * add/delete rows and columns, editable cell contents, an optional
 * highlighted header row with light/medium/heavy treatments, and stable
 * column sizing and alignment behaviour.  This module extends the
 * P05-M1 `block-actions` / P05-M2 `block-content` / P05-M3
 * `list-callout-content` conventions (same file-level rules) with the
 * operations this checkpoint delivers:
 *
 * TABLE (§10.5)
 * • `updateTableSettings`     — header row on/off, light/medium/heavy
 *   header style, the P05-M4 header-style source policy and the caption.
 * • `setTableCellText`        — one cell's spans (remapped through the
 *   P05-M2 rich-text algebra so inline styles survive text edits).
 * • `setTableCellAlignment`   — one cell's horizontal alignment.
 * • `addTableRow`             — insert a fresh row at start / at / end.
 * • `removeTableRow`          — remove the addressed row (keeps ≥ 1 row).
 * • `addTableColumn`          — insert a fresh column at start / at / end.
 * • `removeTableColumn`       — remove the addressed column (keeps ≥ 1 col).
 * • `applyTableContentAction` — one dispatcher for the table editor.
 *
 * Conventions inherited from `block-actions`
 * ─────────────────────────────────────────
 * • Immutable: a NEW document is returned; inputs are never mutated.
 * • No-op patches return the SAME document reference (no false Modified
 *   status, no `modifiedAt` churn).
 * • Real changes stamp `metadata.modifiedAt = now`.
 * • Failures return `{ ok: false, code, message }` with deterministic,
 *   UI-displayable codes; malformed content is refused, never "healed".
 * • Stable IDs: the table block ID and every unaffected row/cell ID are
 *   preserved verbatim; fresh IDs come from `options.genId` (tests) or
 *   `newUUID()`.
 * • Optional `now`/`genId` injection keeps tests deterministic.
 *
 * Structure contract (§4.2 compatibility policy)
 * ───────────────────────────────────────────────
 * Ordinary tables are rectangular (every row carries the same cell
 * count) and unit-span (every cell has `colSpan === rowSpan === 1`) —
 * that is what every factory, template and fixture in this repository
 * produces, and no committed file contains a merged cell.  Structural
 * row/column operations therefore REJECT ragged or merged-cell tables
 * with a deterministic code rather than flattening or corrupting them;
 * content operations (cell text, alignment, settings, caption) work on
 * any table.  Minimum size is one row × one column: the final row or
 * column can never be removed, so a table can't be emptied by accident.
 *
 * Header designation
 * ──────────────────
 * The header row is POSITIONAL (first row, when `hasHeaderRow`), which
 * keeps insertion/removal consistent for free: the new first row simply
 * becomes the header.  Turning the header row OFF additionally clears
 * the first row's explicit `isHeader` flags as part of the same
 * deliberate transition — otherwise those flags would keep the row
 * highlighted and the toggle would look broken.  Content, spans,
 * alignment and IDs are untouched by that transition; explicit
 * `isHeader` flags on rows OTHER than the first are never modified.
 *
 * Header-style source (§4.6 compatibility policy)
 * ────────────────────────────────────────────────
 * `headerStyleSource` mirrors the P05-M3 list `markerSource` field:
 * absent (or `'theme'`) keeps the pre-P05-M4 theme-token appearance so
 * old schema-v1 documents render exactly as before this checkpoint;
 * `'block'` activates the stored light/medium/heavy treatment in the
 * renderer.  The field is optional, so the serializer and validator are
 * unchanged and no schema version bump is needed.
 *
 * Spacing (§6 decision)
 * ─────────────────────
 * There is no table/cell padding field in the specification or the
 * model, so none is invented here: internal cell padding and row
 * separation stay on the existing body-theme token path, and block-level
 * spacing remains the P05-M1 `spacing.topPt`/`bottomPt` control.
 */

import type { InlineSpan, TableBlockData, TableHeaderStyle, TableRow } from '../types/blocks';
import type { DocStudioDocument, DocUUID, HAlignment } from '../types/document';
import { newUUID } from '../types/defaults';
import { indexOfBlock, stamped, type BlockOpOptions } from './block-actions';
import { normalizeSpans, remapSpansAfterTextEdit } from './rich-text';

// ─────────────────────────────────────────────────────────────────────────────
// Contract constants
// ─────────────────────────────────────────────────────────────────────────────

export const TABLE_HEADER_STYLES: readonly TableHeaderStyle[] = ['light', 'medium', 'heavy'];
export const TABLE_HEADER_STYLE_SOURCES: readonly ('theme' | 'block')[] = ['theme', 'block'];
export const H_ALIGNMENTS: readonly HAlignment[] = ['left', 'center', 'right'];

/** A table always keeps at least one row (§4.1). */
export const MIN_TABLE_ROWS = 1;
/** A table always keeps at least one column (§4.1). */
export const MIN_TABLE_COLUMNS = 1;

/**
 * Strip C0/C1 control characters (never printable, never wanted in a
 * caption or cell).  Written with `codePointAt` instead of a regex so
 * the source file stays plain ASCII text.
 */
function stripControlChars(value: string): string {
  let out = '';
  for (const ch of value) {
    const code = ch.codePointAt(0) ?? 0;
    if (code >= 0x20 && (code < 0x7f || code > 0x9f)) out += ch;
  }
  return out;
}

/** Longest accepted table caption, in characters. */
export const MAX_TABLE_CAPTION_LENGTH = 240;

// ─────────────────────────────────────────────────────────────────────────────
// Result and action contracts
// ─────────────────────────────────────────────────────────────────────────────

export type TableContentErrorCode =
  | 'missing-block'
  | 'not-a-table'
  | 'invalid-action'
  | 'invalid-has-header-row'
  | 'invalid-header-style'
  | 'invalid-header-style-source'
  | 'invalid-caption'
  | 'invalid-alignment'
  | 'invalid-cell-text'
  | 'invalid-position'
  | 'invalid-index'
  | 'missing-row'
  | 'missing-cell'
  | 'at-minimum-rows'
  | 'at-minimum-columns'
  | 'invalid-structure'
  | 'unsupported-span-structure';

export interface TableFailure {
  ok: false;
  code: TableContentErrorCode;
  message: string;
}

/**
 * Success carries focus hints for the UI: the fresh/affected row and
 * cell IDs plus the affected column index, so the editor can move the
 * keyboard focus to the structure the user just created or addressed.
 */
export interface TableSuccess {
  ok: true;
  changed: boolean;
  doc: DocStudioDocument;
  blockId: DocUUID;
  rowId?: DocUUID;
  cellId?: DocUUID;
  columnIndex?: number;
}

export type TableContentActionResult = TableSuccess | TableFailure;

export interface TableSettingsPatch {
  /** Designate (or undesignate) the first row as the header row. */
  hasHeaderRow?: boolean;
  /** Stored light/medium/heavy treatment (honoured when source = 'block'). */
  headerStyle?: TableHeaderStyle;
  /** 'theme' keeps the pre-P05-M4 theme-default appearance (field omitted). */
  headerStyleSource?: 'theme' | 'block';
  /** Caption text; `null` or `''` removes the caption field. */
  caption?: string | null;
}

/** Insert position for row/column creation. `'at' index` = before that index. */
export type TableInsertPosition = { kind: 'start' } | { kind: 'end' } | { kind: 'at'; index: number };

export type TableContentAction =
  | { kind: 'settings'; patch: TableSettingsPatch }
  | { kind: 'cell-text'; cellId: DocUUID; text: string }
  | { kind: 'cell-align'; cellId: DocUUID; hAlign: HAlignment }
  | { kind: 'row-add'; position: TableInsertPosition }
  | { kind: 'row-remove'; rowId: DocUUID }
  | { kind: 'column-add'; position: TableInsertPosition }
  | { kind: 'column-remove'; index: number };

const rejectTable = (code: TableContentErrorCode, message: string): TableFailure => ({
  ok: false,
  code,
  message,
});

/** Explicit type predicate: standalone verify tsc lacks strict narrowing. */
const isTableFailure = (v: { ok: boolean }): v is TableFailure => !v.ok;

const sameValue = (a: unknown, b: unknown): boolean => JSON.stringify(a) === JSON.stringify(b);

// ─────────────────────────────────────────────────────────────────────────────
// Resolution and structure helpers
// ─────────────────────────────────────────────────────────────────────────────

interface TableResolved {
  ok: true;
  index: number;
  data: TableBlockData;
}

type TableResolve = TableResolved | TableFailure;

function requireTable(source: DocStudioDocument, blockId: DocUUID): TableResolve {
  const index = indexOfBlock(source, blockId);
  if (index < 0) {
    return rejectTable('missing-block', 'The table to edit no longer exists in this document.');
  }
  const data = source.blocks[index].data;
  if (data.type !== 'table') {
    return rejectTable('not-a-table', 'This block is not a table and cannot be edited as one.');
  }
  return { ok: true, index, data };
}

/** Every row exists and carries the first row's cell count. */
function isRectangular(data: TableBlockData): boolean {
  if (data.rows.length === 0) return false;
  const width = data.rows[0].cells.length;
  return data.rows.every((row) => row.cells.length === width);
}

/** True when any cell carries a merged (non-unit) span. */
function hasMergedCells(data: TableBlockData): boolean {
  return data.rows.some((row) => row.cells.some((c) => c.colSpan !== 1 || c.rowSpan !== 1));
}

/** Shared structural guard for add/remove row/column (§4.2). */
function structuralGuard(data: TableBlockData): TableFailure | null {
  if (!isRectangular(data)) {
    return rejectTable(
      'invalid-structure',
      data.rows.length === 0
        ? 'This table has no rows — insert a fresh table instead of editing this one.'
        : 'This table has inconsistent row lengths; row and column edits are disabled rather than silently repairing it.',
    );
  }
  if (hasMergedCells(data)) {
    return rejectTable(
      'unsupported-span-structure',
      'This table contains merged cells (colSpan/rowSpan); row and column edits are disabled to protect the merge structure.',
    );
  }
  return null;
}

/**
 * Resolve an insert position to a splice index in `[0, length]`.
 * Returns `null` for malformed positions (non-integer, out of range).
 */
function resolvePosition(position: TableInsertPosition, length: number): number | null {
  if (position === null || typeof position !== 'object') return null;
  if (position.kind === 'start') return 0;
  if (position.kind === 'end') return length;
  if (position.kind === 'at') {
    const { index } = position;
    if (typeof index !== 'number' || !Number.isInteger(index) || index < 0 || index > length) {
      return null;
    }
    return index;
  }
  return null;
}

interface CellAddress {
  rowIndex: number;
  cellIndex: number;
}

function findCell(data: TableBlockData, cellId: DocUUID): CellAddress | null {
  for (let r = 0; r < data.rows.length; r += 1) {
    const c = data.rows[r].cells.findIndex((cell) => cell.id === cellId);
    if (c >= 0) return { rowIndex: r, cellIndex: c };
  }
  return null;
}

const freshCell = (options: BlockOpOptions) => ({
  id: (options.genId ?? newUUID)(),
  spans: [{ text: '' }] as InlineSpan[],
  hAlign: 'left' as HAlignment,
  colSpan: 1,
  rowSpan: 1,
  isHeader: false,
});

/** Commit `next` (deep-equal guard) or report a same-reference no-op. */
function commitTable(
  source: DocStudioDocument,
  index: number,
  blockId: DocUUID,
  data: TableBlockData,
  next: TableBlockData,
  options: BlockOpOptions,
  extra?: { rowId?: DocUUID; cellId?: DocUUID; columnIndex?: number },
): TableContentActionResult {
  if (sameValue(next, data)) {
    return { ok: true, doc: source, changed: false, blockId };
  }
  return {
    ok: true,
    doc: stamped(
      source,
      source.blocks.map((b, i) => (i === index ? { ...b, data: next } : b)),
      options.now ?? new Date().toISOString(),
    ),
    changed: true,
    blockId,
    ...(extra ?? {}),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Settings, header row and caption (§10.5)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Update table settings: header-row designation, the light/medium/heavy
 * header style, the theme/block style source policy and the caption.
 *
 * A `null` (or empty/whitespace) caption REMOVES the caption field — a
 * deliberate, supported state, never an accidental blank line.  Captions
 * are stored as typed; oversized captions are rejected with
 * `invalid-caption`.
 *
 * Turning the header row OFF clears the first row's explicit
 * `isHeader` flags (see file header); turning it ON relies on the
 * positional designation alone, so no cell fields are written.
 */
export function updateTableSettings(
  source: DocStudioDocument,
  blockId: DocUUID,
  patch: TableSettingsPatch,
  options: BlockOpOptions = {},
): TableContentActionResult {
  const found = requireTable(source, blockId);
  if (isTableFailure(found)) return rejectTable(found.code, found.message);
  const { index, data } = found;

  if (patch.hasHeaderRow !== undefined && typeof patch.hasHeaderRow !== 'boolean') {
    return rejectTable('invalid-has-header-row', 'Header row must be true or false.');
  }
  if (patch.headerStyle !== undefined && !TABLE_HEADER_STYLES.includes(patch.headerStyle)) {
    return rejectTable('invalid-header-style', 'Header style must be light, medium or heavy.');
  }
  if (
    patch.headerStyleSource !== undefined &&
    !TABLE_HEADER_STYLE_SOURCES.includes(patch.headerStyleSource)
  ) {
    return rejectTable('invalid-header-style-source', "Header style source must be 'theme' or 'block'.");
  }
  if (patch.caption !== undefined && patch.caption !== null && typeof patch.caption !== 'string') {
    return rejectTable('invalid-caption', 'Table caption must be text or null to remove it.');
  }

  let caption = data.caption;
  if (patch.caption !== undefined) {
    // Control characters never print (captions are single-line text), so
    // they are stripped at the boundary; the visible text is stored as
    // typed — trimming on every keystroke would fight the controlled
    // input, and whitespace-only input clears the field entirely.
    const clean = stripControlChars(patch.caption === null ? '' : patch.caption);
    if (clean.length > MAX_TABLE_CAPTION_LENGTH) {
      return rejectTable(
        'invalid-caption',
        `Table caption must be at most ${MAX_TABLE_CAPTION_LENGTH} characters.`,
      );
    }
    caption = clean.trim() === '' ? undefined : clean;
  }

  const nextHeaderRow = patch.hasHeaderRow ?? data.hasHeaderRow;
  const nextStyle = patch.headerStyle ?? data.headerStyle;
  const targetSource = patch.headerStyleSource ?? data.headerStyleSource;
  const nextSource = targetSource === 'theme' ? undefined : targetSource;

  const headerRowChanged = patch.hasHeaderRow !== undefined && nextHeaderRow !== data.hasHeaderRow;
  const styleChanged = patch.headerStyle !== undefined && nextStyle !== data.headerStyle;
  const sourceChanged =
    patch.headerStyleSource !== undefined &&
    (data.headerStyleSource ?? 'theme') !== (nextSource ?? 'theme');
  const captionChanged =
    patch.caption !== undefined && (caption ?? '') !== (data.caption ?? '');

  if (!headerRowChanged && !styleChanged && !sourceChanged && !captionChanged) {
    return { ok: true, doc: source, changed: false, blockId };
  }

  const next: TableBlockData = { ...data, hasHeaderRow: nextHeaderRow, headerStyle: nextStyle };
  if (nextSource !== undefined) next.headerStyleSource = nextSource;
  else delete next.headerStyleSource;
  if (caption !== undefined) next.caption = caption;
  else delete next.caption;

  // Header designation is positional, so un-designating the row must also
  // clear its explicit flags or the row stays highlighted. Content, spans,
  // alignment and IDs are untouched; other rows' flags are never written.
  if (
    headerRowChanged &&
    nextHeaderRow === false &&
    data.rows.length > 0 &&
    data.rows[0].cells.some((c) => c.isHeader)
  ) {
    next.rows = data.rows.map((row, r) =>
      r === 0 ? { ...row, cells: row.cells.map((c) => (c.isHeader ? { ...c, isHeader: false } : c)) } : row,
    );
  }

  return commitTable(source, index, blockId, data, next, options);
}

// ─────────────────────────────────────────────────────────────────────────────
// Cell content and alignment (§10.5, §4.3/§4.7)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Set one cell's visible text.  The edit is remapped through the P05-M2
 * rich-text algebra, so surrounding inline styles (bold, colour, links
 * …) survive typing exactly as they do in paragraph editing.  Control
 * characters are stripped at the boundary (cells print as single-line
 * text); empty cells are valid.  The cell ID, row ID, alignment and
 * every other cell are preserved.
 */
export function setTableCellText(
  source: DocStudioDocument,
  blockId: DocUUID,
  cellId: DocUUID,
  text: string,
  options: BlockOpOptions = {},
): TableContentActionResult {
  const found = requireTable(source, blockId);
  if (isTableFailure(found)) return rejectTable(found.code, found.message);
  const { index, data } = found;

  if (typeof text !== 'string') {
    return rejectTable('invalid-cell-text', 'Cell text must be a string.');
  }
  const at = findCell(data, cellId);
  if (at === null) {
    return rejectTable('missing-cell', 'The table cell to edit no longer exists in this table.');
  }

  const row = data.rows[at.rowIndex];
  const cell = row.cells[at.cellIndex];
  const nextSpans = normalizeSpans(remapSpansAfterTextEdit(cell.spans, stripControlChars(text)));

  const rows = data.rows.slice();
  rows[at.rowIndex] = { ...row, cells: row.cells.slice() };
  rows[at.rowIndex].cells[at.cellIndex] = { ...cell, spans: nextSpans };

  return commitTable(source, index, blockId, data, { ...data, rows }, options, {
    rowId: row.id,
    cellId,
  });
}

/**
 * Set one cell's horizontal alignment without touching its content,
 * formatting, identity or neighbours.
 */
export function setTableCellAlignment(
  source: DocStudioDocument,
  blockId: DocUUID,
  cellId: DocUUID,
  hAlign: HAlignment,
  options: BlockOpOptions = {},
): TableContentActionResult {
  const found = requireTable(source, blockId);
  if (isTableFailure(found)) return rejectTable(found.code, found.message);
  const { index, data } = found;

  if (!H_ALIGNMENTS.includes(hAlign)) {
    return rejectTable('invalid-alignment', 'Alignment must be left, center or right.');
  }
  const at = findCell(data, cellId);
  if (at === null) {
    return rejectTable('missing-cell', 'The table cell to align no longer exists in this table.');
  }

  const row = data.rows[at.rowIndex];
  const cell = row.cells[at.cellIndex];
  if (cell.hAlign === hAlign) {
    return { ok: true, doc: source, changed: false, blockId, rowId: row.id, cellId };
  }

  const rows = data.rows.slice();
  rows[at.rowIndex] = { ...row, cells: row.cells.slice() };
  rows[at.rowIndex].cells[at.cellIndex] = { ...cell, hAlign };

  return commitTable(source, index, blockId, data, { ...data, rows }, options, {
    rowId: row.id,
    cellId,
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Row operations (§4.4)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Insert a fresh row before index 0 (`start`), after the last row
 * (`end`) or before an explicit index (`at`).  The new row carries the
 * table's column count of fresh, empty, left-aligned unit cells with
 * `isHeader: false` (header designation is positional, so it follows the
 * row automatically).  Ragged and merged-cell tables are refused.
 */
export function addTableRow(
  source: DocStudioDocument,
  blockId: DocUUID,
  position: TableInsertPosition,
  options: BlockOpOptions = {},
): TableContentActionResult {
  const found = requireTable(source, blockId);
  if (isTableFailure(found)) return rejectTable(found.code, found.message);
  const { index, data } = found;

  const guard = structuralGuard(data);
  if (guard) return guard;

  const target = resolvePosition(position, data.rows.length);
  if (target === null) {
    return rejectTable(
      'invalid-position',
      `Row insert position must be before row 1 or after row ${data.rows.length}.`,
    );
  }

  const columnCount = data.rows[0].cells.length;
  const newRow: TableRow = {
    id: (options.genId ?? newUUID)(),
    cells: Array.from({ length: columnCount }, () => freshCell(options)),
  };
  const rows = data.rows.slice();
  rows.splice(target, 0, newRow);

  return commitTable(source, index, blockId, data, { ...data, rows }, options, {
    rowId: newRow.id,
    cellId: newRow.cells[0]?.id,
  });
}

/**
 * Remove the addressed row.  The last remaining row can never be
 * removed (`at-minimum-rows`).  Header designation needs no fix-up: it
 * is positional, so after removing the first row the new first row
 * simply becomes the header (documented §4.5 behaviour).
 */
export function removeTableRow(
  source: DocStudioDocument,
  blockId: DocUUID,
  rowId: DocUUID,
  options: BlockOpOptions = {},
): TableContentActionResult {
  const found = requireTable(source, blockId);
  if (isTableFailure(found)) return rejectTable(found.code, found.message);
  const { index, data } = found;

  const guard = structuralGuard(data);
  if (guard) return guard;

  const rowIndex = data.rows.findIndex((row) => row.id === rowId);
  if (rowIndex < 0) {
    return rejectTable('missing-row', 'The table row to remove no longer exists in this table.');
  }
  if (data.rows.length <= MIN_TABLE_ROWS) {
    return rejectTable('at-minimum-rows', 'A table must keep at least one row.');
  }

  const rows = data.rows.slice();
  rows.splice(rowIndex, 1);
  const focusRow = rows[rowIndex] ?? rows[rowIndex - 1];

  return commitTable(source, index, blockId, data, { ...data, rows }, options, {
    rowId: focusRow?.id,
    cellId: focusRow?.cells[0]?.id,
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Column operations (§4.4)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Insert a fresh column of empty cells at the given position — the
 * table stays rectangular because the same index is spliced into every
 * row.  Each new cell takes the horizontal alignment of the cell it
 * will be inserted before (falling back to the previous cell, then
 * left), so new cells follow the column convention they join.
 */
export function addTableColumn(
  source: DocStudioDocument,
  blockId: DocUUID,
  position: TableInsertPosition,
  options: BlockOpOptions = {},
): TableContentActionResult {
  const found = requireTable(source, blockId);
  if (isTableFailure(found)) return rejectTable(found.code, found.message);
  const { index, data } = found;

  const guard = structuralGuard(data);
  if (guard) return guard;

  const columnCount = data.rows[0].cells.length;
  const target = resolvePosition(position, columnCount);
  if (target === null) {
    return rejectTable(
      'invalid-position',
      `Column insert position must be before column 1 or after column ${columnCount}.`,
    );
  }

  const rows = data.rows.map((row) => {
    const cells = row.cells.slice();
    const neighbour = cells[target] ?? cells[target - 1];
    cells.splice(target, 0, { ...freshCell(options), hAlign: neighbour?.hAlign ?? 'left' });
    return { ...row, cells };
  });

  return commitTable(source, index, blockId, data, { ...data, rows }, options, {
    cellId: rows[0]?.cells[target]?.id,
    columnIndex: target,
  });
}

/**
 * Remove the column at `index` from every row (the affected range is
 * one cell per row — the UI confirms before deleting content).  The
 * last remaining column can never be removed (`at-minimum-columns`).
 */
export function removeTableColumn(
  source: DocStudioDocument,
  blockId: DocUUID,
  columnIndex: number,
  options: BlockOpOptions = {},
): TableContentActionResult {
  const found = requireTable(source, blockId);
  if (isTableFailure(found)) return rejectTable(found.code, found.message);
  const { index, data } = found;

  const guard = structuralGuard(data);
  if (guard) return guard;

  const columnCount = data.rows[0].cells.length;
  if (
    typeof columnIndex !== 'number' ||
    !Number.isInteger(columnIndex) ||
    columnIndex < 0 ||
    columnIndex >= columnCount
  ) {
    return rejectTable(
      'invalid-index',
      `Column index must be between 0 and ${Math.max(columnCount - 1, 0)}.`,
    );
  }
  if (columnCount <= MIN_TABLE_COLUMNS) {
    return rejectTable('at-minimum-columns', 'A table must keep at least one column.');
  }

  const rows = data.rows.map((row) => {
    const cells = row.cells.slice();
    cells.splice(columnIndex, 1);
    return { ...row, cells };
  });

  const remaining = rows[0]?.cells.length ?? 0;
  const focus = rows[0]?.cells[columnIndex] ?? rows[0]?.cells[columnIndex - 1];

  return commitTable(source, index, blockId, data, { ...data, rows }, options, {
    rowId: rows[0]?.id,
    cellId: focus?.id,
    columnIndex: Math.min(columnIndex, Math.max(remaining - 1, 0)),
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Dispatcher (editor single entry point)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Route one validated table action to its operation.  The editor sends
 * model actions here; every operation keeps its own validation above it,
 * so the prop flow stays narrow (same pattern as the P05-M3 list
 * dispatcher).
 */
export function applyTableContentAction(
  source: DocStudioDocument,
  blockId: DocUUID,
  action: TableContentAction,
  options: BlockOpOptions = {},
): TableContentActionResult {
  switch (action.kind) {
    case 'settings':
      return updateTableSettings(source, blockId, action.patch, options);
    case 'cell-text':
      return setTableCellText(source, blockId, action.cellId, action.text, options);
    case 'cell-align':
      return setTableCellAlignment(source, blockId, action.cellId, action.hAlign, options);
    case 'row-add':
      return addTableRow(source, blockId, action.position, options);
    case 'row-remove':
      return removeTableRow(source, blockId, action.rowId, options);
    case 'column-add':
      return addTableColumn(source, blockId, action.position, options);
    case 'column-remove':
      return removeTableColumn(source, blockId, action.index, options);
    default:
      return rejectTable('invalid-action', 'Unknown table operation.');
  }
}
