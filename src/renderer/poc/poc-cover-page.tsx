/**
 * DocStudio — Cover/front-page renderer (P04-M4)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Renders `document.frontPage` as a separate designed FIRST page through
 * the existing @react-pdf path (project_details.md §7).  `PocDocument`
 * mounts this before the body pages when `frontPage.enabled` is true; the
 * body-page path (theme resolution, furniture, blocks) is untouched.
 *
 * Design rules:
 * • Authoritative document values only — metadata, assets and settings
 *   come straight from the document; nothing is fabricated (empty values
 *   render NOTHING, never placeholders).
 * • Assets resolve by ID from `document.assets`; a missing or invalid
 *   reference throws an explicit error (same convention as body figures).
 * • The cover NEVER inherits body-page furniture: no display header, no
 *   page numbering — so the pre-existing off-page footer defect (DEC-006,
 *   body pages only) cannot touch the cover, and the P02-M4 body-only
 *   baseline is unaffected.
 * • Colour/monochrome: `frontPage.monochrome` (independent of the body
 *   setting) is applied inside `resolveCoverTheme`; the original asset
 *   bytes are never altered — a neutral scrim provides contrast.
 * • Deterministic: fixed geometry maths, engine standard fonts, data-URI
 *   images from the document bundle.
 *
 * Renderer fidelity notes (recorded honestly):
 * • Fonts map to the PDF standard-14 families (Times/Helvetica variants);
 *   arbitrary font embedding is a Phase 08 task.
 * • `double` borders render as two nested solid borders (the engine has no
 *   native double style); dashed/dotted dash patterns are engine-defined.
 * • Corner radius uses the engine's rounded-border support.
 *
 * @module renderer/poc/poc-cover-page
 */

import React from 'react';
import { Page, Text, View, Image } from '@react-pdf/renderer';
import type {
  CoverElementPlacement,
  CoverFrameSettings,
  CoverVisibleMetadataField,
  DocStudioDocument,
  PageSize,
} from '../../types/document';
import { effectivePageDimensionsMm } from '../../services/page-typography';
import { coverFieldLabel } from '../../services/front-page';
import {
  effectiveCoverPlacement,
  type CoverPlacementDefaults,
  type CoverThemeTokens,
  type CoverTypographyRole,
} from '../../services/cover-theme-tokens';
import { resolveCoverTheme } from '../../services/cover-theme-registry';
import { mmToPt, PAGE_FORMATS } from './poc-document';

/** Style type derived from the engine's own props (same convention as P04-M3). */
type CoverStyle = NonNullable<React.ComponentProps<typeof View>['style']>;

/**
 * The page boxes (pt) the engine ACTUALLY renders for `PAGE_FORMATS` —
 * its own standard-size table.  The cover measures itself against these
 * real boxes, not the mm-derived figures (mmToPt(210) = 595.2755… for an
 * A4 whose real width is 595.28): the fixed-format wrapper spans the
 * real page edge-to-edge, and its content width seeds every column
 * calculation.  Portrait values; landscape swaps them exactly as the
 * engine does.
 */
const PAGE_BOX_PT: Record<PageSize, { width: number; height: number }> = {
  A4: { width: 595.28, height: 841.89 },
  A3: { width: 841.89, height: 1190.55 },
  A5: { width: 419.53, height: 595.28 },
  Letter: { width: 612, height: 792 },
  Legal: { width: 612, height: 1008 },
};

/**
 * Column width for wrap-based metadata rows.  An exact-fit row
 * (cell × n === container) is unsafe in floating point: the wrap test
 * compares a running sum against the container width, and a container
 * that is even one ulp short collapses the row to a SINGLE column —
 * which silently doubles the metadata block's height and, through the
 * flex bands, starved the title into ellipsised one-line text.  One
 * point of slack across the row (≈0.34 pt per column in a 3-up grid) is
 * far below anything visible and makes the intended column count
 * unconditional.
 */
const metadataCellPt = (contentW: number, columns: number): number => (contentW - 1) / columns;

// ─────────────────────────────────────────────────────────────────────────────
// Shared context and helpers
// ─────────────────────────────────────────────────────────────────────────────

/** One visible, non-empty metadata entry rendered on the cover. */
export interface CoverMetadataEntry {
  key: CoverVisibleMetadataField;
  label: string;
  value: string;
}

/**
 * Collect the visible metadata entries in the user's display order.
 * Empty/whitespace values are SKIPPED (no fabricated information);
 * unresolvable fields (removed custom field) are skipped without error;
 * dates render as their ISO calendar day (deterministic, no locale).
 */
export function coverMetadataEntries(doc: DocStudioDocument): CoverMetadataEntry[] {
  const out: CoverMetadataEntry[] = [];
  const customFields = doc.metadata.customFields;
  for (const field of doc.frontPage.visibleFields) {
    const label = coverFieldLabel(field, customFields);
    if (label === null) continue; // removed/unknown custom field — skip safely
    let value: string;
    if (field.startsWith('custom:')) {
      const id = field.slice('custom:'.length);
      value = customFields.find((f) => f.id === id)?.value ?? '';
    } else if (field === 'createdAt' || field === 'modifiedAt') {
      value = doc.metadata[field].slice(0, 10);
    } else {
      const raw = (doc.metadata as unknown as Record<string, unknown>)[field];
      if (typeof raw !== 'string') continue;
      value = raw;
    }
    const trimmed = value.trim();
    if (trimmed === '') continue; // never render empty values
    out.push({ key: field, label, value: trimmed });
  }
  return out;
}

/** Resolve an embedded asset to a data URI; explicit error on bad refs. */
export function resolveCoverAsset(
  doc: DocStudioDocument,
  assetId: string,
  role: 'logo' | 'background',
): string {
  const asset = doc.assets[assetId];
  if (!asset || !asset.base64Data) {
    throw new Error(
      `Cover ${role} asset ${assetId} not found in document.assets — cannot render front page.`,
    );
  }
  return `data:${asset.mimeType};base64,${asset.base64Data}`;
}

/** Effective logo width (mm): user value or default, capped to content. */
export function effectiveLogoWidthMm(
  doc: DocStudioDocument,
  contentWidthMm: number,
): number {
  const stored = doc.frontPage.logoWidthMm ?? 25;
  return Math.min(stored, contentWidthMm);
}

