/**
 * DocStudio — Form / register template samples (P03-M3)
 * ═══════════════════════════════════════════════════════════════════════════
 * Built-in starters for project_details.md §11.6:
 *   • Sample Receipt Form          (`builtin.forms-registers-exhibits.sample-receipt-form`)
 *   • Equipment Maintenance Record (`builtin.forms-registers-exhibits.equipment-maintenance-record`)
 *
 * These are documents/templates only — DocStudio is not responsible for
 * operating the underlying laboratory process (project_details.md §11.6).
 * All process decisions (accept/hold/return, escalation routes) are left as
 * prompts referring to the user's own procedures.
 *
 * @module services/template-library/forms-registers-exhibits
 */

import {
  createDefaultTemplate,
  createTemplateSection,
  createTemplateParagraphBlock,
  createTemplateListBlock,
  createTemplateTableBlock,
  createTemplateCalloutBlock,
  createTemplateSignatureBlock,
} from '../../types/template-defaults';
import type { DocStudioTemplate } from '../../types/template';
import { BUILTIN_TEMPLATE_TIMESTAMP, BUILTIN_TEMPLATE_AUTHOR } from './shared';

/** Sample Receipt Form — intake identification, condition and acceptance (§11.6). */
export function createSampleReceiptFormTemplate(): DocStudioTemplate {
  const receipt = createTemplateTableBlock(
    ['Field', 'Entry'],
    [
      ['Form reference', ''],
      ['Date / time received', ''],
      ['Received by', ''],
      ['Received at (location)', ''],
    ],
    { caption: 'Complete at the point of receipt.' },
  );
  const samples = createTemplateTableBlock(
    ['No.', 'Sample description', 'Type / matrix', 'Quantity', 'Condition on receipt', 'Storage / handling'],
    [
      ['1', '', '', '', '', ''],
      ['2', '', '', '', '', ''],
      ['3', '', '', '', '', ''],
    ],
    { caption: 'Add or remove rows to match the consignment.' },
  );
  const documentation = createTemplateListBlock(
    [
      'Test request or order received and legible.',
      'Sample labels consistent with the request.',
      'Accompanying documents present (certificate, chain of custody, safety data…).',
      'Special storage or handling requirements stated by the customer.',
    ],
    { listType: 'checklist' },
  );
  const discrepancies = createTemplateParagraphBlock(
    'Record anything that does not match the request or arrives damaged: what was observed, when, and who was informed. Attach photos or notes if your procedure uses them.',
  );
  const discrepanciesNote = createTemplateCalloutBlock(
    'info',
    'Record discrepancies at the point of receipt and follow your own laboratory\'s notification rules — this form documents the event, it does not decide the response.',
    { title: 'Author guidance' },
  );
  const decision = createTemplateParagraphBlock(
    'Record the receipt decision for these samples (accepted for testing, held, returned or other outcome your procedure defines), who made it, and the basis. Follow your laboratory\'s own receipt procedure.',
  );
  const signoff = createTemplateSignatureBlock([
    { role: 'Received by', designation: '[name / designation]' },
    { role: 'Confirmed by', designation: '[name / designation]' },
  ]);

  return createDefaultTemplate({
    id: 'builtin.forms-registers-exhibits.sample-receipt-form',
    origin: 'builtin',
    name: 'Sample Receipt Form',
    description:
      'Intake form with receipt details, a sample table, incoming-documentation checklist, discrepancy notes, a receipt decision and sign-off. Decisions remain yours to define.',
    category: 'forms-registers-exhibits',
    tags: ['form', 'sample receipt', 'intake', 'register', 'chain of custody'],
    author: BUILTIN_TEMPLATE_AUTHOR,
    createdAt: BUILTIN_TEMPLATE_TIMESTAMP,
    updatedAt: BUILTIN_TEMPLATE_TIMESTAMP,
    defaults: {
      metadata: {
        title: 'Sample Receipt Form',
        documentType: 'Form',
        department: 'Laboratory',
      },
    },
    sections: [
      createTemplateSection('Receipt Details', {
        description: 'When, where and by whom the consignment was received.',
        prompt: 'Adapt the fields to your own form-numbering convention.',
        blocks: [receipt],
      }),
      createTemplateSection('Sample Details', {
        description: 'The samples themselves as they arrived.',
        prompt: 'Add rows for the actual number of samples received.',
        blocks: [samples],
      }),
      createTemplateSection('Incoming Documentation', {
        description: 'Checklist of what accompanied the samples.',
        prompt: 'Adjust the checklist to your own receipt procedure.',
        blocks: [documentation],
      }),
      createTemplateSection('Condition, Discrepancies and Actions', {
        description: 'Condition on arrival and anything that did not match the request.',
        prompt: 'Record facts and notifications; leave the response to your procedure.',
        blocks: [discrepancies, discrepanciesNote],
      }),
      createTemplateSection('Receipt Decision', {
        description: 'Whether and how the samples enter the workflow.',
        prompt: 'Use the outcomes your own procedure defines — this form does not choose them.',
        blocks: [decision],
      }),
      createTemplateSection('Sign-off', {
        description: 'Who received and who confirmed the intake.',
        prompt: 'Replace the placeholder signers with the actual names and roles.',
        blocks: [signoff],
      }),
    ],
  });
}

