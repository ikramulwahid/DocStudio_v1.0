/**
 * DocStudio — Template Chooser logic (P03-M2)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Pure search/filter/selection rules behind the New-document template chooser.
 * The React dialog (`components/template-chooser/TemplateChooser.tsx`) renders
 * this logic; keeping the rules here makes them directly testable in Node
 * (see verify_p03_m2.mjs) and keeps the UI a thin view.
 *
 * Catalog source of truth
 * ──────────────────────
 * The chooser consumes a caller-supplied list of templates.  For P03-M2 the
 * App passes the built-in catalog (`getBuiltinTemplates()` → the deterministic
 * example SOP from P03-M1).  Local custom-template loading/management does NOT
 * exist yet and is NOT faked here — the chooser only shows templates that are
 * currently available and valid.
 *
 * Blank Document is a first-class pseudo-entry (`BLANK_CHOICE_ID`), so it can
 * be highlighted/selected alongside real templates.
 *
 * Category labels come from the single source of truth
 * (`TEMPLATE_CATEGORIES` / `TEMPLATE_CATEGORY_IDS` in src/types/template.ts);
 * this module never hardcodes a category registry.
 *
 * This module is React/DOM/Tauri-free.
 *
 * @module services/template-chooser
 */

import type { DocStudioTemplate, TemplateCategory } from '../types/template';
import { TEMPLATE_CATEGORY_IDS } from '../types/template';
import { createExampleSopTemplate } from './template-samples';
import { validateTemplate } from './template-file';
import type { DocStudioDocument, ISODateString } from '../types/document';
import type { LabProfile } from '../types/lab-profile';
import { createBlankDocument, instantiateTemplate } from './template-instantiation';

// ─────────────────────────────────────────────────────────────────────────────
// Blank-document pseudo-choice
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Sentinel ID for the "Blank Document" first-class option.  Real templates
 * never use this ID (built-in IDs are `builtin.*`, user IDs are UUIDs).
 */
export const BLANK_CHOICE_ID = 'blank-document';

/** A selectable entry in the chooser: either Blank Document or a template. */
export interface TemplateChoice {
  /** `BLANK_CHOICE_ID` for blank, otherwise the template's stable ID. */
  readonly id: string;
  readonly name: string;
  readonly description: string;
  /** Category label from the single source of truth; undefined for blank. */
  readonly categoryLabel?: string;
  /** Category id (from TEMPLATE_CATEGORY_IDS); undefined for blank. */
  readonly category?: TemplateCategory;
  readonly tags: readonly string[];
  /** The source template for real entries; undefined for blank. */
  readonly template?: DocStudioTemplate;
  /** Ordered section preview (name + description/prompt when present). */
  readonly sections: readonly TemplateSectionPreview[];
}

/** Concise ordered preview of one template section. */
export interface TemplateSectionPreview {
  readonly name: string;
  readonly description?: string;
  readonly prompt?: string;
}

/**
 * The built-in catalog currently offered by the chooser (P03-M2 scope).
 *
 * Only templates that are currently available AND structurally valid are
 * returned — a template failing `validateTemplate` is silently dropped so the
 * chooser never offers a broken entry.  Local custom templates are not loaded
 * or faked here (that feature does not exist yet).
 */
export function getBuiltinTemplates(): DocStudioTemplate[] {
  const candidates: DocStudioTemplate[] = [createExampleSopTemplate()];
  return candidates.filter((template) => {
    try {
      validateTemplate(template);
      return true;
    } catch {
      return false;
    }
  });
}

/** Build a Blank Document pseudo-choice. */
export function createBlankChoice(): TemplateChoice {
  return {
    id: BLANK_CHOICE_ID,
    name: 'Blank Document',
    description: 'Start with an empty document and no starter content.',
    tags: [],
    sections: [],
  };
}

