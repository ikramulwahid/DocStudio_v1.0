/**
 * DocStudio — Body-theme registry (P04-M2)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * One typed entry per value of the authoritative `BodyThemeId` union,
 * keyed by the theme id (`Record<BodyThemeId, BodyThemeDefinition>` — the
 * compiler rejects a missing or misspelled entry, and no fallback exists).
 *
 * Each entry pairs STABLE METADATA (display name, design intent and
 * planned structural characteristics taken from project_details.md §8.3,
 * so P04-M3 does not invent a parallel catalogue) with a STRUCTURAL TOKEN
 * SCAFFOLD implementing the same shape as `classic-formal`.
 *
 * Honest implementation status (verification requirement §7.2):
 * • `classic-formal` — `default-verified`: its tokens reproduce P04-M1's
 *   established typography and the P02-M4 default appearance (byte-
 *   identical baseline PDF).
 * • The other nine — `foundation-planned`: the registry and tokens exist
 *   so P04-M3 can build the finished compositions.  Their tokens below are
 *   provisional starting points derived from §8.3, NOT verified designs.
 *
 * @module services/body-theme-registry
 */

import type { BodyThemeId } from '../types/document';
import type {
  BodyThemeDefinition,
  BodyThemeStructuralTokens,
} from './body-theme-tokens';

/**
 * Deep-freeze so registry data is stable metadata, never a mutable
 * side-effect surface.  The resolver copies what it returns.
 */
function deepFreeze<T>(value: T): T {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    Object.values(value).forEach(deepFreeze);
  }
  return value;
}

// ─────────────────────────────────────────────────────────────────────────────
// Structural token scaffolds
// ─────────────────────────────────────────────────────────────────────────────

/**
 * classic-formal — the functional default.  Every value equals the exact
 * constant the P02-M4 renderer used before theming existed, so the
 * committed baseline PDF remains byte-identical:
 * headings bold 10/6 pt margins, justified 18 pt indent steps, table
 * borders #666666/#333333/#999999 on #e8e8e8, 3/4 pt cell padding, 8 pt
 * table margin, italic 9.5 pt captions (3/8 pt), 9 pt #444444 page
 * furniture offset 28 pt, and the #888888 muted-ink marker.
 */
const CLASSIC_FORMAL: BodyThemeStructuralTokens = {
  headings: {
    weight: { 1: 'bold', 2: 'bold', 3: 'bold', 4: 'bold' },
    align: 'left',
    marginTopPt: 10,
    marginBottomPt: 6,
    decoration: 'none',
  },
  paragraphs: { align: 'justify', indentStepPt: 18 },
  lists: { indentPt: 24, itemSpacingPt: 4, markerStyle: 'disc' },
  tables: {
    borderColor: '#666666',
    borderWidthPt: 0.5,
    headerBackground: '#e8e8e8',
    headerBorderWidthPt: 1,
    headerBorderColor: '#333333',
    headerTextColor: '#000000',
    headerWeight: 'bold',
    cellPaddingVpt: 3,
    cellPaddingHpt: 4,
    cellDividerColor: '#999999',
    cellDividerWidthPt: 0.5,
    marginBottomPt: 8,
  },
  captions: {
    sizePt: 9.5,
    italic: true,
    marginTopPt: 3,
    marginBottomPt: 8,
    tableAlign: 'left',
    figureAlign: 'center',
    color: '#000000',
  },
  separators: {
    sectionRuleColor: '#666666',
    sectionRuleWidthPt: 0.75,
    accentColor: '#444444',
  },
  frame: { style: 'none', color: '#333333', widthPt: 1 },
  pageFurniture: {
    fontSizePt: 9,
    offsetPt: 28,
    align: 'center',
    color: '#444444',
  },
  colors: {
    text: '#000000',
    heading: '#000000',
    accent: '#444444',
    rule: '#666666',
    mutedText: '#888888',
  },
};

