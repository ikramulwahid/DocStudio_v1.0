/**
 * DocStudio — Immutable list & callout content actions (P05-M3)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * `project_details.md` §10.3/§10.4 require the callout and list blocks to
 * be genuinely editable content, not structural summaries.  This module
 * extends the P05-M1 `block-actions` / P05-M2 `block-content`
 * conventions (same file-level rules) with the operations this
 * checkpoint delivers:
 *
 * LIST (§10.4)
 * • `updateListSettings`  — list type, bullet style, numbering style and
 *   the P05-M3 bullet marker-source policy.
 * • `updateListItemText`  — one item's spans (normalised at the boundary).
 * • `addListItem`         — insert after an anchor item (or append).
 * • `removeListItem`      — remove exactly the addressed item.
 * • `moveListItem`        — move up/down, subtree-aware for nesting.
 * • `moveListItemTo`      — move to an explicit valid position.
 * • `indentListItem` / `outdentListItem` — nesting depth ±1 (subtree).
 * • `setItemChecked`      — checklist state (checklists only).
 * • `applyListContentAction` — dispatcher used by the editor panel.
 *
 * CALLOUT (§10.3)
 * • `updateCalloutContent` — semantic variant, optional title (clearable)
 *   and body spans.
 *
 * Conventions inherited from `block-actions`
 * ─────────────────────────────────────────
 * • Immutable: a NEW document is returned; inputs are never mutated.
 * • No-op operations return the SAME document reference (no false
 *   Modified status, no `modifiedAt` churn).
 * • Real changes stamp `metadata.modifiedAt = now`.
 * • Failures return `{ ok: false, code, message }`; the document is never
 *   partially changed.  Every value is validated BEFORE commit.
 * • Block identity is the stable `ContentBlock.id`; item identity is the
 *   stable `ListItem.id` — never a persistent array index alone.
 * • Optional `now`/`genId` injection keeps tests deterministic.
 *
 * Documented policies (tested in `verify_p05_m3.mjs`)
 * ──────────────────────────────────────────────────
 * • CHECKED STATE ACROSS LIST-TYPE CHANGES: the `checked` field is inert
 *   unless `listType === 'checklist'`, but it is NEVER deleted by a type
 *   switch.  Switching away from checklist and back therefore restores
 *   the previous states; switching TO checklist ensures every item has a
 *   boolean (`checked: false` where absent) so nothing is undefined.
 *   New checklist items start unchecked.  Unrelated edits (text, move,
 *   indent, settings) always preserve `checked`.
 * • MOVEMENT IS SUBTREE-AWARE: moving an item relocates its whole
 *   subtree (the item plus its contiguous deeper followers), so children
 *   never detach from their parent by a reorder.  A move only targets a
 *   SIBLING — the nearest item at the same depth in that direction; an
 *   ancestor reached first means `at-boundary`.  Indent/outdent shift
 *   the subtree the same way, preserving IDs, spans and `checked`.
 * • SPAN INPUT is passed through `normalizeSpans` (rich-text.ts) on the
 *   way in, so unsafe hrefs and malformed colours can never be stored.
 *
 * @module services/list-callout-content
 */

import type {
  BulletStyle,
  CalloutBlockData,
  InlineSpan,
  ListBlockData,
  ListItem,
  ListType,
  NumberStyle,
} from '../types/blocks';
import type { DocStudioDocument, DocUUID } from '../types/document';
import { newUUID } from '../types/defaults';
import { indexOfBlock, stamped, type BlockOpOptions } from './block-actions';
import { MAX_LIST_DEPTH } from './list-numbering';
import { normalizeSpans } from './rich-text';

export { MAX_LIST_DEPTH };

// ─────────────────────────────────────────────────────────────────────────────
// Runtime constant tables (validation + editor selects share these)
// ─────────────────────────────────────────────────────────────────────────────

