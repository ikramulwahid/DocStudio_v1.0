/**
 * DocStudio — Immutable structural block content actions (P06-M2)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Pure, non-mutating content operations for the seven structural block
 * types delivered by P06-M2 (roadmap Phase 06 §6.2):
 *
 * • HORIZONTAL RULE  — stored `thicknessPt`/`color` with the P06-M2
 *   rule-style source policy (`styleSource`, mirrors the list
 *   `markerSource` / table `headerStyleSource` fields).
 * • SECTION BREAK    — optional inline section title.
 * • METADATA BLOCK   — ordered selection of visible metadata fields,
 *   validated against the actual `CoverVisibleMetadataField` union.
 * • REVISION HISTORY — add/edit/remove revision entries (stable IDs).
 * • REFERENCES       — block title + add/edit/remove citation entries
 *   with safe URL handling (`sanitizeHref`).
 * • EXHIBIT          — label / title / notes + optional reference to an
 *   existing embedded IMAGE asset of the active document.
 * • PAGE BREAK       — deliberately has NO content actions: it is a
 *   structural marker (the insertion framework already covers
 *   insert/reorder/duplicate/delete for it).
 *
 * Conventions inherited from `block-actions` / `block-content` /
 * `table-content` (same file-level rules):
 * • Immutable: a NEW document is returned; inputs are never mutated.
 * • No-op patches return the SAME document reference (no false Modified
 *   status, no `modifiedAt` churn).
 * • Real changes stamp `metadata.modifiedAt = now`.
 * • Failures return `{ ok: false, code, message }`; the document is
 *   never partially changed.  Every value is validated BEFORE commit —
 *   invalid input is rejected with an understandable, field-specific
 *   message, never silently coerced or clamped.
 * • Block identity is the stable `ContentBlock.id`; entry identity is
 *   the stable per-entry UUID — array indexes are never identities.
 * • Optional `now`/`genId` injection keeps tests deterministic.
 *
 * The revision-history table is a MANUALLY EDITED document section —
 * it is not Track Changes and not a tamper-proof audit trail (Phase 07
 * owns saved revision snapshots).  Nothing here fabricates revision
 * data: entries contain exactly what the user typed.
 *
 * @module services/structural-block-content
 */

import type {
  CoverVisibleMetadataField,
  CustomMetadataField,
  DocStudioDocument,
  DocUUID,
} from '../types/document';
import type {
  ExhibitBlockData,
  HorizontalLineBlockData,
  MetadataBlockData,
  ReferenceBlockData,
  SectionBreakBlockData,
} from '../types/blocks';
import { newUUID, nowISO } from '../types/defaults';
import { indexOfBlock, stamped, type BlockOpOptions } from './block-actions';
import { METADATA_FIELD_SPECS } from './metadata-fields';
import { normalizeHexColor, sanitizeHref } from './rich-text';

// ─────────────────────────────────────────────────────────────────────────────
// Contract constants
// ─────────────────────────────────────────────────────────────────────────────

/** Stored rule thickness accepted range (points), mirroring the frame range. */
export const HORIZONTAL_LINE_THICKNESS_PT_RANGE = { min: 0.1, max: 12 } as const;

/** Longest accepted free-text field (title/notes/citation/description). */
export const MAX_STRUCTURAL_TEXT_LENGTH = 4000;

/** Every scalar metadata key selectable in a metadata block. */
const SCALAR_METADATA_FIELDS: ReadonlySet<string> = new Set<string>([
  ...METADATA_FIELD_SPECS.map((spec) => spec.key),
  'createdAt',
  'modifiedAt',
]);

/** Metadata fields selectable in a metadata block (labels for the picker). */
export function metadataFieldChoices(
  customFields: readonly CustomMetadataField[],
): { field: CoverVisibleMetadataField; label: string }[] {
  const scalars = METADATA_FIELD_SPECS.map((spec) => ({
    field: spec.key as CoverVisibleMetadataField,
    label: spec.label,
  }));
  scalars.push({ field: 'createdAt', label: 'Created (date)' });
  scalars.push({ field: 'modifiedAt', label: 'Last modified (date)' });
  const customs = customFields.map((custom) => ({
    field: `custom:${custom.id}` as CoverVisibleMetadataField,
    label: custom.label.trim() === '' ? '(unlabelled field)' : custom.label,
  }));
  return [...scalars, ...customs];
}

