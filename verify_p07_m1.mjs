/**
 * P07-M1 Verification Suite - Change Event Model and History Semantics
 * 
 *
 * Proves, against the REAL compiled modules (no mocks, no reimplementation):
 *  1. module surface - the documented exports and constants exist;
 *  2. construction - all seven event types build with the injected clock/ID,
 *     the envelope is stamped by the service (never caller-supplied), drafts
 *     are not mutated, and default deps produce real UUID/ISO values;
 *  3. validation - deterministic error codes for malformed events (type,
 *     target, payload, status, label, group) and the unchanged-value rule;
 *  4. text semantics - field-level before/after representation and the
 *     insert/delete/replace/none classification helper;
 *  5. formatting semantics - spans variant (identical text enforced) and
 *     property variant (scalar style property);
 *  6. block event semantics - real registry blocks, target/block identity
 *     cross-check, position fields, reorder no-op rejection, JSON safety;
 *  7. lifecycle/ordering/grouping foundations - statuses accepted by
 *     validation (transitions are P07-M2), pending predicate, groupId,
 *     same-reference success, independent sequential events;
 *  8. schema-v1 compatibility - the P02-M1 stubs (`trackChangesEnabled`,
 *     `savedRevisions`) are untouched: defaults, validator and serializer
 *     round-trip behave exactly as before.
 *
 * HONEST SCOPE NOTES (also recorded in project_roadmap.md)
 *  
 *  This checkpoint is the MODEL + SEMANTICS only.  No Track Changes UI,
 *   markup, accept/reject operation, snapshot, comparison, rendering or
 *   persistence exists or is implied by these tests (P07-M2..M5, P09-M2).
 *  Baselines are PROTECTED: this suite writes nothing to `fixtures/` and
 *   reads no committed artifact.  `UPDATE_ARTIFACTS=1` is never used.
 *  No document schema change: the schema stays v1 and the two stubs keep
 *   their meaning (group 8 guards exactly that).
 *
 * Usage: node verify_p07_m1.mjs   (or: npm run verify:p07-m1)
 * Exit code 0 => all checks pass.
 */

import path from 'node:path';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { execSync } from 'node:child_process';

const require = createRequire(import.meta.url);
const root = path.dirname(new URL(import.meta.url).pathname.replace(/^\//, ''));

//  Test harness (same style as the prior suites)  
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
    if (e && e.stack) {
      console.error(`      ${String(e.stack).split('\n').slice(1, 4).join('\n      ')}`);
    }
  }
}
function group(title) {
  console.log(`\n== ${title} ${'='.repeat(Math.max(0, 66 - title.length))}`);
}

//  Compile the real modules under test  
group('compile');
const CACHE = path.join(root, 'node_modules', '.cache', 'ds-p07-m1-verify');
try {
  execSync(
    'npx tsc src/services/change-events.ts src/services/document-file.ts' +
      ' src/services/block-actions.ts src/types/defaults.ts' +
      ` --outDir "${CACHE}" --module commonjs --target es2020` +
      ' --moduleResolution node --esModuleInterop --skipLibCheck' +
      ' --jsx react-jsx --strict',
    { cwd: root, stdio: 'pipe' },
  );
  console.log('PASS  TypeScript compile of 4 roots (--strict)');
  passed += 1;
} catch (e) {
  console.error(String(e.stdout || '') + String(e.stderr || ''));
  console.error('FATAL: TypeScript compilation failed.');
  process.exit(1);
}

const pick = (...candidates) => {
  const hit = candidates.find((p) => require('node:fs').existsSync(p));
  if (!hit) throw new Error(`compiled module not found:\n  ${candidates.join('\n  ')}`);
  return require(hit);
};
const changeEvents = pick(
  path.join(CACHE, 'services', 'change-events.js'),
  path.join(CACHE, 'src', 'services', 'change-events.js'),
);
const changeTypes = pick(
  path.join(CACHE, 'types', 'change-events.js'),
  path.join(CACHE, 'src', 'types', 'change-events.js'),
);
const documentFile = pick(
  path.join(CACHE, 'services', 'document-file.js'),
  path.join(CACHE, 'src', 'services', 'document-file.js'),
);
const blockActions = pick(
  path.join(CACHE, 'services', 'block-actions.js'),
  path.join(CACHE, 'src', 'services', 'block-actions.js'),
);
const defaults = pick(
  path.join(CACHE, 'types', 'defaults.js'),
  path.join(CACHE, 'src', 'types', 'defaults.js'),
);