/** Supported list types (§10.4). */
export const LIST_TYPES: readonly ListType[] = ['bullet', 'numbered', 'checklist'];

/** Supported bullet marker styles (§10.4). */
export const BULLET_STYLES: readonly BulletStyle[] = ['disc', 'circle', 'square', 'dash', 'arrow'];

/** Supported numbering styles (§10.4). */
export const NUMBER_STYLES: readonly NumberStyle[] = [
  'decimal',
  'lower-alpha',
  'upper-alpha',
  'lower-roman',
  'upper-roman',
];

/** Bullet marker sources (P05-M3 policy — see `ListBlockData.markerSource`). */
export const LIST_MARKER_SOURCES: readonly ('theme' | 'block')[] = ['theme', 'block'];

/** Maximum stored callout variant length (sanity bound, not a schema limit). */
export const MAX_CALLOUT_VARIANT_LENGTH = 40;

/** Maximum stored callout title length (sanity bound). */
export const MAX_CALLOUT_TITLE_LENGTH = 120;

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

/** Deterministic failure codes for list operations. */
export type ListContentErrorCode =
  | 'missing-block'
  | 'not-a-list'
  | 'invalid-list-type'
  | 'invalid-bullet-style'
  | 'invalid-number-style'
  | 'invalid-marker-source'
  | 'missing-item'
  | 'invalid-spans'
  | 'invalid-depth'
  | 'depth-limit'
  | 'at-depth-zero'
  | 'at-boundary'
  | 'invalid-index'
  | 'invalid-checked'
  | 'not-a-checklist'
  | 'invalid-move-direction'
  | 'invalid-action';

/** Deterministic failure codes for callout operations. */
export type CalloutContentErrorCode =
  | 'missing-block'
  | 'not-a-callout'
  | 'invalid-variant'
  | 'invalid-title'
  | 'invalid-spans';

/**
 * Outcome of a list operation — the `BlockActionResult` shape (P05-M1)
 * plus an optional `itemId` so the editor panel can move keyboard focus
 * to a newly added or addressed item.
 */
export type ListContentActionResult =
  | { ok: true; doc: DocStudioDocument; changed: boolean; blockId: DocUUID; itemId?: DocUUID }
  | { ok: false; code: ListContentErrorCode; message: string };

/** Outcome of a callout operation (same shape as P05-M2 content results). */
export type CalloutContentActionResult =
  | { ok: true; doc: DocStudioDocument; changed: boolean; blockId: DocUUID }
  | { ok: false; code: CalloutContentErrorCode; message: string };

/** List-level settings patch (`updateListSettings`). */
export interface ListSettingsPatch {
  listType?: ListType;
  bulletStyle?: BulletStyle;
  numberStyle?: NumberStyle;
  markerSource?: 'theme' | 'block';
}

/** Callout content patch (`updateCalloutContent`). */
export interface CalloutContentPatch {
  /** Semantic variant; must be a non-empty trimmed string. */
  variant?: string;
  /** Optional title; `null` (or an empty string) removes it deliberately. */
  title?: string | null;
  /** Body text runs; normalised through `normalizeSpans`. */
  spans?: readonly InlineSpan[];
}

/** Editor-panel action union dispatched through `applyListContentAction`. */
export type ListContentAction =
  | { kind: 'settings'; patch: ListSettingsPatch }
  | { kind: 'item-text'; itemId: DocUUID; spans: readonly InlineSpan[] }
  | { kind: 'item-add'; afterItemId: DocUUID | null }
  | { kind: 'item-remove'; itemId: DocUUID }
  | { kind: 'item-move'; itemId: DocUUID; direction: 'up' | 'down' }
  | { kind: 'item-move-to'; itemId: DocUUID; index: number }
  | { kind: 'item-indent'; itemId: DocUUID }
  | { kind: 'item-outdent'; itemId: DocUUID }
  | { kind: 'item-checked'; itemId: DocUUID; checked: boolean };