/** Minimalist — clean sans-serif typography, whitespace, quiet boundaries. */
const MINIMALIST: BodyThemeStructuralTokens = {
  headings: {
    weight: { 1: 'bold', 2: 'bold', 3: 'bold', 4: 'normal' },
    align: 'left',
    marginTopPt: 14,
    marginBottomPt: 8,
    decoration: 'none',
  },
  paragraphs: { align: 'left', indentStepPt: 18 },
  lists: { indentPt: 20, itemSpacingPt: 6, markerStyle: 'dash' },
  tables: {
    borderColor: '#999999',
    borderWidthPt: 0.5,
    headerBackground: '#f5f5f5',
    headerBorderWidthPt: 0.5,
    headerBorderColor: '#999999',
    headerTextColor: '#000000',
    headerWeight: 'bold',
    cellPaddingVpt: 4,
    cellPaddingHpt: 5,
    cellDividerColor: '#dddddd',
    cellDividerWidthPt: 0.5,
    marginBottomPt: 10,
  },
  captions: {
    sizePt: 9,
    italic: false,
    marginTopPt: 4,
    marginBottomPt: 10,
    tableAlign: 'left',
    figureAlign: 'center',
    color: '#000000',
  },
  separators: {
    sectionRuleColor: '#999999',
    sectionRuleWidthPt: 0.75,
    accentColor: '#777777',
  },
  frame: { style: 'none', color: '#777777', widthPt: 1 },
  pageFurniture: {
    fontSizePt: 8.5,
    offsetPt: 28,
    align: 'center',
    color: '#777777',
  },
  colors: {
    text: '#000000',
    heading: '#000000',
    accent: '#555555',
    rule: '#999999',
    mutedText: '#777777',
  },
};

/** Editorial — expressive heading scale, deliberate alignment, reading rhythm. */
const EDITORIAL: BodyThemeStructuralTokens = {
  headings: {
    weight: { 1: 'bold', 2: 'bold', 3: 'bold', 4: 'bold' },
    align: 'left',
    marginTopPt: 16,
    marginBottomPt: 8,
    decoration: 'underline',
  },
  paragraphs: { align: 'justify', indentStepPt: 18 },
  lists: { indentPt: 24, itemSpacingPt: 5, markerStyle: 'circle' },
  tables: {
    borderColor: '#444444',
    borderWidthPt: 0.75,
    headerBackground: '#f0f0f0',
    headerBorderWidthPt: 1,
    headerBorderColor: '#222222',
    headerTextColor: '#000000',
    headerWeight: 'bold',
    cellPaddingVpt: 3,
    cellPaddingHpt: 5,
    cellDividerColor: '#bbbbbb',
    cellDividerWidthPt: 0.5,
    marginBottomPt: 8,
  },
  captions: {
    sizePt: 9.5,
    italic: true,
    marginTopPt: 3,
    marginBottomPt: 8,
    tableAlign: 'left',
    figureAlign: 'center',
    color: '#333333',
  },
  separators: {
    sectionRuleColor: '#444444',
    sectionRuleWidthPt: 1,
    accentColor: '#8b0000',
  },
  frame: { style: 'none', color: '#444444', widthPt: 1 },
  pageFurniture: {
    fontSizePt: 9,
    offsetPt: 28,
    align: 'center',
    color: '#444444',
  },
  colors: {
    text: '#111111',
    heading: '#000000',
    accent: '#8b0000',
    rule: '#444444',
    mutedText: '#666666',
  },
};

/** Scientific Journal — compact legible hierarchy, dense content, formal captions. */
const SCIENTIFIC_JOURNAL: BodyThemeStructuralTokens = {
  headings: {
    weight: { 1: 'bold', 2: 'bold', 3: 'bold', 4: 'bold' },
    align: 'left',
    marginTopPt: 8,
    marginBottomPt: 4,
    decoration: 'none',
  },
  paragraphs: { align: 'justify', indentStepPt: 18 },
  lists: { indentPt: 22, itemSpacingPt: 3, markerStyle: 'disc' },
  tables: {
    borderColor: '#777777',
    borderWidthPt: 0.5,
    headerBackground: '#eeeeee',
    headerBorderWidthPt: 0.75,
    headerBorderColor: '#555555',
    headerTextColor: '#000000',
    headerWeight: 'bold',
    cellPaddingVpt: 2,
    cellPaddingHpt: 3,
    cellDividerColor: '#bbbbbb',
    cellDividerWidthPt: 0.5,
    marginBottomPt: 6,
  },
  captions: {
    sizePt: 9,
    italic: true,
    marginTopPt: 2,
    marginBottomPt: 6,
    tableAlign: 'left',
    figureAlign: 'center',
    color: '#000000',
  },
  separators: {
    sectionRuleColor: '#777777',
    sectionRuleWidthPt: 0.5,
    accentColor: '#555555',
  },
  frame: { style: 'none', color: '#555555', widthPt: 1 },
  pageFurniture: {
    fontSizePt: 8,
    offsetPt: 24,
    align: 'center',
    color: '#555555',
  },
  colors: {
    text: '#000000',
    heading: '#000000',
    accent: '#555555',
    rule: '#777777',
    mutedText: '#666666',
  },
};

