/**
 * DocStudio — Cover-theme registry (P04-M4)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * One typed entry per value of the authoritative `CoverThemeId` union,
 * keyed by theme id (`Record<CoverThemeId, CoverThemeDefinition>` — the
 * compiler rejects a missing or misspelled entry, and no fallback exists).
 *
 * Each entry pairs STABLE METADATA (display name, design intent from
 * project_details.md §7.3, a concise `structuralDesign` audit description,
 * honest implementation status) with a STRUCTURAL TOKEN composition
 * implementing that design.  The ten compositions are genuinely different
 * layouts — see `CoverLayoutStructure`; verify_p04_m4.mjs proves pairwise
 * structural distinctness across all 45 theme pairs by comparing non-colour
 * token leaves, and the rendered colour/monochrome galleries were
 * rasterized and visually inspected as recorded in the roadmap.
 *
 * @module services/cover-theme-registry
 */

import type { CoverThemeId } from '../types/document';
import type {
  CoverThemeDefinition,
  CoverThemeResolution,
  CoverThemeTokens,
} from './cover-theme-tokens';
import { applyCoverMonochrome } from './cover-theme-tokens';

function deepFreeze<T>(value: T): T {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    Object.values(value).forEach(deepFreeze);
  }
  return value;
}

// ─────────────────────────────────────────────────────────────────────────────
// Structural token compositions (one per theme)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Classic Formal — `centered-ornament`.
 * Centered title, traditional serif typography, restrained twin rules
 * above/below the title block, centered logo, centered 2-column metadata
 * pairs, frame ink inherited from the default frame settings.
 */
const CLASSIC_FORMAL: CoverThemeTokens = {
  structure: 'centered-ornament',
  metadataStyle: 'centered-pairs',
  metadataColumns: 2,
  logoPlacement: 'top-center',
  synopsisPlacement: 'below-subtitle',
  backgroundTreatment: 'none-optional-inset',
  decoration: [
    { kind: 'rule', placement: 'top', thicknessPt: 1 },
    { kind: 'rule', placement: 'bottom', thicknessPt: 1 },
  ],
  ornaments: {
    ruleCount: 2,
    bandHeightMmTop: 0,
    bandHeightMmBottom: 0,
    cornerBlockMm: 0,
    gridGutterMm: 0,
    splitRatio: 0,
    nestedInsetMm: 0,
    shapeCount: 0,
    headerTableRows: 0,
  },
  placementDefaults: {
    title: { align: 'center', band: 'middle' },
    subtitle: { align: 'center', band: 'middle' },
    organizationName: { align: 'center', band: 'top' },
  },
  typography: {
    title: { sizePt: 26, weight: 'bold', family: 'serif' },
    subtitle: { sizePt: 13, weight: 'normal', family: 'serif', italic: true },
    organization: { sizePt: 12, weight: 'normal', family: 'serif' },
    metadata: { sizePt: 9.5, weight: 'normal', family: 'serif' },
    synopsis: { sizePt: 10, weight: 'normal', family: 'serif', italic: true },
  },
  contentInsetMm: 22,
  palette: {
    pageBackground: '#ffffff',
    titleInk: '#1a1a2e',
    subtitleInk: '#333344',
    organizationInk: '#1a1a2e',
    accent: '#1a1a2e',
    secondaryAccent: '#4a4a6a',
    ruleInk: '#1a1a2e',
    metadataLabelInk: '#55556a',
    metadataValueInk: '#111111',
    mutedInk: '#777788',
    onBandInk: '#ffffff',
    overlayInk: 'rgba(255,255,255,0.72)',
    frameInk: '#1a1a2e',
  },
};

/**
 * Minimalist — `asymmetric-minimal`.
 * Generous whitespace: left-aligned title low on the page, a single tiny
 * top rule, one compact inline metadata baseline near the foot, quiet
 * sans typography, no ornament beyond a hairline.
 */
