import React, { useEffect, useState } from 'react';
import type {
  CoverElementPlacement,
  CoverFrameSettings,
  CoverThemeId,
  CoverTextAlign,
  CoverVerticalBand,
  CoverVisibleMetadataField,
  CustomMetadataField,
  FrontPageSettings,
  AssetRecord,
} from '../../types/document';
import {
  FRAME_CORNER_RADIUS_MM_RANGE,
  FRAME_INSET_MM_RANGE,
  FRAME_THICKNESS_PT_RANGE,
  LOGO_WIDTH_MM_RANGE,
  SYNOPSIS_MAX_LENGTH,
  type CoverPlacementElement,
  type FrontPagePatch,
  type FrontPageUpdateResult,
} from '../../services/front-page';
import { COVER_THEME_IDS, COVER_THEME_REGISTRY } from '../../services/cover-theme-registry';
import { METADATA_FIELD_SPECS } from '../../services/metadata-fields';
import { parseNumberDraft } from '../../services/page-typography';
import { SUPPORTED_IMPORT_FORMAT_LABEL } from '../../services/image-import';
import './FrontPagePanel.css';

/**
 * Front Page / Cover Designer panel (P04-M4).
 *
 * Functional, accessible controls bound DIRECTLY to the authoritative
 * `document.frontPage` — there is no second settings model.  Every control
 * dispatches a patch through the pure `services/front-page.ts` rules; a
 * rejected patch shows an understandable inline error and commits nothing.
 * Text/number inputs hold a local draft so half-typed values are never
 * written to the document; drafts re-sync when the authoritative value
 * changes externally (open, reset, duplicate).
 *
 * Independence rules made visible here:
 * • The cover theme and cover monochrome controls NEVER touch the body
 *   theme or the application interface theme (§7.1/§8.3 separation).
 * • The §8.4 display-header rule lives in `updateDisplayHeader`
 *   (page-typography.ts); this panel only explains it while enabled.
 *
 * Image handling: selection opens the native picker through the App-level
 * handler (cancellation is a true no-op), the bytes are embedded into the
 * document asset bundle, and an external absolute path is never stored.
 */
interface FrontPagePanelProps {
  /** Authoritative `document.frontPage`. */
  frontPage: FrontPageSettings;
  /** Authoritative custom metadata fields (labels for `custom:<id>` entries). */
  customFields: readonly CustomMetadataField[];
  /** Authoritative asset bundle (logo/background filename display). */
  assets: Record<string, AssetRecord>;
  /** Commit a front-page patch; returns the pure-service result. */
  onFrontPageChange: (patch: FrontPagePatch) => FrontPageUpdateResult;
  /** Open the native image picker and embed the bytes (async; cancel = no-op). */
  onCoverImageSelect: (target: 'logo' | 'background') => Promise<FrontPageUpdateResult>;
  /** Clear a cover image reference and prune the orphan when safe. */
  onCoverImageRemove: (target: 'logo' | 'background') => FrontPageUpdateResult;
}

/** Scalar metadata keys offered on the cover, with registry labels. */
const SCALAR_OPTIONS: ReadonlyArray<{ id: CoverVisibleMetadataField; label: string }> = [
  ...METADATA_FIELD_SPECS.map((spec) => ({ id: spec.key, label: spec.label })),
  { id: 'createdAt', label: 'Created date' },
  { id: 'modifiedAt', label: 'Modified date' },
];

const DEFAULT_OPTION = '__theme_default__';

const ALIGN_LABELS: Record<CoverTextAlign, string> = {
  left: 'Left',
  center: 'Center',
  right: 'Right',
};
const BAND_LABELS: Record<CoverVerticalBand, string> = {
  top: 'Top',
  middle: 'Middle',
  bottom: 'Bottom',
};

type GroupKey =
  | 'cover'
  | 'theme'
  | 'placement'
  | 'metadata'
  | 'synopsis'
  | 'logo'
  | 'background'
  | 'frame';

type GroupErrors = Partial<Record<GroupKey, string>>;

const rangeHint = (r: { min: number; max: number }, unit: string): string =>
  `${r.min}–${r.max} ${unit}`;

