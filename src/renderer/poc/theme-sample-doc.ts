/**
 * DocStudio — P04-M3 Theme Sample Document
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * A deterministic, SYNTHETIC document used to expose the structural
 * differences between the ten body-page themes (project_details.md §8.3,
 * P04-M3 §6).  It is NOT the P02-M4 fixture: that fixture stays the
 * byte-identical baseline for the default Classic Formal rendering, while
 * this sample deliberately contains every supported content type the theme
 * contract can express — multiple heading levels, long headings and title
 * text, paragraphs of different lengths, indented paragraphs, bullet and
 * numbered lists (the narrow P04-M3 list support), a multi-column table
 * with a caption, a section rule (`horizontal-line`) and a titled
 * `section-break`.
 *
 * Content policy: everything below is invented layout filler, clearly
 * labelled as synthetic.  It makes no conformity claim, states no real
 * analytical result and names no real laboratory.
 *
 * Determinism: fixed UUIDs and timestamps (also used as the PDF
 * creation/modification dates), so re-renders are byte-comparable.
 *
 * @module renderer/poc/theme-sample-doc
 */

import type { BodyThemeId, DocStudioDocument } from '../../types/document';
import type { AnyBlockData, InlineSpan } from '../../types/blocks';
import { createDefaultDocument } from '../../types/defaults';

/** Fixed creation timestamp (also the PDF creationDate) for determinism. */
export const THEME_SAMPLE_CREATED_AT = '2026-10-16T09:00:00.000Z';

/** Helper: paragraph spans from plain text, with optional inline marks. */
function p(...spans: InlineSpan[]): InlineSpan[] {
  return spans;
}

const t = (text: string): InlineSpan => ({ text });

/**
 * Build the synthetic theme-sample document for one theme/monochrome
 * combination.  Every call returns a fresh, independent object graph; the
 * ONLY theme-dependent input is `pageTypography.bodyThemeId` +
 * `pageTypography.monochrome` (content, metadata, page setup and all other
 * typography stay identical across the ten variants so the gallery
 * comparison isolates theme structure).
 */
