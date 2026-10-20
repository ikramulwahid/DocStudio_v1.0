import React, { useEffect, useRef, useState } from 'react';
import type {
  HeaderFooterSettings,
  HAlignment,
  PageNumberFormat,
  VAlignment,
} from '../../types/document';
import { normalizeHexColor } from '../../services/rich-text';
import {
  DOCUMENTED_TOKENS,
  H_ALIGNMENTS,
  HF_CELL_CONTENT_MAX_LENGTH,
  HF_MAX_COLUMNS,
  HF_MAX_ROWS,
  PAGE_NUMBER_FORMATS,
  V_ALIGNMENTS,
  WATERMARK_FONT_SIZE_PT_RANGE,
  WATERMARK_OPACITY_RANGE,
  WATERMARK_POSITION_RANGE,
  WATERMARK_ROTATION_DEG_RANGE,
  WATERMARK_TEXT_MAX_LENGTH,
  type BandKind,
  type HeaderFooterPatch,
  type HeaderFooterUpdateResult,
  type WatermarkPatch,
} from '../../services/header-footer-settings';
import { parseNumberDraft } from '../../services/page-typography';
import './HeaderFooterPanel.css';

/**
 * Header & Footer panel (P06-M1, project_details.md §9).
 *
 * Functional controls bound DIRECTLY to the authoritative
 * `document.headerFooter` — there is no second settings model.  Every
 * control dispatches a patch through the pure
 * `services/header-footer-settings.ts` rules; a rejected patch shows an
 * understandable inline error and commits nothing.  Structural removals
 * that would discard cell text are two-step: the service answers
 * `confirm-required`, the panel shows an inline confirmation, and only
 * the confirmed re-issue passes `force: true`.
 *
 * Composition notes (documented decisions, mirrored in the service and
 * the renderer module):
 * • Header and footer are independent bands (own enable switch, grid,
 *   numbering mode and first-body-page suppression).
 * • The Page & Typography "Display header" preference (§8.4) remains
 *   the master switch for ANY body-page header; the header grid needs
 *   BOTH switches.  That panel is not modified or replaced here.
 * • `suppressOnFirstPage` refers to the first BODY page — a designed
 *   front page never carries body furniture.
 * • The watermark renders on every body page while enabled; its colour
 *   is an explicit user property and is rendered as stored.
 *
 * The renderer draws the WATERMARK settings in the live document path
 * (P06-M1 wired `WatermarkLayer` into `PocDocument` — provably
 * byte-neutral for every committed baseline, watermarks off).  The
 * header/footer GRID bands are complete but their activation inside
 * `PocDocument` awaits the owner's baseline-regeneration authorization
 * (DEC-006/DEC-008 boundary) — the panel edits and persists the
 * authoritative document settings, which the checkpoint records
 * honestly.
 */
interface HeaderFooterPanelProps {
  /** Authoritative `document.headerFooter`. */
  headerFooter: HeaderFooterSettings;
  /** `document.pageTypography.displayHeader` — the §8.4 master switch. */
  displayHeaderEnabled: boolean;
  /** Commit a header/footer band patch; returns the pure-service result. */
  onBandChange: (band: BandKind, patch: HeaderFooterPatch) => HeaderFooterUpdateResult;
  /** Commit a watermark patch; returns the pure-service result. */
  onWatermarkChange: (patch: WatermarkPatch) => HeaderFooterUpdateResult;
}

type GroupErrors = {
  header?: string;
  footer?: string;
  watermark?: string;
};

/** Draft-backed numeric watermark fields. */
interface WatermarkDrafts {
  opacity: string;
  rotationDeg: string;
  fontSizePt: string;
  positionX: string;
  positionY: string;
}

const draftsFrom = (wm: HeaderFooterSettings['watermark']): WatermarkDrafts => ({
  opacity: String(wm.opacity),
  rotationDeg: String(wm.rotationDeg),
  fontSizePt: String(wm.fontSizePt),
  positionX: String(wm.positionX),
  positionY: String(wm.positionY),
});

const PAGE_NUMBER_LABELS: Record<PageNumberFormat, string> = {
  'Page X of Y': 'Page X of Y',
  'X/Y': 'X/Y',
  X: 'X (number only)',
  none: 'None',
};

// ─────────────────────────────────────────────────────────────────────────────
// Band editor (shared by header and footer)
// ─────────────────────────────────────────────────────────────────────────────

