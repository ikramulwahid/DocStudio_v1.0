import React, { useEffect, useMemo, useRef, useState } from 'react';
import type { InlineSpan, ParagraphAlignment } from '../../types/blocks';
import type { DocUUID } from '../../types/document';
import {
  MAX_PARAGRAPH_INDENT,
  type ContentActionResult,
  type ParagraphContentPatch,
} from '../../services/block-content';
import {
  applySpanColor,
  applySpanFormatting,
  applySpanLink,
  clearSpanFormatting,
  hrefOverRange,
  isFlagActiveOverRange,
  normalizeHexColor,
  remapSpansAfterTextEdit,
  sanitizeHref,
  spansToPlainText,
  type CharRange,
  type RichTextError,
  type SpanStyleFlag,
} from '../../services/rich-text';

interface ParagraphContentEditorProps {
  /** Stable ID of the paragraph block being edited. */
  blockId: DocUUID;
  /** Authoritative paragraph data rendered from the document model. */
  spans: readonly InlineSpan[];
  hAlign: ParagraphAlignment;
  indentLevel: number;
  /** Commit a validated paragraph content patch (P05-M2). */
  onParagraphContentChange: (
    blockId: DocUUID,
    patch: ParagraphContentPatch,
  ) => ContentActionResult;
  /** Surface an algebra-level rejection (bad link, bad colour, …). */
  onLocalError: (message: string) => void;
}

const ALIGNMENTS: readonly ParagraphAlignment[] = ['left', 'center', 'right', 'justify'];

/** Style flags in toolbar order — B / I / U / S. */
const STYLE_FLAGS: readonly { flag: SpanStyleFlag; label: string; hint: string }[] = [
  { flag: 'bold', label: 'B', hint: 'Bold' },
  { flag: 'italic', label: 'I', hint: 'Italic' },
  { flag: 'underline', label: 'U', hint: 'Underline' },
  { flag: 'strikethrough', label: 'S', hint: 'Strikethrough' },
];

/**
 * Remove characters a paragraph must never store: C0/C1 control codes and
 * line breaks (a paragraph is ONE text flow — line breaks are separate
 * paragraph blocks, and the renderer wraps long lines itself).
 */
function sanitizePastedText(raw: string): string {
  // eslint-disable-next-line no-control-regex
  return raw.replace(/[\u0000-\u001f\u007f-\u009f]/g, ' ').replace(/ +/g, ' ');
}

/** Narrow the algebra's union result without relying on strict-mode narrowing. */
function isRichTextError(
  result: InlineSpan[] | RichTextError,
): result is RichTextError {
  return !Array.isArray(result);
}

/** Read the textarea's LIVE selection, clamped to its current value. */
function liveSelection(el: HTMLTextAreaElement | null): CharRange {
  if (el === null) return { start: 0, end: 0 };
  const start = Math.min(el.selectionStart, el.value.length);
  const end = Math.max(start, Math.min(el.selectionEnd, el.value.length));
  return { start, end };
}

/**
 * Resolve the target of a colour/highlight action (P05-FIX-01).
 *
 * The authoritative target is the range FROZEN when the colour control was
 * activated (`onMouseDown`/`onKeyDown` — both fire before the control takes
 * focus, so the textarea's selection is still the user's chosen one).  If no
 * freeze happened (programmatic activation), the textarea's live selection is
 * used only while it is non-empty.  A collapsed caret yields an EMPTY target
 * — we never fall back to an earlier, stale range, so every formatting
 * action has one clear, predictable target.
 */
function resolveApplyTarget(
  frozen: CharRange | null,
  el: HTMLTextAreaElement | null,
): CharRange {
  if (frozen !== null) return frozen;
  const live = liveSelection(el);
  return live.end > live.start ? live : { start: 0, end: 0 };
}

