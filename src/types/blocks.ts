/**
 * DocStudio — Content Block Data Types (schema version 1)
 *
 * This file defines the discriminated union `AnyBlockData` that covers every
 * block type recognised by the DocStudio render pipeline.
 *
 * Rules
 * ─────
 * • Every exported type is fully JSON-serializable.
 * • The `type` field is the discriminant — it must be a string literal unique
 *   to its block type.
 * • Rich text is represented as `InlineSpan[]` arrays (no external editor JSON
 *   format) so that the schema has no dependency on a specific editor library.
 * • Lab-specific block types are included at the schema level from the outset
 *   to allow templates and phase-gated UI to reference them without a
 *   breaking schema change.
 *
 * @module blocks
 */

import type { DocUUID, HAlignment, CoverVisibleMetadataField } from './document';

// ─────────────────────────────────────────────────────────────────────────────
// Shared inline rich-text primitives
// ─────────────────────────────────────────────────────────────────────────────

/**
 * A single run of styled inline text.
 * All styling fields are optional; absent means inherit / normal.
 */
export interface InlineSpan {
  /** The plain-text content of this run. */
  text: string;
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  strikethrough?: boolean;
  /** CSS color string, e.g. "#c0392b". */
  color?: string;
  /** CSS highlight/background color string, e.g. "#f9e79f". */
  highlight?: string;
  /** If set, the span is a hyperlink to this URL. */
  href?: string;
  /** Superscript or subscript. */
  verticalAlign?: 'super' | 'sub';
  /** Monospace / code style. */
  code?: boolean;
}

// ─────────────────────────────────────────────────────────────────────────────
// Heading block
// ─────────────────────────────────────────────────────────────────────────────

export interface HeadingBlockData {
  type: 'heading';
  /** Heading level 1 (document title) through 4 (minor sub-heading). */
  level: 1 | 2 | 3 | 4;
  /** Plain text content of the heading. */
  text: string;
  /**
   * Whether this heading participates in automatic outline numbering,
   * e.g. "3.2.1  Measurement procedure".
   */
  numbered: boolean;
  hAlign: HAlignment;
}

// ─────────────────────────────────────────────────────────────────────────────
// Paragraph block
// ─────────────────────────────────────────────────────────────────────────────

