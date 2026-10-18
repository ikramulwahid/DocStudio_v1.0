/**
 * DocStudio — Core Document Schema (schema version 1)
 *
 * This file defines the authoritative, JSON-serializable data model for a
 * DocStudio project.  All application state that must survive a save/open
 * round-trip is represented here.
 *
 * Guiding rules
 * ─────────────
 * • Every exported type is JSON-serializable (no functions, Dates are ISO
 *   strings, Uint8Array/Blob assets are referenced by ID, not embedded).
 * • Block identities are stable UUIDs assigned at creation and never changed.
 * • Application UI preferences (theme mode, panel state) are NOT part of this
 *   schema; they live in src/types/index.ts and localStorage.
 * • Document metadata fields (DocumentMetadata.status) are distinct from the
 *   session-level DocumentSessionStatus used in the Topbar.
 * • This file is schema version 1.  When breaking changes are made in future
 *   versions, increment DOCSTUDIO_SCHEMA_VERSION and add a migration entry in
 *   src/types/schema-migration.ts (to be created at that time).
 *
 * @module document
 */

// ─────────────────────────────────────────────────────────────────────────────
// Schema version sentinel
// ─────────────────────────────────────────────────────────────────────────────

/** Increment this whenever the persisted schema changes in a breaking way. */
export const DOCSTUDIO_SCHEMA_VERSION = 1 as const;
export type DocStudioSchemaVersion = typeof DOCSTUDIO_SCHEMA_VERSION;

// ─────────────────────────────────────────────────────────────────────────────
// Primitive aliases (improve readability & catch assignment errors)
// ─────────────────────────────────────────────────────────────────────────────

/** ISO 8601 timestamp string, e.g. "2026-10-15T12:34:56.789Z" */
export type ISODateString = string;

/** A UUID v4 string used as a stable identifier. */
export type DocUUID = string;

// ─────────────────────────────────────────────────────────────────────────────
// Document metadata
// ─────────────────────────────────────────────────────────────────────────────

/**
 * The user-visible "Document status" metadata field.
 * Distinct from DocumentSessionStatus which is application/session state.
 */
export type DocumentMetadataStatus =
  | 'Draft'
  | 'Under Review'
  | 'Approved'
  | 'Issued'
  | 'Superseded'
  | 'Obsolete'
  | string; // allow custom values

/** A single user-defined metadata field (key/value pair). */
export interface CustomMetadataField {
  /** Stable identifier for the field (UUID). */
  readonly id: DocUUID;
  /** User-facing label, e.g. "Project Code". */
  label: string;
  value: string;
}

/**
 * Core document metadata — all fields that describe the document rather than
 * its content or layout.
 *
 * Required fields (non-optional) must always be present.  Optional fields
 * may be omitted when not applicable to a given document type.
 */
export interface DocumentMetadata {
  // ── Required ──────────────────────────────────────────────────────────────
  /** Human-readable document title. */
  title: string;
  /** Document subtitle or short description. */
  subtitle: string;
  /** Name of the issuing organization or laboratory. */
  organizationName: string;
  /**
   * Document identifier / reference code, e.g. "SOP-LAB-001".
   * Kept as a plain string; formatting conventions belong to LabProfile.
   */
  documentId: string;
  /**
   * User-visible document status (e.g. "Draft", "Approved").
   * NOT the same as the application session status shown in the topbar.
   */
  status: DocumentMetadataStatus;

  // ── Timestamps (managed by the application, not freely edited) ────────────
  /**
   * ISO 8601 creation timestamp.
   * Set once at document creation; does not change on subsequent saves.
   */
  createdAt: ISODateString;
  /**
   * ISO 8601 last-modified timestamp.
   * Updated whenever document content or settings are saved.
   */
  modifiedAt: ISODateString;

  // ── Optional standard fields ───────────────────────────────────────────────
  /** Issue / revision number, e.g. "Rev 3" or "Issue 2". */
  issueNumber?: string;
  /** Date the current issue/revision was issued. ISO 8601 date string. */
  issueDate?: string;
  /** Name of the document holder or responsible person. */
  documentHolder?: string;

