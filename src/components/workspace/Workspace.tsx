import React from 'react';
import { LeftPanel } from '../left-panel/LeftPanel';
import { EditorPanel } from '../editor-panel/EditorPanel';
import { PreviewPanel } from '../preview-panel/PreviewPanel';
import './Workspace.css';

interface WorkspaceProps {
  /** Duplicate-document handler (P02-M3 lifecycle), wired to the Left Panel actions section. */
  onDuplicate?: () => void;
  /** Reset-settings handler (P02-M3 lifecycle), wired to the Left Panel actions section. */
  onReset?: () => void;
}

export const Workspace: React.FC<WorkspaceProps> = ({ onDuplicate, onReset }) => {
  return (
    <div className="workspace">
      <LeftPanel onDuplicate={onDuplicate} onReset={onReset} />
      <EditorPanel />
      <PreviewPanel />
    </div>
  );
};
