/**
 * DocStudio — Immutable heading & paragraph content actions (P05-M2)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * `project_details.md` §5.1 requires block CONTENT edits to live in the
 * document model ("Keep block content in the document model, not only in
 * a component's transient state").  This module extends the P05-M1
 * `block-actions` conventions (same file-level rules) with the two
 * content editors delivered by this checkpoint:
 *
 * • `updateHeadingContent`  — H1–H4 level, plain text, numbered/plain
 *   mode and alignment (§10.1).
 * • `updateParagraphContent` — inline spans (via the pure `rich-text`
 *   algebra), four-way alignment incl. justify, and indent level (§10.2).
 *
 * Conventions inherited from `block-actions`
 * ─────────────────────────────────────────
 * • Immutable: a NEW document is returned; inputs are never mutated.
 * • No-op patches return the SAME document reference (no false Modified
 *   status, no `modifiedAt` churn).
 * • Real changes stamp `metadata.modifiedAt = now`.
 * • Failures return `{ ok: false, code, message }`; the document is
 *   never partially changed.  Every value is validated BEFORE commit —
 *   invalid input is rejected with an understandable message, never
 *   silently coerced or clamped.
 * • Block identity is the stable `ContentBlock.id`.
 * • Optional `now`/`genId` injection keeps tests deterministic.
 *
 * All span INPUT is passed through `normalizeSpans` (rich-text.ts) on
 * the way in, so unsafe hrefs and malformed colours can never be stored
 * — sanitisation happens at the model boundary, not only in the UI.
 *
 * @module services/block-content
 */

import type {
  HeadingBlockData,
  InlineSpan,
  ParagraphAlignment,
  ParagraphBlockData,
} from '../types/blocks';
import type { ContentBlock, DocStudioDocument, DocUUID, HAlignment } from '../types/document';
import { nowISO } from '../types/defaults';
import { indexOfBlock, stamped, type BlockOpOptions } from './block-actions';
import { HEADING_LEVELS } from './heading-numbering';
import { normalizeSpans } from './rich-text';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

/** Heading levels supported by §10.1 — re-exported from the single
 *  authoritative definition in `heading-numbering`. */
export { HEADING_LEVELS };

/** Maximum paragraph indent level (§10.2 "Indentation"). */
export const MAX_PARAGRAPH_INDENT = 8;

const HEADING_LEVEL_ERROR = 'invalid-level';
const HEADING_TEXT_ERROR = 'invalid-text';
const NUMBERED_ERROR = 'invalid-numbered';
const ALIGN_ERROR = 'invalid-alignment';
const INDENT_ERROR = 'invalid-indent';
const SPANS_ERROR = 'invalid-spans';

/** Deterministic failure codes for content operations. */
export type ContentErrorCode =
  | 'missing-block'
  | 'not-a-heading'
  | 'not-a-paragraph'
  | typeof HEADING_LEVEL_ERROR
  | typeof HEADING_TEXT_ERROR
  | typeof NUMBERED_ERROR
  | typeof ALIGN_ERROR
  | typeof INDENT_ERROR
  | typeof SPANS_ERROR;

/**
 * Outcome of a content operation — same shape as `BlockActionResult`
 * (P05-M1) so the editor panel handles both identically.
 */
export type ContentActionResult =
  | { ok: true; doc: DocStudioDocument; changed: boolean; blockId: DocUUID }
  | { ok: false; code: ContentErrorCode; message: string };

const reject = (code: ContentErrorCode, message: string): ContentActionResult => ({
  ok: false,
  code,
  message,
});

// ─────────────────────────────────────────────────────────────────────────────
// Validation helpers
// ─────────────────────────────────────────────────────────────────────────────

const HEADING_ALIGNMENTS: readonly HAlignment[] = ['left', 'center', 'right'];
const PARAGRAPH_ALIGNMENTS: readonly ParagraphAlignment[] = [
  'left',
  'center',
  'right',
  'justify',
];

function isHeadingLevel(value: unknown): value is 1 | 2 | 3 | 4 {
  return value === 1 || value === 2 || value === 3 || value === 4;
}

// ─────────────────────────────────────────────────────────────────────────────
// Heading content (§10.1)
// ─────────────────────────────────────────────────────────────────────────────

/** Patch fields for a heading block.  Absent fields are never touched. */
export interface HeadingContentPatch {
  level?: unknown;
  text?: unknown;
  numbered?: unknown;
  hAlign?: unknown;
}

/**
 * Update the content of the identified HEADING block.
 *
 * Validation (all BEFORE commit; a rejected patch leaves the document
 * untouched):
 * • `level`   — must be 1, 2, 3 or 4 (`invalid-level`).
 * • `text`    — must be a string; any string value is accepted
 *               including the empty string (`invalid-text`).
 * • `numbered`— must be a boolean (`invalid-numbered`).
 * • `hAlign`  — 'left' | 'center' | 'right' (`invalid-alignment`).
 *
 * A patch whose fields all equal the current values is a same-reference
 * no-op.  On a real change only the listed fields change: the block's
 * ID, spacing, order and every other block are untouched.
 */