/** Technical Specification — numbered sections, precise labels, structured rules and tables. */
const TECHNICAL_SPECIFICATION: BodyThemeStructuralTokens = {
  headings: {
    weight: { 1: 'bold', 2: 'bold', 3: 'bold', 4: 'bold' },
    align: 'left',
    marginTopPt: 12,
    marginBottomPt: 6,
    decoration: 'underline',
  },
  paragraphs: { align: 'justify', indentStepPt: 18 },
  lists: { indentPt: 26, itemSpacingPt: 4, markerStyle: 'square' },
  tables: {
    borderColor: '#333333',
    borderWidthPt: 0.75,
    headerBackground: '#e0e0e0',
    headerBorderWidthPt: 1,
    headerBorderColor: '#000000',
    headerTextColor: '#000000',
    headerWeight: 'bold',
    cellPaddingVpt: 3,
    cellPaddingHpt: 4,
    cellDividerColor: '#777777',
    cellDividerWidthPt: 0.5,
    marginBottomPt: 8,
  },
  captions: {
    sizePt: 9,
    italic: false,
    marginTopPt: 3,
    marginBottomPt: 8,
    tableAlign: 'left',
    figureAlign: 'center',
    color: '#333333',
  },
  separators: {
    sectionRuleColor: '#333333',
    sectionRuleWidthPt: 1,
    accentColor: '#333333',
  },
  frame: { style: 'none', color: '#333333', widthPt: 1 },
  pageFurniture: {
    fontSizePt: 9,
    offsetPt: 28,
    align: 'center',
    color: '#333333',
  },
  colors: {
    text: '#000000',
    heading: '#000000',
    accent: '#333333',
    rule: '#333333',
    mutedText: '#555555',
  },
};

/** Corporate — strong heading levels, branding accents, tidy page furniture. */
const CORPORATE: BodyThemeStructuralTokens = {
  headings: {
    weight: { 1: 'bold', 2: 'bold', 3: 'bold', 4: 'normal' },
    align: 'left',
    marginTopPt: 14,
    marginBottomPt: 8,
    decoration: 'none',
  },
  paragraphs: { align: 'justify', indentStepPt: 18 },
  lists: { indentPt: 24, itemSpacingPt: 4, markerStyle: 'disc' },
  tables: {
    borderColor: '#8497b0',
    borderWidthPt: 0.5,
    headerBackground: '#d9e2f3',
    headerBorderWidthPt: 1,
    headerBorderColor: '#2f5597',
    headerTextColor: '#1f3864',
    headerWeight: 'bold',
    cellPaddingVpt: 3,
    cellPaddingHpt: 4,
    cellDividerColor: '#b4c7e7',
    cellDividerWidthPt: 0.5,
    marginBottomPt: 8,
  },
  captions: {
    sizePt: 9.5,
    italic: false,
    marginTopPt: 3,
    marginBottomPt: 8,
    tableAlign: 'left',
    figureAlign: 'center',
    color: '#1f3864',
  },
  separators: {
    sectionRuleColor: '#8497b0',
    sectionRuleWidthPt: 1,
    accentColor: '#2f5597',
  },
  frame: { style: 'none', color: '#2f5597', widthPt: 1 },
  pageFurniture: {
    fontSizePt: 9,
    offsetPt: 28,
    align: 'center',
    color: '#1f3864',
  },
  colors: {
    text: '#000000',
    heading: '#000000',
    accent: '#2f5597',
    rule: '#8497b0',
    mutedText: '#666666',
  },
};