// ─────────────────────────────────────────────────────────────────────────────
// Result and action contracts
// ─────────────────────────────────────────────────────────────────────────────

export type StructuralContentErrorCode =
  | 'missing-block'
  | 'wrong-block-type'
  | 'invalid-action'
  | 'invalid-thickness'
  | 'invalid-color'
  | 'invalid-title'
  | 'invalid-text'
  | 'invalid-fields'
  | 'unknown-metadata-field'
  | 'duplicate-metadata-field'
  | 'missing-entry'
  | 'invalid-revision'
  | 'invalid-date'
  | 'invalid-reference-key'
  | 'invalid-url'
  | 'invalid-label'
  | 'invalid-asset';

export interface StructuralFailure {
  ok: false;
  code: StructuralContentErrorCode;
  message: string;
}

/** Success carries an `entryId` focus hint for row-level operations. */
export interface StructuralSuccess {
  ok: true;
  changed: boolean;
  doc: DocStudioDocument;
  blockId: DocUUID;
  entryId?: DocUUID;
}

export type StructuralContentActionResult = StructuralSuccess | StructuralFailure;

const reject = (code: StructuralContentErrorCode, message: string): StructuralFailure => ({
  ok: false,
  code,
  message,
});

/** Patch fields for one revision entry.  Absent fields are never touched. */
export interface RevisionEntryPatch {
  revision?: unknown;
  date?: unknown;
  author?: unknown;
  description?: unknown;
}

/** Patch fields for one reference entry.  Absent fields are never touched. */
export interface ReferenceEntryPatch {
  key?: unknown;
  citation?: unknown;
  url?: unknown;
}

/** Patch fields for the exhibit block.  Absent fields are never touched. */
export interface ExhibitPatch {
  label?: unknown;
  title?: unknown;
  notes?: unknown;
  /** Embedded asset ID, or `null` to clear the reference. */
  assetId?: unknown;
}

/**
 * One validated structural action.  Dispatched through
 * `applyStructuralAction`, exactly like the P05-M3 list dispatcher and
 * the P05-M4 table dispatcher.
 */
export type StructuralContentAction =
  | { action: 'update-horizontal-line'; thicknessPt?: number; color?: string }
  | { action: 'update-section-break'; title?: string | null }
  | { action: 'set-metadata-fields'; fields: CoverVisibleMetadataField[] }
  | { action: 'add-revision-entry' }
  | { action: 'update-revision-entry'; entryId: DocUUID; patch: RevisionEntryPatch }
  | { action: 'remove-revision-entry'; entryId: DocUUID }
  | { action: 'update-reference-title'; title?: string | null }
  | { action: 'add-reference-entry' }
  | { action: 'update-reference-entry'; entryId: DocUUID; patch: ReferenceEntryPatch }
  | { action: 'remove-reference-entry'; entryId: DocUUID }
  | { action: 'update-exhibit'; patch: ExhibitPatch };

// ─────────────────────────────────────────────────────────────────────────────
// Shared helpers
// ─────────────────────────────────────────────────────────────────────────────

const isFreeText = (value: unknown): value is string =>
  typeof value === 'string' && value.length <= MAX_STRUCTURAL_TEXT_LENGTH;

// ─────────────────────────────────────────────────────────────────────────────
// Horizontal rule (§10 / P06-M2 §5.1)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Update the stored style of the identified HORIZONTAL-RULE block.
 *
 * Validation (all BEFORE commit):
 * • `thicknessPt` — finite number inside
 *   `HORIZONTAL_LINE_THICKNESS_PT_RANGE` (`invalid-thickness`).
 * • `color`       — must normalise to a safe `#rgb`/`#rrggbb` hex
 *   (`invalid-color`); the normalised form is what gets stored.
 *
 * Supplying either field marks the rule as block-authored
 * (`styleSource: 'block'`) so the renderer applies the stored values;
 * re-committing the exact stored values afterwards is a same-reference
 * no-op.  Documents that never touch this action keep `styleSource`
 * absent and render through the theme tokens exactly as before.
 */
