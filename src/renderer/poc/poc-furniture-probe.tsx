/**
 * DocStudio — Header/footer/watermark render probe (P06-M1)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * A document composition that is byte-for-byte the same as `PocDocument`
 * (cover page + body page style + block renderers + heading numbering)
 * with EXACTLY ONE difference: the page furniture is the settings-driven
 * `PocConfiguredFurniture` layer instead of the legacy hard-coded
 * `PocPageFurniture`.
 *
 * Why this exists (DEC-006/DEC-008 decision boundary)
 * ───────────────────────────────────────────────────
 * Activating the configured header/footer grids inside `PocDocument`
 * would necessarily change every committed render baseline (see the
 * module doc of `poc-page-furniture.tsx`), so that one-line activation
 * awaits the owner's explicit baseline-regeneration authorization
 * (DEC-008).  This probe lets `verify_p06_m1.mjs` render the REAL
 * configured furniture — real grid, real tokens, real react-pdf
 * `render`-prop page numbers, real watermark — against real
 * multipage/cover documents WITHOUT touching `PocDocument` or any
 * committed baseline.  When DEC-008 is authorized, `PocDocument` swaps
 * `PocPageFurniture` for `PocConfiguredFurniture` and this probe keeps
 * working unchanged.
 *
 * Determinism: the `<Document>` metadata dates come from the document
 * (same policy as `PocDocument`), so two renders of the same input are
 * byte-identical — which is what lets the suite commit one probe
 * artifact and byte-compare it on every run.
 *
 * @module renderer/poc/poc-furniture-probe
 */

import React from 'react';
import { Document, Page, View } from '@react-pdf/renderer';
import type { DocStudioDocument } from '../../types/document';
import { resolveBodyTheme } from '../../services/body-theme-tokens';
import { computeHeadingNumbering } from '../../services/heading-numbering';
import {
  BlockRenderer,
  PAGE_FORMATS,
  computePocLayout,
  pocPageStyle,
} from './poc-document';
import { PocCoverPage } from './poc-cover-page';
import { PocConfiguredFurniture } from './poc-page-furniture';
import { renderElementPdfBytes } from './poc-render';

/**
 * The probe document: cover (when enabled) + one wrapping body `<Page>`
 * carrying `PocConfiguredFurniture` and the document's real blocks.
 * Mirrors `PocDocument` deliberately — if this composition ever drifts
 * from it, the probe stops being evidence for the real render path, so
 * the mapping decisions (direct Page children for `break`, derived
 * heading prefixes, theme resolution) are copied verbatim.
 */
export function FurnitureProbeDocument({
  doc,
}: {
  doc: DocStudioDocument;
}): React.ReactElement {
  const { size, orientation } = doc.pageSetup;
  const { monochrome, tokens } = resolveBodyTheme(
    doc.pageTypography.bodyThemeId,
    doc.pageTypography.typography,
    doc.pageTypography.monochrome,
  );
  const { contentWidth } = computePocLayout(doc);
  const headingPrefixes = computeHeadingNumbering(doc.blocks);

  return (
    <Document
      title={doc.metadata.title}
      author={doc.metadata.organizationName}
      subject={doc.metadata.documentId}
      creator="DocStudio P06-M1 Furniture Probe"
      producer="DocStudio P06-M1 Furniture Probe (@react-pdf/renderer)"
      creationDate={new Date(doc.metadata.createdAt)}
      modificationDate={new Date(doc.metadata.modifiedAt)}
    >
      {doc.frontPage.enabled && <PocCoverPage doc={doc} />}
      <Page
        size={PAGE_FORMATS[size]}
        orientation={orientation}
        style={pocPageStyle(doc, tokens)}
        wrap
      >
        <PocConfiguredFurniture doc={doc} tokens={tokens} />
        {doc.blocks.map((block, index) => {
          const forceBreak =
            index > 0 && doc.blocks[index - 1].data.type === 'page-break';
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

/** Render the probe to real PDF bytes (Node `toBuffer` / browser `toBlob`). */
export async function renderFurnitureProbePdfBytes(
  doc: DocStudioDocument,
): Promise<Uint8Array> {
  return renderElementPdfBytes(FurnitureProbeDocument({ doc }));
}
