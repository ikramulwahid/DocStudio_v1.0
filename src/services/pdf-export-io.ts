/**
 * DocStudio — P02-M4 native PDF export I/O (proof of concept)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Narrow wrapper for saving generated PDF BYTES through the existing
 * dialog + scoped-fs approach used by `.docstudio` save/open. This is the
 * minimal native path needed to write a binary file — `fs:allow-write-file`
 * (binary) was added to the Tauri capability set for this purpose; it stays
 * inside the same `$HOME/**` scope plus the dialog plugin's per-file
 * session grants (verified in P02-M2-R1).
 *
 * Contract mirrors document-io.ts:
 * • Cancelled dialog → null (no state change).
 * • Success → resolved path and filename.
 * • Failure → throws with a short user-facing message.
 *
 * @module services/pdf-export-io
 */

import { save as saveDialog } from '@tauri-apps/plugin-dialog';
import { writeFile } from '@tauri-apps/plugin-fs';

/** Native dialog filter restricted to PDF. */
const PDF_FILTER = [{ name: 'PDF Document', extensions: ['pdf'] }];

/** Result of a successful export. */
export interface SavedPdfRef {
  path: string;
  fileName: string;
}

function fileNameFromPath(path: string): string {
  return path.split(/[\\/]/).pop() ?? path;
}

function ensurePdfExtension(path: string): string {
  return path.toLowerCase().endsWith('.pdf') ? path : `${path}.pdf`;
}

/**
 * Save PDF bytes via a native save dialog.
 * Returns null when the user cancels; throws on I/O failure.
 */
export async function savePdfViaDialog(
  bytes: Uint8Array,
  suggestedFileName: string,
): Promise<SavedPdfRef | null> {
  // Never write an empty file: a zero-length payload means the source
  // buffer was consumed/detached somewhere upstream (P02-M4 manual-test
  // finding) and must be re-rendered, not silently persisted.
  if (bytes.byteLength === 0) {
    throw new Error('Refusing to export an empty PDF (0 bytes). Please re-render the document and try again.');
  }

  const path = await saveDialog({
    filters: PDF_FILTER,
    defaultPath: suggestedFileName,
    title: 'Export PDF',
  });
  if (path === null) return null;

  const finalPath = ensurePdfExtension(path);
  try {
    await writeFile(finalPath, bytes);
  } catch (e) {
    console.error('[DocStudio] PDF export write failed:', e);
    throw new Error('The PDF file could not be written to the chosen location.');
  }
  return { path: finalPath, fileName: fileNameFromPath(finalPath) };
}
