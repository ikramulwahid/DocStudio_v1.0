import React, { useState, useEffect, useMemo } from 'react';
import { Topbar } from './components/topbar/Topbar';
import { Workspace } from './components/workspace/Workspace';
import { ConfirmDialog, DialogAction } from './components/common/ConfirmDialog';
import { TemplateChooser } from './components/template-chooser/TemplateChooser';
import { createTemplatePersistenceManager } from './services/template-persistence';
import {
  ThemeMode,
  DocStudioDocument,
  DocUUID,
  DocumentMetadata,
  LabProfile,
} from './types';
import {
  serializeDocument,
  deserializeDocument,
  defaultProjectFileName,
  DocumentFileError,
} from './services/document-file';
import { saveProjectText, readProjectText } from './services/document-io';
import {
  duplicateDocument,
  clearDocumentContents,
  resetDocumentSettings,
  stampModifiedAt,
  sessionFingerprint,
  isDirty,
  deriveSessionStatus,
  resolveUnsavedChanges,
  updateDocumentMetadata,
  UnsavedChoice,
} from './services/document-actions';
import {
  updatePageSetup,
  updateTypography,
  updateBodyTheme,
  updateDisplayHeader,
  type BodyThemePatch,
  type PageSetupPatch,
  type SettingsUpdateResult,
  type TypographyPatch,
} from './services/page-typography';
import {
  updateFrontPage,
  applyImportedCoverAsset,
  removeCoverAsset,
  type FrontPagePatch,
  type FrontPageUpdateResult,
} from './services/front-page';
import {
  applyHeaderFooterPatch,
  applyWatermarkPatch,
  type BandKind,
  type HeaderFooterPatch,
  type HeaderFooterUpdateResult,
  type WatermarkPatch,
} from './services/header-footer-settings';
import { importImageAsset } from './services/image-import';
import { pickAndReadImage } from './services/image-io';
import {
  insertBlock,
  duplicateBlock,
  reorderBlock,
  deleteBlock,
  updateBlockSpacing,
  type BlockActionResult,
  type BlockPlacement,
  type BlockSpacingField,
} from './services/block-actions';
import {
  updateHeadingContent,
  updateParagraphContent,
  type ContentActionResult,
  type HeadingContentPatch,
  type ParagraphContentPatch,
} from './services/block-content';
import {
  applyListContentAction,
  updateCalloutContent,
  type CalloutContentActionResult,
  type CalloutContentPatch,
  type ListContentAction,
  type ListContentActionResult,
} from './services/list-callout-content';
import {
  applyTableContentAction,
  type TableContentAction,
  type TableContentActionResult,
} from './services/table-content';
import {
  applyStructuralAction,
  type StructuralContentAction,
  type StructuralContentActionResult,
} from './services/structural-block-content';
import {
  applyFormulaAction,
  type FormulaContentAction,
  type FormulaContentActionResult,
} from './services/formula-content';
import type { BlockType } from './types/blocks';
import {
  getBuiltinTemplates,
  resolveChooserSelection,
  type TemplateChoice,
} from './services/template-chooser';
import { createBlankDocument } from './services/template-instantiation';
import { loadLabProfile, saveLabProfile } from './services/lab-profile-store';
import { nowISO } from './types/defaults';
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

  // ── Laboratory Profile (P03-M2) ─────────────────────────────────────────────
  /**
   * Saved, reusable laboratory profile (application-local, persisted across
   * restarts).  Loaded once at startup with a safe fallback: missing or
   * corrupted stored data never blocks opening — it degrades to the empty
   * default and surfaces a notice via `labProfileError`.  Loaded BEFORE the
   * document session so the startup document already carries the profile.
   */
  const [profileLoad] = useState(() => {
    let loadError: string | null = null;
    const result = loadLabProfile(undefined, (message) => {
      loadError = message;
    });
    return { profile: result.profile, error: loadError };
  });
  const [labProfile, setLabProfile] = useState<LabProfile>(profileLoad.profile);
  const [labProfileError, setLabProfileError] = useState<string | null>(profileLoad.error);

  // ── Document session state (P02-M2/P02-M3) ───────────────────────────────
  /**
   * The startup document is a blank document (P03-M2): same default content
   * as before, plus the saved Laboratory Profile identity snapshot so a
   * restart picks the profile up immediately.
   */
  const [activeDocument, setActiveDocument] = useState<DocStudioDocument>(() =>
    createBlankDocument(profileLoad.profile, nowISO()),
  );
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

  // ── Block selection (P05-M1) ─────────────────────────────────────────────
  /**
   * Stable ID of the selected content block.  Selection is SESSION state,
   * deliberately outside the document, so selecting a block can never
   * dirty the document or alter persisted content.  Reconciled below: a
   * selection pointing at a block that no longer exists (delete, clear,
   * new/open/duplicate document) drops automatically.
   */
  const [selectedBlockId, setSelectedBlockId] = useState<DocUUID | null>(null);

  // ── Template chooser (P03-M2) ───────────────────────────────────────────────
  /**
   * Whether the New-document template chooser is open.  Opening or
   * cancelling the chooser makes NO change to the active document — the
   * unsaved-change guard runs only when the user actually confirms a choice.
   */
  const [chooserOpen, setChooserOpen] = useState(false);
  /** The currently available built-in template catalog (P03-M2: example SOP). */
  const templateCatalog = useMemo(() => getBuiltinTemplates(), []);
  /**
   * P03-M5 custom-template persistence workflows (My Templates library +
   * native `.dstemplate` dialogs).  Stable for the app's lifetime; the
   * chooser loads the stored library each time it opens.
   */
  const templatePersistence = useMemo(() => createTemplatePersistenceManager(), []);

  const fingerprint = sessionFingerprint(activeDocument);
  const dirty = isDirty(fingerprint, baselineFingerprint);
  const sessionStatus = deriveSessionStatus(fingerprint, baselineFingerprint, activeFilePath !== null);

  // Reconcile the block selection with the authoritative document: after a
  // delete/clear/document-replacement the previously selected ID may no
  // longer exist — the selection clears without touching the document.
  useEffect(() => {
    if (selectedBlockId !== null && !activeDocument.blocks.some((b) => b.id === selectedBlockId)) {
      setSelectedBlockId(null);
    }
  }, [activeDocument, selectedBlockId]);

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

  // ── New → template chooser (P02-M3, extended P03-M2) ─────────────────────
  /**
   * Open the template chooser.  Opening it does NOT run the unsaved-change
   * guard and does NOT touch the active document — the guard runs when the
   * user actually confirms a choice (see handleChooserSelect).
   */
  const handleNew = (): void => {
    setChooserOpen(true);
  };

  /**
   * Apply a confirmed chooser selection (P03-M2).
   *
   * The decision logic lives in the pure `resolveChooserSelection` service:
   * cancel → null (nothing changes); a real choice → unsaved-change guard
   * first, aborted save → null (replacement aborted); success → fresh
   * document built from the saved Laboratory Profile.  This handler only
   * performs the single active-document swap on a non-null result.
   */
  const handleChooserSelect = async (choice: TemplateChoice | null): Promise<void> => {
    setChooserOpen(false);
    const fresh = await resolveChooserSelection(choice, labProfile, nowISO(), guardUnsavedChanges);
    if (fresh === null) return; // cancelled or guard aborted — session untouched

    setActiveDocument(fresh);
    setActiveFilePath(null);
    setActiveFileName(defaultProjectFileName(fresh.metadata.title));
    setBaselineFingerprint(sessionFingerprint(fresh));
    setFileError(null);
  };

  // ── Laboratory Profile save (P03-M2) ───────────────────────────────────────
  /**
   * Persist an edited Laboratory Profile.  The profile lives entirely
   * outside the document schema: saving it never mutates the active
   * document or any template — it only affects documents created AFTER
   * the change.
   */
  const handleLabProfileSave = (next: LabProfile): void => {
    try {
      if (!saveLabProfile(next)) {
        setLabProfileError('The laboratory profile could not be saved on this device.');
        return;
      }
      setLabProfile(next);
      setLabProfileError(null);
    } catch (e) {
      console.error('[DocStudio] Lab profile save failed:', e);
      setLabProfileError('The laboratory profile could not be saved on this device.');
    }
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

  // ── Metadata editing (P02-M5) ───────────────────────────────────────────────
  /**
   * Apply a metadata patch to the AUTHORITATIVE active document — there is
   * no separate panel state.  `updateDocumentMetadata` returns the same
   * reference for no-op patches (no false dirty state) and stamps
   * `modifiedAt` only on a real change; the session fingerprint and
   * New/Saved/Modified status then follow automatically on re-render.
   * New/Open/Duplicate/Clear/Reset all replace or update `activeDocument`
   * itself, so the controlled inputs always reflect the active document.
   */
  const handleMetadataChange = (patch: Partial<DocumentMetadata>): void => {
    setActiveDocument(updateDocumentMetadata(activeDocument, patch));
  };

  // ── Page setup & typography editing (P04-M1) ─────────────────────────────
  /**
   * Apply a page-setup/typography/display-header patch to the AUTHORITATIVE
   * active document through the pure `page-typography` service — same
   * conventions as metadata (P02-M5): no-op patches return the same
   * reference (no false Modified status), real changes stamp `modifiedAt`,
   * rejected patches leave the document untouched and the panel shows the
   * service's understandable message inline.
   */
  const handlePageSetupChange = (patch: PageSetupPatch): SettingsUpdateResult => {
    const result = updatePageSetup(activeDocument, patch);
    if (result.ok && result.changed) setActiveDocument(result.doc);
    return result;
  };

  const handleTypographyChange = (patch: TypographyPatch): SettingsUpdateResult => {
    const result = updateTypography(activeDocument, patch);
    if (result.ok && result.changed) setActiveDocument(result.doc);
    return result;
  };

  // Body theme + monochrome (§8.3, P04-M3): same immutable-update path —
  // the pure service returns a fresh document only on a real change, so
  // re-selecting the current theme is a no-op and never dirties state.
  const handleBodyThemeChange = (patch: BodyThemePatch): SettingsUpdateResult => {
    const result = updateBodyTheme(activeDocument, patch);
    if (result.ok && result.changed) setActiveDocument(result.doc);
    return result;
  };

  const handleDisplayHeaderChange = (value: boolean): SettingsUpdateResult => {
    const result = updateDisplayHeader(activeDocument, value);
    if (result.ok && result.changed) setActiveDocument(result.doc);
    return result;
  };

  // ── Front page / cover designer (§7, P04-M4) ─────────────────────────
  const handleFrontPageChange = (patch: FrontPagePatch): FrontPageUpdateResult => {
    const result = updateFrontPage(activeDocument, patch);
    if (result.ok && result.changed) setActiveDocument(result.doc);
    return result;
  };

  // Header/footer/watermark settings (9, P06-M1) - same conventions as the
  // page/typography patches: no-op patches keep the same reference, real
  // changes stamp modifiedAt, rejected patches leave the document
  // untouched and the panel shows the service's message inline.
  const handleHeaderFooterBandChange = (
    band: BandKind,
    patch: HeaderFooterPatch,
  ): HeaderFooterUpdateResult => {
    const result = applyHeaderFooterPatch(activeDocument, band, patch);
    if (result.ok && result.changed) setActiveDocument(result.doc);
    return result;
  };

  const handleWatermarkChange = (patch: WatermarkPatch): HeaderFooterUpdateResult => {
    const result = applyWatermarkPatch(activeDocument, patch);
    if (result.ok && result.changed) setActiveDocument(result.doc);
    return result;
  };

  // Image selection opens the NATIVE picker; cancelling is a true no-op
  // and any failure (dialog, read, validation) leaves the document
  // untouched.  The picked file's BYTES are embedded into the document
  // asset bundle — no external absolute path is ever persisted.
  const handleCoverImageSelect = async (
    target: 'logo' | 'background',
  ): Promise<FrontPageUpdateResult> => {
    let picked: Awaited<ReturnType<typeof pickAndReadImage>>;
    try {
      picked = await pickAndReadImage();
    } catch (e) {
      return {
        ok: false,
        code: 'image-io',
        message: e instanceof DocumentFileError ? e.message : 'The image could not be selected.',
      };
    }
    if (picked === null) {
      // Cancelled: same-reference no-op, nothing is dirtied.
      return { ok: true, doc: activeDocument, changed: false };
    }
    const imported = importImageAsset(picked.bytes, picked.fileName);
    if (!imported.ok) {
      return { ok: false, code: 'image-import', message: imported.message };
    }
    const result = applyImportedCoverAsset(activeDocument, target, imported.asset);
    if (result.ok && result.changed) setActiveDocument(result.doc);
    return result;
  };

  const handleCoverImageRemove = (target: 'logo' | 'background'): FrontPageUpdateResult => {
    const result = removeCoverAsset(activeDocument, target);
    if (result.ok && result.changed) setActiveDocument(result.doc);
    return result;
  };

  // ── Block framework (P05-M1) ─────────────────────────────────────────────
  /**
   * Immutable block operations against the AUTHORITATIVE active document,
   * same conventions as settings edits (P04-M1): the pure `block-actions`
   * service returns a fresh document only on a real change (no-op patches
   * return the same reference — no false Modified status), rejected
   * operations leave the document untouched and the panel shows the
   * service's understandable message inline.  Insert and duplicate also
   * move the selection to the newly created block; the EditorPanel renders
   * straight from `activeDocument.blocks` — there is no second block store.
   */
  const handleInsertBlock = (type: BlockType, placement: BlockPlacement): BlockActionResult => {
    const result = insertBlock(activeDocument, type, placement);
    if (result.ok) {
      if (result.changed) setActiveDocument(result.doc);
      setSelectedBlockId(result.blockId);
    }
    return result;
  };

  const handleDuplicateBlock = (blockId: DocUUID): BlockActionResult => {
    const result = duplicateBlock(activeDocument, blockId);
    if (result.ok) {
      if (result.changed) setActiveDocument(result.doc);
      setSelectedBlockId(result.blockId);
    }
    return result;
  };

  const handleMoveBlock = (blockId: DocUUID, direction: 'up' | 'down'): BlockActionResult => {
    const result = reorderBlock(activeDocument, blockId, direction);
    if (result.ok && result.changed) setActiveDocument(result.doc);
    return result;
  };

  /**
   * Deletion is destructive, so it goes through the existing confirmation
   * dialog before the model change runs (same pattern as Clear Contents).
   * The captured `activeDocument` cannot change while the modal is open.
   */
  const handleDeleteBlock = (blockId: DocUUID): void => {
    confirmAction(
      'Delete this block?',
      'The selected block and its content are removed from the document. ' +
        'Document information and all other blocks are preserved. This cannot be undone.',
      'Delete Block',
      () => {
        const result = deleteBlock(activeDocument, blockId);
        if (!result.ok) {
          setFileError(result.message);
          return;
        }
        if (result.changed) setActiveDocument(result.doc);
        setSelectedBlockId((prev) => (prev === blockId ? null : prev));
      },
    );
  };

  const handleSpacingChange = (
    blockId: DocUUID,
    field: BlockSpacingField,
    value: number,
  ): BlockActionResult => {
    const result = updateBlockSpacing(activeDocument, blockId, field, value);
    if (result.ok && result.changed) setActiveDocument(result.doc);
    return result;
  };

  // ── Block content (P05-M2) ─────────────────────────────────────────────
  // Heading (§10.1) and paragraph (§10.2) content commits go through the
  // immutable block-content services; failures surface the service's
  // understandable message inline and leave the document untouched.

  const handleHeadingContentChange = (
    blockId: DocUUID,
    patch: HeadingContentPatch,
  ): ContentActionResult => {
    const result = updateHeadingContent(activeDocument, blockId, patch);
    if (result.ok && result.changed) setActiveDocument(result.doc);
    return result;
  };

  const handleParagraphContentChange = (
    blockId: DocUUID,
    patch: ParagraphContentPatch,
  ): ContentActionResult => {
    const result = updateParagraphContent(activeDocument, blockId, patch);
    if (result.ok && result.changed) setActiveDocument(result.doc);
    return result;
  };

  // ── List & callout content (P05-M3) ────────────────────────────────────
  // List (§10.4) actions and callout (§10.3) patches go through the
  // immutable list-callout-content services; failures surface the
  // service's understandable message inline and leave the document
  // untouched.  The list dispatcher keeps the prop flow narrow while
  // every operation keeps its own validated service above it.

  const handleListContentAction = (
    blockId: DocUUID,
    action: ListContentAction,
  ): ListContentActionResult => {
    const result = applyListContentAction(activeDocument, blockId, action);
    if (result.ok && result.changed) setActiveDocument(result.doc);
    return result;
  };

  const handleCalloutContentChange = (
    blockId: DocUUID,
    patch: CalloutContentPatch,
  ): CalloutContentActionResult => {
    const result = updateCalloutContent(activeDocument, blockId, patch);
    if (result.ok && result.changed) setActiveDocument(result.doc);
    return result;
  };

  // Table dispatcher (P05-M4, §10.5) — same narrow-prop pattern as the
  // list dispatcher above; every operation keeps its own validation.
  const handleTableContentAction = (
    blockId: DocUUID,
    action: TableContentAction,
  ): TableContentActionResult => {
    const result = applyTableContentAction(activeDocument, blockId, action);
    if (result.ok && result.changed) setActiveDocument(result.doc);
    return result;
  };

  // ── Structural block content (P06-M2) ─────────────────────────────────────
  // The seven structural types (horizontal rule, section break, metadata,
  // revision history, references, exhibit) commit through the immutable
  // `structural-block-content` service — same conventions: no-op returns
  // the same reference (no false Modified status), real changes stamp
  // `modifiedAt`, failures leave the document untouched and surface the
  // service's field-specific message.  Page breaks deliberately have no
  // content actions (structural marker only).
  const handleStructuralAction = (
    blockId: DocUUID,
    action: StructuralContentAction,
  ): StructuralContentActionResult => {
    const result = applyStructuralAction(activeDocument, blockId, action);
    if (result.ok && result.changed) setActiveDocument(result.doc);
    return result;
  };

  // ── Formula block content (P06-M3, §6.3 / §10.6) ──────────────────────────
  // Same conventions as the structural dispatcher: the immutable
  // `formula-content` service validates LaTeX (through the real MathJax
  // engine), alignment, display mode, the optional equation number /
  // "Where:" label and the variable-definition entries; no-op commits
  // return the same reference, real changes stamp `modifiedAt`, and
  // failures leave the document untouched with a field-specific message.
  const handleFormulaAction = (
    blockId: DocUUID,
    action: FormulaContentAction,
  ): FormulaContentActionResult => {
    const result = applyFormulaAction(activeDocument, blockId, action);
    if (result.ok && result.changed) setActiveDocument(result.doc);
    return result;
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
      <Workspace
        onDuplicate={handleDuplicate}
        onReset={handleReset}
        metadata={activeDocument.metadata}
        onMetadataChange={handleMetadataChange}
        labProfile={labProfile}
        onLabProfileSave={handleLabProfileSave}
        labProfileError={labProfileError}
        pageSetup={activeDocument.pageSetup}
        pageTypography={activeDocument.pageTypography}
        frontPageEnabled={activeDocument.frontPage.enabled}
        onPageSetupChange={handlePageSetupChange}
        onTypographyChange={handleTypographyChange}
        onBodyThemeChange={handleBodyThemeChange}
        onDisplayHeaderChange={handleDisplayHeaderChange}
        frontPage={activeDocument.frontPage}
        customFields={activeDocument.metadata.customFields}
        assets={activeDocument.assets}
        onFrontPageChange={handleFrontPageChange}
        onCoverImageSelect={handleCoverImageSelect}
        onCoverImageRemove={handleCoverImageRemove}
        headerFooter={activeDocument.headerFooter}
        onHeaderFooterBandChange={handleHeaderFooterBandChange}
        onWatermarkChange={handleWatermarkChange}
        activeDocument={activeDocument}
        blocks={activeDocument.blocks}
        selectedBlockId={selectedBlockId}
        onSelectBlock={setSelectedBlockId}
        onInsertBlock={handleInsertBlock}
        onDuplicateBlock={handleDuplicateBlock}
        onMoveBlock={handleMoveBlock}
        onDeleteBlock={handleDeleteBlock}
        onSpacingChange={handleSpacingChange}
        onHeadingContentChange={handleHeadingContentChange}
        onParagraphContentChange={handleParagraphContentChange}
        onListContentAction={handleListContentAction}
        onCalloutContentChange={handleCalloutContentChange}
        onTableContentAction={handleTableContentAction}
        onStructuralAction={handleStructuralAction}
        onFormulaAction={handleFormulaAction}
        onRequestConfirm={confirmAction}
      />
      {chooserOpen && (
        <TemplateChooser
          templates={templateCatalog}
          persistence={templatePersistence}
          onSelect={handleChooserSelect}
        />
      )}
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