/** Geometric — geometric section markers, modular layout, graphic rules. */
const GEOMETRIC: BodyThemeStructuralTokens = {
  headings: {
    weight: { 1: 'bold', 2: 'bold', 3: 'bold', 4: 'bold' },
    align: 'left',
    marginTopPt: 14,
    marginBottomPt: 6,
    decoration: 'underline',
  },
  paragraphs: { align: 'justify', indentStepPt: 20 },
  lists: { indentPt: 24, itemSpacingPt: 6, markerStyle: 'square' },
  tables: {
    borderColor: '#4a4a4a',
    borderWidthPt: 0.75,
    headerBackground: '#ececec',
    headerBorderWidthPt: 1.5,
    headerBorderColor: '#1a1a1a',
    headerTextColor: '#000000',
    headerWeight: 'bold',
    cellPaddingVpt: 4,
    cellPaddingHpt: 6,
    cellDividerColor: '#9a9a9a',
    cellDividerWidthPt: 0.5,
    marginBottomPt: 10,
  },
  captions: {
    sizePt: 9,
    italic: false,
    marginTopPt: 3,
    marginBottomPt: 10,
    tableAlign: 'left',
    figureAlign: 'center',
    color: '#333333',
  },
  separators: {
    sectionRuleColor: '#1a1a1a',
    sectionRuleWidthPt: 1.25,
    accentColor: '#4a4a4a',
  },
  frame: { style: 'none', color: '#1a1a1a', widthPt: 1 },
  pageFurniture: {
    fontSizePt: 9,
    offsetPt: 28,
    align: 'center',
    color: '#4a4a4a',
  },
  colors: {
    text: '#000000',
    heading: '#000000',
    accent: '#1a1a1a',
    rule: '#4a4a4a',
    mutedText: '#666666',
  },
};

/** Framed Document — visible page/section framing, formal page treatment. */
const FRAMED_DOCUMENT: BodyThemeStructuralTokens = {
  headings: {
    weight: { 1: 'bold', 2: 'bold', 3: 'bold', 4: 'bold' },
    align: 'left',
    marginTopPt: 12,
    marginBottomPt: 6,
    decoration: 'none',
  },
  paragraphs: { align: 'justify', indentStepPt: 18 },
  lists: { indentPt: 24, itemSpacingPt: 4, markerStyle: 'disc' },
  tables: {
    borderColor: '#555555',
    borderWidthPt: 0.75,
    headerBackground: '#efefef',
    headerBorderWidthPt: 1,
    headerBorderColor: '#333333',
    headerTextColor: '#000000',
    headerWeight: 'bold',
    cellPaddingVpt: 3,
    cellPaddingHpt: 4,
    cellDividerColor: '#999999',
    cellDividerWidthPt: 0.5,
    marginBottomPt: 8,
  },
  captions: {
    sizePt: 9.5,
    italic: true,
    marginTopPt: 3,
    marginBottomPt: 8,
    tableAlign: 'left',
    figureAlign: 'center',
    color: '#000000',
  },
  separators: {
    sectionRuleColor: '#555555',
    sectionRuleWidthPt: 1,
    accentColor: '#333333',
  },
  frame: { style: 'solid', color: '#333333', widthPt: 1 },
  pageFurniture: {
    fontSizePt: 9,
    offsetPt: 28,
    align: 'center',
    color: '#444444',
  },
  colors: {
    text: '#000000',
    heading: '#000000',
    accent: '#333333',
    rule: '#555555',
    mutedText: '#777777',
  },
};

