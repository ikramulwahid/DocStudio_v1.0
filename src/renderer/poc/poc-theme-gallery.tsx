/**
 * DocStudio — P04-M3 Theme Gallery
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * One deterministic, multi-page PDF showing all ten body-page themes side
 * by side (project_details.md §8.3, P04-M3 §6).  Each theme occupies its
 * own page(s) of the SYNTHETIC sample document, rendered through the SAME
 * building blocks `PocDocument` uses — `resolveBodyTheme` →
 * `pocPageStyle` → `PocPageFurniture` → `BlockRenderer` — so the gallery
 * is the real renderable output, not a parallel mock.
 *
 * Gallery chrome (the `P04-M3 THEME GALLERY …` banner) is a fixed neutral
 * gray constant outside the theme system: labels must be identical across
 * sections so the comparison shows only theme structure.
 *
 * @module renderer/poc/poc-theme-gallery
 */

import React from 'react';
import { Document, Page, Text } from '@react-pdf/renderer';
import type { BodyThemeId } from '../../types/document';
import { BODY_THEME_IDS, BODY_THEME_REGISTRY } from '../../services/body-theme-registry';
import { resolveBodyTheme } from '../../services/body-theme-tokens';
import { buildThemeSampleDoc } from './theme-sample-doc';
import {
  BlockRenderer,
  PAGE_FORMATS,
  PocPageFurniture,
  computePocLayout,
  pocPageStyle,
} from './poc-document';
import { renderElementPdfBytes } from './poc-render';

/** Fixed gallery-label style — deliberately NOT theme-driven. */
const GALLERY_BANNER = {
  fontSize: 8,
  color: '#888888',
  marginBottom: 6,
} as const;

/** One theme's section of the gallery: banner + furniture + sample blocks. */
function ThemeGallerySection({
  themeId,
  monochrome,
}: {
  themeId: BodyThemeId;
  monochrome: boolean;
}): React.ReactElement {
  const doc = buildThemeSampleDoc(themeId, monochrome);
  // Same single theme-resolution call site as PocDocument: document
  // settings → resolved tokens (deterministic, non-mutating, throws on
  // an unknown id — impossible here, the ids come from the registry).
  const tokens = resolveBodyTheme(
    doc.pageTypography.bodyThemeId,
    doc.pageTypography.typography,
    doc.pageTypography.monochrome,
  ).tokens;
  const layout = computePocLayout(doc);
  const meta = BODY_THEME_REGISTRY[themeId].metadata;

  return (
    <Page
      size={PAGE_FORMATS[doc.pageSetup.size]}
      orientation={doc.pageSetup.orientation}
      style={pocPageStyle(doc, tokens)}
      wrap
    >
      <Text style={GALLERY_BANNER}>
        {`P04-M3 THEME GALLERY — ${meta.displayName} (${themeId}) — ${
          monochrome ? 'MONOCHROME' : 'COLOUR'
        } — SYNTHETIC SAMPLE (NOT REAL DATA)`}
      </Text>
      <PocPageFurniture doc={doc} tokens={tokens} />
      {/* Sample blocks are direct Page children (same react-pdf `break`
          requirement P04-M4 documents for PocDocument); the sample
          contains no page-break blocks. */}
      {doc.blocks.map((block) => (
        <BlockRenderer
          key={block.id}
          block={block.data}
          doc={doc}
          contentWidth={layout.contentWidth}
          tokens={tokens}
        />
      ))}
    </Page>
  );
}

/**
 * The ten-theme gallery document (colour or monochrome variant).
 * Document-level PDF metadata is fixed (from the sample's fixed
 * timestamps) so repeated renders are byte-comparable.
 */
export function ThemeGalleryDocument({
  monochrome,
}: {
  monochrome: boolean;
}): React.ReactElement {
  const seed = buildThemeSampleDoc('classic-formal', monochrome);
  const galleryTitle =
    `DocStudio P04-M3 Theme Gallery (${monochrome ? 'monochrome' : 'colour'})` +
    ' — Synthetic Sample';
  const creationDate = new Date(seed.metadata.createdAt);
  const modificationDate = new Date(seed.metadata.modifiedAt);
  return (
    <Document
      title={galleryTitle}
      author="DocStudio Synthetic Sample (Not A Real Laboratory)"
      subject="Ten body-page themes — synthetic comparison sample"
      creator="DocStudio P04-M3 Theme Gallery"
      producer="DocStudio P04-M3 Theme Gallery (@react-pdf/renderer)"
      creationDate={creationDate}
      modificationDate={modificationDate}
    >
      {BODY_THEME_IDS.map((themeId) => (
        <ThemeGallerySection key={themeId} themeId={themeId} monochrome={monochrome} />
      ))}
    </Document>
  );
}

/** Render the gallery to PDF bytes through the shared byte-collection path. */
export async function renderThemeGalleryPdfBytes(
  monochrome: boolean,
): Promise<Uint8Array> {
  return renderElementPdfBytes(ThemeGalleryDocument({ monochrome }) as React.ReactElement);
}
