/**
 * P05-FIX-01 — Paragraph font colour & highlight interaction regression
 * ═══════════════════════════════════════════════════════════════════════════
 * Compiles the REAL `ParagraphContentEditor.tsx` (plus its real services:
 * `rich-text.ts`, `block-content.ts`, `block-actions.ts`,
 * `document-file.ts`, `types/*`) to CommonJS in node_modules/.cache and
 * renders it with the REAL React 18 runtime in a jsdom DOM, then drives the
 * toolbar with DOM events — mouse activation (mousedown), focus transitions,
 * engine-style `select` replays, and BOTH value-delivery paths a colour
 * picker can take (internal/native set and JS-set).  The committed document
 * flows through the REAL `updateParagraphContent` service, exactly like
 * `App.handleParagraphContentChange`, and the preview is asserted from the
 * component's own rendered DOM.  No test framework is introduced; `jsdom`
 * is the only added (dev-only) dependency and it exists solely to give the
 * real React runtime a DOM.
 *
 * Root cause under regression (owner-reported P05-FIX-01):
 *  • React's synthetic onChange for `type="color"` consults its input value
 *    tracker and silently DROPS the event when the picked value reached the
 *    input through the JavaScript `value` setter — the picker opened, a
 *    colour was chosen, nothing formatted, no feedback.
 *  • The colour inputs were hard-wired to fixed controlled values
 *    (#c0392b / #f9e79f), so React re-verted the swatch after every pick.
 *  • The applied range depended on React selection state that a late
 *    textarea `select` event (fired during the focus transition) could
 *    overwrite, instead of the range the user had actually selected.
 *
 * Covers task §6 requirements 1–10:
 *  1 font colour on a selected substring → authoritative spans + preview.
 *  2 highlight on a different substring → only that substring.
 *  3 second colour applies and is reflected by the control.
 *  4 colour across multiple formatted runs preserves unrelated formatting.
 *  5 colour + highlight coexist on the same substring.
 *  6 clear colour preserves highlight and other style properties.
 *  7 clear highlight preserves colour and other style properties.
 *  8 selection-loss/focus transitions + empty-selection behaviour, including
 *    the owner's real failure path (JS-set delivery after a focus
 *    transition) and the stale-selection guard.
 *  9 result committed to the active document and surviving
 *    serializeDocument → deserializeDocument.
 * 10 selection alone and opening/cancelling a picker do not dirty the
 *    document or alter text.
 *
 * Deliberately NOT covered here (labelled honestly): the native Windows
 * colour-picker UI itself cannot be driven from Node — that remains an owner
 * retest on Windows/Tauri (R-010).
 */
import { createRequire } from 'node:module';
import { execSync } from 'node:child_process';
import { rmSync } from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';