const {
  createChangeEvent,
  validateChangeEvent,
  textChangeKind,
  isPendingChange,
} = changeEvents;
const {
  CHANGE_EVENT_TYPES,
  CHANGE_STATUSES,
  MAX_EDITOR_LABEL_LENGTH,
  isChangeEventType,
  isChangeStatus,
} = changeTypes;
const { validateDocument, serializeDocument, deserializeDocument } = documentFile;
const { createBlock } = blockActions;
const { createDefaultDocument, newUUID } = defaults;
const { DOCSTUDIO_SCHEMA_VERSION } = pick(
  path.join(CACHE, 'types', 'document.js'),
  path.join(CACHE, 'src', 'types', 'document.js'),
);

//  Fixtures  
const T0 = '2026-10-22T10:00:00.000Z';
let seq = 0;
const genId = () => `10700000-0000-4000-8000-${String(++seq).padStart(12, '0')}`;
const opts = () => ({ now: T0, genId });
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const ISO_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/;

const B1 = 'aaaaaaaa-0000-4000-8000-000000000001';
const B2 = 'aaaaaaaa-0000-4000-8000-000000000002';
const GROUP = 'bbbbbbbb-0000-4000-8000-000000000009';

const textDraft = (original, replacement, extra = {}) => ({
  type: 'text',
  target: { kind: 'block-field', blockId: B1, field: 'text' },
  payload: { original, replacement },
  ...extra,
});
const makeText = (original = 'alpha', replacement = 'alpha beta', extra = {}) => {
  const r = createChangeEvent(textDraft(original, replacement, extra), opts());
  assert.equal(r.ok, true, `fixture text event should build: ${r.ok ? '' : r.message}`);
  return r.event;
};
const mutate = (event, patch) => ({ ...event, ...patch });

//  
group('1. module surface');
await test('all documented exports are reachable', () => {
  assert.equal(typeof createChangeEvent, 'function');
  assert.equal(typeof validateChangeEvent, 'function');
  assert.equal(typeof textChangeKind, 'function');
  assert.equal(typeof isPendingChange, 'function');
  assert.equal(typeof isChangeEventType, 'function');
  assert.equal(typeof isChangeStatus, 'function');
});
await test('CHANGE_EVENT_TYPES lists exactly the seven documented types', () => {
  assert.deepEqual([...CHANGE_EVENT_TYPES], [
    'text',
    'formatting',
    'block-create',
    'block-delete',
    'block-reorder',
    'metadata',
    'settings',
  ]);
});
await test('CHANGE_STATUSES is pending/accepted/rejected and MAX_EDITOR_LABEL_LENGTH is 200', () => {
  assert.deepEqual([...CHANGE_STATUSES], ['pending', 'accepted', 'rejected']);
  assert.equal(MAX_EDITOR_LABEL_LENGTH, 200);
});
await test('isChangeEventType / isChangeStatus discriminate runtime values', () => {
  assert.equal(isChangeEventType('text'), true);
  assert.equal(isChangeEventType('settings'), true);
  assert.equal(isChangeEventType('rename'), false);
  assert.equal(isChangeEventType(7), false);
  assert.equal(isChangeStatus('pending'), true);
  assert.equal(isChangeStatus('approved'), false);
});

