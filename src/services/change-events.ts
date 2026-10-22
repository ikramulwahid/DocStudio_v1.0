/**
 * DocStudio - Change event services (P07-M1)
 * 
 *
 * Pure construction/validation helpers for the change-event model defined
 * in `types/change-events` (whose module docblock is the authoritative
 * semantics record).  No document is mutated, no event is persisted and no
 * accept/reject operation exists here - those belong to `P07-M2`.
 *
 * Conventions (mirrors `block-actions` / `structural-block-content`)
 *  Every construction failure returns `{ ok: false, code, message }` with
 *   an understandable message; invalid input is never silently coerced.
 *  `createChangeEvent` stamps the envelope (`id`, `at`, `status:
 *   'pending') from INJECTED clock/ID (`nowISO`/`newUUID` by default) so
 *   suites stay deterministic - same pattern as the block services.
 *  `validateChangeEvent` is the single source of truth; creation builds a
 *   candidate envelope and reuses it.  A successful validation returns the
 *   SAME object reference (events are immutable by convention - readonly
 *   fields; the caller retains ownership).
 *  A change event must describe an actual change: identical before/after
 *   values are rejected as `unchanged-value`.
 */

import { spansToPlainText } from './rich-text';
import { BLOCK_TYPES } from '../types/blocks';
import type { InlineSpan } from '../types/blocks';
import type {
  ChangeEvent,
  ChangeEventDraft,
  ChangeEventType,
  ChangeScalarValue,
  ChangeStatus,
  ChangeTarget,
} from '../types/change-events';
import {
  CHANGE_EVENT_TYPES,
  isChangeStatus,
  isChangeEventType,
  MAX_EDITOR_LABEL_LENGTH,
} from '../types/change-events';
import type { DocUUID, ISODateString } from '../types/document';
import { newUUID, nowISO } from '../types/defaults';

// ─────────────────────────────────────────────────────────────────────────────
// Results and error codes
// ─────────────────────────────────────────────────────────────────────────────

/** Deterministic failure codes (same family as `BlockErrorCode`). */
export type ChangeEventErrorCode =
  | 'invalid-event'
  | 'invalid-type'
  | 'invalid-target'
  | 'invalid-payload'
  | 'invalid-status'
  | 'invalid-label'
  | 'invalid-group'
  | 'unchanged-value';

/** Success/failure union (same shape as `BlockActionResult`). */
export type ChangeEventResult =
  | { ok: true; event: ChangeEvent }
  | { ok: false; code: ChangeEventErrorCode; message: string };

const reject = (code: ChangeEventErrorCode, message: string): ChangeEventResult => ({
  ok: false,
  code,
  message,
});

/** Injection options for deterministic construction (tests / audit probes). */
export interface ChangeEventOptions {
  now?: ISODateString;
  genId?: () => DocUUID;
}

// ─────────────────────────────────────────────────────────────────────────────
// Runtime shapes
// ─────────────────────────────────────────────────────────────────────────────

const UUID_RE = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;
// ISO 8601 as produced by `new Date().toISOString()` (Z form) plus a tolerant
// offset form for externally supplied history data.
const ISO_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$/;

const TOP_LEVEL_KEYS = [
  'id',
  'at',
  'status',
  'editorLabel',
  'groupId',
  'type',
  'target',
  'payload',
];
const DRAFT_KEYS = ['type', 'target', 'payload', 'editorLabel', 'groupId'];

/** Required target kind per event type (target/type correlation table). */
const TARGET_KIND_BY_TYPE: Record<ChangeEventType, ChangeTarget['kind']> = {
  text: 'block-field',
  formatting: 'block-field',
  'block-create': 'block',
  'block-delete': 'block',
  'block-reorder': 'block',
  metadata: 'document',
  settings: 'document',
};

const isObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);
const isUuid = (v: unknown): v is DocUUID => typeof v === 'string' && UUID_RE.test(v);
const isScalar = (v: unknown): v is ChangeScalarValue =>
  v === null || typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean';
const isNonNegativeInt = (v: unknown): v is number =>
  typeof v === 'number' && Number.isInteger(v) && v >= 0;
const hasKey = (o: Record<string, unknown>, k: string): boolean =>
  Object.prototype.hasOwnProperty.call(o, k);

/** Shallow key check for small fixed-shape payloads. */
const keysAreOnly = (o: Record<string, unknown>, allowed: readonly string[]): boolean =>
  Object.keys(o).every((k) => allowed.includes(k));