const require = createRequire(import.meta.url);
const root = path.dirname(new URL(import.meta.url).pathname.replace(/^\//, ''));

// ── Compile the real modules to CommonJS in node_modules/.cache ─────────────
// Same pattern as verify_p05_m2: output lives INSIDE the project tree so
// `react`, `react-dom` and the compiled services resolve at require-time.
const outDir = path.join(root, 'node_modules', '.cache', 'ds-p05-fix01-verify');
rmSync(outDir, { recursive: true, force: true });
execSync(
  'npx tsc src/components/editor-panel/ParagraphContentEditor.tsx' +
    ' src/services/document-file.ts src/services/block-actions.ts' +
    ' src/types/defaults.ts' +
    ` --outDir "${outDir}" --module commonjs --target es2020 --moduleResolution node` +
    ' --esModuleInterop --skipLibCheck --jsx react-jsx',
  { cwd: root, stdio: 'inherit' },
);

// ── jsdom DOM for the REAL React runtime ────────────────────────────────────
// Globals must exist before react-dom/client is required (canUseDOM check).
const dom = new JSDOM('<!doctype html><html><body></body></html>', {
  url: 'http://localhost/',
  pretendToBeVisual: true,
});
const defineGlobal = (key, value) =>
  Object.defineProperty(globalThis, key, { value, configurable: true, writable: true });
defineGlobal('window', dom.window);
defineGlobal('document', dom.window.document);
defineGlobal('navigator', dom.window.navigator);
for (const key of [
  'HTMLElement', 'HTMLInputElement', 'HTMLTextAreaElement', 'HTMLSelectElement',
  'Element', 'Node', 'Event', 'MouseEvent', 'KeyboardEvent', 'FocusEvent',
  'getComputedStyle', 'requestAnimationFrame', 'cancelAnimationFrame',
]) {
  if (dom.window[key] !== undefined) defineGlobal(key, dom.window[key]);
}
// React act() needs this to treat the environment as act-managed.
defineGlobal('IS_REACT_ACT_ENVIRONMENT', true);

const React = require('react');
const { act } = React;
const { createRoot } = require('react-dom/client');

const ParagraphContentEditor = require(
  path.join(outDir, 'components', 'editor-panel', 'ParagraphContentEditor.js'),
).ParagraphContentEditor;
const { updateParagraphContent } = require(path.join(outDir, 'services', 'block-content.js'));
const { serializeDocument, deserializeDocument } = require(
  path.join(outDir, 'services', 'document-file.js'),
);
const { createBlock } = require(path.join(outDir, 'services', 'block-actions.js'));
const { createDefaultDocument } = require(path.join(outDir, 'types', 'defaults.js'));

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
const T0 = '2026-10-19T10:00:00.000Z';
let seq = 0;
const genId = () => `10700000-0000-4000-8000-${String(++seq).padStart(12, '0')}`;
const snap = (v) => JSON.stringify(v);

/** A default envelope containing exactly one empty paragraph block. */
function baseDoc() {
  const doc = createDefaultDocument('doc-p05-fix01', T0);
  doc.blocks = [createBlock('paragraph', genId)];
  return doc;
}

// ── Mount harness: real component + real content service ────────────────────
// Mirrors App.handleParagraphContentChange (immutable service → setState).
let mounted = null;

async function mount(initialDoc = baseDoc()) {
  const container = dom.window.document.createElement('div');
  dom.window.document.body.appendChild(container);
  const root = createRoot(container);
  const api = { notices: [], commits: 0, getDoc: () => null };

  function Harness() {
    const [doc, setDoc] = React.useState(initialDoc);
    const docRef = React.useRef(initialDoc);
    api.getDoc = () => docRef.current;
    const onParagraphContentChange = React.useCallback((blockId, patch) => {
      api.commits += 1;
      const result = updateParagraphContent(docRef.current, blockId, patch);
      if (result.ok && result.changed) {
        docRef.current = result.doc;
        setDoc(result.doc);
      }
      return result;
    }, []);
    const onLocalError = React.useCallback((message) => {
      api.notices.push(message);
    }, []);
    const block = doc.blocks[0];
    return React.createElement(ParagraphContentEditor, {
      blockId: block.id,
      spans: block.data.spans,
      hAlign: block.data.hAlign,
      indentLevel: block.data.indentLevel,
      onParagraphContentChange,
      onLocalError,
    });
  }

  await act(async () => {
    root.render(React.createElement(Harness));
  });
  mounted = { container, root, api };
  return mounted;
}

async function unmount() {
  if (mounted === null) return;
  const { container, root } = mounted;
  await act(async () => {
    root.unmount();
  });
  container.remove();
  mounted = null;
}

// ── DOM/query helpers ───────────────────────────────────────────────────────
const $ = (sel) => mounted.container.querySelector(sel);
const ta = () => $('.rt-textarea');
const colorInput = () =>
  mounted.container.querySelector('input[aria-label="Font colour for the selected text"]');
const highlightInput = () =>
  mounted.container.querySelector('input[aria-label="Highlight colour for the selected text"]');
const colorLabel = () => $('label[title="Font colour"]');
const highlightLabel = () => $('label[title="Highlight colour"]');
const clearColorBtn = () =>
  $('button[title="Remove the font colour from the selected text"]');
const clearHighlightBtn = () => $('button[title="Remove the highlight from the selected text"]');
const spans = () => mounted.api.getDoc().blocks[0].data.spans;
const plain = () => spans().map((s) => s.text).join('');
const previewHTML = () => $('.content-preview-body').innerHTML;
const noticeCount = () => mounted.api.notices.length;

/** Normalise a css colour ('rgb(r, g, b)' or '#rrggbb') to lowercase hex. */
function cssColor(value) {
  const m = /^rgb\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*\)$/.exec(value || '');
  if (m) {
    return (
      '#' +
      [m[1], m[2], m[3]]
        .map((n) => Number(n).toString(16).padStart(2, '0'))
        .join('')
    );
  }
  return (value || '').toLowerCase();
}

/** Coloured preview spans: [{ text, color }] (inner-most colour spans). */
function previewColors() {
  return [...mounted.container.querySelectorAll('.content-preview-body span')]
    .filter((s) => s.style.color)
    .map((s) => ({ text: s.textContent, color: cssColor(s.style.color) }));
}
/** Highlighted preview spans: [{ text, bg }]. */
function previewHighlights() {
  return [...mounted.container.querySelectorAll('.content-preview-body span')]
    .filter((s) => s.style.backgroundColor)
    .map((s) => ({ text: s.textContent, bg: cssColor(s.style.backgroundColor) }));
}

// ── Interaction helpers (DOM events, as the engine would deliver them) ──────

/** Type whole text through the REAL controlled-textarea input path. */
function setText(text) {
  const el = ta();
  const setter = Object.getOwnPropertyDescriptor(dom.window.HTMLTextAreaElement.prototype, 'value').set;
  setter.call(el, text);
  el.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
}

/** Select a range and fire the events the engine fires (select/keyup). */
function selectRange(start, end) {
  const el = ta();
  el.setSelectionRange(start, end);
  el.dispatchEvent(new dom.window.Event('select', { bubbles: true }));
  el.dispatchEvent(new dom.window.Event('keyup', { bubbles: true }));
}

/** mousedown on a colour control label/button — React onMouseDown → captureTarget. */
function activate(element) {
  element.dispatchEvent(
    new dom.window.MouseEvent('mousedown', { bubbles: true, cancelable: true, view: dom.window }),
  );
}

/** The engine's focus-transition replay: textarea `select` after blur (seen live). */
function engineSelectReplay(collapseTo) {
  const el = ta();
  if (collapseTo !== undefined) el.setSelectionRange(collapseTo, collapseTo);
  el.dispatchEvent(new dom.window.Event('select', { bubbles: true }));
}

/**
 * Deliver a picked colour the way an engine would.
 *  • 'native' — value set through the internal/native path (JS value tracker
 *    stays stale → React's onChange fires).
 *  • 'js'     — value written through the JavaScript value setter (tracker
 *    updated → React's onChange is SUPPRESSED; this is the owner's failure
 *    path — only the native listener can apply it).
 */
function pick(input, hex, mode = 'native') {
  if (mode === 'js') {
    input.value = hex;
  } else {
    Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype, 'value').set.call(input, hex);
  }
  input.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
  input.dispatchEvent(new dom.window.Event('change', { bubbles: true }));
}