//  
group('2. construction - all seven types with injected clock/ID');
await test('text event: envelope stamped, target/payload preserved', () => {
  const e = makeText();
  assert.equal(e.id, '10700000-0000-4000-8000-000000000001');
  assert.equal(e.at, T0);
  assert.equal(e.status, 'pending');
  assert.equal(e.type, 'text');
  assert.deepEqual(e.target, { kind: 'block-field', blockId: B1, field: 'text' });
  assert.deepEqual(e.payload, { original: 'alpha', replacement: 'alpha beta' });
});
await test('optional editorLabel and groupId pass through; absent when omitted', () => {
  const withLabel = makeText('a', 'b', { editorLabel: 'Ikram', groupId: GROUP });
  assert.equal(withLabel.editorLabel, 'Ikram');
  assert.equal(withLabel.groupId, GROUP);
  const bare = makeText('a', 'b');
  assert.equal('editorLabel' in bare, false);
  assert.equal('groupId' in bare, false);
});
await test('formatting (spans) event builds: identical text, style-only difference', () => {
  const r = createChangeEvent(
    {
      type: 'formatting',
      target: { kind: 'block-field', blockId: B1, field: 'text' },
      payload: {
        kind: 'spans',
        original: [{ text: 'sample' }],
        replacement: [{ text: 'sample', bold: true }],
      },
    },
    opts(),
  );
  assert.equal(r.ok, true, r.ok ? '' : r.message);
  assert.equal(r.event.type, 'formatting');
  assert.equal(r.event.payload.kind, 'spans');
});
await test('formatting (property) event builds: heading level 2 -> 3', () => {
  const r = createChangeEvent(
    {
      type: 'formatting',
      target: { kind: 'block-field', blockId: B1, field: 'level' },
      payload: { kind: 'property', original: 2, replacement: 3 },
    },
    opts(),
  );
  assert.equal(r.ok, true, r.ok ? '' : r.message);
});
await test('block-create event builds carrying a REAL registry block', () => {
  const block = createBlock('paragraph', genId);
  const r = createChangeEvent(
    {
      type: 'block-create',
      target: { kind: 'block', blockId: block.id },
      payload: { block, index: 3, afterBlockId: B1 },
    },
    opts(),
  );
  assert.equal(r.ok, true, r.ok ? '' : r.message);
  assert.equal(r.event.payload.block.data.type, 'paragraph');
  assert.equal(r.event.payload.index, 3);
  assert.equal(r.event.payload.afterBlockId, B1);
});
await test('block-delete event builds carrying the deleted block and its last position', () => {
  const block = createBlock('heading', genId);
  const r = createChangeEvent(
    {
      type: 'block-delete',
      target: { kind: 'block', blockId: block.id },
      payload: { block, index: 0, afterBlockId: null },
    },
    opts(),
  );
  assert.equal(r.ok, true, r.ok ? '' : r.message);
  assert.equal(r.event.payload.afterBlockId, null);
});
await test('block-reorder event builds with origin/destination facts', () => {
  const r = createChangeEvent(
    {
      type: 'block-reorder',
      target: { kind: 'block', blockId: B2 },
      payload: { fromIndex: 0, toIndex: 2, fromAfterBlockId: null, toAfterBlockId: B1 },
    },
    opts(),
  );
  assert.equal(r.ok, true, r.ok ? '' : r.message);
});
await test('metadata and settings events build with leaf scalar paths', () => {
  const meta = createChangeEvent(
    {
      type: 'metadata',
      target: { kind: 'document', field: 'title' },
      payload: { original: 'SOP', replacement: 'SOP-2026' },
    },
    opts(),
  );
  assert.equal(meta.ok, true, meta.ok ? '' : meta.message);
  const settings = createChangeEvent(
    {
      type: 'settings',
      target: { kind: 'document', field: 'pageSetup.pageSize' },
      payload: { original: 'A4', replacement: 'A3' },
    },
    opts(),
  );
  assert.equal(settings.ok, true, settings.ok ? '' : settings.message);
});
await test('boolean/null/number scalars are all representable', () => {
  const bool = createChangeEvent(
    {
      type: 'settings',
      target: { kind: 'document', field: 'headerFooter.footer.enabled' },
      payload: { original: false, replacement: true },
    },
    opts(),
  );
  assert.equal(bool.ok, true, bool.ok ? '' : bool.message);
  const nul = createChangeEvent(
    {
      type: 'metadata',
      target: { kind: 'document', field: 'status' },
      payload: { original: null, replacement: 'Draft' },
    },
    opts(),
  );
  assert.equal(nul.ok, true, nul.ok ? '' : nul.message);
  const num = createChangeEvent(
    {
      type: 'settings',
      target: { kind: 'document', field: 'pageSetup.margins.topPt' },
      payload: { original: 25, replacement: 18 },
    },
    opts(),
  );
  assert.equal(num.ok, true, num.ok ? '' : num.message);
});
await test('default deps produce a real UUID id and ISO timestamp', () => {
  const r = createChangeEvent(textDraft('a', 'b'));
  assert.equal(r.ok, true, r.ok ? '' : r.message);
  assert.match(r.event.id, UUID_RE);
  assert.match(r.event.at, ISO_RE);
});
await test('the draft object is never mutated by construction', () => {
  const draft = textDraft('a', 'b', { editorLabel: 'Ikram' });
  const before = JSON.stringify(draft);
  createChangeEvent(draft, opts());
  assert.equal(JSON.stringify(draft), before);
});
await test('envelope fields in a draft are rejected (service stamps them)', () => {
  const r = createChangeEvent(
    { ...textDraft('a', 'b'), id: B1, at: T0, status: 'accepted' },
    opts(),
  );
  assert.equal(r.ok, false);
  assert.equal(r.code, 'invalid-event');
});
await test('unknown draft fields are rejected', () => {
  const r = createChangeEvent({ ...textDraft('a', 'b'), note: 'x' }, opts());
  assert.equal(r.ok, false);
  assert.equal(r.code, 'invalid-event');
});