/** Contemporary Asymmetrical — selective asymmetry, differentiated information zones. */
const CONTEMPORARY_ASYMMETRICAL: BodyThemeStructuralTokens = {
  headings: {
    weight: { 1: 'bold', 2: 'bold', 3: 'bold', 4: 'normal' },
    align: 'left',
    marginTopPt: 16,
    marginBottomPt: 8,
    decoration: 'none',
  },
  paragraphs: { align: 'left', indentStepPt: 24 },
  lists: { indentPt: 28, itemSpacingPt: 5, markerStyle: 'dash' },
  tables: {
    borderColor: '#606060',
    borderWidthPt: 0.5,
    headerBackground: '#e4e4e4',
    headerBorderWidthPt: 1,
    headerBorderColor: '#303030',
    headerTextColor: '#000000',
    headerWeight: 'bold',
    cellPaddingVpt: 3,
    cellPaddingHpt: 6,
    cellDividerColor: '#a0a0a0',
    cellDividerWidthPt: 0.5,
    marginBottomPt: 9,
  },
  captions: {
    sizePt: 9.5,
    italic: false,
    marginTopPt: 3,
    marginBottomPt: 9,
    tableAlign: 'right',
    figureAlign: 'right',
    color: '#333333',
  },
  separators: {
    sectionRuleColor: '#303030',
    sectionRuleWidthPt: 1,
    accentColor: '#606060',
  },
  frame: { style: 'none', color: '#303030', widthPt: 1 },
  pageFurniture: {
    fontSizePt: 9,
    offsetPt: 28,
    align: 'right',
    color: '#444444',
  },
  colors: {
    text: '#000000',
    heading: '#000000',
    accent: '#303030',
    rule: '#606060',
    mutedText: '#666666',
  },
};

