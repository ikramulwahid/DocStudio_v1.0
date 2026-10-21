/**
 * DocStudio — P02-M4 Node verification entry
 * ═══════════════════════════════════════════════════════════════════════════
 * Bundled by verify_p02_m4.mjs / verify_p04_m2.mjs / verify_p04_m3.mjs
 * (esbuild) and executed in Node so the verification scripts exercise the
 * REAL renderer and service code, not a mock.  Additive exports only — the
 * earlier suites import the same paths they always did.
 *
 * @module renderer/poc/poc-node-entry
 */

export { buildPocFixture, POC_IMAGE_ASSET_ID, POC_CREATED_AT } from './poc-fixture';
export {
  renderDocPdfBytes,
  renderPocFixturePdfBytes,
  renderFontFallbackProbe,
} from './poc-render';
export { POC_BODY_FONT, computePocLayout } from './poc-document';
export { buildThemeSampleDoc, THEME_SAMPLE_CREATED_AT } from './theme-sample-doc';
export { renderThemeGalleryPdfBytes, ThemeGalleryDocument } from './poc-theme-gallery';
// Service-layer surface for P04-M3 selector/serialization tests (the
// modules are already in this entry's compile graph via poc-document).
export { updateBodyTheme } from '../../services/page-typography';
export { serializeDocument, validateDocument } from '../../services/document-file';
export { duplicateDocument } from '../../services/document-actions';

// ── P04-M4 (front page / cover themes) — additive exports only ──────────────
export {
  COVER_THEME_IDS,
  COVER_THEME_REGISTRY,
  isCoverThemeId,
  resolveCoverTheme,
} from '../../services/cover-theme-registry';
export {
  applyCoverMonochrome,
  effectiveCoverPlacement,
} from '../../services/cover-theme-tokens';
export {
  updateFrontPage,
  applyImportedCoverAsset,
  removeCoverAsset,
  collectReferencedAssetIds,
  coverFieldLabel,
  isValidCoverColor,
  LOGO_WIDTH_MM_RANGE,
  FRAME_THICKNESS_PT_RANGE,
  FRAME_CORNER_RADIUS_MM_RANGE,
  FRAME_INSET_MM_RANGE,
  SYNOPSIS_MAX_LENGTH,
} from '../../services/front-page';
export {
  importImageAsset,
  sniffImageMimeType,
  bytesToBase64,
  COVER_IMAGE_MAX_BYTES,
  SUPPORTED_IMPORT_MIME_TYPES,
} from '../../services/image-import';
export {
  PocCoverPage,
  COVER_COMPOSITIONS,
  coverMetadataEntries,
  resolveCoverAsset,
  buildCoverCtx,
  effectiveLogoWidthMm,
} from './poc-cover-page';
export {
  renderCoverGalleryPdfBytes,
  CoverGalleryDocument,
  coverManifestEntries,
} from './poc-cover-gallery';
export {
  buildCoverSampleDoc,
  COVER_SAMPLE_CREATED_AT,
  COVER_SAMPLE_LOGO_ID,
  COVER_SAMPLE_BACKGROUND_ID,
  COVER_SAMPLE_CUSTOM_PROJECT_ID,
  COVER_SAMPLE_CUSTOM_METHOD_ID,
} from './cover-sample-doc';

// ── P05-M2 (headings + rich-text paragraph) — additive exports only ──────────
// Heading numbering engine (pure) plus the heading/paragraph content actions
// and the inline-span algebra.  Every export below is exercised by
// verify_p05_m2.mjs through this entry so the suite compiles the same module
// graph the renderer uses.
export {
  HEADING_LEVELS,
  HEADING_PREFIX_SEPARATOR,
  computeHeadingNumbering,
} from '../../services/heading-numbering';
export {
  MAX_PARAGRAPH_INDENT,
  updateHeadingContent,
  updateParagraphContent,
} from '../../services/block-content';
export {
  spansToPlainText,
  plainTextToSpans,
  normalizeHexColor,
  validateColorPatch,
  sanitizeHref,
  normalizeSpans,
  applySpanFormatting,
  applySpanLink,
  applySpanColor,
  clearSpanFormatting,
  isFlagActiveOverRange,
  hrefOverRange,
  remapSpansAfterTextEdit,
} from '../../services/rich-text';

// ── P05-M3 (lists + callouts) — additive exports only ────────────────────────
// List numbering engine (pure) plus the list/callout content actions.
// Every export below is exercised by verify_p05_m3.mjs through this entry so
// the suite compiles the same module graph the renderer uses.
export {
  ROMAN_MAX,
  formatDecimal,
  formatAlpha,
  formatRoman,
  formatListCounter,
  computeListLabels,
} from '../../services/list-numbering';
export {
  MAX_LIST_DEPTH,
  LIST_TYPES,
  BULLET_STYLES,
  NUMBER_STYLES,
  LIST_MARKER_SOURCES,
  MAX_CALLOUT_VARIANT_LENGTH,
  MAX_CALLOUT_TITLE_LENGTH,
  updateListSettings,
  updateListItemText,
  addListItem,
  removeListItem,
  moveListItem,
  moveListItemTo,
  indentListItem,
  outdentListItem,
  setItemChecked,
  applyListContentAction,
  updateCalloutContent,
} from '../../services/list-callout-content';

