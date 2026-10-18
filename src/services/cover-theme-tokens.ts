/**
 * DocStudio — Cover-theme token contract and resolver (P04-M4)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * The typed token contract for the ten cover/front-page themes
 * (project_details.md §7.3), mirroring the established body-theme
 * architecture (DEC-005): a registry entry pairs STABLE METADATA with a
 * STRUCTURAL token composition; a pure, deterministic resolver turns a
 * theme id + monochrome flag into the tokens the cover renderer consumes.
 *
 * STRUCTURAL CONTRACT — every token that shapes composition is separate
 * from palette ink, so "monochrome" can convert colours WITHOUT touching
 * layout, and the verification suite can prove pairwise structural
 * distinctness of all ten themes by comparing non-colour leaves.
 *
 * COLOUR POLICY — palette inks reuse the validated body-theme conversion
 * (`toMonochromeColor` from body-theme-tokens.ts, shared without altering
 * any body-theme output).  Invalid colours follow the explicit body-theme
 * fallback policy: an unreadable input resolves to MONO_INVALID_COLOR_
 * FALLBACK in monochrome mode; the registry only ever contains valid
 * hex/rgba constants.
 *
 * @module services/cover-theme-tokens
 */

import type {
  CoverElementPlacement,
  CoverThemeId,
  CssColor,
} from '../types/document';
import {
  MONO_INVALID_COLOR_FALLBACK,
  ThemeImplementationStatus,
  toMonochromeColor,
} from './body-theme-tokens';

// ─────────────────────────────────────────────────────────────────────────────
// Structural vocabulary
// ─────────────────────────────────────────────────────────────────────────────

/**
 * The ten distinct cover compositions (§7.3).  Each id selects a genuinely
 * different page structure in `poc-cover-page.tsx` — layout, information
 * zones and decoration differ, not only ink.
 */
export type CoverLayoutStructure =
  | 'centered-ornament' // classic-formal
  | 'asymmetric-minimal' // minimalist
  | 'full-width-band' // corporate-band
  | 'sidebar-grid' // technical-grid
  | 'split-vertical' // editorial-split
  | 'full-bleed-hero' // photographic-hero
  | 'nested-frame' // institutional-frame
  | 'diagonal-geometry' // geometric
  | 'journal-columns' // scientific-publication
  | 'table-dominant'; // administrative-record

/** Metadata presentation style of the cover information zone. */
export type CoverMetadataStyle =
  | 'centered-pairs' // classic-formal: centered label/value pairs, 2 cols
  | 'baseline-inline' // minimalist: single compact baseline row
  | 'band-row' // corporate-band: 3-column row inside the bottom band
  | 'grid-cells' // technical-grid: bordered metadata grid cells
  | 'stacked-panel' // editorial-split: stacked inside the left panel
  | 'hero-footer-strip' // photographic-hero: strip below the title zone
  | 'framed-block' // institutional-frame: bordered block at the bottom
  | 'column-pairs' // geometric: two columns of label/value pairs
  | 'abstract-key-values' // scientific-publication: compact key/value column
  | 'control-table'; // administrative-record: full-width bordered table

/** Where the logo is placed relative to the composition. */
export type CoverLogoPlacement =
  | 'top-center'
  | 'top-left'
  | 'band-inside' // inside the top corporate band (reversed ink)
  | 'grid-corner' // sidebar/grid corner block
  | 'panel-top' // top of the split panel
  | 'hero-overlay' // overlaid on the hero scrim
  | 'frame-center' // centered inside the nested frame
  | 'geometry-corner' // corner block region
  | 'journal-head' // journal running head, right side
  | 'record-head'; // record header row, right side

/** Where the optional synopsis text is placed. */
export type CoverSynopsisPlacement =
  | 'below-subtitle'
  | 'lower-left'
  | 'band-below'
  | 'grid-span'
  | 'panel-lower'
  | 'hero-bottom'
  | 'frame-bottom'
  | 'geometry-strip'
  | 'abstract-box'
  | 'record-note';

/**
 * How an optional background/hero image is composed into the theme.
 * `none-optional-inset` means the theme has no natural background role —
 * the image is still supported via a restrained inset block (§2F: a theme
 * that does not benefit from a photographic background may support the
 * optional image with a restrained layout).
 */
export type CoverBackgroundTreatment =
  | 'none-optional-inset'
  | 'quiet-inset'
  | 'band-fill'
  | 'grid-tile'
  | 'panel-fill'
  | 'full-bleed-scrim'
  | 'frame-inset'
  | 'corner-accent'
  | 'abstract-header'
  | 'record-header';

/** One structural decoration drawn by the theme (order matters). */
export interface CoverDecoration {
  kind: 'rule' | 'band' | 'block' | 'frame' | 'grid' | 'shape';
  placement: 'top' | 'bottom' | 'left' | 'right' | 'corner' | 'full' | 'inset';
  /** Visual thickness in points (structural — never converted by mono). */
  thicknessPt: number;
}

/**
 * Numeric ornament signature: structural measurements that differentiate
 * compositions mechanically (0 = the ornament is absent from that theme).
 */
export interface CoverOrnamentTokens {
  /** Number of horizontal decorative rules drawn. */
  ruleCount: number;
  /** Full-width top band height (mm; 0 = no top band). */
  bandHeightMmTop: number;
  /** Full-width bottom band height (mm; 0 = no bottom band). */
  bandHeightMmBottom: number;
  /** Square corner block size (mm; 0 = no corner blocks). */
  cornerBlockMm: number;
  /** Metadata grid gutter (mm; 0 = no grid structure). */
  gridGutterMm: number;
  /** Left/right split ratio (0 = no split; 0–1). */
  splitRatio: number;
  /** Nested frame inset inside the user frame (mm; 0 = no nesting). */
  nestedInsetMm: number;
  /** Free geometric shapes drawn (0 = none). */
  shapeCount: number;
  /** Administrative header-table rows (0 = none). */
  headerTableRows: number;
}

