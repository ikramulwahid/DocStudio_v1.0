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
