/**
 * P06-M4 Verification Suite — Image & Signature Blocks
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Proves, against the REAL compiled modules (no mocks, no reimplementation):
 *  1. module surface — every P06-M4 export reachable from the node entry;
 *  2. the image content service — attach (atomic asset embed), clear,
 *     caption set/clear, caption placement, crop validation (boundaries,
 *     min extent, asset-required), width-fraction bounds, alignment,
 *     the single↔side-by-side slot invariant, every rejection code,
 *     no-op identity, `modifiedAt` stamping, source immutability;
 *  3. the signature content service — 1–3 signer limits, the seeded
 *     name-or-designation contract, field edits (role/name/designation/
 *     department/date), YYYY-MM-DD validation, alignment, rejections,
 *     no-ops and immutability;
 *  4. the shared importer + header decoder — real PNG bytes through
 *     `importImageAsset`, a synthetic JPEG SOF0 header, and honest
 *     rejection of GIF/empty input;
 *  5. the pure layout planners — side-by-side proportional fit, the crop
 *     box math (undistorted), signer-row sizing/shrink and the row X
 *     offsets for left/centre/right;
 *  6. the editor components — real markup via react-dom/server (layout
 *     select, per-slot cards, crop fields, signer cards, add-signer cap)
 *     plus the App → Workspace → EditorPanel wiring;
 *  7. persistence — serialize→deserialize round-trip of image (crop,
 *     caption, placement, size, alignment, two slots) and signature
 *     (three signers, all fields) blocks with stable ids, schema 1;
 *  8. PDF output (REAL `PocDocument` + pdfjs operator-list geometry) —
 *     image paint x/width for left/centre/right, caption above/below the
 *     image, the crop clip + scaled inner image, side-by-side slot
 *     geometry against the planner, one/two/three-signer rendering with
 *     the signing lines, role/name vertical order, overall alignment
 *     movement, the honest non-signature disclaimer, the unreadable-
 *     header crop failure, and byte-determinism;
 *  9. regression — the committed P02-M4 baseline is still byte-identical
 *     to a fresh render of the same fixture (read-only comparison), no
 *     fallback markers, no committed artifacts written, schema 1.
 *
 * HONEST SCOPE NOTES (also recorded in project_roadmap.md)
 * ───────────────────────────────────────────────────────
 * • Baselines are PROTECTED: this suite renders in memory only and writes
 *   nothing to `fixtures/`.  The one committed PDF it touches is READ for
 *   a byte-comparison (regression group 9) and never regenerated.
 * • Native Tauri file dialogs are NOT RUN here (not drivable from Node);
 *   the pick path is proven at the service layer (import → atomic
 *   attach) and statically for the panel wiring.
 * • The editor's EVENT behaviour (blur/commit) cannot fire under
 *   react-dom/server; dispatch is proven through the service tests
 *   (groups 2–3) and the components' real markup is asserted in group 6.
 * • The crop editor is numeric (percent fields + reset), not a drag
 *   canvas — recorded as the interaction form for owner review.
 *
 * Usage: node verify_p06_m4.mjs   (or: npm run verify:p06-m4)
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
const CACHE = path.join(root, 'node_modules', '.cache', 'ds-p06-m4-verify');

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
// to the REAL installed packages — same pattern as verify_p06_m1/m2/m3.
group('compile');
const COMPILE_ROOTS = [
  'src/renderer/poc/poc-node-entry.ts',
  'src/services/block-registry.ts',
  // The P06-M4 editors are rendered with react-dom/server below so the
  // controls, caps and states are asserted from real component output.
  'src/components/editor-panel/ImageSignatureContentEditor.tsx',
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
const editorModule = pick(
  path.join(CACHE, 'components', 'editor-panel', 'ImageSignatureContentEditor.js'),
  path.join(CACHE, 'src', 'components', 'editor-panel', 'ImageSignatureContentEditor.js'),
);

const {
  renderDocPdfBytes,
  buildPocFixture,
  POC_IMAGE_ASSET_ID,
  POC_CREATED_AT,
  computePocLayout,
  importImageAsset,
  bytesToBase64,
  createBlock,
  // P06-M4 surface
  IMAGE_ALIGNMENTS,
  IMAGE_LAYOUTS,
  CAPTION_PLACEMENTS,
  IMAGE_WIDTH_FRACTION_MIN,
  IMAGE_WIDTH_FRACTION_MAX,
  MAX_IMAGE_CAPTION_LENGTH,
  MAX_IMAGE_SLOTS,
  IMAGE_CROP_MIN_FRACTION,
  MIN_SIGNERS,
  MAX_SIGNERS,
  MAX_SIGNER_FIELD_LENGTH,
  SIGNER_SEED_DESIGNATION,
  applyImageSignatureAction,
  decodeImageDimensions,
  assetPixelSize,
  base64ToBytes,
  planImageSlotWidthsPt,
  planImageCropBoxPt,
  planSignatureLayout,
  signatureRowStartXPt,
  IMAGE_SLOT_GAP_PT,
  SIGNATURE_SLOT_GAP_PT,
  SIGNATURE_SLOT_MAX_WIDTH_PT,
} = pocNode;
const { BLOCK_REGISTRY, summarizeBlockData } = registry;
const { createDefaultDocument, newUUID } = defaults;
const { serializeDocument, deserializeDocument } = documentFile;
const { ImageContentEditor, SignatureContentEditor } = editorModule;
const { renderToStaticMarkup } = require('react-dom/server');
const React = require('react');

// ── Fixtures and service helpers ────────────────────────────────────────────
const T0 = POC_CREATED_AT;
const STAMP = '2026-10-21T14:00:00.000Z';
let idSeq = 0;
const genId = () => `06400000-0000-4000-8000-${String(++idSeq).padStart(12, '0')}`;
/**
 * Suite documents start with the cover page DISABLED so that page-count
 * assertions describe BODY pagination only (same policy as verify_p06_m2/m3).
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
/** Append a registry-default block of `type` (real factory). */
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
/** Dispatch one action through the real P06-M4 dispatcher. */
const act = (doc, blockId, action, now = STAMP) =>
  applyImageSignatureAction(doc, blockId, action, { now, genId });

// The REAL committed fixture PNG (read-only) — the importer and the crop
// decoder run against genuine image bytes, not hand-made magic numbers.
const POC_ASSET = buildPocFixture().assets[POC_IMAGE_ASSET_ID];
assert.ok(POC_ASSET && POC_ASSET.base64Data, 'the P02 fixture must carry its PNG asset');
const POC_PNG_BYTES = base64ToBytes(POC_ASSET.base64Data);
const PNG_SIZE = decodeImageDimensions(POC_PNG_BYTES);
assert.ok(PNG_SIZE !== null, 'the fixture PNG header must decode');

