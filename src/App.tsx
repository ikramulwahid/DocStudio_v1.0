import React, { useState, useEffect } from 'react';
import { Topbar } from './components/topbar/Topbar';
import { Workspace } from './components/workspace/Workspace';
import {
  ThemeMode,
  DocumentSessionStatus,
  DocStudioDocument,
  createDefaultDocument,
  newUUID,
  nowISO,
} from './types';
import {
  serializeDocument,
  deserializeDocument,
  defaultProjectFileName,
  DocumentFileError,
} from './services/document-file';
import { saveProjectText, readProjectText } from './services/document-io';
import './styles/theme.css';
import './styles/globals.css';
import './App.css';

const THEME_STORAGE_KEY = 'docstudio_ui_theme';

export const App: React.FC = () => {
  const [theme, setTheme] = useState<ThemeMode>(() => {
    const saved = localStorage.getItem(THEME_STORAGE_KEY) as ThemeMode | null;
    if (saved === 'multicolor' || saved === 'light' || saved === 'dark') {
      return saved;
    }
    return 'multicolor';
  });

  // ── Document session state (P02-M2) ──────────────────────────────────────
  const [activeDocument, setActiveDocument] = useState<DocStudioDocument>(() =>
    createDefaultDocument(newUUID(), nowISO()),
  );
  /** Absolute path of the associated `.docstudio` file, when known. */
  const [activeFilePath, setActiveFilePath] = useState<string | null>(null);
  /** Active filename shown in the topbar. */
  const [activeFileName, setActiveFileName] = useState<string>('Untitled-1.docstudio');
  const [sessionStatus, setSessionStatus] = useState<DocumentSessionStatus>('New');
  /** Last user-facing file-operation error, shown as a dismissible banner. */
  const [fileError, setFileError] = useState<string | null>(null);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem(THEME_STORAGE_KEY, theme);
  }, [theme]);

  const handleThemeChange = (newTheme: ThemeMode) => {
    setTheme(newTheme);
  };

  // ── Save (P02-M2) ────────────────────────────────────────────────────────
  const handleSave = async (): Promise<void> => {
    try {
      // Validation happens inside serializeDocument — an invalid document
      // is never written to disk.
      const json = serializeDocument(activeDocument);
      const suggestedName = activeFilePath
        ? activeFileName
        : defaultProjectFileName(activeDocument.metadata.title);
      const saved = await saveProjectText(json, activeFilePath, suggestedName);
      if (saved === null) return; // cancelled — no state changes

      // Update session state only after a successful write.
      setActiveFilePath(saved.path);
      setActiveFileName(saved.fileName);
      setSessionStatus('Saved');
      setFileError(null);
    } catch (e) {
      console.error('[DocStudio] Save failed:', e);
      setFileError(
        e instanceof DocumentFileError ? e.message : 'The project could not be saved.',
      );
    }
  };

  // ── Open (P02-M2) ────────────────────────────────────────────────────────
  const handleOpen = async (): Promise<void> => {
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
      setSessionStatus('Saved');
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
        onSave={handleSave}
        onOpen={handleOpen}
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
      <Workspace />
    </div>
  );
};

export default App;
