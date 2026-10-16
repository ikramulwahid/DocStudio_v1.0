/**
 * DocStudio — Template factory functions (template schema version 1)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Pure factory functions that produce valid `DocStudioTemplate` instances and
 * their substructures.  They follow the same rules as `src/types/defaults.ts`:
 * • No React, DOM, or Tauri imports (directly testable in Node).
 * • No side-effects — every function returns a NEW object with FRESH IDs; no
 *   mutable array/object is ever shared between two calls, so mutating one
 *   template can never affect another (verification item 12 in verify_p03_m1).
 * • Timestamps are supplied by the caller (or default to `nowISO()`) so tests
 *   can be deterministic.
 *
 * Separation from documents
 * ─────────────────────────
 * These factories create TEMPLATE structure only.  They do NOT create
 * `DocStudioDocument` instances and do not copy content into a document.
 * The full "initialize a new document from a template" flow (deep-copying
 * sections/blocks, merging defaults, stamping document timestamps) is
 * intentionally deferred to P03-M2; the mapping contract used by that flow is
 * documented by `sectionToBlocks()` below.
 *
 * @module types/template-defaults
 */

import type { ContentBlock, ISODateString } from './document';
import type { HeadingBlockData, ParagraphBlockData } from './blocks';
import {
  DOCSTUDIO_TEMPLATE_SCHEMA_VERSION,
  TEMPLATE_FILE_SIGNATURE,
  type DocStudioTemplate,
  type TemplateId,
  type TemplateOrigin,
  type TemplateCategory,
  type TemplateTag,
  type TemplateSection,
  type TemplateReferenceHint,
  type TemplateDocumentDefaults,
  type TemplateAssetBundle,
} from './template';
import { newUUID, nowISO } from './defaults';

// ─────────────────────────────────────────────────────────────────────────────
// Block factories (template starter content)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Create a heading `ContentBlock` for a template section.
 * Uses the SAME `ContentBlock` envelope documents use (stable UUID + spacing),
 * so it can later be deep-copied into a document unchanged.
 */
export function createTemplateHeadingBlock(
  level: 1 | 2 | 3 | 4,
  text: string,
): ContentBlock {
  const data: HeadingBlockData = {
    type: 'heading',
    level,
    text,
    numbered: true,
    hAlign: 'left',
  };
  return { id: newUUID(), spacing: { topPt: 8, bottomPt: 4 }, data };
}

/**
 * Create a paragraph `ContentBlock` for template starter content.
 * The paragraph text is a single plain (non-styled) inline span.
 */
export function createTemplateParagraphBlock(text: string): ContentBlock {
  const data: ParagraphBlockData = {
    type: 'paragraph',
    hAlign: 'justify',
    indentLevel: 0,
    spans: [{ text }],
  };
  return { id: newUUID(), spacing: { topPt: 0, bottomPt: 6 }, data };
}

// ─────────────────────────────────────────────────────────────────────────────
// Section / reference-hint factories
// ─────────────────────────────────────────────────────────────────────────────

/** Create a suggested applicable-reference / clause hint with a fresh ID. */
export function createTemplateReferenceHint(
  label: string,
  value?: string,
  clause?: string,
): TemplateReferenceHint {
  const hint: TemplateReferenceHint = { id: newUUID(), label };
  if (value !== undefined) hint.value = value;
  if (clause !== undefined) hint.clause = clause;
  return hint;
}

/**
 * Create an ordered template section with a fresh ID.
 * `blocks` (if provided) are stored by reference into a NEW array; the caller
 * owns the block objects.  Omitted optional fields are simply absent so the
 * application defaults apply rather than `undefined` leaking in.
 */
export function createTemplateSection(
  name: string,
  opts?: {
    description?: string;
    prompt?: string;
    headingLevel?: 1 | 2 | 3 | 4;
    blocks?: ContentBlock[];
    references?: TemplateReferenceHint[];
  },
): TemplateSection {
  const section: TemplateSection = {
    id: newUUID(),
    name,
    headingLevel: opts?.headingLevel ?? 2,
    blocks: opts?.blocks ? [...opts.blocks] : [],
  };
  if (opts?.description !== undefined) section.description = opts.description;
  if (opts?.prompt !== undefined) section.prompt = opts.prompt;
  if (opts?.references !== undefined) section.references = [...opts.references];
  return section;
}

// ─────────────────────────────────────────────────────────────────────────────
// Root template factory
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Create a valid, empty template with a fresh (or supplied) ID.
 *
 * `origin` determines ID semantics: a `builtin` template should be given a
 * stable readable ID (e.g. `builtin.management-system.quality-manual`) that
 * is immutable across releases, while a `user` template gets a fresh UUID.
 * Passing an explicit `id` overrides the default, but a `builtin` origin with
 * no explicit id still receives a fresh UUID (the caller is expected to supply
 * the stable slug).
 */
export function createDefaultTemplate(opts?: {
  id?: TemplateId;
  origin?: TemplateOrigin;
  name?: string;
  description?: string;
  category?: TemplateCategory;
  tags?: TemplateTag[];
  author?: string;
  createdAt?: ISODateString;
  updatedAt?: ISODateString;
  defaults?: TemplateDocumentDefaults;
  sections?: TemplateSection[];
  assets?: TemplateAssetBundle;
}): DocStudioTemplate {
  const now = opts?.updatedAt ?? opts?.createdAt ?? nowISO();
  return {
    __type: TEMPLATE_FILE_SIGNATURE,
    schemaVersion: DOCSTUDIO_TEMPLATE_SCHEMA_VERSION,
    id: opts?.id ?? newUUID(),
    origin: opts?.origin ?? 'user',
    name: opts?.name ?? 'Untitled Template',
    description: opts?.description ?? '',
    category: opts?.category ?? 'management-system',
    tags: opts?.tags ? [...opts.tags] : [],
    ...(opts?.author !== undefined ? { author: opts.author } : {}),
    createdAt: opts?.createdAt ?? now,
    updatedAt: now,
    ...(opts?.defaults !== undefined ? { defaults: opts.defaults } : {}),
    sections: opts?.sections ? [...opts.sections] : [],
    assets: opts?.assets ? { ...opts.assets } : {},
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Instantiation mapping contract (used by P03-M2)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Flatten ONE template section into the document block sequence it produces.
 *
 * Mapping contract (documented for P03-M2 instantiation):
 *   section  →  [heading block built from `name` + `headingLevel`,
 *                ...section.blocks in order]
 *
 * The returned array always contains a fresh leading heading block followed by
 * shallow copies of the section's block references.  Callers that build a real
 * document MUST deep-copy each block (and its `data`) so the new document can
 * never mutate the source template (see the separation contract in
 * `src/types/template.ts`).
 *
 * This helper does NOT create a document or stamp timestamps; it only
 * demonstrates/encodes the heading-flattening rule so it is testable today and
 * reusable unchanged by P03-M2.
 */
export function sectionToBlocks(section: TemplateSection): ContentBlock[] {
  const heading = createTemplateHeadingBlock(section.headingLevel, section.name);
  return [heading, ...section.blocks];
}

/**
 * Flatten an ordered list of sections into a single document block sequence.
 * Sections are concatenated in order; each contributes its generated heading
 * followed by its own blocks (see `sectionToBlocks`).
 */
export function templateSectionsToBlocks(sections: readonly TemplateSection[]): ContentBlock[] {
  return sections.flatMap((section) => sectionToBlocks(section));
}