  // ── Extended recommended fields ────────────────────────────────────────────
  /** Broad document category/type, e.g. "Quality Manual", "Calibration Procedure". */
  documentType?: string;
  /** Short revision/version label for use in headers, e.g. "v2.1". */
  revisionLabel?: string;
  /** Amendment number for controlled-document amendments. */
  amendmentNumber?: string;
  /** Date from which this document version takes effect. */
  effectiveDate?: string;
  /** Planned or scheduled review date (informational; not a workflow trigger). */
  reviewDate?: string;
  /** Name of the person who prepared this document. */
  preparedBy?: string;
  /** Name of the person who reviewed this document. */
  reviewedBy?: string;
  /** Name of the person who approved this document. */
  approvedBy?: string;
  /** Department or section responsible for this document. */
  department?: string;
  /** Applicable standard, method, or regulatory reference, e.g. "ISO/IEC 17025:2017". */
  applicableStandard?: string;
  /** Relevant clause or section references within the applicable standard. */
  clauseReferences?: string;
  /** Reference to the document(s) this one supersedes or replaces. */
  supersedes?: string;

  // ── User-defined extension fields ─────────────────────────────────────────
  /**
   * Arbitrary user-defined key/value metadata fields.
   * Each entry has a stable ID so it can be targeted by templates and
   * cover-page field selectors.
   */
  customFields: CustomMetadataField[];
}

// ─────────────────────────────────────────────────────────────────────────────
// Laboratory Profile reference
// ─────────────────────────────────────────────────────────────────────────────

/**
 * A snapshot of relevant laboratory profile data copied into a document at
 * creation time.  The live LabProfile is stored separately in application
 * preferences (not inside the document schema).
 *
 * Storing a snapshot ensures that editing the global lab profile does not
 * silently alter previously authored documents.
 */
