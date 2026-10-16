/**
 * DocStudio — Native `.dstemplate` template file format (template schema v1)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Format
 * ──────
 * A `.dstemplate` file is a single UTF-8 encoded, JSON-formatted template whose
 * root value is exactly one `DocStudioTemplate` object (see
 * src/types/template.ts).  Files are written pretty-printed (2-space indent)
 * so they stay human-readable and diff-able; whitespace is not semantically
 * significant.  The `.dstemplate` extension is distinct from `.docstudio`, so a
 * template can never be confused with a project file at the file-picker level
 * either.
 *
 * Signature and cross-contamination
 * ─────────────────────────────────
 * The root `__type` discriminator MUST equal `TEMPLATE_FILE_SIGNATURE`
 * (`'DocStudioTemplate'`).  A native `.docstudio` project (signature
 * `'DocStudio'`) therefore cannot be opened as a template, and a template
 * cannot be opened as a project — each validator rejects the other's signature
 * (verification item 11 in verify_p03_m1.mjs).
 *
 * Versioning policy
 * ─────────────────
 * `DOCSTUDIO_TEMPLATE_SCHEMA_VERSION` (currently 1) governs template files and
 * is INDEPENDENT of `DOCSTUDIO_SCHEMA_VERSION`:
 * • version == current  → opened directly.
 * • version >  current  → rejected (`unsupported-version`); created by a newer
 *                         DocStudio.
 * • version <  current  → rejected (`no-migration`) until a template-specific
 *                         migration module exists.  No migration framework is
 *                         built in P03-M1; this documents the behavior.
 *
 * Validation
 * ──────────
 * `deserializeTemplate` performs structural validation of every required
 * top-level field, each section, each content block, each reference hint, and
 * each embedded asset, and fails with an explicit `TemplateFileError`.
 * Serialization validates first, so an invalid template is never written.
 * Operations are non-mutating and preserve stable IDs.
 *
 * This module is pure (no React, DOM, or Tauri imports) so it is directly
 * testable in Node (see verify_p03_m1.mjs).
 *
 * @module services/template-file
 */

import {
  DOCSTUDIO_TEMPLATE_SCHEMA_VERSION,
  TEMPLATE_FILE_SIGNATURE,
  TEMPLATE_FILE_EXTENSION,
  TEMPLATE_CATEGORY_IDS,
  isBuiltinTemplateId,
  type DocStudioTemplate,
} from '../types/template';
import { BLOCK_TYPES } from '../types/blocks';

// ─────────────────────────────────────────────────────────────────────────────
// Errors
// ─────────────────────────────────────────────────────────────────────────────

export type TemplateFileErrorCode =
  | 'invalid-json' // contents are not parseable JSON
  | 'invalid-signature' // root __type is not 'DocStudioTemplate'
  | 'unsupported-version' // schemaVersion newer than this build supports
  | 'no-migration' // schemaVersion older; no migration module available
  | 'invalid-structure' // parsed JSON that is not a valid DocStudioTemplate
  | 'io-read' // filesystem read failure (reserved for a later checkpoint)
  | 'io-write'; // filesystem write failure (reserved for a later checkpoint)

/**
 * Explicit error type for every template-file failure mode.  `message` is a
 * short user-facing explanation; `detail` carries diagnostics (per-field
 * validation failures, underlying I/O error).
 */
export class TemplateFileError extends Error {
  readonly code: TemplateFileErrorCode;
  readonly detail?: string;

