import React from 'react';
import type {
  ExhibitBlockData,
  HorizontalLineBlockData,
  MetadataBlockData,
  ReferenceBlockData,
  RevisionHistoryBlockData,
  SectionBreakBlockData,
} from '../../types/blocks';
import type {
  AssetRecord,
  CoverVisibleMetadataField,
  CustomMetadataField,
  DocUUID,
} from '../../types/document';
import {
  metadataFieldChoices,
  HORIZONTAL_LINE_THICKNESS_PT_RANGE,
  type StructuralContentAction,
  type StructuralContentActionResult,
} from '../../services/structural-block-content';
import { parseNumberDraft } from '../../services/page-typography';

export type StructuralDispatch = (
  blockId: DocUUID,
  action: StructuralContentAction,
) => StructuralContentActionResult;

interface StructuralEditorProps {
  blockId: DocUUID;
  onAction: StructuralDispatch;
  onError: (message: string) => void;
  onCommit?: () => void;
}

/**
 * Shared commit helper for the structural editors: dispatch through the
 * App-level action, surface the service's understandable message on
 * failure.  A no-op (same-reference) result is a successful non-change
 * that must NOT dirty the document — App-level handlers only commit when
 * `result.ok && result.changed`.
 */
function dispatchCommit(
  onAction: StructuralDispatch,
  onError: (message: string) => void,
  blockId: DocUUID,
  action: StructuralContentAction,
): StructuralContentActionResult {
  const result = onAction(blockId, action);
  if (!result.ok) onError(result.message);
  return result;
}

// ─────────────────────────────────────────────────────────────────────────────
// Horizontal rule
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Thickness + colour for a horizontal rule.  Editing either field marks the
 * rule as block-authored (`styleSource: 'block'`) so the renderer honours the
 * stored values instead of the theme's section-rule tokens.
 */
