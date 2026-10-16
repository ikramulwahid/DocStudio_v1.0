/**
 * DocStudio — Versioned template data model (P03-M1)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * A template is a REUSABLE STARTING STRUCTURE — it is not an active document
 * and never a live reference to a document instance.  Instantiating a
 * template produces an independent `DocStudioDocument` whose editing cannot
 * mutate the source template (see the separation contract below).
 *
 * Versioning is DELIBERATELY SEPARATE from the native project format:
 * `DOCSTUDIO_TEMPLATE_SCHEMA_VERSION` (currently 1) governs template files
 * only and is independent of `DOCSTUDIO_SCHEMA_VERSION`.  A template change
 * therefore never forces a `.docstudio` document migration.
 *
 * File format
 * ───────────
 * A template file uses the `.dstemplate` extension (a distinct extension that
 * cannot collide with `.docstudio`, whose native dialogs remain filtered to
 * `.docstudio` only) and holds ONE pretty-printed JSON object whose root is a
 * `DocStudioTemplate`.  The `__type: 'DocStudioTemplate'` signature
 * discriminator guarantees a `.docstudio` project (signature `'DocStudio'`)
 * can never be mistaken for a template and vice versa.  Serialization and
 * validation live in `src/services/template-file.ts` (pure, no React/Tauri).
 *
 * Reuse of the document model
 * ───────────────────────────
 * Content is stored as the SAME `ContentBlock` envelope (stable UUID + spacing
 * + `AnyBlockData`) used by documents, and defaults reuse the existing
 * document settings types (`DocumentMetadata`, `EmbeddedLabProfile`,
 * `PageSetup`, `PageTypographySettings`, `FrontPageSettings`,
 * `HeaderFooterSettings`) through `Partial`/`Omit`.  There is NO parallel
 * metadata schema.  Missing template values simply do not exist, so the
 * application's document defaults apply at instantiation rather than an
 * `undefined` leaking into a document.
 *
 * Sections and the instantiation mapping contract
 * ────────────────────────────────────────────────
 * Initial content is modelled as ORDERED, NAMED SECTIONS that each own an
 * ordered list of ordinary `ContentBlock`s plus optional author guidance
 * (`description`, `prompt`) and optional suggested reference/clause hints.
 * Sections are template-level structure, NOT a new content-block type.
 * At instantiation a section FLATTENS into the current document block
 * sequence — a single heading block built from `name` + `headingLevel`,
 * followed by its `blocks` in order (contract helper:
 * `sectionToBlocks()` in `src/types/template-defaults.ts`).  This keeps the
 * active `DocStudioDocument`/`ContentBlock` schema (v1) completely unchanged;
 * P03-M2 builds the full document-initialization flow on top of this contract.
 *
 * Separation contract (future-compatibility)
 * ──────────────────────────────────────────
 * Every ID inside a template (template, section, block, reference hint) is
 * assigned once at creation and is immutable thereafter.  Templates hold no
 * document-instance state (no document `documentId`, no user content, no
 * `createdAt`/`modifiedAt` from `DocumentMetadata`).  Because sections store
 * their own `ContentBlock` objects, P03-M2 instantiation must DEEP-COPY them
 * into the new document so document edits can never reach back into the
 * template.  `defaults.metadata` omits `customFields` because user-defined
 * metadata is document-instance data, not starter structure.
 *
 * Asset contract (documented limitation for P03-M1)
 * ─────────────────────────────────────────────────
 * A template MAY carry an optional `assets` bundle reusing the existing
 * `AssetRecord` shape so a self-contained branding image (e.g. a small logo)
 * can travel with it.  Cross-references are only valid within the template:
 * a `labProfile.logoAssetId` or block `assetId` must resolve to a key in the
 * SAME `assets` bundle.  To avoid duplicating large image payloads in template
 * JSON, built-in templates (P03-M3) will prefer the user's own laboratory
 * logo and keep `assets` empty by default.  Full reusable asset packaging
 * (deduplication, shared asset packs) belongs to a later checkpoint and is
 * explicitly NOT redesigned here.
 *
 * This module is pure (no React/DOM/Tauri imports) so the model and its
 * factories are directly testable in Node (see verify_p03_m1.mjs).
 *
 * @module types/template
 */

import type {
  DocUUID,
  ISODateString,
  DocumentMetadata,
  EmbeddedLabProfile,
  PageSetup,
  PageTypographySettings,
  FrontPageSettings,
  HeaderFooterSettings,
  AssetRecord,
  ContentBlock,
} from './document';

