/**
 * DocStudio — Shared constants for the built-in template library (P03-M3)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Just two pieces of shared identity for the catalog builders — not a
 * registry or plugin framework:
 *
 * • `BUILTIN_TEMPLATE_TIMESTAMP` — a FIXED timestamp stamped as
 *   `createdAt`/`updatedAt` on every library template so catalog content is
 *   deterministic (the example SOP keeps its own P03-M1 timestamps).
 * • `BUILTIN_TEMPLATE_AUTHOR` — the shared author/source credit.
 *
 * Section/block/reference IDs inside each template are minted ONCE when the
 * canonical catalog is first built and then kept stable through cloning
 * (see `index.ts`), so consumers never see a different template identity
 * between chooser opens.
 *
 * @module services/template-library/shared
 */

/** Fixed creation/update timestamp for every built-in library template. */
export const BUILTIN_TEMPLATE_TIMESTAMP = '2026-10-16T12:00:00.000Z';

/** Shared author/source credit for the built-in library. */
export const BUILTIN_TEMPLATE_AUTHOR = 'DocStudio';
