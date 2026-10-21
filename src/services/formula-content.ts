/**
 * DocStudio — Immutable formula block content actions (P06-M3)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Pure, non-mutating content operations for the FORMULA block (roadmap
 * Phase 06 §6.3, product spec §10.6).  Same conventions as every earlier
 * content service: no-op commits return the SAME document reference (so the
 * App never dirties the document for a no-change edit), real changes stamp
 * `modifiedAt`, failures leave the document untouched and carry a
 * field-specific message, and every edit is validated BEFORE commit.
 *
 * VALIDATION SUMMARY (all before commit):
 * • LaTeX     — required non-empty text, bounded length, and it must PARSE
 *               through the real MathJax engine (`validateLatex`); the
 *               parser's own message is surfaced (e.g. "Missing argument
 *               for \frac").  Mid-edit partial input that does not parse is
 *               rejected at commit exactly like an unsafe reference URL —
 *               the previous valid formula stays in the document.
 * • Alignment — must be left / center / right.
 * • Display   — must be a boolean (display = block-style equation).
 * • Number    — optional free text (e.g. "(3.2)"); empty or null clears.
 * • Where label — optional free text; empty or null restores the default
 *               "Where:" label.
 * • Variables — add / update / remove addressed by STABLE entry ids; the
 *               symbol is required (a variable with no symbol is meaningless
 *               in a `Where:` list), the definition and unit are free text
 *               and the unit may be cleared with null.
 *
 * Nothing here renders: rendering decisions (fit scaling, the
 * right-vs-below "Where:" rule) live in the renderer's pure
 * `planFormulaLayout`, and conversion lives in `math-engine`.
 *
 * @module services/formula-content
 */

import type { DocStudioDocument, DocUUID, HAlignment } from '../types/document';
import type { FormulaBlockData } from '../types/blocks';
import { newUUID, nowISO } from '../types/defaults';
import { indexOfBlock, stamped, type BlockOpOptions } from './block-actions';
import { validateLatex } from './math-engine';

// ─────────────────────────────────────────────────────────────────────────────
// Contract constants
// ─────────────────────────────────────────────────────────────────────────────

/** Longest accepted LaTeX source (characters). */
export const MAX_FORMULA_LATEX_LENGTH = 4000;

/** Longest accepted equation-number label (e.g. "(3.2)"). */
export const MAX_FORMULA_NUMBER_LENGTH = 64;

/** Longest accepted custom "Where:" label. */
export const MAX_WHERE_LABEL_LENGTH = 64;

/** Longest accepted variable symbol (may include LaTeX such as "\sigma"). */
export const MAX_VARIABLE_SYMBOL_LENGTH = 200;

/** Longest accepted variable definition text. */
export const MAX_VARIABLE_DEFINITION_LENGTH = 1000;

/** Longest accepted variable unit string (e.g. "m·s⁻²"). */
export const MAX_VARIABLE_UNIT_LENGTH = 120;

/** Alignment choices for a formula (the schema `HAlignment` union). */
export const FORMULA_ALIGNMENTS: readonly HAlignment[] = ['left', 'center', 'right'];

// ─────────────────────────────────────────────────────────────────────────────
// Result and action contracts
// ─────────────────────────────────────────────────────────────────────────────

export type FormulaContentErrorCode =
  | 'missing-block'
  | 'wrong-block-type'
  | 'invalid-action'
  | 'invalid-latex'
  | 'invalid-halign'
  | 'invalid-display-mode'
  | 'invalid-formula-number'
  | 'invalid-where-label'
  | 'missing-entry'
  | 'invalid-symbol'
  | 'invalid-definition'
  | 'invalid-unit';

export interface FormulaFailure {
  ok: false;
  code: FormulaContentErrorCode;
  message: string;
}

/** Success carries an `entryId` focus hint for variable-definition rows. */
export interface FormulaSuccess {
  ok: true;
  changed: boolean;
  doc: DocStudioDocument;
  blockId: DocUUID;
  entryId?: DocUUID;
}

export type FormulaContentActionResult = FormulaSuccess | FormulaFailure;

