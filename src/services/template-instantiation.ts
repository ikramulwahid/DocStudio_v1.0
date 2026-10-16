/**
 * DocStudio — Template → Document instantiation (P03-M2)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Turns a valid `DocStudioTemplate` (plus the saved Laboratory Profile) into a
 * fresh, valid, INDEPENDENTLY editable `DocStudioDocument`.  This service owns
 * the default-merging precedence policy and the deep-copy/remint rules that
 * keep the separation contract (documented in src/types/template.ts) honest:
 * editing the resulting document can never reach back into the source template
 * or the saved profile.
 *
 * Precedence policy (tested — see verify_p03_m2.mjs)
 * ──────────────────────────────────────────────────
 * 1. Application document defaults (`createDefaultDocument`) form the base.
 * 2. Template `defaults` override the base where they specify a value
 *    (deep partial merge; an omitted template key keeps the base value, and an
 *    `undefined` template value NEVER overwrites a real base value).
 * 3. The saved Laboratory Profile supplies the user's reusable LABORATORY
 *    IDENTITY over both — laboratory name (both the embedded `labProfile`
 *    snapshot AND `metadata.organizationName`, which feeds the
 *    `{organizationName}` header/footer placeholder), address, location,
 *    phone, email, website and document-ID prefix — so a generic template
 *    value such as "Example Laboratory" can never unexpectedly replace the
 *    user's saved identity.  A template `labProfile.name` or
 *    `metadata.organizationName` is ignored when the profile has a name; a
 *    template `documentIdPrefix` is likewise overridden by the saved prefix.
 *    The profile is read-only here: it is never mutated.
 *
 * Document-instance fields stay app-managed
 * ─────────────────────────────────────────
 * The new document ALWAYS gets a fresh `id`, fresh `createdAt`/`modifiedAt`, an
 * empty `customFields` array, an empty `savedRevisions` array and
 * `trackChangesEnabled: false`.  `metadata.documentId` is left BLANK — no
 * controlled-looking document code is auto-assigned (the profile's
 * `documentIdPrefix` is exposed on the embedded snapshot for the user's future
 * use, not pasted into `documentId`).
 *
 * Content and asset copying
 * ─────────────────────────
 * Sections are flattened to the document block sequence via the P03-M1
 * `templateSectionsToBlocks` contract, then every block (and its nested `data`)
 * is deep-copied and RE-MINTED with a fresh UUID so document edits cannot touch
 * the template.  Template assets are copied into an independent bundle with
 * fresh asset IDs, and every `assetId` reference in copied block data plus
 * `frontPage.logoAssetId`/`backgroundImageAssetId` is remapped to the new IDs.
 *
 * This module is React/DOM/Tauri-free so it is directly testable in Node.
 *
 * @module services/template-instantiation
 */

import type {
  DocStudioDocument,
  DocumentMetadata,
  EmbeddedLabProfile,
  FrontPageSettings,
  ContentBlock,
  AssetRecord,
  AssetMimeType,
  DocUUID,
  ISODateString,
} from '../types';
import { createDefaultDocument, newUUID } from '../types/defaults';
import type { DocStudioTemplate } from '../types/template';
import { templateSectionsToBlocks } from '../types/template-defaults';
import { labProfileToEmbedded } from './lab-profile';
import type { LabProfile } from '../types/lab-profile';

// ─────────────────────────────────────────────────────────────────────────────
// Deep partial merge (never overwrites a real value with undefined)
// ─────────────────────────────────────────────────────────────────────────────

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Recursively merge `patch` over `base`, returning a NEW object.
 *
 * Rules:
 * • A patch key whose value is `undefined` is IGNORED — it never overwrites a
 *   real base value with `undefined`.
 * • Plain objects merge recursively; arrays and scalars replace wholesale.
 * • `base` is never mutated and the result shares no mutable reference with it
 *   (arrays/objects are rebuilt), so callers can freely mutate the result.
 */
