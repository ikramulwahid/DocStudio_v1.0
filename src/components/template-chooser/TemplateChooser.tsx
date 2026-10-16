import React, { useEffect, useMemo, useRef, useState } from 'react';
import type { DocStudioTemplate, TemplateCategory, TemplateSection } from '../../types/template';
import { TEMPLATE_CATEGORIES } from '../../types/template';
import {
  BLANK_CHOICE_ID,
  buildChoiceList,
  filterTemplates,
  type TemplateChoice,
} from '../../services/template-chooser';
import {
  DEFAULT_NEW_SECTION_NAME,
  addSection,
  draftFor,
  isTemplateDraftModified,
  moveSection,
  removeSection,
  renameSection,
  updateSectionDescription,
  updateSectionPrompt,
  withDraftResult,
  type SectionMoveDirection,
  type TemplateCustomizationResult,
} from '../../services/template-customization';
import './TemplateChooser.css';

/**
 * New-document Template Chooser (P03-M2, extended P03-M4).
 *
 * An accessible modal that offers Blank Document as a first-class choice plus
 * the currently available templates, with free-text search (name/description/
 * tags) and category filtering driven by the single source of truth
 * (`TEMPLATE_CATEGORIES`).  Cancel (button, Escape, backdrop) resolves with
 * `null` and leaves the active document untouched — the App runs the
 * unsaved-change guard only after a real choice is confirmed.
 *
 * Section customization (P03-M4): a selected template can be edited through
 * the "Customize sections" panel — add, rename, remove, reorder sections and
 * edit their optional description/prompt.  All edits operate on a per-template
 * DRAFT stored in `drafts` (a deep copy resolved via `draftFor`), so the
 * built-in catalog, other templates' drafts and already-created documents are
 * never touched.  The choice list renders from `draftFor(drafts, template)`,
 * which makes the live section preview reflect the draft and makes the
 * confirmed `choice.template` the draft itself — `resolveChooserSelection`
 * then instantiates the document through the unchanged P03-M2 flow.  Drafts
 * live for the chooser session only (closing the chooser discards them;
 * re-opening starts from canonical content).  Blank Document never shows
 * section controls.
 *
 * Accessibility: role="dialog", aria-modal, labelled by title, initial focus
 * on the search box, Escape closes.  The category `<select>` is populated from
 * the centralized category list (no hardcoded labels).  Section rows keep
 * predictable keyboard focus after add/remove/move/reset operations.  This
 * component is a thin view over the pure `services/template-chooser` and
 * `services/template-customization` rules.
 */
interface TemplateChooserProps {
  /** Currently available templates (the built-in catalog for P03-M2). */
  templates: DocStudioTemplate[];
  /** Called with the confirmed choice, or `null` when cancelled. */
  onSelect: (choice: TemplateChoice | null) => void;
}

const categoryLabelFor = (category: TemplateCategory): string =>
  TEMPLATE_CATEGORIES.find((c) => c.id === category)?.label ?? category;

// ─────────────────────────────────────────────────────────────────────────────
// Section row (P03-M4) — one editable section in the customization panel
// ─────────────────────────────────────────────────────────────────────────────

interface SectionRowProps {
  section: TemplateSection;
  index: number;
  total: number;
  /** Commit a non-blank rename (the row pre-validates blank names inline). */
  onRename: (sectionId: string, name: string) => void;
  onDescription: (sectionId: string, value: string) => void;
  onPrompt: (sectionId: string, value: string) => void;
  onMove: (sectionId: string, direction: SectionMoveDirection) => void;
  onRemove: (sectionId: string) => void;
}