// A fixture image document with a real attached asset.
function imageDoc(id, { caption, align = 'center', fraction = 0.5 } = {}) {
  let doc = insertBlock(newDoc(id), 'image').doc;
  const block = only(doc, 'image');
  const slotId = block.data.images[0].id;
  const asset = { ...POC_ASSET, id: genId() };
  doc = applied(
    act(doc, block.id, { action: 'attach-slot-asset', imageId: slotId, asset }),
    `${id}: asset attached`,
  );
  if (fraction !== 1) {
    // 1.0 is the registry default — committing it would be a no-op.
    doc = applied(
      act(doc, block.id, { action: 'set-slot-width-fraction', imageId: slotId, widthFraction: fraction }),
      `${id}: size committed`,
    );
  }
  if (align !== 'center') {
    // 'center' is the registry default — committing it would be a no-op.
    doc = applied(
      act(doc, block.id, { action: 'set-slot-align', imageId: slotId, hAlign: align }),
      `${id}: align committed`,
    );
  }
  if (caption) {
    doc = applied(
      act(doc, block.id, { action: 'set-slot-caption', imageId: slotId, caption }),
      `${id}: caption committed`,
    );
  }
  return doc;
}
/** A signature document with `count` signers, all fields populated. */
function signatureDoc(id, count, { hAlign = 'left' } = {}) {
  let doc = insertBlock(newDoc(id), 'signature').doc;
  const block = only(doc, 'signature');
  if (hAlign !== 'left') {
    // 'left' is the schema default — committing it would be a no-op.
    doc = applied(
      act(doc, block.id, { action: 'set-signature-align', hAlign }),
      `${id}: align committed`,
    );
  }
  for (let i = 1; i < count; i += 1) {
    doc = applied(act(doc, block.id, { action: 'add-signer' }), `${id}: signer ${i + 1} added`);
  }
  const signers = only(doc, 'signature').data.signers;
  const roles = ['Prepared by', 'Reviewed by', 'Approved by'];
  const names = ['A. Analyst', 'B. Reviewer', 'C. Approver'];
  const designations = ['Lab Analyst', 'Technical Reviewer', 'Lab Director'];
  const departments = ['Chemistry', 'Quality Assurance', ''];
  const dates = ['2026-10-01', '2026-10-05', ''];
  for (let i = 0; i < signers.length; i += 1) {
    const id2 = signers[i].id;
    for (const [field, value] of [
      ['role', roles[i]],
      ['name', names[i]],
      ['designation', designations[i]],
      ['department', departments[i]],
      ['date', dates[i]],
    ]) {
      const current = only(doc, 'signature').data.signers[i];
      if (value !== '' && value !== (current[field] ?? '')) {
        // Skip values that already match (e.g. the starter 'Prepared by'
        // role) — committing them would be a no-op, not a change.
        doc = applied(
          act(doc, block.id, { action: 'set-signer-field', signerId: id2, field, value }),
          `${id}: signer ${i + 1} ${field} committed`,
        );
      }
    }
  }
  return doc;
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
    const arr = m[0].match(/\/Contents\s*\[([^\]]+)\]/);
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
/**
 * Operator-list walk with a save/restore CTM stack: records every IMAGE
 * paint (`paintImageXObject`/`paintInlineImageX` — origin, size, clip flag)
 * and every vector `constructPath` origin (the signature lines are 1-pt
 * filled rects).  pdfjs user space is y-UP.
 */
async function opTracks(pdf, pageNo = 1) {
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
  const clipScopeStack = [];
  let clipsInScope = 0;
  let clipCount = 0;
  const images = [];
  const paths = [];
  for (let i = 0; i < ops.fnArray.length; i += 1) {
    const fn = ops.fnArray[i];
    const args = ops.argsArray[i];
    if (fn === pdfjs.OPS.save) {
      stack.push(ctm.slice());
      clipScopeStack.push(clipsInScope);
      clipsInScope = 0;
    } else if (fn === pdfjs.OPS.restore) {
      ctm = stack.pop() || ctm;
      clipsInScope = clipScopeStack.pop() ?? 0;
    } else if (fn === pdfjs.OPS.transform) {
      ctm = mul(ctm, args);
    } else if (fn === pdfjs.OPS.clip || fn === pdfjs.OPS.eoClip) {
      // Page/wrapper/image clips all exist; the DISCRIMINATOR for the crop
      // is the TOTAL clip count delta (probe evidence: a plain image paints
      // under 1 clip, a cropped one under 2 — react-pdf emits extra `save`s
      // after the clip, so innermost-scope counting cannot discriminate).
      clipsInScope += 1;
      clipCount += 1;
    } else if (fn === pdfjs.OPS.paintImageXObject || fn === pdfjs.OPS.paintInlineImageX) {
      images.push({ x: ctm[4], y: ctm[5], w: ctm[0], h: ctm[3], clipDepth: clipsInScope });
    } else if (fn === pdfjs.OPS.constructPath) {
      // pdfjs supplies the path's local bbox as args[2] (minMax).
      // react-pdf draws in a Y-DOWN local space under a flipped CTM, so
      // ctm[5] alone is NOT the rect's user-space y — transform the bbox.
      const mm = args[2];
      let bbox = null;
      if (mm && mm.length === 4) {
        const pts = [
          [mm[0], mm[1]],
          [mm[2], mm[1]],
          [mm[0], mm[3]],
          [mm[2], mm[3]],
        ].map(([lx, ly]) => [
          ctm[0] * lx + ctm[2] * ly + ctm[4],
          ctm[1] * lx + ctm[3] * ly + ctm[5],
        ]);
        bbox = {
          minX: Math.min(...pts.map((p) => p[0])),
          minY: Math.min(...pts.map((p) => p[1])),
          maxX: Math.max(...pts.map((p) => p[0])),
          maxY: Math.max(...pts.map((p) => p[1])),
        };
      }
      paths.push({ x: ctm[4], y: ctm[5], bbox });
    }
  }
  return { images, paths, clipCount };
}
const approx = (actual, expected, tol, label) =>
  assert.ok(
    Math.abs(actual - expected) <= tol,
    `${label}: expected ≈${expected.toFixed(2)}, got ${actual.toFixed(2)} (tol ${tol})`,
  );
/** TRUE when the expected scalar sits within `tol` of any observed value. */
const approxIn = (expected, observed, tol, label) =>
  assert.ok(
    observed.some((v) => Math.abs(v - expected) <= tol),
    `${label}: expected ≈${Number(expected).toFixed(2)}, observed [${observed
      .map((v) => Number(v).toFixed(2))
      .join(', ')}] (tol ${tol})`,
  );

// ═══════════════════════════════════════════════════════════════════════════
group('1 · module surface');
// ═══════════════════════════════════════════════════════════════════════════

await test('1.1 every P06-M4 export is reachable from the node entry', () => {
  const surface = [
    'IMAGE_ALIGNMENTS', 'IMAGE_LAYOUTS', 'CAPTION_PLACEMENTS',
    'IMAGE_WIDTH_FRACTION_MIN', 'IMAGE_WIDTH_FRACTION_MAX',
    'MAX_IMAGE_CAPTION_LENGTH', 'MAX_IMAGE_SLOTS', 'IMAGE_CROP_MIN_FRACTION',
    'MIN_SIGNERS', 'MAX_SIGNERS', 'MAX_SIGNER_FIELD_LENGTH', 'SIGNER_SEED_DESIGNATION',
    'applyImageSignatureAction', 'decodeImageDimensions', 'assetPixelSize', 'base64ToBytes',
    'planImageSlotWidthsPt', 'planImageCropBoxPt', 'planSignatureLayout',
    'signatureRowStartXPt', 'IMAGE_SLOT_GAP_PT', 'SIGNATURE_SLOT_GAP_PT',
    'SIGNATURE_SLOT_MAX_WIDTH_PT', 'importImageAsset', 'bytesToBase64',
  ];
  for (const name of surface) {
    assert.notEqual(pocNode[name], undefined, `${name} must be exported`);
  }
  assert.deepEqual(IMAGE_ALIGNMENTS, ['left', 'center', 'right'], 'alignment choices');
  assert.deepEqual(IMAGE_LAYOUTS, ['single', 'side-by-side'], 'layout choices');
  assert.deepEqual(CAPTION_PLACEMENTS, ['top', 'bottom'], 'caption placements');
  assert.equal(MAX_IMAGE_SLOTS, 2, 'one or two images (§10.7)');
  assert.equal(MAX_SIGNERS, 3, 'one to three signers (§10.8)');
  assert.equal(MIN_SIGNERS, 1, 'at least one signer');
  assert.equal(IMAGE_WIDTH_FRACTION_MIN, 0.1, 'schema width floor');
  assert.equal(IMAGE_WIDTH_FRACTION_MAX, 1, 'schema width ceiling');
});

