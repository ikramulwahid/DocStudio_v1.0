import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
import type {
  ImportChoice,
  ImportPlan,
  TemplatePersistenceManager,
} from '../../services/template-persistence';
import './TemplateChooser.css';

/** Extract the display filename from an absolute path (Windows or POSIX). */
const fileNameFromPath = (path: string): string => path.split(/[\\/]/).pop() ?? path;

/** Persistent-library feedback line (success/info/error). */
interface PersistenceStatus {
  kind: 'info' | 'success' | 'error';
  text: string;
}

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
 * Custom-template persistence (P03-M5): the chooser loads the persistent
 * "My Templates" library from app-local storage on open and lists those
 * entries alongside the built-in catalog (clearly badged, with their own
 * group headings) through the SAME search, category filter and section
 * preview.  The selected template's panel offers: save a built-in or its
 * customized draft as a new user template (native Save dialog + library
 * registration, with honest partial-failure reporting), explicit
 * "Save changes" with overwrite confirmation for a user template (identity
 * and createdAt preserved), "Save a copy", export via the native Save
 * dialog, and "Import Template…" via the native Open dialog with full
 * validation, duplicate detection and an explicit replace/copy/cancel
 * choice for id conflicts — a conflicting saved template is never
 * overwritten silently.  A corrupt stored file surfaces as a non-fatal
 * warning and is never deleted.  User templates selected here go through
 * the unchanged P03-M2 instantiation/precedence flow, so documents remain
 * independent of their source template.
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
  /**
   * P03-M5 persistence workflows (save / update / export / import) backed by
   * the app-local My Templates library.  The App builds the real manager;
   * tests inject fakes at the pure-service level.
   */
  persistence: TemplatePersistenceManager;
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

