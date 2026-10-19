import React, { useEffect, useRef, useState } from 'react';
import type { BulletStyle, ListBlockData, ListType, NumberStyle } from '../../types/blocks';
import type { DocUUID } from '../../types/document';
import {
  BULLET_STYLES,
  MAX_LIST_DEPTH,
  NUMBER_STYLES,
  type ListContentAction,
  type ListContentActionResult,
} from '../../services/list-callout-content';
import { computeListLabels } from '../../services/list-numbering';
import { remapSpansAfterTextEdit, spansToPlainText } from '../../services/rich-text';

interface ListContentEditorProps {
  /** Stable ID of the list block being edited. */
  blockId: DocUUID;
  /** Authoritative list data rendered straight from the document model. */
  data: ListBlockData;
  /** Commit one validated list action (P05-M3 dispatcher). */
  onListContentAction: (
    blockId: DocUUID,
    action: ListContentAction,
  ) => ListContentActionResult;
  /** Surface a service-level rejection inline. */
  onLocalError: (message: string) => void;
}

/** Human labels for the model's bullet styles (editor select). */
const BULLET_LABELS: Record<BulletStyle, string> = {
  disc: 'Disc (•)',
  circle: 'Circle (◦)',
  square: 'Square (▪)',
  dash: 'Dash (–)',
  arrow: 'Arrow (›)',
};

/** Human labels for the model's numbering styles (editor select). */
const NUMBER_LABELS: Record<string, string> = {
  decimal: 'Decimal — 1, 2, 3',
  'lower-alpha': 'Lowercase letters — a, b, c',
  'upper-alpha': 'Uppercase letters — A, B, C',
  'lower-roman': 'Lowercase Roman — i, ii, iii',
  'upper-roman': 'Uppercase Roman — I, II, III',
};

/** Editor-only marker preview glyphs (browser fonts — no PDF constraint). */
const BULLET_GLYPHS: Record<BulletStyle, string> = {
  disc: '•',
  circle: '◦',
  square: '▪',
  dash: '–',
  arrow: '›',
};

/** Characters a single-line item must never store (see paragraph editor). */
// eslint-disable-next-line no-control-regex
const CONTROL_CHARS = /[\u0000-\u001f\u007f-\u009f]/g;

/**
 * Content editor for the selected LIST block (project_details §10.4).
 *
 * Every control commits through the immutable list actions (P05-M3) —
 * the inputs are controlled by the document model, so there is no second
 * copy of the list state in component memory.  Item text edits replay
 * onto the item's spans with the P05-M2 `remapSpansAfterTextEdit`
 * algebra, so inline formatting survives normal editing; numbering is
 * derived (never stored) with the SAME engine the renderer uses.  New
 * items receive fresh stable IDs and keyboard focus; add/remove/move/
 * indent/outdent controls carry truthful disabled states, and the
 * service re-validates every action regardless.
 */
