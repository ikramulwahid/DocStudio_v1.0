/**
 * DocStudio — P04-M4 Cover Sample Document
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * A deterministic, SYNTHETIC document used to exercise and compare the ten
 * cover/front-page themes (project_details.md §7, P04-M4 §7).  Every call
 * returns a fresh object graph; the ONLY theme-dependent inputs are
 * `frontPage.themeId` and `frontPage.monochrome`, so gallery pages differ
 * only by cover structure.
 *
 * It deliberately exercises the full cover surface:
 * • Long title, subtitle and organization name (wrapping must survive).
 * • Visible metadata across every supported group — identification,
 *   issue/revision control, preparation/approval, dates and two custom
 *   fields (selected via stable `custom:<id>` references).
 * • A synopsis (abstract-style additional text).
 * • An embedded synthetic logo asset and an embedded abstract background
 *   image asset (both clearly labelled synthetic — no real laboratory
 *   identity, no conformity/accreditation claim).
 * • Non-default body typography left at defaults: the gallery isolates
 *   COVER structure, and body pages keep classic-formal.
 *
 * Determinism: fixed UUIDs/timestamps and fixed generated asset bytes, so
 * re-renders are byte-comparable.
 *
 * @module renderer/poc/cover-sample-doc
 */

import type { CoverThemeId, DocStudioDocument } from '../../types/document';
import type { AnyBlockData, InlineSpan } from '../../types/blocks';
import { createDefaultDocument } from '../../types/defaults';
import {
  COVER_BACKGROUND_BASE64,
  COVER_BACKGROUND_BYTES,
  COVER_BACKGROUND_MIME,
  COVER_LOGO_BASE64,
  COVER_LOGO_BYTES,
  COVER_LOGO_MIME,
} from './cover-sample-assets';

/** Fixed creation timestamp (also the PDF creationDate) for determinism. */
export const COVER_SAMPLE_CREATED_AT = '2026-10-17T09:00:00.000Z';

/** Fixed asset IDs (referenced from frontPage settings). */
export const COVER_SAMPLE_LOGO_ID = '10000000-0000-4000-8000-000000000001';
export const COVER_SAMPLE_BACKGROUND_ID = '10000000-0000-4000-8000-000000000002';

/** Fixed custom-field IDs (selected through the `custom:<id>` convention). */
export const COVER_SAMPLE_CUSTOM_PROJECT_ID = '20000000-0000-4000-8000-000000000001';
export const COVER_SAMPLE_CUSTOM_METHOD_ID = '20000000-0000-4000-8000-000000000002';

const t = (text: string): InlineSpan => ({ text });
const p = (...spans: InlineSpan[]): InlineSpan[] => spans;

/**
 * Build the synthetic cover-sample document for one cover theme and
 * monochrome combination.  Only `frontPage.themeId`/`frontPage.monochrome`
 * vary between calls; everything else is fixed so gallery pages isolate
 * cover structure.
 */