/** Click a toolbar button: mousedown (capture) → mouseup → click. */
function clickButton(button) {
  activate(button);
  button.dispatchEvent(
    new dom.window.MouseEvent('mouseup', { bubbles: true, cancelable: true, view: dom.window }),
  );
  button.click();
}

/**
 * Finish a click whose mousedown was already dispatched separately — a real
 * click fires mousedown exactly ONCE, so the frozen target from that first
 * mousedown must be the one the click completes with.
 */
function completeClick(button) {
  button.dispatchEvent(
    new dom.window.MouseEvent('mouseup', { bubbles: true, cancelable: true, view: dom.window }),
  );
  button.click();
}

/**
 * The owner's interaction sequence: select text, activate a colour control
 * (mousedown freezes the target BEFORE focus moves), the engine replays a
 * `select` event on the blurred textarea (optionally reporting a LOST/
 * COLLAPSED selection), then the picker delivers the choice.
 */
async function ownerFlow({ start, end, control, label, hex, mode = 'native', collapseTo }) {
  await act(async () => {
    selectRange(start, end);
    activate(label);
    control.focus();
    engineSelectReplay(collapseTo);
  });
  await act(async () => {
    pick(control, hex, mode);
  });
}

const FOCUS_IS_TEXTAREA = () =>
  dom.window.document.activeElement === ta();