// ─────────────────────────────────────────────────────────────────────────────
// Versioning, signature and extension
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Template schema version — INDEPENDENT of `DOCSTUDIO_SCHEMA_VERSION`.
 *
 * Compatibility policy (mirrors the document format):
 * • version == current  → opened directly.
 * • version >  current  → rejected (`unsupported-version`).
 * • version <  current  → rejected (`no-migration`) until a migration
 *                          module exists.
 */
export const DOCSTUDIO_TEMPLATE_SCHEMA_VERSION = 1 as const;
export type DocStudioTemplateSchemaVersion = typeof DOCSTUDIO_TEMPLATE_SCHEMA_VERSION;

/** Root signature discriminator; prevents cross-contamination with documents. */
export const TEMPLATE_FILE_SIGNATURE = 'DocStudioTemplate' as const;

/** Native template file extension (distinct from `.docstudio`). */
export const TEMPLATE_FILE_EXTENSION = '.dstemplate';

// ─────────────────────────────────────────────────────────────────────────────
// Identity and catalog metadata
// ─────────────────────────────────────────────────────────────────────────────

/** Stable template identifier. */
export type TemplateId = string;

/**
 * Origin of a template.
 * • `builtin` — shipped with DocStudio; its ID is IMMUTABLE and stable
 *   across releases (users may reference it), so built-in IDs use the
 *   readable `builtin.<category>.<slug>` form rather than a random UUID.
 * • `user`    — created by the user; IDs are UUIDs minted by `newUUID()`.
 */
export type TemplateOrigin = 'builtin' | 'user';

/** Prefix reserved for immutable built-in template IDs. */
export const TEMPLATE_BUILTIN_ID_PREFIX = 'builtin.';

/** True when `id` is a reserved built-in identifier (must never be user-minted). */
export function isBuiltinTemplateId(id: string): boolean {
  return id.startsWith(TEMPLATE_BUILTIN_ID_PREFIX);
}

/**
 * The eight principal template categories (project_details.md §11.1–§11.8).
 * Serializable string IDs — trivially filterable and never hardcoded into UI.
 */
export type TemplateCategory =
  | 'management-system'
  | 'technical-procedures'
  | 'sops-work-instructions'
  | 'worksheets-rough-datasheets'
  | 'final-datasheets-technical-records'
  | 'forms-registers-exhibits'
  | 'quality-assurance'
  | 'financial-administrative';

/** Display metadata for each category (labels, not baked into the schema). */
export interface TemplateCategoryInfo {
  readonly id: TemplateCategory;
  /** Human-readable category label. */
  readonly label: string;
  /** One-line description of what the category covers. */
  readonly description: string;
}

/** Ordered list of all supported categories (single source for UI + validation). */
export const TEMPLATE_CATEGORIES: readonly TemplateCategoryInfo[] = [
  { id: 'management-system', label: 'Management-System Documents', description: 'Quality manuals, policies, quality-system procedures, exhibits and annexures.' },
  { id: 'technical-procedures', label: 'Technical Procedures and Methods', description: 'Testing/calibration/sampling procedures, method verification/validation, uncertainty and calculation methods.' },
  { id: 'sops-work-instructions', label: 'Laboratory SOPs and Work Instructions', description: 'Instrument operation, startup/shutdown, maintenance, sample and reagent preparation.' },
  { id: 'worksheets-rough-datasheets', label: 'Worksheets and Rough Datasheets', description: 'Blank observation sheets, raw-data/rough datasheets, instrument logs, replicate tables.' },
  { id: 'final-datasheets-technical-records', label: 'Final Datasheets and Technical Records', description: 'Processed results, calculation sheets, QC results, uncertainty summaries, review worksheets.' },
  { id: 'forms-registers-exhibits', label: 'Forms, Registers, Exhibits and Annexures', description: 'Training/equipment forms, sample-receipt forms, checklists, supporting exhibits and reference tables.' },
  { id: 'quality-assurance', label: 'Quality-Assurance Documents', description: 'Internal-audit checklists, management-review minutes, proficiency-testing records, nonconforming-work and corrective-action forms.' },
  { id: 'financial-administrative', label: 'Financial and Administrative Documents', description: 'Quotations, invoices, purchase requests, expense/budget sheets, cost calculations, correspondence.' },
];

/** The valid category IDs (derived from the ordered list). */
export const TEMPLATE_CATEGORY_IDS: readonly TemplateCategory[] =
  TEMPLATE_CATEGORIES.map((c) => c.id);

/** Searchable template tag (free-form, lower-case by convention). */
export type TemplateTag = string;

