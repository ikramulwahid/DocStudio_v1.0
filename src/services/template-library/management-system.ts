/**
 * DocStudio — Management-system template samples (P03-M3)
 * ═══════════════════════════════════════════════════════════════════════════
 * Built-in starters for project_details.md §11.1:
 *   • Quality Policy            (`builtin.management-system.quality-policy`)
 *   • Quality System Procedure  (`builtin.management-system.quality-system-procedure`)
 *
 * Both are document SCAFFOLDS with author prompts — nothing here asserts that
 * the user's laboratory conforms to any standard.  The suggested applicable
 * standard is an editable metadata field, not a claim, and users must confirm
 * the edition and clauses that apply to them.
 *
 * @module services/template-library/management-system
 */

import {
  createDefaultTemplate,
  createTemplateSection,
  createTemplateParagraphBlock,
  createTemplateListBlock,
  createTemplateTableBlock,
  createTemplateCalloutBlock,
  createTemplateSignatureBlock,
  createTemplateProcedureStepsBlock,
  createTemplateReferenceHint,
} from '../../types/template-defaults';
import type { DocStudioTemplate } from '../../types/template';
import { BUILTIN_TEMPLATE_TIMESTAMP, BUILTIN_TEMPLATE_AUTHOR } from './shared';

/** Quality Policy — top-level policy intent and commitments. */
export function createQualityPolicyTemplate(): DocStudioTemplate {
  const statement = createTemplateParagraphBlock(
    'Replace this text with your laboratory\'s quality policy in a few clear sentences — what your organization is trying to achieve through the quality system and who it serves.',
  );
  const intent = createTemplateCalloutBlock(
    'note',
    'Write the policy in your own words at a level your whole organization can understand. This template is starting structure only and does not by itself demonstrate conformity to any standard.',
    { title: 'Author guidance' },
  );
  const commitments = createTemplateListBlock([
    'State the commitments that apply to your laboratory (e.g. impartiality, competence, consistent operation, confidentiality) in your own wording.',
    'Say how the quality system serves customers and interested parties.',
    'Say how personnel contribute to achieving the policy.',
    'Confirm any commitment your own quality manual requires beyond these examples.',
  ]);
  const responsibilities = createTemplateParagraphBlock(
    'Describe who owns the policy (e.g. the laboratory head), how responsibilities are assigned, and how everyone contributes. Replace these examples with your own reporting lines.',
  );
  const communication = createTemplateParagraphBlock(
    'Explain how the policy is communicated to personnel and made available to customers and other interested parties, and where the controlled copy is held.',
  );
  const review = createTemplateParagraphBlock(
    'Describe when and how the policy is reviewed (e.g. as an input to management review) and how changes are approved and re-issued.',
  );
  const approval = createTemplateSignatureBlock([
    { role: 'Prepared by', designation: '[name / designation]' },
    { role: 'Approved by', designation: '[name / designation]' },
  ]);

  return createDefaultTemplate({
    id: 'builtin.management-system.quality-policy',
    origin: 'builtin',
    name: 'Quality Policy',
    description:
      'Top-level quality policy starter with intent, commitments, responsibilities, communication and review sections. A starting point to adapt to your laboratory — not a conformity claim.',
    category: 'management-system',
    tags: ['quality policy', 'policy', 'management system', 'leadership'],
    author: BUILTIN_TEMPLATE_AUTHOR,
    createdAt: BUILTIN_TEMPLATE_TIMESTAMP,
    updatedAt: BUILTIN_TEMPLATE_TIMESTAMP,
    defaults: {
      metadata: {
        title: 'Quality Policy',
        documentType: 'Quality Policy',
        department: 'Quality Management',
        applicableStandard: 'ISO/IEC 17025:2017',
      },
      frontPage: { enabled: true },
    },
    sections: [
      createTemplateSection('Policy Statement', {
        description: 'The laboratory\'s overall quality intent in a few clear sentences.',
        prompt: 'Keep it short, plain and signed by the organization\'s leadership.',
        blocks: [statement, intent],
      }),
      createTemplateSection('Commitments', {
        description: 'What the laboratory commits to through its quality system.',
        prompt: 'List only commitments your organization is prepared to keep.',
        blocks: [commitments],
      }),
      createTemplateSection('Responsibilities', {
        description: 'Who owns, maintains and updates the policy.',
        prompt: 'Use your real reporting lines rather than generic role names.',
        blocks: [responsibilities],
      }),
      createTemplateSection('Communication and Availability', {
        description: 'How personnel and interested parties can obtain the policy.',
        prompt: 'State where the controlled copy lives and how it is shared.',
        blocks: [communication],
      }),
      createTemplateSection('Review and Improvement', {
        description: 'When the policy is reviewed and how changes are issued.',
        prompt: 'Align the review point with your own quality-planning cycle.',
        blocks: [review],
        references: [
          createTemplateReferenceHint('Applicable standard', 'ISO/IEC 17025:2017'),
        ],
      }),
      createTemplateSection('Approval', {
        description: 'Leadership approval of the issued policy.',
        prompt: 'Replace the placeholder signers with the actual names and roles.',
        blocks: [approval],
      }),
    ],
  });
}

