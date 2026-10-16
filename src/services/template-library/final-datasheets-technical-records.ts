/**
 * DocStudio — Final datasheet / technical-record template samples (P03-M3)
 * ═══════════════════════════════════════════════════════════════════════════
 * Built-in starters for project_details.md §11.5:
 *   • Processed Test Results Record
 *       (`builtin.final-datasheets-technical-records.processed-test-results-record`)
 *   • Measurement Uncertainty Summary
 *       (`builtin.final-datasheets-technical-records.measurement-uncertainty-summary`)
 *
 * Both distinguish RAW observations (held in the originating worksheet) from
 * PROCESSED/calculated results.  No scientific values are invented: every
 * result cell is an empty or bracketed placeholder, and the formulae are
 * generic textbook reductions the author must replace or confirm against
 * their own method.
 *
 * @module services/template-library/final-datasheets-technical-records
 */

import {
  createDefaultTemplate,
  createTemplateSection,
  createTemplateParagraphBlock,
  createTemplateTableBlock,
  createTemplateCalloutBlock,
  createTemplateSignatureBlock,
  createTemplateCalculationBlock,
  createTemplateAcceptanceCriteriaBlock,
  createTemplateReferenceHint,
} from '../../types/template-defaults';
import type { DocStudioTemplate } from '../../types/template';
import { BUILTIN_TEMPLATE_TIMESTAMP, BUILTIN_TEMPLATE_AUTHOR } from './shared';

/** Processed Test Results Record — structured results and review (§11.5). */
export function createProcessedTestResultsRecordTemplate(): DocStudioTemplate {
  const identification = createTemplateTableBlock(
    ['Field', 'Entry'],
    [
      ['Sample / item ID', ''],
      ['Method / reference', ''],
      ['Date of processing', ''],
      ['Processed by', ''],
      ['Raw-data worksheet reference', ''],
    ],
    { caption: 'Link this record to the raw worksheet that produced its inputs.' },
  );
  const rawNote = createTemplateCalloutBlock(
    'note',
    'Record where the raw observations come from (worksheet ID or attachment) so every processed result remains traceable to the data behind it. Raw values themselves stay in the raw record.',
    { title: 'Traceability' },
  );
  const results = createTemplateTableBlock(
    ['Parameter', 'Unit', 'Result', 'Uncertainty (if applicable)', 'Remarks'],
    [
      ['[parameter or characteristic]', '[unit]', '', '', ''],
      ['[parameter or characteristic]', '[unit]', '', '', ''],
      ['[parameter or characteristic]', '[unit]', '', '', ''],
    ],
    { caption: 'Enter processed results only — leave cells empty rather than guessing.' },
  );
  const calculations = createTemplateCalculationBlock(
    [
      {
        label: 'Mean',
        latex: 'x̄ = (Σᵢ xᵢ) / n',
        substitution: '[substitute the recorded values]',
        result: '[result with unit]',
      },
    ],
    {
      title: 'Data reduction steps',
      conclusionText: '[state the final reported result and its units]',
    },
  );
  const calculationsNote = createTemplateCalloutBlock(
    'info',
    'The mean formula is a generic example only. Replace these steps with the calculations your method defines, including rounding and unit handling.',
    { title: 'Author guidance' },
  );
  const qc = createTemplateAcceptanceCriteriaBlock(
    [
      {
        criterion: '[quality-control check performed with this work]',
        specification: '[QC limit from your method]',
        result: 'pending',
      },
      {
        criterion: '[additional QC check, if applicable]',
        specification: '[QC limit]',
        result: 'pending',
      },
    ],
    { title: 'Quality-control evaluation', overallResult: 'pending' },
  );
  const review = createTemplateParagraphBlock(
    'State who checked the calculations and results against the raw data, what was checked, and the outcome of that review before the record is released.',
  );
  const signoff = createTemplateSignatureBlock([
    { role: 'Prepared by', designation: '[name / designation]' },
    { role: 'Reviewed by', designation: '[name / designation]' },
  ]);
  const notes = createTemplateParagraphBlock(
    'Add any notes needed to interpret the results — limitations, repeat work, or assumptions applied during processing.',
  );

  return createDefaultTemplate({
    id: 'builtin.final-datasheets-technical-records.processed-test-results-record',
    origin: 'builtin',
    name: 'Processed Test Results Record',
    description:
      'Results record with identification, raw-data linkage, a processed-results table, calculation steps, QC evaluation and review sign-off. All result cells start empty.',
    category: 'final-datasheets-technical-records',
    tags: ['results', 'technical record', 'processed data', 'calculation', 'review'],
    author: BUILTIN_TEMPLATE_AUTHOR,
    createdAt: BUILTIN_TEMPLATE_TIMESTAMP,
    updatedAt: BUILTIN_TEMPLATE_TIMESTAMP,
    defaults: {
      metadata: {
        title: 'Processed Test Results Record',
        documentType: 'Technical Record',
        department: 'Laboratory',
      },
    },
    sections: [
      createTemplateSection('Record Identification', {
        description: 'What was processed, by whom and from which raw data.',
        prompt: 'Adapt the fields to your own record-numbering convention.',
        blocks: [identification],
      }),
      createTemplateSection('Raw Data Sources', {
        description: 'Where the input observations live.',
        prompt: 'Reference the exact worksheet or attachment for every input.',
        blocks: [rawNote],
      }),
      createTemplateSection('Processed Results', {
        description: 'The results themselves, with units and uncertainty where used.',
        prompt: 'Add rows per parameter; never pre-fill a value you have not calculated.',
        blocks: [results],
      }),
      createTemplateSection('Calculations', {
        description: 'The data-reduction steps from raw values to results.',
        prompt: 'Replace the generic example with your method\'s formulas and rounding rules.',
        blocks: [calculations, calculationsNote],
      }),
      createTemplateSection('Quality-Control Evaluation', {
        description: 'How the QC checks accompanying this work turned out.',
        prompt: 'Enter your real QC checks and limits; "pending" is the starting state.',
        blocks: [qc],
      }),
      createTemplateSection('Notes', {
        description: 'Anything needed to interpret the results.',
        prompt: 'Record limitations or repeats here rather than editing the result table silently.',
        blocks: [notes],
      }),
      createTemplateSection('Review and Authorisation', {
        description: 'Independent check of results against raw data, then approval.',
        prompt: 'Replace the placeholder signers with the actual names and roles.',
        blocks: [review, signoff],
        references: [
          createTemplateReferenceHint('Result-reporting reference'),
        ],
      }),
    ],
  });
}