const MINIMALIST: CoverThemeTokens = {
  structure: 'asymmetric-minimal',
  metadataStyle: 'baseline-inline',
  metadataColumns: 1,
  logoPlacement: 'top-left',
  synopsisPlacement: 'lower-left',
  backgroundTreatment: 'quiet-inset',
  decoration: [{ kind: 'rule', placement: 'top', thicknessPt: 0.5 }],
  ornaments: {
    ruleCount: 1,
    bandHeightMmTop: 0,
    bandHeightMmBottom: 0,
    cornerBlockMm: 0,
    gridGutterMm: 0,
    splitRatio: 0,
    nestedInsetMm: 0,
    shapeCount: 0,
    headerTableRows: 0,
  },
  placementDefaults: {
    title: { align: 'left', band: 'middle' },
    subtitle: { align: 'left', band: 'middle' },
    organizationName: { align: 'left', band: 'top' },
  },
  typography: {
    title: { sizePt: 24, weight: 'normal', family: 'sans' },
    subtitle: { sizePt: 12, weight: 'normal', family: 'sans' },
    organization: { sizePt: 10, weight: 'normal', family: 'sans' },
    metadata: { sizePt: 8.5, weight: 'normal', family: 'sans' },
    synopsis: { sizePt: 10, weight: 'normal', family: 'sans' },
  },
  contentInsetMm: 28,
  palette: {
    pageBackground: '#ffffff',
    titleInk: '#111111',
    subtitleInk: '#555555',
    organizationInk: '#888888',
    accent: '#111111',
    secondaryAccent: '#dddddd',
    ruleInk: '#111111',
    metadataLabelInk: '#999999',
    metadataValueInk: '#333333',
    mutedInk: '#999999',
    onBandInk: '#ffffff',
    overlayInk: 'rgba(255,255,255,0.78)',
    frameInk: '#333333',
  },
};

/**
 * Corporate Band — `full-width-band`.
 * Strong dark top band carrying organization + logo (reversed ink), a
 * matching bottom band with a 3-column metadata row, left-aligned title
 * between the bands: clearly separated information zones.
 */
const CORPORATE_BAND: CoverThemeTokens = {
  structure: 'full-width-band',
  metadataStyle: 'band-row',
  metadataColumns: 3,
  logoPlacement: 'band-inside',
  synopsisPlacement: 'band-below',
  backgroundTreatment: 'band-fill',
  decoration: [
    { kind: 'band', placement: 'top', thicknessPt: 62 },
    { kind: 'band', placement: 'bottom', thicknessPt: 46 },
  ],
  ornaments: {
    ruleCount: 0,
    bandHeightMmTop: 22,
    bandHeightMmBottom: 16,
    cornerBlockMm: 0,
    gridGutterMm: 0,
    splitRatio: 0,
    nestedInsetMm: 0,
    shapeCount: 0,
    headerTableRows: 0,
  },
  placementDefaults: {
    title: { align: 'left', band: 'middle' },
    subtitle: { align: 'left', band: 'middle' },
    organizationName: { align: 'left', band: 'top' },
  },
  typography: {
    title: { sizePt: 24, weight: 'bold', family: 'sans' },
    subtitle: { sizePt: 12, weight: 'normal', family: 'sans' },
    organization: { sizePt: 12, weight: 'bold', family: 'sans' },
    metadata: { sizePt: 9, weight: 'normal', family: 'sans' },
    synopsis: { sizePt: 10, weight: 'normal', family: 'sans' },
  },
  contentInsetMm: 20,
  palette: {
    pageBackground: '#ffffff',
    titleInk: '#10233f',
    subtitleInk: '#33415c',
    organizationInk: '#ffffff',
    accent: '#1f3864',
    secondaryAccent: '#2f5597',
    ruleInk: '#2f5597',
    metadataLabelInk: '#b9c7e2',
    metadataValueInk: '#ffffff',
    mutedInk: '#5a6b8c',
    onBandInk: '#ffffff',
    overlayInk: 'rgba(16,35,63,0.55)',
    frameInk: '#1f3864',
  },
};

