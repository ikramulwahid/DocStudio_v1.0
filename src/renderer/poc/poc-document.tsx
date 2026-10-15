/**
 * DocStudio — P02-M4 PoC Document Renderer (@react-pdf/renderer)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Translates a subset of the DocStudio block model into react-pdf
 * primitives.  This is the PROTOTYPE translation layer for the renderer
 * proof of concept — it intentionally supports only the blocks used by the
 * PoC fixture (heading, paragraph, page-break, table, image).  Full block
 * coverage, themes and header/footer configuration belong to Phase 08.
 *
 * Mapping decisions (see the roadmap decision record):
 * • Page geometry — `pageSetup` (size/orientation/margins) drives <Page>.
 * • Typography   — schema pt sizes map 1:1 to PDF points. The schema
 *   default family "Segoe UI" is MAPPED to the PDF standard-14 Times
 *   family: no font file is embedded, so the output is license-clean and
 *   fully offline. Registering a distributable body font is a Phase 08
 *   task; unregistered families fall back to Helvetica (verified in
 *   verify_p02_m4.mjs).
 * • Headings     — Times-Bold with size steps; inline bold/italic/
 *   underline spans map to nested <Text> styles.
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
import type { DocStudioDocument } from '../../types/document';
import type {
  AnyBlockData,
  HeadingBlockData,
  InlineSpan,
  ImageBlockData,
  ParagraphBlockData,
  TableBlockData,
} from '../../types/blocks';

/** mm → pt conversion (1 mm = 72 / 25.4 pt). */
export function mmToPt(mm: number): number {
  return (mm * 72) / 25.4;
}

/** The font family the PoC uses for body text (PDF standard-14). */
export const POC_BODY_FONT = 'Times-Roman';

/** Heading size steps (pt) for levels 1–4. */
const HEADING_SIZES: Record<number, number> = { 1: 18, 2: 14, 3: 12, 4: 11 };