/** Cover typography: per-role size/weight/family (PDF standard-14 fonts). */
export interface CoverTypographyRole {
  sizePt: number;
  weight: 'bold' | 'normal';
  family: 'serif' | 'sans';
  italic?: boolean;
}

export interface CoverTypographyTokens {
  title: CoverTypographyRole;
  subtitle: CoverTypographyRole;
  organization: CoverTypographyRole;
  metadata: CoverTypographyRole;
  synopsis: CoverTypographyRole;
}

/** Palette inks — the ONLY fields the monochrome policy rewrites. */
export interface CoverPaletteTokens {
  /** Page background fill. */
  pageBackground: CssColor;
  titleInk: CssColor;
  subtitleInk: CssColor;
  organizationInk: CssColor;
  accent: CssColor;
  /** Secondary accent (bands, grid fills). */
  secondaryAccent: CssColor;
  ruleInk: CssColor;
  metadataLabelInk: CssColor;
  metadataValueInk: CssColor;
  mutedInk: CssColor;
  /** Ink used for text placed ON accent bands (reversed). */
  onBandInk: CssColor;
  /** Scrim/overlay ink drawn over background images (rgba). */
  overlayInk: CssColor;
  /** Ink of the user-configured frame. */
  frameInk: CssColor;
}

/** Per-element default placement (§7.1 title/subtitle/organization). */
export interface CoverPlacementDefaults {
  title: CoverElementPlacement;
  subtitle: CoverElementPlacement;
  organizationName: CoverElementPlacement;
}

/** Full structural + palette token set for one cover theme. */
export interface CoverThemeTokens {
  structure: CoverLayoutStructure;
  metadataStyle: CoverMetadataStyle;
  metadataColumns: 1 | 2 | 3;
  logoPlacement: CoverLogoPlacement;
  synopsisPlacement: CoverSynopsisPlacement;
  backgroundTreatment: CoverBackgroundTreatment;
  /** Ordered structural decoration list (the drawn ornament plan). */
  decoration: readonly CoverDecoration[];
  ornaments: CoverOrnamentTokens;
  placementDefaults: CoverPlacementDefaults;
  typography: CoverTypographyTokens;
  /** Content inset inside the page frame (mm). */
  contentInsetMm: number;
  palette: CoverPaletteTokens;
}

export interface CoverThemeMetadata {
  id: CoverThemeId;
  displayName: string;
  /** Short design intent (one sentence). */
  intent: string;
  /** Concise audit description of the implemented structure. */
  structuralDesign: string;
  /**
   * Honest implementation status.  P04-M4 starts every cover theme at
   * `composition-verified` only once its rendered gallery page has been
   * produced AND visually inspected; `foundation-planned` keeps a partly
   * implemented catalogue from over-claiming.
   */
  implementationStatus: ThemeImplementationStatus;
}

export interface CoverThemeDefinition {
  metadata: CoverThemeMetadata;
  tokens: CoverThemeTokens;
}

export interface CoverThemeResolution {
  themeId: CoverThemeId;
  monochrome: boolean;
  /** Tokens with palette already monochrome-adapted when requested. */
  tokens: CoverThemeTokens;
}

// ─────────────────────────────────────────────────────────────────────────────
// Resolver primitives
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Apply the monochrome colour policy to a palette.  Structure, spacing,
 * typography and every non-colour token are preserved untouched — this is
 * the same validated conversion the body themes use (shared helper; body
 * output is unaffected).
 */
export function applyCoverMonochrome(palette: CoverPaletteTokens): CoverPaletteTokens {
  const conv = (c: CssColor): CssColor =>
    toMonochromeColor(c) || MONO_INVALID_COLOR_FALLBACK;
  return {
    pageBackground: conv(palette.pageBackground),
    titleInk: conv(palette.titleInk),
    subtitleInk: conv(palette.subtitleInk),
    organizationInk: conv(palette.organizationInk),
    accent: conv(palette.accent),
    secondaryAccent: conv(palette.secondaryAccent),
    ruleInk: conv(palette.ruleInk),
    metadataLabelInk: conv(palette.metadataLabelInk),
    metadataValueInk: conv(palette.metadataValueInk),
    mutedInk: conv(palette.mutedInk),
    onBandInk: conv(palette.onBandInk),
    overlayInk: conv(palette.overlayInk),
    frameInk: conv(palette.frameInk),
  };
}

/**
 * Merge the theme's placement defaults with the user's per-element
 * overrides (P04-M4 §7.1).  Absent overrides keep the theme default, so
 * every theme's composition survives untouched until the user places an
 * element explicitly.
 */
export function effectiveCoverPlacement(
  defaults: CoverPlacementDefaults,
  override: { title?: CoverElementPlacement; subtitle?: CoverElementPlacement; organizationName?: CoverElementPlacement } | undefined,
): Required<CoverPlacementDefaults> {
  const merge = (
    def: CoverElementPlacement,
    over: CoverElementPlacement | undefined,
  ): CoverElementPlacement => (over ? { align: over.align, band: over.band } : def);
  return {
    title: merge(defaults.title, override?.title),
    subtitle: merge(defaults.subtitle, override?.subtitle),
    organizationName: merge(defaults.organizationName, override?.organizationName),
  };
}
