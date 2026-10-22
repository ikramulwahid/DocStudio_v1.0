/**
 * DocStudio — Immutable laboratory-specific block content actions (P06-M5)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Pure, non-mutating content operations for the six laboratory-specific
 * block types delivered by P06-M5 (roadmap Phase 06 §6.6, project_details
 * §10.9):
 *
 * • PROCEDURE STEP  — optional section title + repeatable steps with a
 *   level (main/sub/note/warning/caution), an optional authored step
 *   number and rich-text spans.
 * • EQUIPMENT LIST  — optional title + equipment/materials items (name,
 *   asset tag, manufacturer, model, calibration due date, mandatory flag).
 * • OBSERVATION     — optional title + parameter/observed-value/remarks
 *   rows for technical and sample observations.
 * • MEASUREMENT     — optional title + columns (header + unit), keyed
 *   cell values, an optional uncertainty note — the worksheet / rough
 *   datasheet primitive.
 * • CALCULATION     — optional title + calculation steps (label, LaTeX,
 *   substitution, result, note) + an optional conclusion statement.
 * • ACCEPTANCE      — optional title + criteria (criterion, spec, measured
 *   value, author-entered verdict, remarks) + optional overall verdict.
 *
 * Conventions inherited from `block-actions` / `block-content` /
 * `structural-block-content` (same file-level rules):
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
 * Product boundaries (project_details §10.9 / §11)
 * ────────────────────────────────────────────────────
 * These blocks are DOCUMENT-AUTHORING content only.  Nothing here
 * performs sample registration, sample tracking, instrument
 * connectivity, automatic data acquisition, result management or any
 * conformity determination — the verdict fields store exactly what the
 * author typed.  Calculation steps are authorable text/LaTeX; there is
 * no calculation engine.  Measurement cells may legitimately be blank
 * so printed worksheets leave handwriting space.
 *
 * Rich text on procedure steps is edited as PLAIN text (the P05-M2
 * `remapSpansAfterTextEdit` algebra preserves formatting runs wherever
 * the edit allows; new steps start plain).
 *
 * @module services/lab-block-content
 */

import type {
  AcceptanceCriteriaBlockData,
  AcceptanceCriterion,
  AnyBlockData,
  CalculationBlockData,
  CalculationStep,
  CriteriaResult,
  EquipmentItem,
  EquipmentListBlockData,
  InlineSpan,
  MeasurementBlockData,
  MeasurementColumn,
  ObservationBlockData,
  ObservationRow,
  ProcedureStep,
  ProcedureStepBlockData,
  ProcedureStepLevel,
} from '../types/blocks';
import type { ContentBlock, DocStudioDocument, DocUUID } from '../types/document';
import { newUUID, nowISO } from '../types/defaults';
import { indexOfBlock, stamped, type BlockOpOptions } from './block-actions';
import { normalizeSpans } from './rich-text';
import { validateLatex } from './math-engine';
import { MAX_FORMULA_LATEX_LENGTH } from './formula-content';

// ─────────────────────────────────────────────────────────────────────────────
// Contract constants
// ─────────────────────────────────────────────────────────────────────────────

/** Longest accepted free-text field (item text, cell values, notes). */
export const MAX_LAB_TEXT_LENGTH = 4000;

/** Longest accepted block title (procedure/equipment/… heading line). */
export const MAX_LAB_TITLE_LENGTH = 200;

/** Longest accepted authored step number label, e.g. "4.1" or "Step 7". */
export const MAX_LAB_STEP_NUMBER_LENGTH = 40;

/** Longest accepted measurement-unit label, e.g. "Hz" or "mg/kg". */
export const MAX_LAB_UNIT_LENGTH = 60;

/**
 * Maximum measurement/worksheet columns.  A4 portrait content width cannot
 * render more columns legibly, so the service rejects further columns with
 * an explicit message instead of silently shrinking cells to unusable sizes.
 */
export const MAX_MEASUREMENT_COLUMNS = 12;

/** Procedure step levels (project_details §10.9 "Procedure-step block"). */
export const PROCEDURE_STEP_LEVELS: readonly ProcedureStepLevel[] = [
  'main',
  'sub',
  'note',
  'warning',
  'caution',
];

/** Author-entered acceptance verdicts (never evaluated by DocStudio). */
export const CRITERIA_RESULTS: readonly CriteriaResult[] = [
  'pass',
  'fail',
  'inconclusive',
  'not-applicable',
  'pending',
];

/** Display labels for the verdicts (one source for editor + renderer). */
export const CRITERIA_RESULT_LABELS: Record<CriteriaResult, string> = {
  pass: 'Pass',
  fail: 'Fail',
  inconclusive: 'Inconclusive',
  'not-applicable': 'N/A',
  pending: 'Pending',
};

/** Display labels for the procedure-step levels (one source, editor + renderer). */
export const PROCEDURE_LEVEL_LABELS: Record<ProcedureStepLevel, string> = {
  main: 'Main step',
  sub: 'Sub step',
  note: 'Note',
  warning: 'Warning',
  caution: 'Caution',
};

/** Optional/required date fields accept empty or `YYYY-MM-DD`. */
export const LAB_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

// ─────────────────────────────────────────────────────────────────────────────
// Result and action contracts
// ─────────────────────────────────────────────────────────────────────────────

export type LabContentErrorCode =
  | 'missing-block'
  | 'wrong-block-type'
  | 'invalid-action'
  | 'invalid-title'
  | 'invalid-text'
  | 'invalid-direction'
  | 'invalid-level'
  | 'invalid-step-number'
  | 'invalid-spans'
  | 'invalid-name'
  | 'invalid-parameter'
  | 'invalid-date'
  | 'invalid-flag'
  | 'invalid-unit'
  | 'invalid-column-header'
  | 'too-many-columns'
  | 'missing-entry'
  | 'unknown-column'
  | 'invalid-cell'
  | 'invalid-latex'
  | 'invalid-criterion'
  | 'invalid-specification'
  | 'invalid-result';

export interface LabFailure {
  ok: false;
  code: LabContentErrorCode;
  message: string;
}

/** Success carries an `entryId` focus hint for row-level operations. */
export interface LabSuccess {
  ok: true;
  changed: boolean;
  doc: DocStudioDocument;
  blockId: DocUUID;
  entryId?: DocUUID;
}

export type LabContentActionResult = LabSuccess | LabFailure;

const reject = (code: LabContentErrorCode, message: string): LabFailure => ({
  ok: false,
  code,
  message,
});

/** Patch fields for one procedure step.  Absent fields are never touched. */
export interface ProcedureStepPatch {
  level?: unknown;
  stepNumber?: unknown;
  spans?: unknown;
}

/** Patch fields for one equipment item.  Absent fields are never touched. */
export interface EquipmentItemPatch {
  name?: unknown;
  assetTag?: unknown;
  manufacturer?: unknown;
  modelNumber?: unknown;
  calibrationDue?: unknown;
  mandatory?: unknown;
}

/** Patch fields for one observation row.  Absent fields are never touched. */
export interface ObservationRowPatch {
  parameter?: unknown;
  observedValue?: unknown;
  remarks?: unknown;
}

/** Patch fields for one measurement column.  Absent fields are never touched. */
export interface MeasurementColumnPatch {
  header?: unknown;
  unit?: unknown;
}

/** Patch fields for one calculation step.  Absent fields are never touched. */
export interface CalculationStepPatch {
  label?: unknown;
  latex?: unknown;
  substitution?: unknown;
  result?: unknown;
  note?: unknown;
}