await test('1.2 the registry image and signature entries match the schema contracts', () => {
  const image = createBlock('image', genId);
  assert.equal(image.data.type, 'image');
  assert.equal(image.data.layout, 'single', 'one image by default');
  assert.equal(image.data.images.length, MAX_IMAGE_SLOTS - 1, 'one slot by default');
  assert.equal(image.data.images[0].assetId, null, 'the default slot is empty');
  const signature = createBlock('signature', genId);
  assert.equal(signature.data.type, 'signature');
  assert.equal(signature.data.signers.length, 1, 'one signer by default');
  assert.ok(signature.data.signers[0].designation, 'the starter signer identifies a field');
  assert.ok(
    summarizeBlockData(image.data).length > 0 && summarizeBlockData(signature.data).length > 0,
    'both entries summarize',
  );
  assert.ok(BLOCK_REGISTRY.image && BLOCK_REGISTRY.signature, 'both entries registered');
});

// ═══════════════════════════════════════════════════════════════════════════
group('2 · image content service (§10.7)');
// ═══════════════════════════════════════════════════════════════════════════

await test('2.1 attach embeds the asset and points the slot at it atomically', () => {
  let doc = insertBlock(newDoc('attach'), 'image').doc;
  const block = only(doc, 'image');
  const slotId = block.data.images[0].id;
  const asset = { ...POC_ASSET, id: genId() };
  const res = act(doc, block.id, { action: 'attach-slot-asset', imageId: slotId, asset });
  const next = applied(res, 'attach');
  assert.ok(next.assets[asset.id], 'the asset is embedded in doc.assets');
  assert.equal(only(next, 'image').data.images[0].assetId, asset.id, 'the slot references it');
  assert.equal(next.metadata.modifiedAt, STAMP, 'metadata.modifiedAt stamped');
  // Source untouched.
  assert.equal(
    only(doc, 'image').data.images[0].assetId,
    null,
    'the source document is immutable',
  );
});

await test('2.2 a new attach drops the previous crop; clear detaches and drops crop', () => {
  let doc = imageDoc('crop-drop', { fraction: 1 });
  const blockId = only(doc, 'image').id;
  const slotId = only(doc, 'image').data.images[0].id;
  doc = applied(
    act(doc, blockId, {
      action: 'set-slot-crop',
      imageId: slotId,
      crop: { x: 0.1, y: 0.1, width: 0.5, height: 0.5 },
    }),
    'crop set',
  );
  assert.ok(only(doc, 'image').data.images[0].crop, 'the crop is stored');
  const asset2 = { ...POC_ASSET, id: genId() };
  doc = applied(
    act(doc, blockId, { action: 'attach-slot-asset', imageId: slotId, asset: asset2 }),
    'second attach',
  );
  assert.equal(only(doc, 'image').data.images[0].crop, undefined, 'the stale crop is dropped');
  doc = applied(act(doc, blockId, { action: 'clear-slot-asset', imageId: slotId }), 'clear');
  const slot = only(doc, 'image').data.images[0];
  assert.equal(slot.assetId, null, 'the reference is cleared');
  assert.equal(slot.crop, undefined, 'no crop survives without an image');
  assert.ok(
    Object.values(doc.assets).some((a) => a.id === POC_ASSET.id || a.id === asset2.id),
    'the asset RECORDS themselves are never garbage-collected (shared assets)',
  );
});

await test('2.3 attach rejects invalid assets, unknown slots and wrong blocks', () => {
  const doc = insertBlock(newDoc('attach-bad'), 'image').doc;
  const block = only(doc, 'image');
  const slotId = block.data.images[0].id;
  rejected(
    act(doc, block.id, {
      action: 'attach-slot-asset',
      imageId: slotId,
      asset: { ...POC_ASSET, id: genId(), mimeType: 'application/pdf' },
    }),
    'asset-not-an-image',
    'non-image MIME rejected',
  );
  rejected(
    act(doc, block.id, { action: 'attach-slot-asset', imageId: slotId, asset: null }),
    'asset-not-an-image',
    'null asset rejected',
  );
  rejected(
    act(doc, block.id, {
      action: 'attach-slot-asset',
      imageId: genId(),
      asset: { ...POC_ASSET, id: genId() },
    }),
    'unknown-image',
    'unknown slot rejected',
  );
  rejected(
    act(doc, genId(), { action: 'attach-slot-asset', imageId: slotId, asset: POC_ASSET }),
    'missing-block',
    'missing block rejected',
  );
});

await test('2.4 caption set/trim/clear, limits and placement semantics', () => {
  let doc = insertBlock(newDoc('caption'), 'image').doc;
  const block = only(doc, 'image');
  const slotId = block.data.images[0].id;
  doc = applied(
    act(doc, block.id, { action: 'set-slot-caption', imageId: slotId, caption: '  Curve A  ' }),
    'caption set',
  );
  assert.equal(only(doc, 'image').data.images[0].caption, 'Curve A', 'trimmed on commit');
  noOp(
    act(doc, block.id, { action: 'set-slot-caption', imageId: slotId, caption: 'Curve A' }),
    doc,
    'same caption',
  );
  rejected(
    act(doc, block.id, {
      action: 'set-slot-caption',
      imageId: slotId,
      caption: 'x'.repeat(MAX_IMAGE_CAPTION_LENGTH + 1),
    }),
    'caption-too-long',
    'over-long caption rejected',
  );
  doc = applied(
    act(doc, block.id, { action: 'set-slot-caption', imageId: slotId, caption: '' }),
    'caption cleared',
  );
  assert.equal(
    'caption' in only(doc, 'image').data.images[0],
    false,
    'clearing deletes the optional key',
  );
  doc = applied(
    act(doc, block.id, {
      action: 'set-slot-caption-placement',
      imageId: slotId,
      placement: 'top',
    }),
    'placement top',
  );
  assert.equal(only(doc, 'image').data.images[0].captionPlacement, 'top', 'top is stored');
  doc = applied(
    act(doc, block.id, {
      action: 'set-slot-caption-placement',
      imageId: slotId,
      placement: 'bottom',
    }),
    'placement bottom',
  );
  assert.equal(
    only(doc, 'image').data.images[0].captionPlacement,
    undefined,
    'bottom is the renderer default (absent)',
  );
  rejected(
    act(doc, block.id, {
      action: 'set-slot-caption-placement',
      imageId: slotId,
      placement: 'left',
    }),
    'invalid-caption-placement',
    'bad placement rejected',
  );
});