export function deepMerge<T>(base: T, patch: unknown): T {
  if (!isPlainObject(base) || !isPlainObject(patch)) {
    // Arrays, scalars, or a non-object patch: replace wholesale (deep-copied).
    return patch === undefined ? clone(base) : (clone(patch) as T);
  }

  const out: Record<string, unknown> = { ...base };
  for (const [key, value] of Object.entries(patch)) {
    if (value === undefined) continue; // never clobber with undefined
    const baseValue = (base as Record<string, unknown>)[key];
    if (isPlainObject(baseValue) && isPlainObject(value)) {
      out[key] = deepMerge(baseValue, value);
    } else if (isPlainObject(value)) {
      out[key] = deepMerge({}, value);
    } else {
      out[key] = clone(value);
    }
  }
  return out as T;
}

/** Structured deep clone of a JSON-serializable value (no shared references). */
function clone<T>(value: T): T {
  if (value === undefined || value === null) return value;
  return JSON.parse(JSON.stringify(value)) as T;
}

// ─────────────────────────────────────────────────────────────────────────────
// Asset copy + reference remapping
// ─────────────────────────────────────────────────────────────────────────────

/** Any block-data shape may carry asset references under these keys. */
type BlockDataLike = Record<string, unknown>;

/**
 * Walk a block-data object and remap every `assetId` reference from `mapping`
 * (old asset ID → new asset ID).  Handles a top-level `assetId`, an `images`
 * array of `{ assetId, … }` entries, and an `assets` array of `{ assetId, … }`
 * entries — the shapes supported by the current schema.  Mutates `data` in place
 * (it is always a fresh deep copy owned by the caller).
 */
function remapAssetRefsInBlockData(data: BlockDataLike, mapping: Map<string, string>): void {
  const remap = (value: unknown): void => {
    if (typeof value === 'string') return; // handled by callers that know the key
    if (Array.isArray(value)) {
      for (const item of value) remap(item);
      return;
    }
    if (!isPlainObject(value)) return;
    const assetId = value['assetId'];
    if (typeof assetId === 'string') {
      const mapped = mapping.get(assetId);
      if (mapped !== undefined) value['assetId'] = mapped;
    }
    for (const nested of Object.values(value)) remap(nested);
  };

  // Top-level assetId (single-asset blocks such as image).
  const topAssetId = data['assetId'];
  if (typeof topAssetId === 'string') {
    const mapped = mapping.get(topAssetId);
    if (mapped !== undefined) data['assetId'] = mapped;
  }
  // Collections that hold { assetId } entries.
  for (const key of ['images', 'assets'] as const) {
    const collection = data[key];
    if (Array.isArray(collection)) {
      for (const entry of collection) {
        if (isPlainObject(entry) && typeof entry['assetId'] === 'string') {
          const mapped = mapping.get(entry['assetId']);
          if (mapped !== undefined) entry['assetId'] = mapped;
        }
      }
    }
  }
}

/** Copy the template's asset bundle into an independent one with fresh IDs. */
function copyAssets(
  template: DocStudioTemplate,
): { assets: Record<DocUUID, AssetRecord>; mapping: Map<string, string> } {
  const assets: Record<DocUUID, AssetRecord> = {};
  const mapping = new Map<string, string>();

  for (const [oldId, record] of Object.entries(template.assets ?? {})) {
    const newId = newUUID();
    mapping.set(oldId, newId);
    assets[newId] = {
      id: newId,
      filename: record.filename,
      mimeType: record.mimeType as AssetMimeType,
      sizeBytes: record.sizeBytes,
      addedAt: record.addedAt,
      base64Data: record.base64Data,
    };
  }
  return { assets, mapping };
}

// ─────────────────────────────────────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Create a fresh, default `DocStudioDocument` (blank) at the application
 * level, applying the saved Laboratory Profile as the laboratory identity
 * snapshot (mirroring the profile part of template instantiation).
 */
export function createBlankDocument(
  profile: LabProfile,
  now: ISODateString,
): DocStudioDocument {
  const base = createDefaultDocument(newUUID(), now);
  const withProfile = applyProfileSnapshot(base, profile, undefined);
  return {
    ...withProfile,
    metadata: applyProfileToMetadata(withProfile.metadata, profile, withProfile.labProfile.name),
  };
}