const rejectList = (code: ListContentErrorCode, message: string): ListContentActionResult => ({
  ok: false,
  code,
  message,
});

const rejectCallout = (
  code: CalloutContentErrorCode,
  message: string,
): CalloutContentActionResult => ({ ok: false, code, message });

// ─────────────────────────────────────────────────────────────────────────────
// Shared helpers
// ─────────────────────────────────────────────────────────────────────────────

/** Locate the addressed list block or fail deterministically. */
type RequireListResult =
  | { ok: true; index: number; data: ListBlockData }
  | { ok: false; code: ListContentErrorCode; message: string };

/**
 * Explicit narrowing predicate (P05-M2 precedent): the verify scripts'
 * standalone tsc compiles WITHOUT strict flags, where truthiness checks
 * on `ok` do not narrow the union.
 */
function isListFailure(
  result: RequireListResult,
): result is { ok: false; code: ListContentErrorCode; message: string } {
  return result.ok === false;
}

function requireList(source: DocStudioDocument, blockId: DocUUID): RequireListResult {
  const index = indexOfBlock(source, blockId);
  if (index < 0) {
    return {
      ok: false,
      code: 'missing-block',
      message: 'The list to edit no longer exists in this document.',
    };
  }
  const data = source.blocks[index].data;
  if (data.type !== 'list') {
    return {
      ok: false,
      code: 'not-a-list',
      message: 'This block is not a list and cannot be edited as one.',
    };
  }
  return { ok: true, index, data };
}

/** Index of a stable item ID, or -1. */
const itemIndex = (data: ListBlockData, itemId: DocUUID): number =>
  data.items.findIndex((item) => item.id === itemId);

/** Same-reference no-op detection (P05-M2 convention). */
const sameValue = (a: unknown, b: unknown): boolean =>
  JSON.stringify(a) === JSON.stringify(b);

/**
 * Contiguous subtree of the item at `index`: the item itself plus every
 * immediately following item at a GREATER depth (its nested followers).
 */
function subtreeEnd(items: readonly ListItem[], index: number): number {
  const depth = items[index].depth;
  let end = index + 1;
  while (end < items.length && items[end].depth > depth) end += 1;
  return end;
}

/** Rebuild a list block with new items, preserving every other field. */
const withItems = (data: ListBlockData, items: ListItem[]): ListBlockData => ({
  ...data,
  items,
});

// ─────────────────────────────────────────────────────────────────────────────
// List-level settings
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Update list-level settings: `listType`, `bulletStyle`, `numberStyle`
 * and/or the `markerSource` policy.  Every provided field is validated
 * BEFORE commit (see module doc for the checked-state policy).
 */
