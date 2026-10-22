/**
 * DocStudio — Laboratory-specific block content editors (P06-M5)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Content editors for the six laboratory-specific block types (roadmap
 * Phase 06 §6.6, project_details §10.9):
 *
 * • ProcedureStepEditor  — section title + repeatable steps (level,
 *   optional authored step number, plain-text editing that replays onto
 *   the stored spans through `remapSpansAfterTextEdit`).
 * • EquipmentListEditor  — title + equipment/materials items (name,
 *   asset tag, manufacturer, model, calibration due date, mandatory).
 * • ObservationEditor    — title + parameter / observed-value / remarks
 *   rows (blank values allowed for hand recording).
 * • MeasurementEditor    — title + configurable columns (header + unit),
 *   per-cell values, row/column reorder + removal (column removal is
 *   confirmed when it deletes recorded values) and the uncertainty note.
 * • CalculationEditor    — title + calculation steps (label, LaTeX
 *   validated by the real math engine, substitution, result, note) +
 *   conclusion.
 * • AcceptanceCriteriaEditor — title + criteria rows (criterion,
 *   specification, measured value, author-entered verdict, remarks) +
 *   author-entered overall verdict.
 *
 * Conventions (same as the P06-M2 structural editors and the P05-M3 list
 * editor):
 * • Every control commits ONE validated action through the App's
 *   immutable `applyLabAction` service — no second copy of the data in
 *   component memory.  Text inputs commit on blur; selects, checkboxes
 *   and span-remapped step text commit on change.
 * • A service rejection surfaces the field-specific message and leaves
 *   the document untouched.
 * • Newly added entries receive keyboard focus (the service returns the
 *   fresh entry's stable id).
 * • Move buttons carry truthful boundary-disabled states.
 * • Removing a measurement column that holds recorded values asks for
 *   confirmation first (content-losing, same policy as the P05-M4 table).
 *
 * Product boundary: these editors author document content only.  Nothing
 * here registers samples, tracks instruments, acquires data, computes
 * results, or evaluates conformity — verdict fields store exactly what
 * the author picks.
 *
 * @module components/editor-panel/LabContentEditor
 */

import React from 'react';
import type {
  AcceptanceCriteriaBlockData,
  CalculationBlockData,
  CriteriaResult,
  EquipmentListBlockData,
  MeasurementBlockData,
  ObservationBlockData,
  ProcedureStepBlockData,
  ProcedureStepLevel,
} from '../../types/blocks';
import type { DocUUID } from '../../types/document';
import {
  CRITERIA_RESULTS,
  CRITERIA_RESULT_LABELS,
  MAX_LAB_STEP_NUMBER_LENGTH,
  MAX_LAB_UNIT_LENGTH,
  MAX_MEASUREMENT_COLUMNS,
  PROCEDURE_LEVEL_LABELS,
  PROCEDURE_STEP_LEVELS,
  type LabContentAction,
  type LabContentActionResult,
} from '../../services/lab-block-content';
import { remapSpansAfterTextEdit, spansToPlainText } from '../../services/rich-text';

// ─────────────────────────────────────────────────────────────────────────────
// Shared plumbing
// ─────────────────────────────────────────────────────────────────────────────

/** One narrow dispatch (same shape the App wires for every block family). */
export type LabDispatch = (
  blockId: DocUUID,
  action: LabContentAction,
) => LabContentActionResult;

/** App-owned confirmation modal (content-losing removals). */
type ConfirmRequest = (
  title: string,
  message: string,
  confirmLabel: string,
  onConfirm: () => void,
) => void;

interface LabEditorProps {
  /** Stable ID of the laboratory block being edited. */
  blockId: DocUUID;
  /** Authoritative block data rendered straight from the document model. */
  onAction: LabDispatch;
  /** Surface a service-level rejection inline. */
  onError: (message: string) => void;
}

function dispatchCommit(
  onAction: LabDispatch,
  onError: (message: string) => void,
  blockId: DocUUID,
  action: LabContentAction,
): LabContentActionResult {
  const result = onAction(blockId, action);
  if (result.ok === false) onError(result.message);
  return result;
}

/**
 * Keyboard-focus helper for freshly added entries: the service returns
 * the new entry's stable id, the matching primary field gets a ref, and
 * this effect moves focus once the entry exists in the model.
 */
function useAddedEntryFocus<T extends HTMLElement>(
  entries: readonly { readonly id: DocUUID }[],
): {
  refs: React.MutableRefObject<Record<string, T | null>>;
  focusEntry: (entryId: DocUUID) => void;
} {
  const refs = React.useRef<Record<string, T | null>>({});
  const [focusId, setFocusId] = React.useState<DocUUID | null>(null);
  React.useEffect(() => {
    if (focusId === null) return;
    refs.current[focusId]?.focus();
    setFocusId(null);
  }, [focusId, entries]);
  return { refs, focusEntry: setFocusId };
}

