/**
 * DocStudio — Page setup & typography settings service (P04-M1)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Pure, non-mutating update rules for the authoritative `document.pageSetup`
 * and `document.pageTypography` settings (project_details.md §8.1/§8.2/§8.4).
 * Same conventions as `services/document-actions.ts`: every real change
 * returns a NEW document object, inputs are never mutated, and a no-op
 * patch returns the SAME reference (no false Modified status, no
 * `modifiedAt` churn).
 *
 * This module is free of React/Tauri/DOM imports so the rules are directly
 * testable (see verify_p04_m1.mjs).  The Page & Typography panel dispatches
 * through these functions; the rules themselves live here.
 *
 * Policies (documented decisions)
 * ───────────────────────────────
 * • Named margin presets have fixed, documented values (common word-
 *   processor conventions): normal 25 mm (matches `createDefaultMargins`),
 *   narrow 12.7 mm (½ inch), wide 38.1 mm (1½ inch) on all four sides.
 * • The stored margin values ALWAYS mirror the active preset — the file is
 *   self-describing.  They are authoritative when `preset === 'custom'`.
 *   Selecting "custom" keeps the currently stored values (the user edits
 *   from there); selecting a named preset writes that preset's values.
 * • Unrelated edits (size, orientation, typography, content, metadata) never
 *   touch the margin values — custom values stay associated with the custom
 *   preset and survive every unrelated change.
 * • Custom margins must be finite, ≥ 0 mm, and must leave at least
 *   `MIN_USABLE_CONTENT_MM` (50 mm) of usable page area on both axes of the
 *   CURRENT effective page (orientation included).  Invalid input is
 *   REJECTED with a deterministic error code and an understandable message;
 *   it is never coerced and never partially applied.
 * • Typography ranges: base font size 6–72 pt, line spacing 1.0–3.0,
 *   paragraph spacing 0–72 pt, non-empty font family (≤ 100 chars), font
 *   fallbacks ≤ 8 non-empty entries.  Out-of-range input is rejected, never
 *   silently clamped.
 * • `displayHeader` (§8.4): refused while `frontPage.enabled` is true — the
 *   stored preference is preserved untouched for when the cover is off.
 * • Timestamps: `createdAt` NEVER changes; a real settings change stamps
 *   `modifiedAt` (the §6 policy), a no-op change does not.
 *
 * Honest font note: this service stores the requested font family/fallbacks
 * in the document.  The current renderer maps body text to PDF standard-14
 * fonts (no embedding); registering/embedding real font files is a Phase 08
 * fidelity task.  Nothing here guarantees identical cross-machine output.
 *
 * @module services/page-typography
 */

import type {
  DocStudioDocument,
  MarginPreset,
  PageOrientation,
  PageSize,
} from '../types/document';
import { nowISO } from '../types/defaults';

// ─────────────────────────────────────────────────────────────────────────────
// Page geometry constants
// ─────────────────────────────────────────────────────────────────────────────

/** Physical dimensions (mm) for every supported page size: [width, height] portrait. */
export const PAGE_DIMENSIONS_MM: Record<PageSize, readonly [number, number]> = {
  A4: [210, 297],
  A3: [297, 420],
  A5: [148, 210],
  Letter: [215.9, 279.4],
  Legal: [215.9, 355.6],
};

/** Documented margin-preset values (mm) applied to all four sides. */
export const MARGIN_PRESETS_MM: Record<Exclude<MarginPreset, 'custom'>, number> = {
  normal: 25,
  narrow: 12.7,
  wide: 38.1,
};

/** Minimum usable content size (mm) kept free on each axis after margins. */
export const MIN_USABLE_CONTENT_MM = 50;

/** Documented validation ranges for typography inputs. */
export const FONT_SIZE_PT_RANGE = { min: 6, max: 72 } as const;
export const LINE_HEIGHT_RANGE = { min: 1.0, max: 3.0 } as const;
export const PARAGRAPH_SPACING_PT_RANGE = { min: 0, max: 72 } as const;
export const FONT_FALLBACKS_MAX = 8;

