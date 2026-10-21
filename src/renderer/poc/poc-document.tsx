/**
 * DocStudio — P02-M4 PoC Document Renderer (@react-pdf/renderer)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Translates a subset of the DocStudio block model into react-pdf
 * primitives.  It intentionally supports the blocks used by the PoC
 * fixture (heading, paragraph, page-break, table, image) plus the narrow,
 * documented P04-M3 additions the ten themes need to show their structure:
 * `list` (bullet/numbered/checklist — see ListBlock for exact scope),
 * `horizontal-line` (themed section rule) and `section-break` (title +
 * themed rule), plus the P06-M2 structural content renderers:
 * `metadata-block`, `revision-history`, `reference` and `exhibit`, the
 * block-authored rule style (`horizontal-line` with
 * `styleSource: 'block'`) and the reliable page-break position semantics.
 * The P06-M3 formula renderer maps `formula` through MathJax SVG →
 * react-pdf vector primitives (`poc-math-svg.tsx` converts the string,
 * `formula-layout.ts` plans the fit-scale and "Where:" geometry).  The
 * remaining lab-specific block types (image/signature at P06-M4 and the
 * later-phase blocks) keep the visible fallback marker until their
 * checkpoints (P06-M4/P06-M5+).
 *
 * Mapping decisions (see the roadmap decision record):
 * • Page geometry — `pageSetup` (all five schema sizes, orientation,
 *   margins) drives <Page>; sizes map to pdfkit's standard formats.
 * • Typography   — schema pt sizes map 1:1 to PDF points; body size,
 *   line spacing and paragraph spacing come from
 *   `doc.pageTypography.typography`. The schema default family "Segoe UI"
 *   is MAPPED to the PDF standard-14 Times family: no font file is
 *   embedded, so the output is license-clean and fully offline. Registering
 *   a distributable body font is a Phase 08 task; unregistered families
 *   fall back to Helvetica (verified in verify_p02_m4.mjs).
 * • Headings     — sizes DERIVED from the centralized typography tokens
 *   (`services/typography-tokens.ts`) scaled by the configured base font
 *   size (P04-M1, project_details.md §8.2); Times-Bold with inline
 *   bold/italic/underline spans mapped to nested <Text> styles.
 * • Page furniture — header/footer GRIDS and page numbering come from
 *   the authoritative `doc.headerFooter` settings (P06-M1, §9; band
 *   activation authorized as DEC-008 option (a) on 2026-10-20), with
 *   `pageTypography.displayHeader` staying the master switch for the
 *   header grid (P04-M1, §8.4).  The legacy hard-coded `PocPageFurniture`
 *   remains exported for the P04-M3 theme gallery only.
 * • Body themes   — `pageTypography.bodyThemeId` + `monochrome` resolve
 *   through `services/body-theme-tokens.ts` (P04-M2) into ONE token set
 *   consumed everywhere below; the stylesheet holds only engine-level
 *   constants (font mapping, flex/absolute geometry).  Every themed value
 *   flows from `resolveBodyTheme`.  Unsupported token consumption (list
 *   indent, separator/accent rules) is an explicit P04-M2 limitation —
 *   see the token module.
 * • Tables       — react-pdf v4 has NO Table primitive; the table is
 *   composed of flex rows with fixed column widths and unbreakable rows
 *   (wrap={false}), so a row moves to the next page whole.
 * • Page breaks  — the schema `page-break` block maps to the `break`
 *   prop applied to the FOLLOWING content block; leading/trailing and
 *   consecutive breaks are handled without emitting unintended blank
 *   pages (P06-M2, see the mapping loop in `PocDocument`).
 * • Page numbers — resolved per page from the band's §9
 *   `pageNumberFormat` (`Page X of Y` / `X/Y` / `X` / `none`) through the
 *   engine's actual `{ pageNumber, totalPages }` (see
 *   `poc-page-furniture.tsx` for the geometry and suppression rules).
 * • Images       — embedded base64 assets render as data URIs (exactly how
 *   `.docstudio` assets are stored); a missing asset throws a clear error
 *   instead of silently omitting content.
 *
 * @module renderer/poc/poc-document
 */

import React from 'react';
import {
  Document,
  Page,
  Text,
  View,
  Image,
  Link,
  StyleSheet,
} from '@react-pdf/renderer';
import type { DocStudioDocument, PageSize } from '../../types/document';
import type {
  AnyBlockData,
  BulletStyle,
  CalloutBlockData,
  ExhibitBlockData,
  FormulaBlockData,
  HeadingBlockData,
  HorizontalLineBlockData,
  InlineSpan,
  ImageBlockData,
  ListBlockData,
  MetadataBlockData,
  ParagraphBlockData,
  ReferenceBlockData,
  RevisionHistoryBlockData,
  SectionBreakBlockData,
  TableBlockData,
  TableHeaderStyle,
} from '../../types/blocks';
import { coverFieldLabel } from '../../services/front-page';
import { effectivePageDimensionsMm } from '../../services/page-typography';
import {
  DEFAULT_TEXT_COLOR,
  resolveBodyTheme,
  toMonochromeColor,
  type BodyThemeTokens,
  type TableTokens,
} from '../../services/body-theme-tokens';
import {
  computeHeadingNumbering,
  HEADING_PREFIX_SEPARATOR,
} from '../../services/heading-numbering';
import { computeListLabels } from '../../services/list-numbering';
import { sanitizeHref, normalizeHexColor } from '../../services/rich-text';
import { estimateTextWidthPt, renderLatexToMathSvg } from '../../services/math-engine';
import { FORMULA_SYMBOL_GAP_PT, planFormulaLayout } from './formula-layout';
import { PocCoverPage } from './poc-cover-page';
import { mathSvgToReact, parseMathSvgDocument } from './poc-math-svg';
import { PocConfiguredFurniture } from './poc-page-furniture';
import { allocateTableColumnWidths, estimateRowHeightPt, tableColumnCount } from './table-layout';

/** mm → pt conversion (1 mm = 72 / 25.4 pt). */
export function mmToPt(mm: number): number {
  return (mm * 72) / 25.4;
}

/** The font family the PoC uses for body text (PDF standard-14). */
export const POC_BODY_FONT = 'Times-Roman';

/** Schema page sizes → pdfkit standard page formats (P04-M1). */
export const PAGE_FORMATS: Record<PageSize, 'A4' | 'A3' | 'A5' | 'LETTER' | 'LEGAL'> = {
  A4: 'A4',
  A3: 'A3',
  A5: 'A5',
  Letter: 'LETTER',
  Legal: 'LEGAL',
};

/**
 * Standard page dimensions in points (width × height) — the rounded
 * typographic dimensions of each format. Content-width math uses these
 * constants so the default A4 path stays byte-identical to the P02-M4
 * committed artifact (595.28 − margins, exactly as originally written;
 * verified 13,854 bytes). The image width below keeps P02-M4's exact-mm
 * formula unchanged for the same reason.
 */
const PAGE_DIMENSIONS_PT: Record<PageSize, { width: number; height: number }> = {
  A4: { width: 595.28, height: 841.89 },
  A3: { width: 841.89, height: 1190.55 },
  A5: { width: 419.53, height: 595.28 },
  Letter: { width: 612, height: 792 },
  Legal: { width: 792, height: 612 },
};

/**
 * Page geometry for the document (P04-M1 page setup rules): margins in
 * points and the usable content width.  Extracted in P04-M3 so the theme
 * gallery renders through the SAME geometry maths as `PocDocument`
 * instead of duplicating it — exported for reuse, values unchanged.
 */
export interface PocLayout {
  marginTop: number;
  marginRight: number;
  marginBottom: number;
  marginLeft: number;
  pageWidthPt: number;
  /** Page height in points (portrait → long edge; landscape → short edge). */
  pageHeightPt: number;
  contentWidth: number;
}

