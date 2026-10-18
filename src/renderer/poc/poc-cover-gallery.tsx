/**
 * DocStudio — P04-M4 Cover Theme Gallery
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * One deterministic, multi-page PDF showing all ten cover/front-page
 * compositions side by side (project_details.md §7.3, P04-M4 §7).  Each
 * page is the REAL cover renderer output — `buildCoverSampleDoc` →
 * `PocCoverPage` — the exact component `PocDocument` mounts when
 * `frontPage.enabled`, so the gallery is the renderable product, not a
 * parallel mock.
 *
 * No gallery chrome is drawn on the pages themselves (a banner would
 * disturb the compositions); page N corresponds to the Nth theme in
 * `COVER_THEME_IDS`, and the manifest records that mapping.
 *
 * @module renderer/poc/poc-cover-gallery
 */

import React from 'react';
import { Document } from '@react-pdf/renderer';
import type { CoverThemeId } from '../../types/document';
import { COVER_THEME_IDS, COVER_THEME_REGISTRY } from '../../services/cover-theme-registry';
import { buildCoverSampleDoc } from './cover-sample-doc';
import { PocCoverPage } from './poc-cover-page';
import { renderElementPdfBytes } from './poc-render';

/**
 * The ten-cover gallery document (colour or monochrome variant).
 * Document-level PDF metadata is fixed (from the sample's fixed
 * timestamps) so repeated renders are byte-comparable.
 */
export function CoverGalleryDocument({
  monochrome,
}: {
  monochrome: boolean;
}): React.ReactElement {
  const seed = buildCoverSampleDoc('classic-formal', monochrome);
  const galleryTitle =
    `DocStudio P04-M4 Cover Gallery (${monochrome ? 'monochrome' : 'colour'})` +
    ' — Synthetic Sample';
  const creationDate = new Date(seed.metadata.createdAt);
  const modificationDate = new Date(seed.metadata.modifiedAt);
  return (
    <Document
      title={galleryTitle}
      author="DocStudio Synthetic Sample (Not A Real Laboratory)"
      subject="Ten cover/front-page themes — synthetic comparison sample"
      creator="DocStudio P04-M4 Cover Gallery"
      producer="DocStudio P04-M4 Cover Gallery (@react-pdf/renderer)"
      creationDate={creationDate}
      modificationDate={modificationDate}
    >
      {COVER_THEME_IDS.map((themeId) => (
        <CoverGalleryPage key={themeId} themeId={themeId} monochrome={monochrome} />
      ))}
    </Document>
  );
}

/** One theme's cover page in the gallery (the real renderer component). */
function CoverGalleryPage({
  themeId,
  monochrome,
}: {
  themeId: CoverThemeId;
  monochrome: boolean;
}): React.ReactElement {
  const doc = buildCoverSampleDoc(themeId, monochrome);
  return <PocCoverPage doc={doc} />;
}

/** Render the colour or monochrome cover gallery to PDF bytes. */
export async function renderCoverGalleryPdfBytes(monochrome: boolean): Promise<Uint8Array> {
  return renderElementPdfBytes(CoverGalleryDocument({ monochrome }));
}

/** Manifest entry: theme identity + the settings the gallery exercised. */
export interface CoverManifestEntry {
  page: number;
  themeId: CoverThemeId;
  displayName: string;
  intent: string;
  structuralDesign: string;
  implementationStatus: string;
  structure: string;
  metadataStyle: string;
  metadataColumns: number;
  logoPlacement: string;
  synopsisPlacement: string;
  backgroundTreatment: string;
  ornaments: Record<string, number>;
  monochrome: boolean;
}

/** Build the deterministic manifest for one gallery variant. */
export function coverManifestEntries(monochrome: boolean): CoverManifestEntry[] {
  return COVER_THEME_IDS.map((themeId, index) => {
    const def = COVER_THEME_REGISTRY[themeId];
    return {
      page: index + 1,
      themeId,
      displayName: def.metadata.displayName,
      intent: def.metadata.intent,
      structuralDesign: def.metadata.structuralDesign,
      implementationStatus: def.metadata.implementationStatus,
      structure: def.tokens.structure,
      metadataStyle: def.tokens.metadataStyle,
      metadataColumns: def.tokens.metadataColumns,
      logoPlacement: def.tokens.logoPlacement,
      synopsisPlacement: def.tokens.synopsisPlacement,
      backgroundTreatment: def.tokens.backgroundTreatment,
      ornaments: { ...def.tokens.ornaments },
      monochrome,
    };
  });
}
