import React, { useState, useEffect } from 'react';
import { Topbar } from './components/topbar/Topbar';
import { Workspace } from './components/workspace/Workspace';
import { ConfirmDialog, DialogAction } from './components/common/ConfirmDialog';
import {
  ThemeMode,
  DocStudioDocument,
} from './types';
import {
  serializeDocument,
  deserializeDocument,
  defaultProjectFileName,
  DocumentFileError,
} from './services/document-file';
import { saveProjectText, readProjectText } from './services/document-io';
import {
  createNewDocument,
  duplicateDocument,
  clearDocumentContents,
  resetDocumentSettings,
  stampModifiedAt,
  sessionFingerprint,
  isDirty,
  deriveSessionStatus,
  resolveUnsavedChanges,
  UnsavedChoice,
} from './services/document-actions';
import './styles/theme.css';
import './styles/globals.css';
import './App.css';

const THEME_STORAGE_KEY = 'docstudio_ui_theme';
const UNSAVED_BASELINE = ''; // empty baseline: a document never saved/opened (e.g. a duplicate) starts dirty

interface DialogRequest {
  title: string;
  message: string;
  actions: DialogAction[];
}

export const App: React.FC = () => {
  const [theme, setTheme] = useState<ThemeMode>(() => {
    const saved = localStorage.getItem(THEME_STORAGE_KEY) as ThemeMode | null;
    if (saved === 'multicolor' || saved === 'light' || saved === 'dark') {
      return saved;
    }
    return 'multicolor';
  });

  // ── Document session state (P02-M2/P02-M3) ───────────────────────────────
  const [activeDocument, setActiveDocument] = useState<DocStudioDocument>(() => createNewDocument());
  /** Absolute path of the associated `.docstudio` file, when known. */
  const [activeFilePath, setActiveFilePath] = useState<string | null>(null);
  /** Active filename shown in the topbar. */
  const [activeFileName, setActiveFileName] = useState<string>('Untitled-1.docstudio');
  /**
   * Fingerprint of the last successfully saved/opened document state —
   * the baseline for unsaved-change detection. Starts equal to the new
   * default document (genuinely unchanged → status "New").
   */
  const [baselineFingerprint, setBaselineFingerprint] = useState<string>(() =>
    sessionFingerprint(activeDocument),
  );
  /** Last user-facing file-operation error, shown as a dismissible banner. */
  const [fileError, setFileError] = useState<string | null>(null);
  /** Active confirmation modal, when one is showing. */
  const [dialog, setDialog] = useState<DialogRequest | null>(null);

  const fingerprint = sessionFingerprint(activeDocument);
  const dirty = isDirty(fingerprint, baselineFingerprint);
  const sessionStatus = deriveSessionStatus(fingerprint, baselineFingerprint, activeFilePath !== null);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem(THEME_STORAGE_KEY, theme);
  }, [theme]);

  const handleThemeChange = (newTheme: ThemeMode) => {
    setTheme(newTheme);
  };

  // ── Confirmation helpers ─────────────────────────────────────────────────
  const closeDialog = () => setDialog(null);

  const confirmAction = (title: string, message: string, confirmLabel: string, onConfirm: () => void) => {
    setDialog({
      title,
      message,
      actions: [
        { label: confirmLabel, variant: 'danger', onClick: () => { closeDialog(); onConfirm(); } },
        { label: 'Cancel', variant: 'secondary', onClick: closeDialog },
      ],
    });
  };

  /** Save / Discard / Cancel prompt backing resolveUnsavedChanges(). */
  const askUnsaved = (): Promise<UnsavedChoice> =>
    new Promise<UnsavedChoice>((resolve) => {
      setDialog({
        title: 'Unsaved changes',
        message: `Save changes to "${activeFileName}" before continuing?`,
        actions: [
          { label: 'Save', variant: 'primary', onClick: () => { closeDialog(); resolve('save'); } },
          { label: 'Discard', variant: 'danger', onClick: () => { closeDialog(); resolve('discard'); } },
          { label: 'Cancel', variant: 'secondary', onClick: () => { closeDialog(); resolve('cancel'); } },
        ],
      });
    });

  // ── Save (P02-M2, extended P02-M3) ───────────────────────────────────────
  /** Save the active document. Returns true only after a successful write. */
  const handleSave = async (): Promise<boolean> => {
    try {
      // Policy: a successful save stamps modifiedAt, then persists the
      // stamped document; the baseline advances only after the write
      // succeeds, so a failed save leaves status correctly "Modified".
      const stamped = stampModifiedAt(activeDocument);
      const json = serializeDocument(stamped);
      const suggestedName = activeFilePath
        ? activeFileName
        : defaultProjectFileName(stamped.metadata.title);
      const saved = await saveProjectText(json, activeFilePath, suggestedName);
      if (saved === null) return false; // cancelled — nothing written

      setActiveDocument(stamped);
      setActiveFilePath(saved.path);
      setActiveFileName(saved.fileName);
      setBaselineFingerprint(sessionFingerprint(stamped));
      setFileError(null);
      return true;
    } catch (e) {
      console.error('[DocStudio] Save failed:', e);
      setFileError(e instanceof DocumentFileError ? e.message : 'The project could not be saved.');
      return false;
    }
  };

  /** Guarded continuation for actions that replace the active document. */
  const guardUnsavedChanges = (): Promise<'proceed' | 'abort'> =>
    resolveUnsavedChanges(dirty, askUnsaved, handleSave);

  // ── New (P02-M3) ─────────────────────────────────────────────────────────
  const handleNew = async (): Promise<void> => {
    if ((await guardUnsavedChanges()) === 'abort') return;
    const fresh = createNewDocument();
    setActiveDocument(fresh);
    setActiveFilePath(null);
    setActiveFileName('Untitled-1.docstudio');
    setBaselineFingerprint(sessionFingerprint(fresh));
    setFileError(null);
  };

  // ── Duplicate (P02-M3) ───────────────────────────────────────────────────
  const handleDuplicate = (): void => {
    // Always copies the CURRENT in-memory document (including unsaved
    // edits); the source session is untouched.
    const copy = duplicateDocument(activeDocument);
    setActiveDocument(copy);
    setActiveFilePath(null);
    setActiveFileName(defaultProjectFileName(copy.metadata.title));
    // Empty baseline: the copy is unsaved work and starts dirty/protected.
    setBaselineFingerprint(UNSAVED_BASELINE);
    setFileError(null);
  };

  // ── Clear contents (P02-M3) ──────────────────────────────────────────────
  const handleClear = (): void => {
    confirmAction(
      'Clear document contents?',
      'This removes every content block. Document information, page/theme settings, ' +
        'front page, headers/footers and saved revisions are preserved. The current ' +
        'file stays associated so you can save the cleared state deliberately. This cannot be undone.',
      'Clear Contents',
      () => {
        setActiveDocument(clearDocumentContents(activeDocument));
        // File association, name and baseline are intentionally untouched:
        // the session becomes "Modified" until deliberately saved or reopened.
      },
    );
  };

  // ── Reset settings (P02-M3) ──────────────────────────────────────────────
  const handleReset = (): void => {
    confirmAction(
      'Reset settings to defaults?',
      'This restores page setup, page & typography themes, front-page settings and ' +
        'header/footer/watermark settings to their defaults. Document information, ' +
        'content blocks and embedded assets are preserved. This cannot be undone.',
      'Reset Settings',
      () => {
        setActiveDocument(resetDocumentSettings(activeDocument));
      },
    );
  };

  // ── Open (P02-M2, extended P02-M3) ───────────────────────────────────────
  const handleOpen = async (): Promise<void> => {
    if ((await guardUnsavedChanges()) === 'abort') return;

    try {
      const picked = await readProjectText();
      if (picked === null) return; // cancelled — no state changes

      // Validate BEFORE touching the active document.  If validation
      // fails, the currently open document is preserved untouched.
      let next: DocStudioDocument;
      try {
        next = deserializeDocument(picked.text);
      } catch (e) {
        console.error('[DocStudio] Open rejected:', e);
        setFileError(
          e instanceof DocumentFileError
            ? e.message
            : 'The selected file is not a valid DocStudio project.',
        );
        return;
      }

      setActiveDocument(next);
      setActiveFilePath(picked.path);
      setActiveFileName(picked.fileName);
      setBaselineFingerprint(sessionFingerprint(next));
      setFileError(null);
    } catch (e) {
      console.error('[DocStudio] Open failed:', e);
      setFileError(
        e instanceof DocumentFileError ? e.message : 'The project could not be opened.',
      );
    }
  };

  return (
    <div className="app-container" data-theme={theme}>
      <Topbar
        currentTheme={theme}
        onThemeChange={handleThemeChange}
        documentName={activeFileName}
        sessionStatus={sessionStatus}
        onNew={handleNew}
        onSave={handleSave}
        onOpen={handleOpen}
        onClear={handleClear}
      />
      {fileError && (
        <div className="app-error-banner" role="alert">
          <span className="app-error-text">{fileError}</span>
          <button
            type="button"
            className="app-error-dismiss"
            onClick={() => setFileError(null)}
            aria-label="Dismiss error"
          >
            ×
          </button>
        </div>
      )}
      <Workspace onDuplicate={handleDuplicate} onReset={handleReset} />
      {dialog && (
        <ConfirmDialog
          title={dialog.title}
          message={dialog.message}
          actions={dialog.actions}
          onDismiss={closeDialog}
        />
      )}
    </div>
  );
};

export default App;
