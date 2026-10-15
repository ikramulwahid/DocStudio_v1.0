/**
 * DocStudio — Default document factory functions (schema version 1)
 *
 * These pure functions produce fully valid DocStudioDocument instances with
 * sensible default values.  They are the single authoritative source of
 * initial state; use them wherever a new document or sub-object is created.
 *
 * Rules
 * ─────
 * • No React, DOM, or CSS imports.
 * • No side-effects — every function returns a new object.
 * • Uses `crypto.randomUUID()` for UUID generation (available in WebView2 /
 *   Chromium without a polyfill).
 * • All timestamp arguments are ISO 8601 strings supplied by the caller so
 *   that this module remains pure / testable.
 *
 * @module defaults
 */

import type {
  DocUUID,
  ISODateString,
  DocStudioDocument,
  DocumentMetadata,
  EmbeddedLabProfile,
  PageSetup,
  PageMargins,
  TypographySettings,
  PageTypographySettings,
  FrontPageSettings,
  CoverFrameSettings,
  HeaderFooterSettings,
  HeaderFooterBand,
  HeaderFooterRow,
  HeaderFooterCell,
  WatermarkSettings,
} from './document';

import { DOCSTUDIO_SCHEMA_VERSION } from './document';

// ─────────────────────────────────────────────────────────────────────────────
// UUID helper
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Generate a new UUID v4.
 * Delegates to the platform crypto API (WebView2 / Chromium / Node 19+).
 */
export function newUUID(): DocUUID {
  return crypto.randomUUID();
}

/**
 * Return the current instant as an ISO 8601 string.
 * Provided as a convenience; callers may supply their own timestamp when
 * deterministic output is required (e.g. in tests).
 */
export function nowISO(): ISODateString {
  return new Date().toISOString();
}

// ─────────────────────────────────────────────────────────────────────────────
// Page setup defaults
// ─────────────────────────────────────────────────────────────────────────────

/** Normal margin preset: 25 mm on all sides (typical ISO document margin). */
export function createDefaultMargins(): PageMargins {
  return {
    preset: 'normal',
    topMm: 25,
    bottomMm: 25,
    leftMm: 25,
    rightMm: 25,
  };
}

