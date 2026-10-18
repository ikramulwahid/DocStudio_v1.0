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
  PageSetup,
  PageTypographySettings,
} from '../../types/document';
import type { BlockType } from '../../types/blocks';
import type { LabProfile } from '../../types/lab-profile';
import type {
  BlockActionResult,
  BlockPlacement,
  BlockSpacingField,
} from '../../services/block-actions';
import type {
  BodyThemePatch,
  PageSetupPatch,
  SettingsUpdateResult,
  TypographyPatch,
} from '../../services/page-typography';
import type { FrontPagePatch, FrontPageUpdateResult } from '../../services/front-page';
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
  activeDocument,
  blocks,
  selectedBlockId,
  onSelectBlock,
  onInsertBlock,
  onDuplicateBlock,
  onMoveBlock,
  onDeleteBlock,
  onSpacingChange,
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
      />
      <PreviewPanel document={activeDocument} />
    </div>
  );
};
