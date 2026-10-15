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
