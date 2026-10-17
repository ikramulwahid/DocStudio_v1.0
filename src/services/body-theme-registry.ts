/**
 * DocStudio — Body-theme registry (P04-M2)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * One typed entry per value of the authoritative `BodyThemeId` union,
 * keyed by the theme id (`Record<BodyThemeId, BodyThemeDefinition>` — the
 * compiler rejects a missing or misspelled entry, and no fallback exists).
 *
 * Each entry pairs STABLE METADATA (display name, design intent from
 * project_details.md §8.3, implemented structural characteristics, a
 * concise `structuralDesign` audit description) with a STRUCTURAL TOKEN
 * composition implementing that design.
 *
 * Honest implementation status (verification requirement §7.2):
 * • `classic-formal` — `default-verified`: its tokens reproduce P04-M1's
 *   established typography and the P02-M4 default appearance (byte-
 *   identical baseline PDF).
 * • The other nine — `composition-verified` (P04-M3): their finished §8.3
 *   compositions are implemented and their rendered gallery pages were
 *   inspected as recorded in the roadmap.  `foundation-planned` remains in
 *   the vocabulary so any future unverified theme cannot over-claim.
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

/**
 * Minimalist — clean sans-serif typography, whitespace, quiet boundaries.
 *
 * Composition (P04-M3): airy rhythm — the widest heading margins of the
 * catalogue (18/10 pt) with a light regular-weight H4, LEFT-ragged body
 * text at 16 pt indent steps (no justification), hairline 0.5 pt rules,
 * a WHITE table header capped by one decisive black rule with a regular
 * (not bold) header row, non-italic captions with generous 12 pt bottom
 * space, very quiet 8 pt / #999999 furniture, and soft #111111 body ink.
 */
const MINIMALIST: BodyThemeStructuralTokens = {
  headings: {
    weight: { 1: 'bold', 2: 'bold', 3: 'bold', 4: 'normal' },
    align: 'left',
    marginTopPt: 18,
    marginBottomPt: 10,
    decoration: 'none',
  },
  paragraphs: { align: 'left', indentStepPt: 16 },
  lists: { indentPt: 16, itemSpacingPt: 6, markerStyle: 'dash' },
  tables: {
    borderColor: '#dddddd',
    borderWidthPt: 0.5,
    headerBackground: '#ffffff',
    headerBorderWidthPt: 1,
    headerBorderColor: '#000000',
    headerTextColor: '#000000',
    headerWeight: 'normal',
    cellPaddingVpt: 4,
    cellPaddingHpt: 5,
    cellDividerColor: '#eeeeee',
    cellDividerWidthPt: 0.5,
    marginBottomPt: 12,
  },
  captions: {
    sizePt: 9,
    italic: false,
    marginTopPt: 4,
    marginBottomPt: 12,
    tableAlign: 'left',
    figureAlign: 'center',
    color: '#666666',
  },
  separators: {
    sectionRuleColor: '#dddddd',
    sectionRuleWidthPt: 0.5,
    accentColor: '#000000',
  },
  frame: { style: 'none', color: '#dddddd', widthPt: 1 },
  pageFurniture: {
    fontSizePt: 8,
    offsetPt: 26,
    align: 'center',
    color: '#999999',
  },
  colors: {
    text: '#111111',
    heading: '#000000',
    accent: '#000000',
    rule: '#dddddd',
    mutedText: '#999999',
  },
};

/**
 * Editorial — expressive heading scale, deliberate alignment, reading rhythm.
 *
 * Composition (P04-M3): magazine-style CENTERED all-bold headings in dark
 * crimson ink (18/10 pt), justified body with crimson accents, BLACK
 * table headers with white text on a #1a1a1a fill, centered crimson
 * italic captions (10 pt), 1.25 pt graphic rules with a crimson accent,
 * and RIGHT-aligned page furniture — the only centered-heading theme.
 */
