/**
 * DocStudio — Header/footer/watermark settings service (P06-M1)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Pure, non-mutating update rules for the authoritative
 * `document.headerFooter` settings (project_details.md §9).  Same
 * conventions as `services/page-typography.ts`: every real change returns
 * a NEW document object, inputs are never mutated, a no-op patch returns
 * the SAME reference (no false Modified status, no `modifiedAt` churn),
 * and invalid input is REJECTED with a deterministic error code and an
 * understandable message — never coerced, never partially applied.
 *
 * This module is free of React/Tauri/DOM imports so the rules are directly
 * testable (see verify_p06_m1.mjs).  The Header & Footer panel dispatches
 * through these functions; the rules themselves live here.
 *
 * Grid invariants (enforced, never silently repaired)
 * ───────────────────────────────────────────────────
 * • `columnCount >= 1` and at least ONE row always remains: removing the
 *   last row/column is rejected (`too-few-rows` / `too-few-columns`).
 * • Every row must already contain exactly `columnCount` cells before a
 *   structural operation runs; a mismatch (corrupt/foreign file) is
 *   REJECTED (`row-column-mismatch`) — operations never "fix" data.
 * • The model carries `colSpan`, but merged-cell layouts are NOT
 *   supported by the editor or the PoC renderer.  Any structural
 *   operation on a band containing a cell with `colSpan !== 1` is
 *   REJECTED (`merged-cells-unsupported`) rather than flattening or
 *   corrupting the stored grid.
 * • Documented sanity caps: `HF_MAX_ROWS` (10) rows and
 *   `HF_MAX_COLUMNS` (8) columns — beyond that a printed band becomes
 *   unreadable at page width; the caps are exported for the UI.
 * • Structural operations that would DISCARD non-empty cell content are
 *   refused with `confirm-required` unless the caller passes
 *   `force: true` (the panel shows an inline confirmation first).  The
 *   service never silently discards content (§4 principle 6).
 * • All new rows/cells receive FRESH ids from the injectable `newId`
 *   factory (deterministic in tests); surviving cells keep their ids and
 *   content verbatim.
 *
 * Watermark policies (documented decisions)
 * ─────────────────────────────────────────
 * • Ranges: opacity 0–1, position X/Y 0–1 (fractions of the content
 *   box), rotation −360…360 degrees, font size 6–200 pt.  The font-size
 *   floor matches the body typography floor (6 pt); the ceiling is
 *   intentionally ABOVE the body maximum (72 pt) because a watermark is
 *   display-scale text (the 72 pt default would otherwise sit exactly on
 *   the cap).  Out-of-range input is rejected, never clamped.
 * • Text: at most `WATERMARK_TEXT_MAX_LENGTH` (80) characters and no
 *   ASCII control characters; violations are rejected (`text-too-long` /
 *   `invalid-text`).  Text is stored verbatim otherwise (case, spacing).
 *   An enabled watermark with empty/whitespace text renders NOTHING — a
 *   stable, silent-free policy (the renderer skips the layer entirely).
 * • Colour: validated and canonicalised through the project's existing
 *   `normalizeHexColor` (#RGB/#RRGGBB/#RRGGBBAA); anything else is
 *   rejected (`invalid-color`) — never coerced to a named colour.
 * • The stored colour is rendered AS STORED; the document monochrome
 *   mode converts THEME inks only, not explicit user properties (same
 *   class as the cover frame colour).  Recorded in the P06-M1 checkpoint.
 * • First-page policy: the watermark renders on every BODY page
 *   (including the first body page — the model has no per-band
 *   suppression for it and none is invented); the designed cover page
 *   never carries body furniture.
 *
 * Cell text and tokens (renderer contract)
 * ────────────────────────────────────────
 * `resolveCellText` below is the ONE token-resolution implementation
 * shared by the renderer and the tests:
 * • `{pageNumber}` formats through the parent band's `pageNumberFormat`
 *   (`'none'` suppresses the NUMBER TOKEN ONLY — other text in the cell
 *   is kept verbatim).
 * • `{documentId}` / `{organizationName}` resolve to the trimmed
 *   metadata value; EMPTY metadata resolves to an EMPTY string (a
 *   stable, understandable result — never `undefined` or a malformed
 *   token remnant).
 * • Unknown tokens (e.g. `{title}`) are preserved LITERALLY so a typo
 *   is visible and correctable rather than silently swallowed.
 *
 * @module services/header-footer-settings
 */