export function buildCoverSampleDoc(
  themeId: CoverThemeId,
  monochrome: boolean = false,
): DocStudioDocument {
  const doc = createDefaultDocument(
    '30000000-0000-4000-8000-000000000001',
    COVER_SAMPLE_CREATED_AT,
  );

  doc.metadata = {
    ...doc.metadata,
    title:
      'Synthetic Cover Theme Sample — A Deliberately Long Document Title ' +
      'Used to Exercise Title Wrapping Across All Ten Front-Page Compositions',
    subtitle:
      'With a synthetic subtitle long enough to wrap on narrow cover columns ' +
      'and inside split panels',
    organizationName: 'DocStudio Synthetic Demonstration Laboratory (Not A Real Laboratory)',
    documentId: 'SAMPLE-P04-M4',
    status: 'Draft',
    issueNumber: '3',
    issueDate: '2026-10-17',
    effectiveDate: '2026-11-01',
    reviewDate: '2027-10-17',
    preparedBy: 'A. Setter (Synthetic)',
    reviewedBy: 'B. Checker (Synthetic)',
    approvedBy: 'C. Approver (Synthetic)',
    department: 'Synthetic Methods Group',
    applicableStandard: 'ISO/IEC 17025 (illustrative reference only)',
    clauseReferences: 'Clauses 7.1–7.2 (synthetic excerpt)',
    supersedes: 'SAMPLE-P04-M3 rev. 2',
    createdAt: COVER_SAMPLE_CREATED_AT,
    modifiedAt: COVER_SAMPLE_CREATED_AT,
    customFields: [
      { id: COVER_SAMPLE_CUSTOM_PROJECT_ID, label: 'Project Code', value: 'SYN-2026-004' },
      { id: COVER_SAMPLE_CUSTOM_METHOD_ID, label: 'Method Family', value: 'Gravimetric (synthetic)' },
    ],
  };

  doc.assets[COVER_SAMPLE_LOGO_ID] = {
    id: COVER_SAMPLE_LOGO_ID,
    filename: 'synthetic-demo-logo.png',
    mimeType: COVER_LOGO_MIME,
    sizeBytes: COVER_LOGO_BYTES,
    addedAt: COVER_SAMPLE_CREATED_AT,
    base64Data: COVER_LOGO_BASE64,
  };
  doc.assets[COVER_SAMPLE_BACKGROUND_ID] = {
    id: COVER_SAMPLE_BACKGROUND_ID,
    filename: 'synthetic-hero-background.png',
    mimeType: COVER_BACKGROUND_MIME,
    sizeBytes: COVER_BACKGROUND_BYTES,
    addedAt: COVER_SAMPLE_CREATED_AT,
    base64Data: COVER_BACKGROUND_BASE64,
  };

  doc.frontPage = {
    ...doc.frontPage,
    enabled: true,
    themeId,
    monochrome,
    // Principal elements (title/subtitle/organization) are intentionally NOT
    // listed here: every composition renders them through its title block,
    // and listing them again would duplicate long text into the metadata
    // block.  The list covers every other supported group instead.
    visibleFields: [
      'documentId',
      'status',
      'issueNumber',
      'issueDate',
      'effectiveDate',
      'preparedBy',
      'reviewedBy',
      'approvedBy',
      'department',
      'applicableStandard',
      'supersedes',
      'createdAt',
      `custom:${COVER_SAMPLE_CUSTOM_PROJECT_ID}`,
      `custom:${COVER_SAMPLE_CUSTOM_METHOD_ID}`,
    ],
    synopsis:
      'SYNTHETIC ABSTRACT. This sample exists only to compare the ten DocStudio ' +
      'cover compositions. It states no analytical result, claims no conformity or ' +
      'accreditation, and names no real laboratory; every value is invented to ' +
      'exercise layout, wrapping, metadata grouping and image placement.',
    logoAssetId: COVER_SAMPLE_LOGO_ID,
    logoWidthMm: 22,
    backgroundImageAssetId: COVER_SAMPLE_BACKGROUND_ID,
  };

  // One modest body section, so a full-document render proves cover + body
  // coexistence (body theme stays at the schema default).
  const blocks: AnyBlockData[] = [
    {
      type: 'heading',
      level: 1,
      text: 'Synthetic Body Section (Cover Comparison Continues On Page 2)',
      numbered: false,
      hAlign: 'left',
    },
    {
      type: 'paragraph',
      spans: p(
        { text: 'SYNTHETIC SAMPLE BODY. ', bold: true },
        t(
          'The cover theme under comparison occupies page one of this document. ' +
            'This single body section exists to verify that the designed cover renders ' +
            'as a separate first page while the body keeps its own theme, page furniture ' +
            'and margins. No real data, results or identity appear anywhere in this file.',
        ),
      ),
      hAlign: 'justify',
      indentLevel: 0,
    },
  ];
  doc.blocks = blocks.map((data, i) => ({
    id: `40000000-0000-4000-8000-00000000000${i + 1}`,
    data,
    spacing: { topPt: 6, bottomPt: 6 },
  })) as DocStudioDocument['blocks'];

  return doc;
}