/**
 * Apply laboratory-identity precedence to `metadata.organizationName` (the
 * `{organizationName}` header/footer placeholder and the Document Information
 * field):
 *   1. The saved profile's name wins whenever it is non-empty — a generic
 *      template value can never replace the user's saved identity.
 *   2. Otherwise a declared template `metadata.organizationName` stands.
 *   3. Otherwise the effective lab-profile snapshot name (template default)
 *      fills it so the identity fields stay consistent.
 * An empty profile name with no template value leaves metadata untouched.
 */
function applyProfileToMetadata(
  metadata: DocumentMetadata,
  profile: LabProfile,
  effectiveLabName: string,
): DocumentMetadata {
  const name = profile.name.trim();
  if (name !== '') return { ...metadata, organizationName: name };
  if (metadata.organizationName.trim() === '' && effectiveLabName !== '') {
    return { ...metadata, organizationName: effectiveLabName };
  }
  return metadata;
}

/**
 * Instantiate a document from `template`, merging application defaults, the
 * template's partial defaults and the saved `profile` per the precedence
 * policy above.  The template and profile are never mutated; the returned
 * document shares no mutable reference with either.
 */
export function instantiateTemplate(
  template: DocStudioTemplate,
  profile: LabProfile,
  now: ISODateString,
): DocStudioDocument {
  // 1. Application base (fresh id + timestamps, empty content/assets).
  const base = createDefaultDocument(newUUID(), now);

  // 2. Template partial defaults, deep-merged over the base.
  const defaults = template.defaults ?? {};
  const merged: DocStudioDocument = {
    ...base,
    ...(defaults.metadata !== undefined
      ? { metadata: mergeMetadata(base.metadata, defaults.metadata, now) }
      : {}),
    ...(defaults.pageSetup !== undefined
      ? { pageSetup: deepMerge(base.pageSetup, defaults.pageSetup) }
      : {}),
    ...(defaults.pageTypography !== undefined
      ? { pageTypography: deepMerge(base.pageTypography, defaults.pageTypography) }
      : {}),
    ...(defaults.frontPage !== undefined
      ? { frontPage: deepMerge(base.frontPage, defaults.frontPage) }
      : {}),
    ...(defaults.headerFooter !== undefined
      ? { headerFooter: deepMerge(base.headerFooter, defaults.headerFooter) }
      : {}),
  };

  // 3. Copy template assets (fresh IDs) and remap front-page asset references.
  const { assets, mapping } = copyAssets(template);
  merged.assets = assets;
  merged.frontPage = remapFrontPageAssets(merged.frontPage, mapping);

  // 4. Flatten + copy + remint content blocks (deep copies, fresh UUIDs).
  const flattened: ContentBlock[] = templateSectionsToBlocks(template.sections ?? []);
  merged.blocks = flattened.map((block) => remintBlock(block, mapping));

  // 5. Laboratory Profile identity snapshot (overrides template labProfile).
  merged.labProfile = buildLabProfileSnapshot(merged.labProfile, template, profile, mapping);

  // 6. Organization-name identity: saved profile name wins; a declared
  //    template metadata value stands next; otherwise the effective
  //    lab-profile snapshot name fills it (see applyProfileToMetadata).
  merged.metadata = applyProfileToMetadata(merged.metadata, profile, merged.labProfile.name);

  return merged;
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers (all pure; inputs never mutated)
// ─────────────────────────────────────────────────────────────────────────────

/** Merge template metadata defaults over the base, keeping instance fields. */
function mergeMetadata(
  base: DocumentMetadata,
  patch: Partial<Omit<DocumentMetadata, 'createdAt' | 'modifiedAt' | 'customFields'>>,
  now: ISODateString,
): DocumentMetadata {
  const merged = deepMerge(base, patch) as DocumentMetadata;
  // App-managed instance fields always win.
  merged.createdAt = now;
  merged.modifiedAt = now;
  merged.customFields = []; // user-defined fields are document-instance data
  // No controlled-looking document code is auto-assigned from a template.
  merged.documentId = '';
  return merged;
}

/** Remap front-page asset references to the copied asset IDs. */
function remapFrontPageAssets(
  frontPage: FrontPageSettings,
  mapping: Map<string, string>,
): FrontPageSettings {
  const next: FrontPageSettings = { ...frontPage };
  if (next.logoAssetId !== undefined) {
    const mapped = mapping.get(next.logoAssetId);
    if (mapped !== undefined) next.logoAssetId = mapped;
  }
  if (next.backgroundImageAssetId !== undefined) {
    const mapped = mapping.get(next.backgroundImageAssetId);
    if (mapped !== undefined) next.backgroundImageAssetId = mapped;
  }
  return next;
}

/** Deep-copy a block and remint its ID (and nested block-data asset refs). */
function remintBlock(block: ContentBlock, mapping: Map<string, string>): ContentBlock {
  const data = clone(block.data) as unknown as BlockDataLike;
  remapAssetRefsInBlockData(data, mapping);
  const copy: ContentBlock = {
    id: newUUID(),
    spacing: { topPt: block.spacing.topPt, bottomPt: block.spacing.bottomPt },
    data: data as unknown as ContentBlock['data'],
  };
  return copy;
}

/**
 * Build the embedded lab-profile snapshot: application base → template
 * labProfile defaults → saved profile identity override.  Optional fields are
 * only set when present.  The template's generic name/prefix never survives a
 * named saved profile.
 */
function buildLabProfileSnapshot(
  templateDefaultsApplied: EmbeddedLabProfile,
  template: DocStudioTemplate,
  profile: LabProfile,
  mapping: Map<string, string>,
): EmbeddedLabProfile {
  const tpl = template.defaults?.labProfile;

  // Start from the default embedded profile, overlay template values (deep).
  let name = tpl?.name !== undefined && tpl.name !== '' ? tpl.name : templateDefaultsApplied.name;
  let address = tpl?.address ?? templateDefaultsApplied.address;
  let location = tpl?.location ?? templateDefaultsApplied.location;
  let phone = tpl?.phone ?? templateDefaultsApplied.phone;
  let email = tpl?.email ?? templateDefaultsApplied.email;
  let website = tpl?.website ?? templateDefaultsApplied.website;
  let documentIdPrefix =
    tpl?.documentIdPrefix ?? templateDefaultsApplied.documentIdPrefix;
  let logoAssetId = tpl?.logoAssetId ?? templateDefaultsApplied.logoAssetId;

  // Remap any template-provided logo asset reference into the copied bundle.
  if (logoAssetId !== undefined) {
    const mapped = mapping.get(logoAssetId);
    if (mapped !== undefined) logoAssetId = mapped;
  }

  // Apply the saved profile identity (profile always wins on identity fields).
  if (profile.name.trim() !== '') name = profile.name.trim();
  if (profile.address !== undefined) address = profile.address;
  if (profile.location !== undefined) location = profile.location;
  if (profile.phone !== undefined) phone = profile.phone;
  if (profile.email !== undefined) email = profile.email;
  if (profile.website !== undefined) website = profile.website;
  if (profile.documentIdPrefix !== undefined) documentIdPrefix = profile.documentIdPrefix;
  // Logo: the profile's logoAssetId is only carried when a real (remapped or
  // supplied) asset ID exists — see the lab-profile logo limitation note.

  const snapshot: EmbeddedLabProfile = { name };
  if (address !== undefined && address !== '') snapshot.address = address;
  if (location !== undefined && location !== '') snapshot.location = location;
  if (phone !== undefined && phone !== '') snapshot.phone = phone;
  if (email !== undefined && email !== '') snapshot.email = email;
  if (website !== undefined && website !== '') snapshot.website = website;
  if (documentIdPrefix !== undefined && documentIdPrefix !== '')
    snapshot.documentIdPrefix = documentIdPrefix;
  if (logoAssetId !== undefined) snapshot.logoAssetId = logoAssetId;
  return snapshot;
}

/** Apply the saved profile as the identity snapshot on a blank document. */
function applyProfileSnapshot(
  doc: DocStudioDocument,
  profile: LabProfile,
  logoAssetId: DocUUID | undefined,
): DocStudioDocument {
  return { ...doc, labProfile: labProfileToEmbedded(profile, logoAssetId) };
}