export const ListContentEditor: React.FC<ListContentEditorProps> = ({
  blockId,
  data,
  onListContentAction,
  onLocalError,
}) => {
  const inputRefs = useRef<Record<string, HTMLInputElement | null>>({});
  const [focusItemId, setFocusItemId] = useState<DocUUID | null>(null);

  // After "add", move keyboard focus to the freshly created item.
  useEffect(() => {
    if (focusItemId === null) return;
    inputRefs.current[focusItemId]?.focus();
    setFocusItemId(null);
  }, [focusItemId, data.items]);

  const { items } = data;
  // Derived numbering preview — the exact labels the renderer prints.
  const labels = data.listType === 'numbered' ? computeListLabels(items, data.numberStyle) : null;

  const report = (action: ListContentAction): void => {
    const result = onListContentAction(blockId, action);
    if (!result.ok) onLocalError(result.message);
  };

  const addItemAfter = (afterItemId: DocUUID | null): void => {
    const result = onListContentAction(blockId, { kind: 'item-add', afterItemId });
    if (!result.ok) {
      onLocalError(result.message);
      return;
    }
    if (result.itemId !== undefined) setFocusItemId(result.itemId);
  };

  /** Replay a plain-text edit onto the item's span model. */
  const handleItemText = (itemId: DocUUID, nextPlain: string): void => {
    const item = items.find((entry) => entry.id === itemId);
    if (item === undefined) return;
    report({
      kind: 'item-text',
      itemId,
      spans: remapSpansAfterTextEdit(item.spans, nextPlain),
    });
    // The document round-trips synchronously; restore the caret the
    // browser had before React re-rendered the controlled input.
    window.requestAnimationFrame(() => {
      const el = inputRefs.current[itemId];
      if (el !== null && el !== undefined) {
        const pos = el.selectionStart;
        el.setSelectionRange(pos, pos);
      }
    });
  };

  /** Sibling boundary detection mirrors the service's subtree rules so
   *  the move buttons' disabled state is truthful, not approximate. */
  const hasPrevSibling = (index: number): boolean => {
    const depth = items[index].depth;
    for (let j = index - 1; j >= 0; j -= 1) {
      if (items[j].depth === depth) return true;
      if (items[j].depth < depth) return false; // ancestor reached first
    }
    return false;
  };
  const hasNextSibling = (index: number): boolean => {
    const depth = items[index].depth;
    let j = index + 1;
    while (j < items.length && items[j].depth > depth) j += 1; // skip subtree
    return j < items.length && items[j].depth === depth;
  };

  const markerFor = (index: number): string => {
    if (labels !== null) return labels[index];
    return BULLET_GLYPHS[data.bulletStyle];
  };

  return (
    <div className="block-content-panel" aria-label="List content">
      <span className="content-panel-title">List content</span>

      <div className="content-row">
        <label className="content-field" htmlFor={`ds-list-type-${blockId}`}>
          <span className="content-field-label">List type</span>
          <select
            id={`ds-list-type-${blockId}`}
            className="content-select"
            value={data.listType}
            onChange={(e) =>
              report({ kind: 'settings', patch: { listType: e.target.value as ListType } })
            }
          >
            <option value="bullet">Bulleted</option>
            <option value="numbered">Numbered</option>
            <option value="checklist">Checklist</option>
          </select>
        </label>
        {data.listType === 'bullet' && (
          <label className="content-field" htmlFor={`ds-list-bullet-${blockId}`}>
            <span className="content-field-label">Bullet style</span>
            <select
              id={`ds-list-bullet-${blockId}`}
              className="content-select"
              value={data.markerSource === 'block' ? data.bulletStyle : 'theme'}
              onChange={(e) => {
                const value = e.target.value;
                report({
                  kind: 'settings',
                  patch:
                    value === 'theme'
                      ? { markerSource: 'theme' }
                      : { bulletStyle: value as BulletStyle, markerSource: 'block' },
                });
              }}
            >
              <option value="theme">Theme default</option>
              {BULLET_STYLES.map((style) => (
                <option key={style} value={style}>
                  {BULLET_LABELS[style]}
                </option>
              ))}
            </select>
          </label>
        )}
        {data.listType === 'numbered' && (
          <label className="content-field" htmlFor={`ds-list-number-${blockId}`}>
            <span className="content-field-label">Numbering</span>
            <select
              id={`ds-list-number-${blockId}`}
              className="content-select"
              value={data.numberStyle}
              onChange={(e) =>
                report({
                  kind: 'settings',
                  patch: { numberStyle: e.target.value as NumberStyle },
                })
              }
            >
              {NUMBER_STYLES.map((style) => (
                <option key={style} value={style}>
                  {NUMBER_LABELS[style]}
                </option>
              ))}
            </select>
          </label>
        )}
        {data.listType === 'checklist' && (
          <span className="content-derived-hint">Tick items to mark them complete.</span>
        )}
      </div>

      {items.length === 0 ? (
        <p className="content-derived-hint">No items yet — add the first item below.</p>
      ) : (
        <ul className="list-items" aria-label="List items">
          {items.map((item, index) => {
            const position = index + 1;
            return (
              <li
                key={item.id}
                className="list-item-row"
                style={{ paddingLeft: `${item.depth * 14}px` }}
              >
                {data.listType === 'checklist' ? (
                  <input
                    type="checkbox"
                    className="list-item-check"
                    checked={item.checked === true}
                    aria-label={`Item ${position} checked`}
                    onChange={(e) =>
                      report({
                        kind: 'item-checked',
                        itemId: item.id,
                        checked: e.target.checked,
                      })
                    }
                  />
                ) : (
                  <span className="list-item-marker" aria-hidden="true">
                    {markerFor(index)}
                  </span>
                )}
                <input
                  ref={(el) => {
                    inputRefs.current[item.id] = el;
                  }}
                  data-ds-item-input={item.id}
                  className="content-text-input list-item-input"
                  type="text"
                  value={spansToPlainText(item.spans)}
                  placeholder="List item"
                  aria-label={`List item ${position}`}
                  onChange={(e) => handleItemText(item.id, e.target.value.replace(CONTROL_CHARS, ''))}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      addItemAfter(item.id);
                    }
                  }}
                />
                <span className="list-item-buttons">
                  <button
                    type="button"
                    className="rt-tool-btn"
                    title="Move this item up"
                    aria-label={`Move item ${position} up`}
                    disabled={!hasPrevSibling(index)}
                    onClick={() => report({ kind: 'item-move', itemId: item.id, direction: 'up' })}
                  >
                    <span aria-hidden="true">↑</span>
                  </button>
                  <button
                    type="button"
                    className="rt-tool-btn"
                    title="Move this item down"
                    aria-label={`Move item ${position} down`}
                    disabled={!hasNextSibling(index)}
                    onClick={() => report({ kind: 'item-move', itemId: item.id, direction: 'down' })}
                  >
                    <span aria-hidden="true">↓</span>
                  </button>
                  <button
                    type="button"
                    className="rt-tool-btn"
                    title="Indent this item one level"
                    aria-label={`Indent item ${position}`}
                    disabled={item.depth >= MAX_LIST_DEPTH}
                    onClick={() => report({ kind: 'item-indent', itemId: item.id })}
                  >
                    <span aria-hidden="true">⇥</span>
                  </button>
                  <button
                    type="button"
                    className="rt-tool-btn"
                    title="Outdent this item one level"
                    aria-label={`Outdent item ${position}`}
                    disabled={item.depth <= 0}
                    onClick={() => report({ kind: 'item-outdent', itemId: item.id })}
                  >
                    <span aria-hidden="true">⇤</span>
                  </button>
                  <button
                    type="button"
                    className="rt-tool-btn"
                    title="Remove this item"
                    aria-label={`Remove item ${position}`}
                    onClick={() => report({ kind: 'item-remove', itemId: item.id })}
                  >
                    <span aria-hidden="true">✕</span>
                  </button>
                </span>
              </li>
            );
          })}
        </ul>
      )}

      <button
        type="button"
        className="block-action-btn block-action-btn--wide"
        onClick={() => addItemAfter(items.length > 0 ? items[items.length - 1].id : null)}
      >
        Add item
      </button>

      <p className="content-derived-hint">
        {data.listType === 'numbered'
          ? `Derived numbering prints “${labels?.slice(0, 3).join('” “') ?? '—'}” in preview and export — never stored in item text.`
          : data.listType === 'bullet'
            ? `Markers render from the ${
                data.markerSource === 'block' ? "list's stored bullet style" : "document theme's default marker"
              }.`
            : 'Checked state is stored per item and survives reordering and re-nesting.'}
      </p>
    </div>
  );
};
