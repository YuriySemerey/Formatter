import { describe, expect, it } from "vitest";
import {
  AVTO_PRO_BRAND_REGISTRY,
  AVTO_PRO_SOURCE_NAMES,
  BRAND_REGISTRY,
  formatBrandMetadata,
  getBrandCatalog,
  normalizeBrandKey,
  resolveBrandInfo,
  sanitizeBrandOverrides,
  type BrandOverride
} from "./brandRegistry";
import { formatProductPriceList } from "./productPriceList";

const now = "2026-07-12T10:00:00.000Z";

describe("brand registry with an Avto.pro base", () => {
  it("uses generated Avto.pro entries as the only base registry", () => {
    expect(BRAND_REGISTRY).toBe(AVTO_PRO_BRAND_REGISTRY);
    expect(AVTO_PRO_BRAND_REGISTRY).toHaveLength(6521);
    expect(AVTO_PRO_SOURCE_NAMES).toHaveLength(6521);
    expect(AVTO_PRO_BRAND_REGISTRY.every((entry) => entry.source === "avtoPro")).toBe(true);
    expect(AVTO_PRO_BRAND_REGISTRY.every((entry) => entry.category === "unknown")).toBe(true);
  });

  it("keeps the authoritative seed order in the unified catalog", () => {
    expect(AVTO_PRO_SOURCE_NAMES.slice(0, 3)).toEqual(["A-Mega", "A-N Parts", "A-gist"]);
    expect(AVTO_PRO_SOURCE_NAMES.slice(-5)).toEqual(["5277", "555", "5M", "5`825", "888"]);
    expect(getBrandCatalog().slice(0, 3).map((entry) => entry.displayName)).toEqual(["A-Mega", "A-N Parts", "A-gist"]);
    expect(getBrandCatalog().slice(-5).map((entry) => entry.displayName)).toEqual(["5277", "555", "5M", "5`825", "888"]);
  });

  it("keeps every Avto.pro source name represented in the unified catalog", () => {
    const catalogKeys = new Set<string>();
    for (const entry of getBrandCatalog()) {
      for (const value of [entry.displayName, ...entry.aliases]) {
        const key = normalizeBrandKey(value);
        if (key) {
          catalogKeys.add(key);
        }
      }
    }

    const missingSourceNames = AVTO_PRO_SOURCE_NAMES.filter((name) => !catalogKeys.has(normalizeBrandKey(name)));
    expect(missingSourceNames).toEqual([]);
    expect(AVTO_PRO_SOURCE_NAMES).toEqual(expect.arrayContaining(["A-Mega", "A-N Parts", "AC Delco", "AD Kuhner"]));
    expect(AVTO_PRO_SOURCE_NAMES).not.toContain("Georg Fisher");
    expect(AVTO_PRO_SOURCE_NAMES).not.toContain("Depo/Loro");
    expect(AVTO_PRO_SOURCE_NAMES).not.toContain("Zzvf");
    expect(getBrandCatalog().filter((entry) => entry.displayName === "Bosch")).toHaveLength(1);
    expect(getBrandCatalog().filter((entry) => entry.displayName === "Brembo")).toHaveLength(1);
    expect(getBrandCatalog().filter((entry) => entry.displayName === "VAG")).toHaveLength(1);
  });

  it("uses Avto.pro country details without assigning a category automatically", () => {
    expect(resolveBrandInfo("Bcguma")).toMatchObject({
      displayName: "Bcguma",
      source: "avtoPro",
      category: "unknown",
      categoryLabel: "категорія не визначена",
      country: "Україна",
      verification: {
        confidence: "medium",
        countrySources: ["avto-pro-makers", "avto-pro-maker-detail"],
        categorySources: []
      }
    });
  });

  it("uses explicit fallback metadata for brands outside Avto.pro", () => {
    expect(resolveBrandInfo("Unknown Test Brand")).toMatchObject({
      displayName: "Unknown Test Brand",
      source: "fallback",
      category: "unknown",
      categoryLabel: "категорія не визначена",
      country: "країна не визначена",
      known: false
    });
    expect(formatBrandMetadata("Unknown Test Brand")).toBe("категорія не визначена, країна не визначена");
  });

  it("lets user overrides set category and registration country for Avto.pro brands", () => {
    const overrides: BrandOverride[] = [
      {
        displayName: "Brembo",
        aliases: [],
        category: "premiumReplacement",
        country: "Італія",
        isOriginal: false,
        updatedAt: now,
        source: "user"
      }
    ];

    expect(resolveBrandInfo("Brembo", overrides)).toMatchObject({
      displayName: "Brembo",
      category: "premiumReplacement",
      categoryLabel: "якісний замінник",
      country: "Італія",
      source: "user"
    });
    expect(formatBrandMetadata("Brembo", overrides)).toBe("якісний замінник, Італія");
    expect(
      formatProductPriceList("Гальмівний диск (DF4323) Brembo Гальмівний диск (DF4323) 2 306 грн 4 612 грн", overrides)
    ).toBe(`Гальмівний диск
Brembo — 2 306 грн / 4 612 грн за 2 шт - якісний замінник, Італія`);
  });

  it("sanitizes imported overrides and preserves custom brands", () => {
    expect(
      sanitizeBrandOverrides([
        {
          displayName: "  Rider  ",
          aliases: ["RID"],
          category: "valueReplacement",
          country: "  Угорщина ",
          updatedAt: now,
          source: "legacy"
        },
        {
          displayName: "New Local Brand",
          category: "budgetReplacement",
          country: "Україна",
          updatedAt: now
        },
        {
          displayName: "Broken",
          category: "wrong",
          country: "Невідомо"
        }
      ])
    ).toEqual([
      {
        displayName: "Rider",
        aliases: ["RID"],
        category: "valueReplacement",
        country: "Угорщина",
        isOriginal: false,
        updatedAt: now,
        source: "user"
      },
      {
        displayName: "New Local Brand",
        aliases: [],
        category: "budgetReplacement",
        country: "Україна",
        isOriginal: false,
        updatedAt: now,
        source: "user"
      }
    ]);
  });

  it("shows base entries, their changes and custom brands without duplicating base rows", () => {
    const catalog = getBrandCatalog([
      {
        displayName: "Bosch",
        aliases: [],
        category: "valueReplacement",
        country: "Німеччина",
        isOriginal: false,
        updatedAt: now,
        source: "user"
      },
      {
        displayName: "New Local Brand",
        aliases: ["NLB"],
        category: "budgetReplacement",
        country: "Україна",
        isOriginal: false,
        updatedAt: now,
        source: "user"
      }
    ]);

    expect(catalog.find((entry) => entry.displayName === "Bosch")).toMatchObject({
      category: "valueReplacement",
      overridden: true,
      source: "user"
    });
    expect(catalog.find((entry) => entry.displayName === "New Local Brand")).toMatchObject({ source: "user", aliases: ["NLB"], country: "Україна" });
    expect(catalog).toHaveLength(AVTO_PRO_BRAND_REGISTRY.length + 1);
    expect(catalog.find((entry) => entry.displayName === "Achr")).toMatchObject({ source: "avtoPro" });
  });
});
