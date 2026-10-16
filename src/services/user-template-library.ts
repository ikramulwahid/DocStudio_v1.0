/**
 * DocStudio — User-template library policies (P03-M5)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Pure identity, cloning, conflict and load/store rules behind the persistent
 * "My Templates" library.  The Tauri adapter (`services/user-template-
 * storage.ts`) and the dialog orchestration (`services/template-persistence.ts`)
 * sit on top of this module; keeping the rules here makes them directly
 * testable in Node (see verify_p03_m5.mjs) with a temporary-directory storage
 * adapter instead of a real user's application-data files.
 *
 * Storage contract (adapter interface below)
 * ───────────────────────────────────────────
 * One `.dstemplate` file per stored template, named from the template's
 * stable id.  The stored representation IS the existing `.dstemplate`
 * serialization (`serializeTemplate`) — there is no second JSON format.
 * `write` must atomically replace a same-named file or leave the prior
 * content intact on failure, so a failed save can never truncate or remove a
 * previously valid template.  An absent directory is an EMPTY library, not an
 * error (the adapter creates it lazily via `ensureDirectory`).
 *
 * Identity rules (isolation contract)
 * ───────────────────────────────────
 * • Saving a built-in template (or its customized draft) ALWAYS produces a
 *   separate user copy: fresh UUID id, `origin: 'user'`, its own
 *   `createdAt`/`updatedAt`.  The canonical built-in is never touched, and a
 *   stored user template can never carry the reserved `builtin.` id prefix
 *   (the shared validator enforces this too).
 * • Updating an existing user template preserves its `id` and `createdAt`
 *   and stamps a new `updatedAt`; a draft with a different id is REJECTED
 *   (`id-mismatch`) rather than silently changing identity.
 * • Importing a `.dstemplate` file normalizes built-in identity/origin to a
 *   fresh user identity, so an imported file can never override or impersonate
 *   a canonical built-in.
 *
 * Conflict and dedup policy (documented, deterministic)
 * ─────────────────────────────────────────────────────
 * `planImport` classifies an incoming template against the current library:
 * • `duplicate` — an entry exists with identical CONTENT (fingerprint =
 *   content without id/origin/timestamps).  Re-importing the same exported
 *   file is therefore a no-op, so reopening the same file never creates
 *   unbounded duplicates.
 * • `conflict`   — an entry exists with the same id but different content.
 *   Never overwritten silently: the caller must choose `replace` (preserve
 *   the stored id/createdAt, new content + `updatedAt`), `copy` (fresh user
 *   identity), or cancel.
 * • `new`        — safe to add as-is (identity already normalized).
 *
 * Load rules: files are read in sorted filename order; a corrupt, unreadable
 * or non-template file produces a WARNING and is SKIPPED (never deleted);
 * duplicate ids across files keep the first (sorted) entry and warn about the
 * rest; built-in-identity leftovers from outside DocStudio are skipped with a
 * warning and never surfaced as user templates.
 *
 * This module is React/DOM/Tauri-free.
 *
 * @module services/user-template-library
 */

import type { DocStudioTemplate } from '../types/template';
import type { ISODateString } from '../types/document';
import { TEMPLATE_FILE_EXTENSION, isBuiltinTemplateId } from '../types/template';
import { newUUID } from '../types/defaults';
import {
  deserializeTemplate,
  serializeTemplate,
  validateTemplate,
  TemplateFileError,
} from './template-file';

// ─────────────────────────────────────────────────────────────────────────────
// Storage adapter contract
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Minimal async storage surface the library needs.  The real adapter is
 * `services/user-template-storage.ts` (Tauri fs, app-local directory); tests
 * supply a temporary-directory implementation with the same semantics.
 *
 * Contract:
 * • `ensureDirectory` is idempotent and creates the store when absent.
 * • `list` returns FILE names (with extension) only.
 * • `read`/`write`/`remove` address files by name inside the store.
 * • `write` atomically replaces same-named content or leaves it intact.
 */
export interface UserTemplateStorage {
  ensureDirectory(): Promise<void>;
  list(): Promise<string[]>;
  read(name: string): Promise<string>;
  write(name: string, text: string): Promise<void>;
  remove(name: string): Promise<void>;
}

// ─────────────────────────────────────────────────────────────────────────────
// Errors
// ─────────────────────────────────────────────────────────────────────────────