/** Equipment Maintenance Record — schedule, work log and follow-up (§11.6). */
export function createEquipmentMaintenanceRecordTemplate(): DocStudioTemplate {
  const identification = createTemplateTableBlock(
    ['Field', 'Entry'],
    [
      ['Equipment name', ''],
      ['Asset / tag number', ''],
      ['Location', ''],
      ['Manufacturer', ''],
      ['Model / serial', ''],
    ],
    { caption: 'One record per equipment item (or per service event, per your procedure).' },
  );
  const schedule = createTemplateTableBlock(
    ['Task', 'Frequency', 'Last performed', 'Next due'],
    [
      ['[routine maintenance task]', '[frequency from the manual or your plan]', '', ''],
      ['[routine maintenance task]', '[frequency]', '', ''],
      ['[calibration / verification touchpoint, if applicable]', '[frequency]', '', ''],
    ],
    { caption: 'Replace with the schedule that actually applies to this equipment.' },
  );
  const workLog = createTemplateTableBlock(
    ['Date', 'Work performed', 'Findings / parts replaced', 'Performed by'],
    [
      ['', '', '', ''],
      ['', '', '', ''],
      ['', '', '', ''],
      ['', '', '', ''],
    ],
    { caption: 'One row per maintenance or service event.' },
  );
  const defects = createTemplateParagraphBlock(
    'Record defects found, their status (including any removal from use) and the follow-up required. Follow your laboratory\'s own equipment-control procedure for escalation.',
  );
  const defectsNote = createTemplateCalloutBlock(
    'warning',
    'If the equipment cannot perform as required, record its status and the action taken under your own procedure — this record documents events, it does not make that decision for you.',
    { title: 'Author guidance' },
  );
  const signoff = createTemplateSignatureBlock([
    { role: 'Work performed by', designation: '[name / designation]' },
    { role: 'Reviewed by', designation: '[name / designation]' },
  ]);

  return createDefaultTemplate({
    id: 'builtin.forms-registers-exhibits.equipment-maintenance-record',
    origin: 'builtin',
    name: 'Equipment Maintenance Record',
    description:
      'Maintenance record with equipment identification, a task schedule, a dated work log, defect follow-up and sign-off. Schedules are prompts — set them from your own plan.',
    category: 'forms-registers-exhibits',
    tags: ['maintenance', 'equipment', 'record', 'service', 'log'],
    author: BUILTIN_TEMPLATE_AUTHOR,
    createdAt: BUILTIN_TEMPLATE_TIMESTAMP,
    updatedAt: BUILTIN_TEMPLATE_TIMESTAMP,
    defaults: {
      metadata: {
        title: 'Equipment Maintenance Record',
        documentType: 'Maintenance Record',
        department: 'Laboratory',
      },
    },
    sections: [
      createTemplateSection('Equipment Identification', {
        description: 'Which item of equipment this record belongs to.',
        prompt: 'Copy identification details from your equipment register.',
        blocks: [identification],
      }),
      createTemplateSection('Maintenance Schedule', {
        description: 'Planned tasks and their frequencies.',
        prompt: 'Take frequencies from the manufacturer\'s manual or your own plan.',
        blocks: [schedule],
      }),
      createTemplateSection('Work Performed', {
        description: 'The dated log of actual maintenance events.',
        prompt: 'One row per event; note parts and findings as they happen.',
        blocks: [workLog],
      }),
      createTemplateSection('Defects and Follow-up', {
        description: 'Faults found and the follow-up they require.',
        prompt: 'Record status changes (e.g. removal from use) under your own procedure.',
        blocks: [defects, defectsNote],
      }),
      createTemplateSection('Sign-off', {
        description: 'Who performed and who reviewed the recorded work.',
        prompt: 'Replace the placeholder signers with the actual names and roles.',
        blocks: [signoff],
      }),
    ],
  });
}
