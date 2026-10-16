/**
 * DocStudio — Financial / administrative template samples (P03-M3)
 * ═══════════════════════════════════════════════════════════════════════════
 * Built-in starters for project_details.md §11.8:
 *   • Quotation        (`builtin.financial-administrative.quotation`)
 *   • Purchase Request (`builtin.financial-administrative.purchase-request`)
 *
 * GENERAL-PURPOSE business documents (project_details.md §11.8): they are
 * explicitly NOT represented as mandatory ISO/IEC 17025 records, they carry
 * no laboratory identity (organization comes from the Laboratory Profile at
 * creation), and they contain no legal, tax or jurisdiction-specific rules —
 * terms, taxes and approval routes are prompts the user supplies.
 *
 * @module services/template-library/financial-administrative
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

/** Quotation — customer, priced items, terms, authorisation (§11.8). */
export function createQuotationTemplate(): DocStudioTemplate {
  const details = createTemplateTableBlock(
    ['Field', 'Entry'],
    [
      ['Quotation number', ''],
      ['Issue date', ''],
      ['Valid until', ''],
      ['Prepared by', ''],
    ],
    { caption: 'Use your own quotation-reference convention.' },
  );
  const customer = createTemplateTableBlock(
    ['Field', 'Entry'],
    [
      ['Customer / organisation', ''],
      ['Address', ''],
      ['Contact person', ''],
      ['Email / phone', ''],
    ],
  );
  const scope = createTemplateParagraphBlock(
    'Describe what is being quoted — services, items or a combination — including the boundary of what is and is not included. Replace this guidance with your own text.',
  );
  const items = createTemplateTableBlock(
    ['#', 'Description', 'Qty', 'Unit', 'Unit price', 'Amount'],
    [
      ['1', '', '', '', '', ''],
      ['2', '', '', '', '', ''],
      ['3', '', '', '', '', ''],
    ],
    { caption: 'One line per item or service; add rows as needed.' },
  );
  const totals = createTemplateParagraphBlock(
    'State the subtotal, any applicable taxes and the grand total here or in your document footer, applying the rates and rules that apply in your jurisdiction. This template deliberately supplies no tax logic.',
  );
  const terms = createTemplateListBlock([
    'Payment terms you offer — [state your terms].',
    'Delivery / lead time — [state your terms].',
    'Quotation validity and any conditions — [state your terms].',
    'Anything else your customer needs to know before accepting — [add].',
  ]);
  const termsNote = createTemplateCalloutBlock(
    'note',
    'These are placeholders for YOUR commercial terms. DocStudio does not provide legal, tax or commercial advice, and no term here is pre-filled for you.',
    { title: 'Terms' },
  );
  const authorisation = createTemplateSignatureBlock([
    { role: 'Prepared by', designation: '[name / designation]' },
    { role: 'Authorised by', designation: '[name / designation]' },
  ]);

  return createDefaultTemplate({
    id: 'builtin.financial-administrative.quotation',
    origin: 'builtin',
    name: 'Quotation',
    description:
      'General-purpose quotation with issue details, customer block, priced item lines, totals note, commercial-terms prompts and authorisation. A business document — not an ISO/IEC 17025 record.',
    category: 'financial-administrative',
    tags: ['quotation', 'quote', 'pricing', 'sales', 'business'],
    author: BUILTIN_TEMPLATE_AUTHOR,
    createdAt: BUILTIN_TEMPLATE_TIMESTAMP,
    updatedAt: BUILTIN_TEMPLATE_TIMESTAMP,
    defaults: {
      metadata: {
        title: 'Quotation',
        documentType: 'Quotation',
      },
    },
    sections: [
      createTemplateSection('Quotation Details', {
        description: 'Reference, dates and preparer of the quotation.',
        prompt: 'Adapt the fields to your own numbering convention.',
        blocks: [details],
      }),
      createTemplateSection('Customer Details', {
        description: 'Who the quotation is for.',
        prompt: 'Complete from the customer\'s enquiry.',
        blocks: [customer],
      }),
      createTemplateSection('Scope of Supply or Services', {
        description: 'What is being offered, in and out of scope.',
        prompt: 'Be explicit about exclusions to avoid later disputes.',
        blocks: [scope],
      }),
      createTemplateSection('Items and Pricing', {
        description: 'Line items with quantities, units and prices.',
        prompt: 'Prices are yours to enter; the empty cells are deliberate.',
        blocks: [items, totals],
      }),
      createTemplateSection('Terms', {
        description: 'Your commercial terms for this quotation.',
        prompt: 'Supply your own payment, delivery and validity terms.',
        blocks: [terms, termsNote],
      }),
      createTemplateSection('Authorisation', {
        description: 'Who prepared and who approved the quotation.',
        prompt: 'Replace the placeholder signers with the actual names and roles.',
        blocks: [authorisation],
      }),
    ],
  });
}