export const FrontPagePanel: React.FC<FrontPagePanelProps> = ({
  frontPage,
  customFields,
  assets,
  onFrontPageChange,
  onCoverImageSelect,
  onCoverImageRemove,
}) => {
  // ── Local drafts for text/number inputs ──────────────────────────────────
  const [synopsisDraft, setSynopsisDraft] = useState(frontPage.synopsis ?? '');
  const [logoWidthDraft, setLogoWidthDraft] = useState(
    String(frontPage.logoWidthMm ?? 25),
  );
  const [frameThicknessDraft, setFrameThicknessDraft] = useState(
    String(frontPage.frame.thicknessPt),
  );
  const [frameRadiusDraft, setFrameRadiusDraft] = useState(
    String(frontPage.frame.cornerRadiusMm),
  );
  const [frameInsetDraft, setFrameInsetDraft] = useState(String(frontPage.frame.insetMm));
  const [frameColorDraft, setFrameColorDraft] = useState(frontPage.frame.color);
  const [errors, setErrors] = useState<GroupErrors>({});
  const [imageBusy, setImageBusy] = useState<'logo' | 'background' | null>(null);

  // Re-sync each draft when ITS authoritative value changes externally
  // (open, reset, duplicate).  An in-progress invalid draft is never
  // clobbered by unrelated document changes.
  useEffect(() => {
    setSynopsisDraft(frontPage.synopsis ?? '');
  }, [frontPage.synopsis]);
  useEffect(() => {
    setLogoWidthDraft(String(frontPage.logoWidthMm ?? 25));
  }, [frontPage.logoWidthMm]);
  useEffect(() => {
    setFrameThicknessDraft(String(frontPage.frame.thicknessPt));
  }, [frontPage.frame.thicknessPt]);
  useEffect(() => {
    setFrameRadiusDraft(String(frontPage.frame.cornerRadiusMm));
  }, [frontPage.frame.cornerRadiusMm]);
  useEffect(() => {
    setFrameInsetDraft(String(frontPage.frame.insetMm));
  }, [frontPage.frame.insetMm]);
  useEffect(() => {
    setFrameColorDraft(frontPage.frame.color);
  }, [frontPage.frame.color]);

  const report = (group: GroupKey, result: FrontPageUpdateResult): boolean => {
    if (result.ok) {
      setErrors((prev) => ({ ...prev, [group]: undefined }));
      return true;
    }
    setErrors((prev) => ({ ...prev, [group]: result.message }));
    return false;
  };

  const themeDefaults = COVER_THEME_REGISTRY[frontPage.themeId].tokens.placementDefaults;

  // ── Cover page ──────────────────────────────────────────────────────────
  const handleEnabled = (e: React.ChangeEvent<HTMLInputElement>) =>
    report('cover', onFrontPageChange({ field: 'enabled', value: e.target.checked }));

  // ── Cover theme + monochrome ────────────────────────────────────────────
  const handleTheme = (e: React.ChangeEvent<HTMLSelectElement>) =>
    report('theme', onFrontPageChange({ field: 'themeId', value: e.target.value as CoverThemeId }));
  const handleMonochrome = (e: React.ChangeEvent<HTMLInputElement>) =>
    report('theme', onFrontPageChange({ field: 'monochrome', value: e.target.checked }));

  // ── Placement (per-element align + band; "theme default" removes) ───────
  const commitPlacement = (
    element: CoverPlacementElement,
    next: CoverElementPlacement | undefined,
  ) => report('placement', onFrontPageChange({ field: 'placement', element, value: next }));

  const handlePlacement = (
    element: CoverPlacementElement,
    half: 'align' | 'band',
    raw: string,
  ) => {
    const current = frontPage.placement?.[element];
    if (raw === DEFAULT_OPTION) {
      // Choosing "Theme default" on either half reverts the WHOLE element
      // to the cover theme's own placement (documented in the hint).
      commitPlacement(element, undefined);
      return;
    }
    const def = themeDefaults[element];
    const next: CoverElementPlacement = current
      ? { ...current, [half]: raw }
      : half === 'align'
        ? { align: raw as CoverTextAlign, band: def.band }
        : { align: def.align, band: raw as CoverVerticalBand };
    // A stored override equal to the theme default on BOTH halves is
    // meaningless — remove it so "no override" stays the single truth.
    if (next.align === def.align && next.band === def.band) {
      commitPlacement(element, undefined);
      return;
    }
    commitPlacement(element, next);
  };

  // ── Visible metadata (order-preserving selection) ───────────────────────
  const scalarIds = new Set(SCALAR_OPTIONS.map((o) => o.id));
  const knownIds = new Set<string>([
    ...scalarIds,
    ...customFields.map((f) => `custom:${f.id}`),
  ]);
  const selected = frontPage.visibleFields;

  const toggleField = (id: CoverVisibleMetadataField, checked: boolean) => {
    if (checked) {
      if (selected.includes(id)) return;
      // Order-preserving: already-selected entries keep their positions;
      // a newly selected field is APPENDED after them.
      report('metadata', onFrontPageChange({ field: 'visibleFields', value: [...selected, id] }));
    } else {
      report(
        'metadata',
        onFrontPageChange({ field: 'visibleFields', value: selected.filter((f) => f !== id) }),
      );
    }
  };

  const fieldLabel = (id: CoverVisibleMetadataField): string => {
    if (id.startsWith('custom:')) {
      const fid = id.slice('custom:'.length);
      return customFields.find((f) => f.id === fid)?.label || 'Custom field';
    }
    return SCALAR_OPTIONS.find((o) => o.id === id)?.label ?? id;
  };

  // Selected entries the option list can no longer show (custom field was
  // removed) stay in the document — surfaced here instead of silently lost.
  const danglingSelected = selected.filter((id) => !knownIds.has(id));

  // ── Synopsis ────────────────────────────────────────────────────────────
  const handleSynopsis = (value: string) => {
    setSynopsisDraft(value);
    report('synopsis', onFrontPageChange({ field: 'synopsis', value }));
  };

  // ── Logo / background images ────────────────────────────────────────────
  const handleImageSelect = async (target: 'logo' | 'background') => {
    setImageBusy(target);
    try {
      report(target, await onCoverImageSelect(target));
    } finally {
      setImageBusy(null);
    }
  };
  const handleImageRemove = (target: 'logo' | 'background') =>
    report(target, onCoverImageRemove(target));

  const handleLogoWidth = (raw: string) => {
    setLogoWidthDraft(raw);
    const n = parseNumberDraft(raw);
    report('logo', onFrontPageChange({ field: 'logoWidthMm', value: n }));
  };

  // ── Frame ───────────────────────────────────────────────────────────────
  const commitFrame = (value: Partial<CoverFrameSettings>) =>
    report('frame', onFrontPageChange({ field: 'frame', value }));
  const handleFrameVisible = (e: React.ChangeEvent<HTMLInputElement>) =>
    commitFrame({ visible: e.target.checked });
  const handleFrameStyle = (e: React.ChangeEvent<HTMLSelectElement>) =>
    commitFrame({ style: e.target.value as CoverFrameSettings['style'] });
  const handleFrameThickness = (raw: string) => {
    setFrameThicknessDraft(raw);
    commitFrame({ thicknessPt: parseNumberDraft(raw) });
  };
  const handleFrameRadius = (raw: string) => {
    setFrameRadiusDraft(raw);
    commitFrame({ cornerRadiusMm: parseNumberDraft(raw) });
  };
  const handleFrameInset = (raw: string) => {
    setFrameInsetDraft(raw);
    commitFrame({ insetMm: parseNumberDraft(raw) });
  };
  const handleFrameColor = (raw: string) => {
    setFrameColorDraft(raw);
    commitFrame({ color: raw.trim() });
  };

  const logoAsset = frontPage.logoAssetId ? assets[frontPage.logoAssetId] : undefined;
  const backgroundAsset = frontPage.backgroundImageAssetId
    ? assets[frontPage.backgroundImageAssetId]
    : undefined;

  const imageRow = (
    target: 'logo' | 'background',
    asset: AssetRecord | undefined,
    storedId: string | undefined,
    error: string | undefined,
    hint: string,
  ) => (
    <>
      <div className="fp-file-row">
        <span className="fp-file-name">
          {storedId
            ? asset
              ? asset.filename
              : '(missing asset record)'
            : 'None selected'}
        </span>
        <div className="fp-file-actions">
          <button
            type="button"
            className="fp-btn"
            disabled={imageBusy !== null}
            onClick={() => void handleImageSelect(target)}
          >
            {imageBusy === target ? 'Opening…' : 'Choose…'}
          </button>
          <button
            type="button"
            className="fp-btn"
            disabled={!storedId || imageBusy !== null}
            onClick={() => handleImageRemove(target)}
          >
            Remove
          </button>
        </div>
      </div>
      <span className="fp-hint">{hint}</span>
      {error && (
        <p className="fp-error" role="alert">
          {error}
        </p>
      )}
    </>
  );

  const placementRow = (element: CoverPlacementElement, labelText: string) => {
    const override = frontPage.placement?.[element];
    const def = themeDefaults[element];
    return (
      <div className="fp-place-row" key={element}>
        <span className="fp-place-label">{labelText}</span>
        <select
          className="fp-select"
          aria-label={`${labelText} alignment`}
          value={override ? override.align : DEFAULT_OPTION}
          onChange={(e) => handlePlacement(element, 'align', e.target.value)}
        >
          <option value={DEFAULT_OPTION}>Theme default ({ALIGN_LABELS[def.align]})</option>
          {(['left', 'center', 'right'] as CoverTextAlign[]).map((a) => (
            <option key={a} value={a}>
              {ALIGN_LABELS[a]}
            </option>
          ))}
        </select>
        <select
          className="fp-select"
          aria-label={`${labelText} position`}
          value={override ? override.band : DEFAULT_OPTION}
          onChange={(e) => handlePlacement(element, 'band', e.target.value)}
        >
          <option value={DEFAULT_OPTION}>Theme default ({BAND_LABELS[def.band]})</option>
          {(['top', 'middle', 'bottom'] as CoverVerticalBand[]).map((b) => (
            <option key={b} value={b}>
              {BAND_LABELS[b]}
            </option>
          ))}
        </select>
      </div>
    );
  };

  return (
    <div className="fp-form" role="group" aria-label="Front page cover designer">
      {/* Cover page on/off */}
      <fieldset className="fp-group">
        <legend className="fp-group-title">Cover page</legend>
        <div className="fp-checkbox-row">
          <input
            id="fp-enabled"
            className="fp-checkbox"
            type="checkbox"
            checked={frontPage.enabled}
            aria-invalid={errors.cover ? true : undefined}
            aria-describedby="fp-enabled-hint"
            onChange={handleEnabled}
          />
          <label className="fp-label" htmlFor="fp-enabled">
            Include a front page (cover)
          </label>
        </div>
        <span className="fp-hint" id="fp-enabled-hint">
          {frontPage.enabled
            ? 'The cover renders as page 1. Header display on body pages is unavailable while the cover is on (§8.4) — your stored choice is kept.'
            : 'Off keeps every cover setting and image below stored in the document; only the cover page disappears from the output.'}
        </span>
        {errors.cover && (
          <p className="fp-error" role="alert">
            {errors.cover}
          </p>
        )}
      </fieldset>

      {/* Cover theme + monochrome */}
      <fieldset className="fp-group">
        <legend className="fp-group-title">Cover theme</legend>
        <div className="fp-row">
          <label className="fp-label" htmlFor="fp-theme">
            Layout theme
          </label>
          <select
            id="fp-theme"
            className="fp-select"
            value={frontPage.themeId}
            aria-invalid={errors.theme ? true : undefined}
            aria-describedby="fp-theme-desc"
            onChange={handleTheme}
          >
            {COVER_THEME_IDS.map((id) => (
              <option key={id} value={id}>
                {COVER_THEME_REGISTRY[id].metadata.displayName}
              </option>
            ))}
          </select>
        </div>
        <span className="fp-hint" id="fp-theme-desc">
          {COVER_THEME_REGISTRY[frontPage.themeId].metadata.intent}
        </span>
        <span className="fp-hint">
          {COVER_THEME_REGISTRY[frontPage.themeId].metadata.structuralDesign}
        </span>
        <div className="fp-checkbox-row">
          <input
            id="fp-monochrome"
            className="fp-checkbox"
            type="checkbox"
            checked={frontPage.monochrome}
            aria-invalid={errors.theme ? true : undefined}
            aria-describedby="fp-monochrome-hint"
            onChange={handleMonochrome}
          />
          <label className="fp-label" htmlFor="fp-monochrome">
            Monochrome cover
          </label>
        </div>
        <span className="fp-hint" id="fp-monochrome-hint">
          Converts the cover's accent inks to grayscale while keeping structure. Independent of
          the body-theme monochrome setting and of the application interface theme.
        </span>
        {errors.theme && (
          <p className="fp-error" role="alert">
            {errors.theme}
          </p>
        )}
      </fieldset>

      {/* Principal-element placement (§7.1) */}
      <fieldset className="fp-group">
        <legend className="fp-group-title">Title block placement</legend>
        <span className="fp-hint">
          Overrides apply to this cover theme; “Theme default” follows the selected theme's own
          composition (each half reverts the element when chosen).
        </span>
        {placementRow('title', 'Title')}
        {placementRow('subtitle', 'Subtitle')}
        {placementRow('organizationName', 'Organization')}
        {errors.placement && (
          <p className="fp-error" role="alert">
            {errors.placement}
          </p>
        )}
      </fieldset>

      {/* Visible metadata (order-preserving) */}
      <fieldset className="fp-group">
        <legend className="fp-group-title">Visible metadata</legend>
        <span className="fp-hint">
          Fields appear on the cover in this order: {selected.map(fieldLabel).join(' → ') || '(none)'}
        </span>
        <div className="fp-checklist">
          {SCALAR_OPTIONS.map((opt) => (
            <div className="fp-checkbox-row" key={opt.id}>
              <input
                id={`fp-field-${opt.id}`}
                className="fp-checkbox"
                type="checkbox"
                checked={selected.includes(opt.id)}
                onChange={(e) => toggleField(opt.id, e.target.checked)}
              />
              <label className="fp-label" htmlFor={`fp-field-${opt.id}`}>
                {opt.label}
              </label>
            </div>
          ))}
          {customFields.map((f) => (
            <div className="fp-checkbox-row" key={f.id}>
              <input
                id={`fp-field-custom-${f.id}`}
                className="fp-checkbox"
                type="checkbox"
                checked={selected.includes(`custom:${f.id}`)}
                onChange={(e) => toggleField(`custom:${f.id}`, e.target.checked)}
              />
              <label className="fp-label" htmlFor={`fp-field-custom-${f.id}`}>
                {f.label || 'Custom field'}
              </label>
            </div>
          ))}
        </div>
        {danglingSelected.length > 0 && (
          <span className="fp-hint">
            Selected but unavailable (field removed): {danglingSelected.join(', ')}. It renders
            nothing; re-selecting after recreation restores it.
          </span>
        )}
        <span className="fp-hint">
          Empty metadata values are never shown — the cover skips them instead of inventing
          placeholders.
        </span>
        {errors.metadata && (
          <p className="fp-error" role="alert">
            {errors.metadata}
          </p>
        )}
      </fieldset>

      {/* Synopsis */}
      <fieldset className="fp-group">
        <legend className="fp-group-title">Synopsis</legend>
        <div className="fp-row">
          <label className="fp-label" htmlFor="fp-synopsis">
            Additional text (shown under the subtitle / abstract region)
          </label>
          <textarea
            id="fp-synopsis"
            className="fp-textarea"
            rows={4}
            maxLength={SYNOPSIS_MAX_LENGTH}
            value={synopsisDraft}
            aria-invalid={errors.synopsis ? true : undefined}
            onChange={(e) => handleSynopsis(e.target.value)}
          />
          <span className="fp-hint">
            {synopsisDraft.length} / {SYNOPSIS_MAX_LENGTH} characters. Leave empty for none.
          </span>
        </div>
        {errors.synopsis && (
          <p className="fp-error" role="alert">
            {errors.synopsis}
          </p>
        )}
      </fieldset>

      {/* Logo */}
      <fieldset className="fp-group">
        <legend className="fp-group-title">Logo</legend>
        {imageRow(
          'logo',
          logoAsset,
          frontPage.logoAssetId,
          errors.logo,
          `The image bytes are embedded inside the document — no external file path is stored. ${SUPPORTED_IMPORT_FORMAT_LABEL} only (the renderer's actual decoders).`,
        )}
        <div className="fp-row">
          <label className="fp-label" htmlFor="fp-logo-width">
            Logo width (mm)
          </label>
          <input
            id="fp-logo-width"
            className="fp-input fp-input-num"
            inputMode="decimal"
            value={logoWidthDraft}
            disabled={!frontPage.logoAssetId}
            aria-invalid={errors.logo ? true : undefined}
            aria-describedby="fp-logo-width-hint"
            onChange={(e) => handleLogoWidth(e.target.value)}
          />
          <span className="fp-hint" id="fp-logo-width-hint">
            {rangeHint(LOGO_WIDTH_MM_RANGE, 'mm')}; capped to the cover's content width at
            render time.
          </span>
        </div>
      </fieldset>

      {/* Background / hero image */}
      <fieldset className="fp-group">
        <legend className="fp-group-title">Background image</legend>
        {imageRow(
          'background',
          backgroundAsset,
          frontPage.backgroundImageAssetId,
          errors.background,
          'Used as the cover’s hero/background layer; the theme draws a contrast scrim so text stays readable. Original image bytes are never modified.',
        )}
      </fieldset>

      {/* Frame */}
      <fieldset className="fp-group">
        <legend className="fp-group-title">Cover frame</legend>
        <div className="fp-checkbox-row">
          <input
            id="fp-frame-visible"
            className="fp-checkbox"
            type="checkbox"
            checked={frontPage.frame.visible}
            onChange={handleFrameVisible}
          />
          <label className="fp-label" htmlFor="fp-frame-visible">
            Draw frame on the cover
          </label>
        </div>
        <div className="fp-row">
          <label className="fp-label" htmlFor="fp-frame-style">
            Border style
          </label>
          <select
            id="fp-frame-style"
            className="fp-select"
            value={frontPage.frame.style}
            disabled={!frontPage.frame.visible}
            onChange={handleFrameStyle}
          >
            <option value="none">None</option>
            <option value="solid">Solid</option>
            <option value="double">Double (two nested lines)</option>
            <option value="dashed">Dashed</option>
            <option value="dotted">Dotted</option>
          </select>
        </div>
        <div className="fp-grid2">
          <div className="fp-row">
            <label className="fp-label" htmlFor="fp-frame-thickness">
              Thickness (pt)
            </label>
            <input
              id="fp-frame-thickness"
              className="fp-input fp-input-num"
              inputMode="decimal"
              value={frameThicknessDraft}
              disabled={!frontPage.frame.visible}
              aria-invalid={errors.frame ? true : undefined}
              onChange={(e) => handleFrameThickness(e.target.value)}
            />
          </div>
          <div className="fp-row">
            <label className="fp-label" htmlFor="fp-frame-radius">
              Corner radius (mm)
            </label>
            <input
              id="fp-frame-radius"
              className="fp-input fp-input-num"
              inputMode="decimal"
              value={frameRadiusDraft}
              disabled={!frontPage.frame.visible}
              aria-invalid={errors.frame ? true : undefined}
              onChange={(e) => handleFrameRadius(e.target.value)}
            />
          </div>
          <div className="fp-row">
            <label className="fp-label" htmlFor="fp-frame-inset">
              Inset from page edge (mm)
            </label>
            <input
              id="fp-frame-inset"
              className="fp-input fp-input-num"
              inputMode="decimal"
              value={frameInsetDraft}
              disabled={!frontPage.frame.visible}
              aria-invalid={errors.frame ? true : undefined}
              onChange={(e) => handleFrameInset(e.target.value)}
            />
          </div>
          <div className="fp-row">
            <label className="fp-label" htmlFor="fp-frame-color">
              Colour (hex or rgb/rgba)
            </label>
            <input
              id="fp-frame-color"
              className="fp-input fp-input-num"
              value={frameColorDraft}
              disabled={!frontPage.frame.visible}
              aria-invalid={errors.frame ? true : undefined}
              onChange={(e) => handleFrameColor(e.target.value)}
            />
          </div>
        </div>
        <span className="fp-hint">
          Valid ranges: thickness {rangeHint(FRAME_THICKNESS_PT_RANGE, 'pt')}, radius{' '}
          {rangeHint(FRAME_CORNER_RADIUS_MM_RANGE, 'mm')}, inset{' '}
          {rangeHint(FRAME_INSET_MM_RANGE, 'mm')}. Invalid values are rejected with an error —
          never silently coerced.
        </span>
        <span className="fp-hint">
          Renderer note: double is drawn as two nested solid lines (the engine has no native
          double style); dash patterns are engine-defined.
        </span>
        {errors.frame && (
          <p className="fp-error" role="alert">
            {errors.frame}
          </p>
        )}
      </fieldset>
    </div>
  );
};