export function computePocLayout(doc: DocStudioDocument): PocLayout {
  const { orientation, margins } = doc.pageSetup;
  const marginTop = mmToPt(margins.topMm);
  const marginRight = mmToPt(margins.rightMm);
  const marginBottom = mmToPt(margins.bottomMm);
  const marginLeft = mmToPt(margins.leftMm);
  const pageSizePt = PAGE_DIMENSIONS_PT[doc.pageSetup.size];
  const pageWidthPt =
    orientation === 'landscape' ? pageSizePt.height : pageSizePt.width;
  const pageHeightPt =
    orientation === 'landscape' ? pageSizePt.width : pageSizePt.height;
  const contentWidth = pageWidthPt - marginLeft - marginRight;
  return { marginTop, marginRight, marginBottom, marginLeft, pageWidthPt, pageHeightPt, contentWidth };
}

/**
 * Engine-level base styles only (P04-M2): font mapping (schema family →
 * PDF standard-14 Times), flex/absolute geometry.  Every themed value —
 * sizes, weights, alignment, spacing, borders, colors — comes from the
 * resolved body-theme token set in `PocDocument` below, so the framework
 * is the single source of styling truth.
 */
const styles = StyleSheet.create({
  bodyPage: {
    paddingHorizontal: 0,
    paddingVertical: 0,
    fontFamily: POC_BODY_FONT,
  },
  heading: {
    fontFamily: POC_BODY_FONT,
  },
  caption: {
    fontFamily: POC_BODY_FONT,
  },
  footer: {
    fontFamily: POC_BODY_FONT,
    position: 'absolute',
    left: 0,
    right: 0,
  },
  header: {
    fontFamily: POC_BODY_FONT,
    position: 'absolute',
    left: 0,
    right: 0,
  },
});

/** Column width fractions for PoC tables moved to `table-layout.ts`
 *  (P05-M4): one pure, unit-tested width policy shared with the verify
 *  suite.  The exported `COLUMN_FRACTIONS` there is the same array that
 *  lived here, so 4-column rendering stays byte-identical. */

// ─────────────────────────────────────────────────────────────────────────────
// Inline rich text
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Inline rich text (P05-M2 additions: strikethrough, font colour,
 * highlight and SAFE hyperlinks).  Every new property is applied only
 * when the span actually carries it, so spans without those fields emit
 * exactly the style set they always did — the P02-M4/P04 byte-identity
 * guard.  Hrefs are re-sanitised at render time (`sanitizeHref`), so an
 * unsafe link that somehow reached stored data can never become a live
 * PDF link annotation; colours are normalised the same way.  A link
 * renders as a react-pdf `Link` (a real PDF link annotation); everything
 * else stays a plain `Text`.
 */
