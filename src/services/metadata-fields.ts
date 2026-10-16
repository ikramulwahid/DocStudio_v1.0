/**
 * DocStudio — Document metadata field definitions and normalization (P02-M5)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Single source of truth for WHICH `DocumentMetadata` fields the Document
 * Information panel exposes and HOW raw input values are normalized before
 * they reach the authoritative document object.
 *
 * • `METADATA_FIELD_SPECS` covers every `DocumentMetadata` key except the
 *   app-managed timestamps (`createdAt`, `modifiedAt`) and `customFields`
 *   (which get their own row editor).  `verify_p02_m5.mjs` asserts this
 *   coverage so no schema-supported field can be silently omitted.
 * • Normalization is deterministic and lossless: empty OPTIONAL values are
 *   stored as `undefined` (so typing then clearing returns the fingerprint
 *   to its original state instead of leaving `""` noise), required fields
 *   always keep a string (possibly `""`), and date values outside
 *   `YYYY-MM-DD` are passed through unchanged rather than silently dropped.
 * • The timestamps are displayed read-only through
 *   `formatTimestampForDisplay`; they are never editable in the panel.
 *
 * This module is free of React/DOM/Tauri imports so the rules are directly
 * testable in Node (see verify_p02_m5.mjs).
 *
 * @module services/metadata-fields
 */

import type { DocumentMetadata, DocumentMetadataStatus } from '../types/document';

// ─────────────────────────────────────────────────────────────────────────────
// Field specification
// ─────────────────────────────────────────────────────────────────────────────

/** Every metadata key the panel edits, excluding app-managed timestamps and the custom-field rows. */
export type MetadataFieldKey = Exclude<
  keyof DocumentMetadata,
  'createdAt' | 'modifiedAt' | 'customFields'
>;

export type MetadataFieldType = 'text' | 'textarea' | 'date' | 'select';
export type MetadataFieldGroup = 'core' | 'control' | 'approval' | 'classification' | 'references';

export interface MetadataFieldSpec {
  /** `DocumentMetadata` key this control edits. */
  readonly key: MetadataFieldKey;
  /** Human-readable label rendered above the control. */
  readonly label: string;
  readonly type: MetadataFieldType;
  readonly group: MetadataFieldGroup;
  /** False → the key is non-optional in the schema (always a string). */
  readonly optional: boolean;
  /** Placeholder text for text/textarea controls. */
  readonly placeholder?: string;
}

/** Display order of the field groups inside the panel. */
export const METADATA_GROUPS: ReadonlyArray<{ id: MetadataFieldGroup; title: string }> = [
  { id: 'core', title: 'Identification' },
  { id: 'control', title: 'Issue & Revision Control' },
  { id: 'approval', title: 'Preparation & Approval' },
  { id: 'classification', title: 'Classification' },
  { id: 'references', title: 'Standards & References' },
];