const alignToSelf = (align: CoverElementPlacement['align']): 'flex-start' | 'center' | 'flex-end' =>
  align === 'center' ? 'center' : align === 'right' ? 'flex-end' : 'flex-start';

const alignText = (align: CoverElementPlacement['align']): 'left' | 'center' | 'right' => align;

/** Font role → react-pdf style (standard-14 families by weight/style). */
function roleStyle(role: CoverTypographyRole, ink: string): CoverStyle {
  return {
    fontFamily: role.family === 'serif' ? 'Times-Roman' : 'Helvetica',
    fontSize: role.sizePt,
    fontWeight: role.weight,
    fontStyle: role.italic ? 'italic' : 'normal',
    color: ink,
  };
}

/** Everything a theme composition needs, resolved once per page. */
export interface CoverCtx {
  doc: DocStudioDocument;
  tokens: CoverThemeTokens;
  placement: Required<CoverPlacementDefaults>;
  entries: CoverMetadataEntry[];
  pageW: number; // pt
  pageH: number; // pt
  insetPt: number;
  contentW: number; // pt (page − 2·inset)
  contentInsetMm: number;
  frame: CoverFrameSettings;
  logo?: { src: string; widthPt: number };
  background?: { src: string };
}

/** Resolve the full render context for a document's front page. */
export function buildCoverCtx(doc: DocStudioDocument): CoverCtx {
  const resolution = resolveCoverTheme(doc.frontPage.themeId, {
    monochrome: doc.frontPage.monochrome,
  });
  const tokens = resolution.tokens;
  const placement = effectiveCoverPlacement(tokens.placementDefaults, doc.frontPage.placement);
  const [wMm] = effectivePageDimensionsMm(doc.pageSetup.size, doc.pageSetup.orientation);
  // Real engine page box (not the mm-derived figure) so the fixed-format
  // wrapper spans the true page and column maths keys off true content
  // width — see PAGE_BOX_PT.
  const box = PAGE_BOX_PT[doc.pageSetup.size];
  const pageW = doc.pageSetup.orientation === 'landscape' ? box.height : box.width;
  const pageH = doc.pageSetup.orientation === 'landscape' ? box.width : box.height;
  const insetPt = mmToPt(tokens.contentInsetMm);
  const contentW = pageW - 2 * insetPt;
  const logo = doc.frontPage.logoAssetId
    ? {
        src: resolveCoverAsset(doc, doc.frontPage.logoAssetId, 'logo'),
        widthPt: mmToPt(effectiveLogoWidthMm(doc, wMm - 2 * tokens.contentInsetMm)),
      }
    : undefined;
  const background = doc.frontPage.backgroundImageAssetId
    ? { src: resolveCoverAsset(doc, doc.frontPage.backgroundImageAssetId, 'background') }
    : undefined;
  return {
    doc,
    tokens,
    placement,
    entries: coverMetadataEntries(doc),
    pageW,
    pageH,
    insetPt,
    contentW,
    contentInsetMm: tokens.contentInsetMm,
    frame: doc.frontPage.frame,
    logo,
    background,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Shared building blocks
// ─────────────────────────────────────────────────────────────────────────────

/**
 * One vertical band slot (top/middle/bottom thirds of the content
 * column).  Principal elements assigned to this band render here in
 * organization → title → subtitle order with their own alignment.
 */
function PrincipalBand({
  ctx,
  band,
  inks,
  gapPt = 8,
  exclude,
  children,
}: {
  ctx: CoverCtx;
  band: CoverElementPlacement['band'];
  /** Ink override per element (e.g. reversed ink inside a dark band). */
  inks?: Partial<Record<'titleInk' | 'subtitleInk' | 'organizationInk', string>>;
  gapPt?: number;
  /** Elements composed elsewhere by the theme (avoid duplicate rendering). */
  exclude?: Array<'organizationName' | 'title' | 'subtitle'>;
  children?: React.ReactNode;
}): React.ReactElement {
  const { placement, tokens } = ctx;
  const items: Array<{ el: 'organizationName' | 'title' | 'subtitle'; text: string | undefined; role: CoverTypographyRole; ink: string }> = [];
  const org = ctx.doc.metadata.organizationName;
  if (placement.organizationName.band === band && org.trim() !== '' && !exclude?.includes('organizationName')) {
    items.push({
      el: 'organizationName',
      text: org.trim(),
      role: tokens.typography.organization,
      ink: inks?.organizationInk ?? tokens.palette.organizationInk,
    });
  }
  if (placement.title.band === band && ctx.doc.metadata.title.trim() !== '' && !exclude?.includes('title')) {
    items.push({
      el: 'title',
      text: ctx.doc.metadata.title.trim(),
      role: tokens.typography.title,
      ink: inks?.titleInk ?? tokens.palette.titleInk,
    });
  }
  const sub = ctx.doc.metadata.subtitle;
  if (placement.subtitle.band === band && sub && sub.trim() !== '' && !exclude?.includes('subtitle')) {
    items.push({
      el: 'subtitle',
      text: sub.trim(),
      role: tokens.typography.subtitle,
      ink: inks?.subtitleInk ?? tokens.palette.subtitleInk,
    });
  }
  const alignItems = items.length > 0 ? alignToSelf(placement[items[0].el].align) : 'flex-start';
  return (
    <View
      style={{
        // The band GROWS into the column's free space but is never
        // compressed below its content: a definite-height page (the
        // fixed-format cover wrapper) would otherwise hand every band an
        // equal third of the column, and a content-heavy band would then
        // squeeze its Text nodes below their natural height — react-pdf
        // truncates squeezed text with an ellipsis.  With basis auto the
        // bands start at their natural height and share the leftovers.
        flexGrow: 1,
        flexShrink: 0,
        justifyContent: band === 'top' ? 'flex-start' : band === 'bottom' ? 'flex-end' : 'center',
        alignItems,
      }}
    >
      {items.map((item) => (
        <Text
          key={item.el}
          style={{
            ...roleStyle(item.role, item.ink),
            textAlign: alignText(placement[item.el].align),
            alignSelf: alignToSelf(placement[item.el].align),
            marginBottom: gapPt,
          }}
        >
          {item.text}
        </Text>
      ))}
      {children}
    </View>
  );
}

/** Optional synopsis text (only when set and non-empty). */
function SynopsisText({
  ctx,
  style,
}: {
  ctx: CoverCtx;
  style: CoverStyle;
}): React.ReactElement | null {
  const synopsis = ctx.doc.frontPage.synopsis?.trim();
  if (!synopsis) return null;
  return <Text style={style}>{synopsis}</Text>;
}

/**
 * User-configured page frame (§7.2): absolute overlay following the page
 * geometry, honoring visibility, style, thickness, colour, corner radius
 * and inset.  `double` renders as two nested solid borders.
 */
export function CoverFrameOverlay({ ctx }: { ctx: CoverCtx }): React.ReactElement | null {
  const { frame, pageW, pageH } = ctx;
  if (!frame.visible || frame.style === 'none') return null;
  const inset = mmToPt(frame.insetMm);
  const radius = mmToPt(frame.cornerRadiusMm);
  const base: CoverStyle = {
    position: 'absolute',
    top: inset,
    left: inset,
    width: pageW - 2 * inset,
    height: pageH - 2 * inset,
    borderRadius: radius,
    borderColor: frame.color,
    borderWidth: frame.thicknessPt,
  };
  const borderStyle = frame.style === 'double' ? 'solid' : frame.style;
  if (frame.style === 'double') {
    const gap = Math.max(frame.thicknessPt * 2, 2);
    return (
      <>
        <View style={{ ...base, borderStyle: 'solid' }} />
        <View
          style={{
            ...base,
            top: inset + gap,
            left: inset + gap,
            width: pageW - 2 * (inset + gap),
            height: pageH - 2 * (inset + gap),
            borderRadius: Math.max(radius - gap, 0),
            borderWidth: Math.max(frame.thicknessPt * 0.75, 0.5),
          }}
        />
      </>
    );
  }
  return <View style={{ ...base, borderStyle }} />;
}

// ─────────────────────────────────────────────────────────────────────────────
// Metadata styles (ten presentations)
// ─────────────────────────────────────────────────────────────────────────────

const metaPairStyle = (ctx: CoverCtx, ink?: string) => ({
  ...roleStyle(ctx.tokens.typography.metadata, ink ?? ctx.tokens.palette.metadataValueInk),
});

function MetadataCenteredPairs({ ctx }: { ctx: CoverCtx }): React.ReactElement | null {
  if (ctx.entries.length === 0) return null;
  const t = ctx.tokens.typography.metadata;
  const p = ctx.tokens.palette;
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', marginBottom: 10 }}>
      {ctx.entries.map((e) => (
        <View key={e.key} style={{ width: metadataCellPt(ctx.contentW, 2), marginBottom: 4, alignItems: ctx.tokens.placementDefaults.title.align === 'center' ? 'center' : 'flex-start' }}>
          <Text style={{ ...roleStyle(t, p.metadataLabelInk), textAlign: 'center' }}>
            {e.label.toUpperCase()}
          </Text>
          <Text style={{ ...metaPairStyle(ctx), textAlign: 'center' }}>{e.value}</Text>
        </View>
      ))}
    </View>
  );
}

function MetadataBaselineInline({ ctx }: { ctx: CoverCtx }): React.ReactElement | null {
  if (ctx.entries.length === 0) return null;
  const line = ctx.entries.map((e) => `${e.label}: ${e.value}`).join('   ·   ');
  return (
    <Text style={{ ...metaPairStyle(ctx, ctx.tokens.palette.mutedInk), marginTop: 6 }}>{line}</Text>
  );
}

function MetadataBandRow({ ctx, inks }: { ctx: CoverCtx; inks: { label: string; value: string } }): React.ReactElement | null {
  if (ctx.entries.length === 0) return null;
  const t = ctx.tokens.typography.metadata;
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginTop: 6 }}>
      {ctx.entries.map((e) => (
        <View key={e.key} style={{ width: metadataCellPt(ctx.contentW, 3), marginBottom: 4 }}>
          <Text style={{ ...roleStyle(t, inks.label), fontSize: t.sizePt - 1 }}>{e.label.toUpperCase()}</Text>
          <Text style={{ ...roleStyle(t, inks.value) }}>{e.value}</Text>
        </View>
      ))}
    </View>
  );
}

