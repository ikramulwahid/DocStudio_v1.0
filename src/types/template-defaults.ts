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

import type { ContentBlock, ISODateString, HAlignment } from './document';
import type {
  HeadingBlockData,
  ParagraphBlockData,
  CalloutBlockData,
  CalloutVariant,
  ListBlockData,
  ListType,
  BulletStyle,
  NumberStyle,
  TableBlockData,
  TableHeaderStyle,
  TableRow,
  SignatureBlockData,
  EquipmentListBlockData,
  ProcedureStepBlockData,
  ProcedureStepLevel,
  ObservationBlockData,
  MeasurementBlockData,
  AcceptanceCriteriaBlockData,
  CriteriaResult,
  CalculationBlockData,
} from './blocks';
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

/**
 * Create a callout/admonition `ContentBlock` (info/warning/note/…).
 * `text` becomes a single plain span; `title` (optional) renders above it.
 */
export function createTemplateCalloutBlock(
  variant: CalloutVariant,
  text: string,
  opts?: { title?: string },
): ContentBlock {
  const data: CalloutBlockData = {
    type: 'callout',
    variant,
    spans: [{ text }],
    ...(opts?.title !== undefined ? { title: opts.title } : {}),
  };
  return { id: newUUID(), spacing: { topPt: 4, bottomPt: 6 }, data };
}

/**
 * Create a list `ContentBlock` from plain item strings.
 * For `checklist` items the starter state is unchecked (`checked: false`);
 * for other list types the flag is simply absent (see `ListItem`).
 */
export function createTemplateListBlock(
  items: readonly string[],
  opts?: {
    listType?: ListType;
    bulletStyle?: BulletStyle;
    numberStyle?: NumberStyle;
    depth?: number;
  },
): ContentBlock {
  const listType = opts?.listType ?? 'bullet';
  const depth = opts?.depth ?? 0;
  const data: ListBlockData = {
    type: 'list',
    listType,
    bulletStyle: opts?.bulletStyle ?? 'disc',
    numberStyle: opts?.numberStyle ?? 'decimal',
    items: items.map((text) => ({
      id: newUUID(),
      spans: [{ text }],
      depth,
      ...(listType === 'checklist' ? { checked: false } : {}),
    })),
  };
  return { id: newUUID(), spacing: { topPt: 0, bottomPt: 6 }, data };
}

/**
 * Create a table `ContentBlock`.
 *
 * `headers` becomes the styled header row (when non-empty); `rows` are body
 * rows of cell strings.  Rows shorter than the header are padded with empty
 * cells (handwriting-friendly starter tables), so callers may pass sparse rows.
 * An empty `headers` array produces a headerless table (`hasHeaderRow: false`).
 */
export function createTemplateTableBlock(
  headers: readonly string[],
  rows: readonly (readonly string[])[],
  opts?: {
    caption?: string;
    headerStyle?: TableHeaderStyle;
    bodyAlign?: HAlignment;
  },
): ContentBlock {
  const columnCount = Math.max(headers.length, ...rows.map((r) => r.length), 0);
  const makeRow = (cells: readonly string[], isHeader: boolean): TableRow => ({
    id: newUUID(),
    cells: Array.from({ length: columnCount }, (_, i) => ({
      id: newUUID(),
      spans: [{ text: cells[i] ?? '' }],
      hAlign: isHeader ? 'center' : (opts?.bodyAlign ?? 'left'),
      colSpan: 1,
      rowSpan: 1,
      isHeader,
    })),
  });
  const tableRows: TableRow[] = [];
  if (headers.length > 0) tableRows.push(makeRow(headers, true));
  for (const row of rows) tableRows.push(makeRow(row, false));
  const data: TableBlockData = {
    type: 'table',
    rows: tableRows,
    hasHeaderRow: headers.length > 0,
    headerStyle: opts?.headerStyle ?? 'light',
    ...(opts?.caption !== undefined ? { caption: opts.caption } : {}),
  };
  return { id: newUUID(), spacing: { topPt: 4, bottomPt: 6 }, data };
}

