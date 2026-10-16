/**
 * DocStudio — Template section customization (P03-M4)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Pure section-editing rules behind the template chooser's "Customize
 * sections" panel.  The React dialog (`components/template-chooser/
 * TemplateChooser.tsx`) renders this logic; keeping the transformations here
 * makes them directly testable in Node (see verify_p03_m4.mjs) and keeps the
 * UI a thin view.
 *
 * Draft model and isolation contract
 * ───────────────────────────────────
 * A DRAFT is an ordinary `DocStudioTemplate` used as the editable working copy
 * of a selected template.  Every operation in this module follows the same
 * discipline:
 *
 * • The input object is NEVER mutated — success returns a NEW draft
 *   (deep-cloned first, then edited), failure returns the input untouched.
 * • `createTemplateDraft(source)` deep-clones with JSON semantics — exactly
 *   the same transformation `.dstemplate` serialization performs — so a draft
 *   always round-trips through the existing template file validator.
 * • A draft keeps the source's stable `id`, `origin`, `name`, `category`,
 *   `tags`, `defaults`, `assets` and timestamps.  Only SECTIONS change:
 *   renaming preserves the section's ID/blocks/references/heading level,
 *   removing only drops that section, reordering only moves it, and adding
 *   mints one fresh section via the existing `createTemplateSection` factory.
 *   `updatedAt` is deliberately NOT bumped (a draft is not a persisted file).
 * • Section edits are addressed BY SECTION ID, never by array index, so a
 *   stale index can never hit the wrong section.
 *
 * Empty section names are rejected (the shared validator requires a non-empty
 * `name`, which becomes the generated heading).  Optional `description` /
 * `prompt` values are stored verbatim when non-blank and the key is REMOVED
 * when cleared, keeping the draft's JSON shape clean.  Removing the LAST
 * section is allowed: `sections: []` is schema-valid (the shared validator
 * imposes no minimum), the resulting template is still distinct from Blank
 * Document (it keeps its name/defaults), and its document simply starts with
 * no starter blocks.
 *
 * The draft map helpers (`draftFor` / `withDraftResult`) encode how the UI
 * stores drafts per template id: a missing entry falls back to the source
 * (safe — operations deep-copy on write), and a failed operation stores
 * nothing.  Selecting a different template therefore always resolves that
 * template's own draft; edits never carry across templates.
 *
 * This module is React/DOM/Tauri-free.
 *
 * @module services/template-customization
 */

import type { DocStudioTemplate } from '../types/template';
import { createTemplateSection } from '../types/template-defaults';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

/** Per-template-id map of in-progress section drafts (chooser-session state). */
export type TemplateDraftMap = Readonly<Record<string, DocStudioTemplate>>;

/** Deterministic failure codes for section-customization operations. */
export type TemplateCustomizationCode =
  | 'empty-name'
  | 'missing-section'
  | 'duplicate-section-id'
  | 'invalid-heading-level'
  | 'invalid-field'
  | 'out-of-range';

/**
 * Result of one customization operation.
 *
 * `ok: true`  → `draft` is a NEW deep-copied template with the edit applied.
 * `ok: false` → `draft` is the INPUT object, returned untouched; `code` and
 *               `message` explain why the edit was rejected.  Callers may
 *               safely keep using the input and simply surface `message`.
 */
export interface TemplateCustomizationResult {
  readonly ok: boolean;
  readonly draft: DocStudioTemplate;
  readonly code?: TemplateCustomizationCode;
  readonly message?: string;
}

/** Move direction for an ordered-section move. */
export type SectionMoveDirection = 'up' | 'down';

/** Default name given to a newly added section (the user renames it inline). */
export const DEFAULT_NEW_SECTION_NAME = 'New Section';

// ─────────────────────────────────────────────────────────────────────────────
// Internal helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Deep clone with JSON semantics (identical to `.dstemplate` serialization).
 * Templates hold only JSON-safe data, so this never loses information.
 */
function cloneTemplate(template: DocStudioTemplate): DocStudioTemplate {
  return JSON.parse(JSON.stringify(template)) as DocStudioTemplate;
}

function ok(draft: DocStudioTemplate): TemplateCustomizationResult {
  return { ok: true, draft };
}

function fail(
  input: DocStudioTemplate,
  code: TemplateCustomizationCode,
  message: string,
): TemplateCustomizationResult {
  // Failure contract: the caller's object, unchanged.
  return { ok: false, draft: input, code, message };
}

/** True when `value` is a string whose trimmed content is empty. */
function isBlank(value: unknown): boolean {
  return typeof value !== 'string' || value.trim() === '';
}

/**
 * Resolve a section BY ID with deterministic rules:
 * non-string/empty id → `missing-section`; zero matches → `missing-section`;
 * more than one match → `duplicate-section-id` (ambiguous — never guess).
 */