/** Move ↑/↓ buttons with truthful boundary-disabled states. */
function EntryMoveButtons({
  entryId,
  index,
  count,
  onMove,
  label,
  horizontal = false,
}: {
  entryId: DocUUID;
  index: number;
  count: number;
  onMove: (entryId: DocUUID, direction: 'up' | 'down') => void;
  label: string;
  /** Measurement columns move left (up) / right (down). */
  horizontal?: boolean;
}): React.ReactElement {
  const upTitle = horizontal ? 'Move this column left' : 'Move this entry up';
  const downTitle = horizontal ? 'Move this column right' : 'Move this entry down';
  return (
    <span className="list-item-buttons">
      <button
        type="button"
        className="rt-tool-btn"
        title={upTitle}
        aria-label={`${upTitle} — ${label}`}
        disabled={index <= 0}
        onClick={() => onMove(entryId, 'up')}
      >
        <span aria-hidden="true">↑</span>
      </button>
      <button
        type="button"
        className="rt-tool-btn"
        title={downTitle}
        aria-label={`${downTitle} — ${label}`}
        disabled={index >= count - 1}
        onClick={() => onMove(entryId, 'down')}
      >
        <span aria-hidden="true">↓</span>
      </button>
    </span>
  );
}

/** Characters a single-line field must never store (see paragraph editor). */
// eslint-disable-next-line no-control-regex
const CONTROL_CHARS = /[\u0000-\u001f\u007f-\u009f]/g;

// ─────────────────────────────────────────────────────────────────────────────
// Procedure steps (§10.9 "Procedure-step block")
// ─────────────────────────────────────────────────────────────────────────────

