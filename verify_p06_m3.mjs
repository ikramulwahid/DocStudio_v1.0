/**
 * P06-M3 Verification Suite — Formula Blocks
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Proves, against the REAL compiled modules (no mocks, no reimplementation):
 *  1. module surface — every P06-M3 export reachable from the node entry;
 *  2. the MathJax engine — exact viewBox-derived metrics, font-size
 *     linearity, byte-determinism, display vs inline, the TeX package set,
 *     parser error messages, never-throws behaviour, and the text-width
 *     estimator;
 *  3. the SVG → react-pdf converter — quadratic→cubic expansion (exact
 *     textbook control points, `T` reflection, `H`/`V`→`L`, relative
 *     absolutisation, best-effort bail-out), the element walk (only
 *     svg/g/path, no `data-*`, no `currentColor`), and parser robustness;
 *  4. the formula content service — registry defaults, validated commit,
 *     stamping, no-op identity, every rejection code, number/"Where:" label
 *     set+clear semantics, variable add/update/remove by stable id, the
 *     dispatcher, and source immutability;
 *  5. the pure layout planner — fit scaling, equation-number cell, the
 *     "Where:" beside/below rule INCLUDING the exact boundary, and
 *     determinism;
 *  6. the editor panel component — real react-dom/server markup: root,
 *     live LaTeX parse hint (valid/invalid/empty), controls, variable
 *     cards, length limits, the new CSS rule, and the App/Workspace/panel
 *     wiring;
 *  7. persistence — native-file round-trip of every formula field with
 *     stable entry ids and schema version 1 (no bump);
 *  8. PDF output — a real formula document through the REAL `PocDocument`:
 *     byte-determinism, vector glyph proof (curve counts + no text
 *     fallback), planner↔PDF geometry agreement for the BESIDE and BELOW
 *     placements (pdfjs glyph positions), the honest overflow note, the
 *     honest unrenderable marker for legacy data, the bold "Where:"
 *     label, and — after the owner-confirmed P06-M3-R1 alignment
 *     defect — left/centre/right formula-box placement measured through
 *     the pdfjs operator-list CTM, alone and combined with the
 *     right-pinned number and the Where list;
 *  9. regression — the P06-M2 structural blocks still render, the formula
 *     registry entry is sane, fixtures/baselines are untouched.
 *
 * HONEST SCOPE NOTES (also recorded in project_roadmap.md)
 * ───────────────────────────────────────────────────────
 * • Baselines are PROTECTED: this suite renders in memory only and writes
 *   nothing to `fixtures/`.  No committed artifact is read for comparison
 *   and none is regenerated.
 * • Formulas render as VECTOR PATHS in the PDF — they are not selectable
 *   text (a deliberate engine trade-off, documented at P06-M3).
 * • The editor's EVENT behaviour (blur/commit dispatch) cannot fire under
 *   react-dom/server; the dispatch path is proven through the service
 *   tests (group 4) and statically for wiring (group 9).  The live native
 *   walkthrough is recorded separately in the roadmap.
 * • Native Tauri Save/Open dialogs are NOT RUN here (not drivable from
 *   Node); persistence is proven at the serialization data layer only.
 *
 * Usage: node verify_p06_m3.mjs   (or: npm run verify:p06-m3)
 * Exit code 0 => all checks pass.
 */

import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { execSync } from 'node:child_process';