function MetadataGridCells({ ctx, widthPt }: { ctx: CoverCtx; /** Actual row width when mounted inside a narrower column. */ widthPt?: number }): React.ReactElement | null {
  if (ctx.entries.length === 0) return null;
  const t = ctx.tokens.typography.metadata;
  const p = ctx.tokens.palette;
  const gutter = mmToPt(ctx.tokens.ornaments.gridGutterMm);
  // Every cell carries a right gutter (including the row's last cell), so
  // one row is 3 cells + 3 gutters — budget for all three plus the wrap
  // slack, or the third column wraps to the next line.  The row width is
  // the real container width (the sidebar composition mounts this inside
  // a column narrower than the page content width).
  const cellW = ((widthPt ?? ctx.contentW) - gutter * 3 - 1) / 3;
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginTop: 8 }}>
      {ctx.entries.map((e) => (
        <View
          key={e.key}
          style={{
            width: cellW,
            marginRight: gutter,
            marginBottom: gutter,
            borderWidth: 0.75,
            borderColor: p.ruleInk,
            padding: 4,
          }}
        >
          <Text style={{ ...roleStyle(t, p.metadataLabelInk), fontSize: t.sizePt - 1 }}>{e.label.toUpperCase()}</Text>
          <Text style={{ ...metaPairStyle(ctx) }}>{e.value}</Text>
        </View>
      ))}
    </View>
  );
}