export function updateHorizontalLineContent(
  source: DocStudioDocument,
  blockId: DocUUID,
  patch: { thicknessPt?: number; color?: string },
  options: BlockOpOptions = {},
): StructuralContentActionResult {
  const index = indexOfBlock(source, blockId);
  if (index < 0) {
    return reject('missing-block', 'The horizontal rule to edit no longer exists in this document.');
  }
  const block = source.blocks[index];
  if (block.data.type !== 'horizontal-line') {
    return reject('wrong-block-type', 'This block is not a horizontal rule.');
  }
  const data = block.data;

  const next: HorizontalLineBlockData = { ...data };

  if (patch.thicknessPt !== undefined) {
    const { min, max } = HORIZONTAL_LINE_THICKNESS_PT_RANGE;
    if (typeof patch.thicknessPt !== 'number' || !Number.isFinite(patch.thicknessPt)) {
      return reject('invalid-thickness', 'Rule thickness must be a number of points, for example 1.');
    }
    if (patch.thicknessPt < min || patch.thicknessPt > max) {
      return reject(
        'invalid-thickness',
        `Rule thickness must be between ${min} and ${max} points.`,
      );
    }
    next.thicknessPt = patch.thicknessPt;
  }
  if (patch.color !== undefined) {
    const normalized = normalizeHexColor(patch.color);
    if (normalized === null) {
      return reject('invalid-color', 'Rule colour must be a hex colour such as #999999.');
    }
    next.color = normalized;
  }

  const styleChanged = next.styleSource !== 'block';
  const valueChanged = next.thicknessPt !== data.thicknessPt || next.color !== data.color;
  if (!styleChanged && !valueChanged) {
    return { ok: true, doc: source, changed: false, blockId };
  }
  next.styleSource = 'block';

  const updated = { ...block, data: next };
  const blocks = [...source.blocks];
  blocks[index] = updated;
  return { ok: true, changed: true, blockId, doc: stamped(source, blocks, options.now ?? nowISO()) };
}

// ─────────────────────────────────────────────────────────────────────────────
// Section break (P06-M2 §5.3)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Update the optional title of the identified SECTION-BREAK block.
 *
 * The title is an INLINE divider title — it never forces a new page.
 * Any string is accepted including the empty string; `null` or `''`
 * clears the optional field (stored as `undefined`).
 */
export function updateSectionBreakContent(
  source: DocStudioDocument,
  blockId: DocUUID,
  patch: { title?: string | null },
  options: BlockOpOptions = {},
): StructuralContentActionResult {
  const index = indexOfBlock(source, blockId);
  if (index < 0) {
    return reject('missing-block', 'The section break to edit no longer exists in this document.');
  }
  const block = source.blocks[index];
  if (block.data.type !== 'section-break') {
    return reject('wrong-block-type', 'This block is not a section break.');
  }
  const data = block.data;

  const next: SectionBreakBlockData = { ...data };
  let changed = false;
  if (patch.title !== undefined) {
    // NOTE: written as explicit branches rather than a negated type guard
    // so the file compiles identically under `--strict` (app build) and
    // under the NON-strict flags the older verification suites use.
    let value: string | undefined;
    if (patch.title === null) {
      value = undefined; // explicit clear
    } else if (isFreeText(patch.title)) {
      value = patch.title === '' ? undefined : patch.title;
    } else {
      return reject('invalid-title', 'Section title must be text.');
    }
    if ((value ?? '') !== (data.title ?? '')) {
      if (value === undefined) delete next.title;
      else next.title = value;
      changed = true;
    }
  }
  if (!changed) {
    return { ok: true, doc: source, changed: false, blockId };
  }
  const updated = { ...block, data: next };
  const blocks = [...source.blocks];
  blocks[index] = updated;
  return { ok: true, changed: true, blockId, doc: stamped(source, blocks, options.now ?? nowISO()) };
}

