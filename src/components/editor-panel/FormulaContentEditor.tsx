import React from 'react';
import type { FormulaBlockData } from '../../types/blocks';
import type { DocUUID } from '../../types/document';
import {
  FORMULA_ALIGNMENTS,
  MAX_FORMULA_LATEX_LENGTH,
  MAX_FORMULA_NUMBER_LENGTH,
  MAX_VARIABLE_DEFINITION_LENGTH,
  MAX_VARIABLE_SYMBOL_LENGTH,
  MAX_VARIABLE_UNIT_LENGTH,
  MAX_WHERE_LABEL_LENGTH,
  type FormulaContentAction,
  type FormulaContentActionResult,
} from '../../services/formula-content';
import { validateLatex } from '../../services/math-engine';

// ─────────────────────────────────────────────────────────────────────────────
// Formula editor (P06-M3, §10.6)
// ═══════════════════════════════════════════════════════════════════════════
//
// Edits the FORMULA block's schema fields through ONE narrow App-level
// dispatcher (`onFormulaAction` → `applyFormulaAction`).  Conventions are
// the structural-editor ones (the P06-M2-R1 corrected vertical stack):
// text fields commit onBlur, select/checkbox commit onChange, every
// failure surfaces the service's own message through `onError`, and
// no-op results never dirty the document.
//
// The LaTeX field adds LIVE parse feedback: the draft is checked through
// the REAL MathJax engine while typing (`validateLatex`), so the hint
// appears before commit; the commit itself is validated by the service,
// which rejects unparseable input and keeps the previous valid formula in
// the document (the typed draft stays visible for fixing — same UX as the
// reference URL policy).

export type FormulaDispatch = (
  blockId: DocUUID,
  action: FormulaContentAction,
) => FormulaContentActionResult;

interface FormulaEditorProps {
  blockId: DocUUID;
  onAction: FormulaDispatch;
  onError: (message: string) => void;
}

/**
 * Shared commit helper (same contract as `dispatchCommit` in
 * StructuralContentEditor): dispatch through the App-level action and
 * surface the service's understandable message on failure.
 */
function commitFormulaAction(
  onAction: FormulaDispatch,
  onError: (message: string) => void,
  blockId: DocUUID,
  action: FormulaContentAction,
): FormulaContentActionResult {
  const result = onAction(blockId, action);
  if (result.ok === false) onError(result.message);
  return result;
}

const ALIGN_LABELS: Readonly<Record<string, string>> = {
  left: 'Left',
  center: 'Center',
  right: 'Right',
};