// ═══════════════════════════════════════════════════════════════════════════
// Tests
// ═══════════════════════════════════════════════════════════════════════════

await test('0. baseline: typed text reaches the authoritative spans through the real service', async () => {
  await mount();
  await act(async () => {
    setText('alpha beta gamma');
  });
  assert.equal(plain(), 'alpha beta gamma', 'document text committed');
  assert.equal(ta().value, 'alpha beta gamma', 'controlled textarea shows the text');
  assert.equal(mounted.api.commits, 1, 'exactly one content commit');
  assert.equal(mounted.api.notices.length, 0, 'no notices');
  await unmount();
});

await test('1. REQUIRED-1: font colour applies ONLY to the selected substring (spans + preview + control)', async () => {
  await mount();
  await act(async () => {
    setText('alpha beta gamma');
  });
  await ownerFlow({
    start: 6, end: 10, control: colorInput(), label: colorLabel(),
    hex: '#ff0000', mode: 'native', collapseTo: 6, // engine replay reports a lost selection
  });
  const s = spans();
  assert.equal(plain(), 'alpha beta gamma', 'text unchanged');
  assert.equal(s.length, 3, 'three runs remain');
  assert.equal(s[1].text, 'beta', 'styled run is exactly the selected substring');
  assert.equal(s[1].color, '#ff0000', 'colour stored as span data');
  assert.equal(s[0].color, undefined, 'text before selection uncoloured');
  assert.equal(s[2].color, undefined, 'text after selection uncoloured');
  assert.deepEqual(previewColors(), [{ text: 'beta', color: '#ff0000' }], 'preview colours only beta');
  assert.equal(colorInput().value, '#ff0000', 'control reflects the chosen colour');
  assert.equal(ta().selectionStart, 6, 'selection restored to the target');
  assert.equal(ta().selectionEnd, 10, 'selection restored to the target');
  assert.ok(FOCUS_IS_TEXTAREA(), 'focus returned to the text');
  assert.equal(mounted.api.notices.length, 0, 'no error feedback on success');
  await unmount();
});

await test('2. REQUIRED-2: highlight applies ONLY to a different selected substring', async () => {
  await mount();
  await act(async () => {
    setText('alpha beta gamma');
  });
  await ownerFlow({
    start: 11, end: 16, control: highlightInput(), label: highlightLabel(),
    hex: '#f1c40f', mode: 'native',
  });
  const s = spans();
  assert.equal(s[0].color, undefined, 'font colour untouched');
  assert.deepEqual(
    s.map((x) => [x.text, x.highlight ?? null]),
    [['alpha beta ', null], ['gamma', '#f1c40f'], ['', null]].slice(0, 2),
    'only gamma carries the highlight',
  );
  assert.deepEqual(previewHighlights(), [{ text: 'gamma', bg: '#f1c40f' }], 'preview highlights only gamma');
  assert.deepEqual(previewColors(), [], 'no font colour was created');
  assert.equal(highlightInput().value, '#f1c40f', 'highlight control reflects the choice');
  assert.equal(mounted.api.notices.length, 0, 'no notices');
  await unmount();
});

