/**
 * DocStudio — P02-M4 Renderer Proof-of-Concept Fixture
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * A deterministic sample `DocStudioDocument` used ONLY by the renderer
 * proof of concept (never loaded into normal editing state). It exercises
 * every element required by the Phase 02 renderer gate:
 *
 * 1. Multiple physical pages (content deliberately overflows page 1).
 * 2. Justified paragraphs with realistic line wrapping + inline bold/italic.
 * 3. An explicit `page-break` block.
 * 4. A table with multiple rows and columns (6 rows × 4 columns).
 * 5. A local image asset (embedded base64 PNG — matches the real
 *    `AssetRecord.base64Data` model; no network access involved).
 * 6. Font: schema default "Segoe UI"; the PoC renderer maps it to the PDF
 *    standard-14 `Times` family (documented, license-clean fallback — see
 *    src/renderer/poc/poc-document.tsx).
 * 7. Known page geometry: A4 portrait, 25 mm margins (schema defaults).
 * 8. Page numbering: fixed footer "Page X of Y" via react-pdf render props.
 *
 * Determinism: every UUID and timestamp below is a fixed constant, so
 * re-renders of this fixture are byte-comparable (the document's
 * `createdAt` is also passed as the PDF `creationDate`).
 *
 * The fixture is built through the real schema factories/types so it can
 * never drift from the `.docstudio` document model.  It does NOT change the
 * schema.
 *
 * @module renderer/poc/poc-fixture
 */

import type { DocStudioDocument } from '../../types/document';
import type { AnyBlockData, InlineSpan } from '../../types/blocks';
import { createDefaultDocument } from '../../types/defaults';

/** Fixed logical IDs so the fixture is fully deterministic. */
export const POC_IMAGE_ASSET_ID = '00000000-0000-4000-8000-0000000000a1';

/** Fixed creation timestamp (also used as the PDF creationDate). */
export const POC_CREATED_AT = '2026-10-15T09:00:00.000Z';

/**
 * Embedded local image fixture — a 400×160 PNG generated once offline
 * (System.Drawing) and stored as base64, exactly like a user-embedded
 * asset inside a real `.docstudio` document.  The source file lives at
 * fixtures/p02-m4/balance-calibration-chart.png.
 */
export const POC_IMAGE_BASE64 = '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';

/** Helper: paragraph spans from plain text, with optional inline marks. */
function p(...spans: InlineSpan[]): InlineSpan[] {
  return spans;
}

const t = (text: string): InlineSpan => ({ text });

/**
 * Build the deterministic PoC document.
 * Each call returns a fresh, independent object graph.
 */
