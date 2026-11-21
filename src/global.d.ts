import type { UpdateState } from "../electron/updateTypes";
import type { BrandCategoryDefinition, BrandQualityCategory } from "../electron/brandCategories";
export {};

declare global {
  type BrandQualityCategoryName = BrandQualityCategory;

  interface BrandOverridePayload {
    displayName: string;
    baseName?: string;
    aliases?: string[];
    category: BrandQualityCategoryName;
    country: string;
    isOriginal?: boolean;
    updatedAt: string;
    source: "user";
  }

  interface BrandOverridesExportResult {
    canceled: boolean;
    filePath?: string;
  }

  interface BrandOverridesImportResult {
    canceled: boolean;
    filePath?: string;
    overrides: BrandOverridePayload[];
    brandCategories?: BrandCategoryDefinition[];
  }

  interface WindowPinState {
    requested: boolean;
    applied: boolean;
    isElectron: boolean;
    platform: string;
    alwaysOnTop: boolean;
    error?: string;
  }

  interface FormatterAppInfo {
    name: string;
    version: string;
    platform: string;
    arch: string;
  }

  interface FormatterBackupPayload {
    schemaVersion: 1;
    createdAt: string;
    appVersion: string;
    settings: Record<string, unknown>;
    history: Array<{ id: string; createdAt: string; output: string }>;
    brandOverrides: BrandOverridePayload[];
  }

  interface FileActionResult {
    canceled?: boolean;
    filePath?: string;
    error?: string;
  }

  interface BackupImportResult extends FileActionResult {
    backup?: FormatterBackupPayload;
  }

  interface Window {
    formatterApp?: {
      writeClipboard: (text: string) => Promise<void>;
      setAlwaysOnTop: (enabled: boolean) => Promise<WindowPinState>;
      loadBrandOverrides: () => Promise<BrandOverridePayload[]>;
      saveBrandOverrides: (overrides: BrandOverridePayload[], categories?: BrandCategoryDefinition[]) => Promise<BrandOverridePayload[]>;
      exportBrandOverrides: (overrides: BrandOverridePayload[], categories?: BrandCategoryDefinition[]) => Promise<BrandOverridesExportResult>;
      importBrandOverrides: (categories?: BrandCategoryDefinition[]) => Promise<BrandOverridesImportResult>;
      getAppInfo: () => Promise<FormatterAppInfo>;
      getUpdateState: () => Promise<UpdateState>;
      checkForUpdates: () => Promise<UpdateState>;
      downloadUpdate: () => Promise<UpdateState>;
      installUpdate: () => Promise<UpdateState>;
      onUpdateState: (listener: (state: UpdateState) => void) => () => void;
      exportBackup: (input: {
        settings: unknown;
        history: Array<{ id: string; createdAt: string; output: string }>;
        brandOverrides: BrandOverridePayload[];
      }) => Promise<FileActionResult>;
      importBackup: () => Promise<BackupImportResult>;
      appendTechnicalLog: (level: "info" | "warning" | "error", message: string) => Promise<void>;
      openTechnicalLog: () => Promise<FileActionResult>;
      clearTechnicalLog: () => Promise<FileActionResult>;
    };
  }
}