// ─────────────────────────────────────────────────────────────────────────────
// Metadata block (P06-M2 §5.4)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Replace the ordered visible-field selection of the identified
 * METADATA-BLOCK.
 *
 * Validation (all BEFORE commit):
 * • `fields` must be an array (`invalid-fields`).
 * • Every entry must be a known scalar metadata key (the actual
 *   `CoverVisibleMetadataField` union) or a `custom:<id>` reference to
 *   a custom field that EXISTS in this document
 *   (`unknown-metadata-field`).
 * • Duplicates are rejected (`duplicate-metadata-field`).
 * • The order given is the order stored (and rendered).
 *
 * An EMPTY selection is valid: the block stores `[]` and the renderer
 * shows an honest "no fields selected" state.  The block stores field
 * KEYS only — values always come from the authoritative document
 * metadata at render time, so they can never go stale.
 */
export function setMetadataBlockFields(
  source: DocStudioDocument,
  blockId: DocUUID,
  fields: CoverVisibleMetadataField[],
  options: BlockOpOptions = {},
): StructuralContentActionResult {
  const index = indexOfBlock(source, blockId);
  if (index < 0) {
    return reject('missing-block', 'The metadata block to edit no longer exists in this document.');
  }
  const block = source.blocks[index];
  if (block.data.type !== 'metadata-block') {
    return reject('wrong-block-type', 'This block is not a metadata block.');
  }
  const data = block.data;

  if (!Array.isArray(fields)) {
    return reject('invalid-fields', 'Metadata fields must be a list of field identifiers.');
  }
  const seen = new Set<string>();
  for (const field of fields) {
    if (typeof field !== 'string') {
      return reject('invalid-fields', 'Every metadata field must be a field identifier.');
    }
    if (seen.has(field)) {
      return reject('duplicate-metadata-field', `The metadata field "${field}" is listed twice.`);
    }
    seen.add(field);
    if (field.startsWith('custom:')) {
      const id = field.slice('custom:'.length);
      const exists = source.metadata.customFields.some((custom) => custom.id === id);
      if (!exists) {
        return reject(
          'unknown-metadata-field',
          'That custom metadata field no longer exists in this document.',
        );
      }
    } else if (!SCALAR_METADATA_FIELDS.has(field)) {
      return reject(
        'unknown-metadata-field',
        `"${field}" is not a supported document metadata field.`,
      );
    }
  }

  if (JSON.stringify(fields) === JSON.stringify(data.visibleFields)) {
    return { ok: true, doc: source, changed: false, blockId };
  }
  const updated = { ...block, data: { ...data, visibleFields: [...fields] } as MetadataBlockData };
  const blocks = [...source.blocks];
  blocks[index] = updated;
  return { ok: true, changed: true, blockId, doc: stamped(source, blocks, options.now ?? nowISO()) };
}

// ─────────────────────────────────────────────────────────────────────────────
// Revision history (P06-M2 §5.5)
// ─────────────────────────────────────────────────────────────────────────────

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Append a fresh, empty revision entry to the identified
 * REVISION-HISTORY block.  The new entry's revision number defaults to
 * the next sequence value ("1", "2", …); every other field starts empty
 * for the user to fill in.  Nothing is fabricated.
 */
export function addRevisionEntry(
  source: DocStudioDocument,
  blockId: DocUUID,
  options: BlockOpOptions = {},
): StructuralContentActionResult {
  const index = indexOfBlock(source, blockId);
  if (index < 0) {
    return reject('missing-block', 'The revision history to edit no longer exists in this document.');
  }
  const block = source.blocks[index];
  if (block.data.type !== 'revision-history') {
    return reject('wrong-block-type', 'This block is not a revision history.');
  }
  const data = block.data;

  const entryId = options.genId !== undefined ? options.genId() : newUUID();
  const entry = {
    id: entryId,
    revision: String(data.entries.length + 1),
    date: '',
    author: '',
    description: '',
  };
  const updated = { ...block, data: { ...data, entries: [...data.entries, entry] } };
  const blocks = [...source.blocks];
  blocks[index] = updated;
  return {
    ok: true,
    changed: true,
    blockId,
    entryId,
    doc: stamped(source, blocks, options.now ?? nowISO()),
  };
}

