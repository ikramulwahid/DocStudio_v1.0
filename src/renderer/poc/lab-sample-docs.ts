/**
 * DocStudio — P06-M5 Laboratory Sample Documents
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Four representative, deterministic laboratory documents built from the
 * REAL reusable block system (roadmap Phase 06 evidence, task §5):
 *
 * 1. SOP            — `buildLabSopSampleDoc`: a standard operating
 *                     procedure combining headings, paragraphs, the
 *                     equipment list, procedure steps, acceptance
 *                     criteria, references and a signature block.
 * 2. TECHNICAL PROC — `buildLabProcedureSampleDoc`: a technical
 *                     procedure combining a safety list, procedure
 *                     steps, an observation table, a calculation block
 *                     (authoring through the REAL MathJax validator)
 *                     and an existing `formula` block.
 * 3. WORKSHEET      — `buildLabWorksheetSampleDoc`: a measurement
 *                     worksheet / rough datasheet with mostly BLANK
 *                     rows (printed handwriting space) and an
 *                     observation table.
 * 4. EXHIBIT        — `buildLabExhibitSampleDoc`: an annexure built
 *                     around the existing exhibit block plus an
 *                     equipment list, a generic table, a section break
 *                     and a page break.
 *
 * Authoring evidence: every builder constructs its starter content with
 * the template factories and then authors ADDITIONAL content through the
 * immutable `applyLabAction` service (with deterministic `now`/`genId`
 * injection), so the samples demonstrate the real authoring →
 * persistence → rendering pipeline rather than static descriptions.
 * A rejected action throws — a builder can never silently produce a
 * document the service would not allow.
 *
 * Product boundary: all content is invented, clearly illustrative filler.
 * No real laboratory, method, sample, result or conformity claim is
 * stated or implied.
 *
 * Determinism: fixed UUIDs and timestamps, so re-renders are
 * byte-comparable and the verify suite can assert exact behaviour.
 *
 * @module renderer/poc/lab-sample-docs
 */

import type { ContentBlock, DocStudioDocument, DocUUID } from '../../types/document';
import type { AnyBlockData } from '../../types/blocks';
import { createDefaultDocument, newUUID } from '../../types/defaults';
import {
  createTemplateAcceptanceCriteriaBlock,
  createTemplateCalculationBlock,
  createTemplateEquipmentListBlock,
  createTemplateHeadingBlock,
  createTemplateListBlock,
  createTemplateMeasurementBlock,
  createTemplateObservationBlock,
  createTemplateParagraphBlock,
  createTemplateProcedureStepsBlock,
  createTemplateSignatureBlock,
  createTemplateTableBlock,
} from '../../types/template-defaults';
import { applyLabAction, type LabContentAction, type LabContentActionResult } from '../../services/lab-block-content';

/** Fixed creation timestamp (also the PDF creationDate) for determinism. */
export const LAB_SAMPLE_CREATED_AT = '2026-10-22T09:00:00.000Z';

/** Deterministic entry-id generator (fixed suffix counter per document). */
function fixedIds(prefix: string): () => DocUUID {
  let n = 0;
  return () => {
    n += 1;
    return `00000000-0000-4000-8000-${prefix}${String(n).padStart(7, '0')}` as DocUUID;
  };
}

/** Envelope helper — the same ContentBlock shape documents persist. */
function wrap(data: AnyBlockData, topPt = 4, bottomPt = 6): ContentBlock {
  return { id: newUUID(), spacing: { topPt, bottomPt }, data };
}

/**
 * Apply one lab action with deterministic options; THROW on rejection so
 * a sample builder can never silently diverge from what the service
 * allows (the verify suite exercises every rejection code separately).
 * Returns the full success result so builders can chain from fresh
 * `entryId`s.
 */
function author(
  doc: DocStudioDocument,
  blockId: DocUUID,
  action: LabContentAction,
): Extract<LabContentActionResult, { ok: true }> {
  const result = applyLabAction(doc, blockId, action, {
    now: LAB_SAMPLE_CREATED_AT,
    genId: fixedIds('a000000'),
  });
  if (result.ok === false) {
    throw new Error(`lab-sample-docs: authored action failed — ${result.code}: ${result.message}`);
  }
  return result;
}

/** A reference block (P06-M2 structural type) built directly. */
function referencesBlock(
  entries: readonly { key: string; citation: string; url?: string }[],
): ContentBlock {
  return wrap({
    type: 'reference',
    title: 'References',
    entries: entries.map((entry) => ({
      id: newUUID(),
      key: entry.key,
      citation: entry.citation,
      ...(entry.url !== undefined ? { url: entry.url } : {}),
    })),
  });
}

