/**
 * DocStudio — Quality-assurance template samples (P03-M3)
 * ═══════════════════════════════════════════════════════════════════════════
 * Built-in starters for project_details.md §11.7:
 *   • Internal Audit Checklist
 *       (`builtin.quality-assurance.internal-audit-checklist`)
 *   • Nonconforming Work and Corrective Action Form
 *       (`builtin.quality-assurance.nonconforming-work-corrective-action`)
 *
 * Both are actionable document scaffolds: findings, evidence, actions,
 * responsibilities, dates and effectiveness checks are STRUCTURE the user
 * fills in.  Nothing here claims audit-proof tracking, automatic conformity,
 * or a universal classification scheme — classification wording and routes
 * come from the user's own quality system.
 *
 * @module services/template-library/quality-assurance
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

/** Internal Audit Checklist — audit identification, evidence, findings, actions (§11.7). */
export function createInternalAuditChecklistTemplate(): DocStudioTemplate {
  const identification = createTemplateTableBlock(
    ['Field', 'Entry'],
    [
      ['Audit reference', ''],
      ['Date(s)', ''],
      ['Lead auditor', ''],
      ['Auditor(s)', ''],
      ['Area / function audited', ''],
      ['Audit type', ''],
    ],
    { caption: 'Complete before the audit opens.' },
  );
  const scope = createTemplateParagraphBlock(
    'State what this audit covers (areas, processes, activities) and what it deliberately excludes, then name the criteria you will audit against — the documents, standards or internal requirements your organization has chosen.',
  );
  const scopeNote = createTemplateCalloutBlock(
    'note',
    'This template is a document scaffold. It does not perform, verify or guarantee audit conformity — the audit itself, its evidence and its conclusions remain your organization\'s work.',
    { title: 'Scope note' },
  );
  const checklist = createTemplateTableBlock(
    ['Process / clause', 'Question or requirement', 'Objective evidence observed', 'Classification', 'Action ref.'],
    [
      ['[process or clause from your criteria]', '[question derived from your criteria]', '', '[record using your own scheme]', ''],
      ['[process or clause]', '[question]', '', '[record using your own scheme]', ''],
      ['[process or clause]', '[question]', '', '[record using your own scheme]', ''],
    ],
    { caption: 'Add rows per question; the classification column uses YOUR quality system\'s wording.' },
  );
  const summary = createTemplateParagraphBlock(
    'Summarize what was found across the audit: the points raised, how they are grouped using your own classification wording, and any positive observations worth recording.',
  );
  const actions = createTemplateTableBlock(
    ['Finding ref.', 'Action required', 'Responsibility', 'Target date', 'Completion date', 'Effectiveness check'],
    [
      ['[finding reference]', '', '[role]', '', '', ''],
      ['[finding reference]', '', '[role]', '', '', ''],
    ],
    { caption: 'One row per action; effectiveness is checked and dated when actually done.' },
  );
  const conclusion = createTemplateParagraphBlock(
    'Record the overall conclusion of the audit and any follow-up arrangement agreed with the audited area, then obtain the sign-offs below.',
  );
  const signoff = createTemplateSignatureBlock([
    { role: 'Audit conducted by', designation: '[name / designation]' },
    { role: 'Audited area representative', designation: '[name / designation]' },
  ]);

  return createDefaultTemplate({
    id: 'builtin.quality-assurance.internal-audit-checklist',
    origin: 'builtin',
    name: 'Internal Audit Checklist',
    description:
      'Internal-audit working document: identification, scope and criteria, an evidence/question checklist, findings summary, dated actions with effectiveness checks, and conclusion. Classification wording is yours to define.',
    category: 'quality-assurance',
    tags: ['audit', 'internal audit', 'checklist', 'quality assurance', 'findings'],
    author: BUILTIN_TEMPLATE_AUTHOR,
    createdAt: BUILTIN_TEMPLATE_TIMESTAMP,
    updatedAt: BUILTIN_TEMPLATE_TIMESTAMP,
    defaults: {
      metadata: {
        title: 'Internal Audit Checklist',
        documentType: 'Audit Record',
        department: 'Quality Management',
      },
    },
    sections: [
      createTemplateSection('Audit Identification', {
        description: 'Reference, dates, auditors and the area covered.',
        prompt: 'Adapt the fields to your own audit-reference convention.',
        blocks: [identification],
      }),
      createTemplateSection('Scope and Criteria', {
        description: 'What is audited and against which criteria.',
        prompt: 'Name the criteria documents and confirm the editions you use.',
        blocks: [scope, scopeNote],
      }),
      createTemplateSection('Checklist and Objective Evidence', {
        description: 'Questions asked and the objective evidence seen.',
        prompt: 'Derive questions from your own criteria; record evidence as observed.',
        blocks: [checklist],
      }),
      createTemplateSection('Findings Summary', {
        description: 'The points raised across the audit.',
        prompt: 'Use your own classification wording — no scheme is imposed here.',
        blocks: [summary],
      }),
      createTemplateSection('Actions and Follow-up', {
        description: 'What must change, by whom, by when — and effectiveness checks.',
        prompt: 'Date the effectiveness check only when it has actually been performed.',
        blocks: [actions],
      }),
      createTemplateSection('Conclusion and Sign-off', {
        description: 'Overall conclusion and acknowledgement of the audit.',
        prompt: 'Replace the placeholder signers with the actual names and roles.',
        blocks: [conclusion, signoff],
      }),
    ],
  });
}