export function updateHeadingContent(
  source: DocStudioDocument,
  blockId: DocUUID,
  patch: HeadingContentPatch,
  options: BlockOpOptions = {},
): ContentActionResult {
  const index = indexOfBlock(source, blockId);
  if (index < 0) {
    return reject('missing-block', 'The heading to edit no longer exists in this document.');
  }
  const block = source.blocks[index];
  if (block.data.type !== 'heading') {
    return reject('not-a-heading', 'This block is not a heading and cannot be edited as one.');
  }
  const data = block.data;

  // Validate every supplied field first; nothing is applied on failure.
  const next: HeadingBlockData = { ...data };
  let changed = false;

  if (patch.level !== undefined) {
    if (!isHeadingLevel(patch.level)) {
      return reject(HEADING_LEVEL_ERROR, 'Heading level must be 1 (H1), 2 (H2), 3 (H3) or 4 (H4).');
    }
    if (data.level !== patch.level) {
      next.level = patch.level;
      changed = true;
    }
  }
  if (patch.text !== undefined) {
    if (typeof patch.text !== 'string') {
      return reject(HEADING_TEXT_ERROR, 'Heading text must be text.');
    }
    if (data.text !== patch.text) {
      next.text = patch.text;
      changed = true;
    }
  }
  if (patch.numbered !== undefined) {
    if (typeof patch.numbered !== 'boolean') {
      return reject(NUMBERED_ERROR, 'Numbered must be turned on or off.');
    }
    if (data.numbered !== patch.numbered) {
      next.numbered = patch.numbered;
      changed = true;
    }
  }
  if (patch.hAlign !== undefined) {
    if (!HEADING_ALIGNMENTS.includes(patch.hAlign as HAlignment)) {
      return reject(
        ALIGN_ERROR,
        'Heading alignment must be left, center or right.',
      );
    }
    if (data.hAlign !== patch.hAlign) {
      next.hAlign = patch.hAlign as HAlignment;
      changed = true;
    }
  }

  if (!changed) {
    return { ok: true, doc: source, changed: false, blockId };
  }

  const updated: ContentBlock = { ...block, data: next };
  const blocks = [...source.blocks];
  blocks[index] = updated;
  return {
    ok: true,
    changed: true,
    blockId,
    doc: stamped(source, blocks, options.now ?? nowISO()),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Paragraph content (§10.2)
// ─────────────────────────────────────────────────────────────────────────────

/** Patch fields for a paragraph block.  Absent fields are never touched. */
export interface ParagraphContentPatch {
  spans?: unknown;
  hAlign?: unknown;
  indentLevel?: unknown;
}

/**
 * Update the content of the identified PARAGRAPH block.
 *
 * Validation (all BEFORE commit):
 * • `spans`       — must be an array of span records; it is normalised
 *                   through `normalizeSpans` (empty runs dropped,
 *                   neighbours merged, unsafe hrefs REMOVED, malformed
 *                   colours dropped) before comparison/commit
 *                   (`invalid-spans` only for non-arrays).
 * • `hAlign`      — 'left' | 'center' | 'right' | 'justify'
 *                   (`invalid-alignment`).
 * • `indentLevel` — integer 0…MAX_PARAGRAPH_INDENT (`invalid-indent`).
 *
 * Same-reference no-op semantics and immutability match
 * `updateHeadingContent`.
 */
export function updateParagraphContent(
  source: DocStudioDocument,
  blockId: DocUUID,
  patch: ParagraphContentPatch,
  options: BlockOpOptions = {},
): ContentActionResult {
  const index = indexOfBlock(source, blockId);
  if (index < 0) {
    return reject('missing-block', 'The paragraph to edit no longer exists in this document.');
  }
  const block = source.blocks[index];
  if (block.data.type !== 'paragraph') {
    return reject('not-a-paragraph', 'This block is not a paragraph and cannot be edited as one.');
  }
  const data = block.data;

  const next: ParagraphBlockData = { ...data };
  let changed = false;

  if (patch.spans !== undefined) {
    if (!Array.isArray(patch.spans)) {
      return reject(SPANS_ERROR, 'Paragraph text must be a list of text runs.');
    }
    const normalized = normalizeSpans(patch.spans as readonly InlineSpan[]);
    if (JSON.stringify(normalized) !== JSON.stringify(data.spans)) {
      next.spans = normalized;
      changed = true;
    }
  }
  if (patch.hAlign !== undefined) {
    if (!PARAGRAPH_ALIGNMENTS.includes(patch.hAlign as ParagraphAlignment)) {
      return reject(
        ALIGN_ERROR,
        'Paragraph alignment must be left, center, right or justify.',
      );
    }
    if (data.hAlign !== patch.hAlign) {
      next.hAlign = patch.hAlign as ParagraphAlignment;
      changed = true;
    }
  }
  if (patch.indentLevel !== undefined) {
    const level = patch.indentLevel;
    if (
      typeof level !== 'number' ||
      !Number.isInteger(level) ||
      level < 0 ||
      level > MAX_PARAGRAPH_INDENT
    ) {
      return reject(
        INDENT_ERROR,
        `Indent level must be a whole number between 0 and ${MAX_PARAGRAPH_INDENT}.`,
      );
    }
    if (data.indentLevel !== level) {
      next.indentLevel = level;
      changed = true;
    }
  }

  if (!changed) {
    return { ok: true, doc: source, changed: false, blockId };
  }

  const updated: ContentBlock = { ...block, data: next };
  const blocks = [...source.blocks];
  blocks[index] = updated;
  return {
    ok: true,
    changed: true,
    blockId,
    doc: stamped(source, blocks, options.now ?? nowISO()),
  };
}
