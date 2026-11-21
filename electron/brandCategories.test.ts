import { afterEach, describe, expect, it } from "vitest";
import { DEFAULT_BRAND_CATEGORIES, isBrandQualityCategory, normalizeBrandCategories, updateBrandCategory, validateBrandCategories } from "./brandCategories";
import { formatProductPriceList } from "../src/formatter/productPriceList";
import { getBrandCatalog, resolveBrandInfo, type BrandOverride } from "../src/formatter/brandRegistry";
import { createFormatterBackup, normalizeFormatterBackup } from "../src/formatter/backup";
import { DEFAULT_SETTINGS, loadSettings, normalizeSettings, saveSettings } from "../src/formatter/settings";

afterEach(() => localStorage.clear());
const brand = (category: BrandOverride["category"]): BrandOverride => ({ displayName: "DW Parts", category, country: "Україна", source: "user", updatedAt: "2026-11-21T00:00:00Z" });

describe("editable brand categories", () => {
  it("loads old settings with the original five category names", () => {
    localStorage.setItem("formatter.settings.v2", JSON.stringify({ schemaVersion: 2, settings: { darkMode: true } }));
    expect(loadSettings().brandCategories).toEqual(DEFAULT_BRAND_CATEGORIES);
    expect(normalizeFormatterBackup({ schemaVersion: 1, settings: {}, history: [], brandOverrides: [] }).settings.brandCategories).toEqual(DEFAULT_BRAND_CATEGORIES);
  });

  it("keeps a category's ID and every assignment when its name changes", () => {
    const added = updateBrandCategory(DEFAULT_BRAND_CATEGORIES, "Власний вибір");
    const id = added.at(-1)!.id;
    const renamed = updateBrandCategory(added, "Особливий вибір", id);
    expect(renamed.at(-1)).toEqual({ id, label: "Особливий вибір" });
    expect(resolveBrandInfo("DW Parts", [brand(id)], renamed).categoryLabel).toBe("Особливий вибір");
    const assigned = getBrandCatalog([brand(id), { ...brand(id), displayName: "Another Local Brand" }], renamed).filter((entry) => entry.category === id);
    expect(assigned).toHaveLength(2);
    expect(assigned.every((entry) => entry.categoryLabel === "Особливий вибір")).toBe(true);
    expect(isBrandQualityCategory(id)).toBe(true);
  });

  it.each([[true, true, " - Власний вибір, Україна"], [false, true, " - Власний вибір"], [true, false, " - Україна"], [false, false, ""]] as const)("formats custom categories with country=%s and category=%s", (showBrandCountry, showBrandCategory, suffix) => {
    const categories = updateBrandCategory(DEFAULT_BRAND_CATEGORIES, "Власний вибір");
    const output = formatProductPriceList("Гальмівний диск (DF4323) DW Parts Гальмівний диск (DF4323) 257 грн", [brand(categories.at(-1)!.id)], { brandCategories: categories, showBrandCountry, showBrandCategory });
    expect(output).toBe("Гальмівний диск\nDW Parts — 257 грн" + suffix);
  });

  it("renames built-in categories without changing original-brand semantics or fallback handling", () => {
    let categories = updateBrandCategory(DEFAULT_BRAND_CATEGORIES, "OEM", "original");
    categories = updateBrandCategory(categories, "Без класифікації", "unknown");
    expect(resolveBrandInfo("DW Parts", [brand("original")], categories)).toMatchObject({ category: "original", categoryLabel: "OEM", isOriginal: true });
    expect(resolveBrandInfo("Unknown Sample", [], categories).categoryLabel).toBe("Без класифікації");
  });

  it("persists names and custom category assignments through settings and backup restore", () => {
    let categories = updateBrandCategory(DEFAULT_BRAND_CATEGORIES, "Власний вибір");
    categories = updateBrandCategory(categories, "Перевірений замінник", "premiumReplacement");
    const settings = { ...DEFAULT_SETTINGS, brandCategories: categories };
    saveSettings(settings);
    expect(loadSettings().brandCategories).toEqual(categories);
    const backup = createFormatterBackup({ settings, brandOverrides: [brand(categories.at(-1)!.id)], history: [{ id: "old", createdAt: "2026-11-21T00:00:00Z", output: "Previously saved text" }] }, "0.3.3");
    expect(normalizeFormatterBackup(JSON.parse(JSON.stringify(backup)))).toEqual(backup);
  });

  it("rejects empty/duplicate labels and invalid IDs without dropping assigned brands", () => {
    for (const name of [" ", " ОРИГІНАЛ ", "якісний    замінник"]) expect(() => updateBrandCategory(DEFAULT_BRAND_CATEGORIES, name)).toThrow();
    expect(() => validateBrandCategories([{ id: "custom:anything", label: "Invalid" }])).toThrow();
    expect(() => validateBrandCategories([...DEFAULT_BRAND_CATEGORIES, DEFAULT_BRAND_CATEGORIES[0]])).toThrow("duplicate-id");
    const categories = updateBrandCategory(DEFAULT_BRAND_CATEGORIES, "Власний вибір");
    expect(() => createFormatterBackup({ settings: DEFAULT_SETTINGS, brandOverrides: [brand(categories.at(-1)!.id)], history: [] }, "0.3.3")).toThrow("brand-category-not-found");
    expect(normalizeSettings({ brandCategories: [{ id: "bad", label: "Bad" }] }).brandCategories).toEqual(DEFAULT_BRAND_CATEGORIES);
    expect(normalizeBrandCategories(undefined)).toEqual(DEFAULT_BRAND_CATEGORIES);
  });
});
