/**
 * DocStudio — Worksheet template samples (P03-M3)
 * ═══════════════════════════════════════════════════════════════════════════
 * Built-in starters for project_details.md §11.4:
 *   • Raw Observation Worksheet
 *       (`builtin.worksheets-rough-datasheets.raw-observation-worksheet`)
 *   • Replicate Reading Worksheet
 *       (`builtin.worksheets-rough-datasheets.replicate-reading-worksheet`)
 *
 * These are manual-recording layouts: identification grids, blank observation
 * rows and reading tables designed to be completed by hand when printed or in
 * the editor later.  They deliberately imply NO instrument connectivity —
 * DocStudio does not acquire data from instruments (see the prompts).
 *
 * @module services/template-library/worksheets-rough-datasheets
 */

import {
  createDefaultTemplate,
  createTemplateSection,
  createTemplateParagraphBlock,
  createTemplateTableBlock,
  createTemplateCalloutBlock,
  createTemplateSignatureBlock,
  createTemplateObservationBlock,
  createTemplateMeasurementBlock,
} from '../../types/template-defaults';
import type { DocStudioTemplate } from '../../types/template';
import { BUILTIN_TEMPLATE_TIMESTAMP, BUILTIN_TEMPLATE_AUTHOR } from './shared';

/** Raw Observation Worksheet — free-form manual observation recording (§11.4). */
export function createRawObservationWorksheetTemplate(): DocStudioTemplate {
  const identification = createTemplateTableBlock(
    ['Field', 'Entry'],
    [
      ['Sample / item ID', ''],
      ['Description', ''],
      ['Date', ''],
      ['Performed by', ''],
      ['Method / reference', ''],
      ['Worksheet page', ''],
    ],
    { caption: 'Complete the identification block before recording begins.' },
  );
  const observations = createTemplateObservationBlock(
    [
      { parameter: '1. [parameter or observable]', observedValue: '' },
      { parameter: '2. [parameter or observable]', observedValue: '' },
      { parameter: '3. [parameter or observable]', observedValue: '' },
      { parameter: '4. [parameter or observable]', observedValue: '' },
    ],
    { title: 'Recorded observations' },
  );
  const readings = createTemplateMeasurementBlock(
    [
      { header: 'Reading', unit: '[unit]' },
      { header: 'Repeat / check', unit: '[unit]' },
      { header: 'Remarks' },
    ],
    [
      ['', '', ''],
      ['', '', ''],
      ['', '', ''],
      ['', '', ''],
    ],
    { title: 'Instrument readings (record manually)' },
  );
  const recordingNote = createTemplateCalloutBlock(
    'note',
    'Record readings and observations by hand or by typing them here. DocStudio does not acquire data from instruments, and this worksheet does not replace your contemporaneous recording rules.',
    { title: 'Recording' },
  );
  const deviations = createTemplateParagraphBlock(
    'Use this space for deviations, interruptions, re-tests or anything unusual about the session — record it as it happens rather than at the end.',
  );
  const signoff = createTemplateSignatureBlock([
    { role: 'Performed by', designation: '[name / designation]' },
    { role: 'Verified by', designation: '[name / designation]' },
  ]);

  return createDefaultTemplate({
    id: 'builtin.worksheets-rough-datasheets.raw-observation-worksheet',
    origin: 'builtin',
    name: 'Raw Observation Worksheet',
    description:
      'Blank manual-recording layout with an identification grid, open observation rows, a readings table and remarks. Designed to be filled in by hand or in the editor.',
    category: 'worksheets-rough-datasheets',
    tags: ['worksheet', 'raw data', 'observation', 'rough datasheet', 'recordings'],
    author: BUILTIN_TEMPLATE_AUTHOR,
    createdAt: BUILTIN_TEMPLATE_TIMESTAMP,
    updatedAt: BUILTIN_TEMPLATE_TIMESTAMP,
    defaults: {
      metadata: {
        title: 'Raw Observation Worksheet',
        documentType: 'Worksheet',
        department: 'Laboratory',
      },
    },
    sections: [
      createTemplateSection('Worksheet Identification', {
        description: 'What this worksheet belongs to and who is filling it in.',
        prompt: 'Adapt the fields to your own sample-identification convention.',
        blocks: [identification],
      }),
      createTemplateSection('Observations', {
        description: 'Open rows for parameters and observed values.',
        prompt: 'Rename the rows to the actual observables, or add rows as needed.',
        blocks: [observations],
      }),
      createTemplateSection('Instrument Readings', {
        description: 'Grid for readings taken during the session.',
        prompt: 'Set the units before printing; leave cells blank for handwriting.',
        blocks: [readings, recordingNote],
      }),
      createTemplateSection('Deviations and Remarks', {
        description: 'Anything unusual about the session.',
        prompt: 'Record deviations as they occur, with times where they matter.',
        blocks: [deviations],
      }),
      createTemplateSection('Sign-off', {
        description: 'Who performed and who checked the recorded work.',
        prompt: 'Replace the placeholder signers with the actual names and roles.',
        blocks: [signoff],
      }),
    ],
  });
}