const styles = StyleSheet.create({
  bodyPage: {
    paddingHorizontal: 0,
    paddingVertical: 0,
    fontFamily: POC_BODY_FONT,
    fontSize: 11,
    lineHeight: 1.5,
  },
  heading: {
    fontFamily: POC_BODY_FONT,
    fontWeight: 'bold',
    marginBottom: 6,
    marginTop: 10,
  },
  paragraph: {
    marginBottom: 6,
    textAlign: 'justify',
  },
  table: {
    marginBottom: 8,
  },
  tableRow: {
    flexDirection: 'row',
    borderBottomWidth: 0.5,
    borderBottomColor: '#666666',
  },
  tableHeaderRow: {
    flexDirection: 'row',
    backgroundColor: '#e8e8e8',
    borderBottomWidth: 1,
    borderBottomColor: '#333333',
  },
  cell: {
    paddingVertical: 3,
    paddingHorizontal: 4,
    borderRightWidth: 0.5,
    borderRightColor: '#999999',
  },
  cellHeader: {
    paddingVertical: 3,
    paddingHorizontal: 4,
    fontWeight: 'bold',
    borderRightWidth: 0.5,
    borderRightColor: '#999999',
  },
  tableCaption: {
    fontFamily: POC_BODY_FONT,
    fontStyle: 'italic',
    fontSize: 9.5,
    marginTop: 3,
    marginBottom: 8,
  },
  imageCaption: {
    fontFamily: POC_BODY_FONT,
    fontStyle: 'italic',
    fontSize: 9.5,
    marginTop: 3,
    marginBottom: 8,
    textAlign: 'center',
  },
  footer: {
    fontFamily: POC_BODY_FONT,
    fontSize: 9,
    position: 'absolute',
    bottom: 28,
    left: 0,
    right: 0,
    textAlign: 'center',
    color: '#444444',
  },
  header: {
    fontFamily: POC_BODY_FONT,
    fontSize: 9,
    position: 'absolute',
    top: 28,
    left: 0,
    right: 0,
    textAlign: 'center',
    color: '#444444',
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

function Heading({ block }: { block: HeadingBlockData }) {
  return (
    <Text style={[styles.heading, { fontSize: HEADING_SIZES[block.level] ?? 11 }]} wrap>
      {block.text}
    </Text>
  );
}

function Paragraph({ block }: { block: ParagraphBlockData }) {
  const indent = block.indentLevel > 0 ? block.indentLevel * 18 : 0;
  return (
    <Text style={[styles.paragraph, { marginLeft: indent }]} wrap>
      {renderSpans(block.spans)}
    </Text>
  );
}

function Table({ block, contentWidth }: { block: TableBlockData; contentWidth: number }) {
  return (
    <View style={styles.table}>
      {block.rows.map((row, rowIndex) => {
        const isHeader = block.hasHeaderRow && rowIndex === 0;
        return (
          <View
            key={row.id}
            style={isHeader ? styles.tableHeaderRow : styles.tableRow}
            wrap={false}
          >
            {row.cells.map((cell, cellIndex) => (
              <Text
                key={cell.id}
                style={[
                  isHeader || cell.isHeader ? styles.cellHeader : styles.cell,
                  {
                    width: contentWidth * (COLUMN_FRACTIONS[cellIndex] ?? 0.25),
                    textAlign: cell.hAlign,
                  },
                ]}
                wrap
              >
                {renderSpans(cell.spans)}
              </Text>
            ))}
          </View>
        );
      })}
      {block.caption && <Text style={styles.tableCaption}>{block.caption}</Text>}
    </View>
  );
}

function ImageBlock({ block, doc }: { block: ImageBlockData; doc: DocStudioDocument }) {
  const contentWidth = mmToPt(doc.pageSetup.size === 'A4' ? 210 : 216) - 2 * mmToPt(doc.pageSetup.margins.leftMm);
  return (
    <View style={{ marginBottom: 8 }}>
      {block.images.map((image) => {
        if (!image.assetId) {
          return (
            <Text key={image.id} style={styles.imageCaption}>
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
            {image.caption && <Text style={styles.imageCaption}>{image.caption}</Text>}
          </View>
        );
      })}
    </View>
  );
}

function BlockRenderer({ block, doc, contentWidth }: { block: AnyBlockData; doc: DocStudioDocument; contentWidth: number }) {
  switch (block.type) {
    case 'heading':
      return <Heading block={block} />;
    case 'paragraph':
      return <Paragraph block={block} />;
    case 'page-break':
      // Explicit schema page break. The break is applied by PocDocument to
      // the NEXT block's wrapper (an empty zero-height View is skipped by
      // the wrapping engine — verified during P02-M4), so here we only
      // emit a minimal marker node.
      return <View style={{ height: 0 }} />;
    case 'table':
      return <Table block={block} contentWidth={contentWidth} />;
    case 'image':
      return <ImageBlock block={block} doc={doc} />;
    default:
      // Unsupported block in the PoC: rendered as a visible marker so the
      // gap is obvious during evaluation rather than silently dropped.
      return (
        <Text style={[styles.paragraph, { fontStyle: 'italic', color: '#888888' }]}>
          [P02-M4 PoC: block type “{block.type}” not yet mapped]
        </Text>
      );
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Document
// ─────────────────────────────────────────────────────────────────────────────

export function PocDocument({ doc }: { doc: DocStudioDocument }): React.ReactElement {
  const { size, orientation, margins } = doc.pageSetup;
  const marginTop = mmToPt(margins.topMm);
  const marginRight = mmToPt(margins.rightMm);
  const marginBottom = mmToPt(margins.bottomMm);
  const marginLeft = mmToPt(margins.leftMm);
  const pageWidthPt = size === 'A4' ? 595.28 : 612; // A4 vs US Letter fallback
  const contentWidth =
    (orientation === 'landscape' ? pageWidthPt * (841.89 / 595.28) : pageWidthPt) -
    marginLeft -
    marginRight;

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
        size={size === 'A4' ? 'A4' : 'LETTER'}
        orientation={orientation}
        style={[styles.bodyPage, { paddingTop: marginTop, paddingLeft: marginLeft, paddingRight: marginRight, paddingBottom: marginBottom }]}
        wrap
      >
        {/* Repeated page furniture (fixed): header + page numbering. */}
        <Text style={styles.header} fixed>
          {doc.metadata.documentId} — DocStudio Renderer Proof of Concept
        </Text>
        <Text style={styles.footer} fixed render={({ pageNumber, totalPages }) => `Page ${pageNumber} of ${totalPages}`} />

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
            <BlockRenderer block={block.data} doc={doc} contentWidth={contentWidth} />
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
