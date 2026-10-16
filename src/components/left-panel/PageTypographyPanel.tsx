import React, { useEffect, useState } from 'react';
import type {
  MarginPreset,
  PageOrientation,
  PageSetup,
  PageTypographySettings,
  PageSize,
} from '../../types/document';
import {
  MARGIN_PRESETS_MM,
  effectivePageDimensionsMm,
  parseNumberDraft,
  FONT_SIZE_PT_RANGE,
  LINE_HEIGHT_RANGE,
  PARAGRAPH_SPACING_PT_RANGE,
  type PageSetupPatch,
  type SettingsUpdateResult,
  type TypographyPatch,
} from '../../services/page-typography';
import './PageTypographyPanel.css';

/**
 * Page & Typography panel (P04-M1).
 *
 * Functional, accessible controls bound DIRECTLY to the authoritative
 * active document — there is no second settings model.  Every control
 * dispatches a patch through the pure `services/page-typography.ts` rules;
 * a rejected patch shows an understandable inline error and commits
 * nothing.  Text/number inputs hold a local draft so half-typed values are
 * never written to the document; drafts re-sync when the authoritative
 * value changes externally (e.g. Reset Settings).
 *
 * Honest font note: the renderer currently maps body text to PDF
 * standard-14 fonts (no embedding).  Registering/embedding real font files
 * is a Phase 08 fidelity task — this panel does not promise that arbitrary
 * fonts embed in exported PDFs or that output is identical on every machine.
 */
interface PageTypographyPanelProps {
  /** Authoritative `document.pageSetup`. */
  pageSetup: PageSetup;
  /** Authoritative `document.pageTypography` (incl. displayHeader). */
  pageTypography: PageTypographySettings;
  /** `document.frontPage.enabled` — disables the display-header control (§8.4). */
  frontPageEnabled: boolean;
  /** Commit a page-setup patch; returns the pure-service result. */
  onPageSetupChange: (patch: PageSetupPatch) => SettingsUpdateResult;
  /** Commit a typography patch; returns the pure-service result. */
  onTypographyChange: (patch: TypographyPatch) => SettingsUpdateResult;
  /** Commit the display-header preference; returns the pure-service result. */
  onDisplayHeaderChange: (value: boolean) => SettingsUpdateResult;
}

/** Common font names offered via the font-family combobox. */
const FONT_SUGGESTIONS = [
  'Segoe UI',
  'Arial',
  'Times New Roman',
  'Calibri',
  'Cambria',
  'Georgia',
  'Verdana',
  'Courier New',
];

const sizeLabel = (size: PageSize, orientation: PageOrientation): string => {
  const [w, h] = effectivePageDimensionsMm(size, orientation);
  return `${size} (${Math.round(w)} × ${Math.round(h)} mm)`;
};

const presetHint = (preset: MarginPreset): string =>
  preset === 'custom'
    ? 'Custom values in millimetres'
    : `${MARGIN_PRESETS_MM[preset]} mm on all sides`;

type GroupErrors = { page?: string; margins?: string; typography?: string; header?: string };