export type UserTemplateErrorCode =
  | 'empty-name' // save name is empty/whitespace-only
  | 'invalid-template' // the produced template fails the shared validator
  | 'id-mismatch' // update draft does not carry the stored template's id
  | 'builtin-identity' // attempt to store/replace built-in identity
  | 'io-read' // storage read failure
  | 'io-write'; // storage write failure

/** Explicit error type for every user-template failure mode. */
export class UserTemplateError extends Error {
  readonly code: UserTemplateErrorCode;

  constructor(code: UserTemplateErrorCode, message: string) {
    super(message);
    this.name = 'UserTemplateError';
    this.code = code;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Small helpers
// ─────────────────────────────────────────────────────────────────────────────

/** Deep clone with JSON semantics (identical to `.dstemplate` serialization). */
function cloneTemplate(template: DocStudioTemplate): DocStudioTemplate {
  return JSON.parse(JSON.stringify(template)) as DocStudioTemplate;
}

/**
 * Build the store filename for a template id: the id with characters that
 * are illegal in Windows filenames replaced, plus the `.dstemplate`
 * extension.  User ids are UUIDs (already filename-safe); the sanitizing is
 * defensive so a hand-edited file can never escape the store directory.
 */
export function userTemplateFileName(templateId: string): string {
  const safe =
    templateId
      .trim()
      .replace(/[\\/:*?"<>|]/g, '-')
      .slice(0, 120)
      .trim() || 'template';
  return `${safe}${TEMPLATE_FILE_EXTENSION}`;
}

/** True when `template` is stored in (or eligible for) the user library. */
export function isUserTemplate(template: DocStudioTemplate): boolean {
  return template.origin === 'user' && !isBuiltinTemplateId(template.id);
}

// ─────────────────────────────────────────────────────────────────────────────
// Identity: save-as-new and explicit update
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Create a NEW user template from `source` (a built-in, a built-in's
 * customized draft, or an existing user template for "save a copy").
 *
 * • Content (sections, prompts, defaults, assets, tags, category,
 *   description, author) is preserved through a deep copy.
 * • Identity is fresh: `id = newUUID()`, `origin: 'user'`,
 *   `createdAt = updatedAt = now`, and `name` is the trimmed save name.
 * • The result always passes the shared `validateTemplate` (invalid sources
 *   are rejected as `invalid-template`, never written).
 * • The source object is never mutated.
 */
export function createUserTemplateFrom(
  source: DocStudioTemplate,
  name: string,
  now: ISODateString,
): DocStudioTemplate {
  if (typeof name !== 'string' || name.trim() === '') {
    throw new UserTemplateError('empty-name', 'Template name cannot be empty.');
  }
  const next: DocStudioTemplate = {
    ...cloneTemplate(source),
    id: newUUID(),
    origin: 'user',
    name: name.trim(),
    createdAt: now,
    updatedAt: now,
  };
  assertStorable(next);
  return next;
}

/**
 * Produce the next stored version of an existing user template from an
 * edited `draft`:
 *
 * • `id` and `createdAt` are taken from `stored` — updating never changes
 *   identity or creation time; `updatedAt` is stamped with `now`.
 * • `draft.id` must equal `stored.id` (edits address the template by
 *   identity); anything else is rejected with `id-mismatch`.
 * • Only `origin: 'user'` templates with a non-built-in id can be updated
 *   (`builtin-identity` otherwise), so the canonical catalog can never be
 *   overwritten through this path.
 */
export function updateUserTemplate(
  stored: DocStudioTemplate,
  draft: DocStudioTemplate,
  now: ISODateString,
): DocStudioTemplate {
  if (!isUserTemplate(stored)) {
    throw new UserTemplateError(
      'builtin-identity',
      'Built-in templates cannot be overwritten — save a user copy instead.',
    );
  }
  if (!draft || draft.id !== stored.id) {
    throw new UserTemplateError(
      'id-mismatch',
      'This edit no longer matches the saved template it belongs to.',
    );
  }
  const next: DocStudioTemplate = {
    ...cloneTemplate(draft),
    id: stored.id,
    origin: 'user',
    createdAt: stored.createdAt,
    updatedAt: now,
  };
  assertStorable(next);
  return next;
}

/** Validate a candidate user template, mapping failures to UserTemplateError. */
function assertStorable(template: DocStudioTemplate): void {
  try {
    validateTemplate(template);
  } catch (e) {
    throw new UserTemplateError(
      'invalid-template',
      e instanceof TemplateFileError
        ? e.message
        : 'This template is not valid and cannot be stored.',
    );
  }
  if (!isUserTemplate(template)) {
    throw new UserTemplateError(
      'builtin-identity',
      'A stored template must use a user identity — built-in ids are reserved.',
    );
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Import: normalization, fingerprint, conflict planning
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Content fingerprint: the template's JSON minus identity and timestamps
 * (`id`, `origin`, `createdAt`, `updatedAt`).  Two templates with the same
 * fingerprint are the SAME template content-wise, whatever their identity.
 */
export function templateContentFingerprint(template: DocStudioTemplate): string {
  const clone = cloneTemplate(template) as unknown as Record<string, unknown>;
  delete clone['id'];
  delete clone['origin'];
  delete clone['createdAt'];
  delete clone['updatedAt'];
  return JSON.stringify(clone);
}

/**
 * Normalize an imported template to a valid USER identity:
 *
 * • Already a user template (non-built-in id) → returned unchanged (deep
 *   copy, timestamps preserved).
 * • Built-in identity or origin (e.g. a hand-copied built-in file) → fresh
 *   UUID id, `origin: 'user'`, timestamps set to `now`.  Content is
 *   preserved; the canonical built-in itself is never affected.
 */
export function normalizeImportedTemplate(
  imported: DocStudioTemplate,
  now: ISODateString,
): DocStudioTemplate {
  if (isUserTemplate(imported)) return cloneTemplate(imported);
  const next: DocStudioTemplate = {
    ...cloneTemplate(imported),
    id: newUUID(),
    origin: 'user',
    createdAt: now,
    updatedAt: now,
  };
  assertStorable(next);
  return next;
}

/** Classification of an incoming import against the current library. */
export type ImportPlan =
  | { readonly kind: 'new'; readonly template: DocStudioTemplate }
  | {
      readonly kind: 'duplicate';
      readonly template: DocStudioTemplate;
      readonly existingId: string;
      readonly existingName: string;
    }
  | {
      readonly kind: 'conflict';
      readonly incoming: DocStudioTemplate;
      readonly existing: DocStudioTemplate;
    };

/**
 * Classify `importedRaw` (validated template text already parsed by the
 * caller) against the current user library.  Normalization runs first, so a
 * built-in-flavoured import never matches a built-in (built-ins are not part
 * of `existing`) and always arrives with user identity.
 */
export function planImport(
  existing: readonly DocStudioTemplate[],
  importedRaw: DocStudioTemplate,
  now: ISODateString,
): ImportPlan {
  const normalized = normalizeImportedTemplate(importedRaw, now);
  const fingerprint = templateContentFingerprint(normalized);
  const duplicate = existing.find((t) => templateContentFingerprint(t) === fingerprint);
  if (duplicate) {
    return {
      kind: 'duplicate',
      template: normalized,
      existingId: duplicate.id,
      existingName: duplicate.name,
    };
  }
  const clash = existing.find((t) => t.id === normalized.id);
  if (clash) {
    return { kind: 'conflict', incoming: normalized, existing: clash };
  }
  return { kind: 'new', template: normalized };
}

/** How the caller resolves a `conflict` plan (never applied silently). */
export type ImportConflictChoice = 'replace' | 'copy' | 'cancel';

/**
 * Full choice vocabulary for applying an import plan: the conflict choices
 * plus `'add'`, which is the natural no-op choice for a `new` plan (ignored
 * for other kinds — a conflict can never be applied without an explicit
 * replace/copy).
 */
export type ImportChoice = ImportConflictChoice | 'add';

/** Result of applying an import plan: an updated template, or nothing. */
export type ImportApplyResult =
  | { readonly status: 'ok'; readonly template: DocStudioTemplate }
  | { readonly status: 'cancelled' }
  | { readonly status: 'noop' }; // duplicate plan — nothing to apply

/**
 * Resolve an import plan into the template that should be stored:
 * • `new`      → the normalized template as-is.
 * • `conflict` + `replace` → stored id/createdAt preserved, incoming
 *   content, new `updatedAt` (explicit replacement).
 * • `conflict` + `copy`    → a fresh user identity with the incoming
 *   content (both entries can coexist).
 * • `conflict` + `cancel`  → nothing changes.
 * • `duplicate` → `noop` (already in the library).
 */
export function applyImportPlan(
  plan: ImportPlan,
  choice: ImportChoice,
  now: ISODateString,
): ImportApplyResult {
  if (plan.kind === 'duplicate') return { status: 'noop' };
  if (plan.kind === 'new') return { status: 'ok', template: plan.template };
  if (choice === 'cancel') return { status: 'cancelled' };
  if (choice === 'replace') {
    return { status: 'ok', template: updateUserTemplate(plan.existing, plan.incoming, now) };
  }
  if (choice === 'copy') {
    return { status: 'ok', template: createUserTemplateFrom(plan.incoming, plan.incoming.name, now) };
  }
  return { status: 'cancelled' };
}

// ─────────────────────────────────────────────────────────────────────────────
// Store I/O: save and load
// ─────────────────────────────────────────────────────────────────────────────

/** One non-fatal load problem (the offending file is never deleted). */
export interface UserLibraryWarning {
  /** The store file the warning refers to, when known. */
  readonly fileName?: string;
  readonly message: string;
}

/** Result of loading the persistent user library. */
export interface UserLibraryLoadResult {
  readonly templates: DocStudioTemplate[];
  readonly warnings: UserLibraryWarning[];
}

/**
 * Serialize `template` (validated) and write it into the store under its id.
 * The adapter's atomic-write contract means a failure here leaves any
 * previously stored version of the file intact.
 */
export async function saveTemplateToStorage(
  storage: UserTemplateStorage,
  template: DocStudioTemplate,
): Promise<void> {
  const text = serializeTemplate(template); // validates first — never writes invalid
  try {
    await storage.ensureDirectory();
    await storage.write(userTemplateFileName(template.id), text);
  } catch (e) {
    throw new UserTemplateError(
      'io-write',
      `The template could not be written to the My Templates folder (${
        e instanceof Error ? e.message : String(e)
      }).`,
    );
  }
}

/**
 * Load every stored user template.
 *
 * An absent/empty directory is an EMPTY library with no warnings.  Files are
 * processed in sorted filename order; a corrupt, unreadable or non-template
 * file yields a warning and is SKIPPED — one bad file never crashes the
 * chooser, never loses the other valid entries, and is never deleted.  Stored
 * files that claim built-in identity are skipped with a warning (they can
 * never shadow the canonical catalog).  Duplicate ids across files keep the
 * first entry and warn about the rest.
 */
export async function loadUserTemplates(
  storage: UserTemplateStorage,
): Promise<UserLibraryLoadResult> {
  const warnings: UserLibraryWarning[] = [];
  try {
    await storage.ensureDirectory();
  } catch (e) {
    return {
      templates: [],
      warnings: [
        {
          message: `Your My Templates folder could not be opened (${
            e instanceof Error ? e.message : String(e)
          }). Saved templates are unavailable right now; nothing was changed.`,
        },
      ],
    };
  }

  let names: string[];
  try {
    names = await storage.list();
  } catch (e) {
    return {
      templates: [],
      warnings: [
        {
          message: `Your My Templates folder could not be listed (${
            e instanceof Error ? e.message : String(e)
          }). Saved templates are unavailable right now; nothing was changed.`,
        },
      ],
    };
  }

  const files = names
    .filter((n) => typeof n === 'string' && n.toLowerCase().endsWith(TEMPLATE_FILE_EXTENSION))
    .sort();

  const templates: DocStudioTemplate[] = [];
  const seenIds = new Set<string>();
  for (const fileName of files) {
    let text: string;
    try {
      text = await storage.read(fileName);
    } catch (e) {
      warnings.push({
        fileName,
        message: `"${fileName}" could not be read and was skipped. It is still on disk — nothing was deleted.`,
        // detail available via e; message stays user-facing
      });
      void e;
      continue;
    }
    let template: DocStudioTemplate;
    try {
      template = deserializeTemplate(text);
    } catch (e) {
      warnings.push({
        fileName,
        message: `"${fileName}" is not a valid DocStudio template and was skipped (${
          e instanceof TemplateFileError ? e.message : 'unreadable contents'
        }). It is still on disk — nothing was deleted.`,
      });
      continue;
    }
    if (!isUserTemplate(template)) {
      warnings.push({
        fileName,
        message: `"${fileName}" claims a built-in template identity, which stored templates cannot use, and was skipped. It is still on disk — nothing was deleted.`,
      });
      continue;
    }
    if (seenIds.has(template.id)) {
      warnings.push({
        fileName,
        message: `"${fileName}" duplicates the id of an already loaded saved template and was skipped.`,
      });
      continue;
    }
    seenIds.add(template.id);
    templates.push(template);
  }
  return { templates, warnings };
}