function MetadataHeroStrip({ ctx }: { ctx: CoverCtx }): React.ReactElement | null {
  if (ctx.entries.length === 0) return null;
  const t = ctx.tokens.typography.metadata;
  const p = ctx.tokens.palette;
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginTop: 8 }}>
      {ctx.entries.map((e) => (
        <View key={e.key} style={{ width: metadataCellPt(ctx.contentW, 3), marginBottom: 4 }}>
          <Text style={{ ...roleStyle(t, p.metadataLabelInk), fontSize: t.sizePt - 1 }}>{e.label.toUpperCase()}</Text>
          <Text style={{ ...roleStyle(t, p.metadataValueInk) }}>{e.value}</Text>
        </View>
      ))}
    </View>
  );
}

function MetadataFramedBlock({ ctx }: { ctx: CoverCtx }): React.ReactElement | null {
  if (ctx.entries.length === 0) return null;
  const t = ctx.tokens.typography.metadata;
  const p = ctx.tokens.palette;
  return (
    <View
      style={{
        borderWidth: 0.5,
        borderColor: p.ruleInk,
        padding: 8,
        marginTop: 10,
        flexDirection: 'row',
        flexWrap: 'wrap',
      }}
    >
      {ctx.entries.map((e) => (
        <View key={e.key} style={{ width: ctx.contentW / 2 - 16, marginBottom: 4 }}>
          <Text style={{ ...roleStyle(t, p.metadataLabelInk), fontSize: t.sizePt - 1 }}>{e.label.toUpperCase()}</Text>
          <Text style={{ ...metaPairStyle(ctx) }}>{e.value}</Text>
        </View>
      ))}
    </View>
  );
}

function MetadataColumnPairs({ ctx }: { ctx: CoverCtx }): React.ReactElement | null {
  if (ctx.entries.length === 0) return null;
  const t = ctx.tokens.typography.metadata;
  const p = ctx.tokens.palette;
  const half = Math.ceil(ctx.entries.length / 2);
  const cols = [ctx.entries.slice(0, half), ctx.entries.slice(half)];
  return (
    <View style={{ flexDirection: 'row', marginTop: 10 }}>
      {cols.map((col, i) => (
        <View
          key={i}
          style={{
            width: ctx.contentW / 2,
            paddingLeft: i === 0 ? 0 : 10,
            paddingRight: i === 0 ? 10 : 0,
            borderRightWidth: i === 0 ? 1 : 0,
            borderColor: p.ruleInk,
          }}
        >
          {col.map((e) => (
            <View key={e.key} style={{ flexDirection: 'row', marginBottom: 4 }}>
              {/* Fixed 62 pt label column + 6 pt guaranteed air: without
                  the margin, labels that fill the column (ISSUE NUMBER,
                  PROJECT CODE) end flush against their values. */}
              <Text style={{ ...roleStyle(t, p.metadataLabelInk), width: 62, marginRight: 6, fontSize: t.sizePt - 1 }}>
                {e.label.toUpperCase()}
              </Text>
              <Text style={{ ...metaPairStyle(ctx), flex: 1 }}>{e.value}</Text>
            </View>
          ))}
        </View>
      ))}
    </View>
  );
}

function MetadataAbstractKeyValues({ ctx }: { ctx: CoverCtx }): React.ReactElement | null {
  if (ctx.entries.length === 0) return null;
  const t = ctx.tokens.typography.metadata;
  const p = ctx.tokens.palette;
  return (
    <View style={{ marginTop: 8 }}>
      {ctx.entries.map((e) => (
        <View key={e.key} style={{ flexDirection: 'row', marginBottom: 3 }}>
          <Text style={{ ...roleStyle(t, p.metadataLabelInk), width: 88 }}>{e.label}:</Text>
          <Text style={{ ...metaPairStyle(ctx), flex: 1 }}>{e.value}</Text>
        </View>
      ))}
    </View>
  );
}