const require = createRequire(import.meta.url);
const root = path.dirname(new URL(import.meta.url).pathname.replace(/^\//, ''));
const CACHE = path.join(root, 'node_modules', '.cache', 'ds-p06-m3-verify');

// ── Test harness ────────────────────────────────────────────────────────────
let passed = 0;
const failed = [];
async function test(name, fn) {
  try {
    await fn();
    passed += 1;
    console.log(`PASS  ${name}`);
  } catch (e) {
    failed.push(name);
    console.error(`FAIL  ${name}\n      ${e && e.message ? e.message : e}`);
  }
}
function group(title) {
  console.log(`\n── ${title} ${'─'.repeat(Math.max(0, 66 - title.length))}`);
}

// ── Compile the real modules under test ─────────────────────────────────────
// Compiled (not bundled) inside node_modules/.cache so bare imports resolve
// to the REAL installed packages — same pattern as verify_p06_m1/m2.
group('compile');
const COMPILE_ROOTS = [
  'src/renderer/poc/poc-node-entry.ts',
  'src/services/block-registry.ts',
  // The formula EDITOR is rendered with react-dom/server below so the panel
  // structure, live-hint classes and control values are asserted from real
  // component output, not from source text.
  'src/components/editor-panel/FormulaContentEditor.tsx',
];
try {
  execSync(
    'npx tsc ' + COMPILE_ROOTS.join(' ') +
      ` --outDir "${CACHE}" --module commonjs --target es2020` +
      ' --moduleResolution node --esModuleInterop --skipLibCheck' +
      ' --jsx react-jsx --strict',
    { cwd: root, stdio: 'pipe' },
  );
  console.log(`PASS  TypeScript compile of ${COMPILE_ROOTS.length} roots (--strict)`);
  passed += 1;
} catch (e) {
  console.error(String(e.stdout || '') + String(e.stderr || ''));
  console.error('FATAL: TypeScript compilation failed.');
  process.exit(1);
}

const pick = (...candidates) => {
  const hit = candidates.find((p) => fs.existsSync(p));
  if (!hit) throw new Error(`compiled module not found:\n  ${candidates.join('\n  ')}`);
  return require(hit);
};

const pocNode = pick(
  path.join(CACHE, 'renderer', 'poc', 'poc-node-entry.js'),
  path.join(CACHE, 'src', 'renderer', 'poc', 'poc-node-entry.js'),
);
const registry = pick(
  path.join(CACHE, 'services', 'block-registry.js'),
  path.join(CACHE, 'src', 'services', 'block-registry.js'),
);
const defaults = pick(
  path.join(CACHE, 'types', 'defaults.js'),
  path.join(CACHE, 'src', 'types', 'defaults.js'),
);
const documentFile = pick(
  path.join(CACHE, 'services', 'document-file.js'),
  path.join(CACHE, 'src', 'services', 'document-file.js'),
);
const bodyThemeModule = pick(
  path.join(CACHE, 'services', 'body-theme-tokens.js'),
  path.join(CACHE, 'src', 'services', 'body-theme-tokens.js'),
);
const formulaEditorModule = pick(
  path.join(CACHE, 'components', 'editor-panel', 'FormulaContentEditor.js'),
  path.join(CACHE, 'src', 'components', 'editor-panel', 'FormulaContentEditor.js'),
);
// Real component markup (not source grep) for the editor-structure checks.
// NOTE: the react-pdf primitives (`Svg`/`G`/`Path`) are host TAGS for the
// react-pdf renderer, so react-dom/server renders them as UPPERCASE unknown
// elements and warns about the casing — cosmetic noise around the real walk
// assertions below, suppressed here.
const { renderToStaticMarkup } = require('react-dom/server');
const React = require('react');
let casingWarnings = 0;
const markupOf = (element) => {
  const original = console.error;
  console.error = (...args) => {
    if (typeof args[0] === 'string' && args[0].includes('is using incorrect casing')) {
      casingWarnings += 1;
      return;
    }
    original(...args);
  };
  try {
    return renderToStaticMarkup(element);
  } finally {
    console.error = original;
  }
};

const {
  renderDocPdfBytes,
  POC_CREATED_AT,
  serializeDocument,
  validateDocument,
  createBlock,
  computePocLayout,
  renderLatexToMathSvg,
  validateLatex,
  estimateTextWidthPt,
  FORMULA_TEX_PACKAGES,
  MATH_UNITS_PER_EM,
  updateFormulaContent,
  addVariableDefinition,
  updateVariableDefinition,
  removeVariableDefinition,
  applyFormulaAction,
  planFormulaLayout,
  FORMULA_WHERE_GAP_PT,
  FORMULA_NUMBER_GAP_PT,
  FORMULA_SYMBOL_GAP_PT,
  mathSvgToReact,
  parseMathSvgDocument,
  expandMathPathData,
  FORMULA_ALIGNMENTS,
  MAX_FORMULA_LATEX_LENGTH,
  MAX_FORMULA_NUMBER_LENGTH,
  MAX_WHERE_LABEL_LENGTH,
  MAX_VARIABLE_SYMBOL_LENGTH,
  MAX_VARIABLE_DEFINITION_LENGTH,
  MAX_VARIABLE_UNIT_LENGTH,
} = pocNode;
const { BLOCK_REGISTRY, summarizeBlockData } = registry;
const { createDefaultDocument, newUUID } = defaults;
const { deserializeDocument } = documentFile;
const { resolveBodyTheme } = bodyThemeModule;
const { FormulaContentEditor } = formulaEditorModule;

// ── Fixtures and service helpers ────────────────────────────────────────────
const T0 = POC_CREATED_AT;
const STAMP = '2026-10-21T12:00:00.000Z';
let idSeq = 0;
const genId = () => `06300000-0000-4000-8000-${String(++idSeq).padStart(12, '0')}`;
/**
 * Suite documents start with the cover page DISABLED so that page-count
 * assertions describe BODY pagination only (same policy as verify_p06_m2).
 */
const newDoc = (id = 'fx-doc-1') => {
  const doc = createDefaultDocument(id, T0);
  return doc.frontPage === undefined || doc.frontPage.enabled === undefined
    ? doc
    : { ...doc, frontPage: { ...doc.frontPage, enabled: false } };
};

function applied(res, label) {
  assert.equal(
    res.ok,
    true,
    `${label}: expected ok, got ${res.ok ? '' : `${res.code} — ${res.message}`}`,
  );
  assert.equal(res.changed, true, `${label}: expected a real change`);
  return res.doc;
}
function rejected(res, code, label) {
  assert.equal(res.ok, false, `${label}: expected rejection, the change was applied`);
  assert.equal(res.code, code, `${label}: error code (message: ${res.message})`);
}
function noOp(res, sourceDoc, label) {
  assert.equal(res.ok, true, `${label}: no-ops are still ok`);
  assert.equal(res.changed, false, `${label}: expected changed=false`);
  assert.equal(res.doc, sourceDoc, `${label}: no-op returns the SAME reference`);
}

/** Append a registry-default block of `type` to the document (real factory). */
function insertBlock(doc, type) {
  const block = createBlock(type, genId);
  return { doc: { ...doc, blocks: [...doc.blocks, block] }, block };
}
/** Address the single block of `type` (asserts exactly one exists). */
const only = (doc, type) => {
  const hits = doc.blocks.filter((b) => b.data.type === type);
  assert.equal(hits.length, 1, `fixture must hold exactly one ${type}`);
  return hits[0];
};
/** Dispatch one formula action through the real service. */
const act = (doc, blockId, action, now = STAMP) =>
  applyFormulaAction(doc, blockId, action, { now, genId });

/**
 * The representative numbered formula with one variable definition
 * (roadmap evidence: "variable definitions next to and below the formula").
 */
const SIGMA = '\\sigma = \\sqrt{\\frac{1}{N-1}\\sum_{i=1}^{N}(x_i-\\bar{x})^2}';
const SIGMA_DEFINITION = 'sample standard deviation';
const SIGMA_ROW_TEXT = 'sample standard deviation (mg/kg)';

/** A formula document with the sigma equation, number "(3)" and one variable. */
function sigmaDoc(id, mutate = (d) => d) {
  let doc = mutate(newDoc(id));
  doc = insertBlock(doc, 'formula').doc;
  const f = only(doc, 'formula');
  doc = applied(
    act(doc, f.id, {
      action: 'update-formula',
      latex: SIGMA,
      hAlign: 'center',
      displayMode: true,
      formulaNumber: '(3)',
    }),
    `${id}: sigma + number committed`,
  );
  doc = applied(act(doc, f.id, { action: 'add-variable-definition' }), `${id}: variable added`);
  const entry = only(doc, 'formula').data.variableDefinitions[0];
  doc = applied(
    act(doc, f.id, {
      action: 'update-variable-definition',
      entryId: entry.id,
      patch: { symbol: '\\sigma', definition: SIGMA_DEFINITION, unit: 'mg/kg' },
    }),
    `${id}: variable filled`,
  );
  return doc;
}

/**
 * A SHORT formula document at a given alignment (P06-M3-R1 defect fixture).
 * `E = mc^2` is ~42 pt wide, so left/centre/right placements differ by
 * hundreds of points and can never be confused with scale-to-fit
 * convergence (a wide formula would fill the band at every alignment).
 */
const SHORT_LATEX = 'E = mc^2';
function alignDoc(hAlign, { number = false, withWhere = false, narrow = false } = {}) {
  const id = `fx-align-${hAlign}${number ? '-num' : ''}${withWhere ? '-where' : ''}${narrow ? '-narrow' : ''}`;
  let doc = newDoc(id);
  if (narrow) {
    doc = {
      ...doc,
      pageSetup: {
        ...doc.pageSetup,
        margins: { ...doc.pageSetup.margins, preset: 'custom', leftMm: 90, rightMm: 90 },
      },
    };
  }
  doc = insertBlock(doc, 'formula').doc;
  const f = only(doc, 'formula');
  doc = applied(
    act(doc, f.id, {
      action: 'update-formula',
      latex: SHORT_LATEX,
      hAlign,
      displayMode: false,
      ...(number ? { formulaNumber: '(1)' } : {}),
    }),
    `${id}: formula committed`,
  );
  if (withWhere) {
    doc = applied(act(doc, f.id, { action: 'add-variable-definition' }), `${id}: variable added`);
    const entry = only(doc, 'formula').data.variableDefinitions[0];
    doc = applied(
      act(doc, f.id, {
        action: 'update-variable-definition',
        entryId: entry.id,
        patch: { symbol: 'E', definition: 'kinetic energy', unit: 'J' },
      }),
      `${id}: variable filled`,
    );
  }
  return doc;
}

/** The engine+planner geometry exactly as FormulaBlock computes it. */
function planOf(doc) {
  const { tokens } = resolveBodyTheme(
    doc.pageTypography.bodyThemeId,
    doc.pageTypography.typography,
    doc.pageTypography.monochrome,
  );
  const fontSizePt = tokens.typography.baseFontSizePt;
  const data = only(doc, 'formula').data;
  const math = renderLatexToMathSvg(data.latex, fontSizePt, data.displayMode);
  assert.equal(math.ok, true, 'planOf: the fixture formula must parse');
  const layout = computePocLayout(doc);
  const symbolMath = renderLatexToMathSvg('\\sigma', fontSizePt, false);
  assert.equal(symbolMath.ok, true, 'planOf: the \\sigma symbol must parse');
  const plan = planFormulaLayout({
    contentWidthPt: layout.contentWidth,
    naturalWidthPt: math.metrics.widthPt,
    naturalHeightPt: math.metrics.heightPt,
    baselineOffsetPt: math.metrics.baselineOffsetPt,
    fontSizePt,
    hasNumber: true,
    numberWidthPt: estimateTextWidthPt('(3)', fontSizePt),
    whereRows: [
      {
        symbolWidthPt: symbolMath.metrics.widthPt,
        textWidthPt: estimateTextWidthPt(SIGMA_ROW_TEXT, fontSizePt),
      },
    ],
    whereLabelWidthPt: estimateTextWidthPt('Where:', fontSizePt),
  });
  return { layout, plan, fontSizePt, math };
}

/**
 * Expected formula-box page origins (x) for the three alignments of an
 * `alignDoc` fixture — computed through the SAME engine + planner +
 * width-estimation policy as `FormulaBlock` (P06-M3-R1).
 */
function expectedAlignXs(doc, { number = false, withWhere = false } = {}) {
  const { tokens } = resolveBodyTheme(
    doc.pageTypography.bodyThemeId,
    doc.pageTypography.typography,
    doc.pageTypography.monochrome,
  );
  const fontSizePt = tokens.typography.baseFontSizePt;
  const data = only(doc, 'formula').data;
  const math = renderLatexToMathSvg(data.latex, fontSizePt, data.displayMode);
  assert.equal(math.ok, true, 'align fixture: the formula must parse');
  const layout = computePocLayout(doc);
  const symbolMath = renderLatexToMathSvg('E', fontSizePt, false);
  assert.equal(symbolMath.ok, true, 'align fixture: the \\E symbol must parse');
  const plan = planFormulaLayout({
    contentWidthPt: layout.contentWidth,
    naturalWidthPt: math.metrics.widthPt,
    naturalHeightPt: math.metrics.heightPt,
    baselineOffsetPt: math.metrics.baselineOffsetPt,
    fontSizePt,
    hasNumber: number,
    numberWidthPt: number ? estimateTextWidthPt('(1)', fontSizePt) : 0,
    whereRows: withWhere
      ? [
          {
            symbolWidthPt: symbolMath.metrics.widthPt,
            textWidthPt: estimateTextWidthPt('kinetic energy (J)', fontSizePt),
          },
        ]
      : [],
    whereLabelWidthPt: withWhere ? estimateTextWidthPt('Where:', fontSizePt) : 0,
  });
  // The formula cell starts at the left margin in every where-mode (the
  // area is the first row child; the beside column sits AFTER it).
  return {
    layout,
    plan,
    xs: {
      left: layout.marginLeft,
      center: layout.marginLeft + (plan.formulaCellWidthPt - plan.formulaWidthPt) / 2,
      right: layout.marginLeft + (plan.formulaCellWidthPt - plan.formulaWidthPt),
    },
  };
}

// ── PDF helpers (inflated-stream text + pdfjs positions) ────────────────────
function pdfPages(buf) {
  const text = buf.toString('latin1');
  const pages = [];
  const pageRe = /(\d+)\s+0\s+obj[\s\S]{0,400}?\/Type\s*\/Page[^s][\s\S]{0,400}?endobj/g;
  let m;
  while ((m = pageRe.exec(text)) !== null) {
    const refs = [];
    const single = m[0].match(/\/Contents\s+(\d+)\s+\d+\s+R/);
    if (single) refs.push(Number(single[1]));
    const arr = m[0].match(/\/Contents\s+\[([^\]]+)\]/);
    if (arr) for (const r of arr[1].matchAll(/(\d+)\s+\d+\s+R/g)) refs.push(Number(r[1]));
    let content = '';
    for (const ref of refs) {
      const om = new RegExp(`${ref}\\s+0\\s+obj[\\s\\S]*?stream\\r?\\n`).exec(text);
      if (!om) continue;
      const start = om.index + om[0].length;
      const end = text.indexOf('endstream', start);
      if (end < 0) continue;
      const slice = buf.subarray(start, end);
      try {
        content += zlib.inflateSync(slice).toString('latin1');
      } catch {
        content += slice.toString('latin1');
      }
    }
    pages.push({ objNum: Number(m[1]), content });
  }
  return pages;
}
/** Visible text of one page: hex TJ runs + literal Tj strings, space-joined. */
function pageText(page) {
  const out = [];
  const tjRe = /\[((?:<[0-9A-Fa-f]+>|\s|[-\d.])+)\]\s*TJ/g;
  let m;
  while ((m = tjRe.exec(page.content)) !== null) {
    const runs = m[1].match(/<[0-9A-Fa-f]+>/g) || [];
    out.push(runs.map((r) => Buffer.from(r.slice(1, -1), 'hex').toString('latin1')).join(' '));
  }
  const litRe = /\(((?:[^()\\]|\\.)*)\)\s*Tj/g;
  while ((m = litRe.exec(page.content)) !== null) {
    out.push(m[1].replace(/\\([()\\])/g, '$1'));
  }
  return out.join(' ');
}
/** Whitespace-insensitive containment (pdfkit splits runs at kerning pairs). */
const compact = (s) => s.replace(/\s+/g, '');
const has = (text, needle) => compact(text).includes(compact(needle));
const render = async (doc) => Buffer.from(await renderDocPdfBytes(doc));
const pagesOf = async (doc) => pdfPages(await render(doc));
const pageTextsOf = async (doc) => (await pagesOf(doc)).map((p) => pageText(p));
/** TRUE when the PoC fallback marker appears anywhere in the output. */
const fallbackMarker = (pages) =>
  pages.some((t) => t.includes('not yet mapped') || t.includes('not mapped'));

/** Inflate every PDF stream (content + fonts) as latin1 — curve counting. */
function inflateAll(buf) {
  const text = buf.toString('latin1');
  const out = [];
  const re = /\bstream\r?\n/g;
  let m;
  while ((m = re.exec(text)) !== null) {
    const start = m.index + m[0].length;
    const end = text.indexOf('endstream', start);
    if (end === -1) break;
    try {
      out.push(zlib.inflateSync(buf.subarray(start, end)).toString('latin1'));
    } catch {
      /* skip non-flate streams */
    }
    re.lastIndex = end;
  }
  return out.join('\n');
}
/** Count cubic curve operators (`c` / `c*`) in the inflated document. */
const countCurves = (buf) => (inflateAll(buf).match(/(^|\s)c\*?(\s|$)/gm) || []).length;

/** pdfjs wrapper (real glyph positions; same options as verify_p06_m1). */
async function withPdf(buf, fn) {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const task = pdfjs.getDocument({
    data: new Uint8Array(buf), // COPY: pdfjs detaches its input
    useWorkerFetch: false,
    isEvalSupported: false,
    useSystemFonts: false,
    standardFontDataUrl:
      path.join(root, 'node_modules', 'pdfjs-dist', 'standard_fonts').replace(/\\/g, '/') + '/',
    verbosity: 0,
  });
  const pdf = await task.promise;
  try {
    return await fn(pdf);
  } finally {
    await pdf.destroy();
  }
}
async function pageItems(pdf, pageNo) {
  const page = await pdf.getPage(pageNo);
  return (await page.getTextContent())
    .items.filter((it) => it.str && it.str.trim() !== '')
    .map((it) => ({ x: it.transform[4], y: it.transform[5], width: it.width ?? 0, s: it.str }));
}
/** Compacted text stream of the items with an offset→item map for locating. */
function compactStream(items) {
  let text = '';
  const map = [];
  for (const it of items) {
    map.push({ item: it, start: text.length });
    text += compact(it.s);
  }
  return { text, map };
}
/**
 * Locate a compacted needle in the stream; returns the glyph POSITION of
 * its first character (proportional estimate inside the owning item).
 */
function locate(stream, needle) {
  const nd = compact(needle);
  const idx = stream.text.indexOf(nd);
  if (idx < 0) return null;
  let entry = stream.map[0];
  for (const candidate of stream.map) {
    if (candidate.start <= idx) entry = candidate;
    else break;
  }
  const item = entry.item;
  const itemLen = compact(item.s).length;
  const frac = itemLen > 0 ? (idx - entry.start) / itemLen : 0;
  return { x: item.x + frac * item.width, y: item.y, item };
}
/**
 * Vector-path paint origins of one page (P06-M3-R1): walk the pdfjs
 * operator list with a save/restore CTM stack and record the current
 * translation at every `constructPath`.  Every glyph path of one MathJax
 * `<Svg>` shares the SVG box origin (viewBox coords are painted under the
 * box transform), so the DOMINANT cluster is the formula box position —
 * returned as `{x, y, count}` sorted by count (descending).
 */
async function pathOrigins(pdf, pageNo = 1) {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const page = await pdf.getPage(pageNo);
  const ops = await page.getOperatorList();
  const mul = (m1, m2) => [
    m1[0] * m2[0] + m1[2] * m2[1],
    m1[1] * m2[0] + m1[3] * m2[1],
    m1[0] * m2[2] + m1[2] * m2[3],
    m1[1] * m2[2] + m1[3] * m2[3],
    m1[0] * m2[4] + m1[2] * m2[5] + m1[4],
    m1[1] * m2[4] + m1[3] * m2[5] + m1[5],
  ];
  let ctm = [1, 0, 0, 1, 0, 0];
  const stack = [];
  const hits = new Map();
  for (let i = 0; i < ops.fnArray.length; i += 1) {
    const fn = ops.fnArray[i];
    const args = ops.argsArray[i];
    if (fn === pdfjs.OPS.save) stack.push(ctm.slice());
    else if (fn === pdfjs.OPS.restore) ctm = stack.pop() || ctm;
    else if (fn === pdfjs.OPS.transform) ctm = mul(ctm, args);
    else if (fn === pdfjs.OPS.constructPath) {
      const key = `${ctm[4].toFixed(2)},${ctm[5].toFixed(2)}`;
      hits.set(key, (hits.get(key) || 0) + 1);
    }
  }
  return [...hits.entries()]
    .map(([key, count]) => {
      const [x, y] = key.split(',').map(Number);
      return { x, y, count };
    })
    .sort((a, b) => b.count - a.count);
}
const rootClassOf = (markup) => {
  const m = /class="([^"]*)"/.exec(markup);
  return m ? m[1].split(/\s+/)[0] : '';
};

