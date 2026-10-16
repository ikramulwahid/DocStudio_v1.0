/**
 * DocStudio — Custom-template persistence workflows (P03-M5)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Orchestrates the user-facing save / update / export / import workflows on
 * top of the pure user-template policies
 * (`services/user-template-library.ts`), the Tauri storage adapter
 * (`services/user-template-storage.ts`) and the existing `.dstemplate`
 * serializer/validator (`services/template-file.ts`), using the native
 * dialogs exactly like the `.docstudio` document flows
 * (`services/document-io.ts`).
 *
 * Workflow contracts (surfaced by the chooser, tested in verify_p03_m5.mjs
 * at the pure level and live in `npx tauri dev`)
 * ───────────────────────────────────────────────────────────────────────
 * `saveNewFromDraft` — Save a built-in or its customized draft (or "save a
 *   copy" of a user template) as a NEW user template:
 *   1. build a fresh user identity (deep copy — the source is never touched);
 *   2. show the native Save dialog (`.dstemplate`); CANCEL here changes
 *      nothing at all — the draft and active document survive;
 *   3. write the export file (a write failure aborts before the library is
 *      touched);
 *   4. register the template in the persistent My Templates library so it
 *      appears in the chooser immediately and after restart.
 *   Every partial outcome is reported precisely: if the export succeeded but
 *   the library write failed, the outcome says exactly what happened and how
 *   to recover — full success is reported only when BOTH writes succeeded.
 *
 * `saveChangesToStored` — explicitly overwrite an existing user template
 *   with its edited draft: identity and `createdAt` are preserved,
 *   `updatedAt` is stamped, and the atomic store write means a failure
 *   leaves the previously saved version intact.  (The chooser requires an
 *   explicit overwrite confirmation before calling this.)
 *
 * `exportTemplateFile` — export the current template/draft to a chosen path
 *   via the native Save dialog.  Cancel is non-destructive.
 *
 * `beginImport` / `applyImport` — Import a `.dstemplate` file:
 *   `beginImport` shows the native Open dialog, reads and VALIDATES the file
 *   (malformed JSON, wrong signature, unsupported schema version or invalid
 *   structure produce an actionable error and NO library change), then
 *   normalizes identity and classifies it against the caller's current
 *   library (`new` / `duplicate` / `conflict`).  `applyImport` performs the
 *   actual store write for the caller's explicit choice — a conflicting id
 *   is NEVER overwritten silently (replace / import as copy / cancel).
 *
 * This module is the only P03-M5 piece that imports Tauri plugins.
 *
 * @module services/template-persistence
 */

import { open as openDialog, save as saveDialog } from '@tauri-apps/plugin-dialog';
import { readTextFile, writeTextFile } from '@tauri-apps/plugin-fs';
import type { DocStudioTemplate } from '../types/template';
import { nowISO } from '../types/defaults';
import {
  TemplateFileError,
  defaultTemplateFileName,
  deserializeTemplate,
  serializeTemplate,
} from './template-file';
import {
  UserTemplateError,
  applyImportPlan,
  createUserTemplateFrom,
  loadUserTemplates,
  planImport,
  saveTemplateToStorage,
  updateUserTemplate,
  type ImportChoice,
  type ImportPlan,
  type UserLibraryLoadResult,
} from './user-template-library';
import { createTauriUserTemplateStorage } from './user-template-storage';

// Re-export the pure policy types the chooser needs, so UI code has a single
// import site for the persistence workflow surface.
export type { ImportChoice, ImportPlan } from './user-template-library';

/** Native dialog filter for template files. */
const TEMPLATE_FILTER = [{ name: 'DocStudio Template', extensions: ['dstemplate'] }];

/** Extract the display filename from an absolute path (Windows or POSIX). */
function fileNameFromPath(path: string): string {
  return path.split(/[\\/]/).pop() ?? path;
}

/** Ensure the chosen save path carries the `.dstemplate` extension. */
function ensureTemplateExtension(path: string): string {
  return path.toLowerCase().endsWith('.dstemplate') ? path : `${path}.dstemplate`;
}

function systemErrorDetail(e: unknown): string {
  return e instanceof Error ? `${e.name}: ${e.message}` : String(e);
}

// ─────────────────────────────────────────────────────────────────────────────
// Outcome types (deterministic; the UI maps them to user-facing messages)
// ─────────────────────────────────────────────────────────────────────────────

/** Result of saving a brand-new user template (built-in/draft/copy). */
export type SaveNewOutcome =
  | { readonly status: 'ok'; readonly template: DocStudioTemplate; readonly exportedPath: string }
  | { readonly status: 'cancelled' }
  | {
      readonly status: 'partial';
      readonly template: DocStudioTemplate;
      readonly exportedPath: string;
      readonly message: string;
    }
  | { readonly status: 'failed'; readonly stage: 'dialog' | 'validate' | 'export'; readonly message: string };