/** Measurement Uncertainty Summary — uncertainty budget record (§11.5). */
export function createMeasurementUncertaintySummaryTemplate(): DocStudioTemplate {
  const description = createTemplateParagraphBlock(
    'Describe the measurement this budget belongs to: the quantity measured, method reference, range or level, and the conditions applying to it. Replace this guidance with your own text.',
  );
  const sources = createTemplateTableBlock(
    ['Uncertainty source', 'Basis', 'Standard uncertainty uᵢ', 'Notes'],
    [
      ['[e.g. repeatability of the measurement]', '[state how it was evaluated]', '', ''],
      ['[e.g. reference standard / certificate]', '[state how it was evaluated]', '', ''],
      ['[e.g. resolution of the instrument]', '[state how it was evaluated]', '', ''],
      ['[add or remove sources as analysed]', '[state how it was evaluated]', '', ''],
    ],
    { caption: 'Example source names are starting prompts — analyse YOUR measurement.' },
  );
  const combined = createTemplateCalculationBlock(
    [
      {
        label: 'Combined standard uncertainty',
        latex: 'u_c = √(Σᵢ uᵢ²)',
        substitution: '[substitute the contributions listed above]',
        result: '[u_c with unit]',
      },
      {
        label: 'Expanded uncertainty',
        latex: 'U = k · u_c',
        substitution: '[state the coverage factor k you assert and why]',
        result: '[U with unit]',
      },
    ],
    {
      title: 'Combination and expansion',
      conclusionText: '[state k and the level of confidence claimed for the reported result]',
    },
  );
  const combinedNote = createTemplateCalloutBlock(
    'info',
    'The formulae are generic (independent-input combination). Confirm the model fits your measurement — correlations or other combination rules may apply — and justify the coverage factor you choose.',
    { title: 'Author guidance' },
  );
  const reporting = createTemplateParagraphBlock(
    'State how results and their uncertainty will be reported (where U appears, rounding applied, and any client-facing wording), following your own reporting rules.',
  );
  const review = createTemplateParagraphBlock(
    'Record who reviewed the budget — sources, values, and the coverage factor — and when.',
  );
  const signoff = createTemplateSignatureBlock([
    { role: 'Prepared by', designation: '[name / designation]' },
    { role: 'Reviewed by', designation: '[name / designation]' },
  ]);

  return createDefaultTemplate({
    id: 'builtin.final-datasheets-technical-records.measurement-uncertainty-summary',
    origin: 'builtin',
    name: 'Measurement Uncertainty Summary',
    description:
      'Uncertainty budget record: measurement description, source table, combination/expanded formulae, reporting statement and review. Source names are prompts, not a required list.',
    category: 'final-datasheets-technical-records',
    tags: ['uncertainty', 'measurement', 'metrology', 'technical record', 'budget'],
    author: BUILTIN_TEMPLATE_AUTHOR,
    createdAt: BUILTIN_TEMPLATE_TIMESTAMP,
    updatedAt: BUILTIN_TEMPLATE_TIMESTAMP,
    defaults: {
      metadata: {
        title: 'Measurement Uncertainty Summary',
        documentType: 'Technical Record',
        department: 'Laboratory',
      },
    },
    sections: [
      createTemplateSection('Measurement Description', {
        description: 'The measurement the uncertainty statement belongs to.',
        prompt: 'Name the quantity, method, range and conditions precisely.',
        blocks: [description],
        references: [
          createTemplateReferenceHint('Method reference'),
          createTemplateReferenceHint('Basis for uncertainty evaluation'),
        ],
      }),
      createTemplateSection('Uncertainty Sources', {
        description: 'Contributors identified and their standard uncertainties.',
        prompt: 'Analyse your own measurement; the example rows are prompts only.',
        blocks: [sources],
      }),
      createTemplateSection('Combined and Expanded Uncertainty', {
        description: 'How contributions combine and how the expanded value is obtained.',
        prompt: 'Justify the coverage factor and confirm the combination model fits.',
        blocks: [combined, combinedNote],
      }),
      createTemplateSection('Reporting Statement', {
        description: 'How the result and its uncertainty will be reported.',
        prompt: 'Align the wording with your own reporting procedure.',
        blocks: [reporting],
      }),
      createTemplateSection('Review', {
        description: 'Who checked the budget and when.',
        prompt: 'Replace the placeholder signers with the actual names and roles.',
        blocks: [review, signoff],
      }),
    ],
  });
}