export function buildPocFixture(): DocStudioDocument {
  // Fixed base UUID so child IDs derived below stay deterministic.
  const doc = createDefaultDocument(
    '00000000-0000-4000-8000-000000000000',
    POC_CREATED_AT,
  );

  // ── Metadata (fixed) ─────────────────────────────────────────────────────
  doc.metadata = {
    ...doc.metadata,
    title: 'Verification of Analytical Balance Calibration',
    documentId: 'SOP-POC-004',
    organizationName: 'DocStudio Proof-of-Concept Laboratory',
    createdAt: POC_CREATED_AT,
    modifiedAt: POC_CREATED_AT,
  };

  // ── Front page: explicitly disabled (P04-M4) ─────────────────────────────
  // This fixture is the P02-M4 BODY-ONLY compatibility reference: the
  // committed baseline `fixtures/p02-m4/renderer-poc-output.pdf`
  // (13,854 bytes) predates cover rendering, so the fixture pins
  // `frontPage.enabled = false` to keep regenerating that exact
  // body-only artifact. This is fixture intent, NOT a global switch —
  // real documents render their cover whenever `frontPage.enabled`
  // is true (P04-M4).
  doc.frontPage = { ...doc.frontPage, enabled: false };

  // Page setup stays at schema defaults: A4 portrait, 25 mm margins.
  // Typography stays at schema defaults: 11 pt, 1.5 line-height, 6 pt spacing.

  // ── Embedded image asset ─────────────────────────────────────────────────
  doc.assets[POC_IMAGE_ASSET_ID] = {
    id: POC_IMAGE_ASSET_ID,
    filename: 'balance-calibration-chart.png',
    mimeType: 'image/png',
    sizeBytes: 2819,
    addedAt: POC_CREATED_AT,
    base64Data: POC_IMAGE_BASE64,
  };

  // ── Blocks ───────────────────────────────────────────────────────────────
  const blocks: AnyBlockData[] = [
    {
      type: 'heading',
      level: 1,
      text: 'Verification of Analytical Balance Calibration',
      numbered: false,
      hAlign: 'left',
    },
    {
      type: 'paragraph',
      spans: p(
        t('1. Scope. '),
        { text: 'This procedure describes the routine verification of analytical balances used for mass determination in the testing laboratory. ', bold: false },
        t('It applies to all balances with a readability of 0.1 mg or better and is performed at defined intervals using calibrated reference weights of class E2 or better.'),
      ),
      hAlign: 'justify',
      indentLevel: 0,
    },
    {
      type: 'paragraph',
      spans: p(
        t('2. Principle. '),
        t('The balance is verified at its zero point and at defined check points across its working range. The deviation between the nominal value of each reference weight and the value indicated by the balance is evaluated against the acceptance criteria stated in the results table below. '),
        t('Verification is a calibration-related activity: it does not adjust the instrument, and any adjustment is arranged separately through the metrology function after an unsuccessful series.'),
      ),
      hAlign: 'justify',
      indentLevel: 0,
    },
    {
      type: 'paragraph',
      spans: p(
        t('3. Environmental conditions. '),
        t('During the verification series the ambient temperature '),
        { text: 'must not fluctuate by more than 1 °C', bold: true },
        t(' and the relative humidity shall remain within the range of 45 % to 75 %. The balance shall be levelled and its bubble indicator centred. Draft shields shall remain closed throughout each weighing sequence, and vibrations from adjacent equipment shall be excluded.'),
      ),
      hAlign: 'justify',
      indentLevel: 0,
    },
    {
      type: 'paragraph',
      spans: p(
        t('4. Preparation. '),
        t('Allow the reference weights and the balance to equilibrate in the weighing room for '),
        { text: 'at least two hours', italic: true },
        t(' before the series begins. Inspect the weight surfaces for contamination and handle them with forceps or clean gloves only. Record the balance identification, the weight set identification and the due date of the calibration certificates in the verification log.'),
      ),
      hAlign: 'justify',
      indentLevel: 0,
    },
    {
      type: 'paragraph',
      spans: p(
        t('5. Zero-point verification. '),
        t('With all pans clear and the doors closed, read the balance indication. The absolute zero-point deviation shall not exceed 0.1 mg. If the criterion is not met, repeat the zeroing once; a second failure shall be treated as a non-conformity and reported to the quality manager before any further weighing is performed with the instrument. '),
        t('Record the observed zero-point value even when it passes, because trending of this value over several months is used to plan preventive maintenance of the adjustment mechanism.'),
      ),
      hAlign: 'justify',
      indentLevel: 0,
    },
    {
      type: 'paragraph',
      spans: p(
        t('6. Check-point measurements. '),
        t('Place each reference weight on the centre of the pan in ascending order, wait for the reading to stabilise, and record the indicated value to the full readability of the instrument. Repeat the sequence three times per check point and evaluate the arithmetic mean. Any single indication that deviates from the acceptance criteria shall be investigated and documented with the corrective action taken.'),
      ),
      hAlign: 'justify',
      indentLevel: 0,
    },
    {
      type: 'paragraph',
      spans: p(
        t('7. Evaluation and documentation. '),
        t('The verification is successful when every check point satisfies the acceptance criteria of Table 1. Results shall be recorded in the verification report, reviewed by a second person and retained for the period defined in the laboratory quality manual. Non-conforming balances shall be labelled and withdrawn from service until a passing re-verification is available. '),
        t('The report shall reference the identification of every reference weight used, the ambient conditions observed during the series, the name of the operator, and the date and time at which the series started and finished.'),
      ),
      hAlign: 'justify',
      indentLevel: 0,
    },
    {
      type: 'paragraph',
      spans: p(
        t('8. Re-verification interval. '),
        t('The standard re-verification interval is twelve months. An interval of six months shall be applied when the balance is used in a production environment with heavy traffic, when the recorded zero-point trend shows a systematic drift exceeding one third of the acceptance limit over three consecutive months, or when the instrument has been transported or serviced. '),
        t('Shortening or extending an interval requires documented authorization by the quality manager and shall be recorded together with the justification in the instrument file.'),
      ),
      hAlign: 'justify',
      indentLevel: 0,
    },
    {
      type: 'paragraph',
      spans: p(
        t('9. Health and safety. '),
        t('Reference weights shall never be placed directly on a balance pan without the recommended handling tools. Operators shall not lean on the bench during a weighing sequence. '),
        { text: 'If mercury or a hazardous sample is involved in any associated verification activity, the applicable laboratory safety instructions take precedence over this procedure.', italic: true },
      ),
      hAlign: 'justify',
      indentLevel: 0,
    },
    // ── Explicit page break (required by the renderer gate) ────────────────
    { type: 'page-break' },
    {
      type: 'heading',
      level: 2,
      text: 'Calibration Results',
      numbered: false,
      hAlign: 'left',
    },
    {
      type: 'table',
      hasHeaderRow: true,
      headerStyle: 'medium',
      caption: 'Table 1 - Check-weight verification results',
      rows: [
        {
          id: '00000000-0000-4000-8000-0000000000b1',
          cells: [
            { id: '00000000-0000-4000-8000-0000000000c1', spans: p(t('Check point')), hAlign: 'left', colSpan: 1, rowSpan: 1, isHeader: true },
            { id: '00000000-0000-4000-8000-0000000000c2', spans: p(t('Nominal (g)')), hAlign: 'left', colSpan: 1, rowSpan: 1, isHeader: true },
            { id: '00000000-0000-4000-8000-0000000000c3', spans: p(t('Indicated (g)')), hAlign: 'left', colSpan: 1, rowSpan: 1, isHeader: true },
            { id: '00000000-0000-4000-8000-0000000000c4', spans: p(t('Deviation (mg)')), hAlign: 'left', colSpan: 1, rowSpan: 1, isHeader: true },
          ],
        },
        {
          id: '00000000-0000-4000-8000-0000000000b2',
          cells: [
            { id: '00000000-0000-4000-8000-0000000000c5', spans: p(t('CP-1')), hAlign: 'left', colSpan: 1, rowSpan: 1, isHeader: false },
            { id: '00000000-0000-4000-8000-0000000000c6', spans: p(t('1.0000')), hAlign: 'right', colSpan: 1, rowSpan: 1, isHeader: false },
            { id: '00000000-0000-4000-8000-0000000000c7', spans: p(t('1.0001')), hAlign: 'right', colSpan: 1, rowSpan: 1, isHeader: false },
            { id: '00000000-0000-4000-8000-0000000000c8', spans: p(t('+0.1')), hAlign: 'right', colSpan: 1, rowSpan: 1, isHeader: false },
          ],
        },
        {
          id: '00000000-0000-4000-8000-0000000000b3',
          cells: [
            { id: '00000000-0000-4000-8000-0000000000c9', spans: p(t('CP-2')), hAlign: 'left', colSpan: 1, rowSpan: 1, isHeader: false },
            { id: '00000000-0000-4000-8000-0000000000ca', spans: p(t('10.0000')), hAlign: 'right', colSpan: 1, rowSpan: 1, isHeader: false },
            { id: '00000000-0000-4000-8000-0000000000cb', spans: p(t('9.9998')), hAlign: 'right', colSpan: 1, rowSpan: 1, isHeader: false },
            { id: '00000000-0000-4000-8000-0000000000cc', spans: p(t('-0.2')), hAlign: 'right', colSpan: 1, rowSpan: 1, isHeader: false },
          ],
        },
        {
          id: '00000000-0000-4000-8000-0000000000b4',
          cells: [
            { id: '00000000-0000-4000-8000-0000000000cd', spans: p(t('CP-3')), hAlign: 'left', colSpan: 1, rowSpan: 1, isHeader: false },
            { id: '00000000-0000-4000-8000-0000000000ce', spans: p(t('20.0000')), hAlign: 'right', colSpan: 1, rowSpan: 1, isHeader: false },
            { id: '00000000-0000-4000-8000-0000000000cf', spans: p(t('20.0002')), hAlign: 'right', colSpan: 1, rowSpan: 1, isHeader: false },
            { id: '00000000-0000-4000-8000-0000000000d0', spans: p(t('+0.2')), hAlign: 'right', colSpan: 1, rowSpan: 1, isHeader: false },
          ],
        },
        {
          id: '00000000-0000-4000-8000-0000000000b5',
          cells: [
            { id: '00000000-0000-4000-8000-0000000000d1', spans: p(t('CP-4')), hAlign: 'left', colSpan: 1, rowSpan: 1, isHeader: false },
            { id: '00000000-0000-4000-8000-0000000000d2', spans: p(t('50.0000')), hAlign: 'right', colSpan: 1, rowSpan: 1, isHeader: false },
            { id: '00000000-0000-4000-8000-0000000000d3', spans: p(t('50.0003')), hAlign: 'right', colSpan: 1, rowSpan: 1, isHeader: false },
            { id: '00000000-0000-4000-8000-0000000000d4', spans: p(t('+0.3')), hAlign: 'right', colSpan: 1, rowSpan: 1, isHeader: false },
          ],
        },
        {
          id: '00000000-0000-4000-8000-0000000000b6',
          cells: [
            { id: '00000000-0000-4000-8000-0000000000d5', spans: p(t('CP-5')), hAlign: 'left', colSpan: 1, rowSpan: 1, isHeader: false },
            { id: '00000000-0000-4000-8000-0000000000d6', spans: p(t('100.0000')), hAlign: 'right', colSpan: 1, rowSpan: 1, isHeader: false },
            { id: '00000000-0000-4000-8000-0000000000d7', spans: p(t('100.0004')), hAlign: 'right', colSpan: 1, rowSpan: 1, isHeader: false },
            { id: '00000000-0000-4000-8000-0000000000d8', spans: p(t('+0.4')), hAlign: 'right', colSpan: 1, rowSpan: 1, isHeader: false },
          ],
        },
      ],
    },
    {
      type: 'image',
      layout: 'single',
      images: [
        {
          id: '00000000-0000-4000-8000-0000000000e1',
          assetId: POC_IMAGE_ASSET_ID,
          caption: 'Figure 1 - Balance calibration check points (embedded fixture asset)',
          captionPlacement: 'bottom',
          widthFraction: 0.6,
          hAlign: 'center',
        },
      ],
    },
    {
      type: 'paragraph',
      spans: p(
        t('10. Closing remark. '),
        t('The verification record, including this table and the attached chart, constitutes objective evidence of the balance status at the time of the check. '),
        { text: 'End of procedure.', italic: true },
      ),
      hAlign: 'justify',
      indentLevel: 0,
    },
  ];

  return {
    ...doc,
    // Wrap each block payload in the schema's ContentBlock envelope with
    // fixed IDs and default spacing, keeping the fixture deterministic.
    blocks: blocks.map((data, i) => ({
      id: `00000000-0000-4000-8000-${(0xf000 + i).toString(16).padStart(12, '0')}`,
      spacing: { topPt: 6, bottomPt: 6 },
      data,
    })),
  };
}