/**
 * Well-formedness of one inline span (structural only; style attributes are
 * the rich-text algebra's domain - full span validation happens when the
 * containing document is serialized/deserialized).
 */
const isSpan = (v: unknown): v is InlineSpan => isObject(v) && typeof v['text'] === 'string';

/**
 * Envelope validation shared by `validateChangeEvent` and the final step of
 * `createChangeEvent` (allowed keys + id/at/status/label/group).
 */
function validateEnvelope(
  value: Record<string, unknown>,
  extraAllowed: readonly string[],
): ChangeEventResult | null {
  for (const k of Object.keys(value)) {
    if (!extraAllowed.includes(k)) {
      return reject('invalid-event', `Unexpected field "${k}" on a change event.`);
    }
  }
  if (!isUuid(value['id'])) {
    return reject('invalid-event', 'Change event "id" must be a UUID string.');
  }
  if (typeof value['at'] !== 'string' || !ISO_RE.test(value['at'])) {
    return reject('invalid-event', 'Change event "at" must be an ISO 8601 timestamp.');
  }
  if (!isChangeStatus(value['status'])) {
    return reject(
      'invalid-status',
      'Change event "status" must be "pending", "accepted" or "rejected".',
    );
  }
  if (hasKey(value, 'editorLabel')) {
    const label = value['editorLabel'];
    if (typeof label !== 'string' || label.trim().length === 0) {
      return reject(
        'invalid-label',
        'Change event "editorLabel" must be a non-empty string when provided.',
      );
    }
    if (label.length > MAX_EDITOR_LABEL_LENGTH) {
      return reject(
        'invalid-label',
        `Change event "editorLabel" must be at most ${MAX_EDITOR_LABEL_LENGTH} characters.`,
      );
    }
  }
  if (hasKey(value, 'groupId') && !isUuid(value['groupId'])) {
    return reject('invalid-group', 'Change event "groupId" must be a UUID string when provided.');
  }
  return null;
}

/** Target validation with the per-type kind correlation. */
function validateTarget(type: ChangeEventType, target: unknown): ChangeEventResult | null {
  if (!isObject(target)) {
    return reject('invalid-target', 'Change event "target" must be an object.');
  }
  const expected = TARGET_KIND_BY_TYPE[type];
  if (target['kind'] !== expected) {
    return reject(
      'invalid-target',
      `A "${type}" event must target kind "${expected}" (got ${JSON.stringify(target['kind'])}).`,
    );
  }
  if (expected === 'document') {
    const field = target['field'];
    if (typeof field !== 'string' || field.trim().length === 0) {
      return reject('invalid-target', 'A document-target event requires a non-empty "field" path.');
    }
    return null;
  }
  if (!isUuid(target['blockId'])) {
    return reject('invalid-target', 'A block-target event requires a UUID "blockId".');
  }
  if (expected === 'block-field') {
    const field = target['field'];
    if (typeof field !== 'string' || field.trim().length === 0) {
      return reject('invalid-target', 'A block-field event requires a non-empty "field" locator.');
    }
  }
  return null;
}

/** Scalar before/after pair validation + the unchanged-value rule. */
function validateScalarPair(
  payload: Record<string, unknown>,
  what: string,
  allowedKeys: readonly string[] = ['original', 'replacement'],
): ChangeEventResult | null {
  if (!keysAreOnly(payload, allowedKeys)) {
    return reject('invalid-payload', `A ${what} payload has unexpected fields.`);
  }
  const { original, replacement } = payload;
  if (!isScalar(original) || !isScalar(replacement)) {
    return reject(
      'invalid-payload',
      `A ${what} payload's "original"/"replacement" must be string | number | boolean | null.`,
    );
  }
  if (original === replacement) {
    return reject(
      'unchanged-value',
      `A change event must describe a change: ${what} "original" and "replacement" are identical.`,
    );
  }
  return null;
}

/** Text payload validation (string pair with the unchanged-value rule). */
function validateTextPayload(payload: unknown): ChangeEventResult | null {
  if (!isObject(payload)) {
    return reject('invalid-payload', 'A text payload must be an object.');
  }
  if (!keysAreOnly(payload, ['original', 'replacement'])) {
    return reject('invalid-payload', 'A text payload has unexpected fields.');
  }
  if (typeof payload['original'] !== 'string' || typeof payload['replacement'] !== 'string') {
    return reject(
      'invalid-payload',
      `A text payload's "original"/"replacement" must be strings.`,
    );
  }
  if (payload['original'] === payload['replacement']) {
    return reject(
      'unchanged-value',
      'A change event must describe a change: text "original" and "replacement" are identical.',
    );
  }
  return null;
}

