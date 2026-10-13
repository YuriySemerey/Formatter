import { describe, expect, it } from "vitest";
import { createFormatterBackup, normalizeFormatterBackup } from "./backup";
import { DEFAULT_SETTINGS } from "./settings";

describe("Formatter backup", () => {
  it("preserves independent metadata switches in backups and enables both for old backups", () => {
    const backup = createFormatterBackup({ settings: { ...DEFAULT_SETTINGS, showBrandCountry: false, showBrandCategory: true }, history: [], brandOverrides: [] }, "0.3.0");
    expect(normalizeFormatterBackup(backup).settings).toMatchObject({ showBrandCountry: false, showBrandCategory: true });
    const legacy = { ...backup, settings: { darkMode: true } };
    expect(normalizeFormatterBackup(legacy).settings).toMatchObject({ darkMode: true, showBrandCountry: true, showBrandCategory: true });
  });

  it("round-trips settings, two outputs, and brand overrides without raw input", () => {
    const backup = createFormatterBackup(
      {
        settings: { ...DEFAULT_SETTINGS, darkMode: true },
        history: [
          { id: "1", createdAt: "2026-07-13T10:00:00.000Z", output: "first" },
          { id: "2", createdAt: "2026-07-13T11:00:00.000Z", output: "second" },
          { id: "3", createdAt: "2026-07-13T12:00:00.000Z", output: "third" }
        ],
        brandOverrides: [
          {
            displayName: "Brembo",
            aliases: [],
            category: "premiumReplacement",
            country: "Італія",
            isOriginal: false,
            updatedAt: "2026-07-13T10:00:00.000Z",
            source: "user"
          }
        ]
      },
      "0.2.0",
      new Date("2026-07-13T12:00:00.000Z")
    );

    expect(normalizeFormatterBackup(backup)).toEqual(backup);
    expect(backup.history).toHaveLength(2);
    expect(JSON.stringify(backup)).not.toContain("raw input");
  });

  it("rejects unsupported backup schemas", () => {
    expect(() => normalizeFormatterBackup({ schemaVersion: 99 })).toThrow("backup-schema-is-not-supported");
  });
});