await test('2.5 crop validation: bounds, min extent, asset requirement, clear', () => {
  const bare = insertBlock(newDoc('crop-bare'), 'image').doc;
  const bareBlock = only(bare, 'image');
  const bareSlot = bareBlock.data.images[0].id;
  rejected(
    act(bare, bareBlock.id, {
      action: 'set-slot-crop',
      imageId: bareSlot,
      crop: { x: 0, y: 0, width: 0.5, height: 0.5 },
    }),
    'invalid-crop',
    'a crop without an attached asset is rejected',
  );

  let doc = imageDoc('crop');
  const block = only(doc, 'image');
  const slotId = block.data.images[0].id;
  const crop = { x: 0.25, y: 0.1, width: 0.5, height: 0.8 };
  doc = applied(act(doc, block.id, { action: 'set-slot-crop', imageId: slotId, crop }), 'crop set');
  assert.deepEqual(only(doc, 'image').data.images[0].crop, crop, 'stored verbatim');
  noOp(act(doc, block.id, { action: 'set-slot-crop', imageId: slotId, crop }), doc, 'same rect');
  rejected(
    act(doc, block.id, {
      action: 'set-slot-crop',
      imageId: slotId,
      crop: { x: 0.6, y: 0, width: 0.5, height: 1 },
    }),
    'invalid-crop',
    'x + width > 1 rejected',
  );
  rejected(
    act(doc, block.id, {
      action: 'set-slot-crop',
      imageId: slotId,
      crop: { x: -0.1, y: 0, width: 0.5, height: 1 },
    }),
    'invalid-crop',
    'negative origin rejected',
  );
  rejected(
    act(doc, block.id, {
      action: 'set-slot-crop',
      imageId: slotId,
      crop: { x: 0, y: 0, width: IMAGE_CROP_MIN_FRACTION - 0.01, height: 0.5 },
    }),
    'invalid-crop',
    'sub-minimum extent rejected',
  );
  rejected(
    act(doc, block.id, {
      action: 'set-slot-crop',
      imageId: slotId,
      crop: { x: 0, y: 0, width: Number.NaN, height: 0.5 },
    }),
    'invalid-crop',
    'NaN rejected',
  );
  doc = applied(act(doc, block.id, { action: 'set-slot-crop', imageId: slotId, crop: null }), 'crop cleared');
  assert.equal(only(doc, 'image').data.images[0].crop, undefined, 'null clears');
  noOp(act(doc, block.id, { action: 'set-slot-crop', imageId: slotId, crop: null }), doc, 'clear again');
});

await test('2.6 width-fraction bounds, alignment and layout slot invariant', () => {
  let doc = imageDoc('size', { fraction: 0.5 });
  const block = only(doc, 'image');
  const slotId = block.data.images[0].id;
  rejected(
    act(doc, block.id, { action: 'set-slot-width-fraction', imageId: slotId, widthFraction: 0.05 }),
    'invalid-width-fraction',
    'below the schema floor rejected',
  );
  rejected(
    act(doc, block.id, { action: 'set-slot-width-fraction', imageId: slotId, widthFraction: 1.01 }),
    'invalid-width-fraction',
    'above the schema ceiling rejected',
  );
  rejected(
    act(doc, block.id, {
      action: 'set-slot-width-fraction',
      imageId: slotId,
      widthFraction: Number.NaN,
    }),
    'invalid-width-fraction',
    'NaN rejected',
  );
  doc = applied(
    act(doc, block.id, { action: 'set-slot-width-fraction', imageId: slotId, widthFraction: 0.35 }),
    'size 35%',
  );
  assert.equal(only(doc, 'image').data.images[0].widthFraction, 0.35, 'stored');
  doc = applied(act(doc, block.id, { action: 'set-slot-align', imageId: slotId, hAlign: 'right' }), 'align right');
  assert.equal(only(doc, 'image').data.images[0].hAlign, 'right', 'stored');
  rejected(
    act(doc, block.id, { action: 'set-slot-align', imageId: slotId, hAlign: 'middle' }),
    'invalid-halign',
    'bogus alignment rejected',
  );

  doc = applied(act(doc, block.id, { action: 'set-image-layout', layout: 'side-by-side' }), 'row layout');
  const row = only(doc, 'image');
  assert.equal(row.data.layout, 'side-by-side', 'layout stored');
  assert.equal(row.data.images.length, MAX_IMAGE_SLOTS, 'an empty second slot was appended');
  assert.equal(row.data.images[1].assetId, null, 'the appended slot is empty');
  assert.equal(row.data.images[0].assetId !== null, true, 'the first slot kept its asset');
  noOp(act(doc, block.id, { action: 'set-image-layout', layout: 'side-by-side' }), doc, 'same layout');
  doc = applied(act(doc, block.id, { action: 'set-image-layout', layout: 'single' }), 'back to single');
  assert.equal(only(doc, 'image').data.images.length, 1, 'only the first slot remains');
  rejected(
    act(doc, block.id, { action: 'set-image-layout', layout: 'triple' }),
    'invalid-layout',
    'bogus layout rejected',
  );
});

await test('2.7 wrong-type and invalid-action dispatcher guards; source immutability', () => {
  const doc = insertBlock(newDoc('guards'), 'heading').doc;
  const heading = only(doc, 'heading');
  rejected(
    act(doc, heading.id, { action: 'set-slot-caption', imageId: genId(), caption: 'x' }),
    'wrong-block-type',
    'a heading is not an image',
  );
  rejected(
    act(doc, heading.id, { action: 'add-signer' }),
    'wrong-block-type',
    'a heading is not a signature block',
  );
  const img = imageDoc('immutable');
  const before = JSON.stringify(img);
  act(img, only(img, 'image').id, {
    action: 'set-slot-caption',
    imageId: only(img, 'image').data.images[0].id,
    caption: 'never committed',
  });
  act(img, only(img, 'image').id, { action: 'set-image-layout', layout: 'side-by-side' });
  assert.equal(JSON.stringify(img), before, 'every rejected/no-op path leaves the source byte-identical');
  rejected(
    act(img, only(img, 'image').id, { action: 'nonsense' }),
    'invalid-action',
    'unknown action rejected',
  );
});

// ═══════════════════════════════════════════════════════════════════════════
group('3 · signature content service (§10.8)');
// ═══════════════════════════════════════════════════════════════════════════

await test('3.1 signer count controls: add seeds the placeholder, caps at 3, floor at 1', () => {
  let doc = insertBlock(newDoc('signers'), 'signature').doc;
  const block = only(doc, 'signature');
  assert.equal(block.data.signers.length, 1, 'one starter signer');
  assert.equal(block.data.hAlign, 'left', 'schema default alignment');
  doc = applied(act(doc, block.id, { action: 'add-signer' }), 'second signer');
  const two = only(doc, 'signature').data.signers;
  assert.equal(two.length, 2, 'two signers');
  assert.equal(two[1].designation, SIGNER_SEED_DESIGNATION, 'the seed keeps the identifier contract');
  assert.equal(two[1].role, '', 'the new role label starts empty');
  doc = applied(act(doc, block.id, { action: 'add-signer' }), 'third signer');
  assert.equal(only(doc, 'signature').data.signers.length, 3, 'three signers');
  rejected(act(doc, block.id, { action: 'add-signer' }), 'signer-limit', 'a fourth is refused');
  const secondId = only(doc, 'signature').data.signers[1].id;
  doc = applied(act(doc, block.id, { action: 'remove-signer', signerId: secondId }), 'remove #2');
  assert.equal(only(doc, 'signature').data.signers.length, 2, 'removed');
  rejected(
    act(doc, block.id, { action: 'remove-signer', signerId: genId() }),
    'unknown-signer',
    'unknown signer rejected',
  );
  const lastId = only(doc, 'signature').data.signers[1].id;
  doc = applied(act(doc, block.id, { action: 'remove-signer', signerId: lastId }), 'remove #3');
  rejected(act(doc, block.id, { action: 'remove-signer', signerId: only(doc, 'signature').data.signers[0].id }), 'signers-minimum', 'the last signer is protected');
});

