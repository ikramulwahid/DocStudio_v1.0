// ── Phase 01 UI preference types (application state, not document schema) ────
export type ThemeMode = 'multicolor' | 'light' | 'dark';

export type DocumentSessionStatus = 'New' | 'Saved' | 'Modified';

export interface SectionState {
  documentInfo: boolean;
  labProfile: boolean;
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

// ── Phase 03 template schema ──────────────────────────────────────────────────
export * from './template';
export * from './template-defaults';
export * from './lab-profile';
