/**
 * DocStudio — Immutable block actions (P05-M1)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Pure, non-mutating document transformations for the modular editor's
 * block framework (roadmap §5.1, project_details.md §10): insertion,
 * duplication, reorder, deletion and spacing updates against the
 * AUTHORITATIVE `doc.blocks` array.
 *
 * Conventions (mirrors `document-actions` / `page-typography`)
 * ─────────────────────────────────────────────────────────────
 * • Every function returns a NEW document object; inputs are never mutated
 *   (arrays/objects are rebuilt, not reused).
 * • No-op outcomes return the SAME document reference so React bails out of
 *   the state update — no false Modified status, no `modifiedAt` churn.
 * • Real changes stamp `metadata.modifiedAt = now` (P02-M3 lifecycle policy:
 *   modifiedAt is stamped by every content/settings change and by save).
 * • Failures return `{ ok: false, code, message }` with an understandable
 *   message; the document is never partially changed.
 * • Block identity is the stable `ContentBlock.id` (a UUID); array indexes
 *   are never used as persistent identities.
 * • The optional `genId`/`now` injection points keep the functions pure and
 *   let verify_p05_m1 use deterministic IDs and a fixed clock.
 *
 * Selection is intentionally NOT part of this module: selection is
 * session state outside the document, so selecting a block can never dirty
 * or alter persisted content (wired in App.tsx).
 *
 * @module block-actions
 */

import type { BlockType } from '../types/blocks';
import type { ContentBlock, DocStudioDocument, DocUUID } from '../types/document';
import { newUUID, nowISO } from '../types/defaults';
import { getBlockRegistryEntry } from './block-registry';

// ─────────────────────────────────────────────────────────────────────────────
// Shared types
// ─────────────────────────────────────────────────────────────────────────────

/** Injectable block-ID generator (tests supply deterministic sequences). */
export type IdGenerator = () => DocUUID;

/** Injection points for a block operation's clock and ID source. */
export interface BlockOpOptions {
  /** ISO timestamp stamped as `modifiedAt` on a real change. */
  now?: string;
  /** Generator for the created block's envelope ID (insert/duplicate). */
  genId?: IdGenerator;
}

/** Where a new block lands in the document's block list. */
export type BlockPlacement =
  | { kind: 'start' }
  | { kind: 'end' }
  | { kind: 'at'; index: number }
  | { kind: 'before'; blockId: DocUUID }
  | { kind: 'after'; blockId: DocUUID };

/** Which spacing field of a block is being edited (points). */
export type BlockSpacingField = 'topPt' | 'bottomPt';

/** Deterministic failure codes for block operations. */
export type BlockErrorCode =
  | 'unknown-block-type'
  | 'missing-block'
  | 'invalid-index'
  | 'invalid-placement'
  | 'at-boundary'
  | 'invalid-spacing';

/**
 * Outcome of a block operation: applied (changed or no-op) or rejected.
 * On success, `blockId` is the newly created block (insert/duplicate) or
 * the operated-on block, when one is meaningful for the caller.
 */
export type BlockActionResult =
  | { ok: true; doc: DocStudioDocument; changed: boolean; blockId: DocUUID }
  | { ok: false; code: BlockErrorCode; message: string };

const reject = (code: BlockErrorCode, message: string): BlockActionResult => ({
  ok: false,
  code,
  message,
});

/** Rebuild the document with new blocks + a freshly stamped modifiedAt. */
const stamped = (
  source: DocStudioDocument,
  blocks: ContentBlock[],
  now: string,
): DocStudioDocument => ({
  ...source,
  blocks,
  metadata: { ...source.metadata, modifiedAt: now },
});

const indexOfBlock = (doc: DocStudioDocument, blockId: DocUUID): number =>
  doc.blocks.findIndex((block) => block.id === blockId);

// ─────────────────────────────────────────────────────────────────────────────
// Creation
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Create a fresh, schema-valid block of the given type via the registry's
 * default factory.  `genId` replaces the envelope ID with a deterministic
 * one (tests); nested entity IDs inside block data always come from the
 * factory's own `newUUID()` calls and are never asserted by value.
 *
 * @throws RangeError when `type` is not a registered block type — an
 * authoring mistake must fail loudly, never silently insert a broken block.
 */