/**
 * Technical Grid — `sidebar-grid`.
 * Precise left sidebar carrying a vertical document-code strip, a bordered
 * metadata grid (3 columns of cells with gutters), top-left title above a
 * heavy rule: structured alignment throughout.
 */
const TECHNICAL_GRID: CoverThemeTokens = {
  structure: 'sidebar-grid',
  metadataStyle: 'grid-cells',
  metadataColumns: 3,
  logoPlacement: 'grid-corner',
  synopsisPlacement: 'grid-span',
  backgroundTreatment: 'grid-tile',
  decoration: [
    { kind: 'block', placement: 'left', thicknessPt: 40 },
    { kind: 'grid', placement: 'inset', thicknessPt: 0.75 },
    { kind: 'rule', placement: 'top', thicknessPt: 2 },
  ],
  ornaments: {
    ruleCount: 1,
    bandHeightMmTop: 0,
    bandHeightMmBottom: 0,
    cornerBlockMm: 0,
    gridGutterMm: 4,
    splitRatio: 0,
    nestedInsetMm: 0,
    shapeCount: 0,
    headerTableRows: 0,
  },
  placementDefaults: {
    title: { align: 'left', band: 'top' },
    subtitle: { align: 'left', band: 'top' },
    organizationName: { align: 'left', band: 'middle' },
  },
  typography: {
    title: { sizePt: 20, weight: 'bold', family: 'sans' },
    subtitle: { sizePt: 11, weight: 'normal', family: 'sans' },
    organization: { sizePt: 10, weight: 'normal', family: 'sans' },
    metadata: { sizePt: 8.5, weight: 'normal', family: 'sans' },
    synopsis: { sizePt: 9, weight: 'normal', family: 'sans' },
  },
  contentInsetMm: 18,
  palette: {
    pageBackground: '#ffffff',
    titleInk: '#0f2b46',
    subtitleInk: '#33506e',
    organizationInk: '#0f2b46',
    accent: '#0f4c5c',
    secondaryAccent: '#d7e3ea',
    ruleInk: '#0f2b46',
    metadataLabelInk: '#4a6b7a',
    metadataValueInk: '#10222e',
    mutedInk: '#6d8794',
    onBandInk: '#ffffff',
    overlayInk: 'rgba(215,227,234,0.7)',
    frameInk: '#0f4c5c',
  },
};

/**
 * Editorial Split — `split-vertical`.
 * Asymmetric vertical split: a colored left panel holds organization,
 * stacked metadata and synopsis; the wide right column carries the
 * left-anchored title block and a full-height split rule.
 */
const EDITORIAL_SPLIT: CoverThemeTokens = {
  structure: 'split-vertical',
  metadataStyle: 'stacked-panel',
  metadataColumns: 1,
  logoPlacement: 'panel-top',
  synopsisPlacement: 'panel-lower',
  backgroundTreatment: 'panel-fill',
  decoration: [
    { kind: 'band', placement: 'left', thicknessPt: 150 },
    { kind: 'rule', placement: 'left', thicknessPt: 1.5 },
  ],
  ornaments: {
    ruleCount: 1,
    bandHeightMmTop: 0,
    bandHeightMmBottom: 0,
    cornerBlockMm: 0,
    gridGutterMm: 0,
    splitRatio: 0.38,
    nestedInsetMm: 0,
    shapeCount: 0,
    headerTableRows: 0,
  },
  placementDefaults: {
    title: { align: 'left', band: 'middle' },
    subtitle: { align: 'left', band: 'middle' },
    organizationName: { align: 'left', band: 'top' },
  },
  typography: {
    title: { sizePt: 28, weight: 'bold', family: 'serif' },
    subtitle: { sizePt: 13, weight: 'normal', family: 'serif' },
    organization: { sizePt: 11, weight: 'bold', family: 'sans' },
    metadata: { sizePt: 9, weight: 'normal', family: 'sans' },
    synopsis: { sizePt: 9.5, weight: 'normal', family: 'sans' },
  },
  contentInsetMm: 20,
  palette: {
    pageBackground: '#ffffff',
    titleInk: '#231f20',
    subtitleInk: '#5b4a5f',
    organizationInk: '#ffffff',
    accent: '#6c3b5f',
    secondaryAccent: '#efe6ee',
    ruleInk: '#6c3b5f',
    metadataLabelInk: '#c9aec2',
    metadataValueInk: '#ffffff',
    mutedInk: '#8d7489',
    onBandInk: '#ffffff',
    overlayInk: 'rgba(108,59,95,0.5)',
    frameInk: '#6c3b5f',
  },
};