import type {
  DocStudioDocument,
  DocUUID,
  HeaderFooterBand,
  HeaderFooterCell,
  HAlignment,
  PageNumberFormat,
  VAlignment,
  WatermarkSettings,
} from '../types/document';
import { newUUID, nowISO } from '../types/defaults';
import { normalizeHexColor } from './rich-text';

// ─────────────────────────────────────────────────────────────────────────────
// Documented constants (exported for the UI and the tests)
// ─────────────────────────────────────────────────────────────────────────────

/** Sanity caps for a printable band grid (documented decision above). */
export const HF_MAX_ROWS = 10;
export const HF_MAX_COLUMNS = 8;

/** Per-cell content limit (characters). */
export const HF_CELL_CONTENT_MAX_LENGTH = 200;

/** Watermark validation ranges (documented above). */
export const WATERMARK_OPACITY_RANGE = { min: 0, max: 1 } as const;
export const WATERMARK_POSITION_RANGE = { min: 0, max: 1 } as const;
export const WATERMARK_ROTATION_DEG_RANGE = { min: -360, max: 360 } as const;
export const WATERMARK_FONT_SIZE_PT_RANGE = { min: 6, max: 200 } as const;
export const WATERMARK_TEXT_MAX_LENGTH = 80;

/** The exact page-number modes of project_details.md §9, in display order. */
export const PAGE_NUMBER_FORMATS: readonly PageNumberFormat[] = [
  'Page X of Y',
  'X/Y',
  'X',
  'none',
];

export const H_ALIGNMENTS: readonly HAlignment[] = ['left', 'center', 'right'];
export const V_ALIGNMENTS: readonly VAlignment[] = ['top', 'middle', 'bottom'];

/** Documented cell tokens (project_details.md §9 / the model JSDoc). */
export const TOKEN_DOCUMENT_ID = '{documentId}';
export const TOKEN_ORGANIZATION_NAME = '{organizationName}';
export const TOKEN_PAGE_NUMBER = '{pageNumber}';
export const DOCUMENTED_TOKENS: readonly string[] = [
  TOKEN_DOCUMENT_ID,
  TOKEN_ORGANIZATION_NAME,
  TOKEN_PAGE_NUMBER,
];

// ─────────────────────────────────────────────────────────────────────────────
// Patch types and result union
// ─────────────────────────────────────────────────────────────────────────────

/** Which band a patch targets. */
export type BandKind = 'header' | 'footer';

/** A single header/footer band change requested by the panel. */
export type HeaderFooterPatch =
  | { field: 'enabled'; value: boolean }
  | { field: 'addRow'; atIndex?: number }
  | { field: 'removeRow'; rowId: DocUUID; force?: boolean }
  | { field: 'addColumn'; atIndex?: number }
  | { field: 'removeColumn'; columnIndex: number; force?: boolean }
  | { field: 'cellContent'; rowId: DocUUID; cellId: DocUUID; value: string }
  | { field: 'cellHAlign'; rowId: DocUUID; cellId: DocUUID; value: HAlignment }
  | { field: 'cellVAlign'; rowId: DocUUID; cellId: DocUUID; value: VAlignment }
  | { field: 'pageNumberFormat'; value: PageNumberFormat }
  | { field: 'suppressOnFirstPage'; value: boolean };

/** A single watermark change requested by the panel. */
export type WatermarkPatch =
  | { field: 'enabled'; value: boolean }
  | { field: 'text'; value: string }
  | { field: 'opacity'; value: number }
  | { field: 'rotationDeg'; value: number }
  | { field: 'fontSizePt'; value: number }
  | { field: 'color'; value: string }
  | { field: 'positionX'; value: number }
  | { field: 'positionY'; value: number };