export interface EmbeddedLabProfile {
  /** Laboratory / organization name at time of document creation. */
  name: string;
  /** Optional street address. */
  address?: string;
  /** Optional city/state/country. */
  location?: string;
  /** Optional contact phone number. */
  phone?: string;
  /** Optional contact email address. */
  email?: string;
  /** Optional web URL. */
  website?: string;
  /**
   * Asset ID referencing the laboratory logo stored in the document's asset
   * bundle.  Resolved by the asset registry during render.
   */
  logoAssetId?: DocUUID;
  /** Default document ID prefix, e.g. "LAB-SOP-". */
  documentIdPrefix?: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Page setup and typography
// ─────────────────────────────────────────────────────────────────────────────

/** Supported physical page sizes. */
export type PageSize = 'A4' | 'A3' | 'A5' | 'Letter' | 'Legal';

/** Page orientation. */
export type PageOrientation = 'portrait' | 'landscape';

/**
 * Named margin presets.  "Custom" requires explicit mm values.
 * Dimensions based on common word-processor conventions.
 */
export type MarginPreset = 'normal' | 'narrow' | 'wide' | 'custom';

/** Millimetre-based margin values. */
export interface PageMargins {
  preset: MarginPreset;
  /** Top margin in mm. Ignored unless preset is "custom". */
  topMm: number;
  /** Bottom margin in mm. */
  bottomMm: number;
  /** Left margin in mm. */
  leftMm: number;
  /** Right margin in mm. */
  rightMm: number;
}

/** Page setup settings (physical layout). */
export interface PageSetup {
  size: PageSize;
  orientation: PageOrientation;
  margins: PageMargins;
}

/**
 * Typography configuration for the document body.
 * Heading sizes are derived by the render engine from baseFontSizePt; they
 * are NOT stored individually unless a block carries an explicit override.
 */
export interface TypographySettings {
  /** Primary font family name, e.g. "Segoe UI" or "Times New Roman". */
  fontFamily: string;
  /** Fallback font families in CSS stack order. */
  fontFallbacks: string[];
  /** Base body font size in points. */
  baseFontSizePt: number;
  /**
   * Line height as a unitless multiplier of the font size,
   * e.g. 1.5 means 150% of baseFontSizePt.
   */
  lineHeight: number;
  /** Space after each paragraph in points. */
  paragraphSpacingPt: number;
}

/**
 * Ten selectable body/page layout themes.
 * Each theme ID maps to a full layout+typography specification rendered by
 * the theme engine (implemented in Phase 04).
 */
export type BodyThemeId =
  | 'classic-formal'
  | 'minimalist'
  | 'editorial'
  | 'scientific-journal'
  | 'technical-specification'
  | 'corporate'
  | 'geometric'
  | 'framed-document'
  | 'contemporary-asymmetrical'
  | 'traditional-serif';

// ─────────────────────────────────────────────────────────────────────────────
// Front-page settings
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Ten selectable cover/front-page themes.
 * Each maps to a distinct structural layout (Phase 04).
 */
export type CoverThemeId =
  | 'classic-formal'
  | 'minimalist'
  | 'corporate-band'
  | 'technical-grid'
  | 'editorial-split'
  | 'photographic-hero'
  | 'institutional-frame'
  | 'geometric'
  | 'scientific-publication'
  | 'administrative-record';

/** Border/frame style for the cover page. */
export type BorderStyle = 'none' | 'solid' | 'double' | 'dashed' | 'dotted';

/** CSS hex or rgba color string, e.g. "#1a2b3c" or "rgba(0,0,0,0.8)". */
export type CssColor = string;

/** Cover page frame/border configuration. */
export interface CoverFrameSettings {
  visible: boolean;
  style: BorderStyle;
  /** Stroke thickness in points. */
  thicknessPt: number;
  color: CssColor;
  /** Corner radius in mm. */
  cornerRadiusMm: number;
  /** Inset distance from the page edge in mm. */
  insetMm: number;
}

/**
 * Which DocumentMetadata field keys are selected to appear on the cover page
 * (and in any other visible-field picker, e.g. the metadata block).
 *
 * Covers every scalar field from the Document Information requirements
 * (project_details.md §6): the required panel fields (including `createdAt`
 * and `modifiedAt`), the optional fields, and the additional recommended
 * fields.  User-defined fields are referenced separately via
 * `custom:${CustomMetadataField.id}`; the `customFields` array itself is
 * never a selectable display field.
 */
export type CoverVisibleMetadataField =
  | keyof Pick<
      DocumentMetadata,
      // Required panel fields
      | 'title'
      | 'subtitle'
      | 'organizationName'
      | 'documentId'
      | 'status'
      | 'createdAt'
      | 'modifiedAt'
      // Optional panel fields
      | 'issueNumber'
      | 'issueDate'
      | 'documentHolder'
      // Additional recommended fields
      | 'documentType'
      | 'revisionLabel'
      | 'amendmentNumber'
      | 'effectiveDate'
      | 'reviewDate'
      | 'preparedBy'
      | 'reviewedBy'
      | 'approvedBy'
      | 'department'
      | 'applicableStandard'
      | 'clauseReferences'
      | 'supersedes'
    >
  | `custom:${DocUUID}`; // references CustomMetadataField.id

/**
 * Horizontal alignment expressible for a principal cover element
 * (title / subtitle / organization name) — project_details.md §7.1.
 */
export type CoverTextAlign = 'left' | 'center' | 'right';

/**
 * Practical vertical positioning band for a principal cover element.
 * Bands are relative zones of the cover page (top / middle / bottom);
 * exact geometry is defined per cover theme, never free coordinates.
 */
export type CoverVerticalBand = 'top' | 'middle' | 'bottom';

/**
 * Optional placement override for one principal cover element (§7.1
 * "configure title, subtitle, and laboratory-name placement").  Added
 * P04-M4 as an OPTIONAL schema addition: schema-v1 documents created
 * before P04-M4 have no `placement` key at all and resolve to the
 * selected cover theme's defaults (no migration required).
 */
export interface CoverElementPlacement {
  align: CoverTextAlign;
  band: CoverVerticalBand;
}

/**
 * Per-element placement overrides.  Any absent element keeps its
 * cover theme's default placement, so partial overrides coexist with
 * theme-specific compositions.
 */
export interface FrontPagePlacement {
  title?: CoverElementPlacement;
  subtitle?: CoverElementPlacement;
  organizationName?: CoverElementPlacement;
}

/** Front-page designer configuration. */
export interface FrontPageSettings {
  /**
   * Whether a cover/front page is included in the document.
   * When true, the displayHeader toggle in PageTypographySettings is
   * suppressed (but its stored value is preserved).
   */
  enabled: boolean;
  /** Selected cover layout theme. */
  themeId: CoverThemeId;
  /** Whether to apply monochrome color adaptation to the cover theme. */
  monochrome: boolean;
  /** Metadata fields to display on the cover page, in display order. */
  visibleFields: CoverVisibleMetadataField[];
  /** Optional synopsis or additional text below the subtitle. */
  synopsis?: string;
  /** Asset ID for the logo image (stored in the document asset bundle). */
  logoAssetId?: DocUUID;
  /** Logo display width in mm. */
  logoWidthMm?: number;
  /** Asset ID for an optional background/hero image. */
  backgroundImageAssetId?: DocUUID;
  /**
   * Optional principal-element placement overrides (P04-M4).
   * Absent in pre-P04-M4 schema-v1 documents; the cover-theme resolver
   * then uses the selected theme's per-element defaults.
   */
  placement?: FrontPagePlacement;
  /** Frame/border configuration for the cover page. */
  frame: CoverFrameSettings;
}

// ─────────────────────────────────────────────────────────────────────────────
// Page typography settings (body pages)
// ─────────────────────────────────────────────────────────────────────────────

/** Page & Typography panel settings. */
export interface PageTypographySettings {
  /** Selected body/page theme. */
  bodyThemeId: BodyThemeId;
  /** Whether to apply monochrome adaptation to the body theme. */
  monochrome: boolean;
  /**
   * Show/hide the running display header on body pages.
   * Stored independently of frontPage.enabled so the preference survives
   * toggling the front page off and back on.
   */
  displayHeader: boolean;
  typography: TypographySettings;
}

// ─────────────────────────────────────────────────────────────────────────────
// Header & Footer
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Page number format options (project_details.md §9).
 * Applied per band via `HeaderFooterBand.pageNumberFormat` to any
 * `{pageNumber}` token in that band's cell content; `'none'` suppresses it.
 */
export type PageNumberFormat = 'Page X of Y' | 'X/Y' | 'X' | 'none';

/**
 * Horizontal text alignment for headings, table cells, image slots,
 * formulae, and header/footer cells.
 *
 * Justified alignment is deliberately NOT part of this type: it is supported
 * only for paragraphs and lives in `ParagraphAlignment`
 * (see src/types/blocks.ts).  Unrelated elements keep left/center/right.
 */
export type HAlignment = 'left' | 'center' | 'right';

/** Vertical alignment. */
export type VAlignment = 'top' | 'middle' | 'bottom';

/**
 * A single cell in the header or footer grid.
 * Cells hold plain text mixed with optional template tokens resolved by the
 * renderer: `{documentId}`, `{organizationName}`, and `{pageNumber}`.
 * `{pageNumber}` is formatted using the parent band's `pageNumberFormat`
 * (a format of `'none'` renders it empty).
 */
export interface HeaderFooterCell {
  /** Stable ID. */
  readonly id: DocUUID;
  /**
   * Cell content text.  May contain literal text and/or the template tokens
   * `{documentId}`, `{organizationName}` and `{pageNumber}` documented above.
   */
  content: string;
  hAlign: HAlignment;
  vAlign: VAlignment;
  /** Column span (>=1). */
  colSpan: number;
}

/** One row of header/footer cells. */
export interface HeaderFooterRow {
  readonly id: DocUUID;
  cells: HeaderFooterCell[];
}

/** Watermark configuration. */
export interface WatermarkSettings {
  enabled: boolean;
  text: string;
  /** Opacity 0–1. */
  opacity: number;
  /** Rotation in degrees (counter-clockwise). */
  rotationDeg: number;
  /** Font size in points. */
  fontSizePt: number;
  color: CssColor;
  /** Horizontal position as a fraction of the content width (0–1). */
  positionX: number;
  /** Vertical position as a fraction of the content height (0–1). */
  positionY: number;
}

/**
 * Header or footer band configuration (grid-based; project_details.md §9).
 *
 * Invariants:
 * • `columnCount` is the grid width; every row must contain cells that
 *   account for exactly `columnCount` columns (with no colSpan merges,
 *   that means exactly `columnCount` cells per row).
 * • The default layout — produced by `createDefaultHeader()` /
 *   `createDefaultFooter()` in src/types/defaults.ts — is one row with
 *   two columns.
 */
export interface HeaderFooterBand {
  enabled: boolean;
  rows: HeaderFooterRow[];
  /** Number of columns in the grid (all rows share this count). */
  columnCount: number;
  /** Formatting applied to `{pageNumber}` tokens in this band's cells. */
  pageNumberFormat: PageNumberFormat;
  /** Whether this band is suppressed on the first body page. */
  suppressOnFirstPage: boolean;
}

/** Combined header and footer settings. */
export interface HeaderFooterSettings {
  header: HeaderFooterBand;
  footer: HeaderFooterBand;
  watermark: WatermarkSettings;
}

// ─────────────────────────────────────────────────────────────────────────────
// Asset registry
// ─────────────────────────────────────────────────────────────────────────────

/** MIME types supported for embedded document assets. */
export type AssetMimeType =
  | 'image/png'
  | 'image/jpeg'
  | 'image/gif'
  | 'image/webp'
  | 'image/svg+xml';

/**
 * Metadata record for an asset embedded in the document bundle.
 * The actual binary data is stored separately (base64 in JSON for v1;
 * a packaged archive format in a later revision).
 */
export interface AssetRecord {
  /** Stable asset ID (UUID v4). Referenced by block data and front-page settings. */
  readonly id: DocUUID;
  /** Human-readable filename, e.g. "lab-logo.png". */
  filename: string;
  mimeType: AssetMimeType;
  /** File size in bytes (for display and size-budget tracking). */
  sizeBytes: number;
  /** ISO 8601 timestamp when the asset was added to this document. */
  addedAt: ISODateString;
  /**
   * Base64-encoded binary content.
   * Kept in this envelope for schema v1 (single-file JSON).
   * A future schema revision beyond the v1.0 ten-phase roadmap may move
   * assets to a zip/archive bundle.
   */
  base64Data: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Content blocks (see src/types/blocks.ts for per-block data shapes)
// ─────────────────────────────────────────────────────────────────────────────

// Block types are defined in their own module to keep this file manageable.
// Only the envelope is defined here so documents can be typed without
// importing every block-specific shape.
import type { AnyBlockData } from './blocks';

/** Space above/below a block in points. */
export interface BlockSpacing {
  topPt: number;
  bottomPt: number;
}

/**
 * A content block as stored in the document.
 * The `data` discriminated union carries block-type-specific content.
 */
export interface ContentBlock {
  /**
   * Stable UUID assigned at block creation.
   * Never changes on reorder, duplicate, or save/reopen.
   */
  readonly id: DocUUID;
  spacing: BlockSpacing;
  /**
   * Type-discriminated block data.
   * The `type` field inside AnyBlockData is the primary discriminant.
   */
  data: AnyBlockData;
}

// ─────────────────────────────────────────────────────────────────────────────
// Revision history (extensible design point for Phase 07)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * A saved document snapshot (revision).
 * In Phase 07 this will include a full deep copy of the document body.
 * For now the structure is declared so the top-level document type is
 * extensible without a breaking schema change.
 */
export interface SavedRevision {
  /** Stable snapshot ID. */
  readonly id: DocUUID;
  /** User-facing version label, e.g. "v1.2" or "Approved Issue". */
  label: string;
  /** ISO 8601 timestamp when this snapshot was saved. */
  savedAt: ISODateString;
  /** Optional change summary entered by the user. */
  summary?: string;
  /** Optional reason for the revision. */
  reason?: string;
  /**
   * Full serialized document body at the time of snapshot.
   * Stored as a JSON string to avoid deep coupling with the outer type.
   * Parsed and validated on restore (Phase 07).
   */
  snapshotJson: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Root document type
// ─────────────────────────────────────────────────────────────────────────────

/**
 * The top-level DocStudio document.
 * This is the data structure that is serialized to / deserialized from
 * a `.docstudio` project file.
 *
 * Field ordering roughly follows the render pipeline:
 *   identity → metadata → layout → cover → body → blocks → assets → history
 */
export interface DocStudioDocument {
  // ── Envelope ──────────────────────────────────────────────────────────────
  /** Always the string "DocStudio". Used to reject unrelated JSON files. */
  readonly __type: 'DocStudio';
  /**
   * Schema version.  Must equal DOCSTUDIO_SCHEMA_VERSION for the current
   * parser; older values trigger a migration; newer values trigger an error.
   */
  readonly schemaVersion: DocStudioSchemaVersion;
  /**
   * Stable document UUID.  Assigned at creation and never changed, even
   * if the file is duplicated (duplication creates a new UUID).
   */
  readonly id: DocUUID;