function MetadataControlTable({ ctx }: { ctx: CoverCtx }): React.ReactElement | null {
  if (ctx.entries.length === 0) return null;
  const t = ctx.tokens.typography.metadata;
  const p = ctx.tokens.palette;
  const cellW = metadataCellPt(ctx.contentW, 2);
  return (
    <View style={{ marginTop: 10, flexDirection: 'row', flexWrap: 'wrap' }}>
      {ctx.entries.map((e) => (
        <View key={e.key} style={{ width: cellW, flexDirection: 'row', borderWidth: 0.75, borderColor: p.ruleInk, marginBottom: -0.75 }}>
          <Text
            style={{
              ...roleStyle(t, p.metadataLabelInk),
              width: cellW * 0.42,
              padding: 3,
              backgroundColor: p.secondaryAccent,
              fontSize: t.sizePt - 1,
            }}
          >
            {e.label.toUpperCase()}
          </Text>
          <Text style={{ ...metaPairStyle(ctx), width: cellW * 0.58, padding: 3 }}>{e.value}</Text>
        </View>
      ))}
    </View>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Ten cover compositions
// ─────────────────────────────────────────────────────────────────────────────

/**
 * 1. Classic Formal — `centered-ornament`.
 * Centered serif title block between twin rules; centered logo at the
 * head; centered metadata pairs near the foot; optional inset image.
 */
function CoverClassicFormal({ ctx }: { ctx: CoverCtx }): React.ReactElement {
  const { tokens } = ctx;
  const p = tokens.palette;
  return (
    <>
      <View style={{ alignItems: 'center', marginBottom: 14 }}>
        {ctx.logo && <Image src={ctx.logo.src} style={{ width: ctx.logo.widthPt, marginBottom: 8 }} />}
        <View style={{ width: 160, height: 1, backgroundColor: p.ruleInk, marginBottom: 14 }} />
      </View>
      <View style={{ flexGrow: 1, flexShrink: 0, flexDirection: 'column' }}>
        <PrincipalBand ctx={ctx} band="top" />
        <PrincipalBand ctx={ctx} band="middle">
          <SynopsisText
            ctx={ctx}
            style={{ ...roleStyle(tokens.typography.synopsis, p.mutedInk), textAlign: 'center', marginTop: 6, maxWidth: ctx.contentW * 0.8 }}
          />
        </PrincipalBand>
        <PrincipalBand ctx={ctx} band="bottom" />
      </View>
      {ctx.background && (
        <Image src={ctx.background.src} style={{ width: ctx.contentW * 0.4, alignSelf: 'center', marginBottom: 8 }} />
      )}
      <MetadataCenteredPairs ctx={ctx} />
      <View style={{ width: 160, height: 1, backgroundColor: p.ruleInk, alignSelf: 'center' }} />
    </>
  );
}

/**
 * 2. Minimalist — `asymmetric-minimal`.
 * Small logo top-left, single hairline, left-anchored title low on the
 * page, synopsis at the lower left, compact inline metadata baseline.
 */
function CoverMinimalist({ ctx }: { ctx: CoverCtx }): React.ReactElement {
  const { tokens } = ctx;
  const p = tokens.palette;
  return (
    <>
      <View style={{ alignItems: 'flex-start', marginBottom: 10 }}>
        {ctx.logo && <Image src={ctx.logo.src} style={{ width: ctx.logo.widthPt * 0.8 }} />}
        <View style={{ width: 64, height: 0.5, backgroundColor: p.ruleInk, marginTop: 10 }} />
      </View>
      <View style={{ flexGrow: 1, flexShrink: 0, flexDirection: 'column' }}>
        <PrincipalBand ctx={ctx} band="top" />
        <PrincipalBand ctx={ctx} band="middle">
          <SynopsisText
            ctx={ctx}
            style={{ ...roleStyle(tokens.typography.synopsis, p.mutedInk), marginTop: 10, maxWidth: ctx.contentW * 0.65 }}
          />
        </PrincipalBand>
        <PrincipalBand ctx={ctx} band="bottom" />
      </View>
      {ctx.background && (
        <Image src={ctx.background.src} style={{ width: ctx.contentW * 0.32, alignSelf: 'flex-end', marginBottom: 8 }} />
      )}
      <MetadataBaselineInline ctx={ctx} />
    </>
  );
}

/**
 * 3. Corporate Band — `full-width-band`.
 * Dark top band (organization + logo reversed) and dark bottom band with
 * a 3-column metadata row; bold left title and synopsis in the open
 * middle zone.
 */
function CoverCorporateBand({ ctx }: { ctx: CoverCtx }): React.ReactElement {
  const { tokens, pageW, pageH } = ctx;
  const p = tokens.palette;
  const topH = mmToPt(tokens.ornaments.bandHeightMmTop);
  const bottomH = mmToPt(tokens.ornaments.bandHeightMmBottom);
  // Organization lives in the dark top band while its placement band is
  // 'top' (theme default); moved elsewhere by the user, the middle-zone
  // bands render it instead (never twice).
  const orgInBand = ctx.placement.organizationName.band === 'top';
  return (
    <>
      {/* Full-bleed top band with organization + logo (reversed ink).
          `minHeight` keeps the theme's designed band height while letting
          the band grow for long organization names — a fixed height would
          clip user content inside the dark band. */}
      <View
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          width: pageW,
          minHeight: topH,
          backgroundColor: p.accent,
          flexDirection: 'row',
          alignItems: 'center',
          paddingLeft: ctx.insetPt,
          paddingRight: ctx.insetPt,
        }}
      >
        <View style={{ flex: 1 }}>
          {orgInBand && ctx.doc.metadata.organizationName.trim() !== '' && (
            <Text style={{ ...roleStyle(tokens.typography.organization, p.onBandInk) }}>
              {ctx.doc.metadata.organizationName.trim()}
            </Text>
          )}
        </View>
        {ctx.logo && <Image src={ctx.logo.src} style={{ width: ctx.logo.widthPt * 0.8 }} />}
      </View>
      {/* Full-bleed bottom band with the metadata row — grows upward past
          the designed height rather than clipping rows off the page. */}
      <View
        style={{
          position: 'absolute',
          bottom: 0,
          left: 0,
          width: pageW,
          minHeight: bottomH,
          backgroundColor: p.secondaryAccent,
          paddingLeft: ctx.insetPt,
          paddingRight: ctx.insetPt,
          paddingTop: 6,
        }}
      >
        {/* Background gradient decorates the band's top edge from inside,
            so it can never cross the metadata rows however tall the band
            grows. */}
        {ctx.background && (
          <Image src={ctx.background.src} style={{ width: ctx.contentW, height: 40, opacity: 0.85, marginBottom: 4 }} />
        )}
        <MetadataBandRow ctx={ctx} inks={{ label: p.metadataLabelInk, value: p.onBandInk }} />
      </View>
      {/* Open middle zone: principal elements + synopsis. */}
      <View
        style={{
          position: 'absolute',
          top: topH,
          left: ctx.insetPt,
          width: ctx.contentW,
          height: pageH - topH - bottomH,
          flexDirection: 'column',
        }}
      >
        <PrincipalBand
          ctx={ctx}
          band="top"
          exclude={orgInBand ? ['organizationName'] : undefined}
        >
          <SynopsisText
            ctx={ctx}
            style={{ ...roleStyle(tokens.typography.synopsis, p.mutedInk), marginTop: 10, maxWidth: ctx.contentW * 0.8 }}
          />
        </PrincipalBand>
        <PrincipalBand ctx={ctx} band="middle" />
        <PrincipalBand ctx={ctx} band="bottom" />
      </View>
    </>
  );
}

/**
 * 4. Technical Grid — `sidebar-grid`.
 * Full-height left sidebar with vertical document code; top-left title
 * under a heavy rule; 3-column bordered metadata grid; grid-span synopsis.
 */
function CoverTechnicalGrid({ ctx }: { ctx: CoverCtx }): React.ReactElement {
  const { tokens, pageH } = ctx;
  const p = tokens.palette;
  const sideW = mmToPt(14);
  return (
    <>
      <View
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          width: sideW,
          height: pageH,
          backgroundColor: p.accent,
        }}
      />
      <View
        style={{
          position: 'absolute',
          top: ctx.insetPt,
          left: sideW + 8,
          width: ctx.contentW - sideW,
          height: pageH - 2 * ctx.insetPt,
          flexDirection: 'column',
        }}
      >
        <View style={{ height: 1.5, backgroundColor: p.ruleInk, marginBottom: 12 }} />
        {ctx.logo && (
          <View style={{ alignItems: 'flex-end', marginBottom: 8 }}>
            <Image src={ctx.logo.src} style={{ width: ctx.logo.widthPt * 0.7 }} />
          </View>
        )}
        <View style={{ flexGrow: 1, flexShrink: 0, flexDirection: 'column' }}>
          <PrincipalBand ctx={ctx} band="top" />
          <PrincipalBand ctx={ctx} band="middle" />
          <PrincipalBand ctx={ctx} band="bottom" />
        </View>
        <MetadataGridCells ctx={ctx} widthPt={ctx.contentW - sideW} />
        <SynopsisText
          ctx={ctx}
          style={{ ...roleStyle(tokens.typography.synopsis, p.mutedInk), marginTop: 6 }}
        />
      </View>
    </>
  );
}

