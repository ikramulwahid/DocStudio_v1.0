/**
 * DocStudio — P02-M4 Node verification entry
 * ═══════════════════════════════════════════════════════════════════════════
 * Bundled by verify_p02_m4.mjs (esbuild) and executed in Node so the
 * verification script exercises the REAL renderer code, not a mock.
 *
 * @module renderer/poc/poc-node-entry
 */

export { buildPocFixture, POC_IMAGE_ASSET_ID, POC_CREATED_AT } from './poc-fixture';
export {
  renderDocPdfBytes,
  renderPocFixturePdfBytes,
  renderFontFallbackProbe,
} from './poc-render';
export { POC_BODY_FONT } from './poc-document';
