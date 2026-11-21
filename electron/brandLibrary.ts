import { assertBrandCategoryReferences, DEFAULT_BRAND_CATEGORIES, validateBrandCategories, type BrandCategoryDefinition, type BrandQualityCategory } from "./brandCategories.js";

export function createBrandLibrary<T extends { category: BrandQualityCategory }>(overrides: T[], categories: BrandCategoryDefinition[]) {
  const brandCategories = validateBrandCategories(categories);
  assertBrandCategoryReferences(overrides, brandCategories);
  return { kind: "formatter-brand-library" as const, schemaVersion: 1 as const, brandCategories, brandOverrides: overrides };
}

export function parseBrandLibrary<T extends { category: BrandQualityCategory }>(value: unknown, validateBrands: (input: unknown) => T[], currentCategories: BrandCategoryDefinition[] = DEFAULT_BRAND_CATEGORIES) {
  if (Array.isArray(value)) {
    const library = createBrandLibrary(validateBrands(value), currentCategories);
    return { overrides: library.brandOverrides, brandCategories: library.brandCategories };
  }
  if (!value || typeof value !== "object" || !("kind" in value) || value.kind !== "formatter-brand-library" ||
    !("schemaVersion" in value) || value.schemaVersion !== 1 || !("brandCategories" in value) || !("brandOverrides" in value) || !Array.isArray(value.brandOverrides)) {
    throw new Error("brand-library-is-invalid");
  }
  const library = createBrandLibrary(validateBrands(value.brandOverrides), validateBrandCategories(value.brandCategories));
  return { overrides: library.brandOverrides, brandCategories: library.brandCategories };
}
