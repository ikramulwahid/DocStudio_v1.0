import React, { useState } from 'react';
import { CollapsibleSection } from './CollapsibleSection';
import { DocumentInfoPanel } from './DocumentInfoPanel';
import { LabProfilePanel } from './LabProfilePanel';
import { PageTypographyPanel } from './PageTypographyPanel';
import { FrontPagePanel } from './FrontPagePanel';
import { HeaderFooterPanel } from './HeaderFooterPanel';
import { TrackChangesPanel } from './TrackChangesPanel';
import { SectionState } from '../../types';
import type {
  AssetRecord,
  ContentBlock,
  CustomMetadataField,
  DocumentMetadata,
  FrontPageSettings,
  HeaderFooterSettings,
  PageSetup,
  PageTypographySettings,
} from '../../types/document';
import type { DocUUID } from '../../types/document';
import type { ChangeEvent } from '../../types/change-events';
import type { DocumentChangeView } from '../../services/track-changes';
import type { LabProfile } from '../../types/lab-profile';
import type {
  BodyThemePatch,
  PageSetupPatch,
  SettingsUpdateResult,
  TypographyPatch,
} from '../../services/page-typography';
import type {
  BandKind,
  HeaderFooterPatch,
  HeaderFooterUpdateResult,
  WatermarkPatch,
} from '../../services/header-footer-settings';
import type { FrontPagePatch, FrontPageUpdateResult } from '../../services/front-page';
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
  /** Authoritative `document.pageSetup` (P04-M1). */
  pageSetup?: PageSetup;
  /** Authoritative `document.pageTypography` (P04-M1). */
  pageTypography?: PageTypographySettings;
  /** `document.frontPage.enabled` — gates the display-header control (P04-M1, §8.4). */
  frontPageEnabled?: boolean;
  /** Authoritative `document.frontPage` (P04-M4, §7). */
  frontPage?: FrontPageSettings;
  /** Authoritative `document.metadata.customFields` (labels for `custom:<id>` cover fields). */
  customFields?: readonly CustomMetadataField[];
  /** Authoritative `document.assets` (logo/background filename display). */
  assets?: Record<string, AssetRecord>;
  /** Commit a page-setup patch (P04-M1). */
  onPageSetupChange?: (patch: PageSetupPatch) => SettingsUpdateResult;
  /** Commit a typography patch (P04-M1). */
  onTypographyChange?: (patch: TypographyPatch) => SettingsUpdateResult;
  /** Commit a body-theme patch — theme id / monochrome (P04-M3, §8.3). */
  onBodyThemeChange?: (patch: BodyThemePatch) => SettingsUpdateResult;
  /** Commit the display-header preference (P04-M1). */
  onDisplayHeaderChange?: (value: boolean) => SettingsUpdateResult;
  /** Commit a front-page patch — cover designer (P04-M4, §7). */
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
  /** Authoritative `document.trackChangesEnabled` (P07-M2, §12.1). */
  trackChangesEnabled?: boolean;
  /** Toggle the Track Changes recording state (persists with the document). */
  onTrackChangesToggle?: (enabled: boolean) => void;
  /** Authoritative `document.changeEvents` (P07-M2 append-only log). */
  changeEvents?: readonly ChangeEvent[];
  /** Current blocks, for human-readable change target descriptions. */
  changeBlocks?: readonly ContentBlock[];
  /** Accept one pending tracked change. */
  onAcceptChange?: (eventId: DocUUID) => void;
  /** Reject one pending tracked change (reverses the edit). */
  onRejectChange?: (eventId: DocUUID) => void;
  /** Accept every pending tracked change. */
  onAcceptAllChanges?: () => void;
  /** Reject every pending tracked change (reverse order). */
  onRejectAllChanges?: () => void;
  /** Markup/clean view mode (P07-M2 §12.1 visibility control). */
  changeViewMode?: DocumentChangeView;
  onViewModeChange?: (mode: DocumentChangeView) => void;
  /** Locally configured editor name stamped on new events (P07-M2). */
  editorLabel?: string;
  onEditorLabelChange?: (label: string) => void;
}