/** All editable metadata fields, in panel display order. */
export const METADATA_FIELD_SPECS: readonly MetadataFieldSpec[] = [
  // ── core (required, project_details.md §6) ──────────────────────────────
  { key: 'title', label: 'Title', type: 'text', group: 'core', optional: false, placeholder: 'e.g. Standard Operating Procedure' },
  { key: 'subtitle', label: 'Subtitle', type: 'textarea', group: 'core', optional: false, placeholder: 'Optional short description' },
  { key: 'organizationName', label: 'Organization / Laboratory Name', type: 'text', group: 'core', optional: false, placeholder: 'e.g. ISO/IEC 17025 Testing Laboratory' },
  { key: 'documentId', label: 'Document ID / Code', type: 'text', group: 'core', optional: false, placeholder: 'e.g. SOP-LAB-001' },
  { key: 'status', label: 'Document Status', type: 'select', group: 'core', optional: false },

  // ── issue & revision control ───────────────────────────────────────────
  { key: 'issueNumber', label: 'Issue Number', type: 'text', group: 'control', optional: true, placeholder: 'e.g. Issue 2 / Rev 3' },
  { key: 'issueDate', label: 'Issue Date', type: 'date', group: 'control', optional: true },
  { key: 'documentHolder', label: 'Document Holder', type: 'text', group: 'control', optional: true, placeholder: 'Responsible person' },
  { key: 'revisionLabel', label: 'Revision Label', type: 'text', group: 'control', optional: true, placeholder: 'e.g. v2.1' },
  { key: 'amendmentNumber', label: 'Amendment Number', type: 'text', group: 'control', optional: true, placeholder: 'e.g. A1' },
  { key: 'effectiveDate', label: 'Effective Date', type: 'date', group: 'control', optional: true },
  { key: 'reviewDate', label: 'Review Date', type: 'date', group: 'control', optional: true },

  // ── preparation & approval ─────────────────────────────────────────────
  { key: 'preparedBy', label: 'Prepared By', type: 'text', group: 'approval', optional: true, placeholder: 'Name' },
  { key: 'reviewedBy', label: 'Reviewed By', type: 'text', group: 'approval', optional: true, placeholder: 'Name' },
  { key: 'approvedBy', label: 'Approved By', type: 'text', group: 'approval', optional: true, placeholder: 'Name' },

  // ── classification ─────────────────────────────────────────────────────
  { key: 'documentType', label: 'Document Type', type: 'text', group: 'classification', optional: true, placeholder: 'e.g. Quality Manual' },
  { key: 'department', label: 'Department / Section', type: 'text', group: 'classification', optional: true, placeholder: 'e.g. Quality Assurance' },

  // ── standards & references ─────────────────────────────────────────────
  { key: 'applicableStandard', label: 'Applicable Standard', type: 'text', group: 'references', optional: true, placeholder: 'e.g. ISO/IEC 17025:2017' },
  { key: 'clauseReferences', label: 'Clause / Section References', type: 'textarea', group: 'references', optional: true, placeholder: 'e.g. Clause 7.2, 7.7' },
  { key: 'supersedes', label: 'Supersedes', type: 'text', group: 'references', optional: true, placeholder: 'e.g. SOP-LAB-001 (Rev 2)' },
];

/** Fields the schema declares optional (stored as `undefined` when empty). */
export const OPTIONAL_METADATA_KEYS: ReadonlySet<MetadataFieldKey> = new Set(
  METADATA_FIELD_SPECS.filter((s) => s.optional).map((s) => s.key),
);

// ─────────────────────────────────────────────────────────────────────────────
// Document status select
// ─────────────────────────────────────────────────────────────────────────────

/** Preset values of `DocumentMetadataStatus` (the union also allows custom strings). */
export const STATUS_PRESETS: readonly DocumentMetadataStatus[] = [
  'Draft',
  'Under Review',
  'Approved',
  'Issued',
  'Superseded',
  'Obsolete',
];

/**
 * Options for the status select: the presets, plus the document's current
 * value when it is a custom string — a custom status is never silently
 * replaced by a preset just because it is opened.
 */
export function statusOptions(current: DocumentMetadataStatus): string[] {
  const options = [...STATUS_PRESETS];
  if (!options.includes(current)) options.push(current);
  return options;
}

// ─────────────────────────────────────────────────────────────────────────────
// Normalization (raw control value → stored value)
// ─────────────────────────────────────────────────────────────────────────────

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Value for a `<input type="date">` from a stored string.
 * Accepts `YYYY-MM-DD` directly and takes the date part of a full ISO 8601
 * timestamp; anything unparseable renders as an empty picker (`''`).
 */
export function toDatePickerValue(raw: string | undefined): string {
  if (!raw) return '';
  if (DATE_ONLY.test(raw)) return raw;
  const match = /^(\d{4}-\d{2}-\d{2})/.exec(raw);
  return match ? match[1] : '';
}

/**
 * Normalize a raw control value before it enters the document.
 *
 * Rules (deterministic, documented):
 * • `date` controls emit `YYYY-MM-DD` or `''` → `''` becomes `undefined`
 *   (optional date cleared). A non-empty value outside `YYYY-MM-DD` is kept
 *   UNCHANGED — never silently dropped.
 * • Optional text/textarea: `''` becomes `undefined` so a cleared field is
 *   indistinguishable from an absent one (stable fingerprints).
 * • Required text/textarea: always stored as a string (may be `''`).
 */
export function normalizeFieldValue(spec: MetadataFieldSpec, raw: string): string | undefined {
  if (spec.type === 'date') return raw === '' ? undefined : raw;
  if (spec.optional && raw === '') return undefined;
  return raw;
}

// ─────────────────────────────────────────────────────────────────────────────
// Read-only timestamp display
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Human-readable display of an ISO timestamp (locale-aware in the UI).
 * Unparseable input falls back to the raw string so nothing is ever hidden.
 */
export function formatTimestampForDisplay(iso: string): string {
  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) return iso;
  return parsed.toLocaleString();
}