export function ProcedureStepEditor({
  blockId,
  data,
  onAction,
  onError,
}: LabEditorProps & { data: ProcedureStepBlockData }) {
  const commit = (action: LabContentAction): LabContentActionResult =>
    dispatchCommit(onAction, onError, blockId, action);
  const { refs, focusEntry } = useAddedEntryFocus<HTMLTextAreaElement>(data.steps);

  const addStep = (): void => {
    const result = commit({ action: 'add-procedure-step' });
    if (result.ok === true && result.entryId !== undefined) focusEntry(result.entryId);
  };

  /** Replay a plain-text edit onto the step's span model (P05-M2 algebra). */
  const handleStepText = (stepId: DocUUID, nextPlain: string): void => {
    const step = data.steps.find((entry) => entry.id === stepId);
    if (step === undefined) return;
    commit({
      action: 'update-procedure-step',
      stepId,
      patch: { spans: remapSpansAfterTextEdit(step.spans, nextPlain) },
    });
    // The document round-trips synchronously; restore the caret the
    // browser had before React re-rendered the controlled textarea.
    window.requestAnimationFrame(() => {
      const el = refs.current[stepId];
      if (el !== null && el !== undefined) {
        const pos = el.selectionStart;
        el.setSelectionRange(pos, pos);
      }
    });
  };

  return (
    <div className="structural-editor">
      <div className="content-field content-field--stack">
        <label className="content-field-label" htmlFor={`proc-title-${blockId}`}>
          Section title (optional)
        </label>
        <input
          id={`proc-title-${blockId}`}
          className="content-text-input"
          type="text"
          defaultValue={data.sectionTitle ?? ''}
          onBlur={(event) =>
            commit({ action: 'update-procedure-title', title: event.target.value })
          }
          placeholder="e.g. Procedure"
        />
      </div>
      <p className="content-derived-hint">
        Main steps auto-number “1.” “2.” … and sub steps “a.” “b.” … in the PDF; a stored step
        number (e.g. 4.1) replaces the auto-number. Notes, warnings and cautions print an inline
        label and never take a number.
      </p>
      {data.steps.length === 0 ? (
        <p className="content-derived-hint">No steps yet.  Add the first step below.</p>
      ) : (
        <ul className="structural-entry-list" role="list">
          {data.steps.map((step, index) => (
            <li key={step.id} className="structural-entry-card">
              <div className="content-row">
                <div className="content-field content-field--stack">
                  <label className="content-field-label" htmlFor={`proc-level-${step.id}`}>
                    Level
                  </label>
                  <select
                    id={`proc-level-${step.id}`}
                    className="content-select"
                    defaultValue={step.level}
                    onChange={(event) =>
                      commit({
                        action: 'update-procedure-step',
                        stepId: step.id,
                        patch: { level: event.target.value as ProcedureStepLevel },
                      })
                    }
                  >
                    {PROCEDURE_STEP_LEVELS.map((level) => (
                      <option key={level} value={level}>
                        {PROCEDURE_LEVEL_LABELS[level]}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="content-field content-field--stack">
                  <label className="content-field-label" htmlFor={`proc-num-${step.id}`}>
                    Step number (optional)
                  </label>
                  <input
                    id={`proc-num-${step.id}`}
                    className="content-text-input"
                    type="text"
                    maxLength={MAX_LAB_STEP_NUMBER_LENGTH}
                    defaultValue={step.stepNumber ?? ''}
                    onBlur={(event) =>
                      commit({
                        action: 'update-procedure-step',
                        stepId: step.id,
                        patch: { stepNumber: event.target.value },
                      })
                    }
                    placeholder="auto"
                  />
                </div>
              </div>
              <div className="content-row">
                <div className="content-field content-field--stack">
                  <label className="content-field-label" htmlFor={`proc-text-${step.id}`}>
                    Step text
                  </label>
                  <textarea
                    id={`proc-text-${step.id}`}
                    className="rt-textarea"
                    rows={2}
                    ref={(el) => {
                      refs.current[step.id] = el;
                    }}
                    value={spansToPlainText(step.spans)}
                    onChange={(event) =>
                      handleStepText(step.id, event.target.value.replace(CONTROL_CHARS, ''))
                    }
                  />
                </div>
              </div>
              <div className="content-row">
                <EntryMoveButtons
                  entryId={step.id}
                  index={index}
                  count={data.steps.length}
                  label={`step ${index + 1}`}
                  onMove={(stepId, direction) =>
                    commit({ action: 'move-procedure-step', stepId, direction })
                  }
                />
                <button
                  type="button"
                  className="block-action-btn block-action-btn--danger"
                  onClick={() => commit({ action: 'remove-procedure-step', stepId: step.id })}
                >
                  Remove step
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
      <button type="button" className="block-action-btn block-action-btn--wide" onClick={addStep}>
        Add step
      </button>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Equipment / materials (§10.9 "Equipment/materials list or table")
// ─────────────────────────────────────────────────────────────────────────────

export function EquipmentListEditor({
  blockId,
  data,
  onAction,
  onError,
}: LabEditorProps & { data: EquipmentListBlockData }) {
  const commit = (action: LabContentAction): LabContentActionResult =>
    dispatchCommit(onAction, onError, blockId, action);
  const { refs, focusEntry } = useAddedEntryFocus<HTMLInputElement>(data.items);

  const addItem = (): void => {
    const result = commit({ action: 'add-equipment-item' });
    if (result.ok === true && result.entryId !== undefined) focusEntry(result.entryId);
  };
  const patch = (itemId: DocUUID, field: string, value: unknown): void => {
    commit({ action: 'update-equipment-item', itemId, patch: { [field]: value } });
  };

  return (
    <div className="structural-editor">
      <div className="content-field content-field--stack">
        <label className="content-field-label" htmlFor={`eq-title-${blockId}`}>
          List title (optional)
        </label>
        <input
          id={`eq-title-${blockId}`}
          className="content-text-input"
          type="text"
          defaultValue={data.title ?? ''}
          onBlur={(event) =>
            commit({ action: 'update-equipment-title', title: event.target.value })
          }
          placeholder="e.g. Equipment and consumables"
        />
      </div>
      <p className="content-derived-hint">
        Equipment, instruments, apparatus, materials and reagents used by the procedure.  The
        calibration due date accepts empty or YYYY-MM-DD.
      </p>
      {data.items.length === 0 ? (
        <p className="content-derived-hint">No items yet.  Add the first item below.</p>
      ) : (
        <ul className="structural-entry-list" role="list">
          {data.items.map((item, index) => (
            <li key={item.id} className="structural-entry-card">
              <div className="content-row">
                <div className="content-field content-field--stack">
                  <label className="content-field-label" htmlFor={`eq-name-${item.id}`}>
                    Name (required)
                  </label>
                  <input
                    id={`eq-name-${item.id}`}
                    className="content-text-input"
                    type="text"
                    ref={(el) => {
                      refs.current[item.id] = el;
                    }}
                    defaultValue={item.name}
                    onBlur={(event) => patch(item.id, 'name', event.target.value)}
                    placeholder="e.g. Analytical balance"
                  />
                </div>
              </div>
              <div className="content-row">
                <div className="content-field content-field--stack">
                  <label className="content-field-label" htmlFor={`eq-tag-${item.id}`}>
                    Asset tag (optional)
                  </label>
                  <input
                    id={`eq-tag-${item.id}`}
                    className="content-text-input"
                    type="text"
                    defaultValue={item.assetTag ?? ''}
                    onBlur={(event) => patch(item.id, 'assetTag', event.target.value)}
                    placeholder="e.g. LAB-0142"
                  />
                </div>
                <div className="content-field content-field--stack">
                  <label className="content-field-label" htmlFor={`eq-mfr-${item.id}`}>
                    Manufacturer (optional)
                  </label>
                  <input
                    id={`eq-mfr-${item.id}`}
                    className="content-text-input"
                    type="text"
                    defaultValue={item.manufacturer ?? ''}
                    onBlur={(event) => patch(item.id, 'manufacturer', event.target.value)}
                  />
                </div>
              </div>
              <div className="content-row">
                <div className="content-field content-field--stack">
                  <label className="content-field-label" htmlFor={`eq-model-${item.id}`}>
                    Model number (optional)
                  </label>
                  <input
                    id={`eq-model-${item.id}`}
                    className="content-text-input"
                    type="text"
                    defaultValue={item.modelNumber ?? ''}
                    onBlur={(event) => patch(item.id, 'modelNumber', event.target.value)}
                  />
                </div>
                <div className="content-field content-field--stack">
                  <label className="content-field-label" htmlFor={`eq-cal-${item.id}`}>
                    Calibration due (optional)
                  </label>
                  <input
                    id={`eq-cal-${item.id}`}
                    className="content-text-input"
                    type="text"
                    defaultValue={item.calibrationDue ?? ''}
                    onBlur={(event) => patch(item.id, 'calibrationDue', event.target.value)}
                    placeholder="YYYY-MM-DD"
                    aria-describedby={`eq-cal-hint-${item.id}`}
                  />
                  <small id={`eq-cal-hint-${item.id}`} className="content-derived-hint">
                    YYYY-MM-DD, or blank when not applicable.
                  </small>
                </div>
              </div>
              <div className="content-row">
                <label className="content-field" htmlFor={`eq-mand-${item.id}`}>
                  <span className="content-field-label">
                    <input
                      id={`eq-mand-${item.id}`}
                      type="checkbox"
                      checked={item.mandatory}
                      onChange={(event) => patch(item.id, 'mandatory', event.target.checked)}
                    />{' '}
                    Required for the procedure (prints “Mandatory”)
                  </span>
                </label>
              </div>
              <div className="content-row">
                <EntryMoveButtons
                  entryId={item.id}
                  index={index}
                  count={data.items.length}
                  label={`item ${index + 1}`}
                  onMove={(itemId, direction) =>
                    commit({ action: 'move-equipment-item', itemId, direction })
                  }
                />
                <button
                  type="button"
                  className="block-action-btn block-action-btn--danger"
                  onClick={() => commit({ action: 'remove-equipment-item', itemId: item.id })}
                >
                  Remove item
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
      <button type="button" className="block-action-btn block-action-btn--wide" onClick={addItem}>
        Add item
      </button>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Observations (§10.9 "Sample/technical observation block")
// ─────────────────────────────────────────────────────────────────────────────

export function ObservationEditor({
  blockId,
  data,
  onAction,
  onError,
}: LabEditorProps & { data: ObservationBlockData }) {
  const commit = (action: LabContentAction): LabContentActionResult =>
    dispatchCommit(onAction, onError, blockId, action);
  const { refs, focusEntry } = useAddedEntryFocus<HTMLInputElement>(data.rows);

  const addRow = (): void => {
    const result = commit({ action: 'add-observation-row' });
    if (result.ok === true && result.entryId !== undefined) focusEntry(result.entryId);
  };
  const patch = (rowId: DocUUID, field: string, value: string): void => {
    commit({ action: 'update-observation-row', rowId, patch: { [field]: value } });
  };

  return (
    <div className="structural-editor">
      <div className="content-field content-field--stack">
        <label className="content-field-label" htmlFor={`obs-title-${blockId}`}>
          Title (optional)
        </label>
        <input
          id={`obs-title-${blockId}`}
          className="content-text-input"
          type="text"
          defaultValue={data.title ?? ''}
          onBlur={(event) =>
            commit({ action: 'update-observation-title', title: event.target.value })
          }
          placeholder="e.g. Technical observations"
        />
      </div>
      <p className="content-derived-hint">
        Technical and sample observations.  A value may stay blank so observations can be recorded
        by hand on a printed page.
      </p>
      {data.rows.length === 0 ? (
        <p className="content-derived-hint">No observation rows yet.  Add the first row below.</p>
      ) : (
        <ul className="structural-entry-list" role="list">
          {data.rows.map((row, index) => (
            <li key={row.id} className="structural-entry-card">
              <div className="content-row">
                <div className="content-field content-field--stack">
                  <label className="content-field-label" htmlFor={`obs-param-${row.id}`}>
                    Parameter (required)
                  </label>
                  <input
                    id={`obs-param-${row.id}`}
                    className="content-text-input"
                    type="text"
                    ref={(el) => {
                      refs.current[row.id] = el;
                    }}
                    defaultValue={row.parameter}
                    onBlur={(event) => patch(row.id, 'parameter', event.target.value)}
                    placeholder="e.g. Appearance of solution"
                  />
                </div>
              </div>
              <div className="content-row">
                <div className="content-field content-field--stack">
                  <label className="content-field-label" htmlFor={`obs-value-${row.id}`}>
                    Observed value (optional)
                  </label>
                  <textarea
                    id={`obs-value-${row.id}`}
                    className="rt-textarea"
                    rows={2}
                    defaultValue={row.observedValue}
                    onBlur={(event) => patch(row.id, 'observedValue', event.target.value)}
                  />
                </div>
              </div>
              <div className="content-row">
                <div className="content-field content-field--stack">
                  <label className="content-field-label" htmlFor={`obs-remarks-${row.id}`}>
                    Remarks (optional)
                  </label>
                  <input
                    id={`obs-remarks-${row.id}`}
                    className="content-text-input"
                    type="text"
                    defaultValue={row.remarks ?? ''}
                    onBlur={(event) => patch(row.id, 'remarks', event.target.value)}
                  />
                </div>
              </div>
              <div className="content-row">
                <EntryMoveButtons
                  entryId={row.id}
                  index={index}
                  count={data.rows.length}
                  label={`row ${index + 1}`}
                  onMove={(rowId, direction) =>
                    commit({ action: 'move-observation-row', rowId, direction })
                  }
                />
                <button
                  type="button"
                  className="block-action-btn block-action-btn--danger"
                  onClick={() => commit({ action: 'remove-observation-row', rowId: row.id })}
                >
                  Remove row
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
      <button type="button" className="block-action-btn block-action-btn--wide" onClick={addRow}>
        Add observation row
      </button>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Measurement / worksheet table (§10.9 "Measurement/worksheet table")
// ─────────────────────────────────────────────────────────────────────────────

export function MeasurementEditor({
  blockId,
  data,
  onAction,
  onError,
  onRequestConfirm,
}: LabEditorProps & {
  data: MeasurementBlockData;
  onRequestConfirm: ConfirmRequest;
}) {
  const commit = (action: LabContentAction): LabContentActionResult =>
    dispatchCommit(onAction, onError, blockId, action);
  const { refs, focusEntry } = useAddedEntryFocus<HTMLInputElement>(data.columns);
  const rowFocus = useAddedEntryFocus<HTMLInputElement>(data.rows);

  const addColumn = (): void => {
    const result = commit({ action: 'add-measurement-column' });
    if (result.ok === true && result.entryId !== undefined) focusEntry(result.entryId);
  };
  const addRow = (): void => {
    const result = commit({ action: 'add-measurement-row' });
    if (result.ok === true && result.entryId !== undefined) rowFocus.focusEntry(result.entryId);
  };

  /** Removing a column that holds recorded values deletes content — confirm. */
  const removeColumn = (columnId: DocUUID, header: string): void => {
    const action: LabContentAction = { action: 'remove-measurement-column', columnId };
    const hasContent = data.rows.some((row) => (row.values[columnId] ?? '') !== '');
    if (!hasContent) {
      commit(action);
      return;
    }
    onRequestConfirm(
      `Remove the “${header}” column?`,
      'The column and its recorded values will be removed from every row.',
      'Remove column',
      () => commit(action),
    );
  };

  return (
    <div className="structural-editor">
      <div className="content-field content-field--stack">
        <label className="content-field-label" htmlFor={`ms-title-${blockId}`}>
          Worksheet title (optional)
        </label>
        <input
          id={`ms-title-${blockId}`}
          className="content-text-input"
          type="text"
          defaultValue={data.title ?? ''}
          onBlur={(event) =>
            commit({ action: 'update-measurement-title', title: event.target.value })
          }
          placeholder="e.g. Raw data sheet"
        />
      </div>
      <p className="content-derived-hint">
        Worksheet / rough-datasheet grid.  Blank cells stay blank in the PDF and provide the
        handwritten recording space; printed rows keep a minimum height for writing.
      </p>

      {/* ── Columns ──────────────────────────────────────────────────── */}
      <span className="content-panel-title">
        {`Columns (${data.columns.length} of ${MAX_MEASUREMENT_COLUMNS})`}
      </span>
      {data.columns.length === 0 ? (
        <p className="content-derived-hint">No columns yet.  Add the first column below.</p>
      ) : (
        <ul className="structural-entry-list" role="list">
          {data.columns.map((column, index) => (
            <li key={column.id} className="structural-entry-card">
              <div className="content-row">
                <div className="content-field content-field--stack">
                  <label className="content-field-label" htmlFor={`ms-col-${column.id}`}>
                    Column header (required)
                  </label>
                  <input
                    id={`ms-col-${column.id}`}
                    className="content-text-input"
                    type="text"
                    ref={(el) => {
                      refs.current[column.id] = el;
                    }}
                    defaultValue={column.header}
                    onBlur={(event) =>
                      commit({
                        action: 'update-measurement-column',
                        columnId: column.id,
                        patch: { header: event.target.value },
                      })
                    }
                  />
                </div>
                <div className="content-field content-field--stack">
                  <label className="content-field-label" htmlFor={`ms-unit-${column.id}`}>
                    Unit (optional)
                  </label>
                  <input
                    id={`ms-unit-${column.id}`}
                    className="content-text-input"
                    type="text"
                    maxLength={MAX_LAB_UNIT_LENGTH}
                    defaultValue={column.unit ?? ''}
                    onBlur={(event) =>
                      commit({
                        action: 'update-measurement-column',
                        columnId: column.id,
                        patch: { unit: event.target.value },
                      })
                    }
                    placeholder="e.g. Hz"
                  />
                </div>
              </div>
              <div className="content-row">
                <EntryMoveButtons
                  entryId={column.id}
                  index={index}
                  count={data.columns.length}
                  label={`column ${index + 1}`}
                  horizontal
                  onMove={(columnId, direction) =>
                    commit({ action: 'move-measurement-column', columnId, direction })
                  }
                />
                <button
                  type="button"
                  className="block-action-btn block-action-btn--danger"
                  onClick={() => removeColumn(column.id, column.header)}
                >
                  Remove column
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
      <button
        type="button"
        className="block-action-btn block-action-btn--wide"
        onClick={addColumn}
        disabled={data.columns.length >= MAX_MEASUREMENT_COLUMNS}
      >
        Add column
      </button>

      {/* ── Rows ─────────────────────────────────────────────────────── */}
      <span className="content-panel-title">{`Rows (${data.rows.length})`}</span>
      {data.columns.length === 0 ? (
        <p className="content-derived-hint">Add a column before recording values.</p>
      ) : data.rows.length === 0 ? (
        <p className="content-derived-hint">No rows yet.  Add the first row below.</p>
      ) : (
        <ul className="structural-entry-list" role="list">
          {data.rows.map((row, index) => (
            <li key={row.id} className="structural-entry-card">
              <div className="content-row">
                {data.columns.map((column, columnIndex) => (
                  <div className="content-field content-field--stack" key={column.id}>
                    <label className="content-field-label" htmlFor={`ms-cell-${row.id}-${column.id}`}>
                      {column.header}
                      {column.unit !== undefined && column.unit !== '' ? ` (${column.unit})` : ''}
                    </label>
                    <input
                      id={`ms-cell-${row.id}-${column.id}`}
                      className="content-text-input"
                      type="text"
                      ref={
                        columnIndex === 0
                          ? (el) => {
                              rowFocus.refs.current[row.id] = el;
                            }
                          : undefined
                      }
                      defaultValue={row.values[column.id] ?? ''}
                      onBlur={(event) =>
                        commit({
                          action: 'set-measurement-cell',
                          rowId: row.id,
                          columnId: column.id,
                          value: event.target.value.replace(CONTROL_CHARS, ''),
                        })
                      }
                    />
                  </div>
                ))}
              </div>
              <div className="content-row">
                <EntryMoveButtons
                  entryId={row.id}
                  index={index}
                  count={data.rows.length}
                  label={`row ${index + 1}`}
                  onMove={(rowId, direction) =>
                    commit({ action: 'move-measurement-row', rowId, direction })
                  }
                />
                <button
                  type="button"
                  className="block-action-btn block-action-btn--danger"
                  onClick={() => commit({ action: 'remove-measurement-row', rowId: row.id })}
                >
                  Remove row
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
      <button
        type="button"
        className="block-action-btn block-action-btn--wide"
        onClick={addRow}
        disabled={data.columns.length === 0}
      >
        Add row
      </button>

      {/* ── Uncertainty note ─────────────────────────────────────────── */}
      <div className="content-field content-field--stack">
        <label className="content-field-label" htmlFor={`ms-unc-${blockId}`}>
          Uncertainty note (optional)
        </label>
        <textarea
          id={`ms-unc-${blockId}`}
          className="rt-textarea"
          rows={2}
          defaultValue={data.uncertaintyNote ?? ''}
          onBlur={(event) =>
            commit({
              action: 'set-measurement-uncertainty-note',
              note: event.target.value,
            })
          }
          placeholder="e.g. Expanded uncertainty k = 2."
        />
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Calculation (§10.9 "Calculation block")
// ─────────────────────────────────────────────────────────────────────────────

export function CalculationEditor({
  blockId,
  data,
  onAction,
  onError,
}: LabEditorProps & { data: CalculationBlockData }) {
  const commit = (action: LabContentAction): LabContentActionResult =>
    dispatchCommit(onAction, onError, blockId, action);
  const { refs, focusEntry } = useAddedEntryFocus<HTMLTextAreaElement>(data.steps);

  const addStep = (): void => {
    const result = commit({ action: 'add-calculation-step' });
    if (result.ok === true && result.entryId !== undefined) focusEntry(result.entryId);
  };
  const patch = (stepId: DocUUID, field: string, value: string): void => {
    commit({ action: 'update-calculation-step', stepId, patch: { [field]: value } });
  };

  return (
    <div className="structural-editor">
      <div className="content-field content-field--stack">
        <label className="content-field-label" htmlFor={`calc-title-${blockId}`}>
          Title (optional)
        </label>
        <input
          id={`calc-title-${blockId}`}
          className="content-text-input"
          type="text"
          defaultValue={data.title ?? ''}
          onBlur={(event) =>
            commit({ action: 'update-calculation-title', title: event.target.value })
          }
          placeholder="e.g. Calculation of result"
        />
      </div>
      <p className="content-derived-hint">
        Calculation formulas are written in LaTeX and validated by the same math engine as the
        Formula block.  Every value here is what you type — DocStudio performs no calculation.
      </p>
      {data.steps.length === 0 ? (
        <p className="content-derived-hint">No calculation steps yet.  Add the first below.</p>
      ) : (
        <ul className="structural-entry-list" role="list">
          {data.steps.map((step, index) => (
            <li key={step.id} className="structural-entry-card">
              <div className="content-row">
                <div className="content-field content-field--stack">
                  <label className="content-field-label" htmlFor={`calc-label-${step.id}`}>
                    Label (optional)
                  </label>
                  <input
                    id={`calc-label-${step.id}`}
                    className="content-text-input"
                    type="text"
                    defaultValue={step.label ?? ''}
                    onBlur={(event) => patch(step.id, 'label', event.target.value)}
                    placeholder="e.g. Step 1 — Relative density"
                  />
                </div>
              </div>
              <div className="content-row">
                <div className="content-field content-field--stack">
                  <label className="content-field-label" htmlFor={`calc-latex-${step.id}`}>
                    Formula (LaTeX, required)
                  </label>
                  <textarea
                    id={`calc-latex-${step.id}`}
                    className="rt-textarea"
                    rows={2}
                    ref={(el) => {
                      refs.current[step.id] = el;
                    }}
                    defaultValue={step.latex}
                    onBlur={(event) => patch(step.id, 'latex', event.target.value)}
                    placeholder="e.g. \rho = \frac{m}{V}"
                  />
                </div>
              </div>
              <div className="content-row">
                <div className="content-field content-field--stack">
                  <label className="content-field-label" htmlFor={`calc-subst-${step.id}`}>
                    Substitution (optional)
                  </label>
                  <input
                    id={`calc-subst-${step.id}`}
                    className="content-text-input"
                    type="text"
                    defaultValue={step.substitution ?? ''}
                    onBlur={(event) => patch(step.id, 'substitution', event.target.value)}
                    placeholder="e.g. = 95.2 / 100.0"
                  />
                </div>
                <div className="content-field content-field--stack">
                  <label className="content-field-label" htmlFor={`calc-result-${step.id}`}>
                    Result (optional)
                  </label>
                  <input
                    id={`calc-result-${step.id}`}
                    className="content-text-input"
                    type="text"
                    defaultValue={step.result ?? ''}
                    onBlur={(event) => patch(step.id, 'result', event.target.value)}
                    placeholder="e.g. = 0.952"
                  />
                </div>
              </div>
              <div className="content-row">
                <div className="content-field content-field--stack">
                  <label className="content-field-label" htmlFor={`calc-note-${step.id}`}>
                    Note (optional)
                  </label>
                  <input
                    id={`calc-note-${step.id}`}
                    className="content-text-input"
                    type="text"
                    defaultValue={step.note ?? ''}
                    onBlur={(event) => patch(step.id, 'note', event.target.value)}
                  />
                </div>
              </div>
              <div className="content-row">
                <EntryMoveButtons
                  entryId={step.id}
                  index={index}
                  count={data.steps.length}
                  label={`step ${index + 1}`}
                  onMove={(stepId, direction) =>
                    commit({ action: 'move-calculation-step', stepId, direction })
                  }
                />
                <button
                  type="button"
                  className="block-action-btn block-action-btn--danger"
                  onClick={() => commit({ action: 'remove-calculation-step', stepId: step.id })}
                >
                  Remove step
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
      <button type="button" className="block-action-btn block-action-btn--wide" onClick={addStep}>
        Add calculation step
      </button>
      <div className="content-field content-field--stack">
        <label className="content-field-label" htmlFor={`calc-conclusion-${blockId}`}>
          Conclusion (optional)
        </label>
        <textarea
          id={`calc-conclusion-${blockId}`}
          className="rt-textarea"
          rows={2}
          defaultValue={data.conclusionText ?? ''}
          onBlur={(event) =>
            commit({ action: 'set-calculation-conclusion', text: event.target.value })
          }
          placeholder="e.g. Report the result to three significant figures."
        />
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Acceptance criteria (§10.9 "Acceptance-criteria block")
// ─────────────────────────────────────────────────────────────────────────────

export function AcceptanceCriteriaEditor({
  blockId,
  data,
  onAction,
  onError,
}: LabEditorProps & { data: AcceptanceCriteriaBlockData }) {
  const commit = (action: LabContentAction): LabContentActionResult =>
    dispatchCommit(onAction, onError, blockId, action);
  const { refs, focusEntry } = useAddedEntryFocus<HTMLInputElement>(data.criteria);

  const addCriterion = (): void => {
    const result = commit({ action: 'add-acceptance-criterion' });
    if (result.ok === true && result.entryId !== undefined) focusEntry(result.entryId);
  };
  const patch = (criterionId: DocUUID, field: string, value: unknown): void => {
    commit({ action: 'update-acceptance-criterion', criterionId, patch: { [field]: value } });
  };

  return (
    <div className="structural-editor">
      <div className="content-field content-field--stack">
        <label className="content-field-label" htmlFor={`acc-title-${blockId}`}>
          Title (optional)
        </label>
        <input
          id={`acc-title-${blockId}`}
          className="content-text-input"
          type="text"
          defaultValue={data.title ?? ''}
          onBlur={(event) =>
            commit({ action: 'update-acceptance-title', title: event.target.value })
          }
          placeholder="e.g. Acceptance criteria"
        />
      </div>
      <p className="content-derived-hint">
        Verdicts are exactly what you select — DocStudio never evaluates conformity against any
        limit or regulation.
      </p>
      {data.criteria.length === 0 ? (
        <p className="content-derived-hint">No criteria yet.  Add the first criterion below.</p>
      ) : (
        <ul className="structural-entry-list" role="list">
          {data.criteria.map((row, index) => (
            <li key={row.id} className="structural-entry-card">
              <div className="content-row">
                <div className="content-field content-field--stack">
                  <label className="content-field-label" htmlFor={`acc-crit-${row.id}`}>
                    Criterion (required)
                  </label>
                  <input
                    id={`acc-crit-${row.id}`}
                    className="content-text-input"
                    type="text"
                    ref={(el) => {
                      refs.current[row.id] = el;
                    }}
                    defaultValue={row.criterion}
                    onBlur={(event) => patch(row.id, 'criterion', event.target.value)}
                    placeholder="e.g. Mass loss on drying"
                  />
                </div>
              </div>
              <div className="content-row">
                <div className="content-field content-field--stack">
                  <label className="content-field-label" htmlFor={`acc-spec-${row.id}`}>
                    Specification or limit (required)
                  </label>
                  <input
                    id={`acc-spec-${row.id}`}
                    className="content-text-input"
                    type="text"
                    defaultValue={row.specification}
                    onBlur={(event) => patch(row.id, 'specification', event.target.value)}
                    placeholder="e.g. ≤ 0.5 %"
                  />
                </div>
                <div className="content-field content-field--stack">
                  <label className="content-field-label" htmlFor={`acc-meas-${row.id}`}>
                    Measured value (optional)
                  </label>
                  <input
                    id={`acc-meas-${row.id}`}
                    className="content-text-input"
                    type="text"
                    defaultValue={row.measuredValue ?? ''}
                    onBlur={(event) => patch(row.id, 'measuredValue', event.target.value)}
                  />
                </div>
              </div>
              <div className="content-row">
                <div className="content-field content-field--stack">
                  <label className="content-field-label" htmlFor={`acc-result-${row.id}`}>
                    Result (author-entered)
                  </label>
                  <select
                    id={`acc-result-${row.id}`}
                    className="content-select"
                    defaultValue={row.result}
                    onChange={(event) =>
                      patch(row.id, 'result', event.target.value as CriteriaResult)
                    }
                  >
                    {CRITERIA_RESULTS.map((result) => (
                      <option key={result} value={result}>
                        {CRITERIA_RESULT_LABELS[result]}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="content-field content-field--stack">
                  <label className="content-field-label" htmlFor={`acc-remarks-${row.id}`}>
                    Remarks (optional)
                  </label>
                  <input
                    id={`acc-remarks-${row.id}`}
                    className="content-text-input"
                    type="text"
                    defaultValue={row.remarks ?? ''}
                    onBlur={(event) => patch(row.id, 'remarks', event.target.value)}
                  />
                </div>
              </div>
              <div className="content-row">
                <EntryMoveButtons
                  entryId={row.id}
                  index={index}
                  count={data.criteria.length}
                  label={`criterion ${index + 1}`}
                  onMove={(criterionId, direction) =>
                    commit({ action: 'move-acceptance-criterion', criterionId, direction })
                  }
                />
                <button
                  type="button"
                  className="block-action-btn block-action-btn--danger"
                  onClick={() =>
                    commit({ action: 'remove-acceptance-criterion', criterionId: row.id })
                  }
                >
                  Remove criterion
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
      <button type="button" className="block-action-btn block-action-btn--wide" onClick={addCriterion}>
        Add criterion
      </button>
      <div className="content-row">
        <div className="content-field content-field--stack">
          <label className="content-field-label" htmlFor={`acc-overall-${blockId}`}>
            Overall result (author-entered, optional)
          </label>
          <select
            id={`acc-overall-${blockId}`}
            className="content-select"
            defaultValue={data.overallResult ?? ''}
            onChange={(event) =>
              commit({
                action: 'set-acceptance-overall',
                result: event.target.value === '' ? null : (event.target.value as CriteriaResult),
              })
            }
          >
            <option value="">No overall verdict</option>
            {CRITERIA_RESULTS.map((result) => (
              <option key={result} value={result}>
                {CRITERIA_RESULT_LABELS[result]}
              </option>
            ))}
          </select>
        </div>
      </div>
    </div>
  );
}
