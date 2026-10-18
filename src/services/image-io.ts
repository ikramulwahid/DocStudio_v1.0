/**
 * DocStudio — Native image-file picking for the cover designer (P04-M4)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Thin wrapper over `@tauri-apps/plugin-dialog` (native open dialog) and
 * `@tauri-apps/plugin-fs` (scoped binary read) for embedding a cover
 * logo or background image.  Follows the Phase 02 file-scope lessons:
 *
 * • The dialog is filtered to the formats the PDF renderer can actually
 *   decode (PNG/JPEG — see services/image-import.ts for the evidence).
 * • Cancel returns `null` and touches NOTHING.
 * • Read failures throw `DocumentFileError('io-read-image', …)` with a
 *   user-explainable message; the caller leaves the document untouched.
 * • Reading uses `readFile` (binary → Uint8Array), which requires the
 *   narrow `fs:allow-read-file` permission added for P04-M4; the fs
 *   scope (`$HOME/**`) is NOT widened.
 *
 * The chosen file's BYTES are embedded into the document asset bundle —
 * no external absolute path is ever persisted as a document reference.
 *
 * @module services/image-io
 */

import { open as openDialog } from '@tauri-apps/plugin-dialog';
import { readFile } from '@tauri-apps/plugin-fs';
import { DocumentFileError } from './document-file';

/** Native dialog filter restricted to renderer-decodable raster formats. */
const IMAGE_FILTER = [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg'] }];

/** Result of a successful pick + read. */
export interface PickedImage {
  path: string;
  fileName: string;
  bytes: Uint8Array;
}

function fileNameFromPath(path: string): string {
  return path.split(/[\\/]/).pop() ?? path;
}

function systemErrorDetail(e: unknown): string {
  return e instanceof Error ? `${e.name}: ${e.message}` : String(e);
}

/**
 * Show the native image picker and read the selected file's bytes.
 * Returns `null` when the user cancels (a true no-op for the caller).
 * Throws DocumentFileError('io-read-image') when the dialog or the read
 * fails — the caller must leave the document unchanged in that case.
 */
export async function pickAndReadImage(): Promise<PickedImage | null> {
  let chosen: string | string[] | null;
  try {
    chosen = await openDialog({
      title: 'Select an image (PNG or JPEG)',
      multiple: false,
      filters: IMAGE_FILTER,
    });
  } catch (e) {
    throw new DocumentFileError(
      'io-read-image',
      'The image picker could not be opened.',
      systemErrorDetail(e),
    );
  }
  if (chosen === null || chosen === undefined) return null; // cancelled

  const path = Array.isArray(chosen) ? chosen[0] : chosen;
  if (!path) return null;

  let bytes: Uint8Array;
  try {
    bytes = await readFile(path);
  } catch (e) {
    throw new DocumentFileError(
      'io-read-image',
      'The selected image could not be read. Images must be readable inside your user folder with a PNG or JPEG format.',
      systemErrorDetail(e),
    );
  }
  return { path, fileName: fileNameFromPath(path), bytes };
}