/**
 * Update the fields of one revision entry, addressed by its STABLE id.
 *
 * Validation: `revision` must be a non-empty label (`invalid-revision`);
 * `date` must be empty or `YYYY-MM-DD` (`invalid-date`); `author` and
 * `description` accept any text (empty allowed).  All other entry fields
 * and every other entry keep their identity and values.
 */
export function updateRevisionEntry(
  source: DocStudioDocument,
  blockId: DocUUID,
  entryId: DocUUID,
  patch: RevisionEntryPatch,
  options: BlockOpOptions = {},
): StructuralContentActionResult {
  const index = indexOfBlock(source, blockId);
  if (index < 0) {
    return reject('missing-block', 'The revision history to edit no longer exists in this document.');
  }
  const block = source.blocks[index];
  if (block.data.type !== 'revision-history') {
    return reject('wrong-block-type', 'This block is not a revision history.');
  }
  const data = block.data;
  const entryIndex = data.entries.findIndex((entry) => entry.id === entryId);
  if (entryIndex < 0) {
    return reject('missing-entry', 'The revision entry to edit no longer exists.');
  }
  const entry = data.entries[entryIndex];

  const next = { ...entry };
  let changed = false;

  if (patch.revision !== undefined) {
    if (!isFreeText(patch.revision) || patch.revision.trim() === '') {
      return reject('invalid-revision', 'A revision entry needs a revision number or label.');
    }
    if (next.revision !== patch.revision) {
      next.revision = patch.revision;
      changed = true;
    }
  }
  if (patch.date !== undefined) {
    if (!isFreeText(patch.date) || (patch.date !== '' && !DATE_PATTERN.test(patch.date))) {
      return reject('invalid-date', 'A revision date must be empty or in YYYY-MM-DD format.');
    }
    if (next.date !== patch.date) {
      next.date = patch.date;
      changed = true;
    }
  }
  if (patch.author !== undefined) {
    if (!isFreeText(patch.author)) {
      return reject('invalid-text', 'A revision author must be text.');
    }
    if (next.author !== patch.author) {
      next.author = patch.author;
      changed = true;
    }
  }
  if (patch.description !== undefined) {
    if (!isFreeText(patch.description)) {
      return reject('invalid-text', 'A revision description must be text.');
    }
    if (next.description !== patch.description) {
      next.description = patch.description;
      changed = true;
    }
  }

  if (!changed) {
    return { ok: true, doc: source, changed: false, blockId };
  }
  const entries = [...data.entries];
  entries[entryIndex] = next;
  const updated = { ...block, data: { ...data, entries } };
  const blocks = [...source.blocks];
  blocks[index] = updated;
  return {
    ok: true,
    changed: true,
    blockId,
    entryId,
    doc: stamped(source, blocks, options.now ?? nowISO()),
  };
}

/**
 * Remove one revision entry by its STABLE id.  Entries may be removed
 * down to zero (the renderer shows an honest empty state); the block
 * itself is never removed by this action.
 */
export function removeRevisionEntry(
  source: DocStudioDocument,
  blockId: DocUUID,
  entryId: DocUUID,
  options: BlockOpOptions = {},
): StructuralContentActionResult {
  const index = indexOfBlock(source, blockId);
  if (index < 0) {
    return reject('missing-block', 'The revision history to edit no longer exists in this document.');
  }
  const block = source.blocks[index];
  if (block.data.type !== 'revision-history') {
    return reject('wrong-block-type', 'This block is not a revision history.');
  }
  const data = block.data;
  if (!data.entries.some((entry) => entry.id === entryId)) {
    return reject('missing-entry', 'The revision entry to remove no longer exists.');
  }
  const updated = {
    ...block,
    data: { ...data, entries: data.entries.filter((entry) => entry.id !== entryId) },
  };
  const blocks = [...source.blocks];
  blocks[index] = updated;
  return { ok: true, changed: true, blockId, doc: stamped(source, blocks, options.now ?? nowISO()) };
}

