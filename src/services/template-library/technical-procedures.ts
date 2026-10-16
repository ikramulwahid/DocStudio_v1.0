/**
 * DocStudio — Technical-procedure template samples (P03-M3)
 * ═══════════════════════════════════════════════════════════════════════════
 * Built-in starters for project_details.md §11.2:
 *   • Testing / Calibration Procedure  (`builtin.technical-procedures.testing-calibration-procedure`)
 *   • Method Verification / Validation Protocol
 *       (`builtin.technical-procedures.method-verification-validation-protocol`)
 *
 * Both carry author prompts instead of laboratory-specific values: ranges,
 * limits, criteria and parameters must come from the user's own method or
 * specification.  Placeholders in brackets are deliberately NOT results or
 * requirements — they are fields to complete.
 *
 * @module services/template-library/technical-procedures
 */

import {
  createDefaultTemplate,
  createTemplateSection,
  createTemplateParagraphBlock,
  createTemplateListBlock,
  createTemplateTableBlock,
  createTemplateCalloutBlock,
  createTemplateSignatureBlock,
  createTemplateEquipmentListBlock,
  createTemplateProcedureStepsBlock,
  createTemplateAcceptanceCriteriaBlock,
  createTemplateObservationBlock,
  createTemplateReferenceHint,
} from '../../types/template-defaults';
import type { DocStudioTemplate } from '../../types/template';
import { BUILTIN_TEMPLATE_TIMESTAMP, BUILTIN_TEMPLATE_AUTHOR } from './shared';

