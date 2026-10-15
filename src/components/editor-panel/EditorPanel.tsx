import React from 'react';
import { Icon } from '../common/Icon';
import './EditorPanel.css';

export const EditorPanel: React.FC = () => {
  return (
    <main className="editor-panel" aria-label="Document editor workspace">
      <div className="editor-header-bar">
        <div className="editor-header-left">
          <span className="editor-title">Document Editor</span>
          <span className="editor-phase-badge">Phase 05 Scheduled</span>
        </div>
      </div>

      <div className="editor-scroll-area">
        <div className="editor-canvas-container">
          <div className="editor-notice-card">
            <span className="notice-badge">Modular Editor Workspace</span>
            <h2 className="notice-title">Document Content &amp; Block Editor</h2>
            <p className="notice-desc">
              Structured block authoring will be implemented in Phase 05. The editor will support
              reorderable blocks with stable IDs, including Headings (H1–H4), Rich Text Paragraphs, Callouts,
              Bulleted/Numbered Lists, Tables, LaTeX Formulas, Images, Signatures, and ISO/IEC 17025 technical blocks.
            </p>
          </div>

          <div className="block-preview-list">
            <div className="block-preview-card">
              <div className="block-card-left">
                <span className="block-type-tag">H1</span>
                <span className="block-card-title">1.0 Scope and Field of Application</span>
              </div>
              <span className="block-status-tag">Heading Block (Placeholder)</span>
            </div>

            <div className="block-preview-card">
              <div className="block-card-left">
                <span className="block-type-tag">TEXT</span>
                <span className="block-card-title">Laboratory procedure requirements and standards...</span>
              </div>
              <span className="block-status-tag">Paragraph Block (Placeholder)</span>
            </div>

            <div className="block-preview-card">
              <div className="block-card-left">
                <span className="block-type-tag">TABLE</span>
                <span className="block-card-title">Standard Calibration &amp; Measurement Table (2 × 2)</span>
              </div>
              <span className="block-status-tag">Table Block (Placeholder)</span>
            </div>

            <div className="block-preview-card">
              <div className="block-card-left">
                <span className="block-type-tag">SIG</span>
                <span className="block-card-title">Author, Reviewer, and Approval Signatures</span>
              </div>
              <span className="block-status-tag">Signature Block (Placeholder)</span>
            </div>
          </div>

          <button
            type="button"
            className="add-block-placeholder-btn"
            disabled
            title="Block insertion will be enabled in Phase 05"
          >
            <Icon name="plus" size={15} />
            <span>Add Content Block (Disabled — Available in Phase 05)</span>
          </button>
        </div>
      </div>
    </main>
  );
};