  // ── Identity & metadata ───────────────────────────────────────────────────
  metadata: DocumentMetadata;

  /**
   * Snapshot of lab profile data copied in at creation time.
   * Editing the global lab profile does not retroactively change this.
   */
  labProfile: EmbeddedLabProfile;

  // ── Layout ────────────────────────────────────────────────────────────────
  pageSetup: PageSetup;
  pageTypography: PageTypographySettings;

  // ── Cover page ────────────────────────────────────────────────────────────
  frontPage: FrontPageSettings;

  // ── Page furniture ────────────────────────────────────────────────────────
  headerFooter: HeaderFooterSettings;

  // ── Content ───────────────────────────────────────────────────────────────
  /**
   * Ordered list of content blocks.
   * Order is the canonical render order; stable IDs are used for identity.
   */
  blocks: ContentBlock[];

  // ── Assets ────────────────────────────────────────────────────────────────
  /**
   * All images and other binary assets referenced by this document,
   * keyed by AssetRecord.id for O(1) lookup.
   */
  assets: Record<DocUUID, AssetRecord>;

  // ── Revision history (Phase 07 extensibility) ────────────────────────────
  /**
   * Saved named revision snapshots.
   * Empty array until Phase 07 wires up the revision save action.
   */
  savedRevisions: SavedRevision[];

  /**
   * Whether change-tracking is currently active for this document.
   * The tracked-change records themselves will be stored per-block in Phase 07.
   */
  trackChangesEnabled: boolean;
}
