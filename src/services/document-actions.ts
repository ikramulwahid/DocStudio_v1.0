/**
 * DocStudio — Document lifecycle actions (P02-M3)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Pure, non-mutating document transformations plus the centralized
 * session-status / unsaved-change helpers.  Every function returns a NEW
 * document object; inputs are never mutated (arrays/objects are rebuilt,
 * not reused).
 *
 * This module is free of React/Tauri/DOM imports so the transformation
 * rules are directly testable (see verify_p02_m3.mjs).  The App wires these
 * functions to the UI; the rules themselves live here.
 *
 * Lifecycle policies (documented decisions)
 * ──────────────────────────────────────────
 * • Timestamps: `createdAt` NEVER changes after creation. `modifiedAt` is
 *   stamped by every content/settings change (clear, reset, future edits)
 *   AND by a successful save (project_details.md §6 policy: "when the
 *   document content or settings change or the file is saved").
 * • Duplicate: the copy gets a fresh root UUID, fresh timestamps, a
 *   " (Copy)" title suffix, and a BLANKED formal `documentId` — a
 *   duplicated project must never silently carry a second copy of a
 *   controlled-looking document code. Block IDs are preserved inside the
 *   copy (identity is document-scoped per the current schema).
 * • Clear: removes content blocks only. Identity, metadata, lab profile,
 *   page/typography/front-page/header-footer/watermark settings,
 *   `savedRevisions` and `trackChangesEnabled` are preserved. Asset
 *   records no longer referenced by any RETAINED structure are dropped;
 *   assets referenced by front-page or lab-profile settings are kept.
 * • Reset: restores page setup, page typography, front-page and
 *   header/footer/watermark settings from the default factories (fresh
 *   nested objects and IDs). Content, metadata, lab profile and assets are
 *   preserved.
 * • Session status: derived by comparing a fingerprint of the active
 *   document against the last successfully saved/opened baseline — NOT
 *   from the presence of a file path. A duplicate starts with an empty
 *   baseline so it is immediately dirty (protected from silent loss).
 * • Metadata edits (P02-M5): `updateDocumentMetadata` applies a partial
 *   patch to the AUTHORITATIVE `document.metadata` — there is no second
 *   metadata object anywhere. The app-managed timestamps (`createdAt`,
 *   `modifiedAt`) are stripped from any patch; when every provided value
 *   already equals the stored one the document is returned UNCHANGED
 *   (same reference → no re-render, no dirty state, no timestamp churn),
 *   and a real change stamps `modifiedAt` (project_details.md §6 policy:
 *   modified updates when document settings change or the file is saved).
 *
 * @module services/document-actions
 */

import type { DocStudioDocument, DocumentMetadata } from '../types/document';
import type { DocumentSessionStatus } from '../types';
import {
  createDefaultDocument,
  createDefaultPageSetup,
  createDefaultPageTypography,
  createDefaultFrontPage,
  createDefaultHeaderFooter,
  newUUID,
  nowISO,
} from '../types/defaults';

// ─────────────────────────────────────────────────────────────────────────────
// New
// ─────────────────────────────────────────────────────────────────────────────

/** Create a brand-new default document with a fresh UUID and timestamps. */
export function createNewDocument(now: string = nowISO()): DocStudioDocument {
  return createDefaultDocument(newUUID(), now);
}

// ─────────────────────────────────────────────────────────────────────────────
// Duplicate
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Create an independently editable copy of `source`.
 *
 * The copy is a full deep copy (JSON round-trip mirrors the `.docstudio`
 * serialization semantics), so mutating the copy can never affect the
 * source.  It receives a fresh root UUID and fresh timestamps; block IDs
 * and asset records are preserved within the copy; the formal
 * `metadata.documentId` is blanked and the title gets a " (Copy)" suffix
 * (see the module header for the rationale).
 */
