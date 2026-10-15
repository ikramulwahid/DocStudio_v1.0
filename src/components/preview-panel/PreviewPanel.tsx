import React, { useState } from 'react';
import { Icon } from '../common/Icon';
import './PreviewPanel.css';

export const PreviewPanel: React.FC = () => {
  const [showMarginGuides, setShowMarginGuides] = useState<boolean>(true);
  const [fitMode, setFitMode] = useState<'width' | 'page'>('width');
  const [zoomLevel] = useState<number>(100);

  return (
    <aside className="preview-panel" aria-label="Document preview workspace">
      <div className="preview-toolbar">
        <div className="preview-toolbar-left">
          <span className="page-indicator-pill" title="Current Page Position">
            Page 1 of 1
          </span>

          <button
            type="button"
            className={`toolbar-btn ${showMarginGuides ? 'active' : ''}`}
            onClick={() => setShowMarginGuides(!showMarginGuides)}
            title="Toggle layout margin guides"
            aria-pressed={showMarginGuides}
          >
            <Icon name="margin-guide" size={13} />
            <span>Margin Guides</span>
          </button>
        </div>

        <div className="preview-toolbar-right">
          <button
            type="button"
            className={`toolbar-btn ${fitMode === 'width' ? 'active' : ''}`}
            onClick={() => setFitMode('width')}
            title="Fit Width (Default preview mode)"
          >
            <Icon name="fit-width" size={12} />
            <span>Fit Width</span>
          </button>

          <button
            type="button"
            className={`toolbar-btn ${fitMode === 'page' ? 'active' : ''}`}
            onClick={() => setFitMode('page')}
            title="Fit Entire Page"
          >
            <Icon name="fit-page" size={12} />
            <span>Fit Page</span>
          </button>

          <div className="zoom-group">
            <button
              type="button"
              className="zoom-btn"
              disabled
              title="Zoom out (Engine enabled in Phase 08)"
            >
              <Icon name="zoom-out" size={13} />
            </button>
            <span className="zoom-level-text">{zoomLevel}%</span>
            <button
              type="button"
              className="zoom-btn"
              disabled
              title="Zoom in (Engine enabled in Phase 08)"
            >
              <Icon name="zoom-in" size={13} />
            </button>
          </div>

          <span className="preview-phase-tag" title="Preview Architecture">
            Phase 08 Engine
          </span>
        </div>
      </div>

      <div className="preview-viewport">
        <div
          className="preview-paper"
          style={{
            maxWidth: fitMode === 'page' ? '420px' : '520px',
          }}
        >
          {showMarginGuides && (
            <div className="preview-margin-guide">
              <span className="guide-label">Normal Margin: 25mm</span>
            </div>
          )}

          <div className="paper-header-zone">
            <span>DocStudio Laboratory Document</span>
            <span>Ref: SOP-LAB-001</span>
          </div>

          <div className="paper-body-zone">
            <Icon name="logo" size={44} className="paper-watermark-icon" />
            <h3 className="paper-placeholder-title">Paginated Document Preview</h3>
            <p className="paper-placeholder-desc">
              Live paginated PDF preview with exact typography, pagination, header/footer repetition,
              and margin rendering is scheduled for Phase 08.
            </p>
          </div>

          <div className="paper-footer-zone">
            <span>Confidential &amp; Proprietary</span>
            <span>Page 1 of 1</span>
          </div>
        </div>
      </div>
    </aside>
  );
};
