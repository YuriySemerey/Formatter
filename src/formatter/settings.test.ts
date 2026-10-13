import { describe, expect, it } from "vitest";
import {
  addHistoryItem,
  loadHistory,
  loadSettings,
  normalizeHistory,
  normalizeSettings,
  saveHistory,
  saveSettings,
  SETTINGS_SCHEMA_VERSION
} from "./settings";

class MemoryStorage implements Storage {
  private values = new Map<string, string>();

  get length() {
    return this.values.size;
  }

  clear() {
    this.values.clear();
  }

  getItem(key: string) {
    return this.values.get(key) ?? null;
  }

  key(index: number) {
    return [...this.values.keys()][index] ?? null;
  }

  removeItem(key: string) {
    this.values.delete(key);
  }

  setItem(key: string, value: string) {
    this.values.set(key, value);
  }
}

describe("history settings", () => {
  it("keeps only the two newest formatted outputs", () => {
    let history = addHistoryItem([], "first", new Date("2026-05-01T10:00:00Z"));
    history = addHistoryItem(history, "second", new Date("2026-05-01T11:00:00Z"));
    history = addHistoryItem(history, "third", new Date("2026-05-01T12:00:00Z"));

    expect(history.map((item) => item.output)).toEqual(["third", "second"]);
  });

  it("persists output history without input text", () => {
    const storage = new MemoryStorage();
    const history = addHistoryItem([], "formatted output", new Date("2026-05-01T10:00:00Z"));

    saveHistory(history, storage);

    expect(storage.getItem("formatter.history.v1")).not.toContain("raw input");
    expect(loadHistory(storage).map((item) => item.output)).toEqual(["formatted output"]);
  });

  it("normalizes imported history and keeps only two valid outputs", () => {
    const normalized = normalizeHistory([
      { id: "1", createdAt: "2026-05-01T10:00:00Z", output: " first " },
      { id: "2", createdAt: "2026-05-01T11:00:00Z", output: "second" },
      { id: "3", createdAt: "2026-05-01T12:00:00Z", output: "third" },
      { id: 4, createdAt: null, output: "invalid" }
    ]);

    expect(normalized).toEqual([
      { id: "1", createdAt: "2026-05-01T10:00:00Z", output: "first" },
      { id: "2", createdAt: "2026-05-01T11:00:00Z", output: "second" }
    ]);
  });

  it("removes duplicate output and moves the latest copy to the top", () => {
    let history = addHistoryItem([], "same", new Date("2026-05-01T10:00:00Z"));
    history = addHistoryItem(history, "other", new Date("2026-05-01T11:00:00Z"));
    history = addHistoryItem(history, "same", new Date("2026-05-01T12:00:00Z"));

    expect(history.map((item) => item.output)).toEqual(["same", "other"]);
  });
});

describe("app settings", () => {
  it("defaults metadata visibility for old settings and rejects non-boolean values", () => {
    expect(normalizeSettings({ schemaVersion: 2, settings: { darkMode: true } })).toMatchObject({
      darkMode: true, showBrandCountry: true, showBrandCategory: true
    });
    expect(normalizeSettings({ showBrandCountry: "false", showBrandCategory: null })).toMatchObject({
      showBrandCountry: true, showBrandCategory: true
    });
  });

  it.each([[true, true], [true, false], [false, true], [false, false]])("persists independent metadata switches (%s, %s)", (showBrandCountry, showBrandCategory) => {
    const storage = new MemoryStorage();
    saveSettings(normalizeSettings({ showBrandCountry, showBrandCategory }), storage);
    expect(loadSettings(storage)).toMatchObject({ showBrandCountry, showBrandCategory });
  });

  it("uses global appearance defaults", () => {
    expect(loadSettings(new MemoryStorage())).toMatchObject({
      darkMode: false,
      appearanceDensity: "standard",
      actionButtonsPlacement: "aboveOutput",
      loggingEnabled: true
    });
  });

  it("stores settings in a versioned envelope and loads it back", () => {
    const storage = new MemoryStorage();
    const settings = normalizeSettings({ darkMode: true, formatterMode: "generic-text" });

    saveSettings(settings, storage);

    expect(JSON.parse(storage.getItem("formatter.settings.v2") ?? "null")).toMatchObject({
      schemaVersion: SETTINGS_SCHEMA_VERSION,
      settings: {
        darkMode: true,
        formatterMode: "generic-text"
      }
    });
    expect(loadSettings(storage)).toEqual(settings);
  });

  it("migrates old product price list dark mode to global dark mode", () => {
    const storage = new MemoryStorage();
    storage.setItem(
      "formatter.settings.v1",
      JSON.stringify({
        themePreferences: {
          productPriceListDarkMode: true
        }
      })
    );

    expect(loadSettings(storage).darkMode).toBe(true);
  });

  it("migrates a versioned v1 settings envelope sequentially", () => {
    expect(
      normalizeSettings({
        schemaVersion: 1,
        settings: {
          formatterMode: "generic-text",
          themePreferences: { genericTextDarkMode: true }
        }
      })
    ).toMatchObject({ formatterMode: "generic-text", darkMode: true });
  });

  it("migrates old generic text dark mode to global dark mode", () => {
    const storage = new MemoryStorage();
    storage.setItem(
      "formatter.settings.v1",
      JSON.stringify({
        themePreferences: {
          genericTextDarkMode: true
        }
      })
    );

    expect(loadSettings(storage).darkMode).toBe(true);
  });

  it("loads compact density and falls back to standard for invalid values", () => {
    const storage = new MemoryStorage();
    storage.setItem("formatter.settings.v1", JSON.stringify({ appearanceDensity: "compact" }));

    expect(loadSettings(storage).appearanceDensity).toBe("compact");

    storage.setItem("formatter.settings.v1", JSON.stringify({ appearanceDensity: "dense" }));

    expect(loadSettings(storage).appearanceDensity).toBe("standard");
  });

  it("loads action button placement and falls back to above output for invalid values", () => {
    const storage = new MemoryStorage();
    storage.setItem("formatter.settings.v1", JSON.stringify({ actionButtonsPlacement: "aboveInput" }));

    expect(loadSettings(storage).actionButtonsPlacement).toBe("aboveInput");

    storage.setItem("formatter.settings.v1", JSON.stringify({ actionButtonsPlacement: "toolbar" }));

    expect(loadSettings(storage).actionButtonsPlacement).toBe("aboveOutput");
  });

  it("loads logging preference and defaults logging to enabled", () => {
    const storage = new MemoryStorage();
    storage.setItem("formatter.settings.v1", JSON.stringify({ loggingEnabled: false }));

    expect(loadSettings(storage).loggingEnabled).toBe(false);

    storage.setItem("formatter.settings.v1", JSON.stringify({}));

    expect(loadSettings(storage).loggingEnabled).toBe(true);
  });
});