/** Default page setup: A4, portrait, normal margins. */
export function createDefaultPageSetup(): PageSetup {
  return {
    size: 'A4',
    orientation: 'portrait',
    margins: createDefaultMargins(),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Typography defaults
// ─────────────────────────────────────────────────────────────────────────────

/** Default typography: Segoe UI 11pt, 1.5 line-height, 6pt paragraph spacing. */
export function createDefaultTypography(): TypographySettings {
  return {
    fontFamily: 'Segoe UI',
    fontFallbacks: ['system-ui', 'Arial', 'sans-serif'],
    baseFontSizePt: 11,
    lineHeight: 1.5,
    paragraphSpacingPt: 6,
  };
}

/** Default page typography settings (body theme + typography). */
export function createDefaultPageTypography(): PageTypographySettings {
  return {
    bodyThemeId: 'classic-formal',
    monochrome: false,
    displayHeader: true,
    typography: createDefaultTypography(),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Front-page defaults
// ─────────────────────────────────────────────────────────────────────────────

/** Default cover frame: visible thin solid black frame, 8mm inset. */
export function createDefaultCoverFrame(): CoverFrameSettings {
  return {
    visible: true,
    style: 'solid',
    thicknessPt: 1,
    color: '#1a1a2e',
    cornerRadiusMm: 0,
    insetMm: 8,
  };
}

/** Default front-page settings: enabled, classic-formal theme. */
export function createDefaultFrontPage(): FrontPageSettings {
  return {
    enabled: true,
    themeId: 'classic-formal',
    monochrome: false,
    visibleFields: [
      'title',
      'subtitle',
      'organizationName',
      'documentId',
      'status',
      'issueNumber',
      'issueDate',
      'preparedBy',
      'approvedBy',
    ],
    frame: createDefaultCoverFrame(),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Header / footer defaults
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Create one header/footer row containing `colCount` cells (all with
 * colSpan 1).  The first cell receives `content` and is left-aligned;
 * the last cell is right-aligned; any cells in between are empty and
 * center-aligned.
 */
function makeSimpleRow(content: string, colCount: number): HeaderFooterRow {
  const cells: HeaderFooterCell[] = Array.from({ length: colCount }, (_, i) => ({
    id: newUUID(),
    content: i === 0 ? content : '',
    hAlign: i === 0 ? 'left' : i === colCount - 1 ? 'right' : 'center',
    vAlign: 'middle',
    colSpan: 1,
  }));

  return {
    id: newUUID(),
    cells,
  };
}

/** Default watermark: disabled. */
export function createDefaultWatermark(): WatermarkSettings {
  return {
    enabled: false,
    text: 'DRAFT',
    opacity: 0.15,
    rotationDeg: 45,
    fontSizePt: 72,
    color: '#aaaaaa',
    positionX: 0.5,
    positionY: 0.5,
  };
}

/**
 * Default header band — ONE row, TWO columns (project_details.md §9 default
 * layout; `columnCount`, the row's cell count and the layout all agree).
 *
 * - Left cell:  `{documentId}` token, left-aligned.
 * - Right cell: `{pageNumber}` token, right-aligned, formatted with this
 *   band's `pageNumberFormat` (`'Page X of Y'` by default; `'none'`
 *   suppresses the number and leaves the cell empty).
 */
export function createDefaultHeader(): HeaderFooterBand {
  const row = makeSimpleRow('{documentId}', 2);
  // Right cell renders the page number per the band's pageNumberFormat.
  row.cells[1].content = '{pageNumber}';
  row.cells[1].hAlign = 'right';

  return {
    enabled: true,
    rows: [row],
    columnCount: 2,
    pageNumberFormat: 'Page X of Y',
    suppressOnFirstPage: true,
  };
}

/**
 * Default footer band — ONE row, TWO columns (project_details.md §9 default
 * layout; `columnCount`, the row's cell count and the layout all agree).
 *
 * - Left cell:  `{organizationName}` token, left-aligned.
 * - Right cell: `{pageNumber}` token, right-aligned, formatted with this
 *   band's `pageNumberFormat` (`'Page X of Y'` by default; `'none'`
 *   suppresses the number and leaves the cell empty).
 */
export function createDefaultFooter(): HeaderFooterBand {
  const row = makeSimpleRow('{organizationName}', 2);
  // Right cell renders the page number per the band's pageNumberFormat.
  row.cells[1].content = '{pageNumber}';
  row.cells[1].hAlign = 'right';

  return {
    enabled: true,
    rows: [row],
    columnCount: 2,
    pageNumberFormat: 'Page X of Y',
    suppressOnFirstPage: true,
  };
}

/** Default combined header-footer settings. */
export function createDefaultHeaderFooter(): HeaderFooterSettings {
  return {
    header: createDefaultHeader(),
    footer: createDefaultFooter(),
    watermark: createDefaultWatermark(),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Document metadata defaults
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Create a default DocumentMetadata object.
 * @param now - ISO 8601 timestamp for createdAt / modifiedAt.
 */
export function createDefaultMetadata(now: ISODateString): DocumentMetadata {
  return {
    title: 'Untitled Document',
    subtitle: '',
    organizationName: '',
    documentId: '',
    status: 'Draft',
    createdAt: now,
    modifiedAt: now,
    customFields: [],
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Laboratory profile defaults
// ─────────────────────────────────────────────────────────────────────────────

/** Default embedded lab profile snapshot (all optional fields absent). */
export function createDefaultLabProfile(): EmbeddedLabProfile {
  return {
    name: '',
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Root document factory
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Create a complete, valid DocStudioDocument with default values.
 *
 * @param id  - Stable document UUID.  Pass `newUUID()` for a new document.
 * @param now - Creation timestamp (ISO 8601).  Pass `nowISO()` for the current time.
 *
 * @example
 * ```ts
 * import { createDefaultDocument, newUUID, nowISO } from '../types/defaults';
 *
 * const doc = createDefaultDocument(newUUID(), nowISO());
 * ```
 */
export function createDefaultDocument(id: DocUUID, now: ISODateString): DocStudioDocument {
  return {
    __type: 'DocStudio',
    schemaVersion: DOCSTUDIO_SCHEMA_VERSION,
    id,
    metadata: createDefaultMetadata(now),
    labProfile: createDefaultLabProfile(),
    pageSetup: createDefaultPageSetup(),
    pageTypography: createDefaultPageTypography(),
    frontPage: createDefaultFrontPage(),
    headerFooter: createDefaultHeaderFooter(),
    blocks: [],
    assets: {},
    savedRevisions: [],
    trackChangesEnabled: false,
  };
}