/** Supported page sizes/orientations in display order (for pickers and tests). */
export const SUPPORTED_PAGE_SIZES: readonly PageSize[] = ['A4', 'A3', 'A5', 'Letter', 'Legal'];
export const SUPPORTED_ORIENTATIONS: readonly PageOrientation[] = ['portrait', 'landscape'];
export const SUPPORTED_MARGIN_PRESETS: readonly MarginPreset[] = ['normal', 'narrow', 'wide', 'custom'];

/** Effective page dimensions (mm) for a size in a given orientation. */
export function effectivePageDimensionsMm(
  size: PageSize,
  orientation: PageOrientation,
): readonly [number, number] {
  const [w, h] = PAGE_DIMENSIONS_MM[size];
  return orientation === 'landscape' ? [h, w] : [w, h];
}

/**
 * Parse a numeric draft (input value) into a number for validation.
 *
 * Guards the classic `Number('') === 0` and `Number(' ') === 0` traps: an
 * EMPTY or whitespace-only draft becomes `NaN` — which every validator
 * rejects — so clearing a field can never silently commit zero (project
 * requirement: "reject empty, non-finite, negative or otherwise invalid
 * values").  Whitespace padding is trimmed; genuinely invalid text becomes
 * `NaN` naturally.  Never coerces, never clamps.
 */
export function parseNumberDraft(raw: string): number {
  const trimmed = typeof raw === 'string' ? raw.trim() : '';
  return trimmed === '' ? NaN : Number(trimmed);
}

// ─────────────────────────────────────────────────────────────────────────────
// Patch types and result union
// ─────────────────────────────────────────────────────────────────────────────

/** A single page-setup change requested by the panel. */
export type PageSetupPatch =
  | { field: 'size'; size: PageSize }
  | { field: 'orientation'; orientation: PageOrientation }
  | { field: 'marginPreset'; preset: MarginPreset }
  | {
      field: 'customMargins';
      topMm: number;
      bottomMm: number;
      leftMm: number;
      rightMm: number;
    };

/** A single typography change requested by the panel. */
export type TypographyPatch =
  | { field: 'fontFamily'; value: string }
  | { field: 'fontFallbacks'; value: string[] }
  | { field: 'baseFontSizePt'; value: number }
  | { field: 'lineHeight'; value: number }
  | { field: 'paragraphSpacingPt'; value: number };

/** Deterministic validation error codes (mirrors the P03-M4 convention). */
export type SettingsErrorCode =
  | 'unknown-size'
  | 'unknown-orientation'
  | 'unknown-preset'
  | 'invalid-number'
  | 'negative-margin'
  | 'no-usable-page-area'
  | 'out-of-range'
  | 'empty-font-family'
  | 'invalid-fallbacks'
  | 'front-page-enabled';

/** Outcome of a settings update: applied (changed or no-op) or rejected. */
export type SettingsUpdateResult =
  | { ok: true; doc: DocStudioDocument; changed: boolean }
  | { ok: false; code: SettingsErrorCode; message: string };

const reject = (code: SettingsErrorCode, message: string): SettingsUpdateResult => ({
  ok: false,
  code,
  message,
});

// ─────────────────────────────────────────────────────────────────────────────
// Page setup updates
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Apply a page-setup patch to the authoritative document.
 *
 * Returns the SAME document reference when the patch changes nothing
 * (selecting the already-active size/orientation/preset, or re-entering the
 * stored custom values) so React bails out of the state update — no false
 * Modified status, no `modifiedAt` churn.  Invalid patches are rejected with
 * a code + message and leave the document untouched (never partial).
 */