export interface ParagraphBlockData {
  type: 'paragraph';
  spans: InlineSpan[];
  hAlign: HAlignment;
  /**
   * Indentation level (0 = no indent, 1 = one level, etc.).
   * Each level corresponds to a fixed left offset applied by the renderer.
   */
  indentLevel: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// Callout / admonition block
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Semantic callout variant.
 * Well-known values are listed; the `string` fallback allows custom variants
 * styled by a future theme extension.
 */
export type CalloutVariant = 'info' | 'warning' | 'success' | 'note' | 'danger' | string;

export interface CalloutBlockData {
  type: 'callout';
  variant: CalloutVariant;
  /** Optional bold title line above the body text. */
  title?: string;
  spans: InlineSpan[];
}

// ─────────────────────────────────────────────────────────────────────────────
// List block
// ─────────────────────────────────────────────────────────────────────────────

export type ListType = 'bullet' | 'numbered' | 'checklist';

/** Bullet marker styles for unordered lists. */
export type BulletStyle = 'disc' | 'circle' | 'square' | 'dash';

/** Numbering styles for ordered lists. */
export type NumberStyle = 'decimal' | 'lower-alpha' | 'upper-alpha' | 'lower-roman' | 'upper-roman';

export interface ListItem {
  /** Stable ID for the list item. */
  readonly id: DocUUID;
  spans: InlineSpan[];
  /** Nesting depth (0 = top level). */
  depth: number;
  /** Checklist completion state (only meaningful when listType is "checklist"). */
  checked?: boolean;
}

export interface ListBlockData {
  type: 'list';
  listType: ListType;
  bulletStyle: BulletStyle;
  numberStyle: NumberStyle;
  items: ListItem[];
}

// ─────────────────────────────────────────────────────────────────────────────
// Table block
// ─────────────────────────────────────────────────────────────────────────────

export type TableHeaderStyle = 'light' | 'medium' | 'heavy';

export interface TableCell {
  /** Stable ID for the cell. */
  readonly id: DocUUID;
  spans: InlineSpan[];
  hAlign: HAlignment;
  /** Column span (>= 1). */
  colSpan: number;
  /** Row span (>= 1). */
  rowSpan: number;
  /** Whether this cell carries a header style regardless of row position. */
  isHeader: boolean;
}

export interface TableRow {
  /** Stable ID for the row. */
  readonly id: DocUUID;
  cells: TableCell[];
}

export interface TableBlockData {
  type: 'table';
  rows: TableRow[];
  /** Whether the first row receives header styling. */
  hasHeaderRow: boolean;
  headerStyle: TableHeaderStyle;
  /** Caption displayed below the table. */
  caption?: string;
  /** Table reference label, e.g. "Table 1". Managed by the renderer. */
  tableLabel?: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Formula / equation block
// ─────────────────────────────────────────────────────────────────────────────

/** A symbol/variable definition that follows the "Where:" clause. */
export interface VariableDefinition {
  readonly id: DocUUID;
  /** Variable symbol as rendered (may include LaTeX, e.g. "\\sigma"). */
  symbol: string;
  /** Human-readable definition, e.g. "Standard deviation of measurements". */
  definition: string;
  /** Optional SI unit string, e.g. "m·s⁻²". */
  unit?: string;
}

export interface FormulaBlockData {
  type: 'formula';
  /**
   * The formula content as a LaTeX string.
   * Rendered by the math engine (KaTeX / MathJax) in Phase 04.
   */
  latex: string;
  hAlign: HAlignment;
  /** True → display (block) mode; false → inline mode. */
  displayMode: boolean;
  /** Optional numbered equation label, e.g. "(3.2)". */
  formulaNumber?: string;
  /** Variable definitions shown in the "Where:" list below the formula. */
  variableDefinitions: VariableDefinition[];
  /** Override for the "Where:" label (e.g. "where:" or "Où :"). */
  whereLabelOverride?: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Image block
// ─────────────────────────────────────────────────────────────────────────────

export type ImageLayout = 'single' | 'side-by-side';

export interface ImageItem {
  /** Stable ID for the image slot within this block. */
  readonly id: DocUUID;
  /**
   * Asset ID referencing an AssetRecord in DocStudioDocument.assets.
   * Null when the slot is empty (placeholder state).
   */
  assetId: DocUUID | null;
  /** Optional caption rendered below the image. */
  caption?: string;
  /** Optional figure reference label, e.g. "Figure 3". Managed by the renderer. */
  figureLabel?: string;
  /** Display width as a fraction of the available content width (0.1–1.0). */
  widthFraction: number;
  hAlign: HAlignment;
}

export interface ImageBlockData {
  type: 'image';
  layout: ImageLayout;
  images: ImageItem[];
}

// ─────────────────────────────────────────────────────────────────────────────
// Signature block
// ─────────────────────────────────────────────────────────────────────────────

export interface Signer {
  readonly id: DocUUID;
  /** Role label, e.g. "Prepared by", "Approved by". */
  role: string;
  /** Pre-filled name (optional; may be left blank for handwritten completion). */
  name?: string;
  /** Signature date (ISO 8601); may be blank. */
  date?: string;
}

export interface SignatureBlockData {
  type: 'signature';
  hAlign: HAlignment;
  signers: Signer[];
}

// ─────────────────────────────────────────────────────────────────────────────
// Structural / flow blocks
// ─────────────────────────────────────────────────────────────────────────────

export interface HorizontalLineBlockData {
  type: 'horizontal-line';
  /** Stroke thickness in points. */
  thicknessPt: number;
  /** CSS color, e.g. "#cccccc". */
  color: string;
}

export interface PageBreakBlockData {
  type: 'page-break';
}

export interface SectionBreakBlockData {
  type: 'section-break';
  /** Optional section title rendered inline with the divider. */
  title?: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Metadata display block
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Renders a formatted table of selected metadata fields inline in the body.
 * Useful for repeated-page identification blocks in controlled documents.
 */
export interface MetadataBlockData {
  type: 'metadata-block';
  /** Fields to display, in the order specified. */
  visibleFields: CoverVisibleMetadataField[];
}

// ─────────────────────────────────────────────────────────────────────────────
// Revision history table block
// ─────────────────────────────────────────────────────────────────────────────

export interface RevisionHistoryEntry {
  readonly id: DocUUID;
  /** Revision / issue number, e.g. "Rev 3". */
  revision: string;
  /** ISO 8601 date string. */
  date: string;
  /** Author of this revision. */
  author: string;
  /** Brief description of changes. */
  description: string;
}

export interface RevisionHistoryBlockData {
  type: 'revision-history';
  entries: RevisionHistoryEntry[];
}

// ─────────────────────────────────────────────────────────────────────────────
// Laboratory-specific block types
// ─────────────────────────────────────────────────────────────────────────────

// ── Procedure step ────────────────────────────────────────────────────────────

export type ProcedureStepLevel = 'main' | 'sub' | 'note' | 'warning' | 'caution';

export interface ProcedureStep {
  readonly id: DocUUID;
  level: ProcedureStepLevel;
  stepNumber?: string;
  spans: InlineSpan[];
}

export interface ProcedureStepBlockData {
  type: 'procedure-step';
  /** Block-level title, e.g. "Sample Preparation". */
  sectionTitle?: string;
  steps: ProcedureStep[];
}

// ── Equipment list ────────────────────────────────────────────────────────────

export interface EquipmentItem {
  readonly id: DocUUID;
  /** Equipment name or description. */
  name: string;
  /** Asset identifier / tag number, e.g. "EQ-042". */
  assetTag?: string;
  /** Manufacturer name. */
  manufacturer?: string;
  /** Model number. */
  modelNumber?: string;
  /** Calibration due date (ISO 8601). */
  calibrationDue?: string;
  /** Whether this item is mandatory for the procedure. */
  mandatory: boolean;
}

export interface EquipmentListBlockData {
  type: 'equipment-list';
  title?: string;
  items: EquipmentItem[];
}

// ── Observation block ─────────────────────────────────────────────────────────

export interface ObservationRow {
  readonly id: DocUUID;
  /** Parameter or observable name. */
  parameter: string;
  /** Observed value (free text). */
  observedValue: string;
  /** Remarks or qualifications. */
  remarks?: string;
}

export interface ObservationBlockData {
  type: 'observation';
  title?: string;
  rows: ObservationRow[];
}

// ── Measurement / data table ──────────────────────────────────────────────────

export interface MeasurementColumn {
  readonly id: DocUUID;
  /** Column header, e.g. "Frequency (Hz)". */
  header: string;
  /** SI unit label for display (may be blank). */
  unit?: string;
}

export interface MeasurementRow {
  readonly id: DocUUID;
  /** Values keyed by MeasurementColumn.id. */
  values: Record<DocUUID, string>;
}

export interface MeasurementBlockData {
  type: 'measurement';
  title?: string;
  columns: MeasurementColumn[];
  rows: MeasurementRow[];
  /** Optional uncertainty note displayed below the table. */
  uncertaintyNote?: string;
}

// ── Calculation block ─────────────────────────────────────────────────────────

export interface CalculationStep {
  readonly id: DocUUID;
  /** Short step label, e.g. "Step 1". */
  label?: string;
  /** LaTeX formula for this step. */
  latex: string;
  /** Substituted numeric expression, e.g. "= (1.234 × 9.81) / 0.5". */
  substitution?: string;
  /** Final numeric result with units, e.g. "= 24.23 N·m". */
  result?: string;
  /** Explanatory note for this step. */
  note?: string;
}

export interface CalculationBlockData {
  type: 'calculation';
  title?: string;
  steps: CalculationStep[];
  /** Overall result statement rendered after all steps. */
  conclusionText?: string;
}

// ── Acceptance criteria block ──────────────────────────────────────────────────

export type CriteriaResult = 'pass' | 'fail' | 'inconclusive' | 'not-applicable' | 'pending';

export interface AcceptanceCriterion {
  readonly id: DocUUID;
  /** Description of the criterion. */
  criterion: string;
  /** Specification or limit, e.g. "≤ 0.5 %". */
  specification: string;
  /** Measured or observed value. */
  measuredValue?: string;
  result: CriteriaResult;
  /** Additional remarks. */
  remarks?: string;
}

export interface AcceptanceCriteriaBlockData {
  type: 'acceptance-criteria';
  title?: string;
  criteria: AcceptanceCriterion[];
  /** Overall verdict for the block. */
  overallResult?: CriteriaResult;
}

// ── Reference block ───────────────────────────────────────────────────────────

export interface ReferenceEntry {
  readonly id: DocUUID;
  /** Citation key or number, e.g. "[1]" or "ISO17025". */
  key: string;
  /** Full citation text. */
  citation: string;
  /** Optional URL. */
  url?: string;
}

export interface ReferenceBlockData {
  type: 'reference';
  title?: string;
  entries: ReferenceEntry[];
}

// ── Exhibit / attachment block ────────────────────────────────────────────────

export interface ExhibitBlockData {
  type: 'exhibit';
  /** Exhibit label, e.g. "Exhibit A". */
  label: string;
  /** Exhibit title or description. */
  title?: string;
  /**
   * Asset ID of the embedded file (image, PDF placeholder, etc.)
   * References AssetRecord in DocStudioDocument.assets.
   */
  assetId?: DocUUID;
  /** Supplementary notes. */
  notes?: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Discriminated union — all block data types
// ─────────────────────────────────────────────────────────────────────────────

/**
 * The exhaustive discriminated union of all block data shapes.
 * The `type` field in each member is the discriminant.
 *
 * Narrowing example:
 *   if (block.data.type === 'heading') { /* HeadingBlockData *\/ }
 */
export type AnyBlockData =
  | HeadingBlockData
  | ParagraphBlockData
  | CalloutBlockData
  | ListBlockData
  | TableBlockData
  | FormulaBlockData
  | ImageBlockData
  | SignatureBlockData
  | HorizontalLineBlockData
  | PageBreakBlockData
  | SectionBreakBlockData
  | MetadataBlockData
  | RevisionHistoryBlockData
  | ProcedureStepBlockData
  | EquipmentListBlockData
  | ObservationBlockData
  | MeasurementBlockData
  | CalculationBlockData
  | AcceptanceCriteriaBlockData
  | ReferenceBlockData
  | ExhibitBlockData;

/**
 * Helper: extract the union of all block `type` string literals.
 * Useful for type-guard utilities and switch exhaustiveness checks.
 */
export type BlockType = AnyBlockData['type'];
