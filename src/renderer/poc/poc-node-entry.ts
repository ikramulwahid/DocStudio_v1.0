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
