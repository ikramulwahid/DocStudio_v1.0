import React from 'react';
import { LeftPanel } from '../left-panel/LeftPanel';
import { EditorPanel } from '../editor-panel/EditorPanel';
import { PreviewPanel } from '../preview-panel/PreviewPanel';
import type {
  AssetRecord,
  ContentBlock,
  CustomMetadataField,
  DocStudioDocument,
  DocUUID,
  DocumentMetadata,
  FrontPageSettings,
  HeaderFooterSettings,
  PageSetup,
  PageTypographySettings,
  SavedRevision,
} from '../../types/document';
import type { BlockType } from '../../types/blocks';
import type { LabProfile } from '../../types/lab-profile';
import type { ChangeEvent } from '../../types/change-events';
import type { DocumentChangeView } from '../../services/track-changes';
import type {
  BlockActionResult,
  BlockPlacement,
  BlockSpacingField,
} from '../../services/block-actions';
import type {
  ContentActionResult,
  HeadingContentPatch,
  ParagraphContentPatch,
} from '../../services/block-content';
import type {
  CalloutContentActionResult,
  CalloutContentPatch,
  ListContentAction,
  ListContentActionResult,
} from '../../services/list-callout-content';
import type {
  TableContentAction,
  TableContentActionResult,
} from '../../services/table-content';
import type {
  StructuralContentAction,
  StructuralContentActionResult,
} from '../../services/structural-block-content';
import type {
  FormulaContentAction,
  FormulaContentActionResult,
} from '../../services/formula-content';
import type {
  ImageSignatureContentAction,
  ImageSignatureActionResult,
} from '../../services/image-signature-content';
import type {
  LabContentAction,
  LabContentActionResult,
} from '../../services/lab-block-content';
import type {
  BodyThemePatch,
  PageSetupPatch,
  SettingsUpdateResult,
  TypographyPatch,
} from '../../services/page-typography';
import type { FrontPagePatch, FrontPageUpdateResult } from '../../services/front-page';
import type {
  SnapshotCreateResult,
  SnapshotHistoryStats,
  SnapshotInput,
} from '../../services/snapshots';
import type {
  BandKind,
  HeaderFooterPatch,
  HeaderFooterUpdateResult,
  WatermarkPatch,
} from '../../services/header-footer-settings';
import './Workspace.css';

