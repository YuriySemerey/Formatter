import { describe, expect, it } from "vitest";
import { createBrandLibrary, parseBrandLibrary } from "./brandLibrary";
import { DEFAULT_BRAND_CATEGORIES, updateBrandCategory } from "./brandCategories";
import { sanitizeBrandOverrides, type BrandOverride } from "../src/formatter/brandRegistry";

describe("brand JSON library", () => {
  const legacy: BrandOverride[] = [{ displayName: "Brembo", category: "premiumReplacement", country: "Італія", source: "user", updatedAt: "2026-11-21T00:00:00Z" }];

  it("round-trips category definitions and renamed/custom brand assignments together", () => {
    const categories = updateBrandCategory(DEFAULT_BRAND_CATEGORIES, "Власний вибір");
    const brands: BrandOverride[] = [{ ...legacy[0], displayName: "Brembo Italia", baseName: "Brembo", category: categories.at(-1)!.id }];
    const exported = createBrandLibrary(sanitizeBrandOverrides(brands), categories);
    expect(parseBrandLibrary(JSON.parse(JSON.stringify(exported)), sanitizeBrandOverrides)).toEqual({ overrides: sanitizeBrandOverrides(brands), brandCategories: categories });
  });

  it("imports legacy arrays while preserving current category names", () => {
    const categories = updateBrandCategory(DEFAULT_BRAND_CATEGORIES, "Перевірений замінник", "premiumReplacement");
    expect(parseBrandLibrary(legacy, sanitizeBrandOverrides, categories)).toEqual({ overrides: sanitizeBrandOverrides(legacy), brandCategories: categories });
    expect(parseBrandLibrary(legacy, sanitizeBrandOverrides).brandCategories).toEqual(DEFAULT_BRAND_CATEGORIES);
  });

  it("rejects missing category definitions before an import can overwrite data", () => {
    const categories = updateBrandCategory(DEFAULT_BRAND_CATEGORIES, "Власний вибір");
    expect(() => parseBrandLibrary([{ ...legacy[0], category: categories.at(-1)!.id }], sanitizeBrandOverrides)).toThrow("brand-category-not-found");
  });

  it("rejects malformed libraries and category definitions", () => {
    for (const value of [{}, { kind: "formatter-brand-library", schemaVersion: 99 }, { kind: "formatter-brand-library", schemaVersion: 1, brandOverrides: [], brandCategories: [{ id: "unknown", label: " " }] }]) {
      expect(() => parseBrandLibrary(value, sanitizeBrandOverrides)).toThrow();
    }
  });
});
