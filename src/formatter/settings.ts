import type { AppSettings, GenericFormatOptions, HistoryItem } from "./types";

type LegacyThemePreferences = {
  productPriceListDarkMode?: boolean;
  genericTextDarkMode?: boolean;
};

type StoredAppSettings = Omit<Partial<AppSettings>, "actionButtonsPlacement"> & {
  themePreferences?: LegacyThemePreferences;
  actionButtonsPlacement?: unknown;
};

interface StoredSettingsEnvelope {
  schemaVersion: number;
  settings: StoredAppSettings;
}

export const SETTINGS_SCHEMA_VERSION = 2;

export const DEFAULT_GENERIC_OPTIONS: GenericFormatOptions = {
  trimLines: true,
  collapseEmptyLines: true,
  maxEmptyLines: 1,
  normalizeLineEndings: true,
  convertTabsToSpaces: true,
  tabWidth: 4,
  collapseSpaces: false,
  caseMode: "none",
  sortLines: false,
  dedupeLines: false,
  addLineNumbers: false,
  findText: "",
  replaceText: "",
  caseSensitiveSearch: false
};

export const DEFAULT_SETTINGS: AppSettings = {
  encoding: "UTF-8",
  formatterMode: "product-price-list",
  alwaysOnTop: false,
  darkMode: false,
  appearanceDensity: "standard",
  actionButtonsPlacement: "aboveOutput",
  loggingEnabled: true,
  showBrandCountry: true,
  showBrandCategory: true,
  genericOptions: DEFAULT_GENERIC_OPTIONS
};

const SETTINGS_KEY = "formatter.settings.v2";
const LEGACY_SETTINGS_KEY = "formatter.settings.v1";
const HISTORY_KEY = "formatter.history.v1";

export function loadSettings(storage: Storage = localStorage): AppSettings {
  const raw = storage.getItem(SETTINGS_KEY) ?? storage.getItem(LEGACY_SETTINGS_KEY);
  if (!raw) {
    return cloneDefaultSettings();
  }

  try {
    return normalizeSettings(JSON.parse(raw));
  } catch {
    return cloneDefaultSettings();
  }
}

export function normalizeSettings(value: unknown): AppSettings {
  const parsed = migrateSettings(value);
  const genericOptions = isRecord(parsed.genericOptions) ? parsed.genericOptions as Partial<GenericFormatOptions> : {};
  const themePreferences = isRecord(parsed.themePreferences) ? parsed.themePreferences as LegacyThemePreferences : undefined;

  return {
    encoding: isEncoding(parsed.encoding) ? parsed.encoding : DEFAULT_SETTINGS.encoding,
    formatterMode: parsed.formatterMode === "generic-text" ? "generic-text" : "product-price-list",
    alwaysOnTop: typeof parsed.alwaysOnTop === "boolean" ? parsed.alwaysOnTop : false,
    darkMode: resolveDarkMode(parsed.darkMode, themePreferences),
    appearanceDensity: parsed.appearanceDensity === "compact" ? "compact" : "standard",
    actionButtonsPlacement: parsed.actionButtonsPlacement === "aboveInput" ? "aboveInput" : "aboveOutput",
    loggingEnabled: typeof parsed.loggingEnabled === "boolean" ? parsed.loggingEnabled : true,
    showBrandCountry: typeof parsed.showBrandCountry === "boolean" ? parsed.showBrandCountry : true,
    showBrandCategory: typeof parsed.showBrandCategory === "boolean" ? parsed.showBrandCategory : true,
    genericOptions: {
      ...DEFAULT_GENERIC_OPTIONS,
      ...genericOptions
    }
  };
}

function resolveDarkMode(darkMode: unknown, legacyThemePreferences?: LegacyThemePreferences) {
  if (typeof darkMode === "boolean") {
    return darkMode;
  }

  return Boolean(legacyThemePreferences?.productPriceListDarkMode || legacyThemePreferences?.genericTextDarkMode);
}

export function saveSettings(settings: AppSettings, storage: Storage = localStorage) {
  const envelope: StoredSettingsEnvelope = {
    schemaVersion: SETTINGS_SCHEMA_VERSION,
    settings: normalizeSettings(settings)
  };
  storage.setItem(SETTINGS_KEY, JSON.stringify(envelope));
}

export function loadHistory(storage: Storage = localStorage): HistoryItem[] {
  const raw = storage.getItem(HISTORY_KEY);
  if (!raw) {
    return [];
  }

  try {
    return normalizeHistory(JSON.parse(raw));
  } catch {
    return [];
  }
}

export function normalizeHistory(value: unknown): HistoryItem[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .filter((item): item is HistoryItem => {
      return (
        item &&
        typeof item.id === "string" &&
        typeof item.createdAt === "string" &&
        typeof item.output === "string"
      );
    })
    .map((item) => ({
      id: item.id,
      createdAt: item.createdAt,
      output: item.output.trim()
    }))
    .filter((item) => item.output.length > 0)
    .slice(0, 2);
}

export function saveHistory(history: HistoryItem[], storage: Storage = localStorage) {
  storage.setItem(HISTORY_KEY, JSON.stringify(history.slice(0, 2)));
}

export function addHistoryItem(history: HistoryItem[], output: string, now = new Date()): HistoryItem[] {
  const trimmed = output.trim();
  if (!trimmed) {
    return history;
  }

  const nextItem: HistoryItem = {
    id: `${now.getTime()}-${Math.random().toString(36).slice(2)}`,
    createdAt: now.toISOString(),
    output: trimmed
  };

  return [nextItem, ...history.filter((item) => item.output !== trimmed)].slice(0, 2);
}

function migrateSettings(value: unknown): StoredAppSettings {
  if (!isRecord(value)) {
    return {};
  }

  let schemaVersion = typeof value.schemaVersion === "number" ? value.schemaVersion : 1;
  let settings = "settings" in value && isRecord(value.settings) ? value.settings as StoredAppSettings : value as StoredAppSettings;
  if (schemaVersion > SETTINGS_SCHEMA_VERSION || schemaVersion < 1) {
    return {};
  }

  while (schemaVersion < SETTINGS_SCHEMA_VERSION) {
    if (schemaVersion === 1) {
      settings = migrateSettingsV1ToV2(settings);
      schemaVersion = 2;
      continue;
    }

    return {};
  }

  return settings;
}

function migrateSettingsV1ToV2(settings: StoredAppSettings): StoredAppSettings {
  return {
    ...settings,
    darkMode: resolveDarkMode(settings.darkMode, settings.themePreferences)
  };
}

function isEncoding(value: unknown): value is AppSettings["encoding"] {
  return value === "UTF-8" || value === "UTF-16LE" || value === "Windows-1251" || value === "ISO-8859-1" || value === "ASCII";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function cloneDefaultSettings(): AppSettings {
  return {
    ...DEFAULT_SETTINGS,
    genericOptions: { ...DEFAULT_GENERIC_OPTIONS }
  };
}
