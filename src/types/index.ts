// ── Phase 01 UI preference types (application state, not document schema) ────
export type ThemeMode = 'multicolor' | 'light' | 'dark';

export type DocumentSessionStatus = 'New' | 'Saved' | 'Modified';

export interface SectionState {
  documentInfo: boolean;
  frontPage: boolean;
  pageTypography: boolean;
  headerFooter: boolean;
  documentStatistics: boolean;
  documentActions: boolean;
}

// ── Phase 02 document schema ──────────────────────────────────────────────────
export * from './document';
export * from './blocks';
export * from './defaults';