/** Purchase Request — requisition with estimated costs and approval (§11.8). */
export function createPurchaseRequestTemplate(): DocStudioTemplate {
  const details = createTemplateTableBlock(
    ['Field', 'Entry'],
    [
      ['Request number', ''],
      ['Date raised', ''],
      ['Required by', ''],
      ['Requested by', ''],
      ['Department / cost centre', ''],
    ],
    { caption: 'Use your own requisition-reference convention.' },
  );
  const justification = createTemplateParagraphBlock(
    'Explain why the purchase is needed — what it supports, what happens without it, and any alternative considered. Keep it factual; approvers should be able to decide from this paragraph.',
  );
  const items = createTemplateTableBlock(
    ['#', 'Item / description', 'Qty', 'Unit', 'Est. unit price', 'Est. total', 'Preferred supplier (if known)'],
    [
      ['1', '', '', '', '', '', ''],
      ['2', '', '', '', '', '', ''],
      ['3', '', '', '', '', '', ''],
    ],
    { caption: 'Estimates only — attach quotations where your process requires them.' },
  );
  const budget = createTemplateParagraphBlock(
    'Record the budget or cost code the purchase should be charged to, whether quotations are attached, and any quotation references. Enter amounts in your own currency and conventions.',
  );
  const budgetNote = createTemplateCalloutBlock(
    'info',
    'All amounts here are estimates for internal approval. Follow your organization\'s own approval route — this form does not authorise spending by itself.',
    { title: 'Approval route' },
  );
  const authorisation = createTemplateSignatureBlock([
    { role: 'Requested by', designation: '[name / designation]' },
    { role: 'Approved by', designation: '[name / designation]' },
  ]);

  return createDefaultTemplate({
    id: 'builtin.financial-administrative.purchase-request',
    origin: 'builtin',
    name: 'Purchase Request',
    description:
      'Internal requisition with request details, justification, estimated item lines, budget notes and approval signatures. A general-purpose business document, not an ISO/IEC 17025 record.',
    category: 'financial-administrative',
    tags: ['purchase', 'procurement', 'request', 'requisition', 'business'],
    author: BUILTIN_TEMPLATE_AUTHOR,
    createdAt: BUILTIN_TEMPLATE_TIMESTAMP,
    updatedAt: BUILTIN_TEMPLATE_TIMESTAMP,
    defaults: {
      metadata: {
        title: 'Purchase Request',
        documentType: 'Purchase Request',
      },
    },
    sections: [
      createTemplateSection('Request Details', {
        description: 'Reference, timing and requester of the purchase.',
        prompt: 'Adapt the fields to your own requisition convention.',
        blocks: [details],
      }),
      createTemplateSection('Justification', {
        description: 'Why the purchase is needed.',
        prompt: 'One factual paragraph an approver can decide from.',
        blocks: [justification],
      }),
      createTemplateSection('Items Requested', {
        description: 'What is being requested, with estimated prices.',
        prompt: 'Add rows per item; attach quotations if your process requires them.',
        blocks: [items],
      }),
      createTemplateSection('Budget Notes', {
        description: 'Cost centre, budget code and supporting references.',
        prompt: 'Enter your own codes and currency conventions.',
        blocks: [budget, budgetNote],
      }),
      createTemplateSection('Authorisation', {
        description: 'Who requested and who approved the purchase.',
        prompt: 'Replace the placeholder signers with the actual names and roles.',
        blocks: [authorisation],
      }),
    ],
  });
}