/** Result of explicitly updating an existing user template. */
export type SaveChangesOutcome =
  | { readonly status: 'ok'; readonly template: DocStudioTemplate }
  | { readonly status: 'failed'; readonly message: string };

/** Result of exporting a template to a user-chosen path. */
export type ExportOutcome =
  | { readonly status: 'ok'; readonly path: string }
  | { readonly status: 'cancelled' }
  | { readonly status: 'failed'; readonly message: string };

/** Result of the import dialog + validation + classification step. */
export type ImportBeginOutcome =
  | { readonly status: 'cancelled' }
  | { readonly status: 'failed'; readonly message: string }
  | { readonly status: 'invalid'; readonly message: string }
  | { readonly status: 'ready'; readonly plan: ImportPlan };

/** Result of writing an applied import into the library. */
export type ApplyImportOutcome =
  | { readonly status: 'ok'; readonly template: DocStudioTemplate }
  | { readonly status: 'cancelled' }
  | { readonly status: 'noop' }
  | { readonly status: 'failed'; readonly message: string };

// ─────────────────────────────────────────────────────────────────────────────
// Manager
// ─────────────────────────────────────────────────────────────────────────────

/** User-facing persistence workflows used by the template chooser. */
export interface TemplatePersistenceManager {
  /** Load the persistent My Templates library (non-fatal warnings included). */
  load(): Promise<UserLibraryLoadResult>;
  /** Save `draft` as a NEW user template (export dialog + library register). */
  saveNewFromDraft(
    draft: DocStudioTemplate,
    name: string,
    existing: readonly DocStudioTemplate[],
  ): Promise<SaveNewOutcome>;
  /** Explicitly overwrite the stored `stored` user template with `draft`. */
  saveChangesToStored(
    stored: DocStudioTemplate,
    draft: DocStudioTemplate,
  ): Promise<SaveChangesOutcome>;
  /** Export the current template/draft to a chosen path (no library change). */
  exportTemplateFile(draft: DocStudioTemplate): Promise<ExportOutcome>;
  /** Open-dialog + read + validate + classify an import candidate. */
  beginImport(existing: readonly DocStudioTemplate[]): Promise<ImportBeginOutcome>;
  /** Persist the caller's explicit import decision (add/replace/copy/cancel). */
  applyImport(
    existing: readonly DocStudioTemplate[],
    plan: ImportPlan,
    choice: ImportChoice,
  ): Promise<ApplyImportOutcome>;
}

/**
 * Build the persistence manager backed by the app-local template store.
 * The manager holds no cached library state — the chooser owns the current
 * list and reloads after each successful operation, so what is displayed is
 * always what is on disk.
 */