/** Nonconforming Work and Corrective Action form (§11.7). */
export function createNonconformingWorkCorrectiveActionTemplate(): DocStudioTemplate {
  const details = createTemplateTableBlock(
    ['Field', 'Entry'],
    [
      ['Nonconformance reference', ''],
      ['Date reported', ''],
      ['Reported by', ''],
      ['Where detected (activity / area)', ''],
      ['Related document or record', ''],
    ],
    { caption: 'Complete when the nonconforming work is first reported.' },
  );
  const description = createTemplateParagraphBlock(
    'Describe what was observed and what was required — the difference between them — including when and where it happened and which work or records are affected. Stick to facts that can be checked.',
  );
  const containment = createTemplateListBlock([
    'What was done immediately to contain the situation (e.g. affected work stopped or identified).',
    'Whether delivered results or output are affected, and how that was determined.',
    'Who was informed, and when.',
    'Add or remove items to match your own procedure.',
  ]);
  const rootCause = createTemplateParagraphBlock(
    'Record the root-cause analysis performed — use whichever technique your organization follows (the examples are options, not requirements) — and the evidence supporting the cause you identified.',
  );
  const rootCauseNote = createTemplateCalloutBlock(
    'info',
    'The analysis technique (e.g. "5 Whys", cause-and-effect diagram) is your organization\'s choice. Record what was analysed and why the identified cause is supported by evidence.',
    { title: 'Author guidance' },
  );
  const correctivePlan = createTemplateTableBlock(
    ['Action', 'Responsibility', 'Target date', 'Completion date', 'Status'],
    [
      ['[action addressing the root cause]', '[role]', '', '', ''],
      ['[further action, if needed]', '[role]', '', '', ''],
    ],
    { caption: 'Actions must follow from the identified root cause, not just the symptom.' },
  );
  const effectiveness = createTemplateParagraphBlock(
    'State how and when the effectiveness of the corrective action will be checked, what evidence will show it worked, and record the outcome when the check is done.',
  );
  const closure = createTemplateParagraphBlock(
    'Record the disposition of the affected work and any follow-up (including communication) under your own procedures, then obtain the approvals below to close the record.',
  );
  const signoff = createTemplateSignatureBlock([
    { role: 'Reviewed by', designation: '[name / designation]' },
    { role: 'Approved / closed by', designation: '[name / designation]' },
  ]);

  return createDefaultTemplate({
    id: 'builtin.quality-assurance.nonconforming-work-corrective-action',
    origin: 'builtin',
    name: 'Nonconforming Work and Corrective Action Form',
    description:
      'NC/CAR form: report details, factual description, containment, root-cause analysis, cause-linked action plan, effectiveness review and closure approval. Routes and technique come from your quality system.',
    category: 'quality-assurance',
    tags: ['nonconforming', 'corrective action', 'quality assurance', 'form', 'root cause'],
    author: BUILTIN_TEMPLATE_AUTHOR,
    createdAt: BUILTIN_TEMPLATE_TIMESTAMP,
    updatedAt: BUILTIN_TEMPLATE_TIMESTAMP,
    defaults: {
      metadata: {
        title: 'Nonconforming Work and Corrective Action Form',
        documentType: 'QA Form',
        department: 'Quality Management',
      },
    },
    sections: [
      createTemplateSection('Report Details', {
        description: 'Reference, reporter and location of detection.',
        prompt: 'Adapt the fields to your own reference convention.',
        blocks: [details],
      }),
      createTemplateSection('Description of Nonconforming Work', {
        description: 'What was observed versus what was required, and what is affected.',
        prompt: 'Write facts that can be verified; separate observation from opinion.',
        blocks: [description],
      }),
      createTemplateSection('Immediate Actions and Containment', {
        description: 'What was done at once to contain the situation.',
        prompt: 'Match the items to your own nonconforming-work procedure.',
        blocks: [containment],
      }),
      createTemplateSection('Root Cause Analysis', {
        description: 'How the underlying cause was determined.',
        prompt: 'Choose your organization\'s technique and evidence the conclusion.',
        blocks: [rootCause, rootCauseNote],
      }),
      createTemplateSection('Corrective Action Plan', {
        description: 'Actions addressing the root cause, with owners and dates.',
        prompt: 'Every action should trace back to the identified cause.',
        blocks: [correctivePlan],
      }),
      createTemplateSection('Effectiveness Review', {
        description: 'How and when the fix is checked for effect.',
        prompt: 'Define the evidence before the due date, not after.',
        blocks: [effectiveness],
      }),
      createTemplateSection('Disposition and Closure', {
        description: 'What happened to the affected work and how the record closes.',
        prompt: 'Use your own disposition and communication rules.',
        blocks: [closure],
      }),
      createTemplateSection('Approval', {
        description: 'Review and closure authorisation.',
        prompt: 'Replace the placeholder signers with the actual names and roles.',
        blocks: [signoff],
      }),
    ],
  });
}
