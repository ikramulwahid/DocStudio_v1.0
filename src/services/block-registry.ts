/**
 * DocStudio — Typed content-block registry (P05-M1)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * The single authoritative registry describing every block type the editor
 * can insert (project_details.md §5.4 / §10, roadmap §5.1):
 *
 * • Stable block-type identifier (the `AnyBlockData` discriminant).
 * • User-facing display name and short description.
 * • Icon from the application's existing icon system (compile-time checked).
 * • Insertion-menu category grouping.
 * • A default-block factory producing a fresh, schema-valid `ContentBlock`
 *   (envelope + type-specific data + default spacing).
 * • A structural summary used by the editor's read-only block cards.
 *
 * Rules
 * ─────
 * • No React, DOM or Tauri runtime imports (the `IconName` import is
 *   type-only and fully erased at compile time), so the registry is
 *   directly testable in Node (verify_p05_m1.mjs).
 * • Exhaustive: `BLOCK_REGISTRY` is typed as a map over `BlockType`, so a
 *   new member of the `AnyBlockData` union / `BLOCK_TYPES` fails to compile
 *   until it receives a registry entry AND a default factory.
 * • Block-specific data shapes stay in `src/types/blocks.ts` — they are
 *   never duplicated here.  Every factory result must carry
 *   `data.type === entry.type`; `createBlock` (block-actions) enforces the
 *   invariant at runtime and verify_p05_m1 asserts it for all types.
 *
 * @module block-registry
 */

import type { IconName } from '../components/common/Icon';
import type { AnyBlockData, BlockType } from '../types/blocks';
import { BLOCK_TYPES } from '../types/blocks';
import type { ContentBlock } from '../types/document';
import { newUUID } from '../types/defaults';
import {
  createTemplateAcceptanceCriteriaBlock,
  createTemplateCalculationBlock,
  createTemplateCalloutBlock,
  createTemplateEquipmentListBlock,
  createTemplateHeadingBlock,
  createTemplateListBlock,
  createTemplateMeasurementBlock,
  createTemplateObservationBlock,
  createTemplateParagraphBlock,
  createTemplateProcedureStepsBlock,
  createTemplateSignatureBlock,
  createTemplateTableBlock,
} from '../types/template-defaults';

// ─────────────────────────────────────────────────────────────────────────────
// Insertion-menu categories
// ─────────────────────────────────────────────────────────────────────────────

/** Grouping used by the editor's block insertion menu. */
export type BlockCategoryId = 'text' | 'callouts-lists' | 'data' | 'media' | 'lab' | 'layout';

export interface BlockCategory {
  readonly id: BlockCategoryId;
  readonly label: string;
}

/** Category order for the insertion menu (optgroups render in this order). */
export const BLOCK_CATEGORIES: readonly BlockCategory[] = [
  { id: 'text', label: 'Text' },
  { id: 'callouts-lists', label: 'Callouts & Lists' },
  { id: 'data', label: 'Tables & Data' },
  { id: 'media', label: 'Media' },
  { id: 'lab', label: 'Laboratory (ISO/IEC 17025)' },
  { id: 'layout', label: 'Page Layout' },
];

// ─────────────────────────────────────────────────────────────────────────────
// Registry entry shape
// ─────────────────────────────────────────────────────────────────────────────

export interface BlockRegistryEntry {
  /** The stable block-type identifier (must equal `createDefault().data.type`). */
  readonly type: BlockType;
  /** User-facing block name shown in menus and block cards. */
  readonly displayName: string;
  /** One-line description of what the block is for. */
  readonly description: string;
  /** Icon name from the existing `Icon` component. */
  readonly icon: IconName;
  /** Insertion-menu category grouping. */
  readonly category: BlockCategoryId;
  /**
   * Fresh, schema-valid default block for insertion: new stable envelope ID,
   * schema-valid type-specific data and valid default spacing (≥ 0 pt).
   * Factory results are validated against `type` by `createBlock`.
   */
  readonly createDefault: () => ContentBlock;
}

/** Every `BlockType` must map to a complete registry entry (compile-time). */
type BlockRegistryMap = { readonly [K in BlockType]: BlockRegistryEntry };

// ─────────────────────────────────────────────────────────────────────────────
// The registry
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Central block-type metadata + default factories.
 *
 * Every registered type is insertable in P05-M1; the content editors
 * arrived with P05-M2 (headings/paragraphs) and P05-M3
 * (lists/callouts); the table editor is P05-M4.  Types without a
 * content editor yet insert with truthful default content and a
 * structural summary — no content editor is implied here.
 */
