/**
 * P05-M3 — Lists and callouts verification
 * ═══════════════════════════════════════════════════════════════════════════
 * Compiles the REAL modules (`services/list-numbering.ts`,
 * `services/list-callout-content.ts`, `services/rich-text.ts`,
 * `services/block-content.ts`, `services/block-actions.ts`,
 * `services/block-registry.ts`, `services/document-file.ts`, `types/*`)
 * and the REAL renderer (`renderer/poc/*` → @react-pdf/renderer) to
 * CommonJS in a cache dir and exercises them in Node with
 * `node:assert/strict`.  No test framework is introduced.
 *
 * Covers (task §9):
 *  1–4  numbering: decimal/alpha/roman formatters at every documented
 *       boundary (1/9/10/26/27/52/53/702/703, roman 4/9/40/90/444/999/
 *       1000/3999, >3999 decimal fallback); depth counters increment per
 *       level and reset deeper sequences; skipped levels omitted;
 *       ancestors decimal; purity/determinism; markers never stored.
 *  5–8  list settings: all three list types and every bullet/number style
 *       commit; invalid values rejected with deterministic codes without
 *       mutating the source; checked states survive type changes and
 *       reappear; no-ops keep the same reference and do not stamp
 *       modifiedAt, real changes do.
 *  9–11 item text: stable ID/neighbour/formatting preservation, empty
 *       text allowed, model-boundary sanitisation, deterministic
 *       rejections for missing block/not-a-list/missing item.
 * 12–19 item management: add (fresh IDs, anchor depth, checklist
 *       unchecked, focus id), remove (exactly that item), move up/down
 *       (subtree-aware, sibling-only, boundaries rejected), move-to
 *       (explicit index validation, same-position no-op), indent/outdent
 *       (subtree shift, depth limits, depth-zero rejection), checklist
 *       state, dispatcher routing, unrelated-block integrity.
 * 20–23 callouts: variant set/change/custom preserved/invalid rejected;
 *       title set/change/cleared (field absent)/validated; body span
 *       normalisation; no-ops; missing-block/not-a-callout.
 * 24–26 persistence & compatibility: list settings/items/depth/checked/
 *       markerSource and callout variant/title/spans survive
 *       serialize → deserialize → re-edit → serialize; legacy schema-v1
 *       files (no markerSource) stay valid; P05-M1/P05-M2 operations
 *       still work on the same document.
 * 27–33 renderer: every numbering style prints markers; nested counters
 *       reset; marker-source policy byte-evidence (absent ≡ theme,
 *       explicit block style honoured, coherent when equal); arrow
 *       chevron glyph; checklist state visibly differs; callout labels/
 *       custom fallback/title/body appear; monochrome accents are
 *       grayscale (meaning never colour-only); no list/callout text is
 *       dropped; P02-M4 baseline remains BYTE-IDENTICAL.
 *
 * Usage: node verify_p05_m3.mjs   (or: npm run verify:p05-m3)
 */

import { execSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { readFileSync, rmSync } from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import assert from 'node:assert/strict';

const require = createRequire(import.meta.url);
const root = path.dirname(new URL(import.meta.url).pathname.replace(/^\//, ''));

// ── Compile the real modules to CommonJS in node_modules/.cache ─────────────
// The output must live INSIDE the project tree so `react` and
// `@react-pdf/renderer` resolve at require-time (same pattern as
// verify_p04_m3/p05_m2).  `--jsx react-jsx` is required because the
// renderer entry references JSX.
const outDir = path.join(root, 'node_modules', '.cache', 'ds-p05-m3-verify');
rmSync(outDir, { recursive: true, force: true });
execSync(
  'npx tsc src/renderer/poc/poc-node-entry.ts' +
    ' src/services/list-numbering.ts src/services/list-callout-content.ts' +
    ' src/services/rich-text.ts src/services/block-content.ts' +
    ' src/services/block-actions.ts src/services/block-registry.ts' +
    ` --outDir "${outDir}" --module commonjs --target es2020 --moduleResolution node` +
    ' --esModuleInterop --skipLibCheck --jsx react-jsx',
  { cwd: root, stdio: 'inherit' },
);

const poc = require(path.join(outDir, 'renderer', 'poc', 'poc-node-entry.js'));
const numbering = require(path.join(outDir, 'services', 'list-numbering.js'));
const listCallout = require(path.join(outDir, 'services', 'list-callout-content.js'));
const richText = require(path.join(outDir, 'services', 'rich-text.js'));
const blockActions = require(path.join(outDir, 'services', 'block-actions.js'));
const blockContent = require(path.join(outDir, 'services', 'block-content.js'));
const file = require(path.join(outDir, 'services', 'document-file.js'));
const defaults = require(path.join(outDir, 'types', 'defaults.js'));

const {
  ROMAN_MAX,
  formatDecimal,
  formatAlpha,
  formatRoman,
  formatListCounter,
  computeListLabels,
} = numbering;
const {
  MAX_LIST_DEPTH,
  LIST_TYPES,
  BULLET_STYLES,
  NUMBER_STYLES,
  LIST_MARKER_SOURCES,
  MAX_CALLOUT_VARIANT_LENGTH,
  updateListSettings,
  updateListItemText,
  addListItem,
  removeListItem,
  moveListItem,
  moveListItemTo,
  indentListItem,
  outdentListItem,
  setItemChecked,
  applyListContentAction,
  updateCalloutContent,
} = listCallout;
const { remapSpansAfterTextEdit, spansToPlainText } = richText;
const { createBlock, insertBlock } = blockActions;
const { updateHeadingContent, updateParagraphContent } = blockContent;
const { serializeDocument, deserializeDocument, validateDocument } = file;
const { createDefaultDocument } = defaults;
const { renderDocPdfBytes, buildPocFixture } = poc;

// ── Test runner (same style as the prior suites) ────────────────────────────
let passed = 0;
const failed = [];
async function test(name, fn) {
  try {
    await fn();
    passed += 1;
    console.log(`  ok  ${name}`);
  } catch (e) {
    failed.push({ name, e });
    console.error(`FAIL  ${name}\n      ${e && e.message ? e.message : e}`);
    if (e && e.stack) console.error(`      ${String(e.stack).split('\n').slice(1, 4).join('\n      ')}`);
  }
}

// ── Fixtures ────────────────────────────────────────────────────────────────
const T0 = '2026-10-18T10:00:00.000Z';
const T1 = '2026-10-18T11:00:00.000Z';
let seq = 0;
/** Deterministic ID generator for block/item IDs (tests only). */
const genId = () => `10700000-0000-4000-8000-${String(++seq).padStart(12, '0')}`;
const opts = () => ({ now: T1, genId });
const newDoc = () => createDefaultDocument('doc-p05-m3', T0);
const snap = (doc) => JSON.stringify(doc);

/** Build a list block: items = [{text|spans, depth, checked}], cfg = settings. */
function listBlock(items, cfg = {}) {
  const block = createBlock('list', genId);
  block.data = {
    ...block.data,
    listType: cfg.listType ?? 'bullet',
    bulletStyle: cfg.bulletStyle ?? 'disc',
    numberStyle: cfg.numberStyle ?? 'decimal',
    items: items.map((item, i) => ({
      id: item.id ?? genId(),
      spans: item.spans ?? [{ text: item.text ?? `Item ${i + 1}` }],
      depth: item.depth ?? 0,
      ...(item.checked !== undefined ? { checked: item.checked } : {}),
    })),
    ...(cfg.markerSource !== undefined ? { markerSource: cfg.markerSource } : {}),
  };
  return block;
}

/** Build a callout block from cfg {variant, title, spans}. */
function calloutBlock(cfg = {}) {
  const block = createBlock('callout', genId);
  block.data = {
    ...block.data,
    ...(cfg.variant !== undefined ? { variant: cfg.variant } : {}),
    ...(cfg.title !== undefined ? { title: cfg.title } : {}),
    ...(cfg.spans !== undefined ? { spans: cfg.spans } : {}),
  };
  return block;
}

/** A document containing exactly the given blocks (envelope untouched). */
function docWith(blocks) {
  const doc = newDoc();
  doc.blocks = blocks;
  return doc;
}

/** Render a document to PDF bytes (async helper). */
const render = (doc) => renderDocPdfBytes(doc);

// ── PDF text extraction (same proven approach as verify_p02_m4 / p04_m3) ───
const latin1 = (bytes) => Buffer.from(bytes).toString('latin1');

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
  return strings.join('\n');
}

/** Every DeviceRGB scn colour triple in the content stream. */
function scnColors(bytes) {
  const content = inflateStreams(bytes);
  const out = [];
  const re = /([-\d.]+)\s+([-\d.]+)\s+([-\d.]+)\s+scn/g;
  let m;
  while ((m = re.exec(content)) !== null) {
    out.push([Number(m[1]), Number(m[2]), Number(m[3])]);
  }
  return out;
}

// ═══════════════════════════════════════════════════════════════════════════
// 1–4. List numbering engine (§10.4)
// ═══════════════════════════════════════════════════════════════════════════

await test('1. numbering: decimal, alphabetic and Roman formatters hit every documented boundary', () => {
  assert.equal(formatDecimal(1), '1');
  assert.equal(formatDecimal(42), '42');
  // Bijective base-26 alphabetic.
  assert.equal(formatAlpha(1, false), 'a');
  assert.equal(formatAlpha(9, false), 'i');
  assert.equal(formatAlpha(10, false), 'j');
  assert.equal(formatAlpha(26, false), 'z');
  assert.equal(formatAlpha(27, false), 'aa');
  assert.equal(formatAlpha(52, false), 'az');
  assert.equal(formatAlpha(53, false), 'ba');
  assert.equal(formatAlpha(702, false), 'zz');
  assert.equal(formatAlpha(703, false), 'aaa');
  assert.equal(formatAlpha(27, true), 'AA');
  assert.equal(formatAlpha(53, true), 'BA');
  // Standard Roman (additive/subtractive).
  assert.equal(formatRoman(1), 'i');
  assert.equal(formatRoman(4), 'iv');
  assert.equal(formatRoman(9), 'ix');
  assert.equal(formatRoman(10), 'x');
  assert.equal(formatRoman(40), 'xl');
  assert.equal(formatRoman(90), 'xc');
  assert.equal(formatRoman(400), 'cd');
  assert.equal(formatRoman(900), 'cm');
  assert.equal(formatRoman(444), 'cdxliv');
  assert.equal(formatRoman(999), 'cmxcix');
  assert.equal(formatRoman(1000), 'm');
  assert.equal(formatRoman(ROMAN_MAX), 'mmmcmxcix');
  // Case variants through the style dispatcher.
  assert.equal(formatListCounter(3, 'upper-roman'), 'III');
  assert.equal(formatListCounter(3, 'lower-roman'), 'iii');
  assert.equal(formatListCounter(3, 'upper-alpha'), 'C');
  // Documented Roman fallback: beyond the notation limit → decimal.
  assert.equal(formatListCounter(ROMAN_MAX + 1, 'upper-roman'), String(ROMAN_MAX + 1));
  assert.equal(formatListCounter(4000, 'lower-roman'), '4000');
});

await test('2. numbering: depth counters increment per level and reset deeper sequences', () => {
  const items = [
    { depth: 0 },
    { depth: 1 },
    { depth: 1 },
    { depth: 0 },
    { depth: 1 },
    { depth: 2 },
    { depth: 0 },
  ];
  assert.deepEqual(computeListLabels(items, 'decimal'), [
    '1.',
    '1.1.',
    '1.2.',
    '2.',
    '2.1.',
    '2.1.1.',
    '3.',
  ]);
});

await test('3. numbering: skipped levels omitted; ancestors decimal; style applies to own level', () => {
  // A list whose FIRST item sits at depth 2 prints without "0" segments.
  assert.deepEqual(computeListLabels([{ depth: 2 }], 'decimal'), ['1.']);
  // lower-alpha: own level alphabetic, ancestors always decimal.
  assert.deepEqual(
    computeListLabels([{ depth: 0 }, { depth: 1 }, { depth: 1 }], 'lower-alpha'),
    ['a.', '1.a.', '1.b.'],
  );
  assert.deepEqual(computeListLabels([{ depth: 0 }, { depth: 0 }], 'upper-roman'), ['I.', 'II.']);
  // Deeper counters reset when a shallower item starts a new sequence.
  assert.deepEqual(
    computeListLabels([{ depth: 0 }, { depth: 1 }, { depth: 1 }, { depth: 0 }], 'lower-alpha'),
    ['a.', '1.a.', '1.b.', 'b.'],
  );
});

await test('4. numbering: pure and deterministic; markers are never stored in item data', () => {
  const items = [{ depth: 0 }, { depth: 1 }, { depth: 0 }];
  const before = JSON.stringify(items);
  const first = computeListLabels(items, 'decimal');
  const second = computeListLabels(items, 'decimal');
  assert.deepEqual(first, second, 'same input must yield the same labels');
  assert.equal(JSON.stringify(items), before, 'input items must never be mutated');
  // No prefix is ever written back into the source document.
  const block = listBlock([{ text: 'Alpha' }, { text: 'Beta', depth: 1 }], { listType: 'numbered' });
  const doc = docWith([block]);
  const beforeDoc = snap(doc);
  computeListLabels(block.data.items, 'decimal');
  assert.equal(snap(doc), beforeDoc, 'computing labels must not touch the document');
  assert.equal(spansToPlainText(block.data.items[0].spans), 'Alpha', 'item text has no stored prefix');
});

// ═══════════════════════════════════════════════════════════════════════════
// 5–8. List-level settings
// ═══════════════════════════════════════════════════════════════════════════

await test('5. list settings: all three list types and every bullet/number style commit to the model', () => {
  let doc = docWith([listBlock([{ text: 'One' }])]);
  const id = doc.blocks[0].id;
  // List types: each commits unless it is already the current value.
  let currentType = 'bullet';
  for (const listType of LIST_TYPES) {
    const r = updateListSettings(doc, id, { listType }, opts());
    assert.ok(r.ok, `listType ${listType} must be accepted`);
    assert.equal(r.changed, listType !== currentType, `listType ${listType} change flag`);
    if (r.changed) {
      doc = r.doc;
      currentType = listType;
    }
    assert.equal(doc.blocks[0].data.listType, currentType);
  }
  // Bullet styles: the very first patch also stamps markerSource:'block',
  // so it always changes; every later style changes the style itself.
  let currentBulletKey = 'theme';
  for (const bulletStyle of BULLET_STYLES) {
    const r = updateListSettings(doc, id, { bulletStyle, markerSource: 'block' }, opts());
    assert.ok(r.ok, `bulletStyle ${bulletStyle} must be accepted`);
    const key = `${bulletStyle}`;
    assert.equal(r.changed, key !== currentBulletKey, `bulletStyle ${bulletStyle} change flag`);
    if (r.changed) {
      doc = r.doc;
      currentBulletKey = key;
    }
    assert.equal(doc.blocks[0].data.bulletStyle, currentBulletKey);
    assert.equal(doc.blocks[0].data.markerSource, 'block');
  }
  // Number styles: decimal is already current, the other four commit.
  let currentNumber = 'decimal';
  for (const numberStyle of NUMBER_STYLES) {
    const r = updateListSettings(doc, id, { numberStyle }, opts());
    assert.ok(r.ok, `numberStyle ${numberStyle} must be accepted`);
    assert.equal(r.changed, numberStyle !== currentNumber, `numberStyle ${numberStyle} change flag`);
    if (r.changed) {
      doc = r.doc;
      currentNumber = numberStyle;
    }
    assert.equal(doc.blocks[0].data.numberStyle, currentNumber);
  }
  const r = updateListSettings(doc, id, { markerSource: 'theme' }, opts());
  assert.ok(r.ok && r.changed);
  assert.equal(r.doc.blocks[0].data.markerSource, 'theme');
});

await test('6. list settings: invalid values are rejected with deterministic codes and never mutate the source', () => {
  const doc = docWith([listBlock([{ text: 'One' }])]);
  const id = doc.blocks[0].id;
  const before = snap(doc);
  const cases = [
    [updateListSettings(doc, id, { listType: 'table' }, opts()), 'invalid-list-type'],
    [updateListSettings(doc, id, { bulletStyle: 'star' }, opts()), 'invalid-bullet-style'],
    [updateListSettings(doc, id, { numberStyle: 'hex' }, opts()), 'invalid-number-style'],
    [updateListSettings(doc, id, { markerSource: 'auto' }, opts()), 'invalid-marker-source'],
    [updateListSettings(doc, id, { listType: 42 }, opts()), 'invalid-list-type'],
  ];
  for (const [result, code] of cases) {
    assert.equal(result.ok, false, 'must be rejected');
    assert.equal(result.code, code);
  }
  assert.equal(snap(doc), before, 'source document must be untouched by failures');
  const missing = updateListSettings(doc, genId(), { listType: 'numbered' }, opts());
  assert.equal(missing.ok, false);
  assert.equal(missing.code, 'missing-block');
});

await test('7. list settings: checked states survive list-type changes and reappear as checklists', () => {
  const block = listBlock(
    [
      { text: 'Done', checked: true },
      { text: 'Open', checked: false },
    ],
    { listType: 'checklist' },
  );
  let doc = docWith([block]);
  const id = block.id;
  // Switch away from checklist: checked is inert but preserved.
  let r = updateListSettings(doc, id, { listType: 'bullet' }, opts());
  assert.ok(r.ok && r.changed);
  doc = r.doc;
  assert.equal(doc.blocks[0].data.items[0].checked, true, 'state preserved while inert');
  // Switch back: previous states restored, every item a boolean.
  r = updateListSettings(doc, id, { listType: 'checklist' }, opts());
  assert.ok(r.ok && r.changed);
  doc = r.doc;
  assert.deepEqual(
    doc.blocks[0].data.items.map((item) => item.checked),
    [true, false],
    'previous checklist states restored',
  );
  // Switching to checklist from a plain list gives every item checked:false.
  const plain = listBlock([{ text: 'A' }, { text: 'B', depth: 1 }]);
  const r2 = updateListSettings(docWith([plain]), plain.id, { listType: 'checklist' }, opts());
  assert.ok(r2.ok && r2.changed);
  assert.deepEqual(
    r2.doc.blocks[0].data.items.map((item) => item.checked),
    [false, false],
    'new checklist items default to unchecked',
  );
});

await test('8. list settings: no-op keeps the same reference and does not stamp modifiedAt; real changes stamp', () => {
  const doc = docWith([listBlock([{ text: 'One' }], { listType: 'bullet' })]);
  const id = doc.blocks[0].id;
  const noop = updateListSettings(doc, id, { listType: 'bullet' }, opts());
  assert.ok(noop.ok && noop.changed === false);
  assert.equal(noop.doc, doc, 'no-op must return the same document reference');
  assert.equal(noop.doc.metadata.modifiedAt, doc.metadata.modifiedAt, 'no-op must not stamp');
  const real = updateListSettings(doc, id, { listType: 'numbered' }, opts());
  assert.ok(real.ok && real.changed);
  assert.equal(real.doc.metadata.modifiedAt, T1, 'real change stamps injected now');
});

// ═══════════════════════════════════════════════════════════════════════════
// 9–11. Item text editing
// ═══════════════════════════════════════════════════════════════════════════

await test('9. item text: edits keep the item ID, neighbours and formatting; empty text allowed', () => {
  const block = listBlock([
    { spans: [{ text: 'Bo', bold: true }, { text: 'ld tail' }] },
    { text: 'Neighbour' },
  ]);
  const doc = docWith([block]);
  const [first, second] = block.data.items;
  // Replay a typing edit the way the editor does (P05-M2 remap).
  const edited = remapSpansAfterTextEdit(first.spans, 'Bold tail!');
  const r = updateListItemText(doc, block.id, first.id, edited, opts());
  assert.ok(r.ok && r.changed);
  const items = r.doc.blocks[0].data.items;
  assert.equal(items[0].id, first.id, 'item ID preserved');
  assert.ok(
    items[0].spans.some((span) => span.bold === true && span.text.startsWith('Bo')),
    'existing inline formatting survives the edit',
  );
  assert.equal(spansToPlainText(items[0].spans), 'Bold tail!');
  assert.equal(items[1].id, second.id, 'neighbour item untouched');
  assert.equal(spansToPlainText(items[1].spans), 'Neighbour');
  // Empty text is a deliberate, supported state.
  const cleared = updateListItemText(r.doc, block.id, first.id, [], opts());
  assert.ok(cleared.ok && cleared.changed);
  assert.deepEqual(cleared.doc.blocks[0].data.items[0].spans, []);
});

await test('10. item text: model-boundary sanitisation removes unsafe hrefs and malformed colours', () => {
  const block = listBlock([{ text: 'Safe' }]);
  const doc = docWith([block]);
  const r = updateListItemText(
    doc,
    block.id,
    block.data.items[0].id,
    [
      { text: 'click', href: 'javascript:alert(1)' },
      { text: 'colored', color: 'not-a-color' },
      { text: ' fine', href: 'https://example.org/x' },
    ],
    opts(),
  );
  assert.ok(r.ok && r.changed);
  const spans = r.doc.blocks[0].data.items[0].spans;
  assert.ok(
    spans.every((span) => span.href === undefined || span.href.startsWith('https://')),
    'unsafe hrefs must never be stored',
  );
  assert.ok(spans.every((span) => span.color === undefined), 'malformed colours dropped');
  assert.ok(spans.some((span) => span.href === 'https://example.org/x'), 'safe href preserved');
});

await test('11. item text: missing block / not-a-list / missing item are deterministic rejections', () => {
  const list = listBlock([{ text: 'One' }]);
  const headingBlock = createBlock('heading', genId);
  const doc = docWith([list, headingBlock]);
  const before = snap(doc);
  const missingBlock = updateListItemText(doc, genId(), genId(), [{ text: 'x' }], opts());
  assert.equal(missingBlock.ok, false);
  assert.equal(missingBlock.code, 'missing-block');
  const notAList = updateListItemText(doc, headingBlock.id, genId(), [{ text: 'x' }], opts());
  assert.equal(notAList.ok, false);
  assert.equal(notAList.code, 'not-a-list');
  const missingItem = updateListItemText(doc, list.id, genId(), [{ text: 'x' }], opts());
  assert.equal(missingItem.ok, false);
  assert.equal(missingItem.code, 'missing-item');
  const badSpans = updateListItemText(doc, list.id, list.data.items[0].id, 'nope', opts());
  assert.equal(badSpans.ok, false);
  assert.equal(badSpans.code, 'invalid-spans');
  assert.equal(snap(doc), before, 'rejections must never mutate the source');
});

// ═══════════════════════════════════════════════════════════════════════════
// 12–19. Item management, movement, nesting, checklist state, dispatcher
// ═══════════════════════════════════════════════════════════════════════════

await test('12. add item: fresh unique IDs, anchor depth copied, checklist unchecked, focus id returned', () => {
  const block = listBlock([{ text: 'Top' }, { text: 'Nested', depth: 1 }], {
    listType: 'checklist',
  });
  let doc = docWith([block]);
  const existing = new Set(block.data.items.map((item) => item.id));
  // Add after the NESTED item (depth 1) — the new sibling must copy that level.
  const r = addListItem(doc, block.id, block.data.items[1].id, opts());
  assert.ok(r.ok && r.changed);
  assert.ok(r.itemId !== undefined, 'the new item id is returned for focus management');
  assert.equal(existing.has(r.itemId), false, 'new id must be fresh');
  doc = r.doc;
  const items = doc.blocks[0].data.items;
  assert.equal(items.length, 3);
  assert.equal(items[2].id, r.itemId, 'inserted directly after the anchor');
  assert.equal(items[2].depth, 1, 'new sibling copies the anchor depth');
  assert.equal(items[2].checked, false, 'new checklist items start unchecked');
  assert.deepEqual(items[2].spans, [], 'new items start empty');
  // Appending after the LAST item continues that level; null appends at end.
  const appended = addListItem(doc, block.id, items[2].id, opts());
  assert.ok(appended.ok && appended.changed);
  assert.equal(appended.doc.blocks[0].data.items[3].depth, 1);
  // Empty list: first item via null anchor, at depth 0.
  const empty = listBlock([], {});
  const r2 = addListItem(docWith([empty]), empty.id, null, opts());
  assert.ok(r2.ok && r2.changed);
  assert.equal(r2.doc.blocks[0].data.items.length, 1);
  assert.equal(r2.doc.blocks[0].data.items[0].depth, 0);
  assert.equal(r2.doc.blocks[0].data.items[0].checked, undefined, 'non-checklists store no checked field');
  // Every generated item ID is unique (doc already contains r.itemId).
  const allIds = doc.blocks[0].data.items.map((item) => item.id);
  allIds.push(appended.itemId, r2.itemId);
  assert.equal(new Set(allIds).size, allIds.length, 'all item IDs are unique');
});

await test('13. remove item: removes exactly the addressed item; others keep IDs, order and state', () => {
  const block = listBlock([
    { text: 'A', checked: true },
    { text: 'B', checked: false },
    { text: 'C', checked: true },
  ], { listType: 'checklist' });
  const [a, b, c] = block.data.items;
  const doc = docWith([block]);
  const r = removeListItem(doc, block.id, b.id, opts());
  assert.ok(r.ok && r.changed);
  const items = r.doc.blocks[0].data.items;
  assert.deepEqual(items.map((item) => item.id), [a.id, c.id], 'exactly B removed');
  assert.deepEqual(items.map((item) => item.checked), [true, true], 'states preserved');
  const again = removeListItem(r.doc, block.id, b.id, opts());
  assert.equal(again.ok, false);
  assert.equal(again.code, 'missing-item', 'removing a gone item is a deterministic rejection');
});

await test('14. move item: up/down reorder among siblings; IDs, text, checked and depth preserved; boundaries rejected', () => {
  const block = listBlock([
    { text: 'A', checked: true },
    { text: 'B', checked: false },
    { text: 'C', checked: true },
  ], { listType: 'checklist' });
  const [a, b, c] = block.data.items;
  let doc = docWith([block]);
  // Move C up: swaps with its previous sibling B.
  let r = moveListItem(doc, block.id, c.id, 'up', opts());
  assert.ok(r.ok && r.changed);
  doc = r.doc;
  let items = doc.blocks[0].data.items;
  assert.deepEqual(items.map((item) => item.id), [a.id, c.id, b.id]);
  assert.equal(spansToPlainText(items[1].spans), 'C', 'text travels with the item');
  assert.equal(items[1].checked, true, 'checked travels with the item');
  assert.equal(items[1].depth, 0, 'depth travels with the item');
  // Move C back down.
  r = moveListItem(doc, block.id, c.id, 'down', opts());
  assert.ok(r.ok && r.changed);
  assert.deepEqual(r.doc.blocks[0].data.items.map((item) => item.id), [a.id, b.id, c.id]);
  doc = r.doc; // continue against the restored order
  // Boundaries.
  const firstUp = moveListItem(doc, block.id, a.id, 'up', opts());
  assert.equal(firstUp.ok, false);
  assert.equal(firstUp.code, 'at-boundary');
  const lastDown = moveListItem(doc, block.id, c.id, 'down', opts());
  assert.equal(lastDown.ok, false);
  assert.equal(lastDown.code, 'at-boundary');
  const badDirection = moveListItem(doc, block.id, a.id, 'sideways', opts());
  assert.equal(badDirection.ok, false);
  assert.equal(badDirection.code, 'invalid-move-direction');
});

await test('15. move item: nested subtrees move together; sibling-only rule rejects past ancestors', () => {
  const block = listBlock([
    { text: 'A' },
    { text: 'B', depth: 1 },
    { text: 'C', depth: 1 },
    { text: 'D' },
  ], { listType: 'numbered' });
  const [a, b, c, d] = block.data.items;
  const doc = docWith([block]);
  // D moves up BEFORE A's whole subtree (B and C stay A's children).
  const r = moveListItem(doc, block.id, d.id, 'up', opts());
  assert.ok(r.ok && r.changed);
  const items = r.doc.blocks[0].data.items;
  assert.deepEqual(items.map((item) => item.id), [d.id, a.id, b.id, c.id]);
  assert.deepEqual(items.map((item) => item.depth), [0, 0, 1, 1], 'depths untouched by the move');
  // A (with its subtree) moves below D.
  const r2 = moveListItem(doc, block.id, a.id, 'down', opts());
  assert.ok(r2.ok && r2.changed);
  assert.deepEqual(r2.doc.blocks[0].data.items.map((item) => item.id), [d.id, a.id, b.id, c.id]);
  // B is the first child — no sibling above it (ancestor A reached first).
  const nestedUp = moveListItem(doc, block.id, b.id, 'up', opts());
  assert.equal(nestedUp.ok, false);
  assert.equal(nestedUp.code, 'at-boundary');
});

await test('16. move item to: explicit positions validate; unchanged position is a same-ref no-op', () => {
  const block = listBlock([{ text: 'A' }, { text: 'B' }, { text: 'C' }]);
  const [a, b, c] = block.data.items;
  const doc = docWith([block]);
  const r = moveListItemTo(doc, block.id, c.id, 0, opts());
  assert.ok(r.ok && r.changed);
  assert.deepEqual(r.doc.blocks[0].data.items.map((item) => item.id), [c.id, a.id, b.id]);
  const noop = moveListItemTo(r.doc, block.id, c.id, 0, opts());
  assert.ok(noop.ok && noop.changed === false);
  assert.equal(noop.doc, r.doc, 'same position returns the same reference');
  for (const bad of [-1, 1.5, 99, '2']) {
    const rejected = moveListItemTo(doc, block.id, b.id, bad, opts());
    assert.equal(rejected.ok, false, `index ${bad} must be rejected`);
    assert.equal(rejected.code, 'invalid-index');
  }
  const missing = moveListItemTo(doc, block.id, genId(), 0, opts());
  assert.equal(missing.ok, false);
  assert.equal(missing.code, 'missing-item');
});

await test('17. indent/outdent: subtree depth shifts; ID and content preserved; limits and depth-zero rejected', () => {
  const block = listBlock([{ text: 'A' }, { text: 'B', depth: 1 }]);
  const [a, b] = block.data.items;
  let doc = docWith([block]);
  // Indent A: its child B shifts too, so B stays A's child.
  let r = indentListItem(doc, block.id, a.id, opts());
  assert.ok(r.ok && r.changed);
  doc = r.doc;
  let items = doc.blocks[0].data.items;
  assert.deepEqual(items.map((item) => item.depth), [1, 2]);
  assert.deepEqual(items.map((item) => item.id), [a.id, b.id], 'IDs preserved');
  // Outdent A: back to the original depths.
  r = outdentListItem(doc, block.id, a.id, opts());
  assert.ok(r.ok && r.changed);
  assert.deepEqual(r.doc.blocks[0].data.items.map((item) => item.depth), [0, 1]);
  doc = r.doc; // continue against the restored depths
  // Outdenting at depth zero is rejected, never corrupting the document.
  const atZero = outdentListItem(doc, block.id, a.id, opts());
  assert.equal(atZero.ok, false);
  assert.equal(atZero.code, 'at-depth-zero');
  // Indenting beyond the documented cap is rejected (never clamped).
  const deep = listBlock([{ text: 'Deep', depth: MAX_LIST_DEPTH }]);
  const capped = indentListItem(docWith([deep]), deep.id, deep.data.items[0].id, opts());
  assert.equal(capped.ok, false);
  assert.equal(capped.code, 'depth-limit');
  const missing = indentListItem(doc, block.id, genId(), opts());
  assert.equal(missing.ok, false);
  assert.equal(missing.code, 'missing-item');
});

await test('18. checklist state: setItemChecked toggles only the addressed item; non-checklists rejected', () => {
  const block = listBlock(
    [{ text: 'A', checked: false }, { text: 'B', checked: false }],
    { listType: 'checklist' },
  );
  const [a, b] = block.data.items;
  const doc = docWith([block]);
  const r = setItemChecked(doc, block.id, a.id, true, opts());
  assert.ok(r.ok && r.changed);
  assert.equal(r.doc.blocks[0].data.items[0].checked, true);
  assert.equal(r.doc.blocks[0].data.items[1].checked, false, 'the other item is untouched');
  const noop = setItemChecked(r.doc, block.id, a.id, true, opts());
  assert.ok(noop.ok && noop.changed === false);
  assert.equal(noop.doc, r.doc);
  // Non-checklists and bad values are deterministic rejections.
  const bullet = listBlock([{ text: 'A' }]);
  const notChecklist = setItemChecked(docWith([bullet]), bullet.id, bullet.data.items[0].id, true, opts());
  assert.equal(notChecklist.ok, false);
  assert.equal(notChecklist.code, 'not-a-checklist');
  const badValue = setItemChecked(doc, block.id, a.id, 'yes', opts());
  assert.equal(badValue.ok, false);
  assert.equal(badValue.code, 'invalid-checked');
});

await test('19. dispatcher: every action kind routes to its service; unknown kinds rejected', () => {
  const block = listBlock([{ text: 'A' }, { text: 'B' }], { listType: 'checklist' });
  const [a, b] = block.data.items;
  let doc = docWith([block]);
  const steps = [
    // [action, expectOk, expectChanged]
    [{ kind: 'settings', patch: { numberStyle: 'upper-roman' } }, true, true],
    [{ kind: 'item-text', itemId: a.id, spans: [{ text: 'A2' }] }, true, true],
    [{ kind: 'item-add', afterItemId: a.id }, true, true],
    [{ kind: 'item-checked', itemId: b.id, checked: true }, true, true],
    // b is at depth 0 — a deterministic rejection, never a silent no-op:
    [{ kind: 'item-outdent', itemId: b.id }, false, false],
    [{ kind: 'item-indent', itemId: a.id }, true, true],
    [{ kind: 'item-remove', itemId: b.id }, true, true],
    [{ kind: 'item-move', itemId: a.id, direction: 'sideways' }, false, false],
  ];
  for (const [action, expectOk, expectChanged] of steps) {
    const r = applyListContentAction(doc, block.id, action, opts());
    assert.equal(r.ok, expectOk, `action ${action.kind} ok flag${r.ok ? '' : `: ${r.message}`}`);
    if (!r.ok) continue;
    assert.equal(r.changed, expectChanged, `action ${action.kind} change flag`);
    if (r.changed) doc = r.doc;
  }
  const bad = applyListContentAction(doc, block.id, { kind: 'bogus' }, opts());
  assert.equal(bad.ok, false);
  assert.equal(bad.code, 'invalid-action');
});

await test('20. unrelated blocks and the target envelope are untouched by list edits', () => {
  const headingBlock = createBlock('heading', genId);
  const list = listBlock([{ text: 'A' }]);
  const callout = calloutBlock({ variant: 'warning' });
  const doc = docWith([headingBlock, list, callout]);
  const headingBefore = snap(headingBlock);
  const calloutBefore = snap(callout);
  const envelopeBefore = { id: list.id, spacing: snap(list.spacing) };
  const r = updateListItemText(doc, list.id, list.data.items[0].id, [{ text: 'Edited' }], opts());
  assert.ok(r.ok && r.changed);
  assert.equal(snap(r.doc.blocks[0]), headingBefore, 'heading block byte-identical');
  assert.equal(snap(r.doc.blocks[2]), calloutBefore, 'callout block byte-identical');
  assert.equal(r.doc.blocks[1].id, envelopeBefore.id, 'block ID preserved');
  assert.equal(snap(r.doc.blocks[1].spacing), envelopeBefore.spacing, 'spacing preserved');
});

// ═══════════════════════════════════════════════════════════════════════════
// 21–23. Callout content (§10.3)
// ═══════════════════════════════════════════════════════════════════════════

await test('21. callout: variant set/change/custom preserved; invalid variants rejected', () => {
  let doc = docWith([calloutBlock({ variant: 'info' })]);
  const id = doc.blocks[0].id;
  let r = updateCalloutContent(doc, id, { variant: 'warning' }, opts());
  assert.ok(r.ok && r.changed);
  doc = r.doc;
  assert.equal(doc.blocks[0].data.variant, 'warning');
  // Custom variants are preserved verbatim (renderer falls back neutrally).
  r = updateCalloutContent(doc, id, { variant: 'Review-Required' }, opts());
  assert.ok(r.ok && r.changed);
  doc = r.doc;
  assert.equal(doc.blocks[0].data.variant, 'Review-Required', 'custom variant preserved exactly');
  // Invalid variants.
  for (const bad of ['', '   ', 42, 'x'.repeat(MAX_CALLOUT_VARIANT_LENGTH + 1)]) {
    const rejected = updateCalloutContent(doc, id, { variant: bad }, opts());
    assert.equal(rejected.ok, false, 'invalid variant must be rejected');
    assert.equal(rejected.code, 'invalid-variant');
  }
  const missing = updateCalloutContent(doc, genId(), { variant: 'note' }, opts());
  assert.equal(missing.ok, false);
  assert.equal(missing.code, 'missing-block');
});

await test('22. callout: title set, changed, cleared (field absent) and validated', () => {
  let doc = docWith([calloutBlock({ variant: 'note', spans: [{ text: 'Body' }] })]);
  const id = doc.blocks[0].id;
  assert.equal(doc.blocks[0].data.title, undefined, 'optional title starts absent');
  let r = updateCalloutContent(doc, id, { title: 'Caution' }, opts());
  assert.ok(r.ok && r.changed);
  doc = r.doc;
  assert.equal(doc.blocks[0].data.title, 'Caution');
  r = updateCalloutContent(doc, id, { title: '  Attention  ' }, opts());
  assert.ok(r.ok && r.changed);
  doc = r.doc;
  assert.equal(doc.blocks[0].data.title, 'Attention', 'title is stored trimmed');
  // Deliberate removal: the field is DELETED, not blanked.
  r = updateCalloutContent(doc, id, { title: null }, opts());
  assert.ok(r.ok && r.changed);
  doc = r.doc;
  assert.equal('title' in doc.blocks[0].data, false, 'cleared title removes the field');
  const blank = updateCalloutContent(doc, id, { title: '' }, opts());
  assert.ok(blank.ok && blank.changed === false, 'clearing an absent title is a no-op');
  const bad = updateCalloutContent(doc, id, { title: 42 }, opts());
  assert.equal(bad.ok, false);
  assert.equal(bad.code, 'invalid-title');
});

await test('23. callout: body edits normalise spans, preserve ID/spacing, no-ops same-ref; wrong blocks rejected', () => {
  const callout = calloutBlock({ variant: 'info', title: 'T', spans: [{ text: 'Old' }] });
  const doc = docWith([callout]);
  const envelopeBefore = snap(callout.spacing);
  const r = updateCalloutContent(
    doc,
    callout.id,
    { spans: [{ text: 'bold', bold: true }, { text: ' and unsafe', href: 'javascript:x' }] },
    opts(),
  );
  assert.ok(r.ok && r.changed);
  const data = r.doc.blocks[0].data;
  assert.equal(callout.id, r.doc.blocks[0].id, 'block ID preserved');
  assert.equal(snap(r.doc.blocks[0].spacing), envelopeBefore, 'spacing preserved');
  assert.ok(data.spans.some((span) => span.bold === true), 'inline formatting retained');
  assert.ok(data.spans.every((span) => span.href === undefined), 'unsafe href removed at the boundary');
  const noop = updateCalloutContent(r.doc, callout.id, { variant: 'info' }, opts());
  assert.ok(noop.ok && noop.changed === false);
  assert.equal(noop.doc, r.doc, 'no-op returns the same reference');
  assert.equal(noop.doc.metadata.modifiedAt, r.doc.metadata.modifiedAt, 'no-op does not stamp');
  const headingBlock = createBlock('heading', genId);
  const mixed = docWith([headingBlock]);
  const notCallout = updateCalloutContent(mixed, headingBlock.id, { variant: 'note' }, opts());
  assert.equal(notCallout.ok, false);
  assert.equal(notCallout.code, 'not-a-callout');
});

// ═══════════════════════════════════════════════════════════════════════════
// 24–26. Persistence & compatibility
// ═══════════════════════════════════════════════════════════════════════════

await test('24. persistence: list settings/items/depth/checked/markerSource survive serialize → deserialize → re-edit → serialize', () => {
  const block = listBlock(
    [
      { spans: [{ text: 'Bold item', bold: true }], checked: true },
      { text: 'Nested', depth: 1, checked: false },
    ],
    { listType: 'checklist', bulletStyle: 'square', numberStyle: 'upper-roman', markerSource: 'block' },
  );
  let doc = docWith([block]);
  // Round-trip 1: serialize → deserialize must preserve everything.
  const restored = deserializeDocument(serializeDocument(doc));
  assert.deepEqual(restored, doc, 'full document round-trip is lossless');
  const item = restored.blocks[0].data.items[0];
  assert.equal(item.checked, true);
  assert.equal(item.depth, 0);
  assert.equal(item.spans[0].bold, true);
  assert.equal(restored.blocks[0].data.markerSource, 'block');
  assert.equal(restored.blocks[0].data.numberStyle, 'upper-roman');
  // Re-edit the RESTORED document (proves loaded data is live, editable).
  const edited = updateListItemText(
    restored,
    restored.blocks[0].id,
    item.id,
    remapSpansAfterTextEdit(item.spans, 'Bold item!'),
    opts(),
  );
  assert.ok(edited.ok && edited.changed);
  const reRestored = deserializeDocument(serializeDocument(edited.doc));
  assert.deepEqual(reRestored, edited.doc, 'second round-trip is lossless');
  assert.equal(spansToPlainText(reRestored.blocks[0].data.items[0].spans), 'Bold item!');
  assert.equal(reRestored.blocks[0].data.items[0].spans[0].bold, true, 'formatting survives re-edit');
});

await test('25. persistence: callout variant/title/spans round-trip; legacy schema-v1 files (no markerSource) stay valid', () => {
  const callout = calloutBlock({
    variant: 'success',
    title: 'Verified',
    spans: [{ text: 'ok', bold: true }],
  });
  const doc = docWith([callout]);
  const restored = deserializeDocument(serializeDocument(doc));
  assert.deepEqual(restored, doc);
  assert.equal(restored.blocks[0].data.variant, 'success');
  assert.equal(restored.blocks[0].data.title, 'Verified');
  assert.equal(restored.blocks[0].data.spans[0].bold, true);
  // Legacy shape: a pre-P05-M3 list (no markerSource) validates cleanly.
  const legacy = listBlock([{ text: 'Legacy' }], {});
  assert.equal('markerSource' in legacy.data, false, 'factory output is legacy-shaped by default');
  // validateDocument(value) takes the PARSED object and THROWS on invalid.
  assert.doesNotThrow(
    () => validateDocument(JSON.parse(serializeDocument(docWith([legacy])))),
    'legacy list shape must validate',
  );
  // Custom-variant callouts are valid schema-v1 data.
  const custom = calloutBlock({ variant: 'review-required', spans: [{ text: 'x' }] });
  assert.doesNotThrow(() => validateDocument(JSON.parse(serializeDocument(docWith([custom])))));
});

await test('26. regression: P05-M1 block ops and P05-M2 paragraph/heading edits still work on the same document', () => {
  let doc = docWith([listBlock([{ text: 'Seed' }])]);
  // P05-M1: insert a callout block at the end.
  const inserted = insertBlock(doc, 'callout', { kind: 'end' }, opts());
  assert.ok(inserted.ok && inserted.changed);
  doc = inserted.doc;
  assert.equal(doc.blocks.length, 2);
  assert.equal(doc.blocks[1].data.type, 'callout');
  // P05-M2: heading + paragraph edits still behave.
  const headingBlock = createBlock('heading', genId);
  const d2 = docWith([headingBlock]);
  const h = updateHeadingContent(d2, headingBlock.id, { text: 'Renamed', numbered: true }, opts());
  assert.ok(h.ok && h.changed);
  assert.equal(h.doc.blocks[0].data.text, 'Renamed');
  const paragraphBlock = createBlock('paragraph', genId);
  const d3 = docWith([paragraphBlock]);
  const p = updateParagraphContent(d3, paragraphBlock.id, { spans: [{ text: 'Body' }], indentLevel: 2 }, opts());
  assert.ok(p.ok && p.changed);
  assert.equal(p.doc.blocks[0].data.indentLevel, 2);
});

// ═══════════════════════════════════════════════════════════════════════════
// 27–33. Renderer (§10.3/§10.4 rendering + historical evidence protection)
// ═══════════════════════════════════════════════════════════════════════════

await test('27. renderer: every numbering style prints its markers; nested counters reset correctly', async () => {
  const styles = ['decimal', 'lower-alpha', 'upper-alpha', 'lower-roman', 'upper-roman'];
  const blocks = styles.map((numberStyle) =>
    listBlock([{ text: `${numberStyle} one` }, { text: `${numberStyle} two` }], {
      listType: 'numbered',
      numberStyle,
    }),
  );
  const text = extractedText(await render(docWith(blocks)));
  for (const expected of ['1.', '2.', 'a.', 'b.', 'A.', 'B.', 'i.', 'ii.', 'I.', 'II.']) {
    assert.ok(text.includes(expected), `marker "${expected}" must appear in the output`);
  }
  // Nested numbering: counters increment per depth and reset deeper runs.
  const nested = listBlock(
    [
      { text: 'n1' },
      { text: 'n1-1', depth: 1 },
      { text: 'n2' },
      { text: 'n2-1', depth: 1 },
      { text: 'n2-2', depth: 1 },
    ],
    { listType: 'numbered' },
  );
  const nestedText = extractedText(await render(docWith([nested])));
  for (const expected of ['1.', '1.1.', '2.', '2.1.', '2.2.']) {
    assert.ok(nestedText.includes(expected), `nested marker "${expected}" must appear`);
  }
});

await test('28. renderer: marker-source policy — absent ≡ theme, explicit block style honoured (byte evidence)', async () => {
  // 'minimalist' has theme markerStyle 'dash' (body-theme-registry).
  const build = (cfg) => {
    const doc = docWith([listBlock([{ text: 'Alpha' }, { text: 'Beta' }], cfg)]);
    doc.pageTypography.bodyThemeId = 'minimalist';
    return doc;
  };
  const absent = Buffer.from(await render(build({ bulletStyle: 'disc' })));
  const explicitTheme = Buffer.from(
    await render(build({ bulletStyle: 'disc', markerSource: 'theme' })),
  );
  assert.equal(
    Buffer.compare(absent, explicitTheme),
    0,
    'absent markerSource must render byte-identically to explicit theme (legacy compatibility)',
  );
  const blockDisc = Buffer.from(
    await render(build({ bulletStyle: 'disc', markerSource: 'block' })),
  );
  assert.notEqual(
    Buffer.compare(absent, blockDisc),
    0,
    'an explicit block bullet style must change the rendered markers (the override is honoured)',
  );
  // Choosing the same style the theme already uses is coherent (identical output).
  const blockDash = Buffer.from(
    await render(build({ bulletStyle: 'dash', markerSource: 'block' })),
  );
  assert.equal(
    Buffer.compare(absent, blockDash),
    0,
    "an explicit choice equal to the theme's own marker must render identically",
  );
});

await test('29. renderer: arrow marker prints the WinAnsi chevron; checklist state is visibly different', async () => {
  const arrow = listBlock([{ text: 'Arrow one' }, { text: 'Arrow two' }], {
    bulletStyle: 'arrow',
    markerSource: 'block',
  });
  const arrowText = extractedText(await render(docWith([arrow])));
  // The chevron is stored as its WinAnsi byte (0x9B); the latin1-based
  // extraction decodes it to U+009B rather than U+203A.
  const chevrons = arrowText.match(/\u009b/g) ?? [];
  assert.equal(chevrons.length, 2, 'each arrow item prints one WinAnsi chevron marker');
  assert.ok(arrowText.includes('Arrow one'), 'arrow list item text present');
  // Checklist: checked vs unchecked renders visibly different bytes…
  const buildChecklist = (checked) =>
    docWith([
      listBlock([{ text: 'Task one', checked }, { text: 'Task two', checked: !checked }], {
        listType: 'checklist',
      }),
    ]);
  const checkedBytes = Buffer.from(await render(buildChecklist(true)));
  const uncheckedBytes = Buffer.from(await render(buildChecklist(false)));
  assert.notEqual(
    Buffer.compare(checkedBytes, uncheckedBytes),
    0,
    'checked and unchecked checklists must render differently',
  );
  // …and both item texts survive in each rendering.
  for (const bytes of [checkedBytes, uncheckedBytes]) {
    const text = extractedText(bytes);
    assert.ok(text.includes('Task one') && text.includes('Task two'), 'checklist text never dropped');
  }
});

await test('30. renderer: callout variants, custom fallback, title and body all appear in output', async () => {
  const blocks = [
    calloutBlock({ variant: 'info', title: 'Scope note', spans: [{ text: 'Information body text.' }] }),
    calloutBlock({ variant: 'warning', spans: [{ text: 'Warning body text.' }] }),
    calloutBlock({ variant: 'success', spans: [{ text: 'Success body text.' }] }),
    calloutBlock({ variant: 'note', title: 'Aside', spans: [{ text: 'Note body text.' }] }),
    calloutBlock({ variant: 'danger', spans: [{ text: 'Danger body text.' }] }),
    calloutBlock({ variant: 'review-required', spans: [{ text: 'Custom body text.' }] }),
  ];
  const text = extractedText(await render(docWith(blocks)));
  for (const expected of [
    'INFORMATION',
    'WARNING',
    'SUCCESS',
    'NOTE',
    'DANGER',
    'REVIEW-REQUIRED', // unknown variant: its own name is the label (safe fallback)
    'Scope note',
    'Aside',
    'Information body text.',
    'Warning body text.',
    'Success body text.',
    'Note body text.',
    'Danger body text.',
    'Custom body text.',
  ]) {
    assert.ok(text.includes(expected), `callout output must contain "${expected}"`);
  }
});

await test('31. renderer: callout accents are grayscale in monochrome documents (meaning never colour-only)', async () => {
  const blocks = [
    calloutBlock({ variant: 'warning', spans: [{ text: 'Mono warning body.' }] }),
    calloutBlock({ variant: 'danger', title: 'Mono title', spans: [{ text: 'Mono danger body.' }] }),
  ];
  const mono = docWith(blocks);
  mono.pageTypography.monochrome = true;
  // The cover/front page has its OWN independent monochrome flag (P04-M4
  // policy) — this test targets body/callout rendering, so it stays off.
  mono.frontPage.enabled = false;
  const monoBytes = Buffer.from(await render(mono));
  const monoColors = scnColors(monoBytes);
  assert.ok(monoColors.length > 0, 'themed colour operators must be present');
  for (const [r, g, b] of monoColors) {
    assert.ok(
      Math.abs(r - g) < 1e-6 && Math.abs(g - b) < 1e-6,
      `monochrome scn must be gray, got ${r}/${g}/${b}`,
    );
  }
  const monoText = extractedText(monoBytes);
  assert.ok(monoText.includes('WARNING') && monoText.includes('Mono title'), 'meaning lives in the label, still present in monochrome');
  // Colour mode keeps a non-gray accent (the semantic accent is real
  // colour) — with the cover off, that colour can only come from the body.
  const colorDoc = docWith(blocks);
  colorDoc.frontPage.enabled = false;
  const colorBytes = Buffer.from(await render(colorDoc));
  assert.ok(
    scnColors(colorBytes).some(([r, g, b]) => Math.abs(r - b) > 0.05),
    'colour documents must carry a non-gray semantic accent',
  );
});

await test('32. renderer: list and callout text is never silently dropped (incl. empty callout bodies)', async () => {
  const long = listBlock(
    Array.from({ length: 8 }, (_, i) => ({
      text: `Wrapped list item ${i + 1} with a deliberately long line of text that must wrap across the available width without losing its marker alignment`,
      depth: i % 3,
    })),
    { listType: 'numbered', numberStyle: 'lower-alpha' },
  );
  const emptyCallout = calloutBlock({ variant: 'note', title: 'Empty body label', spans: [] });
  const text = extractedText(await render(docWith([long, emptyCallout])));
  for (let i = 1; i <= 8; i += 1) {
    assert.ok(text.includes(`Wrapped list item ${i}`), `list item ${i} text must extract`);
  }
  assert.ok(text.includes('NOTE'), 'empty-body callout still renders its label');
  assert.ok(text.includes('Empty body label'), 'empty-body callout still renders its title');
});

await test('33. renderer: P02-M4 PoC fixture remains BYTE-IDENTICAL (historical baseline protected)', async () => {
  const baseline = readFileSync(path.join(root, 'fixtures', 'p02-m4', 'renderer-poc-output.pdf'));
  const bytes = Buffer.from(await render(buildPocFixture()));
  assert.equal(Buffer.compare(bytes, baseline), 0, 'PoC fixture render must match the committed baseline byte-for-byte');
});

// ── Summary ─────────────────────────────────────────────────────────────────
console.log(`\n${passed} passed, ${failed.length} failed`);
if (failed.length > 0) process.exitCode = 1;
