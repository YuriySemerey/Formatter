export type Encoding = "UTF-8" | "UTF-16LE" | "Windows-1251" | "ISO-8859-1" | "ASCII";

export type FormatterMode = "product-price-list" | "generic-text";

export type CaseMode = "none" | "lower" | "upper" | "sentence" | "title";

export type AppearanceDensity = "standard" | "compact";

export type ActionButtonsPlacement = "aboveInput" | "aboveOutput";

export interface GenericFormatOptions {
  trimLines: boolean;
  collapseEmptyLines: boolean;
  maxEmptyLines: number;
  normalizeLineEndings: boolean;
  convertTabsToSpaces: boolean;
  tabWidth: number;
  collapseSpaces: boolean;
  caseMode: CaseMode;
  sortLines: boolean;
  dedupeLines: boolean;
  addLineNumbers: boolean;
  findText: string;
  replaceText: string;
  caseSensitiveSearch: boolean;
}

export interface AppSettings {
  encoding: Encoding;
  formatterMode: FormatterMode;
  alwaysOnTop: boolean;
  darkMode: boolean;
  appearanceDensity: AppearanceDensity;
  actionButtonsPlacement: ActionButtonsPlacement;
  loggingEnabled: boolean;
  showBrandCountry: boolean;
  showBrandCategory: boolean;
  genericOptions: GenericFormatOptions;
}

export interface BrandMetadataDisplayOptions {
  showBrandCountry?: boolean;
  showBrandCategory?: boolean;
}

export interface HistoryItem {
  id: string;
  createdAt: string;
  output: string;
}