//  
group('3. validation - deterministic failure codes');
await test('non-object values are invalid-event', () => {
  for (const bad of [null, 42, 'event', []]) {
    const r = validateChangeEvent(bad);
    assert.equal(r.ok, false);
    assert.equal(r.code, 'invalid-event');
  }
});
await test('unknown event type is invalid-type', () => {
  const r = validateChangeEvent({ ...makeText('a', 'b'), type: 'rename' });
  assert.equal(r.ok, false);
  assert.equal(r.code, 'invalid-type');
});
await test('non-UUID id and non-ISO timestamp are invalid-event', () => {
  const r1 = validateChangeEvent(mutate(makeText('a', 'b'), { id: 'block-1' }));
  assert.equal(r1.ok, false);
  assert.equal(r1.code, 'invalid-event');
  const r2 = validateChangeEvent(mutate(makeText('a', 'b'), { at: 'yesterday' }));
  assert.equal(r2.ok, false);
  assert.equal(r2.code, 'invalid-event');
});
await test('invalid status is invalid-status; accepted/rejected shapes validate', () => {
  const bad = validateChangeEvent(mutate(makeText('a', 'b'), { status: 'approved' }));
  assert.equal(bad.ok, false);
  assert.equal(bad.code, 'invalid-status');
  // P07-M2 will transition statuses; the MODEL already accepts the shapes.
  assert.equal(validateChangeEvent(mutate(makeText('a', 'b'), { status: 'accepted' })).ok, true);
  assert.equal(validateChangeEvent(mutate(makeText('a', 'b'), { status: 'rejected' })).ok, true);
});
await test('editorLabel blank or over the 200-char cap is invalid-label', () => {
  const blank = validateChangeEvent(mutate(makeText('a', 'b'), { editorLabel: '   ' }));
  assert.equal(blank.ok, false);
  assert.equal(blank.code, 'invalid-label');
  const long = validateChangeEvent(
    mutate(makeText('a', 'b'), { editorLabel: 'x'.repeat(MAX_EDITOR_LABEL_LENGTH + 1) }),
  );
  assert.equal(long.ok, false);
  assert.equal(long.code, 'invalid-label');
  const max = validateChangeEvent(
    mutate(makeText('a', 'b'), { editorLabel: 'x'.repeat(MAX_EDITOR_LABEL_LENGTH) }),
  );
  assert.equal(max.ok, true, max.ok ? '' : max.message);
});
await test('non-UUID groupId is invalid-group', () => {
  const r = validateChangeEvent(mutate(makeText('a', 'b'), { groupId: 'group-1' }));
  assert.equal(r.ok, false);
  assert.equal(r.code, 'invalid-group');
});
await test('wrong target kind for the event type is invalid-target', () => {
  const r = validateChangeEvent(
    mutate(makeText('a', 'b'), { target: { kind: 'document', field: 'title' } }),
  );
  assert.equal(r.ok, false);
  assert.equal(r.code, 'invalid-target');
});
await test('block-field target needs a UUID blockId and a non-empty field', () => {
  const r1 = validateChangeEvent(
    mutate(makeText('a', 'b'), { target: { kind: 'block-field', blockId: 'b1', field: 'text' } }),
  );
  assert.equal(r1.ok, false);
  assert.equal(r1.code, 'invalid-target');
  const r2 = validateChangeEvent(
    mutate(makeText('a', 'b'), { target: { kind: 'block-field', blockId: B1, field: '  ' } }),
  );
  assert.equal(r2.ok, false);
  assert.equal(r2.code, 'invalid-target');
});
await test('document target needs a non-empty field path', () => {
  const r = validateChangeEvent(
    mutate(
      makeText('a', 'b'),
      { type: 'metadata', target: { kind: 'document', field: '' }, payload: { original: 'a', replacement: 'b' } },
    ),
  );
  assert.equal(r.ok, false);
  assert.equal(r.code, 'invalid-target');
});
await test('text payload: non-string, extra fields and unchanged values are rejected', () => {
  const nonString = validateChangeEvent(
    mutate(makeText('a', 'b'), { payload: { original: 1, replacement: 'b' } }),
  );
  assert.equal(nonString.ok, false);
  assert.equal(nonString.code, 'invalid-payload');
  const extra = validateChangeEvent(
    mutate(makeText('a', 'b'), { payload: { original: 'a', replacement: 'b', note: 'x' } }),
  );
  assert.equal(extra.ok, false);
  assert.equal(extra.code, 'invalid-payload');
  const unchanged = validateChangeEvent(
    mutate(makeText('a', 'b'), { payload: { original: 'same', replacement: 'same' } }),
  );
  assert.equal(unchanged.ok, false);
  assert.equal(unchanged.code, 'unchanged-value');
});
await test('metadata/settings: unchanged scalars and non-scalar payloads are rejected', () => {
  const unchanged = validateChangeEvent(
    mutate(makeText('a', 'b'), {
      type: 'settings',
      target: { kind: 'document', field: 'pageSetup.pageSize' },
      payload: { original: 'A4', replacement: 'A4' },
    }),
  );
  assert.equal(unchanged.ok, false);
  assert.equal(unchanged.code, 'unchanged-value');
  const nonScalar = validateChangeEvent(
    mutate(makeText('a', 'b'), {
      type: 'metadata',
      target: { kind: 'document', field: 'title' },
      payload: { original: { nested: true }, replacement: 'x' },
    }),
  );
  assert.equal(nonScalar.ok, false);
  assert.equal(nonScalar.code, 'invalid-payload');
});
await test('unknown top-level fields and non-object payloads are rejected', () => {
  const extra = validateChangeEvent(mutate(makeText('a', 'b'), { foo: 1 }));
  assert.equal(extra.ok, false);
  assert.equal(extra.code, 'invalid-event');
  const badPayload = validateChangeEvent(mutate(makeText('a', 'b'), { payload: 'nope' }));
  assert.equal(badPayload.ok, false);
  assert.equal(badPayload.code, 'invalid-payload');
});