/** Deterministic validation error codes (P04-M1 convention). */
export type HeaderFooterErrorCode =
  | 'unknown-band'
  | 'unknown-field'
  | 'unknown-alignment'
  | 'unknown-page-number-format'
  | 'invalid-number'
  | 'out-of-range'
  | 'invalid-boolean'
  | 'invalid-text'
  | 'text-too-long'
  | 'invalid-color'
  | 'too-many-rows'
  | 'too-many-columns'
  | 'too-few-rows'
  | 'too-few-columns'
  | 'confirm-required'
  | 'merged-cells-unsupported'
  | 'row-column-mismatch'
  | 'not-found';

/** Outcome of a settings update: applied (changed or no-op) or rejected. */
export type HeaderFooterUpdateResult =
  | { ok: true; doc: DocStudioDocument; changed: boolean }
  | { ok: false; code: HeaderFooterErrorCode; message: string };

const reject = (code: HeaderFooterErrorCode, message: string): HeaderFooterUpdateResult => ({
  ok: false,
  code,
  message,
});

// ─────────────────────────────────────────────────────────────────────────────
// Small validators
// ─────────────────────────────────────────────────────────────────────────────

/** ASCII control characters are never accepted in stored furniture text. */
function hasControlCharacters(value: string): boolean {
  // eslint-disable-next-line no-control-regex
  return /[\u0000-\u001f\u007f]/.test(value);
}

function inRange(v: number, range: { min: number; max: number }): boolean {
  return Number.isFinite(v) && v >= range.min && v <= range.max;
}

/** Fresh empty cell matching the documented grid conventions. */
function makeCell(newId: () => DocUUID, hAlign: HAlignment = 'center'): HeaderFooterCell {
  return { id: newId(), content: '', hAlign, vAlign: 'middle', colSpan: 1 };
}

/**
 * Structural pre-conditions shared by add/remove row/column:
 * the band must be a plain un-merged grid whose rows all match
 * `columnCount`.  Returns an error message or null when safe.
 */
function structuralPrecondition(band: HeaderFooterBand): string | null {
  if (!Array.isArray(band.rows) || band.rows.length === 0) {
    return 'The grid has no rows and cannot be edited structurally.';
  }
  if (!Number.isInteger(band.columnCount) || band.columnCount < 1) {
    return 'The grid column count is invalid.';
  }
  for (const row of band.rows) {
    if (!Array.isArray(row.cells)) return 'The grid is incomplete and cannot be edited.';
    if (row.cells.some((c) => c.colSpan !== 1)) {
      return 'Merged cells are not supported by the grid editor.';
    }
    if (row.cells.length !== band.columnCount) {
      return 'The grid rows do not match the column count.';
    }
  }
  return null;
}

/** Would this structural removal discard non-empty cell content? */
function removalDiscardsContent(targets: HeaderFooterCell[]): boolean {
  return targets.some((c) => c.content.trim() !== '');
}

// ─────────────────────────────────────────────────────────────────────────────
// Band updates
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Apply a header/footer band patch to the authoritative document.
 *
 * `newId` is injectable so tests get deterministic ids; `now` stamps
 * `modifiedAt` ONLY on a real change (the §6 timestamp policy).  The
 * watermark, the other band and all document content are untouched.
 */