await test('3.2 the name-or-designation contract and field edits', () => {
  let doc = insertBlock(newDoc('fields'), 'signature').doc;
  const block = only(doc, 'signature');
  const signerId = block.data.signers[0].id;
  doc = applied(
    act(doc, block.id, { action: 'set-signer-field', signerId, field: 'role', value: 'Authorised by' }),
    'role set',
  );
  doc = applied(
    act(doc, block.id, { action: 'set-signer-field', signerId, field: 'name', value: 'D. Writer' }),
    'name set',
  );
  doc = applied(
    act(doc, block.id, {
      action: 'set-signer-field',
      signerId,
      field: 'designation',
      value: 'Document Author',
    }),
    'designation set',
  );
  // Clearing the designation still leaves the name → allowed.
  doc = applied(
    act(doc, block.id, { action: 'set-signer-field', signerId, field: 'designation', value: '' }),
    'designation cleared',
  );
  const signer = only(doc, 'signature').data.signers[0];
  assert.equal(signer.designation, undefined, 'cleared designation deletes the key');
  // Clearing the NAME too would leave no identifier → refused.
  rejected(
    act(doc, block.id, { action: 'set-signer-field', signerId, field: 'name', value: '   ' }),
    'identifier-required',
    'both identifiers empty is refused',
  );
  doc = applied(
    act(doc, block.id, { action: 'set-signer-field', signerId, field: 'department', value: 'QA' }),
    'department set',
  );
  doc = applied(
    act(doc, block.id, { action: 'set-signer-field', signerId, field: 'date', value: '2026-10-21' }),
    'date set',
  );
  assert.equal(only(doc, 'signature').data.signers[0].date, '2026-10-21', 'date stored');
  rejected(
    act(doc, block.id, { action: 'set-signer-field', signerId, field: 'date', value: '21/10/2026' }),
    'invalid-date',
    'non-ISO date rejected',
  );
  rejected(
    act(doc, block.id, { action: 'set-signer-field', signerId, field: 'date', value: '2026-13-45' }),
    'invalid-date',
    'impossible date rejected',
  );
  rejected(
    act(doc, block.id, {
      action: 'set-signer-field',
      signerId,
      field: 'role',
      value: 'x'.repeat(MAX_SIGNER_FIELD_LENGTH + 1),
    }),
    'field-too-long',
    'over-long role rejected',
  );
  rejected(
    act(doc, block.id, { action: 'set-signer-field', signerId: genId(), field: 'role', value: 'x' }),
    'unknown-signer',
    'unknown signer rejected',
  );
  const dateCleared = applied(
    act(doc, block.id, { action: 'set-signer-field', signerId, field: 'date', value: '' }),
    'date cleared',
  );
  assert.equal(
    only(dateCleared, 'signature').data.signers[0].date,
    undefined,
    'a cleared date deletes the key',
  );
  noOp(
    act(dateCleared, block.id, { action: 'set-signer-field', signerId, field: 'date', value: '' }),
    dateCleared,
    'clearing an already-empty date',
  );
});

await test('3.3 overall alignment, immutability and stamping', () => {
  let doc = insertBlock(newDoc('sig-align'), 'signature').doc;
  const block = only(doc, 'signature');
  doc = applied(act(doc, block.id, { action: 'set-signature-align', hAlign: 'right' }), 'align right');
  assert.equal(only(doc, 'signature').data.hAlign, 'right', 'stored');
  assert.equal(doc.metadata.modifiedAt, STAMP, 'metadata.modifiedAt stamped');
  noOp(act(doc, block.id, { action: 'set-signature-align', hAlign: 'right' }), doc, 'same alignment');
  rejected(act(doc, block.id, { action: 'set-signature-align', hAlign: 'middle' }), 'invalid-halign', 'bogus alignment');
  const before = JSON.stringify(doc);
  act(doc, block.id, { action: 'add-signer' });
  assert.equal(JSON.stringify(doc), before, 'the source document is immutable');
});

// ═══════════════════════════════════════════════════════════════════════════
group('4 · importer and header decoder');
// ═══════════════════════════════════════════════════════════════════════════

await test('4.1 the real fixture PNG decodes identically through both entry points', () => {
  const direct = decodeImageDimensions(POC_PNG_BYTES);
  const viaAsset = assetPixelSize(POC_ASSET);
  assert.deepEqual(direct, viaAsset, 'assetPixelSize agrees with the byte decoder');
  // Independent IHDR cross-check (bytes 16..23, big-endian).
  const view = new DataView(
    POC_PNG_BYTES.buffer,
    POC_PNG_BYTES.byteOffset,
    POC_PNG_BYTES.byteLength,
  );
  assert.equal(direct.widthPx, view.getUint32(16), 'IHDR width');
  assert.equal(direct.heightPx, view.getUint32(20), 'IHDR height');
  assert.ok(direct.widthPx > 0 && direct.heightPx > 0, 'positive size');
  assert.deepEqual(
    decodeImageDimensions(base64ToBytes(bytesToBase64(POC_PNG_BYTES))),
    direct,
    'base64 round-trip',
  );
});

await test('4.2 a synthetic JPEG SOF0 header decodes; foreign formats return null', () => {
  const jpeg = new Uint8Array([
    0xff, 0xd8, // SOI
    0xff, 0xc0, 0x00, 0x11, // SOF0 + length
    0x08, // precision
    0x01, 0x2c, // height 300
    0x01, 0x90, // width 400
    0x03, 0x01, 0x11, 0x00, 0x02, 0x11, 0x01, 0x03, 0x11, 0x01,
  ]);
  assert.deepEqual(decodeImageDimensions(jpeg), { widthPx: 400, heightPx: 300 }, 'SOF0 size');
  assert.equal(decodeImageDimensions(new TextEncoder().encode('GIF89a....')), null, 'GIF is not decoded');
  assert.equal(decodeImageDimensions(new Uint8Array(0)), null, 'empty input');
  assert.equal(assetPixelSize({ mimeType: 'image/gif', base64Data: POC_ASSET.base64Data }), null, 'non-PNG/JPEG asset → null');
});

await test('4.3 importImageAsset accepts PNG, rejects GIF/empty with honest messages', () => {
  const okAsset = importImageAsset(POC_PNG_BYTES, 'chart.png');
  assert.equal(okAsset.ok, true, 'real PNG accepted');
  assert.equal(okAsset.asset.mimeType, 'image/png', 'MIME sniffed from bytes');
  assert.deepEqual(
    decodeImageDimensions(base64ToBytes(okAsset.asset.base64Data)),
    PNG_SIZE,
    'imported bytes decode to the source size',
  );
  const gif = importImageAsset(new TextEncoder().encode('GIF89a' + 'x'.repeat(32)), 'anim.gif');
  assert.equal(gif.ok, false, 'GIF refused');
  assert.ok(typeof gif.message === 'string' && gif.message.length > 0, 'with an understandable message');
  const empty = importImageAsset(new Uint8Array(0), 'nothing.png');
  assert.equal(empty.ok, false, 'empty input refused');
});

// ═══════════════════════════════════════════════════════════════════════════
group('5 · pure layout planners');
// ═══════════════════════════════════════════════════════════════════════════

await test('5.1 side-by-side slots fit proportionally; single slots pass through', () => {
  const CW = 453.54;
  assert.deepEqual(planImageSlotWidthsPt(CW, [0.5]), [CW * 0.5], 'single slot is the full fraction');
  const [a, b] = planImageSlotWidthsPt(CW, [1, 1]);
  approx(a, (CW - IMAGE_SLOT_GAP_PT) / 2, 0.01, 'fitted half width');
  approx(b, a, 0.01, 'both halves are equal');
  approx(a + b + IMAGE_SLOT_GAP_PT, CW, 0.01, 'the row fills the content width exactly');
  const [c, d] = planImageSlotWidthsPt(CW, [0.3, 0.3]);
  approx(c, CW * 0.3, 0.01, 'a fitting pair keeps its widths');
  assert.equal(d, c, 'equal fractions stay equal');
  const [e] = planImageSlotWidthsPt(CW, [5]);
  approx(e, CW, 0.01, 'defensive clamp to the schema ceiling');
});

