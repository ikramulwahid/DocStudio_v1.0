/**
 * DocStudio — Settings-driven page furniture (P06-M1)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Renders the AUTHORITATIVE `document.headerFooter` configuration —
 * header grid, footer grid and watermark — as real PDF page furniture
 * (project_details.md §9: "must be part of the final document rendering,
 * not UI-only overlays").
 *
 * DECISION BOUNDARY — PARTIALLY WIRED INTO `PocDocument`
 * ────────────────────────────────────────────────────
 * The WATERMARK layer below IS wired into `PocDocument` (P06-M1): the
 * legacy furniture had no watermark concept at all, and
 * `WatermarkLayer` returns `null` while the watermark is disabled, so
 * every committed render baseline (watermarks off) keeps its exact
 * bytes — no fixture, assertion or baseline is touched.
 *
 * The HEADER/FOOTER GRIDS are complete but NOT activated yet.  Replacing
 * the original hard-coded furniture (the "{documentId} - DocStudio
 * Renderer Proof of Concept" header line and the fixed "Page X of Y"
 * footer of P02-M4) with the settings-driven band layer necessarily
 * changes the bytes of every committed render baseline (P02-M4 fixture
 * PDF, P04-M2-M4 gallery artifacts — see DEC-006/DEC-008): any
 * document's output differs, because the old header text, the old
 * footer placement (the off-page DEC-006 defect) and the default grid's
 * per-page suppression cannot be reproduced from the grid model.  No
 * compatibility trick exists that is not a fixture/test-identity or
 * hidden-mode special case (forbidden), so the band-activation step
 * awaits the owner's explicit baseline-regeneration authorization
 * (DEC-008).  The components below are complete and verified against
 * their own renders by verify_p06_m1.mjs; only the band activation
 * inside `PocDocument` is deferred.
 *
 * Engine geometry facts (verified empirically against the renderer in
 * P06-M1, not assumed)
 * ─────────────────────
 * • Absolute children of `<Page>` are positioned in a TOP-DOWN space
 *   measured from the PAPER top-left corner; the engine passes style
 *   coordinates through verbatim (probe: `left:100, top:200` emits
 *   `1 0 0 1 100 200 cm` inside the page's flip transform).  Margins are
 *   NOT added automatically, so every coordinate below is computed from
 *   target-page geometry explicitly.
 * • `fixed` is honored on DIRECT children of `<Page>` (the layout's
 *   `splitNodes` repeats such nodes to every continuation page); a
 *   fragment flattens, so this layer's top-level children qualify.
 * • The DEC-006 defect class: a node that is BOTH `fixed` AND dynamic
 *   (`render` prop) with a `bottom:`-anchored absolute box drifts
 *   off-page (`q 1 0 0 1 0 -11214.6 cm` in the committed baseline).
 *   A full P06-M1 matrix measured where the `render`-prop text of THIS
 *   layer may be anchored (single wrapping `<Page>`, 3 pages, text
 *   position decoded from the emitted `cm`/`Tm` chains):
 *   (a) `bottom:` anchoring — on the fixed node or on an absolutely
 *       positioned wrapper inside a stretched box — reproduces DEC-006
 *       (footer text measured at y ≈ -973k on page 2);
 *   (b) any SIZED container between the fixed node and the cell
 *       (`height`, `justifyContent:flex-end`, `paddingBottom`) makes the
 *       `render` text draw NOTHING (the row box lands, the glyphs do
 *       not);
 *   (c) a height-less, TOP-anchored fixed box with a computed `top`
 *       draws the `render` text at exactly that `top`, on every
 *       continuation page (measured: rows end `offsetPt` above the page
 *       bottom).  Both bands therefore use (c) — the footer's `top` is
 *       derived as `pageHeight - offset - rows × cellMinHeight`, the
 *       engine's own minimum row height, which is exact for the
 *       single-line rows of a normal grid and lets a cell whose text
 *       WRAPS grow downward into the bottom margin (recorded
 *       limitation; the Phase 08 pagination engine owns real
 *       reservation);
 *   (d) `render` + any rotation in the ancestor chain explodes the
 *       transform (a `rotate(45deg)` layer emits translations like
 *       `1847889 765072 cm`, growing by ~5000x per continuation page),
 *       so the WATERMARK — the only rotated layer — deliberately uses
 *       static children instead of `render`.  That is behaviourally
 *       identical here: `watermarkRendersOnPage` only excludes cover
 *       pages, and the cover is a separate `<Page>` that never receives
 *       this layer, so every page that reaches it renders the same
 *       text.
 *   No layer here repeats the broken DEC-006 `bottom:` form.
 *
 * Rendering rules (documented decisions)
 * ──────────────────────────────────────
 * • Horizontal geometry — bands and the watermark are confined to the
 *   PRINTABLE column: `left: marginLeft`, `width: contentWidth` (the
 *   watermark's stored fractions are measured over that same column).
 *   Nothing draws off-page or through the margins horizontally.
 * • Vertical geometry — the header's top edge sits at the theme's
 *   `pageFurniture.offsetPt` from the page edge (the token's documented
 *   meaning, same as the legacy header); the footer's rows END at
 *   `offsetPt` above the page bottom, achieved by top-anchoring the
 *   band at `pageHeight - offset - rows × cellMinHeight` (engine fact
 *   (c) above — the only anchor form the `render` cells honor).  Both
 *   live in the margin bands for typical grids; a tall multi-row grid
 *   grows toward the content area and may overlap body text — react-pdf
 *   fixed layers reserve no flow space (same limitation the legacy
 *   furniture has; the Phase 08 pagination engine owns real
 *   reservation).
 * • Typography/ink — every cell and the watermark use the resolved
 *   BODY-THEME page-furniture tokens where the model has no property of
 *   its own (cell size + colour); the watermark uses its OWN stored
 *   colour/opacity/rotation/font size.  The application UI mode
 *   (multicolor/light/dark) never reaches this layer.
 * • Per-cell alignment — horizontal from `cell.hAlign`; vertical from
 *   `cell.vAlign` inside a one-line-minimum cell box (flex alignment).
 * • Real page numbers — cell text is resolved per page through the
 *   react-pdf `render` prop with the engine's ACTUAL
 *   `{ pageNumber, totalPages }` (document-global numbering: a cover
 *   page is physical page 1); totals are never estimated.
 * • Suppression — per-page suppression (cover pages and, when
 *   `suppressOnFirstPage` is set, the first BODY page) resolves the
 *   cell text to an empty string on exactly those physical pages via
 *   the `render` prop.  The watermark needs no such call: it is
 *   identical on every body page and is never mounted on the cover
 *   (engine fact (d) above forbids `render` on the rotated layer).
 *   Empty text draws nothing; the bands are absolutely positioned, so
 *   they displace no body content either.
 * • Header composition — the §8.4 `pageTypography.displayHeader`
 *   preference stays the master switch for ANY body-page header (the
 *   established control is not replaced by the §9 band switch); the
 *   header grid requires BOTH `displayHeader` and `header.enabled`.
 *   The footer depends only on `footer.enabled` (displayHeader has
 *   never gated footers).
 * • Watermark — enabled + non-blank text only; positioned at the stored
 *   normalized coordinates measured over the CONTENT column from the
 *   paper corner (model JSDoc: fractions of content width/height),
 *   rotated around the rendered text, coloured AS STORED (monochrome
 *   converts theme inks, not explicit user properties — see
 *   `header-footer-settings`).
 * • Cover pages — never carry any of this furniture (the designed
 *   cover stays a clean separate page; `PocDocument` renders it as its
 *   own `<Page>` before the body page).
 *
 * @module renderer/poc/poc-page-furniture
 */