/**
 * Photographic Hero — `full-bleed-hero`.
 * Deliberate full-bleed background-image treatment with a dark bottom
 * scrim; title reversed out of the scrim, organization overlaid top-left,
 * metadata as a footer strip; without an image the scrim band still
 * defines the composition over a quiet gradient block.
 */
const PHOTOGRAPHIC_HERO: CoverThemeTokens = {
  structure: 'full-bleed-hero',
  metadataStyle: 'hero-footer-strip',
  metadataColumns: 3,
  logoPlacement: 'hero-overlay',
  synopsisPlacement: 'hero-bottom',
  backgroundTreatment: 'full-bleed-scrim',
  decoration: [
    { kind: 'band', placement: 'bottom', thicknessPt: 132 },
    { kind: 'shape', placement: 'full', thicknessPt: 0 },
  ],
  ornaments: {
    ruleCount: 0,
    bandHeightMmTop: 0,
    bandHeightMmBottom: 46,
    cornerBlockMm: 0,
    gridGutterMm: 0,
    splitRatio: 0,
    nestedInsetMm: 0,
    shapeCount: 1,
    headerTableRows: 0,
  },
  placementDefaults: {
    title: { align: 'left', band: 'bottom' },
    subtitle: { align: 'left', band: 'bottom' },
    organizationName: { align: 'left', band: 'top' },
  },
  typography: {
    title: { sizePt: 30, weight: 'bold', family: 'sans' },
    subtitle: { sizePt: 13, weight: 'normal', family: 'sans' },
    organization: { sizePt: 11, weight: 'bold', family: 'sans' },
    metadata: { sizePt: 9, weight: 'normal', family: 'sans' },
    synopsis: { sizePt: 9.5, weight: 'normal', family: 'sans' },
  },
  contentInsetMm: 18,
  palette: {
    pageBackground: '#e9e9ea',
    titleInk: '#ffffff',
    subtitleInk: '#e4e4e8',
    organizationInk: '#ffffff',
    accent: '#0e1420',
    secondaryAccent: '#28324a',
    ruleInk: '#ffffff',
    metadataLabelInk: '#a9b2c5',
    metadataValueInk: '#ffffff',
    mutedInk: '#8a92a6',
    onBandInk: '#ffffff',
    overlayInk: 'rgba(14,20,32,0.62)',
    frameInk: '#0e1420',
  },
};

/**
 * Institutional Frame — `nested-frame`.
 * A nested inner frame inside the user frame, centered logo at the frame
 * head, centered title block, and a bordered metadata block anchored at
 * the foot: formal, institutional alignment.
 */