await test('5.2 the crop box keeps the source pixels undistorted', () => {
  const crop = { x: 0.25, y: 0.25, width: 0.5, height: 0.5 };
  const box = planImageCropBoxPt(crop, 200, 400, 200);
  approx(box.innerWidthPt, 400, 0.01, 'a half-width crop zooms the inner image 2×');
  approx(box.innerHeightPt, 200, 0.01, 'inner height keeps the 2:1 source ratio');
  approx(box.boxWidthPt, 200, 0.01, 'the box keeps the requested display width');
  approx(box.boxHeightPt, 100, 0.01, 'box height = crop region height in source px');
  approx(box.offsetXPt, -100, 0.01, 'left offset = −x × inner width');
  approx(box.offsetYPt, -50, 0.01, 'top offset = −y × inner height');
  // Aspect identity: box ratio == crop-region pixel ratio.
  approx(box.boxWidthPt / box.boxHeightPt, (crop.width * 400) / (crop.height * 200), 1e-9, 'undistorted');
});

await test('5.3 signer-row sizing and the left/centre/right row offsets', () => {
  const CW = 453.54;
  const one = planSignatureLayout(CW, 1);
  assert.equal(one.slotWidthPt, SIGNATURE_SLOT_MAX_WIDTH_PT, 'a single signer gets the full column');
  assert.equal(one.gapPt, 0, 'no gap for one signer');
  const two = planSignatureLayout(CW, 2);
  assert.equal(two.slotWidthPt, SIGNATURE_SLOT_MAX_WIDTH_PT, 'two columns fit the cap on A4');
  assert.equal(two.gapPt, SIGNATURE_SLOT_GAP_PT, 'the gap appears with two signers');
  const three = planSignatureLayout(CW, 3);
  approx(three.slotWidthPt, (CW - 2 * SIGNATURE_SLOT_GAP_PT) / 3, 0.01, 'three columns shrink to fit');
  assert.ok(three.rowWidthPt <= CW + 0.01, 'the row never exceeds the content width');
  assert.equal(signatureRowStartXPt(CW, 2, 'left'), 0, 'left-aligned row starts at the edge');
  approx(signatureRowStartXPt(CW, 2, 'center'), (CW - two.rowWidthPt) / 2, 0.01, 'centre offset');
  approx(signatureRowStartXPt(CW, 2, 'right'), CW - two.rowWidthPt, 0.01, 'right offset');
});

// ═══════════════════════════════════════════════════════════════════════════
group('6 · editor components (real markup) and wiring');
// ═══════════════════════════════════════════════════════════════════════════

const dispatchRecorder = () => {
  const calls = [];
  return { calls, onAction: (blockId, action) => (calls.push(action), { ok: true, changed: true, doc: null, blockId }) };
};
const silent = () => ({ ok: true, message: '' });
const confirmRecorder = () => {
  const calls = [];
  return { calls, onRequestConfirm: (t, m, l, cb) => calls.push({ t, m, l, cb }) };
};

await test('6.1 the image editor renders layout, slot cards and crop-on-demand', () => {
  const { onAction } = dispatchRecorder();
  const emptyDoc = insertBlock(newDoc('ed-img'), 'image').doc;
  const emptyBlock = only(emptyDoc, 'image');
  const markup = renderToStaticMarkup(
    React.createElement(ImageContentEditor, {
      blockId: emptyBlock.id,
      data: emptyBlock.data,
      assets: [],
      onAction,
      onPickImage: silent,
      onError: () => {},
      onRequestConfirm: () => {},
    }),
  );
  assert.ok(markup.includes('One image') && markup.includes('Two images side by side'), 'layout choices');
  assert.ok(markup.includes('Image slot 1'), 'the slot card');
  assert.ok(markup.includes('Choose image…'), 'the pick button');
  assert.ok(!markup.includes('img-crop-x'), 'no crop fields without an attached image');
  assert.ok(markup.includes(`maxLength="${MAX_IMAGE_CAPTION_LENGTH}"`), 'caption limit exposed');

  const doc = imageDoc('ed-img-2', { caption: 'Figure A' });
  const block = only(doc, 'image');
  const withAsset = renderToStaticMarkup(
    React.createElement(ImageContentEditor, {
      blockId: block.id,
      data: block.data,
      assets: Object.values(doc.assets),
      onAction,
      onPickImage: silent,
      onError: () => {},
      onRequestConfirm: () => {},
    }),
  );
  assert.ok(withAsset.includes('img-crop-x'), 'crop fields appear with an asset');
  assert.ok(withAsset.includes('value="100"'), 'the default crop draft is the full image');
  assert.ok(withAsset.includes(POC_ASSET.filename), 'the attached filename is shown');
  assert.ok(withAsset.includes('Figure A'), 'the caption round-trips into the field');
  assert.ok(withAsset.includes('Remove image'), 'detach control present');

  const rowDoc = applied(
    act(doc, block.id, { action: 'set-image-layout', layout: 'side-by-side' }),
    'row',
  );
  const rowMarkup = renderToStaticMarkup(
    React.createElement(ImageContentEditor, {
      blockId: block.id,
      data: only(rowDoc, 'image').data,
      assets: Object.values(rowDoc.assets),
      onAction,
      onPickImage: silent,
      onError: () => {},
      onRequestConfirm: () => {},
    }),
  );
  assert.ok(rowMarkup.includes('Image slot 2'), 'the second slot card appears');
});

await test('6.2 the signature editor renders signer cards with the 1–3 rules', () => {
  const { onAction } = dispatchRecorder();
  const doc = insertBlock(newDoc('ed-sig'), 'signature').doc;
  const block = only(doc, 'signature');
  const markup = renderToStaticMarkup(
    React.createElement(SignatureContentEditor, {
      blockId: block.id,
      data: block.data,
      onAction,
      onError: () => {},
      onRequestConfirm: () => {},
    }),
  );
  assert.ok(markup.includes('Signer 1'), 'the signer card');
  assert.ok(!markup.includes('Remove signer'), 'no remove control at the minimum of one signer');
  assert.ok(markup.includes('Add signer (1 of 3)'), 'the add control shows the cap');
  assert.ok(markup.includes('placeholder="2026-10-21"'), 'the date format hint');
  assert.ok(markup.includes(`maxLength="${MAX_SIGNER_FIELD_LENGTH}"`), 'field length cap exposed');
  assert.ok(markup.includes('never a verified electronic signature'), 'the honesty hint is in the panel');

  let grown = doc;
  for (let i = 0; i < 2; i += 1) {
    grown = applied(act(grown, block.id, { action: 'add-signer' }), `grow ${i}`);
  }
  const full = renderToStaticMarkup(
    React.createElement(SignatureContentEditor, {
      blockId: block.id,
      data: only(grown, 'signature').data,
      onAction,
      onError: () => {},
      onRequestConfirm: () => {},
    }),
  );
  assert.ok(full.includes('Add signer (3 of 3)'), 'the cap is shown');
  assert.ok(full.includes('disabled'), 'add is disabled at three signers');
  assert.ok(full.includes('Remove signer'), 'remove controls appear with more than one signer');
});

