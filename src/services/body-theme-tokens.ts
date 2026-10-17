/**
 * DocStudio — Body-theme token contract, monochrome policy & resolver (P04-M2)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * `project_details.md` §8.3 requires ten body-page themes with genuinely
 * different typographic and compositional rules.  P04-M2 establishes the
 * SHARED foundation: one typed token contract, one registry keyed by the
 * authoritative `BodyThemeId` union, one deterministic resolver, and one
 * reusable monochrome policy.  P04-M3 implements and verifies the ten
 * finished compositions on top of this framework.
 *
 * Design decisions (P04-M2)
 * ─────────────────────────
 * • Document typography stays AUTHORITATIVE: font family, fallbacks, base
 *   size, line spacing and paragraph spacing flow from `TypographySettings`
 *   through the resolver unchanged (P04-M1, project_details.md §8.2), and
 *   heading sizes are derived centrally by `typography-tokens.ts`.
 *   Themes contribute STRUCTURE — hierarchy, rhythm, lists, tables,
 *   captions, separators, framing, page furniture and colors — never a
 *   competing typography scale.
 * • `classic-formal` is the functional default: its structural tokens
 *   equal the exact values the P02-M4 renderer used before theming
 *   existed, so the committed P02-M4 baseline PDF stays byte-identical.
 * • The other nine registry entries carry
 *   `implementationStatus: 'foundation-planned'` — registry + token
 *   scaffold only; P04-M3 owns their finished compositions.  Nothing in
 *   this module claims those themes are visually complete.
 * • Monochrome uses `pageTypography.monochrome` and transforms COLOR
 *   tokens only; every structural token is preserved.  It is a pure,
 *   side-effect-free function of the resolved tokens and is completely
 *   independent of the application `ThemeMode` interface appearance
 *   (light / dark / multicolor — `src/types/index.ts`).
 * • Unknown theme ids THROW — never a silent fallback to an arbitrary
 *   finished theme (verification requirement §7.11).
 *
 * Renderer consumption (explicit limitations, P04-M2)
 * ──────────────────────────────────────────────────
 * The P02-M4 react-pdf path consumes typography, headings, paragraphs,
 * tables, captions, page furniture, muted ink and — when framed — the
 * frame token.  List, separator-rule and accent-rule tokens are defined
 * for P04-M3 but not yet emitted (no list blocks exist in the PoC path;
 * heading decorations only emit `underline`).  See `poc-document.tsx`.
 *
 * @module services/body-theme-tokens
 */

import type {
  BodyThemeId,
  CssColor,
  TypographySettings,
} from '../types/document';
import {
  deriveHeadingSizesPt,
  type HeadingLevel,
} from './typography-tokens';
import { BODY_THEME_REGISTRY } from './body-theme-registry';

// ─────────────────────────────────────────────────────────────────────────────
// Token contract
// ─────────────────────────────────────────────────────────────────────────────

/** Horizontal alignment expressible by structural theme tokens. */
export type ThemeTextAlign = 'left' | 'center' | 'right' | 'justify';

/**
 * Honest per-theme implementation status (verification requirement §7.2):
 * • `default-verified`   — classic-formal reproduces P04-M1's established
 *                          typography and default appearance (verified in
 *                          verify_p04_m2.mjs against the P02-M4 baseline).
 * • `foundation-planned` — registry metadata and a token scaffold exist so
 *                          P04-M3 can build the composition; the theme's
 *                          finished visual design is NOT implemented or
 *                          verified yet.
 */
export type ThemeImplementationStatus =
  | 'default-verified'
  | 'foundation-planned';

/**
 * The color inherited from the PDF engine when no explicit color is set
 * (black).  The P02-M4 renderer OMITS a color property whenever a theme
 * matches this value, so the default path emits exactly the operators it
 * did before theming existed (byte-identity protection); non-black theme
 * inks are applied.
 */
export const DEFAULT_TEXT_COLOR: CssColor = '#000000';

export interface HeadingTokens {
  /** Hierarchy: weight per heading level (schema levels 1–4). */
  weight: Record<HeadingLevel, 'bold' | 'normal'>;
  align: ThemeTextAlign;
  marginTopPt: number;
  marginBottomPt: number;
  /** Hierarchy decoration where the rendering path supports it. */
  decoration: 'none' | 'underline';
}