// ═══════════════════════════════════════════════════════════════════════════
// 1. Module surface
// ═══════════════════════════════════════════════════════════════════════════
group('1 · module surface');

await test('1.1 every P06-M3 export is reachable from the compiled node entry', () => {
  const functions = [
    'renderLatexToMathSvg',
    'validateLatex',
    'estimateTextWidthPt',
    'planFormulaLayout',
    'mathSvgToReact',
    'parseMathSvgDocument',
    'expandMathPathData',
    'updateFormulaContent',
    'addVariableDefinition',
    'updateVariableDefinition',
    'removeVariableDefinition',
    'applyFormulaAction',
  ];
  for (const name of functions) {
    assert.equal(typeof pocNode[name], 'function', `${name} exported as a function`);
  }
  assert.deepEqual(FORMULA_ALIGNMENTS, ['left', 'center', 'right'], 'alignment choices');
  assert.ok(FORMULA_TEX_PACKAGES.includes('ams'), 'ams package loaded');
  assert.ok(FORMULA_TEX_PACKAGES.includes('cases'), 'cases package loaded');
  assert.ok(FORMULA_TEX_PACKAGES.includes('newcommand'), 'newcommand package loaded');
  assert.ok(FORMULA_TEX_PACKAGES.includes('boldsymbol'), 'boldsymbol package loaded');
  // `autoload`/`require` are deliberately EXCLUDED so undefined macros surface
  // as errors instead of silently pulling extra packages.
  assert.equal(FORMULA_TEX_PACKAGES.includes('autoload'), false, 'autoload excluded');
  assert.equal(FORMULA_TEX_PACKAGES.includes('require'), false, 'require excluded');
  assert.equal(MATH_UNITS_PER_EM, 1000, 'engine unit scale');
  assert.equal(FORMULA_WHERE_GAP_PT, 14, 'Where gap constant');
  assert.equal(FORMULA_NUMBER_GAP_PT, 10, 'number cell gap constant');
  assert.equal(FORMULA_SYMBOL_GAP_PT, 8, 'symbol gap constant');
  assert.equal(MAX_FORMULA_LATEX_LENGTH, 4000, 'LaTeX length limit');
  assert.equal(MAX_FORMULA_NUMBER_LENGTH, 64, 'number length limit');
  assert.equal(MAX_WHERE_LABEL_LENGTH, 64, 'Where-label length limit');
  assert.equal(MAX_VARIABLE_SYMBOL_LENGTH, 200, 'symbol length limit');
  assert.equal(MAX_VARIABLE_DEFINITION_LENGTH, 1000, 'definition length limit');
  assert.equal(MAX_VARIABLE_UNIT_LENGTH, 120, 'unit length limit');
});

await test('1.2 the registry carries a Formula entry with a renderable default', () => {
  const entry = BLOCK_REGISTRY.formula;
  assert.ok(entry !== undefined, 'formula entry present');
  assert.equal(entry.displayName, 'Formula', 'display name');
  const block = entry.createDefault();
  assert.equal(block.data.type, 'formula', 'discriminant');
  assert.equal(block.data.latex, 'E = mc^2', 'default LaTeX is the spec example');
  assert.equal(block.data.hAlign, 'center', 'default alignment');
  assert.equal(block.data.displayMode, true, 'default display mode');
  assert.deepEqual(block.data.variableDefinitions, [], 'default has no variables');
  assert.equal('formulaNumber' in block.data, false, 'no number by default');
  assert.equal('whereLabelOverride' in block.data, false, 'no label override by default');
  const summary = summarizeBlockData(block.data);
  assert.match(summary, /LaTeX display/, 'summary names the mode');
  assert.match(summary, /E = mc\^2/, 'summary shows the formula');
});

// ═══════════════════════════════════════════════════════════════════════════
// 2. Math engine (MathJax → SVG + metrics)
// ═══════════════════════════════════════════════════════════════════════════
group('2 · math engine');

await test('2.1 metrics are exact functions of the SVG viewBox at the font size', () => {
  const result = renderLatexToMathSvg('E = mc^2', 11, true);
  assert.equal(result.ok, true, 'E = mc^2 parses');
  const vb = /viewBox="(-?[\d.]+) (-?[\d.]+) (-?[\d.]+) (-?[\d.]+)"/.exec(result.svg);
  assert.ok(vb !== null, 'the engine SVG carries a viewBox');
  const [, vx, vy, vw, vh] = vb.map(Number);
  const k = 11 / MATH_UNITS_PER_EM;
  assert.ok(Math.abs(result.metrics.widthPt - vw * k) < 1e-9, 'width = vbW × size / 1000');
  assert.ok(Math.abs(result.metrics.heightPt - vh * k) < 1e-9, 'height = vbH × size / 1000');
  assert.ok(
    Math.abs(result.metrics.baselineOffsetPt - -vy * k) < 1e-9,
    'baseline = −vbY × size / 1000 (positive downward)',
  );
  assert.ok(result.metrics.widthPt > 0 && result.metrics.heightPt > 0, 'positive box');
  assert.ok(result.metrics.baselineOffsetPt > 0, 'baseline sits below the box top');
  assert.ok(result.metrics.baselineOffsetPt < result.metrics.heightPt, 'baseline inside the box');
});

await test('2.2 metrics scale linearly with the font size (typography-linked)', () => {
  const small = renderLatexToMathSvg(SIGMA, 11, true);
  const big = renderLatexToMathSvg(SIGMA, 22, true);
  assert.ok(small.ok && big.ok, 'both sizes convert');
  assert.ok(
    Math.abs(big.metrics.widthPt - 2 * small.metrics.widthPt) < 1e-9,
    'width doubles with the font size',
  );
  assert.ok(
    Math.abs(big.metrics.heightPt - 2 * small.metrics.heightPt) < 1e-9,
    'height doubles with the font size',
  );
  assert.ok(
    Math.abs(big.metrics.baselineOffsetPt - 2 * small.metrics.baselineOffsetPt) < 1e-9,
    'baseline doubles with the font size',
  );
});

await test('2.3 conversion is deterministic (memoised; interleaved calls identical)', () => {
  const first = renderLatexToMathSvg(SIGMA, 11, true);
  const interleaved = renderLatexToMathSvg('x + y', 11, true);
  const second = renderLatexToMathSvg(SIGMA, 11, true);
  assert.ok(first.ok && interleaved.ok && second.ok, 'all conversions succeed');
  assert.equal(second.svg, first.svg, 'identical SVG bytes across interleaved calls');
  assert.deepEqual(second.metrics, first.metrics, 'identical metrics');
  // A different size is a distinct entry, still exact.
  const otherSize = renderLatexToMathSvg(SIGMA, 12, true);
  assert.ok(otherSize.ok, '12 pt converts');
  assert.notEqual(otherSize.metrics.widthPt, first.metrics.widthPt, 'size is part of the key');
});

await test('2.4 display mode and inline mode produce different layout', () => {
  const display = renderLatexToMathSvg('\\sum_{i=1}^{N} x_i', 11, true);
  const inline = renderLatexToMathSvg('\\sum_{i=1}^{N} x_i', 11, false);
  assert.ok(display.ok && inline.ok, 'both modes convert');
  assert.notEqual(display.svg, inline.svg, 'display and inline SVG differ');
  assert.ok(
    display.metrics.heightPt > inline.metrics.heightPt,
    'display mode stacks limits above/below (taller box)',
  );
});

await test('2.5 the configured TeX packages cover the spec formula families', () => {
  const good = [
    'E = mc^2',
    'x = \\frac{a+b}{2}',
    '\\begin{aligned} a &= b + c \\\\ d &= e \\end{aligned}',
    '\\begin{cases} 1 & x > 0 \\\\ 0 & x \\le 0 \\end{cases}',
    '\\begin{pmatrix} 1 & 2 \\\\ 3 & 4 \\end{pmatrix}',
    'x \\in \\mathbb{R}',
    '\\newcommand{\\half}{\\frac{1}{2}} \\half',
    '\\boldsymbol{\\alpha} = \\hat{\\beta} + \\overline{\\gamma}',
    SIGMA,
  ];
  for (const latex of good) {
    const r = renderLatexToMathSvg(latex, 11, true);
    assert.equal(r.ok, true, `parses: ${latex.slice(0, 40)}${latex.length > 40 ? '…' : ''}`);
  }
});