/** Metadata preamble shared by all four samples (synthetic, honest). */
function baseDocument(uuid: string, documentId: string, title: string): DocStudioDocument {
  const doc = createDefaultDocument(uuid, LAB_SAMPLE_CREATED_AT);
  doc.metadata = {
    ...doc.metadata,
    title,
    documentId,
    organizationName: 'DocStudio Synthetic Sample (Not A Real Laboratory)',
    createdAt: LAB_SAMPLE_CREATED_AT,
    modifiedAt: LAB_SAMPLE_CREATED_AT,
  };
  return doc;
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. Sample SOP
// ─────────────────────────────────────────────────────────────────────────────

/**
 * A sample standard operating procedure.  Demonstrates: the equipment
 * list, multi-level procedure steps (main/sub/note/warning), acceptance
 * criteria, references and signatures — all authored through the
 * template factories PLUS real `applyLabAction` edits (adding and
 * editing an equipment item, adding and editing a procedure step, adding
 * a criterion and setting the overall verdict).
 */
export function buildLabSopSampleDoc(): DocStudioDocument {
  let doc = baseDocument(
    '00000000-0000-4000-8000-000000000501',
    'SOP-P06-M5',
    'Illustrative SOP — Loss on Drying (Not A Real Method)',
  );

  const equipment = createTemplateEquipmentListBlock(
    [
      { name: 'Analytical balance', assetTag: 'LAB-B01', manufacturer: 'ExampleCorp', modelNumber: 'AB-220', calibrationDue: '2027-01-31' },
      { name: 'Drying oven', assetTag: 'LAB-O04', manufacturer: 'ExampleCorp', modelNumber: 'DO-115', calibrationDue: '2027-03-15' },
      { name: 'Desiccator', mandatory: false },
      { name: 'Moisture dishes (×6)', mandatory: false },
    ],
    { title: 'Equipment and consumables' },
  );

  const procedure = createTemplateProcedureStepsBlock(
    [
      { text: 'Weigh 2.0 g ± 0.1 g of the homogenised sample into a dried, cooled moisture dish.' },
      { text: 'Record the initial mass to 0.1 mg.', level: 'sub' },
      { text: 'Place the dish uncovered in the drying oven at 105 ± 2 °C for 3 h.' },
      { text: 'Transfer to a desiccator and cool for 30 min before weighing.', level: 'warning' },
      { text: 'Repeat drying in 1 h increments until the change in mass is ≤ 2 mg.', level: 'sub' },
      { text: 'The oven door may be opened only briefly when transferring dishes.', level: 'note' },
    ],
    { sectionTitle: 'Procedure' },
  );

  const acceptance = createTemplateAcceptanceCriteriaBlock(
    [
      {
        criterion: 'Moisture content (loss on drying)',
        specification: '≤ 5.0 % (m/m)',
        result: 'pending',
      },
      {
        criterion: 'Repeatibility of duplicate dishes',
        specification: '≤ 0.2 % absolute difference',
        result: 'pending',
      },
    ],
    { title: 'Acceptance criteria' },
  );

  const blocks: ContentBlock[] = [
    createTemplateHeadingBlock(1, 'Standard Operating Procedure — Loss on Drying'),
    createTemplateParagraphBlock(
      'This illustrative procedure shows how DocStudio laboratory blocks work together on one page. ' +
        'It is invented filler for layout verification and states no real analytical requirement.',
    ),
    createTemplateHeadingBlock(2, 'Equipment and consumables'),
    equipment,
    createTemplateHeadingBlock(2, 'Procedure'),
    procedure,
    createTemplateHeadingBlock(2, 'Acceptance criteria'),
    acceptance,
    referencesBlock([
      {
        key: '[1]',
        citation: 'ISO/IEC 17025:2017 — General requirements for the competence of testing and calibration laboratories.',
      },
      { key: '[2]', citation: 'Internal work instruction WI-004 (illustrative).' },
    ]),
    createTemplateSignatureBlock([
      { role: 'Prepared by', designation: 'Analyst' },
      { role: 'Approved by', designation: 'Laboratory Manager' },
    ]),
  ];

  doc = { ...doc, blocks };

  // ── Real authoring through the immutable service (evidence) ────────────
  const equipmentId = equipment.id;
  const addedItem = author(doc, equipmentId, { action: 'add-equipment-item' });
  const newItemId = addedItem.entryId;
  if (newItemId === undefined) throw new Error('lab-sample-docs: add-equipment-item returned no entryId');
  doc = author(addedItem.doc, equipmentId, {
    action: 'update-equipment-item',
    itemId: newItemId,
    patch: { name: 'Weighing paper', mandatory: false },
  }).doc;

  const procedureId = procedure.id;
  const addedStep = author(doc, procedureId, { action: 'add-procedure-step' });
  const newStepId = addedStep.entryId;
  if (newStepId === undefined) throw new Error('lab-sample-docs: add-procedure-step returned no entryId');
  doc = author(addedStep.doc, procedureId, {
    action: 'update-procedure-step',
    stepId: newStepId,
    patch: {
      level: 'main',
      stepNumber: '7',
      spans: [{ text: 'Report the result to one decimal place with the drying temperature.' }],
    },
  }).doc;

  const acceptanceId = acceptance.id;
  const addedCriterion = author(doc, acceptanceId, { action: 'add-acceptance-criterion' });
  const newCriterionId = addedCriterion.entryId;
  if (newCriterionId === undefined) {
    throw new Error('lab-sample-docs: add-acceptance-criterion returned no entryId');
  }
  doc = author(addedCriterion.doc, acceptanceId, {
    action: 'update-acceptance-criterion',
    criterionId: newCriterionId,
    patch: {
      criterion: 'Sample identity and paperwork complete',
      specification: 'Sample ID recorded; balance log signed',
    },
  }).doc;
  doc = author(doc, acceptanceId, {
    action: 'set-acceptance-overall',
    result: 'pending',
  }).doc;

  return doc;
}

// ─────────────────────────────────────────────────────────────────────────────
// 2. Sample technical procedure
// ─────────────────────────────────────────────────────────────────────────────

/**
 * A sample technical procedure / laboratory-developed method.
 * Demonstrates: procedure steps, an observation table (with one filled
 * and one blank value), a calculation block whose LaTeX is validated by
 * the REAL MathJax engine through `applyLabAction`, an existing `formula`
 * block alongside, and a page break.
 */
export function buildLabProcedureSampleDoc(): DocStudioDocument {
  let doc = baseDocument(
    '00000000-0000-4000-8000-000000000502',
    'TMP-P06-M5',
    'Illustrative Technical Procedure — pH Measurement (Not A Real Method)',
  );

  const safety = createTemplateListBlock(
    [
      'Wear eye protection when handling buffer solutions.',
      'Dispose of spent buffers as directed by the safety data sheets.',
    ],
    { listType: 'bullet' },
  );

  const procedure = createTemplateProcedureStepsBlock(
    [
      { text: 'Calibrate the pH meter with pH 4.00, 7.00 and 10.01 buffers at 25 °C.' },
      { text: 'Rinse the electrode with deionised water and blot dry between buffers.', level: 'sub' },
      { text: 'Immerse the electrode in the sample and record the stable reading.', level: 'main' },
      { text: 'Stability is reached when the drift is ≤ 0.02 pH units per minute.', level: 'note' },
    ],
    { sectionTitle: 'Method steps' },
  );

  const observations = createTemplateObservationBlock(
    [
      { parameter: 'Sample temperature', observedValue: '24.8 °C' },
      { parameter: 'Electrode offset (mV)', observedValue: '' },
      { parameter: 'Appearance of solution', observedValue: 'Clear, colourless', remarks: 'No visible particulates' },
    ],
    { title: 'Technical observations' },
  );

  const calculation = createTemplateCalculationBlock(
    [
      {
        label: 'Mean of duplicate readings',
        latex: '\\bar{x} = \\frac{x_1 + x_2}{2}',
        result: '= 7.04',
      },
    ],
    { title: 'Calculation' },
  );

  // Existing Formula block (P06-M3) alongside the lab calculation block.
  const formula = wrap({
    type: 'formula',
    latex: 'E = E^{0} + \\frac{RT}{nF}\\ln a_{\\mathrm{H^{+}}}',
    hAlign: 'center',
    displayMode: true,
    variableDefinitions: [
      { id: newUUID(), symbol: 'E^{0}', definition: 'Standard electrode potential', unit: 'V' },
      { id: newUUID(), symbol: 'R', definition: 'Gas constant', unit: 'J·mol⁻¹·K⁻¹' },
      { id: newUUID(), symbol: 'T', definition: 'Absolute temperature', unit: 'K' },
    ],
  });

  const blocks: ContentBlock[] = [
    createTemplateHeadingBlock(1, 'Technical Procedure — pH Measurement of Aqueous Solutions'),
    createTemplateParagraphBlock(
      'This illustrative technical procedure combines the laboratory blocks with existing content ' +
        'blocks.  Every value shown is invented filler.',
    ),
    createTemplateHeadingBlock(2, 'Safety'),
    safety,
    createTemplateHeadingBlock(2, 'Method steps'),
    procedure,
    createTemplateHeadingBlock(2, 'Observations'),
    observations,
    createTemplateHeadingBlock(2, 'Calculation'),
    calculation,
    formula,
    wrap({ type: 'page-break' }),
    createTemplateHeadingBlock(2, 'Reporting'),
    createTemplateParagraphBlock(
      'Report the mean pH to two decimal places together with the measurement temperature.',
    ),
    referencesBlock([
      { key: '[1]', citation: 'ISO/IEC 17025:2017 — General requirements for the competence of testing and calibration laboratories.' },
    ]),
  ];

  doc = { ...doc, blocks };

  // ── Real authoring: a second calculation step through the real engine ──
  const calculationId = calculation.id;
  const added = author(doc, calculationId, { action: 'add-calculation-step' });
  const stepId = added.entryId;
  if (stepId === undefined) throw new Error('lab-sample-docs: add-calculation-step returned no entryId');
  doc = author(added.doc, calculationId, {
    action: 'update-calculation-step',
    stepId,
    patch: {
      label: 'Relative combined uncertainty',
      latex: 'u_{c} = \\sqrt{u_{1}^{2} + u_{2}^{2}}',
      substitution: '= \\sqrt{0.01^{2} + 0.02^{2}}',
      result: '= 0.022',
    },
  }).doc;
  doc = author(doc, calculationId, {
    action: 'set-calculation-conclusion',
    text: 'Report pH = 7.04 with an expanded uncertainty of ±0.05 (k = 2).',
  }).doc;

  return doc;
}

// ─────────────────────────────────────────────────────────────────────────────
// 3. Sample measurement worksheet / rough datasheet
// ─────────────────────────────────────────────────────────────────────────────

/**
 * A sample measurement worksheet / rough datasheet.  Demonstrates: the
 * measurement block with configurable columns (header + unit), mostly
 * BLANK rows that provide printed handwriting space, an uncertainty
 * note, one row filled through real `set-measurement-cell` authoring, an
 * observation table with blank values and a signature block.
 */
export function buildLabWorksheetSampleDoc(): DocStudioDocument {
  let doc = baseDocument(
    '00000000-0000-4000-8000-000000000503',
    'WS-P06-M5',
    'Illustrative Rough Datasheet — Balance Calibration Checks (Not A Real Record)',
  );

  const worksheet = createTemplateMeasurementBlock(
    [
      { header: 'Check weight', unit: 'g' },
      { header: 'Nominal value', unit: 'g' },
      { header: 'Indicated', unit: 'g' },
      { header: 'Difference', unit: 'mg' },
      { header: 'Initials' },
    ],
    [
      ['CW-100', '100.0000', '', '', ''],
      ['CW-100', '100.0000', '', '', ''],
      ['CW-50', '50.0000', '', '', ''],
      ['CW-20', '20.0000', '', '', ''],
      ['CW-10', '10.0000', '', '', ''],
      ['CW-1', '1.0000', '', '', ''],
    ],
    {
      title: 'Balance calibration check — daily rough datasheet',
      uncertaintyNote: 'Expanded uncertainty of the check weights: U = 0.05 mg (k = 2).',
    },
  );

  const observations = createTemplateObservationBlock(
    [
      { parameter: 'Room temperature', observedValue: '' },
      { parameter: 'Relative humidity', observedValue: '' },
      { parameter: 'Balance level bubble centred', observedValue: '' },
    ],
    { title: 'Instrument condition (record before use)' },
  );

  const blocks: ContentBlock[] = [
    createTemplateHeadingBlock(1, 'Rough Datasheet — Daily Balance Calibration Checks'),
    createTemplateParagraphBlock(
      'Print this page and record check-weight readings by hand, or type values into the blank ' +
        'cells.  Blank cells stay blank in the PDF and keep the row height for writing space.',
    ),
    worksheet,
    createTemplateHeadingBlock(2, 'Instrument condition'),
    observations,
    createTemplateSignatureBlock([
      { role: 'Performed by', designation: 'Analyst' },
      { role: 'Verified by', designation: 'Reviewer' },
    ]),
  ];

  doc = { ...doc, blocks };

  // ── Real authoring: fill the first row through the service ─────────────
  const worksheetId = worksheet.id;
  const measurement = worksheet.data;
  if (measurement.type !== 'measurement') throw new Error('lab-sample-docs: worksheet is not a measurement block');
  const [colWeight, colNominal, colIndicated, colDifference, colInitials] = measurement.columns;
  const firstRowId = measurement.rows[0]?.id;
  if (
    colWeight === undefined || colNominal === undefined || colIndicated === undefined ||
    colDifference === undefined || colInitials === undefined || firstRowId === undefined
  ) {
    throw new Error('lab-sample-docs: worksheet columns/rows missing');
  }
  doc = author(doc, worksheetId, {
    action: 'set-measurement-cell', rowId: firstRowId, columnId: colIndicated.id, value: '100.0005',
  }).doc;
  doc = author(doc, worksheetId, {
    action: 'set-measurement-cell', rowId: firstRowId, columnId: colDifference.id, value: '+0.5',
  }).doc;
  doc = author(doc, worksheetId, {
    action: 'set-measurement-cell', rowId: firstRowId, columnId: colInitials.id, value: 'IW',
  }).doc;
  const addedRow = author(doc, worksheetId, { action: 'add-measurement-row' });
  const newRowId = addedRow.entryId;
  if (newRowId === undefined) throw new Error('lab-sample-docs: add-measurement-row returned no entryId');
  doc = author(addedRow.doc, worksheetId, {
    action: 'set-measurement-cell', rowId: newRowId, columnId: colWeight.id, value: 'CW-500',
  }).doc;

  return doc;
}

// ─────────────────────────────────────────────────────────────────────────────
// 4. Sample exhibit / annexure
// ─────────────────────────────────────────────────────────────────────────────

/**
 * A sample exhibit / annexure document.  Demonstrates: the existing
 * exhibit block (P06-M2) carrying an annexure label + notes, an
 * equipment list table, an existing generic table, a section break, a
 * page break and an acceptance-criteria checklist — laboratory blocks
 * reusing the same structural machinery.
 */
export function buildLabExhibitSampleDoc(): DocStudioDocument {
  let doc = baseDocument(
    '00000000-0000-4000-8000-000000000504',
    'ANN-P06-M5',
    'Illustrative Annexure — Equipment Log Sheet (Not A Real Record)',
  );

  const exhibit = wrap({
    type: 'exhibit',
    label: 'Annexure A',
    title: 'Instrument daily-use log sheet (illustrative)',
    notes: 'Photocopy this annexure for daily use; retain completed sheets with the test record.',
  });

  const equipment = createTemplateEquipmentListBlock(
    [
      { name: 'Analytical balance', assetTag: 'LAB-B01', calibrationDue: '2027-01-31' },
      { name: 'pH meter', assetTag: 'LAB-P02', calibrationDue: '2027-02-28' },
      { name: 'Drying oven', assetTag: 'LAB-O04', calibrationDue: '2027-03-15', mandatory: false },
    ],
    { title: 'Instruments covered by this log' },
  );

  const checklist = createTemplateTableBlock(
    ['Date', 'Instrument', 'Performed by', 'Remark'],
    [
      ['', '', '', ''],
      ['', '', '', ''],
      ['', '', '', ''],
      ['', '', '', ''],
    ],
    { caption: 'Daily use log (blank rows for handwritten entries)' },
  );

  const signoff = createTemplateAcceptanceCriteriaBlock(
    [
      {
        criterion: 'All entries complete and signed',
        specification: 'No blank required fields at review',
        result: 'pending',
      },
    ],
    { title: 'Record review' },
  );

  const blocks: ContentBlock[] = [
    createTemplateHeadingBlock(1, 'Annexure A — Equipment Log Sheet'),
    exhibit,
    equipment,
    wrap({ type: 'section-break', title: 'Daily use log' }, 6, 6),
    checklist,
    wrap({ type: 'page-break' }),
    createTemplateHeadingBlock(2, 'Record review'),
    createTemplateParagraphBlock(
      'The reviewer records the overall verdict below after checking the log for completeness. ' +
        'DocStudio stores the verdict the reviewer selects; it performs no conformity evaluation.',
    ),
    signoff,
  ];

  doc = { ...doc, blocks };

  // ── Real authoring: the reviewer's verdict through the service ─────────
  doc = author(doc, signoff.id, {
    action: 'set-acceptance-overall',
    result: 'pass',
  }).doc;

  return doc;
}