const EDITORIAL: BodyThemeStructuralTokens = {
  headings: {
    weight: { 1: 'bold', 2: 'bold', 3: 'bold', 4: 'bold' },
    align: 'center',
    marginTopPt: 18,
    marginBottomPt: 10,
    decoration: 'none',
  },
  paragraphs: { align: 'justify', indentStepPt: 18 },
  lists: { indentPt: 24, itemSpacingPt: 5, markerStyle: 'circle' },
  tables: {
    borderColor: '#444444',
    borderWidthPt: 0.75,
    headerBackground: '#1a1a1a',
    headerBorderWidthPt: 1,
    headerBorderColor: '#1a1a1a',
    headerTextColor: '#ffffff',
    headerWeight: 'bold',
    cellPaddingVpt: 3,
    cellPaddingHpt: 5,
    cellDividerColor: '#999999',
    cellDividerWidthPt: 0.5,
    marginBottomPt: 10,
  },
  captions: {
    sizePt: 10,
    italic: true,
    marginTopPt: 3,
    marginBottomPt: 10,
    tableAlign: 'center',
    figureAlign: 'center',
    color: '#8b0000',
  },
  separators: {
    sectionRuleColor: '#333333',
    sectionRuleWidthPt: 1.25,
    accentColor: '#8b0000',
  },
  frame: { style: 'none', color: '#333333', widthPt: 1 },
  pageFurniture: {
    fontSizePt: 9,
    offsetPt: 28,
    align: 'right',
    color: '#333333',
  },
  colors: {
    text: '#111111',
    heading: '#8b0000',
    accent: '#8b0000',
    rule: '#333333',
    mutedText: '#666666',
  },
};

/**
 * Scientific Journal — compact legible hierarchy, dense content, formal captions.
 *
 * Composition (P04-M3): the tightest rhythm in the catalogue — 8/4 pt
 * heading margins, 12 pt indent steps, 2 pt table cell padding, 0.5 pt
 * hairline rules, the smallest captions (8.5 pt italic, 2/6 pt) and
 * small 8 pt furniture at a 24 pt offset, giving dense but legible
 * technical pages with classic left/justify structure.
 */
