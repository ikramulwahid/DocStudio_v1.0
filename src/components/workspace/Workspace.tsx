import React from 'react';
import { LeftPanel } from '../left-panel/LeftPanel';
import { EditorPanel } from '../editor-panel/EditorPanel';
import { PreviewPanel } from '../preview-panel/PreviewPanel';
import './Workspace.css';

export const Workspace: React.FC = () => {
  return (
    <div className="workspace">
      <LeftPanel />
      <EditorPanel />
      <PreviewPanel />
    </div>
  );
};
