/**
 * DocStudio — Image & signature block layout math (P06-M4)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Pure, deterministic geometry shared by the PoC renderer and the
 * verification suite (the `planFormulaLayout` pattern: the renderer
 * cannot render a width the planner did not compute, so the suite can
 * assert planner↔PDF agreement with real pdfjs numbers).
 *
 * IMAGE slots (§10.7 side-by-side):
 * • Each slot wants `widthFraction × contentWidth` points.  When the
 *   two wanted widths (plus the fixed gap) exceed the content width
 *   they scale down PROPORTIONALLY to fit — relative sizes are
 *   preserved and the row can never overflow the page.  With the
 *   registry defaults (two slots at 1.0) this yields the expected
 *   "two equal halves".
 *
 * CROP box (§10.7 crop + resize):
 * • A normalized crop rectangle is mapped onto display points: the
 *   crop REGION is shown at the requested display width, the full
 *   source image is drawn SCALED UP behind it and clipped by the box
 *   (react-pdf has no built-in crop; the renderer clips with an
 *   overflow-hidden wrapper and an absolutely positioned inner image).
 * • The math keeps the source pixels undistorted: the inner image
 *   keeps the source aspect ratio, so the box aspect equals the CROP
 *   region's aspect in source pixels.
 *
 * SIGNATURE row (§10.8):
 * • 1–3 signer columns of a fixed maximum width, evenly sized, evenly
 *   gapped; narrow pages shrink the columns (never the page).  The
 *   signature line spans its column; the printed identity lines and
 *   the optional date render under it.
 *
 * @module renderer/poc/image-signature-layout
 */

import type { ImageCrop } from '../../types/blocks';

/** Fixed breathing room between two side-by-side image slots (points). */
export const IMAGE_SLOT_GAP_PT = 10;

/** Fixed gap between signer columns (points). */
export const SIGNATURE_SLOT_GAP_PT = 16;

/** Widest a signer column ever gets on a roomy page (points). */
export const SIGNATURE_SLOT_MAX_WIDTH_PT = 160;

/** Vertical signature space above the signing line (points). */
export const SIGNATURE_SPACE_PT = 30;

/** Signing-line thickness (points). */
export const SIGNATURE_LINE_PT = 1;

/** Defensive clamp mirroring the service's `widthFraction` bounds. */
const clampFraction = (value: number): number => {
  if (!Number.isFinite(value)) return 1;
  return Math.min(1, Math.max(0.1, value));
};

/**
 * Planned display widths (points) for the block's image slots.
 * `fractions` is in slot order; the result has the same length.
 */
export function planImageSlotWidthsPt(
  contentWidthPt: number,
  fractions: readonly number[],
): number[] {
  if (fractions.length === 0) return [];
  const wanted = fractions.map((fraction) => clampFraction(fraction) * contentWidthPt);
  if (wanted.length === 1) return wanted;
  const gap = IMAGE_SLOT_GAP_PT * (wanted.length - 1);
  const sum = wanted.reduce((total, width) => total + width, 0);
  const available = contentWidthPt - gap;
  if (sum <= available || sum <= 0) return wanted;
  const scale = available / sum;
  return wanted.map((width) => width * scale);
}

/**
 * Crop geometry for one slot: the on-page box (also the clip rect) and
 * the scaled/offset inner image that paints the source behind it.
 * Throws nothing — callers must pass sane inputs (the service already
 * validated the crop; `sourceWidthPx`/`sourceHeightPx` come from the
 * asset header).
 */
export function planImageCropBoxPt(
  crop: ImageCrop,
  displayWidthPt: number,
  sourceWidthPx: number,
  sourceHeightPx: number,
): {
  boxWidthPt: number;
  boxHeightPt: number;
  innerWidthPt: number;
  innerHeightPt: number;
  offsetXPt: number;
  offsetYPt: number;
} {
  const innerWidthPt = displayWidthPt / crop.width;
  const innerHeightPt = innerWidthPt * (sourceHeightPx / sourceWidthPx);
  return {
    boxWidthPt: displayWidthPt,
    boxHeightPt: crop.height * innerHeightPt,
    innerWidthPt,
    innerHeightPt,
    offsetXPt: -crop.x * innerWidthPt,
    offsetYPt: -crop.y * innerHeightPt,
  };
}

/** Planned signer-row geometry for `signerCount` (1–3) columns. */
export function planSignatureLayout(
  contentWidthPt: number,
  signerCount: number,
): { slotWidthPt: number; gapPt: number; rowWidthPt: number } {
  const count = Math.max(1, Math.min(3, Math.trunc(signerCount) || 1));
  const gapPt = count > 1 ? SIGNATURE_SLOT_GAP_PT : 0;
  const available = contentWidthPt - gapPt * (count - 1);
  const slotWidthPt = Math.min(SIGNATURE_SLOT_MAX_WIDTH_PT, available / count);
  return { slotWidthPt, gapPt, rowWidthPt: slotWidthPt * count + gapPt * (count - 1) };
}

/**
 * X offset (points, from the content left edge) of the signer row for
 * an overall alignment — the same justifyContent arithmetic the
 * renderer applies, exposed so tests can predict the first signing
 * line's position exactly.
 */
export function signatureRowStartXPt(
  contentWidthPt: number,
  signerCount: number,
  hAlign: 'left' | 'center' | 'right',
): number {
  const { rowWidthPt } = planSignatureLayout(contentWidthPt, signerCount);
  if (hAlign === 'center') return (contentWidthPt - rowWidthPt) / 2;
  if (hAlign === 'right') return contentWidthPt - rowWidthPt;
  return 0;
}