await test('3. REQUIRED-3: a second colour choice applies and remains reflected in the control', async () => {
  await mount();
  await act(async () => {
    setText('alpha beta gamma');
  });
  await ownerFlow({ start: 6, end: 10, control: colorInput(), label: colorLabel(), hex: '#ff0000' });
  assert.equal(colorInput().value, '#ff0000', 'first choice reflected');
  await ownerFlow({ start: 6, end: 10, control: colorInput(), label: colorLabel(), hex: '#0000ff' });
  const s = spans();
  assert.equal(s.length, 3, 'no fragmentation');
  assert.equal(s[1].text, 'beta', 'still exactly the selection');
  assert.equal(s[1].color, '#0000ff', 'second colour REPLACED the first');
  assert.equal(colorInput().value, '#0000ff', 'second choice reflected in the control');
  assert.deepEqual(previewColors(), [{ text: 'beta', color: '#0000ff' }], 'preview shows the second colour');
  await unmount();
});

await test('4. REQUIRED-4: colour across multiple formatted runs preserves all unrelated formatting', async () => {
  await mount(baseDoc());
  await act(async () => {
    setText('alpha beta gamma');
  });
  // Bold "be" [6,8) and underline "ta " [8,11) — applied through the REAL
  // toolbar buttons — so the colour selection [6,10) crosses BOTH runs.
  const buttons = [...mounted.container.querySelectorAll('.rt-toolbar button')];
  const boldBtn = buttons.find((b) => b.textContent === 'B');
  const underlineBtn = buttons.find((b) => b.textContent === 'U');
  await act(async () => {
    selectRange(6, 8);
  });
  await act(async () => {
    clickButton(boldBtn);
  });
  await act(async () => {
    selectRange(8, 11);
  });
  await act(async () => {
    clickButton(underlineBtn);
  });
  assert.deepEqual(
    spans().map((x) => [x.text, x.bold === true, x.underline === true]),
    [
      ['alpha ', false, false],
      ['be', true, false],
      ['ta ', false, true],
      ['gamma', false, false],
    ],
    'bold and underline runs prepared',
  );
  // Now colour the cross-boundary selection "beta" [6,10):
  await ownerFlow({
    start: 6, end: 10, control: colorInput(), label: colorLabel(),
    hex: '#abc123', mode: 'native',
  });
  const s = spans();
  assert.equal(plain(), 'alpha beta gamma', 'text unchanged');
  assert.deepEqual(
    s.map((x) => [x.text, x.color ?? null, x.bold === true, x.underline === true]),
    [
      ['alpha ', null, false, false],
      ['be', '#abc123', true, false],
      ['ta', '#abc123', false, true],
      [' ', null, false, true],
      ['gamma', null, false, false],
    ],
    'colour applied across BOTH runs; bold and underline preserved; outside untouched',
  );
  const colorStyles = [...mounted.container.querySelectorAll('.content-preview-body span')]
    .map((s) => cssColor(s.style.color))
    .filter(Boolean);
  assert.ok(colorStyles.includes('#abc123'), 'preview shows the colour');
  assert.ok($('.content-preview-body strong'), 'preview keeps the bold element');
  assert.ok($('.content-preview-body u'), 'preview keeps the underline element');
  await unmount();
});

await test('5. REQUIRED-5: font colour and highlight coexist on the same substring', async () => {
  await mount();
  await act(async () => {
    setText('alpha beta gamma');
  });
  await ownerFlow({ start: 6, end: 10, control: colorInput(), label: colorLabel(), hex: '#8e44ad' });
  await ownerFlow({ start: 6, end: 10, control: highlightInput(), label: highlightLabel(), hex: '#fadbd8' });
  const s = spans();
  assert.equal(s.length, 3, 'runs stay merged (identical styling)');
  assert.equal(s[1].text, 'beta', 'single styled run');
  assert.equal(s[1].color, '#8e44ad', 'colour kept');
  assert.equal(s[1].highlight, '#fadbd8', 'highlight added alongside');
  assert.deepEqual(previewColors(), [{ text: 'beta', color: '#8e44ad' }], 'preview colour present');
  assert.deepEqual(previewHighlights(), [{ text: 'beta', bg: '#fadbd8' }], 'preview highlight present');
  assert.equal(colorInput().value, '#8e44ad', 'colour control independent');
  assert.equal(highlightInput().value, '#fadbd8', 'highlight control independent');
  await unmount();
});