export function duplicateDocument(source: DocStudioDocument, now: string = nowISO()): DocStudioDocument {
  const copy: DocStudioDocument = JSON.parse(JSON.stringify(source));
  return {
    ...copy,
    id: newUUID(),
    metadata: {
      ...copy.metadata,
      title: `${copy.metadata.title} (Copy)`,
      documentId: '',
      createdAt: now,
      modifiedAt: now,
    },
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Clear contents
// ─────────────────────────────────────────────────────────────────────────────

/** Asset IDs referenced by structures that survive a contents clear. */
function retainedAssetIds(doc: DocStudioDocument): Set<string> {
  const ids = new Set<string>();
  if (doc.frontPage.logoAssetId) ids.add(doc.frontPage.logoAssetId);
  if (doc.frontPage.backgroundImageAssetId) ids.add(doc.frontPage.backgroundImageAssetId);
  if (doc.labProfile.logoAssetId) ids.add(doc.labProfile.logoAssetId);
  return ids;
}

/**
 * Remove all content blocks while preserving identity, metadata, the lab
 * profile, every settings section, saved revisions and change-tracking
 * state.  Asset records still referenced by retained structures are kept;
 * assets referenced only by the removed blocks are dropped.
 */
export function clearDocumentContents(source: DocStudioDocument, now: string = nowISO()): DocStudioDocument {
  const keep = retainedAssetIds(source);
  const assets: DocStudioDocument['assets'] = {};
  for (const [id, record] of Object.entries(source.assets)) {
    if (keep.has(id)) assets[id] = record;
  }
  return {
    ...source,
    metadata: { ...source.metadata, modifiedAt: now },
    blocks: [],
    assets,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Reset settings
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Restore layout/design settings to factory defaults WITHOUT touching
 * content, metadata, the lab profile or assets.  Fresh nested objects (and
 * fresh header/footer cell IDs) are generated by the default factories.
 */
export function resetDocumentSettings(source: DocStudioDocument, now: string = nowISO()): DocStudioDocument {
  return {
    ...source,
    metadata: { ...source.metadata, modifiedAt: now },
    pageSetup: createDefaultPageSetup(),
    pageTypography: createDefaultPageTypography(),
    frontPage: createDefaultFrontPage(),
    headerFooter: createDefaultHeaderFooter(),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Timestamps
// ─────────────────────────────────────────────────────────────────────────────

/** Return a copy of `doc` with `metadata.modifiedAt` set to `now` (createdAt untouched). */
export function stampModifiedAt(doc: DocStudioDocument, now: string = nowISO()): DocStudioDocument {
  return { ...doc, metadata: { ...doc.metadata, modifiedAt: now } };
}

// ─────────────────────────────────────────────────────────────────────────────
// Metadata editing (P02-M5)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Apply a partial metadata patch to the authoritative document (P02-M5).
 *
 * Rules:
 * • `createdAt` / `modifiedAt` are app-managed and stripped from the patch —
 *   ordinary editing can never rewrite the creation timestamp, and the
 *   modification timestamp is owned by this function (or `stampModifiedAt`
 *   on save), never by the panel.
 * • Each provided key is compared against the stored value (arrays such as
 *   `customFields` compared structurally). Keys that did not actually
 *   change are not written, so an unrelated or redundant input event cannot
 *   touch any other field.
 * • If NOTHING differs, the source document is returned as the SAME
 *   reference: React bails out of the state update, so a no-op edit cannot
 *   create a false `Modified` status or advance `modifiedAt`.
 * • On a real change, a new document object is returned with only the
 *   patched keys (plus `modifiedAt = now`) changed; every other metadata
 *   field, setting, block and asset is preserved.
 *
 * @param source Active document (never mutated).
 * @param patch  Partial metadata from the panel (already field-normalized).
 * @param now    ISO timestamp stamped as `modifiedAt` on a real change.
 */
export function updateDocumentMetadata(
  source: DocStudioDocument,
  patch: Partial<DocumentMetadata>,
  now: string = nowISO(),
): DocStudioDocument {
  const { createdAt: _createdAt, modifiedAt: _modifiedAt, ...fields } = patch;
  const current = source.metadata;

  const changed: Record<string, unknown> = {};
  let hasChanges = false;
  for (const key of Object.keys(fields) as (keyof typeof fields)[]) {
    const incoming = fields[key];
    const existing = current[key];
    // JSON compare: handles strings, undefined vs missing, and arrays
    // (customFields) structurally; null normalizes undefined for equality.
    if (JSON.stringify(incoming ?? null) === JSON.stringify(existing ?? null)) continue;
    changed[key] = incoming;
    hasChanges = true;
  }

  if (!hasChanges) return source; // same reference → no state change at all

  return {
    ...source,
    metadata: { ...current, ...changed, modifiedAt: now },
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Session status / unsaved-change detection
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Canonical comparison fingerprint of a document's full serializable state.
 * Used against the last saved/opened baseline to detect unsaved changes.
 */
export function sessionFingerprint(doc: DocStudioDocument): string {
  return JSON.stringify(doc);
}

/** True when the active document differs from the saved baseline. */
export function isDirty(fingerprint: string, baselineFingerprint: string): boolean {
  return fingerprint !== baselineFingerprint;
}

/**
 * Derive the topbar session status from real state, never from the file
 * path alone: differing from the baseline is always `Modified`; matching
 * the baseline is `Saved` when a file is associated, otherwise `New`
 * (a genuinely untouched new document).
 */
export function deriveSessionStatus(
  fingerprint: string,
  baselineFingerprint: string,
  hasActivePath: boolean,
): DocumentSessionStatus {
  if (fingerprint !== baselineFingerprint) return 'Modified';
  return hasActivePath ? 'Saved' : 'New';
}

// ─────────────────────────────────────────────────────────────────────────────
// Unsaved-change guard
// ─────────────────────────────────────────────────────────────────────────────

export type UnsavedChoice = 'save' | 'discard' | 'cancel';

/**
 * Resolve whether a document-replacing action may proceed.
 *
 * • Not dirty → proceed without prompting.
 * • Dirty → `ask()` presents Save / Discard / Cancel:
 *   - 'discard' → proceed.
 *   - 'cancel'  → abort (caller leaves the session untouched).
 *   - 'save'    → `save()` runs; proceed ONLY if it reports success,
 *                 otherwise abort (a cancelled or failed save must never
 *                 let the original action destroy work).
 */
export async function resolveUnsavedChanges(
  dirty: boolean,
  ask: () => Promise<UnsavedChoice>,
  save: () => Promise<boolean>,
): Promise<'proceed' | 'abort'> {
  if (!dirty) return 'proceed';
  const choice = await ask();
  if (choice === 'discard') return 'proceed';
  if (choice === 'cancel') return 'abort';
  return (await save()) ? 'proceed' : 'abort';
}