import React from 'react';
import { Text, View } from '@react-pdf/renderer';
import type { DocStudioDocument, HeaderFooterBand } from '../../types/document';
import type { BodyThemeTokens } from '../../services/body-theme-tokens';
import {
  resolveCellText,
  type PageNumberContext,
} from '../../services/header-footer-settings';
import { computePocLayout, mmToPt } from './poc-document';

// ─────────────────────────────────────────────────────────────────────────────
// Pure composition helpers (shared with the verify suite)
// ─────────────────────────────────────────────────────────────────────────────

/** Physical pages before the first body page (1 when a cover exists). */
export function coverOffsetPages(doc: DocStudioDocument): number {
  return doc.frontPage.enabled ? 1 : 0;
}

/**
 * §8.4 + §9 composition: the header grid renders only when the
 * established display-header preference AND the band switch are on.
 */
export function shouldRenderHeader(doc: DocStudioDocument): boolean {
  return doc.pageTypography.displayHeader && doc.headerFooter.header.enabled;
}

/** The footer depends only on its own band switch. */
export function shouldRenderFooter(doc: DocStudioDocument): boolean {
  return doc.headerFooter.footer.enabled;
}

/**
 * Whether a BAND renders on a given physical page.
 * Cover pages never carry bands; `suppressOnFirstPage` hides the band
 * on the first BODY page (physical page `coverOffset + 1`).
 */