export function createBlock(type: BlockType, genId?: IdGenerator): ContentBlock {
  const entry = getBlockRegistryEntry(type);
  if (entry === undefined) {
    throw new RangeError(`"${String(type)}" is not a registered block type.`);
  }
  const block = entry.createDefault();
  // Registry invariant: an entry must never produce another type's data.
  if (block.data.type !== entry.type) {
    throw new Error(
      `Registry invariant violated: entry "${entry.type}" produced "${block.data.type}" data.`,
    );
  }
  return genId !== undefined ? { ...block, id: genId() } : block;
}

// ─────────────────────────────────────────────────────────────────────────────
// Insertion
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Insert a new block of `type` at `placement` in the authoritative
 * document.  Existing blocks keep their IDs, content and order; the new
 * block receives a fresh stable ID (or the injected one).
 */
export function insertBlock(
  source: DocStudioDocument,
  type: BlockType,
  placement: BlockPlacement,
  options: BlockOpOptions = {},
): BlockActionResult {
  const entry = getBlockRegistryEntry(type);
  if (entry === undefined) {
    return reject('unknown-block-type', `"${String(type)}" is not a supported block type.`);
  }

  const blocks = source.blocks;
  let index: number;
  switch (placement.kind) {
    case 'start':
      index = 0;
      break;
    case 'end':
      index = blocks.length;
      break;
    case 'at': {
      const target = placement.index;
      if (!Number.isInteger(target) || target < 0 || target > blocks.length) {
        return reject(
          'invalid-index',
          `Position ${String(target)} is outside this document (${blocks.length} block(s)).`,
        );
      }
      index = target;
      break;
    }
    case 'before':
    case 'after': {
      const found = indexOfBlock(source, placement.blockId);
      if (found < 0) {
        return reject(
          'missing-block',
          'The referenced block no longer exists in this document.',
        );
      }
      index = placement.kind === 'before' ? found : found + 1;
      break;
    }
    default:
      return reject('invalid-placement', 'The requested insertion position is not valid.');
  }

  const block = createBlock(type, options.genId);
  const next = [...blocks];
  next.splice(index, 0, block);

  return {
    ok: true,
    changed: true,
    blockId: block.id,
    doc: stamped(source, next, options.now ?? nowISO()),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Duplication
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Duplicate the identified block into an independent copy placed directly
 * after the source.  The copy gets a NEW stable envelope ID; its content
 * and spacing are deep-cloned by value (structuredClone), so later edits,
 * moves or deletions of the duplicate can never mutate the original (and
 * vice versa).  Nested entity IDs (list items, table cells, …) are copied
 * by value — identity within each block is scoped to that block.
 */
export function duplicateBlock(
  source: DocStudioDocument,
  blockId: DocUUID,
  options: BlockOpOptions = {},
): BlockActionResult {
  const index = indexOfBlock(source, blockId);
  if (index < 0) {
    return reject('missing-block', 'The block to duplicate no longer exists in this document.');
  }

  const original = source.blocks[index];
  const copyId = options.genId !== undefined ? options.genId() : newUUID();
  const duplicate: ContentBlock = { ...structuredClone(original), id: copyId };

  const next = [...source.blocks];
  next.splice(index + 1, 0, duplicate);

  return {
    ok: true,
    changed: true,
    blockId: copyId,
    doc: stamped(source, next, options.now ?? nowISO()),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Reordering
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Move the identified block one position up or down.  The block keeps its
 * ID, content and spacing; every other block is untouched (same object
 * references in the returned document).  Moving past the first/last
 * position is an explicit `at-boundary` error — the document never changes.
 */
export function reorderBlock(
  source: DocStudioDocument,
  blockId: DocUUID,
  direction: 'up' | 'down',
  options: BlockOpOptions = {},
): BlockActionResult {
  const index = indexOfBlock(source, blockId);
  if (index < 0) {
    return reject('missing-block', 'The block to move no longer exists in this document.');
  }

  const target = direction === 'up' ? index - 1 : index + 1;
  if (target < 0 || target >= source.blocks.length) {
    return reject(
      'at-boundary',
      direction === 'up'
        ? 'The block is already the first block in the document.'
        : 'The block is already the last block in the document.',
    );
  }

  const next = [...source.blocks];
  [next[index], next[target]] = [next[target], next[index]];

  return {
    ok: true,
    changed: true,
    blockId,
    doc: stamped(source, next, options.now ?? nowISO()),
  };
}

/**
 * Move the identified block to an absolute position (drag-and-drop style
 * reordering may use this; the buttons use `reorderBlock`).  Out-of-range
 * positions are rejected; moving to the current position is a same-reference
 * no-op.
 */
export function moveBlockTo(
  source: DocStudioDocument,
  blockId: DocUUID,
  toIndex: number,
  options: BlockOpOptions = {},
): BlockActionResult {
  const index = indexOfBlock(source, blockId);
  if (index < 0) {
    return reject('missing-block', 'The block to move no longer exists in this document.');
  }
  if (!Number.isInteger(toIndex) || toIndex < 0 || toIndex >= source.blocks.length) {
    return reject(
      'invalid-index',
      `Position ${String(toIndex)} is outside this document (${source.blocks.length} block(s)).`,
    );
  }
  if (toIndex === index) {
    return { ok: true, doc: source, changed: false, blockId };
  }

  const next = [...source.blocks];
  const [moved] = next.splice(index, 1);
  next.splice(toIndex, 0, moved);

  return {
    ok: true,
    changed: true,
    blockId,
    doc: stamped(source, next, options.now ?? nowISO()),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Deletion
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Delete exactly the identified block.  Neighbors are untouched (same
 * object references); deleting the only block leaves a valid empty
 * document (`blocks: []`) rather than an error.  A missing ID is an
 * explicit `missing-block` error — never a silent success.
 */
export function deleteBlock(
  source: DocStudioDocument,
  blockId: DocUUID,
  options: BlockOpOptions = {},
): BlockActionResult {
  const index = indexOfBlock(source, blockId);
  if (index < 0) {
    return reject('missing-block', 'The block to delete no longer exists in this document.');
  }

  const next = [...source.blocks];
  next.splice(index, 1);

  return {
    ok: true,
    changed: true,
    blockId,
    doc: stamped(source, next, options.now ?? nowISO()),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Spacing
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Update `spacing.topPt` or `spacing.bottomPt` of the identified block.
 *
 * Values must be finite and ≥ 0 (points); negative, NaN, infinite and
 * otherwise invalid input is rejected with an understandable message and
 * the document is untouched — invalid input is never silently coerced or
 * clamped.  Re-entering the current value is a same-reference no-op.  On a
 * real change only the one spacing field changes: the block's ID, content,
 * order and its other spacing value are preserved.
 */
export function updateBlockSpacing(
  source: DocStudioDocument,
  blockId: DocUUID,
  field: BlockSpacingField,
  value: number,
  options: BlockOpOptions = {},
): BlockActionResult {
  if (field !== 'topPt' && field !== 'bottomPt') {
    return reject('invalid-spacing', 'Spacing field must be "topPt" or "bottomPt".');
  }
  const label = field === 'topPt' ? 'Spacing above' : 'Spacing below';
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return reject('invalid-spacing', `${label} must be a number of points, for example 12.`);
  }
  if (value < 0) {
    return reject('invalid-spacing', `${label} cannot be negative — enter 0 pt or more.`);
  }

  const index = indexOfBlock(source, blockId);
  if (index < 0) {
    return reject('missing-block', 'The block to adjust no longer exists in this document.');
  }

  const block = source.blocks[index];
  if (block.spacing[field] === value) {
    return { ok: true, doc: source, changed: false, blockId };
  }

  const updated: ContentBlock = { ...block, spacing: { ...block.spacing, [field]: value } };
  const next = [...source.blocks];
  next[index] = updated;

  return {
    ok: true,
    changed: true,
    blockId,
    doc: stamped(source, next, options.now ?? nowISO()),
  };
}