function resolveSectionIndex(
  draft: DocStudioTemplate,
  sectionId: string,
): { index: number } | { code: TemplateCustomizationCode; message: string } {
  if (typeof sectionId !== 'string' || sectionId === '') {
    return { code: 'missing-section', message: 'A section id is required.' };
  }
  const matches: number[] = [];
  draft.sections.forEach((section, index) => {
    if (section && section.id === sectionId) matches.push(index);
  });
  if (matches.length === 0) {
    return { code: 'missing-section', message: 'That section no longer exists in this draft.' };
  }
  if (matches.length > 1) {
    return {
      code: 'duplicate-section-id',
      message: 'This draft contains the same section id more than once.',
    };
  }
  return { index: matches[0] };
}

// ─────────────────────────────────────────────────────────────────────────────
// Draft creation and draft-map helpers (shared with the chooser UI)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Start an independent draft for `source`: a deep clone with identical
 * content.  The source object is never shared with (or reachable from) the
 * returned draft.
 */
export function createTemplateDraft(source: DocStudioTemplate): DocStudioTemplate {
  return cloneTemplate(source);
}

/**
 * Resolve the editable draft for `source` from a draft map.
 * Falls back to `source` itself when no draft exists — safe because every
 * operation in this module deep-copies before editing, so the source can
 * never be mutated through the returned reference.
 */
export function draftFor(
  drafts: TemplateDraftMap,
  source: DocStudioTemplate,
): DocStudioTemplate {
  return drafts[source.id] ?? source;
}

/**
 * Store an operation result in the draft map.  Failed operations store
 * NOTHING (the map keeps its previous entries), so a rejected edit can never
 * replace a good draft with an invalid one.
 */
export function withDraftResult(
  drafts: TemplateDraftMap,
  templateId: string,
  result: TemplateCustomizationResult,
): TemplateDraftMap {
  return result.ok ? { ...drafts, [templateId]: result.draft } : drafts;
}

/**
 * True when `draft` differs from `source` in content (JSON comparison).
 * Used by the UI to offer "Reset to original" only when there is a change.
 */
export function isTemplateDraftModified(
  draft: DocStudioTemplate,
  source: DocStudioTemplate,
): boolean {
  return JSON.stringify(draft) !== JSON.stringify(source);
}

// ─────────────────────────────────────────────────────────────────────────────
// Section operations
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Append a new section to the draft (fresh stable UUID from the existing
 * `createTemplateSection` factory, non-empty default name, heading level 2,
 * no starter blocks).  Optional `description`/`prompt`/`headingLevel` are
 * validated; on any rejection the input draft is returned untouched.
 */
export function addSection(
  draft: DocStudioTemplate,
  name: string = DEFAULT_NEW_SECTION_NAME,
  opts?: {
    description?: string;
    prompt?: string;
    headingLevel?: number;
  },
): TemplateCustomizationResult {
  if (isBlank(name)) {
    return fail(draft, 'empty-name', 'Section name cannot be empty.');
  }
  if (opts?.headingLevel !== undefined) {
    const level = opts.headingLevel;
    if (!Number.isInteger(level) || level < 1 || level > 4) {
      return fail(draft, 'invalid-heading-level', 'Heading level must be 1, 2, 3 or 4.');
    }
  }
  if (opts?.description !== undefined && typeof opts.description !== 'string') {
    return fail(draft, 'invalid-field', 'Description must be text.');
  }
  if (opts?.prompt !== undefined && typeof opts.prompt !== 'string') {
    return fail(draft, 'invalid-field', 'Prompt must be text.');
  }

  const next = cloneTemplate(draft);
  const section = createTemplateSection(name, {
    ...(opts?.description !== undefined ? { description: opts.description } : {}),
    ...(opts?.prompt !== undefined ? { prompt: opts.prompt } : {}),
    ...(opts?.headingLevel !== undefined
      ? { headingLevel: opts.headingLevel as 1 | 2 | 3 | 4 }
      : {}),
  });
  next.sections.push(section);
  return ok(next);
}

/**
 * Rename a section by ID.  Only `name` changes: the section's id, blocks,
 * references, heading level, description, prompt and position are preserved.
 * Empty/whitespace-only names are rejected (they would produce an empty
 * heading and fail the shared validator).  The value is stored verbatim.
 */
export function renameSection(
  draft: DocStudioTemplate,
  sectionId: string,
  name: string,
): TemplateCustomizationResult {
  const resolved = resolveSectionIndex(draft, sectionId);
  if ('code' in resolved) return fail(draft, resolved.code, resolved.message);
  if (isBlank(name)) {
    return fail(draft, 'empty-name', 'Section name cannot be empty.');
  }
  const next = cloneTemplate(draft);
  next.sections[resolved.index].name = name;
  return ok(next);
}

/**
 * Remove one section by ID.  Every other section keeps its id, content and
 * order.  Removing the final remaining section is allowed and yields a valid
 * template with `sections: []` (documented policy — see the module docs).
 */
export function removeSection(
  draft: DocStudioTemplate,
  sectionId: string,
): TemplateCustomizationResult {
  const resolved = resolveSectionIndex(draft, sectionId);
  if ('code' in resolved) return fail(draft, resolved.code, resolved.message);
  const next = cloneTemplate(draft);
  next.sections.splice(resolved.index, 1);
  return ok(next);
}