export function updateListSettings(
  source: DocStudioDocument,
  blockId: DocUUID,
  patch: ListSettingsPatch,
  options: BlockOpOptions = {},
): ListContentActionResult {
  const found = requireList(source, blockId);
  if (isListFailure(found)) return rejectList(found.code, found.message);
  const data = found.data;

  if (patch.listType !== undefined && !LIST_TYPES.includes(patch.listType)) {
    return rejectList(
      'invalid-list-type',
      'List type must be bullet, numbered or checklist.',
    );
  }
  if (patch.bulletStyle !== undefined && !BULLET_STYLES.includes(patch.bulletStyle)) {
    return rejectList(
      'invalid-bullet-style',
      'Bullet style must be disc, circle, square, dash or arrow.',
    );
  }
  if (patch.numberStyle !== undefined && !NUMBER_STYLES.includes(patch.numberStyle)) {
    return rejectList(
      'invalid-number-style',
      'Numbering style must be decimal, lower-alpha, upper-alpha, lower-roman or upper-roman.',
    );
  }
  if (
    patch.markerSource !== undefined &&
    !LIST_MARKER_SOURCES.includes(patch.markerSource)
  ) {
    return rejectList(
      'invalid-marker-source',
      "Marker source must be 'theme' (body-theme default) or 'block' (explicit style).",
    );
  }

  const next: ListBlockData = { ...data };
  let changed = false;

  if (patch.listType !== undefined && data.listType !== patch.listType) {
    next.listType = patch.listType;
    changed = true;
    if (patch.listType === 'checklist') {
      // Every item must carry a boolean once the list is a checklist;
      // existing states are preserved, absent ones become false.
      next.items = data.items.map((item) =>
        typeof item.checked === 'boolean' ? item : { ...item, checked: false },
      );
    }
    // Switching AWAY from checklist keeps `checked` untouched (inert but
    // preserved — module doc), so switching back restores the states.
  }
  if (patch.bulletStyle !== undefined && data.bulletStyle !== patch.bulletStyle) {
    next.bulletStyle = patch.bulletStyle;
    changed = true;
  }
  if (patch.numberStyle !== undefined && data.numberStyle !== patch.numberStyle) {
    next.numberStyle = patch.numberStyle;
    changed = true;
  }
  if (patch.markerSource !== undefined && data.markerSource !== patch.markerSource) {
    next.markerSource = patch.markerSource;
    changed = true;
  }

  if (!changed || sameValue(next, data)) {
    return { ok: true, doc: source, changed: false, blockId };
  }
  return {
    ok: true,
    doc: stamped(source, source.blocks.map((b, i) => (i === found.index ? { ...b, data: next } : b)), options.now ?? new Date().toISOString()),
    changed: true,
    blockId,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Item content editing
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Replace one item's text runs.  The spans are normalised at the model
 * boundary (unsafe hrefs/malformed colours removed); the item keeps its
 * stable ID, depth and checked state.  Empty text is a deliberate,
 * supported state.
 */
export function updateListItemText(
  source: DocStudioDocument,
  blockId: DocUUID,
  itemId: DocUUID,
  spans: readonly InlineSpan[],
  options: BlockOpOptions = {},
): ListContentActionResult {
  const found = requireList(source, blockId);
  if (isListFailure(found)) return rejectList(found.code, found.message);
  const data = found.data;

  const index = itemIndex(data, itemId);
  if (index < 0) {
    return rejectList('missing-item', 'The list item to edit no longer exists in this list.');
  }
  if (!Array.isArray(spans)) {
    return rejectList('invalid-spans', 'List item text must be a list of text runs.');
  }

  const normalized = normalizeSpans(spans as readonly InlineSpan[]);
  const item = data.items[index];
  if (sameValue(normalized, item.spans)) {
    return { ok: true, doc: source, changed: false, blockId, itemId };
  }

  const items = data.items.slice();
  items[index] = { ...item, spans: normalized };
  return {
    ok: true,
    doc: stamped(
      source,
      source.blocks.map((b, i) => (i === found.index ? { ...b, data: withItems(data, items) } : b)),
      options.now ?? new Date().toISOString(),
    ),
    changed: true,
    blockId,
    itemId,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Item management (add / remove / move / nesting / checklist state)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Add a new EMPTY item after `afterItemId`, or append it at the end of
 * the list when `afterItemId` is `null` (the way an empty list offers its
 * first item).  A new sibling copies the anchor's depth so pressing
 * "add" under a nested item continues that level; appended items sit at
 * depth 0.  The fresh item receives a stable new ID (`genId`, falling
 * back to `newUUID`) and — for checklists — starts unchecked.  The new
 * item's ID is returned as `itemId` for focus management.
 */
export function addListItem(
  source: DocStudioDocument,
  blockId: DocUUID,
  afterItemId: DocUUID | null,
  options: BlockOpOptions = {},
): ListContentActionResult {
  const found = requireList(source, blockId);
  if (isListFailure(found)) return rejectList(found.code, found.message);
  const data = found.data;

  let insertAt = data.items.length;
  let depth = 0;
  if (afterItemId !== null) {
    const anchor = itemIndex(data, afterItemId);
    if (anchor < 0) {
      return rejectList('missing-item', 'The item to add after no longer exists in this list.');
    }
    insertAt = anchor + 1;
    depth = data.items[anchor].depth;
  }

  const newItem: ListItem = {
    id: (options.genId ?? newUUID)(),
    spans: [],
    depth,
    ...(data.listType === 'checklist' ? { checked: false } : {}),
  };
  const items = data.items.slice();
  items.splice(insertAt, 0, newItem);

  return {
    ok: true,
    doc: stamped(
      source,
      source.blocks.map((b, i) => (i === found.index ? { ...b, data: withItems(data, items) } : b)),
      options.now ?? new Date().toISOString(),
    ),
    changed: true,
    blockId,
    itemId: newItem.id,
  };
}

/**
 * Remove exactly the addressed item (its nested followers keep their own
 * depths — removal never silently restructures the rest of the list).
 */
export function removeListItem(
  source: DocStudioDocument,
  blockId: DocUUID,
  itemId: DocUUID,
  options: BlockOpOptions = {},
): ListContentActionResult {
  const found = requireList(source, blockId);
  if (isListFailure(found)) return rejectList(found.code, found.message);
  const data = found.data;

  const index = itemIndex(data, itemId);
  if (index < 0) {
    return rejectList('missing-item', 'The list item to remove no longer exists in this list.');
  }

  const items = data.items.filter((item) => item.id !== itemId);
  return {
    ok: true,
    doc: stamped(
      source,
      source.blocks.map((b, i) => (i === found.index ? { ...b, data: withItems(data, items) } : b)),
      options.now ?? new Date().toISOString(),
    ),
    changed: true,
    blockId,
    itemId,
  };
}

/**
 * Move the addressed item's subtree one position up or down among its
 * SIBLINGS (module doc: subtree-aware, sibling-only).  Everything about
 * the items themselves — IDs, spans, depth, checked state — is
 * preserved; only their order changes.  Reaching the list edge (or an
 * ancestor before a sibling) is a deterministic `at-boundary` rejection.
 */
export function moveListItem(
  source: DocStudioDocument,
  blockId: DocUUID,
  itemId: DocUUID,
  direction: 'up' | 'down',
  options: BlockOpOptions = {},
): ListContentActionResult {
  if (direction !== 'up' && direction !== 'down') {
    return rejectList('invalid-move-direction', 'Move direction must be up or down.');
  }
  const found = requireList(source, blockId);
  if (isListFailure(found)) return rejectList(found.code, found.message);
  const data = found.data;

  const index = itemIndex(data, itemId);
  if (index < 0) {
    return rejectList('missing-item', 'The list item to move no longer exists in this list.');
  }
  const { items } = data;
  const depth = items[index].depth;

  let targetStart: number;
  if (direction === 'up') {
    if (index === 0) {
      return rejectList('at-boundary', 'This item is already the first in the list.');
    }
    // Previous sibling: the nearest earlier item at the SAME depth; an
    // ancestor (shallower) reached first means there is no sibling.
    let cursor = index - 1;
    while (cursor >= 0 && items[cursor].depth > depth) cursor -= 1;
    if (cursor < 0 || items[cursor].depth < depth) {
      return rejectList('at-boundary', 'This item has no sibling above it to move past.');
    }
    targetStart = cursor; // insert before the previous sibling's subtree
  } else {
    const ownEnd = subtreeEnd(items, index);
    if (ownEnd >= items.length) {
      return rejectList('at-boundary', 'This item is already the last in the list.');
    }
    // Next sibling: the first item after this subtree at the same depth;
    // a shallower item (an ancestor) reached first means no sibling.
    let cursor = ownEnd;
    while (cursor < items.length && items[cursor].depth > depth) cursor += 1;
    if (cursor >= items.length || items[cursor].depth < depth) {
      return rejectList('at-boundary', 'This item has no sibling below it to move past.');
    }
    const siblingEnd = subtreeEnd(items, cursor);
    targetStart = siblingEnd; // insert after the next sibling's subtree
  }

  const ownEnd = subtreeEnd(items, index);
  const moving = items.slice(index, ownEnd);
  const rest = [...items.slice(0, index), ...items.slice(ownEnd)];
  // Recompute the insertion point in the REMOVED list: shifting left by
  // the size of the removed run when the target sits after it.
  const insertAt = targetStart > index ? targetStart - moving.length : targetStart;
  const reordered = [...rest.slice(0, insertAt), ...moving, ...rest.slice(insertAt)];

  if (sameValue(reordered.map((item) => item.id), items.map((item) => item.id))) {
    return { ok: true, doc: source, changed: false, blockId, itemId };
  }
  return {
    ok: true,
    doc: stamped(
      source,
      source.blocks.map((b, i) => (i === found.index ? { ...b, data: withItems(data, reordered) } : b)),
      options.now ?? new Date().toISOString(),
    ),
    changed: true,
    blockId,
    itemId,
  };
}

/**
 * Move the addressed item's subtree to an explicit position among the
 * top-level runs of the list (index 0…item count).  The index addresses
 * the ARRAY POSITION the subtree is inserted AT, after the subtree has
 * been lifted out; values outside 0…rest-length are rejected with
 * `invalid-index` before anything is touched.
 */
export function moveListItemTo(
  source: DocStudioDocument,
  blockId: DocUUID,
  itemId: DocUUID,
  index: number,
  options: BlockOpOptions = {},
): ListContentActionResult {
  const found = requireList(source, blockId);
  if (isListFailure(found)) return rejectList(found.code, found.message);
  const data = found.data;

  const itemIdx = itemIndex(data, itemId);
  if (itemIdx < 0) {
    return rejectList('missing-item', 'The list item to move no longer exists in this list.');
  }
  if (typeof index !== 'number' || !Number.isInteger(index) || index < 0) {
    return rejectList('invalid-index', 'Target position must be a whole number of 0 or more.');
  }

  const ownEnd = subtreeEnd(data.items, itemIdx);
  const moving = data.items.slice(itemIdx, ownEnd);
  const rest = [...data.items.slice(0, itemIdx), ...data.items.slice(ownEnd)];
  if (index > rest.length) {
    return rejectList(
      'invalid-index',
      `Target position must be between 0 and ${rest.length} in this list.`,
    );
  }
  const reordered = [...rest.slice(0, index), ...moving, ...rest.slice(index)];

  if (sameValue(reordered.map((item) => item.id), data.items.map((item) => item.id))) {
    return { ok: true, doc: source, changed: false, blockId, itemId };
  }
  return {
    ok: true,
    doc: stamped(
      source,
      source.blocks.map((b, i) =>
        i === found.index ? { ...b, data: withItems(data, reordered) } : b,
      ),
      options.now ?? new Date().toISOString(),
    ),
    changed: true,
    blockId,
    itemId,
  };
}

/**
 * Increase the addressed item's depth by exactly one level; its
 * contiguous nested followers shift with it so children stay children.
 * Depths above `MAX_LIST_DEPTH` are rejected (`depth-limit`) — never
 * silently clamped.
 */
export function indentListItem(
  source: DocStudioDocument,
  blockId: DocUUID,
  itemId: DocUUID,
  options: BlockOpOptions = {},
): ListContentActionResult {
  return shiftDepth(source, blockId, itemId, +1, options);
}

/**
 * Decrease the addressed item's depth by exactly one level (subtree
 * shifted as above).  An item already at depth 0 is rejected with
 * `at-depth-zero` — the document is never corrupted by over-outdenting.
 */
export function outdentListItem(
  source: DocStudioDocument,
  blockId: DocUUID,
  itemId: DocUUID,
  options: BlockOpOptions = {},
): ListContentActionResult {
  return shiftDepth(source, blockId, itemId, -1, options);
}

function shiftDepth(
  source: DocStudioDocument,
  blockId: DocUUID,
  itemId: DocUUID,
  delta: number,
  options: BlockOpOptions,
): ListContentActionResult {
  const found = requireList(source, blockId);
  if (isListFailure(found)) return rejectList(found.code, found.message);
  const data = found.data;

  const index = itemIndex(data, itemId);
  if (index < 0) {
    return rejectList('missing-item', 'The list item to re-nest no longer exists in this list.');
  }
  const depth = data.items[index].depth;
  if (!Number.isInteger(depth) || depth < 0 || depth > MAX_LIST_DEPTH) {
    // Stored data violates the depth contract — refuse rather than heal.
    return rejectList('invalid-depth', 'This item has an invalid nesting depth.');
  }
  const target = depth + delta;
  if (target > MAX_LIST_DEPTH) {
    return rejectList(
      'depth-limit',
      `List items cannot be nested deeper than level ${MAX_LIST_DEPTH}.`,
    );
  }
  if (target < 0) {
    return rejectList('at-depth-zero', 'This item is already at the top level.');
  }

  const end = subtreeEnd(data.items, index);
  const items = data.items.map((item, i) =>
    i >= index && i < end ? { ...item, depth: item.depth + delta } : item,
  );
  return {
    ok: true,
    doc: stamped(
      source,
      source.blocks.map((b, i) => (i === found.index ? { ...b, data: withItems(data, items) } : b)),
      options.now ?? new Date().toISOString(),
    ),
    changed: true,
    blockId,
    itemId,
  };
}

/**
 * Set one checklist item's `checked` state.  Non-boolean input is
 * rejected (`invalid-checked`); addressing a non-checklist list is
 * rejected (`not-a-checklist`) so the state can never drift silently.
 */
export function setItemChecked(
  source: DocStudioDocument,
  blockId: DocUUID,
  itemId: DocUUID,
  checked: boolean,
  options: BlockOpOptions = {},
): ListContentActionResult {
  const found = requireList(source, blockId);
  if (isListFailure(found)) return rejectList(found.code, found.message);
  const data = found.data;

  if (typeof checked !== 'boolean') {
    return rejectList('invalid-checked', 'Checked state must be true or false.');
  }
  if (data.listType !== 'checklist') {
    return rejectList(
      'not-a-checklist',
      'Checked state only applies to checklist items — change the list type first.',
    );
  }
  const index = itemIndex(data, itemId);
  if (index < 0) {
    return rejectList('missing-item', 'The checklist item no longer exists in this list.');
  }
  const item = data.items[index];
  if (item.checked === checked) {
    return { ok: true, doc: source, changed: false, blockId, itemId };
  }

  const items = data.items.slice();
  items[index] = { ...item, checked };
  return {
    ok: true,
    doc: stamped(
      source,
      source.blocks.map((b, i) => (i === found.index ? { ...b, data: withItems(data, items) } : b)),
      options.now ?? new Date().toISOString(),
    ),
    changed: true,
    blockId,
    itemId,
  };
}

/**
 * Dispatch one editor-panel list action.  A single entry point keeps the
 * `App → Workspace → EditorPanel` prop flow narrow (one callback) while
 * every operation keeps its own validated, deterministic service above.
 */
export function applyListContentAction(
  source: DocStudioDocument,
  blockId: DocUUID,
  action: ListContentAction,
  options: BlockOpOptions = {},
): ListContentActionResult {
  switch (action.kind) {
    case 'settings':
      return updateListSettings(source, blockId, action.patch, options);
    case 'item-text':
      return updateListItemText(source, blockId, action.itemId, action.spans, options);
    case 'item-add':
      return addListItem(source, blockId, action.afterItemId, options);
    case 'item-remove':
      return removeListItem(source, blockId, action.itemId, options);
    case 'item-move':
      return moveListItem(source, blockId, action.itemId, action.direction, options);
    case 'item-move-to':
      return moveListItemTo(source, blockId, action.itemId, action.index, options);
    case 'item-indent':
      return indentListItem(source, blockId, action.itemId, options);
    case 'item-outdent':
      return outdentListItem(source, blockId, action.itemId, options);
    case 'item-checked':
      return setItemChecked(source, blockId, action.itemId, action.checked, options);
    default:
      return rejectList('invalid-action', 'Unknown list operation.');
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Callout content (§10.3)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Update callout content: semantic `variant`, optional `title` and body
 * `spans`.  A `null` (or empty) title REMOVES the title field — a
 * deliberate, supported state, never an accidental blank line.  The
 * variant must be a non-empty trimmed string within
 * `MAX_CALLOUT_VARIANT_LENGTH`; unknown-but-well-formed variants are
 * preserved as custom variants (the renderer falls back neutrally).
 * Body spans are normalised at the model boundary.
 */
export function updateCalloutContent(
  source: DocStudioDocument,
  blockId: DocUUID,
  patch: CalloutContentPatch,
  options: BlockOpOptions = {},
): CalloutContentActionResult {
  const index = indexOfBlock(source, blockId);
  if (index < 0) {
    return rejectCallout(
      'missing-block',
      'The callout to edit no longer exists in this document.',
    );
  }
  const data = source.blocks[index].data;
  if (data.type !== 'callout') {
    return rejectCallout('not-a-callout', 'This block is not a callout and cannot be edited as one.');
  }

  const next: CalloutBlockData = { ...data };
  let changed = false;

  if (patch.variant !== undefined) {
    if (typeof patch.variant !== 'string' || patch.variant.trim() === '') {
      return rejectCallout(
        'invalid-variant',
        'Callout variant must be a non-empty label (info, warning, success, note, danger or a custom label).',
      );
    }
    const variant = patch.variant.trim();
    if (variant.length > MAX_CALLOUT_VARIANT_LENGTH) {
      return rejectCallout(
        'invalid-variant',
        `Callout variant must be at most ${MAX_CALLOUT_VARIANT_LENGTH} characters.`,
      );
    }
    if (data.variant !== variant) {
      next.variant = variant;
      changed = true;
    }
  }
  if (patch.title !== undefined) {
    if (patch.title !== null && typeof patch.title !== 'string') {
      return rejectCallout('invalid-title', 'Callout title must be text or null to remove it.');
    }
    const title = patch.title === null ? '' : patch.title.trim();
    if (title.length > MAX_CALLOUT_TITLE_LENGTH) {
      return rejectCallout(
        'invalid-title',
        `Callout title must be at most ${MAX_CALLOUT_TITLE_LENGTH} characters.`,
      );
    }
    const hadTitle = data.title !== undefined;
    if (title === '') {
      if (hadTitle) {
        delete next.title; // deliberate removal — field absent, not blank
        changed = true;
      }
    } else if (data.title !== title) {
      next.title = title;
      changed = true;
    }
  }
  if (patch.spans !== undefined) {
    if (!Array.isArray(patch.spans)) {
      return rejectCallout('invalid-spans', 'Callout body must be a list of text runs.');
    }
    const normalized = normalizeSpans(patch.spans as readonly InlineSpan[]);
    if (!sameValue(normalized, data.spans)) {
      next.spans = normalized;
      changed = true;
    }
  }

  if (!changed || sameValue(next, data)) {
    return { ok: true, doc: source, changed: false, blockId };
  }
  return {
    ok: true,
    doc: stamped(
      source,
      source.blocks.map((b, i) => (i === index ? { ...b, data: next } : b)),
      options.now ?? new Date().toISOString(),
    ),
    changed: true,
    blockId,
  };
}