interface BandEditorProps {
  bandKind: BandKind;
  label: string;
  band: HeaderFooterSettings['header'];
  displayHeaderMasterOff?: boolean;
  error?: string;
  onPatch: (patch: HeaderFooterPatch) => HeaderFooterUpdateResult;
}

function BandEditor({
  bandKind,
  label,
  band,
  displayHeaderMasterOff = false,
  error,
  onPatch,
}: BandEditorProps): React.ReactElement {
  /** Inline destructive-removal confirmation (service said confirm-required). */
  const [confirming, setConfirming] = useState<{
    kind: 'row' | 'column';
    rowId?: string;
    columnIndex?: number;
    message: string;
  } | null>(null);
  /** Cell input to focus after the next structural change lands. */
  const [pendingFocusCellId, setPendingFocusCellId] = useState<string | null>(null);
  /** The cell currently receiving token inserts. */
  const [activeCell, setActiveCell] = useState<{ rowId: string; cellId: string } | null>(null);
  const cellInputRefs = useRef<Record<string, HTMLInputElement | null>>({});
  const caretRestore = useRef<{ el: HTMLInputElement; pos: number } | null>(null);

  useEffect(() => {
    if (pendingFocusCellId === null) return;
    const el = cellInputRefs.current[pendingFocusCellId];
    if (el) {
      el.focus();
      setPendingFocusCellId(null);
    }
  });

  /** Remember the pre-action grid so the NEW cell id can be located. */
  const captureNewCell = (
    before: Set<string>,
    after: { rows: { id: string; cells: { id: string }[] }[] },
    position: 'row-first' | 'column-first',
    atIndex?: number,
  ): string | null => {
    if (position === 'row-first') {
      const newRow = after.rows.find((r) => !before.has(r.id));
      return newRow?.cells[0]?.id ?? null;
    }
    const firstRow = after.rows[0];
    const index = atIndex ?? firstRow?.cells.length ?? 0;
    return firstRow?.cells[index]?.id ?? null;
  };

  const structural = (
    patch: HeaderFooterPatch,
    focusOf: 'row-first' | 'column-first',
    atIndex?: number,
  ): void => {
    const before = new Set(band.rows.map((r) => r.id));
    lastStructuralRef.current = { before, focusOf, atIndex };
    onPatch(patch);
  };

  const lastStructuralRef = useRef<{
    before: Set<string>;
    focusOf: 'row-first' | 'column-first';
    atIndex?: number;
  } | null>(null);

  // After any commit, locate the new cell queued by the last structural
  // action and focus it ("focus follows the structural change").
  useEffect(() => {
    const pending = lastStructuralRef.current;
    if (!pending) return;
    lastStructuralRef.current = null;
    const id = captureNewCell(pending.before, band, pending.focusOf, pending.atIndex);
    if (id !== null) setPendingFocusCellId(id);
  });

  const handleAddRow = (): void => {
    setConfirming(null);
    structural({ field: 'addRow' }, 'row-first');
  };
  const handleAddColumn = (): void => {
    setConfirming(null);
    // Focus target: the service appends the new cell at the OLD column
    // index, so record that index for the post-commit focus capture
    // (`captureNewCell` reads the AFTER grid).
    structural({ field: 'addColumn' }, 'column-first', band.columnCount);
  };
  const handleRemoveRow = (rowId: string, force?: boolean): void => {
    const result = onPatch({ field: 'removeRow', rowId, force });
    if (!result.ok && result.code === 'confirm-required') {
      setConfirming({ kind: 'row', rowId, message: result.message });
    } else {
      setConfirming(null);
    }
  };
  const handleRemoveColumn = (columnIndex: number, force?: boolean): void => {
    const result = onPatch({ field: 'removeColumn', columnIndex, force });
    if (!result.ok && result.code === 'confirm-required') {
      setConfirming({ kind: 'column', columnIndex, message: result.message });
    } else {
      setConfirming(null);
    }
  };

  const insertToken = (token: string): void => {
    if (activeCell === null) return;
    const el = cellInputRefs.current[activeCell.cellId];
    const row = band.rows.find((r) => r.id === activeCell.rowId);
    const cell = row?.cells.find((c) => c.id === activeCell.cellId);
    if (!cell) return;
    const start = el?.selectionStart ?? cell.content.length;
    const end = el?.selectionEnd ?? start;
    const next = cell.content.slice(0, start) + token + cell.content.slice(end);
    caretRestore.current = el ? { el, pos: start + token.length } : null;
    onPatch({ field: 'cellContent', rowId: activeCell.rowId, cellId: activeCell.cellId, value: next });
  };

  // Restore the caret after a token insert (the controlled input re-render
  // would otherwise jump the caret to the end).
  useEffect(() => {
    const pending = caretRestore.current;
    if (!pending) return;
    caretRestore.current = null;
    pending.el.focus();
    pending.el.setSelectionRange(pending.pos, pending.pos);
  });

  const ariaPrefix = bandKind === 'header' ? 'Header' : 'Footer';

  return (
    <fieldset className="hf-group" aria-label={`${label} band`}>
      <legend className="hf-group-title">{label}</legend>

      <div className="hf-checkbox-row">
        <input
          id={`hf-${bandKind}-enabled`}
          className="hf-checkbox"
          type="checkbox"
          checked={band.enabled}
          onChange={(e) => onPatch({ field: 'enabled', value: e.target.checked })}
        />
        <label className="hf-label" htmlFor={`hf-${bandKind}-enabled`}>
          Show {label.toLowerCase()} on body pages
        </label>
      </div>
      {bandKind === 'header' && displayHeaderMasterOff && (
        <span className="hf-hint">
          Hidden while the Page &amp; Typography &quot;Display header&quot; preference is off — both
          switches must be on for the header to appear.
        </span>
      )}

      <div className="hf-row">
        <label className="hf-label" htmlFor={`hf-${bandKind}-page-number`}>
          Page numbering
        </label>
        <select
          id={`hf-${bandKind}-page-number`}
          className="hf-select"
          value={band.pageNumberFormat}
          onChange={(e) =>
            onPatch({ field: 'pageNumberFormat', value: e.target.value as PageNumberFormat })
          }
        >
          {PAGE_NUMBER_FORMATS.map((f) => (
            <option key={f} value={f}>
              {PAGE_NUMBER_LABELS[f]}
            </option>
          ))}
        </select>
      </div>
      <span className="hf-hint">
        Formats the {'{pageNumber}'} token in this band&apos;s cells (other text is kept). &quot;None&quot;
        hides the number only.
      </span>

      <div className="hf-checkbox-row">
        <input
          id={`hf-${bandKind}-suppress`}
          className="hf-checkbox"
          type="checkbox"
          checked={band.suppressOnFirstPage}
          onChange={(e) => onPatch({ field: 'suppressOnFirstPage', value: e.target.checked })}
        />
        <label className="hf-label" htmlFor={`hf-${bandKind}-suppress`}>
          Hide on the first body page
        </label>
      </div>
      <span className="hf-hint">
        Refers to the first body page; a designed front page never carries body furniture.
      </span>

      {/* Grid toolbar */}
      <div className="hf-grid-toolbar" role="group" aria-label={`${label} grid layout`}>
        <button
          type="button"
          className="hf-btn"
          disabled={band.rows.length >= HF_MAX_ROWS}
          onClick={handleAddRow}
          title={`Add a row (max ${HF_MAX_ROWS})`}
        >
          + Row
        </button>
        <button
          type="button"
          className="hf-btn"
          disabled={band.columnCount >= HF_MAX_COLUMNS}
          onClick={handleAddColumn}
          title={`Add a column (max ${HF_MAX_COLUMNS})`}
        >
          + Column
        </button>
        <span className="hf-grid-size">
          {band.rows.length} × {band.columnCount}
        </span>
      </div>

      {/* Per-column removal strip (one button per column, from row 1) */}
      <div className="hf-col-strip" role="group" aria-label={`Remove a ${label.toLowerCase()} column`}>
        {(band.rows[0]?.cells ?? []).map((_, columnIndex) => (
          <button
            key={`hf-${bandKind}-col-${columnIndex}`}
            type="button"
            className="hf-btn hf-btn--danger"
            disabled={band.columnCount <= 1}
            title={`Remove column ${columnIndex + 1}`}
            aria-label={`Remove ${label.toLowerCase()} column ${columnIndex + 1}`}
            onClick={() => handleRemoveColumn(columnIndex)}
          >
            ×
          </button>
        ))}
      </div>

      {/* The grid */}
      <div className="hf-grid" role="group" aria-label={`${label} grid cells`}>
        {band.rows.map((row, rowIndex) => (
          <div className="hf-grid-row" key={row.id}>
            {row.cells.map((cell, cellIndex) => (
              <div className="hf-cell" key={cell.id}>
                <input
                  ref={(el) => {
                    cellInputRefs.current[cell.id] = el;
                  }}
                  className="hf-input hf-cell-input"
                  type="text"
                  maxLength={HF_CELL_CONTENT_MAX_LENGTH}
                  value={cell.content}
                  aria-label={`${ariaPrefix} row ${rowIndex + 1} cell ${cellIndex + 1} content`}
                  onFocus={() => setActiveCell({ rowId: row.id, cellId: cell.id })}
                  onChange={(e) =>
                    onPatch({
                      field: 'cellContent',
                      rowId: row.id,
                      cellId: cell.id,
                      value: e.target.value,
                    })
                  }
                />
                <div className="hf-cell-align">
                  <select
                    className="hf-select hf-select--mini"
                    value={cell.hAlign}
                    aria-label={`${ariaPrefix} row ${rowIndex + 1} cell ${cellIndex + 1} horizontal alignment`}
                    onChange={(e) =>
                      onPatch({
                        field: 'cellHAlign',
                        rowId: row.id,
                        cellId: cell.id,
                        value: e.target.value as HAlignment,
                      })
                    }
                  >
                    {H_ALIGNMENTS.map((a) => (
                      <option key={a} value={a}>
                        {a === 'left' ? '⇤ Left' : a === 'center' ? '↔ Center' : 'Right ⇥'}
                      </option>
                    ))}
                  </select>
                  <select
                    className="hf-select hf-select--mini"
                    value={cell.vAlign}
                    aria-label={`${ariaPrefix} row ${rowIndex + 1} cell ${cellIndex + 1} vertical alignment`}
                    onChange={(e) =>
                      onPatch({
                        field: 'cellVAlign',
                        rowId: row.id,
                        cellId: cell.id,
                        value: e.target.value as VAlignment,
                      })
                    }
                  >
                    {V_ALIGNMENTS.map((a) => (
                      <option key={a} value={a}>
                        {a === 'top' ? 'Top' : a === 'middle' ? 'Middle' : 'Bottom'}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            ))}
            <button
              type="button"
              className="hf-btn hf-btn--danger hf-row-remove"
              disabled={band.rows.length <= 1}
              title={`Remove row ${rowIndex + 1}`}
              aria-label={`Remove ${label.toLowerCase()} row ${rowIndex + 1}`}
              onClick={() => handleRemoveRow(row.id)}
            >
              ×
            </button>
          </div>
        ))}
      </div>

      {/* Token insert (into the focused cell) */}
      <div className="hf-token-bar" role="group" aria-label={`Insert a token into the focused ${label.toLowerCase()} cell`}>
        <span className="hf-hint">Insert into the focused cell:</span>
        {DOCUMENTED_TOKENS.map((token) => (
          <button
            key={`hf-${bandKind}-token-${token}`}
            type="button"
            className="hf-btn hf-btn--token"
            disabled={activeCell === null}
            title={`Insert ${token} at the cursor`}
            onClick={() => insertToken(token)}
          >
            {token}
          </button>
        ))}
      </div>

      {/* Destructive-removal confirmation */}
      {confirming && (
        <div className="hf-confirm" role="alert">
          <span className="hf-confirm-msg">{confirming.message}</span>
          <div className="hf-confirm-actions">
            <button
              type="button"
              className="hf-btn hf-btn--danger"
              onClick={() =>
                confirming.kind === 'row'
                  ? handleRemoveRow(confirming.rowId as string, true)
                  : handleRemoveColumn(confirming.columnIndex as number, true)
              }
            >
              Remove
            </button>
            <button type="button" className="hf-btn" onClick={() => setConfirming(null)}>
              Cancel
            </button>
          </div>
        </div>
      )}

      {error && (
        <p className="hf-error" role="alert">
          {error}
        </p>
      )}
    </fieldset>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Panel
// ─────────────────────────────────────────────────────────────────────────────

export const HeaderFooterPanel: React.FC<HeaderFooterPanelProps> = ({
  headerFooter,
  displayHeaderEnabled,
  onBandChange,
  onWatermarkChange,
}) => {
  const { watermark } = headerFooter;
  const [errors, setErrors] = useState<GroupErrors>({});
  const [watermarkDrafts, setWatermarkDrafts] = useState<WatermarkDrafts>(() =>
    draftsFrom(watermark),
  );

  // State-backed colour control (P05-FIX-01 DEF-001 pattern): the native
  // input/change listeners are the AUTHORITATIVE apply path — React's
  // synthetic onChange for type="color" can be silently suppressed by its
  // value tracker when the value arrived through the JS setter.
  const [colorChoice, setColorChoice] = useState(
    () => normalizeHexColor(watermark.color) ?? '#aaaaaa',
  );
  const colorInputRef = useRef<HTMLInputElement | null>(null);
  const latestRef = useRef({ onWatermarkChange });
  useEffect(() => {
    latestRef.current = { onWatermarkChange };
  });
  useEffect(() => {
    setColorChoice(normalizeHexColor(watermark.color) ?? '#aaaaaa');
  }, [watermark.color]);
  useEffect(() => {
    const el = colorInputRef.current;
    if (el === null) return;
    const apply = (): void => {
      const norm = normalizeHexColor(el.value);
      if (norm !== null) setColorChoice(norm);
      latestRef.current.onWatermarkChange({ field: 'color', value: el.value });
    };
    el.addEventListener('input', apply);
    el.addEventListener('change', apply);
    return () => {
      el.removeEventListener('input', apply);
      el.removeEventListener('change', apply);
    };
  }, []);

  // Re-sync numeric drafts when THEIR authoritative values change
  // externally (reset, open) without clobbering an in-progress draft.
  useEffect(() => {
    setWatermarkDrafts(draftsFrom(watermark));
  }, [
    watermark.opacity,
    watermark.rotationDeg,
    watermark.fontSizePt,
    watermark.positionX,
    watermark.positionY,
  ]);

  const report = (group: keyof GroupErrors, result: HeaderFooterUpdateResult): void => {
    if (result.ok) {
      setErrors((prev) => ({ ...prev, [group]: undefined }));
      return;
    }
    // `confirm-required` is not an error: it drives the inline
    // confirmation prompt rendered by the band editor itself.
    if (result.code === 'confirm-required') return;
    setErrors((prev) => ({ ...prev, [group]: result.message }));
  };

  const bandPatch =
    (kind: BandKind) =>
    (patch: HeaderFooterPatch): HeaderFooterUpdateResult => {
      const result = onBandChange(kind, patch);
      report(kind, result);
      return result;
    };

  const watermarkPatch = (patch: WatermarkPatch): HeaderFooterUpdateResult => {
    const result = onWatermarkChange(patch);
    report('watermark', result);
    return result;
  };

  const handleDraft = (key: keyof WatermarkDrafts, raw: string, field: WatermarkPatch['field']) => {
    setWatermarkDrafts((prev) => ({ ...prev, [key]: raw }));
    watermarkPatch({ field, value: parseNumberDraft(raw) } as WatermarkPatch);
  };

  return (
    <div className="hf-form" role="group" aria-label="Header and footer settings">
      <BandEditor
        bandKind="header"
        label="Header"
        band={headerFooter.header}
        displayHeaderMasterOff={!displayHeaderEnabled}
        error={errors.header}
        onPatch={bandPatch('header')}
      />
      <BandEditor
        bandKind="footer"
        label="Footer"
        band={headerFooter.footer}
        error={errors.footer}
        onPatch={bandPatch('footer')}
      />

      {/* Watermark */}
      <fieldset className="hf-group" aria-label="Watermark">
        <legend className="hf-group-title">Watermark</legend>
        <div className="hf-checkbox-row">
          <input
            id="hf-watermark-enabled"
            className="hf-checkbox"
            type="checkbox"
            checked={watermark.enabled}
            onChange={(e) => watermarkPatch({ field: 'enabled', value: e.target.checked })}
          />
          <label className="hf-label" htmlFor="hf-watermark-enabled">
            Show watermark on body pages
          </label>
        </div>

        <div className="hf-row">
          <label className="hf-label" htmlFor="hf-watermark-text">
            Text
          </label>
          <input
            id="hf-watermark-text"
            className="hf-input"
            type="text"
            maxLength={WATERMARK_TEXT_MAX_LENGTH}
            value={watermark.text}
            aria-invalid={errors.watermark ? true : undefined}
            onChange={(e) => watermarkPatch({ field: 'text', value: e.target.value })}
          />
        </div>

        <div className="hf-row">
          <label className="hf-label" htmlFor="hf-watermark-color">
            Colour
          </label>
          <label className="hf-color-field" title="Watermark colour">
            <input
              ref={colorInputRef}
              id="hf-watermark-color"
              type="color"
              className="hf-color-input"
              value={colorChoice}
              aria-label="Watermark colour"
              onChange={(e) => setColorChoice(e.target.value)}
            />
            <span className="hf-color-swatch" style={{ backgroundColor: colorChoice }} aria-hidden="true" />
            <span className="hf-color-value">{colorChoice}</span>
          </label>
        </div>

        <div className="hf-num-grid">
          <div className="hf-row">
            <label className="hf-label" htmlFor="hf-watermark-opacity">
              Opacity (0–1)
            </label>
            <input
              id="hf-watermark-opacity"
              className="hf-input hf-input-num"
              type="number"
              inputMode="decimal"
              step="0.05"
              min={WATERMARK_OPACITY_RANGE.min}
              max={WATERMARK_OPACITY_RANGE.max}
              value={watermarkDrafts.opacity}
              aria-invalid={errors.watermark ? true : undefined}
              onChange={(e) => handleDraft('opacity', e.target.value, 'opacity')}
            />
          </div>
          <div className="hf-row">
            <label className="hf-label" htmlFor="hf-watermark-rotation">
              Rotation (°)
            </label>
            <input
              id="hf-watermark-rotation"
              className="hf-input hf-input-num"
              type="number"
              inputMode="decimal"
              step="5"
              min={WATERMARK_ROTATION_DEG_RANGE.min}
              max={WATERMARK_ROTATION_DEG_RANGE.max}
              value={watermarkDrafts.rotationDeg}
              aria-invalid={errors.watermark ? true : undefined}
              onChange={(e) => handleDraft('rotationDeg', e.target.value, 'rotationDeg')}
            />
          </div>
          <div className="hf-row">
            <label className="hf-label" htmlFor="hf-watermark-font-size">
              Font size (pt)
            </label>
            <input
              id="hf-watermark-font-size"
              className="hf-input hf-input-num"
              type="number"
              inputMode="decimal"
              step="1"
              min={WATERMARK_FONT_SIZE_PT_RANGE.min}
              max={WATERMARK_FONT_SIZE_PT_RANGE.max}
              value={watermarkDrafts.fontSizePt}
              aria-invalid={errors.watermark ? true : undefined}
              onChange={(e) => handleDraft('fontSizePt', e.target.value, 'fontSizePt')}
            />
          </div>
          <div className="hf-row">
            <label className="hf-label" htmlFor="hf-watermark-pos-x">
              Position X (0–1)
            </label>
            <input
              id="hf-watermark-pos-x"
              className="hf-input hf-input-num"
              type="number"
              inputMode="decimal"
              step="0.05"
              min={WATERMARK_POSITION_RANGE.min}
              max={WATERMARK_POSITION_RANGE.max}
              value={watermarkDrafts.positionX}
              aria-invalid={errors.watermark ? true : undefined}
              onChange={(e) => handleDraft('positionX', e.target.value, 'positionX')}
            />
          </div>
          <div className="hf-row">
            <label className="hf-label" htmlFor="hf-watermark-pos-y">
              Position Y (0–1)
            </label>
            <input
              id="hf-watermark-pos-y"
              className="hf-input hf-input-num"
              type="number"
              inputMode="decimal"
              step="0.05"
              min={WATERMARK_POSITION_RANGE.min}
              max={WATERMARK_POSITION_RANGE.max}
              value={watermarkDrafts.positionY}
              aria-invalid={errors.watermark ? true : undefined}
              onChange={(e) => handleDraft('positionY', e.target.value, 'positionY')}
            />
          </div>
        </div>

        <span className="hf-hint">
          The watermark appears on every body page while enabled (a front page stays clean). Its
          colour is your explicit choice and is rendered as stored — monochrome mode converts theme
          colours, not this. An empty text hides the watermark.
        </span>
        {errors.watermark && (
          <p className="hf-error" role="alert">
            {errors.watermark}
          </p>
        )}
      </fieldset>
    </div>
  );
};