/** Quality System Procedure — practical procedure skeleton (§11.1). */
export function createQualitySystemProcedureTemplate(): DocStudioTemplate {
  const purpose = createTemplateParagraphBlock(
    'State what this procedure exists to do, the process it governs, and the problem or need it addresses. Replace this guidance with your own text.',
  );
  const scope = createTemplateParagraphBlock(
    'Define where the procedure applies (activities, areas, personnel) and any explicit exclusions.',
  );
  const responsibilities = createTemplateListBlock([
    'Who performs the process — [role].',
    'Who verifies or reviews the work — [role].',
    'Who approves exceptions or changes — [role].',
    'Add or remove roles to match your organization.',
  ]);
  const resources = createTemplateParagraphBlock(
    'Describe the resources the process depends on: competent personnel, infrastructure, equipment, environment and any supporting systems. Reference training or qualification records where relevant.',
  );
  const procedureSteps = createTemplateProcedureStepsBlock(
    [
      { text: 'Describe the first working step of the process and who performs it.' },
      { text: 'Describe the hand-offs between roles or areas.' },
      { text: 'Describe how the completed output is verified or reviewed.' },
      {
        text: 'Flag any step with a safety, quality or authorisation consequence as a warning or caution step.',
        level: 'note',
      },
    ],
    { sectionTitle: 'Process sequence' },
  );
  const procedureNote = createTemplateCalloutBlock(
    'info',
    'Replace the placeholder steps with your actual sequence of work. If the process is long, split it into named steps and state the records produced at each stage.',
    { title: 'Author guidance' },
  );
  const recordsTable = createTemplateTableBlock(
    ['Record produced', 'Responsibility', 'Retention / storage location'],
    [
      ['[name of the record this procedure creates]', '[role]', '[retention period and where it is held]'],
      ['[second record, if any]', '[role]', '[retention period and where it is held]'],
    ],
    { caption: 'Records generated by this procedure — replace with your own list.' },
  );
  const related = createTemplateParagraphBlock(
    'List the related procedures, forms, records and documents this procedure refers to or uses, and identify anything it supersedes.',
  );
  const approval = createTemplateSignatureBlock([
    { role: 'Prepared by', designation: '[name / designation]' },
    { role: 'Approved by', designation: '[name / designation]' },
  ]);

  return createDefaultTemplate({
    id: 'builtin.management-system.quality-system-procedure',
    origin: 'builtin',
    name: 'Quality System Procedure',
    description:
      'Procedure skeleton with purpose, scope, responsibilities, resources, working steps, records and references. A quality-system starting point to adapt to your own process.',
    category: 'management-system',
    tags: ['procedure', 'quality system', 'management system', 'qms'],
    author: BUILTIN_TEMPLATE_AUTHOR,
    createdAt: BUILTIN_TEMPLATE_TIMESTAMP,
    updatedAt: BUILTIN_TEMPLATE_TIMESTAMP,
    defaults: {
      metadata: {
        title: 'Quality System Procedure',
        subtitle: 'Replace with the procedure name',
        documentType: 'Procedure',
        department: 'Quality Management',
        applicableStandard: 'ISO/IEC 17025:2017',
      },
      frontPage: { enabled: true },
    },
    sections: [
      createTemplateSection('Purpose', {
        description: 'Why this procedure exists.',
        prompt: 'One short paragraph is usually enough.',
        blocks: [purpose],
      }),
      createTemplateSection('Scope', {
        description: 'Where the procedure applies and any exclusions.',
        prompt: 'Be explicit about what is out of scope.',
        blocks: [scope],
        references: [
          createTemplateReferenceHint('Applicable standard', 'ISO/IEC 17025:2017'),
          createTemplateReferenceHint('Implements clause / section'),
        ],
      }),
      createTemplateSection('Responsibilities', {
        description: 'Who does, verifies and approves the work.',
        prompt: 'Use role names that exist in your organization.',
        blocks: [responsibilities],
      }),
      createTemplateSection('Resources', {
        description: 'People, infrastructure, equipment and systems the process needs.',
        prompt: 'Reference training or qualification requirements where relevant.',
        blocks: [resources],
      }),
      createTemplateSection('Procedure', {
        description: 'The actual sequence of work, step by step.',
        prompt: 'Write steps so a competent newcomer could follow them.',
        blocks: [procedureSteps, procedureNote],
      }),
      createTemplateSection('Records', {
        description: 'What the procedure produces and where records are kept.',
        prompt: 'Keep the table aligned with the actual records your process creates.',
        blocks: [recordsTable],
      }),
      createTemplateSection('Related Documents and References', {
        description: 'Documents this procedure uses, refers to or supersedes.',
        prompt: 'Record titles and identifiers, including the edition where applicable.',
        blocks: [related],
      }),
      createTemplateSection('Review and Approval', {
        description: 'Authorisation of the issued procedure.',
        prompt: 'Replace the placeholder signers with the actual names and roles.',
        blocks: [approval],
      }),
    ],
  });
}