export function buildThemeSampleDoc(
  themeId: BodyThemeId,
  monochrome: boolean = false,
): DocStudioDocument {
  const doc = createDefaultDocument(
    '00000000-0000-4000-8000-000000000043',
    THEME_SAMPLE_CREATED_AT,
  );

  // ── Metadata (fixed; long on purpose — wrapping must be inspected) ──────
  doc.metadata = {
    ...doc.metadata,
    title:
      'Synthetic Theme Sample — A Deliberately Long Document Title Used to ' +
      'Exercise Heading and Metadata Wrapping Across All Ten Body-Page Themes',
    documentId: 'SAMPLE-P04-M3',
    organizationName: 'DocStudio Synthetic Sample (Not A Real Laboratory)',
    createdAt: THEME_SAMPLE_CREATED_AT,
    modifiedAt: THEME_SAMPLE_CREATED_AT,
  };

  // Page setup stays at schema defaults (A4 portrait, 25 mm margins) and
  // typography stays at schema defaults (11 pt, 1.5 line spacing, 6 pt
  // paragraph spacing) — theme structure is the variable under test.
  doc.pageTypography = {
    ...doc.pageTypography,
    bodyThemeId: themeId,
    monochrome,
    displayHeader: true,
  };

  const blocks: AnyBlockData[] = [
    {
      type: 'heading',
      level: 1,
      text:
        'Synthetic Theme Sample — A Long Heading Line That Must Wrap Cleanly ' +
        'In Every Body-Page Theme',
      numbered: false,
      hAlign: 'left',
    },
    {
      type: 'paragraph',
      spans: p(
        { text: 'SYNTHETIC SAMPLE CONTENT. ', bold: true },
        t(
          'This document exists only to compare the ten DocStudio body-page themes. ' +
            'It contains no real laboratory data, no conformity statements and no real ' +
            'laboratory identity; every value below is invented for layout purposes. ' +
            'The same content is rendered once per theme so heading rhythm, paragraph ' +
            'flow, lists, tables, captions, section rules and page furniture can be ' +
            'compared directly.',
        ),
      ),
      hAlign: 'justify',
      indentLevel: 0,
    },
    {
      type: 'heading',
      level: 2,
      text: 'Purpose and Scope of the Sample',
      numbered: false,
      hAlign: 'left',
    },
    {
      type: 'paragraph',
      spans: p(
        t(
          'Each theme resolves its own structural token set from the shared P04-M2 ' +
            'contract: heading weights, margins and alignment, paragraph rhythm and ' +
            'indent steps, list markers, table geometry and ink, caption size and ' +
            'italic setting, section-rule weight, page framing and page furniture. ' +
          'Document typography — font family, base size, line spacing and paragraph ' +
            'spacing — remains authoritative and identical for every theme, which is ' +
            'why the differences visible on these pages are compositional rather than ' +
            'a change of typeface. ',
        ),
        { text: 'Compare this paragraph line by line across themes.', italic: true },
      ),
      hAlign: 'justify',
      indentLevel: 0,
    },
    {
      type: 'paragraph',
      spans: p(t('A deliberately short paragraph follows to expose vertical rhythm between blocks.')),
      hAlign: 'left',
      indentLevel: 0,
    },
    {
      type: 'heading',
      level: 3,
      text: 'Preparation Sequence',
      numbered: false,
      hAlign: 'left',
    },
    {
      type: 'list',
      listType: 'bullet',
      bulletStyle: 'disc',
      numberStyle: 'decimal',
      items: [
        {
          id: '00000000-0000-4000-8000-000000000101',
          spans: p(t('Confirm the theme gallery build is showing this sample page.')),
          depth: 0,
        },
        {
          id: '00000000-0000-4000-8000-000000000102',
          spans: p(t('Compare heading spacing against the structural comparison table.')),
          depth: 0,
        },
        {
          id: '00000000-0000-4000-8000-000000000103',
          spans: p(t('Observe list marker shape, indent and accent ink for this theme.')),
          depth: 1,
        },
        {
          id: '00000000-0000-4000-8000-000000000104',
          spans: p(
            t('Review table borders, header treatment and row divider '),
            { text: 'before judging the theme.', bold: true },
          ),
          depth: 0,
        },
      ],
    },
    {
      type: 'list',
      listType: 'numbered',
      bulletStyle: 'disc',
      numberStyle: 'decimal',
      items: [
        {
          id: '00000000-0000-4000-8000-000000000111',
          spans: p(t('Observe the section rule weight and colour below.')),
          depth: 0,
        },
        {
          id: '00000000-0000-4000-8000-000000000112',
          spans: p(t('Check caption size, italic setting and alignment.')),
          depth: 0,
        },
        {
          id: '00000000-0000-4000-8000-000000000113',
          spans: p(t('Verify page furniture position, size and alignment.')),
          depth: 0,
        },
      ],
    },
    {
      type: 'horizontal-line',
      thicknessPt: 1,
      color: '#000000',
    },
    {
      type: 'heading',
      level: 4,
      text: 'Recorded Values (Invented)',
      numbered: false,
      hAlign: 'left',
    },
    {
      type: 'paragraph',
      spans: p(t('First-level indented paragraph showing the theme indent step.')),
      hAlign: 'left',
      indentLevel: 1,
    },
    {
      type: 'paragraph',
      spans: p(t('Second-level indented paragraph showing deeper indent steps.')),
      hAlign: 'left',
      indentLevel: 2,
    },
    {
      type: 'heading',
      level: 3,
      text: 'Comparative Sample Table',
      numbered: false,
      hAlign: 'left',
    },
    {
      type: 'table',
      hasHeaderRow: true,
      headerStyle: 'medium',
      caption:
        'Table S1 — Synthetic comparison values (invented for layout testing only; not analytical data)',
      rows: [
        {
          id: '00000000-0000-4000-8000-000000000121',
          cells: [
            { id: '00000000-0000-4000-8000-000000000131', spans: p(t('Item')), hAlign: 'left', colSpan: 1, rowSpan: 1, isHeader: true },
            { id: '00000000-0000-4000-8000-000000000132', spans: p(t('Nominal')), hAlign: 'left', colSpan: 1, rowSpan: 1, isHeader: true },
            { id: '00000000-0000-4000-8000-000000000133', spans: p(t('Observed')), hAlign: 'left', colSpan: 1, rowSpan: 1, isHeader: true },
            { id: '00000000-0000-4000-8000-000000000134', spans: p(t('Difference')), hAlign: 'left', colSpan: 1, rowSpan: 1, isHeader: true },
          ],
        },
        {
          id: '00000000-0000-4000-8000-000000000122',
          cells: [
            { id: '00000000-0000-4000-8000-000000000135', spans: p(t('Alpha')), hAlign: 'left', colSpan: 1, rowSpan: 1, isHeader: false },
            { id: '00000000-0000-4000-8000-000000000136', spans: p(t('10.0000')), hAlign: 'right', colSpan: 1, rowSpan: 1, isHeader: false },
            { id: '00000000-0000-4000-8000-000000000137', spans: p(t('10.0001')), hAlign: 'right', colSpan: 1, rowSpan: 1, isHeader: false },
            { id: '00000000-0000-4000-8000-000000000138', spans: p(t('+0.1')), hAlign: 'right', colSpan: 1, rowSpan: 1, isHeader: false },
          ],
        },
        {
          id: '00000000-0000-4000-8000-000000000123',
          cells: [
            { id: '00000000-0000-4000-8000-000000000139', spans: p(t('Bravo')), hAlign: 'left', colSpan: 1, rowSpan: 1, isHeader: false },
            { id: '00000000-0000-4000-8000-00000000013a', spans: p(t('20.0000')), hAlign: 'right', colSpan: 1, rowSpan: 1, isHeader: false },
            { id: '00000000-0000-4000-8000-00000000013b', spans: p(t('19.9998')), hAlign: 'right', colSpan: 1, rowSpan: 1, isHeader: false },
            { id: '00000000-0000-4000-8000-00000000013c', spans: p(t('-0.2')), hAlign: 'right', colSpan: 1, rowSpan: 1, isHeader: false },
          ],
        },
        {
          id: '00000000-0000-4000-8000-000000000124',
          cells: [
            { id: '00000000-0000-4000-8000-00000000013d', spans: p(t('Charlie')), hAlign: 'left', colSpan: 1, rowSpan: 1, isHeader: false },
            { id: '00000000-0000-4000-8000-00000000013e', spans: p(t('50.0000')), hAlign: 'right', colSpan: 1, rowSpan: 1, isHeader: false },
            { id: '00000000-0000-4000-8000-00000000013f', spans: p(t('50.0003')), hAlign: 'right', colSpan: 1, rowSpan: 1, isHeader: false },
            { id: '00000000-0000-4000-8000-000000000140', spans: p(t('+0.3')), hAlign: 'right', colSpan: 1, rowSpan: 1, isHeader: false },
          ],
        },
        {
          id: '00000000-0000-4000-8000-000000000125',
          cells: [
            { id: '00000000-0000-4000-8000-000000000141', spans: p(t('Delta')), hAlign: 'left', colSpan: 1, rowSpan: 1, isHeader: false },
            { id: '00000000-0000-4000-8000-000000000142', spans: p(t('100.0000')), hAlign: 'right', colSpan: 1, rowSpan: 1, isHeader: false },
            { id: '00000000-0000-4000-8000-000000000143', spans: p(t('100.0004')), hAlign: 'right', colSpan: 1, rowSpan: 1, isHeader: false },
            { id: '00000000-0000-4000-8000-000000000144', spans: p(t('+0.4')), hAlign: 'right', colSpan: 1, rowSpan: 1, isHeader: false },
          ],
        },
      ],
    },
    {
      type: 'section-break',
      title: 'End of Synthetic Sample Section',
    },
    {
      type: 'paragraph',
      spans: p(
        t(
          'Closing paragraph sized to run long enough that wrapping, the final ' +
            'section rule and the bottom page furniture can all be inspected for ' +
            'clipping or overflow. If this sentence reaches the footer area without ' +
            'collision in a given theme, that theme’s bottom spacing is healthy; any ' +
            'theme that crowds the footer is a defect to report, not to accept. ' +
          'End of synthetic sample.',
        ),
      ),
      hAlign: 'justify',
      indentLevel: 0,
    },
  ];

  return {
    ...doc,
    blocks: blocks.map((data, i) => ({
      id: `00000000-0000-4000-8000-${(0xf100 + i).toString(16).padStart(12, '0')}`,
      spacing: { topPt: 6, bottomPt: 6 },
      data,
    })),
  };
}
