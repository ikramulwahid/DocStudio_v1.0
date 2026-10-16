import React, { useEffect, useMemo, useRef, useState } from 'react';
import type { DocStudioTemplate, TemplateCategory } from '../../types/template';
import { TEMPLATE_CATEGORIES } from '../../types/template';
import {
  BLANK_CHOICE_ID,
  buildChoiceList,
  filterTemplates,
  type TemplateChoice,
} from '../../services/template-chooser';
import './TemplateChooser.css';

/**
 * New-document Template Chooser (P03-M2).
 *
 * An accessible modal that offers Blank Document as a first-class choice plus
 * the currently available templates, with free-text search (name/description/
 * tags) and category filtering driven by the single source of truth
 * (`TEMPLATE_CATEGORIES`).  Cancel (button, Escape, backdrop) resolves with
 * `null` and leaves the active document untouched — the App runs the
 * unsaved-change guard only after a real choice is confirmed.
 *
 * Accessibility: role="dialog", aria-modal, labelled by title, initial focus
 * on the search box, Escape closes.  The category `<select>` is populated from
 * the centralized category list (no hardcoded labels).  This component is a
 * thin view over the pure `services/template-chooser` rules.
 */
interface TemplateChooserProps {
  /** Currently available templates (the built-in catalog for P03-M2). */
  templates: DocStudioTemplate[];
  /** Called with the confirmed choice, or `null` when cancelled. */
  onSelect: (choice: TemplateChoice | null) => void;
}

const categoryLabelFor = (category: TemplateCategory): string =>
  TEMPLATE_CATEGORIES.find((c) => c.id === category)?.label ?? category;

export const TemplateChooser: React.FC<TemplateChooserProps> = ({ templates, onSelect }) => {
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState<TemplateCategory | null>(null);
  const [selectedId, setSelectedId] = useState<string>(BLANK_CHOICE_ID);
  const searchRef = useRef<HTMLInputElement>(null);
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

  // Blank Document is always available; templates are filtered by query/category.
  const visibleTemplates = useMemo(() => filterTemplates(templates, query, category), [
    templates,
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
