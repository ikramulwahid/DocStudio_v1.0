/**
 * DocStudio — Tauri 2 storage adapter for the user-template library (P03-M5)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Implements the pure `UserTemplateStorage` contract
 * (`services/user-template-library.ts`) on top of `@tauri-apps/plugin-fs`,
 * rooted at the APPLICATION-LOCAL data directory:
 *
 *     <appLocalData>/templates/<template-id>.dstemplate     (one file each)
 *     <appLocalData>/templates/<template-id>.dstemplate.tmp (transient)
 *
 * Why this location (filesystem-scope reasoning, P03-M5)
 * ─────────────────────────────────────────────────────
 * The store is deliberately separate from (a) ordinary `.docstudio`
 * documents (saved wherever the user chooses through the Save dialog) and
 * (b) external `.dstemplate` exports (also user-chosen paths).  The
 * app-local data directory (`$APPLOCALDATA`, e.g.
 * `%LOCALAPPDATA%\com.ikramulwahid.docstudio` on Windows) is the platform's
 * designated place for an application's own data and needs no user path
 * choice.  The capability in `src-tauri/capabilities/default.json` grants
 * only `templates/` (and its contents) under `$APPLOCALDATA` — the store is
 * NOT reachable from anywhere else, and the pre-existing `$HOME/**` scope
 * (P02 document flows) is neither used here nor expanded.
 *
 * Atomic writes
 * ─────────────
 * `write` writes to a deterministic `<name>.tmp` sibling first, then renames
 * it over the target (Rust `fs::rename` replaces an existing destination on
 * Windows).  If the rename fails the temp file is removed and the error
 * re-thrown, so a failed save leaves a previously valid template untouched
 * and never leaves truncated content under the real name.  A stray `.tmp`
 * left by a crash is inert: load only reads `*.dstemplate` files.
 *
 * @module services/user-template-storage
 */

import {
  BaseDirectory,
  exists,
  mkdir,
  readDir,
  readTextFile,
  remove,
  rename,
  writeTextFile,
} from '@tauri-apps/plugin-fs';
import type { UserTemplateStorage } from './user-template-library';

/** The dedicated store directory, relative to `$APPLOCALDATA`. */
export const USER_TEMPLATE_DIRECTORY = 'templates';

/** Compose a store-relative path (plugin-fs resolves `/` on every platform). */
function storePath(name: string): string {
  return `${USER_TEMPLATE_DIRECTORY}/${name}`;
}

/**
 * Create the Tauri-backed storage adapter.  All calls are scoped to
 * `$APPLOCALDATA/templates/**` by the capability configuration; any
 * permission or I/O failure surfaces as a rejected promise so the pure
 * layer can report it without corrupting state.
 */
export function createTauriUserTemplateStorage(): UserTemplateStorage {
  return {
    async ensureDirectory(): Promise<void> {
      if (!(await exists(USER_TEMPLATE_DIRECTORY, { baseDir: BaseDirectory.AppLocalData }))) {
        await mkdir(USER_TEMPLATE_DIRECTORY, {
          baseDir: BaseDirectory.AppLocalData,
          recursive: true,
        });
      }
    },

    async list(): Promise<string[]> {
      const entries = await readDir(USER_TEMPLATE_DIRECTORY, {
        baseDir: BaseDirectory.AppLocalData,
      });
      return entries.filter((e) => e.isFile).map((e) => e.name);
    },

    async read(name: string): Promise<string> {
      return readTextFile(storePath(name), { baseDir: BaseDirectory.AppLocalData });
    },

    async write(name: string, text: string): Promise<void> {
      const tempName = `${name}.tmp`;
      await writeTextFile(storePath(tempName), text, {
        baseDir: BaseDirectory.AppLocalData,
      });
      try {
        await rename(storePath(tempName), storePath(name), {
          oldPathBaseDir: BaseDirectory.AppLocalData,
          newPathBaseDir: BaseDirectory.AppLocalData,
        });
      } catch (e) {
        // Best-effort cleanup of the temp file; the target is untouched.
        try {
          await remove(storePath(tempName), { baseDir: BaseDirectory.AppLocalData });
        } catch {
          /* temp cleanup is best-effort only */
        }
        throw e;
      }
    },

    async remove(name: string): Promise<void> {
      await remove(storePath(name), { baseDir: BaseDirectory.AppLocalData });
    },
  };
}
