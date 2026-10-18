/**
 * DocStudio — Deterministic outline numbering for heading blocks (P05-M2)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * `project_details.md` §10.1 requires numbered/plain heading mode with
 * consistent numbering in editor, preview and export.  This module is the
 * ONE numbering engine shared by the editor panel and the PoC renderer, so
 * the same ordered document always produces the same displayed prefixes.
 *
 * The prefix is DERIVED, never stored: `HeadingBlockData.text` remains the
 * author's content and is never mutated with a numbering prefix, so
 * repeated rendering or serialization can never accumulate duplicates.
 *
 * Numbering rules (documented, deterministic)
 * ───────────────────────────────────────────
 * • Only headings with `numbered: true` participate.
 * • A PLAIN (unnumbered) heading is skipped entirely: it does not consume
 *   a number, does not reset subordinate levels, and does not receive a
 *   prefix.  Subsequent numbered headings continue exactly as if the plain
 *   heading were absent.
 * • A numbered heading at level L increments the level-L counter and RESETS
 *   counters for levels L+1…4 (a new section starts a new subordinate
 *   sequence).
 * • The prefix for a level-L heading joins counters 1…L with dots.
 *   Counter segments that are still zero — levels that have not yet begun
 *   within the current context — are OMITTED (never printed as "0").
 *   Examples: first H1 → "1"; H2 under it → "1.1"; H3 directly under an
 *   H1 with no H2 yet → "1.1"; next H1 → "2"; H3 under the second H1 →
 *   "2.1".
 * • Level skipping is therefore tolerated (an H3 without a preceding H2 is
 *   numbered by the counters that exist), repeated levels increment
 *   ("1", "1.1", "1.2", then H1 "2"), and headings at the very start or
 *   very end of a document follow the same rules with no special case.
 *
 * @module services/heading-numbering
 */

import type { ContentBlock, DocUUID } from '../types/document';

/** Supported heading levels (schema `HeadingBlockData.level`). */
export const HEADING_LEVELS = [1, 2, 3, 4] as const;

/**
 * Compute the display prefix for every NUMBERED heading block in the given
 * document order, keyed by the block's stable envelope ID.  Plain
 * headings (and all non-heading blocks) receive no entry.
 *
 * Deterministic and pure: the same ordered block list always yields the
 * same map.  Callers (editor, renderer) must pass the AUTHORITATIVE
 * `document.blocks` order so both surfaces agree.
 */
export function computeHeadingNumbering(
  blocks: readonly ContentBlock[],
): Map<DocUUID, string> {
  const counters: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0 };
  const prefixes = new Map<DocUUID, string>();

  for (const block of blocks) {
    const data = block.data;
    if (data.type !== 'heading' || !data.numbered) continue;

    const level = data.level;
    counters[level] += 1;
    for (const deeper of HEADING_LEVELS) {
      if (deeper > level) counters[deeper] = 0;
    }

    // Join counters 1…level, omitting levels that have not begun (zero).
    const segments: string[] = [];
    for (const member of HEADING_LEVELS) {
      if (member > level) break;
      if (counters[member] > 0) segments.push(String(counters[member]));
    }
    prefixes.set(block.id, segments.join('.'));
  }

  return prefixes;
}

/**
 * The separator inserted between a numbering prefix and the heading text
 * when they are rendered together (two non-breaking spaces keep the pair
 * on one line and give a stable, theme-independent gap).
 */
export const HEADING_PREFIX_SEPARATOR = '\u00A0\u00A0';