/**
 * 5. Editorial Split — `split-vertical`.
 * Colored left panel (logo, organization, stacked metadata, synopsis in
 * reversed ink); wide right column with a large serif title block.
 */
function CoverEditorialSplit({ ctx }: { ctx: CoverCtx }): React.ReactElement {
  const { tokens, pageW, pageH } = ctx;
  const p = tokens.palette;
  const panelW = pageW * tokens.ornaments.splitRatio;
  // Organization lives in the left panel while its placement band is
  // 'top' (theme default); moved by the user, the right column renders it.
  const orgInPanel = ctx.placement.organizationName.band === 'top';
  return (
    <>
      <View
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          width: panelW,
          height: pageH,
          backgroundColor: p.accent,
          paddingTop: ctx.insetPt,
          paddingBottom: ctx.insetPt,
          paddingLeft: ctx.insetPt,
          paddingRight: 12,
        }}
      >
        {ctx.logo && <Image src={ctx.logo.src} style={{ width: ctx.logo.widthPt * 0.8, marginBottom: 10 }} />}
        {orgInPanel && ctx.doc.metadata.organizationName.trim() !== '' && (
          <Text style={{ ...roleStyle(tokens.typography.organization, p.onBandInk) }}>
            {ctx.doc.metadata.organizationName.trim()}
          </Text>
        )}
        <MetadataStackedPanelDark ctx={ctx} />
        <View style={{ flex: 1 }} />
        <SynopsisText
          ctx={ctx}
          style={{ ...roleStyle(tokens.typography.synopsis, p.onBandInk), opacity: 0.9 }}
        />
      </View>
      <View style={{ position: 'absolute', top: 0, left: panelW, width: 1.5, height: pageH, backgroundColor: p.ruleInk }} />
      <View
        style={{
          position: 'absolute',
          top: ctx.insetPt,
          left: panelW + 20,
          width: pageW - panelW - 20 - ctx.insetPt,
          height: pageH - 2 * ctx.insetPt,
          flexDirection: 'column',
        }}
      >
        <PrincipalBand ctx={ctx} band="top" exclude={orgInPanel ? ['organizationName'] : undefined} />
        <PrincipalBand ctx={ctx} band="middle" />
        <PrincipalBand ctx={ctx} band="bottom" />
      </View>
      {ctx.background && (
        <Image
          src={ctx.background.src}
          style={{ position: 'absolute', top: 0, left: 0, width: panelW, height: pageH, opacity: 0.35 }}
        />
      )}
    </>
  );
}

/** Stacked metadata in reversed ink for the dark editorial panel. */
function MetadataStackedPanelDark({ ctx }: { ctx: CoverCtx }): React.ReactElement | null {
  if (ctx.entries.length === 0) return null;
  const t = ctx.tokens.typography.metadata;
  const p = ctx.tokens.palette;
  return (
    <View style={{ marginTop: 12 }}>
      {ctx.entries.map((e) => (
        <View key={e.key} style={{ marginBottom: 5 }}>
          <Text style={{ ...roleStyle(t, p.secondaryAccent), fontSize: t.sizePt - 1 }}>{e.label.toUpperCase()}</Text>
          <Text style={{ ...roleStyle(t, p.onBandInk) }}>{e.value}</Text>
        </View>
      ))}
    </View>
  );
}

/**
 * 6. Photographic Hero — `full-bleed-hero`.
 * Full-bleed image (or dark fallback stage) under a bottom scrim; bold
 * reversed title in the scrim; organization + logo overlaid top-left;
 * 3-column metadata footer strip.
 */
function CoverPhotographicHero({ ctx }: { ctx: CoverCtx }): React.ReactElement {
  const { tokens, pageW, pageH } = ctx;
  const p = tokens.palette;
  const scrimH = mmToPt(tokens.ornaments.bandHeightMmBottom);
  return (
    <>
      {/* Dark hero stage (fallback when no image) + optional image + wash. */}
      <View style={{ position: 'absolute', top: 0, left: 0, width: pageW, height: pageH, backgroundColor: p.accent }} />
      {ctx.background && (
        <Image src={ctx.background.src} style={{ position: 'absolute', top: 0, left: 0, width: pageW, height: pageH }} />
      )}
      <View
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          width: pageW,
          height: pageH,
          backgroundColor: ctx.background ? p.overlayInk : 'rgba(0,0,0,0)',
        }}
      />
      {/* Bottom contrast scrim behind the title zone. */}
      <View
        style={{
          position: 'absolute',
          bottom: 0,
          left: 0,
          width: pageW,
          height: scrimH,
          backgroundColor: p.accent,
          opacity: ctx.background ? 0.82 : 1,
        }}
      />
      {/* Full-height principal zones over wash + scrim (reversed ink). */}
      <View
        style={{
          position: 'absolute',
          top: ctx.insetPt,
          left: ctx.insetPt,
          width: ctx.contentW,
          height: pageH - 2 * ctx.insetPt,
          flexDirection: 'column',
        }}
      >
        <PrincipalBand
          ctx={ctx}
          band="top"
          inks={{ organizationInk: p.onBandInk, titleInk: p.onBandInk, subtitleInk: p.onBandInk }}
        />
        <PrincipalBand
          ctx={ctx}
          band="middle"
          inks={{ organizationInk: p.onBandInk, titleInk: p.onBandInk, subtitleInk: p.onBandInk }}
        />
        <PrincipalBand
          ctx={ctx}
          band="bottom"
          inks={{ organizationInk: p.onBandInk, titleInk: p.onBandInk, subtitleInk: p.onBandInk }}
        >
          <MetadataHeroStrip ctx={ctx} />
        </PrincipalBand>
      </View>
      {/* Overlay logo top-right (organization holds top-left by default). */}
      {ctx.logo && (
        <Image src={ctx.logo.src} style={{ position: 'absolute', top: ctx.insetPt, right: ctx.insetPt, width: ctx.logo.widthPt * 0.9 }} />
      )}
    </>
  );
}