export function bandRendersOnPage(
  band: HeaderFooterBand,
  coverOffset: number,
  page: PageNumberContext,
): boolean {
  if (!band.enabled) return false;
  if (page.pageNumber <= coverOffset) return false;
  if (band.suppressOnFirstPage && page.pageNumber === coverOffset + 1) return false;
  return true;
}

/** Whether the watermark layer renders on a given physical page. */
export function watermarkRendersOnPage(
  watermark: DocStudioDocument['headerFooter']['watermark'],
  coverOffset: number,
  page: PageNumberContext,
): boolean {
  if (!watermark.enabled || watermark.text.trim() === '') return false;
  return page.pageNumber > coverOffset;
}

// ─────────────────────────────────────────────────────────────────────────────
// Grid band
// ─────────────────────────────────────────────────────────────────────────────

interface BandGridProps {
  doc: DocStudioDocument;
  band: HeaderFooterBand;
  side: 'header' | 'footer';
  tokens: BodyThemeTokens;
  contentWidth: number;
  marginLeft: number;
  pageHeightPt: number;
  coverOffset: number;
}

/**
 * One band (header or footer) as a fixed grid layer.
 *
 * The repeated node is a STATIC, height-less, TOP-anchored absolutely
 * positioned box — at `offsetPt` for the header, at the computed band
 * top for the footer (the only anchor form the `render` cells honor —
 * see the geometry notes above); every cell's per-page text is an
 * ordinary dynamic child resolved via the `render` prop, which is also
 * where cover / first-body-page suppression is applied.
 */