  constructor(code: TemplateFileErrorCode, message: string, detail?: string) {
    super(message);
    this.name = 'TemplateFileError';
    this.code = code;
    this.detail = detail;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Small validation helpers (mirror document-file.ts)
// ─────────────────────────────────────────────────────────────────────────────

type ErrList = string[];

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function requireString(obj: Record<string, unknown>, key: string, where: string, errs: ErrList): void {
  if (typeof obj[key] !== 'string') errs.push(`${where}.${key} must be a string.`);
}

function requireOptionalString(obj: Record<string, unknown>, key: string, where: string, errs: ErrList): void {
  if (obj[key] !== undefined && typeof obj[key] !== 'string') {
    errs.push(`${where}.${key} must be a string when present.`);
  }
}

function requireNumber(obj: Record<string, unknown>, key: string, where: string, errs: ErrList): void {
  if (typeof obj[key] !== 'number' || Number.isNaN(obj[key])) {
    errs.push(`${where}.${key} must be a number.`);
  }
}

function requireNonEmptyString(obj: Record<string, unknown>, key: string, where: string, errs: ErrList): void {
  if (typeof obj[key] !== 'string' || obj[key].trim() === '') {
    errs.push(`${where}.${key} must be a non-empty string.`);
  }
}

function requireArray(obj: Record<string, unknown>, key: string, where: string, errs: ErrList): unknown[] | null {
  if (!Array.isArray(obj[key])) {
    errs.push(`${where}.${key} must be an array.`);
    return null;
  }
  return obj[key] as unknown[];
}

function requireRecord(obj: Record<string, unknown>, key: string, where: string, errs: ErrList): Record<string, unknown> | null {
  if (!isRecord(obj[key])) {
    errs.push(`${where}.${key} must be an object.`);
    return null;
  }
  return obj[key] as Record<string, unknown>;
}

// ─────────────────────────────────────────────────────────────────────────────
// Structural validation
// ─────────────────────────────────────────────────────────────────────────────

/** Content-block envelope check (reuses the document `ContentBlock` shape). */
function validateBlockEnvelope(block: unknown, where: string, errs: ErrList): void {
  if (!isRecord(block)) {
    errs.push(`${where} must be an object.`);
    return;
  }
  requireNonEmptyString(block, 'id', where, errs);
  const spacing = requireRecord(block, 'spacing', where, errs);
  if (spacing) {
    requireNumber(spacing, 'topPt', `${where}.spacing`, errs);
    requireNumber(spacing, 'bottomPt', `${where}.spacing`, errs);
  }
  const data = requireRecord(block, 'data', where, errs);
  if (data) {
    const type = data['type'];
    if (typeof type !== 'string' || !(BLOCK_TYPES as readonly string[]).includes(type)) {
      errs.push(`${where}.data.type "${String(type)}" is not a supported block type.`);
    }
  }
}

/** Reference-hint envelope check. */
function validateReferenceHint(hint: unknown, where: string, errs: ErrList): void {
  if (!isRecord(hint)) {
    errs.push(`${where} must be an object.`);
    return;
  }
  requireNonEmptyString(hint, 'id', where, errs);
  requireNonEmptyString(hint, 'label', where, errs);
  requireOptionalString(hint, 'value', where, errs);
  requireOptionalString(hint, 'clause', where, errs);
}

/** Section envelope check. */
function validateSection(section: unknown, where: string, errs: ErrList): void {
  if (!isRecord(section)) {
    errs.push(`${where} must be an object.`);
    return;
  }
  requireNonEmptyString(section, 'id', where, errs);
  requireNonEmptyString(section, 'name', where, errs);
  requireOptionalString(section, 'description', where, errs);
  requireOptionalString(section, 'prompt', where, errs);
  const level = section['headingLevel'];
  if (typeof level !== 'number' || !Number.isInteger(level) || level < 1 || level > 4) {
    errs.push(`${where}.headingLevel must be an integer between 1 and 4.`);
  }
  const blocks = requireArray(section, 'blocks', where, errs);
  if (blocks) blocks.forEach((b, i) => validateBlockEnvelope(b, `${where}.blocks[${i}]`, errs));
  const refs = section['references'];
  if (refs !== undefined) {
    if (!Array.isArray(refs)) {
      errs.push(`${where}.references must be an array when present.`);
    } else {
      refs.forEach((r, i) => validateReferenceHint(r, `${where}.references[${i}]`, errs));
    }
  }
}

/** Asset envelope check (reuses the document `AssetRecord` shape). */
function validateAsset(asset: unknown, key: string, where: string, errs: ErrList): void {
  if (!isRecord(asset)) {
    errs.push(`${where} must be an object.`);
    return;
  }
  requireString(asset, 'id', where, errs);
  requireString(asset, 'filename', where, errs);
  requireString(asset, 'mimeType', where, errs);
  requireNumber(asset, 'sizeBytes', where, errs);
  requireString(asset, 'addedAt', where, errs);
  requireString(asset, 'base64Data', where, errs);
  if (typeof asset['id'] === 'string' && asset['id'] !== key) {
    errs.push(`${where}: key does not match the asset's id.`);
  }
}

/**
 * Collect every structural validation failure for a candidate template.
 * Returns an empty array when the value is a structurally valid
 * DocStudioTemplate (signature/version policy aside — see validateTemplate).
 */
function collectValidationErrors(data: Record<string, unknown>): ErrList {
  const errs: ErrList = [];

  // ── Identity and catalog metadata ────────────────────────────────────────
  requireNonEmptyString(data, 'id', 'template', errs);
  const origin = data['origin'];
  if (origin !== 'builtin' && origin !== 'user') {
    errs.push('template.origin must be "builtin" or "user".');
  }
  requireNonEmptyString(data, 'name', 'template', errs);
  requireString(data, 'description', 'template', errs);
  const category = data['category'];
  if (typeof category !== 'string' || !(TEMPLATE_CATEGORY_IDS as readonly string[]).includes(category)) {
    errs.push(`template.category "${String(category)}" is not a supported category.`);
  }
  const tags = requireArray(data, 'tags', 'template', errs);
  if (tags) {
    tags.forEach((t, i) => {
      if (typeof t !== 'string') errs.push(`template.tags[${i}] must be a string.`);
    });
  }
  requireOptionalString(data, 'author', 'template', errs);
  requireString(data, 'createdAt', 'template', errs);
  requireString(data, 'updatedAt', 'template', errs);

  // Built-in IDs use the reserved `builtin.` prefix; user IDs must not.
  if (typeof data['id'] === 'string') {
    const id = data['id'];
    if (origin === 'builtin' && !isBuiltinTemplateId(id)) {
      errs.push(`template.id "${id}" must start with "builtin." for a built-in template.`);
    }
    if (origin === 'user' && isBuiltinTemplateId(id)) {
      errs.push(`template.id "${id}" uses the reserved "builtin." prefix but origin is "user".`);
    }
  }

  // ── Document defaults (optional, structurally checked shallowly) ─────────
  const defaults = data['defaults'];
  if (defaults !== undefined) {
    if (!isRecord(defaults)) {
      errs.push('template.defaults must be an object when present.');
    } else {
      // Each sub-object is optional; when present it must be an object.
      for (const key of ['metadata', 'labProfile', 'pageSetup', 'pageTypography', 'frontPage', 'headerFooter']) {
        if (defaults[key] !== undefined && !isRecord(defaults[key])) {
          errs.push(`template.defaults.${key} must be an object when present.`);
        }
      }
    }
  }

  // ── Sections ─────────────────────────────────────────────────────────────
  const sections = requireArray(data, 'sections', 'template', errs);
  if (sections) sections.forEach((s, i) => validateSection(s, `template.sections[${i}]`, errs));

  // ── Assets ───────────────────────────────────────────────────────────────
  const assets = requireRecord(data, 'assets', 'template', errs);
  if (assets) {
    for (const [key, asset] of Object.entries(assets)) {
      validateAsset(asset, key, `template.assets["${key}"]`, errs);
    }
  }

  return errs;
}

/**
 * Validate an unknown value as a DocStudioTemplate (template schema v1).
 * Throws TemplateFileError with specific codes for signature/version-policy
 * failures and 'invalid-structure' (with per-field detail) for everything else.
 */
export function validateTemplate(value: unknown): asserts value is DocStudioTemplate {
  if (!isRecord(value)) {
    throw new TemplateFileError(
      'invalid-structure',
      'This file is not a DocStudio template and cannot be opened.',
      'The template root must be a JSON object.',
    );
  }

  if (value['__type'] !== TEMPLATE_FILE_SIGNATURE) {
    throw new TemplateFileError(
      'invalid-signature',
      'This file is not a DocStudio template and cannot be opened.',
      `The template signature (__type) must be "${TEMPLATE_FILE_SIGNATURE}", found ${JSON.stringify(value['__type'] ?? null)}.`,
    );
  }

  const version = value['schemaVersion'];
  if (typeof version !== 'number' || !Number.isInteger(version) || version < 1) {
    throw new TemplateFileError(
      'invalid-structure',
      'This file is not a valid DocStudio template and cannot be opened.',
      'The schemaVersion field must be a positive integer.',
    );
  }
  if (version > DOCSTUDIO_TEMPLATE_SCHEMA_VERSION) {
    throw new TemplateFileError(
      'unsupported-version',
      `This template was created with a newer version of DocStudio (template schema v${version}) and cannot be opened safely. Please update DocStudio.`,
      `This build supports template schema v${DOCSTUDIO_TEMPLATE_SCHEMA_VERSION}.`,
    );
  }
  if (version < DOCSTUDIO_TEMPLATE_SCHEMA_VERSION) {
    throw new TemplateFileError(
      'no-migration',
      `This template uses an older template schema (v${version}) that this build cannot migrate.`,
      `This build supports template schema v${DOCSTUDIO_TEMPLATE_SCHEMA_VERSION}. No migration module is available yet.`,
    );
  }

  const errs = collectValidationErrors(value);
  if (errs.length > 0) {
    throw new TemplateFileError(
      'invalid-structure',
      'This template file is incomplete or malformed and cannot be opened.',
      errs.join(' '),
    );
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Serialization / deserialization
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Serialize a template to `.dstemplate` file text (pretty-printed JSON).
 * The template is validated first so an invalid template can never be written.
 * Serialization is deterministic: an unchanged template always yields the same
 * bytes (key order is stable because the factory builds objects in a fixed
 * order and JSON.stringify preserves it).
 */
export function serializeTemplate(template: DocStudioTemplate): string {
  validateTemplate(template);
  try {
    return JSON.stringify(template, null, 2);
  } catch (e) {
    throw new TemplateFileError(
      'invalid-structure',
      'The template contains data that cannot be saved to a template file.',
      e instanceof Error ? e.message : String(e),
    );
  }
}

/**
 * Parse and validate `.dstemplate` file text.
 * Throws TemplateFileError for invalid JSON, a non-template signature,
 * unsupported/older schema versions, or incomplete/invalid template
 * structures.  Never returns a partially validated or cast value, and never
 * mutates the parsed input.
 */
export function deserializeTemplate(json: string): DocStudioTemplate {
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch (e) {
    throw new TemplateFileError(
      'invalid-json',
      'The selected file is not a valid DocStudio template (its contents are not readable JSON).',
      e instanceof Error ? e.message : String(e),
    );
  }
  validateTemplate(parsed);
  return parsed;
}

// ─────────────────────────────────────────────────────────────────────────────
// Filename helper
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Build a sensible default `.dstemplate` filename from a template name,
 * stripping characters that are illegal in Windows filenames.
 */
export function defaultTemplateFileName(name: string): string {
  const safe =
    name
      .trim()
      .replace(/[\\/:*?"<>|]/g, '-')
      .replace(/\s+/g, ' ')
      .slice(0, 120)
      .trim() || 'Untitled Template';
  return `${safe}${TEMPLATE_FILE_EXTENSION}`;
}