// ─────────────────────────────────────────────────────────────────────────────
// References (P06-M2 §5.6)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Update the optional block title of the identified REFERENCE block.
 * `null`/`''` clears the optional field.
 */
export function updateReferenceTitle(
  source: DocStudioDocument,
  blockId: DocUUID,
  patch: { title?: string | null },
  options: BlockOpOptions = {},
): StructuralContentActionResult {
  const index = indexOfBlock(source, blockId);
  if (index < 0) {
    return reject('missing-block', 'The reference block to edit no longer exists in this document.');
  }
  const block = source.blocks[index];
  if (block.data.type !== 'reference') {
    return reject('wrong-block-type', 'This block is not a reference block.');
  }
  const data = block.data;

  const next: ReferenceBlockData = { ...data };
  let changed = false;
  if (patch.title !== undefined) {
    // Explicit branches (see the section-break action for why).
    let value: string | undefined;
    if (patch.title === null) {
      value = undefined;
    } else if (isFreeText(patch.title)) {
      value = patch.title === '' ? undefined : patch.title;
    } else {
      return reject('invalid-title', 'Reference title must be text.');
    }
    if ((value ?? '') !== (data.title ?? '')) {
      if (value === undefined) delete next.title;
      else next.title = value;
      changed = true;
    }
  }
  if (!changed) {
    return { ok: true, doc: source, changed: false, blockId };
  }
  const updated = { ...block, data: next };
  const blocks = [...source.blocks];
  blocks[index] = updated;
  return { ok: true, changed: true, blockId, doc: stamped(source, blocks, options.now ?? nowISO()) };
}

/**
 * Append a fresh reference entry (next "[n]" key, empty citation).
 */
export function addReferenceEntry(
  source: DocStudioDocument,
  blockId: DocUUID,
  options: BlockOpOptions = {},
): StructuralContentActionResult {
  const index = indexOfBlock(source, blockId);
  if (index < 0) {
    return reject('missing-block', 'The reference block to edit no longer exists in this document.');
  }
  const block = source.blocks[index];
  if (block.data.type !== 'reference') {
    return reject('wrong-block-type', 'This block is not a reference block.');
  }
  const data = block.data;

  const entryId = options.genId !== undefined ? options.genId() : newUUID();
  const entry = { id: entryId, key: `[${data.entries.length + 1}]`, citation: '' };
  const updated = { ...block, data: { ...data, entries: [...data.entries, entry] } };
  const blocks = [...source.blocks];
  blocks[index] = updated;
  return {
    ok: true,
    changed: true,
    blockId,
    entryId,
    doc: stamped(source, blocks, options.now ?? nowISO()),
  };
}

/**
 * Update the fields of one reference entry, addressed by its STABLE id.
 *
 * Validation: `key` must be non-empty (`invalid-reference-key`);
 * `citation` accepts any text including the empty string; `url` is
 * `null` to clear, otherwise it must pass `sanitizeHref` — only safe
 * http/https/mailto links are stored (`invalid-url`), so an unsafe URL
 * can never become a live PDF link annotation.  The renderer re-checks
 * every URL at render time as well.
 */