const SectionRow: React.FC<SectionRowProps> = ({
  section,
  index,
  total,
  onRename,
  onDescription,
  onPrompt,
  onMove,
  onRemove,
}) => {
  // Local text so an in-progress EMPTY name never reaches the draft (the
  // draft must always hold a validator-valid, non-blank section name).
  const [name, setName] = useState(section.name);
  const [nameError, setNameError] = useState<string | null>(null);
  const errorId = `section-name-error-${section.id}`;
  // A committed rename (or an external reset) surfaces through props; keep
  // the input in sync.  Verbatim storage means same-value sets are no-ops.
  useEffect(() => {
    setName(section.name);
  }, [section.name]);

  const changeName = (value: string): void => {
    setName(value);
    if (value.trim() === '') {
      setNameError('Section name cannot be empty.');
      return;
    }
    setNameError(null);
    onRename(section.id, value);
  };

  const blurName = (): void => {
    // Revert an uncommitted empty edit back to the draft's valid name.
    if (name.trim() === '') {
      setName(section.name);
      setNameError(null);
    }
  };

  const label = section.name;

  return (
    <li className="template-chooser-section-row" data-section-row={section.id} tabIndex={-1}>
      <div className="template-chooser-section-row-head">
        <span className="template-chooser-section-index" aria-hidden="true">
          {index + 1}
        </span>
        <label className="template-chooser-section-field template-chooser-section-name-field">
          <span className="template-chooser-section-field-label">Section name</span>
          <input
            type="text"
            className="template-chooser-section-input"
            data-section-name={section.id}
            value={name}
            aria-invalid={nameError !== null}
            aria-describedby={nameError ? errorId : undefined}
            onChange={(e) => changeName(e.target.value)}
            onBlur={blurName}
          />
        </label>
        <div className="template-chooser-section-buttons">
          <button
            type="button"
            className="template-chooser-section-btn"
            data-section-move-up={section.id}
            aria-label={`Move "${label}" up`}
            disabled={index === 0}
            onClick={() => onMove(section.id, 'up')}
          >
            &#9650;
          </button>
          <button
            type="button"
            className="template-chooser-section-btn"
            data-section-move-down={section.id}
            aria-label={`Move "${label}" down`}
            disabled={index === total - 1}
            onClick={() => onMove(section.id, 'down')}
          >
            &#9660;
          </button>
          <button
            type="button"
            className="template-chooser-section-btn template-chooser-section-btn--danger"
            data-section-remove={section.id}
            aria-label={`Remove "${label}"`}
            onClick={() => onRemove(section.id)}
          >
            Remove
          </button>
        </div>
      </div>
      {nameError && (
        <p className="template-chooser-section-name-error" id={errorId} role="alert">
          {nameError}
        </p>
      )}
      <label className="template-chooser-section-field">
        <span className="template-chooser-section-field-label">Description (optional)</span>
        <input
          type="text"
          className="template-chooser-section-input"
          data-section-description={section.id}
          value={section.description ?? ''}
          onChange={(e) => onDescription(section.id, e.target.value)}
        />
      </label>
      <label className="template-chooser-section-field">
        <span className="template-chooser-section-field-label">Author prompt (optional)</span>
        <input
          type="text"
          className="template-chooser-section-input"
          data-section-prompt={section.id}
          value={section.prompt ?? ''}
          onChange={(e) => onPrompt(section.id, e.target.value)}
        />
      </label>
    </li>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// Chooser
// ─────────────────────────────────────────────────────────────────────────────

export const TemplateChooser: React.FC<TemplateChooserProps> = ({ templates, onSelect }) => {
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState<TemplateCategory | null>(null);
  const [selectedId, setSelectedId] = useState<string>(BLANK_CHOICE_ID);
  // P03-M4: per-template-id section drafts for this chooser session.
  const [drafts, setDrafts] = useState<Record<string, DocStudioTemplate>>({});
  const [customizeOpen, setCustomizeOpen] = useState(false);
  const [sectionError, setSectionError] = useState<string | null>(null);
  /** CSS selector to focus once the next draft render lands. */
  const [pendingFocus, setPendingFocus] = useState<string | null>(null);
  /** Bumped on "Reset to original" so every row remounts with fresh input state. */
  const [resetToken, setResetToken] = useState(0);
  const searchRef = useRef<HTMLInputElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const dismissRef = useRef(onSelect);
  dismissRef.current = onSelect;

  useEffect(() => {
    searchRef.current?.focus();
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') dismissRef.current(null);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  // Predictable focus after add / remove / move / reset (see handlers below).
  useEffect(() => {
    if (pendingFocus === null) return;
    const el = dialogRef.current?.querySelector<HTMLElement>(pendingFocus);
    if (el) {
      el.focus();
      if (el instanceof HTMLInputElement) el.select();
    }
    setPendingFocus(null);
  }, [pendingFocus, drafts]);

  // Blank Document is always available; templates are filtered by query/category.
  // Drafts are resolved BEFORE filtering so search, category, previews and the
  // confirmed choice all operate on the same editable working copy.
  const displayTemplates = useMemo(
    () => templates.map((template) => draftFor(drafts, template)),
    [templates, drafts],
  );
  const visibleTemplates = useMemo(() => filterTemplates(displayTemplates, query, category), [
    displayTemplates,
    query,
    category,
  ]);
  const choices = useMemo(() => buildChoiceList(visibleTemplates, categoryLabelFor), [
    visibleTemplates,
  ]);
  // If the selected choice got filtered out, fall back to Blank Document so
  // the highlight and the confirmed choice never disagree.
  const effectiveSelectedId = choices.some((c) => c.id === selectedId)
    ? selectedId
    : (choices[0]?.id ?? BLANK_CHOICE_ID);
  const selected = choices.find((c) => c.id === effectiveSelectedId) ?? choices[0];

  // Pristine source (for "Reset to original" comparison) vs. current draft.
  const selectedSource =
    effectiveSelectedId === BLANK_CHOICE_ID
      ? undefined
      : templates.find((t) => t.id === effectiveSelectedId);
  const currentDraft = selectedSource ? draftFor(drafts, selectedSource) : undefined;
  const draftModified = useMemo(
    () =>
      selectedSource !== undefined &&
      currentDraft !== undefined &&
      isTemplateDraftModified(currentDraft, selectedSource),
    [currentDraft, selectedSource],
  );

  /** Store a customization result (failures surface inline, keep old draft). */
  const applyResult = (result: TemplateCustomizationResult): TemplateCustomizationResult => {
    if (result.ok) {
      setSectionError(null);
    } else {
      setSectionError(result.message ?? 'That section edit could not be applied.');
    }
    if (selectedSource) {
      setDrafts((prev) => withDraftResult(prev, selectedSource.id, result));
    }
    return result;
  };

  const handleAddSection = (): void => {
    if (!currentDraft) return;
    const result = applyResult(addSection(currentDraft, DEFAULT_NEW_SECTION_NAME));
    if (!result.ok) return;
    const added = result.draft.sections[result.draft.sections.length - 1];
    // Focus (and select) the new section's name so the user can rename at once.
    setPendingFocus(`[data-section-name="${added.id}"]`);
  };

  const handleRenameSection = (sectionId: string, name: string): void => {
    if (!currentDraft) return;
    applyResult(renameSection(currentDraft, sectionId, name));
  };

  const handleDescription = (sectionId: string, value: string): void => {
    if (!currentDraft) return;
    applyResult(updateSectionDescription(currentDraft, sectionId, value));
  };

  const handlePrompt = (sectionId: string, value: string): void => {
    if (!currentDraft) return;
    applyResult(updateSectionPrompt(currentDraft, sectionId, value));
  };

  const handleMoveSection = (sectionId: string, direction: SectionMoveDirection): void => {
    if (!currentDraft) return;
    const result = applyResult(moveSection(currentDraft, sectionId, direction));
    if (result.ok) {
      // Re-focus the moved section's row so repeated moves are one key away.
      setPendingFocus(`[data-section-row="${sectionId}"]`);
    }
  };

  const handleRemoveSection = (sectionId: string): void => {
    if (!currentDraft) return;
    const removedIndex = currentDraft.sections.findIndex((s) => s.id === sectionId);
    const result = applyResult(removeSection(currentDraft, sectionId));
    if (!result.ok || removedIndex < 0) return;
    // Focus the row that took this one's place, else the previous row's
    // Remove button, else (list empty) the Add section button.
    const sections = result.draft.sections;
    const target = sections[removedIndex] ?? sections[removedIndex - 1];
    setPendingFocus(
      target ? `[data-section-remove="${target.id}"]` : '[data-section-add]',
    );
  };

  const handleResetDraft = (): void => {
    if (!selectedSource) return;
    setDrafts((prev) => {
      const next = { ...prev };
      delete next[selectedSource.id];
      return next;
    });
    setSectionError(null);
    setResetToken((token) => token + 1);
    setPendingFocus(customizeOpen ? '[data-section-add]' : '[data-section-toggle]');
  };

  const confirm = () => {
    if (selected) onSelect(selected);
  };

  return (
    <div
      className="template-chooser-overlay"
      onClick={(e) => {
        if (e.target === e.currentTarget) dismissRef.current(null);
      }}
    >
      <div
        className="template-chooser"
        role="dialog"
        aria-modal="true"
        aria-labelledby="template-chooser-title"
        ref={dialogRef}
      >
        <h3 className="template-chooser-title" id="template-chooser-title">
          New Document
        </h3>
        <p className="template-chooser-subtitle">
          Start blank or pick a template. Templates are starting points and stay fully editable.
        </p>

        <div className="template-chooser-controls">
          <label className="template-chooser-search-label" htmlFor="template-chooser-search">
            Search templates
          </label>
          <input
            id="template-chooser-search"
            ref={searchRef}
            className="template-chooser-search"
            type="search"
            placeholder="Search by name, description or tag"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            aria-label="Search templates by name, description or tag"
          />
          <label className="template-chooser-category-label" htmlFor="template-chooser-category">
            Category
          </label>
          <select
            id="template-chooser-category"
            className="template-chooser-category"
            value={category ?? ''}
            onChange={(e) =>
              setCategory(e.target.value === '' ? null : (e.target.value as TemplateCategory))
            }
            aria-label="Filter templates by category"
          >
            <option value="">All categories</option>
            {TEMPLATE_CATEGORIES.map((c) => (
              <option key={c.id} value={c.id}>
                {c.label}
              </option>
            ))}
          </select>
        </div>

        <ul className="template-chooser-list" aria-label="Document choices">
          {visibleTemplates.length === 0 && (
            <li className="template-chooser-empty" role="status">
              No templates match your search. Adjust the search or category filter — or create a
              Blank Document.
            </li>
          )}
          {choices.map((choice) => (
            <li key={choice.id}>
              <button
                type="button"
                aria-pressed={choice.id === effectiveSelectedId}
                className={`template-chooser-item ${
                  choice.id === effectiveSelectedId ? 'is-selected' : ''
                }`}
                onClick={() => setSelectedId(choice.id)}
                onDoubleClick={confirm}
              >
                <div className="template-chooser-item-head">
                  <span className="template-chooser-item-name">{choice.name}</span>
                  <span className="template-chooser-item-category">
                    {choice.categoryLabel ?? 'Blank'}
                  </span>
                </div>
                <span className="template-chooser-item-desc">{choice.description}</span>
                {choice.tags.length > 0 && (
                  <div className="template-chooser-item-tags">
                    {choice.tags.map((tag) => (
                      <span className="template-chooser-tag" key={tag}>
                        {tag}
                      </span>
                    ))}
                  </div>
                )}
                {choice.sections.length > 0 && (
                  <div className="template-chooser-item-sections">
                    <span className="template-chooser-sections-label">Sections:</span>
                    <ol className="template-chooser-section-list">
                      {choice.sections.map((section, index) => (
                        <li key={`${choice.id}-section-${index}`}>
                          <span className="template-chooser-section-name">{section.name}</span>
                          {section.description && (
                            <span className="template-chooser-section-note">
                              {section.description}
                            </span>
                          )}
                          {section.prompt && (
                            <span className="template-chooser-section-note template-chooser-section-prompt">
                              {section.prompt}
                            </span>
                          )}
                        </li>
                      ))}
                    </ol>
                  </div>
                )}
              </button>
            </li>
          ))}
        </ul>

        {/* P03-M4 — section customization (templates only; never for Blank). */}
        {selectedSource && currentDraft && (
          <section className="template-chooser-customize" aria-label="Customize sections">
            <div className="template-chooser-customize-head">
              <button
                type="button"
                className="template-chooser-customize-toggle"
                data-section-toggle
                aria-expanded={customizeOpen}
                aria-controls="template-chooser-section-editor"
                onClick={() => setCustomizeOpen((open) => !open)}
              >
                {customizeOpen ? 'Hide section customization' : 'Customize sections'}
              </button>
              <span className="template-chooser-customize-count">
                {currentDraft.sections.length} section{currentDraft.sections.length === 1 ? '' : 's'}
              </span>
              {draftModified && (
                <button
                  type="button"
                  className="template-chooser-btn template-chooser-btn--secondary template-chooser-customize-reset"
                  data-section-reset
                  onClick={handleResetDraft}
                >
                  Reset to original
                </button>
              )}
            </div>

            {customizeOpen && (
              <div className="template-chooser-section-editor" id="template-chooser-section-editor">
                <p className="template-chooser-editor-hint">
                  Sections appear in your document in this order. The built-in template itself
                  stays unchanged.
                </p>
                {sectionError && (
                  <p className="template-chooser-section-error" role="alert">
                    {sectionError}
                  </p>
                )}
                {currentDraft.sections.length === 0 && (
                  <p className="template-chooser-editor-empty" role="status">
                    No sections left — the document will start without starter content. Add a
                    section to continue.
                  </p>
                )}
                <ul className="template-chooser-section-rows" aria-label="Sections in document order">
                  {currentDraft.sections.map((section, index) => (
                    <SectionRow
                      key={`${section.id}-${resetToken}`}
                      section={section}
                      index={index}
                      total={currentDraft.sections.length}
                      onRename={handleRenameSection}
                      onDescription={handleDescription}
                      onPrompt={handlePrompt}
                      onMove={handleMoveSection}
                      onRemove={handleRemoveSection}
                    />
                  ))}
                </ul>
                <div className="template-chooser-editor-actions">
                  <button
                    type="button"
                    className="template-chooser-btn template-chooser-btn--secondary"
                    data-section-add
                    onClick={handleAddSection}
                  >
                    Add section
                  </button>
                </div>
              </div>
            )}
          </section>
        )}

        <div className="template-chooser-actions">
          <button
            type="button"
            className="template-chooser-btn template-chooser-btn--secondary"
            onClick={() => dismissRef.current(null)}
          >
            Cancel
          </button>
          <button
            type="button"
            className="template-chooser-btn template-chooser-btn--primary"
            onClick={confirm}
          >
            Create
          </button>
        </div>
      </div>
    </div>
  );
};

export default TemplateChooser;