/** Patch fields for one acceptance criterion.  Absent fields never touched. */
export interface AcceptanceCriterionPatch {
  criterion?: unknown;
  specification?: unknown;
  measuredValue?: unknown;
  result?: unknown;
  remarks?: unknown;
}

/** One validated laboratory-block action, dispatched by `applyLabAction`. */
export type LabContentAction =
  // ── procedure-step ────────────────────────────────────────────────────────
  | { action: 'update-procedure-title'; title?: string | null }
  | { action: 'add-procedure-step' }
  | { action: 'update-procedure-step'; stepId: DocUUID; patch: ProcedureStepPatch }
  | { action: 'remove-procedure-step'; stepId: DocUUID }
  | { action: 'move-procedure-step'; stepId: DocUUID; direction: 'up' | 'down' }
  // ── equipment-list ────────────────────────────────────────────────────────
  | { action: 'update-equipment-title'; title?: string | null }
  | { action: 'add-equipment-item' }
  | { action: 'update-equipment-item'; itemId: DocUUID; patch: EquipmentItemPatch }
  | { action: 'remove-equipment-item'; itemId: DocUUID }
  | { action: 'move-equipment-item'; itemId: DocUUID; direction: 'up' | 'down' }
  // ── observation ───────────────────────────────────────────────────────────
  | { action: 'update-observation-title'; title?: string | null }
  | { action: 'add-observation-row' }
  | { action: 'update-observation-row'; rowId: DocUUID; patch: ObservationRowPatch }
  | { action: 'remove-observation-row'; rowId: DocUUID }
  | { action: 'move-observation-row'; rowId: DocUUID; direction: 'up' | 'down' }
  // ── measurement ───────────────────────────────────────────────────────────
  | { action: 'update-measurement-title'; title?: string | null }
  | { action: 'set-measurement-uncertainty-note'; note?: string | null }
  | { action: 'add-measurement-column' }
  | { action: 'update-measurement-column'; columnId: DocUUID; patch: MeasurementColumnPatch }
  | { action: 'remove-measurement-column'; columnId: DocUUID }
  | { action: 'move-measurement-column'; columnId: DocUUID; direction: 'up' | 'down' }
  | { action: 'add-measurement-row' }
  | { action: 'set-measurement-cell'; rowId: DocUUID; columnId: DocUUID; value: unknown }
  | { action: 'remove-measurement-row'; rowId: DocUUID }
  | { action: 'move-measurement-row'; rowId: DocUUID; direction: 'up' | 'down' }
  // ── calculation ───────────────────────────────────────────────────────────
  | { action: 'update-calculation-title'; title?: string | null }
  | { action: 'set-calculation-conclusion'; text?: string | null }
  | { action: 'add-calculation-step' }
  | { action: 'update-calculation-step'; stepId: DocUUID; patch: CalculationStepPatch }
  | { action: 'remove-calculation-step'; stepId: DocUUID }
  | { action: 'move-calculation-step'; stepId: DocUUID; direction: 'up' | 'down' }
  // ── acceptance-criteria ───────────────────────────────────────────────────
  | { action: 'update-acceptance-title'; title?: string | null }
  | { action: 'set-acceptance-overall'; result?: CriteriaResult | null }
  | { action: 'add-acceptance-criterion' }
  | { action: 'update-acceptance-criterion'; criterionId: DocUUID; patch: AcceptanceCriterionPatch }
  | { action: 'remove-acceptance-criterion'; criterionId: DocUUID }
  | { action: 'move-acceptance-criterion'; criterionId: DocUUID; direction: 'up' | 'down' };

// ─────────────────────────────────────────────────────────────────────────────
// Shared helpers
// ─────────────────────────────────────────────────────────────────────────────

/** The six block types this service owns. */
export type LabBlockType =
  | 'procedure-step'
  | 'equipment-list'
  | 'observation'
  | 'measurement'
  | 'calculation'
  | 'acceptance-criteria';

type LabBlockOf<T extends LabBlockType> = Extract<AnyBlockData, { type: T }>;

const BLOCK_NOUN: Record<LabBlockType, string> = {
  'procedure-step': 'procedure step',
  'equipment-list': 'equipment list',
  observation: 'observation',
  measurement: 'measurement table',
  calculation: 'calculation',
  'acceptance-criteria': 'acceptance criteria',
};

const isFreeText = (value: unknown, max = MAX_LAB_TEXT_LENGTH): value is string =>
  typeof value === 'string' && value.length <= max;

type Locate<T extends LabBlockType> =
  | { ok: true; index: number; block: ContentBlock & { data: LabBlockOf<T> } }
  | { ok: false; failure: LabFailure };

function locate<T extends LabBlockType>(
  source: DocStudioDocument,
  blockId: DocUUID,
  type: T,
): Locate<T> {
  const index = indexOfBlock(source, blockId);
  if (index < 0) {
    return {
      ok: false,
      failure: reject(
        'missing-block',
        `The ${BLOCK_NOUN[type]} block to edit no longer exists in this document.`,
      ),
    };
  }
  const block = source.blocks[index];
  if (block.data.type !== type) {
    return {
      ok: false,
      failure: reject(
        'wrong-block-type',
        `This block is not a ${BLOCK_NOUN[type]} block and cannot be edited as one.`,
      ),
    };
  }
  return {
    ok: true,
    index,
    block: block as ContentBlock & { data: LabBlockOf<T> },
  };
}

function commitData(
  source: DocStudioDocument,
  index: number,
  block: ContentBlock,
  nextData: AnyBlockData,
  options: BlockOpOptions,
  entryId?: DocUUID,
): LabSuccess {
  const updated = { ...block, data: nextData };
  const blocks = [...source.blocks];
  blocks[index] = updated;
  return {
    ok: true,
    changed: true,
    blockId: block.id,
    ...(entryId !== undefined ? { entryId } : {}),
    doc: stamped(source, blocks, options.now ?? nowISO()),
  };
}

const unchanged = (source: DocStudioDocument, blockId: DocUUID): LabSuccess => ({
  ok: true,
  doc: source,
  changed: false,
  blockId,
});

/**
 * Apply an optional-text edit (`null` and `''` both CLEAR the field back
 * to `undefined`; omitted fields are never touched).  Returns the next
 * value plus a changed flag, or the rejection to fail the whole patch
 * with BEFORE anything is committed.
 */
function optionalText(
  current: string | undefined,
  value: unknown,
  opts: { max: number; code: LabContentErrorCode; label: string },
): { ok: true; value: string | undefined; changed: boolean } | LabFailure {
  if (value === null || value === '') {
    return { ok: true, value: undefined, changed: (current ?? '') !== '' };
  }
  if (!isFreeText(value, opts.max)) {
    return reject(opts.code, `${opts.label} must be text${opts.max < 4000 ? ` of at most ${opts.max} characters` : ''}.`);
  }
  return { ok: true, value, changed: current !== value };
}

/** Apply a REQUIRED non-empty text edit (`null`/`''` are rejected). */
function requiredText(
  current: string,
  value: unknown,
  opts: { max: number; code: LabContentErrorCode; label: string; hint?: string },
): { ok: true; value: string; changed: boolean } | LabFailure {
  if (value === null || value === undefined || typeof value !== 'string') {
    return reject(opts.code, opts.hint ?? `${opts.label} is required.`);
  }
  if (value === '') {
    return reject(opts.code, opts.hint ?? `${opts.label} is required and cannot be empty.`);
  }
  if (value.length > opts.max) {
    return reject(
      opts.code,
      `${opts.label} must be at most ${opts.max} characters.`,
    );
  }
  return { ok: true, value, changed: current !== value };
}