//  
group('4. text semantics - field-level representation');
await test('textChangeKind classifies insert / delete / replace / none', () => {
  assert.equal(textChangeKind('', 'inserted text'), 'insert');
  assert.equal(textChangeKind('deleted text', ''), 'delete');
  assert.equal(textChangeKind('old', 'new'), 'replace');
  assert.equal(textChangeKind('same', 'same'), 'none');
});
await test('insertion and deletion are the empty-degenerate cases of one representation', () => {
  const insert = makeText('', 'beta');
  assert.equal(textChangeKind(insert.payload.original, insert.payload.replacement), 'insert');
  const del = makeText('beta', '');
  assert.equal(textChangeKind(del.payload.original, del.payload.replacement), 'delete');
});

//  
group('5. formatting semantics');
await test('spans variant: style-only change with identical text validates', () => {
  const r = validateChangeEvent(
    mutate(makeText('a', 'b'), {
      type: 'formatting',
      payload: {
        kind: 'spans',
        original: [{ text: 'sample' }],
        replacement: [{ text: 'sample', bold: true, color: '#c0392b' }],
      },
    }),
  );
  assert.equal(r.ok, true, r.ok ? '' : r.message);
});
await test('spans variant: changing the text is a misclassification (invalid-payload)', () => {
  const r = validateChangeEvent(
    mutate(makeText('a', 'b'), {
      type: 'formatting',
      payload: {
        kind: 'spans',
        original: [{ text: 'sample' }],
        replacement: [{ text: 'sample changed' }],
      },
    }),
  );
  assert.equal(r.ok, false);
  assert.equal(r.code, 'invalid-payload');
  assert.match(r.message, /text/i);
});
await test('spans variant: identical arrays are unchanged-value; malformed spans rejected', () => {
  const unchanged = validateChangeEvent(
    mutate(makeText('a', 'b'), {
      type: 'formatting',
      payload: {
        kind: 'spans',
        original: [{ text: 'sample', bold: true }],
        replacement: [{ text: 'sample', bold: true }],
      },
    }),
  );
  assert.equal(unchanged.ok, false);
  assert.equal(unchanged.code, 'unchanged-value');
  const malformed = validateChangeEvent(
    mutate(makeText('a', 'b'), {
      type: 'formatting',
      payload: {
        kind: 'spans',
        original: [{ text: 'sample' }],
        replacement: [{ text: 123 }],
      },
    }),
  );
  assert.equal(malformed.ok, false);
  assert.equal(malformed.code, 'invalid-payload');
});
await test('property variant: scalar style property with the unchanged-value rule', () => {
  const ok = validateChangeEvent(
    mutate(makeText('a', 'b'), {
      type: 'formatting',
      target: { kind: 'block-field', blockId: B1, field: 'hAlign' },
      payload: { kind: 'property', original: 'left', replacement: 'center' },
    }),
  );
  assert.equal(ok.ok, true, ok.ok ? '' : ok.message);
  const unchanged = validateChangeEvent(
    mutate(makeText('a', 'b'), {
      type: 'formatting',
      target: { kind: 'block-field', blockId: B1, field: 'level' },
      payload: { kind: 'property', original: 2, replacement: 2 },
    }),
  );
  assert.equal(unchanged.ok, false);
  assert.equal(unchanged.code, 'unchanged-value');
  const unknownKind = validateChangeEvent(
    mutate(makeText('a', 'b'), {
      type: 'formatting',
      payload: { kind: 'theme', original: 'a', replacement: 'b' },
    }),
  );
  assert.equal(unknownKind.ok, false);
  assert.equal(unknownKind.code, 'invalid-payload');
});

