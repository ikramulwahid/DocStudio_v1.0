/**
 * DocStudio — Pure table layout maths (P05-M4, §10.5 "stable column
 * sizing and alignment behavior")
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Kept free of JSX so `verify_p05_m4.mjs` can unit-test the width
 * policy and the row-height estimate directly, while the renderer uses
 * the very same functions (one implementation, no drift).
 *
 * Width policy
 * ────────────
 * Column widths are derived, never stored (like list markers), and the
 * same array is applied to EVERY row, so cell boundaries line up across
 * rows and the widths always total the available content width:
 *
 * • Exactly 4 columns → the designed PoC fractions `[0.3, 0.24, 0.24,
 *   0.22]` used RAW.  This is byte-identical to the pre-P05-M4
 *   renderer, which is what keeps the committed P02-M4 fixture and the
 *   P04-M3 gallery artifacts (both 4-column) unchanged.
 * • 1–3 columns → the same designed fractions for the columns that
 *   exist, renormalised so they sum to the full content width (the old
 *   renderer left a 2-column table at 54 % of the content width).
 * • 5+ columns → equal distribution (1/n each); the old fixed 4-entry
 *   list overflowed the page from column 5 onwards.
 * • Non-finite inputs collapse to finite zeroes rather than NaN/negative
 *   widths; out-of-range cell indices fall back to the equal share.
 *
 * Custom column resizing is NOT implemented (recorded limitation): the
 * widths above are the deliberate, consistent behaviour.
 *
 * Row-height estimate
 * ───────────────────
 * react-pdf keeps `wrap={false}` rows atomic — they move to the next
 * page intact (verified), but a row TALLER than a whole page cannot be
 * kept atomic: the engine drops its overflowing content (verified during
 * the P05-M4 probe).  `estimateRowHeightPt` therefore over-estimates
 * deterministically — 0.5 em average glyphs for narrow text, 1.0 em when
 * a cell contains wide/CJK/full-width glyphs, plus a 15 % safety margin
 * — and the renderer allows such a row to wrap so no content is ever
 * clipped.  Ordinary short rows are far below the threshold, so their
 * rendering path (and the protected baseline bytes) never changes.
 */

import type { TableBlockData, TableRow } from '../../types/blocks';
import type { BodyThemeTokens } from '../../services/body-theme-tokens';
import { spansToPlainText } from '../../services/rich-text';

/** Designed PoC column fractions (4 columns); raw values sum ≈ 1. */
export const COLUMN_FRACTIONS = [0.3, 0.24, 0.24, 0.22];

/**
 * Allocate `columnCount` column widths (points) that sum to
 * `contentWidth` with no negative or NaN values.  See the file header
 * for the exact policy.  Exported for `verify_p05_m4.mjs`.
 */
export function allocateTableColumnWidths(columnCount: number, contentWidth: number): number[] {
  const finiteColumns =
    Number.isFinite(columnCount) && columnCount > 0 ? Math.floor(columnCount) : 0;
  const w = Number.isFinite(contentWidth) && contentWidth > 0 ? contentWidth : 0;
  if (finiteColumns === 0) return [];
  if (finiteColumns < COLUMN_FRACTIONS.length) {
    const used = COLUMN_FRACTIONS.slice(0, finiteColumns);
    const total = used.reduce((a, b) => a + b, 0) || 1;
    return used.map((f) => (w * f) / total);
  }
  if (finiteColumns === COLUMN_FRACTIONS.length) {
    // Raw values — the exact expression the pre-P05-M4 renderer used, so
    // 4-column tables keep byte-identical widths.
    return usedRaw(w);
  }
  return Array.from({ length: finiteColumns }, () => w / finiteColumns);
}

const usedRaw = (w: number): number[] => COLUMN_FRACTIONS.map((f) => w * f);

/** Wide glyph ranges (CJK / Hangul / full-width forms) ≈ 1 em each. */
const WIDE_GLYPH =
  /[\u1100-\u115f\u2e80-\u303e\u3041-\u33ff\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff\ufe30-\ufe4f\uff00-\uff60\uffe0-\uffe6]/;

/**
 * Deterministic over-estimate of one row's rendered height in points
 * (cell text lines + vertical padding + border).  Used to decide
 * atomic (`wrap={false}`) vs. wrappable rendering — never used for
 * layout itself.  See the file header for the conservative rules.
 */
export function estimateRowHeightPt(
  row: TableRow,
  widths: readonly number[],
  tokens: BodyThemeTokens,
): number {
  const size = tokens.typography.baseFontSizePt;
  const lineHeight = tokens.typography.lineHeight;
  const t = tokens.tables;
  const fallbackWidth = widths.length > 0 ? widths[0] : 0;

  let maxLines = 1;
  for (let i = 0; i < row.cells.length; i += 1) {
    const cellWidth = widths[i] ?? fallbackWidth;
    const usable = Math.max(cellWidth - 2 * t.cellPaddingHpt, size);
    const text = spansToPlainText(row.cells[i].spans);
    const charWidth = WIDE_GLYPH.test(text) ? size : size * 0.5;
    const charsPerLine = Math.max(1, Math.floor(usable / charWidth));
    const lines = text
      .split('\n')
      .reduce((sum, part) => sum + Math.max(1, Math.ceil(part.length / charsPerLine)), 0);
    if (lines > maxLines) maxLines = lines;
  }

  const border = Math.max(t.borderWidthPt, t.headerBorderWidthPt);
  return (maxLines * size * lineHeight + 2 * t.cellPaddingVpt + border) * 1.15;
}

/**
 * The table's column count for layout purposes: the widest row of a
 * rectangular table (ragged input falls back safely rather than
 * producing NaN widths).
 */
export function tableColumnCount(data: TableBlockData): number {
  return data.rows.reduce((max, row) => Math.max(max, row.cells.length), 0);
}
