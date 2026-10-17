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
 * themed rule).  Full block coverage belongs to Phase 08.
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
 * • Display header — the fixed body-page header honors
 *   `pageTypography.displayHeader` (P04-M1, §8.4).
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
 * • Page breaks  — the schema `page-break` block maps to the `break` prop.
 * • Page numbers — fixed footer text using the `render` prop
 *   (pageNumber / totalPages), repeated on every page.
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
  StyleSheet,
} from '@react-pdf/renderer';
import type { DocStudioDocument, PageSize } from '../../types/document';
import type {
  AnyBlockData,
  HeadingBlockData,
  InlineSpan,
  ImageBlockData,
  ListBlockData,
  ParagraphBlockData,
  SectionBreakBlockData,
  TableBlockData,
} from '../../types/blocks';
import { effectivePageDimensionsMm } from '../../services/page-typography';
import {
  DEFAULT_TEXT_COLOR,
  resolveBodyTheme,
  type BodyThemeTokens,
} from '../../services/body-theme-tokens';

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
  const contentWidth = pageWidthPt - marginLeft - marginRight;
  return { marginTop, marginRight, marginBottom, marginLeft, pageWidthPt, contentWidth };
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

/** Column width fractions for PoC tables (4 columns). */
const COLUMN_FRACTIONS = [0.3, 0.24, 0.24, 0.22];

// ─────────────────────────────────────────────────────────────────────────────
// Inline rich text
// ─────────────────────────────────────────────────────────────────────────────

function renderSpans(spans: InlineSpan[]): React.ReactNode {
  return spans.map((span, i) => (
    <Text
      key={i}
      style={{
        fontWeight: span.bold ? 'bold' : 'normal',
        fontStyle: span.italic ? 'italic' : 'normal',
        textDecoration: span.underline ? 'underline' : 'none',
      }}
    >
      {span.text}
    </Text>
  ));
}

// ─────────────────────────────────────────────────────────────────────────────
// Block renderers
// ─────────────────────────────────────────────────────────────────────────────

function Heading({ block, tokens }: { block: HeadingBlockData; tokens: BodyThemeTokens }) {
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
      {block.text}
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

function Table({ block, contentWidth, tokens }: { block: TableBlockData; contentWidth: number; tokens: BodyThemeTokens }) {
  const t = tokens.tables;
  const caption = tokens.captions;
  return (
    <View style={{ marginBottom: t.marginBottomPt }}>
      {block.rows.map((row, rowIndex) => {
        const isHeader = block.hasHeaderRow && rowIndex === 0;
        return (
          <View
            key={row.id}
            style={{
              flexDirection: 'row',
              borderBottomWidth: isHeader ? t.headerBorderWidthPt : t.borderWidthPt,
              borderBottomColor: isHeader ? t.headerBorderColor : t.borderColor,
              ...(isHeader ? { backgroundColor: t.headerBackground } : {}),
            }}
            wrap={false}
          >
            {row.cells.map((cell, cellIndex) => {
              const isHeaderCell = isHeader || cell.isHeader;
              return (
                <Text
                  key={cell.id}
                  style={{
                    width: contentWidth * (COLUMN_FRACTIONS[cellIndex] ?? 0.25),
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
 * Section rule from the `horizontal-line` block (P04-M3).
 *
 * The rule's WEIGHT and COLOR come from the theme's `separators` tokens, so
 * every theme shows its own section-rule language (0.5 pt quiet boundaries
 * → 1.5 pt graphic lines).  The block's own `thicknessPt`/`color` author
 * values are NOT applied on this path — theme-driven separators are this
 * checkpoint's scope and the PoC has no block-style editor (documented
 * limitation, not silently dropped structure: the rule always renders).
 * Zero-height bordered views were verified as layout-unstable during
 * P02-M4, so the rule is a filled box of exactly the token height.
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
 * `list` block (P04-M3 — narrow, reusable support).
 *
 * Scope: bullet lists (the theme's `lists.markerStyle` drawn as real PDF
 * shapes — disc/circle/square/dash — so no non-WinAnsi glyph is needed on
 * the standard-14 fonts), numbered lists (decimal prefix) and checklists
 * (filled square = checked).  Nesting depth steps by the paragraph indent
 * token; item spacing comes from `lists.itemSpacingPt`; marker ink is the
 * theme accent so each theme's list identity is visible.
 *
 * Deliberately NOT in scope: block-level `bulletStyle`/`numberStyle`
 * overrides (the theme's marker token is authoritative here), roman/alpha
 * numbering and checklist state editing — Phase 05 territory.  This is the
 * list support the ten themes need to demonstrate their list treatment, not
 * full block-renderer coverage.
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
      return <Text style={{ marginRight: 6, color: markerInk }}>{`${index + 1}.`}</Text>;
    }
    if (block.listType === 'checklist') {
      return item.checked
        ? markerBox({})
        : markerBox({ backgroundColor: undefined, borderWidth: 0.8, borderColor: markerInk });
    }
    switch (list.markerStyle) {
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

export function BlockRenderer({
  block,
  doc,
  contentWidth,
  tokens,
}: {
  block: AnyBlockData;
  doc: DocStudioDocument;
  contentWidth: number;
  tokens: BodyThemeTokens;
}) {
  switch (block.type) {
    case 'heading':
      return <Heading block={block} tokens={tokens} />;
    case 'paragraph':
      return <Paragraph block={block} tokens={tokens} />;
    case 'page-break':
      // Explicit schema page break. The break is applied by PocDocument to
      // the NEXT block's wrapper (an empty zero-height View is skipped by
      // the wrapping engine — verified during P02-M4), so here we only
      // emit a minimal marker node.
      return <View style={{ height: 0 }} />;
    case 'table':
      return <Table block={block} contentWidth={contentWidth} tokens={tokens} />;
    case 'image':
      return <ImageBlock block={block} doc={doc} tokens={tokens} />;
    case 'list':
      // Narrow list support (P04-M3) — see ListBlock for exact scope.
      return <ListBlock block={block} tokens={tokens} />;
    case 'horizontal-line':
      // Themed section rule (P04-M3).
      return <SectionRule tokens={tokens} />;
    case 'section-break':
      // Section title + themed rule (P04-M3).
      return <SectionBreakBlock block={block} tokens={tokens} />;
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
  const tokens = resolveBodyTheme(
    doc.pageTypography.bodyThemeId,
    doc.pageTypography.typography,
    doc.pageTypography.monochrome,
  ).tokens;
  const { contentWidth } = computePocLayout(doc);

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
      <Page
        size={PAGE_FORMATS[size]}
        orientation={orientation}
        style={pocPageStyle(doc, tokens)}
        wrap
      >
        <PocPageFurniture doc={doc} tokens={tokens} />

        {/* Blocks are rendered as DIRECT children of <Page> on purpose:
            react-pdf v4 only honors the `break` prop on direct Page
            children (verified with a behavior matrix during P02-M4) — a
            wrapping container View would silently swallow explicit page
            breaks. */}
        {doc.blocks.map((block, index) => {
          // A schema `page-break` block forces the NEXT content block to
          // start on a new physical page.
          const forceBreak =
            index > 0 && doc.blocks[index - 1].data.type === 'page-break';
          const renderer = (
            <BlockRenderer
              block={block.data}
              doc={doc}
              contentWidth={contentWidth}
              tokens={tokens}
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