export function HorizontalLineEditor({ blockId, data, onAction, onError }: StructuralEditorProps & { data: HorizontalLineBlockData }) {
  const commit = (action: StructuralContentAction): StructuralContentActionResult =>
    dispatchCommit(onAction, onError, blockId, action);
  const [thicknessDraft, setThicknessDraft] = React.useState<string>(() => String(data.thicknessPt));
  const [colorDraft, setColorDraft] = React.useState<string>(() => data.color);
  const { min, max } = HORIZONTAL_LINE_THICKNESS_PT_RANGE;

  React.useEffect(() => {
    setThicknessDraft(String(data.thicknessPt));
    setColorDraft(data.color);
  }, [data.thicknessPt, data.color]);

  const handleThickness = (raw: string) => {
    setThicknessDraft(raw);
    const parsed = parseNumberDraft(raw);
    // Partial/invalid drafts are not committed — the last valid value stays
    // in the document and the range hint states the accepted bounds.
    if (!Number.isFinite(parsed) || parsed < min || parsed > max) return;
    commit({ action: 'update-horizontal-line', thicknessPt: parsed });
  };

  const handleColor = (raw: string) => {
    setColorDraft(raw);
    commit({ action: 'update-horizontal-line', color: raw });
  };

  return (
    <div className="content-row">
      <div className="content-field">
        <label className="content-field-label" htmlFor={`hl-thickness-${blockId}`}>
          Thickness (pt)
        </label>
        <input
          id={`hl-thickness-${blockId}`}
          className="content-text-input"
          type="number"
          min={min}
          max={max}
          step={0.5}
          value={thicknessDraft}
          onChange={(event) => handleThickness(event.target.value)}
          aria-describedby={`hl-thickness-hint-${blockId}`}
        />
        <small id={`hl-thickness-hint-${blockId}`} className="content-derived-hint">
          {min}–{max} pt.  Editing stores the value on the rule (block-authored style).
        </small>
      </div>
      <div className="content-field">
        <label className="content-field-label" htmlFor={`hl-color-${blockId}`}>
          Colour
        </label>
        <input
          id={`hl-color-${blockId}`}
          className="content-text-input"
          type="text"
          value={colorDraft}
          onChange={(event) => handleColor(event.target.value)}
          placeholder="#999999"
          aria-describedby={`hl-color-hint-${blockId}`}
        />
        <small id={`hl-color-hint-${blockId}`} className="content-derived-hint">
          Hex colour such as #999999.  Unset (theme) styling follows the body theme.
        </small>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Section break
// ─────────────────────────────────────────────────────────────────────────────

/** Optional inline section title.  An empty title is valid and renders the divider only. */
export function SectionBreakEditor({ blockId, data, onAction, onError }: StructuralEditorProps & { data: SectionBreakBlockData }) {
  const commit = (action: StructuralContentAction): StructuralContentActionResult =>
    dispatchCommit(onAction, onError, blockId, action);
  const [draft, setDraft] = React.useState<string>(() => data.title ?? '');

  React.useEffect(() => {
    setDraft(data.title ?? '');
  }, [data.title]);

  return (
    <div className="content-row">
      <div className="content-field">
        <label className="content-field-label" htmlFor={`sb-title-${blockId}`}>
          Section title (optional)
        </label>
        <input
          id={`sb-title-${blockId}`}
          className="content-text-input"
          type="text"
          value={draft}
          onChange={(event) => {
            setDraft(event.target.value);
            commit({ action: 'update-section-break', title: event.target.value });
          }}
          placeholder="e.g. Scope"
        />
        <small className="content-derived-hint">
          An inline divider with an optional title.  A section break never starts a new page — use a page break for that.
        </small>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Page break
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Deliberately non-editable structural marker.  It has no content fields, so
 * there is nothing to type; the marker participates in the existing insert /
 * reorder / duplicate / delete operations through the block framework.
 */
export function PageBreakMarker({ data }: { data: { type: 'page-break' } }) {
  void data;
  return (
    <div className="content-row">
      <p className="content-derived-hint">
        Page break marker.  The next content block starts on a new physical page.  This marker has no
        text of its own; it can still be moved, duplicated and deleted like any other block.
        Consecutive page breaks collapse to a single page boundary so no blank pages are produced.
      </p>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Metadata block
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Ordered field picker for a metadata block.  Selected fields render in the
 * order shown; the block stores field KEYS only, so values always come from
 * the authoritative document metadata and can never go stale.
 */
export function MetadataBlockEditor({
  blockId,
  data,
  customFields,
  onAction,
  onError,
}: StructuralEditorProps & { data: MetadataBlockData; customFields: readonly CustomMetadataField[] }) {
  const commit = (action: StructuralContentAction): StructuralContentActionResult =>
    dispatchCommit(onAction, onError, blockId, action);
  const choices = React.useMemo(() => metadataFieldChoices(customFields), [customFields]);
  const selected = data.visibleFields;

  const available = choices.filter(
    (choice) => !selected.includes(choice.field as CoverVisibleMetadataField),
  );
  const labelFor = (field: CoverVisibleMetadataField): string =>
    choices.find((choice) => choice.field === field)?.label ?? field;

  const add = (field: CoverVisibleMetadataField) => {
    commit({ action: 'set-metadata-fields', fields: [...selected, field] });
  };
  const remove = (index: number) => {
    commit({
      action: 'set-metadata-fields',
      fields: selected.filter((_, i) => i !== index),
    });
  };
  const move = (index: number, delta: -1 | 1) => {
    const next = [...selected];
    const target = index + delta;
    if (target < 0 || target >= next.length) return;
    [next[index], next[target]] = [next[target], next[index]];
    commit({ action: 'set-metadata-fields', fields: next });
  };

  return (
    <div className="structural-editor">
      <div className="content-field-label">Visible metadata fields (in order)</div>
      {selected.length === 0 ? (
        <p className="content-derived-hint">
          No fields selected.  The block renders an honest “no metadata fields selected” note until
          you add some below.
        </p>
      ) : (
        <ul className="structural-field-list" role="list">
          {selected.map((field, index) => (
            <li key={`${field}-${index}`} className="structural-field-row">
              <span className="structural-field-label">{labelFor(field)}</span>
              <span className="structural-field-actions">
                <button
                  type="button"
                  className="rt-tool-btn"
                  onClick={() => move(index, -1)}
                  disabled={index === 0}
                  aria-label={`Move ${labelFor(field)} up`}
                >
                  ↑
                </button>
                <button
                  type="button"
                  className="rt-tool-btn"
                  onClick={() => move(index, 1)}
                  disabled={index === selected.length - 1}
                  aria-label={`Move ${labelFor(field)} down`}
                >
                  ↓
                </button>
                <button
                  type="button"
                  className="rt-tool-btn"
                  onClick={() => remove(index)}
                  aria-label={`Remove ${labelFor(field)}`}
                >
                  ✕
                </button>
              </span>
            </li>
          ))}
        </ul>
      )}
      <div className="content-field-label">Add a field</div>
      <p className="content-derived-hint">
        Every field listed here exists in the document model and can be added, removed and added
        again.  A selected field whose value is empty in Document Information is omitted from the
        rendered output until you fill that value in.
      </p>
      {available.length === 0 ? (
        <p className="content-derived-hint">Every supported field is already selected.</p>
      ) : (
        <ul className="structural-field-list" role="list">
          {available.map((choice) => (
            <li key={choice.field} className="structural-field-row">
              <span className="structural-field-label">{choice.label}</span>
              <span className="structural-field-actions">
                <button
                  type="button"
                  className="rt-tool-btn"
                  onClick={() => add(choice.field as CoverVisibleMetadataField)}
                  aria-label={`Add ${choice.label}`}
                >
                  +
                </button>
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Revision history
// ─────────────────────────────────────────────────────────────────────────────

/** Add / edit / remove revision entries.  This is manually edited document content, not Track Changes. */
export function RevisionHistoryEditor({
  blockId,
  data,
  onAction,
  onError,
}: StructuralEditorProps & { data: RevisionHistoryBlockData }) {
  const commit = (action: StructuralContentAction): StructuralContentActionResult =>
    dispatchCommit(onAction, onError, blockId, action);
  const addEntry = () => commit({ action: 'add-revision-entry' });
  const removeEntry = (entryId: DocUUID) => commit({ action: 'remove-revision-entry', entryId });
  const patch = (entryId: DocUUID, field: 'revision' | 'date' | 'author' | 'description', value: string) =>
    commit({ action: 'update-revision-entry', entryId, patch: { [field]: value } });

  return (
    <div className="structural-editor">
      <p className="content-derived-hint">
        A manually edited revision table for this document.  It is not automatic Track Changes and
        not a tamper-proof audit trail — it stores exactly what you type here.
      </p>
      {data.entries.length === 0 ? (
        <p className="content-derived-hint">No revision entries yet.  Add the first entry below.</p>
      ) : (
        <ul className="structural-entry-list" role="list">
          {data.entries.map((entry) => (
            <li key={entry.id} className="structural-entry-card">
              <div className="content-row">
                <div className="content-field content-field--stack">
                  <label className="content-field-label" htmlFor={`rev-num-${entry.id}`}>
                    Revision
                  </label>
                  <input
                    id={`rev-num-${entry.id}`}
                    className="content-text-input"
                    type="text"
                    defaultValue={entry.revision}
                    onBlur={(event) => patch(entry.id, 'revision', event.target.value)}
                    placeholder="e.g. 1 or Rev A"
                  />
                </div>
                <div className="content-field content-field--stack">
                  <label className="content-field-label" htmlFor={`rev-date-${entry.id}`}>
                    Date
                  </label>
                  <input
                    id={`rev-date-${entry.id}`}
                    className="content-text-input"
                    type="date"
                    defaultValue={entry.date === '' ? '' : entry.date.slice(0, 10)}
                    onBlur={(event) => patch(entry.id, 'date', event.target.value)}
                  />
                </div>
              </div>
              <div className="content-row">
                <div className="content-field content-field--stack">
                  <label className="content-field-label" htmlFor={`rev-author-${entry.id}`}>
                    Author
                  </label>
                  <input
                    id={`rev-author-${entry.id}`}
                    className="content-text-input"
                    type="text"
                    defaultValue={entry.author}
                    onBlur={(event) => patch(entry.id, 'author', event.target.value)}
                  />
                </div>
              </div>
              <div className="content-row">
                <div className="content-field content-field--stack">
                  <label className="content-field-label" htmlFor={`rev-desc-${entry.id}`}>
                    Change description
                  </label>
                  <textarea
                    id={`rev-desc-${entry.id}`}
                    className="rt-textarea"
                    rows={3}
                    defaultValue={entry.description}
                    onBlur={(event) => patch(entry.id, 'description', event.target.value)}
                  />
                </div>
              </div>
              <button
                type="button"
                className="block-action-btn block-action-btn--danger"
                onClick={() => removeEntry(entry.id)}
              >
                Remove entry
              </button>
            </li>
          ))}
        </ul>
      )}
      <button type="button" className="block-action-btn block-action-btn--wide" onClick={addEntry}>
        Add revision entry
      </button>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// References
// ─────────────────────────────────────────────────────────────────────────────

/** Block title + citation entries with safe URL handling. */
export function ReferenceEditor({
  blockId,
  data,
  onAction,
  onError,
}: StructuralEditorProps & { data: ReferenceBlockData }) {
  const commit = (action: StructuralContentAction): StructuralContentActionResult =>
    dispatchCommit(onAction, onError, blockId, action);
  const addEntry = () => commit({ action: 'add-reference-entry' });
  const removeEntry = (entryId: DocUUID) => commit({ action: 'remove-reference-entry', entryId });
  const patch = (entryId: DocUUID, field: 'key' | 'citation' | 'url', value: string) =>
    commit({ action: 'update-reference-entry', entryId, patch: { [field]: value } });

  return (
    <div className="structural-editor">
      <div className="content-field content-field--stack">
        <label className="content-field-label" htmlFor={`ref-title-${blockId}`}>
          Reference list title (optional)
        </label>
        <input
          id={`ref-title-${blockId}`}
          className="content-text-input"
          type="text"
          defaultValue={data.title ?? ''}
          onBlur={(event) =>
            commit({ action: 'update-reference-title', title: event.target.value })
          }
          placeholder="e.g. References"
        />
      </div>
      <p className="content-derived-hint">
        Citations are ordered exactly as listed.  A URL is stored only when it is a safe http,
        https or mailto link; anything else stays ordinary non-clickable text in the PDF.
      </p>
      {data.entries.length === 0 ? (
        <p className="content-derived-hint">No references yet.  Add the first citation below.</p>
      ) : (
        <ul className="structural-entry-list" role="list">
          {data.entries.map((entry) => (
            <li key={entry.id} className="structural-entry-card">
              <div className="content-row">
                <div className="content-field content-field--stack">
                  <label className="content-field-label" htmlFor={`ref-key-${entry.id}`}>
                    Key / number
                  </label>
                  <input
                    id={`ref-key-${entry.id}`}
                    className="content-text-input"
                    type="text"
                    defaultValue={entry.key}
                    onBlur={(event) => patch(entry.id, 'key', event.target.value)}
                    placeholder="[1]"
                  />
                </div>
              </div>
              <div className="content-row">
                <div className="content-field content-field--stack">
                  <label className="content-field-label" htmlFor={`ref-cite-${entry.id}`}>
                    Citation
                  </label>
                  <textarea
                    id={`ref-cite-${entry.id}`}
                    className="rt-textarea"
                    rows={3}
                    defaultValue={entry.citation}
                    onBlur={(event) => patch(entry.id, 'citation', event.target.value)}
                  />
                </div>
              </div>
              <div className="content-row">
                <div className="content-field content-field--stack">
                  <label className="content-field-label" htmlFor={`ref-url-${entry.id}`}>
                    URL (optional)
                  </label>
                  <input
                    id={`ref-url-${entry.id}`}
                    className="content-text-input"
                    type="text"
                    defaultValue={entry.url ?? ''}
                    onBlur={(event) => patch(entry.id, 'url', event.target.value)}
                    placeholder="https://…"
                  />
                </div>
              </div>
              <button
                type="button"
                className="block-action-btn block-action-btn--danger"
                onClick={() => removeEntry(entry.id)}
              >
                Remove reference
              </button>
            </li>
          ))}
        </ul>
      )}
      <button type="button" className="block-action-btn block-action-btn--wide" onClick={addEntry}>
        Add reference
      </button>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Exhibit / annexure
// ─────────────────────────────────────────────────────────────────────────────

/** Label / title / notes plus an optional embedded-image asset reference. */
export function ExhibitEditor({
  blockId,
  data,
  assets,
  onAction,
  onError,
}: StructuralEditorProps & { data: ExhibitBlockData; assets: readonly AssetRecord[] }) {
  const commit = (action: StructuralContentAction): StructuralContentActionResult =>
    dispatchCommit(onAction, onError, blockId, action);
  const imageAssets = React.useMemo(
    () => assets.filter((asset) => asset.mimeType.startsWith('image/')),
    [assets],
  );
  const referenced = data.assetId !== undefined ? assets.find((a) => a.id === data.assetId) : undefined;
  const missingReference =
    data.assetId !== undefined && (referenced === undefined || !referenced.mimeType.startsWith('image/'));

  return (
    <div className="structural-editor">
      <div className="content-row">
        <div className="content-field content-field--stack">
          <label className="content-field-label" htmlFor={`exh-label-${blockId}`}>
            Exhibit label (required)
          </label>
          <input
            id={`exh-label-${blockId}`}
            className="content-text-input"
            type="text"
            defaultValue={data.label}
            onBlur={(event) => commit({ action: 'update-exhibit', patch: { label: event.target.value } })}
            placeholder="e.g. Exhibit A"
          />
        </div>
      </div>
      <div className="content-row">
        <div className="content-field content-field--stack">
          <label className="content-field-label" htmlFor={`exh-title-${blockId}`}>
            Title (optional)
          </label>
          <input
            id={`exh-title-${blockId}`}
            className="content-text-input"
            type="text"
            defaultValue={data.title ?? ''}
            onBlur={(event) => commit({ action: 'update-exhibit', patch: { title: event.target.value } })}
          />
        </div>
      </div>
      <div className="content-row">
        <div className="content-field content-field--stack">
          <label className="content-field-label" htmlFor={`exh-notes-${blockId}`}>
            Notes (optional)
          </label>
          <textarea
            id={`exh-notes-${blockId}`}
            className="rt-textarea"
            rows={3}
            defaultValue={data.notes ?? ''}
            onBlur={(event) => commit({ action: 'update-exhibit', patch: { notes: event.target.value } })}
          />
        </div>
      </div>
      <div className="content-field content-field--stack">
        <label className="content-field-label" htmlFor={`exh-asset-${blockId}`}>
          Attached image asset (optional)
        </label>
        <select
          id={`exh-asset-${blockId}`}
          className="content-select"
          value={data.assetId ?? ''}
          onChange={(event) =>
            commit({
              action: 'update-exhibit',
              patch: { assetId: event.target.value === '' ? null : event.target.value },
            })
          }
        >
          <option value="">(no asset attached)</option>
          {missingReference ? (
            <option value={data.assetId}>⚠ Referenced asset is missing or not an image</option>
          ) : null}
          {imageAssets.map((asset) => (
            <option key={asset.id} value={asset.id}>
              {asset.filename}
            </option>
          ))}
        </select>
        <small className="content-derived-hint">
          Only embedded image assets of this document can be attached.  File (PDF) attachments are
          not supported by this schema version.
        </small>
        {imageAssets.length === 0 ? (
          <p className="content-derived-hint">
            This document has no embedded image assets yet, so there is nothing to attach.  Image
            import arrives with P06-M4; the exhibit still stores its label, title and notes.
          </p>
        ) : null}
      </div>
    </div>
  );
}
