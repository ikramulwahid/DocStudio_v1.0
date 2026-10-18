/**
 * DocStudio — Front-page settings service (P04-M4)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Pure, immutable update rules for `document.frontPage`
 * (project_details.md §7).  Follows the established page-typography
 * conventions:
 * • A patch that changes nothing returns the SAME document reference, so
 *   React bails out — no false Modified status, no `modifiedAt` churn.
 * • A real change stamps `metadata.modifiedAt` and touches ONLY the
 *   patched front-page fields; every other document section is preserved.
 * • Invalid patches are rejected with a deterministic code + message and
 *   leave the document untouched (never partial).
 *
 * Independence rules (§7 / P04-M4 brief):
 * • `frontPage.monochrome` is independent of `pageTypography.monochrome`
 *   and of the application interface mode.
 * • `frontPage.themeId` never touches `pageTypography.bodyThemeId`.
 * • Toggling `enabled` never deletes title, subtitle, metadata, assets,
 *   synopsis, placement or body content; the §8.4 display-header rule is
 *   enforced by `updateDisplayHeader` (page-typography.ts), which reads
 *   `frontPage.enabled` from the document — no duplicated policy here.
 *
 * @module services/front-page
 */

import type {
  CoverElementPlacement,
  CoverFrameSettings,
  CoverThemeId,
  CoverVisibleMetadataField,
  CustomMetadataField,
  DocStudioDocument,
  DocUUID,
  FrontPageSettings,
  AssetRecord,
} from '../types/document';
import { nowISO, newUUID } from '../types/defaults';
import { isCoverThemeId } from './cover-theme-registry';
import { METADATA_FIELD_SPECS } from './metadata-fields';

// ─────────────────────────────────────────────────────────────────────────────
// Validation ranges and constants
// ─────────────────────────────────────────────────────────────────────────────

export const LOGO_WIDTH_MM_RANGE = { min: 5, max: 200 } as const;
export const FRAME_THICKNESS_PT_RANGE = { min: 0.1, max: 12 } as const;
export const FRAME_CORNER_RADIUS_MM_RANGE = { min: 0, max: 40 } as const;
export const FRAME_INSET_MM_RANGE = { min: 0, max: 60 } as const;
export const SYNOPSIS_MAX_LENGTH = 4000;

/** Scalar metadata keys that may appear on the cover (registry-backed). */
const SCALAR_COVER_FIELDS: ReadonlySet<string> = new Set<string>([
  ...METADATA_FIELD_SPECS.map((s) => s.key),
  'createdAt',
  'modifiedAt',
]);

/** Which principal element a placement patch targets. */
export type CoverPlacementElement = 'title' | 'subtitle' | 'organizationName';

// ─────────────────────────────────────────────────────────────────────────────
// Patch type and result union
// ─────────────────────────────────────────────────────────────────────────────

/** A single front-page change requested by the panel (or import flow). */
export type FrontPagePatch =
  | { field: 'enabled'; value: boolean }
  | { field: 'themeId'; value: CoverThemeId }
  | { field: 'monochrome'; value: boolean }
  | { field: 'visibleFields'; value: CoverVisibleMetadataField[] }
  | { field: 'synopsis'; value: string | undefined }
  /** `undefined` clears the reference (removes the logo from the cover). */
  | { field: 'logoAssetId'; value: DocUUID | undefined }
  | { field: 'logoWidthMm'; value: number | undefined }
  | { field: 'backgroundImageAssetId'; value: DocUUID | undefined }
  | { field: 'frame'; value: Partial<CoverFrameSettings> }
  /** `value: undefined` resets that element to the theme default. */
  | {
      field: 'placement';
      element: CoverPlacementElement;
      value: CoverElementPlacement | undefined;
    };

/** Deterministic validation error codes (mirrors the settings convention). */
export type FrontPageErrorCode =
  | 'unknown-cover-theme'
  | 'invalid-boolean'
  | 'invalid-visible-field'
  | 'duplicate-visible-field'
  | 'invalid-synopsis'
  | 'invalid-logo-width'
  | 'invalid-frame-value'
  | 'invalid-frame-color'
  | 'invalid-placement'
  | 'missing-asset'
  | 'image-import' // imported bytes failed validation (too large, wrong format, ...)
  | 'image-io'; // native picker / file read failed (document left untouched)

export type FrontPageUpdateResult =
  | { ok: true; doc: DocStudioDocument; changed: boolean }
  | { ok: false; code: FrontPageErrorCode; message: string };

const reject = (code: FrontPageErrorCode, message: string): FrontPageUpdateResult => ({
  ok: false,
  code,
  message,
});