export function updateReferenceEntry(
  source: DocStudioDocument,
  blockId: DocUUID,
  entryId: DocUUID,
  patch: ReferenceEntryPatch,
  options: BlockOpOptions = {},
): StructuralContentActionResult {
  const index = indexOfBlock(source, blockId);
  if (index < 0) {
    return reject('missing-block', 'The reference block to edit no longer exists in this document.');
  }
  const block = source.blocks[index];
  if (block.data.type !== 'reference') {
    return reject('wrong-block-type', 'This block is not a reference block.');
  }
  const data = block.data;
  const entryIndex = data.entries.findIndex((entry) => entry.id === entryId);
  if (entryIndex < 0) {
    return reject('missing-entry', 'The reference entry to edit no longer exists.');
  }
  const entry = data.entries[entryIndex];

  const next = { ...entry };
  let changed = false;

  if (patch.key !== undefined) {
    if (!isFreeText(patch.key) || patch.key.trim() === '') {
      return reject(
        'invalid-reference-key',
        'A reference needs a citation key or number, for example [1].',
      );
    }
    if (next.key !== patch.key) {
      next.key = patch.key;
      changed = true;
    }
  }
  if (patch.citation !== undefined) {
    if (!isFreeText(patch.citation)) {
      return reject('invalid-text', 'A reference citation must be text.');
    }
    if (next.citation !== patch.citation) {
      next.citation = patch.citation;
      changed = true;
    }
  }
  if (patch.url !== undefined) {
    if (patch.url === null || patch.url === '') {
      if (next.url !== undefined) {
        delete next.url;
        changed = true;
      }
    } else {
      if (!isFreeText(patch.url)) {
        return reject('invalid-url', 'A reference URL must be text.');
      }
      const safe = sanitizeHref(patch.url);
      if (safe === null) {
        return reject(
          'invalid-url',
          'That URL is not a safe link (only http, https and mailto links are accepted).',
        );
      }
      if (next.url !== safe) {
        next.url = safe;
        changed = true;
      }
    }
  }

  if (!changed) {
    return { ok: true, doc: source, changed: false, blockId };
  }
  const entries = [...data.entries];
  entries[entryIndex] = next;
  const updated = { ...block, data: { ...data, entries } };
  const blocks = [...source.blocks];
  blocks[index] = updated;
  return {
    ok: true,
    changed: true,
    blockId,
    entryId,
    doc: stamped(source, blocks, options.now ?? nowISO()),
  };
}

/**
 * Remove one reference entry by its STABLE id (down to zero entries —
 * the renderer shows an honest empty state).
 */
export function removeReferenceEntry(
  source: DocStudioDocument,
  blockId: DocUUID,
  entryId: DocUUID,
  options: BlockOpOptions = {},
): StructuralContentActionResult {
  const index = indexOfBlock(source, blockId);
  if (index < 0) {
    return reject('missing-block', 'The reference block to edit no longer exists in this document.');
  }
  const block = source.blocks[index];
  if (block.data.type !== 'reference') {
    return reject('wrong-block-type', 'This block is not a reference block.');
  }
  const data = block.data;
  if (!data.entries.some((entry) => entry.id === entryId)) {
    return reject('missing-entry', 'The reference entry to remove no longer exists.');
  }
  const updated = {
    ...block,
    data: { ...data, entries: data.entries.filter((entry) => entry.id !== entryId) },
  };
  const blocks = [...source.blocks];
  blocks[index] = updated;
  return { ok: true, changed: true, blockId, doc: stamped(source, blocks, options.now ?? nowISO()) };
}

// ─────────────────────────────────────────────────────────────────────────────
// Exhibit / annexure (P06-M2 §5.7)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Update the identified EXHIBIT block.
 *
 * Validation: `label` must be non-empty (`invalid-label`); `title` and
 * `notes` accept any text (`null` clears); `assetId` is `null` to
 * clear, otherwise it must reference an asset that EXISTS in this
 * document and carries an image MIME type (`invalid-asset`) — the
 * present asset contract is image-oriented; PDF attachments are not
 * part of schema v1 (image workflows belong to P06-M4).
 */