export function updatePageSetup(
  source: DocStudioDocument,
  patch: PageSetupPatch,
  now: string = nowISO(),
): SettingsUpdateResult {
  const current = source.pageSetup;

  let next: typeof current;
  switch (patch.field) {
    case 'size': {
      if (!(patch.size in PAGE_DIMENSIONS_MM)) {
        return reject('unknown-size', `"${patch.size}" is not a supported page size.`);
      }
      if (current.size === patch.size) return { ok: true, doc: source, changed: false };
      next = { ...current, size: patch.size };
      break;
    }
    case 'orientation': {
      if (patch.orientation !== 'portrait' && patch.orientation !== 'landscape') {
        return reject('unknown-orientation', 'Orientation must be portrait or landscape.');
      }
      if (current.orientation === patch.orientation) {
        return { ok: true, doc: source, changed: false };
      }
      next = { ...current, orientation: patch.orientation };
      break;
    }
    case 'marginPreset': {
      if (!SUPPORTED_MARGIN_PRESETS.includes(patch.preset)) {
        return reject('unknown-preset', `"${patch.preset}" is not a supported margin preset.`);
      }
      if (current.margins.preset === patch.preset) {
        return { ok: true, doc: source, changed: false };
      }
      if (patch.preset === 'custom') {
        // Keep the currently stored values — they become authoritative.
        next = { ...current, margins: { ...current.margins, preset: 'custom' } };
      } else {
        const v = MARGIN_PRESETS_MM[patch.preset];
        next = {
          ...current,
          margins: { preset: patch.preset, topMm: v, bottomMm: v, leftMm: v, rightMm: v },
        };
      }
      break;
    }
    case 'customMargins': {
      const { topMm, bottomMm, leftMm, rightMm } = patch;
      for (const [label, v] of [
        ['top', topMm],
        ['bottom', bottomMm],
        ['left', leftMm],
        ['right', rightMm],
      ] as const) {
        if (!Number.isFinite(v)) {
          return reject('invalid-number', `The ${label} margin must be a number in millimetres.`);
        }
        if (v < 0) {
          return reject('negative-margin', `The ${label} margin cannot be negative.`);
        }
      }
      const [pageW, pageH] = effectivePageDimensionsMm(current.size, current.orientation);
      const usableW = pageW - leftMm - rightMm;
      const usableH = pageH - topMm - bottomMm;
      if (usableW < MIN_USABLE_CONTENT_MM || usableH < MIN_USABLE_CONTENT_MM) {
        return reject(
          'no-usable-page-area',
          `Custom margins must leave at least ${MIN_USABLE_CONTENT_MM} mm of usable ` +
            `page area on every side of the current page.`,
        );
      }
      const same =
        current.margins.preset === 'custom' &&
        current.margins.topMm === topMm &&
        current.margins.bottomMm === bottomMm &&
        current.margins.leftMm === leftMm &&
        current.margins.rightMm === rightMm;
      if (same) return { ok: true, doc: source, changed: false };
      next = { ...current, margins: { preset: 'custom', topMm, bottomMm, leftMm, rightMm } };
      break;
    }
  }

  return {
    ok: true,
    doc: { ...source, pageSetup: next, metadata: { ...source.metadata, modifiedAt: now } },
    changed: true,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Typography updates
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Apply a typography patch to the authoritative document's
 * `pageTypography.typography`.  Same no-op/rejection semantics as
 * `updatePageSetup`; invalid values are never silently coerced.
 */
export function updateTypography(
  source: DocStudioDocument,
  patch: TypographyPatch,
  now: string = nowISO(),
): SettingsUpdateResult {
  const current = source.pageTypography.typography;
  let next: typeof current;

  switch (patch.field) {
    case 'fontFamily': {
      const value = patch.value.trim();
      if (value === '') {
        return reject('empty-font-family', 'Choose or enter a font family name.');
      }
      if (value.length > 100) {
        return reject('empty-font-family', 'The font family name is too long (max 100 characters).');
      }
      if (current.fontFamily === value) return { ok: true, doc: source, changed: false };
      next = { ...current, fontFamily: value };
      break;
    }
    case 'fontFallbacks': {
      if (!Array.isArray(patch.value) || patch.value.length > FONT_FALLBACKS_MAX) {
        return reject(
          'invalid-fallbacks',
          `List at most ${FONT_FALLBACKS_MAX} fallback fonts, separated by commas.`,
        );
      }
      const cleaned: string[] = [];
      for (const entry of patch.value) {
        if (typeof entry !== 'string' || entry.trim() === '') {
          return reject(
            'invalid-fallbacks',
            'Each fallback must be a non-empty font name. Separate entries with commas.',
          );
        }
        cleaned.push(entry.trim());
      }
      if (JSON.stringify(cleaned) === JSON.stringify(current.fontFallbacks)) {
        return { ok: true, doc: source, changed: false };
      }
      next = { ...current, fontFallbacks: cleaned };
      break;
    }
    case 'baseFontSizePt': {
      const v = patch.value;
      if (!Number.isFinite(v)) {
        return reject('invalid-number', 'The base font size must be a number in points.');
      }
      if (v < FONT_SIZE_PT_RANGE.min || v > FONT_SIZE_PT_RANGE.max) {
        return reject(
          'out-of-range',
          `The base font size must be between ${FONT_SIZE_PT_RANGE.min} and ${FONT_SIZE_PT_RANGE.max} points.`,
        );
      }
      if (current.baseFontSizePt === v) return { ok: true, doc: source, changed: false };
      next = { ...current, baseFontSizePt: v };
      break;
    }
    case 'lineHeight': {
      const v = patch.value;
      if (!Number.isFinite(v)) {
        return reject('invalid-number', 'Line spacing must be a number (multiplier).');
      }
      if (v < LINE_HEIGHT_RANGE.min || v > LINE_HEIGHT_RANGE.max) {
        return reject(
          'out-of-range',
          `Line spacing must be between ${LINE_HEIGHT_RANGE.min.toFixed(1)} and ${LINE_HEIGHT_RANGE.max.toFixed(1)}.`,
        );
      }
      if (current.lineHeight === v) return { ok: true, doc: source, changed: false };
      next = { ...current, lineHeight: v };
      break;
    }
    case 'paragraphSpacingPt': {
      const v = patch.value;
      if (!Number.isFinite(v)) {
        return reject('invalid-number', 'Paragraph spacing must be a number in points.');
      }
      if (v < PARAGRAPH_SPACING_PT_RANGE.min || v > PARAGRAPH_SPACING_PT_RANGE.max) {
        return reject(
          'out-of-range',
          `Paragraph spacing must be between ${PARAGRAPH_SPACING_PT_RANGE.min} and ${PARAGRAPH_SPACING_PT_RANGE.max} points.`,
        );
      }
      if (current.paragraphSpacingPt === v) return { ok: true, doc: source, changed: false };
      next = { ...current, paragraphSpacingPt: v };
      break;
    }
  }

  return {
    ok: true,
    doc: {
      ...source,
      pageTypography: { ...source.pageTypography, typography: next },
      metadata: { ...source.metadata, modifiedAt: now },
    },
    changed: true,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Display-header preference (§8.4)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Toggle the body display-header preference.
 *
 * Refused (document unchanged, stored preference untouched) while the front
 * page is enabled — project_details.md §8.4 disables the control but
 * preserves its stored value for when the cover is switched off again.
 */
export function updateDisplayHeader(
  source: DocStudioDocument,
  value: boolean,
  now: string = nowISO(),
): SettingsUpdateResult {
  if (source.frontPage.enabled) {
    return reject(
      'front-page-enabled',
      'The display header cannot change while the front page is enabled — your stored choice is kept.',
    );
  }
  if (typeof value !== 'boolean') {
    return reject('invalid-number', 'The display header setting must be on or off.');
  }
  if (source.pageTypography.displayHeader === value) {
    return { ok: true, doc: source, changed: false };
  }
  return {
    ok: true,
    changed: true,
    doc: {
      ...source,
      pageTypography: { ...source.pageTypography, displayHeader: value },
      metadata: { ...source.metadata, modifiedAt: now },
    },
  };
}
