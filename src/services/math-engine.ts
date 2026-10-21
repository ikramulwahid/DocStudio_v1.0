/**
 * DocStudio — Formula math engine (P06-M3)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * LaTeX → SVG conversion for the formula block (roadmap Phase 06 §6.3;
 * product spec §10.6: "The implementation should use a suitable maintained
 * formula-rendering library selected during implementation.").
 *
 * LIBRARY SELECTION — `mathjax-full` 3.2.1 (MathJax v3 TeX→SVG pipeline):
 * DocStudio renders documents to PDF through `@react-pdf/renderer`, which
 * consumes PDF-native primitives only.  KaTeX (the other maintained option)
 * emits HTML+CSS that react-pdf cannot lay out; MathJax's SVG output maps
 * 1:1 onto react-pdf `<Svg>/<G>/<Path>` nodes, runs identically offline in
 * the Tauri WebView, in the Node verification suites, and in PDF export,
 * and produces vector glyphs (no raster fonts).  The selection rationale is
 * recorded in the roadmap P06-M3 entry.
 *
 * DETERMINISM CONTRACT (verified by verify_p06_m3.mjs):
 * • One FRESH MathJax document per conversion.  The SVG font-cache id
 *   counter (`MJX-1-…`, `MJX-2-…`, …) restarts on every fresh document, so
 *   identical input yields byte-identical SVG.  A shared document
 *   increments the counter per conversion and is NOT deterministic.
 * • `em = 16`, `ex = 8` are pinned conversion geometry: the emitted
 *   viewBox is font-relative and matches at that pair; other pairs can
 *   introduce float drift, so these never vary between runs.
 * • A small input-keyed memo keeps repeated preview renders cheap without
 *   changing the byte contract (the memo stores exact results).
 *
 * GEOMETRY: MathJax writes viewBox coordinates in internal font units
 * where 1000 units = 1 em (the font design space).  Everything the
 * renderer needs is derived from the viewBox alone:
 *   widthPt          = viewBoxWidth  × fontSizePt / 1000
 *   heightPt         = viewBoxHeight × fontSizePt / 1000
 *   baselineOffsetPt = −viewBox.y    × fontSizePt / 1000   (viewBox.y ≤ 0;
 *   the value is the distance from the box TOP down to the formula
 *   baseline — used for optical alignment of equation numbers).
 *
 * INVALID INPUT: the TeX parser reports errors as an `merror` node carrying
 * `data-mjx-error="…"`.  The engine NEVER throws at callers — it returns
 * `{ ok: false, message }` so the editor can show a field-specific hint and
 * the renderer can print an honest visible marker instead of silently
 * dropping content.  Empty/whitespace-only input is a failure as well (the
 * formula content service rejects it at commit time with its own message).
 *
 * @module services/math-engine
 */

import { mathjax } from 'mathjax-full/js/mathjax.js';
import { TeX } from 'mathjax-full/js/input/tex.js';
import { SVG } from 'mathjax-full/js/output/svg.js';
import { liteAdaptor } from 'mathjax-full/js/adaptors/liteAdaptor.js';
import { RegisterHTMLHandler } from 'mathjax-full/js/handlers/html.js';
// Side-effect configuration loads — each module registers its package name
// with the TeX input jax (the same mechanism MathJax's AllPackages uses;
// listing a name in `packages` without loading its configuration has no
// effect, which was verified during P06-M3).  Deliberately NOT loaded:
// `autoload`/`require` (dynamic extension loading is not offline-safe) and
// `noundefined` (it renders unknown macros as passable text; without it the
// base parser reports them as detectable errors, which the service and the
// editor surface to the user).
import 'mathjax-full/js/input/tex/ams/AmsConfiguration.js';
import 'mathjax-full/js/input/tex/cases/CasesConfiguration.js';
import 'mathjax-full/js/input/tex/newcommand/NewCommandConfiguration.js';
import 'mathjax-full/js/input/tex/boldsymbol/BoldsymbolConfiguration.js';

/** TeX packages enabled for formula input (each one side-effect loaded above). */
export const FORMULA_TEX_PACKAGES: readonly string[] = [
  'base',
  'ams',
  'cases',
  'newcommand',
  'boldsymbol',
];

/** MathJax internal units per em — the viewBox unit scale. */
export const MATH_UNITS_PER_EM = 1000;

/** Pinned conversion geometry (see the determinism contract above). */
const CONVERT_EM = 16;
const CONVERT_EX = 8;

/** Input-keyed memo cap; oldest entries are evicted (Map insertion order). */
const MEMO_LIMIT = 400;

const adaptor = liteAdaptor();
RegisterHTMLHandler(adaptor);

/** Box metrics of a converted formula at a requested font size (points). */
export interface MathSvgMetrics {
  /** Box width at the requested font size (points). */
  readonly widthPt: number;
  /** Box height at the requested font size (points). */
  readonly heightPt: number;
  /** Distance from the box TOP down to the formula baseline (points). */
  readonly baselineOffsetPt: number;
}

export type MathSvgResult =
  | { readonly ok: true; readonly svg: string; readonly metrics: MathSvgMetrics }
  | { readonly ok: false; readonly message: string };

/** Decode the XML entities MathJax may emit inside `data-mjx-error`. */
function decodeErrorAttribute(raw: string): string {
  return raw
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#x27;/g, "'")
    .replace(/&amp;/g, '&');
}