export function applyHeaderFooterPatch(
  source: DocStudioDocument,
  bandKind: BandKind,
  patch: HeaderFooterPatch,
  now: string = nowISO(),
  newId: () => DocUUID = newUUID,
): HeaderFooterUpdateResult {
  if (bandKind !== 'header' && bandKind !== 'footer') {
    return reject('unknown-band', 'Header/footer patches target the header or the footer band.');
  }
  const current = source.headerFooter[bandKind];
  let next: HeaderFooterBand;

  switch (patch.field) {
    case 'enabled': {
      if (typeof patch.value !== 'boolean') {
        return reject('invalid-boolean', 'The enabled setting must be on or off.');
      }
      if (current.enabled === patch.value) return { ok: true, doc: source, changed: false };
      next = { ...current, enabled: patch.value };
      break;
    }
    case 'suppressOnFirstPage': {
      if (typeof patch.value !== 'boolean') {
        return reject('invalid-boolean', 'The first-body-page setting must be on or off.');
      }
      if (current.suppressOnFirstPage === patch.value) {
        return { ok: true, doc: source, changed: false };
      }
      next = { ...current, suppressOnFirstPage: patch.value };
      break;
    }
    case 'pageNumberFormat': {
      if (!PAGE_NUMBER_FORMATS.includes(patch.value)) {
        return reject(
          'unknown-page-number-format',
          'Choose one of: Page X of Y, X/Y, X, or None.',
        );
      }
      if (current.pageNumberFormat === patch.value) {
        return { ok: true, doc: source, changed: false };
      }
      next = { ...current, pageNumberFormat: patch.value };
      break;
    }
    case 'addRow': {
      const problem = structuralPrecondition(current);
      if (problem !== null) {
        return reject(
          current.rows.some((r) => r.cells?.some?.((c) => c.colSpan !== 1))
            ? 'merged-cells-unsupported'
            : 'row-column-mismatch',
          problem,
        );
      }
      if (current.rows.length >= HF_MAX_ROWS) {
        return reject(
          'too-many-rows',
          `A band can have at most ${HF_MAX_ROWS} rows.`,
        );
      }
      const index =
        patch.atIndex === undefined
          ? current.rows.length
          : Math.max(0, Math.min(Math.trunc(patch.atIndex), current.rows.length));
      const row = {
        id: newId(),
        cells: Array.from({ length: current.columnCount }, () => makeCell(newId)),
      };
      const rows = [...current.rows];
      rows.splice(index, 0, row);
      next = { ...current, rows };
      break;
    }
    case 'removeRow': {
      const problem = structuralPrecondition(current);
      if (problem !== null) {
        return reject(
          current.rows.some((r) => r.cells?.some?.((c) => c.colSpan !== 1))
            ? 'merged-cells-unsupported'
            : 'row-column-mismatch',
          problem,
        );
      }
      if (current.rows.length <= 1) {
        return reject('too-few-rows', 'A band must keep at least one row.');
      }
      const index = current.rows.findIndex((r) => r.id === patch.rowId);
      if (index < 0) return reject('not-found', 'That grid row no longer exists.');
      if (removalDiscardsContent(current.rows[index].cells) && patch.force !== true) {
        return reject(
          'confirm-required',
          'This row contains text. Confirm to remove it and its content.',
        );
      }
      next = { ...current, rows: current.rows.filter((r) => r.id !== patch.rowId) };
      break;
    }
    case 'addColumn': {
      const problem = structuralPrecondition(current);
      if (problem !== null) {
        return reject(
          current.rows.some((r) => r.cells?.some?.((c) => c.colSpan !== 1))
            ? 'merged-cells-unsupported'
            : 'row-column-mismatch',
          problem,
        );
      }
      if (current.columnCount >= HF_MAX_COLUMNS) {
        return reject(
          'too-many-columns',
          `A band can have at most ${HF_MAX_COLUMNS} columns.`,
        );
      }
      const at =
        patch.atIndex === undefined
          ? current.columnCount
          : Math.max(0, Math.min(Math.trunc(patch.atIndex), current.columnCount));
      next = {
        ...current,
        columnCount: current.columnCount + 1,
        rows: current.rows.map((row) => {
          const cells = [...row.cells];
          cells.splice(at, 0, makeCell(newId));
          return { ...row, cells };
        }),
      };
      break;
    }
    case 'removeColumn': {
      const problem = structuralPrecondition(current);
      if (problem !== null) {
        return reject(
          current.rows.some((r) => r.cells?.some?.((c) => c.colSpan !== 1))
            ? 'merged-cells-unsupported'
            : 'row-column-mismatch',
          problem,
        );
      }
      if (current.columnCount <= 1) {
        return reject('too-few-columns', 'A band must keep at least one column.');
      }
      const index = Math.trunc(patch.columnIndex);
      if (!Number.isFinite(index) || index < 0 || index >= current.columnCount) {
        return reject('not-found', 'That grid column no longer exists.');
      }
      const removedCells = current.rows.map((row) => row.cells[index]);
      if (removalDiscardsContent(removedCells) && patch.force !== true) {
        return reject(
          'confirm-required',
          'This column contains text. Confirm to remove it and its content.',
        );
      }
      next = {
        ...current,
        columnCount: current.columnCount - 1,
        rows: current.rows.map((row) => ({
          ...row,
          cells: row.cells.filter((_, i) => i !== index),
        })),
      };
      break;
    }
    case 'cellContent': {
      if (typeof patch.value !== 'string') {
        return reject('invalid-text', 'Cell content must be text.');
      }
      if (hasControlCharacters(patch.value)) {
        return reject('invalid-text', 'Cell content cannot contain control characters.');
      }
      if (patch.value.length > HF_CELL_CONTENT_MAX_LENGTH) {
        return reject(
          'text-too-long',
          `Cell content is limited to ${HF_CELL_CONTENT_MAX_LENGTH} characters.`,
        );
      }
      const row = current.rows.find((r) => r.id === patch.rowId);
      const cell = row?.cells.find((c) => c.id === patch.cellId);
      if (row === undefined || cell === undefined) {
        return reject('not-found', 'That grid cell no longer exists.');
      }
      if (cell.content === patch.value) return { ok: true, doc: source, changed: false };
      next = {
        ...current,
        rows: current.rows.map((r) =>
          r.id === patch.rowId
            ? { ...r, cells: r.cells.map((c) => (c.id === patch.cellId ? { ...c, content: patch.value } : c)) }
            : r,
        ),
      };
      break;
    }
    case 'cellHAlign':
    case 'cellVAlign': {
      const isH = patch.field === 'cellHAlign';
      const allowed = isH
        ? H_ALIGNMENTS.includes(patch.value as HAlignment)
        : V_ALIGNMENTS.includes(patch.value as VAlignment);
      if (!allowed) {
        return reject(
          'unknown-alignment',
          isH
            ? 'Horizontal alignment must be left, center or right.'
            : 'Vertical alignment must be top, middle or bottom.',
        );
      }
      const row = current.rows.find((r) => r.id === patch.rowId);
      const cell = row?.cells.find((c) => c.id === patch.cellId);
      if (row === undefined || cell === undefined) {
        return reject('not-found', 'That grid cell no longer exists.');
      }
      const currentAlign = isH ? cell.hAlign : cell.vAlign;
      if (currentAlign === patch.value) return { ok: true, doc: source, changed: false };
      next = {
        ...current,
        rows: current.rows.map((r) =>
          r.id === patch.rowId
            ? {
                ...r,
                cells: r.cells.map((c) =>
                  c.id === patch.cellId
                    ? isH
                      ? { ...c, hAlign: patch.value as HAlignment }
                      : { ...c, vAlign: patch.value as VAlignment }
                    : c,
                ),
              }
            : r,
        ),
      };
      break;
    }
    default: {
      // Exhaustiveness: every patch field is handled above.
      const exhaustive: never = patch;
      void exhaustive;
      return reject('unknown-field', 'Unknown header/footer setting.');
    }
  }

  return {
    ok: true,
    changed: true,
    doc: {
      ...source,
      headerFooter: { ...source.headerFooter, [bandKind]: next },
      metadata: { ...source.metadata, modifiedAt: now },
    },
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Watermark updates
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Apply a watermark patch to the authoritative document.  Same
 * no-op/rejection semantics as `applyHeaderFooterPatch`; invalid values
 * are never silently coerced or clamped.
 */
export function applyWatermarkPatch(
  source: DocStudioDocument,
  patch: WatermarkPatch,
  now: string = nowISO(),
): HeaderFooterUpdateResult {
  const current = source.headerFooter.watermark;
  let next: WatermarkSettings;

  switch (patch.field) {
    case 'enabled': {
      if (typeof patch.value !== 'boolean') {
        return reject('invalid-boolean', 'The watermark setting must be on or off.');
      }
      if (current.enabled === patch.value) return { ok: true, doc: source, changed: false };
      next = { ...current, enabled: patch.value };
      break;
    }
    case 'text': {
      if (typeof patch.value !== 'string') {
        return reject('invalid-text', 'The watermark text must be text.');
      }
      if (hasControlCharacters(patch.value)) {
        return reject('invalid-text', 'The watermark text cannot contain control characters.');
      }
      if (patch.value.length > WATERMARK_TEXT_MAX_LENGTH) {
        return reject(
          'text-too-long',
          `The watermark text is limited to ${WATERMARK_TEXT_MAX_LENGTH} characters.`,
        );
      }
      if (current.text === patch.value) return { ok: true, doc: source, changed: false };
      next = { ...current, text: patch.value };
      break;
    }
    case 'opacity':
    case 'rotationDeg':
    case 'fontSizePt':
    case 'positionX':
    case 'positionY': {
      const range =
        patch.field === 'opacity'
          ? WATERMARK_OPACITY_RANGE
          : patch.field === 'rotationDeg'
            ? WATERMARK_ROTATION_DEG_RANGE
            : patch.field === 'fontSizePt'
              ? WATERMARK_FONT_SIZE_PT_RANGE
              : WATERMARK_POSITION_RANGE;
      const label =
        patch.field === 'opacity'
          ? 'opacity'
          : patch.field === 'rotationDeg'
            ? 'rotation'
            : patch.field === 'fontSizePt'
              ? 'font size'
              : patch.field === 'positionX'
                ? 'horizontal position'
                : 'vertical position';
      if (typeof patch.value !== 'number' || !Number.isFinite(patch.value)) {
        return reject('invalid-number', `The watermark ${label} must be a number.`);
      }
      if (!inRange(patch.value, range)) {
        return reject(
          'out-of-range',
          `The watermark ${label} must be between ${range.min} and ${range.max}.`,
        );
      }
      if (current[patch.field] === patch.value) return { ok: true, doc: source, changed: false };
      next = { ...current, [patch.field]: patch.value };
      break;
    }
    case 'color': {
      const normalized = normalizeHexColor(patch.value);
      if (normalized === null) {
        return reject(
          'invalid-color',
          'Choose a colour with the colour picker (hex colours only).',
        );
      }
      if (current.color === normalized) return { ok: true, doc: source, changed: false };
      next = { ...current, color: normalized };
      break;
    }
    default: {
      const exhaustive: never = patch;
      void exhaustive;
      return reject('unknown-field', 'Unknown watermark setting.');
    }
  }

  return {
    ok: true,
    changed: true,
    doc: {
      ...source,
      headerFooter: { ...source.headerFooter, watermark: next },
      metadata: { ...source.metadata, modifiedAt: now },
    },
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Page-number formatting and token resolution (the renderer contract)
// ─────────────────────────────────────────────────────────────────────────────

/** The real page numbers the renderer supplies (never estimated). */
export interface PageNumberContext {
  /** 1-based physical page number. */
  pageNumber: number;
  /** Actual total page count from the renderer. */
  totalPages: number;
}

/** Everything a cell's tokens may resolve against. */
export interface TokenContext extends PageNumberContext {
  documentId: string;
  organizationName: string;
}

/**
 * Format a page number exactly per the band's mode (§9).
 * `'none'` suppresses the number entirely (empty string).
 */
export function formatPageNumber(format: PageNumberFormat, page: PageNumberContext): string {
  switch (format) {
    case 'Page X of Y':
      return `Page ${page.pageNumber} of ${page.totalPages}`;
    case 'X/Y':
      return `${page.pageNumber}/${page.totalPages}`;
    case 'X':
      return `${page.pageNumber}`;
    case 'none':
      return '';
  }
}

/**
 * Resolve one cell's stored content to its rendered text.
 *
 * This is the single token-resolution implementation (module doc): the
 * band format drives `{pageNumber}`; empty metadata yields empty token
 * text; unknown tokens stay literal.
 */
export function resolveCellText(
  content: string,
  format: PageNumberFormat,
  ctx: TokenContext,
): string {
  return content
    .split(TOKEN_PAGE_NUMBER)
    .join(formatPageNumber(format, ctx))
    .split(TOKEN_DOCUMENT_ID)
    .join(ctx.documentId.trim())
    .split(TOKEN_ORGANIZATION_NAME)
    .join(ctx.organizationName.trim());
}