/** Formatting payload validation (spans | property variants). */
function validateFormattingPayload(payload: unknown): ChangeEventResult | null {
  if (!isObject(payload)) {
    return reject('invalid-payload', 'A formatting payload must be an object.');
  }
  const kind = payload['kind'];
  if (kind === 'spans') {
    if (!keysAreOnly(payload, ['kind', 'original', 'replacement'])) {
      return reject('invalid-payload', 'A formatting (spans) payload has unexpected fields.');
    }
    const { original, replacement } = payload;
    if (!Array.isArray(original) || !Array.isArray(replacement)) {
      return reject(
        'invalid-payload',
        'A formatting (spans) payload requires span arrays for "original"/"replacement".',
      );
    }
    if (!original.every(isSpan) || !replacement.every(isSpan)) {
      return reject(
        'invalid-payload',
        'A formatting (spans) payload contains a malformed span (each span needs a string "text").',
      );
    }
    // Classification rule: a formatting event must not change the text.
    if (spansToPlainText(original) !== spansToPlainText(replacement)) {
      return reject(
        'invalid-payload',
        'A formatting (spans) event must keep the plain text identical; use a "text" event when the content changes.',
      );
    }
    // Exact-equality guard: identical serialized spans record no change.
    // (Key-order dependent by design - only a false ACCEPT is possible, never
    // a false reject; documented in the P07-M1 record.)
    if (JSON.stringify(original) === JSON.stringify(replacement)) {
      return reject(
        'unchanged-value',
        'A formatting event must change the spans: "original" and "replacement" are identical.',
      );
    }
    return null;
  }
  if (kind === 'property') {
    return validateScalarPair(payload, 'formatting (property)', [
      'kind',
      'original',
      'replacement',
    ]);
  }
  return reject('invalid-payload', 'A formatting payload requires kind "spans" or "property".');
}

/** Full-block envelope check (id + spacing + registered data type). */
function isBlockEnvelope(v: unknown): v is { id: DocUUID } {
  if (!isObject(v)) return false;
  if (!isUuid(v['id'])) return false;
  const spacing = v['spacing'];
  if (
    !isObject(spacing) ||
    typeof spacing['topPt'] !== 'number' ||
    typeof spacing['bottomPt'] !== 'number'
  ) {
    return false;
  }
  const data = v['data'];
  if (!isObject(data) || typeof data['type'] !== 'string') return false;
  return (BLOCK_TYPES as readonly string[]).includes(data['type']);
}

/** Payload validation for `block-create` / `block-delete`. */
function validatePositionedPayload(
  type: 'block-create' | 'block-delete',
  payload: unknown,
  targetBlockId: DocUUID,
): ChangeEventResult | null {
  if (!isObject(payload)) {
    return reject('invalid-payload', `A ${type} payload must be an object.`);
  }
  if (!keysAreOnly(payload, ['block', 'index', 'afterBlockId'])) {
    return reject('invalid-payload', `A ${type} payload has unexpected fields.`);
  }
  const { block, index, afterBlockId } = payload;
  if (!isBlockEnvelope(block)) {
    return reject(
      'invalid-payload',
      `A ${type} payload requires a structurally valid block (UUID id, numeric spacing, registered data type).`,
    );
  }
  if (block.id !== targetBlockId) {
    return reject(
      'invalid-payload',
      `A ${type} event's "target.blockId" must equal the carried block's id.`,
    );
  }
  if (!isNonNegativeInt(index)) {
    return reject(
      'invalid-payload',
      `A ${type} payload's "index" must be a non-negative integer.`,
    );
  }
  if (afterBlockId !== null && !isUuid(afterBlockId)) {
    return reject('invalid-payload', `A ${type} payload's "afterBlockId" must be a UUID or null.`);
  }
  return null;
}

