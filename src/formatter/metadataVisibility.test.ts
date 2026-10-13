import { describe, expect, it } from "vitest";
import { formatProductPriceList } from "./productPriceList";
import type { BrandOverride } from "./brandRegistry";

const overrides: BrandOverride[] = [{ displayName: "Brembo", category: "premiumReplacement", country: "Італія", updatedAt: "2026-10-13T00:00:00Z", source: "user" }];
const input = "Гальмівний диск (DF4323) Brembo Гальмівний диск (DF4323) 2 306 грн 4 612 грн";
const base = "Гальмівний диск\nBrembo — 2 306 грн / 4 612 грн за 2 шт";

describe("independent brand metadata visibility", () => {
  it.each([
    [true, true, " - якісний замінник, Італія"],
    [true, false, " - Італія"],
    [false, true, " - якісний замінник"],
    [false, false, ""]
  ] as const)("formats country=%s category=%s without stray separators", (showBrandCountry, showBrandCategory, suffix) => {
    expect(formatProductPriceList(input, overrides, { showBrandCountry, showBrandCategory })).toBe(base + suffix);
  });

  it("keeps two-argument calls compatible", () => {
    expect(formatProductPriceList(input, overrides)).toBe(base + " - якісний замінник, Італія");
  });

  it("applies switches to unknown-brand placeholders", () => {
    const unknown = "Гальмівний диск (XX123) Unknown Test Brand Гальмівний диск (XX123) 500 грн";
    expect(formatProductPriceList(unknown, [], { showBrandCategory: false })).toBe("Гальмівний диск\nUnknown Test Brand — 500 грн - країна не визначена");
    expect(formatProductPriceList(unknown, [], { showBrandCountry: false })).toBe("Гальмівний диск\nUnknown Test Brand — 500 грн - категорія не визначена");
    expect(formatProductPriceList(unknown, [], { showBrandCountry: false, showBrandCategory: false })).toBe("Гальмівний диск\nUnknown Test Brand — 500 грн");
  });

  it.each([
    "Моторна олива Line 5W-40 синтетична 5 л Brembo Моторна олива Line 5W-40 синтетична 5 л 100 грн 200 грн",
    "Моторна олива Line 5W-40 синтетична 5 л Brembo Моторна олива Line 5W-40 синтетична 5 л 100 грн"
  ])("removes metadata from volume and total-price lines", (text) => {
    const output = formatProductPriceList(text, overrides, { showBrandCountry: false, showBrandCategory: false });
    expect(output).toContain("Brembo Line — 100 грн");
    expect(output).not.toContain(" - ");
    expect(output).not.toContain("Італія");
  });
});