export const TemplateChooser: React.FC<TemplateChooserProps> = ({ templates, persistence, onSelect }) => {
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
  // P03-M5: persistent My Templates library state.
  const [userTemplates, setUserTemplates] = useState<DocStudioTemplate[]>([]);
  const [libraryWarnings, setLibraryWarnings] = useState<string[]>([]);
  const [warningsDismissed, setWarningsDismissed] = useState(false);
  const [loadingLibrary, setLoadingLibrary] = useState(true);
  const [persistenceStatus, setPersistenceStatus] = useState<PersistenceStatus | null>(null);
  const [saveName, setSaveName] = useState('');
  const [saveNameError, setSaveNameError] = useState<string | null>(null);
  const [confirmOverwrite, setConfirmOverwrite] = useState(false);
  const [pendingImport, setPendingImport] = useState<ImportPlan | null>(null);
  /** True while a save/export/import round-trip is in flight (buttons disable). */
  const [busy, setBusy] = useState(false);
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

  /** Reload the persistent library (on open and after each store change). */
  const refreshLibrary = useCallback(async (): Promise<void> => {
    const result = await persistence.load();
    setUserTemplates(result.templates);
    setLibraryWarnings(result.warnings.map((w) => w.message));
    setLoadingLibrary(false);
  }, [persistence]);

  useEffect(() => {
    let active = true;
    (async () => {
      const result = await persistence.load();
      if (!active) return;
      setUserTemplates(result.templates);
      setLibraryWarnings(result.warnings.map((w) => w.message));
      setLoadingLibrary(false);
    })();
    return () => {
      active = false;
    };
  }, [persistence]);

  const showStatus = (kind: PersistenceStatus['kind'], text: string): void => {
    setPersistenceStatus({ kind, text });
  };

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
  // confirmed choice all operate on the same editable working copy.  P03-M5:
  // saved user templates join the same pipeline (listed before built-ins).
  const allTemplates = useMemo(() => [...userTemplates, ...templates], [userTemplates, templates]);
  const displayTemplates = useMemo(
    () => allTemplates.map((template) => draftFor(drafts, template)),
    [allTemplates, drafts],
  );
  const visibleTemplates = useMemo(() => filterTemplates(displayTemplates, query, category), [
    displayTemplates,
    query,
    category,
  ]);
  const choices = useMemo(() => buildChoiceList(visibleTemplates, categoryLabelFor), [
    visibleTemplates,
  ]);
  // Group membership (P03-M5): Blank first, then My Templates, then built-in.
  const userIds = useMemo(() => new Set(userTemplates.map((t) => t.id)), [userTemplates]);
  const blankChoice = choices.length > 0 ? choices[0] : undefined;
  const userChoices = choices.filter((c) => c.id !== BLANK_CHOICE_ID && userIds.has(c.id));
  const builtinChoices = choices.filter((c) => c.id !== BLANK_CHOICE_ID && !userIds.has(c.id));
  // If the selected choice got filtered out, fall back to Blank Document so
  // the highlight and the confirmed choice never disagree.
  const effectiveSelectedId = choices.some((c) => c.id === selectedId)
    ? selectedId
    : (choices[0]?.id ?? BLANK_CHOICE_ID);
  const selected = choices.find((c) => c.id === effectiveSelectedId) ?? choices[0];

  // Pristine source (for "Reset to original" comparison) vs. current draft.
  const selectedSource = useMemo(
    () =>
      effectiveSelectedId === BLANK_CHOICE_ID
        ? undefined
        : allTemplates.find((t) => t.id === effectiveSelectedId),
    [allTemplates, effectiveSelectedId],
  );
  const currentDraft = selectedSource ? draftFor(drafts, selectedSource) : undefined;
  const draftModified = useMemo(
    () =>
      selectedSource !== undefined &&
      currentDraft !== undefined &&
      isTemplateDraftModified(currentDraft, selectedSource),
    [currentDraft, selectedSource],
  );

  // P03-M5: reset the per-selection save/export UI whenever the selection's
  // identity changes (the name field tracks the selected template's name).
  const selectedSourceId = selectedSource?.id;
  useEffect(() => {
    if (!selectedSource) return;
    setSaveName(selectedSource.name);
    setSaveNameError(null);
    setConfirmOverwrite(false);
    setPendingImport(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedSourceId]);

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

  // ── P03-M5: persistent template workflows ──────────────────────────────────

  /** Save the current draft as a NEW user template (built-in or copy flow). */
  const handleSaveAsUserTemplate = async (): Promise<void> => {
    if (!currentDraft || busy) return;
    const name = saveName.trim();
    if (name === '') {
      setSaveNameError('Template name cannot be empty.');
      return;
    }
    setSaveNameError(null);
    setBusy(true);
    try {
      const outcome = await persistence.saveNewFromDraft(currentDraft, name, userTemplates);
      if (outcome.status === 'cancelled') {
        showStatus('info', 'Save cancelled — nothing was changed.');
        return;
      }
      if (outcome.status === 'failed' || outcome.status === 'partial') {
        showStatus('error', outcome.message);
        return;
      }
      await refreshLibrary();
      setSelectedId(outcome.template.id);
      showStatus(
        'success',
        `“${outcome.template.name}” was saved to My Templates and exported to “${fileNameFromPath(
          outcome.exportedPath,
        )}”. It stays available after DocStudio is closed and reopened.`,
      );
    } catch {
      showStatus('error', 'The template could not be saved. Your saved templates are unchanged.');
    } finally {
      setBusy(false);
    }
  };

  /** Request the explicit overwrite step for "Save changes" on a user template. */
  const handleRequestOverwrite = (): void => {
    if (!currentDraft || busy) return;
    const name = saveName.trim();
    if (name === '') {
      setSaveNameError('Template name cannot be empty.');
      return;
    }
    setSaveNameError(null);
    setConfirmOverwrite(true);
  };

  /** Apply the confirmed overwrite: stored identity + createdAt preserved. */
  const handleConfirmOverwrite = async (): Promise<void> => {
    setConfirmOverwrite(false);
    if (!currentDraft || !selectedSource || busy) return;
    setBusy(true);
    try {
      const outcome = await persistence.saveChangesToStored(selectedSource, currentDraft);
      if (outcome.status === 'ok') {
        await refreshLibrary();
        showStatus(
          'success',
          `Changes to “${outcome.template.name}” were saved to My Templates.`,
        );
      } else {
        showStatus('error', outcome.message);
      }
    } catch {
      showStatus('error', 'The saved template could not be updated. It is unchanged.');
    } finally {
      setBusy(false);
    }
  };

  /** Export the current template/draft to a chosen path (no library change). */
  const handleExport = async (): Promise<void> => {
    if (!currentDraft || busy) return;
    setBusy(true);
    try {
      const outcome = await persistence.exportTemplateFile(currentDraft);
      if (outcome.status === 'cancelled') {
        showStatus('info', 'Export cancelled — nothing was changed.');
      } else if (outcome.status === 'failed') {
        showStatus('error', outcome.message);
      } else {
        showStatus('success', `Template exported to “${fileNameFromPath(outcome.path)}”.`);
      }
    } catch {
      showStatus('error', 'The template could not be exported.');
    } finally {
      setBusy(false);
    }
  };

  /** Persist an applied import decision (add / replace / copy). */
  const applyResolvedImport = async (
    plan: ImportPlan,
    choice: ImportChoice,
  ): Promise<void> => {
    setBusy(true);
    try {
      const outcome = await persistence.applyImport(userTemplates, plan, choice);
      if (outcome.status === 'cancelled') {
        setPendingImport(null);
        showStatus('info', 'Import cancelled — nothing was changed.');
        return;
      }
      if (outcome.status === 'noop') {
        setPendingImport(null);
        showStatus('info', 'That template is already in My Templates — nothing was imported.');
        return;
      }
      if (outcome.status === 'failed') {
        showStatus('error', outcome.message);
        return;
      }
      await refreshLibrary();
      setSelectedId(outcome.template.id);
      setPendingImport(null);
      showStatus('success', `“${outcome.template.name}” was imported into My Templates.`);
    } catch {
      showStatus('error', 'The template could not be imported. Your saved templates are unchanged.');
    } finally {
      setBusy(false);
    }
  };

  /** Import a `.dstemplate` file via the native Open dialog + validation. */
  const handleImport = async (): Promise<void> => {
    if (busy) return;
    setBusy(true);
    try {
      const outcome = await persistence.beginImport(userTemplates);
      if (outcome.status === 'cancelled') {
        showStatus('info', 'Import cancelled — nothing was changed.');
        return;
      }
      if (outcome.status === 'failed' || outcome.status === 'invalid') {
        showStatus('error', outcome.message);
        return;
      }
      const plan = outcome.plan;
      if (plan.kind === 'duplicate') {
        showStatus(
          'info',
          `“${plan.template.name}” is already in My Templates — nothing was imported.`,
        );
        return;
      }
      if (plan.kind === 'conflict') {
        setPendingImport(plan);
        return;
      }
      await applyResolvedImport(plan, 'add');
    } catch {
      showStatus('error', 'The template could not be imported. Your saved templates are unchanged.');
    } finally {
      setBusy(false);
    }
  };

  const confirm = () => {
    if (selected) onSelect(selected);
  };

  /** One selectable choice card (Blank Document or a template entry). */
  const renderChoice = (choice: TemplateChoice): JSX.Element => {
    const origin = choice.template?.origin;
    return (
      <li key={choice.id}>
        <button
          type="button"
          aria-pressed={choice.id === effectiveSelectedId}
          className={`template-chooser-item ${
            choice.id === effectiveSelectedId ? 'is-selected' : ''
          }`}
          data-template-origin={origin ?? 'blank'}
          onClick={() => setSelectedId(choice.id)}
          onDoubleClick={confirm}
        >
          <div className="template-chooser-item-head">
            <span className="template-chooser-item-name">{choice.name}</span>
            <span className="template-chooser-item-meta">
              {origin && (
                <span className="template-chooser-item-origin" data-template-origin-badge>
                  {origin === 'user' ? 'My Template' : 'Built-in'}
                </span>
              )}
              <span className="template-chooser-item-category">
                {choice.categoryLabel ?? 'Blank'}
              </span>
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
                      <span className="template-chooser-section-note">{section.description}</span>
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
    );
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

        {/* P03-M5 — non-fatal load warnings (corrupt stored files are never deleted). */}
        {libraryWarnings.length > 0 && !warningsDismissed && (
          <div className="template-chooser-library-warnings" role="alert" data-library-warnings>
            <p className="template-chooser-library-warnings-title">
              Some entries in My Templates could not be loaded and were skipped. They remain on
              disk — nothing was deleted:
            </p>
            <ul className="template-chooser-library-warnings-list">
              {libraryWarnings.map((warning) => (
                <li key={warning}>{warning}</li>
              ))}
            </ul>
            <button
              type="button"
              className="template-chooser-btn template-chooser-btn--secondary template-chooser-library-warnings-dismiss"
              data-library-warnings-dismiss
              onClick={() => setWarningsDismissed(true)}
            >
              Dismiss
            </button>
          </div>
        )}

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

        {/* P03-M5 — import action + library loading state + status feedback. */}
        <div className="template-chooser-library-bar">
          <button
            type="button"
            className="template-chooser-btn template-chooser-btn--secondary"
            data-import-template
            disabled={busy}
            onClick={handleImport}
          >
            Import Template…
          </button>
          {loadingLibrary && (
            <span className="template-chooser-library-loading" role="status">
              Loading My Templates…
            </span>
          )}
        </div>
        {persistenceStatus && (
          <p
            className={`template-chooser-persistence-status template-chooser-persistence-status--${persistenceStatus.kind}`}
            role={persistenceStatus.kind === 'error' ? 'alert' : 'status'}
            data-persistence-status
          >
            <span className="template-chooser-persistence-status-text">{persistenceStatus.text}</span>
            <button
              type="button"
              className="template-chooser-persistence-status-dismiss"
              aria-label="Dismiss message"
              data-persistence-status-dismiss
              onClick={() => setPersistenceStatus(null)}
            >
              &#10005;
            </button>
          </p>
        )}

        <ul className="template-chooser-list" aria-label="Document choices">
          {visibleTemplates.length === 0 && (
            <li className="template-chooser-empty" role="status">
              No templates match your search. Adjust the search or category filter — or create a
              Blank Document.
            </li>
          )}
          {blankChoice && renderChoice(blankChoice)}
          {userChoices.length > 0 && (
            <>
              <li className="template-chooser-group" role="presentation">
                My Templates
              </li>
              {userChoices.map((choice) => renderChoice(choice))}
            </>
          )}
          {builtinChoices.length > 0 && (
            <>
              <li className="template-chooser-group" role="presentation">
                Built-in Templates
              </li>
              {builtinChoices.map((choice) => renderChoice(choice))}
            </>
          )}
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

        {/* P03-M5 — save / export panel (never shown for Blank Document). */}
        {selectedSource && currentDraft && (
          <section className="template-chooser-persistence" aria-label="Template save and export">
            <div className="template-chooser-persistence-head">
              <span
                className="template-chooser-persistence-badge"
                data-selected-origin={selectedSource.origin}
              >
                {selectedSource.origin === 'user' ? 'My Template' : 'Built-in Template'}
              </span>
              <span className="template-chooser-persistence-note">
                {selectedSource.origin === 'user'
                  ? 'Saved in My Templates on this device.'
                  : 'Not saved to My Templates yet.'}
              </span>
            </div>
            <div className="template-chooser-persistence-row">
              <label className="template-chooser-section-field template-chooser-persistence-name-field">
                <span className="template-chooser-section-field-label">
                  {selectedSource.origin === 'user'
                    ? 'Save a copy — new name'
                    : 'Save as user template — name'}
                </span>
                <input
                  type="text"
                  className="template-chooser-section-input"
                  data-persistence-name
                  value={saveName}
                  aria-invalid={saveNameError !== null}
                  aria-describedby={saveNameError ? 'persistence-name-error' : undefined}
                  disabled={busy}
                  onChange={(e) => {
                    setSaveName(e.target.value);
                    if (e.target.value.trim() !== '') setSaveNameError(null);
                  }}
                />
              </label>
              {selectedSource.origin !== 'user' ? (
                <button
                  type="button"
                  className="template-chooser-btn template-chooser-btn--primary"
                  data-persistence-save-new
                  disabled={busy}
                  onClick={handleSaveAsUserTemplate}
                >
                  Save as user template
                </button>
              ) : (
                <>
                  {draftModified && !confirmOverwrite && (
                    <button
                      type="button"
                      className="template-chooser-btn template-chooser-btn--primary"
                      data-persistence-save-changes
                      disabled={busy}
                      onClick={handleRequestOverwrite}
                    >
                      Save changes
                    </button>
                  )}
                  <button
                    type="button"
                    className="template-chooser-btn template-chooser-btn--primary"
                    data-persistence-save-copy
                    disabled={busy}
                    onClick={handleSaveAsUserTemplate}
                  >
                    Save a copy…
                  </button>
                </>
              )}
              <button
                type="button"
                className="template-chooser-btn template-chooser-btn--secondary"
                data-persistence-export
                disabled={busy}
                onClick={handleExport}
              >
                Export .dstemplate…
              </button>
            </div>
            {saveNameError && (
              <p className="template-chooser-section-name-error" id="persistence-name-error" role="alert">
                {saveNameError}
              </p>
            )}

            {confirmOverwrite && (
              <div
                className="template-chooser-persistence-confirm"
                role="alert"
                data-persistence-overwrite
              >
                <p>
                  Replace the saved version of “{selectedSource.name}”? This overwrites the stored
                  template in My Templates and cannot be undone. Exported files are not affected.
                </p>
                <div className="template-chooser-persistence-confirm-actions">
                  <button
                    type="button"
                    className="template-chooser-btn template-chooser-btn--primary"
                    data-persistence-overwrite-confirm
                    disabled={busy}
                    onClick={handleConfirmOverwrite}
                  >
                    Replace saved template
                  </button>
                  <button
                    type="button"
                    className="template-chooser-btn template-chooser-btn--secondary"
                    data-persistence-overwrite-cancel
                    disabled={busy}
                    onClick={() => setConfirmOverwrite(false)}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </section>
        )}

        {/* P03-M5 — import conflict: never overwrite a different saved template silently. */}
        {pendingImport && pendingImport.kind === 'conflict' && (
          <div className="template-chooser-persistence-confirm" role="alert" data-import-conflict>
            <p>
              A different saved template already uses the identity of “{pendingImport.incoming.name}
              ” (currently saved as “{pendingImport.existing.name}”). Choose how to continue —
              nothing has been imported yet.
            </p>
            <div className="template-chooser-persistence-confirm-actions">
              <button
                type="button"
                className="template-chooser-btn template-chooser-btn--primary"
                data-import-conflict-replace
                disabled={busy}
                onClick={() => applyResolvedImport(pendingImport, 'replace')}
              >
                Replace saved template
              </button>
              <button
                type="button"
                className="template-chooser-btn template-chooser-btn--secondary"
                data-import-conflict-copy
                disabled={busy}
                onClick={() => applyResolvedImport(pendingImport, 'copy')}
              >
                Import as a copy
              </button>
              <button
                type="button"
                className="template-chooser-btn template-chooser-btn--secondary"
                data-import-conflict-cancel
                disabled={busy}
                onClick={() => {
                  setPendingImport(null);
                  showStatus('info', 'Import cancelled — nothing was changed.');
                }}
              >
                Cancel import
              </button>
            </div>
          </div>
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