const INSTITUTIONAL_FRAME: CoverThemeTokens = {
  structure: 'nested-frame',
  metadataStyle: 'framed-block',
  metadataColumns: 2,
  logoPlacement: 'frame-center',
  synopsisPlacement: 'frame-bottom',
  backgroundTreatment: 'frame-inset',
  decoration: [
    { kind: 'frame', placement: 'inset', thicknessPt: 0.75 },
    { kind: 'rule', placement: 'top', thicknessPt: 0.75 },
    { kind: 'block', placement: 'bottom', thicknessPt: 0.5 },
  ],
  ornaments: {
    ruleCount: 1,
    bandHeightMmTop: 0,
    bandHeightMmBottom: 0,
    cornerBlockMm: 0,
    gridGutterMm: 0,
    splitRatio: 0,
    nestedInsetMm: 6,
    shapeCount: 0,
    headerTableRows: 0,
  },
  placementDefaults: {
    title: { align: 'center', band: 'middle' },
    subtitle: { align: 'center', band: 'middle' },
    organizationName: { align: 'center', band: 'top' },
  },
  typography: {
    title: { sizePt: 22, weight: 'bold', family: 'serif' },
    subtitle: { sizePt: 12, weight: 'normal', family: 'serif', italic: true },
    organization: { sizePt: 11, weight: 'bold', family: 'serif' },
    metadata: { sizePt: 9, weight: 'normal', family: 'serif' },
    synopsis: { sizePt: 9.5, weight: 'normal', family: 'serif' },
  },
  contentInsetMm: 24,
  palette: {
    pageBackground: '#fbf9f4',
    titleInk: '#3d2f1c',
    subtitleInk: '#6b583c',
    organizationInk: '#3d2f1c',
    accent: '#7a6242',
    secondaryAccent: '#efe7d8',
    ruleInk: '#7a6242',
    metadataLabelInk: '#8d7a5e',
    metadataValueInk: '#2c2113',
    mutedInk: '#9c8a6d',
    onBandInk: '#ffffff',
    overlayInk: 'rgba(251,249,244,0.74)',
    frameInk: '#7a6242',
  },
};

/**
 * Geometric — `diagonal-geometry`.
 * Diagonal corner blocks and floating geometric shapes composed around a
 * left title block; metadata in two rule-separated columns; a full-width
 * accent strip behind the synopsis.
 */
const GEOMETRIC: CoverThemeTokens = {
  structure: 'diagonal-geometry',
  metadataStyle: 'column-pairs',
  metadataColumns: 2,
  logoPlacement: 'geometry-corner',
  synopsisPlacement: 'geometry-strip',
  backgroundTreatment: 'corner-accent',
  decoration: [
    { kind: 'shape', placement: 'corner', thicknessPt: 0 },
    { kind: 'shape', placement: 'corner', thicknessPt: 0 },
    { kind: 'rule', placement: 'bottom', thicknessPt: 3 },
  ],
  ornaments: {
    ruleCount: 1,
    bandHeightMmTop: 0,
    bandHeightMmBottom: 0,
    cornerBlockMm: 34,
    gridGutterMm: 0,
    splitRatio: 0,
    nestedInsetMm: 0,
    shapeCount: 3,
    headerTableRows: 0,
  },
  placementDefaults: {
    title: { align: 'left', band: 'middle' },
    subtitle: { align: 'left', band: 'middle' },
    organizationName: { align: 'right', band: 'top' },
  },
  typography: {
    title: { sizePt: 26, weight: 'bold', family: 'sans' },
    subtitle: { sizePt: 12, weight: 'normal', family: 'sans' },
    organization: { sizePt: 10, weight: 'bold', family: 'sans' },
    metadata: { sizePt: 9, weight: 'normal', family: 'sans' },
    synopsis: { sizePt: 9.5, weight: 'normal', family: 'sans' },
  },
  contentInsetMm: 20,
  palette: {
    pageBackground: '#ffffff',
    titleInk: '#0f4c5c',
    subtitleInk: '#3d6b78',
    organizationInk: '#0f4c5c',
    accent: '#0f4c5c',
    secondaryAccent: '#e3f0ef',
    ruleInk: '#12333b',
    metadataLabelInk: '#5e8791',
    metadataValueInk: '#0c2c34',
    mutedInk: '#7fa3ab',
    onBandInk: '#ffffff',
    overlayInk: 'rgba(227,240,239,0.72)',
    frameInk: '#12333b',
  },
};