export const PageTypographyPanel: React.FC<PageTypographyPanelProps> = ({
  pageSetup,
  pageTypography,
  frontPageEnabled,
  onPageSetupChange,
  onTypographyChange,
  onDisplayHeaderChange,
}) => {
  const { typography } = pageTypography;

  // ── Local drafts for text/number inputs ──────────────────────────────────
  const [marginDrafts, setMarginDrafts] = useState({
    top: String(pageSetup.margins.topMm),
    bottom: String(pageSetup.margins.bottomMm),
    left: String(pageSetup.margins.leftMm),
    right: String(pageSetup.margins.rightMm),
  });
  const [fontFamilyDraft, setFontFamilyDraft] = useState(typography.fontFamily);
  const [fallbacksDraft, setFallbacksDraft] = useState(typography.fontFallbacks.join(', '));
  const [baseSizeDraft, setBaseSizeDraft] = useState(String(typography.baseFontSizePt));
  const [lineHeightDraft, setLineHeightDraft] = useState(String(typography.lineHeight));
  const [paraSpacingDraft, setParaSpacingDraft] = useState(String(typography.paragraphSpacingPt));
  const [errors, setErrors] = useState<GroupErrors>({});

  // Re-sync each draft when ITS authoritative value changes externally
  // (reset, open, duplicate).  An in-progress invalid draft is never
  // clobbered by unrelated document changes.
  useEffect(() => {
    setMarginDrafts({
      top: String(pageSetup.margins.topMm),
      bottom: String(pageSetup.margins.bottomMm),
      left: String(pageSetup.margins.leftMm),
      right: String(pageSetup.margins.rightMm),
    });
  }, [
    pageSetup.margins.topMm,
    pageSetup.margins.bottomMm,
    pageSetup.margins.leftMm,
    pageSetup.margins.rightMm,
  ]);
  useEffect(() => {
    setFontFamilyDraft(typography.fontFamily);
  }, [typography.fontFamily]);
  useEffect(() => {
    setFallbacksDraft(typography.fontFallbacks.join(', '));
  }, [typography.fontFallbacks]);
  useEffect(() => {
    setBaseSizeDraft(String(typography.baseFontSizePt));
  }, [typography.baseFontSizePt]);
  useEffect(() => {
    setLineHeightDraft(String(typography.lineHeight));
  }, [typography.lineHeight]);
  useEffect(() => {
    setParaSpacingDraft(String(typography.paragraphSpacingPt));
  }, [typography.paragraphSpacingPt]);

  const report = (group: keyof GroupErrors, result: SettingsUpdateResult): boolean => {
    if (result.ok) {
      setErrors((prev) => ({ ...prev, [group]: undefined }));
      return true;
    }
    setErrors((prev) => ({ ...prev, [group]: result.message }));
    return false;
  };

  // ── Page ────────────────────────────────────────────────────────────────
  const handleSize = (e: React.ChangeEvent<HTMLSelectElement>) => {
    report('page', onPageSetupChange({ field: 'size', size: e.target.value as PageSize }));
  };
  const handleOrientation = (e: React.ChangeEvent<HTMLSelectElement>) => {
    report(
      'page',
      onPageSetupChange({ field: 'orientation', orientation: e.target.value as PageOrientation }),
    );
  };

  // ── Margins ─────────────────────────────────────────────────────────────
  const handlePreset = (e: React.ChangeEvent<HTMLSelectElement>) => {
    report(
      'margins',
      onPageSetupChange({ field: 'marginPreset', preset: e.target.value as MarginPreset }),
    );
  };
  const commitCustomMargins = (next: typeof marginDrafts) => {
    report(
      'margins',
      onPageSetupChange({
        field: 'customMargins',
        topMm: parseNumberDraft(next.top),
        bottomMm: parseNumberDraft(next.bottom),
        leftMm: parseNumberDraft(next.left),
        rightMm: parseNumberDraft(next.right),
      }),
    );
  };
  const handleMarginField = (key: keyof typeof marginDrafts, value: string) => {
    const next = { ...marginDrafts, [key]: value };
    setMarginDrafts(next);
    commitCustomMargins(next);
  };

  // ── Typography ──────────────────────────────────────────────────────────
  const handleFontFamily = (value: string) => {
    setFontFamilyDraft(value);
    report('typography', onTypographyChange({ field: 'fontFamily', value }));
  };
  const handleFallbacks = (value: string) => {
    setFallbacksDraft(value);
    // Documented parsing: comma-separated list; empty segments are dropped.
    const parsed = value
      .split(',')
      .map((entry) => entry.trim())
      .filter((entry) => entry !== '');
    report('typography', onTypographyChange({ field: 'fontFallbacks', value: parsed }));
  };
  const handleBaseSize = (value: string) => {
    setBaseSizeDraft(value);
    report('typography', onTypographyChange({ field: 'baseFontSizePt', value: parseNumberDraft(value) }));
  };
  const handleLineHeight = (value: string) => {
    setLineHeightDraft(value);
    report('typography', onTypographyChange({ field: 'lineHeight', value: parseNumberDraft(value) }));
  };
  const handleParaSpacing = (value: string) => {
    setParaSpacingDraft(value);
    report(
      'typography',
      onTypographyChange({ field: 'paragraphSpacingPt', value: parseNumberDraft(value) }),
    );
  };

  // ── Display header (§8.4) ───────────────────────────────────────────────
  const handleDisplayHeader = (e: React.ChangeEvent<HTMLInputElement>) => {
    report('header', onDisplayHeaderChange(e.target.checked));
  };

  return (
    <div className="pt-form" role="group" aria-label="Page setup and typography">
      {/* Page */}
      <fieldset className="pt-group">
        <legend className="pt-group-title">Page</legend>
        <div className="pt-row">
          <label className="pt-label" htmlFor="pt-size">
            Paper size
          </label>
          <select
            id="pt-size"
            className="pt-select"
            value={pageSetup.size}
            onChange={handleSize}
          >
            {(['A4', 'A3', 'A5', 'Letter', 'Legal'] as PageSize[]).map((s) => (
              <option key={s} value={s}>
                {sizeLabel(s, pageSetup.orientation)}
              </option>
            ))}
          </select>
        </div>
        <div className="pt-row">
          <label className="pt-label" htmlFor="pt-orientation">
            Orientation
          </label>
          <select
            id="pt-orientation"
            className="pt-select"
            value={pageSetup.orientation}
            onChange={handleOrientation}
          >
            <option value="portrait">Portrait</option>
            <option value="landscape">Landscape</option>
          </select>
        </div>
        {errors.page && (
          <p className="pt-error" role="alert">
            {errors.page}
          </p>
        )}
      </fieldset>

      {/* Margins */}
      <fieldset className="pt-group">
        <legend className="pt-group-title">Margins</legend>
        <div className="pt-row">
          <label className="pt-label" htmlFor="pt-margin-preset">
            Preset
          </label>
          <select
            id="pt-margin-preset"
            className="pt-select"
            value={pageSetup.margins.preset}
            onChange={handlePreset}
          >
            <option value="normal">Normal ({MARGIN_PRESETS_MM.normal} mm)</option>
            <option value="narrow">Narrow ({MARGIN_PRESETS_MM.narrow} mm)</option>
            <option value="wide">Wide ({MARGIN_PRESETS_MM.wide} mm)</option>
            <option value="custom">Custom…</option>
          </select>
        </div>
        <span className="pt-hint">{presetHint(pageSetup.margins.preset)}</span>

        {pageSetup.margins.preset === 'custom' && (
          <div className="pt-custom-margins" role="group" aria-label="Custom margins in millimetres">
            {(
              [
                ['top', 'Top margin (mm)'],
                ['bottom', 'Bottom margin (mm)'],
                ['left', 'Left margin (mm)'],
                ['right', 'Right margin (mm)'],
              ] as const
            ).map(([key, label]) => (
              <div className="pt-row" key={key}>
                <label className="pt-label" htmlFor={`pt-margin-${key}`}>
                  {label}
                </label>
                <input
                  id={`pt-margin-${key}`}
                  className="pt-input"
                  type="number"
                  inputMode="decimal"
                  step="0.1"
                  min="0"
                  value={marginDrafts[key]}
                  aria-invalid={errors.margins ? true : undefined}
                  aria-describedby={errors.margins ? 'pt-margins-error' : undefined}
                  onChange={(e) => handleMarginField(key, e.target.value)}
                />
              </div>
            ))}
          </div>
        )}
        {errors.margins && (
          <p className="pt-error" id="pt-margins-error" role="alert">
            {errors.margins}
          </p>
        )}
      </fieldset>

      {/* Typography */}
      <fieldset className="pt-group">
        <legend className="pt-group-title">Typography</legend>
        <div className="pt-row">
          <label className="pt-label" htmlFor="pt-font-family">
            Font family
          </label>
          <input
            id="pt-font-family"
            className="pt-input"
            type="text"
            list="pt-font-suggestions"
            value={fontFamilyDraft}
            aria-invalid={errors.typography ? true : undefined}
            onChange={(e) => handleFontFamily(e.target.value)}
          />
          <datalist id="pt-font-suggestions">
            {FONT_SUGGESTIONS.map((f) => (
              <option key={f} value={f} />
            ))}
          </datalist>
        </div>
        <div className="pt-row">
          <label className="pt-label" htmlFor="pt-base-size">
            Base font size (pt)
          </label>
          <input
            id="pt-base-size"
            className="pt-input pt-input-num"
            type="number"
            inputMode="decimal"
            step="0.5"
            min={FONT_SIZE_PT_RANGE.min}
            max={FONT_SIZE_PT_RANGE.max}
            value={baseSizeDraft}
            aria-invalid={errors.typography ? true : undefined}
            onChange={(e) => handleBaseSize(e.target.value)}
          />
        </div>
        <div className="pt-row">
          <label className="pt-label" htmlFor="pt-line-height">
            Line spacing
          </label>
          <input
            id="pt-line-height"
            className="pt-input pt-input-num"
            type="number"
            inputMode="decimal"
            step="0.1"
            min={LINE_HEIGHT_RANGE.min}
            max={LINE_HEIGHT_RANGE.max}
            value={lineHeightDraft}
            aria-invalid={errors.typography ? true : undefined}
            onChange={(e) => handleLineHeight(e.target.value)}
          />
        </div>
        <div className="pt-row">
          <label className="pt-label" htmlFor="pt-para-spacing">
            Paragraph spacing (pt)
          </label>
          <input
            id="pt-para-spacing"
            className="pt-input pt-input-num"
            type="number"
            inputMode="decimal"
            step="0.5"
            min={PARAGRAPH_SPACING_PT_RANGE.min}
            max={PARAGRAPH_SPACING_PT_RANGE.max}
            value={paraSpacingDraft}
            aria-invalid={errors.typography ? true : undefined}
            onChange={(e) => handleParaSpacing(e.target.value)}
          />
        </div>
        <div className="pt-row">
          <label className="pt-label" htmlFor="pt-fallbacks">
            Font fallbacks
          </label>
          <input
            id="pt-fallbacks"
            className="pt-input"
            type="text"
            value={fallbacksDraft}
            placeholder="e.g. Arial, sans-serif"
            aria-invalid={errors.typography ? true : undefined}
            aria-describedby="pt-fallbacks-hint"
            onChange={(e) => handleFallbacks(e.target.value)}
          />
        </div>
        <span className="pt-hint" id="pt-fallbacks-hint">
          Tried in order when the primary font is unavailable. Separate names with commas; leave
          empty for none.
        </span>
        <p className="pt-honest-note">
          Font behavior: documents store your chosen fonts, but the current renderer maps body text
          to standard PDF fonts (nothing is embedded). Registering fonts for exact PDF embedding is
          a later fidelity task (Phase 08) — identical cross-machine output is not guaranteed.
        </p>
        {errors.typography && (
          <p className="pt-error" role="alert">
            {errors.typography}
          </p>
        )}
      </fieldset>

      {/* Display header (§8.4) */}
      <fieldset className="pt-group">
        <legend className="pt-group-title">Body pages</legend>
        <div className="pt-checkbox-row">
          <input
            id="pt-display-header"
            className="pt-checkbox"
            type="checkbox"
            checked={pageTypography.displayHeader}
            disabled={frontPageEnabled}
            aria-describedby={frontPageEnabled ? 'pt-display-header-hint' : undefined}
            onChange={handleDisplayHeader}
          />
          <label className="pt-label" htmlFor="pt-display-header">
            Display header on body pages
          </label>
        </div>
        {frontPageEnabled && (
          <span className="pt-hint" id="pt-display-header-hint">
            Unavailable while the front page is enabled (front-page designer, Phase 04). Your
            stored choice is kept.
          </span>
        )}
        {errors.header && (
          <p className="pt-error" role="alert">
            {errors.header}
          </p>
        )}
      </fieldset>
    </div>
  );
};
