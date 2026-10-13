import type { UpdateState } from "../electron/updateTypes";
export {};

declare global {
  type BrandQualityCategoryName = "original" | "premiumReplacement" | "valueReplacement" | "budgetReplacement" | "unknown";

  interface BrandOverridePayload {
    displayName: string;
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
      saveBrandOverrides: (overrides: BrandOverridePayload[]) => Promise<BrandOverridePayload[]>;
      exportBrandOverrides: (overrides: BrandOverridePayload[]) => Promise<BrandOverridesExportResult>;
      importBrandOverrides: () => Promise<BrandOverridesImportResult>;
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