export interface ParagraphTokens {
  align: ThemeTextAlign;
  /** Indent applied per schema `indentLevel` step. */
  indentStepPt: number;
}

export interface ListTokens {
  indentPt: number;
  itemSpacingPt: number;
  markerStyle: 'disc' | 'circle' | 'square' | 'dash';
}

export interface TableTokens {
  borderColor: CssColor;
  borderWidthPt: number;
  headerBackground: CssColor;
  headerBorderWidthPt: number;
  headerBorderColor: CssColor;
  headerTextColor: CssColor;
  headerWeight: 'bold' | 'normal';
  cellPaddingVpt: number;
  cellPaddingHpt: number;
  cellDividerColor: CssColor;
  cellDividerWidthPt: number;
  marginBottomPt: number;
}

export interface CaptionTokens {
  sizePt: number;
  italic: boolean;
  marginTopPt: number;
  marginBottomPt: number;
  tableAlign: ThemeTextAlign;
  figureAlign: ThemeTextAlign;
  color: CssColor;
}

export interface SeparatorTokens {
  sectionRuleColor: CssColor;
  sectionRuleWidthPt: number;
  accentColor: CssColor;
}

/**
 * Page framing (§8.3 “Framed Document”) where the rendering path supports
 * it.  The style union matches what @react-pdf can actually emit
 * (`dashed | dotted | solid`) — the contract expresses no value the
 * renderer cannot render.
 */
export interface FrameTokens {
  style: 'none' | 'solid' | 'dashed' | 'dotted';
  color: CssColor;
  widthPt: number;
}

export interface PageFurnitureTokens {
  fontSizePt: number;
  /** Distance of the fixed header/footer from the page edge, in points. */
  offsetPt: number;
  align: ThemeTextAlign;
  color: CssColor;
}

export interface ThemeColorTokens {
  text: CssColor;
  heading: CssColor;
  accent: CssColor;
  rule: CssColor;
  mutedText: CssColor;
}

/**
 * The shared, typed body-theme token contract.  Every section is a plain
 * JSON-serializable value object — no functions, no component-specific
 * one-off styles — so all ten themes implement the same shape and the
 * resolver stays deterministic and side-effect-free.
 */
export interface BodyThemeTokens {
  /**
   * Authoritative document typography (passed through unchanged) plus the
   * centrally derived heading scale (P04-M1, §8.2).
   */
  typography: {
    fontFamily: string;
    fontFallbacks: string[];
    baseFontSizePt: number;
    lineHeight: number;
    paragraphSpacingPt: number;
    headingSizesPt: Record<HeadingLevel, number>;
  };
  headings: HeadingTokens;
  paragraphs: ParagraphTokens;
  lists: ListTokens;
  tables: TableTokens;
  captions: CaptionTokens;
  separators: SeparatorTokens;
  frame: FrameTokens;
  pageFurniture: PageFurnitureTokens;
  colors: ThemeColorTokens;
}

/** The theme-defined part of the tokens (everything typography-derived is resolver-owned). */
export type BodyThemeStructuralTokens = Omit<BodyThemeTokens, 'typography'>;

// ─────────────────────────────────────────────────────────────────────────────
// Registry metadata contract (data lives in body-theme-registry.ts)
// ─────────────────────────────────────────────────────────────────────────────

export interface BodyThemeMetadata {
  id: BodyThemeId;
  displayName: string;
  /** Design intent in the words of project_details.md §8.3. */
  intent: string;
  /** Structural characteristics P04-M3 will implement for this theme. */
  plannedCharacteristics: readonly string[];
  implementationStatus: ThemeImplementationStatus;
}

export interface BodyThemeDefinition {
  metadata: BodyThemeMetadata;
  structural: BodyThemeStructuralTokens;
}

// ─────────────────────────────────────────────────────────────────────────────
// Monochrome policy (§8.3: every body theme requires monochrome mode)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Deterministic, documented fallback for invalid or unsupported color
 * input: pure black ink.  Registry tokens are validated to be parseable
 * (verify_p04_m2.mjs test 9), so this path is defensive only — it exists
 * so monochrome can never emit a malformed color string.
 */