/**
 * Scientific Publication — `journal-columns`.
 * Journal-like hierarchy: running head with journal rule, compact
 * title/author block, a boxed abstract region for the synopsis, and a
 * compact key-value metadata column — dense, formal, print-like.
 */
const SCIENTIFIC_PUBLICATION: CoverThemeTokens = {
  structure: 'journal-columns',
  metadataStyle: 'abstract-key-values',
  metadataColumns: 1,
  logoPlacement: 'journal-head',
  synopsisPlacement: 'abstract-box',
  backgroundTreatment: 'abstract-header',
  decoration: [
    { kind: 'rule', placement: 'top', thicknessPt: 1.25 },
    { kind: 'block', placement: 'inset', thicknessPt: 0.5 },
    { kind: 'rule', placement: 'bottom', thicknessPt: 0.75 },
  ],
  ornaments: {
    ruleCount: 2,
    bandHeightMmTop: 0,
    bandHeightMmBottom: 0,
    cornerBlockMm: 0,
    gridGutterMm: 0,
    splitRatio: 0,
    nestedInsetMm: 0,
    shapeCount: 0,
    headerTableRows: 0,
  },
  placementDefaults: {
    title: { align: 'left', band: 'top' },
    subtitle: { align: 'left', band: 'top' },
    organizationName: { align: 'left', band: 'middle' },
  },
  typography: {
    title: { sizePt: 18, weight: 'bold', family: 'serif' },
    subtitle: { sizePt: 10.5, weight: 'normal', family: 'serif', italic: true },
    organization: { sizePt: 9.5, weight: 'normal', family: 'serif' },
    metadata: { sizePt: 8.5, weight: 'normal', family: 'serif' },
    synopsis: { sizePt: 9.5, weight: 'normal', family: 'serif' },
  },
  contentInsetMm: 24,
  palette: {
    pageBackground: '#ffffff',
    titleInk: '#000000',
    subtitleInk: '#333333',
    organizationInk: '#222222',
    accent: '#333333',
    secondaryAccent: '#f0f0f0',
    ruleInk: '#000000',
    metadataLabelInk: '#555555',
    metadataValueInk: '#000000',
    mutedInk: '#666666',
    onBandInk: '#ffffff',
    overlayInk: 'rgba(255,255,255,0.76)',
    frameInk: '#333333',
  },
};

/**
 * Administrative Record — `table-dominant`.
 * Dense but ordered: a bordered document-control header table (3 rows of
 * key/value cells), left title beneath it, full-width bordered metadata
 * table below, and a boxed administrative note for the synopsis.
 */