await test('6. REQUIRED-6: clearing the font colour preserves highlight and other styles', async () => {
  await mount();
  await act(async () => {
    setText('alpha beta gamma');
  });
  await ownerFlow({ start: 6, end: 10, control: colorInput(), label: colorLabel(), hex: '#8e44ad' });
  await ownerFlow({ start: 6, end: 10, control: highlightInput(), label: highlightLabel(), hex: '#fadbd8' });
  const before = snap(spans());
  // Clear via the A× button — ONE mousedown (captures [6,10] while the
  // selection is still valid), then the engine reports the selection as lost
  // during the focus transition, then the click completes with only
  // mouseup/click, exactly as a real click would.
  await act(async () => {
    const btn = clearColorBtn();
    activate(btn);
    btn.focus();
    engineSelectReplay(6); // engine reports the selection as lost after blur
  });
  await act(async () => {
    completeClick(clearColorBtn());
  });
  const s = spans();
  assert.equal(s[1].color, undefined, 'font colour cleared');
  assert.equal(s[1].highlight, '#fadbd8', 'highlight preserved by the colour clear');
  assert.equal(s[1].text, 'beta', 'run text unchanged');
  assert.notEqual(snap(spans()), before, 'document changed');
  assert.equal(mounted.api.notices.length, 0, 'clear succeeded without feedback');
  assert.ok(FOCUS_IS_TEXTAREA(), 'focus returned to the text after clear');
  await unmount();
});

await test('7. REQUIRED-7: clearing the highlight preserves font colour and other styles', async () => {
  await mount();
  await act(async () => {
    setText('alpha beta gamma');
  });
  await ownerFlow({ start: 6, end: 10, control: colorInput(), label: colorLabel(), hex: '#8e44ad' });
  await ownerFlow({ start: 6, end: 10, control: highlightInput(), label: highlightLabel(), hex: '#fadbd8' });
  await act(async () => {
    clickButton(clearHighlightBtn());
  });
  const s = spans();
  assert.equal(s[1].color, '#8e44ad', 'font colour preserved by the highlight clear');
  assert.equal(s[1].highlight, undefined, 'highlight cleared');
  assert.deepEqual(previewColors(), [{ text: 'beta', color: '#8e44ad' }], 'preview keeps the colour');
  assert.deepEqual(previewHighlights(), [], 'preview highlight removed');
  assert.equal(mounted.api.notices.length, 0, 'no notices');
  await unmount();
});

await test('8. REQUIRED-8a (owner failure path): selection-loss replay + JS-set delivery still formats', async () => {
  await mount();
  await act(async () => {
    setText('alpha beta gamma');
  });
  // Select, activate, then the engine LOSES the selection during the focus
  // transition (collapsed replay), then the picker delivers the colour
  // through the JS value setter — the exact path where React's synthetic
  // onChange is suppressed and the old code applied NOTHING, silently.
  await ownerFlow({
    start: 6, end: 10, control: colorInput(), label: colorLabel(),
    hex: '#12ab34', mode: 'js', collapseTo: 8,
  });
  const s = spans();
  assert.equal(s[1].text, 'beta', 'the FROZEN target received the colour');
  assert.equal(s[1].color, '#12ab34', 'colour applied despite suppressed React onChange');
  assert.equal(s[0].color, undefined, 'outside text untouched');
  assert.equal(colorInput().value, '#12ab34', 'control reflects the choice');
  assert.equal(mounted.api.notices.length, 0, 'no error — this must not read as a failure');
  assert.equal(ta().selectionStart, 6, 'selection restored to the frozen range');
  assert.equal(ta().selectionEnd, 10, 'selection restored to the frozen range');
  assert.ok(FOCUS_IS_TEXTAREA(), 'focus returned to the text');
  // React's synthetic onChange is tracker-suppressed in this delivery mode
  // (its `value` setter updates React's input value tracker, so React sees
  // "not dirty" and drops the event — reproduced live in Chromium during
  // root-cause analysis).  Only the native listener can apply here; this
  // test fails against the pre-fix component, which applied NOTHING.
  await unmount();
});

