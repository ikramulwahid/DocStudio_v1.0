/**
 * DocStudio — Reusable local Laboratory Profile (P03-M2)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * The live Laboratory Profile is the user's reusable laboratory identity and
 * contact details (project_details.md §6 "Laboratory Profile").  It is
 * APPLICATION-LOCAL CONFIGURATION — not a server, account, organization
 * repository or document-control feature, and never part of the document
 * schema version.
 *
 * Relationship to `EmbeddedLabProfile` (document snapshot)
 * ────────────────────────────────────────────────────────
 * Each `DocStudioDocument` carries an `EmbeddedLabProfile` SNAPSHOT copied in
 * at creation time (see src/types/document.ts).  Editing THIS live profile
 * therefore never rewrites previously saved documents, and mutating a created
 * document never mutates the live profile — the two are always separate
 * objects.  The instantiation service (`src/services/template-instantiation.ts`)
 * is responsible for producing that snapshot.
 *
 * Persistence format (documented decision)
 * ─────────────────────────────────────────
 * The profile is persisted as ONE versioned JSON object under a single
 * `localStorage` key — the same offline, app-local mechanism already used for
 * the interface theme (`docstudio_ui_theme` in App.tsx).  Rationale:
 *   • The profile is small, string-only configuration; localStorage is the
 *     established preference store and needs no new Tauri filesystem
 *     capability (so no Rust/`cargo check` and no broadened scope).
 *   • Versioning (`schemaVersion`) and safe fallback live in
 *     `src/services/lab-profile.ts`, which handles missing, invalid or
 *     corrupted data by returning a clean default profile (never crashing
 *     startup).  Future migration is a version bump + a migration branch,
 *     exactly like the native formats.
 * A Tauri config/data-dir file remains a possible later evolution if the
 * profile grows (e.g. stored logo bytes) beyond what localStorage should hold.
 *
 * Logo asset limitation (P03-M2)
 * ──────────────────────────────
 * `logoAssetId` is carried for forward compatibility and is populated on a
 * created document ONLY when a source asset record exists (e.g. imported into
 * the document bundle).  Storing raw logo bytes inside this settings profile
 * is deliberately NOT done in P03-M2: it would put large binary data in a
 * small preferences store with corruption/size risk and no recovery story.
 * Durable logo selection/storage is a later asset-service checkpoint; see the
 * roadmap for the recorded limitation.
 *
 * This module is pure (no React/DOM/Tauri imports) so it is directly testable
 * in Node (see verify_p03_m2.mjs).
 *
 * @module types/lab-profile
 */

import type { DocUUID } from './document';

// ─────────────────────────────────────────────────────────────────────────────
// Versioning and storage key
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Profile storage schema version — INDEPENDENT of both
 * `DOCSTUDIO_SCHEMA_VERSION` and `DOCSTUDIO_TEMPLATE_SCHEMA_VERSION`.
 * Compatibility policy mirrors the native formats: equal opens, newer is
 * rejected (fallback to default), older is rejected until a migration branch
 * exists.
 */
export const LAB_PROFILE_SCHEMA_VERSION = 1 as const;
export type LabProfileSchemaVersion = typeof LAB_PROFILE_SCHEMA_VERSION;

/** Root signature discriminator for the persisted profile object. */
export const LAB_PROFILE_SIGNATURE = 'DocStudioLabProfile' as const;

/** localStorage key under which the versioned profile JSON is stored. */
export const LAB_PROFILE_STORAGE_KEY = 'docstudio_lab_profile';

// ─────────────────────────────────────────────────────────────────────────────
// Profile shape
// ─────────────────────────────────────────────────────────────────────────────

/**
 * The reusable local Laboratory Profile.
 *
 * Mirrors `EmbeddedLabProfile`'s fields (so a document snapshot can be derived
 * directly) but is application-local state: it has no document-instance
 * timestamps and its `logoAssetId` references a document asset bundle at
 * instantiation time, not a persistent library (see the logo limitation above).
 */
export interface LabProfile {
  /** Root signature — always `LAB_PROFILE_SIGNATURE`. */
  readonly __type: typeof LAB_PROFILE_SIGNATURE;
  /** Profile storage schema version. */
  readonly schemaVersion: LabProfileSchemaVersion;
  /** Laboratory / organization name. */
  name: string;
  /** Optional street address. */
  address?: string;
  /** Optional city/state/country. */
  location?: string;
  /** Optional contact phone number. */
  phone?: string;
  /** Optional contact email address. */
  email?: string;
  /** Optional web URL. */
  website?: string;
  /**
   * Optional laboratory logo, referenced as an asset ID.  Populated only when
   * a source asset record is supplied at document-creation time; see the logo
   * limitation in the module header.
   */
  logoAssetId?: DocUUID;
  /** Default document ID prefix / formatting convention, e.g. "LAB-SOP-". */
  documentIdPrefix?: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Factory
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Create a clean, valid empty profile (all fields blank/absent).
 * Used as the safe fallback when no profile is stored or when stored data is
 * missing/invalid/corrupted.
 */
export function createEmptyLabProfile(): LabProfile {
  return {
    __type: LAB_PROFILE_SIGNATURE,
    schemaVersion: LAB_PROFILE_SCHEMA_VERSION,
    name: '',
  };
}
