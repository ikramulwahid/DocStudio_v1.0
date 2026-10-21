/**
 * DocStudio — Pure formula layout planner (P06-M3 §6.3)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Every GEOMETRIC decision the formula block makes, as one pure function
 * over plain numbers — no React, no engine, no DOM — so the acceptance
 * behaviour is unit-testable (verify_p06_m3.mjs) without rendering:
 *
 * • OVERFLOW (spec §10.6 "handle formula overflow … predictably"): a
 *   formula wider than the space left of its equation number is UNIFORMLY
 *   scaled down to fit (`scale ≤ 1`, never distorted — the react-pdf Svg
 *   maps viewBox → box, so both axes scale together).  `scaledToFit` tells
 *   the renderer to print an honest visible note, so nothing shrinks
 *   silently.
 * • THE "Where:" RULE (spec §10.6, roadmap line 531): variable definitions
 *   render to the RIGHT of the formula while `formula + number + gap +
 *   definitions ≤ content width`, and BELOW it when they do not.  The
 *   formula itself only ever shrinks to fit the PAGE (overflow), never to
 *   squeeze the definitions in — overestimating the column width merely
 *   moves the definitions below, which is still spec-conformant.
 * • EQUATION NUMBER: pinned in its own right-aligned cell after the
 *   formula cell, at the right edge of the formula area.
 * • ALIGNMENT: `formulaCellWidthPt` is the band the renderer applies
 *   hAlign to (flex-start / center / flex-end).
 *
 * All widths are points.  Estimates fed in come from
 * `estimateTextWidthPt` (math-engine) and from the engine's real metrics.
 *
 * @module renderer/poc/formula-layout
 */

/** Horizontal gap between the formula area and a beside-mode Where column. */
export const FORMULA_WHERE_GAP_PT = 14;

/** Gap built into the equation-number cell (space between formula and number). */
export const FORMULA_NUMBER_GAP_PT = 10;

/** Gap between a variable symbol and its definition text in a Where row. */
export const FORMULA_SYMBOL_GAP_PT = 8;

/** One Where row's measured (or estimated) widths. */
export interface FormulaWhereRowWidths {
  readonly symbolWidthPt: number;
  readonly textWidthPt: number;
}

export interface FormulaLayoutInput {
  /** Usable content width of the page (points). */
  readonly contentWidthPt: number;
  /** Unscaled formula box width (points) from the math engine. */
  readonly naturalWidthPt: number;
  /** Unscaled formula box height (points). */
  readonly naturalHeightPt: number;
  /** Unscaled baseline offset from the box top (points). */
  readonly baselineOffsetPt: number;
  /** Font size the formula was converted at (points). */
  readonly fontSizePt: number;
  /** Whether an equation number is present and non-empty. */
  readonly hasNumber: boolean;
  /** Estimated width of the equation-number text (points). */
  readonly numberWidthPt: number;
  /** Widths of every Where row (empty array = no definitions). */
  readonly whereRows: readonly FormulaWhereRowWidths[];
  /** Estimated width of the "Where:" label itself (points). */
  readonly whereLabelWidthPt: number;
}

export interface FormulaLayoutPlan {
  /** Uniform fit scale, `≤ 1` (1 = natural size). */
  readonly scale: number;
  /** True when the formula was scaled down — renderer prints an honest note. */
  readonly scaledToFit: boolean;
  /** Scaled formula box width (points). */
  readonly formulaWidthPt: number;
  /** Scaled formula box height (points). */
  readonly formulaHeightPt: number;
  /** Scaled baseline offset from the box top (points). */
  readonly baselineOffsetPt: number;
  /** Cell width for the aligned formula (points) — hAlign band. */
  readonly formulaCellWidthPt: number;
  /** Formula cell + number cell = total formula area width (points). */
  readonly formulaAreaWidthPt: number;
  /** Number cell width including its leading gap (0 when unnumbered). */
  readonly numberCellWidthPt: number;
  /** Where list placement decided by the width arithmetic. */
  readonly whereMode: 'none' | 'beside' | 'below';
  /** Column width for the Where list (points). */
  readonly whereWidthPt: number;
  /** Gap used before a beside-mode column (0 otherwise). */
  readonly whereGapPt: number;
}

/**
 * Plan the formula block's geometry.  Pure and deterministic: the same
 * input always yields the same plan (asserted by the P06-M3 suite).
 */
export function planFormulaLayout(input: FormulaLayoutInput): FormulaLayoutPlan {
  const numberCellWidthPt = input.hasNumber
    ? Math.max(0, input.numberWidthPt) + FORMULA_NUMBER_GAP_PT
    : 0;

  // 1. Overflow: fit to the space left of the number cell (never enlarge).
  const fitSpace = Math.max(1, input.contentWidthPt - numberCellWidthPt);
  const scale =
    input.naturalWidthPt > fitSpace && input.naturalWidthPt > 0
      ? fitSpace / input.naturalWidthPt
      : 1;
  const formulaWidthPt = input.naturalWidthPt * scale;
  const formulaHeightPt = input.naturalHeightPt * scale;
  const baselineOffsetPt = input.baselineOffsetPt * scale;

  // 2. The "Where:" rule: beside while everything fits, below when not.
  let whereMode: 'none' | 'beside' | 'below' = 'none';
  let whereWidthPt = 0;
  if (input.whereRows.length > 0) {
    const widestRow = input.whereRows.reduce(
      (max, row) => Math.max(max, row.symbolWidthPt + FORMULA_SYMBOL_GAP_PT + row.textWidthPt),
      0,
    );
    const whereNaturalPt = Math.max(input.whereLabelWidthPt, widestRow);
    if (
      formulaWidthPt + numberCellWidthPt + FORMULA_WHERE_GAP_PT + whereNaturalPt <=
      input.contentWidthPt
    ) {
      whereMode = 'beside';
      whereWidthPt = whereNaturalPt;
    } else {
      whereMode = 'below';
      whereWidthPt = input.contentWidthPt;
    }
  }

  // 3. Formula area (cell + number cell) and the hAlign band.
  const formulaAreaWidthPt = Math.max(
    1,
    input.contentWidthPt - (whereMode === 'beside' ? whereWidthPt + FORMULA_WHERE_GAP_PT : 0),
  );
  const formulaCellWidthPt = Math.max(1, formulaAreaWidthPt - numberCellWidthPt);

  return {
    scale,
    scaledToFit: scale < 0.999,
    formulaWidthPt,
    formulaHeightPt,
    baselineOffsetPt,
    formulaCellWidthPt,
    formulaAreaWidthPt,
    numberCellWidthPt,
    whereMode,
    whereWidthPt,
    whereGapPt: whereMode === 'beside' ? FORMULA_WHERE_GAP_PT : 0,
  };
}
