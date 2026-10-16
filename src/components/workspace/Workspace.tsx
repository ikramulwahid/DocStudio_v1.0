import React from 'react';
import { LeftPanel } from '../left-panel/LeftPanel';
import { EditorPanel } from '../editor-panel/EditorPanel';
import { PreviewPanel } from '../preview-panel/PreviewPanel';
import type { DocumentMetadata } from '../../types/document';
import type { LabProfile } from '../../types/lab-profile';
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
}

export const Workspace: React.FC<WorkspaceProps> = ({
  onDuplicate,
  onReset,
  metadata,
  onMetadataChange,
  labProfile,
  onLabProfileSave,
  labProfileError,
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
      />
      <EditorPanel />
      <PreviewPanel />
    </div>
  );
};