export const BLOCK_REGISTRY = {
  // ── Text ──────────────────────────────────────────────────────────────────
  heading: {
    type: 'heading',
    displayName: 'Heading',
    description: 'H1–H4 heading with optional outline numbering.',
    icon: 'typography',
    category: 'text',
    createDefault: () => createTemplateHeadingBlock(2, 'Section heading'),
  },
  paragraph: {
    type: 'paragraph',
    displayName: 'Paragraph',
    description: 'Rich-text body paragraph with alignment and indentation.',
    icon: 'document',
    category: 'text',
    createDefault: () => createTemplateParagraphBlock('New paragraph.'),
  },

  // ── Callouts & lists ──────────────────────────────────────────────────────
  callout: {
    type: 'callout',
    displayName: 'Callout',
    description: 'Semantic callout: information, warning, success or note.',
    icon: 'info',
    category: 'callouts-lists',
    createDefault: () => createTemplateCalloutBlock('info', 'Callout text.'),
  },
  list: {
    type: 'list',
    displayName: 'List',
    description: 'Bulleted, numbered or checklist items.',
    icon: 'check',
    category: 'callouts-lists',
    createDefault: () => createTemplateListBlock(['List item']),
  },

  // ── Tables & data ─────────────────────────────────────────────────────────
  table: {
    type: 'table',
    displayName: 'Table',
    description: 'Grid of cells with an optional header row.',
    icon: 'statistics',
    category: 'data',
    createDefault: () => createTemplateTableBlock(['Column 1', 'Column 2'], [['', '']]),
  },
  formula: {
    type: 'formula',
    displayName: 'Formula',
    description: 'LaTeX equation with optional "Where:" definitions.',
    icon: 'typography',
    category: 'data',
    createDefault: (): ContentBlock => ({
      id: newUUID(),
      spacing: { topPt: 6, bottomPt: 6 },
      data: {
        type: 'formula',
        latex: 'E = mc^2',
        hAlign: 'center',
        displayMode: true,
        variableDefinitions: [],
      },
    }),
  },
  'metadata-block': {
    type: 'metadata-block',
    displayName: 'Metadata Table',
    description: 'Inline table of selected document metadata fields.',
    icon: 'open',
    category: 'data',
    createDefault: (): ContentBlock => ({
      id: newUUID(),
      spacing: { topPt: 4, bottomPt: 6 },
      data: { type: 'metadata-block', visibleFields: ['title', 'documentId', 'status'] },
    }),
  },
  'revision-history': {
    type: 'revision-history',
    displayName: 'Revision History',
    description: 'Table of revision entries (number, date, author, change).',
    icon: 'actions',
    category: 'data',
    createDefault: (): ContentBlock => ({
      id: newUUID(),
      spacing: { topPt: 4, bottomPt: 6 },
      data: {
        type: 'revision-history',
        entries: [{ id: newUUID(), revision: '1', date: '', author: '', description: '' }],
      },
    }),
  },
  reference: {
    type: 'reference',
    displayName: 'References',
    description: 'Reference list with citation keys and URLs.',
    icon: 'info',
    category: 'data',
    createDefault: (): ContentBlock => ({
      id: newUUID(),
      spacing: { topPt: 4, bottomPt: 6 },
      data: {
        type: 'reference',
        entries: [{ id: newUUID(), key: '[1]', citation: 'Reference citation' }],
      },
    }),
  },
  exhibit: {
    type: 'exhibit',
    displayName: 'Exhibit',
    description: 'Attached exhibit label with optional embedded asset.',
    icon: 'export',
    category: 'data',
    createDefault: (): ContentBlock => ({
      id: newUUID(),
      spacing: { topPt: 6, bottomPt: 6 },
      data: { type: 'exhibit', label: 'Exhibit A' },
    }),
  },

  // ── Media ─────────────────────────────────────────────────────────────────
  image: {
    type: 'image',
    displayName: 'Image',
    description: 'One or two embedded images with captions.',
    icon: 'cover',
    category: 'media',
    createDefault: (): ContentBlock => ({
      id: newUUID(),
      spacing: { topPt: 6, bottomPt: 6 },
      data: {
        type: 'image',
        layout: 'single',
        images: [{ id: newUUID(), assetId: null, widthFraction: 1, hAlign: 'center' }],
      },
    }),
  },
  signature: {
    type: 'signature',
    displayName: 'Signature Block',
    description: 'One to three prepared-by/reviewed-by/approved-by signers.',
    icon: 'actions',
    category: 'media',
    createDefault: () =>
      createTemplateSignatureBlock([{ role: 'Prepared by', designation: 'Name / designation' }]),
  },

  // ── Laboratory (ISO/IEC 17025) ────────────────────────────────────────────
  'procedure-step': {
    type: 'procedure-step',
    displayName: 'Procedure Steps',
    description: 'Ordered procedure steps with sub/step levels.',
    icon: 'actions',
    category: 'lab',
    createDefault: () => createTemplateProcedureStepsBlock([{ text: 'Procedure step description.' }]),
  },
  'equipment-list': {
    type: 'equipment-list',
    displayName: 'Equipment List',
    description: 'Equipment table with asset tags and calibration dates.',
    icon: 'statistics',
    category: 'lab',
    createDefault: () => createTemplateEquipmentListBlock([{ name: 'Equipment name' }]),
  },
  observation: {
    type: 'observation',
    displayName: 'Observation Table',
    description: 'Parameter / observed value / remarks table.',
    icon: 'statistics',
    category: 'lab',
    createDefault: () => createTemplateObservationBlock([{ parameter: 'Parameter' }]),
  },
  measurement: {
    type: 'measurement',
    displayName: 'Measurement Table',
    description: 'Data table of columns, rows and units.',
    icon: 'statistics',
    category: 'lab',
    createDefault: () =>
      createTemplateMeasurementBlock(
        [{ header: 'Parameter' }, { header: 'Value' }],
        [['', '']],
      ),
  },
  calculation: {
    type: 'calculation',
    displayName: 'Calculation',
    description: 'Calculation steps with LaTeX, substitution and results.',
    icon: 'statistics',
    category: 'lab',
    createDefault: () => createTemplateCalculationBlock([{ label: 'Step 1', latex: 'F = m × a' }]),
  },
  'acceptance-criteria': {
    type: 'acceptance-criteria',
    displayName: 'Acceptance Criteria',
    description: 'Criteria, specification, measured value and verdict.',
    icon: 'check',
    category: 'lab',
    createDefault: () =>
      createTemplateAcceptanceCriteriaBlock([
        { criterion: 'Acceptance criterion', specification: '≤ 0.5 %' },
      ]),
  },

  // ── Page layout ───────────────────────────────────────────────────────────
  'horizontal-line': {
    type: 'horizontal-line',
    displayName: 'Horizontal Line',
    description: 'Themed horizontal rule between sections.',
    icon: 'header-footer',
    category: 'layout',
    createDefault: (): ContentBlock => ({
      id: newUUID(),
      spacing: { topPt: 4, bottomPt: 4 },
      data: { type: 'horizontal-line', thicknessPt: 1, color: '#999999' },
    }),
  },
  'page-break': {
    type: 'page-break',
    displayName: 'Page Break',
    description: 'Starts the following content on a new page.',
    icon: 'margin-guide',
    category: 'layout',
    createDefault: (): ContentBlock => ({
      id: newUUID(),
      spacing: { topPt: 0, bottomPt: 0 },
      data: { type: 'page-break' },
    }),
  },
  'section-break': {
    type: 'section-break',
    displayName: 'Section Break',
    description: 'Optional section title with a themed divider.',
    icon: 'margin-guide',
    category: 'layout',
    createDefault: (): ContentBlock => ({
      id: newUUID(),
      spacing: { topPt: 8, bottomPt: 8 },
      data: { type: 'section-break' },
    }),
  },
} satisfies BlockRegistryMap;

