/**
 * P02-M4 — Renderer proof-of-concept verification
 * ═══════════════════════════════════════════════════════════════════════════
 * Bundles the REAL PoC renderer source (fixture → @react-pdf/renderer →
 * PDF bytes) with esbuild and executes it in Node, then inspects the
 * produced PDF structurally: signature, page count, A4 MediaBox, and the
 * actual text content (FlateDecode streams are inflated with zlib and the
 * text-showing operators extracted).  No test framework is introduced.
 *
 * BASELINE POLICY (DEC-008 transition, 2026-10-20):
 * The committed `fixtures/p02-m4/renderer-poc-output.pdf` is the APPROVED
 * baseline.  A normal run renders fresh bytes and FAILS if the committed
 * fixture is missing or differs — it NEVER overwrites the artifact.
 * `UPDATE_ARTIFACTS=1 node verify_p02_m4.mjs` is the explicit opt-in
 * regeneration path that rewrites the approved baseline.
 *
 * Usage: node verify_p02_m4.mjs   (or: npm run verify:p02-m4)
 */

import { execSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { rmSync, writeFileSync, existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import assert from 'node:assert/strict';

const require = createRequire(import.meta.url);
const root = path.dirname(new URL(import.meta.url).pathname.replace(/^\//, ''));
const fixtureDir = path.join(root, 'fixtures', 'p02-m4');
const artifactPath = path.join(fixtureDir, 'renderer-poc-output.pdf');
const UPDATE_ARTIFACTS = process.env.UPDATE_ARTIFACTS === '1';

// ── Compile the real renderer code for Node ─────────────────────────────────
// Compiled (not bundled) into node_modules/.cache so bare imports resolve to
// the REAL installed packages: bundlers rewrite pdfkit's `import.meta.url`
// resource lookups and break its embedded data files (ICC profile, fonts).
const outDir = path.join(root, 'node_modules', '.cache', 'ds-p02-m4-verify');
rmSync(outDir, { recursive: true, force: true });
execSync(
  'npx tsc src/renderer/poc/poc-node-entry.ts' +
    ` --outDir "${outDir}" --module commonjs --target es2020 --moduleResolution node` +
    ' --esModuleInterop --skipLibCheck --jsx react-jsx',
  { cwd: root, stdio: 'inherit' },
);
const poc = require(path.join(outDir, 'renderer', 'poc', 'poc-node-entry.js'));

// ── Tiny test harness ───────────────────────────────────────────────────────
let passed = 0;
const failed = [];
function test(name, fn) {
  try {
    fn();
    passed += 1;
    console.log(`PASS  ${name}`);
  } catch (e) {
    failed.push(name);
    console.error(`FAIL  ${name}\n      ${e.message}`);
  }
}
async function testAsync(name, fn) {
  try {
    await fn();
    passed += 1;
    console.log(`PASS  ${name}`);
  } catch (e) {
    failed.push(name);
    console.error(`FAIL  ${name}\n      ${e.message}`);
  }
}

// ── PDF inspection helpers ──────────────────────────────────────────────────
const latin1 = (bytes) => Buffer.from(bytes).toString('latin1');

function pageCount(bytes) {
  // pdfkit emits one "/Type /Page" object per page plus a "/Type /Pages" tree.
  const matches = latin1(bytes).match(/\/Type\s*\/Page[^s]/g);
  return matches ? matches.length : 0;
}

function inflateStreams(bytes) {
  const text = latin1(bytes);
  const out = [];
  const re = /\bstream\r?\n/g;
  let m;
  while ((m = re.exec(text)) !== null) {
    const start = m.index + m[0].length;
    const end = text.indexOf('endstream', start);
    if (end === -1) break;
    const raw = bytes.subarray(start, end);
    try {
      out.push(zlib.inflateSync(raw).toString('latin1'));
    } catch {
      /* not a Flate stream (or padding) — skip */
    }
    re.lastIndex = end;
  }
  return out.join('\n');
}

function extractedText(bytes) {
  const content = inflateStreams(bytes);
  const strings = [];
  // pdfkit text-showing: `[<hex> 0 <hex> ...] TJ` (hex runs, kerning numbers)
  // and `(literal) Tj`. Hex runs within one TJ array form one visual line.
  const tjRe = /\[((?:<[0-9A-Fa-f]+>|\s|[-\d.])+)\]\s*TJ/g;
  let m;
  while ((m = tjRe.exec(content)) !== null) {
    const runs = m[1].match(/<[0-9A-Fa-f]+>/g) || [];
    strings.push(runs.map((r) => Buffer.from(r.slice(1, -1), 'hex').toString('latin1')).join(''));
  }
  const tjLiteralRe = /\(((?:[^()\\]|\\.)*)\)\s*Tj/g;
  while ((m = tjLiteralRe.exec(content)) !== null) {
    strings.push(m[1].replace(/\\([()\\])/g, '$1'));
  }
  return strings.join(' ');
}

const isPdf = (bytes) =>
  bytes.length > 8 &&
  latin1(bytes.subarray(0, 5)) === '%PDF-' &&
  latin1(bytes).includes('%%EOF');

// ════════════════════════════════════════════════════════════════════════════
// Tests
// ════════════════════════════════════════════════════════════════════════════

// ── 1. Fixture completeness ─────────────────────────────────────────────────
test('1. fixture contains every required sample element', () => {
  const doc = poc.buildPocFixture();
  // 7. Known page geometry
  assert.equal(doc.pageSetup.size, 'A4');
  assert.equal(doc.pageSetup.orientation, 'portrait');
  assert.equal(doc.pageSetup.margins.topMm, 25);
  assert.equal(doc.pageSetup.margins.bottomMm, 25);
  assert.equal(doc.pageSetup.margins.leftMm, 25);
  assert.equal(doc.pageSetup.margins.rightMm, 25);
  // Block inventory
  const types = doc.blocks.map((b) => b.data.type);
  assert.ok(types.filter((t) => t === 'heading').length >= 1, 'has headings');
  const paragraphs = doc.blocks.filter((b) => b.data.type === 'paragraph');
  assert.ok(paragraphs.length >= 6, `enough paragraphs to force overflow (got ${paragraphs.length})`);
  const totalChars = paragraphs.reduce((n, b) => n + b.data.spans.reduce((c, s) => c + s.text.length, 0), 0);
  assert.ok(totalChars > 3000, `paragraph volume forces pagination (got ${totalChars} chars)`);
  // 3. Explicit page break
  assert.equal(types.filter((t) => t === 'page-break').length, 1, 'exactly one explicit page break');
  // 4. Table: 6 rows × 4 columns
  const table = doc.blocks.find((b) => b.data.type === 'table').data;
  assert.equal(table.rows.length, 6);
  assert.ok(table.rows.every((r) => r.cells.length === 4), 'every row has 4 cells');
  assert.equal(table.hasHeaderRow, true);
  assert.ok(table.caption, 'table has a caption');
  // 5. Local image asset genuinely embedded (base64 PNG with valid signature)
  const image = doc.blocks.find((b) => b.data.type === 'image').data;
  assert.equal(image.images.length, 1);
  const asset = doc.assets[image.images[0].assetId];
  assert.ok(asset, 'referenced asset exists');
  const png = Buffer.from(asset.base64Data, 'base64');
  assert.equal(png.subarray(0, 4).toString('hex'), '89504e47', 'asset is a real PNG');
  assert.ok(png.length > 1000, 'asset is a real image, not a stub');
  // 8. Page numbering is produced by the configured footer band (rendered below)
});

// ── Render (performed once, reused) ─────────────────────────────────────────
let pdf1 = null;
let pdf2 = null;

await testAsync('2. renderer produces a genuine non-empty PDF', async () => {
  pdf1 = await poc.renderPocFixturePdfBytes();
  assert.ok(pdf1 instanceof Uint8Array);
  assert.ok(isPdf(pdf1), 'has %PDF- signature and %%EOF trailer');
  assert.ok(pdf1.length > 8000, `non-trivial size (got ${pdf1.length} bytes)`);
  if (UPDATE_ARTIFACTS) {
    writeFileSync(artifactPath, pdf1);
    console.log(`      (UPDATE_ARTIFACTS=1: approved baseline written, ${pdf1.length} B)`);
  }
});

await testAsync('2b. fresh render byte-matches the COMMITTED approved baseline (DEC-008 transition)', async () => {
  // A normal run must never regenerate silently: the committed fixture is
  // the approved baseline and the fresh render must equal it EXACTLY.
  assert.ok(existsSync(artifactPath),
    'committed baseline fixture missing — run UPDATE_ARTIFACTS=1 once to approve it');
  const committed = readFileSync(artifactPath);
  assert.ok(isPdf(committed), 'committed baseline is a genuine PDF');
  assert.equal(pdf1.length, committed.length,
    `fresh render ${pdf1.length} B vs committed ${committed.length} B`);
  assert.equal(Buffer.compare(Buffer.from(pdf1), committed), 0,
    'fresh render is byte-identical to the committed approved baseline');
  console.log(`      baseline verified: fixtures/p02-m4/renderer-poc-output.pdf (${committed.length} B)`);
});

test('3. PDF contains multiple physical pages', () => {
  const n = pageCount(pdf1);
  console.log(`      (actual page count: ${n})`);
  assert.ok(n >= 2, `expected >= 2 pages, got ${n}`);
});

test('4. page size is A4 portrait (MediaBox 595.28 x 841.89 pt)', () => {
  assert.ok(/MediaBox \[0 0 595\.28\d* 841\.89\d*\]/.test(latin1(pdf1)), 'A4 MediaBox present');
});

test('5. text content of headings, table, image caption, header grid and footer numbering is present', () => {
  const text = extractedText(pdf1);
  assert.ok(text.includes('Verification of Analytical Balance'), 'title text rendered');
  assert.ok(text.includes('Calibration Results'), 'post-break heading rendered');
  assert.ok(text.includes('Deviation (mg)'), 'table header cell rendered');
  assert.ok(text.includes('100.0000'), 'table data cell rendered');
  assert.ok(text.includes('Table 1'), 'table caption rendered');
  assert.ok(text.includes('Figure 1'), 'image caption rendered');
  // DEC-008 activated furniture: the header grid's {documentId} cell and
  // the footer grid's {organizationName} cell replace the legacy
  // hard-coded "{documentId} — DocStudio Renderer Proof of Concept" line.
  assert.ok(text.includes('SOP-POC-004'), 'configured header grid cell ({documentId}) rendered');
  assert.ok(text.includes('DocStudio Proof-of-Concept Laboratory'),
    'configured footer grid cell ({organizationName}) rendered');
  assert.ok(/Page [23] of \d+/.test(text), 'footer/header numbering rendered on non-suppressed pages');
  // §9 first-page behavior (schema default suppressOnFirstPage=true):
  // the first BODY page carries no page number.
  assert.ok(!/Page 1 of \d+/.test(text),
    'first body page suppressed by default - no "Page 1 of N" anywhere');
});

test('5b. the explicit page-break block creates a real page boundary', () => {
  const text = extractedText(pdf1);
  const iLastPara = text.indexOf('Health and safety');
  const iFooterLastPage = text.search(/Page 3 of 3/);
  const iPostBreak = text.indexOf('Calibration Results');
  assert.ok(iLastPara !== -1 && iPostBreak !== -1, 'both pre- and post-break text present');
  // The page-3 band numbering (configured header/footer grid, DEC-008)
  // must appear between the last pre-break paragraph and the post-break
  // heading: that is a real page boundary, not a decorative box.
  assert.ok(iFooterLastPage !== -1, 'page-3 band numbering exists (>= 3 pages)');
  assert.ok(iLastPara < iFooterLastPage, 'last pre-break paragraph is on an earlier page');
  assert.ok(iFooterLastPage < iPostBreak, 'post-break heading starts on a fresh page');
});

await testAsync('6. re-render is deterministic (byte-identical, stable layout)', async () => {
  pdf2 = await poc.renderPocFixturePdfBytes();
  assert.equal(pdf2.length, pdf1.length, 'same byte length');
  assert.equal(Buffer.compare(Buffer.from(pdf2), Buffer.from(pdf1)), 0, 'byte-identical output');
  assert.equal(pageCount(pdf2), pageCount(pdf1), 'same page count');
  assert.equal(extractedText(pdf2), extractedText(pdf1), 'same extracted text layout');
});

await testAsync('7. unregistered font family ("Segoe UI") has a documented outcome', async () => {
  try {
    const probe = await poc.renderFontFallbackProbe();
    assert.ok(isPdf(probe), 'outcome A: renders successfully via engine fallback');
    console.log('      (outcome: unregistered family renders via engine fallback to a standard font)');
  } catch (e) {
    assert.ok(e && e.message, 'outcome B: fails with an understandable error');
    console.log(`      (outcome: unregistered family fails predictably: ${e.message})`);
  }
});

await testAsync('8. missing image asset fails with an understandable error', async () => {
  const doc = poc.buildPocFixture();
  const image = doc.blocks.find((b) => b.data.type === 'image').data;
  image.images[0].assetId = '00000000-0000-4000-8000-0000000000ff';
  let message = null;
  try {
    await poc.renderDocPdfBytes(doc);
  } catch (e) {
    message = e.message;
  }
  assert.ok(message !== null, 'render rejected');
  assert.ok(message.includes('not found in document.assets'), `clear error (got: ${message})`);
});

// ── Summary ─────────────────────────────────────────────────────────────────
rmSync(outDir, { recursive: true, force: true });
console.log(`\n${passed} passed, ${failed.length} failed`);
console.log(`PDF artifact: ${artifactPath}`);
if (failed.length > 0) {
  console.error(`Failed: ${failed.join('; ')}`);
  process.exit(1);
}