interface WorkspaceProps {
  /** Duplicate-document handler (P02-M3 lifecycle), wired to the Left Panel actions section. */
  onDuplicate?: () => void;
  /** Reset-settings handler (P02-M3 lifecycle), wired to the Left Panel actions section. */
  onReset?: () => void;
  /** Authoritative document metadata (P02-M5), wired to the Document Information panel. */
  metadata?: DocumentMetadata;
  /** Immutable metadata update handler (P02-M5). */
  onMetadataChange?: (patch: Partial<DocumentMetadata>) => void;
  /** Authoritative saved Laboratory Profile (P03-M2). */
  labProfile?: LabProfile;
  /** Commit the edited Laboratory Profile (P03-M2). */
  onLabProfileSave?: (profile: LabProfile) => void;
  /** Optional profile load/save error surfaced from the App. */
  labProfileError?: string | null;
  /** Authoritative `document.pageSetup` (P04-M1). */
  pageSetup?: PageSetup;
  /** Authoritative `document.pageTypography` (P04-M1). */
  pageTypography?: PageTypographySettings;
  /** `document.frontPage.enabled` (P04-M1, §8.4). */
  frontPageEnabled?: boolean;
  /** Commit a page-setup patch (P04-M1). */
  onPageSetupChange?: (patch: PageSetupPatch) => SettingsUpdateResult;
  /** Commit a typography patch (P04-M1). */
  onTypographyChange?: (patch: TypographyPatch) => SettingsUpdateResult;
  /** Commit a body-theme patch — theme id / monochrome (P04-M3, §8.3). */
  onBodyThemeChange?: (patch: BodyThemePatch) => SettingsUpdateResult;
  /** Commit the display-header preference (P04-M1). */
  onDisplayHeaderChange?: (value: boolean) => SettingsUpdateResult;
  /** Authoritative `document.frontPage` (P04-M4, §7). */
  frontPage?: FrontPageSettings;
  /** Authoritative `document.metadata.customFields` (cover `custom:<id>` labels). */
  customFields?: readonly CustomMetadataField[];
  /** Authoritative `document.assets` (cover image filename display). */
  assets?: Record<string, AssetRecord>;
  /** Commit a front-page patch (P04-M4, §7). */
  onFrontPageChange?: (patch: FrontPagePatch) => FrontPageUpdateResult;
  /** Open the native picker and embed a cover image (async; cancel = no-op). */
  onCoverImageSelect?: (target: 'logo' | 'background') => Promise<FrontPageUpdateResult>;
  /** Clear a cover image reference and prune the orphan when safe. */
  onCoverImageRemove?: (target: 'logo' | 'background') => FrontPageUpdateResult;
  /** Authoritative `document.headerFooter` (P06-M1, §9). */
  headerFooter?: HeaderFooterSettings;
  /** Commit a header/footer band patch (P06-M1). */
  onHeaderFooterBandChange?: (band: BandKind, patch: HeaderFooterPatch) => HeaderFooterUpdateResult;
  /** Commit a watermark patch (P06-M1). */
  onWatermarkChange?: (patch: WatermarkPatch) => HeaderFooterUpdateResult;
  /** Active document for the preview's "render active document" option (P04-M4). */
  activeDocument?: DocStudioDocument;
  /** Authoritative `document.blocks` (P05-M1 block framework). */
  blocks: readonly ContentBlock[];
  /** Selected block's stable ID — App-owned session state (P05-M1). */
  selectedBlockId: DocUUID | null;
  /** Select a block by its stable ID (P05-M1). */
  onSelectBlock: (blockId: DocUUID) => void;
  /** Insert a block at the given placement in the active document (P05-M1). */
  onInsertBlock: (type: BlockType, placement: BlockPlacement) => BlockActionResult;
  /** Duplicate the identified block (P05-M1). */
  onDuplicateBlock: (blockId: DocUUID) => BlockActionResult;
  /** Move the identified block one position up or down (P05-M1). */
  onMoveBlock: (blockId: DocUUID, direction: 'up' | 'down') => BlockActionResult;
  /** Request block deletion — App owns the confirmation dialog (P05-M1). */
  onDeleteBlock: (blockId: DocUUID) => void;
  /** Commit one validated spacing field (points) for a block (P05-M1). */
  onSpacingChange: (
    blockId: DocUUID,
    field: BlockSpacingField,
    value: number,
  ) => BlockActionResult;
  /** Commit a heading content patch (P05-M2, §10.1). */
  onHeadingContentChange: (
    blockId: DocUUID,
    patch: HeadingContentPatch,
  ) => ContentActionResult;
  /** Commit a paragraph content patch (P05-M2, §10.2). */
  onParagraphContentChange: (
    blockId: DocUUID,
    patch: ParagraphContentPatch,
  ) => ContentActionResult;
  /** Dispatch one validated list action (P05-M3, §10.4). */
  onListContentAction: (
    blockId: DocUUID,
    action: ListContentAction,
  ) => ListContentActionResult;
  /** Commit a callout content patch (P05-M3, §10.3). */
  onCalloutContentChange: (
    blockId: DocUUID,
    patch: CalloutContentPatch,
  ) => CalloutContentActionResult;
  /** Dispatch one validated table action (P05-M4, §10.5). */
  onTableContentAction: (
    blockId: DocUUID,
    action: TableContentAction,
  ) => TableContentActionResult;
  /** Dispatch one validated structural action (P06-M2, §6.2). */
  onStructuralAction: (
    blockId: DocUUID,
    action: StructuralContentAction,
  ) => StructuralContentActionResult;
  /** Dispatch one validated formula action (P06-M3, §6.3). */
  onFormulaAction: (
    blockId: DocUUID,
    action: FormulaContentAction,
  ) => FormulaContentActionResult;
  /** Dispatch one validated image/signature action (P06-M4, §6.4/§6.5). */
  onImageSignatureAction: (
    blockId: DocUUID,
    action: ImageSignatureContentAction,
  ) => ImageSignatureActionResult;
  /** Dispatch one validated laboratory-block action (P06-M5, §6.6). */
  onLabAction: (
    blockId: DocUUID,
    action: LabContentAction,
  ) => LabContentActionResult;
  /** Pick a local image file (native dialog) and attach it to the slot. */
  onPickImage: (blockId: DocUUID, imageId: DocUUID) => Promise<{ ok: boolean; message: string }>;
  /** Ask the App to confirm a content-losing action (table column removal). */
  onRequestConfirm: (
    title: string,
    message: string,
    confirmLabel: string,
    onConfirm: () => void,
  ) => void;
  // ── P07-M2 Track Changes (§12.1) ─────────────────────────────────────────
  /** Authoritative `document.trackChangesEnabled`. */
  trackChangesEnabled?: boolean;
  /** Toggle the Track Changes recording state. */
  onTrackChangesToggle?: (enabled: boolean) => void;
  /** Authoritative `document.changeEvents` (append-only log). */
  changeEvents?: readonly ChangeEvent[];
  /** Accept one pending tracked change. */
  onAcceptChange?: (eventId: DocUUID) => void;
  /** Reject one pending tracked change (reverses the edit). */
  onRejectChange?: (eventId: DocUUID) => void;
  /** Accept every pending tracked change. */
  onAcceptAllChanges?: () => void;
  /** Reject every pending tracked change (reverse order). */
  onRejectAllChanges?: () => void;
  /** Markup/clean view mode (editor + preview + default PDF choice). */
  changeView?: DocumentChangeView;
  onViewModeChange?: (mode: DocumentChangeView) => void;
  /** Locally configured editor name stamped on new events. */
  editorLabel?: string;
  onEditorLabelChange?: (label: string) => void;
  // ── P07-M3 Saved Revisions (§12.2) ─────────────────────────────────────────
  /** Authoritative `document.savedRevisions` (chronological snapshot history). */
  savedRevisions?: readonly SavedRevision[];
  /** Measured snapshot-history size report (R-003, advisory only). */
  snapshotHistory?: SnapshotHistoryStats;
  /** Save a snapshot of the current document state (returns inline result). */
  onCreateSnapshot?: (input: SnapshotInput) => SnapshotCreateResult;
  /** Request a restore — App owns the unsaved guard + confirmation. */
  onRestoreSnapshot?: (revisionId: DocUUID) => void;
  /** Request deletion of one snapshot — App owns the confirmation. */
  onDeleteSnapshot?: (revisionId: DocUUID) => void;
}