function BandGrid({
  doc,
  band,
  side,
  tokens,
  contentWidth,
  marginLeft,
  pageHeightPt,
  coverOffset,
}: BandGridProps): React.ReactElement {
  const furniture = tokens.pageFurniture;
  const columnWidth = band.columnCount > 0 ? contentWidth / band.columnCount : contentWidth;
  const cellMinHeight = furniture.fontSizePt * 1.5;
  const vAlignToJustify = (v: string): 'flex-start' | 'center' | 'flex-end' =>
    v === 'top' ? 'flex-start' : v === 'bottom' ? 'flex-end' : 'center';

  const boxStyle =
    side === 'header'
      ? {
          position: 'absolute' as const,
          left: marginLeft,
          width: contentWidth,
          top: furniture.offsetPt,
        }
      : {
          position: 'absolute' as const,
          left: marginLeft,
          width: contentWidth,
          // ENGINE FACT (P06-M1, module doc (c)): `render`-prop cells
          // only land where a computed `top` says — `bottom` anchors
          // drift off-page (DEC-006) and sized/flex containers drop the
          // text entirely.  Top of the band = page bottom − offset −
          // the band's own minimum height, so its LAST row ends
          // `offsetPt` above the page bottom for single-line rows; a
          // cell whose text wraps grows downward into the margin.
          top:
            pageHeightPt -
            furniture.offsetPt -
            band.rows.length * cellMinHeight,
        };

  const rows = band.rows.map((row) => (
    <View key={row.id} style={{ flexDirection: 'row' }}>
      {row.cells.map((cell) => (
        <View
          key={cell.id}
          style={{
            width: columnWidth * cell.colSpan,
            minHeight: cellMinHeight,
            justifyContent: vAlignToJustify(cell.vAlign),
          }}
        >
          <Text
            style={{
              fontSize: furniture.fontSizePt,
              textAlign: cell.hAlign,
              color: furniture.color,
            }}
            render={({ pageNumber, totalPages }) => {
              if (!bandRendersOnPage(band, coverOffset, { pageNumber, totalPages })) return '';
              return resolveCellText(cell.content, band.pageNumberFormat, {
                documentId: doc.metadata.documentId,
                organizationName: doc.metadata.organizationName,
                pageNumber,
                totalPages,
              });
            }}
          />
        </View>
      ))}
    </View>
  ));

  return (
    <View fixed style={boxStyle}>
      {rows}
    </View>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Watermark
// ─────────────────────────────────────────────────────────────────────────────

interface WatermarkProps {
  doc: DocStudioDocument;
}

/**
 * The watermark as a fixed (static, stretched) wrapper containing one
 * absolutely positioned, rotated Text with STATIC children — again
 * keeping `fixed` and the per-page concerns separate (geometry notes
 * above).
 *
 * EXPORTED (P06-M1): `PocDocument` renders this layer alongside the
 * legacy furniture — it returns `null` while the watermark is disabled,
 * which is exactly what keeps every committed baseline byte-identical.
 *
 * The stored (positionX, positionY) fractions are measured over the
 * content column from the paper corner (model JSDoc); rotation is
 * applied by the engine around the rendered text.  An enabled watermark
 * with blank text draws nothing (documented policy).
 *
 * ENGINE FACT (P06-M1, measured): this layer uses STATIC children, not
 * the react-pdf `render` prop — `render` combined with a rotation
 * transform makes the engine emit catastrophic translations (see the
 * module doc).  The behaviour is unchanged: the watermark text is the
 * same on every body page, `watermarkRendersOnPage` only excludes
 * cover pages, and the cover is a separate `<Page>` that never mounts
 * this layer.
 */
export function WatermarkLayer({ doc }: WatermarkProps): React.ReactElement | null {
  const wm = doc.headerFooter.watermark;
  if (!wm.enabled || wm.text.trim() === '') return null;
  const layout = computePocLayout(doc);
  const left = layout.marginLeft + wm.positionX * layout.contentWidth;
  const contentHeight =
    layout.pageHeightPt -
    (mmToPt(doc.pageSetup.margins.topMm) + mmToPt(doc.pageSetup.margins.bottomMm));
  const top = layout.marginTop + wm.positionY * contentHeight;

  return (
    <View
      fixed
      style={{ position: 'absolute', left: 0, right: 0, top: 0, height: layout.pageHeightPt }}
    >
      <Text
        style={{
          position: 'absolute',
          left,
          top,
          fontSize: wm.fontSizePt,
          color: wm.color,
          opacity: wm.opacity,
          // The stylesheet's documented string form: parsed to operations.
          transform: `rotate(${wm.rotationDeg}deg)`,
        }}
      >
        {wm.text}
      </Text>
    </View>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Public composition
// ─────────────────────────────────────────────────────────────────────────────

/**
 * The complete settings-driven furniture layer for a body page:
 * header grid + footer grid + watermark, all from `doc.headerFooter`.
 * Designed to replace `PocPageFurniture` inside `PocDocument` once the
 * owner authorizes the baseline regeneration (module doc).  Until then
 * `PocDocument` renders `WatermarkLayer` from this module alongside the
 * legacy furniture, so watermark settings already reach the live
 * document path.
 */
export function PocConfiguredFurniture({
  doc,
  tokens,
}: {
  doc: DocStudioDocument;
  tokens: BodyThemeTokens;
}): React.ReactElement {
  const layout = computePocLayout(doc);
  const coverOffset = coverOffsetPages(doc);
  return (
    <>
      {shouldRenderHeader(doc) && (
        <BandGrid
          doc={doc}
          band={doc.headerFooter.header}
          side="header"
          tokens={tokens}
          contentWidth={layout.contentWidth}
          marginLeft={layout.marginLeft}
          pageHeightPt={layout.pageHeightPt}
          coverOffset={coverOffset}
        />
      )}
      {shouldRenderFooter(doc) && (
        <BandGrid
          doc={doc}
          band={doc.headerFooter.footer}
          side="footer"
          tokens={tokens}
          contentWidth={layout.contentWidth}
          marginLeft={layout.marginLeft}
          pageHeightPt={layout.pageHeightPt}
          coverOffset={coverOffset}
        />
      )}
      <WatermarkLayer doc={doc} />
    </>
  );
}