/** Testing / Calibration Procedure — structured technical working procedure. */
export function createTestingCalibrationProcedureTemplate(): DocStudioTemplate {
  const scope = createTemplateParagraphBlock(
    'State what this procedure covers — the measurand, product or activity tested/calibrated, the range covered, and any exclusions. Replace this guidance with your own text.',
  );
  const method = createTemplateParagraphBlock(
    'Describe the method or principle of the work at a level that lets a competent reader understand why the steps are performed. Reference the method source (standard, manual or internal method) rather than restating it in full.',
  );
  const equipment = createTemplateEquipmentListBlock(
    [
      { name: '[primary equipment used — name, model and asset/serial tag]', mandatory: true },
      { name: '[reference standards, reference materials or counter-weights]', mandatory: true },
      { name: '[consumables, tooling or software — list if applicable]', mandatory: false },
    ],
    { title: 'Equipment, materials and software' },
  );
  const environmentTable = createTemplateTableBlock(
    ['Condition', 'Requirement / acceptable range', 'Recorded during work'],
    [
      ['Temperature', '[state the range your method requires, or leave blank if uncontrolled]', ''],
      ['Relative humidity', '[state the range your method requires, or leave blank if uncontrolled]', ''],
      ['Other (specify)', '[state the condition and range]', ''],
    ],
    { caption: 'Replace with the environmental conditions relevant to this method.' },
  );
  const procedureSteps = createTemplateProcedureStepsBlock(
    [
      { text: 'Describe preparation: checks, warm-up/stabilisation and set-up of equipment.' },
      { text: 'Describe the core measurement or test sequence in numbered working steps.' },
      { text: 'Describe intermediate checks, repeat conditions or hold points.' },
      { text: 'Describe how the completed work is checked before results are recorded.', level: 'sub' },
      {
        text: 'Insert safety-critical instructions (hot surfaces, pressurised systems, hazardous reagents, etc.) as warning steps wherever they apply.',
        level: 'warning',
      },
    ],
    { sectionTitle: 'Working sequence' },
  );
  const qcList = createTemplateListBlock(
    [
      'Define the quality-control checks that apply to this work (e.g. control or check items, blanks, repeats).',
      'State the acceptance limit for each check, taken from your method or specification.',
      'State what happens when a check does not meet its limit.',
    ],
    { listType: 'checklist' },
  );
  const calculations = createTemplateParagraphBlock(
    'State how raw data is reduced to a result: formulas used, rounding rules, units and where the detailed calculation method is documented. Do not embed results — this template is structure only.',
  );
  const safety = createTemplateCalloutBlock(
    'warning',
    'List the hazards, required protective equipment and emergency arrangements for this specific work. Replace this placeholder — the template cannot know your hazards.',
    { title: 'Safety' },
  );
  const safetyList = createTemplateListBlock([
    'Hazards specific to this procedure — [describe].',
    'Personal protective equipment required — [list].',
    'Waste handling or disposal arrangements — [describe].',
  ]);
  const records = createTemplateListBlock(
    [
      'Raw data records produced (worksheet or log reference).',
      'Quality-control records produced.',
      'Where the completed records are filed and how long they are retained.',
    ],
    { listType: 'checklist' },
  );
  const acceptance = createTemplateAcceptanceCriteriaBlock(
    [
      {
        criterion: '[the characteristic or quantity to be judged]',
        specification: '[the specification or limit from your method / standard]',
        result: 'pending',
      },
      {
        criterion: '[additional criterion, if applicable]',
        specification: '[specification or limit]',
        result: 'pending',
      },
    ],
    {
      title: 'Acceptance criteria',
      overallResult: 'pending',
    },
  );
  const acceptanceNote = createTemplateCalloutBlock(
    'note',
    'The rows above are placeholders, not limits. Enter criteria from your own method or specification before use; "pending" is the starting state.',
    { title: 'Author guidance' },
  );
  const references = createTemplateParagraphBlock(
    'List the standards, methods, manuals and internal documents used, including edition or revision. Confirm the edition that applies to your work rather than assuming the example value.',
  );
  const approval = createTemplateSignatureBlock([
    { role: 'Prepared by', designation: '[name / designation]' },
    { role: 'Approved by', designation: '[name / designation]' },
  ]);

  return createDefaultTemplate({
    id: 'builtin.technical-procedures.testing-calibration-procedure',
    origin: 'builtin',
    name: 'Testing / Calibration Procedure',
    description:
      'Technical working procedure with scope, equipment, environmental conditions, step sequence, QC, acceptance criteria, safety and records. Fill every bracketed field from your own method.',
    category: 'technical-procedures',
    tags: ['testing', 'calibration', 'technical procedure', 'method', 'lab procedure'],
    author: BUILTIN_TEMPLATE_AUTHOR,
    createdAt: BUILTIN_TEMPLATE_TIMESTAMP,
    updatedAt: BUILTIN_TEMPLATE_TIMESTAMP,
    defaults: {
      metadata: {
        title: 'Testing / Calibration Procedure',
        documentType: 'Technical Procedure',
        department: 'Laboratory',
      },
    },
    sections: [
      createTemplateSection('Scope and Purpose', {
        description: 'What is tested/calibrated, over which range, and any exclusions.',
        prompt: 'State the measurand or activity precisely enough to bound the work.',
        blocks: [scope],
        references: [
          createTemplateReferenceHint('Applicable standard or method'),
          createTemplateReferenceHint('Edition / revision'),
        ],
      }),
      createTemplateSection('Method Overview', {
        description: 'The principle behind the work, with a pointer to the method source.',
        prompt: 'Reference the source method rather than copying it wholesale.',
        blocks: [method],
      }),
      createTemplateSection('Equipment, Materials and Software', {
        description: 'Everything the work depends on, with identification.',
        prompt: 'Record asset tags and calibration status from your own equipment register.',
        blocks: [equipment],
      }),
      createTemplateSection('Environmental Conditions', {
        description: 'Conditions the method requires and the values observed during work.',
        prompt: 'Delete rows for conditions that do not apply to your method.',
        blocks: [environmentTable],
      }),
      createTemplateSection('Procedure', {
        description: 'The ordered working sequence, including safety-critical steps.',
        prompt: 'Write steps so the work can be repeated consistently by another competent person.',
        blocks: [procedureSteps],
      }),
      createTemplateSection('Quality Control', {
        description: 'Checks performed during or after the work and their limits.',
        prompt: 'Take limits from your method or specification — do not invent them.',
        blocks: [qcList],
      }),
      createTemplateSection('Calculations and Data Reduction', {
        description: 'How raw data becomes a reported result.',
        prompt: 'Name the formulas, rounding and units that apply.',
        blocks: [calculations],
      }),
      createTemplateSection('Acceptance Criteria', {
        description: 'The criteria used to judge the outcome of the work.',
        prompt: 'Enter real criteria before use; the starter rows are placeholders.',
        blocks: [acceptance, acceptanceNote],
      }),
      createTemplateSection('Safety, Cautions and PPE', {
        description: 'Hazards and protective arrangements specific to this procedure.',
        prompt: 'Replace every placeholder with your own hazard assessment.',
        blocks: [safety, safetyList],
      }),
      createTemplateSection('Records and Reporting', {
        description: 'Records produced and where they are kept.',
        prompt: 'Align with your own record-identification conventions.',
        blocks: [records],
      }),
      createTemplateSection('References', {
        description: 'Standards, methods and manuals used for this work.',
        prompt: 'Record the edition you actually followed.',
        blocks: [references],
      }),
      createTemplateSection('Approval', {
        description: 'Authorisation of the procedure before use.',
        prompt: 'Replace the placeholder signers with the actual names and roles.',
        blocks: [approval],
      }),
    ],
  });
}

