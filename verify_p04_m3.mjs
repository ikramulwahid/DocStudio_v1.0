/**
 * P04-M3 — Ten structurally distinct body themes verification
 * ═══════════════════════════════════════════════════════════════════════════
 * Compiles the REAL services (`services/body-theme-tokens.ts`,
 * `services/body-theme-registry.ts`, `services/page-typography.ts`,
 * `services/document-file.ts`, `services/document-actions.ts`) and the REAL
 * renderer (`renderer/poc/*` → @react-pdf/renderer) to CommonJS in
 * node_modules/.cache and exercises them in Node with `node:assert/strict`.
 * No test framework is introduced.
 *
 * Covers (task §7, checks 1–18):
 *  1 registry completeness; 2 descriptions + evidence-backed statuses;
 *  3 resolver determinism; 4 pairwise structural differences beyond
 *  colors/name/font; 5 classic-vs-traditional meaningful distinction;
 *  6 typography inputs authoritative; 7 monochrome grayscale conversion with
 *  structure preserved; 8 no mutation of inputs; 9 explicit failure on
 *  invalid id/monochrome; 10 selector scoping (ten registry options, no
 *  cover controls); 11 no false dirty on re-select; 12 UI-mode independence;
 *  13 page-setup/geometry preservation; 14 ten distinct genuine PDFs +
 *  colour gallery artifact; 15 sample content intact (no loss/overflow);
 *  16 monochrome composition (same text, grayscale ink) + monochrome gallery
 *  + manifest; 17 P02-M4 baseline byte-identity (`git show 2f31e02:…`);
 *  18 .docstudio serialization/duplicate round-trip.
 *
 * Artifacts (fixtures/p04-m3/): the first run BOOTSTRAPS the gallery PDFs
 * and manifest; every later run re-renders them and byte-compares against
 * the committed copies, so committed evidence always matches current code.
 * Set UPDATE_ARTIFACTS=1 to intentionally regenerate stale artifacts.
 *
 * Usage: node verify_p04_m3.mjs   (or: npm run verify:p04-m3)
 */

import { execSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { mkdirSync, existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import crypto from 'node:crypto';
import path from 'node:path';
import zlib from 'node:zlib';
import assert from 'node:assert/strict';

const require = createRequire(import.meta.url);
const root = path.dirname(new URL(import.meta.url).pathname.replace(/^\//, ''));
const fixturePath = path.join(root, 'fixtures', 'p02-m4', 'renderer-poc-output.pdf');
/** The commit whose artifact is the verified P02-M4/P04-M1 byte-identical baseline. */
const BASELINE_COMMIT = '2f31e02';
const artifactDir = path.join(root, 'fixtures', 'p04-m3');
const UPDATE_ARTIFACTS = process.env.UPDATE_ARTIFACTS === '1';

// ── Compile the real renderer + services for Node ───────────────────────────
const outDir = path.join(root, 'node_modules', '.cache', 'ds-p04-m3-verify');
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
const { updateBodyTheme } = poc;

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

const sha256 = (bytes) => crypto.createHash('sha256').update(bytes).digest('hex');
const gitShow = (spec) =>
  execSync(`git show ${spec}`, { cwd: root, maxBuffer: 64 * 1024 * 1024 });

/** Decompress every Flate stream (same proven approach as verify_p02_m4). */
function inflateStreams(bytes) {
  const text = latin1(bytes);
  const out = [];
  const re = /\bstream\r?\n/g;
  let m;
  while ((m = re.exec(text)) !== null) {
    const start = m.index + m[0].length;
    const end = text.indexOf('endstream', start);
    if (end === -1) break;
    try {
      out.push(zlib.inflateSync(bytes.subarray(start, end)).toString('latin1'));
    } catch {
      /* not a Flate stream (or padding) — skip */
    }
    re.lastIndex = end;
  }
  return out.join('\n');
}

/** Decode every text-showing operation of a PDF (pdfkit hex/literal runs). */
function extractedText(bytes) {
  const content = inflateStreams(bytes);
  const strings = [];
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

/** Replace every color-bearing value with a marker (P04-M2 convention). */
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

/** Every color value reachable under color-bearing keys. */
function allColorValues(tokens, out = []) {
  if (Array.isArray(tokens)) {
    for (const v of tokens) allColorValues(v, out);
  } else if (tokens && typeof tokens === 'object') {
    for (const [k, v] of Object.entries(tokens)) {
      if (COLOR_KEYS.has(k) && typeof v === 'string') out.push(v);
      else allColorValues(v, out);
    }
  }
  return out;
}

/** Count leaf paths where two token trees differ (colors pre-stripped). */
function countLeafDiffs(a, b, prefix = '') {
  if (typeof a !== typeof b) return 1;
  if (a && b && typeof a === 'object' && !Array.isArray(a)) {
    let n = 0;
    const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
    for (const k of keys) n += countLeafDiffs(a[k], b[k], `${prefix}.${k}`);
    return n;
  }
  return JSON.stringify(a) === JSON.stringify(b) ? 0 : 1;
}

/** Bootstrap-or-verify a committed evidence artifact (determinism check). */
function storeArtifact(name, bytes) {
  const p = path.join(artifactDir, name);
  mkdirSync(artifactDir, { recursive: true });
  if (existsSync(p) && !UPDATE_ARTIFACTS) {
    const committed = readFileSync(p);
    assert.equal(bytes.length, committed.length,
      `${name}: regenerated size ${bytes.length} B vs committed ${committed.length} B`);
    assert.equal(Buffer.compare(bytes, committed), 0,
      `${name}: regenerated bytes match committed artifact (run UPDATE_ARTIFACTS=1 to regenerate)`);
    console.log(`      verified artifact ${name} (${bytes.length} B) matches committed copy`);
  } else {
    writeFileSync(p, bytes);
    console.log(`      ${UPDATE_ARTIFACTS ? 'regenerated' : 'bootstrapped'} artifact ${name} (${bytes.length} B)`);
  }
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
const FIXED_NOW = '2031-03-03T00:00:00.000Z';

// ════════════════════════════════════════════════════════════════════════════
// 1. Registry completeness
// ════════════════════════════════════════════════════════════════════════════
test('1. registry completeness — every BodyThemeId defined exactly once', () => {
  const keys = Object.keys(BODY_THEME_REGISTRY);
  assert.equal(keys.length, 10, `expected 10 entries, got ${keys.length}`);
  assert.deepEqual([...keys].sort(), [...EXPECTED_IDS].sort(), 'keys are exactly the union');
  assert.deepEqual([...BODY_THEME_IDS], EXPECTED_IDS, 'BODY_THEME_IDS matches (registry order)');
  for (const id of EXPECTED_IDS) {
    const entry = BODY_THEME_REGISTRY[id];
    assert.ok(entry, `entry exists for ${id}`);
    assert.equal(entry.metadata.id, id, `metadata.id matches key for ${id}`);
    assert.ok(entry.structural, `structural tokens exist for ${id}`);
    // The full §8.3 token contract is present per theme.
    for (const group of ['headings', 'paragraphs', 'lists', 'tables', 'captions',
      'separators', 'frame', 'pageFurniture', 'colors']) {
      assert.ok(entry.structural[group], `${group} tokens present for ${id}`);
    }
    assert.ok(Object.isFrozen(entry) && Object.isFrozen(entry.structural),
      `entry frozen for ${id}`);
  }
});

// ════════════════════════════════════════════════════════════════════════════
// 2. Descriptions + evidence-backed statuses
// ════════════════════════════════════════════════════════════════════════════
test('2. descriptions and implementation statuses are complete and evidence-backed', () => {
  const designs = new Set();
  const intents = new Set();
  for (const id of EXPECTED_IDS) {
    const m = BODY_THEME_REGISTRY[id].metadata;
    assert.equal(m.displayName, EXPECTED_NAMES[id], `displayName for ${id}`);
    assert.ok(typeof m.intent === 'string' && m.intent.length >= 20, `intent present for ${id}`);
    assert.ok(typeof m.structuralDesign === 'string' && m.structuralDesign.length >= 40,
      `structuralDesign describes implemented composition for ${id}`);
    assert.ok(!designs.has(m.structuralDesign), `structuralDesign unique (${id})`);
    assert.ok(!intents.has(m.intent), `intent unique (${id})`);
    designs.add(m.structuralDesign);
    intents.add(m.intent);
    // P04-M3 evidence-backed vocabulary: the default keeps the default's
    // status; the nine finished §8.3 compositions carry
    // `composition-verified` (implemented AND gallery-inspected).
    assert.equal(
      m.implementationStatus,
      id === 'classic-formal' ? 'default-verified' : 'composition-verified',
      `honest P04-M3 status for ${id}`,
    );
    assert.ok(['default-verified', 'composition-verified'].includes(m.implementationStatus),
      `valid vocabulary for ${id}`);
  }
  assert.equal(designs.size, 10, 'all ten descriptions distinct');
});

// ════════════════════════════════════════════════════════════════════════════
// 3. Resolver determinism
// ════════════════════════════════════════════════════════════════════════════
test('3. resolver output is deterministic for all ten themes, colour and monochrome', () => {
  for (const id of EXPECTED_IDS) {
    for (const mono of [false, true]) {
      const a = resolveBodyTheme(id, typo(), mono);
      const b = resolveBodyTheme(id, typo(), mono);
      assert.deepEqual(a, b, `deep-equal outputs for ${id} (mono=${mono})`);
      assert.equal(JSON.stringify(a), JSON.stringify(b), `byte-stable JSON for ${id} (mono=${mono})`);
    }
  }
  // Registry ordering itself is stable across reads (selection UI order).
  assert.equal(JSON.stringify(BODY_THEME_IDS), JSON.stringify([...BODY_THEME_IDS]),
    'theme id order stable');
});

// ════════════════════════════════════════════════════════════════════════════
// 4. Pairwise structural differences (beyond colors, name and font)
// ════════════════════════════════════════════════════════════════════════════
test('4. every theme pair differs structurally beyond colors, name and font', () => {
  // Fingerprint = the whole structural token set with every color value
  // stripped (and typography excluded: it is the same document input for
  // every theme, i.e. neither name, accent color nor font can make a pair
  // "different").  All 45 pairs must differ purely by composition.
  const fp = {};
  for (const id of EXPECTED_IDS) {
    const { typography, ...structural } = resolveBodyTheme(id, typo(), false).tokens;
    assert.ok(typography, `typography present for ${id}`); // (used, not a typo)
    fp[id] = JSON.stringify(stripColorFields(structural));
  }
  let pairs = 0;
  let minDiffs = Infinity;
  for (let i = 0; i < EXPECTED_IDS.length; i++) {
    for (let j = i + 1; j < EXPECTED_IDS.length; j++) {
      const a = EXPECTED_IDS[i];
      const b = EXPECTED_IDS[j];
      pairs += 1;
      assert.notEqual(fp[a], fp[b], `structural fingerprints differ: ${a} vs ${b}`);
      const diffs = countLeafDiffs(
        stripColorFields(JSON.parse(fp[a])), stripColorFields(JSON.parse(fp[b])),
      );
      minDiffs = Math.min(minDiffs, diffs);
      assert.ok(diffs >= 1, `${a} vs ${b}: at least one non-color difference`);
    }
  }
  assert.equal(pairs, 45, 'all 45 pairs compared');
  console.log(`      45/45 pairs structurally distinct (min non-color leaf differences: ${minDiffs})`);
});

// ════════════════════════════════════════════════════════════════════════════
// 5. Classic Formal vs Traditional Serif — meaningfully distinct
// ════════════════════════════════════════════════════════════════════════════
test('5. classic-formal and traditional-serif are meaningfully distinct compositions', () => {
  const c = BODY_THEME_REGISTRY['classic-formal'].structural;
  const t = BODY_THEME_REGISTRY['traditional-serif'].structural;
  // Hierarchy: all-bold academic formal vs book-like BNNN.
  assert.deepEqual(c.headings.weight, { 1: 'bold', 2: 'bold', 3: 'bold', 4: 'bold' });
  assert.deepEqual(t.headings.weight, { 1: 'bold', 2: 'normal', 3: 'normal', 4: 'normal' });
  // Paragraph rhythm: shallow formal indent vs deep book indent.
  assert.equal(t.paragraphs.indentStepPt, 21);
  assert.notEqual(c.paragraphs.indentStepPt, t.paragraphs.indentStepPt);
  // Heading margins, list indent and marker language.
  assert.notEqual(c.headings.marginTopPt, t.headings.marginTopPt);
  assert.equal(t.headings.marginTopPt, 14);
  assert.notEqual(c.lists.indentPt, t.lists.indentPt);
  assert.equal(c.lists.markerStyle, 'disc');
  assert.equal(t.lists.markerStyle, 'circle');
  // Table language: filled header + ruled interior vs unfilled header,
  // regular header weight and borderless interior.
  assert.equal(c.tables.headerWeight, 'bold');
  assert.equal(t.tables.headerWeight, 'normal');
  assert.notEqual(c.tables.cellDividerWidthPt, t.tables.cellDividerWidthPt);
  assert.equal(t.tables.cellDividerWidthPt, 0, 'traditional interior dividers removed');
  // Page furniture and captions sit differently on the page.
  assert.notEqual(c.pageFurniture.offsetPt, t.pageFurniture.offsetPt);
  assert.equal(t.pageFurniture.offsetPt, 34);
  assert.notEqual(c.pageFurniture.fontSizePt, t.pageFurniture.fontSizePt);
  assert.notEqual(c.captions.sizePt, t.captions.sizePt);
  // …and the color-stripped compositions differ overall (beyond accent).
  const strip = ({ typography, ...rest }) => JSON.stringify(stripColorFields(rest));
  assert.notEqual(
    strip(resolveBodyTheme('classic-formal', typo(), false).tokens),
    strip(resolveBodyTheme('traditional-serif', typo(), false).tokens),
    'color-stripped compositions differ',
  );
});

// ════════════════════════════════════════════════════════════════════════════
// 6. Document typography inputs stay authoritative (all ten)
// ════════════════════════════════════════════════════════════════════════════
test('6. document typography inputs remain authoritative for all ten themes', () => {
  const custom = {
    fontFamily: 'Cambria',
    fontFallbacks: ['Georgia', 'serif'],
    baseFontSizePt: 12,
    lineHeight: 1.75,
    paragraphSpacingPt: 9,
  };
  for (const id of EXPECTED_IDS) {
    const t = resolveBodyTheme(id, custom, false).tokens.typography;
    assert.equal(t.fontFamily, 'Cambria', `family preserved for ${id}`);
    assert.deepEqual(t.fontFallbacks, ['Georgia', 'serif'], `fallbacks preserved for ${id}`);
    assert.equal(t.baseFontSizePt, 12, `base size preserved for ${id}`);
    assert.equal(t.lineHeight, 1.75, `line spacing preserved for ${id}`);
    assert.equal(t.paragraphSpacingPt, 9, `paragraph spacing preserved for ${id}`);
    assert.deepEqual(t.headingSizesPt, { 1: 20, 2: 15, 3: 13, 4: 12 },
      `heading scale derived from 12 pt for ${id}`);
  }
  // Theme composition is independent of the typography inputs: the
  // structural tokens never change when only typography changes.
  for (const id of EXPECTED_IDS) {
    const small = resolveBodyTheme(id, { ...typo(), baseFontSizePt: 9 }, false).tokens;
    const large = resolveBodyTheme(id, { ...typo(), baseFontSizePt: 15 }, false).tokens;
    const { typography: t1, ...s1 } = small;
    const { typography: t2, ...s2 } = large;
    assert.deepEqual(s1, s2, `composition unaffected by base size for ${id}`);
    assert.notEqual(t1.headingSizesPt[1], t2.headingSizesPt[1],
      `heading scale still responds for ${id}`);
  }
});

// ════════════════════════════════════════════════════════════════════════════
// 7. Monochrome: grayscale conversion, structure preserved
// ════════════════════════════════════════════════════════════════════════════
test('7. monochrome converts all ten palettes to grayscale while preserving structure', () => {
  const chromatic = [];
  for (const id of EXPECTED_IDS) {
    const color = resolveBodyTheme(id, typo(), false).tokens;
    const mono = resolveBodyTheme(id, typo(), true).tokens;
    // Structure preserved exactly…
    assert.deepEqual(stripColorFields(color), stripColorFields(mono),
      `non-color structure preserved for ${id}`);
    // …every color is grayscale (well-formed #rrggbb with r=g=b)…
    for (const v of allColorValues(mono)) {
      assert.match(v, /^#([0-9a-f]{2})\1\1$/i, `${id}: ${v} is grayscale`);
    }
    // …and conversion is deterministic.
    assert.deepEqual(mono, resolveBodyTheme(id, typo(), true).tokens,
      `mono deterministic for ${id}`);
    if (JSON.stringify(color) !== JSON.stringify(mono)) chromatic.push(id);
  }
  // The palette-bearing themes really convert …
  for (const id of ['corporate', 'editorial', 'geometric', 'traditional-serif']) {
    assert.ok(chromatic.includes(id), `${id} has chromatic ink to convert`);
  }
  // …while the already-gray default is an exact no-op (P04-M2 contract).
  const cf = resolveBodyTheme('classic-formal', typo(), false).tokens;
  assert.deepEqual(resolveBodyTheme('classic-formal', typo(), true).tokens, cf,
    'classic-formal tokens unchanged by monochrome');
  console.log(`      chromatic themes converted: ${chromatic.join(', ')}`);
});

// ════════════════════════════════════════════════════════════════════════════
// 8. No mutation of inputs
// ════════════════════════════════════════════════════════════════════════════
test('8. theme resolution and updateBodyTheme never mutate their inputs', () => {
  const input = typo();
  const snapshot = JSON.parse(JSON.stringify(input));
  for (const id of EXPECTED_IDS) {
    resolveBodyTheme(id, input, true);
  }
  assert.deepEqual(input, snapshot, 'typography input unchanged');
  assert.ok(Object.isFrozen(BODY_THEME_REGISTRY['corporate']),
    'registry remains frozen after resolutions');

  const doc = poc.buildThemeSampleDoc('geometric', true);
  const docSnapshot = JSON.parse(JSON.stringify(doc));
  const res = updateBodyTheme(doc, { field: 'bodyThemeId', value: 'editorial' }, FIXED_NOW);
  assert.ok(res.ok && res.changed, 'change applied');
  assert.notStrictEqual(res.doc, doc, 'new document reference on change');
  assert.deepEqual(doc, docSnapshot, 'source document untouched (immutable update)');
  // The change is scoped: only bodyThemeId + modifiedAt may differ.
  const { pageTypography: ptA, metadata: mdA, ...restA } = doc;
  const { pageTypography: ptB, metadata: mdB, ...restB } = res.doc;
  assert.deepEqual(restA, restB, 'content, assets, pageSetup, frontPage untouched');
  assert.equal(ptB.bodyThemeId, 'editorial', 'the one patched field changed');
  const { bodyThemeId, monochrome, ...ptRest } = ptA;
  const { bodyThemeId: _i, monochrome: _m, ...ptRestB } = ptB;
  assert.deepEqual(ptRest, ptRestB, 'remaining pageTypography settings untouched');
  assert.deepEqual({ ...mdA, modifiedAt: mdA.modifiedAt }, mdA); // (sanity)
  assert.equal(mdB.modifiedAt, FIXED_NOW, 'modifiedAt stamped with provided time');
  assert.deepEqual({ ...mdB, modifiedAt: mdA.modifiedAt }, mdA, 'metadata otherwise untouched');
});

// ════════════════════════════════════════════════════════════════════════════
// 9. Explicit failure on invalid input
// ════════════════════════════════════════════════════════════════════════════
test('9. invalid theme ids and invalid monochrome values fail explicitly', () => {
  const doc = poc.buildThemeSampleDoc('classic-formal', false);
  const snapshot = JSON.parse(JSON.stringify(doc));

  for (const bad of ['unknown-theme', '', 'CLASSIC-FORMAL', 'classic formal']) {
    const res = updateBodyTheme(doc, { field: 'bodyThemeId', value: bad }, FIXED_NOW);
    assert.equal(res.ok, false, `rejected ${JSON.stringify(bad)}`);
    assert.equal(res.code, 'unknown-body-theme', 'explicit error code');
    assert.ok(res.message.includes('ten available themes'), 'understandable message');
    assert.ok(!('doc' in res), 'no document returned on rejection');
  }
  // The resolver's policy reaches the service: no silent mapping either.
  assert.equal(isBodyThemeId('not-a-theme'), false, 'guard rejects unknown id');
  let thrown = null;
  try {
    resolveBodyTheme('not-a-theme', typo(), false);
  } catch (e) {
    thrown = e.message;
  }
  assert.ok(thrown && thrown.includes('Unknown body theme id'), 'resolver throws explicitly');

  const badMono = updateBodyTheme(doc, { field: 'monochrome', value: 'on' }, FIXED_NOW);
  assert.equal(badMono.ok, false, 'non-boolean monochrome rejected');
  assert.equal(badMono.code, 'invalid-number', 'documented code for invalid value');
  assert.deepEqual(doc, snapshot, 'rejected patches change nothing');
});

// ════════════════════════════════════════════════════════════════════════════
// 10. Selector scoping
// ════════════════════════════════════════════════════════════════════════════
test('10. the selector is scoped to the document body theme (ten options, no cover controls)', () => {
  const panelPath = path.join(root, 'src', 'components', 'left-panel', 'PageTypographyPanel.tsx');
  const panel = readFileSync(panelPath, 'utf8');
  // Options come from the registry — ten human-readable names, not a
  // hard-coded parallel list.
  assert.ok(panel.includes('BODY_THEME_IDS.map('), 'options iterate BODY_THEME_IDS');
  assert.ok(panel.includes('BODY_THEME_REGISTRY[id].metadata.displayName'),
    'option labels are registry display names');
  assert.equal(BODY_THEME_IDS.length, 10, 'exactly ten selectable themes');
  // Design-intent + implemented-structure description from the registry.
  assert.ok(panel.includes('metadata.intent'), 'shows the design intent');
  assert.ok(panel.includes('structuralDesign'), 'shows the implemented-structure description');
  // Monochrome toggle is bound to the authoritative document setting.
  assert.ok(panel.includes('checked={pageTypography.monochrome}'),
    'monochrome checkbox bound to pageTypography.monochrome');
  assert.ok(panel.includes('onBodyThemeChange'), 'patches go through onBodyThemeChange');
  // No cover/front-page theme controls in this panel (P04-M4 scope).
  assert.ok(!panel.includes('coverTheme'), 'no cover theme control');
  assert.ok(!panel.includes('frontPageDesigner'), 'no cover designer control');
  // The patch union is exactly { bodyThemeId, monochrome }.
  const ptSrc = readFileSync(path.join(root, 'src', 'services', 'page-typography.ts'), 'utf8');
  const unionStart = ptSrc.indexOf('export type BodyThemePatch');
  assert.ok(unionStart >= 0, 'BodyThemePatch exported');
  const union = ptSrc.slice(unionStart, ptSrc.indexOf('*/', unionStart));
  assert.equal((union.match(/field:/g) || []).length, 2, 'exactly two patch fields');
  assert.ok(union.includes("field: 'bodyThemeId'") && union.includes("field: 'monochrome'"),
    'patch fields are bodyThemeId and monochrome');
  // App wiring: immutable update through the established path only.
  const app = readFileSync(path.join(root, 'src', 'App.tsx'), 'utf8');
  assert.ok(app.includes('updateBodyTheme(activeDocument, patch)'), 'App calls updateBodyTheme');
  assert.ok(app.includes('result.ok && result.changed') && app.includes('handleBodyThemeChange'),
    'App commits via ok&&changed guard');
  // Prop threaded through Workspace and LeftPanel (single wiring path).
  for (const file of ['components/workspace/Workspace.tsx', 'components/left-panel/LeftPanel.tsx']) {
    const src = readFileSync(path.join(root, 'src', file), 'utf8');
    assert.ok(src.includes('onBodyThemeChange'), `${file} forwards onBodyThemeChange`);
  }
});

// ════════════════════════════════════════════════════════════════════════════
// 11. No false dirty on re-select
// ════════════════════════════════════════════════════════════════════════════
test('11. re-selecting the active theme or monochrome state is a no-op (no false dirty)', () => {
  const doc = poc.buildThemeSampleDoc('classic-formal', false);
  // Same theme → SAME document reference: the App never calls
  // setActiveDocument, so document state cannot become dirty.
  const same = updateBodyTheme(doc, { field: 'bodyThemeId', value: 'classic-formal' }, FIXED_NOW);
  assert.ok(same.ok, 'accepted');
  assert.equal(same.changed, false, 'changed=false for same theme');
  assert.equal(same.doc, doc, 'same document reference (no state update possible)');
  // Same monochrome value → same no-op guarantee.
  const sameMono = updateBodyTheme(doc, { field: 'monochrome', value: false }, FIXED_NOW);
  assert.equal(sameMono.changed, false, 'changed=false for same monochrome');
  assert.equal(sameMono.doc, doc, 'same reference for same monochrome');
  assert.equal(doc.metadata.modifiedAt, poc.THEME_SAMPLE_CREATED_AT, 'modifiedAt untouched');
  // A real change stamps only modifiedAt, with the provided time.
  const changed = updateBodyTheme(doc, { field: 'monochrome', value: true }, FIXED_NOW);
  assert.ok(changed.ok && changed.changed === true, 'real change reports changed=true');
  assert.equal(changed.doc.metadata.modifiedAt, FIXED_NOW, 'modifiedAt stamped');
  // No-op AFTER the change (re-select of the new value) is again a no-op.
  const again = updateBodyTheme(changed.doc, { field: 'monochrome', value: true }, FIXED_NOW);
  assert.equal(again.changed, false, 're-select of stored value is a no-op');
  assert.equal(again.doc, changed.doc, 'same reference after real change');
});

// ════════════════════════════════════════════════════════════════════════════
// 12. Independence from the application UI mode
// ════════════════════════════════════════════════════════════════════════════
test('12. document theme and monochrome are independent of the application UI mode', () => {
  const stripComments = (src) =>
    src
      .replace(/\/\*[\s\S]*?\*\//g, ' ')
      .replace(/(^|[^:"'`\\])\/\/[^\n]*/g, '$1');
  // The document-theme layer (services + selector) must not reference the
  // interface ThemeMode, its `data-theme` application, or any UI
  // persistence — comments stripped first (documenting independence is
  // legitimate, code coupling is not).
  for (const file of [
    'services/body-theme-tokens.ts',
    'services/body-theme-registry.ts',
    'services/page-typography.ts',
    'components/left-panel/PageTypographyPanel.tsx',
  ]) {
    const source = stripComments(readFileSync(path.join(root, 'src', file), 'utf8'));
    for (const forbidden of ['ThemeMode', 'data-theme', 'localStorage', 'types/index']) {
      assert.ok(!source.includes(forbidden), `${file} does not reference ${forbidden}`);
    }
  }
  // The resolver's ONLY inputs are theme id, document typography and the
  // document monochrome flag — no UI-mode parameter to couple to.
  assert.equal(resolveBodyTheme.length, 3, 'resolver takes exactly 3 inputs');
  for (const m of ['multicolor', 'light', 'dark']) {
    assert.ok(!EXPECTED_IDS.includes(m), 'UI mode values are not theme ids');
    assert.equal(isBodyThemeId(m), false, `UI mode ${m} is not a valid theme id`);
  }
});

// ════════════════════════════════════════════════════════════════════════════
// 13. Page-setup preservation
// ════════════════════════════════════════════════════════════════════════════
await testAsync('13. page setup, custom margins and geometry are preserved across themes', async () => {
  const doc = poc.buildThemeSampleDoc('classic-formal', false);
  const setupSnapshot = JSON.parse(JSON.stringify(doc.pageSetup));
  const baseLayout = poc.computePocLayout(doc);
  assert.ok(Math.abs(baseLayout.contentWidth - 453.55) < 0.01,
    `A4 25mm content width intact (${baseLayout.contentWidth})`);
  // Theme selection never touches page setup, content or metadata scope.
  for (const id of EXPECTED_IDS) {
    const res = updateBodyTheme(doc, { field: 'bodyThemeId', value: id }, FIXED_NOW);
    assert.ok(res.ok);
    assert.deepEqual(res.doc.pageSetup, setupSnapshot, `pageSetup preserved for ${id}`);
    assert.strictEqual(res.doc.blocks, doc.blocks, `content untouched for ${id}`);
    assert.equal(poc.computePocLayout(res.doc).contentWidth, baseLayout.contentWidth,
      `geometry identical for ${id}`);
  }
  // A themed render honours Letter landscape + custom 12.7 mm margins.
  const letter = poc.buildThemeSampleDoc('technical-specification', false);
  letter.pageSetup.size = 'Letter';
  letter.pageSetup.orientation = 'landscape';
  letter.pageSetup.margins = { topMm: 12.7, rightMm: 12.7, bottomMm: 12.7, leftMm: 12.7 };
  const pdfLetter = Buffer.from(await poc.renderDocPdfBytes(letter));
  assert.ok(isPdf(pdfLetter), 'Letter landscape themed render is a genuine PDF');
  assert.ok(/MediaBox \[0 0 792 612\]/.test(latin1(pdfLetter)), 'Letter landscape MediaBox intact');
  const ll = poc.computePocLayout(letter);
  assert.ok(Math.abs(ll.contentWidth - 720) < 0.01,
    `custom margins honoured in content width (${ll.contentWidth} ≈ 720)`);
  // The resolver owns no page geometry.
  const res = resolveBodyTheme('classic-formal', typo(), false);
  assert.ok(!('pageSetup' in res.tokens) && !('pageSetup' in res),
    'resolution carries no pageSetup');
});

// ════════════════════════════════════════════════════════════════════════════
// 14. Ten distinct PDFs through the real path (+ colour gallery artifact)
// ════════════════════════════════════════════════════════════════════════════
const samplePdfs = {};
let colourGallery = null;
await testAsync('14. all ten themes render distinct, genuine PDFs through the real resolver path', async () => {
  const hashes = new Map();
  for (const id of EXPECTED_IDS) {
    const pdf = Buffer.from(await poc.renderDocPdfBytes(poc.buildThemeSampleDoc(id, false)));
    assert.ok(isPdf(pdf), `${id} renders a genuine PDF`);
    assert.ok(pageCount(pdf) >= 2, `${id} sample paginates (${pageCount(pdf)} pages)`);
    samplePdfs[id] = pdf;
    hashes.set(sha256(pdf), id);
  }
  assert.equal(hashes.size, 10,
    `all ten renders byte-distinct (got ${hashes.size}: ${[...hashes.values()].join(', ')})`);
  // Colour gallery: one section per theme, ten banners by display name.
  colourGallery = Buffer.from(await poc.renderThemeGalleryPdfBytes(false));
  assert.ok(isPdf(colourGallery), 'colour gallery is a genuine PDF');
  assert.equal(pageCount(colourGallery), 20, 'gallery pages = 10 themes × 2 sample pages');
  const gText = extractedText(colourGallery);
  for (const id of EXPECTED_IDS) {
    assert.ok(gText.includes(EXPECTED_NAMES[id]), `gallery banner shows ${EXPECTED_NAMES[id]}`);
  }
  storeArtifact('theme-gallery.pdf', colourGallery);
});

// ════════════════════════════════════════════════════════════════════════════
// 15. Sample content intact in every themed render
// ════════════════════════════════════════════════════════════════════════════
test('15. sample content survives intact in every themed render (no loss or overflow)', () => {
  // Fragments are each contained within a single span/line so wrapping
  // cannot mask a content-loss defect.
  const fragments = [
    'SYNTHETIC SAMPLE CONTENT.',                 // synthetic disclaimer
    'Synthetic Theme Sample',                    // long H1 (wraps)
    'Purpose and Scope of the Sample',           // H2
    'Preparation Sequence',                      // H3
    'Compare heading spacing',                   // bullet item
    'Observe list marker shape',                 // nested (depth 1) item
    'Observe the section rule weight',           // numbered item
    'Recorded Values (Invented)',                // H4
    'First-level indented paragraph',            // indentLevel 1
    'Second-level indented paragraph',           // indentLevel 2
    'Comparative Sample Table',                  // H3 before table
    'Table S1',                                  // table caption
    'not analytical data',                       // caption's synthetic notice
    'Alpha', 'Bravo', 'Charlie', 'Delta',        // table rows
    '+0.4',                                      // numeric cell
    'End of Synthetic Sample Section',           // section-break title
    'End of synthetic sample.',                  // closing paragraph end
  ];
  for (const id of EXPECTED_IDS) {
    const text = extractedText(samplePdfs[id]);
    for (const fragment of fragments) {
      assert.ok(text.includes(fragment), `${id}: missing ${JSON.stringify(fragment)}`);
    }
    // Pagination present (the sample is deliberately multi-page) and the
    // last page is not truncated: the closing marker survives.
    assert.ok(pageCount(samplePdfs[id]) >= 2, `${id}: multi-page render`);
    assert.ok(text.lastIndexOf('End of synthetic sample.') > 0,
      `${id}: content runs to the document end`);
  }
  console.log(`      ${fragments.length} content fragments present across all 10 renders`);
});

// ════════════════════════════════════════════════════════════════════════════
// 16. Monochrome composition (same content, grayscale ink) + artifacts
// ════════════════════════════════════════════════════════════════════════════
await testAsync('16. monochrome renders keep identical content in grayscale (all ten usable)', async () => {
  let changed = 0;
  for (const id of EXPECTED_IDS) {
    const colorPdf = samplePdfs[id];
    const monoPdf = Buffer.from(await poc.renderDocPdfBytes(poc.buildThemeSampleDoc(id, true)));
    assert.ok(isPdf(monoPdf), `${id}: mono render is a genuine PDF`);
    assert.equal(pageCount(monoPdf), pageCount(colorPdf), `${id}: same pagination in mono`);
    assert.equal(extractedText(monoPdf), extractedText(colorPdf),
      `${id}: monochrome changes ink only, never text`);
    const differs = Buffer.compare(monoPdf, colorPdf) !== 0;
    if (id === 'classic-formal') {
      assert.equal(differs, false, 'classic mono is a byte no-op (already gray)');
    } else if (['corporate', 'editorial', 'geometric', 'traditional-serif'].includes(id)) {
      assert.equal(differs, true, `${id}: chromatic theme changes under mono`);
      changed += 1;
    }
  }
  assert.ok(changed >= 4, 'at least the four chromatic themes visibly convert');

  // Monochrome gallery: identical text, banner label swapped, same pages.
  const monoGallery = Buffer.from(await poc.renderThemeGalleryPdfBytes(true));
  assert.ok(isPdf(monoGallery), 'monochrome gallery is a genuine PDF');
  assert.equal(pageCount(monoGallery), 20, 'mono gallery has the same 20 pages');
  assert.notEqual(Buffer.compare(monoGallery, colourGallery), 0,
    'mono gallery differs as bytes from the colour gallery');
  const colourText = extractedText(colourGallery)
    .replace(/P04-M3 THEME GALLERY [^]*?SYNTHETIC SAMPLE \(NOT REAL DATA\)/g, '<BANNER>');
  const monoText = extractedText(monoGallery)
    .replace(/P04-M3 THEME GALLERY [^]*?SYNTHETIC SAMPLE \(NOT REAL DATA\)/g, '<BANNER>');
  assert.equal(monoText, colourText,
    'mono gallery body text identical to colour gallery (ink-only change; the gallery '
    + 'banner label is normalized — MONOCHROME is longer than COLOUR and can re-wrap a '
    + 'tight banner line, which is chrome, not document content)');
  storeArtifact('theme-gallery-monochrome.pdf', monoGallery);

  // Deterministic manifest (no timestamps): evidence index of the run.
  const manifest = {
    manifest: 'DocStudio P04-M3 theme gallery manifest v1',
    generatedBy: 'verify_p04_m3.mjs — deterministic (timestamp-free)',
    sample: {
      documentId: poc.buildThemeSampleDoc('classic-formal', false).metadata.documentId,
      createdAt: poc.THEME_SAMPLE_CREATED_AT,
      synthetic: true,
      blocks: poc.buildThemeSampleDoc('classic-formal', false).blocks.length,
    },
    themes: EXPECTED_IDS.map((id) => ({
      id,
      displayName: BODY_THEME_REGISTRY[id].metadata.displayName,
      implementationStatus: BODY_THEME_REGISTRY[id].metadata.implementationStatus,
      structuralDesign: BODY_THEME_REGISTRY[id].metadata.structuralDesign,
    })),
    artifacts: {
      'theme-gallery.pdf': {
        pages: pageCount(colourGallery),
        bytes: colourGallery.length,
        sha256: sha256(colourGallery),
      },
      'theme-gallery-monochrome.pdf': {
        pages: pageCount(monoGallery),
        bytes: monoGallery.length,
        sha256: sha256(monoGallery),
      },
    },
  };
  storeArtifact('theme-manifest.json',
    Buffer.from(`${JSON.stringify(manifest, null, 2)}\n`, 'utf8'));
});

// ════════════════════════════════════════════════════════════════════════════
// 17. P02-M4 baseline byte-identity
// ════════════════════════════════════════════════════════════════════════════
await testAsync('17. P02-M4 baseline PDF remains byte-identical to the committed reference', async () => {
  const committed = gitShow(`${BASELINE_COMMIT}:fixtures/p02-m4/renderer-poc-output.pdf`);
  assert.ok(isPdf(committed), 'committed baseline is a genuine PDF');
  const working = readFileSync(fixturePath);
  assert.equal(working.length, committed.length, 'working fixture same length as committed');
  assert.equal(Buffer.compare(working, committed), 0, 'working fixture equals committed baseline');
  const fresh = Buffer.from(await poc.renderPocFixturePdfBytes());
  assert.equal(fresh.length, committed.length,
    `fresh render ${fresh.length} B vs committed ${committed.length} B`);
  assert.equal(Buffer.compare(fresh, committed), 0, 'fresh default render is byte-identical');
  assert.equal(DEFAULT_TEXT_COLOR, '#000000', 'default ink policy unchanged');
});

// ════════════════════════════════════════════════════════════════════════════
// 18. Serialization + duplication round-trip
// ════════════════════════════════════════════════════════════════════════════
test('18. theme and monochrome survive .docstudio serialization and duplication', () => {
  const doc = poc.buildThemeSampleDoc('framed-document', true);
  // Serialize → parse → validate → authoritative values intact.
  const text = poc.serializeDocument(doc);
  assert.equal(typeof text, 'string', 'serializeDocument returns text');
  const parsed = JSON.parse(text);
  poc.validateDocument(parsed); // throws on invalid
  assert.equal(parsed.pageTypography.bodyThemeId, 'framed-document', 'theme id preserved');
  assert.equal(parsed.pageTypography.monochrome, true, 'monochrome preserved');
  assert.deepEqual(parsed.pageTypography.typography, doc.pageTypography.typography,
    'typography settings preserved');
  assert.deepEqual(parsed.pageSetup, doc.pageSetup, 'page setup preserved');
  assert.deepEqual(parsed.metadata, doc.metadata, 'metadata preserved');
  assert.equal(parsed.blocks.length, doc.blocks.length, 'content preserved');
  // Duplicate: theme settings travel with the copy; identity is fresh.
  const dup = poc.duplicateDocument(parsed, FIXED_NOW);
  assert.notEqual(dup.id, parsed.id, 'duplicate has a fresh document id');
  assert.equal(dup.pageTypography.bodyThemeId, 'framed-document', 'duplicate keeps theme');
  assert.equal(dup.pageTypography.monochrome, true, 'duplicate keeps monochrome');
  assert.deepEqual(dup.pageTypography, parsed.pageTypography, 'pageTypography round-tripped');
  assert.deepEqual(dup.pageSetup, parsed.pageSetup, 'pageSetup round-tripped');
  assert.equal(dup.blocks.length, parsed.blocks.length, 'content duplicated');
  // The duplicate itself serializes and validates cleanly.
  const dupParsed = JSON.parse(poc.serializeDocument(dup));
  poc.validateDocument(dupParsed);
  assert.equal(dupParsed.pageTypography.bodyThemeId, 'framed-document');
  assert.equal(dupParsed.pageTypography.monochrome, true);
  // Source untouched throughout.
  assert.equal(parsed.pageTypography.bodyThemeId, 'framed-document', 'source untouched');
});

// ── Summary ─────────────────────────────────────────────────────────────────
rmSync(outDir, { recursive: true, force: true });
console.log(`\n${passed} passed, ${failed.length} failed`);
if (failed.length > 0) {
  console.error(`Failed: ${failed.join('; ')}`);
  process.exit(1);
}