export const MONO_INVALID_COLOR_FALLBACK: CssColor = '#000000';

interface RgbColor {
  r: number;
  g: number;
  b: number;
  /** 0–1; 1 when the input carries no alpha. */
  a: number;
}

const HEX2 = (n: number): string => n.toString(16).padStart(2, '0');

/**
 * Parse the supported, predictable color grammar:
 * `#RGB`, `#RRGGBB`, `#RRGGBBAA`, `rgb(r, g, b)`, `rgba(r, g, b, a)`.
 * Anything else (named colors, `%`/unit values, malformed hex, out-of-
 * range channels) returns `null` — it is never guessed at.
 */
function parseColorValue(input: CssColor): RgbColor | null {
  if (typeof input !== 'string') return null;
  const value = input.trim().toLowerCase();

  if (value.startsWith('#')) {
    const hex = value.slice(1);
    if (!/^[0-9a-f]+$/.test(hex)) return null;
    if (hex.length === 3) {
      return {
        r: parseInt(hex[0] + hex[0], 16),
        g: parseInt(hex[1] + hex[1], 16),
        b: parseInt(hex[2] + hex[2], 16),
        a: 1,
      };
    }
    if (hex.length === 6 || hex.length === 8) {
      return {
        r: parseInt(hex.slice(0, 2), 16),
        g: parseInt(hex.slice(2, 4), 16),
        b: parseInt(hex.slice(4, 6), 16),
        a: hex.length === 8 ? parseInt(hex.slice(6, 8), 16) / 255 : 1,
      };
    }
    return null;
  }

  const fnMatch = /^rgba?\(([^)]*)\)$/.exec(value);
  if (fnMatch) {
    const parts = fnMatch[1].split(',').map((s) => s.trim());
    if (parts.length !== 3 && parts.length !== 4) return null;
    if (parts.some((p) => p === '')) return null;
    const nums = parts.map(Number);
    if (nums.some((n) => !Number.isFinite(n))) return null;
    const [r, g, b] = nums;
    if ([r, g, b].some((n) => n < 0 || n > 255)) return null;
    const a = parts.length === 4 ? nums[3] : 1;
    if (a < 0 || a > 1) return null;
    return { r: Math.round(r), g: Math.round(g), b: Math.round(b), a };
  }

  return null;
}

/**
 * Convert any supported color to a readable monochrome equivalent:
 * grayscale by Rec.709 relative-luminance weights, rounded to whole
 * channels, emitted as lowercase `#rrggbb` (plus `aa` when the input had
 * transparency).  Already-gray inputs round-trip unchanged, making the
 * conversion idempotent.  Invalid input becomes
 * `MONO_INVALID_COLOR_FALLBACK` — an explicit safe policy, never a
 * malformed string.  Pure: no document state, no side effects.
 */
export function toMonochromeColor(input: CssColor): CssColor {
  const rgb = parseColorValue(input);
  if (!rgb) return MONO_INVALID_COLOR_FALLBACK;
  const luminance = Math.round(0.2126 * rgb.r + 0.7152 * rgb.g + 0.0722 * rgb.b);
  const gray = Math.min(255, Math.max(0, luminance));
  const base = HEX2(gray) + HEX2(gray) + HEX2(gray);
  if (rgb.a >= 1) return `#${base}`;
  const alpha = Math.min(255, Math.max(0, Math.round(rgb.a * 255)));
  return `#${base}${HEX2(alpha)}`;
}

/**
 * Apply the monochrome policy to a resolved token set.
 *
 * Color fields are converted with `toMonochromeColor`; EVERY structural
 * field (hierarchy, spacing, alignment, borders, widths, separators,
 * framing style, page-furniture geometry, typography pass-through) is
 * preserved untouched.  The input is never mutated — a fresh token set
 * is returned.  The theme id, registry entry and document content are
 * not inputs here and therefore cannot change.
 */