/**
 * Content editor for the selected PARAGRAPH block (project_details §10.2).
 *
 * The textarea edits the PLAIN-TEXT projection of the authoritative spans;
 * every keystroke is replayed onto the spans with the pure
 * `remapSpansAfterTextEdit` algebra, so inline formatting survives normal
 * editing.  Toolbar actions (bold/italic/underline/strikethrough, link,
 * colour, highlight, clear) operate on the current selection range through
 * the same pure algebra and are committed as document data — formatting
 * never lives only in transient editor state.  Pasted text is sanitised to
 * plain text (control codes and line breaks removed) before insertion.
 */
export const ParagraphContentEditor: React.FC<ParagraphContentEditorProps> = ({
  blockId,
  spans,
  hAlign,
  indentLevel,
  onParagraphContentChange,
  onLocalError,
}) => {
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const [selection, setSelection] = useState<CharRange>({ start: 0, end: 0 });
  const [linkDraft, setLinkDraft] = useState('');
  // P05-FIX-01: the colour controls are STATE-BACKED so the chosen colour
  // stays reflected after applying it (they used to be hard-wired to
  // #c0392b / #f9e79f, which made React re-vert the input after every pick).
  const [fontColorChoice, setFontColorChoice] = useState('#c0392b');
  const [highlightChoice, setHighlightChoice] = useState('#f9e79f');
  const colorInputRef = useRef<HTMLInputElement | null>(null);
  const highlightInputRef = useRef<HTMLInputElement | null>(null);
  /** Formatting target frozen when a colour control is activated. */
  const pendingTargetRef = useRef<CharRange | null>(null);
  /** Latest props for the native picker listeners (see useEffect below). */
  const latestRef = useRef({ spans, blockId, onParagraphContentChange, onLocalError });

  useEffect(() => {
    latestRef.current = { spans, blockId, onParagraphContentChange, onLocalError };
  });

  const plain = useMemo(() => spansToPlainText(spans), [spans]);
  const range: CharRange = {
    start: Math.min(selection.start, plain.length),
    end: Math.min(selection.end, plain.length),
  };
  const hasSelection = range.end > range.start;

  /** Track the textarea selection so toolbar actions know their range. */
  const syncSelection = (): void => {
    const el = textareaRef.current;
    if (el === null) return;
    const start = Math.min(el.selectionStart, el.value.length);
    const end = Math.max(start, Math.min(el.selectionEnd, el.value.length));
    setSelection({ start, end });
  };

  /**
   * P05-FIX-01: freeze the formatting target from the LIVE textarea
   * selection the moment a colour control is ACTIVATED.  `onMouseDown` /
   * `onKeyDown` fire before the control takes focus, i.e. before the
   * picker can move focus or the engine can replay a (possibly collapsed)
   * `select` event on the blurred textarea — so the frozen range is exactly
   * what the user had selected.  A collapsed caret freezes an EMPTY target
   * (never a stale earlier range): each action gets one predictable target.
   */
  const captureTarget = (): void => {
    const target = liveSelection(textareaRef.current);
    pendingTargetRef.current = target;
    setSelection(target);
  };

  /** Commit a rewritten span list produced by the pure algebra. */
  const commitSpans = (next: InlineSpan[]): void => {
    onParagraphContentChange(blockId, { spans: next });
  };

  const handleAlgebraResult = (result: InlineSpan[] | RichTextError): void => {
    if (isRichTextError(result)) {
      onLocalError(result.message);
      return;
    }
    commitSpans(result);
  };

  /**
   * P05-FIX-01: apply colour/highlight from NATIVE `input`/`change`
   * listeners on the colour inputs.
   *
   * React's synthetic `onChange` for `type="color"` consults its input
   * value tracker and SILENTLY DROPS the event whenever the picked value
   * reached the input through the JavaScript `value` setter (tracker and
   * DOM already agree) — the owner saw exactly that: the picker opened,
   * a colour was chosen, and nothing formatted with no feedback.  Native
   * listeners are not subject to that suppression, so they are the
   * authoritative applying path; React's `onChange` below only mirrors the
   * swatch display state when it fires.
   *
   * The target is the range frozen at activation; focus and selection are
   * restored to the textarea when the picker completes (`change`).
   */
  useEffect(() => {
    const applyFromControl = (kind: 'color' | 'highlight', eventType: string): void => {
      const p = latestRef.current;
      const input = kind === 'color' ? colorInputRef.current : highlightInputRef.current;
      if (input === null) return;
      const raw = input.value;
      // Keep the control reflecting the chosen colour (even when the apply
      // itself is rejected — the notice explains why nothing was formatted).
      const norm = normalizeHexColor(raw);
      if (norm !== null) {
        if (kind === 'color') setFontColorChoice(norm);
        else setHighlightChoice(norm);
      }
      const target = resolveApplyTarget(pendingTargetRef.current, textareaRef.current);
      const restoreFocus = (): void => {
        const el = textareaRef.current;
        if (el !== null && eventType === 'change') {
          el.focus();
          el.setSelectionRange(target.start, target.end);
        }
      };
      if (target.end <= target.start) {
        p.onLocalError('Select some text before changing its colour.');
        restoreFocus();
        return;
      }
      const result = applySpanColor(p.spans, target, kind, raw);
      if (isRichTextError(result)) {
        p.onLocalError(result.message);
        restoreFocus();
        return;
      }
      p.onParagraphContentChange(p.blockId, { spans: result });
      setSelection(target);
      restoreFocus();
    };
    const onColor = (e: Event): void => applyFromControl('color', e.type);
    const onHighlight = (e: Event): void => applyFromControl('highlight', e.type);
    const colorEl = colorInputRef.current;
    const highlightEl = highlightInputRef.current;
    colorEl?.addEventListener('input', onColor);
    colorEl?.addEventListener('change', onColor);
    highlightEl?.addEventListener('input', onHighlight);
    highlightEl?.addEventListener('change', onHighlight);
    return () => {
      colorEl?.removeEventListener('input', onColor);
      colorEl?.removeEventListener('change', onColor);
      highlightEl?.removeEventListener('input', onHighlight);
      highlightEl?.removeEventListener('change', onHighlight);
    };
  }, []);

  /** Replay a plain-text edit (typing, cutting) onto the span model. */
  const handleTextChange = (nextPlain: string): void => {
    const remapped = remapSpansAfterTextEdit(spans, nextPlain);
    commitSpans(remapped);
    // The document round-trips synchronously; restore the caret the browser
    // had before React re-rendered the controlled textarea.
    window.requestAnimationFrame(() => {
      const el = textareaRef.current;
      if (el !== null) el.setSelectionRange(el.selectionStart, el.selectionEnd);
    });
  };

  /** Paste as sanitised PLAIN TEXT — rich clipboard formats are discarded. */
  const handlePaste = (event: React.ClipboardEvent<HTMLTextAreaElement>): void => {
    event.preventDefault();
    const el = textareaRef.current;
    if (el === null) return;
    const clean = sanitizePastedText(event.clipboardData.getData('text/plain'));
    if (clean === '') return;
    const start = Math.min(el.selectionStart, plain.length);
    const end = Math.max(start, Math.min(el.selectionEnd, plain.length));
    const nextPlain = plain.slice(0, start) + clean + plain.slice(end);
    handleTextChange(nextPlain);
  };

  const toggleStyle = (flag: SpanStyleFlag): void => {
    if (!hasSelection) {
      onLocalError('Select some text before applying formatting.');
      return;
    }
    const on = !isFlagActiveOverRange(spans, range, flag);
    handleAlgebraResult(applySpanFormatting(spans, range, flag, on));
  };

  /**
   * P05-FIX-01: apply/clear a colour from the toolbar BUTTONS (A× / ×)
   * through the same frozen-target rules as the pickers: the target is the
   * range frozen on this control's `onMouseDown`/`onKeyDown`, feedback
   * appears when it is empty, and focus/selection return to the text.
   */
  const applyColor = (kind: 'color' | 'highlight', value: string | null): void => {
    const target = resolveApplyTarget(pendingTargetRef.current, textareaRef.current);
    if (target.end <= target.start) {
      onLocalError('Select some text before changing its colour.');
      textareaRef.current?.focus();
      return;
    }
    handleAlgebraResult(applySpanColor(spans, target, kind, value));
    if (value !== null) {
      const norm = normalizeHexColor(value);
      if (norm !== null) {
        if (kind === 'color') setFontColorChoice(norm);
        else setHighlightChoice(norm);
      }
    }
    setSelection(target);
    const el = textareaRef.current;
    if (el !== null) {
      el.focus();
      el.setSelectionRange(target.start, target.end);
    }
  };

  const applyLink = (): void => {
    if (!hasSelection) {
      onLocalError('Select some text before adding a link.');
      return;
    }
    const trimmed = linkDraft.trim();
    if (trimmed === '') {
      handleAlgebraResult(applySpanLink(spans, range, null));
      return;
    }
    // Surface an unsafe target BEFORE committing, so the draft is not lost.
    if (sanitizeHref(trimmed) === null) {
      onLocalError(
        'Links must be web addresses (https://…) or email addresses (mailto:…). ' +
          'Scripts and other file types are not allowed.',
      );
      return;
    }
    handleAlgebraResult(applySpanLink(spans, range, trimmed));
  };

  const clearFormatting = (): void => {
    if (!hasSelection) {
      onLocalError('Select some text before clearing formatting.');
      return;
    }
    handleAlgebraResult(clearSpanFormatting(spans, range));
  };

  /** Live preview of the stored formatting, rendered with native elements. */
  const renderPreview = (): React.ReactNode =>
    spans.length === 0 ? (
      <span className="content-preview-empty">Nothing to preview yet.</span>
    ) : (
      spans.map((span, index) => {
        let node: React.ReactNode = span.text;
        if (span.bold === true) node = <strong>{node}</strong>;
        if (span.italic === true) node = <em>{node}</em>;
        if (span.underline === true) node = <u>{node}</u>;
        if (span.strikethrough === true) node = <s>{node}</s>;
        if (span.color !== undefined) {
          node = (
            <span style={{ color: span.color }}>{node}</span>
          );
        }
        if (span.highlight !== undefined) {
          node = (
            <span style={{ backgroundColor: span.highlight }}>{node}</span>
          );
        }
        if (span.href !== undefined) {
          node = (
            <a href={span.href} target="_blank" rel="noreferrer noopener">
              {node}
            </a>
          );
        }
        return <React.Fragment key={index}>{node}</React.Fragment>;
      })
    );

  return (
    <div className="block-content-panel" aria-label="Paragraph content">
      <span className="content-panel-title">Paragraph content</span>

      {/* ── Formatting toolbar ─────────────────────────────────────────── */}
      <div className="rt-toolbar" role="toolbar" aria-label="Text formatting">
        {STYLE_FLAGS.map(({ flag, label, hint }) => (
          <button
            key={flag}
            type="button"
            className={`rt-tool-btn rt-tool-btn--${flag}`}
            aria-pressed={hasSelection && isFlagActiveOverRange(spans, range, flag)}
            title={`${hint} (select text first)`}
            onClick={() => toggleStyle(flag)}
          >
            {label}
          </button>
        ))}
        <span className="rt-toolbar-sep" aria-hidden="true" />
        <label
          className="rt-color-field"
          title="Font colour"
          onMouseDown={captureTarget}
          onKeyDown={captureTarget}
        >
          <span className="rt-color-label">A</span>
          <input
            ref={colorInputRef}
            type="color"
            className="rt-color-input"
            value={fontColorChoice}
            aria-label="Font colour for the selected text"
            onChange={(e) => setFontColorChoice(e.target.value)}
          />
        </label>
        <button
          type="button"
          className="rt-tool-btn"
          title="Remove the font colour from the selected text"
          onMouseDown={captureTarget}
          onKeyDown={captureTarget}
          onClick={() => applyColor('color', null)}
        >
          A×
        </button>
        <label
          className="rt-color-field"
          title="Highlight colour"
          onMouseDown={captureTarget}
          onKeyDown={captureTarget}
        >
          <span className="rt-color-label rt-color-label--mark">MARK</span>
          <input
            ref={highlightInputRef}
            type="color"
            className="rt-color-input"
            value={highlightChoice}
            aria-label="Highlight colour for the selected text"
            onChange={(e) => setHighlightChoice(e.target.value)}
          />
        </label>
        <button
          type="button"
          className="rt-tool-btn"
          title="Remove the highlight from the selected text"
          onMouseDown={captureTarget}
          onKeyDown={captureTarget}
          onClick={() => applyColor('highlight', null)}
        >
          ×
        </button>
        <span className="rt-toolbar-sep" aria-hidden="true" />
        <button
          type="button"
          className="rt-tool-btn"
          title="Remove all formatting from the selected text"
          onClick={clearFormatting}
        >
          Clear
        </button>
      </div>

      {/* ── Link row ───────────────────────────────────────────────────── */}
      <div className="rt-link-row">
        <input
          type="url"
          className="rt-link-input"
          placeholder="https://… or mailto:…"
          aria-label="Link address for the selected text"
          value={linkDraft}
          onChange={(e) => setLinkDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              applyLink();
            }
          }}
        />
        <button type="button" className="rt-tool-btn" onClick={applyLink}>
          Link
        </button>
        <button
          type="button"
          className="rt-tool-btn"
          title="Remove the link from the selected text"
          onClick={() => {
            setLinkDraft('');
            handleAlgebraResult(applySpanLink(spans, range, null));
          }}
        >
          Unlink
        </button>
        {hasSelection && (
          <span className="rt-link-hint">
            {hrefOverRange(spans, range) !== null
              ? `Selection links to ${hrefOverRange(spans, range)}`
              : 'No link on the selection'}
          </span>
        )}
      </div>

      {/* ── Text surface ───────────────────────────────────────────────── */}
      <textarea
        ref={textareaRef}
        className="rt-textarea"
        value={plain}
        aria-label="Paragraph text"
        placeholder="Type the paragraph text…"
        spellCheck
        onChange={(e) => handleTextChange(e.target.value)}
        onSelect={syncSelection}
        onKeyUp={syncSelection}
        onMouseUp={syncSelection}
        onPaste={handlePaste}
      />
      <p className="rt-surface-hint">
        Select text and use the toolbar. Pasting is always plain text; line breaks are removed —
        use separate paragraph blocks for separate lines.
      </p>

      {/* ── Formatted preview ──────────────────────────────────────────── */}
      <div className="content-preview" aria-label="Formatting preview">
        <span className="content-preview-title">Preview</span>
        <p className="content-preview-body">{renderPreview()}</p>
      </div>

      {/* ── Alignment & indentation ────────────────────────────────────── */}
      <div className="content-row">
        <label className="content-field" htmlFor={`ds-para-align-${blockId}`}>
          <span className="content-field-label">Alignment</span>
          <select
            id={`ds-para-align-${blockId}`}
            className="content-select"
            value={hAlign}
            onChange={(e) =>
              onParagraphContentChange(blockId, {
                hAlign: e.target.value as ParagraphAlignment,
              })
            }
          >
            {ALIGNMENTS.map((align) => (
              <option key={align} value={align}>
                {align.charAt(0).toUpperCase() + align.slice(1)}
              </option>
            ))}
          </select>
        </label>
        <label className="content-field" htmlFor={`ds-para-indent-${blockId}`}>
          <span className="content-field-label">Indent level</span>
          <select
            id={`ds-para-indent-${blockId}`}
            className="content-select"
            value={String(indentLevel)}
            onChange={(e) =>
              onParagraphContentChange(blockId, { indentLevel: Number(e.target.value) })
            }
          >
            {Array.from({ length: MAX_PARAGRAPH_INDENT + 1 }, (_, level) => (
              <option key={level} value={level}>
                {level}
              </option>
            ))}
          </select>
        </label>
      </div>
    </div>
  );
};
