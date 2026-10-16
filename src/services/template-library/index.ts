/**
 * DocStudio — Authoritative built-in template catalog (P03-M3)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * ONE source of truth for the built-in library that the chooser
 * (`getBuiltinTemplates()` in `services/template-chooser.ts`) and every test
 * reuse.  There is deliberately no registry framework or plugin mechanism —
 * just an ordered list of builder functions.
 *
 * Catalog contents
 * ────────────────
 * 16 built-in templates — at least two per category across all eight
 * `TEMPLATE_CATEGORIES` (project_details.md §11.1–§11.8), including the
 * retained P03-M1 example SOP.  Builders live in one module per category
 * under `services/template-library/`.
 *
 * Identity model (stable, safe to hand out)
 * ─────────────────────────────────────────
 * • Template ROOT ids are immutable readable slugs (`builtin.<category>.<slug>`)
 *   — stable across releases, as required by the built-in origin policy.
 * • The canonical catalog is built LAZILY, ONCE per process: section,
 *   reference-hint and starter-block IDs are minted on that first build and
 *   are therefore IDENTICAL across repeated retrievals — opening the chooser
 *   never mints a different underlying template identity.
 * • Every retrieval returns a DEEP CLONE (JSON round-trip; templates are
 *   pure JSON data).  The canonical objects are never handed out, so chooser
 *   or instantiation consumers cannot corrupt the source library, and
 *   repeated retrievals serialize to identical bytes.
 *
 * Validation
 * ──────────
 * The canonical build validates each template through `validateTemplate`
 * (the same validator `.dstemplate` files use) and silently drops anything
 * structurally invalid, so the chooser can only ever offer valid entries.
 * `verify_p03_m3.mjs` asserts the expected count and per-category coverage,
 * which makes a dropped template a hard test failure rather than a silent
 * shrinkage.
 *
 * Determinism: all builders stamp the fixed `BUILTIN_TEMPLATE_TIMESTAMP`
 * (the example SOP keeps its own P03-M1 timestamps) and write fixed sample
 * content; only the minted UUIDs differ between processes, not between
 * retrievals.
 *
 * This module is pure (no React/DOM/Tauri imports).
 *
 * @module services/template-library
 */

import type { DocStudioTemplate } from '../../types/template';
import { validateTemplate } from '../template-file';
import { createExampleSopTemplate } from '../template-samples';
import {
  createQualityPolicyTemplate,
  createQualitySystemProcedureTemplate,
} from './management-system';
import {
  createTestingCalibrationProcedureTemplate,
  createMethodVerificationValidationProtocolTemplate,
} from './technical-procedures';
import { createEquipmentOperationWorkInstructionTemplate } from './sops-work-instructions';
import {
  createRawObservationWorksheetTemplate,
  createReplicateReadingWorksheetTemplate,
} from './worksheets-rough-datasheets';
import {
  createProcessedTestResultsRecordTemplate,
  createMeasurementUncertaintySummaryTemplate,
} from './final-datasheets-technical-records';
import {
  createSampleReceiptFormTemplate,
  createEquipmentMaintenanceRecordTemplate,
} from './forms-registers-exhibits';
import {
  createInternalAuditChecklistTemplate,
  createNonconformingWorkCorrectiveActionTemplate,
} from './quality-assurance';
import {
  createQuotationTemplate,
  createPurchaseRequestTemplate,
} from './financial-administrative';

/**
 * Builders in chooser display order: the retained example SOP leads its own
 * category, then two templates for every category in `TEMPLATE_CATEGORIES`
 * order (management-system → … → financial-administrative).
 */
const BUILTIN_TEMPLATE_BUILDERS: readonly (() => DocStudioTemplate)[] = [
  // §11.1 management-system
  createQualityPolicyTemplate,
  createQualitySystemProcedureTemplate,
  // §11.2 technical-procedures
  createTestingCalibrationProcedureTemplate,
  createMethodVerificationValidationProtocolTemplate,
  // §11.3 sops-work-instructions (example SOP first within its category)
  createExampleSopTemplate,
  createEquipmentOperationWorkInstructionTemplate,
  // §11.4 worksheets-rough-datasheets
  createRawObservationWorksheetTemplate,
  createReplicateReadingWorksheetTemplate,
  // §11.5 final-datasheets-technical-records
  createProcessedTestResultsRecordTemplate,
  createMeasurementUncertaintySummaryTemplate,
  // §11.6 forms-registers-exhibits
  createSampleReceiptFormTemplate,
  createEquipmentMaintenanceRecordTemplate,
  // §11.7 quality-assurance
  createInternalAuditChecklistTemplate,
  createNonconformingWorkCorrectiveActionTemplate,
  // §11.8 financial-administrative
  createQuotationTemplate,
  createPurchaseRequestTemplate,
];

/** Deep JSON clone — templates are pure JSON data (no functions/Dates). */
function cloneTemplate(template: DocStudioTemplate): DocStudioTemplate {
  return JSON.parse(JSON.stringify(template)) as DocStudioTemplate;
}

/**
 * The lazily-built canonical catalog.  Module-private: NEVER exported, so no
 * consumer can mutate the source library.  Built on first retrieval.
 */
let canonicalCatalog: readonly DocStudioTemplate[] | null = null;

function buildCanonicalCatalog(): readonly DocStudioTemplate[] {
  const valid: DocStudioTemplate[] = [];
  for (const build of BUILTIN_TEMPLATE_BUILDERS) {
    const template = build();
    try {
      validateTemplate(template);
      valid.push(template);
    } catch {
      // A structurally invalid built-in must never reach the chooser; the
      // expected-count assertions in verify_p03_m3.mjs turn any drop into a
      // visible test failure rather than a silent catalog shrinkage.
    }
  }
  return Object.freeze(valid);
}

/**
 * Return the current built-in catalog as DEEP CLONES.
 *
 * Safe to filter, map or hand to instantiation: mutating the result can
 * never reach the canonical library, and two consecutive calls return
 * equal-content, byte-identical templates (stable IDs).
 */
export function getBuiltinCatalogTemplates(): DocStudioTemplate[] {
  if (canonicalCatalog === null) {
    canonicalCatalog = buildCanonicalCatalog();
  }
  return canonicalCatalog.map(cloneTemplate);
}