/** Replicate Reading Worksheet — structured replicate/log recording (§11.4). */
export function createReplicateReadingWorksheetTemplate(): DocStudioTemplate {
  const identification = createTemplateTableBlock(
    ['Field', 'Entry'],
    [
      ['Measurement quantity', ''],
      ['Method / reference', ''],
      ['Instrument ID / tag', ''],
      ['Date', ''],
      ['Operator', ''],
      ['Unit to be recorded', ''],
    ],
    { caption: 'Identify the measurement before the first reading is taken.' },
  );
  const conditions = createTemplateTableBlock(
    ['Condition', 'Set / observed', 'Notes'],
    [
      ['Temperature', '', ''],
      ['Relative humidity', '', ''],
      ['Other (specify)', '', ''],
    ],
    { caption: 'Record conditions relevant to your measurement; delete rows that do not apply.' },
  );
  const replicates = createTemplateMeasurementBlock(
    [
      { header: 'Replicate' },
      { header: 'Reading', unit: '[unit]' },
      { header: 'Time' },
      { header: 'Remarks' },
    ],
    [
      ['1', '', '', ''],
      ['2', '', '', ''],
      ['3', '', '', ''],
      ['4', '', '', ''],
      ['5', '', '', ''],
    ],
    {
      title: 'Replicate readings',
      uncertaintyNote: 'Add or remove replicate rows to match your plan — the example count is not a requirement.',
    },
  );
  const outliers = createTemplateParagraphBlock(
    'Record any repeat or additional readings taken, and state how your laboratory treats outliers (method, justification, who decided). Do not silently discard readings.',
  );
  const signoff = createTemplateSignatureBlock([
    { role: 'Performed by', designation: '[name / designation]' },
    { role: 'Verified by', designation: '[name / designation]' },
  ]);

  return createDefaultTemplate({
    id: 'builtin.worksheets-rough-datasheets.replicate-reading-worksheet',
    origin: 'builtin',
    name: 'Replicate Reading Worksheet',
    description:
      'Structured log for replicate instrument readings with conditions, a numbered replicate grid, outlier/repeat notes and sign-off. Number of replicates is yours to set.',
    category: 'worksheets-rough-datasheets',
    tags: ['worksheet', 'replicate', 'readings', 'instrument log', 'raw data'],
    author: BUILTIN_TEMPLATE_AUTHOR,
    createdAt: BUILTIN_TEMPLATE_TIMESTAMP,
    updatedAt: BUILTIN_TEMPLATE_TIMESTAMP,
    defaults: {
      metadata: {
        title: 'Replicate Reading Worksheet',
        documentType: 'Worksheet',
        department: 'Laboratory',
      },
    },
    sections: [
      createTemplateSection('Worksheet Identification', {
        description: 'What is being measured, with what, by whom.',
        prompt: 'Adapt the fields to your own identification convention.',
        blocks: [identification],
      }),
      createTemplateSection('Measurement Conditions', {
        description: 'Ambient or setup conditions recorded with the readings.',
        prompt: 'Only keep conditions that matter for this measurement.',
        blocks: [conditions],
      }),
      createTemplateSection('Replicate Readings', {
        description: 'The replicate grid itself.',
        prompt: 'Set units, times and replicate count to your own plan before use.',
        blocks: [replicates],
      }),
      createTemplateSection('Repeats and Outliers', {
        description: 'Repeats taken and how unusual readings are handled.',
        prompt: 'Reference your own outlier-treatment rule rather than inventing one here.',
        blocks: [outliers],
      }),
      createTemplateSection('Sign-off', {
        description: 'Who performed and who checked the readings.',
        prompt: 'Replace the placeholder signers with the actual names and roles.',
        blocks: [signoff],
      }),
    ],
  });
}