export const LeftPanel: React.FC<LeftPanelProps> = ({
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
  frontPage,
  customFields,
  assets,
  onPageSetupChange,
  onTypographyChange,
  onBodyThemeChange,
  onDisplayHeaderChange,
  onFrontPageChange,
  onCoverImageSelect,
  onCoverImageRemove,
  headerFooter,
  onHeaderFooterBandChange,
  onWatermarkChange,
  trackChangesEnabled,
  onTrackChangesToggle,
  changeEvents,
  changeBlocks,
  onAcceptChange,
  onRejectChange,
  onAcceptAllChanges,
  onRejectAllChanges,
  changeViewMode,
  onViewModeChange,
  editorLabel,
  onEditorLabelChange,
}) => {
  const [sections, setSections] = useState<SectionState>({
    documentInfo: true,
    labProfile: true,
    frontPage: true,
    pageTypography: false,
    headerFooter: false,
    trackChanges: false,
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
      trackChanges: true,
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
      trackChanges: false,
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

        {/* 2. Front Page (P04-M4, §7) */}
        <CollapsibleSection
          id="front-page"
          title="Front Page"
          icon="cover"
          isOpen={sections.frontPage}
          onToggle={() => toggleSection('frontPage')}
          badge="P04-M4"
        >
          {frontPage && customFields && assets && onFrontPageChange && onCoverImageSelect && onCoverImageRemove ? (
            <FrontPagePanel
              frontPage={frontPage}
              customFields={customFields}
              assets={assets}
              onFrontPageChange={onFrontPageChange}
              onCoverImageSelect={onCoverImageSelect}
              onCoverImageRemove={onCoverImageRemove}
            />
          ) : (
            <div className="placeholder-box">
              <span className="placeholder-tag">Cover Designer</span>
              <span className="placeholder-subtext">
                Cover designer is unavailable because no active document was provided.
              </span>
            </div>
          )}
        </CollapsibleSection>

        {/* 3. Page & Typography (P04-M1) */}
        <CollapsibleSection
          id="page-typography"
          title="Page & Typography"
          icon="typography"
          isOpen={sections.pageTypography}
          onToggle={() => toggleSection('pageTypography')}
          badge="P04-M1"
        >
          {pageSetup && pageTypography && onPageSetupChange && onTypographyChange && onBodyThemeChange && onDisplayHeaderChange ? (
            <PageTypographyPanel
              pageSetup={pageSetup}
              pageTypography={pageTypography}
              frontPageEnabled={frontPageEnabled ?? false}
              onPageSetupChange={onPageSetupChange}
              onTypographyChange={onTypographyChange}
              onBodyThemeChange={onBodyThemeChange}
              onDisplayHeaderChange={onDisplayHeaderChange}
            />
          ) : (
            <div className="placeholder-box">
              <span className="placeholder-tag">Layout & Fonts</span>
              <span className="placeholder-subtext">
                Page setup and typography are unavailable because no active document was provided.
              </span>
            </div>
          )}
        </CollapsibleSection>

        {/* 4. Header & Footer (P06-M1, §9) */}
        <CollapsibleSection
          id="header-footer"
          title="Header & Footer"
          icon="header-footer"
          isOpen={sections.headerFooter}
          onToggle={() => toggleSection('headerFooter')}
          badge="P06-M1"
        >
          {headerFooter && pageTypography && onHeaderFooterBandChange && onWatermarkChange ? (
            <HeaderFooterPanel
              headerFooter={headerFooter}
              displayHeaderEnabled={pageTypography.displayHeader}
              onBandChange={onHeaderFooterBandChange}
              onWatermarkChange={onWatermarkChange}
            />
          ) : (
            <div className="placeholder-box">
              <span className="placeholder-tag">Page Furniture</span>
              <p className="placeholder-text">
                Grid-based header/footer cells, Page X of Y numbering, watermark controls, and
                front-page exclusions.
              </p>
              <span className="placeholder-subtext">
                Header and footer settings are unavailable because no active document was provided.
              </span>
            </div>
          )}
        </CollapsibleSection>

        {/* 4b. Track Changes (P07-M2, §12.1) */}
        <CollapsibleSection
          id="track-changes"
          title="Track Changes"
          icon="actions"
          isOpen={sections.trackChanges}
          onToggle={() => toggleSection('trackChanges')}
          badge="P07-M2"
        >
          {onTrackChangesToggle &&
          changeEvents !== undefined &&
          changeBlocks !== undefined &&
          onAcceptChange &&
          onRejectChange &&
          onAcceptAllChanges &&
          onRejectAllChanges &&
          onViewModeChange &&
          onEditorLabelChange ? (
            <TrackChangesPanel
              trackChangesEnabled={trackChangesEnabled ?? false}
              onTrackChangesToggle={onTrackChangesToggle}
              changeEvents={changeEvents}
              blocks={changeBlocks}
              onAccept={onAcceptChange}
              onReject={onRejectChange}
              onAcceptAll={onAcceptAllChanges}
              onRejectAll={onRejectAllChanges}
              viewMode={changeViewMode ?? 'markup'}
              onViewModeChange={onViewModeChange}
              editorLabel={editorLabel ?? ''}
              onEditorLabelChange={onEditorLabelChange}
            />
          ) : (
            <div className="placeholder-box">
              <span className="placeholder-tag">Review &amp; Markup</span>
              <span className="placeholder-subtext">
                Track Changes is unavailable because no active document was provided.
              </span>
            </div>
          )}
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
