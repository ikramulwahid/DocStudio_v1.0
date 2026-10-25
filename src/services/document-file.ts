/**
 * DocStudio — Native `.docstudio` project file format (schema v1)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Format
 * ──────
 * A `.docstudio` project file is a single UTF-8 encoded, JSON-formatted
 * document whose root value is exactly one `DocStudioDocument` object
 * (see src/types/document.ts).  Files are written pretty-printed (2-space
 * indent) so they remain human-readable and diff-able; whitespace is not
 * semantically significant.
 *
 * Compatibility policy
 * ────────────────────
 * The `schemaVersion` field (currently `DOCSTUDIO_SCHEMA_VERSION === 1`)
 * governs compatibility:
 * • Version == current  → opened directly.
 * • Version >  current  → rejected; the file was created by a newer
 *                         DocStudio and cannot be opened safely.
 * • Version <  current  → rejected until a migration module exists
 *                         (src/types/schema-migration.ts, created when the
 *                         first breaking schema change lands).
 *
 * Preservation guarantees (v1)
 * ───────────────────────────
 * Serialization writes the complete document object, so document identity,
 * metadata, the laboratory-profile snapshot, page setup and typography,
 * front-page settings, header/footer/watermark configuration, ordered
 * content blocks (with stable IDs and spacing), embedded asset records
 * (base64 payloads), saved revisions, change-tracking state and the
 * tracked-change event log (`changeEvents`, P07-M2 additive-optional
 * field — absent in pre-P07-M2 files, treated as an empty log) all
 * survive a save → open round-trip byte-for-byte.
 *
 * Validation
 * ──────────
 * Opening a project never blindly casts parsed JSON to `DocStudioDocument`.
 * `deserializeDocument` performs structural validation of every required
 * top-level section and of each block/asset envelope, and fails with an
 * explicit, user-readable `DocumentFileError`.  Unknown fields are never
 * silently stripped, and invalid/unsupported files are rejected whole.
 *
 * Saved-snapshot entries (`savedRevisions`, P07-M3) are validated at the
 * ENVELOPE level on load — object shape, string `id`/`label`/`savedAt`
 * (plus optional string `summary`/`reason`) and a `snapshotJson` that
 * parses as JSON — with per-index messages in the established style.  The
 * embedded payload's full document structure is validated at INSPECTION
 * and RESTORE through the real `validateDocument` service
 * (src/services/snapshots.ts), so a parseable-but-damaged snapshot is
 * reported precisely at point of use instead of making the whole project
 * unopenable.  Load cost therefore stays linear in total payload bytes.
 *
 * This module is intentionally free of Tauri/React/DOM imports so it can be
 * exercised by deterministic Node-based checks (see verify_p02_m2.mjs).
 *
 * @module services/document-file
 */

import {
  DOCSTUDIO_SCHEMA_VERSION,
  type DocStudioDocument,
} from '../types/document';
import { BLOCK_TYPES } from '../types/blocks';
// P07-M2: persisted tracked-change events are validated with the AUTHORITATIVE
// P07-M1 model validator — loaded history is never blindly trusted.
import { validateChangeEvent } from './change-events';

// ─────────────────────────────────────────────────────────────────────────────
// Errors
// ─────────────────────────────────────────────────────────────────────────────

export type DocumentFileErrorCode =
  | 'invalid-json' // file contents are not parseable JSON
  | 'unsupported-version' // schemaVersion newer than this build supports
  | 'no-migration' // schemaVersion older; no migration module available
  | 'invalid-structure' // parsed JSON that is not a valid DocStudioDocument
  | 'io-read' // filesystem read failure (permission, missing file, ...)
  | 'io-read-image' // cover image pick/read failure (P04-M4)
  | 'io-write'; // filesystem write failure (permission, disk, ...)

/**
 * Explicit error type for every project-file failure mode.
 * `message` is a short, user-facing explanation; `detail` carries
 * diagnostics (per-field validation failures, underlying I/O error).
 */
export class DocumentFileError extends Error {
  readonly code: DocumentFileErrorCode;
  readonly detail?: string;

