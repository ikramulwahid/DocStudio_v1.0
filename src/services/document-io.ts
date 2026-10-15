/**
 * DocStudio — Tauri 2 native file I/O for `.docstudio` projects
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Thin wrapper over the official `@tauri-apps/plugin-dialog` (native
 * open/save dialogs) and `@tauri-apps/plugin-fs` (scoped filesystem
 * access) used by the Save/Open topbar actions.
 *
 * Contract
 * ────────
 * • Cancelled dialogs return `null`; callers make NO state changes.
 * • Successful reads/writes return the resolved path and filename.
 * • Failures throw DocumentFileError ('io-read' / 'io-write') with a short
 *   user-facing message; the underlying system error is preserved in
 *   `detail` for development diagnostics.
 *
 * File-format concerns (parsing/validation) live in
 * src/services/document-file.ts, which is Tauri-free and unit-testable.
 *
 * @module services/document-io
 */

import { open as openDialog, save as saveDialog } from '@tauri-apps/plugin-dialog';
import { readTextFile, writeTextFile } from '@tauri-apps/plugin-fs';
import { DocumentFileError } from './document-file';

/** Native dialog filter restricted to the project extension. */
const PROJECT_FILTER = [{ name: 'DocStudio Project', extensions: ['docstudio'] }];

/** Result of a successful save: the file's absolute path and display name. */
export interface SavedProjectRef {
  path: string;
  fileName: string;
}

/** Result of a successful open read, before any parsing/validation. */
export interface OpenedProjectText extends SavedProjectRef {
  text: string;
}

/** Extract the display filename from an absolute path (Windows or POSIX). */
function fileNameFromPath(path: string): string {
  return path.split(/[\\/]/).pop() ?? path;
}

/** Ensure the chosen save path carries the `.docstudio` extension. */
function ensureProjectExtension(path: string): string {
  return path.toLowerCase().endsWith('.docstudio') ? path : `${path}.docstudio`;
}

function systemErrorDetail(e: unknown): string {
  return e instanceof Error ? `${e.name}: ${e.message}` : String(e);
}

/**
 * Save project text to disk.
 *
 * • `currentPath` set  → writes straight back to that file (no dialog).
 * • `currentPath` null → shows the native Save dialog, filtered to
 *   `.docstudio`, with `suggestedFileName` as the default name.
 *
 * Returns the saved path/fileName, or `null` when the user cancelled the
 * dialog.  Throws DocumentFileError('io-write') if the write fails.
 */
export async function saveProjectText(
  text: string,
  currentPath: string | null,
  suggestedFileName: string,
): Promise<SavedProjectRef | null> {
  if (currentPath) {
    try {
      await writeTextFile(currentPath, text);
    } catch (e) {
      throw new DocumentFileError(
        'io-write',
        'The project could not be saved to its file on disk. Check that the location still exists and is writable.',
        systemErrorDetail(e),
      );
    }
    return { path: currentPath, fileName: fileNameFromPath(currentPath) };
  }

  let chosen: string | string[] | null;
  try {
    chosen = await saveDialog({
      title: 'Save DocStudio Project',
      defaultPath: suggestedFileName,
      filters: PROJECT_FILTER,
    });
  } catch (e) {
    throw new DocumentFileError('io-write', 'The Save dialog could not be opened.', systemErrorDetail(e));
  }
  if (chosen === null) return null; // user cancelled

  const path = ensureProjectExtension(typeof chosen === 'string' ? chosen : chosen[0]);
  try {
    await writeTextFile(path, text);
  } catch (e) {
    throw new DocumentFileError(
      'io-write',
      'The project could not be saved to the selected location. Check that the location is writable and not restricted.',
      systemErrorDetail(e),
    );
  }
  return { path, fileName: fileNameFromPath(path) };
}

/**
 * Show the native Open dialog (filtered to `.docstudio`) and read the
 * selected file as text.  Parsing/validation is the caller's step, so a
 * failed read can never disturb the active document.
 *
 * Returns `null` when the user cancelled.  Throws
 * DocumentFileError('io-read') if the file cannot be read.
 */
export async function readProjectText(): Promise<OpenedProjectText | null> {
  let chosen: string | string[] | null;
  try {
    chosen = await openDialog({
      title: 'Open DocStudio Project',
      multiple: false,
      filters: PROJECT_FILTER,
    });
  } catch (e) {
    throw new DocumentFileError('io-read', 'The Open dialog could not be opened.', systemErrorDetail(e));
  }
  if (chosen === null) return null; // user cancelled

  const path = typeof chosen === 'string' ? chosen : chosen[0];
  try {
    const text = await readTextFile(path);
    return { path, fileName: fileNameFromPath(path), text };
  } catch (e) {
    throw new DocumentFileError(
      'io-read',
      'The selected project could not be read from disk. Check that the file still exists and is readable.',
      systemErrorDetail(e),
    );
  }
}