//  
group('6. block event semantics');
await test('block event: target.blockId must equal the carried block id', () => {
  const block = createBlock('callout', genId);
  const r = validateChangeEvent(
    mutate(
      makeText('a', 'b'),
      {
        type: 'block-delete',
        target: { kind: 'block', blockId: B1 },
        payload: { block, index: 1, afterBlockId: null },
      },
    ),
  );
  assert.equal(r.ok, false);
  assert.equal(r.code, 'invalid-payload');
});
await test('block envelope: unknown data type, missing spacing and bad index are rejected', () => {
  const base = createBlock('paragraph', genId);
  const unknownType = validateChangeEvent(
    mutate(
      makeText('a', 'b'),
      {
        type: 'block-create',
        target: { kind: 'block', blockId: base.id },
        payload: { block: { ...base, data: { ...base.data, type: 'hologram' } }, index: 0, afterBlockId: null },
      },
    ),
  );
  assert.equal(unknownType.ok, false);
  assert.equal(unknownType.code, 'invalid-payload');
  const { spacing, ...noSpacing } = base;
  const missingSpacing = validateChangeEvent(
    mutate(
      makeText('a', 'b'),
      {
        type: 'block-create',
        target: { kind: 'block', blockId: base.id },
        payload: { block: noSpacing, index: 0, afterBlockId: null },
      },
    ),
  );
  assert.equal(missingSpacing.ok, false);
  assert.equal(missingSpacing.code, 'invalid-payload');
  const badIndex = validateChangeEvent(
    mutate(
      makeText('a', 'b'),
      {
        type: 'block-create',
        target: { kind: 'block', blockId: base.id },
        payload: { block: base, index: -1, afterBlockId: null },
      },
    ),
  );
  assert.equal(badIndex.ok, false);
  assert.equal(badIndex.code, 'invalid-payload');
});
await test('block-reorder: no-op move is unchanged-value; malformed fields rejected', () => {
  const noop = validateChangeEvent(
    mutate(
      makeText('a', 'b'),
      {
        type: 'block-reorder',
        target: { kind: 'block', blockId: B2 },
        payload: { fromIndex: 1, toIndex: 1, fromAfterBlockId: B1, toAfterBlockId: B1 },
      },
    ),
  );
  assert.equal(noop.ok, false);
  assert.equal(noop.code, 'unchanged-value');
  const badNeighbour = validateChangeEvent(
    mutate(
      makeText('a', 'b'),
      {
        type: 'block-reorder',
        target: { kind: 'block', blockId: B2 },
        payload: { fromIndex: 0, toIndex: 1, fromAfterBlockId: 'start', toAfterBlockId: null },
      },
    ),
  );
  assert.equal(badNeighbour.ok, false);
  assert.equal(badNeighbour.code, 'invalid-payload');
});
await test('events are JSON-safe (stored history re-validates after a round trip)', () => {
  const block = createBlock('list', genId);
  const r = createChangeEvent(
    {
      type: 'block-create',
      target: { kind: 'block', blockId: block.id },
      payload: { block, index: 2, afterBlockId: B2 },
    },
    opts(),
  );
  assert.equal(r.ok, true, r.ok ? '' : r.message);
  const roundTripped = JSON.parse(JSON.stringify(r.event));
  const v = validateChangeEvent(roundTripped);
  assert.equal(v.ok, true, v.ok ? '' : v.message);
  assert.deepEqual(v.event, r.event);
});