/**
 * Move a section one position up or down.  Each moved section keeps its id
 * and complete content.  Moving beyond the first/last position is rejected
 * with `out-of-range` and the input draft is returned unchanged.
 */
export function moveSection(
  draft: DocStudioTemplate,
  sectionId: string,
  direction: SectionMoveDirection,
): TemplateCustomizationResult {
  const resolved = resolveSectionIndex(draft, sectionId);
  if ('code' in resolved) return fail(draft, resolved.code, resolved.message);
  const { index } = resolved;
  const lastIndex = draft.sections.length - 1;
  if (direction === 'up' && index === 0) {
    return fail(draft, 'out-of-range', 'This section is already first.');
  }
  if (direction === 'down' && index === lastIndex) {
    return fail(draft, 'out-of-range', 'This section is already last.');
  }
  if (direction !== 'up' && direction !== 'down') {
    return fail(draft, 'invalid-field', 'Move direction must be "up" or "down".');
  }
  const next = cloneTemplate(draft);
  const [moved] = next.sections.splice(index, 1);
  next.sections.splice(direction === 'up' ? index - 1 : index + 1, 0, moved);
  return ok(next);
}

/**
 * Edit a section's optional description by ID.  A blank (empty or
 * whitespace-only) value CLEARS the field by removing the key entirely;
 * any other value is stored verbatim.  Blocks, references and all other
 * fields are untouched.
 */
export function updateSectionDescription(
  draft: DocStudioTemplate,
  sectionId: string,
  description: string,
): TemplateCustomizationResult {
  const resolved = resolveSectionIndex(draft, sectionId);
  if ('code' in resolved) return fail(draft, resolved.code, resolved.message);
  if (typeof description !== 'string') {
    return fail(draft, 'invalid-field', 'Description must be text.');
  }
  const next = cloneTemplate(draft);
  const section = next.sections[resolved.index];
  if (description.trim() === '') delete section.description;
  else section.description = description;
  return ok(next);
}

/**
 * Edit a section's optional author prompt by ID.  Same semantics as
 * `updateSectionDescription`: blank clears the key, anything else is stored
 * verbatim.
 */
export function updateSectionPrompt(
  draft: DocStudioTemplate,
  sectionId: string,
  prompt: string,
): TemplateCustomizationResult {
  const resolved = resolveSectionIndex(draft, sectionId);
  if ('code' in resolved) return fail(draft, resolved.code, resolved.message);
  if (typeof prompt !== 'string') {
    return fail(draft, 'invalid-field', 'Prompt must be text.');
  }
  const next = cloneTemplate(draft);
  const section = next.sections[resolved.index];
  if (prompt.trim() === '') delete section.prompt;
  else section.prompt = prompt;
  return ok(next);
}

/**
 * Set a section's heading level by ID (1–4 integer).  Exposed at the service
 * level as the deterministic rule for invalid heading levels (§5 of the
 * P03-M4 scope); the P03-M4 UI itself does not surface heading-level editing.
 */
export function setSectionHeadingLevel(
  draft: DocStudioTemplate,
  sectionId: string,
  headingLevel: number,
): TemplateCustomizationResult {
  const resolved = resolveSectionIndex(draft, sectionId);
  if ('code' in resolved) return fail(draft, resolved.code, resolved.message);
  if (!Number.isInteger(headingLevel) || headingLevel < 1 || headingLevel > 4) {
    return fail(draft, 'invalid-heading-level', 'Heading level must be 1, 2, 3 or 4.');
  }
  const next = cloneTemplate(draft);
  next.sections[resolved.index].headingLevel = headingLevel as 1 | 2 | 3 | 4;
  return ok(next);
}

// ─────────────────────────────────────────────────────────────────────────────
// Draft lint (deterministic structural rules)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Structural sanity check for a draft's section list.  Returns one code per
 * detected problem (empty array = no issues found):
 *
 * • `missing-section`        — a section id is missing/empty, or a name is
 *                              empty (both fail the shared validator).
 * • `duplicate-section-id`   — the same section id appears more than once.
 * • `invalid-heading-level`  — headingLevel is not an integer 1–4.
 *
 * Envelope rules (types, block shapes, metadata) stay the responsibility of
 * `validateTemplate` in `services/template-file.ts`.
 */
export function findDraftIssues(draft: DocStudioTemplate): TemplateCustomizationCode[] {
  const issues: TemplateCustomizationCode[] = [];
  const seen = new Set<string>();
  for (const section of draft.sections) {
    if (!section || typeof section.id !== 'string' || section.id === '') {
      issues.push('missing-section');
      continue;
    }
    if (seen.has(section.id)) issues.push('duplicate-section-id');
    seen.add(section.id);
    if (isBlank(section.name)) issues.push('empty-name');
    if (!Number.isInteger(section.headingLevel) || section.headingLevel < 1 || section.headingLevel > 4) {
      issues.push('invalid-heading-level');
    }
  }
  return issues;
}
