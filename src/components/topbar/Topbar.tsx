import React from 'react';
import { Icon } from '../common/Icon';
import { ThemeMode, DocumentSessionStatus } from '../../types';
import './Topbar.css';

interface TopbarProps {
  currentTheme: ThemeMode;
  onThemeChange: (theme: ThemeMode) => void;
  documentName?: string;
  sessionStatus?: DocumentSessionStatus;
  /** New-document handler (P02-M3 lifecycle). Button stays disabled when absent. */
  onNew?: () => void;
  /** Save handler (P02-M2 native .docstudio save). Button stays disabled when absent. */
  onSave?: () => void;
  /** Open handler (P02-M2 native .docstudio open). Button stays disabled when absent. */
  onOpen?: () => void;
  /** Clear-contents handler (P02-M3 lifecycle). Button stays disabled when absent. */
  onClear?: () => void;
}

export const Topbar: React.FC<TopbarProps> = ({
  currentTheme,
  onThemeChange,
  documentName = 'Untitled-1.docstudio',
  sessionStatus = 'New',
  onNew,
  onSave,
  onOpen,
  onClear,
}) => {
  return (
    <header className="topbar">
      <div className="topbar-left">
        <div className="topbar-brand">
          <Icon name="logo" size={26} />
          <span className="brand-title">DocStudio</span>
          <span className="brand-version">v1.0</span>
        </div>

        <div className="topbar-divider" />

        <div className="topbar-doc-info">
          <div className="doc-status-badge">
            <span className="status-dot" />
            <span>{sessionStatus}</span>
          </div>
          <span className="doc-name" title={`Active Project: ${documentName}`}>
            {documentName}
          </span>
        </div>
      </div>

      <div className="topbar-right">
        <nav className="topbar-actions" aria-label="Document actions">
          <button
            type="button"
            className={`topbar-btn ${onNew ? '' : 'disabled'}`}
            disabled={!onNew}
            onClick={onNew}
            title="New document"
          >
            <Icon name="new" size={14} />
            <span>New</span>
          </button>

          <button
            type="button"
            className={`topbar-btn ${onSave ? '' : 'disabled'}`}
            disabled={!onSave}
            onClick={onSave}
            title="Save project to a .docstudio file"
          >
            <Icon name="save" size={14} />
            <span>Save</span>
          </button>

          <button
            type="button"
            className={`topbar-btn ${onOpen ? '' : 'disabled'}`}
            disabled={!onOpen}
            onClick={onOpen}
            title="Open a .docstudio project file"
          >
            <Icon name="open" size={14} />
            <span>Open</span>
          </button>

          <button
            type="button"
            className="topbar-btn disabled"
            disabled
            title="Export PDF (Phase 08: Pagination & PDF export engine)"
          >
            <Icon name="export" size={14} />
            <span>Export</span>
          </button>

          <button
            type="button"
            className={`topbar-btn ${onClear ? '' : 'disabled'}`}
            disabled={!onClear}
            onClick={onClear}
            title="Clear document contents (keeps information and settings)"
          >
            <Icon name="clear" size={14} />
            <span>Clear Document</span>
          </button>
        </nav>

        <div className="topbar-divider" />

        <div className="theme-switcher" role="radiogroup" aria-label="Interface theme mode">
          <button
            type="button"
            className={`theme-btn ${currentTheme === 'multicolor' ? 'active' : ''}`}
            onClick={() => onThemeChange('multicolor')}
            title="Switch to Multicolor Mode"
            role="radio"
            aria-checked={currentTheme === 'multicolor'}
          >
            <Icon name="palette" size={13} />
            <span>Multicolor</span>
          </button>

          <button
            type="button"
            className={`theme-btn ${currentTheme === 'light' ? 'active' : ''}`}
            onClick={() => onThemeChange('light')}
            title="Switch to Light Mode"
            role="radio"
            aria-checked={currentTheme === 'light'}
          >
            <Icon name="sun" size={13} />
            <span>Light</span>
          </button>

          <button
            type="button"
            className={`theme-btn ${currentTheme === 'dark' ? 'active' : ''}`}
            onClick={() => onThemeChange('dark')}
            title="Switch to Dark Mode"
            role="radio"
            aria-checked={currentTheme === 'dark'}
          >
            <Icon name="moon" size={13} />
            <span>Dark</span>
          </button>
        </div>
      </div>
    </header>
  );
};