/** Map a template to a selectable chooser entry. */
export function templateToChoice(
  template: DocStudioTemplate,
  categoryLabel: string,
): TemplateChoice {
  return {
    id: template.id,
    name: template.name,
    description: template.description,
    categoryLabel,
    category: template.category,
    tags: [...template.tags],
    template,
    sections: (template.sections ?? []).map((s) => ({
      name: s.name,
      ...(s.description ? { description: s.description } : {}),
      ...(s.prompt ? { prompt: s.prompt } : {}),
    })),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Search + filter
// ─────────────────────────────────────────────────────────────────────────────

/**
 * True when `template` matches the free-text `query` against its name,
 * description or tags (case-insensitive).  An empty/blank query matches all.
 */
export function matchesQuery(template: DocStudioTemplate, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (q === '') return true;
  if (template.name.toLowerCase().includes(q)) return true;
  if (template.description.toLowerCase().includes(q)) return true;
  return template.tags.some((tag) => tag.toLowerCase().includes(q));
}

/**
 * Filter `templates` by free-text query and category.  A `category` of
 * `null`/`undefined` means "All categories" (no category filtering).  The
 * Blank Document pseudo-choice is always available and is NOT filtered out.
 */
export function filterTemplates(
  templates: readonly DocStudioTemplate[],
  query: string,
  category: TemplateCategory | null,
): DocStudioTemplate[] {
  return templates.filter((template) => {
    if (category !== null && category !== undefined && template.category !== category) {
      return false;
    }
    return matchesQuery(template, query);
  });
}

/**
 * Build the ordered chooser entries: Blank Document first, then each template
 * with its category label resolved via `labelFor`.
 */
export function buildChoiceList(
  templates: readonly DocStudioTemplate[],
  labelFor: (category: TemplateCategory) => string,
): TemplateChoice[] {
  const choices: TemplateChoice[] = [createBlankChoice()];
  for (const template of templates) {
    choices.push(templateToChoice(template, labelFor(template.category)));
  }
  return choices;
}

/** True when `id` refers to a category currently present in the valid set. */
export function isKnownCategory(id: string): id is TemplateCategory {
  return (TEMPLATE_CATEGORY_IDS as readonly string[]).includes(id);
}

// ─────────────────────────────────────────────────────────────────────────────
// Selection → guarded replacement (P03-M2 safety contract)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Decide what a confirmed chooser selection does to the active session.
 *
 * Contract (tested in verify_p03_m2.mjs):
 * • `choice === null` (Cancel / Escape / backdrop) → returns `null` WITHOUT
 *   calling `guard`: opening or cancelling the chooser never touches the
 *   active document, file association, fingerprint or session status.
 * • A real choice runs `guard` (the unsaved-change Save/Discard/Cancel
 *   prompt) FIRST.  An aborted guard — user cancels, the save dialog is
 *   cancelled, or the save fails — returns `null`, so the pending document
 *   replacement is aborted and the current document survives.
 * • On success the freshly initialized document (blank or instantiated from
 *   the chosen template, built from `profile` at `now`) is returned.  The
 *   caller then performs the single active-document swap.
 *
 * `guard` and `profile` are injected so this decision logic stays pure and
 * directly testable in Node without React or a test framework.
 */
export async function resolveChooserSelection(
  choice: TemplateChoice | null,
  profile: LabProfile,
  now: ISODateString,
  guard: () => Promise<'proceed' | 'abort'>,
): Promise<DocStudioDocument | null> {
  if (choice === null) return null; // cancelled — guard must NOT run
  let verdict: 'proceed' | 'abort';
  try {
    verdict = await guard();
  } catch {
    return null; // unexpected guard failure — abort, never replace unsafely
  }
  if (verdict === 'abort') return null; // save cancelled/failed — abort
  return choice.id === BLANK_CHOICE_ID || choice.template === undefined
    ? createBlankDocument(profile, now)
    : instantiateTemplate(choice.template, profile, now);
}