export function createTemplatePersistenceManager(): TemplatePersistenceManager {
  const storage = createTauriUserTemplateStorage();

  return {
    async load(): Promise<UserLibraryLoadResult> {
      return loadUserTemplates(storage);
    },

    async saveNewFromDraft(draft, name, existing): Promise<SaveNewOutcome> {
      // 1. Build a fresh user identity.  A UUID collision with an existing
      //    entry (practically impossible) is re-minted, never overwritten.
      let template: DocStudioTemplate;
      try {
        template = createUserTemplateFrom(draft, name, nowISO());
        let attempts = 0;
        while (existing.some((t) => t.id === template.id) && attempts < 5) {
          template = createUserTemplateFrom(draft, name, nowISO());
          attempts += 1;
        }
        if (existing.some((t) => t.id === template.id)) {
          return {
            status: 'failed',
            stage: 'validate',
            message: 'A unique template identity could not be assigned. Nothing was saved.',
          };
        }
      } catch (e) {
        return {
          status: 'failed',
          stage: 'validate',
          message:
            e instanceof UserTemplateError
              ? e.message
              : 'This template cannot be saved as a user template.',
        };
      }

      // 2. Native Save dialog — cancelling changes nothing at all.
      let chosen: string | string[] | null;
      try {
        chosen = await saveDialog({
          title: 'Export Template Copy',
          defaultPath: defaultTemplateFileName(template.name),
          filters: TEMPLATE_FILTER,
        });
      } catch (e) {
        return {
          status: 'failed',
          stage: 'dialog',
          message: `The Save dialog could not be opened (${systemErrorDetail(e)}). Nothing was saved.`,
        };
      }
      if (chosen === null) return { status: 'cancelled' };
      const path = ensureTemplateExtension(typeof chosen === 'string' ? chosen : chosen[0]);

      // 3. Export write — a failure aborts BEFORE the library is touched.
      try {
        await writeTextFile(path, serializeTemplate(template));
      } catch (e) {
        return {
          status: 'failed',
          stage: 'export',
          message: `The export file could not be written (${systemErrorDetail(
            e,
          )}). Check that the location is writable. Your My Templates library was not changed.`,
        };
      }

      // 4. Register in the persistent library (atomic write).
      try {
        await saveTemplateToStorage(storage, template);
      } catch (e) {
        return {
          status: 'partial',
          template,
          exportedPath: path,
          message: `The template was exported to "${fileNameFromPath(
            path,
          )}", but it could NOT be added to My Templates (${
            e instanceof Error ? e.message : String(e)
          }). Your saved templates were not modified. To recover, use Import Template on the exported file, or retry the save.`,
        };
      }
      return { status: 'ok', template, exportedPath: path };
    },

    async saveChangesToStored(stored, draft): Promise<SaveChangesOutcome> {
      try {
        const next = updateUserTemplate(stored, draft, nowISO());
        await saveTemplateToStorage(storage, next);
        return { status: 'ok', template: next };
      } catch (e) {
        return {
          status: 'failed',
          message: `Changes were NOT saved (${
            e instanceof Error ? e.message : String(e)
          }). The previously saved version is unchanged.`,
        };
      }
    },

    async exportTemplateFile(draft): Promise<ExportOutcome> {
      let text: string;
      try {
        text = serializeTemplate(draft);
      } catch (e) {
        return {
          status: 'failed',
          message:
            e instanceof TemplateFileError
              ? e.message
              : 'This template cannot be exported in its current state.',
        };
      }
      let chosen: string | string[] | null;
      try {
        chosen = await saveDialog({
          title: 'Export DocStudio Template',
          defaultPath: defaultTemplateFileName(draft.name),
          filters: TEMPLATE_FILTER,
        });
      } catch (e) {
        return {
          status: 'failed',
          message: `The Save dialog could not be opened (${systemErrorDetail(e)}). Nothing was exported.`,
        };
      }
      if (chosen === null) return { status: 'cancelled' };
      const path = ensureTemplateExtension(typeof chosen === 'string' ? chosen : chosen[0]);
      try {
        await writeTextFile(path, text);
      } catch (e) {
        return {
          status: 'failed',
          message: `The export file could not be written (${systemErrorDetail(
            e,
          )}). Check that the location is writable.`,
        };
      }
      return { status: 'ok', path };
    },

    async beginImport(existing): Promise<ImportBeginOutcome> {
      let chosen: string | string[] | null;
      try {
        chosen = await openDialog({
          title: 'Import DocStudio Template',
          multiple: false,
          filters: TEMPLATE_FILTER,
        });
      } catch (e) {
        return {
          status: 'failed',
          message: `The Open dialog could not be opened (${systemErrorDetail(e)}). Nothing was imported.`,
        };
      }
      if (chosen === null) return { status: 'cancelled' };
      const path = typeof chosen === 'string' ? chosen : chosen[0];

      let text: string;
      try {
        text = await readTextFile(path);
      } catch (e) {
        return {
          status: 'invalid',
          message: `The selected file could not be read (${systemErrorDetail(
            e,
          )}). Check that it still exists. Nothing was imported.`,
        };
      }

      let imported: DocStudioTemplate;
      try {
        imported = deserializeTemplate(text);
      } catch (e) {
        return {
          status: 'invalid',
          message: `${
            e instanceof TemplateFileError ? e.message : 'This file is not a DocStudio template.'
          } Nothing was imported and your saved templates are unchanged.`,
        };
      }

      return { status: 'ready', plan: planImport(existing, imported, nowISO()) };
    },

    async applyImport(existing, plan, choice): Promise<ApplyImportOutcome> {
      const applied = applyImportPlan(plan, choice, nowISO());
      if (applied.status !== 'ok') return applied;
      try {
        // Guard against a same-id file appearing between plan and apply:
        // an explicit replace is allowed, anything else must not overwrite.
        const clash = existing.find((t) => t.id === applied.template.id);
        if (clash && choice !== 'replace') {
          return {
            status: 'failed',
            message: 'A saved template with this identity already exists. Nothing was imported.',
          };
        }
        await saveTemplateToStorage(storage, applied.template);
        return { status: 'ok', template: applied.template };
      } catch (e) {
        return {
          status: 'failed',
          message: `The template could not be added to My Templates (${
            e instanceof Error ? e.message : String(e)
          }). Your saved templates are unchanged.`,
        };
      }
    },
  };
}