/**
 * 7. Institutional Frame — `nested-frame`.
 * Nested inner frame; centered logo at the frame head above a hairline;
 * centered serif title block; bordered metadata block at the foot.
 */
function CoverInstitutionalFrame({ ctx }: { ctx: CoverCtx }): React.ReactElement {
  const { tokens } = ctx;
  const p = tokens.palette;
  const nested = mmToPt(tokens.ornaments.nestedInsetMm);
  return (
    <>
      <View
        style={{
          position: 'absolute',
          top: nested,
          left: nested,
          width: ctx.pageW - 2 * nested,
          height: ctx.pageH - 2 * nested,
          borderWidth: 0.75,
          borderColor: p.ruleInk,
        }}
      />
      <View style={{ alignItems: 'center', marginBottom: 10 }}>
        {ctx.logo && <Image src={ctx.logo.src} style={{ width: ctx.logo.widthPt, marginBottom: 8 }} />}
        <View style={{ width: 120, height: 0.75, backgroundColor: p.ruleInk }} />
      </View>
      <View style={{ flexGrow: 1, flexShrink: 0, flexDirection: 'column' }}>
        <PrincipalBand ctx={ctx} band="top" />
        <PrincipalBand ctx={ctx} band="middle">
          <SynopsisText
            ctx={ctx}
            style={{ ...roleStyle(tokens.typography.synopsis, p.mutedInk), textAlign: 'center', marginTop: 6 }}
          />
        </PrincipalBand>
        <PrincipalBand ctx={ctx} band="bottom" />
      </View>
      <MetadataFramedBlock ctx={ctx} />
    </>
  );
}

/**
 * 8. Geometric — `diagonal-geometry`.
 * Corner blocks and floating shapes; right-anchored organization; left
 * title block; two rule-separated metadata columns; synopsis strip over
 * a full-width accent rule.
 */
function CoverGeometric({ ctx }: { ctx: CoverCtx }): React.ReactElement {
  const { tokens, pageW, pageH } = ctx;
  const p = tokens.palette;
  const corner = mmToPt(tokens.ornaments.cornerBlockMm);
  return (
    <>
      {/* Corner + floating shapes (the theme's geometric signature). */}
      <View style={{ position: 'absolute', top: 0, left: 0, width: corner, height: corner, backgroundColor: p.accent }} />
      <View
        style={{
          position: 'absolute',
          top: pageH - corner * 0.55,
          left: pageW - corner * 0.75,
          width: corner * 0.55,
          height: corner * 0.55,
          backgroundColor: p.secondaryAccent,
          borderRadius: corner * 0.275,
        }}
      />
      <View
        style={{
          position: 'absolute',
          top: ctx.insetPt * 0.5,
          right: ctx.insetPt * 2,
          width: 22,
          height: 8,
          backgroundColor: p.accent,
          borderRadius: 4,
        }}
      />
      <View
        style={{
          position: 'absolute',
          top: ctx.insetPt,
          left: corner + 14,
          width: pageW - corner - 14 - ctx.insetPt,
          height: pageH - 2 * ctx.insetPt,
          flexDirection: 'column',
        }}
      >
        <PrincipalBand ctx={ctx} band="top" />
        <PrincipalBand ctx={ctx} band="middle" />
        <PrincipalBand ctx={ctx} band="bottom" />
      </View>
      {/* Foot zone in ONE anchored stack — metadata columns, then the
          accent rule + synopsis strip — so the two blocks can never
          overlap however many entries are visible. */}
      <View style={{ position: 'absolute', bottom: mmToPt(16), left: ctx.insetPt, width: ctx.contentW }}>
        <MetadataColumnPairs ctx={ctx} />
        <View style={{ height: 3, backgroundColor: p.accent, marginTop: 8, marginBottom: 6 }} />
        <SynopsisText ctx={ctx} style={{ ...roleStyle(tokens.typography.synopsis, p.mutedInk) }} />
      </View>
      {ctx.logo && (
        <Image src={ctx.logo.src} style={{ position: 'absolute', top: 6, left: 6, width: ctx.logo.widthPt * 0.6 }} />
      )}
      {ctx.background && (
        <Image
          src={ctx.background.src}
          // Floats in the open upper-right zone: below the organization
          // line, above the title block, clear of the foot stack.
          style={{ position: 'absolute', top: ctx.insetPt * 2.2, right: ctx.insetPt, width: ctx.contentW * 0.22 }}
        />
      )}
    </>
  );
}

/**
 * 9. Scientific Publication — `journal-columns`.
 * Running head with logo right + journal rule; compact top title; author
 * line; boxed abstract; compact key-value metadata column.
 */
function CoverScientificPublication({ ctx }: { ctx: CoverCtx }): React.ReactElement {
  const { tokens } = ctx;
  const p = tokens.palette;
  return (
    <>
      <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 4 }}>
        <Text style={{ ...roleStyle(tokens.typography.metadata, p.mutedInk) }}>
          {ctx.doc.metadata.documentId}
        </Text>
        <View style={{ flex: 1 }} />
        {ctx.logo && <Image src={ctx.logo.src} style={{ width: ctx.logo.widthPt * 0.6 }} />}
      </View>
      <View style={{ height: 1.25, backgroundColor: p.ruleInk, marginBottom: 14 }} />
      <View style={{ flexGrow: 1, flexShrink: 0, flexDirection: 'column' }}>
        <PrincipalBand ctx={ctx} band="top">
          {ctx.doc.frontPage.synopsis?.trim() && (
            <View style={{ borderWidth: 0.5, borderColor: p.ruleInk, padding: 8, marginTop: 12 }}>
              <Text style={{ ...roleStyle(tokens.typography.synopsis, p.metadataLabelInk), marginBottom: 3 }}>
                ABSTRACT
              </Text>
              <Text style={{ ...roleStyle(tokens.typography.synopsis, p.metadataValueInk) }}>
                {ctx.doc.frontPage.synopsis.trim()}
              </Text>
            </View>
          )}
        </PrincipalBand>
        <PrincipalBand ctx={ctx} band="middle" />
        <PrincipalBand ctx={ctx} band="bottom" />
      </View>
      <MetadataAbstractKeyValues ctx={ctx} />
      <View style={{ height: 0.75, backgroundColor: p.ruleInk, marginTop: 8 }} />
    </>
  );
}