await test('9. REQUIRED-8b: collapsed caret → pick gives clear feedback and formats NOTHING', async () => {
  await mount();
  await act(async () => {
    setText('alpha beta gamma');
  });
  const before = snap(spans());
  const commitsBefore = mounted.api.commits;
  await act(async () => {
    // User clicks into the text (caret only, no selection)…
    const el = ta();
    el.setSelectionRange(8, 8);
    el.dispatchEvent(new dom.window.Event('select', { bubbles: true }));
    // …then activates the colour control: an EMPTY target is frozen.
    activate(colorLabel());
    colorInput().focus();
    engineSelectReplay(8);
  });
  await act(async () => {
    pick(colorInput(), '#16a085', 'native');
  });
  assert.equal(snap(spans()), before, 'document untouched');
  assert.equal(mounted.api.commits, commitsBefore, 'no content commit');
  assert.equal(
    mounted.api.notices.at(-1),
    'Select some text before changing its colour.',
    'understandable feedback surfaced',
  );
  assert.deepEqual(previewColors(), [], 'nothing formatted');
  // The stale earlier selection ([6,10) from a previous interaction) must NOT
  // be applied — the target is whatever was selected at ACTIVATION time.
  await unmount();
});

await test('10. REQUIRED-10: selection changes and an opened-then-cancelled picker do not dirty the document', async () => {
  await mount();
  await act(async () => {
    setText('alpha beta gamma');
  });
  const before = snap(mounted.api.getDoc());
  const commitsBefore = mounted.api.commits;
  // Selection activity alone:
  await act(async () => {
    selectRange(0, 5);
    selectRange(6, 10);
    selectRange(10, 10);
  });
  assert.equal(snap(mounted.api.getDoc()), before, 'selection does not dirty the document');
  assert.equal(mounted.api.commits, commitsBefore, 'no commits from selection');
  assert.equal(ta().value, 'alpha beta gamma', 'text not altered by selection');
  // Open the picker (mousedown captures, control focused) and CANCEL (no
  // input/change events ever arrive):
  await act(async () => {
    selectRange(6, 10);
    activate(colorLabel());
    colorInput().focus();
    engineSelectReplay();
  });
  assert.equal(snap(mounted.api.getDoc()), before, 'opening the picker does not dirty the document');
  assert.equal(mounted.api.commits, commitsBefore, 'no commits from opening the picker');
  assert.equal(ta().value, 'alpha beta gamma', 'text not altered by opening the picker');
  await unmount();
});

await test('11. keyboard activation: Tab + Enter on the colour control targets the preserved selection', async () => {
  await mount();
  await act(async () => {
    setText('alpha beta gamma');
  });
  await act(async () => {
    selectRange(11, 16); // "gamma"
    colorInput().focus(); // Tab-focus — NO mousedown happened
    colorInput().dispatchEvent(
      new dom.window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true }),
    );
  });
  await act(async () => {
    pick(colorInput(), '#e67e22', 'native');
  });
  const s = spans();
  assert.equal(s[0].text, 'alpha beta ', 'runs before the selection untouched');
  assert.equal(s[0].color, undefined, 'nothing before the selection coloured');
  assert.deepEqual(
    s.map((x) => [x.text, x.color ?? null]),
    [['alpha beta ', null], ['gamma', '#e67e22']],
    'colour applied to the keyboard-targeted selection',
  );
  await unmount();
});

await test('12. engine variant: internal/native value delivery also applies (both delivery paths covered)', async () => {
  await mount();
  await act(async () => {
    setText('alpha beta gamma');
  });
  await ownerFlow({ start: 0, end: 5, control: colorInput(), label: colorLabel(), hex: '#c0392b', mode: 'native' });
  assert.deepEqual(
    spans().map((x) => [x.text, x.color ?? null]),
    [['alpha', '#c0392b'], [' beta gamma', null]],
    'native-delivery colour applied to "alpha"',
  );
  await unmount();
});