/**
 * Create a signature `ContentBlock` with 1–3 signers (schema contract in
 * `SignatureBlockData`).  Each starter signer must supply at least a `name`
 * or `designation`; template callers normally pass a `designation`
 * placeholder so the field stays clearly a blank to complete.
 * Throws on an out-of-range signer count so an authoring mistake is caught
 * when the catalog is built rather than silently shipped.
 */
export function createTemplateSignatureBlock(
  signers: readonly {
    role: string;
    name?: string;
    designation?: string;
    department?: string;
  }[],
  opts?: { hAlign?: HAlignment },
): ContentBlock {
  if (signers.length < 1 || signers.length > 3) {
    throw new RangeError(
      `Signature block supports 1–3 signers; received ${signers.length}.`,
    );
  }
  const data: SignatureBlockData = {
    type: 'signature',
    hAlign: opts?.hAlign ?? 'left',
    signers: signers.map((s) => ({
      id: newUUID(),
      role: s.role,
      ...(s.name !== undefined ? { name: s.name } : {}),
      ...(s.designation !== undefined ? { designation: s.designation } : {}),
      ...(s.department !== undefined ? { department: s.department } : {}),
    })),
  };
  return { id: newUUID(), spacing: { topPt: 8, bottomPt: 6 }, data };
}

// ── Laboratory-oriented block factories (used by the P03-M3 library) ─────────

/** Create an equipment-list `ContentBlock` from plain item descriptions. */
export function createTemplateEquipmentListBlock(
  items: readonly {
    name: string;
    assetTag?: string;
    manufacturer?: string;
    modelNumber?: string;
    calibrationDue?: string;
    mandatory?: boolean;
  }[],
  opts?: { title?: string },
): ContentBlock {
  const data: EquipmentListBlockData = {
    type: 'equipment-list',
    items: items.map((item) => ({
      id: newUUID(),
      name: item.name,
      ...(item.assetTag !== undefined ? { assetTag: item.assetTag } : {}),
      ...(item.manufacturer !== undefined ? { manufacturer: item.manufacturer } : {}),
      ...(item.modelNumber !== undefined ? { modelNumber: item.modelNumber } : {}),
      ...(item.calibrationDue !== undefined ? { calibrationDue: item.calibrationDue } : {}),
      mandatory: item.mandatory ?? true,
    })),
    ...(opts?.title !== undefined ? { title: opts.title } : {}),
  };
  return { id: newUUID(), spacing: { topPt: 4, bottomPt: 6 }, data };
}

/**
 * Create a procedure-step `ContentBlock`.
 * `stepNumber` is left to the caller/renderer (optional in the schema);
 * steps default to `level: 'main'`.
 */
export function createTemplateProcedureStepsBlock(
  steps: readonly { text: string; level?: ProcedureStepLevel; stepNumber?: string }[],
  opts?: { sectionTitle?: string },
): ContentBlock {
  const data: ProcedureStepBlockData = {
    type: 'procedure-step',
    steps: steps.map((step) => ({
      id: newUUID(),
      level: step.level ?? 'main',
      spans: [{ text: step.text }],
      ...(step.stepNumber !== undefined ? { stepNumber: step.stepNumber } : {}),
    })),
    ...(opts?.sectionTitle !== undefined ? { sectionTitle: opts.sectionTitle } : {}),
  };
  return { id: newUUID(), spacing: { topPt: 4, bottomPt: 6 }, data };
}