function renderSpans(spans: InlineSpan[]): React.ReactNode {
  return spans.map((span, i) => {
    const decoration: 'none' | 'underline' | 'line-through' | 'underline line-through' =
      span.underline === true && span.strikethrough === true
        ? 'underline line-through'
        : span.underline === true
          ? 'underline'
          : span.strikethrough === true
            ? 'line-through'
            : 'none';
    const color = normalizeHexColor(span.color);
    const highlight = normalizeHexColor(span.highlight);
    // Concrete literal-typed object: assignable to both Text's and Link's
    // style props without widening to `string`.
    const style: {
      fontWeight: 'bold' | 'normal';
      fontStyle: 'italic' | 'normal';
      textDecoration: 'none' | 'underline' | 'line-through' | 'underline line-through';
      color?: string;
      backgroundColor?: string;
    } = {
      fontWeight: span.bold ? 'bold' : 'normal',
      fontStyle: span.italic ? 'italic' : 'normal',
      textDecoration: decoration,
      ...(color !== null ? { color } : {}),
      ...(highlight !== null ? { backgroundColor: highlight } : {}),
    };
    const href = sanitizeHref(span.href);
    if (href !== null) {
      return (
        <Link key={i} src={href} style={style}>
          {span.text}
        </Link>
      );
    }
    return (
      <Text key={i} style={style}>
        {span.text}
      </Text>
    );
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Block renderers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Heading block (§10.1).  Outline numbering (P05-M2) is DERIVED at
 * render time by `computeHeadingNumbering` over the authoritative block
 * order — never stored in `text` — and passed in as `prefix`; when no
 * prefix is supplied the emitted node is exactly the pre-numbering one
 * (byte-identity guard: the P02-M4 baseline and the P04 galleries use
 * `numbered: false` headings throughout).
 */
function Heading({
  block,
  tokens,
  prefix,
}: {
  block: HeadingBlockData;
  tokens: BodyThemeTokens;
  prefix?: string;
}) {
  const heading = tokens.headings;
  return (
    <Text
      style={[
        styles.heading,
        {
          fontSize: tokens.typography.headingSizesPt[block.level],
          fontWeight: heading.weight[block.level],
          marginTop: heading.marginTopPt,
          marginBottom: heading.marginBottomPt,
          // Deviation-only properties: classic-formal matches the engine
          // defaults, so the default path emits the exact style set it did
          // before theming existed (byte-identity protection, P04-M2).
          ...(heading.align !== 'left' ? { textAlign: heading.align } : {}),
          ...(heading.decoration !== 'none'
            ? { textDecoration: heading.decoration }
            : {}),
          ...(tokens.colors.heading !== DEFAULT_TEXT_COLOR
            ? { color: tokens.colors.heading }
            : {}),
        },
      ]}
      wrap
    >
      {prefix !== undefined ? `${prefix}${HEADING_PREFIX_SEPARATOR}${block.text}` : block.text}
    </Text>
  );
}

function Paragraph({ block, tokens }: { block: ParagraphBlockData; tokens: BodyThemeTokens }) {
  const indent = block.indentLevel > 0 ? block.indentLevel * tokens.paragraphs.indentStepPt : 0;
  return (
    <Text
      style={[
        {
          marginLeft: indent,
          marginBottom: tokens.typography.paragraphSpacingPt,
          textAlign: tokens.paragraphs.align,
          ...(tokens.colors.text !== DEFAULT_TEXT_COLOR
            ? { color: tokens.colors.text }
            : {}),
        },
      ]}
      wrap
    >
      {renderSpans(block.spans)}
    </Text>
  );
}

/**
 * Caption style from the resolved caption tokens, shared by table and
 * figure captions (single token-application site).  `alignKey` selects
 * which token the slot uses; an `align` of `'left'` is omitted because it
 * equals the engine default — that keeps classic-formal's table caption
 * emitting exactly the style set it did before theming (byte-identity
 * protection) while still applying every real deviation.
 */
function captionStyle(
  caption: BodyThemeTokens['captions'],
  alignKey: 'tableAlign' | 'figureAlign',
) {
  const fontStyle: 'normal' | 'italic' = caption.italic ? 'italic' : 'normal';
  const align = caption[alignKey];
  return [
    styles.caption,
    {
      fontStyle,
      fontSize: caption.sizePt,
      marginTop: caption.marginTopPt,
      marginBottom: caption.marginBottomPt,
      ...(align !== 'left' ? { textAlign: align } : {}),
      ...(caption.color !== DEFAULT_TEXT_COLOR ? { color: caption.color } : {}),
    },
  ];
}

/** Row-style contract for the table renderer (plain values only). */
interface TableRowStyle {
  borderBottomWidth: number;
  borderBottomColor: string;
  borderTopWidth?: number;
  borderTopColor?: string;
  backgroundColor?: string;
}

/**
 * Header-row treatment (§10.5 light/medium/heavy + §4.6 source policy).
 *
 * The THEME path returns exactly the pre-P05-M4 values, so every
 * existing schema-v1 document renders byte-identically; only an
 * explicit `headerStyleSource: 'block'` opt-in applies the stored
 * treatment.  The three explicit treatments are structural — neutral
 * grey fills and increasing border weights (heavy adds a top rule) —
 * so they stay distinguishable in monochrome through contrast and
 * structure, not colour alone.
 */
function headerRowStyle(headerStyle: TableHeaderStyle | undefined, t: TableTokens): TableRowStyle {
  switch (headerStyle) {
    case 'medium':
      return {
        borderBottomWidth: 1.5,
        borderBottomColor: t.headerBorderColor,
        backgroundColor: '#ECECEC',
      };
    case 'heavy':
      return {
        borderBottomWidth: 2.5,
        borderBottomColor: t.headerBorderColor,
        borderTopWidth: 2.5,
        borderTopColor: t.headerBorderColor,
        backgroundColor: '#D8D8D8',
      };
    case 'light':
    default:
      return { borderBottomWidth: 0.75, borderBottomColor: t.headerBorderColor };
  }
}

function tableRowStyle(
  block: TableBlockData,
  isHeader: boolean,
  t: TableTokens,
): TableRowStyle {
  if (!isHeader) {
    return { borderBottomWidth: t.borderWidthPt, borderBottomColor: t.borderColor };
  }
  if (block.headerStyleSource === 'block') {
    return headerRowStyle(block.headerStyle, t);
  }
  // Theme default — the exact pre-P05-M4 expression (byte-identical).
  return {
    borderBottomWidth: t.headerBorderWidthPt,
    borderBottomColor: t.headerBorderColor,
    backgroundColor: t.headerBackground,
  };
}

/**
 * Table block (§10.5) — cell grid + optional caption.
 *
 * Widths come from the pure `table-layout` policy: one array computed
 * per table and applied to EVERY row, so boundaries line up across
 * rows and the widths always total `contentWidth` for any column
 * count and any page size (A4/A3/A5/Letter/Legal, portrait or
 * landscape flow through the same geometry).
 *
 * Page-boundary behaviour (§10.5 "predictable table behavior when a
 * table crosses a page boundary"):
 * • Cell text wraps inside the cell (`wrap` on the Text), never
 *   truncated.
 * • Rows are atomic (`wrap={false}`): the engine moves an unbreakable
 *   row to the next page rather than splitting it, so rows that fit a
 *   page stay intact, and a long table flows between rows (verified:
 *   multi-page tables retain all content).
 * • A row ESTIMATED taller than a whole content page is rendered
 *   wrappable instead — the engine cannot keep such a row atomic
 *   (it drops the overflow, verified by probe), so it is allowed to
 *   split and its content is preserved.  Normal rows are far below the
 *   threshold, so this path never activates for existing documents.
 * • Header rows are NOT repeated on continuation pages: react-pdf has
 *   no table primitive and no reliable repeat mechanism, and the
 *   renderer cannot know how much vertical space preceding content
 *   consumed.  Recorded as a Phase 08 (pagination engine) limitation.
 * • Custom column resizing is not implemented; the distributed widths
 *   above are the deliberate, consistent policy.
 */
function Table({
  block,
  doc,
  contentWidth,
  tokens,
}: {
  block: TableBlockData;
  doc: DocStudioDocument;
  contentWidth: number;
  tokens: BodyThemeTokens;
}) {
  const t = tokens.tables;
  const caption = tokens.captions;
  const columnCount = tableColumnCount(block);
  const widths = allocateTableColumnWidths(columnCount, contentWidth);
  const fallbackWidth = columnCount > 0 ? contentWidth / columnCount : 0;
  const { pageHeightPt, marginTop, marginBottom } = computePocLayout(doc);
  const availableRowHeight = pageHeightPt - marginTop - marginBottom;
  return (
    <View style={{ marginBottom: t.marginBottomPt }}>
      {block.rows.map((row, rowIndex) => {
        const isHeader = block.hasHeaderRow && rowIndex === 0;
        const atomic = estimateRowHeightPt(row, widths, tokens) <= availableRowHeight;
        return (
          <View
            key={row.id}
            style={{ flexDirection: 'row', ...tableRowStyle(block, isHeader, t) }}
            wrap={!atomic}
          >
            {row.cells.map((cell, cellIndex) => {
              const isHeaderCell = isHeader || cell.isHeader;
              return (
                <Text
                  key={cell.id}
                  style={{
                    width: widths[cellIndex] ?? fallbackWidth,
                    textAlign: cell.hAlign,
                    paddingVertical: t.cellPaddingVpt,
                    paddingHorizontal: t.cellPaddingHpt,
                    borderRightWidth: t.cellDividerWidthPt,
                    borderRightColor: t.cellDividerColor,
                    ...(isHeaderCell ? { fontWeight: t.headerWeight } : {}),
                    ...(isHeaderCell && t.headerTextColor !== DEFAULT_TEXT_COLOR
                      ? { color: t.headerTextColor }
                      : {}),
                  }}
                  wrap
                >
                  {renderSpans(cell.spans)}
                </Text>
              );
            })}
          </View>
        );
      })}
      {block.caption && (
        <Text style={captionStyle(caption, 'tableAlign')}>{block.caption}</Text>
      )}
    </View>
  );
}

function ImageBlock({ block, doc, tokens }: { block: ImageBlockData; doc: DocStudioDocument; tokens: BodyThemeTokens }) {
  const [pageWidthMm] = effectivePageDimensionsMm(doc.pageSetup.size, doc.pageSetup.orientation);
  const contentWidth = mmToPt(pageWidthMm) - mmToPt(doc.pageSetup.margins.leftMm + doc.pageSetup.margins.rightMm);
  const caption = tokens.captions;
  const captionStyles = captionStyle(caption, 'figureAlign');
  return (
    <View style={{ marginBottom: 8 }}>
      {block.images.map((image) => {
        if (!image.assetId) {
          return (
            <Text key={image.id} style={captionStyles}>
              [Empty image slot]
            </Text>
          );
        }
        const asset = doc.assets[image.assetId];
        if (!asset || !asset.base64Data) {
          // Understandable, non-silent failure for missing local assets.
          throw new Error(
            `Image asset ${image.assetId} not found in document.assets — cannot render figure.`,
          );
        }
        return (
          <View key={image.id}>
            <Image
              src={`data:${asset.mimeType};base64,${asset.base64Data}`}
              style={{
                width: contentWidth * image.widthFraction,
                alignSelf:
                  image.hAlign === 'center'
                    ? 'center'
                    : image.hAlign === 'right'
                      ? 'flex-end'
                      : 'flex-start',
              }}
            />
            {image.caption && <Text style={captionStyles}>{image.caption}</Text>}
          </View>
        );
      })}
    </View>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Lists, section rules & section breaks (P04-M3, narrow scope)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Themed section rule (P04-M3): a filled box of exactly the theme
 * token's height.  Zero-height bordered views were verified as
 * layout-unstable during P02-M4.
 */
function SectionRule({ tokens }: { tokens: BodyThemeTokens }): React.ReactElement {
  const rule = tokens.separators;
  return (
    <View
      style={{
        height: rule.sectionRuleWidthPt,
        backgroundColor: rule.sectionRuleColor,
        marginBottom: tokens.typography.paragraphSpacingPt,
      }}
    />
  );
}

/**
 * `horizontal-line` block.
 *
 * The rule's WEIGHT and COLOR come from the theme's `separators` tokens
 * on the default path, so every theme shows its own section-rule
 * language (0.5 pt quiet boundaries → 1.5 pt graphic lines).
 *
 * P06-M2 rule-style source policy (mirrors list `markerSource` / table
 * `headerStyleSource`): absent `styleSource` (or `'theme'`) keeps the
 * exact P04-M3 behaviour — byte-identical for every existing document,
 * template and gallery fixture.  `'block'` means the user edited the
 * stored rule in the editor, and the renderer then honours the block's
 * own `thicknessPt`/`color` (validated at the model boundary; the
 * defensive render-time fallbacks never let an invalid stored value
 * crash or vanish the rule).
 */
function HorizontalRuleBlock({
  block,
  tokens,
}: {
  block: HorizontalLineBlockData;
  tokens: BodyThemeTokens;
}): React.ReactElement {
  const rule = tokens.separators;
  if (block.styleSource !== 'block') {
    return <SectionRule tokens={tokens} />;
  }
  const thickness =
    typeof block.thicknessPt === 'number' && Number.isFinite(block.thicknessPt) && block.thicknessPt > 0
      ? block.thicknessPt
      : rule.sectionRuleWidthPt;
  const color = normalizeHexColor(block.color) ?? rule.sectionRuleColor;
  return (
    <View
      style={{
        height: thickness,
        backgroundColor: color,
        marginBottom: tokens.typography.paragraphSpacingPt,
      }}
    />
  );
}

/**
 * `section-break` block: optional section title + the theme's section rule.
 * The title is styled from the theme's H4 tokens (size, weight, accent ink)
 * so it reads as the theme's own section marker; the 4 pt title→rule gap is
 * an engine constant.  Document typography stays authoritative (§8.2).
 */
function SectionBreakBlock({
  block,
  tokens,
}: {
  block: SectionBreakBlockData;
  tokens: BodyThemeTokens;
}): React.ReactElement {
  const headings = tokens.headings;
  return (
    <View>
      {block.title ? (
        <Text
          style={[
            styles.heading,
            {
              fontSize: tokens.typography.headingSizesPt[4],
              fontWeight: headings.weight[4],
              marginTop: headings.marginTopPt,
              marginBottom: 4,
              ...(tokens.colors.accent !== DEFAULT_TEXT_COLOR
                ? { color: tokens.colors.accent }
                : {}),
            },
          ]}
        >
          {block.title}
        </Text>
      ) : null}
      <SectionRule tokens={tokens} />
    </View>
  );
}

/**
 * `list` block (P04-M3 narrow base; P05-M3 full marker support).
 *
 * Rendering rules
 * ───────────────
 * • BULLET markers follow the P05-M3 marker-source policy: when
 *   `markerSource` is absent or `'theme'` (every pre-P05-M3 file, all
 *   template factories and the byte-verified P04-M3 gallery fixtures),
 *   the body THEME's `lists.markerStyle` token draws the marker — the
 *   exact P04-M3 behaviour, byte-for-byte.  When the user explicitly
 *   stored `markerSource: 'block'`, the block's `bulletStyle` is honoured
 *   exactly (disc/circle/square/dash as real PDF shapes; `arrow` as the
 *   WinAnsi-safe chevron glyph `›` — the standard-14 fonts cannot
 *   encode geometric triangles, and `›` (U+203A, CP1252 0x9B) prints
 *   correctly on every available font).
 * • NUMBERED markers are DERIVED per list via `computeListLabels`
 *   (P05-M3): depth-aware counters with the block's `numberStyle`, so
 *   decimal/alpha/roman and nesting all render correctly.  Themes define
 *   no numbering token, so `numberStyle` is always honoured; a depth-0
 *   decimal list prints "1.", "2.", … exactly as the P04-M3 renderer
 *   did (byte-identity preserved for every gallery fixture).
 * • CHECKLIST items draw filled (checked) / hollow (unchecked) squares.
 * • Nesting depth steps by the paragraph indent token; item spacing comes
 *   from `lists.itemSpacingPt`; marker ink is the theme accent so each
 *   theme's list identity stays visible.
 */
function ListBlock({
  block,
  tokens,
}: {
  block: ListBlockData;
  tokens: BodyThemeTokens;
}): React.ReactElement {
  const list = tokens.lists;
  const markerInk = tokens.colors.accent;
  const baseSize = tokens.typography.baseFontSizePt;
  // Shape markers are 4 pt boxes; nudged down to sit on the first text
  // line (engine constants, scaled to the authoritative base size).
  const markerTop = Math.round(baseSize * 0.35 * 10) / 10;
  const textStyle =
    tokens.colors.text !== DEFAULT_TEXT_COLOR ? { color: tokens.colors.text } : {};

  // P05-M3 marker-source policy (module doc): the theme token stays
  // authoritative unless the user explicitly chose a block-level style.
  const bulletStyle: BulletStyle =
    block.markerSource === 'block' ? block.bulletStyle : list.markerStyle;
  // Derived numbering for NUMBERED lists only; bullet/checklist markers
  // are shapes and never touch this (P04-M3 byte-identity).
  const labels: readonly string[] | null =
    block.listType === 'numbered' ? computeListLabels(block.items, block.numberStyle) : null;

  const markerBox = (extra: Record<string, number | string | undefined>): React.ReactElement => (
    <View
      style={{
        width: 4,
        height: 4,
        marginRight: 6,
        marginTop: markerTop,
        backgroundColor: markerInk,
        ...extra,
      }}
    />
  );

  const renderMarker = (item: ListBlockData['items'][number], index: number): React.ReactNode => {
    if (block.listType === 'numbered') {
      return <Text style={{ marginRight: 6, color: markerInk }}>{labels?.[index] ?? ''}</Text>;
    }
    if (block.listType === 'checklist') {
      return item.checked
        ? markerBox({})
        : markerBox({ backgroundColor: undefined, borderWidth: 0.8, borderColor: markerInk });
    }
    switch (bulletStyle) {
      case 'circle':
        return markerBox({
          backgroundColor: undefined,
          borderWidth: 0.8,
          borderColor: markerInk,
          borderRadius: 2,
        });
      case 'square':
        return markerBox({});
      case 'dash':
        return (
          <View
            style={{
              width: 6,
              height: 1.5,
              marginRight: 6,
              marginTop: markerTop + 1,
              backgroundColor: markerInk,
            }}
          />
        );
      case 'arrow':
        // WinAnsi-safe chevron (U+203A) — an arrowhead the standard-14
        // fonts can actually encode (module doc).
        return (
          <Text style={{ marginRight: 6, marginTop: markerTop - 1, color: markerInk }}>{'›'}</Text>
        );
      case 'disc':
      default:
        return markerBox({ borderRadius: 2 });
    }
  };

  return (
    <View style={{ marginBottom: tokens.typography.paragraphSpacingPt }}>
      {block.items.map((item, index) => (
        <View
          key={item.id}
          style={{
            flexDirection: 'row',
            marginLeft: list.indentPt + item.depth * tokens.paragraphs.indentStepPt,
            marginBottom: list.itemSpacingPt,
          }}
        >
          {renderMarker(item, index)}
          <Text style={{ flex: 1, ...textStyle }}>{renderSpans(item.spans)}</Text>
        </View>
      ))}
    </View>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Callout block (P05-M3)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Semantic callout identities (project_details §10.3): each variant has a
 * visible uppercase LABEL and a dark accent rule/panel.  Meaning never
 * relies on colour alone — the label text carries it, so every variant
 * stays understandable in monochrome and in printed PDF output; the
 * accent is converted with the shared `toMonochromeColor` policy when
 * the document requests monochrome.  Unknown custom variants keep their
 * stored name as the label with a neutral gray accent (safe fallback —
 * never a crash, never silently dropped content).
 */
const CALLOUT_VARIANTS: Record<string, { label: string; accent: string }> = {
  info: { label: 'INFORMATION', accent: '#2f5d8a' },
  warning: { label: 'WARNING', accent: '#8a6400' },
  success: { label: 'SUCCESS', accent: '#2c6e49' },
  note: { label: 'NOTE', accent: '#4d4d4d' },
  danger: { label: 'DANGER', accent: '#9e2b25' },
};

/** Very light panel tint derived from an accent colour (`#rrggbb`). */
function tintFromHex(hex: string, alpha: number): string {
  const match = /^#([0-9a-fA-F]{6})$/.exec(hex);
  if (match === null) return 'rgba(120, 120, 120, 0.06)';
  const value = Number.parseInt(match[1], 16);
  const r = (value >> 16) & 0xff;
  const g = (value >> 8) & 0xff;
  const b = value & 0xff;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function CalloutBlock({
  block,
  tokens,
  monochrome,
}: {
  block: CalloutBlockData;
  tokens: BodyThemeTokens;
  monochrome: boolean;
}): React.ReactElement {
  const variant =
    typeof block.variant === 'string' && block.variant.trim() !== ''
      ? block.variant.trim()
      : 'CALLOUT';
  const known = CALLOUT_VARIANTS[variant.toLowerCase()];
  const label = known?.label ?? variant.toUpperCase();
  const accent = monochrome
    ? toMonochromeColor(known?.accent ?? '#6b6b6b')
    : (known?.accent ?? '#6b6b6b');
  const tint = tintFromHex(accent, 0.06);
  const baseSize = tokens.typography.baseFontSizePt;
  const textStyle =
    tokens.colors.text !== DEFAULT_TEXT_COLOR ? { color: tokens.colors.text } : {};
  const hasTitle = block.title !== undefined && block.title !== '';

  return (
    <View style={{ flexDirection: 'row', marginBottom: tokens.typography.paragraphSpacingPt }}>
      {/* Semantic accent rule — the meaning itself lives in the label. */}
      <View style={{ width: 3, marginRight: 6, backgroundColor: accent }} />
      <View
        style={{
          flex: 1,
          borderWidth: 0.6,
          borderColor: accent,
          backgroundColor: tint,
          paddingLeft: 8,
          paddingRight: 8,
          paddingTop: 5,
          paddingBottom: 5,
        }}
      >
        <Text
          style={{
            fontSize: baseSize * 0.75,
            letterSpacing: 0.6,
            fontWeight: 'bold',
            color: accent,
          }}
        >
          {label}
        </Text>
        {hasTitle ? (
          <Text style={{ fontWeight: 'bold', marginTop: 3, ...textStyle }}>{block.title}</Text>
        ) : null}
        {/* Empty bodies are a deliberate state: the label (and title) still
            render; the body node is omitted rather than emitting empty text. */}
        {block.spans.length > 0 ? (
          <Text style={{ marginTop: 3, ...textStyle }}>{renderSpans(block.spans)}</Text>
        ) : null}
      </View>
    </View>
  );
}

/**
 * Muted italic note used by the structural renderers for honest empty
 * or unavailable states (never fabricated content, never silent
 * omission).  Ink is the theme's muted text so it stays legible in
 * monochrome.
 */
function StructuralNote({ tokens, text }: { tokens: BodyThemeTokens; text: string }): React.ReactElement {
  return (
    <Text
      style={{
        marginBottom: tokens.typography.paragraphSpacingPt,
        fontStyle: 'italic',
        color: tokens.colors.mutedText,
      }}
    >
      {text}
    </Text>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Structural content blocks (P06-M2)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Metadata block (P06-M2 §5.4): an ordered two-column table of the
 * block's SELECTED metadata fields resolved against the AUTHORITATIVE
 * `doc.metadata` at render time — the block stores field keys only, so
 * values can never go stale.  Field order is preserved verbatim.
 * Unresolvable fields (removed custom fields) are skipped safely;
 * empty values are omitted (the cover page's documented policy), and a
 * field selection with nothing to show renders an honest note instead
 * of `undefined`/blank rows.
 */
function MetadataBlock({
  block,
  doc,
  contentWidth,
  tokens,
}: {
  block: MetadataBlockData;
  doc: DocStudioDocument;
  contentWidth: number;
  tokens: BodyThemeTokens;
}): React.ReactElement {
  const t = tokens.tables;
  const textStyle =
    tokens.colors.text !== DEFAULT_TEXT_COLOR ? { color: tokens.colors.text } : {};
  if (block.visibleFields.length === 0) {
    return <StructuralNote tokens={tokens} text="[No metadata fields selected]" />;
  }
  const customFields = doc.metadata.customFields;
  const rows: { label: string; value: string }[] = [];
  for (const field of block.visibleFields) {
    const label = coverFieldLabel(field, customFields);
    if (label === null) continue; // removed/unknown custom field — skip safely
    let value: string;
    if (field.startsWith('custom:')) {
      const id = field.slice('custom:'.length);
      value = customFields.find((custom) => custom.id === id)?.value ?? '';
    } else if (field === 'createdAt' || field === 'modifiedAt') {
      value = doc.metadata[field].slice(0, 10);
    } else {
      const raw = (doc.metadata as unknown as Record<string, unknown>)[field];
      if (typeof raw !== 'string') continue;
      value = raw;
    }
    const trimmed = value.trim();
    if (trimmed === '') continue; // never render empty/undefined values
    rows.push({ label, value: trimmed });
  }
  if (rows.length === 0) {
    return <StructuralNote tokens={tokens} text="[No metadata values to display]" />;
  }
  // Label column: 36 % of the page content width, bounded to a readable
  // label/value balance on narrow (A5) and wide (A3 landscape) pages.
  const labelWidth = Math.min(220, Math.max(110, contentWidth * 0.36));
  return (
    <View style={{ marginBottom: tokens.typography.paragraphSpacingPt }}>
      {rows.map((row) => (
        <View
          key={row.label}
          style={{
            flexDirection: 'row',
            paddingVertical: t.cellPaddingVpt,
            borderBottomWidth: t.borderWidthPt,
            borderBottomColor: t.borderColor,
          }}
        >
          <Text style={{ width: labelWidth, fontWeight: 'bold', ...textStyle }} wrap>
            {row.label}
          </Text>
          <Text style={{ flex: 1, paddingHorizontal: t.cellPaddingHpt, ...textStyle }} wrap>
            {row.value}
          </Text>
        </View>
      ))}
    </View>
  );
}

/**
 * Revision-history block (P06-M2 §5.5): a manually edited four-column
 * table (Revision / Date / Author / Description).  Every supported
 * column renders, descriptions WRAP instead of clipping, and an empty
 * table shows an honest note.  This is ordinary document content — it
 * is not Track Changes and not a tamper-proof audit trail (Phase 07
 * owns saved revision snapshots).
 */
function RevisionHistoryBlock({
  block,
  contentWidth,
  tokens,
}: {
  block: RevisionHistoryBlockData;
  contentWidth: number;
  tokens: BodyThemeTokens;
}): React.ReactElement {
  const t = tokens.tables;
  const textStyle =
    tokens.colors.text !== DEFAULT_TEXT_COLOR ? { color: tokens.colors.text } : {};
  if (block.entries.length === 0) {
    return <StructuralNote tokens={tokens} text="[No revision entries recorded]" />;
  }
  const widths = [0.12, 0.15, 0.23, 0.5].map((fraction) => contentWidth * fraction);
  const headers = ['Revision', 'Date', 'Author', 'Description'];
  const renderRow = (key: string, cells: string[], isHeader: boolean): React.ReactElement => (
    <View
      key={key}
      style={{
        flexDirection: 'row',
        borderBottomWidth: isHeader ? t.headerBorderWidthPt : t.borderWidthPt,
        borderBottomColor: isHeader ? t.headerBorderColor : t.borderColor,
      }}
      wrap={false}
    >
      {cells.map((cell, i) => (
        <Text
          key={`${key}-${i}`}
          style={{
            width: widths[i],
            paddingVertical: t.cellPaddingVpt,
            paddingHorizontal: t.cellPaddingHpt,
            ...(isHeader ? { fontWeight: t.headerWeight } : {}),
            ...textStyle,
          }}
          wrap
        >
          {cell}
        </Text>
      ))}
    </View>
  );
  return (
    <View style={{ marginBottom: tokens.typography.paragraphSpacingPt }}>
      {renderRow('rev-header', headers, true)}
      {block.entries.map((entry) =>
        renderRow(entry.id, [entry.revision, entry.date, entry.author, entry.description], false),
      )}
    </View>
  );
}

/**
 * Reference block (P06-M2 §5.6): optional bold title + ordered citation
 * entries.  Citations WRAP without losing text; a stored URL becomes a
 * real PDF link ONLY when it passes `sanitizeHref` at render time —
 * an unsafe URL renders as ordinary non-clickable text (never a live
 * annotation, never silently dropped).  An empty list renders an
 * honest note.
 */
function ReferenceBlock({
  block,
  tokens,
}: {
  block: ReferenceBlockData;
  tokens: BodyThemeTokens;
}): React.ReactElement {
  const t = tokens.tables;
  const textStyle =
    tokens.colors.text !== DEFAULT_TEXT_COLOR ? { color: tokens.colors.text } : {};
  const linkColor = tokens.colors.accent;
  const keyWidth = 48;
  return (
    <View style={{ marginBottom: tokens.typography.paragraphSpacingPt }}>
      {block.title !== undefined && block.title.trim() !== '' ? (
        <Text style={{ fontWeight: 'bold', marginBottom: 4, ...textStyle }}>{block.title}</Text>
      ) : null}
      {block.entries.length === 0 ? (
        <StructuralNote tokens={tokens} text="[No references listed]" />
      ) : (
        block.entries.map((entry) => {
          const href = sanitizeHref(entry.url);
          return (
            <View
              key={entry.id}
              style={{
                flexDirection: 'row',
                paddingVertical: t.cellPaddingVpt,
                borderBottomWidth: t.borderWidthPt,
                borderBottomColor: t.borderColor,
              }}
            >
              <Text style={{ width: keyWidth, fontWeight: 'bold', ...textStyle }}>{entry.key}</Text>
              <View style={{ flex: 1 }}>
                <Text style={textStyle} wrap>
                  {entry.citation}
                </Text>
                {entry.url !== undefined && entry.url.trim() !== '' ? (
                  href !== null ? (
                    <Link src={href} style={{ color: linkColor, textDecoration: 'underline' }}>
                      {entry.url}
                    </Link>
                  ) : (
                    <Text style={{ color: tokens.colors.mutedText }} wrap>
                      {entry.url}
                    </Text>
                  )
                ) : null}
              </View>
            </View>
          );
        })
      )}
    </View>
  );
}

/**
 * Exhibit / annexure block (P06-M2 §5.7): visible label + optional
 * title/notes, all wrapping, never silently dropped.  An optional
 * reference to an existing embedded IMAGE asset renders that image;
 * a MISSING or non-image asset reference renders an honest visible
 * note instead of crashing or disappearing (the image BLOCK keeps its
 * strict throw contract — that is a different, P06-M4 concern).
 */
function ExhibitBlock({
  block,
  doc,
  contentWidth,
  tokens,
}: {
  block: ExhibitBlockData;
  doc: DocStudioDocument;
  contentWidth: number;
  tokens: BodyThemeTokens;
}): React.ReactElement {
  const textStyle =
    tokens.colors.text !== DEFAULT_TEXT_COLOR ? { color: tokens.colors.text } : {};
  const asset = block.assetId !== undefined ? doc.assets[block.assetId] : undefined;
  const imageUsable =
    block.assetId !== undefined &&
    asset !== undefined &&
    asset.base64Data !== '' &&
    asset.mimeType.startsWith('image/');
  return (
    <View style={{ marginBottom: tokens.typography.paragraphSpacingPt }}>
      <Text style={{ fontWeight: 'bold', ...textStyle }} wrap>
        {block.label}
      </Text>
      {block.title !== undefined && block.title.trim() !== '' ? (
        <Text style={{ marginTop: 2, fontStyle: 'italic', ...textStyle }} wrap>
          {block.title}
        </Text>
      ) : null}
      {block.notes !== undefined && block.notes.trim() !== '' ? (
        <Text style={{ marginTop: 2, ...textStyle }} wrap>
          {block.notes}
        </Text>
      ) : null}
      {block.assetId !== undefined ? (
        imageUsable ? (
          <Image
            src={`data:${asset.mimeType};base64,${asset.base64Data}`}
            style={{ width: contentWidth, marginTop: 4, alignSelf: 'center' }}
          />
        ) : (
          <StructuralNote
            tokens={tokens}
            text="[Referenced exhibit asset is missing or is not a renderable image — reselect an embedded image asset]"
          />
        )
      ) : null}
    </View>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Formula block (P06-M3, §10.6)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Typeset formula (LaTeX → MathJax SVG → react-pdf vectors), spec §10.6:
 *
 * • Font size is ALWAYS the document's base size
 *   (`tokens.typography.baseFontSizePt`) — there is no independent
 *   formula-size setting; `displayMode` selects MathJax display styling
 *   (limits above/below operators) plus a little vertical breathing room.
 * • Alignment (`hAlign`) applies to the formula inside the band left of
 *   the equation number; the number itself is pinned in its own
 *   right-aligned cell at the right edge of the formula area.
 * • Overflow: `planFormulaLayout` scales the box down uniformly to fit and
 *   sets `scaledToFit`, which prints an honest visible note — a formula
 *   never shrinks silently and never spills past the margins.
 * • The "Where:" rule (§10.6): variable definitions render to the RIGHT
 *   of the formula while everything fits, and BELOW it when it does not.
 *   The default label is `Where:` (or `whereLabelOverride`).  A definition
 *   renders as `symbol … definition (unit)` with the symbol typeset from
 *   its own LaTeX when it parses, raw text otherwise (honest fallback —
 *   the service rejects unparseable symbols at commit time, so that path
 *   only exists for legacy/imported documents).
 * • An unparseable formula (legacy/imported document only — the editor
 *   service rejects such input) prints an honest marker naming the TeX
 *   parser's message instead of vanishing or crashing the export.
 */
function FormulaBlock({
  block,
  contentWidth,
  tokens,
}: {
  block: FormulaBlockData;
  contentWidth: number;
  tokens: BodyThemeTokens;
}): React.ReactElement {
  const fontSizePt = tokens.typography.baseFontSizePt;
  const textStyle =
    tokens.colors.text !== DEFAULT_TEXT_COLOR ? { color: tokens.colors.text } : {};
  const bodyColor = tokens.colors.text;

  // 1. Convert the LaTeX and its SVG to elements — honest markers on failure.
  //    (`=== false` rather than `!math.ok`: narrows under the legacy
  //    non-strict suite compiles too — see math-engine.validateLatex.)
  const math = renderLatexToMathSvg(block.latex, fontSizePt, block.displayMode);
  if (math.ok === false) {
    return (
      <StructuralNote
        tokens={tokens}
        text={`[Formula could not be rendered: ${math.message} — edit the LaTeX source in the editor to fix it]`}
      />
    );
  }
  const parsed = parseMathSvgDocument(math.svg);
  if (parsed === null) {
    return (
      <StructuralNote
        tokens={tokens}
        text="[Formula could not be converted to a PDF vector — the math engine returned an unsupported SVG layout]"
      />
    );
  }

  // 2. Where-row widths: symbols measured through the engine when they
  //    parse, text estimated (see estimateTextWidthPt for the policy).
  const whereLabel = block.whereLabelOverride ?? 'Where:';
  const rows = block.variableDefinitions.map((variable) => {
    const symbolMath = renderLatexToMathSvg(variable.symbol, fontSizePt, false);
    const text =
      variable.unit !== undefined && variable.unit !== ''
        ? `${variable.definition} (${variable.unit})`
        : variable.definition;
    return {
      variable,
      symbolMath,
      symbolWidthPt: symbolMath.ok
        ? symbolMath.metrics.widthPt
        : estimateTextWidthPt(variable.symbol, fontSizePt),
      text,
      textWidthPt: estimateTextWidthPt(text, fontSizePt),
    };
  });

  const numberText =
    block.formulaNumber !== undefined && block.formulaNumber.trim() !== ''
      ? block.formulaNumber.trim()
      : null;

  // 3. One pure plan for every geometric decision (unit-tested directly).
  const plan = planFormulaLayout({
    contentWidthPt: contentWidth,
    naturalWidthPt: math.metrics.widthPt,
    naturalHeightPt: math.metrics.heightPt,
    baselineOffsetPt: math.metrics.baselineOffsetPt,
    fontSizePt,
    hasNumber: numberText !== null,
    numberWidthPt: numberText !== null ? estimateTextWidthPt(numberText, fontSizePt) : 0,
    whereRows: rows.map((row) => ({
      symbolWidthPt: row.symbolWidthPt,
      textWidthPt: row.textWidthPt,
    })),
    whereLabelWidthPt: estimateTextWidthPt(whereLabel, fontSizePt),
  });

  // P06-M3-R1 root cause: the formula cell is a COLUMN-direction flex
  // container whose height equals its content, so `justifyContent` (the
  // main/vertical axis) had no effect and the SVG always sat at the
  // horizontal cross-axis start — everything rendered left-aligned
  // (owner-confirmed defect).  Horizontal placement inside a column
  // container is `alignItems` (cross axis): flex-start / center /
  // flex-end against the planner's `formulaCellWidthPt` band.
  const align: 'flex-start' | 'center' | 'flex-end' =
    block.hAlign === 'center' ? 'center' : block.hAlign === 'right' ? 'flex-end' : 'flex-start';
  // Optical centering of the number against the (scaled) formula box.
  const numberMarginTop = Math.max(0, (plan.formulaHeightPt - fontSizePt * 1.2) / 2);

  const whereList = (
    <React.Fragment>
      <Text style={{ fontWeight: 'bold', ...textStyle }} wrap>
        {whereLabel}
      </Text>
      {rows.map((row) => {
        const symbolMath = row.symbolMath;
        const symbolParsed = symbolMath.ok ? parseMathSvgDocument(symbolMath.svg) : null;
        const symbolWidth = row.symbolWidthPt + FORMULA_SYMBOL_GAP_PT;
        return (
          <View
            key={row.variable.id}
            style={{ flexDirection: 'row', alignItems: 'flex-start', marginTop: 2 }}
          >
            {symbolMath.ok && symbolParsed !== null ? (
              <View style={{ width: symbolWidth, marginTop: 1 }}>
                {mathSvgToReact(symbolParsed, {
                  widthPt: symbolMath.metrics.widthPt,
                  heightPt: symbolMath.metrics.heightPt,
                  color: bodyColor,
                })}
              </View>
            ) : (
              <Text style={{ width: symbolWidth, ...textStyle }} wrap>
                {row.variable.symbol}
              </Text>
            )}
            <Text style={{ flex: 1, ...textStyle }} wrap>
              {row.text}
            </Text>
          </View>
        );
      })}
    </React.Fragment>
  );

  return (
    <View
      style={{
        marginBottom: tokens.typography.paragraphSpacingPt,
        // Display mode = block-style equation: a little breathing room.
        marginTop: block.displayMode ? 3 : 0,
      }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'flex-start', width: contentWidth }}>
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'flex-start',
            width: plan.formulaAreaWidthPt,
            marginRight: plan.whereGapPt,
          }}
        >
          <View style={{ width: plan.formulaCellWidthPt, alignItems: align }}>
            {mathSvgToReact(parsed, {
              widthPt: plan.formulaWidthPt,
              heightPt: plan.formulaHeightPt,
              color: bodyColor,
            })}
          </View>
          {numberText !== null ? (
            <View
              style={{
                width: plan.numberCellWidthPt,
                alignItems: 'flex-end',
                marginTop: numberMarginTop,
              }}
            >
              <Text style={textStyle} wrap={false}>
                {numberText}
              </Text>
            </View>
          ) : null}
        </View>
        {plan.whereMode === 'beside' ? (
          <View style={{ width: plan.whereWidthPt }}>{whereList}</View>
        ) : null}
      </View>
      {plan.whereMode === 'below' ? (
        <View style={{ width: contentWidth, marginTop: 4 }}>{whereList}</View>
      ) : null}
      {plan.scaledToFit ? (
        <Text style={{ marginTop: 2, fontStyle: 'italic', color: tokens.colors.mutedText }} wrap>
          [Formula scaled to fit the page width]
        </Text>
      ) : null}
    </View>
  );
}

export function BlockRenderer({
  block,
  doc,
  contentWidth,
  tokens,
  headingPrefix,
  monochrome = false,
}: {
  block: AnyBlockData;
  doc: DocStudioDocument;
  contentWidth: number;
  tokens: BodyThemeTokens;
  /** Derived outline prefix for this heading block (P05-M2); optional so
   *  callers without numbering context render unchanged. */
  headingPrefix?: string;
  /** Document monochrome mode (P05-M3 callout accents); defaults to
   *  false so callers without the flag render unchanged. */
  monochrome?: boolean;
}) {
  switch (block.type) {
    case 'heading':
      return <Heading block={block} tokens={tokens} prefix={headingPrefix} />;
    case 'paragraph':
      return <Paragraph block={block} tokens={tokens} />;
    case 'callout':
      // Semantic callout (P05-M3, §10.3) — label + optional title + body.
      return <CalloutBlock block={block} tokens={tokens} monochrome={monochrome} />;
    case 'page-break':
      // Explicit schema page break. The break is applied by PocDocument to
      // the NEXT block's wrapper (an empty zero-height View is skipped by
      // the wrapping engine — verified during P02-M4), so here we only
      // emit a minimal marker node.
      return <View style={{ height: 0 }} />;
    case 'table':
      return <Table block={block} doc={doc} contentWidth={contentWidth} tokens={tokens} />;
    case 'image':
      return <ImageBlock block={block} doc={doc} tokens={tokens} />;
    case 'list':
      // Narrow list support (P04-M3) — see ListBlock for exact scope.
      return <ListBlock block={block} tokens={tokens} />;
    case 'horizontal-line':
      // Themed section rule (P04-M3) or the stored rule style (P06-M2
      // rule-style source policy — see HorizontalRuleBlock).
      return <HorizontalRuleBlock block={block} tokens={tokens} />;
    case 'section-break':
      // Section title + themed rule (P04-M3) — an INLINE divider; it
      // never starts a new page (P06-M2 §5.3).
      return <SectionBreakBlock block={block} tokens={tokens} />;
    case 'metadata-block':
      // Ordered metadata table resolved from doc.metadata (P06-M2).
      return <MetadataBlock block={block} doc={doc} contentWidth={contentWidth} tokens={tokens} />;
    case 'revision-history':
      // Manually edited revision table (P06-M2 §5.5).
      return (
        <RevisionHistoryBlock block={block} contentWidth={contentWidth} tokens={tokens} />
      );
    case 'reference':
      // Citation list with sanitized links (P06-M2 §5.6).
      return <ReferenceBlock block={block} tokens={tokens} />;
    case 'exhibit':
      // Exhibit label/title/notes + optional embedded image (P06-M2 §5.7).
      return <ExhibitBlock block={block} doc={doc} contentWidth={contentWidth} tokens={tokens} />;
    case 'formula':
      // Typeset LaTeX equation + optional number + "Where:" list
      // (P06-M3 §10.6 — fit scaling and the beside/below rule live in
      // planFormulaLayout; conversion lives in poc-math-svg).
      return <FormulaBlock block={block} contentWidth={contentWidth} tokens={tokens} />;
    default:
      // Unsupported block in the PoC: rendered as a visible marker so the
      // gap is obvious during evaluation rather than silently dropped.
      // Spacing/alignment/ink come from the resolved tokens (the classic
      // values reproduce the original marker exactly).
      return (
        <Text
          style={[
            {
              marginBottom: tokens.typography.paragraphSpacingPt,
              textAlign: tokens.paragraphs.align,
              fontStyle: 'italic',
              color: tokens.colors.mutedText,
            },
          ]}
        >
          [P02-M4 PoC: block type “{block.type}” not yet mapped]
        </Text>
      );
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Document
// ─────────────────────────────────────────────────────────────────────────────

/**
 * <Page> style for a themed document (P04-M3): engine base + authoritative
 * typography (base size, line spacing, custom margins) + the theme's page
 * framing when requested.  `PocDocument` and the theme gallery share this
 * single builder so a gallery page and a real page can never diverge.
 */
export function pocPageStyle(
  doc: DocStudioDocument,
  tokens: BodyThemeTokens,
): NonNullable<React.ComponentProps<typeof Page>['style']> {
  const layout = computePocLayout(doc);
  // Extracted so TypeScript narrows `'none'` away inside the frame block.
  const frameStyle = tokens.frame.style;
  return [
    styles.bodyPage,
    {
      fontSize: tokens.typography.baseFontSizePt,
      lineHeight: tokens.typography.lineHeight,
      paddingTop: layout.marginTop,
      paddingLeft: layout.marginLeft,
      paddingRight: layout.marginRight,
      paddingBottom: layout.marginBottom,
      // Page framing (e.g. framed-document): applied only when the
      // theme requests it — classic-formal (`style: 'none'`) emits
      // nothing new here.
      ...(frameStyle !== 'none'
        ? {
            borderWidth: tokens.frame.widthPt,
            borderColor: tokens.frame.color,
            borderStyle: frameStyle,
          }
        : {}),
    },
  ];
}

/**
 * Repeated page furniture (fixed): header + page numbering (P04-M3 —
 * extracted from `PocDocument` so the gallery shows the exact furniture
 * the document renders).  The header honors the §8.4 display-header
 * preference (P04-M1); sizes/colors/offset come from the theme tokens.
 */
export function PocPageFurniture({
  doc,
  tokens,
}: {
  doc: DocStudioDocument;
  tokens: BodyThemeTokens;
}): React.ReactElement {
  const furniture = tokens.pageFurniture;
  return (
    <>
      {doc.pageTypography.displayHeader && (
        <Text
          style={[
            styles.header,
            {
              fontSize: furniture.fontSizePt,
              top: furniture.offsetPt,
              textAlign: furniture.align,
              color: furniture.color,
            },
          ]}
          fixed
        >
          {doc.metadata.documentId} — DocStudio Renderer Proof of Concept
        </Text>
      )}
      <Text
        style={[
          styles.footer,
          {
            fontSize: furniture.fontSizePt,
            bottom: furniture.offsetPt,
            textAlign: furniture.align,
            color: furniture.color,
          },
        ]}
        fixed
        render={({ pageNumber, totalPages }) => `Page ${pageNumber} of ${totalPages}`}
      />
    </>
  );
}

export function PocDocument({ doc }: { doc: DocStudioDocument }): React.ReactElement {
  const { size, orientation } = doc.pageSetup;
  // Single theme-resolution call site (P04-M2): the document's existing
  // settings resolve into the one token set consumed by every block and by
  // the page furniture below. The resolver is deterministic, never mutates
  // the document, and throws on an unknown `bodyThemeId`.
  const { monochrome, tokens } = resolveBodyTheme(
    doc.pageTypography.bodyThemeId,
    doc.pageTypography.typography,
    doc.pageTypography.monochrome,
  );
  const { contentWidth } = computePocLayout(doc);
  // Outline numbering (P05-M2, §10.1): ONE derivation over the
  // authoritative block order, shared by every heading below — the same
  // engine the editor uses, so preview/export can never disagree with
  // the editing surface.  Prefixes are derived, never stored.
  const headingPrefixes = computeHeadingNumbering(doc.blocks);

  return (
    <Document
      title={doc.metadata.title}
      author={doc.metadata.organizationName}
      subject={doc.metadata.documentId}
      creator="DocStudio P02-M4 Renderer PoC"
      producer="DocStudio P02-M4 Renderer PoC (@react-pdf/renderer)"
      creationDate={new Date(doc.metadata.createdAt)}
      modificationDate={new Date(doc.metadata.modifiedAt)}
    >
      {/* Designed cover (P04-M4): rendered as a separate first page when
          enabled. It carries NO body furniture — no header/footer grid,
          no page numbering, no watermark — so the cover stays clean and
          the configured bands below (DEC-008) can never reach it. */}
      {doc.frontPage.enabled && <PocCoverPage doc={doc} />}
      <Page
        size={PAGE_FORMATS[size]}
        orientation={orientation}
        style={pocPageStyle(doc, tokens)}
        wrap
      >
        {/* Page furniture (P06-M1 §9; DEC-008 option (a) authorized
            2026-10-20): the AUTHORITATIVE `doc.headerFooter` header and
            footer grids, per-band page-number modes, first-body-page
            suppression and the watermark — the settings the left panel
            edits, rendered as REAL page furniture. This replaces the
            legacy hard-coded `PocPageFurniture` path (baseline
            transition authorized and recorded in the roadmap); that
            component itself is untouched and still mounts in the P04-M3
            theme gallery. */}
        <PocConfiguredFurniture doc={doc} tokens={tokens} />

        {/* Blocks are rendered as DIRECT children of <Page> on purpose:
            react-pdf v4 only honors the `break` prop on direct Page
            children (verified with a behavior matrix during P02-M4) — a
            wrapping container View would silently swallow explicit page
            breaks. */}
        {doc.blocks.map((block, index) => {
          // A schema `page-break` block forces the NEXT content block to
          // start on a new physical page (P06-M2 §5.2, verified reliable
          // for beginning/middle/consecutive/trailing positions):
          // • The break is applied only when real content precedes the
          //   break chain, so a leading break never creates an empty
          //   first page.
          // • Consecutive page breaks collapse into ONE page boundary
          //   (the intervening markers render zero-height and do not
          //   wrap in a breaking View), so repeated breaks never emit
          //   unintended blank pages; the markers themselves are never
          //   removed from the document.  A deliberate blank page can be
          //   made with an empty paragraph between two breaks.
          // • A trailing break has no following block, so it never
          //   appends a blank trailing page.
          const isPageBreak = (candidate: (typeof doc.blocks)[number]): boolean =>
            candidate.data.type === 'page-break';
          const forceBreak =
            index > 0 &&
            isPageBreak(doc.blocks[index - 1]) &&
            !isPageBreak(block) &&
            doc.blocks.slice(0, index - 1).some((previous) => !isPageBreak(previous));
          const renderer = (
            <BlockRenderer
              block={block.data}
              doc={doc}
              contentWidth={contentWidth}
              tokens={tokens}
              headingPrefix={headingPrefixes.get(block.id)}
              monochrome={monochrome}
            />
          );
          return forceBreak ? (
            <View key={block.id} break wrap={false}>
              {renderer}
            </View>
          ) : (
            <React.Fragment key={block.id}>{renderer}</React.Fragment>
          );
        })}
      </Page>
    </Document>
  );
}