function moveEntry<T extends { readonly id: DocUUID }>(
  entries: readonly T[],
  entryId: DocUUID,
  direction: 'up' | 'down',
): { entries: T[]; changed: boolean } {
  const from = entries.findIndex((entry) => entry.id === entryId);
  if (from < 0) return { entries: entries.slice(), changed: false };
  const to = direction === 'up' ? from - 1 : from + 1;
  if (to < 0 || to >= entries.length) return { entries: entries.slice(), changed: false };
  const next = entries.slice();
  const [moved] = next.splice(from, 1);
  next.splice(to, 0, moved);
  return { entries: next, changed: true };
}

function checkDirection(direction: unknown): 'up' | 'down' | null {
  return direction === 'up' || direction === 'down' ? direction : null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Block titles (all six types — procedure steps store `sectionTitle`,
// the other five store `title`)
// ─────────────────────────────────────────────────────────────────────────────

function updateTitle(
  source: DocStudioDocument,
  blockId: DocUUID,
  type: LabBlockType,
  field: 'title' | 'sectionTitle',
  title: string | null | undefined,
  options: BlockOpOptions,
): LabContentActionResult {
  const found = locate(source, blockId, type);
  if (found.ok === false) return found.failure;
  const { index, block } = found;
  const data = block.data as unknown as { title?: string; sectionTitle?: string };

  const applied = optionalText(data[field], title === undefined ? null : title, {
    max: MAX_LAB_TITLE_LENGTH,
    code: 'invalid-title',
    label: 'A block title',
  });
  if (applied.ok === false) return applied;
  if (!applied.changed) return unchanged(source, blockId);

  const next = { ...block.data } as unknown as { title?: string; sectionTitle?: string };
  if (applied.value === undefined) delete next[field];
  else next[field] = applied.value;
  return commitData(source, index, block, next as unknown as AnyBlockData, options);
}

// ─────────────────────────────────────────────────────────────────────────────
// Procedure steps (§10.9 "Procedure-step block")
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Append a fresh step (level `main`, no number, no text).  The editor
 * focuses the returned `entryId`; required content is validated on edit,
 * so an untouched draft step simply renders as an honest empty marker.
 */
export function addProcedureStep(
  source: DocStudioDocument,
  blockId: DocUUID,
  options: BlockOpOptions = {},
): LabContentActionResult {
  const found = locate(source, blockId, 'procedure-step');
  if (found.ok === false) return found.failure;
  const { index, block } = found;
  const data = block.data;
  const stepId = options.genId !== undefined ? options.genId() : newUUID();
  const step: ProcedureStep = { id: stepId, level: 'main', spans: [] };
  const next: ProcedureStepBlockData = { ...data, steps: [...data.steps, step] };
  return commitData(source, index, block, next, options, stepId);
}

/**
 * Update one step, addressed by its STABLE id.
 *
 * Validation (all BEFORE commit):
 * • `level`      — one of PROCEDURE_STEP_LEVELS (`invalid-level`).
 * • `stepNumber` — optional text ≤ 40 chars; `null`/`''` clears
 *   (`invalid-step-number`).
 * • `spans`      — array normalised through `normalizeSpans`
 *   (`invalid-spans` for non-arrays); plain-text editing flows through
 *   `remapSpansAfterTextEdit` in the EDITOR before dispatch.
 */
export function updateProcedureStep(
  source: DocStudioDocument,
  blockId: DocUUID,
  stepId: DocUUID,
  patch: ProcedureStepPatch,
  options: BlockOpOptions = {},
): LabContentActionResult {
  const found = locate(source, blockId, 'procedure-step');
  if (found.ok === false) return found.failure;
  const { index, block } = found;
  const data = block.data;
  const stepIndex = data.steps.findIndex((step) => step.id === stepId);
  if (stepIndex < 0) return reject('missing-entry', 'The procedure step to edit no longer exists.');

  const next: ProcedureStep = { ...data.steps[stepIndex] };
  let changed = false;

  if (patch.level !== undefined) {
    if (!PROCEDURE_STEP_LEVELS.includes(patch.level as ProcedureStepLevel)) {
      return reject(
        'invalid-level',
        'A step level must be main, sub, note, warning or caution.',
      );
    }
    if (next.level !== patch.level) {
      next.level = patch.level as ProcedureStepLevel;
      changed = true;
    }
  }
  if (patch.stepNumber !== undefined) {
    const applied = optionalText(next.stepNumber, patch.stepNumber, {
      max: MAX_LAB_STEP_NUMBER_LENGTH,
      code: 'invalid-step-number',
      label: 'A step number',
    });
    if (applied.ok === false) return applied;
    if (applied.changed) {
      if (applied.value === undefined) delete next.stepNumber;
      else next.stepNumber = applied.value;
      changed = true;
    }
  }
  if (patch.spans !== undefined) {
    if (!Array.isArray(patch.spans)) {
      return reject('invalid-spans', 'Step text must be a list of text runs.');
    }
    const normalized = normalizeSpans(patch.spans as readonly InlineSpan[]);
    if (JSON.stringify(normalized) !== JSON.stringify(data.steps[stepIndex].spans)) {
      next.spans = normalized;
      changed = true;
    }
  }

  if (!changed) return unchanged(source, blockId);
  const steps = data.steps.slice();
  steps[stepIndex] = next;
  return commitData(source, index, block, { ...data, steps }, options, stepId);
}

export function removeProcedureStep(
  source: DocStudioDocument,
  blockId: DocUUID,
  stepId: DocUUID,
  options: BlockOpOptions = {},
): LabContentActionResult {
  const found = locate(source, blockId, 'procedure-step');
  if (found.ok === false) return found.failure;
  const { index, block } = found;
  const data = block.data;
  if (!data.steps.some((step) => step.id === stepId)) {
    return reject('missing-entry', 'The procedure step to remove no longer exists.');
  }
  const next: ProcedureStepBlockData = {
    ...data,
    steps: data.steps.filter((step) => step.id !== stepId),
  };
  return commitData(source, index, block, next, options);
}

export function moveProcedureStep(
  source: DocStudioDocument,
  blockId: DocUUID,
  stepId: DocUUID,
  direction: unknown,
  options: BlockOpOptions = {},
): LabContentActionResult {
  const found = locate(source, blockId, 'procedure-step');
  if (found.ok === false) return found.failure;
  const { index, block } = found;
  const data = block.data;
  const dir = checkDirection(direction);
  if (dir === null) return reject('invalid-direction', 'A step can only move up or down.');
  if (!data.steps.some((step) => step.id === stepId)) {
    return reject('missing-entry', 'The procedure step to move no longer exists.');
  }
  const moved = moveEntry(data.steps, stepId, dir);
  if (!moved.changed) return unchanged(source, blockId);
  return commitData(source, index, block, { ...data, steps: moved.entries }, options, stepId);
}

// ─────────────────────────────────────────────────────────────────────────────
// Equipment / materials (§10.9 "Equipment/materials list or table")
// ─────────────────────────────────────────────────────────────────────────────

export function addEquipmentItem(
  source: DocStudioDocument,
  blockId: DocUUID,
  options: BlockOpOptions = {},
): LabContentActionResult {
  const found = locate(source, blockId, 'equipment-list');
  if (found.ok === false) return found.failure;
  const { index, block } = found;
  const data = block.data;
  const itemId = options.genId !== undefined ? options.genId() : newUUID();
  const item: EquipmentItem = { id: itemId, name: '', mandatory: true };
  const next: EquipmentListBlockData = { ...data, items: [...data.items, item] };
  return commitData(source, index, block, next, options, itemId);
}

/**
 * Update one equipment/materials item, addressed by its STABLE id.
 *
 * Validation (all BEFORE commit):
 * • `name`          — REQUIRED non-empty (`invalid-name`).
 * • `assetTag`/`manufacturer`/`modelNumber` — optional text; `null`/`''`
 *   clears (`invalid-text`).
 * • `calibrationDue`— empty or `YYYY-MM-DD` (`invalid-date`).
 * • `mandatory`     — boolean (`invalid-flag`).
 */
export function updateEquipmentItem(
  source: DocStudioDocument,
  blockId: DocUUID,
  itemId: DocUUID,
  patch: EquipmentItemPatch,
  options: BlockOpOptions = {},
): LabContentActionResult {
  const found = locate(source, blockId, 'equipment-list');
  if (found.ok === false) return found.failure;
  const { index, block } = found;
  const data = block.data;
  const itemIndex = data.items.findIndex((item) => item.id === itemId);
  if (itemIndex < 0) return reject('missing-entry', 'The equipment item to edit no longer exists.');

  const current = data.items[itemIndex];
  const next: EquipmentItem = { ...current };
  let changed = false;

  if (patch.name !== undefined) {
    const applied = requiredText(current.name, patch.name, {
      max: MAX_LAB_TEXT_LENGTH,
      code: 'invalid-name',
      label: 'An equipment item name',
      hint: 'An equipment item needs a name — enter what the item is called.',
    });
    if (applied.ok === false) return applied;
    if (applied.changed) {
      next.name = applied.value;
      changed = true;
    }
  }
  const optionalFields = ['assetTag', 'manufacturer', 'modelNumber'] as const;
  for (const field of optionalFields) {
    if (patch[field] !== undefined) {
      const applied = optionalText(current[field], patch[field], {
        max: MAX_LAB_TEXT_LENGTH,
        code: 'invalid-text',
        label: `The ${field === 'assetTag' ? 'asset tag' : field === 'modelNumber' ? 'model number' : 'manufacturer'} field`,
      });
      if (applied.ok === false) return applied;
      if (applied.changed) {
        if (applied.value === undefined) delete next[field];
        else next[field] = applied.value;
        changed = true;
      }
    }
  }
  if (patch.calibrationDue !== undefined) {
    const applied = optionalText(current.calibrationDue, patch.calibrationDue, {
      max: 10,
      code: 'invalid-date',
      label: 'A calibration due date',
    });
    if (applied.ok === false) return applied;
    if (applied.value !== undefined && !LAB_DATE_PATTERN.test(applied.value)) {
      return reject('invalid-date', 'A calibration due date must be empty or in YYYY-MM-DD format.');
    }
    if (applied.changed) {
      if (applied.value === undefined) delete next.calibrationDue;
      else next.calibrationDue = applied.value;
      changed = true;
    }
  }
  if (patch.mandatory !== undefined) {
    if (typeof patch.mandatory !== 'boolean') {
      return reject('invalid-flag', 'The mandatory flag must be turned on or off.');
    }
    if (next.mandatory !== patch.mandatory) {
      next.mandatory = patch.mandatory;
      changed = true;
    }
  }

  if (!changed) return unchanged(source, blockId);
  const items = data.items.slice();
  items[itemIndex] = next;
  return commitData(source, index, block, { ...data, items }, options, itemId);
}

export function removeEquipmentItem(
  source: DocStudioDocument,
  blockId: DocUUID,
  itemId: DocUUID,
  options: BlockOpOptions = {},
): LabContentActionResult {
  const found = locate(source, blockId, 'equipment-list');
  if (found.ok === false) return found.failure;
  const { index, block } = found;
  const data = block.data;
  if (!data.items.some((item) => item.id === itemId)) {
    return reject('missing-entry', 'The equipment item to remove no longer exists.');
  }
  const next: EquipmentListBlockData = {
    ...data,
    items: data.items.filter((item) => item.id !== itemId),
  };
  return commitData(source, index, block, next, options);
}

export function moveEquipmentItem(
  source: DocStudioDocument,
  blockId: DocUUID,
  itemId: DocUUID,
  direction: unknown,
  options: BlockOpOptions = {},
): LabContentActionResult {
  const found = locate(source, blockId, 'equipment-list');
  if (found.ok === false) return found.failure;
  const { index, block } = found;
  const data = block.data;
  const dir = checkDirection(direction);
  if (dir === null) return reject('invalid-direction', 'An item can only move up or down.');
  if (!data.items.some((item) => item.id === itemId)) {
    return reject('missing-entry', 'The equipment item to move no longer exists.');
  }
  const moved = moveEntry(data.items, itemId, dir);
  if (!moved.changed) return unchanged(source, blockId);
  return commitData(source, index, block, { ...data, items: moved.entries }, options, itemId);
}

// ─────────────────────────────────────────────────────────────────────────────
// Observations (§10.9 "Sample/technical observation block")
// ─────────────────────────────────────────────────────────────────────────────

export function addObservationRow(
  source: DocStudioDocument,
  blockId: DocUUID,
  options: BlockOpOptions = {},
): LabContentActionResult {
  const found = locate(source, blockId, 'observation');
  if (found.ok === false) return found.failure;
  const { index, block } = found;
  const data = block.data;
  const rowId = options.genId !== undefined ? options.genId() : newUUID();
  const row: ObservationRow = { id: rowId, parameter: '', observedValue: '' };
  const next: ObservationBlockData = { ...data, rows: [...data.rows, row] };
  return commitData(source, index, block, next, options, rowId);
}

/**
 * Update one observation row, addressed by its STABLE id.
 *
 * Validation (all BEFORE commit):
 * • `parameter`     — REQUIRED non-empty (`invalid-parameter`).
 * • `observedValue` — optional text (`invalid-text`; `null`/`''` clears,
 *   so a value can be blanked for handwritten completion).
 * • `remarks`       — optional text (`invalid-text`).
 */
export function updateObservationRow(
  source: DocStudioDocument,
  blockId: DocUUID,
  rowId: DocUUID,
  patch: ObservationRowPatch,
  options: BlockOpOptions = {},
): LabContentActionResult {
  const found = locate(source, blockId, 'observation');
  if (found.ok === false) return found.failure;
  const { index, block } = found;
  const data = block.data;
  const rowIndex = data.rows.findIndex((row) => row.id === rowId);
  if (rowIndex < 0) return reject('missing-entry', 'The observation row to edit no longer exists.');

  const current = data.rows[rowIndex];
  const next: ObservationRow = { ...current };
  let changed = false;

  if (patch.parameter !== undefined) {
    const applied = requiredText(current.parameter, patch.parameter, {
      max: MAX_LAB_TEXT_LENGTH,
      code: 'invalid-parameter',
      label: 'An observation parameter',
      hint: 'An observation row needs a parameter — say what is being observed.',
    });
    if (applied.ok === false) return applied;
    if (applied.changed) {
      next.parameter = applied.value;
      changed = true;
    }
  }
  if (patch.observedValue !== undefined) {
    const applied = optionalText(current.observedValue, patch.observedValue, {
      max: MAX_LAB_TEXT_LENGTH,
      code: 'invalid-text',
      label: 'An observed value',
    });
    if (applied.ok === false) return applied;
    if (applied.changed) {
      if (applied.value === undefined) next.observedValue = '';
      else next.observedValue = applied.value;
      changed = true;
    }
  }
  if (patch.remarks !== undefined) {
    const applied = optionalText(current.remarks, patch.remarks, {
      max: MAX_LAB_TEXT_LENGTH,
      code: 'invalid-text',
      label: 'A remark',
    });
    if (applied.ok === false) return applied;
    if (applied.changed) {
      if (applied.value === undefined) delete next.remarks;
      else next.remarks = applied.value;
      changed = true;
    }
  }

  if (!changed) return unchanged(source, blockId);
  const rows = data.rows.slice();
  rows[rowIndex] = next;
  return commitData(source, index, block, { ...data, rows }, options, rowId);
}

export function removeObservationRow(
  source: DocStudioDocument,
  blockId: DocUUID,
  rowId: DocUUID,
  options: BlockOpOptions = {},
): LabContentActionResult {
  const found = locate(source, blockId, 'observation');
  if (found.ok === false) return found.failure;
  const { index, block } = found;
  const data = block.data;
  if (!data.rows.some((row) => row.id === rowId)) {
    return reject('missing-entry', 'The observation row to remove no longer exists.');
  }
  const next: ObservationBlockData = { ...data, rows: data.rows.filter((row) => row.id !== rowId) };
  return commitData(source, index, block, next, options);
}

export function moveObservationRow(
  source: DocStudioDocument,
  blockId: DocUUID,
  rowId: DocUUID,
  direction: unknown,
  options: BlockOpOptions = {},
): LabContentActionResult {
  const found = locate(source, blockId, 'observation');
  if (found.ok === false) return found.failure;
  const { index, block } = found;
  const data = block.data;
  const dir = checkDirection(direction);
  if (dir === null) return reject('invalid-direction', 'A row can only move up or down.');
  if (!data.rows.some((row) => row.id === rowId)) {
    return reject('missing-entry', 'The observation row to move no longer exists.');
  }
  const moved = moveEntry(data.rows, rowId, dir);
  if (!moved.changed) return unchanged(source, blockId);
  return commitData(source, index, block, { ...data, rows: moved.entries }, options, rowId);
}

// ─────────────────────────────────────────────────────────────────────────────
// Measurement / worksheet table (§10.9 "Measurement/worksheet table")
// ─────────────────────────────────────────────────────────────────────────────

export function addMeasurementColumn(
  source: DocStudioDocument,
  blockId: DocUUID,
  options: BlockOpOptions = {},
): LabContentActionResult {
  const found = locate(source, blockId, 'measurement');
  if (found.ok === false) return found.failure;
  const { index, block } = found;
  const data = block.data;
  if (data.columns.length >= MAX_MEASUREMENT_COLUMNS) {
    return reject(
      'too-many-columns',
      `A measurement table can have at most ${MAX_MEASUREMENT_COLUMNS} columns.`,
    );
  }
  const columnId = options.genId !== undefined ? options.genId() : newUUID();
  const column: MeasurementColumn = { id: columnId, header: `Column ${data.columns.length + 1}` };
  const next: MeasurementBlockData = { ...data, columns: [...data.columns, column] };
  return commitData(source, index, block, next, options, columnId);
}

/**
 * Update one measurement column header/unit, addressed by its STABLE id.
 *
 * Validation: `header` REQUIRED non-empty (`invalid-column-header`);
 * `unit` optional text ≤ 60 chars (`invalid-unit`; `null`/`''` clears).
 */
export function updateMeasurementColumn(
  source: DocStudioDocument,
  blockId: DocUUID,
  columnId: DocUUID,
  patch: MeasurementColumnPatch,
  options: BlockOpOptions = {},
): LabContentActionResult {
  const found = locate(source, blockId, 'measurement');
  if (found.ok === false) return found.failure;
  const { index, block } = found;
  const data = block.data;
  const columnIndex = data.columns.findIndex((column) => column.id === columnId);
  if (columnIndex < 0) return reject('missing-entry', 'The column to edit no longer exists.');

  const current = data.columns[columnIndex];
  const next: MeasurementColumn = { ...current };
  let changed = false;

  if (patch.header !== undefined) {
    const applied = requiredText(current.header, patch.header, {
      max: MAX_LAB_TEXT_LENGTH,
      code: 'invalid-column-header',
      label: 'A column header',
      hint: 'A measurement column needs a header — say what the column records.',
    });
    if (applied.ok === false) return applied;
    if (applied.changed) {
      next.header = applied.value;
      changed = true;
    }
  }
  if (patch.unit !== undefined) {
    const applied = optionalText(current.unit, patch.unit, {
      max: MAX_LAB_UNIT_LENGTH,
      code: 'invalid-unit',
      label: 'A unit',
    });
    if (applied.ok === false) return applied;
    if (applied.changed) {
      if (applied.value === undefined) delete next.unit;
      else next.unit = applied.value;
      changed = true;
    }
  }

  if (!changed) return unchanged(source, blockId);
  const columns = data.columns.slice();
  columns[columnIndex] = next;
  return commitData(source, index, block, { ...data, columns }, options, columnId);
}

/**
 * Remove one column AND its cell values from every row (content-losing —
 * the editor requests confirmation first, mirroring the P05-M4 table
 * column removal).  Removal is allowed down to zero columns; the renderer
 * then shows an honest empty state.
 */
export function removeMeasurementColumn(
  source: DocStudioDocument,
  blockId: DocUUID,
  columnId: DocUUID,
  options: BlockOpOptions = {},
): LabContentActionResult {
  const found = locate(source, blockId, 'measurement');
  if (found.ok === false) return found.failure;
  const { index, block } = found;
  const data = block.data;
  if (!data.columns.some((column) => column.id === columnId)) {
    return reject('missing-entry', 'The column to remove no longer exists.');
  }
  const rows = data.rows.map((row) => {
    if (!(columnId in row.values)) return row;
    const values = { ...row.values };
    delete values[columnId];
    return { ...row, values };
  });
  const next: MeasurementBlockData = {
    ...data,
    columns: data.columns.filter((column) => column.id !== columnId),
    rows,
  };
  return commitData(source, index, block, next, options);
}

export function moveMeasurementColumn(
  source: DocStudioDocument,
  blockId: DocUUID,
  columnId: DocUUID,
  direction: unknown,
  options: BlockOpOptions = {},
): LabContentActionResult {
  const found = locate(source, blockId, 'measurement');
  if (found.ok === false) return found.failure;
  const { index, block } = found;
  const data = block.data;
  const dir = checkDirection(direction);
  if (dir === null) return reject('invalid-direction', 'A column can only move left or right.');
  if (!data.columns.some((column) => column.id === columnId)) {
    return reject('missing-entry', 'The column to move no longer exists.');
  }
  const moved = moveEntry(data.columns, columnId, dir);
  if (!moved.changed) return unchanged(source, blockId);
  return commitData(source, index, block, { ...data, columns: moved.entries }, options, columnId);
}

export function addMeasurementRow(
  source: DocStudioDocument,
  blockId: DocUUID,
  options: BlockOpOptions = {},
): LabContentActionResult {
  const found = locate(source, blockId, 'measurement');
  if (found.ok === false) return found.failure;
  const { index, block } = found;
  const data = block.data;
  const rowId = options.genId !== undefined ? options.genId() : newUUID();
  const row = { id: rowId, values: {} };
  const next: MeasurementBlockData = { ...data, rows: [...data.rows, row] };
  return commitData(source, index, block, next, options, rowId);
}

/**
 * Set ONE cell value (`rowId` × `columnId`).  Both must exist
 * (`missing-entry` / `unknown-column`); any text up to
 * MAX_LAB_TEXT_LENGTH is accepted INCLUDING the empty string — blank
 * cells are the legitimate handwritten recording space of a worksheet.
 */
export function setMeasurementCell(
  source: DocStudioDocument,
  blockId: DocUUID,
  rowId: DocUUID,
  columnId: DocUUID,
  value: unknown,
  options: BlockOpOptions = {},
): LabContentActionResult {
  const found = locate(source, blockId, 'measurement');
  if (found.ok === false) return found.failure;
  const { index, block } = found;
  const data = block.data;
  const rowIndex = data.rows.findIndex((row) => row.id === rowId);
  if (rowIndex < 0) return reject('missing-entry', 'The worksheet row no longer exists.');
  if (!data.columns.some((column) => column.id === columnId)) {
    return reject('unknown-column', 'That worksheet column no longer exists.');
  }
  if (!isFreeText(value)) {
    return reject('invalid-cell', 'A cell value must be text.');
  }
  const current = data.rows[rowIndex].values[columnId] ?? '';
  if (current === value) return unchanged(source, blockId);
  const rows = data.rows.slice();
  rows[rowIndex] = { ...rows[rowIndex], values: { ...rows[rowIndex].values, [columnId]: value } };
  return commitData(source, index, block, { ...data, rows }, options, rowId);
}

export function removeMeasurementRow(
  source: DocStudioDocument,
  blockId: DocUUID,
  rowId: DocUUID,
  options: BlockOpOptions = {},
): LabContentActionResult {
  const found = locate(source, blockId, 'measurement');
  if (found.ok === false) return found.failure;
  const { index, block } = found;
  const data = block.data;
  if (!data.rows.some((row) => row.id === rowId)) {
    return reject('missing-entry', 'The worksheet row to remove no longer exists.');
  }
  const next: MeasurementBlockData = { ...data, rows: data.rows.filter((row) => row.id !== rowId) };
  return commitData(source, index, block, next, options);
}

export function moveMeasurementRow(
  source: DocStudioDocument,
  blockId: DocUUID,
  rowId: DocUUID,
  direction: unknown,
  options: BlockOpOptions = {},
): LabContentActionResult {
  const found = locate(source, blockId, 'measurement');
  if (found.ok === false) return found.failure;
  const { index, block } = found;
  const data = block.data;
  const dir = checkDirection(direction);
  if (dir === null) return reject('invalid-direction', 'A row can only move up or down.');
  if (!data.rows.some((row) => row.id === rowId)) {
    return reject('missing-entry', 'The worksheet row to move no longer exists.');
  }
  const moved = moveEntry(data.rows, rowId, dir);
  if (!moved.changed) return unchanged(source, blockId);
  return commitData(source, index, block, { ...data, rows: moved.entries }, options, rowId);
}

/**
 * Set/clear the optional uncertainty note rendered below the worksheet
 * table (`null`/`''` clears).
 */
export function setMeasurementUncertaintyNote(
  source: DocStudioDocument,
  blockId: DocUUID,
  note: string | null | undefined,
  options: BlockOpOptions = {},
): LabContentActionResult {
  const found = locate(source, blockId, 'measurement');
  if (found.ok === false) return found.failure;
  const { index, block } = found;
  const data = block.data;
  const applied = optionalText(data.uncertaintyNote, note === undefined ? null : note, {
    max: MAX_LAB_TEXT_LENGTH,
    code: 'invalid-text',
    label: 'The uncertainty note',
  });
  if (applied.ok === false) return applied;
  if (!applied.changed) return unchanged(source, blockId);
  const next = { ...data };
  if (applied.value === undefined) delete next.uncertaintyNote;
  else next.uncertaintyNote = applied.value;
  return commitData(source, index, block, next, options);
}

// ─────────────────────────────────────────────────────────────────────────────
// Calculation (§10.9 "Calculation block")
// ─────────────────────────────────────────────────────────────────────────────

export function addCalculationStep(
  source: DocStudioDocument,
  blockId: DocUUID,
  options: BlockOpOptions = {},
): LabContentActionResult {
  const found = locate(source, blockId, 'calculation');
  if (found.ok === false) return found.failure;
  const { index, block } = found;
  const data = block.data;
  const stepId = options.genId !== undefined ? options.genId() : newUUID();
  const step: CalculationStep = { id: stepId, latex: '' };
  const next: CalculationBlockData = { ...data, steps: [...data.steps, step] };
  return commitData(source, index, block, next, options, stepId);
}

/**
 * Update one calculation step, addressed by its STABLE id.
 *
 * Validation (all BEFORE commit):
 * • `latex` — REQUIRED non-empty and parseable by the REAL MathJax
 *   engine (`invalid-latex`, the engine's own message is surfaced —
 *   same contract as the P06-M3 formula editor); ≤ 4000 chars.
 * • `label`/`substitution`/`result`/`note` — optional text
 *   (`invalid-text`; `null`/`''` clears).
 *
 * There is NO calculation engine: every value is author-entered text.
 */
export function updateCalculationStep(
  source: DocStudioDocument,
  blockId: DocUUID,
  stepId: DocUUID,
  patch: CalculationStepPatch,
  options: BlockOpOptions = {},
): LabContentActionResult {
  const found = locate(source, blockId, 'calculation');
  if (found.ok === false) return found.failure;
  const { index, block } = found;
  const data = block.data;
  const stepIndex = data.steps.findIndex((step) => step.id === stepId);
  if (stepIndex < 0) return reject('missing-entry', 'The calculation step to edit no longer exists.');

  const current = data.steps[stepIndex];
  const next: CalculationStep = { ...current };
  let changed = false;

  if (patch.latex !== undefined) {
    if (patch.latex === null || typeof patch.latex !== 'string' || patch.latex.trim() === '') {
      return reject('invalid-latex', 'A calculation step needs a formula — enter it as LaTeX.');
    }
    const trimmed = patch.latex.trim();
    if (trimmed.length > MAX_FORMULA_LATEX_LENGTH) {
      return reject(
        'invalid-latex',
        `The formula must be at most ${MAX_FORMULA_LATEX_LENGTH} characters.`,
      );
    }
    const parsed = validateLatex(trimmed);
    if (parsed.ok === false) {
      return reject('invalid-latex', `That LaTeX formula could not be parsed: ${parsed.message}`);
    }
    if (current.latex !== trimmed) {
      next.latex = trimmed;
      changed = true;
    }
  }
  const optionalFields = ['label', 'substitution', 'result', 'note'] as const;
  for (const field of optionalFields) {
    if (patch[field] !== undefined) {
      const applied = optionalText(current[field], patch[field], {
        max: MAX_LAB_TEXT_LENGTH,
        code: 'invalid-text',
        label: `A calculation step ${field === 'label' ? 'label' : field}`,
      });
      if (applied.ok === false) return applied;
      if (applied.changed) {
        if (applied.value === undefined) delete next[field];
        else next[field] = applied.value;
        changed = true;
      }
    }
  }

  if (!changed) return unchanged(source, blockId);
  const steps = data.steps.slice();
  steps[stepIndex] = next;
  return commitData(source, index, block, { ...data, steps }, options, stepId);
}

export function removeCalculationStep(
  source: DocStudioDocument,
  blockId: DocUUID,
  stepId: DocUUID,
  options: BlockOpOptions = {},
): LabContentActionResult {
  const found = locate(source, blockId, 'calculation');
  if (found.ok === false) return found.failure;
  const { index, block } = found;
  const data = block.data;
  if (!data.steps.some((step) => step.id === stepId)) {
    return reject('missing-entry', 'The calculation step to remove no longer exists.');
  }
  const next: CalculationBlockData = {
    ...data,
    steps: data.steps.filter((step) => step.id !== stepId),
  };
  return commitData(source, index, block, next, options);
}

export function moveCalculationStep(
  source: DocStudioDocument,
  blockId: DocUUID,
  stepId: DocUUID,
  direction: unknown,
  options: BlockOpOptions = {},
): LabContentActionResult {
  const found = locate(source, blockId, 'calculation');
  if (found.ok === false) return found.failure;
  const { index, block } = found;
  const data = block.data;
  const dir = checkDirection(direction);
  if (dir === null) return reject('invalid-direction', 'A step can only move up or down.');
  if (!data.steps.some((step) => step.id === stepId)) {
    return reject('missing-entry', 'The calculation step to move no longer exists.');
  }
  const moved = moveEntry(data.steps, stepId, dir);
  if (!moved.changed) return unchanged(source, blockId);
  return commitData(source, index, block, { ...data, steps: moved.entries }, options, stepId);
}

/** Set/clear the optional conclusion statement (`null`/`''` clears). */
export function setCalculationConclusion(
  source: DocStudioDocument,
  blockId: DocUUID,
  text: string | null | undefined,
  options: BlockOpOptions = {},
): LabContentActionResult {
  const found = locate(source, blockId, 'calculation');
  if (found.ok === false) return found.failure;
  const { index, block } = found;
  const data = block.data;
  const applied = optionalText(data.conclusionText, text === undefined ? null : text, {
    max: MAX_LAB_TEXT_LENGTH,
    code: 'invalid-text',
    label: 'The conclusion',
  });
  if (applied.ok === false) return applied;
  if (!applied.changed) return unchanged(source, blockId);
  const next = { ...data };
  if (applied.value === undefined) delete next.conclusionText;
  else next.conclusionText = applied.value;
  return commitData(source, index, block, next, options);
}

// ─────────────────────────────────────────────────────────────────────────────
// Acceptance criteria (§10.9 "Acceptance-criteria block")
// ─────────────────────────────────────────────────────────────────────────────

export function addAcceptanceCriterion(
  source: DocStudioDocument,
  blockId: DocUUID,
  options: BlockOpOptions = {},
): LabContentActionResult {
  const found = locate(source, blockId, 'acceptance-criteria');
  if (found.ok === false) return found.failure;
  const { index, block } = found;
  const data = block.data;
  const criterionId = options.genId !== undefined ? options.genId() : newUUID();
  const criterion: AcceptanceCriterion = {
    id: criterionId,
    criterion: '',
    specification: '',
    result: 'pending',
  };
  const next: AcceptanceCriteriaBlockData = { ...data, criteria: [...data.criteria, criterion] };
  return commitData(source, index, block, next, options, criterionId);
}

/**
 * Update one acceptance criterion, addressed by its STABLE id.
 *
 * Validation (all BEFORE commit):
 * • `criterion`     — REQUIRED non-empty (`invalid-criterion`).
 * • `specification` — REQUIRED non-empty (`invalid-specification`): an
 *   acceptance criterion without its limit/requirement is not
 *   authorable as a criterion (the VALUES are never hard-coded or
 *   evaluated — see the product boundary note in this file's header).
 * • `measuredValue` / `remarks` — optional text (`invalid-text`).
 * • `result`        — one of CRITERIA_RESULTS (`invalid-result`).
 */
export function updateAcceptanceCriterion(
  source: DocStudioDocument,
  blockId: DocUUID,
  criterionId: DocUUID,
  patch: AcceptanceCriterionPatch,
  options: BlockOpOptions = {},
): LabContentActionResult {
  const found = locate(source, blockId, 'acceptance-criteria');
  if (found.ok === false) return found.failure;
  const { index, block } = found;
  const data = block.data;
  const rowIndex = data.criteria.findIndex((row) => row.id === criterionId);
  if (rowIndex < 0) {
    return reject('missing-entry', 'The acceptance criterion to edit no longer exists.');
  }

  const current = data.criteria[rowIndex];
  const next: AcceptanceCriterion = { ...current };
  let changed = false;

  if (patch.criterion !== undefined) {
    const applied = requiredText(current.criterion, patch.criterion, {
      max: MAX_LAB_TEXT_LENGTH,
      code: 'invalid-criterion',
      label: 'An acceptance criterion',
      hint: 'An acceptance criterion needs a description — say what is being judged.',
    });
    if (applied.ok === false) return applied;
    if (applied.changed) {
      next.criterion = applied.value;
      changed = true;
    }
  }
  if (patch.specification !== undefined) {
    const applied = requiredText(current.specification, patch.specification, {
      max: MAX_LAB_TEXT_LENGTH,
      code: 'invalid-specification',
      label: 'A specification',
      hint: 'A criterion needs its specification or limit, for example "≤ 0.5 %".',
    });
    if (applied.ok === false) return applied;
    if (applied.changed) {
      next.specification = applied.value;
      changed = true;
    }
  }
  if (patch.measuredValue !== undefined) {
    const applied = optionalText(current.measuredValue, patch.measuredValue, {
      max: MAX_LAB_TEXT_LENGTH,
      code: 'invalid-text',
      label: 'A measured value',
    });
    if (applied.ok === false) return applied;
    if (applied.changed) {
      if (applied.value === undefined) delete next.measuredValue;
      else next.measuredValue = applied.value;
      changed = true;
    }
  }
  if (patch.result !== undefined) {
    if (
      typeof patch.result !== 'string' ||
      !(CRITERIA_RESULTS as readonly string[]).includes(patch.result)
    ) {
      return reject(
        'invalid-result',
        'A result must be Pass, Fail, Inconclusive, N/A or Pending.',
      );
    }
    if (next.result !== patch.result) {
      next.result = patch.result as CriteriaResult;
      changed = true;
    }
  }
  if (patch.remarks !== undefined) {
    const applied = optionalText(current.remarks, patch.remarks, {
      max: MAX_LAB_TEXT_LENGTH,
      code: 'invalid-text',
      label: 'A remark',
    });
    if (applied.ok === false) return applied;
    if (applied.changed) {
      if (applied.value === undefined) delete next.remarks;
      else next.remarks = applied.value;
      changed = true;
    }
  }

  if (!changed) return unchanged(source, blockId);
  const criteria = data.criteria.slice();
  criteria[rowIndex] = next;
  return commitData(source, index, block, { ...data, criteria }, options, criterionId);
}

export function removeAcceptanceCriterion(
  source: DocStudioDocument,
  blockId: DocUUID,
  criterionId: DocUUID,
  options: BlockOpOptions = {},
): LabContentActionResult {
  const found = locate(source, blockId, 'acceptance-criteria');
  if (found.ok === false) return found.failure;
  const { index, block } = found;
  const data = block.data;
  if (!data.criteria.some((row) => row.id === criterionId)) {
    return reject('missing-entry', 'The acceptance criterion to remove no longer exists.');
  }
  const next: AcceptanceCriteriaBlockData = {
    ...data,
    criteria: data.criteria.filter((row) => row.id !== criterionId),
  };
  return commitData(source, index, block, next, options);
}

export function moveAcceptanceCriterion(
  source: DocStudioDocument,
  blockId: DocUUID,
  criterionId: DocUUID,
  direction: unknown,
  options: BlockOpOptions = {},
): LabContentActionResult {
  const found = locate(source, blockId, 'acceptance-criteria');
  if (found.ok === false) return found.failure;
  const { index, block } = found;
  const data = block.data;
  const dir = checkDirection(direction);
  if (dir === null) return reject('invalid-direction', 'A criterion can only move up or down.');
  if (!data.criteria.some((row) => row.id === criterionId)) {
    return reject('missing-entry', 'The acceptance criterion to move no longer exists.');
  }
  const moved = moveEntry(data.criteria, criterionId, dir);
  if (!moved.changed) return unchanged(source, blockId);
  return commitData(source, index, block, { ...data, criteria: moved.entries }, options, criterionId);
}

/** Set/clear the author-entered OVERALL verdict (`null` clears). */
export function setAcceptanceOverallResult(
  source: DocStudioDocument,
  blockId: DocUUID,
  result: CriteriaResult | null | undefined,
  options: BlockOpOptions = {},
): LabContentActionResult {
  const found = locate(source, blockId, 'acceptance-criteria');
  if (found.ok === false) return found.failure;
  const { index, block } = found;
  const data = block.data;

  let value: CriteriaResult | undefined;
  if (result === null || result === undefined) {
    value = undefined;
  } else {
    if (!(CRITERIA_RESULTS as readonly string[]).includes(result)) {
      return reject(
        'invalid-result',
        'The overall result must be Pass, Fail, Inconclusive, N/A or Pending.',
      );
    }
    value = result;
  }

  if ((data.overallResult ?? '') === (value ?? '')) return unchanged(source, blockId);
  const next = { ...data };
  if (value === undefined) delete next.overallResult;
  else next.overallResult = value;
  return commitData(source, index, block, next, options);
}

// ─────────────────────────────────────────────────────────────────────────────
// Title convenience actions (all six types)
// ─────────────────────────────────────────────────────────────────────────────

export function updateProcedureTitle(
  source: DocStudioDocument,
  blockId: DocUUID,
  title: string | null | undefined,
  options: BlockOpOptions = {},
): LabContentActionResult {
  return updateTitle(source, blockId, 'procedure-step', 'sectionTitle', title, options);
}

export function updateEquipmentTitle(
  source: DocStudioDocument,
  blockId: DocUUID,
  title: string | null | undefined,
  options: BlockOpOptions = {},
): LabContentActionResult {
  return updateTitle(source, blockId, 'equipment-list', 'title', title, options);
}

export function updateObservationTitle(
  source: DocStudioDocument,
  blockId: DocUUID,
  title: string | null | undefined,
  options: BlockOpOptions = {},
): LabContentActionResult {
  return updateTitle(source, blockId, 'observation', 'title', title, options);
}

export function updateMeasurementTitle(
  source: DocStudioDocument,
  blockId: DocUUID,
  title: string | null | undefined,
  options: BlockOpOptions = {},
): LabContentActionResult {
  return updateTitle(source, blockId, 'measurement', 'title', title, options);
}

export function updateCalculationTitle(
  source: DocStudioDocument,
  blockId: DocUUID,
  title: string | null | undefined,
  options: BlockOpOptions = {},
): LabContentActionResult {
  return updateTitle(source, blockId, 'calculation', 'title', title, options);
}

export function updateAcceptanceTitle(
  source: DocStudioDocument,
  blockId: DocUUID,
  title: string | null | undefined,
  options: BlockOpOptions = {},
): LabContentActionResult {
  return updateTitle(source, blockId, 'acceptance-criteria', 'title', title, options);
}

// ─────────────────────────────────────────────────────────────────────────────
// Dispatcher
// ─────────────────────────────────────────────────────────────────────────────

/**
 * One dispatcher for the six laboratory editors (same narrow-prop pattern
 * as the P05-M3 list, P05-M4 table, P06-M2 structural, P06-M3 formula and
 * P06-M4 image/signature dispatchers): every action keeps its own
 * validation above, the App wires exactly one callback.
 */
export function applyLabAction(
  source: DocStudioDocument,
  blockId: DocUUID,
  action: LabContentAction,
  options: BlockOpOptions = {},
): LabContentActionResult {
  switch (action.action) {
    // ── procedure-step ──────────────────────────────────────────────────────
    case 'update-procedure-title':
      return updateProcedureTitle(source, blockId, action.title, options);
    case 'add-procedure-step':
      return addProcedureStep(source, blockId, options);
    case 'update-procedure-step':
      return updateProcedureStep(source, blockId, action.stepId, action.patch, options);
    case 'remove-procedure-step':
      return removeProcedureStep(source, blockId, action.stepId, options);
    case 'move-procedure-step':
      return moveProcedureStep(source, blockId, action.stepId, action.direction, options);
    // ── equipment-list ──────────────────────────────────────────────────────
    case 'update-equipment-title':
      return updateEquipmentTitle(source, blockId, action.title, options);
    case 'add-equipment-item':
      return addEquipmentItem(source, blockId, options);
    case 'update-equipment-item':
      return updateEquipmentItem(source, blockId, action.itemId, action.patch, options);
    case 'remove-equipment-item':
      return removeEquipmentItem(source, blockId, action.itemId, options);
    case 'move-equipment-item':
      return moveEquipmentItem(source, blockId, action.itemId, action.direction, options);
    // ── observation ─────────────────────────────────────────────────────────
    case 'update-observation-title':
      return updateObservationTitle(source, blockId, action.title, options);
    case 'add-observation-row':
      return addObservationRow(source, blockId, options);
    case 'update-observation-row':
      return updateObservationRow(source, blockId, action.rowId, action.patch, options);
    case 'remove-observation-row':
      return removeObservationRow(source, blockId, action.rowId, options);
    case 'move-observation-row':
      return moveObservationRow(source, blockId, action.rowId, action.direction, options);
    // ── measurement ─────────────────────────────────────────────────────────
    case 'update-measurement-title':
      return updateMeasurementTitle(source, blockId, action.title, options);
    case 'set-measurement-uncertainty-note':
      return setMeasurementUncertaintyNote(source, blockId, action.note, options);
    case 'add-measurement-column':
      return addMeasurementColumn(source, blockId, options);
    case 'update-measurement-column':
      return updateMeasurementColumn(source, blockId, action.columnId, action.patch, options);
    case 'remove-measurement-column':
      return removeMeasurementColumn(source, blockId, action.columnId, options);
    case 'move-measurement-column':
      return moveMeasurementColumn(source, blockId, action.columnId, action.direction, options);
    case 'add-measurement-row':
      return addMeasurementRow(source, blockId, options);
    case 'set-measurement-cell':
      return setMeasurementCell(source, blockId, action.rowId, action.columnId, action.value, options);
    case 'remove-measurement-row':
      return removeMeasurementRow(source, blockId, action.rowId, options);
    case 'move-measurement-row':
      return moveMeasurementRow(source, blockId, action.rowId, action.direction, options);
    // ── calculation ─────────────────────────────────────────────────────────
    case 'update-calculation-title':
      return updateCalculationTitle(source, blockId, action.title, options);
    case 'set-calculation-conclusion':
      return setCalculationConclusion(source, blockId, action.text, options);
    case 'add-calculation-step':
      return addCalculationStep(source, blockId, options);
    case 'update-calculation-step':
      return updateCalculationStep(source, blockId, action.stepId, action.patch, options);
    case 'remove-calculation-step':
      return removeCalculationStep(source, blockId, action.stepId, options);
    case 'move-calculation-step':
      return moveCalculationStep(source, blockId, action.stepId, action.direction, options);
    // ── acceptance-criteria ─────────────────────────────────────────────────
    case 'update-acceptance-title':
      return updateAcceptanceTitle(source, blockId, action.title, options);
    case 'set-acceptance-overall':
      return setAcceptanceOverallResult(source, blockId, action.result, options);
    case 'add-acceptance-criterion':
      return addAcceptanceCriterion(source, blockId, options);
    case 'update-acceptance-criterion':
      return updateAcceptanceCriterion(source, blockId, action.criterionId, action.patch, options);
    case 'remove-acceptance-criterion':
      return removeAcceptanceCriterion(source, blockId, action.criterionId, options);
    case 'move-acceptance-criterion':
      return moveAcceptanceCriterion(source, blockId, action.criterionId, action.direction, options);
    default:
      return reject('invalid-action', 'That laboratory block action is not supported.');
  }
}