export function applyMonochrome(tokens: BodyThemeTokens): BodyThemeTokens {
  const t = tokens;
  return {
    typography: {
      ...t.typography,
      fontFallbacks: [...t.typography.fontFallbacks],
      headingSizesPt: { ...t.typography.headingSizesPt },
    },
    headings: { ...t.headings, weight: { ...t.headings.weight } },
    paragraphs: { ...t.paragraphs },
    lists: { ...t.lists },
    tables: {
      ...t.tables,
      borderColor: toMonochromeColor(t.tables.borderColor),
      headerBackground: toMonochromeColor(t.tables.headerBackground),
      headerBorderColor: toMonochromeColor(t.tables.headerBorderColor),
      headerTextColor: toMonochromeColor(t.tables.headerTextColor),
      cellDividerColor: toMonochromeColor(t.tables.cellDividerColor),
    },
    captions: { ...t.captions, color: toMonochromeColor(t.captions.color) },
    separators: {
      ...t.separators,
      sectionRuleColor: toMonochromeColor(t.separators.sectionRuleColor),
      accentColor: toMonochromeColor(t.separators.accentColor),
    },
    frame: { ...t.frame, color: toMonochromeColor(t.frame.color) },
    pageFurniture: {
      ...t.pageFurniture,
      color: toMonochromeColor(t.pageFurniture.color),
    },
    colors: {
      text: toMonochromeColor(t.colors.text),
      heading: toMonochromeColor(t.colors.heading),
      accent: toMonochromeColor(t.colors.accent),
      rule: toMonochromeColor(t.colors.rule),
      mutedText: toMonochromeColor(t.colors.mutedText),
    },
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Resolver
// ─────────────────────────────────────────────────────────────────────────────

export interface BodyThemeResolution {
  themeId: BodyThemeId;
  /** Registry metadata for the resolved theme (includes implementation status). */
  metadata: BodyThemeMetadata;
  monochrome: boolean;
  /** Fully resolved tokens: document typography + theme structure (+ mono colors). */
  tokens: BodyThemeTokens;
}

/** Runtime type guard for the authoritative union (exact registry keys). */
export function isBodyThemeId(value: unknown): value is BodyThemeId {
  return (
    typeof value === 'string' &&
    Object.prototype.hasOwnProperty.call(BODY_THEME_REGISTRY, value)
  );
}

/**
 * Resolve a body theme into the complete token set the renderer consumes.
 *
 * Inputs (all read-only):
 * 1. `themeId`   — selected `BodyThemeId` (from `pageTypography.bodyThemeId`).
 * 2. `typography` — current `TypographySettings` (authoritative, passed
 *                   through unchanged; heading sizes derived centrally).
 * 3. `monochrome` — document's `pageTypography.monochrome` flag.
 *
 * Deterministic (identical inputs → deep-equal outputs), side-effect-free
 * (never mutates `typography` or the registry) and explicit on failure:
 * an unknown theme id throws instead of silently mapping to a finished
 * theme.
 */
export function resolveBodyTheme(
  themeId: BodyThemeId,
  typography: TypographySettings,
  monochrome: boolean,
): BodyThemeResolution {
  const definition = isBodyThemeId(themeId)
    ? BODY_THEME_REGISTRY[themeId]
    : undefined;
  if (!definition) {
    throw new Error(
      `[body-theme] Unknown body theme id: ${JSON.stringify(themeId)}. ` +
        `Expected one of: ${Object.keys(BODY_THEME_REGISTRY).join(', ')}.`,
    );
  }

  const s = definition.structural;
  const tokens: BodyThemeTokens = {
    typography: {
      fontFamily: typography.fontFamily,
      fontFallbacks: [...typography.fontFallbacks],
      baseFontSizePt: typography.baseFontSizePt,
      lineHeight: typography.lineHeight,
      paragraphSpacingPt: typography.paragraphSpacingPt,
      headingSizesPt: deriveHeadingSizesPt(typography.baseFontSizePt),
    },
    headings: { ...s.headings, weight: { ...s.headings.weight } },
    paragraphs: { ...s.paragraphs },
    lists: { ...s.lists },
    tables: { ...s.tables },
    captions: { ...s.captions },
    separators: { ...s.separators },
    frame: { ...s.frame },
    pageFurniture: { ...s.pageFurniture },
    colors: { ...s.colors },
  };

  return {
    themeId: definition.metadata.id,
    metadata: definition.metadata,
    monochrome,
    tokens: monochrome ? applyMonochrome(tokens) : tokens,
  };
}