// ─────────────────────────────────────────────────────────────────────────────
// Lookups and guards
// ─────────────────────────────────────────────────────────────────────────────

/** Runtime guard for values cast/serialized as a block-type discriminant. */
export function isBlockType(value: unknown): value is BlockType {
  return typeof value === 'string' && (BLOCK_TYPES as readonly string[]).includes(value);
}

/**
 * Registry lookup that returns `undefined` for anything that is not a
 * registered block type — callers translate that into an explicit error
 * result instead of silently inserting nothing.
 */
export function getBlockRegistryEntry(type: BlockType): BlockRegistryEntry | undefined {
  return isBlockType(type) ? BLOCK_REGISTRY[type] : undefined;
}

/** All registered block types belonging to one insertion-menu category. */
export function blockTypesInCategory(category: BlockCategoryId): readonly BlockType[] {
  return BLOCK_TYPES.filter((type) => BLOCK_REGISTRY[type].category === category);
}

// ─────────────────────────────────────────────────────────────────────────────
// Structural summaries (read-only block cards)
// ─────────────────────────────────────────────────────────────────────────────

const summarizeSpans = (spans: readonly { text: string }[]): string => {
  const text = spans.map((span) => span.text).join('').trim();
  if (text === '') return '(no text yet)';
  return text.length > 72 ? `${text.slice(0, 71)}…` : text;
};