/**
 * 10. Administrative Record — `table-dominant`.
 * Bordered 3-row control header table with logo right; left title and
 * subtitle beneath; full-width bordered metadata control table; boxed
 * administrative note for the synopsis.
 */
function CoverAdministrativeRecord({ ctx }: { ctx: CoverCtx }): React.ReactElement {
  const { tokens } = ctx;
  const p = tokens.palette;
  const headRows = ctx.tokens.ornaments.headerTableRows;
  const meta = ctx.doc.metadata;
  const allHeadCells: Array<[string, string]> = [
    ['DOCUMENT ID', meta.documentId],
    ['STATUS', meta.status ?? ''],
    ['ISSUE', meta.issueNumber ? `${meta.issueNumber}${meta.issueDate ? ` — ${meta.issueDate.slice(0, 10)}` : ''}` : ''],
  ];
  const headCells = allHeadCells.slice(0, headRows);
  return (
    <>
      <View style={{ flexDirection: 'row', borderWidth: 1, borderColor: p.ruleInk, marginBottom: 14 }}>
        <View style={{ flex: 1 }}>
          {headCells.map(([label, value]) => (
            <View key={label} style={{ flexDirection: 'row', borderBottomWidth: 0.5, borderColor: p.ruleInk }}>
              <Text
                style={{
                  ...roleStyle(tokens.typography.metadata, p.metadataLabelInk),
                  width: 92,
                  padding: 3,
                  backgroundColor: p.secondaryAccent,
                }}
              >
                {label}
              </Text>
              <Text style={{ ...metaPairStyle(ctx), padding: 3, flex: 1 }}>{value || '—'}</Text>
            </View>
          ))}
        </View>
        {ctx.logo && (
          <View style={{ width: 96, alignItems: 'center', justifyContent: 'center', borderLeftWidth: 0.5, borderColor: p.ruleInk }}>
            <Image src={ctx.logo.src} style={{ width: ctx.logo.widthPt * 0.75 }} />
          </View>
        )}
      </View>
      <View style={{ flexGrow: 1, flexShrink: 0, flexDirection: 'column' }}>
        <PrincipalBand ctx={ctx} band="top" />
        <PrincipalBand ctx={ctx} band="middle" />
        <PrincipalBand ctx={ctx} band="bottom" />
      </View>
      <MetadataControlTable ctx={ctx} />
      {ctx.doc.frontPage.synopsis?.trim() && (
        <View style={{ borderWidth: 0.5, borderColor: p.ruleInk, padding: 6, marginTop: 10 }}>
          <Text style={{ ...roleStyle(tokens.typography.synopsis, p.metadataValueInk) }}>
            {ctx.doc.frontPage.synopsis.trim()}
          </Text>
        </View>
      )}
    </>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Page component
// ─────────────────────────────────────────────────────────────────────────────

/** Structure id → composition (the renderer's implementation matrix). */
export const COVER_COMPOSITIONS: Record<
  CoverThemeTokens['structure'],
  (props: { ctx: CoverCtx }) => React.ReactElement
> = {
  'centered-ornament': CoverClassicFormal,
  'asymmetric-minimal': CoverMinimalist,
  'full-width-band': CoverCorporateBand,
  'sidebar-grid': CoverTechnicalGrid,
  'split-vertical': CoverEditorialSplit,
  'full-bleed-hero': CoverPhotographicHero,
  'nested-frame': CoverInstitutionalFrame,
  'diagonal-geometry': CoverGeometric,
  'journal-columns': CoverScientificPublication,
  'table-dominant': CoverAdministrativeRecord,
};

/**
 * The designed cover page.  Mounted by `PocDocument` immediately BEFORE
 * the body `<Page>` when `frontPage.enabled`; carries no body furniture
 * (no display header, no page numbering) and does not alter the body
 * theme resolution or page geometry.
 *
 * FIXED-FORMAT SINGLE PAGE — the cover is structurally incapable of
 * paginating.  Its only top-level `<Page>` children are `fixed`, so
 * react-pdf's splitNodes() duplicates them into the (never-rendered)
 * continuation list and stops after the first page: splitPage$1 forces
 * the page box to the resolved size, giving the cover a true A4/A3/…
 * MediaBox no matter how long titles, synopsis or the metadata list
 * become — overflowing content is clipped by the page box instead of
 * spawning a second cover page, and the body always starts on the page
 * after exactly one cover.
 *
 * The wrapper reproduces the page's content box (full page geometry +
 * the theme's inset padding, verified against react-pdf's layout
 * semantics), so every composition keeps the exact layout it was
 * designed with: absolute elements anchor at the page origin and flow
 * content starts at the inset, precisely as direct `<Page>` children.
 */
export function PocCoverPage({ doc }: { doc: DocStudioDocument }): React.ReactElement {
  const ctx = buildCoverCtx(doc);
  const composition = COVER_COMPOSITIONS[ctx.tokens.structure];
  return (
    <Page
      size={PAGE_FORMATS[doc.pageSetup.size]}
      orientation={doc.pageSetup.orientation}
      style={{
        backgroundColor: ctx.tokens.palette.pageBackground,
        fontFamily: 'Times-Roman',
      }}
    >
      <View
        fixed
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          width: ctx.pageW,
          height: ctx.pageH,
          paddingTop: ctx.insetPt,
          paddingBottom: ctx.insetPt,
          paddingLeft: ctx.insetPt,
          paddingRight: ctx.insetPt,
          backgroundColor: ctx.tokens.palette.pageBackground,
          fontFamily: 'Times-Roman',
        }}
      >
        {composition({ ctx })}
        <CoverFrameOverlay ctx={ctx} />
      </View>
    </Page>
  );
}