/** Method Verification / Validation Protocol — study protocol skeleton (§11.2). */
export function createMethodVerificationValidationProtocolTemplate(): DocStudioTemplate {
  const objectives = createTemplateParagraphBlock(
    'State what this study intends to verify or validate about the method (e.g. the performance characteristics you are examining) and the decisions the study must support. Replace this guidance with your own objectives.',
  );
  const methodInfo = createTemplateParagraphBlock(
    'Identify the method under evaluation: title, reference/edition, source (standard, supplier or internal), and the intended range of use in your laboratory.',
  );
  const design = createTemplateListBlock([
    'Define the study design: levels or range covered, number of replicates, and how many runs/days are planned.',
    'Identify the operators, equipment, materials and reference items involved.',
    'State the conditions to be held constant and those deliberately varied.',
    'State how data will be recorded before the study begins.',
  ]);
  const acceptance = createTemplateAcceptanceCriteriaBlock(
    [
      {
        criterion: '[performance characteristic to be judged]',
        specification: '[acceptance criterion from your method/specification]',
        result: 'pending',
      },
      {
        criterion: '[additional characteristic, if applicable]',
        specification: '[acceptance criterion]',
        result: 'pending',
      },
    ],
    {
      title: 'Acceptance criteria',
      overallResult: 'pending',
    },
  );
  const acceptanceNote = createTemplateCalloutBlock(
    'info',
    'Set and record the criteria before collecting data. The placeholder rows are not criteria — enter the values your method or specification actually requires.',
    { title: 'Author guidance' },
  );
  const data = createTemplateObservationBlock(
    [
      { parameter: '[verification / validation parameter 1]', observedValue: '' },
      { parameter: '[verification / validation parameter 2]', observedValue: '' },
      { parameter: '[verification / validation parameter 3]', observedValue: '' },
      { parameter: '[further parameters as planned]', observedValue: '' },
    ],
    { title: 'Recorded study data' },
  );
  const analysis = createTemplateParagraphBlock(
    'Describe how the collected data will be analysed (statistics, comparisons, plots) and how the result will be compared with the acceptance criteria. Reference your calculation method rather than restating it.',
  );
  const deviations = createTemplateParagraphBlock(
    'Record anything that did not go to plan — departures from the protocol, equipment issues, outlying runs — with the reason and the action taken.',
  );
  const conclusion = createTemplateParagraphBlock(
    'After the criteria are evaluated, state whether the method was verified or validated for the intended use, with the evidence supporting that statement. Leave this section until the data has been reviewed.',
  );
  const authorization = createTemplateSignatureBlock([
    { role: 'Study performed by', designation: '[name / designation]' },
    { role: 'Results approved by', designation: '[name / designation]' },
  ]);

  return createDefaultTemplate({
    id: 'builtin.technical-procedures.method-verification-validation-protocol',
    origin: 'builtin',
    name: 'Method Verification / Validation Protocol',
    description:
      'Study protocol with objectives, design, acceptance criteria, recorded data, analysis, deviations, conclusion and authorisation. Criteria and data are placeholders until you complete them.',
    category: 'technical-procedures',
    tags: ['verification', 'validation', 'protocol', 'method confirmation', 'study'],
    author: BUILTIN_TEMPLATE_AUTHOR,
    createdAt: BUILTIN_TEMPLATE_TIMESTAMP,
    updatedAt: BUILTIN_TEMPLATE_TIMESTAMP,
    defaults: {
      metadata: {
        title: 'Method Verification / Validation Protocol',
        documentType: 'Protocol',
        department: 'Laboratory',
      },
    },
    sections: [
      createTemplateSection('Study Objectives', {
        description: 'What the study examines and the decisions it supports.',
        prompt: 'Name the performance characteristics you intend to examine.',
        blocks: [objectives],
      }),
      createTemplateSection('Method Under Evaluation', {
        description: 'Identity, source and intended use of the method.',
        prompt: 'Record the reference and edition you are actually working from.',
        blocks: [methodInfo],
        references: [
          createTemplateReferenceHint('Method reference'),
          createTemplateReferenceHint('Specification / standard'),
        ],
      }),
      createTemplateSection('Study Design and Conditions', {
        description: 'How the study is planned and what is held constant.',
        prompt: 'Design the study so the data can answer your objectives.',
        blocks: [design],
      }),
      createTemplateSection('Acceptance Criteria', {
        description: 'The criteria the study results will be judged against.',
        prompt: 'Record criteria before data collection begins.',
        blocks: [acceptance, acceptanceNote],
      }),
      createTemplateSection('Data and Observations', {
        description: 'Where the recorded study data lives.',
        prompt: 'Attach or transcribe the recorded data; do not pre-fill results.',
        blocks: [data],
      }),
      createTemplateSection('Results Analysis', {
        description: 'How the data is analysed and compared with the criteria.',
        prompt: 'Reference your statistical or calculation procedure.',
        blocks: [analysis],
      }),
      createTemplateSection('Deviations and Anomalies', {
        description: 'Anything that departed from the planned study.',
        prompt: 'Record deviations contemporaneously with the reason and action.',
        blocks: [deviations],
      }),
      createTemplateSection('Conclusion', {
        description: 'The verified/validated status, based on the evaluated criteria.',
        prompt: 'Do not record a conclusion until the acceptance criteria have been evaluated.',
        blocks: [conclusion],
      }),
      createTemplateSection('Authorisation', {
        description: 'Who performed the study and who approves the outcome.',
        prompt: 'Replace the placeholder signers with the actual names and roles.',
        blocks: [authorization],
      }),
    ],
  });
}
