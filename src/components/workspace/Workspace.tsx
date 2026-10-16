import React from 'react';
import { LeftPanel } from '../left-panel/LeftPanel';
import { EditorPanel } from '../editor-panel/EditorPanel';
import { PreviewPanel } from '../preview-panel/PreviewPanel';
import type { DocumentMetadata } from '../../types/document';
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
}

export const Workspace: React.FC<WorkspaceProps> = ({
  onDuplicate,
  onReset,
  metadata,
  onMetadataChange,
}) => {
  return (
    <div className="workspace">
      <LeftPanel
        onDuplicate={onDuplicate}
        onReset={onReset}
        metadata={metadata}
        onMetadataChange={onMetadataChange}
      />
      <EditorPanel />
      <PreviewPanel />
    </div>
  );
};