  constructor(code: DocumentFileErrorCode, message: string, detail?: string) {
    super(message);
    this.name = 'DocumentFileError';
    this.code = code;
    this.detail = detail;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Small runtime-type helpers
// ─────────────────────────────────────────────────────────────────────────────

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

type ErrList = string[];

function requireString(obj: Record<string, unknown>, key: string, where: string, errs: ErrList): void {
  if (typeof obj[key] !== 'string') errs.push(`${where}.${key} must be a string.`);
}

function requireNumber(obj: Record<string, unknown>, key: string, where: string, errs: ErrList): void {
  if (typeof obj[key] !== 'number' || !Number.isFinite(obj[key])) {
    errs.push(`${where}.${key} must be a finite number.`);
  }
}

function requireBoolean(obj: Record<string, unknown>, key: string, where: string, errs: ErrList): void {
  if (typeof obj[key] !== 'boolean') errs.push(`${where}.${key} must be a boolean.`);
}

function requireRecord(obj: Record<string, unknown>, key: string, where: string, errs: ErrList): Record<string, unknown> | null {
  if (!isRecord(obj[key])) {
    errs.push(`${where}.${key} must be an object.`);
    return null;
  }
  return obj[key] as Record<string, unknown>;
}

function requireArray(obj: Record<string, unknown>, key: string, where: string, errs: ErrList): unknown[] | null {
  if (!Array.isArray(obj[key])) {
    errs.push(`${where}.${key} must be an array.`);
    return null;
  }
  return obj[key] as unknown[];
}

// ─────────────────────────────────────────────────────────────────────────────
// Structural validation
// ─────────────────────────────────────────────────────────────────────────────

/** Header/footer cell envelope check. */
function validateHeaderFooterCell(cell: unknown, where: string, errs: ErrList): void {
  if (!isRecord(cell)) {
    errs.push(`${where} must be an object.`);
    return;
  }
  requireString(cell, 'id', where, errs);
  requireString(cell, 'content', where, errs);
  requireString(cell, 'hAlign', where, errs);
  requireString(cell, 'vAlign', where, errs);
  requireNumber(cell, 'colSpan', where, errs);
}

/** Header/footer band envelope check. */
function validateHeaderFooterBand(band: Record<string, unknown>, where: string, errs: ErrList): void {
  requireBoolean(band, 'enabled', where, errs);
  requireNumber(band, 'columnCount', where, errs);
  requireString(band, 'pageNumberFormat', where, errs);
  requireBoolean(band, 'suppressOnFirstPage', where, errs);
  const rows = requireArray(band, 'rows', where, errs);
  if (rows) {
    rows.forEach((row, r) => {
      const rowWhere = `${where}.rows[${r}]`;
      if (!isRecord(row)) {
        errs.push(`${rowWhere} must be an object.`);
        return;
      }
      requireString(row, 'id', rowWhere, errs);
      const cells = requireArray(row, 'cells', rowWhere, errs);
      if (cells) cells.forEach((cell, c) => validateHeaderFooterCell(cell, `${rowWhere}.cells[${c}]`, errs));
    });
  }
}

/**
 * Collect every structural validation failure for a candidate document.
 * Returns an empty array when the value is a valid DocStudioDocument
 * (schema version policy aside — see validateDocument).
 */
function collectValidationErrors(data: Record<string, unknown>): ErrList {
  const errs: ErrList = [];

  // ── Envelope ──────────────────────────────────────────────────────────────
  requireString(data, 'id', 'document', errs);
  requireBoolean(data, 'trackChangesEnabled', 'document', errs);

  // ── Saved revision snapshots (P07-M3, envelope validation at load) ────────
  // `savedRevisions` has been a required array since schema v1 (P02-M1);
  // each entry's ENVELOPE is now checked here: object shape, string id /
  // label / savedAt, optional string summary / reason, and a snapshotJson
  // that parses as JSON.  Per-index messages mirror the changeEvents style.
  // Full embedded-document validation runs at inspection/restore (see the
  // module header and src/services/snapshots.ts) — never at load.
  const savedRevisions = requireArray(data, 'savedRevisions', 'document', errs);
  if (savedRevisions) {
    savedRevisions.forEach((candidate, i) => {
      const where = `savedRevisions[${i}]`;
      if (!isRecord(candidate)) {
        errs.push(`${where} must be an object.`);
        return;
      }
      requireString(candidate, 'id', where, errs);
      requireString(candidate, 'label', where, errs);
      requireString(candidate, 'savedAt', where, errs);
      if (candidate['summary'] !== undefined && typeof candidate['summary'] !== 'string') {
        errs.push(`${where}.summary must be a string when present.`);
      }
      if (candidate['reason'] !== undefined && typeof candidate['reason'] !== 'string') {
        errs.push(`${where}.reason must be a string when present.`);
      }
      const snapshotJson = candidate['snapshotJson'];
      if (typeof snapshotJson !== 'string') {
        errs.push(`${where}.snapshotJson must be a string.`);
        return;
      }
      try {
        JSON.parse(snapshotJson);
      } catch (e) {
        errs.push(
          `${where}.snapshotJson is not valid JSON: ${e instanceof Error ? e.message : String(e)}`,
        );
      }
    });
  }

  // ── Tracked-change event log (P07-M2, additive-optional) ──────────────────
  // An ABSENT key is the pre-P07-M2 state and means an empty log (old files
  // open unchanged).  When present, every element is validated with the
  // authoritative P07-M1 model validator; one invalid event rejects the
  // whole file — loaded history is never blindly trusted.
  if (data['changeEvents'] !== undefined) {
    const changeEvents = requireArray(data, 'changeEvents', 'document', errs);
    if (changeEvents) {
      changeEvents.forEach((candidate, i) => {
        const result = validateChangeEvent(candidate);
        // Explicit discriminant comparison: `!result.ok` does NOT narrow this
        // union when a caller compiles this file without `--strict` (the
        // legacy verify suites do), which broke their compile at P07-M2.
        // Semantics are identical; the guard now works in both modes.
        if (result.ok === false) {
          errs.push(`document.changeEvents[${i}]: ${result.message}`);
        }
      });
    }
  }

  // ── Metadata ──────────────────────────────────────────────────────────────
  const metadata = requireRecord(data, 'metadata', 'document', errs);
  if (metadata) {
    requireString(metadata, 'title', 'metadata', errs);
    requireString(metadata, 'subtitle', 'metadata', errs);
    requireString(metadata, 'organizationName', 'metadata', errs);
    requireString(metadata, 'documentId', 'metadata', errs);
    requireString(metadata, 'status', 'metadata', errs);
    requireString(metadata, 'createdAt', 'metadata', errs);
    requireString(metadata, 'modifiedAt', 'metadata', errs);
    requireArray(metadata, 'customFields', 'metadata', errs);
  }

  // ── Laboratory profile snapshot ───────────────────────────────────────────
  const labProfile = requireRecord(data, 'labProfile', 'document', errs);
  if (labProfile) requireString(labProfile, 'name', 'labProfile', errs);

  // ── Page setup ────────────────────────────────────────────────────────────
  const pageSetup = requireRecord(data, 'pageSetup', 'document', errs);
  if (pageSetup) {
    requireString(pageSetup, 'size', 'pageSetup', errs);
    requireString(pageSetup, 'orientation', 'pageSetup', errs);
    const margins = requireRecord(pageSetup, 'margins', 'pageSetup', errs);
    if (margins) {
      requireString(margins, 'preset', 'margins', errs);
      requireNumber(margins, 'topMm', 'margins', errs);
      requireNumber(margins, 'bottomMm', 'margins', errs);
      requireNumber(margins, 'leftMm', 'margins', errs);
      requireNumber(margins, 'rightMm', 'margins', errs);
    }
  }

  // ── Page typography ───────────────────────────────────────────────────────
  const pageTypography = requireRecord(data, 'pageTypography', 'document', errs);
  if (pageTypography) {
    requireString(pageTypography, 'bodyThemeId', 'pageTypography', errs);
    requireBoolean(pageTypography, 'monochrome', 'pageTypography', errs);
    requireBoolean(pageTypography, 'displayHeader', 'pageTypography', errs);
    const typography = requireRecord(pageTypography, 'typography', 'pageTypography', errs);
    if (typography) {
      requireString(typography, 'fontFamily', 'typography', errs);
      requireArray(typography, 'fontFallbacks', 'typography', errs);
      requireNumber(typography, 'baseFontSizePt', 'typography', errs);
      requireNumber(typography, 'lineHeight', 'typography', errs);
      requireNumber(typography, 'paragraphSpacingPt', 'typography', errs);
    }
  }

  // ── Front page ────────────────────────────────────────────────────────────
  const frontPage = requireRecord(data, 'frontPage', 'document', errs);
  if (frontPage) {
    requireBoolean(frontPage, 'enabled', 'frontPage', errs);
    requireString(frontPage, 'themeId', 'frontPage', errs);
    requireBoolean(frontPage, 'monochrome', 'frontPage', errs);
    const visibleFields = requireArray(frontPage, 'visibleFields', 'frontPage', errs);
    if (visibleFields && !visibleFields.every((f) => typeof f === 'string')) {
      errs.push('frontPage.visibleFields must contain only strings.');
    }
    const frame = requireRecord(frontPage, 'frame', 'frontPage', errs);
    if (frame) {
      requireBoolean(frame, 'visible', 'frame', errs);
      requireString(frame, 'style', 'frame', errs);
      requireNumber(frame, 'thicknessPt', 'frame', errs);
      requireString(frame, 'color', 'frame', errs);
      requireNumber(frame, 'cornerRadiusMm', 'frame', errs);
      requireNumber(frame, 'insetMm', 'frame', errs);
    }
    // Optional placement overrides (P04-M4).  Absent in schema-v1 files
    // created before P04-M4 — validated ONLY when present, so older
    // documents open unchanged with theme defaults.
    if (frontPage['placement'] !== undefined) {
      const placement = requireRecord(frontPage, 'placement', 'frontPage', errs);
      if (placement) {
        for (const el of ['title', 'subtitle', 'organizationName'] as const) {
          if (placement[el] === undefined) continue;
          const entry = requireRecord(placement, el, 'placement', errs);
          if (!entry) continue;
          requireString(entry, 'align', `placement.${el}`, errs);
          requireString(entry, 'band', `placement.${el}`, errs);
        }
      }
    }
  }

  // ── Header / footer / watermark ───────────────────────────────────────────
  const headerFooter = requireRecord(data, 'headerFooter', 'document', errs);
  if (headerFooter) {
    const header = requireRecord(headerFooter, 'header', 'headerFooter', errs);
    if (header) validateHeaderFooterBand(header, 'headerFooter.header', errs);
    const footer = requireRecord(headerFooter, 'footer', 'headerFooter', errs);
    if (footer) validateHeaderFooterBand(footer, 'headerFooter.footer', errs);
    const watermark = requireRecord(headerFooter, 'watermark', 'headerFooter', errs);
    if (watermark) {
      requireBoolean(watermark, 'enabled', 'watermark', errs);
      requireString(watermark, 'text', 'watermark', errs);
      requireNumber(watermark, 'opacity', 'watermark', errs);
      requireNumber(watermark, 'rotationDeg', 'watermark', errs);
      requireNumber(watermark, 'fontSizePt', 'watermark', errs);
      requireString(watermark, 'color', 'watermark', errs);
      requireNumber(watermark, 'positionX', 'watermark', errs);
      requireNumber(watermark, 'positionY', 'watermark', errs);
    }
  }

  // ── Content blocks ────────────────────────────────────────────────────────
  const blocks = requireArray(data, 'blocks', 'document', errs);
  if (blocks) {
    blocks.forEach((block, i) => {
      const where = `blocks[${i}]`;
      if (!isRecord(block)) {
        errs.push(`${where} must be an object.`);
        return;
      }
      requireString(block, 'id', where, errs);
      const spacing = requireRecord(block, 'spacing', where, errs);
      if (spacing) {
        requireNumber(spacing, 'topPt', `${where}.spacing`, errs);
        requireNumber(spacing, 'bottomPt', `${where}.spacing`, errs);
      }
      const blockData = requireRecord(block, 'data', where, errs);
      if (blockData) {
        const type = blockData['type'];
        if (typeof type !== 'string' || !(BLOCK_TYPES as readonly string[]).includes(type)) {
          errs.push(`${where}.data.type "${String(type)}" is not a supported block type.`);
        }
      }
    });
  }

  // ── Assets ────────────────────────────────────────────────────────────────
  if (!isRecord(data['assets'])) {
    errs.push('document.assets must be an object keyed by asset ID.');
  } else {
    const assets = data['assets'] as Record<string, unknown>;
    for (const [key, asset] of Object.entries(assets)) {
      const where = `assets["${key}"]`;
      if (!isRecord(asset)) {
        errs.push(`${where} must be an object.`);
        continue;
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
  }

  return errs;
}

/**
 * Validate an unknown value as a DocStudioDocument (schema v1).
 * Throws DocumentFileError with specific codes for version-policy failures
 * and 'invalid-structure' (with per-field detail) for everything else.
 */
export function validateDocument(value: unknown): asserts value is DocStudioDocument {
  if (!isRecord(value)) {
    throw new DocumentFileError(
      'invalid-structure',
      'This file is not a DocStudio project and cannot be opened.',
      'The document root must be a JSON object.',
    );
  }

  if (value['__type'] !== 'DocStudio') {
    throw new DocumentFileError(
      'invalid-structure',
      'This file is not a DocStudio project and cannot be opened.',
      `The document signature (__type) must be "DocStudio", found ${JSON.stringify(value['__type'] ?? null)}.`,
    );
  }

  const version = value['schemaVersion'];
  if (typeof version !== 'number' || !Number.isInteger(version) || version < 1) {
    throw new DocumentFileError(
      'invalid-structure',
      'This file is not a valid DocStudio project and cannot be opened.',
      'The schemaVersion field must be a positive integer.',
    );
  }
  if (version > DOCSTUDIO_SCHEMA_VERSION) {
    throw new DocumentFileError(
      'unsupported-version',
      `This project was created with a newer version of DocStudio (schema v${version}) and cannot be opened safely. Please update DocStudio.`,
      `This build supports schema v${DOCSTUDIO_SCHEMA_VERSION}.`,
    );
  }
  if (version < DOCSTUDIO_SCHEMA_VERSION) {
    throw new DocumentFileError(
      'no-migration',
      `This project uses an older DocStudio schema (v${version}) for which no migration is available in this build.`,
      `This build supports schema v${DOCSTUDIO_SCHEMA_VERSION}. A migration module will be added when older versions must be supported.`,
    );
  }

  const errs = collectValidationErrors(value);
  if (errs.length > 0) {
    throw new DocumentFileError(
      'invalid-structure',
      'This DocStudio project is incomplete or damaged and cannot be opened safely.',
      errs.map((e) => `• ${e}`).join('\n'),
    );
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Serialization / deserialization
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Serialize a document to `.docstudio` file text (pretty-printed JSON).
 * The document is validated first so a structurally invalid document can
 * never be written to disk.
 */
export function serializeDocument(document: DocStudioDocument): string {
  validateDocument(document);
  try {
    return JSON.stringify(document, null, 2);
  } catch (e) {
    throw new DocumentFileError(
      'invalid-structure',
      'The document contains data that cannot be saved to a project file.',
      e instanceof Error ? e.message : String(e),
    );
  }
}

/**
 * Parse and validate `.docstudio` file text.
 * Throws DocumentFileError for invalid JSON, unsupported schema versions,
 * or incomplete/invalid document structures.  Never returns a partially
 * validated or cast value.
 */
export function deserializeDocument(json: string): DocStudioDocument {
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch (e) {
    throw new DocumentFileError(
      'invalid-json',
      'The selected file is not a valid DocStudio project (its contents are not readable JSON).',
      e instanceof Error ? e.message : String(e),
    );
  }
  validateDocument(parsed);
  return parsed;
}

// ─────────────────────────────────────────────────────────────────────────────
// Filename helper
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Build a sensible default `.docstudio` filename from a document title,
 * stripping characters that are illegal in Windows filenames.
 */
export function defaultProjectFileName(title: string): string {
  const safe =
    title
      .trim()
      .replace(/[\\/:*?"<>|]/g, '-')
      .replace(/\s+/g, ' ')
      .slice(0, 120)
      .trim() || 'Untitled';
  return `${safe}.docstudio`;
}