/** Traditional Serif — book-like serif text, formal hierarchy, classic spacing. */
const TRADITIONAL_SERIF: BodyThemeStructuralTokens = {
  headings: {
    weight: { 1: 'bold', 2: 'bold', 3: 'normal', 4: 'normal' },
    align: 'left',
    marginTopPt: 12,
    marginBottomPt: 6,
    decoration: 'none',
  },
  paragraphs: { align: 'justify', indentStepPt: 21 },
  lists: { indentPt: 26, itemSpacingPt: 4, markerStyle: 'disc' },
  tables: {
    borderColor: '#7a7a7a',
    borderWidthPt: 0.5,
    headerBackground: '#eeeeee',
    headerBorderWidthPt: 1,
    headerBorderColor: '#444444',
    headerTextColor: '#000000',
    headerWeight: 'bold',
    cellPaddingVpt: 3,
    cellPaddingHpt: 4,
    cellDividerColor: '#aaaaaa',
    cellDividerWidthPt: 0.5,
    marginBottomPt: 8,
  },
  captions: {
    sizePt: 9.5,
    italic: true,
    marginTopPt: 4,
    marginBottomPt: 8,
    tableAlign: 'left',
    figureAlign: 'center',
    color: '#000000',
  },
  separators: {
    sectionRuleColor: '#777777',
    sectionRuleWidthPt: 0.75,
    accentColor: '#555555',
  },
  frame: { style: 'none', color: '#555555', widthPt: 1 },
  pageFurniture: {
    fontSizePt: 9,
    offsetPt: 28,
    align: 'center',
    color: '#555555',
  },
  colors: {
    text: '#000000',
    heading: '#000000',
    accent: '#555555',
    rule: '#777777',
    mutedText: '#666666',
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// Registry
// ─────────────────────────────────────────────────────────────────────────────

/**
 * The authoritative theme catalogue: exactly one entry per `BodyThemeId`.
 * Typed as `Record<BodyThemeId, BodyThemeDefinition>`, so TypeScript
 * rejects a missing entry (and any unknown key); verify_p04_m2.mjs re-
 * checks completeness, id/key agreement and metadata validity at runtime.
 */
export const BODY_THEME_REGISTRY: Record<BodyThemeId, BodyThemeDefinition> = {
  'classic-formal': {
    metadata: {
      id: 'classic-formal',
      displayName: 'Classic Formal',
      intent: 'Serif-led hierarchy, traditional spacing and restrained rules.',
      plannedCharacteristics: [
        'Serif-led heading hierarchy with traditional spacing',
        'Restrained rules and formal, quiet table treatment',
        'Neutral page furniture and monochrome-compatible palette',
      ],
      implementationStatus: 'default-verified',
    },
    structural: CLASSIC_FORMAL,
  },
  minimalist: {
    metadata: {
      id: 'minimalist',
      displayName: 'Minimalist',
      intent: 'Clean sans-serif typography, whitespace and quiet section boundaries.',
      plannedCharacteristics: [
        'Clean sans-serif typography with generous whitespace',
        'Quiet section boundaries instead of heavy rules',
        'Lightweight table and caption treatment',
      ],
      implementationStatus: 'foundation-planned',
    },
    structural: MINIMALIST,
  },
  editorial: {
    metadata: {
      id: 'editorial',
      displayName: 'Editorial',
      intent: 'Expressive heading scale, deliberate alignment and clear reading rhythm.',
      plannedCharacteristics: [
        'Expressive heading scale with deliberate alignment',
        'Clear reading rhythm between sections',
        'Underlined heading decoration as an editorial rule',
      ],
      implementationStatus: 'foundation-planned',
    },
    structural: EDITORIAL,
  },
  'scientific-journal': {
    metadata: {
      id: 'scientific-journal',
      displayName: 'Scientific Journal',
      intent: 'Compact but legible hierarchy, dense technical content and formal captions.',
      plannedCharacteristics: [
        'Compact but legible heading hierarchy for dense content',
        'Formal captions and technical label treatment',
        'Dense table layout with hairline rules',
      ],
      implementationStatus: 'foundation-planned',
    },
    structural: SCIENTIFIC_JOURNAL,
  },
  'technical-specification': {
    metadata: {
      id: 'technical-specification',
      displayName: 'Technical Specification',
      intent: 'Numbered sections, precise labels, structured rules and tables.',
      plannedCharacteristics: [
        'Numbered sections with precise labels',
        'Structured rules and strongly bordered tables',
        'Non-italic technical caption treatment',
      ],
      implementationStatus: 'foundation-planned',
    },
    structural: TECHNICAL_SPECIFICATION,
  },
  corporate: {
    metadata: {
      id: 'corporate',
      displayName: 'Corporate',
      intent: 'Strong heading levels, consistent branding accents and tidy page furniture.',
      plannedCharacteristics: [
        'Strong, clearly differentiated heading levels',
        'Consistent branding accent colors',
        'Tidy, branded page furniture and table headers',
      ],
      implementationStatus: 'foundation-planned',
    },
    structural: CORPORATE,
  },
  geometric: {
    metadata: {
      id: 'geometric',
      displayName: 'Geometric',
      intent: 'Geometric section markers, modular layout and graphic rules.',
      plannedCharacteristics: [
        'Geometric section markers and modular layout',
        'Graphic rules with bolder table framing',
        'Squarish list markers and structured spacing',
      ],
      implementationStatus: 'foundation-planned',
    },
    structural: GEOMETRIC,
  },
  'framed-document': {
    metadata: {
      id: 'framed-document',
      displayName: 'Framed Document',
      intent: 'Visible page/section framing and formal page treatment.',
      plannedCharacteristics: [
        'Visible page framing around the full sheet',
        'Section framing and formal page treatment',
        'Traditional, formal table and caption treatment',
      ],
      implementationStatus: 'foundation-planned',
    },
    structural: FRAMED_DOCUMENT,
  },
  'contemporary-asymmetrical': {
    metadata: {
      id: 'contemporary-asymmetrical',
      displayName: 'Contemporary Asymmetrical',
      intent: 'Selective asymmetry and differentiated information zones while maintaining readability.',
      plannedCharacteristics: [
        'Selective asymmetry in headings, captions and zones',
        'Differentiated information zones via indent steps',
        'Right-biased captions and page furniture alignment',
      ],
      implementationStatus: 'foundation-planned',
    },
    structural: CONTEMPORARY_ASYMMETRICAL,
  },
  'traditional-serif': {
    metadata: {
      id: 'traditional-serif',
      displayName: 'Traditional Serif',
      intent: 'Book-like serif text, formal hierarchy and classic document spacing.',
      plannedCharacteristics: [
        'Book-like serif text with classic document spacing',
        'Formal hierarchy with softer lower-level headings',
        'Classic, restrained table and caption treatment',
      ],
      implementationStatus: 'foundation-planned',
    },
    structural: TRADITIONAL_SERIF,
  },
};

// Freeze the whole catalogue: stable metadata, no mutable side effects.
Object.values(BODY_THEME_REGISTRY).forEach(deepFreeze);
Object.freeze(BODY_THEME_REGISTRY);

/** The ten authoritative ids, in registry order. */
export const BODY_THEME_IDS: readonly BodyThemeId[] = Object.freeze(
  Object.keys(BODY_THEME_REGISTRY) as BodyThemeId[],
);