const SCIENTIFIC_JOURNAL: BodyThemeStructuralTokens = {
  headings: {
    weight: { 1: 'bold', 2: 'bold', 3: 'bold', 4: 'bold' },
    align: 'left',
    marginTopPt: 8,
    marginBottomPt: 4,
    decoration: 'none',
  },
  paragraphs: { align: 'justify', indentStepPt: 12 },
  lists: { indentPt: 18, itemSpacingPt: 2, markerStyle: 'disc' },
  tables: {
    borderColor: '#777777',
    borderWidthPt: 0.5,
    headerBackground: '#eeeeee',
    headerBorderWidthPt: 0.5,
    headerBorderColor: '#555555',
    headerTextColor: '#000000',
    headerWeight: 'bold',
    cellPaddingVpt: 2,
    cellPaddingHpt: 3,
    cellDividerColor: '#aaaaaa',
    cellDividerWidthPt: 0.5,
    marginBottomPt: 6,
  },
  captions: {
    sizePt: 8.5,
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

/**
 * Technical Specification — numbered sections, precise labels, structured rules and tables.
 *
 * Composition (P04-M3): UNDERLINED all-bold headings (spec-style), 20 pt
 * indent steps, square list markers, a heavy 1 pt black table grid with
 * 0.75 pt dividers, non-italic left-aligned technical labels (table AND
 * figure captions left), 1.25 pt black section rules and LEFT-aligned
 * furniture — precision over decoration.
 */
const TECHNICAL_SPECIFICATION: BodyThemeStructuralTokens = {
  headings: {
    weight: { 1: 'bold', 2: 'bold', 3: 'bold', 4: 'bold' },
    align: 'left',
    marginTopPt: 14,
    marginBottomPt: 6,
    decoration: 'underline',
  },
  paragraphs: { align: 'justify', indentStepPt: 20 },
  lists: { indentPt: 26, itemSpacingPt: 4, markerStyle: 'square' },
  tables: {
    borderColor: '#333333',
    borderWidthPt: 1,
    headerBackground: '#e0e0e0',
    headerBorderWidthPt: 1.25,
    headerBorderColor: '#000000',
    headerTextColor: '#000000',
    headerWeight: 'bold',
    cellPaddingVpt: 3,
    cellPaddingHpt: 5,
    cellDividerColor: '#777777',
    cellDividerWidthPt: 0.75,
    marginBottomPt: 8,
  },
  captions: {
    sizePt: 9,
    italic: false,
    marginTopPt: 3,
    marginBottomPt: 8,
    tableAlign: 'left',
    figureAlign: 'left',
    color: '#333333',
  },
  separators: {
    sectionRuleColor: '#333333',
    sectionRuleWidthPt: 1.25,
    accentColor: '#333333',
  },
  frame: { style: 'none', color: '#333333', widthPt: 1 },
  pageFurniture: {
    fontSizePt: 8.5,
    offsetPt: 26,
    align: 'left',
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

/**
 * Corporate — strong heading levels, branding accents, tidy page furniture.
 *
 * Composition (P04-M3): bold levels 1–3 with a regular H4 at 16/8 pt
 * margins, consistent NAVY branding throughout — pale-blue table header
 * fill (#d9e2f3) with navy text and a blue header border, navy captions,
 * 1 pt brand-blue section rules and navy centered furniture at a tidy
 * 26 pt offset; the only theme whose entire furniture/caption/rule set
 * shares one brand color family.
 */
const CORPORATE: BodyThemeStructuralTokens = {
  headings: {
    weight: { 1: 'bold', 2: 'bold', 3: 'bold', 4: 'normal' },
    align: 'left',
    marginTopPt: 16,
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
    cellPaddingHpt: 5,
    cellDividerColor: '#b4c7e7',
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
    color: '#1f3864',
  },
  separators: {
    sectionRuleColor: '#2f5597',
    sectionRuleWidthPt: 1,
    accentColor: '#2f5597',
  },
  frame: { style: 'none', color: '#2f5597', widthPt: 1 },
  pageFurniture: {
    fontSizePt: 8.5,
    offsetPt: 26,
    align: 'center',
    color: '#1f3864',
  },
  colors: {
    text: '#000000',
    heading: '#000000',
    accent: '#2f5597',
    rule: '#2f5597',
    mutedText: '#666666',
  },
};

/**
 * Geometric — geometric section markers, modular layout, graphic rules.
 *
 * Composition (P04-M3): teal-accented modular system — all-bold headings
 * at 14/8 pt in dark teal ink, boxy 5/8 pt table cells on a pale teal
 * header with teal header text, square list markers, the THICKEST
 * section rules of the catalogue (1.5 pt, near-black graphic lines) and
 * 9 pt furniture at a 30 pt offset.
 */
const GEOMETRIC: BodyThemeStructuralTokens = {
  headings: {
    weight: { 1: 'bold', 2: 'bold', 3: 'bold', 4: 'bold' },
    align: 'left',
    marginTopPt: 14,
    marginBottomPt: 8,
    decoration: 'none',
  },
  paragraphs: { align: 'justify', indentStepPt: 18 },
  lists: { indentPt: 24, itemSpacingPt: 6, markerStyle: 'square' },
  tables: {
    borderColor: '#4a4a4a',
    borderWidthPt: 0.75,
    headerBackground: '#e0f0ef',
    headerBorderWidthPt: 1,
    headerBorderColor: '#1a1a1a',
    headerTextColor: '#0f4c5c',
    headerWeight: 'bold',
    cellPaddingVpt: 5,
    cellPaddingHpt: 8,
    cellDividerColor: '#7fb8b8',
    cellDividerWidthPt: 0.5,
    marginBottomPt: 10,
  },
  captions: {
    sizePt: 9.5,
    italic: false,
    marginTopPt: 3,
    marginBottomPt: 10,
    tableAlign: 'left',
    figureAlign: 'center',
    color: '#0f4c5c',
  },
  separators: {
    sectionRuleColor: '#1a1a1a',
    sectionRuleWidthPt: 1.5,
    accentColor: '#0f4c5c',
  },
  frame: { style: 'none', color: '#1a1a1a', widthPt: 1 },
  pageFurniture: {
    fontSizePt: 9,
    offsetPt: 30,
    align: 'center',
    color: '#4a4a4a',
  },
  colors: {
    text: '#000000',
    heading: '#0f4c5c',
    accent: '#0f4c5c',
    rule: '#1a1a1a',
    mutedText: '#666666',
  },
};

/**
 * Framed Document — visible page/section framing, formal page treatment.
 *
 * Composition (P04-M3): the framed theme — a solid 1.5 pt page border
 * around every sheet (the widest frame in the catalogue), 12/6 pt
 * heading margins, traditional italic captions, bordered gray-header
 * tables with a black header rule, and 9 pt furniture set 32 pt inside
 * the frame so numbering never crowds the border.
 */
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
    headerBackground: '#e6e6e6',
    headerBorderWidthPt: 1,
    headerBorderColor: '#000000',
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
  frame: { style: 'solid', color: '#333333', widthPt: 1.5 },
  pageFurniture: {
    fontSizePt: 9,
    offsetPt: 32,
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

/**
 * Contemporary Asymmetrical — selective asymmetry, differentiated information zones.
 *
 * Composition (P04-M3): selective asymmetry while staying readable —
 * the widest heading margins (20/10 pt) with a regular H4, LEFT-ragged
 * body with deep 24 pt indent steps creating a distinct information
 * column, RIGHT-aligned captions and page furniture (offset 30 pt), dash
 * markers and asymmetric table cell padding (3/6 pt).
 */
const CONTEMPORARY_ASYMMETRICAL: BodyThemeStructuralTokens = {
  headings: {
    weight: { 1: 'bold', 2: 'bold', 3: 'bold', 4: 'normal' },
    align: 'left',
    marginTopPt: 20,
    marginBottomPt: 10,
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
    offsetPt: 30,
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

/**
 * Traditional Serif — book-like serif text, formal hierarchy, classic spacing.
 *
 * Composition (P04-M3) — deliberately NOT Classic Formal with another
 * shade: book-like typesetting where SIZE carries the hierarchy — a
 * strong chapter-style H1 with REGULAR-weight levels 2–4 (Classic is
 * all-bold), airier 14/8 pt heading margins (Classic 10/6), 21 pt
 * indent steps (Classic 18), unfilled table headers with a regular
 * header row and borderless cells (no vertical dividers), larger 10 pt
 * italic captions with book-style 4/10 pt spacing, a warm brown accent
 * (#5c4a32 — the only chromatic warm accent), and deep 8.5 pt furniture
 * at a 34 pt offset (Classic 9 pt / 28).
 */
const TRADITIONAL_SERIF: BodyThemeStructuralTokens = {
  headings: {
    weight: { 1: 'bold', 2: 'normal', 3: 'normal', 4: 'normal' },
    align: 'left',
    marginTopPt: 14,
    marginBottomPt: 8,
    decoration: 'none',
  },
  paragraphs: { align: 'justify', indentStepPt: 21 },
  lists: { indentPt: 26, itemSpacingPt: 4, markerStyle: 'circle' },
  tables: {
    borderColor: '#999999',
    borderWidthPt: 0.5,
    headerBackground: '#ffffff',
    headerBorderWidthPt: 1,
    headerBorderColor: '#444444',
    headerTextColor: '#000000',
    headerWeight: 'normal',
    cellPaddingVpt: 4,
    cellPaddingHpt: 5,
    cellDividerColor: '#cccccc',
    cellDividerWidthPt: 0,
    marginBottomPt: 10,
  },
  captions: {
    sizePt: 10,
    italic: true,
    marginTopPt: 4,
    marginBottomPt: 10,
    tableAlign: 'left',
    figureAlign: 'center',
    color: '#000000',
  },
  separators: {
    sectionRuleColor: '#777777',
    sectionRuleWidthPt: 0.5,
    accentColor: '#5c4a32',
  },
  frame: { style: 'none', color: '#5c4a32', widthPt: 1 },
  pageFurniture: {
    fontSizePt: 8.5,
    offsetPt: 34,
    align: 'center',
    color: '#666666',
  },
  colors: {
    text: '#1a1a1a',
    heading: '#1a1a1a',
    accent: '#5c4a32',
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
      structuralDesign:
        'Formal report baseline: all-bold levels 1–4 at 10/6 pt heading margins, justified body with 18 pt indent steps, restrained 0.75 pt rules, quiet gray-header tables with bold headers and 0.5 pt dividers, italic 9.5 pt captions, centered 9 pt furniture at a 28 pt offset, and an all-neutral gray palette.',
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
      structuralDesign:
        'Airy rhythm: widest heading margins (18/10 pt) with a regular-weight H4, left-ragged body at 16 pt indent steps, hairline 0.5 pt rules, a white table header capped by one decisive black rule with a regular (non-bold) header row, non-italic captions with 12 pt bottom space, and quiet 8 pt / #999999 furniture on soft #111111 body ink.',
      implementationStatus: 'composition-verified',
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
        'Centered expressive headings in editorial accent ink',
      ],
      structuralDesign:
        'Magazine composition: the only CENTERED all-bold headings, in dark crimson ink at 18/10 pt; justified body; black table headers with white text on #1a1a1a; centered crimson italic captions (10 pt); 1.25 pt rules with crimson accents; and right-aligned page furniture.',
      implementationStatus: 'composition-verified',
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
      structuralDesign:
        'Journal density: tightest rhythm in the catalogue — 8/4 pt heading margins, 12 pt indent steps, 2 pt table cell padding, 0.5 pt hairlines, the smallest captions (8.5 pt italic, 2/6 pt), and small 8 pt furniture at a 24 pt offset.',
      implementationStatus: 'composition-verified',
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
      structuralDesign:
        'Specification structure: underlined all-bold headings at 14/6 pt, 20 pt indent steps, square list markers, a heavy 1 pt black table grid with 0.75 pt dividers, non-italic left-aligned labels (table and figure), 1.25 pt black section rules, and left-aligned furniture.',
      implementationStatus: 'composition-verified',
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
      structuralDesign:
        'Branded hierarchy: bold levels 1–3 with a regular H4 at 16/8 pt, navy-on-pale-blue table headers (#d9e2f3 / #1f3864 / #2f5597), navy captions, 1 pt brand-blue section rules, and navy centered furniture at a 26 pt offset — one brand color family across the whole page.',
      implementationStatus: 'composition-verified',
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
      structuralDesign:
        'Modular graphic system: teal-accented all-bold headings at 14/8 pt in #0f4c5c ink, boxy 5/8 pt table cells on a pale teal header with teal header text, square markers, the thickest section rules of the catalogue (1.5 pt near-black graphic lines), and 9 pt furniture at a 30 pt offset.',
      implementationStatus: 'composition-verified',
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
      structuralDesign:
        'Formal framed treatment: a solid 1.5 pt page border around every sheet (the widest frame in the catalogue), 12/6 pt heading margins, traditional italic captions, bordered gray-header tables with a black header rule, and 9 pt furniture set 32 pt inside the frame.',
      implementationStatus: 'composition-verified',
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
      structuralDesign:
        'Selective asymmetry: widest heading margins (20/10 pt) with a regular H4, left-ragged body with deep 24 pt indent steps forming a distinct information column, right-aligned captions and page furniture (offset 30 pt), dash markers, and asymmetric table cell padding (3/6 pt).',
      implementationStatus: 'composition-verified',
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
      structuralDesign:
        'Book-like typesetting (deliberately distinct from Classic Formal): size-driven hierarchy — a strong chapter-style H1 with regular-weight levels 2–4 (Classic is all-bold), airier 14/8 pt heading margins, 21 pt indent steps, unfilled table headers with a regular header row and borderless cells (no vertical dividers), larger 10 pt italic captions at 4/10 pt, a warm brown accent (#5c4a32), and deep 8.5 pt furniture at a 34 pt offset.',
      implementationStatus: 'composition-verified',
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
