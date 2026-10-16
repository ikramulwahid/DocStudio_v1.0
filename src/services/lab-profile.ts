/**
 * DocStudio — Laboratory Profile parse/validate/normalize service (P03-M2)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Pure helpers for turning raw persisted text into a valid `LabProfile` and
 * back.  Storage I/O lives in `lab-profile-store.ts` (which touches
 * `localStorage`); THIS module is React/DOM/Tauri-free so every rule below is
 * directly testable in Node (see verify_p03_m2.mjs).
 *
 * Responsibilities
 * ────────────────
 * • `normalizeLabProfile(input)` — sanitize a candidate profile object into a
 *   valid `LabProfile`: coerce types, trim strings, DROP empty optional
 *   values (so an untouched optional field stays `undefined`, never `''`),
 *   strip unknown keys, and stamp the current signature/version.
 * • `parseLabProfileJson(text)` — parse persisted JSON text into a normalized
 *   profile, returning `null` for anything unusable (malformed JSON, wrong
 *   signature, unsupported version).  Callers fall back to the empty default;
 *   a corrupted profile must never prevent startup.
 * • `serializeLabProfile(profile)` — deterministic, validated JSON output.
 * • `validateLabProfileInput(draft)` — field-level validation used by the
 *   profile editor UI (email/website shape, required name), returning
 *   per-field messages the panel can render.
 * • `labProfileToEmbedded(profile, logoAssetId?)` — produce the independent
 *   `EmbeddedLabProfile` snapshot copied into a new document, resolving the
 *   logo asset ID at call time (and dropping it when no asset is supplied).
 *
 * @module services/lab-profile
 */

import type { EmbeddedLabProfile } from '../types/document';
import type { DocUUID } from '../types/document';
import {
  LAB_PROFILE_SIGNATURE,
  LAB_PROFILE_SCHEMA_VERSION,
  createEmptyLabProfile,
  type LabProfile,
} from '../types/lab-profile';

// ─────────────────────────────────────────────────────────────────────────────
// Normalization
// ─────────────────────────────────────────────────────────────────────────────

/** Trimmed string, or `undefined` when blank/absent (keeps optionals clean). */
function optionalTrimmed(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed === '' ? undefined : trimmed;
}

/**
 * Coerce `input` into a valid `LabProfile`.  Never throws; unknown keys are
 * dropped and every optional field is `undefined` when blank/absent/invalid.
 * The returned object always carries the current signature and version.
 */
export function normalizeLabProfile(input: unknown): LabProfile {
  const profile = createEmptyLabProfile();
  if (typeof input !== 'object' || input === null) return profile;
  const raw = input as Record<string, unknown>;

  if (typeof raw['name'] === 'string') profile.name = raw['name'].trim();

  const address = optionalTrimmed(raw['address']);
  if (address !== undefined) profile.address = address;
  const location = optionalTrimmed(raw['location']);
  if (location !== undefined) profile.location = location;
  const phone = optionalTrimmed(raw['phone']);
  if (phone !== undefined) profile.phone = phone;
  const email = optionalTrimmed(raw['email']);
  if (email !== undefined) profile.email = email;
  const website = optionalTrimmed(raw['website']);
  if (website !== undefined) profile.website = website;
  const prefix = optionalTrimmed(raw['documentIdPrefix']);
  if (prefix !== undefined) profile.documentIdPrefix = prefix;
  // Logo asset ID: only carry a non-empty string; it must resolve against a
  // document asset bundle at instantiation (see module header).
  const logo = optionalTrimmed(raw['logoAssetId']);
  if (logo !== undefined) profile.logoAssetId = logo as DocUUID;

  return profile;
}

// ─────────────────────────────────────────────────────────────────────────────
// Parse / serialize
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Parse persisted profile JSON text into a normalized `LabProfile`.
 * Returns `null` — never throws — when the text is unusable (malformed JSON,
 * not an object, wrong signature, or an unsupported schema version), so the
 * caller can fall back to the empty default and keep starting.
 */
export function parseLabProfileJson(text: string | null | undefined): LabProfile | null {
  if (typeof text !== 'string' || text.trim() === '') return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return null; // malformed JSON
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return null;

  const raw = parsed as Record<string, unknown>;
  // Signature: a wrong/absent signature means this is not a profile object.
  if (raw['__type'] !== LAB_PROFILE_SIGNATURE) return null;
  // Version policy: equal opens; anything else falls back (no migration yet).
  if (raw['schemaVersion'] !== LAB_PROFILE_SCHEMA_VERSION) return null;

  return normalizeLabProfile(raw);
}

/**
 * Serialize a profile to deterministic, validated JSON text (pretty-printed,
 * matching the native-format convention).  The input is normalized first so a
 * malformed profile can never be written.
 */
export function serializeLabProfile(profile: LabProfile): string {
  return JSON.stringify(normalizeLabProfile(profile), null, 2);
}

// ─────────────────────────────────────────────────────────────────────────────
// Editor validation
// ─────────────────────────────────────────────────────────────────────────────

/** Per-field validation message keyed by the offending field, if any. */
export type LabProfileValidation = Partial<Record<keyof LabProfile, string>>;

/** Loose email shape check (no dependency; pragmatic, not RFC-perfect). */
export function isValidEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

/**
 * Loose website/URL check: accepts "example.com" or a full
 * "https://example.com" URL (the store normalizes to a bare host for storage).
 */
export function isValidWebsite(value: string): boolean {
  const candidate = value.trim();
  if (candidate === '') return false;
  try {
    // Prefix a scheme so the URL parser accepts bare hosts.
    const url = new URL(candidate.includes('://') ? candidate : `https://${candidate}`);
    return url.hostname.includes('.');
  } catch {
    return false;
  }
}

/**
 * Validate a profile draft for the editor UI.  Returns an empty object when
 * the draft is acceptable.  Only optional fields that ARE present are checked;
 * the required `name` may be empty (a profile can start blank).
 */
export function validateLabProfileInput(draft: Partial<LabProfile>): LabProfileValidation {
  const errors: LabProfileValidation = {};
  if (draft.email !== undefined && draft.email.trim() !== '' && !isValidEmail(draft.email)) {
    errors.email = 'Enter a valid email address, or leave it blank.';
  }
  if (draft.website !== undefined && draft.website.trim() !== '' && !isValidWebsite(draft.website)) {
    errors.website = 'Enter a valid website (e.g. example.com), or leave it blank.';
  }
  return errors;
}

// ─────────────────────────────────────────────────────────────────────────────
// Document snapshot
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Produce the independent `EmbeddedLabProfile` snapshot copied into a new
 * document.  Optional fields are only set when present, and `logoAssetId` is
 * only carried when a real asset ID is supplied (so a document never points at
 * a dangling logo).  The result shares no references with `profile`.
 */
export function labProfileToEmbedded(profile: LabProfile, logoAssetId?: DocUUID): EmbeddedLabProfile {
  const source = normalizeLabProfile(profile);
  const embedded: EmbeddedLabProfile = { name: source.name };
  if (source.address !== undefined) embedded.address = source.address;
  if (source.location !== undefined) embedded.location = source.location;
  if (source.phone !== undefined) embedded.phone = source.phone;
  if (source.email !== undefined) embedded.email = source.email;
  if (source.website !== undefined) embedded.website = source.website;
  if (source.documentIdPrefix !== undefined) embedded.documentIdPrefix = source.documentIdPrefix;
  if (logoAssetId !== undefined) embedded.logoAssetId = logoAssetId;
  return embedded;
}
