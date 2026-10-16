/**
 * DocStudio — SOP / work-instruction template samples (P03-M3)
 * ═══════════════════════════════════════════════════════════════════════════
 * Built-in starter for project_details.md §11.3 (in addition to the retained
 * P03-M1 example SOP `builtin.sops-work-instructions.example-sop`):
 *   • Equipment Operation Work Instruction
 *       (`builtin.sops-work-instructions.equipment-operation-work-instruction`)
 *
 * Distinct from the example SOP: this is an operational, task-level
 * instruction (safety → set-up → start → operate → shut down → checks) for a
 * specific instrument, not a generic procedure shell.  All instrument-specific
 * content is bracketed placeholder text the author must supply.
 *
 * @module services/template-library/sops-work-instructions
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
  createTemplateReferenceHint,
} from '../../types/template-defaults';
import type { DocStudioTemplate } from '../../types/template';
import { BUILTIN_TEMPLATE_TIMESTAMP, BUILTIN_TEMPLATE_AUTHOR } from './shared';

/** Equipment Operation Work Instruction — instrument-level task instruction. */
export function createEquipmentOperationWorkInstructionTemplate(): DocStudioTemplate {
  const purpose = createTemplateParagraphBlock(
    'State which instrument or piece of equipment this instruction covers and what it is used for in your laboratory. Replace this guidance with your own text.',
  );
  const safety = createTemplateCalloutBlock(
    'danger',
    'List the specific hazards of THIS equipment (electrical, mechanical, thermal, chemical, pressure…) and the protective measures required. Replace this placeholder — the template cannot know your hazards.',
    { title: 'Hazards' },
  );
  const safetyList = createTemplateListBlock(
    [
      'Personal protective equipment required for this task — [list].',
      'Isolation / lock-out steps before cleaning or maintenance — [describe].',
      'Emergency arrangements (stop button, spill response, contacts) — [describe].',
    ],
    { listType: 'checklist' },
  );
  const equipment = createTemplateEquipmentListBlock(
    [
      { name: '[the instrument covered by this instruction — name, model, asset tag]', mandatory: true },
      { name: '[accessories, tools or reference items needed for the task]', mandatory: true },
      { name: '[consumables]', mandatory: false },
    ],
    { title: 'Equipment and supplies' },
  );
  const preStart = createTemplateListBlock(
    [
      'Work area clear and ventilated as required.',
      'Instrument free of visible damage; guards and covers in place.',
      'Calibration / verification status current per your equipment register.',
      'Required consumables and reference items available.',
    ],
    { listType: 'checklist' },
  );
  const startup = createTemplateProcedureStepsBlock(
    [
      { text: 'Connect / switch on the supply in the order required by the manufacturer.' },
      { text: 'Power on the instrument and allow it to reach its ready state (state any stabilisation time from the manual).' },
      { text: 'Perform any self-test or warm-up check the manual requires before use.' },
    ],
    { sectionTitle: 'Startup and preparation' },
  );
  const operation = createTemplateProcedureStepsBlock(
    [
      { text: 'Describe how the instrument is loaded / set for a routine task.' },
      { text: 'Describe the normal operating sequence, including the settings used.' },
      { text: 'Describe how readings or outputs are recorded by the operator.' },
      { text: 'Describe what a normal, ready-for-use indication looks like.', level: 'note' },
    ],
    { sectionTitle: 'Operation' },
  );
  const shutdown = createTemplateProcedureStepsBlock(
    [
      { text: 'Finish or safe the current work before shutdown.' },
      { text: 'Follow the manufacturer\'s shutdown / standby sequence.' },
      { text: 'Switch off supplies and secure the work area as required.' },
    ],
    { sectionTitle: 'Shutdown and standby' },
  );
  const troubleshooting = createTemplateTableBlock(
    ['Symptom', 'Likely cause', 'Operator action'],
    [
      ['[describe a common symptom]', '[likely cause]', '[what the operator may do; state when to stop and escalate]'],
      ['[describe another symptom]', '[likely cause]', '[operator action]'],
    ],
    { caption: 'Operator-level troubleshooting only — replace with entries from the equipment manual.' },
  );
  const maintenance = createTemplateListBlock([
    'Routine cleaning after use — [describe and state frequency].',
    'Operator-level checks or consumable replacements — [describe].',
    'Where faults, servicing and calibration are recorded — [record or system reference].',
  ]);
  const records = createTemplateParagraphBlock(
    'Name the usage, cleaning or fault records produced by this task and where they are kept.',
  );
  const references = createTemplateParagraphBlock(
    'List the equipment manual, related procedures and forms this instruction relies on, including document numbers and revisions.',
  );
  const approval = createTemplateSignatureBlock([
    { role: 'Prepared by', designation: '[name / designation]' },
    { role: 'Approved by', designation: '[name / designation]' },
  ]);

  return createDefaultTemplate({
    id: 'builtin.sops-work-instructions.equipment-operation-work-instruction',
    origin: 'builtin',
    name: 'Equipment Operation Work Instruction',
    description:
      'Instrument-level work instruction with safety, pre-start checks, startup, operation, shutdown, troubleshooting and maintenance prompts. Bracketed fields must be filled from the equipment manual.',
    category: 'sops-work-instructions',
    tags: ['work instruction', 'equipment', 'operation', 'startup', 'instrument'],
    author: BUILTIN_TEMPLATE_AUTHOR,
    createdAt: BUILTIN_TEMPLATE_TIMESTAMP,
    updatedAt: BUILTIN_TEMPLATE_TIMESTAMP,
    defaults: {
      metadata: {
        title: 'Equipment Operation Work Instruction',
        documentType: 'Work Instruction',
        department: 'Laboratory',
      },
    },
    sections: [
      createTemplateSection('Purpose and Scope', {
        description: 'Which equipment this instruction covers and what it is used for.',
        prompt: 'Name the instrument model so the instruction is unambiguous.',
        blocks: [purpose],
        references: [
          createTemplateReferenceHint('Equipment manual reference'),
          createTemplateReferenceHint('Related procedure'),
        ],
      }),
      createTemplateSection('Safety and Precautions', {
        description: 'Hazards specific to the equipment and the required protections.',
        prompt: 'Base this on your own hazard assessment — do not ship the placeholder.',
        blocks: [safety, safetyList],
      }),
      createTemplateSection('Equipment and Supplies', {
        description: 'The instrument itself plus accessories and consumables.',
        prompt: 'Record asset tags from your equipment register.',
        blocks: [equipment],
      }),
      createTemplateSection('Pre-Start Checks', {
        description: 'What the operator confirms before touching the instrument.',
        prompt: 'Keep this checklist short and genuinely checkable by one person.',
        blocks: [preStart],
      }),
      createTemplateSection('Startup and Preparation', {
        description: 'Power-up and ready-state sequence.',
        prompt: 'Take the order and timings from the manufacturer\'s manual.',
        blocks: [startup],
      }),
      createTemplateSection('Operation', {
        description: 'Normal operating sequence for routine tasks.',
        prompt: 'Describe one routine task fully; reference others separately.',
        blocks: [operation],
      }),
      createTemplateSection('Shutdown and Standby', {
        description: 'How the instrument is left safe and ready for the next use.',
        prompt: 'Include any cooling-down or securing step the manual requires.',
        blocks: [shutdown],
      }),
      createTemplateSection('Troubleshooting', {
        description: 'Symptoms the operator may handle, and when to stop.',
        prompt: 'Restrict this to operator-level actions; escalate everything else.',
        blocks: [troubleshooting],
      }),
      createTemplateSection('Maintenance and Records', {
        description: 'Operator cleaning, checks and the records this task produces.',
        prompt: 'Separate operator-level care from scheduled servicing.',
        blocks: [maintenance, records],
      }),
      createTemplateSection('References', {
        description: 'Manuals, procedures and forms this instruction depends on.',
        prompt: 'Include document numbers and revisions.',
        blocks: [references],
      }),
      createTemplateSection('Review and Approval', {
        description: 'Authorisation of the instruction before use.',
        prompt: 'Replace the placeholder signers with the actual names and roles.',
        blocks: [approval],
      }),
    ],
  });
}