// ─────────────────────────────────────────────────────────────────────────────
// Document defaults (reuses the real document settings types)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Starter document metadata.
 *
 * Reuses `DocumentMetadata` as a PARTIAL set (so a template only states the
 * fields it wants to differ from the application defaults) minus the fields
 * that are document-INSTANCE state: `createdAt`/`modifiedAt` are app-managed
 * timestamps and `customFields` are user-defined per-document data.  Nothing
 * here is mandatory — omitted required fields (e.g. `status`, `documentId`)
 * fall back to the application's document defaults at instantiation rather
 * than an `undefined` leaking into a document.
 */
export type TemplateMetadataDefaults = Partial<
  Omit<DocumentMetadata, 'createdAt' | 'modifiedAt' | 'customFields'>
>;

/**
 * Suggested document defaults.  Every sub-object is PARTIAL: a template only
 * states what it wants to differ from the application defaults, and any
 * omitted key lets the corresponding document default apply.  Values are
 * merged (never wholesale-replaced with `undefined`) by the P03-M2
 * instantiation flow.
 */
export interface TemplateDocumentDefaults {
  /** Suggested metadata (title, subtitle, organization, status, …). */
  metadata?: TemplateMetadataDefaults;
  /** Laboratory-profile overrides layered over the user's shared profile. */
  labProfile?: Partial<EmbeddedLabProfile>;
  /** Page size / orientation / margins overrides. */
  pageSetup?: Partial<PageSetup>;
  /** Body theme, monochrome, display-header and typography overrides. */
  pageTypography?: Partial<PageTypographySettings>;
  /** Front-page/cover configuration overrides. */
  frontPage?: Partial<FrontPageSettings>;
  /** Header / footer / watermark configuration overrides. */
  headerFooter?: Partial<HeaderFooterSettings>;
}

// ─────────────────────────────────────────────────────────────────────────────
// Initial content structure
// ─────────────────────────────────────────────────────────────────────────────

/** A suggested applicable-reference / clause hint attached to a section. */
export interface TemplateReferenceHint {
  /** Stable UUID. */
  readonly id: DocUUID;
  /** Field label, e.g. "Applicable standard". */
  label: string;
  /** Suggested value, e.g. "ISO/IEC 17025:2017". */
  value?: string;
  /** Suggested clause/section reference, e.g. "Clause 7.2". */
  clause?: string;
}

/**
 * One named, ordered starter section.
 *
 * `blocks` are ordinary `ContentBlock`s (the SAME envelope documents use) so
 * they can be deep-copied into a document unchanged at instantiation.
 * `headingLevel` is the level of the heading block generated from `name`
 * during flattening (default 2); it does NOT itself create a block here.
 */
export interface TemplateSection {
  /** Stable UUID. */
  readonly id: DocUUID;
  /** Section name — becomes the generated heading text. */
  name: string;
  /** Optional description of the section's purpose (author guidance). */
  description?: string;
  /** Optional author prompt/instruction shown when customizing. */
  prompt?: string;
  /** Heading level used when this section is flattened into a document. */
  headingLevel: 1 | 2 | 3 | 4;
  /** Ordered starter blocks for this section. */
  blocks: ContentBlock[];
  /** Optional suggested applicable references / clause fields. */
  references?: TemplateReferenceHint[];
}

/** Embedded asset bundle (reuses the document `AssetRecord` shape). */
export type TemplateAssetBundle = Record<DocUUID, AssetRecord>;

// ─────────────────────────────────────────────────────────────────────────────
// Root template
// ─────────────────────────────────────────────────────────────────────────────

/** A versioned, serializable DocStudio template (root of a `.dstemplate` file). */
export interface DocStudioTemplate {
  /** Root signature — always `TEMPLATE_FILE_SIGNATURE`. */
  readonly __type: typeof TEMPLATE_FILE_SIGNATURE;
  /** Template schema version (independent of the document schema). */
  readonly schemaVersion: DocStudioTemplateSchemaVersion;
  /** Stable template ID (built-in slug or user UUID). */
  readonly id: TemplateId;
  /** Whether this is an immutable built-in or a user-created template. */
  readonly origin: TemplateOrigin;
  /** Human-readable template name. */
  name: string;
  /** Concise description shown in the chooser. */
  description: string;
  /** Principal category. */
  category: TemplateCategory;
  /** Searchable tags. */
  tags: TemplateTag[];
  /** Optional author/source credit. */
  author?: string;
  /** Creation timestamp (ISO 8601). */
  readonly createdAt: ISODateString;
  /** Last-updated timestamp (ISO 8601). */
  updatedAt: ISODateString;
  /** Optional suggested document defaults. */
  defaults?: TemplateDocumentDefaults;
  /** Ordered starter sections. */
  sections: TemplateSection[];
  /** Optional embedded assets (see the asset contract above). */
  assets: TemplateAssetBundle;
}
