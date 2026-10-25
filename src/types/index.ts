// ── Phase 01 UI preference types (application state, not document schema) ────
export type ThemeMode = 'multicolor' | 'light' | 'dark';

export type DocumentSessionStatus = 'New' | 'Saved' | 'Modified';

export interface SectionState {
  documentInfo: boolean;
  labProfile: boolean;
  frontPage: boolean;
  pageTypography: boolean;
  headerFooter: boolean;
  trackChanges: boolean;
  savedRevisions: boolean;
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

// ── Phase 07 change-tracking model (typed foundation, P07-M1) ─────────────────
export * from './change-events';
