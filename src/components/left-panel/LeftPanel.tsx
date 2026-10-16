import React, { useState } from 'react';
import { CollapsibleSection } from './CollapsibleSection';
import { DocumentInfoPanel } from './DocumentInfoPanel';
import { LabProfilePanel } from './LabProfilePanel';
import { SectionState } from '../../types';
import type { DocumentMetadata } from '../../types/document';
import type { LabProfile } from '../../types/lab-profile';
import './LeftPanel.css';

interface LeftPanelProps {
  /** Duplicate-document handler (P02-M3). */
  onDuplicate?: () => void;
  /** Reset-settings handler (P02-M3). */
  onReset?: () => void;
  /** Authoritative document metadata for the Document Information panel (P02-M5). */
  metadata?: DocumentMetadata;
  /** Immutable metadata update handler (P02-M5). */
  onMetadataChange?: (patch: Partial<DocumentMetadata>) => void;
  /** Authoritative saved Laboratory Profile (P03-M2). */
  labProfile?: LabProfile;
  /** Commit the edited Laboratory Profile (persists via the App). */
  onLabProfileSave?: (profile: LabProfile) => void;
  /** Optional profile load/save error surfaced from the App. */
  labProfileError?: string | null;
}

export const LeftPanel: React.FC<LeftPanelProps> = ({
  onDuplicate,
  onReset,
  metadata,
  onMetadataChange,
  labProfile,
  onLabProfileSave,
  labProfileError,
}) => {
  const [sections, setSections] = useState<SectionState>({
    documentInfo: true,
    labProfile: true,
    frontPage: true,
    pageTypography: false,
    headerFooter: false,
    documentStatistics: true,
    documentActions: false,
  });

  const toggleSection = (key: keyof SectionState) => {
    setSections((prev) => ({
      ...prev,
      [key]: !prev[key],
    }));
  };

  const expandAll = () => {
    setSections({
      documentInfo: true,
      labProfile: true,
      frontPage: true,
      pageTypography: true,
      headerFooter: true,
      documentStatistics: true,
      documentActions: true,
    });
  };

  const collapseAll = () => {
    setSections({
      documentInfo: false,
      labProfile: false,
      frontPage: false,
      pageTypography: false,
      headerFooter: false,
      documentStatistics: false,
      documentActions: false,
    });
  };

  return (
    <aside className="left-panel" aria-label="Document settings panel">
      <div className="panel-header-bar">
        <span className="panel-header-title">Document Settings</span>
        <div style={{ display: 'flex', gap: '4px' }}>
          <button type="button" className="panel-header-action" onClick={expandAll}>
            Expand
          </button>
          <button type="button" className="panel-header-action" onClick={collapseAll}>
            Collapse
          </button>
        </div>
      </div>

      <div className="panel-scroll-area">
        {/* 1. Document Information */}
        <CollapsibleSection
          id="doc-info"
          title="Document Information"
          icon="info"
          isOpen={sections.documentInfo}
          onToggle={() => toggleSection('documentInfo')}
          badge="Phase 02"
        >
          {metadata && onMetadataChange ? (
            <DocumentInfoPanel metadata={metadata} onMetadataChange={onMetadataChange} />
          ) : (
            <div className="placeholder-box">
              <span className="placeholder-tag">Document Metadata</span>
              <span className="placeholder-subtext">
                Metadata editing is unavailable because no active document was provided.
              </span>
            </div>
          )}
        </CollapsibleSection>

        {/* 1b. Laboratory Profile (P03-M2) */}
        <CollapsibleSection
          id="lab-profile"
          title="Laboratory Profile"
          icon="info"
          isOpen={sections.labProfile}
          onToggle={() => toggleSection('labProfile')}
          badge="Phase 03"
        >
          {labProfile && onLabProfileSave ? (
            <LabProfilePanel profile={labProfile} onSave={onLabProfileSave} error={labProfileError} />
          ) : (
            <div className="placeholder-box">
              <span className="placeholder-tag">Laboratory Profile</span>
              <span className="placeholder-subtext">
                Profile editing is unavailable because no profile was provided.
              </span>
            </div>
          )}
        </CollapsibleSection>

        {/* 2. Front Page */}
        <CollapsibleSection
          id="front-page"
          title="Front Page"
          icon="cover"
          isOpen={sections.frontPage}
          onToggle={() => toggleSection('frontPage')}
          badge="Phase 04"
        >
          <div className="placeholder-box">
            <span className="placeholder-tag">Cover Designer</span>
            <p className="placeholder-text">
              Toggle front page, select from 10 distinct cover themes, logo placement, frames, and monochrome adaptation.
            </p>
            <div className="form-row-placeholder">
              <span className="form-label-placeholder">Cover Layout Theme</span>
              <div className="form-input-placeholder">Classic Formal (Default)</div>
            </div>
            <span className="placeholder-subtext">Front-page layout engine scheduled for Phase 04.</span>
          </div>
        </CollapsibleSection>

        {/* 3. Page & Typography */}
        <CollapsibleSection
          id="page-typography"
          title="Page & Typography"
          icon="typography"
          isOpen={sections.pageTypography}
          onToggle={() => toggleSection('pageTypography')}
          badge="Phase 04"
        >
          <div className="placeholder-box">
            <span className="placeholder-tag">Layout & Fonts</span>
            <p className="placeholder-text">
              Paper size (A4, A3, Letter, Legal), margins, orientation, 10 body typography themes, and centralized heading scales.
            </p>
            <div className="form-row-placeholder">
              <span className="form-label-placeholder">Paper Size & Orientation</span>
              <div className="form-input-placeholder">A4 (210 × 297 mm) · Portrait</div>
            </div>
            <span className="placeholder-subtext">Paper setup and font hierarchy will be activated in Phase 04.</span>
          </div>
        </CollapsibleSection>

        {/* 4. Header & Footer */}
        <CollapsibleSection
          id="header-footer"
          title="Header & Footer"
          icon="header-footer"
          isOpen={sections.headerFooter}
          onToggle={() => toggleSection('headerFooter')}
          badge="Phase 06"
        >
          <div className="placeholder-box">
            <span className="placeholder-tag">Page Furniture</span>
            <p className="placeholder-text">
              Grid-based header/footer cells, Page X of Y numbering, watermark controls, and front-page exclusions.
            </p>
            <div className="form-row-placeholder">
              <span className="form-label-placeholder">Page Numbering Format</span>
              <div className="form-input-placeholder">Page X of Y</div>
            </div>
            <span className="placeholder-subtext">Header and footer grid editor will be introduced in Phase 06.</span>
          </div>
        </CollapsibleSection>

        {/* 5. Document Statistics */}
        <CollapsibleSection
          id="doc-statistics"
          title="Document Statistics"
          icon="statistics"
          isOpen={sections.documentStatistics}
          onToggle={() => toggleSection('documentStatistics')}
          badge="Phase 09"
        >
          <div className="placeholder-box">
            <span className="placeholder-tag">Live Metrics</span>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', margin: '4px 0' }}>
              <div className="form-input-placeholder" style={{ justifyContent: 'center' }}>0 Words</div>
              <div className="form-input-placeholder" style={{ justifyContent: 'center' }}>0 Characters</div>
              <div className="form-input-placeholder" style={{ justifyContent: 'center' }}>0 Blocks</div>
              <div className="form-input-placeholder" style={{ justifyContent: 'center' }}>1 Page</div>
            </div>
            <span className="placeholder-subtext">Actual layout-derived metrics will be connected in Phase 09.</span>
          </div>
        </CollapsibleSection>

        {/* 6. Document Actions */}
        <CollapsibleSection
          id="doc-actions"
          title="Document Actions"
          icon="actions"
          isOpen={sections.documentActions}
          onToggle={() => toggleSection('documentActions')}
          badge="Phase 02 / 09"
        >
          <div className="placeholder-box">
            <span className="placeholder-tag">Lifecycle & Reset</span>
            <p className="placeholder-text">
              Duplicate the current document or restore layout settings to defaults. Both keep the
              current project untouched where applicable and ask for confirmation first.
            </p>
            <button
              type="button"
              className={`doc-action-btn ${onDuplicate ? '' : 'disabled'}`}
              disabled={!onDuplicate}
              onClick={onDuplicate}
              title="Create an independent unsaved copy of the current document"
            >
              Duplicate Document
            </button>
            <button
              type="button"
              className={`doc-action-btn ${onReset ? '' : 'disabled'}`}
              disabled={!onReset}
              onClick={onReset}
              title="Reset page, theme, front-page and header/footer settings to defaults (keeps content)"
            >
              Reset Settings to Defaults
            </button>
            <span className="placeholder-subtext">
              Revision restore arrives with Phase 07; additional statistics-driven actions with Phase 09.
            </span>
          </div>
        </CollapsibleSection>
      </div>
    </aside>
  );
};
