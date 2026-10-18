/**
 * DocStudio — Cover image validation and embedding (P04-M4)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Pure validation + conversion rules for images embedded into a
 * document's asset bundle as the cover logo or background/hero image
 * (project_details.md §7.1).  No Tauri imports here — this module runs
 * in both the WebView and the Node verification harness.
 *
 * HONEST FORMAT SUPPORT: the schema's `AssetMimeType` union lists
 * png/jpeg/gif/webp/svg, but the actual PDF renderer
 * (`@react-pdf/renderer` → `@react-pdf/image`) decodes only **PNG**
 * (png-js), **JPEG** (jay-peg) and SVG source trees — GIF and WebP
 * cannot be decoded into the PDF.  The importer therefore accepts PNG
 * and JPEG only and says so in its error message; this matches the
 * "inspect actual decoder/render support before presenting a format as
 * supported" requirement.
 *
 * Validation is performed on the BYTES (magic-number sniffing), never on
 * the filename extension, so a mislabelled file cannot smuggle an
 * unsupported format into the document.
 *
 * @module services/image-import
 */

import type { AssetMimeType, AssetRecord } from '../types/document';
import { nowISO } from '../types/defaults';
import { newUUID } from '../types/defaults';

/** Maximum embedded image size (base64 stays inside the .docstudio JSON). */
export const COVER_IMAGE_MAX_BYTES = 5 * 1024 * 1024; // 5 MB

/** Formats the current renderer can actually embed into the PDF. */
export const SUPPORTED_IMPORT_MIME_TYPES: readonly AssetMimeType[] = Object.freeze([
  'image/png',
  'image/jpeg',
]);

/** Human-readable list for dialog filters and error messages. */
export const SUPPORTED_IMPORT_FORMAT_LABEL = 'PNG or JPEG';

export type ImageImportErrorCode =
  | 'empty-file'
  | 'file-too-large'
  | 'unsupported-format'
  | 'encode-failed';

export type ImageImportResult =
  | { ok: true; asset: AssetRecord }
  | { ok: false; code: ImageImportErrorCode; message: string };

const fail = (code: ImageImportErrorCode, message: string): ImageImportResult => ({
  ok: false,
  code,
  message,
});

/**
 * Sniff the image format from magic bytes.  Returns null when the bytes
 * are not a supported raster image — the filename is never consulted.
 */
export function sniffImageMimeType(bytes: Uint8Array): AssetMimeType | null {
  if (bytes.length >= 8 &&
      bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47 &&
      bytes[4] === 0x0d && bytes[5] === 0x0a && bytes[6] === 0x1a && bytes[7] === 0x0a) {
    return 'image/png';
  }
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return 'image/jpeg';
  }
  // Recognised-but-unsupported formats get a specific message, not a
  // generic failure: the user needs to know to convert the file.
  if (bytes.length >= 6) {
    const head = String.fromCharCode(...bytes.subarray(0, 6));
    if (head === 'GIF87a' || head === 'GIF89a') return 'image/gif';
  }
  if (bytes.length >= 12 &&
      String.fromCharCode(...bytes.subarray(0, 4)) === 'RIFF' &&
      String.fromCharCode(...bytes.subarray(8, 12)) === 'WEBP') {
    return 'image/webp';
  }
  return null;
}

/**
 * Platform-safe bytes → base64 (Node `Buffer` in the verification
 * harness; `btoa` chunking in the WebView).  Resolved through
 * `globalThis` with guards — this module compiles without Node types.
 * Deterministic for a given input.
 */
export function bytesToBase64(bytes: Uint8Array): string {
  const g = globalThis as unknown as {
    Buffer?: { from(data: Uint8Array): { toString(enc: string): string } };
    btoa?(data: string): string;
  };
  if (g.Buffer) {
    return g.Buffer.from(bytes).toString('base64');
  }
  if (!g.btoa) {
    throw new Error('No base64 encoder available in this environment.');
  }
  let binary = '';
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return g.btoa(binary);
}

/**
 * Validate image bytes and produce a fresh `AssetRecord` ready for the
 * document bundle.  The id is always fresh (stable per import); the
 * filename is kept human-readable for the asset list.  On any failure
 * the caller receives an error and NO asset — the document is never
 * touched by this function.
 */
export function importImageAsset(
  bytes: Uint8Array,
  filename: string,
  now: string = nowISO(),
): ImageImportResult {
  if (!bytes || bytes.length === 0) {
    return fail('empty-file', 'The selected file has no content.');
  }
  if (bytes.length > COVER_IMAGE_MAX_BYTES) {
    return fail(
      'file-too-large',
      `The selected image is larger than ${Math.round(COVER_IMAGE_MAX_BYTES / (1024 * 1024))} MB. Please use a smaller ${SUPPORTED_IMPORT_FORMAT_LABEL} image.`,
    );
  }
  const sniffed = sniffImageMimeType(bytes);
  if (sniffed === null) {
    return fail(
      'unsupported-format',
      `The selected file is not a readable image. Please choose a ${SUPPORTED_IMPORT_FORMAT_LABEL} image.`,
    );
  }
  if (!SUPPORTED_IMPORT_MIME_TYPES.includes(sniffed)) {
    const label = sniffed === 'image/gif' ? 'GIF' : sniffed === 'image/webp' ? 'WebP' : sniffed;
    return fail(
      'unsupported-format',
      `${label} images cannot be embedded into the PDF with the current renderer. Please convert the file to ${SUPPORTED_IMPORT_FORMAT_LABEL} and try again.`,
    );
  }
  let base64Data: string;
  try {
    base64Data = bytesToBase64(bytes);
  } catch {
    return fail('encode-failed', 'The selected image could not be read into the document.');
  }
  const safeName = filename.trim() === '' ? `image.${sniffed === 'image/png' ? 'png' : 'jpg'}` : filename;
  const asset: AssetRecord = {
    id: newUUID(),
    filename: safeName,
    mimeType: sniffed,
    sizeBytes: bytes.length,
    addedAt: now,
    base64Data,
  };
  return { ok: true, asset };
}