// ── P05-M4 (tables + spacing) — additive exports only ────────────────────────
// Table layout maths (pure) plus the table content actions.  Every export
// below is exercised by verify_p05_m4.mjs through this entry so the suite
// compiles the same module graph the renderer uses.
export {
  COLUMN_FRACTIONS,
  allocateTableColumnWidths,
  estimateRowHeightPt,
  tableColumnCount,
} from './table-layout';
export {
  TABLE_HEADER_STYLES,
  TABLE_HEADER_STYLE_SOURCES,
  H_ALIGNMENTS,
  MIN_TABLE_ROWS,
  MIN_TABLE_COLUMNS,
  MAX_TABLE_CAPTION_LENGTH,
  updateTableSettings,
  setTableCellText,
  setTableCellAlignment,
  addTableRow,
  removeTableRow,
  addTableColumn,
  removeTableColumn,
  applyTableContentAction,
} from '../../services/table-content';

// ── P06-M1 (header/footer grid, numbering, watermark) — additive exports ────
// The pure settings service, the settings-driven furniture layer and the
// probe document.  Every export below is exercised by verify_p06_m1.mjs
// through this entry so the suite compiles the same module graph the
// renderer uses.  Nothing here changes what `PocDocument` renders for any
// committed baseline (see poc-page-furniture's decision boundary).
export {
  HF_MAX_ROWS,
  HF_MAX_COLUMNS,
  HF_CELL_CONTENT_MAX_LENGTH,
  WATERMARK_OPACITY_RANGE,
  WATERMARK_POSITION_RANGE,
  WATERMARK_ROTATION_DEG_RANGE,
  WATERMARK_FONT_SIZE_PT_RANGE,
  WATERMARK_TEXT_MAX_LENGTH,
  PAGE_NUMBER_FORMATS,
  H_ALIGNMENTS as HF_H_ALIGNMENTS,
  V_ALIGNMENTS,
  DOCUMENTED_TOKENS,
  applyHeaderFooterPatch,
  applyWatermarkPatch,
  formatPageNumber,
  resolveCellText,
} from '../../services/header-footer-settings';
export {
  PocConfiguredFurniture,
  WatermarkLayer,
  shouldRenderHeader,
  shouldRenderFooter,
  bandRendersOnPage,
  watermarkRendersOnPage,
  coverOffsetPages,
} from './poc-page-furniture';
export {
  FurnitureProbeDocument,
  renderFurnitureProbePdfBytes,
} from './poc-furniture-probe';

// ── P06-M2 (structural blocks) — additive exports only ──────────────────────
// The pure structural content service plus the registry surface the suite
// needs for insertion/summary checks.  Every export below is exercised by
// verify_p06_m2.mjs through this entry so the suite compiles the same module
// graph the renderer uses.  Nothing here changes what `PocDocument` renders
// for any committed baseline (block-styled rules require `styleSource:
// 'block'`, which no existing document or gallery fixture carries).
export {
  HORIZONTAL_LINE_THICKNESS_PT_RANGE,
  MAX_STRUCTURAL_TEXT_LENGTH,
  metadataFieldChoices,
  updateHorizontalLineContent,
  updateSectionBreakContent,
  setMetadataBlockFields,
  addRevisionEntry,
  updateRevisionEntry,
  removeRevisionEntry,
  updateReferenceTitle,
  addReferenceEntry,
  updateReferenceEntry,
  removeReferenceEntry,
  updateExhibitContent,
  applyStructuralAction,
} from '../../services/structural-block-content';
export {
  createBlock,
  insertBlock,
} from '../../services/block-actions';

// ── P06-M3 (formula blocks) — additive exports only ─────────────────────────
// The MathJax engine wrapper, the immutable formula content actions and the
// pure layout planner.  Every export below is exercised by verify_p06_m3.mjs
// through this entry so the suite compiles the same module graph the renderer
// uses.  Nothing here changes what `PocDocument` renders for any committed
// baseline (no committed fixture or gallery document carries a formula
// block).
export {
  FORMULA_TEX_PACKAGES,
  MATH_UNITS_PER_EM,
  renderLatexToMathSvg,
  validateLatex,
  estimateTextWidthPt,
} from '../../services/math-engine';
export {
  FORMULA_ALIGNMENTS,
  MAX_FORMULA_LATEX_LENGTH,
  MAX_FORMULA_NUMBER_LENGTH,
  MAX_WHERE_LABEL_LENGTH,
  MAX_VARIABLE_SYMBOL_LENGTH,
  MAX_VARIABLE_DEFINITION_LENGTH,
  MAX_VARIABLE_UNIT_LENGTH,
  updateFormulaContent,
  addVariableDefinition,
  updateVariableDefinition,
  removeVariableDefinition,
  applyFormulaAction,
} from '../../services/formula-content';
export {
  planFormulaLayout,
  FORMULA_WHERE_GAP_PT,
  FORMULA_NUMBER_GAP_PT,
  FORMULA_SYMBOL_GAP_PT,
} from './formula-layout';
export { mathSvgToReact, parseMathSvgDocument, expandMathPathData } from './poc-math-svg';