await test('2.6 TeX errors surface as honest, specific messages', () => {
  const cases = [
    ['\\unknownmacro', 'Undefined control sequence'],
    ['\\frac{a}', 'Missing argument'],
    ['{', 'Extra open brace'],
    ['\\begin{aligned} x', 'Missing \\end{aligned}'],
    ['\\left( x', 'Extra \\left'],
    ['', 'the formula is empty'],
    ['   ', 'the formula is empty'],
  ];
  for (const [latex, needle] of cases) {
    const r = renderLatexToMathSvg(latex, 11, true);
    assert.equal(r.ok, false, `rejected: ${JSON.stringify(latex)}`);
    assert.ok(
      r.message.includes(needle),
      `message for ${JSON.stringify(latex)} contains "${needle}" (got "${r.message}")`,
    );
  }
});

await test('2.7 the engine never throws — garbage input returns a result', () => {
  const junk = [
    '$${ $$',
    '\\begin{matrix}',
    '\\left(',
    'a}}}',
    '\\',
    '\\frac',
    '%%comment-only',
    '\uFFFDgarbage\uFFFD',
    '<script>alert(1)</script>',
    'x'.repeat(500),
  ];
  for (const latex of junk) {
    assert.doesNotThrow(
      () => renderLatexToMathSvg(latex, 11, true),
      `renderLatexToMathSvg must not throw on ${JSON.stringify(latex.slice(0, 24))}`,
    );
    assert.doesNotThrow(
      () => validateLatex(latex),
      `validateLatex must not throw on ${JSON.stringify(latex.slice(0, 24))}`,
    );
    const r = renderLatexToMathSvg(latex, 11, true);
    assert.ok(
      r.ok === true || typeof r.message === 'string',
      'every outcome is well-formed',
    );
  }
});

await test('2.8 validateLatex mirrors the engine (same messages, size-independent)', () => {
  assert.deepEqual(validateLatex('E = mc^2'), { ok: true }, 'valid formula → ok');
  const bad = validateLatex('\\frac{a}');
  assert.equal(bad.ok, false, 'unparseable formula → not ok');
  const direct = renderLatexToMathSvg('\\frac{a}', 11, true);
  assert.equal(direct.ok, false, 'direct render also fails');
  assert.equal(bad.message, direct.message, 'the parser message is the same at every size');
  assert.match(validateLatex('').message, /the formula is empty/, 'empty has its own message');
});

await test('2.9 estimateTextWidthPt: exact classes, linear, monotonic', () => {
  assert.equal(estimateTextWidthPt('', 11), 0, 'empty text is 0 wide');
  // 'a','b','c' are lowercase letters: 0.48 em each → 1.44 em × 11 pt.
  assert.ok(Math.abs(estimateTextWidthPt('abc', 11) - 1.44 * 11) < 1e-9, 'lowercase class width');
  assert.ok(
    Math.abs(estimateTextWidthPt('sample', 22) - 2 * estimateTextWidthPt('sample', 11)) < 1e-9,
    'exactly linear in the font size',
  );
  assert.ok(estimateTextWidthPt('W', 11) > estimateTextWidthPt('i', 11), 'wide > narrow class');
  assert.ok(
    estimateTextWidthPt(SIGMA_ROW_TEXT, 11) > estimateTextWidthPt('sample', 11),
    'monotonic in content',
  );
});

// ═══════════════════════════════════════════════════════════════════════════
// 3. SVG → react-pdf conversion
// ═══════════════════════════════════════════════════════════════════════════
group('3 · svg → react-pdf conversion');

await test('3.1 quadratic→cubic expansion is exact (Q, T reflection, H/V, implicit)', () => {
  // Textbook conversion: c1 = p0 + 2/3(q − p0), c2 = p2 + 2/3(q − p2).
  assert.equal(
    expandMathPathData('M0 0Q10 0 20 10'),
    'M0 0C6.667 0 13.333 3.333 20 10',
    'Q expands to an exact cubic',
  );
  assert.equal(
    expandMathPathData('M0 0Q10 0 20 10T40 10'),
    'M0 0C6.667 0 13.333 3.333 20 10C26.667 16.667 33.333 16.667 40 10',
    'T reflects the previous quadratic control point before expanding',
  );
  assert.equal(expandMathPathData('M0 0H10V10Z'), 'M0 0L10 0L10 10Z', 'H/V normalise to L');
  assert.equal(expandMathPathData('M0 0H10 20'), 'M0 0L10 0L20 0', 'repeated H groups');
  assert.equal(expandMathPathData('M0 0 10 10'), 'M0 0L10 10', 'implicit pairs after M are linetos');
  assert.equal(expandMathPathData('m10 10l5 0'), 'M10 10L15 10', 'relative input is absolutised');
  assert.equal(
    expandMathPathData('m0 0q10 0 20 10'),
    'M0 0C6.667 0 13.333 3.333 20 10',
    'relative quadratics absolutise then expand',
  );
  assert.equal(
    expandMathPathData('M0 0L5 5S10 0 15 5'),
    'M0 0L5 5C5 5 10 0 15 5',
    'smooth cubics become explicit cubics (reflecting when preceded by C)',
  );
});

await test('3.2 expansion BAILS safely: unusual data passes through untouched', () => {
  const bails = [
    'M0 0A5 5 0 0 1 10 10', // arcs are unsupported → original returned
    'M0', // incomplete argument list
    'M0 0 $ junk', // non-path junk between tokens
    'Z0', // a number with no active command
    '', // empty
    '   ', // whitespace
  ];
  for (const d of bails) {
    assert.equal(expandMathPathData(d), d, `bails unchanged: ${JSON.stringify(d)}`);
  }
});

await test('3.3 real engine output: every expanded path is pure M/L/C/Z, exact cubics', () => {
  const math = renderLatexToMathSvg(SIGMA, 11, true);
  assert.equal(math.ok, true, 'sigma converts');
  const ds = [...math.svg.matchAll(/ d="([^"]+)"/g)].map((m) => m[1]);
  assert.ok(ds.length >= 4, `the formula carries glyph paths (found ${ds.length})`);

  // Independent re-derivation of the FIRST quadratic→cubic in any path
  // (suite-side walker — not a call back into the implementation).
  const argc = { M: 2, L: 2, H: 1, V: 1, C: 6, S: 4, Q: 4, T: 2, Z: 0 };
  const f3 = (v) => String(Math.round(v * 1000) / 1000);
  const expectedFirstCubic = (d) => {
    const tokens = d.match(/[A-Za-z]|-?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?/g);
    if (tokens === null) return null;
    let i = 0;
    let cmd = null;
    let cx = 0;
    let cy = 0;
    let qx = null;
    let qy = null;
    while (i < tokens.length) {
      if (/^[A-Za-z]$/.test(tokens[i])) {
        cmd = tokens[i];
        i += 1;
      }
      if (cmd === null) return null;
      const upper = cmd.toUpperCase();
      const n = argc[upper];
      if (n === undefined || i + n > tokens.length) return null;
      const nums = tokens.slice(i, i + n).map(Number);
      i += n;
      const rel = cmd !== upper;
      if (upper === 'M') {
        cx = rel ? cx + nums[0] : nums[0];
        cy = rel ? cy + nums[1] : nums[1];
        cmd = rel ? 'l' : 'L';
        qx = null;
        qy = null;
      } else if (upper === 'L') {
        cx = rel ? cx + nums[0] : nums[0];
        cy = rel ? cy + nums[1] : nums[1];
        qx = null;
        qy = null;
      } else if (upper === 'H') {
        cx = rel ? cx + nums[0] : nums[0];
        qx = null;
        qy = null;
      } else if (upper === 'V') {
        cy = rel ? cy + nums[0] : nums[0];
        qx = null;
        qy = null;
      } else if (upper === 'Q' || upper === 'T') {
        let ax;
        let ay;
        let bx;
        let by;
        if (upper === 'Q') {
          ax = rel ? cx + nums[0] : nums[0];
          ay = rel ? cy + nums[1] : nums[1];
          bx = rel ? cx + nums[2] : nums[2];
          by = rel ? cy + nums[3] : nums[3];
        } else {
          ax = qx !== null ? 2 * cx - qx : cx;
          ay = qy !== null ? 2 * cy - qy : cy;
          bx = rel ? cx + nums[0] : nums[0];
          by = rel ? cy + nums[1] : nums[1];
        }
        const c1x = cx + (2 / 3) * (ax - cx);
        const c1y = cy + (2 / 3) * (ay - cy);
        const c2x = bx + (2 / 3) * (ax - bx);
        const c2y = by + (2 / 3) * (ay - by);
        return `C${f3(c1x)} ${f3(c1y)} ${f3(c2x)} ${f3(c2y)} ${f3(bx)} ${f3(by)}`;
      } else if (upper === 'C' || upper === 'S') {
        cx = rel ? cx + nums[n - 2] : nums[n - 2];
        cy = rel ? cy + nums[n - 1] : nums[n - 1];
        qx = null;
        qy = null;
      } else if (upper === 'Z') {
        qx = null;
        qy = null;
      } else {
        return null;
      }
    }
    return null;
  };

  let checkedExact = 0;
  let quadraticSeen = false;
  for (const d of ds) {
    const expanded = expandMathPathData(d);
    assert.ok(
      !/[QTHVqthv]/.test(expanded),
      `expanded path keeps only M/L/C/S/Z operators: ${expanded.slice(0, 60)}`,
    );
    const expected = expectedFirstCubic(d);
    if (expected !== null) {
      quadraticSeen = true;
      assert.ok(
        expanded.includes(expected),
        `independent quadratic→cubic value matches: ${expected} (in ${expanded.slice(0, 80)}…)`,
      );
      checkedExact += 1;
    }
  }
  assert.ok(quadraticSeen, 'the formula actually exercises the quadratic expansion');
  assert.ok(checkedExact >= 1, 'at least one exact cubic value verified');
});

await test('3.4 parseMathSvgDocument: real SVG parses; garbage returns null (never throws)', () => {
  const math = renderLatexToMathSvg('E = mc^2', 11, true);
  assert.equal(math.ok, true, 'E = mc^2 converts');
  const parsed = parseMathSvgDocument(math.svg);
  assert.ok(parsed !== null, 'real engine SVG parses');
  assert.match(parsed.viewBox, /^-?[\d.]+ -?[\d.]+ -?[\d.]+ -?[\d.]+$/, 'viewBox captured');
  assert.ok(parsed.children.length > 0, 'children captured');
  const nullCases = [
    '', // empty
    '<svg', // truncated
    '<svg viewBox="0 0 1 1"><g></svg>', // mismatched tags
    '<svg><g></g></svg>', // no viewBox
    'this is not svg at all', // garbage
  ];
  for (const source of nullCases) {
    assert.equal(parseMathSvgDocument(source), null, `null for ${JSON.stringify(source)}`);
  }
});