export function updateExhibitContent(
  source: DocStudioDocument,
  blockId: DocUUID,
  patch: ExhibitPatch,
  options: BlockOpOptions = {},
): StructuralContentActionResult {
  const index = indexOfBlock(source, blockId);
  if (index < 0) {
    return reject('missing-block', 'The exhibit block to edit no longer exists in this document.');
  }
  const block = source.blocks[index];
  if (block.data.type !== 'exhibit') {
    return reject('wrong-block-type', 'This block is not an exhibit block.');
  }
  const data = block.data;

  const next: ExhibitBlockData = { ...data };
  let changed = false;

  if (patch.label !== undefined) {
    if (!isFreeText(patch.label) || patch.label.trim() === '') {
      return reject('invalid-label', 'An exhibit needs a label, for example "Exhibit A".');
    }
    if (next.label !== patch.label) {
      next.label = patch.label;
      changed = true;
    }
  }
  if (patch.title !== undefined) {
    // Explicit branches (see the section-break action for why).
    let value: string | undefined;
    if (patch.title === null) {
      value = undefined;
    } else if (isFreeText(patch.title)) {
      value = patch.title === '' ? undefined : patch.title;
    } else {
      return reject('invalid-text', 'An exhibit title must be text.');
    }
    if ((value ?? '') !== (data.title ?? '')) {
      if (value === undefined) delete next.title;
      else next.title = value;
      changed = true;
    }
  }
  if (patch.notes !== undefined) {
    // Explicit branches (see the section-break action for why).
    let value: string | undefined;
    if (patch.notes === null) {
      value = undefined;
    } else if (isFreeText(patch.notes)) {
      value = patch.notes === '' ? undefined : patch.notes;
    } else {
      return reject('invalid-text', 'Exhibit notes must be text.');
    }
    if ((value ?? '') !== (data.notes ?? '')) {
      if (value === undefined) delete next.notes;
      else next.notes = value;
      changed = true;
    }
  }
  if (patch.assetId !== undefined) {
    if (patch.assetId === null) {
      if (next.assetId !== undefined) {
        delete next.assetId;
        changed = true;
      }
    } else {
      if (typeof patch.assetId !== 'string' || patch.assetId.trim() === '') {
        return reject('invalid-asset', 'An exhibit asset reference must be an asset identifier.');
      }
      const asset = source.assets[patch.assetId];
      if (asset === undefined) {
        return reject(
          'invalid-asset',
          'That asset does not exist in this document — choose an embedded image asset or clear the reference.',
        );
      }
      if (!asset.mimeType.startsWith('image/')) {
        return reject(
          'invalid-asset',
          'Only embedded image assets can be attached to an exhibit in this version (file attachments are not supported yet).',
        );
      }
      if (next.assetId !== patch.assetId) {
        next.assetId = patch.assetId;
        changed = true;
      }
    }
  }

  if (!changed) {
    return { ok: true, doc: source, changed: false, blockId };
  }
  const updated = { ...block, data: next };
  const blocks = [...source.blocks];
  blocks[index] = updated;
  return { ok: true, changed: true, blockId, doc: stamped(source, blocks, options.now ?? nowISO()) };
}

// ─────────────────────────────────────────────────────────────────────────────
// Dispatcher
// ─────────────────────────────────────────────────────────────────────────────

/**
 * One dispatcher for the structural editors (same narrow-prop pattern as
 * the P05-M3 list and P05-M4 table dispatchers): every action keeps its
 * own validation above, the App wires exactly one callback.
 */
export function applyStructuralAction(
  source: DocStudioDocument,
  blockId: DocUUID,
  action: StructuralContentAction,
  options: BlockOpOptions = {},
): StructuralContentActionResult {
  switch (action.action) {
    case 'update-horizontal-line':
      return updateHorizontalLineContent(source, blockId, action, options);
    case 'update-section-break':
      return updateSectionBreakContent(source, blockId, action, options);
    case 'set-metadata-fields':
      return setMetadataBlockFields(source, blockId, action.fields, options);
    case 'add-revision-entry':
      return addRevisionEntry(source, blockId, options);
    case 'update-revision-entry':
      return updateRevisionEntry(source, blockId, action.entryId, action.patch, options);
    case 'remove-revision-entry':
      return removeRevisionEntry(source, blockId, action.entryId, options);
    case 'update-reference-title':
      return updateReferenceTitle(source, blockId, action, options);
    case 'add-reference-entry':
      return addReferenceEntry(source, blockId, options);
    case 'update-reference-entry':
      return updateReferenceEntry(source, blockId, action.entryId, action.patch, options);
    case 'remove-reference-entry':
      return removeReferenceEntry(source, blockId, action.entryId, options);
    case 'update-exhibit':
      return updateExhibitContent(source, blockId, action.patch, options);
    default:
      return reject('invalid-action', 'That structural block action is not supported.');
  }
}