export const Workspace: React.FC<WorkspaceProps> = ({
  onDuplicate,
  onReset,
  metadata,
  onMetadataChange,
  labProfile,
  onLabProfileSave,
  labProfileError,
  pageSetup,
  pageTypography,
  frontPageEnabled,
  onPageSetupChange,
  onTypographyChange,
  onBodyThemeChange,
  onDisplayHeaderChange,
  frontPage,
  customFields,
  assets,
  onFrontPageChange,
  onCoverImageSelect,
  onCoverImageRemove,
  headerFooter,
  onHeaderFooterBandChange,
  onWatermarkChange,
  activeDocument,
  blocks,
  selectedBlockId,
  onSelectBlock,
  onInsertBlock,
  onDuplicateBlock,
  onMoveBlock,
  onDeleteBlock,
  onSpacingChange,
  onHeadingContentChange,
  onParagraphContentChange,
  onListContentAction,
  onCalloutContentChange,
  onTableContentAction,
  onStructuralAction,
  onFormulaAction,
  onImageSignatureAction,
  onLabAction,
  onPickImage,
  onRequestConfirm,
  trackChangesEnabled,
  onTrackChangesToggle,
  changeEvents,
  onAcceptChange,
  onRejectChange,
  onAcceptAllChanges,
  onRejectAllChanges,
  changeView,
  onViewModeChange,
  editorLabel,
  onEditorLabelChange,
  savedRevisions,
  snapshotHistory,
  onCreateSnapshot,
  onRestoreSnapshot,
  onDeleteSnapshot,
}) => {
  return (
    <div className="workspace">
      <LeftPanel
        onDuplicate={onDuplicate}
        onReset={onReset}
        metadata={metadata}
        onMetadataChange={onMetadataChange}
        labProfile={labProfile}
        onLabProfileSave={onLabProfileSave}
        labProfileError={labProfileError}
        pageSetup={pageSetup}
        pageTypography={pageTypography}
        frontPageEnabled={frontPageEnabled}
        onPageSetupChange={onPageSetupChange}
        onTypographyChange={onTypographyChange}
        onBodyThemeChange={onBodyThemeChange}
        onDisplayHeaderChange={onDisplayHeaderChange}
        frontPage={frontPage}
        customFields={customFields}
        assets={assets}
        onFrontPageChange={onFrontPageChange}
        onCoverImageSelect={onCoverImageSelect}
        onCoverImageRemove={onCoverImageRemove}
        headerFooter={headerFooter}
        onHeaderFooterBandChange={onHeaderFooterBandChange}
        onWatermarkChange={onWatermarkChange}
        trackChangesEnabled={trackChangesEnabled}
        onTrackChangesToggle={onTrackChangesToggle}
        changeEvents={changeEvents}
        changeBlocks={blocks}
        onAcceptChange={onAcceptChange}
        onRejectChange={onRejectChange}
        onAcceptAllChanges={onAcceptAllChanges}
        onRejectAllChanges={onRejectAllChanges}
        changeViewMode={changeView}
        onViewModeChange={onViewModeChange}
        editorLabel={editorLabel}
        onEditorLabelChange={onEditorLabelChange}
        savedRevisions={savedRevisions}
        snapshotHistory={snapshotHistory}
        onCreateSnapshot={onCreateSnapshot}
        onRestoreSnapshot={onRestoreSnapshot}
        onDeleteSnapshot={onDeleteSnapshot}
      />
      <EditorPanel
        blocks={blocks}
        selectedBlockId={selectedBlockId}
        onSelectBlock={onSelectBlock}
        onInsertBlock={onInsertBlock}
        onDuplicateBlock={onDuplicateBlock}
        onMoveBlock={onMoveBlock}
        onDeleteBlock={onDeleteBlock}
        onSpacingChange={onSpacingChange}
        onHeadingContentChange={onHeadingContentChange}
        onParagraphContentChange={onParagraphContentChange}
        onListContentAction={onListContentAction}
        onCalloutContentChange={onCalloutContentChange}
        onTableContentAction={onTableContentAction}
        onStructuralAction={onStructuralAction}
        onFormulaAction={onFormulaAction}
        onImageSignatureAction={onImageSignatureAction}
        onLabAction={onLabAction}
        onPickImage={onPickImage}
        customFields={customFields}
        assets={assets ? Object.values(assets) : []}
        onRequestConfirm={onRequestConfirm}
        changeEvents={changeEvents}
        changeView={changeView ?? 'clean'}
      />
      <PreviewPanel document={activeDocument} changeView={changeView ?? 'clean'} />
    </div>
  );
};