await test('3.5 the element walk emits only svg/g/path with the resolved colour', () => {
  const math = renderLatexToMathSvg(SIGMA, 11, true);
  assert.equal(math.ok, true, 'sigma converts');
  const parsed = parseMathSvgDocument(math.svg);
  assert.ok(parsed !== null, 'parses');
  // The react-pdf primitives are host tags (SVG/G/PATH) — react-dom/server
  // prints them uppercase; the STRUCTURE is what is asserted here.
  const markup = markupOf(mathSvgToReact(parsed, { widthPt: 100, heightPt: 20, color: '#123456' }));
  assert.equal((markup.match(/<SVG[\s>]/g) || []).length, 1, 'exactly one Svg root');
  assert.ok((markup.match(/<PATH/g) || []).length >= 4, 'glyph paths present');
  assert.equal(markup.includes('<USE'), false, 'Use nodes are resolved, not emitted');
  assert.equal(markup.includes('<DEFS'), false, 'defs are consumed');
  assert.equal(markup.includes('data-'), false, 'data-* attributes dropped');
  assert.equal(markup.includes('currentColor'), false, 'currentColor replaced');
  assert.equal(markup.includes('style='), false, 'style attributes dropped');
  assert.ok(markup.includes('fill="#123456"'), 'the resolved body colour paints the glyphs');
  assert.ok(markup.includes('viewBox='), 'viewBox preserved so the scale is exact');
  // Every emitted path data string is already in the exact cubic subset.
  const ds = [...markup.matchAll(/ d="([^"]*)"/g)].map((m) => m[1]);
  assert.ok(ds.length >= 4, 'the markup carries the glyph path data');
  for (const d of ds) {
    assert.ok(
      !/[QTHVqthv]/.test(d),
      `markup path data is pure M/L/C/S/Z: ${d.slice(0, 60)}`,
    );
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// 4. Formula content service
// ═══════════════════════════════════════════════════════════════════════════
group('4 · formula content service');

await test('4.1 registry insertion yields the schema-valid formula default', () => {
  const { doc, block } = insertBlock(newDoc(), 'formula');
  assert.equal(block.data.type, 'formula', 'discriminant preserved');
  assert.equal(doc.blocks.length, 1, 'appended');
  assert.equal(block.data.latex, 'E = mc^2', 'default LaTeX');
  assert.equal(block.data.displayMode, true, 'display mode default');
  assert.equal(typeof summarizeBlockData(block.data), 'string', 'summary defined');
});

await test('4.2 LaTeX commits are trimmed, validated and stamped', () => {
  let doc = newDoc();
  doc = insertBlock(doc, 'formula').doc;
  const f = only(doc, 'formula');
  assert.equal(doc.metadata.modifiedAt, T0, 'setup document untouched');

  const changed = applied(
    updateFormulaContent(doc, f.id, { action: 'update-formula', latex: '  x = \\frac{a}{b}  ' }, { now: STAMP }),
    'latex set',
  );
  const data = changed.blocks.find((b) => b.id === f.id).data;
  assert.equal(data.latex, 'x = \\frac{a}{b}', 'committed value is trimmed');
  assert.equal(changed.metadata.modifiedAt, STAMP, 'real edit stamps modifiedAt');
  assert.equal(changed.metadata.createdAt, T0, 'createdAt never moves');

  // Re-committing the identical formula is a same-reference no-op.
  noOp(
    updateFormulaContent(changed, f.id, { action: 'update-formula', latex: 'x = \\frac{a}{b}' }, { now: STAMP }),
    changed,
    'same LaTeX',
  );
});

await test('4.3 invalid LaTeX / alignment / display mode are rejected before commit', () => {
  let doc = newDoc();
  doc = insertBlock(doc, 'formula').doc;
  const f = only(doc, 'formula');
  const snapshot = JSON.stringify(doc);
  const patch = (p) => updateFormulaContent(doc, f.id, { action: 'update-formula', ...p }, { now: STAMP });

  rejected(patch({ latex: '   ' }), 'invalid-latex', 'empty LaTeX');
  rejected(patch({ latex: 42 }), 'invalid-latex', 'non-string LaTeX');
  rejected(
    patch({ latex: 'a'.repeat(MAX_FORMULA_LATEX_LENGTH + 1) }),
    'invalid-latex',
    'LaTeX over the limit',
  );
  const unparseable = patch({ latex: '\\frac{a}' });
  rejected(unparseable, 'invalid-latex', 'unparseable LaTeX');
  assert.ok(unparseable.message.includes('Missing argument'), 'the parser message is surfaced');
  rejected(patch({ hAlign: 'justify' }), 'invalid-halign', 'alignment out of the union');
  rejected(patch({ displayMode: 'yes' }), 'invalid-display-mode', 'display mode must be boolean');
  assert.equal(JSON.stringify(doc), snapshot, 'the source document is untouched by rejections');
});

await test('4.4 alignment and display mode commit; number and Where label set AND clear', () => {
  let doc = newDoc();
  doc = insertBlock(doc, 'formula').doc;
  const f = only(doc, 'formula');
  const patch = (d, p) =>
    updateFormulaContent(d, f.id, { action: 'update-formula', ...p }, { now: STAMP });

  doc = applied(patch(doc, { hAlign: 'right', displayMode: false }), 'alignment + display mode');
  let data = only(doc, 'formula').data;
  assert.equal(data.hAlign, 'right', 'alignment committed');
  assert.equal(data.displayMode, false, 'display mode committed');

  doc = applied(patch(doc, { formulaNumber: '  (3.2)  ' }), 'number set');
  assert.equal(only(doc, 'formula').data.formulaNumber, '(3.2)', 'number trimmed');

  doc = applied(patch(doc, { whereLabelOverride: 'Where (definitions):' }), 'label set');
  assert.equal(
    only(doc, 'formula').data.whereLabelOverride,
    'Where (definitions):',
    'label committed',
  );

  // Clear semantics: '' and null both REMOVE the optional field.
  doc = applied(patch(doc, { formulaNumber: '' }), 'number cleared with empty string');
  assert.equal('formulaNumber' in only(doc, 'formula').data, false, 'number field deleted');
  noOp(patch(doc, { formulaNumber: '' }), doc, 'clearing an absent number is a no-op');
  doc = applied(patch(doc, { whereLabelOverride: null }), 'label cleared with null');
  assert.equal('whereLabelOverride' in only(doc, 'formula').data, false, 'label field deleted');
  noOp(patch(doc, { whereLabelOverride: null }), doc, 'clearing an absent label is a no-op');

  rejected(patch(doc, { formulaNumber: 'x'.repeat(65) }), 'invalid-formula-number', 'number over limit');
  rejected(patch(doc, { formulaNumber: 7 }), 'invalid-formula-number', 'number must be text');
  rejected(patch(doc, { whereLabelOverride: 'x'.repeat(65) }), 'invalid-where-label', 'label over limit');
});

await test('4.5 missing block / wrong block type are rejected without mutation', () => {
  const doc = newDoc();
  const missing = updateFormulaContent(doc, newUUID(), { action: 'update-formula', latex: 'x=y' }, { now: STAMP });
  rejected(missing, 'missing-block', 'missing block id');
  assert.equal(missing.doc, undefined, 'failures never carry a document');

  const withPara = insertBlock(doc, 'paragraph').doc;
  const para = only(withPara, 'paragraph');
  const wrongType = updateFormulaContent(withPara, para.id, { action: 'update-formula', latex: 'x=y' }, { now: STAMP });
  rejected(wrongType, 'wrong-block-type', 'formula action on a paragraph');
  const unknownAction = applyFormulaAction(withPara, para.id, { action: 'nope' }, { now: STAMP });
  rejected(unknownAction, 'invalid-action', 'unknown dispatcher action');
});

await test('4.6 variable definitions: add (empty row, stable id), update, remove', () => {
  let doc = newDoc();
  doc = insertBlock(doc, 'formula').doc;
  const f = only(doc, 'formula');

  // A distinctive generator proves the options.genId path end-to-end.
  const customGenId = () => '06300000-0000-4000-8000-999999999999';
  const added = addVariableDefinition(doc, f.id, { now: STAMP, genId: customGenId });
  assert.equal(added.ok, true, 'add succeeds');
  assert.equal(added.changed, true, 'add is a change');
  const entryId = added.entryId;
  assert.ok(entryId !== undefined, 'the new entry id is returned for focusing');
  assert.equal(entryId, '06300000-0000-4000-8000-999999999999', 'a provided genId is honoured');
  doc = added.doc;
  const fresh = only(doc, 'formula').data.variableDefinitions[0];
  assert.deepEqual(
    { symbol: fresh.symbol, definition: fresh.definition },
    { symbol: '', definition: '' },
    'the new row is empty — nothing is fabricated',
  );
  assert.equal('unit' in fresh, false, 'no unit by default');

  // Update every field (through the dispatcher).
  doc = applied(
    act(doc, f.id, {
      action: 'update-variable-definition',
      entryId,
      patch: { symbol: '  \\sigma  ', definition: SIGMA_DEFINITION, unit: ' mg/kg ' },
    }),
    'variable filled',
  );
  const filled = only(doc, 'formula').data.variableDefinitions[0];
  assert.equal(filled.symbol, '\\sigma', 'symbol trimmed');
  assert.equal(filled.definition, SIGMA_DEFINITION, 'definition set');
  assert.equal(filled.unit, 'mg/kg', 'unit trimmed');
  assert.equal(filled.id, entryId, 'the stable id survives the update');

  // No-op patch: identical values return the same reference.
  noOp(
    act(doc, f.id, {
      action: 'update-variable-definition',
      entryId,
      patch: { symbol: '\\sigma', definition: SIGMA_DEFINITION },
    }),
    doc,
    'identical variable patch',
  );

  // Clear the unit with null (explicit branch).
  doc = applied(
    act(doc, f.id, { action: 'update-variable-definition', entryId, patch: { unit: null } }),
    'unit cleared',
  );
  assert.equal('unit' in only(doc, 'formula').data.variableDefinitions[0], false, 'unit deleted');

  // Validation.
  rejected(
    act(doc, f.id, { action: 'update-variable-definition', entryId, patch: { symbol: '   ' } }),
    'invalid-symbol',
    'symbol required',
  );
  rejected(
    act(doc, f.id, { action: 'update-variable-definition', entryId, patch: { symbol: 'x'.repeat(201) } }),
    'invalid-symbol',
    'symbol over limit',
  );
  rejected(
    act(doc, f.id, { action: 'update-variable-definition', entryId, patch: { definition: 'x'.repeat(1001) } }),
    'invalid-definition',
    'definition over limit',
  );
  rejected(
    act(doc, f.id, { action: 'update-variable-definition', entryId, patch: { unit: 'x'.repeat(121) } }),
    'invalid-unit',
    'unit over limit',
  );
  rejected(
    act(doc, f.id, { action: 'update-variable-definition', entryId: newUUID(), patch: { symbol: 'k' } }),
    'missing-entry',
    'unknown entry id',
  );

  // Remove.
  const removed = applied(
    act(doc, f.id, { action: 'remove-variable-definition', entryId }),
    'variable removed',
  );
  assert.equal(only(removed, 'formula').data.variableDefinitions.length, 0, 'list empty again');
  rejected(
    act(removed, f.id, { action: 'remove-variable-definition', entryId }),
    'missing-entry',
    'removing twice is rejected',
  );
});

await test('4.7 every service operation leaves the source document untouched', () => {
  let doc = newDoc();
  doc = insertBlock(doc, 'formula').doc;
  const f = only(doc, 'formula');
  doc = applied(act(doc, f.id, { action: 'add-variable-definition' }), 'seed a variable');
  const entryId = only(doc, 'formula').data.variableDefinitions[0].id;
  const snapshot = JSON.stringify(doc);

  const results = [
    updateFormulaContent(doc, f.id, { action: 'update-formula', latex: 'x = 1' }, { now: STAMP }),
    addVariableDefinition(doc, f.id, { now: STAMP, genId }),
    updateVariableDefinition(doc, f.id, entryId, { symbol: 'k' }, { now: STAMP }),
    removeVariableDefinition(doc, f.id, entryId, { now: STAMP }),
  ];
  for (const r of results) {
    assert.equal(r.ok, true, 'the operation itself succeeds');
    assert.notEqual(r.doc, doc, 'a change returns a NEW document');
  }
  assert.equal(JSON.stringify(doc), snapshot, 'the source document is bit-identical afterwards');
});

// ═══════════════════════════════════════════════════════════════════════════
// 5. Layout planner (pure geometry)
// ═══════════════════════════════════════════════════════════════════════════
group('5 · layout planner');

const baseInput = {
  contentWidthPt: 453.54,
  naturalWidthPt: 300,
  naturalHeightPt: 40,
  baselineOffsetPt: 30,
  fontSizePt: 11,
  hasNumber: false,
  numberWidthPt: 0,
  whereRows: [],
  whereLabelWidthPt: 0,
};

await test('5.1 a formula that fits keeps natural size (scale is never > 1)', () => {
  const plan = planFormulaLayout(baseInput);
  assert.equal(plan.scale, 1, 'no scaling when it fits');
  assert.equal(plan.scaledToFit, false, 'no overflow note');
  assert.equal(plan.formulaWidthPt, 300, 'natural width kept');
  assert.equal(plan.formulaHeightPt, 40, 'natural height kept');
  assert.equal(plan.numberCellWidthPt, 0, 'no number cell without a number');
  assert.equal(plan.whereMode, 'none', 'no definitions → no Where list');
  assert.equal(plan.whereWidthPt, 0, 'no Where column');
  assert.equal(plan.whereGapPt, 0, 'no gap');
  // A wider-than-page formula scales DOWN to the page, never up.
  const narrow = planFormulaLayout({ ...baseInput, naturalWidthPt: 100 });
  assert.equal(narrow.scale, 1, 'small formulas are NOT enlarged');
});

await test('5.2 an over-wide formula scales down to fit and says so', () => {
  const plan = planFormulaLayout({ ...baseInput, naturalWidthPt: 900, naturalHeightPt: 120 });
  assert.ok(Math.abs(plan.scale - 453.54 / 900) < 1e-9, 'scale = fit / natural');
  assert.equal(plan.scaledToFit, true, 'the honest note is required');
  assert.ok(Math.abs(plan.formulaWidthPt - 453.54) < 1e-9, 'scaled width = the content width');
  assert.ok(Math.abs(plan.formulaHeightPt - 120 * (453.54 / 900)) < 1e-9, 'height scales uniformly');
  assert.ok(Math.abs(plan.baselineOffsetPt - 30 * (453.54 / 900)) < 1e-9, 'baseline scales too');
});

await test('5.3 the equation number reserves its own right-aligned cell', () => {
  const plan = planFormulaLayout({
    ...baseInput,
    naturalWidthPt: 900,
    hasNumber: true,
    numberWidthPt: 20,
  });
  assert.equal(plan.numberCellWidthPt, 30, 'cell = number width + gap');
  assert.ok(Math.abs(plan.scale - (453.54 - 30) / 900) < 1e-9, 'scaling fits LEFT of the cell');
  assert.ok(
    Math.abs(plan.formulaCellWidthPt - (453.54 - 30)) < 1e-9,
    'the formula cell spans the remaining area',
  );
  assert.equal(
    plan.formulaCellWidthPt + plan.numberCellWidthPt,
    plan.formulaAreaWidthPt,
    'cell + number cell = area',
  );
  const noNumber = planFormulaLayout({ ...baseInput, hasNumber: false, numberWidthPt: 20 });
  assert.equal(noNumber.numberCellWidthPt, 0, 'an absent number reserves nothing');
});

await test('5.4 "Where:" sits BESIDE the formula while the row fits', () => {
  const plan = planFormulaLayout({
    ...baseInput,
    contentWidthPt: 300,
    naturalWidthPt: 100,
    whereRows: [{ symbolWidthPt: 6, textWidthPt: 60 }],
    whereLabelWidthPt: 40,
  });
  // widest row = 6 + 8 + 60 = 74 > label 40 → column = 74.
  assert.equal(plan.whereMode, 'beside', 'everything fits → beside');
  assert.equal(plan.whereWidthPt, 74, 'column = widest row (symbol + gap + text)');
  assert.equal(plan.whereGapPt, FORMULA_WHERE_GAP_PT, 'the gap is applied');
  assert.equal(plan.formulaAreaWidthPt, 300 - 74 - 14, 'the formula area shrinks by column + gap');
  const labelWins = planFormulaLayout({
    ...baseInput,
    contentWidthPt: 300,
    naturalWidthPt: 100,
    whereRows: [{ symbolWidthPt: 1, textWidthPt: 1 }],
    whereLabelWidthPt: 90,
  });
  assert.equal(labelWins.whereWidthPt, 90, 'the label itself can define the column');
});

await test('5.5 the EXACT beside/below boundary (fit moves below one point later)', () => {
  const input = (textWidthPt) => ({
    ...baseInput,
    contentWidthPt: 300,
    naturalWidthPt: 100,
    whereRows: [{ symbolWidthPt: 8, textWidthPt }],
    whereLabelWidthPt: 40,
  });
  // widest row 8 + 8 + 170 = 186 → 100 + 0 + 14 + 186 = 300 = content → BESIDE.
  const atBoundary = planFormulaLayout(input(170));
  assert.equal(atBoundary.whereMode, 'beside', 'exactly full width still fits');
  assert.equal(atBoundary.whereWidthPt, 186, 'column measured');
  assert.equal(atBoundary.formulaAreaWidthPt, 300 - 186 - 14, 'area leaves room for the column');
  // One tenth of a point wider → 300.1 > 300 → BELOW.
  const overBoundary = planFormulaLayout(input(170.1));
  assert.equal(overBoundary.whereMode, 'below', 'a tenth of a point over moves it below');
  assert.equal(overBoundary.whereWidthPt, 300, 'below mode: the column is the full width');
  assert.equal(overBoundary.whereGapPt, 0, 'below mode: no side gap');
  assert.equal(overBoundary.formulaAreaWidthPt, 300, 'below mode: the full width is the formula area');
});

await test('5.6 the plan is pure and deterministic', () => {
  const input = {
    ...baseInput,
    hasNumber: true,
    numberWidthPt: 15,
    whereRows: [{ symbolWidthPt: 5, textWidthPt: 50 }],
    whereLabelWidthPt: 35,
  };
  const a = planFormulaLayout(input);
  const b = planFormulaLayout(input);
  assert.deepEqual(a, b, 'identical input → identical plan');
});

// ═══════════════════════════════════════════════════════════════════════════
// 6. Editor panel component (real react-dom/server markup)
// ═══════════════════════════════════════════════════════════════════════════
group('6 · editor panel markup');

const renderEditor = (data) =>
  markupOf(
    React.createElement(FormulaContentEditor, {
      blockId: 'fx-blk-1',
      data,
      onAction: () => ({ ok: true, changed: false, doc: newDoc('stub'), blockId: 'fx-blk-1' }),
      onError: () => {},
    }),
  );

await test('6.1 the editor roots in the vertical structural stack', () => {
  const markup = renderEditor({
    type: 'formula',
    latex: 'E = mc^2',
    hAlign: 'center',
    displayMode: true,
    variableDefinitions: [],
  });
  assert.equal(rootClassOf(markup), 'structural-editor', 'roots in the corrected vertical stack');
  assert.ok(markup.includes('LaTeX formula'), 'the LaTeX field is labelled');
  assert.ok(markup.includes('Equation number'), 'the number field is labelled');
  assert.ok(markup.includes('Where:'), 'the Where-label field is present');
});

await test('6.2 the LIVE parse hint reflects valid, invalid and empty LaTeX', () => {
  const valid = renderEditor({
    type: 'formula',
    latex: 'E = mc^2',
    hAlign: 'center',
    displayMode: true,
    variableDefinitions: [],
  });
  assert.ok(valid.includes('Reads as renderable math'), 'valid hint shown');
  assert.equal(
    /class="content-derived-hint is-invalid"/.test(valid),
    false,
    'no invalid styling on a valid formula',
  );

  const invalid = renderEditor({
    type: 'formula',
    latex: '\\frac{a}',
    hAlign: 'center',
    displayMode: true,
    variableDefinitions: [],
  });
  assert.ok(
    invalid.includes('content-derived-hint is-invalid'),
    'the invalid class marks the hint while typing',
  );
  assert.ok(invalid.includes('Cannot be rendered: Missing argument'), 'the parser message shown');

  const empty = renderEditor({
    type: 'formula',
    latex: '   ',
    hAlign: 'center',
    displayMode: true,
    variableDefinitions: [],
  });
  assert.ok(empty.includes('the formula is empty'), 'empty draft explains itself');
  assert.ok(empty.includes('content-derived-hint is-invalid'), 'empty is also marked invalid');
});

await test('6.3 controls reflect the committed state (checkbox, select, texts)', () => {
  const checked = renderEditor({
    type: 'formula',
    latex: 'E = mc^2',
    hAlign: 'right',
    displayMode: true,
    formulaNumber: '(3.2)',
    whereLabelOverride: 'Where (definitions):',
    variableDefinitions: [],
  });
  assert.ok(/<input[^>]*checked=""/.test(checked), 'display mode checkbox checked');
  assert.ok(
    /<option[^>]*value="right"[^>]*selected/.test(checked),
    'alignment select shows the committed value',
  );
  for (const align of ['left', 'center', 'right']) {
    assert.ok(checked.includes(`value="${align}"`), `alignment option offered: ${align}`);
  }
  assert.ok(checked.includes('value="(3.2)"'), 'the equation number round-trips into the field');
  assert.ok(
    checked.includes('value="Where (definitions):"'),
    'the custom Where label round-trips into the field',
  );

  const unchecked = renderEditor({
    type: 'formula',
    latex: 'E = mc^2',
    hAlign: 'left',
    displayMode: false,
    variableDefinitions: [],
  });
  assert.equal(/<input[^>]*checked=""/.test(unchecked), false, 'unticked checkbox renders bare');
});

await test('6.4 variable cards, limits and the empty state', () => {
  const emptyState = renderEditor({
    type: 'formula',
    latex: 'E = mc^2',
    hAlign: 'center',
    displayMode: true,
    variableDefinitions: [],
  });
  assert.ok(
    emptyState.includes('No variable definitions yet'),
    'the empty state explains the Where rule',
  );
  assert.equal(emptyState.includes('Remove definition'), false, 'no remove buttons without rows');
  assert.ok(
    emptyState.includes('beside the formula when the page has room'),
    'the beside/below rule is stated in the panel',
  );

  const card = renderEditor({
    type: 'formula',
    latex: 'E = mc^2',
    hAlign: 'center',
    displayMode: true,
    variableDefinitions: [
      { id: 'var-1', symbol: '\\sigma', definition: SIGMA_DEFINITION, unit: 'mg/kg' },
      { id: 'var-2', symbol: 'N', definition: 'number of measurements' },
    ],
  });
  assert.equal(
    (card.match(/Remove definition/g) || []).length,
    2,
    'one remove button per variable card',
  );
  assert.ok(card.includes('Add variable definition'), 'the add button is present');
  assert.ok(card.includes('value="\\sigma"'), 'symbol preserved');
  assert.ok(card.includes('value="N"'), 'second symbol preserved');
  assert.ok(card.includes('value="mg/kg"'), 'unit preserved');
  assert.ok(card.includes('No variable definitions yet') === false, 'cards replace the empty state');
  // Every field carries its schema length limit.
  assert.match(card, /maxlength="4000"/i, 'LaTeX field limited');
  assert.match(card, /maxlength="64"/i, 'number/label fields limited');
  assert.match(card, /maxlength="200"/i, 'symbol field limited');
  assert.match(card, /maxlength="1000"/i, 'definition field limited');
  assert.match(card, /maxlength="120"/i, 'unit field limited');
});

await test('6.5 the invalid-hint CSS rule exists in the editor stylesheet', () => {
  const css = fs.readFileSync(
    path.join(root, 'src', 'components', 'editor-panel', 'EditorPanel.css'),
    'utf8',
  );
  const rule = /\.content-derived-hint\.is-invalid\s*\{[^}]*\}/.exec(css);
  assert.ok(rule !== null, '.content-derived-hint.is-invalid is defined');
  assert.ok(rule[0].includes('#dc2626'), 'the error colour is applied');
  const base = css.indexOf('.content-derived-hint');
  const invalid = css.indexOf('.content-derived-hint.is-invalid');
  assert.ok(base > 0 && invalid > base, 'the invalid rule comes after the base rule');
});

// ═══════════════════════════════════════════════════════════════════════════
// 7. Persistence (native project file round-trip)
// ═══════════════════════════════════════════════════════════════════════════
group('7 · persistence');

await test('7.1 every formula field survives the native-file round-trip', () => {
  let doc = newDoc('persist');
  doc = insertBlock(doc, 'formula').doc;
  const f = only(doc, 'formula');
  doc = applied(
    act(doc, f.id, {
      action: 'update-formula',
      latex: SIGMA,
      hAlign: 'left',
      displayMode: false,
      formulaNumber: '(7)',
      whereLabelOverride: 'Where (definitions):',
    }),
    'all scalar fields committed',
  );
  doc = applied(act(doc, f.id, { action: 'add-variable-definition' }), 'variable 1');
  doc = applied(act(doc, f.id, { action: 'add-variable-definition' }), 'variable 2');
  const entries = only(doc, 'formula').data.variableDefinitions;
  doc = applied(
    act(doc, f.id, {
      action: 'update-variable-definition',
      entryId: entries[0].id,
      patch: { symbol: '\\sigma', definition: SIGMA_DEFINITION, unit: 'mg/kg' },
    }),
    'variable 1 filled',
  );
  doc = applied(
    act(doc, f.id, {
      action: 'update-variable-definition',
      entryId: entries[1].id,
      patch: { symbol: 'N', definition: 'number of measurements' },
    }),
    'variable 2 filled',
  );

  const json = serializeDocument(doc);
  const round = deserializeDocument(json);
  const original = only(doc, 'formula').data;
  const restored = round.blocks.find((b) => b.data.type === 'formula').data;
  assert.deepEqual(restored, original, 'latex, alignment, display, number, label, variables all round-trip');
  const restoredVars = restored.variableDefinitions;
  assert.equal(restoredVars[0].id, entries[0].id, 'variable entry ids are stable');
  assert.equal(restoredVars[1].id, entries[1].id, 'both entry ids stable');
  assert.equal(round.schemaVersion, 1, 'the document schema version is NOT bumped');
  assert.doesNotThrow(() => validateDocument(JSON.parse(json)), 'the round-trip stays schema-valid');
});

// ═══════════════════════════════════════════════════════════════════════════
// 8. PDF output (real PocDocument render)
// ═══════════════════════════════════════════════════════════════════════════
group('8 · pdf output');

await test('8.1 BESIDE placement: planner geometry matches real glyph positions', async () => {
  const doc = sigmaDoc('fx-beside');
  const { layout, plan } = planOf(doc);
  assert.equal(plan.whereMode, 'beside', 'the default A4 page has room beside the formula');
  assert.equal(plan.scaledToFit, false, 'no scaling at natural width');
  assert.ok(
    plan.formulaAreaWidthPt + plan.whereGapPt + plan.whereWidthPt <= layout.contentWidth + 1e-9,
    'beside invariant: area + gap + column fit the content width',
  );

  const bytes = await render(doc);
  const texts = (await pagesOf(doc)).map((p) => pageText(p));
  assert.ok(texts.length >= 1, 'the formula renders onto a body page');
  assert.equal(fallbackMarker(texts), false, 'no PoC fallback marker');
  assert.ok(has(texts[0], '(3)'), 'the equation number is printed');
  assert.ok(has(texts[0], 'Where:'), 'the default Where label is printed');
  assert.ok(has(texts[0], SIGMA_ROW_TEXT), 'the variable definition text is printed');
  assert.equal(has(texts[0], 'sigma'), false, 'the symbol is vector, not text (no raw fallback)');
  assert.equal(
    has(texts[0], '[Formula scaled to fit the page width]'),
    false,
    'no overflow note at natural width',
  );

  // Vector proof: hundreds of curve operators, far beyond any control page.
  const curves = countCurves(bytes);
  assert.ok(curves >= 100, `formula glyphs are curves (found ${curves})`);
  const control = await render(newDoc('fx-control'));
  const controlCurves = countCurves(control);
  assert.ok(
    curves - controlCurves >= 80,
    `the formula adds ≥ 80 curves over the empty control (${curves} vs ${controlCurves})`,
  );

  // Determinism: two renders of the same document are byte-identical.
  const again = await render(doc);
  assert.ok(bytes.equals(again), 'byte-identical double render');

  // Real glyph positions vs the planner's intent.
  await withPdf(bytes, async (pdf) => {
    assert.equal(pdf.numPages, 1, 'one body page');
    const items = await pageItems(pdf, 1);
    const stream = compactStream(items);
    const where = locate(stream, 'Where:');
    assert.ok(where !== null, 'the Where label located on the page');
    const expectedWhereX =
      layout.marginLeft + plan.formulaAreaWidthPt + plan.whereGapPt;
    assert.ok(
      Math.abs(where.x - expectedWhereX) < 6,
      `Where column starts at the planned x (${where.x.toFixed(1)} vs ${expectedWhereX.toFixed(1)})`,
    );

    const number = locate(stream, '(3)');
    assert.ok(number !== null, 'the equation number located');
    const numberRight = number.x + number.item.width;
    assert.ok(number.item.width > 0, 'pdfjs reports the number width');
    assert.ok(numberRight < where.x - 2, 'the number cell ends BEFORE the Where column');
    const expectedNumberRight = layout.marginLeft + plan.formulaAreaWidthPt;
    assert.ok(
      Math.abs(numberRight - expectedNumberRight) < 8,
      `number right-aligned at the planned area edge (${numberRight.toFixed(1)} vs ${expectedNumberRight.toFixed(1)})`,
    );

    // The printable column is respected.
    for (const it of items) {
      assert.ok(
        it.x > layout.marginLeft - 6 && it.x + it.width < layout.pageWidthPt - layout.marginRight + 6,
        `body glyph inside the printable column (x=${it.x.toFixed(1)})`,
      );
    }
  });
});

await test('8.2 BELOW placement: narrow margins move definitions under the formula', async () => {
  const doc = sigmaDoc('fx-below', (d) => ({
    ...d,
    pageSetup: {
      ...d.pageSetup,
      margins: { ...d.pageSetup.margins, preset: 'custom', leftMm: 90, rightMm: 90 },
    },
  }));
  const { layout, plan } = planOf(doc);
  assert.ok(layout.contentWidth < 100, 'the custom margins leave a narrow column');
  assert.equal(plan.whereMode, 'below', 'the definitions move below the formula');
  assert.equal(plan.scaledToFit, true, 'the formula scales to the narrow page');
  assert.ok(plan.scale > 0 && plan.scale < 1, 'a real shrink factor');

  const bytes = await render(doc);
  const texts = (await pagesOf(doc)).map((p) => pageText(p));
  assert.ok(has(texts[0], '[Formula scaled to fit the page width]'), 'the honest overflow note prints');
  assert.ok(has(texts[0], '(3)'), 'the equation number is printed');
  assert.ok(has(texts[0], 'Where:'), 'the Where label is printed');
  // The narrow column makes pdfkit WRAP (and hyphenate) the definition:
  // "sample stan-" / "dard deviation" / "(mg/kg)" — asserted in full.
  assert.ok(
    has(texts[0], 'sample stan-') && has(texts[0], 'dard deviation') && has(texts[0], '(mg/kg)'),
    'the definition text is printed (hyphen-wrapped in the narrow column)',
  );
  assert.equal(fallbackMarker(texts), false, 'no PoC fallback marker');

  await withPdf(bytes, async (pdf) => {
    const items = await pageItems(pdf, 1);
    const stream = compactStream(items);
    const where = locate(stream, 'Where:');
    const number = locate(stream, '(3)');
    const note = locate(stream, 'scaledtofit');
    assert.ok(where !== null && number !== null && note !== null, 'all three cells located');
    assert.ok(
      Math.abs(where.x - layout.marginLeft) < 6,
      `below mode: the Where list starts at the left margin (${where.x.toFixed(1)} vs ${layout.marginLeft.toFixed(1)})`,
    );
    const numberRight = number.x + number.item.width;
    const expectedNumberRight = layout.marginLeft + layout.contentWidth;
    assert.ok(
      Math.abs(numberRight - expectedNumberRight) < 8,
      `below mode: the number reaches the right margin (${numberRight.toFixed(1)} vs ${expectedNumberRight.toFixed(1)})`,
    );
    assert.ok(
      note.y < where.y,
      `the overflow note prints BELOW the Where list (note y=${note.y.toFixed(1)} < where y=${where.y.toFixed(1)})`,
    );
  });
});

await test('8.3 legacy data with unparseable LaTeX renders an honest marker', async () => {
  let doc = newDoc('fx-legacy');
  doc = insertBlock(doc, 'formula').doc;
  const f = only(doc, 'formula');
  // Direct mutation — simulates a legacy/foreign file holding LaTeX the
  // engine cannot parse (bypassing the service's commit validation).
  doc = {
    ...doc,
    blocks: doc.blocks.map((b) =>
      b.id === f.id ? { ...b, data: { ...b.data, latex: '\\frac{a}' } } : b,
    ),
  };
  const texts = await pageTextsOf(doc);
  assert.ok(has(texts[0], '[Formula could not be rendered'), 'the honest marker prints');
  assert.ok(has(texts[0], 'Missing argument'), 'the engine message explains why');
  assert.ok(has(texts[0], 'edit the LaTeX source'), 'the marker says how to fix it');
  assert.equal(fallbackMarker(texts), false, 'this is a formula marker, not a mapping fallback');
});

await test('8.4 the "Where:" label is printed in bold', async () => {
  const formulaBytes = await render(sigmaDoc('fx-bold'));
  assert.ok(
    formulaBytes.toString('latin1').includes('Bold'),
    'the formula page uses the bold font (the Where label)',
  );
  const controlBytes = await render(newDoc('fx-bold-control'));
  assert.equal(
    controlBytes.toString('latin1').includes('Bold'),
    false,
    'the control page (no formula) has no bold text — the label is the only bold',
  );
});

await test('8.5 alignment moves the real formula box: left, centre, right (P06-M3-R1)', async () => {
  // Regression for the owner-confirmed defect: everything rendered
  // left-aligned because the formula cell applied `justifyContent`
  // (main/vertical axis of a content-height column) instead of
  // `alignItems`.  These checks measure the ACTUAL vector-box origin
  // through the pdfjs operator-list CTM and fail when the three
  // placements coincide (the defective behaviour).
  const measured = {};
  for (const align of ['left', 'center', 'right']) {
    const doc = alignDoc(align);
    const { xs, plan } = expectedAlignXs(doc);
    assert.equal(plan.scaledToFit, false, `${align}: the short formula never scales`);
    assert.equal(plan.whereMode, 'none', `${align}: no Where list in this fixture`);
    const bytes = await render(doc);
    await withPdf(bytes, async (pdf) => {
      const origins = await pathOrigins(pdf, 1);
      const formulaPaths = origins.filter((o) => o.count >= 2);
      assert.ok(
        formulaPaths.length > 0 && origins[0].count >= 3,
        `${align}: the formula glyph cluster is painted`,
      );
      const minX = Math.min(...formulaPaths.map((o) => o.x));
      assert.ok(
        Math.abs(minX - xs[align]) < 1.5,
        `${align}: box origin matches the planner (${minX.toFixed(1)} vs ${xs[align].toFixed(1)})`,
      );
      measured[align] = minX;
    });
  }
  assert.ok(
    measured.left < measured.center && measured.center < measured.right,
    `the three placements are strictly distinct and ordered ` +
      `(${measured.left.toFixed(1)} < ${measured.center.toFixed(1)} < ${measured.right.toFixed(1)})`,
  );
});

await test('8.6 alignment coexists with the right-pinned equation number (P06-M3-R1)', async () => {
  const numberRights = [];
  for (const align of ['left', 'center', 'right']) {
    const doc = alignDoc(align, { number: true });
    const { xs, plan, layout } = expectedAlignXs(doc, { number: true });
    assert.ok(plan.numberCellWidthPt > 0, `${align}: the number reserves its cell`);
    const bytes = await render(doc);
    await withPdf(bytes, async (pdf) => {
      // The formula aligns inside the REDUCED band (area minus number cell).
      const origins = await pathOrigins(pdf, 1);
      const minX = Math.min(...origins.filter((o) => o.count >= 2).map((o) => o.x));
      assert.ok(
        Math.abs(minX - xs[align]) < 1.5,
        `${align}: formula inside the reduced band (${minX.toFixed(1)} vs ${xs[align].toFixed(1)})`,
      );
      // The number keeps its own right-aligned cell at the content edge.
      const items = await pageItems(pdf, 1);
      const stream = compactStream(items);
      const num = locate(stream, '(1)');
      assert.ok(num !== null, `${align}: the equation number prints`);
      const right = num.x + num.item.width;
      assert.ok(num.item.width > 0, `${align}: pdfjs reports the number width`);
      numberRights.push(right);
      const expectedRight = layout.marginLeft + plan.formulaAreaWidthPt;
      assert.ok(
        Math.abs(right - expectedRight) < 8,
        `${align}: number still right-pinned at the area edge (${right.toFixed(1)} vs ${expectedRight.toFixed(1)})`,
      );
    });
  }
  assert.ok(
    Math.max(...numberRights) - Math.min(...numberRights) < 0.5,
    'the number position is alignment-invariant (the cell never moves)',
  );
});

await test('8.7 alignment coexists with the Where list: beside column fixed, below full-width (P06-M3-R1)', async () => {
  // Beside mode (default A4): the formula aligns inside its band while the
  // Where column stays put at the area edge for every alignment.
  const whereXs = [];
  for (const align of ['left', 'center', 'right']) {
    const doc = alignDoc(align, { withWhere: true });
    const { xs, plan } = expectedAlignXs(doc, { withWhere: true });
    assert.equal(plan.whereMode, 'beside', `${align}: room beside the short formula`);
    const bytes = await render(doc);
    await withPdf(bytes, async (pdf) => {
      // Dominant cluster = the formula (many glyph paths); the Where
      // column's \E symbol is also vector, so leftmost-ink alone would
      // conflate the two in below mode.
      const origins = await pathOrigins(pdf, 1);
      assert.ok(origins[0].count >= 3, `${align}: the formula cluster dominates`);
      const boxX = origins[0].x;
      assert.ok(
        Math.abs(boxX - xs[align]) < 1.5,
        `${align}: formula aligned inside the beside band (${boxX.toFixed(1)} vs ${xs[align].toFixed(1)})`,
      );
      const items = await pageItems(pdf, 1);
      const stream = compactStream(items);
      const where = locate(stream, 'Where:');
      assert.ok(where !== null, `${align}: the Where label prints`);
      whereXs.push(where.x);
    });
  }
  assert.ok(
    Math.max(...whereXs) - Math.min(...whereXs) < 0.5,
    'the beside Where column is alignment-invariant',
  );

  // Below mode (90 mm margins): the full-width list sits under the formula
  // at the left margin while the formula itself still right-aligns.
  const narrowDoc = alignDoc('right', { withWhere: true, narrow: true });
  const { xs, plan, layout } = expectedAlignXs(narrowDoc, { withWhere: true });
  assert.equal(plan.whereMode, 'below', 'narrow margins move the list below');
  assert.equal(plan.scaledToFit, false, 'the short formula still fits at natural width');
  const bytes = await render(narrowDoc);
  await withPdf(bytes, async (pdf) => {
    const origins = await pathOrigins(pdf, 1);
    assert.ok(origins[0].count >= 3, 'below mode: the formula cluster dominates the \\E symbol');
    const boxX = origins[0].x;
    assert.ok(
      Math.abs(boxX - xs.right) < 1.5,
      `right-aligned above a below-mode list (${boxX.toFixed(1)} vs ${xs.right.toFixed(1)})`,
    );
    const items = await pageItems(pdf, 1);
    const stream = compactStream(items);
    const where = locate(stream, 'Where:');
    assert.ok(where !== null, 'the below-mode Where label prints');
    assert.ok(
      Math.abs(where.x - layout.marginLeft) < 6,
      `the below list starts at the left margin (${where.x.toFixed(1)} vs ${layout.marginLeft.toFixed(1)})`,
    );
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 9. Regression & wiring
// ═══════════════════════════════════════════════════════════════════════════
group('9 · regression & wiring');

await test('9.1 the P06-M2 structural blocks and the default formula still render', async () => {
  let doc = newDoc('regression');
  for (const type of [
    'heading',
    'paragraph',
    'list',
    'callout',
    'table',
    'horizontal-line',
    'metadata-block',
    'formula',
  ]) {
    doc = insertBlock(doc, type).doc;
  }
  const texts = await pageTextsOf(doc);
  assert.equal(fallbackMarker(texts), false, 'no structural block fell back');
  assert.equal(
    texts.some((t) => t.includes('[Formula could not be rendered')),
    false,
    'the registry-default formula renders through the real engine',
  );
  assert.ok(has(texts.join(' '), 'Section heading'), 'headings still render');
  assert.ok(has(texts.join(' '), 'Callout'), 'callouts still render');
});

await test('9.2 the formula editor is wired through App → Workspace → EditorPanel', () => {
  const app = fs.readFileSync(path.join(root, 'src', 'App.tsx'), 'utf8');
  const workspace = fs.readFileSync(
    path.join(root, 'src', 'components', 'workspace', 'Workspace.tsx'),
    'utf8',
  );
  const panel = fs.readFileSync(
    path.join(root, 'src', 'components', 'editor-panel', 'EditorPanel.tsx'),
    'utf8',
  );
  assert.ok(app.includes('handleFormulaAction'), 'App defines the formula dispatcher');
  assert.ok(
    app.includes('onFormulaAction={handleFormulaAction}'),
    'App wires the dispatcher into the workspace',
  );
  assert.ok(workspace.includes('onFormulaAction'), 'Workspace passes the dispatcher through');
  assert.ok(panel.includes('FormulaContentEditor'), 'EditorPanel imports the editor');
  assert.ok(panel.includes('onAction={handleFormula}'), 'EditorPanel dispatches through one callback');
});

await test('9.3 fixtures and baselines are untouched; the suite script is registered', () => {
  assert.equal(
    fs.existsSync(path.join(root, 'fixtures', 'p06-m3')),
    false,
    'P06-M3 writes no committed artifacts',
  );
  assert.ok(
    fs.existsSync(path.join(root, 'fixtures', 'p04-m3', 'theme-gallery.pdf')),
    'earlier phase baselines are still present',
  );
  const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
  assert.equal(pkg.scripts['verify:p06-m3'], 'node verify_p06_m3.mjs', 'npm script registered');
  const doc = newDoc();
  assert.equal(doc.schemaVersion, 1, 'the document schema version is unchanged');
});

// ── Summary ─────────────────────────────────────────────────────────────────
group('summary');
console.log(`\n${passed} passed, ${failed.length} failed`);
if (failed.length > 0) {
  console.error(`Failed checks:\n  - ${failed.join('\n  - ')}`);
  process.exit(1);
}