await test('13. REQUIRED-9: committed colour/highlight survive serializeDocument → deserializeDocument', async () => {
  await mount();
  await act(async () => {
    setText('alpha beta gamma');
  });
  await ownerFlow({ start: 6, end: 10, control: colorInput(), label: colorLabel(), hex: '#2980b9' });
  await ownerFlow({ start: 6, end: 10, control: highlightInput(), label: highlightLabel(), hex: '#f9e79f' });
  const committed = spans();
  const doc = mounted.api.getDoc();
  const json = serializeDocument(doc);
  const reopened = deserializeDocument(json);
  assert.deepEqual(
    reopened.blocks[0].data.spans,
    committed,
    'colour and highlight round-trip through the file format',
  );
  assert.equal(reopened.blocks[0].data.spans[1].text, 'beta', 'styled run survives');
  assert.equal(reopened.blocks[0].data.spans[1].color, '#2980b9', 'colour survives');
  assert.equal(reopened.blocks[0].data.spans[1].highlight, '#f9e79f', 'highlight survives');
  await unmount();
});

await test('14. empty selection on the CLEAR buttons gives feedback and changes nothing', async () => {
  await mount();
  await act(async () => {
    setText('alpha beta gamma');
  });
  await ownerFlow({ start: 6, end: 10, control: colorInput(), label: colorLabel(), hex: '#9b59b6' });
  const before = snap(spans());
  const commitsBefore = mounted.api.commits;
  await act(async () => {
    const el = ta();
    el.setSelectionRange(12, 12);
    el.dispatchEvent(new dom.window.Event('select', { bubbles: true }));
    clickButton(clearColorBtn());
  });
  assert.equal(snap(spans()), before, 'document untouched by a clear with no selection');
  assert.equal(mounted.api.commits, commitsBefore, 'no commit');
  assert.equal(
    mounted.api.notices.at(-1),
    'Select some text before changing its colour.',
    'feedback surfaced for the clear action too',
  );
  assert.deepEqual(previewColors(), [{ text: 'beta', color: '#9b59b6' }], 'existing colour kept');
  await unmount();
});

await test('15. preview DOM always agrees with the authoritative spans after mixed operations', async () => {
  await mount();
  await act(async () => {
    setText('alpha beta gamma');
  });
  await ownerFlow({ start: 6, end: 10, control: colorInput(), label: colorLabel(), hex: '#d35400' });
  await ownerFlow({ start: 6, end: 10, control: highlightInput(), label: highlightLabel(), hex: '#f4d03f' });
  await ownerFlow({ start: 11, end: 16, control: highlightInput(), label: highlightLabel(), hex: '#a3be8c' });
  const s = spans();
  const coloured = s.filter((x) => x.color !== undefined);
  const highlighted = s.filter((x) => x.highlight !== undefined);
  assert.deepEqual(
    coloured.map((x) => [x.text, x.color]),
    [['beta', '#d35400']],
    'authoritative: one coloured run',
  );
  assert.deepEqual(
    highlighted.map((x) => [x.text, x.highlight]),
    [['beta', '#f4d03f'], ['gamma', '#a3be8c']],
    'authoritative: two highlighted runs',
  );
  assert.deepEqual(previewColors().map((x) => [x.text, x.color]), [['beta', '#d35400']], 'preview mirrors colour');
  assert.deepEqual(
    previewHighlights().map((x) => [x.text, x.bg]),
    [['beta', '#f4d03f'], ['gamma', '#a3be8c']],
    'preview mirrors highlights',
  );
  assert.equal(plain(), 'alpha beta gamma', 'text never altered by any of it');
  assert.equal(mounted.api.notices.length, 0, 'no notices during successful operations');
  await unmount();
});

// ── Summary ─────────────────────────────────────────────────────────────────
console.log(`\n${passed} passed, ${failed.length} failed`);
if (failed.length > 0) process.exitCode = 1;