/** Input-keyed memo of exact results (see the determinism contract). */
const memo = new Map<string, MathSvgResult>();

function memoKey(latex: string, fontSizePt: number, displayMode: boolean): string {
  return `${displayMode ? 'display' : 'inline'}|${fontSizePt}|${latex}`;
}

/** The uncached conversion — fresh MathJax document per call (deterministic). */
function convertRaw(latex: string, fontSizePt: number, displayMode: boolean): MathSvgResult {
  const trimmed = latex.trim();
  if (trimmed === '') {
    return { ok: false, message: 'the formula is empty (no LaTeX content)' };
  }

  let svg: string;
  try {
    const doc = mathjax.document('', {
      InputJax: new TeX({ packages: [...FORMULA_TEX_PACKAGES] }),
      OutputJax: new SVG({ fontCache: 'local' }),
    });
    svg = adaptor.innerHTML(
      doc.convert(trimmed, {
        display: displayMode,
        em: CONVERT_EM,
        ex: CONVERT_EX,
        containerWidth: 80 * CONVERT_EM,
        lineWidth: 100000,
        scale: 1,
      }),
    );
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    return { ok: false, message: `the LaTeX engine could not read this formula (${detail})` };
  }

  // TeX errors arrive as an `merror` node carrying the parser's message.
  const errorMatch = /data-mjx-error="([^"]*)"/.exec(svg);
  if (errorMatch !== null) {
    return { ok: false, message: decodeErrorAttribute(errorMatch[1]) };
  }

  const viewBoxMatch = /viewBox="(-?[\d.]+) (-?[\d.]+) (-?[\d.]+) (-?[\d.]+)"/.exec(svg);
  if (viewBoxMatch === null) {
    return { ok: false, message: 'the LaTeX engine returned no layout box for this formula' };
  }
  const boxY = Number(viewBoxMatch[2]);
  const boxW = Number(viewBoxMatch[3]);
  const boxH = Number(viewBoxMatch[4]);
  const ptPerUnit = fontSizePt / MATH_UNITS_PER_EM;

  return {
    ok: true,
    svg,
    metrics: {
      widthPt: boxW * ptPerUnit,
      heightPt: boxH * ptPerUnit,
      // viewBox.y is the (negative) offset of the box top above the
      // baseline, so −y × ptPerUnit is the downward distance to it.
      baselineOffsetPt: -boxY * ptPerUnit,
    },
  };
}

/**
 * Convert one LaTeX formula to an SVG string plus point-space metrics at
 * `fontSizePt`.  Deterministic, memoized, and never throws: an unparseable
 * formula returns `{ ok: false, message }` with the TeX parser's own
 * field-specific message (e.g. "Missing argument for \frac").
 */
export function renderLatexToMathSvg(
  latex: string,
  fontSizePt: number,
  displayMode: boolean,
): MathSvgResult {
  const key = memoKey(latex, fontSizePt, displayMode);
  const hit = memo.get(key);
  if (hit !== undefined) return hit;

  const result = convertRaw(latex, fontSizePt, displayMode);
  if (memo.size >= MEMO_LIMIT) {
    const oldest = memo.keys().next().value;
    if (oldest !== undefined) memo.delete(oldest);
  }
  memo.set(key, result);
  return result;
}

/**
 * Parse-only validity probe for a LaTeX string (renders at a nominal size
 * and reports the parser's verdict).  Used by the formula editor's live
 * hint and by the formula content service's commit-time validation.
 */
export function validateLatex(latex: string): { ok: true } | { ok: false; message: string } {
  const result = renderLatexToMathSvg(latex, 12, true);
  // Explicit `=== false` (not `!result.ok`) so this narrows under BOTH the
  // project's --strict tsconfig and the legacy non-strict suite compiles —
  // the same convention as rich-text.ts / list-callout-content.ts.
  if (result.ok === false) {
    return { ok: false, message: result.message };
  }
  return { ok: true };
}

/**
 * Deterministic text-width ESTIMATE (points), used for layout decisions
 * that must be made before anything is rendered (the "Where:" column
 * width, the equation-number cell).  Times-family average advance widths
 * per character class; deliberately slightly conservative.  The renderer
 * treats the result as a guess: an overestimate only moves the variable
 * definitions below the formula (still spec-conformant — "move them below
 * when the available width is insufficient"); an underestimate can wrap a
 * definition inside its fixed column, which the layout tolerates by
 * growing the column height.
 */
export function estimateTextWidthPt(text: string, fontSizePt: number): number {
  let emWidth = 0;
  for (const ch of text) {
    emWidth += charWidthEm(ch);
  }
  return emWidth * fontSizePt;
}

const NARROW_CHARS = new Set(["i", "j", "l", ".", ",", ";", ":", "'", "!", "|", "(", ")", "[", "]", "{", "}"]);
const WIDE_CHARS = new Set(['m', 'M', 'W', 'w', '@', '%']);

function charWidthEm(ch: string): number {
  if (ch === ' ') return 0.25;
  if (NARROW_CHARS.has(ch)) return 0.3;
  if (WIDE_CHARS.has(ch)) return 0.85;
  if (ch >= '0' && ch <= '9') return 0.5;
  if (ch >= 'A' && ch <= 'Z') return 0.7;
  if (ch >= 'a' && ch <= 'z') return 0.48;
  return 0.5; // symbols, math chars, unicode — middle estimate
}