/** Patch fields for one variable definition.  Absent fields are never touched. */
export interface VariableDefinitionPatch {
  symbol?: unknown;
  definition?: unknown;
  unit?: string | null;
}

/**
 * One dispatcher action per operation (the P05-M3 / P05-M4 / P06-M2
 * narrow-prop pattern): the App wires exactly one callback.
 */
export type FormulaContentAction =
  | {
      action: 'update-formula';
      latex?: string;
      hAlign?: HAlignment;
      displayMode?: boolean;
      /** `null` (or empty string) clears the optional number. */
      formulaNumber?: string | null;
      /** `null` (or empty string) restores the default "Where:" label. */
      whereLabelOverride?: string | null;
    }
  | { action: 'add-variable-definition' }
  | { action: 'update-variable-definition'; entryId: DocUUID; patch: VariableDefinitionPatch }
  | { action: 'remove-variable-definition'; entryId: DocUUID };

const reject = (code: FormulaContentErrorCode, message: string): FormulaFailure => ({
  ok: false,
  code,
  message,
});

// ─────────────────────────────────────────────────────────────────────────────
// Formula source, alignment, display mode, number, Where label
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Apply a validated patch to the identified FORMULA block.  Every field is
 * optional; absent fields are untouched.  The LaTeX field is committed only
 * when it parses through the real engine, so the document can never hold a
 * formula the renderer would have to mark as unrenderable.
 */