//  
group('7. lifecycle, ordering and grouping foundations');
await test('fresh events are pending (isPendingChange); validation returns the same reference', () => {
  const e = makeText('a', 'b');
  assert.equal(isPendingChange(e), true);
  const v = validateChangeEvent(e);
  assert.equal(v.ok, true);
  assert.equal(v.event, e);
});
await test('sequential edits to one field stand as independent events', () => {
  const e1 = makeText('', 'alpha');
  const e2 = makeText('alpha', 'alpha beta');
  assert.notEqual(e1.id, e2.id);
  assert.equal(validateChangeEvent(e1).ok, true);
  assert.equal(validateChangeEvent(e2).ok, true);
  // The model records before/after facts; reversal is two events, not a mutation.
  const e3 = makeText('alpha beta', 'alpha');
  assert.deepEqual(e3.payload, { original: 'alpha beta', replacement: 'alpha' });
  assert.equal(isPendingChange(e2), true);
});
await test('groupId groups compound operations without changing individual events', () => {
  const first = makeText('', 'pasted', { groupId: GROUP });
  const second = makeText('', 'content', { groupId: GROUP });
  assert.equal(first.groupId, GROUP);
  assert.equal(second.groupId, GROUP);
  assert.notEqual(first.id, second.id);
});

//  
group('8. schema-v1 compatibility (P02-M1 stubs untouched)');
await test('DOCSTUDIO_SCHEMA_VERSION is still 1', () => {
  assert.equal(DOCSTUDIO_SCHEMA_VERSION, 1);
});
await test('default document: trackChangesEnabled false, savedRevisions empty', () => {
  const doc = createDefaultDocument('10700000-0000-4000-8000-00000000d0c1', T0);
  assert.equal(doc.trackChangesEnabled, false);
  assert.deepEqual(doc.savedRevisions, []);
  assert.doesNotThrow(() => validateDocument(doc));
});
await test('serialize -> deserialize round trip preserves the stubs exactly', () => {
  const doc = createDefaultDocument('10700000-0000-4000-8000-00000000d0c2', T0);
  doc.trackChangesEnabled = true;
  const back = deserializeDocument(serializeDocument(doc));
  assert.equal(back.trackChangesEnabled, true);
  assert.deepEqual(back.savedRevisions, []);
  assert.deepEqual(back, doc);
});
await test('the validator still enforces the two stub fields (wrong types rejected)', () => {
  const doc = createDefaultDocument('10700000-0000-4000-8000-00000000d0c3', T0);
  assert.throws(() => validateDocument({ ...doc, trackChangesEnabled: 'yes' }));
  assert.throws(() => validateDocument({ ...doc, savedRevisions: 'none' }));
});
await test('SavedRevision stub semantics unchanged: a full snapshot entry round-trips', () => {
  const doc = createDefaultDocument('10700000-0000-4000-8000-00000000d0c4', T0);
  const entry = {
    id: '10700000-0000-4000-8000-000000000ee1',
    label: 'v1',
    savedAt: T0,
    summary: 'First saved revision',
    reason: 'Periodic save',
    snapshotJson: '{"__type":"DocStudio"}',
  };
  doc.savedRevisions = [entry];
  assert.doesNotThrow(() => validateDocument(doc));
  const back = deserializeDocument(serializeDocument(doc));
  assert.deepEqual(back.savedRevisions, [entry]);
});

//  
group('summary');
console.log(`\n${passed} passed, ${failed.length} failed`);
if (failed.length > 0) {
  console.error(`FAILED: ${failed.join('; ')}`);
  process.exit(1);
}
process.exit(0);
