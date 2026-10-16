/**
 * DocStudio — Centralized typography tokens (P04-M1)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * `project_details.md` §8.2 requires heading sizes to be DERIVED from
 * centralized typography tokens based on the configured base font size —
 * never stored per heading (unless a block carries an explicit override,
 * which the schema supports but no block uses yet).
 *
 * This module is the single source of that derivation.  It is pure (no
 * React/Tauri/DOM) so both the renderer and the verification suite use the
 * exact same tokens.
 *
 * Token policy (documented decisions)
 * ───────────────────────────────────
 * • Heading levels 1–4 (the schema's `HeadingBlockData.level` range) are
 *   scale factors of `baseFontSizePt`, rounded to whole points:
 *     H1 ×1.64, H2 ×1.28, H3 ×1.09, H4 ×1.00.
 *   At the default base of 11 pt this reproduces the historical PoC steps
 *   (18/14/12/11 pt) exactly, so activating the derived scale changed no
 *   existing rendering output.
 * • Rounding to whole points keeps sizes stable and deterministic at every
 *   legal base size; the factors are monotonic (a larger base always
 *   yields larger headings, and H1 > H2 > H3 ≥ H4 for any legal base).
 * • An invalid base (non-finite, ≤ 0) falls back to the documented default
 *   base size rather than producing NaN sizes — defensive only; callers
 *   validate user input via `services/page-typography.ts` first.
 *
 * @module services/typography-tokens
 */

/** Default base body font size (pt) — mirrors `createDefaultTypography()`. */
export const DEFAULT_BASE_FONT_SIZE_PT = 11;

/** Heading levels supported by the block schema (1–4). */
export type HeadingLevel = 1 | 2 | 3 | 4;

/**
 * Scale factors per heading level.  Centralized on purpose: the renderer,
 * tests and future theme engine (P04-M2/M3) must never drift apart.
 */
export const HEADING_SCALE_FACTORS: Record<HeadingLevel, number> = {
  1: 1.64,
  2: 1.28,
  3: 1.09,
  4: 1.0,
};

/**
 * Derive the heading size steps (pt) for levels 1–4 from a base body font
 * size.  Deterministic, pure, and rounded to whole points.
 */
export function deriveHeadingSizesPt(baseFontSizePt: number): Record<HeadingLevel, number> {
  const base =
    Number.isFinite(baseFontSizePt) && baseFontSizePt > 0
      ? baseFontSizePt
      : DEFAULT_BASE_FONT_SIZE_PT;
  return {
    1: Math.round(base * HEADING_SCALE_FACTORS[1]),
    2: Math.round(base * HEADING_SCALE_FACTORS[2]),
    3: Math.round(base * HEADING_SCALE_FACTORS[3]),
    4: Math.round(base * HEADING_SCALE_FACTORS[4]),
  };
}