export function updateFormulaContent(
  source: DocStudioDocument,
  blockId: DocUUID,
  patch: Extract<FormulaContentAction, { action: 'update-formula' }>,
  options: BlockOpOptions = {},
): FormulaContentActionResult {
  const index = indexOfBlock(source, blockId);
  if (index < 0) {
    return reject('missing-block', 'The formula to edit no longer exists in this document.');
  }
  const block = source.blocks[index];
  if (block.data.type !== 'formula') {
    return reject('wrong-block-type', 'This block is not a formula.');
  }
  const data = block.data;

  const next: FormulaBlockData = { ...data };
  let changed = false;

  if (patch.latex !== undefined) {
    if (typeof patch.latex !== 'string') {
      return reject('invalid-latex', 'The formula source must be text.');
    }
    const trimmed = patch.latex.trim();
    if (trimmed === '') {
      return reject(
        'invalid-latex',
        'A formula needs LaTeX content — type an equation such as "E = mc^2".',
      );
    }
    if (trimmed.length > MAX_FORMULA_LATEX_LENGTH) {
      return reject(
        'invalid-latex',
        `LaTeX source is limited to ${MAX_FORMULA_LATEX_LENGTH} characters.`,
      );
    }
    const parsed = validateLatex(trimmed);
    // `=== false` rather than `!parsed.ok` — narrows under the legacy
    // non-strict suite compiles too (same convention as rich-text.ts).
    if (parsed.ok === false) {
      return reject('invalid-latex', `This formula cannot be rendered (${parsed.message}).`);
    }
    if (trimmed !== data.latex) {
      next.latex = trimmed;
      changed = true;
    }
  }

  if (patch.hAlign !== undefined) {
    if (!FORMULA_ALIGNMENTS.includes(patch.hAlign)) {
      return reject('invalid-halign', 'Alignment must be left, center or right.');
    }
    if (patch.hAlign !== data.hAlign) {
      next.hAlign = patch.hAlign;
      changed = true;
    }
  }

  if (patch.displayMode !== undefined) {
    if (typeof patch.displayMode !== 'boolean') {
      return reject('invalid-display-mode', 'Display mode must be on or off.');
    }
    if (patch.displayMode !== data.displayMode) {
      next.displayMode = patch.displayMode;
      changed = true;
    }
  }

  if (patch.formulaNumber !== undefined) {
    // Explicit branches (see the section-break action in
    // structural-block-content for why this is written this way under
    // both --strict and the non-strict suite flags).
    let value: string | undefined;
    if (patch.formulaNumber === null) {
      value = undefined;
    } else if (typeof patch.formulaNumber === 'string') {
      const trimmed = patch.formulaNumber.trim();
      if (trimmed.length > MAX_FORMULA_NUMBER_LENGTH) {
        return reject(
          'invalid-formula-number',
          `The equation number is limited to ${MAX_FORMULA_NUMBER_LENGTH} characters.`,
        );
      }
      value = trimmed === '' ? undefined : trimmed;
    } else {
      return reject('invalid-formula-number', 'The equation number must be text.');
    }
    if ((value ?? '') !== (data.formulaNumber ?? '')) {
      if (value === undefined) delete next.formulaNumber;
      else next.formulaNumber = value;
      changed = true;
    }
  }

  if (patch.whereLabelOverride !== undefined) {
    let value: string | undefined;
    if (patch.whereLabelOverride === null) {
      value = undefined;
    } else if (typeof patch.whereLabelOverride === 'string') {
      const trimmed = patch.whereLabelOverride.trim();
      if (trimmed.length > MAX_WHERE_LABEL_LENGTH) {
        return reject(
          'invalid-where-label',
          `The "Where:" label is limited to ${MAX_WHERE_LABEL_LENGTH} characters.`,
        );
      }
      value = trimmed === '' ? undefined : trimmed;
    } else {
      return reject('invalid-where-label', 'The "Where:" label must be text.');
    }
    if ((value ?? '') !== (data.whereLabelOverride ?? '')) {
      if (value === undefined) delete next.whereLabelOverride;
      else next.whereLabelOverride = value;
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
// Variable definitions ("Where:" list)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Append a fresh, EMPTY variable-definition entry (symbol and definition
 * start empty for the user to fill in — nothing is fabricated) and return
 * its stable id so the editor can focus the new row.
 */
export function addVariableDefinition(
  source: DocStudioDocument,
  blockId: DocUUID,
  options: BlockOpOptions = {},
): FormulaContentActionResult {
  const index = indexOfBlock(source, blockId);
  if (index < 0) {
    return reject('missing-block', 'The formula to edit no longer exists in this document.');
  }
  const block = source.blocks[index];
  if (block.data.type !== 'formula') {
    return reject('wrong-block-type', 'This block is not a formula.');
  }
  const data = block.data;

  const entryId = options.genId !== undefined ? options.genId() : newUUID();
  const entry = { id: entryId, symbol: '', definition: '' };
  const updated = { ...block, data: { ...data, variableDefinitions: [...data.variableDefinitions, entry] } };
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
 * Update the fields of one variable definition, addressed by its STABLE id.
 *
 * Validation: `symbol` must be non-empty text (a `Where:` entry without a
 * symbol is meaningless) and may include LaTeX; `definition` is free text
 * including the empty string; `unit` is `null`/'' to clear, otherwise a
 * bounded string.
 */
export function updateVariableDefinition(
  source: DocStudioDocument,
  blockId: DocUUID,
  entryId: DocUUID,
  patch: VariableDefinitionPatch,
  options: BlockOpOptions = {},
): FormulaContentActionResult {
  const index = indexOfBlock(source, blockId);
  if (index < 0) {
    return reject('missing-block', 'The formula to edit no longer exists in this document.');
  }
  const block = source.blocks[index];
  if (block.data.type !== 'formula') {
    return reject('wrong-block-type', 'This block is not a formula.');
  }
  const data = block.data;
  const entryIndex = data.variableDefinitions.findIndex((entry) => entry.id === entryId);
  if (entryIndex < 0) {
    return reject('missing-entry', 'The variable definition to edit no longer exists.');
  }
  const entry = data.variableDefinitions[entryIndex];

  const next = { ...entry };
  let changed = false;

  if (patch.symbol !== undefined) {
    if (typeof patch.symbol !== 'string') {
      return reject('invalid-symbol', 'A variable symbol must be text.');
    }
    const trimmed = patch.symbol.trim();
    if (trimmed === '') {
      return reject(
        'invalid-symbol',
        'A variable symbol is required (such as "k" or "\\sigma").',
      );
    }
    if (trimmed.length > MAX_VARIABLE_SYMBOL_LENGTH) {
      return reject(
        'invalid-symbol',
        `A variable symbol is limited to ${MAX_VARIABLE_SYMBOL_LENGTH} characters.`,
      );
    }
    if (trimmed !== entry.symbol) {
      next.symbol = trimmed;
      changed = true;
    }
  }

  if (patch.definition !== undefined) {
    if (typeof patch.definition !== 'string') {
      return reject('invalid-definition', 'A variable definition must be text.');
    }
    if (patch.definition.length > MAX_VARIABLE_DEFINITION_LENGTH) {
      return reject(
        'invalid-definition',
        `A variable definition is limited to ${MAX_VARIABLE_DEFINITION_LENGTH} characters.`,
      );
    }
    if (patch.definition !== entry.definition) {
      next.definition = patch.definition;
      changed = true;
    }
  }

  if (patch.unit !== undefined) {
    let value: string | undefined;
    if (patch.unit === null) {
      value = undefined;
    } else if (typeof patch.unit === 'string') {
      const trimmed = patch.unit.trim();
      if (trimmed.length > MAX_VARIABLE_UNIT_LENGTH) {
        return reject(
          'invalid-unit',
          `A unit is limited to ${MAX_VARIABLE_UNIT_LENGTH} characters.`,
        );
      }
      value = trimmed === '' ? undefined : trimmed;
    } else {
      return reject('invalid-unit', 'A unit must be text.');
    }
    if ((value ?? '') !== (entry.unit ?? '')) {
      if (value === undefined) delete next.unit;
      else next.unit = value;
      changed = true;
    }
  }

  if (!changed) {
    return { ok: true, doc: source, changed: false, blockId, entryId };
  }
  const definitions = [...data.variableDefinitions];
  definitions[entryIndex] = next;
  const updated = { ...block, data: { ...data, variableDefinitions: definitions } };
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

/** Remove one variable definition, addressed by its STABLE id. */
export function removeVariableDefinition(
  source: DocStudioDocument,
  blockId: DocUUID,
  entryId: DocUUID,
  options: BlockOpOptions = {},
): FormulaContentActionResult {
  const index = indexOfBlock(source, blockId);
  if (index < 0) {
    return reject('missing-block', 'The formula to edit no longer exists in this document.');
  }
  const block = source.blocks[index];
  if (block.data.type !== 'formula') {
    return reject('wrong-block-type', 'This block is not a formula.');
  }
  const data = block.data;
  const entryIndex = data.variableDefinitions.findIndex((entry) => entry.id === entryId);
  if (entryIndex < 0) {
    return reject('missing-entry', 'The variable definition to remove no longer exists.');
  }
  const definitions = [...data.variableDefinitions];
  definitions.splice(entryIndex, 1);
  const updated = { ...block, data: { ...data, variableDefinitions: definitions } };
  const blocks = [...source.blocks];
  blocks[index] = updated;
  return { ok: true, changed: true, blockId, doc: stamped(source, blocks, options.now ?? nowISO()) };
}

// ─────────────────────────────────────────────────────────────────────────────
// Dispatcher
// ─────────────────────────────────────────────────────────────────────────────

/**
 * One dispatcher for the formula editor (same narrow-prop pattern as the
 * P05-M3 list, P05-M4 table and P06-M2 structural dispatchers): every
 * action keeps its own validation above, the App wires exactly one
 * callback.
 */
export function applyFormulaAction(
  source: DocStudioDocument,
  blockId: DocUUID,
  action: FormulaContentAction,
  options: BlockOpOptions = {},
): FormulaContentActionResult {
  switch (action.action) {
    case 'update-formula':
      return updateFormulaContent(source, blockId, action, options);
    case 'add-variable-definition':
      return addVariableDefinition(source, blockId, options);
    case 'update-variable-definition':
      return updateVariableDefinition(source, blockId, action.entryId, action.patch, options);
    case 'remove-variable-definition':
      return removeVariableDefinition(source, blockId, action.entryId, options);
    default:
      return reject('invalid-action', 'That formula block action is not supported.');
  }
}