// ─────────────────────────────────────────────────────────────────────────────
// Validation helpers
// ─────────────────────────────────────────────────────────────────────────────

/** Hex (#rgb/#rrggbb/#rrggbbaa) or rgba()/rgb() colour — deterministic. */
export function isValidCoverColor(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  const v = value.trim();
  if (/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/.test(v)) return true;
  return /^rgba?\(\s*\d{1,3}\s*,\s*\d{1,3}\s*,\s*\d{1,3}\s*(,\s*(0|1|0?\.\d+)\s*)?\)$/.test(v);
}

const inRange = (v: number, r: { min: number; max: number }): boolean =>
  Number.isFinite(v) && v >= r.min && v <= r.max;

/**
 * Validate a visible-field list: every entry is a known scalar metadata
 * key or a `custom:<id>` reference; duplicates are rejected so display
 * order stays meaningful.  Stale custom references (field removed later)
 * are tolerated here and simply render nothing (renderer skips them).
 */
function validateVisibleFields(value: unknown): FrontPageUpdateResult | null {
  if (!Array.isArray(value)) {
    return reject('invalid-visible-field', 'Visible metadata fields must be a list.');
  }
  const seen = new Set<string>();
  for (const entry of value) {
    if (typeof entry !== 'string' || entry === '') {
      return reject('invalid-visible-field', 'Every visible metadata field must be an identifier.');
    }
    const isScalar = SCALAR_COVER_FIELDS.has(entry);
    const isCustom = /^custom:.+$/.test(entry);
    if (!isScalar && !isCustom) {
      return reject(
        'invalid-visible-field',
        `"${entry}" is not a supported metadata field.`,
      );
    }
    if (seen.has(entry)) {
      return reject('duplicate-visible-field', 'The same metadata field cannot be listed twice.');
    }
    seen.add(entry);
  }
  return null;
}

/** Validate a partial frame patch; returns the normalized values or null. */
function validateFramePatch(
  value: unknown,
): { ok: true; frame: Partial<CoverFrameSettings> } | { ok: false; result: FrontPageUpdateResult } {
  const fail = (message: string) => ({ ok: false as const, result: reject('invalid-frame-value', message) });
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return fail('Frame settings must be an object.');
  }
  const raw = value as Record<string, unknown>;
  const frame: Partial<CoverFrameSettings> = {};

  if ('visible' in raw) {
    if (typeof raw.visible !== 'boolean') return fail('Frame visibility must be on or off.');
    frame.visible = raw.visible;
  }
  if ('style' in raw) {
    const styles = ['none', 'solid', 'double', 'dashed', 'dotted'];
    if (typeof raw.style !== 'string' || !styles.includes(raw.style)) {
      return fail('Border style must be none, solid, double, dashed or dotted.');
    }
    frame.style = raw.style as CoverFrameSettings['style'];
  }
  if ('thicknessPt' in raw) {
    const v = raw.thicknessPt;
    if (typeof v !== 'number' || !inRange(v, FRAME_THICKNESS_PT_RANGE)) {
      return fail(
        `Border thickness must be a number between ${FRAME_THICKNESS_PT_RANGE.min} and ${FRAME_THICKNESS_PT_RANGE.max} pt.`,
      );
    }
    frame.thicknessPt = v;
  }
  if ('color' in raw) {
    if (!isValidCoverColor(raw.color)) {
      return {
        ok: false,
        result: reject('invalid-frame-color', 'Border colour must be a hex or rgb/rgba colour.'),
      };
    }
    frame.color = raw.color.trim() as CoverFrameSettings['color'];
  }
  if ('cornerRadiusMm' in raw) {
    const v = raw.cornerRadiusMm;
    if (typeof v !== 'number' || !inRange(v, FRAME_CORNER_RADIUS_MM_RANGE)) {
      return fail(
        `Corner radius must be a number between ${FRAME_CORNER_RADIUS_MM_RANGE.min} and ${FRAME_CORNER_RADIUS_MM_RANGE.max} mm.`,
      );
    }
    frame.cornerRadiusMm = v;
  }
  if ('insetMm' in raw) {
    const v = raw.insetMm;
    if (typeof v !== 'number' || !inRange(v, FRAME_INSET_MM_RANGE)) {
      return fail(
        `Frame inset must be a number between ${FRAME_INSET_MM_RANGE.min} and ${FRAME_INSET_MM_RANGE.max} mm.`,
      );
    }
    frame.insetMm = v;
  }
  return { ok: true, frame };
}

// ─────────────────────────────────────────────────────────────────────────────
// Update
// ─────────────────────────────────────────────────────────────────────────────

const sameJSON = (a: unknown, b: unknown): boolean => JSON.stringify(a) === JSON.stringify(b);