await test('6.3 the pick and dispatch paths are wired App → Workspace → EditorPanel', () => {
  const app = fs.readFileSync(path.join(root, 'src', 'App.tsx'), 'utf8');
  const workspace = fs.readFileSync(path.join(root, 'src', 'components', 'workspace', 'Workspace.tsx'), 'utf8');
  const panel = fs.readFileSync(path.join(root, 'src', 'components', 'editor-panel', 'EditorPanel.tsx'), 'utf8');
  assert.ok(app.includes('handleImageSignatureAction'), 'App defines the dispatcher');
  assert.ok(app.includes('onImageSignatureAction={handleImageSignatureAction}'), 'App wires the dispatcher');
  assert.ok(app.includes('handleBlockImagePick'), 'App defines the pick handler');
  assert.ok(app.includes('onPickImage={handleBlockImagePick}'), 'App wires the pick handler');
  assert.ok(app.includes("action: 'attach-slot-asset'"), 'the pick attaches through the service');
  assert.ok(workspace.includes('onImageSignatureAction') && workspace.includes('onPickImage'), 'Workspace passes both through');
  assert.ok(panel.includes('ImageContentEditor') && panel.includes('SignatureContentEditor'), 'EditorPanel renders both editors');
  assert.ok(panel.includes('onAction={handleImageSignature}'), 'one dispatch callback');
  assert.ok(panel.includes('onPickImage={handleImagePick}'), 'the pick reaches the editors');
});

// ═══════════════════════════════════════════════════════════════════════════
group('7 · persistence (native project file)');
// ═══════════════════════════════════════════════════════════════════════════

await test('7.1 image and signature blocks survive serialize → deserialize', () => {
  let img = imageDoc('persist-img', { caption: 'Retention curve' });
  const imgBlock = only(img, 'image');
  img = applied(
    act(img, imgBlock.id, {
      action: 'set-slot-crop',
      imageId: imgBlock.data.images[0].id,
      crop: { x: 0.1, y: 0.2, width: 0.6, height: 0.7 },
    }),
    'crop for persistence',
  );
  img = applied(
    act(img, imgBlock.id, {
      action: 'set-slot-caption-placement',
      imageId: imgBlock.data.images[0].id,
      placement: 'top',
    }),
    'placement for persistence',
  );
  img = applied(act(img, imgBlock.id, { action: 'set-image-layout', layout: 'side-by-side' }), 'row for persistence');
  const sig = signatureDoc('persist-sig', 3);

  for (const [doc, label] of [[img, 'image'], [sig, 'signature']]) {
    const text = serializeDocument(doc);
    const back = deserializeDocument(text);
    assert.equal(back.schemaVersion, 1, `${label}: schema version unchanged`);
    assert.equal(JSON.stringify(back.blocks), JSON.stringify(doc.blocks), `${label}: blocks byte-stable`);
  }
  const backImg = deserializeDocument(serializeDocument(img));
  const data = only(backImg, 'image').data;
  assert.equal(data.layout, 'side-by-side', 'layout persisted');
  assert.equal(data.images.length, 2, 'both slots persisted');
  assert.deepEqual(data.images[0].crop, { x: 0.1, y: 0.2, width: 0.6, height: 0.7 }, 'crop persisted');
  assert.equal(data.images[0].captionPlacement, 'top', 'placement persisted');
  assert.equal(data.images[0].caption, 'Retention curve', 'caption persisted');
  assert.ok(backImg.assets[only(backImg, 'image').data.images[0].assetId], 'the asset bytes travel with the project');
  const backSig = deserializeDocument(serializeDocument(sig));
  const signers = only(backSig, 'signature').data.signers;
  assert.equal(signers.length, 3, 'three signers persisted');
  assert.equal(signers[2].role, 'Approved by', 'fields persisted per signer');
  assert.equal(signers[1].date, '2026-10-05', 'date persisted');
  assert.equal(signers[0].id, only(sig, 'signature').data.signers[0].id, 'ids are stable');
});

// ═══════════════════════════════════════════════════════════════════════════
group('8 · PDF output (real PocDocument, pdfjs geometry)');
// ═══════════════════════════════════════════════════════════════════════════

await test('8.1 image paint geometry follows the alignment and size settings', async () => {
  const expectations = { left: 0, center: 0.5, right: 1 };
  for (const [align, share] of Object.entries(expectations)) {
    const doc = imageDoc(`geom-${align}`, { align, fraction: 0.5 });
    const layout = computePocLayout(doc);
    const bytes = await render(doc);
    // eslint-disable-next-line no-await-in-loop
    const { images } = await withPdf(bytes, (pdf) => opTracks(pdf, 1));
    assert.equal(images.length, 1, `${align}: exactly one image paint`);
    const expectedW = layout.contentWidth * 0.5;
    approx(images[0].w, expectedW, 0.75, `${align}: painted width is the planned width`);
    approx(
      images[0].x,
      layout.marginLeft + share * (layout.contentWidth - expectedW),
      0.75,
      `${align}: painted x`,
    );
  }
});

await test('8.2 captions print below by default and above on request', async () => {
  const doc = imageDoc('cap-bottom', { caption: 'Calibration points', fraction: 0.6 });
  const bytes = await render(doc);
  const below = await withPdf(bytes, async (pdf) => ({
    items: await pageItems(pdf, 1),
    tracks: await opTracks(pdf, 1),
  }));
  const capItem = below.items.find((it) => has(it.s, 'Calibration'));
  assert.ok(capItem, 'the caption is real text in the PDF');
  const paint = below.tracks.images[0];
  assert.ok(capItem.y < paint.y + 3, `caption sits below the image (caption y ${capItem.y.toFixed(1)} vs image bottom ${paint.y.toFixed(1)})`);

  const topDoc = applied(
    act(doc, only(doc, 'image').id, {
      action: 'set-slot-caption-placement',
      imageId: only(doc, 'image').data.images[0].id,
      placement: 'top',
    }),
    'caption top',
  );
  const topBytes = await render(topDoc);
  const above = await withPdf(topBytes, async (pdf) => ({
    items: await pageItems(pdf, 1),
    tracks: await opTracks(pdf, 1),
  }));
  const topItem = above.items.find((it) => has(it.s, 'Calibration'));
  const topPaint = above.tracks.images[0];
  assert.ok(
    topItem.y > topPaint.y + topPaint.h - 3,
    `caption sits above the image (caption y ${topItem.y.toFixed(1)} vs image top ${(topPaint.y + topPaint.h).toFixed(1)})`,
  );
  assert.ok(topPaint.y < paint.y, 'the image shifts down when the caption moves above it');
});

await test('8.3 a crop clips a zoomed inner image at the display box', async () => {
  const doc = imageDoc('crop-render', { fraction: 0.5 });
  const block = only(doc, 'image');
  const crop = { x: 0.25, y: 0.25, width: 0.5, height: 0.5 };
  const cropped = applied(
    act(doc, block.id, { action: 'set-slot-crop', imageId: block.data.images[0].id, crop }),
    'crop',
  );
  const layout = computePocLayout(doc);
  const displayW = layout.contentWidth * 0.5;
  const expected = planImageCropBoxPt(crop, displayW, PNG_SIZE.widthPx, PNG_SIZE.heightPx);

  const plain = await withPdf(await render(doc), (pdf) => opTracks(pdf, 1));
  approx(plain.images[0].w, displayW, 0.75, 'uncropped width is the display width');

  const cut = await withPdf(await render(cropped), (pdf) => opTracks(pdf, 1));
  assert.equal(cut.images.length, 1, 'still exactly one image paint');
  assert.equal(
    cut.clipCount,
    plain.clipCount + 1,
    'the crop adds exactly one clip op (the crop box) versus the plain path',
  );
  approx(cut.images[0].w, expected.innerWidthPt, 0.75, 'the inner image is scaled up (zoomed)');
  assert.ok(cut.images[0].w > displayW, 'zoom is visible in the geometry');
  approx(
    cut.images[0].x,
    layout.marginLeft + (layout.contentWidth - displayW) / 2 + expected.offsetXPt,
    0.75,
    'the inner image is offset inside the box',
  );
});