const ADMINISTRATIVE_RECORD: CoverThemeTokens = {
  structure: 'table-dominant',
  metadataStyle: 'control-table',
  metadataColumns: 2,
  logoPlacement: 'record-head',
  synopsisPlacement: 'record-note',
  backgroundTreatment: 'record-header',
  decoration: [
    { kind: 'grid', placement: 'top', thicknessPt: 1 },
    { kind: 'grid', placement: 'inset', thicknessPt: 0.75 },
    { kind: 'block', placement: 'bottom', thicknessPt: 0.5 },
  ],
  ornaments: {
    ruleCount: 0,
    bandHeightMmTop: 0,
    bandHeightMmBottom: 0,
    cornerBlockMm: 0,
    gridGutterMm: 0,
    splitRatio: 0,
    nestedInsetMm: 0,
    shapeCount: 0,
    headerTableRows: 3,
  },
  placementDefaults: {
    title: { align: 'left', band: 'middle' },
    subtitle: { align: 'left', band: 'middle' },
    organizationName: { align: 'left', band: 'top' },
  },
  typography: {
    title: { sizePt: 21, weight: 'bold', family: 'sans' },
    subtitle: { sizePt: 11, weight: 'normal', family: 'sans' },
    organization: { sizePt: 10, weight: 'bold', family: 'sans' },
    metadata: { sizePt: 8.5, weight: 'normal', family: 'sans' },
    synopsis: { sizePt: 9, weight: 'normal', family: 'sans' },
  },
  contentInsetMm: 18,
  palette: {
    pageBackground: '#ffffff',
    titleInk: '#222222',
    subtitleInk: '#444444',
    organizationInk: '#222222',
    accent: '#444444',
    secondaryAccent: '#e8e8e8',
    ruleInk: '#222222',
    metadataLabelInk: '#555555',
    metadataValueInk: '#111111',
    mutedInk: '#777777',
    onBandInk: '#ffffff',
    overlayInk: 'rgba(232,232,232,0.72)',
    frameInk: '#444444',
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// Registry
// ─────────────────────────────────────────────────────────────────────────────

export const COVER_THEME_REGISTRY: Record<CoverThemeId, CoverThemeDefinition> = {
  'classic-formal': {
    metadata: {
      id: 'classic-formal',
      displayName: 'Classic Formal',
      intent: 'Centered title, traditional typography and restrained rules.',
      structuralDesign:
        'Centered composition: serif title block between twin 1 pt rules, centered logo at the head, organization line above the title, synopsis below the subtitle, centered 2-column label/value metadata pairs near the foot, and a quiet formal palette.',
      implementationStatus: 'composition-verified',
    },
    tokens: CLASSIC_FORMAL,
  },
  minimalist: {
    metadata: {
      id: 'minimalist',
      displayName: 'Minimalist',
      intent: 'Generous whitespace, quiet hierarchy and minimal decoration.',
      structuralDesign:
        'Whitespace-led composition: small top-left logo, one 0.5 pt hairline, a left-anchored regular-weight sans title low on the page, synopsis at the lower left, and a single compact inline metadata baseline near the foot — the only one-rule, no-band theme.',
      implementationStatus: 'composition-verified',
    },
    tokens: MINIMALIST,
  },
  'corporate-band': {
    metadata: {
      id: 'corporate-band',
      displayName: 'Corporate Band',
      intent: 'Strong horizontal bands and clearly separated information zones.',
      structuralDesign:
        'Banded composition: full-width dark top band (organization + logo reversed) and matching bottom band containing a 3-column metadata row, with a bold left-aligned title and synopsis in the open middle zone between the bands.',
      implementationStatus: 'composition-verified',
    },
    tokens: CORPORATE_BAND,
  },
  'technical-grid': {
    metadata: {
      id: 'technical-grid',
      displayName: 'Technical Grid',
      intent: 'Precise alignment and a structured metadata/document-code grid.',
      structuralDesign:
        'Grid composition: full-height left sidebar block, top-left title above a heavy 2 pt rule, organization in the middle zone, a 3-column bordered metadata cell grid with 4 mm gutters, synopsis spanning the grid width, and corner-grid logo placement.',
      implementationStatus: 'composition-verified',
    },
    tokens: TECHNICAL_GRID,
  },
  'editorial-split': {
    metadata: {
      id: 'editorial-split',
      displayName: 'Editorial Split',
      intent: 'Asymmetrical or split-column title and information layout.',
      structuralDesign:
        'Split composition: colored left panel (38% width) holding logo, organization, stacked metadata and synopsis in reversed ink; wide right column carries a large serif title and subtitle left-anchored mid-page; a 1.5 pt rule marks the split.',
      implementationStatus: 'composition-verified',
    },
    tokens: EDITORIAL_SPLIT,
  },
  'photographic-hero': {
    metadata: {
      id: 'photographic-hero',
      displayName: 'Photographic Hero',
      intent: 'Deliberate background-image treatment with readable foreground contrast.',
      structuralDesign:
        'Hero composition: full-bleed background image (or quiet fallback block) under a dark bottom scrim band; bold reversed title and subtitle inside the scrim, organization + logo overlaid top-left, and a 3-column metadata footer strip below the title zone.',
      implementationStatus: 'composition-verified',
    },
    tokens: PHOTOGRAPHIC_HERO,
  },
  'institutional-frame': {
    metadata: {
      id: 'institutional-frame',
      displayName: 'Institutional Frame',
      intent: 'Structured border, formal logo placement and metadata alignment.',
      structuralDesign:
        'Framed composition: nested 0.75 pt inner frame inside the user frame, centered logo at the frame head above a hairline, centered serif title block mid-frame, synopsis at the frame foot, and a bordered 2-column metadata block anchored at the bottom.',
      implementationStatus: 'composition-verified',
    },
    tokens: INSTITUTIONAL_FRAME,
  },
  geometric: {
    metadata: {
      id: 'geometric',
      displayName: 'Geometric',
      intent: 'Geometric shapes, rules and carefully composed layout regions.',
      structuralDesign:
        'Geometric composition: large top-left and secondary corner blocks (34 mm), floating accent shapes, right-anchored organization line, left title block mid-page, metadata in two rule-separated columns, and a synopsis strip over a 3 pt full-width accent rule.',
      implementationStatus: 'composition-verified',
    },
    tokens: GEOMETRIC,
  },
  'scientific-publication': {
    metadata: {
      id: 'scientific-publication',
      displayName: 'Scientific Publication',
      intent: 'Journal-like hierarchy, compact metadata and abstract region.',
      structuralDesign:
        'Journal composition: running head with logo right and a 1.25 pt journal rule, compact top-left title with italic subtitle, organization/author line, a bordered abstract box for the synopsis, and a compact single-column key/value metadata list.',
      implementationStatus: 'composition-verified',
    },
    tokens: SCIENTIFIC_PUBLICATION,
  },
  'administrative-record': {
    metadata: {
      id: 'administrative-record',
      displayName: 'Administrative Record',
      intent: 'Dense but ordered layout for procedures and administrative documents.',
      structuralDesign:
        'Record composition: bordered 3-row document-control header table at the top with logo right, left title and subtitle beneath, a full-width bordered 2-column metadata control table, and a boxed administrative note region for the synopsis.',
      implementationStatus: 'composition-verified',
    },
    tokens: ADMINISTRATIVE_RECORD,
  },
};

Object.values(COVER_THEME_REGISTRY).forEach(deepFreeze);
Object.freeze(COVER_THEME_REGISTRY);

/** The ten authoritative cover ids, in registry order. */
export const COVER_THEME_IDS: readonly CoverThemeId[] = Object.freeze(
  Object.keys(COVER_THEME_REGISTRY) as CoverThemeId[],
);

/** Runtime guard against unknown ids (rejects before the resolver throws). */
export function isCoverThemeId(value: unknown): value is CoverThemeId {
  return (
    typeof value === 'string' && Object.prototype.hasOwnProperty.call(COVER_THEME_REGISTRY, value)
  );
}

/**
 * Resolve a cover theme to renderer tokens — the single call site the
 * cover renderer and gallery use.  Deterministic and non-mutating; throws
 * on an unknown id (no silent fallback theme).  Monochrome rewrites ONLY
 * palette inks; every structural token is preserved exactly.
 */
export function resolveCoverTheme(
  themeId: CoverThemeId,
  options: { monochrome: boolean },
): CoverThemeResolution {
  const entry = COVER_THEME_REGISTRY[themeId];
  if (!entry) {
    throw new Error(`Unknown cover theme id: ${String(themeId)}`);
  }
  if (typeof options?.monochrome !== 'boolean') {
    // Explicit contract: callers must pass a real boolean — a silent
    // truthiness coercion would make monochrome output unpredictable.
    throw new Error('resolveCoverTheme requires options.monochrome to be a boolean.');
  }
  return {
    themeId,
    monochrome: options.monochrome,
    tokens: options.monochrome
      ? { ...entry.tokens, palette: applyCoverMonochrome(entry.tokens.palette) }
      : entry.tokens,
  };
}
