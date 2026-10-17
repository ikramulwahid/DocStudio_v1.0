/**
 * P04-M2 — Body-theme token & rendering framework verification
 * ═══════════════════════════════════════════════════════════════════════════
 * Compiles the REAL services (`services/body-theme-tokens.ts`,
 * `services/body-theme-registry.ts`) and the REAL renderer
 * (`renderer/poc/*` → @react-pdf/renderer) to CommonJS in
 * node_modules/.cache and exercises them in Node with `node:assert/strict`.
 * No test framework is introduced.
 *
 * Covers (task §7, checks 1–14): registry completeness; metadata validity
 * and determinism; resolver stability and immutability; classic-formal
 * reproducing P04-M1's default typography and heading scale; heading-scale
 * response to base sizes; typography pass-through; monochrome structure
 * preservation; color edge cases; ThemeMode independence; explicit
 * rejection of invalid theme ids; page-size/orientation integrity; the
 * renderer actually consuming the resolved framework; and the P02-M4
 * baseline PDF remaining byte-identical to the COMMITTED reference
 * (`git show 2f31e02:…` — not an in-run re-render, which cannot detect a
 * consistently changed renderer).
 *
 * This suite never writes the committed fixture (unlike verify_p02_m4,
 * which regenerates it as evidence).
 *
 * Usage: node verify_p04_m2.mjs   (or: npm run verify:p04-m2)
 */

import { execSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { rmSync, readFileSync } from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import assert from 'node:assert/strict';

const require = createRequire(import.meta.url);
const root = path.dirname(new URL(import.meta.url).pathname.replace(/^\//, ''));
const fixturePath = path.join(root, 'fixtures', 'p02-m4', 'renderer-poc-output.pdf');
/** The commit whose artifact is the verified P02-M4/P04-M1 byte-identical baseline. */
const BASELINE_COMMIT = '2f31e02';

// ── Compile the real renderer + services for Node ───────────────────────────
const outDir = path.join(root, 'node_modules', '.cache', 'ds-p04-m2-verify');
rmSync(outDir, { recursive: true, force: true });
execSync(
  'npx tsc src/renderer/poc/poc-node-entry.ts' +
    ` --outDir "${outDir}" --module commonjs --target es2020 --moduleResolution node` +
    ' --esModuleInterop --skipLibCheck --jsx react-jsx',
  { cwd: root, stdio: 'inherit' },
);
const poc = require(path.join(outDir, 'renderer', 'poc', 'poc-node-entry.js'));
const themes = require(path.join(outDir, 'services', 'body-theme-tokens.js'));
const registryMod = require(path.join(outDir, 'services', 'body-theme-registry.js'));
const defaults = require(path.join(outDir, 'types', 'defaults.js'));

const { BODY_THEME_REGISTRY, BODY_THEME_IDS } = registryMod;
const { resolveBodyTheme, toMonochromeColor, isBodyThemeId, DEFAULT_TEXT_COLOR } = themes;

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

// ── Helpers ─────────────────────────────────────────────────────────────────
const latin1 = (bytes) => Buffer.from(bytes).toString('latin1');
const isPdf = (bytes) =>
  bytes.length > 8 &&
  latin1(bytes.subarray(0, 5)) === '%PDF-' &&
  latin1(bytes).includes('%%EOF');

function pageCount(bytes) {
  const matches = latin1(bytes).match(/\/Type\s*\/Page[^s]/g);
  return matches ? matches.length : 0;
}

const gitShow = (spec) =>
  execSync(`git show ${spec}`, { cwd: root, maxBuffer: 64 * 1024 * 1024 });

/** Replace every string under a color-ish key with a marker, for structure comparison. */
const COLOR_KEYS = new Set([
  'color', 'borderColor', 'headerBackground', 'headerBorderColor',
  'headerTextColor', 'cellDividerColor', 'sectionRuleColor', 'accentColor',
  'text', 'heading', 'accent', 'rule', 'mutedText',
]);
function stripColorFields(obj) {
  if (Array.isArray(obj)) return obj.map(stripColorFields);
  if (obj && typeof obj === 'object') {
    const out = {};
    for (const [k, v] of Object.entries(obj)) {
      out[k] = COLOR_KEYS.has(k) ? '<c>' : stripColorFields(v);
    }
    return out;
  }
  return obj;
}

/** Every color-bearing field of the registry structural tokens (explicit list). */
function registryColorValues(structural) {
  return [
    structural.tables.borderColor, structural.tables.headerBackground,
    structural.tables.headerBorderColor, structural.tables.headerTextColor,
    structural.tables.cellDividerColor, structural.captions.color,
    structural.separators.sectionRuleColor, structural.separators.accentColor,
    structural.frame.color, structural.pageFurniture.color,
    structural.colors.text, structural.colors.heading, structural.colors.accent,
    structural.colors.rule, structural.colors.mutedText,
  ];
}

const EXPECTED_IDS = [
  'classic-formal', 'minimalist', 'editorial', 'scientific-journal',
  'technical-specification', 'corporate', 'geometric', 'framed-document',
  'contemporary-asymmetrical', 'traditional-serif',
];
const EXPECTED_NAMES = {
  'classic-formal': 'Classic Formal',
  'minimalist': 'Minimalist',
  'editorial': 'Editorial',
  'scientific-journal': 'Scientific Journal',
  'technical-specification': 'Technical Specification',
  'corporate': 'Corporate',
  'geometric': 'Geometric',
  'framed-document': 'Framed Document',
  'contemporary-asymmetrical': 'Contemporary Asymmetrical',
  'traditional-serif': 'Traditional Serif',
};

const typo = () => defaults.createDefaultTypography();

// ════════════════════════════════════════════════════════════════════════════
// 1. Registry completeness
// ════════════════════════════════════════════════════════════════════════════
test('1. every BodyThemeId has exactly one registry definition', () => {
  const keys = Object.keys(BODY_THEME_REGISTRY);
  assert.equal(keys.length, 10, `expected 10 entries, got ${keys.length}`);
  assert.deepEqual([...keys].sort(), [...EXPECTED_IDS].sort(), 'keys are exactly the union');
  assert.deepEqual([...BODY_THEME_IDS], EXPECTED_IDS, 'BODY_THEME_IDS matches (registry order)');
  for (const id of EXPECTED_IDS) {
    assert.ok(BODY_THEME_REGISTRY[id], `entry exists for ${id}`);
    assert.equal(BODY_THEME_REGISTRY[id].metadata.id, id, `metadata.id matches key for ${id}`);
  }
  assert.equal(new Set(keys).size, 10, 'no duplicate ids');
});

// ════════════════════════════════════════════════════════════════════════════
// 2. Metadata validity + determinism
// ════════════════════════════════════════════════════════════════════════════
test('2. registry display names and metadata are valid, stable and frozen', () => {
  const names = new Set();
  for (const id of EXPECTED_IDS) {
    const entry = BODY_THEME_REGISTRY[id];
    const m = entry.metadata;
    assert.equal(m.displayName, EXPECTED_NAMES[id], `displayName for ${id}`);
    assert.ok(!names.has(m.displayName), `unique displayName ${m.displayName}`);
    names.add(m.displayName);
    assert.ok(typeof m.intent === 'string' && m.intent.length > 20, `intent for ${id}`);
    assert.ok(Array.isArray(m.plannedCharacteristics) && m.plannedCharacteristics.length >= 3,
      `plannedCharacteristics >= 3 for ${id}`);
    for (const c of m.plannedCharacteristics) {
      assert.ok(typeof c === 'string' && c.length > 0, `non-empty characteristic for ${id}`);
    }
    assert.ok(['default-verified', 'foundation-planned'].includes(m.implementationStatus),
      `valid implementationStatus for ${id}`);
    assert.equal(
      m.implementationStatus,
      id === 'classic-formal' ? 'default-verified' : 'foundation-planned',
      `honest implementation status for ${id}`,
    );
    // Registry colors must all be parseable (valid, predictable grammar).
    for (const value of registryColorValues(entry.structural)) {
      assert.match(value, /^#(?:[0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i,
        `registry color ${value} (${id}) is valid`);
    }
    // Frozen: stable metadata, no mutable side-effect surface.
    assert.ok(Object.isFrozen(entry) && Object.isFrozen(m) && Object.isFrozen(entry.structural),
      `entry frozen for ${id}`);
  }
  // Deterministic: JSON round-trips of the whole catalogue are identical.
  const a = JSON.stringify(Object.keys(BODY_THEME_REGISTRY).map((k) => BODY_THEME_REGISTRY[k].metadata));
  const b = JSON.stringify(Object.keys(BODY_THEME_REGISTRY).map((k) => BODY_THEME_REGISTRY[k].metadata));
  assert.equal(a, b, 'metadata stable across reads');
});

// ════════════════════════════════════════════════════════════════════════════
// 3. Resolver stability
// ════════════════════════════════════════════════════════════════════════════
test('3. resolver output is stable for identical inputs', () => {
  for (const id of EXPECTED_IDS) {
    const r1 = resolveBodyTheme(id, typo(), false);
    const r2 = resolveBodyTheme(id, typo(), false);
    assert.deepEqual(r1, r2, `deep-equal outputs for ${id}`);
    assert.equal(JSON.stringify(r1), JSON.stringify(r2), `byte-stable JSON for ${id}`);
  }
  const m1 = resolveBodyTheme('corporate', typo(), true);
  const m2 = resolveBodyTheme('corporate', typo(), true);
  assert.deepEqual(m1, m2, 'stable under monochrome');
});

// ════════════════════════════════════════════════════════════════════════════
// 4. No mutation of inputs / registry
// ════════════════════════════════════════════════════════════════════════════
test('4. theme resolution does not mutate document or typography settings', () => {
  const input = typo();
  const snapshot = JSON.parse(JSON.stringify(input));
  const res = resolveBodyTheme('editorial', input, true);
  assert.deepEqual(input, snapshot, 'typography input unchanged');
  assert.notStrictEqual(res.tokens.typography, input, 'no shared typography reference');
  assert.notStrictEqual(res.tokens.typography.fontFallbacks, input.fontFallbacks,
    'fallbacks array copied');
  const structural = BODY_THEME_REGISTRY.editorial.structural;
  for (const group of ['headings', 'paragraphs', 'lists', 'tables', 'captions',
    'separators', 'frame', 'pageFurniture', 'colors']) {
    assert.notStrictEqual(res.tokens[group], structural[group], `${group} copied, not referenced`);
  }
  assert.ok(Object.isFrozen(BODY_REGISTRY_SHALLOW()), 'registry remains frozen after resolve');
});
function BODY_REGISTRY_SHALLOW() {
  return BODY_THEME_REGISTRY.editorial;
}

// ════════════════════════════════════════════════════════════════════════════
// 5. classic-formal reproduces P04-M1 defaults
// ════════════════════════════════════════════════════════════════════════════
test('5. classic-formal reproduces P04-M1 default typography and heading scale', () => {
  const res = resolveBodyTheme('classic-formal', typo(), false);
  const t = res.tokens;
  // Authoritative document typography, passed through unchanged (P04-M1).
  assert.deepEqual(t.typography, {
    fontFamily: 'Segoe UI',
    fontFallbacks: ['system-ui', 'Arial', 'sans-serif'],
    baseFontSizePt: 11,
    lineHeight: 1.5,
    paragraphSpacingPt: 6,
    headingSizesPt: { 1: 18, 2: 14, 3: 12, 4: 11 }, // derived scale, P04-M1
  });
  // Structural tokens equal the pre-theming P02-M4 renderer constants.
  assert.deepEqual(t.headings, {
    weight: { 1: 'bold', 2: 'bold', 3: 'bold', 4: 'bold' },
    align: 'left', marginTopPt: 10, marginBottomPt: 6, decoration: 'none',
  });
  assert.deepEqual(t.paragraphs, { align: 'justify', indentStepPt: 18 });
  assert.deepEqual(t.tables, {
    borderColor: '#666666', borderWidthPt: 0.5, headerBackground: '#e8e8e8',
    headerBorderWidthPt: 1, headerBorderColor: '#333333', headerTextColor: '#000000',
    headerWeight: 'bold', cellPaddingVpt: 3, cellPaddingHpt: 4,
    cellDividerColor: '#999999', cellDividerWidthPt: 0.5, marginBottomPt: 8,
  });
  assert.deepEqual(t.captions, {
    sizePt: 9.5, italic: true, marginTopPt: 3, marginBottomPt: 8,
    tableAlign: 'left', figureAlign: 'center', color: '#000000',
  });
  assert.deepEqual(t.pageFurniture, {
    fontSizePt: 9, offsetPt: 28, align: 'center', color: '#444444',
  });
  assert.deepEqual(t.frame, { style: 'none', color: '#333333', widthPt: 1 });
  assert.deepEqual(t.colors, {
    text: '#000000', heading: '#000000', accent: '#444444',
    rule: '#666666', mutedText: '#888888',
  });
  assert.deepEqual(t.lists, { indentPt: 24, itemSpacingPt: 4, markerStyle: 'disc' });
  assert.equal(res.metadata.implementationStatus, 'default-verified');
  assert.equal(DEFAULT_TEXT_COLOR, '#000000');
});

// ════════════════════════════════════════════════════════════════════════════
// 6. Heading scale responds to base font sizes
// ════════════════════════════════════════════════════════════════════════════
test('6. heading sizes respond correctly to different base font sizes', () => {
  const withBase = (base) => {
    const t = typo();
    t.baseFontSizePt = base;
    return resolveBodyTheme('classic-formal', t, false).tokens.typography.headingSizesPt;
  };
  assert.deepEqual(withBase(11), { 1: 18, 2: 14, 3: 12, 4: 11 });
  assert.deepEqual(withBase(14), { 1: 23, 2: 18, 3: 15, 4: 14 });
  assert.deepEqual(withBase(9), { 1: 15, 2: 12, 3: 10, 4: 9 });
  assert.deepEqual(withBase(6), { 1: 10, 2: 8, 3: 7, 4: 6 });
  assert.deepEqual(withBase(72), { 1: 118, 2: 92, 3: 78, 4: 72 });
  // The scale is theme-independent (centralized §8.2 tokens, not per theme).
  const t = typo();
  t.baseFontSizePt = 14;
  assert.deepEqual(resolveBodyTheme('geometric', t, false).tokens.typography.headingSizesPt,
    { 1: 23, 2: 18, 3: 15, 4: 14 });
});

// ════════════════════════════════════════════════════════════════════════════
// 7. Typography pass-through per the token contract
// ════════════════════════════════════════════════════════════════════════════
test('7. font fallbacks, line spacing and paragraph spacing are preserved', () => {
  const custom = {
    fontFamily: 'Cambria',
    fontFallbacks: ['Georgia', 'serif'],
    baseFontSizePt: 12,
    lineHeight: 1.75,
    paragraphSpacingPt: 9,
  };
  for (const id of ['classic-formal', 'technical-specification', 'traditional-serif']) {
    const t = resolveBodyTheme(id, custom, false).tokens.typography;
    assert.equal(t.fontFamily, 'Cambria', `family preserved for ${id}`);
    assert.deepEqual(t.fontFallbacks, ['Georgia', 'serif'], `fallbacks preserved for ${id}`);
    assert.equal(t.baseFontSizePt, 12, `base size preserved for ${id}`);
    assert.equal(t.lineHeight, 1.75, `line spacing preserved for ${id}`);
    assert.equal(t.paragraphSpacingPt, 9, `paragraph spacing preserved for ${id}`);
    assert.deepEqual(t.headingSizesPt, { 1: 20, 2: 15, 3: 13, 4: 12 },
      `heading scale derived from 12 pt for ${id}`);
  }
});

// ════════════════════════════════════════════════════════════════════════════
// 8. Monochrome: colors change, structure preserved
// ════════════════════════════════════════════════════════════════════════════
test('8. monochrome changes color tokens while preserving structural properties', () => {
  const colored = resolveBodyTheme('corporate', typo(), false);
  const mono = resolveBodyTheme('corporate', typo(), true);
  // Colors converted…
  assert.equal(colored.tokens.tables.headerBackground, '#d9e2f3');
  assert.equal(mono.tokens.tables.headerBackground, '#e1e1e1', 'corporate accent → grayscale');
  assert.equal(mono.tokens.tables.headerBorderColor, '#525252');
  assert.equal(mono.tokens.tables.borderColor, '#959595');
  assert.equal(mono.tokens.pageFurniture.color, '#363636');
  assert.equal(mono.tokens.colors.accent, '#525252');
  // …structure preserved exactly (same registry entry, same non-color values).
  assert.deepEqual(stripColorFields(colored.tokens), stripColorFields(mono.tokens),
    'non-color structure identical');
  assert.equal(mono.metadata, colored.metadata, 'same registry entry (no theme swap)');
  assert.equal(mono.themeId, 'corporate');
  assert.equal(colored.monochrome, false);
  assert.equal(mono.monochrome, true);
  // classic-formal's palette is already grayscale: mono is an exact no-op.
  const cf = resolveBodyTheme('classic-formal', typo(), false);
  const cfMono = resolveBodyTheme('classic-formal', typo(), true);
  assert.deepEqual(cfMono.tokens, cf.tokens, 'classic-formal tokens unchanged by mono');
  assert.deepEqual(cfMono.metadata, cf.metadata);
});

// ════════════════════════════════════════════════════════════════════════════
// 9. Color edge cases handled safely
// ════════════════════════════════════════════════════════════════════════════
test('9. color edge cases are handled safely', () => {
  assert.equal(toMonochromeColor('#ff0000'), '#363636');
  assert.equal(toMonochromeColor('#00ff00'), '#b6b6b6');
  assert.equal(toMonochromeColor('#0000ff'), '#121212');
  assert.equal(toMonochromeColor('#abc'), '#b9b9b9'); // 170,187,204 → 185
  assert.equal(toMonochromeColor('rgb(255, 255, 255)'), '#ffffff');
  assert.equal(toMonochromeColor('rgba(0,0,0,0.5)'), '#00000080');
  assert.equal(toMonochromeColor('#000000ff'), '#000000', 'full alpha dropped');
  // Invalid input → explicit documented fallback, never a malformed string.
  for (const bad of ['not-a-color', '', '#12345', '#xyz123', 'rgb(300,0,0)',
    'rgba(0,0,0,2)', 'red', 'rgb(1,2)', 'rgb(1,,2)']) {
    assert.equal(toMonochromeColor(bad), '#000000', `invalid ${JSON.stringify(bad)}`);
  }
  // Grays round-trip unchanged; conversion is idempotent.
  for (const gray of ['#000000', '#444444', '#666666', '#999999', '#e8e8e8', '#ffffff']) {
    assert.equal(toMonochromeColor(gray), gray, `gray ${gray} unchanged`);
  }
  for (const input of ['#ff0000', '#abc', 'rgba(0,0,0,0.5)', 'not-a-color']) {
    const once = toMonochromeColor(input);
    assert.equal(toMonochromeColor(once), once, `idempotent for ${input}`);
  }
  for (const input of ['#ff0000', 'rgb(1,2,3)', 'not-a-color']) {
    assert.match(toMonochromeColor(input), /^#[0-9a-f]{6}(?:[0-9a-f]{2})?$/, 'well-formed output');
  }
});

// ════════════════════════════════════════════════════════════════════════════
// 10. Independence from the application UI mode
// ════════════════════════════════════════════════════════════════════════════
test('10. bodyThemeId and monochrome are independent of the application UI mode', () => {
  // The theme layer must not import or reference the interface ThemeMode
  // ('multicolor' | 'light' | 'dark' — src/types/index.ts, applied via
  // `data-theme` in App.tsx) or any persistence of it.  Comments are
  // stripped first: documenting the independence is legitimate, code
  // coupling is not.
  const stripComments = (src) =>
    src
      .replace(/\/\*[\s\S]*?\*\//g, ' ')
      .replace(/(^|[^:"'`\\])\/\/[^\n]*/g, '$1');
  for (const file of ['body-theme-tokens.ts', 'body-theme-registry.ts']) {
    const source = stripComments(readFileSync(path.join(root, 'src', 'services', file), 'utf8'));
    for (const forbidden of ['ThemeMode', 'data-theme', 'localStorage', "types/index"]) {
      assert.ok(!source.includes(forbidden), `${file} does not reference ${forbidden}`);
    }
  }
  // The resolver's ONLY inputs are theme id, document typography and the
  // document monochrome flag — there is no UI-mode parameter to couple to.
  assert.equal(resolveBodyTheme.length, 3, 'resolver takes exactly 3 inputs');
  const uiModes = ['multicolor', 'light', 'dark'];
  for (const m of uiModes) {
    assert.ok(!EXPECTED_IDS.includes(m), 'UI mode values are not theme ids');
  }
});

// ════════════════════════════════════════════════════════════════════════════
// 11. Invalid theme ids rejected explicitly
// ════════════════════════════════════════════════════════════════════════════
test('11. invalid theme ids are rejected explicitly, never silently mapped', () => {
  for (const bad of ['unknown-theme', '', 'CLASSIC-FORMAL', 'classic formal', null, 42]) {
    let message = null;
    try {
      resolveBodyTheme(bad, typo(), false);
    } catch (e) {
      message = e.message;
    }
    assert.ok(message !== null, `resolve rejected ${JSON.stringify(bad)}`);
    assert.ok(message.includes('Unknown body theme id'), `explicit error (got: ${message})`);
    assert.ok(message.includes('classic-formal'), 'error lists valid ids');
    assert.equal(isBodyThemeId(bad), false, `isBodyThemeId rejects ${JSON.stringify(bad)}`);
  }
  for (const id of EXPECTED_IDS) {
    assert.equal(isBodyThemeId(id), true, `isBodyThemeId accepts ${id}`);
  }
});

// ════════════════════════════════════════════════════════════════════════════
// 12–14. Rendered-path checks (real renderer, real bytes)
// ════════════════════════════════════════════════════════════════════════════

// Renders performed once, reused.
let pdfDefault = null;
let pdfLetterLandscape = null;
let pdfMinimalist = null;
let pdfFramed = null;
let pdfClassicMono = null;
let pdfCorporate = null;
let pdfCorporateMono = null;

await testAsync('12. page-size and orientation handling remains intact', async () => {
  const doc = poc.buildPocFixture();
  pdfDefault = Buffer.from(await poc.renderDocPdfBytes(doc));
  assert.ok(isPdf(pdfDefault), 'default fixture renders a genuine PDF');
  assert.ok(/MediaBox \[0 0 595\.28\d* 841\.89\d*\]/.test(latin1(pdfDefault)), 'A4 portrait intact');

  const letter = poc.buildPocFixture();
  letter.pageSetup.size = 'Letter';
  letter.pageSetup.orientation = 'landscape';
  letter.pageSetup.margins = { topMm: 12.7, rightMm: 12.7, bottomMm: 12.7, leftMm: 12.7 };
  pdfLetterLandscape = Buffer.from(await poc.renderDocPdfBytes(letter));
  assert.ok(isPdf(pdfLetterLandscape), 'Letter landscape renders through the themed path');
  assert.ok(/MediaBox \[0 0 792 612\]/.test(latin1(pdfLetterLandscape)), 'Letter landscape MediaBox intact');

  // The resolver owns no page geometry: it has no pageSetup input/output.
  const res = resolveBodyTheme('classic-formal', typo(), false);
  assert.ok(!('pageSetup' in res.tokens), 'tokens carry no pageSetup');
  assert.ok(!('pageSetup' in res), 'resolution carries no pageSetup');
});

await testAsync('13. the supported PDF rendering path uses the resolved framework', async () => {
  // Source check: the renderer calls the resolver at its single call site.
  const rendererSource = readFileSync(path.join(root, 'src', 'renderer', 'poc', 'poc-document.tsx'), 'utf8');
  assert.ok(rendererSource.includes('resolveBodyTheme('), 'renderer calls resolveBodyTheme');
  assert.ok(rendererSource.includes("from '../../services/body-theme-tokens'"), 'renderer imports the framework');

  // Behavior: a different theme's tokens change the rendered output …
  const minimalist = poc.buildPocFixture();
  minimalist.pageTypography.bodyThemeId = 'minimalist';
  pdfMinimalist = Buffer.from(await poc.renderDocPdfBytes(minimalist));
  assert.ok(isPdf(pdfMinimalist), 'minimalist render is a genuine PDF');
  assert.notEqual(Buffer.compare(pdfDefault, pdfMinimalist), 0,
    'minimalist structural tokens change the rendered bytes');

  const framed = poc.buildPocFixture();
  framed.pageTypography.bodyThemeId = 'framed-document';
  pdfFramed = Buffer.from(await poc.renderDocPdfBytes(framed));
  assert.ok(isPdf(pdfFramed), 'framed-document render is a genuine PDF');
  assert.notEqual(Buffer.compare(pdfDefault, pdfFramed), 0, 'framing token changes the rendered bytes');

  // … monochrome of the already-gray default theme preserves output exactly …
  const classicMono = poc.buildPocFixture();
  classicMono.pageTypography.monochrome = true;
  pdfClassicMono = Buffer.from(await poc.renderDocPdfBytes(classicMono));
  assert.equal(Buffer.compare(pdfDefault, pdfClassicMono), 0,
    'classic-formal monochrome output identical (structural preservation)');

  // … and monochrome of an accent-bearing theme converts its colors.
  const corporate = poc.buildPocFixture();
  corporate.pageTypography.bodyThemeId = 'corporate';
  pdfCorporate = Buffer.from(await poc.renderDocPdfBytes(corporate));
  const corporateMono = poc.buildPocFixture();
  corporateMono.pageTypography.bodyThemeId = 'corporate';
  corporateMono.pageTypography.monochrome = true;
  pdfCorporateMono = Buffer.from(await poc.renderDocPdfBytes(corporateMono));
  assert.ok(isPdf(pdfCorporate) && isPdf(pdfCorporateMono), 'corporate renders are genuine PDFs');
  assert.notEqual(Buffer.compare(pdfCorporate, pdfCorporateMono), 0,
    'monochrome converts corporate accent colors in rendered output');
  assert.ok(pageCount(pdfMinimalist) >= 2 && pageCount(pdfFramed) >= 2, 'themed renders paginate');
});

await testAsync('14. P02-M4 baseline PDF remains byte-identical to the committed reference', async () => {
  const committed = gitShow(`${BASELINE_COMMIT}:fixtures/p02-m4/renderer-poc-output.pdf`);
  assert.ok(isPdf(committed), 'committed baseline is a genuine PDF');
  // The working-tree fixture is still the committed baseline (this suite
  // never writes it; verify_p02_m4 regenerates it only when run).
  const working = readFileSync(fixturePath);
  assert.equal(working.length, committed.length, 'working fixture same length as committed');
  assert.equal(Buffer.compare(working, committed), 0, 'working fixture equals committed baseline');
  // The fresh render of the default fixture is byte-identical to it.
  assert.equal(pdfDefault.length, committed.length,
    `fresh render ${pdfDefault.length} B vs committed ${committed.length} B`);
  assert.equal(Buffer.compare(pdfDefault, committed), 0, 'fresh default render is byte-identical');
});

// ── Summary ─────────────────────────────────────────────────────────────────
rmSync(outDir, { recursive: true, force: true });
console.log(`\n${passed} passed, ${failed.length} failed`);
if (failed.length > 0) {
  console.error(`Failed: ${failed.join('; ')}`);
  process.exit(1);
}
