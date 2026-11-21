import { sanitizeBrandOverrides, type BrandOverride } from "./brandRegistry";
import { normalizeHistory, normalizeSettings } from "./settings";
import type { AppSettings, HistoryItem } from "./types";
import { assertBrandCategoryReferences } from "../../electron/brandCategories";

export const BACKUP_SCHEMA_VERSION = 1;

export interface FormatterBackup {
  schemaVersion: 1;
  createdAt: string;
  appVersion: string;
  settings: AppSettings;
  history: HistoryItem[];
  brandOverrides: BrandOverride[];
}

export function createFormatterBackup(
  input: { settings: AppSettings; history: HistoryItem[]; brandOverrides: BrandOverride[] },
  appVersion: string,
  now = new Date()
): FormatterBackup {
  const settings = normalizeSettings(input.settings);
  const brandOverrides = sanitizeBrandOverrides(input.brandOverrides);
  assertBrandCategoryReferences(brandOverrides, settings.brandCategories);
  return {
    schemaVersion: BACKUP_SCHEMA_VERSION,
    createdAt: now.toISOString(),
    appVersion: cleanupText(appVersion) || "unknown",
    settings,
    history: normalizeHistory(input.history),
    brandOverrides
  };
}

export function normalizeFormatterBackup(value: unknown): FormatterBackup {
  if (!isRecord(value) || value.schemaVersion !== BACKUP_SCHEMA_VERSION) {
    throw new Error("backup-schema-is-not-supported");
  }
  if (!Array.isArray(value.history) || !Array.isArray(value.brandOverrides)) {
    throw new Error("backup-data-is-invalid");
  }

  const settings = normalizeSettings(value.settings);
  const brandOverrides = sanitizeBrandOverrides(value.brandOverrides);
  assertBrandCategoryReferences(brandOverrides, settings.brandCategories);
  return {
    schemaVersion: BACKUP_SCHEMA_VERSION,
    createdAt: cleanupText(value.createdAt) || new Date().toISOString(),
    appVersion: cleanupText(value.appVersion) || "unknown",
    settings,
    history: normalizeHistory(value.history),
    brandOverrides
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function cleanupText(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}