/**
 * Concise, truthful structural summary of a block's content for the
 * editor's block cards.  Exhaustive over `AnyBlockData`: adding a block
 * type without a summary case fails to compile (`never` check).
 *
 * The summary describes structure only — it never implies that a content
 * editor exists for the type (those arrive in later Phase 05 checkpoints).
 */
export function summarizeBlockData(data: AnyBlockData): string {
  switch (data.type) {
    case 'heading':
      return `H${data.level}${data.numbered ? ', numbered' : ''} — ${
        data.text.trim() === '' ? '(no text yet)' : `"${data.text}"`
      }`;
    case 'paragraph':
      return summarizeSpans(data.spans);
    case 'callout': {
      const label = `${data.variant} callout${data.title !== undefined ? ` "${data.title}"` : ''}`;
      return `${label} — ${summarizeSpans(data.spans)}`;
    }
    case 'list': {
      const noun = data.items.length === 1 ? 'item' : 'items';
      return `${data.listType} list · ${data.items.length} ${noun} — ${summarizeSpans(
        data.items[0]?.spans ?? [],
      )}`;
    }
    case 'table': {
      const cols = data.rows[0]?.cells.length ?? 0;
      return `table · ${data.rows.length} × ${cols}${
        data.hasHeaderRow ? ', header row' : ''
      }${data.caption !== undefined ? ` · "${data.caption}"` : ''}`;
    }
    case 'formula': {
      const latex = data.latex.trim();
      return `LaTeX ${data.displayMode ? 'display' : 'inline'} — ${
        latex === '' ? '(no formula yet)' : latex.length > 56 ? `${latex.slice(0, 55)}…` : latex
      }`;
    }
    case 'image': {
      const slots = data.images.length;
      const filled = data.images.filter((image) => image.assetId !== null).length;
      const noun = slots === 1 ? 'image slot' : 'image slots';
      return `${data.layout === 'side-by-side' ? 'side-by-side' : 'single'} · ${slots} ${noun} · ${filled} with asset`;
    }
    case 'signature':
      return `${data.signers.length} ${data.signers.length === 1 ? 'signer' : 'signers'} — ${data.signers
        .map((signer) => signer.role)
        .join(', ')}`;
    case 'horizontal-line':
      return `horizontal rule · ${data.thicknessPt} pt`;
    case 'page-break':
      return 'page break';
    case 'section-break':
      return data.title !== undefined && data.title.trim() !== ''
        ? `section break — "${data.title}"`
        : 'section break';
    case 'metadata-block':
      return `${data.visibleFields.length} metadata ${
        data.visibleFields.length === 1 ? 'field' : 'fields'
      } — ${data.visibleFields.join(', ')}`;
    case 'revision-history':
      return `${data.entries.length} ${data.entries.length === 1 ? 'entry' : 'entries'}`;
    case 'procedure-step': {
      const noun = data.steps.length === 1 ? 'step' : 'steps';
      return `${data.sectionTitle !== undefined ? `"${data.sectionTitle}" · ` : ''}${data.steps.length} ${noun}`;
    }
    case 'equipment-list':
      return `${data.items.length} ${data.items.length === 1 ? 'item' : 'items'}${
        data.title !== undefined ? ` · "${data.title}"` : ''
      }`;
    case 'observation':
      return `${data.rows.length} ${data.rows.length === 1 ? 'row' : 'rows'}${
        data.title !== undefined ? ` · "${data.title}"` : ''
      }`;
    case 'measurement':
      return `${data.rows.length} ${data.rows.length === 1 ? 'row' : 'rows'} × ${data.columns.length} ${
        data.columns.length === 1 ? 'column' : 'columns'
      }${data.title !== undefined ? ` · "${data.title}"` : ''}`;
    case 'calculation':
      return `${data.steps.length} ${data.steps.length === 1 ? 'step' : 'steps'}${
        data.title !== undefined ? ` · "${data.title}"` : ''
      }`;
    case 'acceptance-criteria':
      return `${data.criteria.length} ${
        data.criteria.length === 1 ? 'criterion' : 'criteria'
      }${data.title !== undefined ? ` · "${data.title}"` : ''}`;
    case 'reference':
      return `${data.entries.length} ${data.entries.length === 1 ? 'entry' : 'entries'}${
        data.title !== undefined ? ` · "${data.title}"` : ''
      }`;
    case 'exhibit':
      return data.title !== undefined && data.title.trim() !== ''
        ? `${data.label} — "${data.title}"`
        : data.label;
    default: {
      const _exhaustive: never = data;
      return String(_exhaustive);
    }
  }
}