/**
 * Apply a front-page patch to the authoritative document.
 *
 * Same-reference no-op on unchanged values; on a real change only the
 * patched fields (plus `modifiedAt`) differ — theme, monochrome, visible
 * fields, synopsis, assets, placement and frame all survive every other
 * patch, and turning the cover off keeps all of them stored.
 */
export function updateFrontPage(
  source: DocStudioDocument,
  patch: FrontPagePatch,
  now: string = nowISO(),
): FrontPageUpdateResult {
  const current = source.frontPage;
  const next: FrontPageSettings = { ...current };

  switch (patch.field) {
    case 'enabled': {
      if (typeof patch.value !== 'boolean') {
        return reject('invalid-boolean', 'The front page must be on or off.');
      }
      next.enabled = patch.value;
      break;
    }
    case 'themeId': {
      if (!isCoverThemeId(patch.value)) {
        return reject('unknown-cover-theme', 'That cover theme does not exist.');
      }
      next.themeId = patch.value;
      break;
    }
    case 'monochrome': {
      if (typeof patch.value !== 'boolean') {
        return reject('invalid-boolean', 'Monochrome must be on or off.');
      }
      next.monochrome = patch.value;
      break;
    }
    case 'visibleFields': {
      const err = validateVisibleFields(patch.value);
      if (err) return err;
      next.visibleFields = [...patch.value];
      break;
    }
    case 'synopsis': {
      if (patch.value === undefined) {
        delete next.synopsis;
        break;
      }
      if (typeof patch.value !== 'string') {
        return reject('invalid-synopsis', 'The synopsis must be text.');
      }
      if (patch.value.length > SYNOPSIS_MAX_LENGTH) {
        return reject(
          'invalid-synopsis',
          `The synopsis must be at most ${SYNOPSIS_MAX_LENGTH} characters.`,
        );
      }
      const trimmed = patch.value.trim();
      if (trimmed === '') delete next.synopsis;
      else next.synopsis = trimmed;
      break;
    }
    case 'logoAssetId': {
      if (patch.value === undefined) {
        delete next.logoAssetId;
        break;
      }
      if (typeof patch.value !== 'string' || !source.assets[patch.value]) {
        return reject('missing-asset', 'The selected logo asset is not in this document.');
      }
      next.logoAssetId = patch.value;
      break;
    }
    case 'logoWidthMm': {
      if (patch.value === undefined) {
        delete next.logoWidthMm;
        break;
      }
      if (!inRange(patch.value, LOGO_WIDTH_MM_RANGE)) {
        return reject(
          'invalid-logo-width',
          `Logo width must be a number between ${LOGO_WIDTH_MM_RANGE.min} and ${LOGO_WIDTH_MM_RANGE.max} mm.`,
        );
      }
      next.logoWidthMm = patch.value;
      break;
    }
    case 'backgroundImageAssetId': {
      if (patch.value === undefined) {
        delete next.backgroundImageAssetId;
        break;
      }
      if (typeof patch.value !== 'string' || !source.assets[patch.value]) {
        return reject(
          'missing-asset',
          'The selected background image asset is not in this document.',
        );
      }
      next.backgroundImageAssetId = patch.value;
      break;
    }
    case 'frame': {
      const validated = validateFramePatch(patch.value);
      if (validated.ok === false) return validated.result;
      next.frame = { ...current.frame, ...validated.frame };
      break;
    }
    case 'placement': {
      const el = patch.element;
      if (el !== 'title' && el !== 'subtitle' && el !== 'organizationName') {
        return reject('invalid-placement', 'Unknown cover element for placement.');
      }
      if (patch.value !== undefined) {
        const { align, band } = patch.value;
        if (!['left', 'center', 'right'].includes(align) || !['top', 'middle', 'bottom'].includes(band)) {
          return reject(
            'invalid-placement',
            'Placement must use a supported alignment (left/center/right) and position (top/middle/bottom).',
          );
        }
      }
      const placement = { ...(current.placement ?? {}) };
      if (patch.value === undefined) delete placement[el];
      else placement[el] = patch.value;
      if (Object.keys(placement).length === 0) delete next.placement;
      else next.placement = placement;
      break;
    }
    default: {
      // Exhaustiveness guard: a new patch kind must be handled above.
      const never: never = patch;
      void never;
      return reject('invalid-frame-value', 'Unknown front-page patch.');
    }
  }

  if (sameJSON(next, current)) return { ok: true, doc: source, changed: false };
  return {
    ok: true,
    changed: true,
    doc: { ...source, frontPage: next, metadata: { ...source.metadata, modifiedAt: now } },
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Asset reference bookkeeping (safe embedding / pruning)
// ─────────────────────────────────────────────────────────────────────────────

/** Every asset id referenced by retained document structures. */
export function collectReferencedAssetIds(doc: DocStudioDocument): Set<string> {
  const ids = new Set<string>();
  if (doc.frontPage.logoAssetId) ids.add(doc.frontPage.logoAssetId);
  if (doc.frontPage.backgroundImageAssetId) ids.add(doc.frontPage.backgroundImageAssetId);
  if (doc.labProfile.logoAssetId) ids.add(doc.labProfile.logoAssetId);
  for (const block of doc.blocks) {
    const data = block.data as {
      assetId?: string | null;
      items?: Array<{ assetId?: string | null }>;
    };
    if (typeof data.assetId === 'string') ids.add(data.assetId);
    if (Array.isArray(data.items)) {
      for (const item of data.items) {
        if (typeof item?.assetId === 'string') ids.add(item.assetId);
      }
    }
  }
  return ids;
}

/**
 * Embed a freshly imported image asset into the document and point the
 * given cover slot (`logo` or `background`) at it.  Any PREVIOUS asset
 * only held by that slot is pruned when nothing else references it —
 * assets shared with blocks, the lab profile or the other slot survive.
 * The resulting document is returned through the standard no-op/dirty
 * conventions (never a partial mutation).
 */
export function applyImportedCoverAsset(
  source: DocStudioDocument,
  target: 'logo' | 'background',
  asset: AssetRecord,
  now: string = nowISO(),
): FrontPageUpdateResult {
  if (!asset || typeof asset.base64Data !== 'string' || asset.base64Data === '') {
    return reject('missing-asset', 'The imported image has no data.');
  }
  const current = source.frontPage;
  const previousId = target === 'logo' ? current.logoAssetId : current.backgroundImageAssetId;

  const assets = { ...source.assets, [asset.id]: asset };

  const frontPage: FrontPageSettings =
    target === 'logo'
      ? { ...current, logoAssetId: asset.id }
      : { ...current, backgroundImageAssetId: asset.id };

  const next: DocStudioDocument = {
    ...source,
    assets,
    frontPage,
    metadata: { ...source.metadata, modifiedAt: now },
  };

  // Prune the replaced asset only when truly unreferenced anywhere.
  if (previousId && previousId !== asset.id && !collectReferencedAssetIds(next).has(previousId)) {
    delete next.assets[previousId];
  }
  return { ok: true, doc: next, changed: true };
}

/**
 * Clear a cover image reference (logo or background) and prune the
 * orphaned asset only when nothing else references it.  Settings,
 * metadata and all other assets are preserved; cover-off documents keep
 * working because clearing a slot never touches `enabled`.
 */
export function removeCoverAsset(
  source: DocStudioDocument,
  target: 'logo' | 'background',
  now: string = nowISO(),
): FrontPageUpdateResult {
  const current = source.frontPage;
  const previousId = target === 'logo' ? current.logoAssetId : current.backgroundImageAssetId;
  if (!previousId) return { ok: true, doc: source, changed: false };

  const frontPage: FrontPageSettings = { ...current };
  if (target === 'logo') delete frontPage.logoAssetId;
  else delete frontPage.backgroundImageAssetId;

  const next: DocStudioDocument = {
    ...source,
    frontPage,
    metadata: { ...source.metadata, modifiedAt: now },
  };
  if (!collectReferencedAssetIds(next).has(previousId)) {
    delete next.assets[previousId];
  }
  return { ok: true, doc: next, changed: true };
}

// ─────────────────────────────────────────────────────────────────────────────
// Visible-field labels (panel + renderer share this single label source)
// ─────────────────────────────────────────────────────────────────────────────

const DATE_FIELD_LABELS: Record<string, string> = {
  createdAt: 'Created date',
  modifiedAt: 'Modified date',
};

/**
 * Human-readable label for a visible cover field.  Scalar keys resolve
 * through the shared metadata-field registry; `custom:<id>` resolves
 * through the document's custom fields (label may have been renamed);
 * unresolvable entries return null (render nothing, never crash).
 */
export function coverFieldLabel(
  field: CoverVisibleMetadataField,
  customFields: readonly CustomMetadataField[],
): string | null {
  if (field.startsWith('custom:')) {
    const id = field.slice('custom:'.length);
    const found = customFields.find((f) => f.id === id);
    return found && found.label.trim() !== '' ? found.label : null;
  }
  const spec = METADATA_FIELD_SPECS.find((s) => s.key === field);
  if (spec) return spec.label;
  return DATE_FIELD_LABELS[field] ?? null;
}

/** Fresh UUID for a newly embedded asset (shared with defaults). */
export const newAssetId = (): DocUUID => newUUID();