await test('8.4 side-by-side images paint at the planned slot widths and gap', async () => {
  let doc = imageDoc('row-render', { fraction: 0.5 });
  const block = only(doc, 'image');
  const secondAsset = { ...POC_ASSET, id: genId() };
  doc = applied(act(doc, block.id, { action: 'set-image-layout', layout: 'side-by-side' }), 'row');
  doc = applied(
    act(doc, block.id, {
      action: 'attach-slot-asset',
      imageId: only(doc, 'image').data.images[1].id,
      asset: secondAsset,
    }),
    'second image',
  );
  const layout = computePocLayout(doc);
  const { images } = await withPdf(await render(doc), (pdf) => opTracks(pdf, 1));
  assert.equal(images.length, 2, 'two image paints');
  const [w1, w2] = planImageSlotWidthsPt(layout.contentWidth, [0.5, 1]);
  approx(images[0].w, w1, 0.75, 'first slot width (proportionally fitted)');
  approx(images[1].w, w2, 0.75, 'second slot width');
  approx(images[0].x, layout.marginLeft, 0.75, 'the row starts at the left margin');
  approx(images[1].x - images[0].x, w1 + IMAGE_SLOT_GAP_PT, 1, 'the gap separates the slots');
});

await test('8.5 signature blocks render one, two and three signers with honest text', async () => {
  for (const count of [1, 2, 3]) {
    const doc = signatureDoc(`sig-${count}`, count);
    const layout = computePocLayout(doc);
    const { slotWidthPt, gapPt } = planSignatureLayout(layout.contentWidth, count);
    const bytes = await render(doc);
    const texts = await pageTextsOf(doc);
    assert.equal(fallbackMarker(texts), false, `${count}: no fallback marker`);
    const { items, tracks } = await withPdf(bytes, async (pdf) => ({
      items: await pageItems(pdf, 1),
      tracks: await opTracks(pdf, 1),
    }));
    const stream = items.map((it) => it.s).join(' ');
    assert.ok(has(stream, 'does not contain a verified electronic signature'), `${count}: the honest disclaimer is printed`);
    assert.ok(has(stream, 'Prepared by'), `${count}: the role label prints`);
    assert.ok(has(stream, 'A. Analyst'), `${count}: the printed name prints`);
    assert.ok(has(stream, 'Date: 2026-10-01'), `${count}: the optional date prints`);
    // The signing lines: one 1-pt filled rect per signer, at the planned x.
    const expectedStart = layout.marginLeft + signatureRowStartXPt(layout.contentWidth, count, 'left');
    for (let i = 0; i < count; i += 1) {
      const x = expectedStart + i * (slotWidthPt + gapPt);
      approxIn(
        x,
        tracks.paths.map((p) => p.x),
        1,
        `${count}: signing line ${i + 1} x`,
      );
    }
    // Vertical order: role above the line, printed name below it.
    const roleItem = items.find((it) => has(it.s, 'Prepared'));
    const nameItem = items.find((it) => has(it.s, 'A. Analyst'));
    const paths = tracks.paths;
    // The signing line's user-space band (from the transformed minMax
    // bbox; probe evidence: line ≈ y 723.5–724.5 between role 762 and
    // name 710.6 on a one-signer page).
    const lineTopY = Math.max(...paths.map((p) => (p.bbox ? p.bbox.maxY : p.y)));
    const lineBottomY = Math.min(...paths.map((p) => (p.bbox ? p.bbox.minY : p.y)));
    assert.ok(roleItem.y > lineTopY, `${count}: the role sits above the signing line`);
    assert.ok(nameItem.y < lineBottomY, `${count}: the printed name sits below the signing line`);
  }
});

await test('8.6 overall alignment moves the whole signer row predictably', async () => {
  for (const [align, share] of [['left', 0], ['center', 0.5], ['right', 1]]) {
    const doc = signatureDoc(`sig-align-${align}`, 2, { hAlign: align });
    const layout = computePocLayout(doc);
    const { rowWidthPt } = planSignatureLayout(layout.contentWidth, 2);
    const tracks = await withPdf(await render(doc), (pdf) => opTracks(pdf, 1));
    // The signing lines live at/after the left margin; a stream-level
    // page-clip rect (if the engine emits one) sits at x=0 and is not a
    // signing line.
    const lines = tracks.paths.filter((p) => p.x >= layout.marginLeft - 1);
    const firstX = Math.min(...lines.map((p) => p.x));
    approx(
      firstX,
      layout.marginLeft + share * (layout.contentWidth - rowWidthPt),
      1,
      `${align}: first signing line x`,
    );
  }
});

await test('8.7 an unreadable image header fails loudly only when a crop is applied', async () => {
  const doc = insertBlock(newDoc('bad-header'), 'image').doc;
  const block = only(doc, 'image');
  const slotId = block.data.images[0].id;
  const corrupt = {
    ...POC_ASSET,
    id: genId(),
    base64Data: bytesToBase64(new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9, 10])),
  };
  const corrupted = applied(
    act(doc, block.id, { action: 'attach-slot-asset', imageId: slotId, asset: corrupt }),
    'corrupt bytes attached (MIME gate only)',
  );
  const cut = applied(
    act(corrupted, block.id, {
      action: 'set-slot-crop',
      imageId: slotId,
      crop: { x: 0, y: 0, width: 0.5, height: 0.5 },
    }),
    'crop on the corrupt asset',
  );
  let message = null;
  try {
    await renderDocPdfBytes(cut);
  } catch (e) {
    message = e.message;
  }
  assert.ok(message !== null, 'the render rejected');
  assert.ok(message.includes('unreadable header'), `honest crop failure (got: ${message})`);
});

await test('8.8 rendering is byte-deterministic and markers are absent', async () => {
  const doc = imageDoc('deterministic', { caption: 'Stable' });
  const sig = signatureDoc('deterministic-sig', 2, { hAlign: 'center' });
  const [a, b] = [await render(doc), await render(doc)];
  assert.equal(Buffer.compare(a, b), 0, 'the same document renders byte-identical output');
  assert.equal(fallbackMarker(await pageTextsOf(doc)), false, 'no fallback markers in the image doc');
  assert.equal(fallbackMarker(await pageTextsOf(sig)), false, 'no fallback markers in the signature doc');
});

// ═══════════════════════════════════════════════════════════════════════════
group('9 · regression');
// ═══════════════════════════════════════════════════════════════════════════

await test('9.1 the committed P02-M4 baseline still matches a fresh render (read-only)', async () => {
  const committed = fs.readFileSync(path.join(root, 'fixtures', 'p02-m4', 'renderer-poc-output.pdf'));
  const fresh = await render(buildPocFixture());
  assert.equal(
    Buffer.compare(fresh, committed),
    0,
    'the upgraded ImageBlock renders the committed fixture byte-identically',
  );
});

await test('9.2 no artifacts were written; script registered; schema unchanged', () => {
  assert.equal(fs.existsSync(path.join(root, 'fixtures', 'p06-m4')), false, 'P06-M4 writes no committed artifacts');
  assert.ok(fs.existsSync(path.join(root, 'fixtures', 'p04-m3', 'theme-gallery.pdf')), 'earlier baselines still present');
  const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
  assert.equal(pkg.scripts['verify:p06-m4'], 'node verify_p06_m4.mjs', 'npm script registered');
  assert.equal(newDoc().schemaVersion, 1, 'the document schema version is unchanged');
});

// ── Summary ─────────────────────────────────────────────────────────────────
group('summary');
console.log(`\n${passed} passed, ${failed.length} failed`);
if (failed.length > 0) {
  console.error(`Failed checks:\n  - ${failed.join('\n  - ')}`);
  process.exit(1);
}
