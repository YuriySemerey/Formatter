import { describe, expect, it } from "vitest";
import { getBrandCatalog, resolveBrandInfo, sanitizeBrandOverrides, type BrandOverride } from "../formatter/brandRegistry";
import { formatProductPriceList } from "../formatter/productPriceList";
import { updateBrandDraft } from "./brandEdits";
import { loadBrowserBrandOverrides, saveBrowserBrandOverrides } from "./brandOverrideStorage";
import { createFormatterBackup, normalizeFormatterBackup } from "../formatter/backup";
import { DEFAULT_SETTINGS } from "../formatter/settings";

const edit = { displayName: "DW Parts", category: "valueReplacement" as const, country: "Україна" };
const base = getBrandCatalog().find((entry) => entry.displayName === "Brembo")!;

describe("adding and renaming brands", () => {
  it("adds a custom brand and uses it for copied price rows", () => {
    const drafts = updateBrandDraft([], edit);
    expect(getBrandCatalog(drafts).find((entry) => entry.displayName === edit.displayName)).toMatchObject({ source: "user", country: "Україна", category: "valueReplacement" });
    expect(formatProductPriceList("Гальмівний диск (DF4323) DW Parts Гальмівний диск (DF4323) 257 грн\n\n4\n\n1 028 грн", drafts)).toBe("Гальмівний диск\nDW Parts — 257 грн / 1 028 грн за 4 шт - ціна / якість, Україна");
    expect(formatProductPriceList("DW Parts Гальмівний диск (DF4323) 257 грн", drafts)).toContain("DW Parts — 257 грн");
  });

  it("renames a base brand in place and recognizes its original name", () => {
    const drafts = updateBrandDraft([], { ...edit, displayName: "Brembo Italia" }, base);
    const catalog = getBrandCatalog(drafts);
    expect(catalog).toHaveLength(getBrandCatalog().length);
    expect(catalog.find((entry) => entry.id === base.id)).toMatchObject({ displayName: "Brembo Italia", baseName: "Brembo", aliases: expect.arrayContaining(["Brembo"]) });
    expect(resolveBrandInfo("Brembo", drafts)).toMatchObject({ displayName: "Brembo Italia", country: "Україна" });
    expect(formatProductPriceList("Гальмівний диск (DF4323) Brembo Гальмівний диск (DF4323) 400 грн", drafts)).toBe("Гальмівний диск\nBrembo Italia — 400 грн - ціна / якість, Україна");
  });

  it("preserves all previous names through repeated renames", () => {
    let drafts = updateBrandDraft([], { ...edit, displayName: "Brembo Italia" }, base);
    drafts = updateBrandDraft(drafts, { ...edit, displayName: "Brembo Premium" }, getBrandCatalog(drafts).find((entry) => entry.id === base.id));
    expect(drafts).toHaveLength(1);
    for (const name of ["Brembo", "Brembo Italia", "Brembo Premium"]) {
      expect(resolveBrandInfo(name, drafts).displayName).toBe("Brembo Premium");
    }
  });

  it("renames a custom brand and keeps the old name usable", () => {
    let drafts = updateBrandDraft([], edit);
    drafts = updateBrandDraft(drafts, { ...edit, displayName: "DW Auto" }, getBrandCatalog(drafts).find((entry) => entry.displayName === edit.displayName));
    expect(drafts).toHaveLength(1);
    expect(resolveBrandInfo("DW Parts", drafts)).toMatchObject({ displayName: "DW Auto", source: "user" });
    expect(getBrandCatalog(drafts).filter((entry) => !entry.baseName)).toHaveLength(1);
  });

  it("rejects blank, duplicate and alias names while allowing the brand's current name", () => {
    for (const displayName of [" ", "---", "BOSCH", "B.o.s.c.h"]) {
      expect(() => updateBrandDraft([], { ...edit, displayName })).toThrow();
    }
    const renamed = updateBrandDraft([], { ...edit, displayName: "Brembo Italia" }, base);
    expect(() => updateBrandDraft(renamed, { ...edit, displayName: "Brembo" })).toThrow("Ця назва вже належить");
    expect(() => updateBrandDraft(renamed, { ...edit, displayName: "Brembo Italia" }, getBrandCatalog(renamed).find((entry) => entry.id === base.id))).not.toThrow();
  });

  it("keeps custom brands and renames after storage reload and backup restore", () => {
    localStorage.clear();
    const drafts = updateBrandDraft(updateBrandDraft([], edit), { ...edit, displayName: "Brembo Italia" }, base);
    const saved = saveBrowserBrandOverrides(drafts);
    expect(loadBrowserBrandOverrides()).toEqual(saved);
    const backup = createFormatterBackup({ settings: DEFAULT_SETTINGS, history: [{ id: "old", createdAt: "2026-11-21T00:00:00Z", output: "Previously saved output" }], brandOverrides: saved }, "0.3.3");
    const restored = normalizeFormatterBackup(JSON.parse(JSON.stringify(backup)));
    expect(restored.brandOverrides).toEqual(saved);
    expect(restored.history[0].output).toBe("Previously saved output");
    expect(resolveBrandInfo("Brembo", restored.brandOverrides).displayName).toBe("Brembo Italia");
    localStorage.clear();
  });

  it("updates existing metadata without losing a renamed brand's identity", () => {
    const drafts = updateBrandDraft([], { ...edit, displayName: "Brembo Italia" }, base);
    const entry = getBrandCatalog(drafts).find((brand) => brand.id === base.id)!;
    const updated = updateBrandDraft(drafts, { ...edit, displayName: entry.displayName, country: "Італія", category: "premiumReplacement" }, entry);
    expect(updated).toHaveLength(1);
    expect(updated[0]).toMatchObject({ baseName: "Brembo", displayName: "Brembo Italia", country: "Італія", category: "premiumReplacement" });
  });

  it("keeps legacy overrides compatible and deduplicates renamed base identities", () => {
    const old: BrandOverride = { ...edit, displayName: "Brembo", aliases: [], updatedAt: "2026-10-01T00:00:00Z", source: "user" };
    expect(sanitizeBrandOverrides([old])[0]).toEqual({ ...old, isOriginal: false });
    const renamed = updateBrandDraft([], { ...edit, displayName: "Brembo Italia" }, base);
    expect(sanitizeBrandOverrides([...renamed, old])).toHaveLength(1);
    expect(getBrandCatalog([]).find((entry) => entry.id === base.id)?.displayName).toBe("Brembo");
  });
});