/** Payload validation for `block-reorder`. */
function validateReorderPayload(payload: unknown): ChangeEventResult | null {
  if (!isObject(payload)) {
    return reject('invalid-payload', 'A block-reorder payload must be an object.');
  }
  if (!keysAreOnly(payload, ['fromIndex', 'toIndex', 'fromAfterBlockId', 'toAfterBlockId'])) {
    return reject('invalid-payload', 'A block-reorder payload has unexpected fields.');
  }
  const { fromIndex, toIndex, fromAfterBlockId, toAfterBlockId } = payload;
  if (!isNonNegativeInt(fromIndex) || !isNonNegativeInt(toIndex)) {
    return reject(
      'invalid-payload',
      'A block-reorder payload requires non-negative integer "fromIndex"/"toIndex".',
    );
  }
  if (fromAfterBlockId !== null && !isUuid(fromAfterBlockId)) {
    return reject(
      'invalid-payload',
      `A block-reorder payload's "fromAfterBlockId" must be a UUID or null.`,
    );
  }
  if (toAfterBlockId !== null && !isUuid(toAfterBlockId)) {
    return reject(
      'invalid-payload',
      `A block-reorder payload's "toAfterBlockId" must be a UUID or null.`,
    );
  }
  if (fromIndex === toIndex) {
    return reject(
      'unchanged-value',
      'A block-reorder event must move the block: "fromIndex" and "toIndex" are identical.',
    );
  }
  return null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Validate an already-shaped change event (e.g. one read back from stored
 * history).  Returns the SAME object reference on success - events are
 * immutable by convention.
 */
export function validateChangeEvent(value: unknown): ChangeEventResult {
  if (!isObject(value)) {
    return reject('invalid-event', 'A change event must be an object.');
  }
  const type = value['type'];
  if (!isChangeEventType(type)) {
    return reject(
      'invalid-type',
      `Unknown change event type ${JSON.stringify(value['type'])} (expected one of ${CHANGE_EVENT_TYPES.join(', ')}).`,
    );
  }
  const envelopeError = validateEnvelope(value, TOP_LEVEL_KEYS);
  if (envelopeError) return envelopeError;
  const targetError = validateTarget(type, value['target']);
  if (targetError) return targetError;
  const payload = value['payload'];
  if (!isObject(payload)) {
    return reject('invalid-payload', 'A change event "payload" must be an object.');
  }
  let payloadError: ChangeEventResult | null;
  switch (type) {
    case 'text':
      payloadError = validateTextPayload(payload);
      break;
    case 'formatting':
      payloadError = validateFormattingPayload(payload);
      break;
    case 'block-create':
    case 'block-delete': {
      const target = value['target'] as { blockId: DocUUID };
      payloadError = validatePositionedPayload(type, payload, target.blockId);
      break;
    }
    case 'block-reorder':
      payloadError = validateReorderPayload(payload);
      break;
    case 'metadata':
    case 'settings':
      payloadError = validateScalarPair(payload, type);
      break;
  }
  if (payloadError) return payloadError;
  return { ok: true, event: value as unknown as ChangeEvent };
}

/**
 * Construct a change event from a typed draft.  The envelope (`id`, `at`,
 * `status: 'pending'`) is stamped from the injected clock/ID (defaults:
 * `nowISO()` / `newUUID()`); envelope fields are never accepted from the
 * caller.  Construction validates the full event - see
 * `validateChangeEvent`.
 */
export function createChangeEvent(
  draft: ChangeEventDraft,
  options: ChangeEventOptions = {},
): ChangeEventResult {
  if (!isObject(draft as unknown)) {
    return reject('invalid-event', 'A change event draft must be an object.');
  }
  for (const k of Object.keys(draft as unknown as Record<string, unknown>)) {
    if (!DRAFT_KEYS.includes(k)) {
      return reject(
        'invalid-event',
        `Unexpected field "${k}" in a change draft (id/at/status are stamped by the service).`,
      );
    }
  }
  const candidate: Record<string, unknown> = {
    ...(draft as unknown as Record<string, unknown>),
    id: options.genId ? options.genId() : newUUID(),
    at: options.now ?? nowISO(),
    status: 'pending' satisfies ChangeStatus,
  };
  return validateChangeEvent(candidate);
}

/**
 * Classify a `text` event's before/after pair for markup derivation
 * (`P07-M2` renders a replacement as adjacent delete+insert fragments).
 * `none` is unreachable for validated events (`unchanged-value` rejects
 * identical pairs); it exists so the function is total over all inputs.
 */
export function textChangeKind(
  original: string,
  replacement: string,
): 'insert' | 'delete' | 'replace' | 'none' {
  if (original === replacement) return 'none';
  if (original === '') return 'insert';
  if (replacement === '') return 'delete';
  return 'replace';
}

/** Lifecycle predicate: has the tracked change not been resolved yet? */
export function isPendingChange(event: ChangeEvent): boolean {
  return event.status === 'pending';
}