export function FormulaContentEditor({
  blockId,
  data,
  onAction,
  onError,
}: FormulaEditorProps & { data: FormulaBlockData }) {
  const commit = (action: FormulaContentAction): FormulaContentActionResult =>
    commitFormulaAction(onAction, onError, blockId, action);

  // Controlled LaTeX draft: it feeds the live parse hint.  On commit the
  // SERVICE validates (trim/length/parse); a rejected commit leaves the
  // document untouched while the draft stays visible for fixing.
  const [latexDraft, setLatexDraft] = React.useState<string>(data.latex);
  React.useEffect(() => {
    setLatexDraft(data.latex);
  }, [data.latex]);
  const parseState = React.useMemo(() => {
    if (latexDraft.trim() === '') {
      return {
        ok: false as const,
        message: 'the formula is empty — type an equation such as “E = mc^2”',
      };
    }
    return validateLatex(latexDraft);
  }, [latexDraft]);

  const addVariable = () => commit({ action: 'add-variable-definition' });
  const removeVariable = (entryId: DocUUID) =>
    commit({ action: 'remove-variable-definition', entryId });
  const patchVariable = (
    entryId: DocUUID,
    field: 'symbol' | 'definition' | 'unit',
    value: string,
  ) => commit({ action: 'update-variable-definition', entryId, patch: { [field]: value } });

  return (
    <div className="structural-editor">
      <div className="content-field content-field--stack">
        <label className="content-field-label" htmlFor={`fx-latex-${blockId}`}>
          LaTeX formula
        </label>
        <textarea
          id={`fx-latex-${blockId}`}
          className="rt-textarea"
          rows={3}
          spellCheck={false}
          maxLength={MAX_FORMULA_LATEX_LENGTH}
          value={latexDraft}
          onChange={(event) => setLatexDraft(event.target.value)}
          onBlur={() => commit({ action: 'update-formula', latex: latexDraft })}
          placeholder="E = mc^2"
        />
        <p className={`content-derived-hint${parseState.ok ? '' : ' is-invalid'}`}>
          {parseState.ok === true
            ? 'Reads as renderable math.  This panel edits the source; the preview pane typesets it.'
            : `Cannot be rendered: ${parseState.message}`}
        </p>
      </div>

      <div className="content-row">
        <label
          className="content-field content-field--check"
          htmlFor={`fx-display-${blockId}`}
        >
          <input
            id={`fx-display-${blockId}`}
            type="checkbox"
            checked={data.displayMode}
            onChange={(event) =>
              commit({ action: 'update-formula', displayMode: event.target.checked })
            }
          />
          <span className="content-field-label">Display mode (block-style equation)</span>
        </label>
        <label className="content-field" htmlFor={`fx-align-${blockId}`}>
          <span className="content-field-label">Alignment</span>
          <select
            id={`fx-align-${blockId}`}
            className="content-select"
            value={data.hAlign}
            onChange={(event) =>
              commit({
                action: 'update-formula',
                hAlign: event.target.value as FormulaBlockData['hAlign'],
              })
            }
          >
            {FORMULA_ALIGNMENTS.map((align) => (
              <option key={align} value={align}>
                {ALIGN_LABELS[align] ?? align}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="content-field content-field--stack">
        <label className="content-field-label" htmlFor={`fx-number-${blockId}`}>
          Equation number (optional)
        </label>
        <input
          id={`fx-number-${blockId}`}
          className="content-text-input"
          type="text"
          maxLength={MAX_FORMULA_NUMBER_LENGTH}
          defaultValue={data.formulaNumber ?? ''}
          onBlur={(event) =>
            commit({ action: 'update-formula', formulaNumber: event.target.value })
          }
          placeholder="(3.2)"
        />
        <p className="content-derived-hint">
          Printed in a right-aligned cell at the right edge; leave empty for no number.
        </p>
      </div>

      <div className="content-field content-field--stack">
        <label className="content-field-label" htmlFor={`fx-where-${blockId}`}>
          “Where:” label (optional)
        </label>
        <input
          id={`fx-where-${blockId}`}
          className="content-text-input"
          type="text"
          maxLength={MAX_WHERE_LABEL_LENGTH}
          defaultValue={data.whereLabelOverride ?? ''}
          onBlur={(event) =>
            commit({ action: 'update-formula', whereLabelOverride: event.target.value })
          }
          placeholder="Where:"
        />
      </div>

      <p className="content-derived-hint">
        Variable definitions print beside the formula when the page has room and move below it
        when it does not; an over-wide formula scales down to fit and says so in the PDF.
      </p>

      {data.variableDefinitions.length === 0 ? (
        <p className="content-derived-hint">
          No variable definitions yet.  The “Where:” list prints only when at least one exists.
        </p>
      ) : (
        <ul className="structural-entry-list" role="list">
          {data.variableDefinitions.map((entry) => (
            <li key={entry.id} className="structural-entry-card">
              <div className="content-row">
                <div className="content-field content-field--stack">
                  <label className="content-field-label" htmlFor={`fxv-symbol-${entry.id}`}>
                    Symbol
                  </label>
                  <input
                    id={`fxv-symbol-${entry.id}`}
                    className="content-text-input"
                    type="text"
                    maxLength={MAX_VARIABLE_SYMBOL_LENGTH}
                    defaultValue={entry.symbol}
                    onBlur={(event) => patchVariable(entry.id, 'symbol', event.target.value)}
                    placeholder="e.g. k or \sigma"
                  />
                </div>
                <div className="content-field content-field--stack">
                  <label className="content-field-label" htmlFor={`fxv-unit-${entry.id}`}>
                    Unit (optional)
                  </label>
                  <input
                    id={`fxv-unit-${entry.id}`}
                    className="content-text-input"
                    type="text"
                    maxLength={MAX_VARIABLE_UNIT_LENGTH}
                    defaultValue={entry.unit ?? ''}
                    onBlur={(event) => patchVariable(entry.id, 'unit', event.target.value)}
                    placeholder="e.g. m·s⁻²"
                  />
                </div>
              </div>
              <div className="content-field content-field--stack">
                <label className="content-field-label" htmlFor={`fxv-def-${entry.id}`}>
                  Definition
                </label>
                <textarea
                  id={`fxv-def-${entry.id}`}
                  className="rt-textarea"
                  rows={2}
                  maxLength={MAX_VARIABLE_DEFINITION_LENGTH}
                  defaultValue={entry.definition}
                  onBlur={(event) => patchVariable(entry.id, 'definition', event.target.value)}
                  placeholder="what the symbol means"
                />
              </div>
              <button
                type="button"
                className="block-action-btn block-action-btn--danger"
                onClick={() => removeVariable(entry.id)}
              >
                Remove definition
              </button>
            </li>
          ))}
        </ul>
      )}
      <button type="button" className="block-action-btn block-action-btn--wide" onClick={addVariable}>
        Add variable definition
      </button>
    </div>
  );
}