/** Create an observation table `ContentBlock` (parameter / value / remarks). */
export function createTemplateObservationBlock(
  rows: readonly { parameter: string; observedValue?: string; remarks?: string }[],
  opts?: { title?: string },
): ContentBlock {
  const data: ObservationBlockData = {
    type: 'observation',
    rows: rows.map((row) => ({
      id: newUUID(),
      parameter: row.parameter,
      observedValue: row.observedValue ?? '',
      ...(row.remarks !== undefined ? { remarks: row.remarks } : {}),
    })),
    ...(opts?.title !== undefined ? { title: opts.title } : {}),
  };
  return { id: newUUID(), spacing: { topPt: 4, bottomPt: 6 }, data };
}

/**
 * Create a measurement/data-table `ContentBlock`.
 * Each `rows` entry is an array of cell strings aligned to `columns`;
 * short rows are padded with empty cells (starter tables are handwriting-
 * friendly and may legitimately be blank).
 */
export function createTemplateMeasurementBlock(
  columns: readonly { header: string; unit?: string }[],
  rows: readonly (readonly string[])[],
  opts?: { title?: string; uncertaintyNote?: string },
): ContentBlock {
  const cols = columns.map((column) => ({
    id: newUUID(),
    header: column.header,
    ...(column.unit !== undefined ? { unit: column.unit } : {}),
  }));
  const data: MeasurementBlockData = {
    type: 'measurement',
    columns: cols,
    rows: rows.map((row) => ({
      id: newUUID(),
      values: cols.reduce<Record<string, string>>((acc, col, i) => {
        acc[col.id] = row[i] ?? '';
        return acc;
      }, {}),
    })),
    ...(opts?.title !== undefined ? { title: opts.title } : {}),
    ...(opts?.uncertaintyNote !== undefined ? { uncertaintyNote: opts.uncertaintyNote } : {}),
  };
  return { id: newUUID(), spacing: { topPt: 4, bottomPt: 6 }, data };
}

/** Create an acceptance-criteria `ContentBlock` (result defaults to `pending`). */
export function createTemplateAcceptanceCriteriaBlock(
  criteria: readonly {
    criterion: string;
    specification: string;
    measuredValue?: string;
    result?: CriteriaResult;
    remarks?: string;
  }[],
  opts?: { title?: string; overallResult?: CriteriaResult },
): ContentBlock {
  const data: AcceptanceCriteriaBlockData = {
    type: 'acceptance-criteria',
    criteria: criteria.map((criterion) => ({
      id: newUUID(),
      criterion: criterion.criterion,
      specification: criterion.specification,
      result: criterion.result ?? 'pending',
      ...(criterion.measuredValue !== undefined ? { measuredValue: criterion.measuredValue } : {}),
      ...(criterion.remarks !== undefined ? { remarks: criterion.remarks } : {}),
    })),
    ...(opts?.title !== undefined ? { title: opts.title } : {}),
    ...(opts?.overallResult !== undefined ? { overallResult: opts.overallResult } : {}),
  };
  return { id: newUUID(), spacing: { topPt: 4, bottomPt: 6 }, data };
}

/** Create a calculation `ContentBlock` from formula steps (LaTeX strings). */
export function createTemplateCalculationBlock(
  steps: readonly {
    label?: string;
    latex: string;
    substitution?: string;
    result?: string;
    note?: string;
  }[],
  opts?: { title?: string; conclusionText?: string },
): ContentBlock {
  const data: CalculationBlockData = {
    type: 'calculation',
    steps: steps.map((step) => ({
      id: newUUID(),
      latex: step.latex,
      ...(step.label !== undefined ? { label: step.label } : {}),
      ...(step.substitution !== undefined ? { substitution: step.substitution } : {}),
      ...(step.result !== undefined ? { result: step.result } : {}),
      ...(step.note !== undefined ? { note: step.note } : {}),
    })),
    ...(opts?.title !== undefined ? { title: opts.title } : {}),
    ...(opts?.conclusionText !== undefined ? { conclusionText: opts.conclusionText } : {}),
  };
  return { id: newUUID(), spacing: { topPt: 4, bottomPt: 6 }, data };
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
