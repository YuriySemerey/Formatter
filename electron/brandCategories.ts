export const BRAND_CATEGORY_LABELS = {
  original: "оригінал",
  premiumReplacement: "якісний замінник",
  valueReplacement: "ціна / якість",
  budgetReplacement: "бюджетний",
  unknown: "категорія не визначена"
} as const;

export type BuiltinBrandCategory = keyof typeof BRAND_CATEGORY_LABELS;
export type BrandQualityCategory = BuiltinBrandCategory | `custom:${string}`;
export interface BrandCategoryDefinition { id: BrandQualityCategory; label: string }

export const DEFAULT_BRAND_CATEGORIES: BrandCategoryDefinition[] = Object.entries(BRAND_CATEGORY_LABELS).map(([id, label]) => ({ id: id as BuiltinBrandCategory, label }));
const CUSTOM_ID = /^custom:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/u;

export function isBrandQualityCategory(value: unknown): value is BrandQualityCategory {
  return typeof value === "string" && (Object.hasOwn(BRAND_CATEGORY_LABELS, value) || CUSTOM_ID.test(value));
}

export function normalizeCategoryLabel(value: string): string {
  return value.replace(/\s+/gu, " ").trim();
}

export function categoryLabelKey(value: string): string {
  return normalizeCategoryLabel(value).normalize("NFKC").toLocaleLowerCase("uk");
}

export function normalizeBrandCategories(value: unknown): BrandCategoryDefinition[] {
  const entries = new Map<BrandQualityCategory, string>();
  if (Array.isArray(value)) for (const item of value) {
    if (!item || !isBrandQualityCategory(item.id) || typeof item.label !== "string") continue;
    const label = normalizeCategoryLabel(item.label);
    if (label && !entries.has(item.id)) entries.set(item.id, label);
  }
  return [
    ...DEFAULT_BRAND_CATEGORIES.map((category) => ({ ...category, label: entries.get(category.id) ?? category.label })),
    ...[...entries].filter(([id]) => id.startsWith("custom:")).map(([id, label]) => ({ id, label }))
  ];
}

export function validateBrandCategories(value: unknown): BrandCategoryDefinition[] {
  if (!Array.isArray(value)) throw new Error("brand-categories-must-be-array");
  const ids = new Set<string>();
  for (const item of value) {
    if (!item || !isBrandQualityCategory(item.id) || typeof item.label !== "string" || !normalizeCategoryLabel(item.label)) {
      throw new Error("brand-category-has-invalid-fields");
    }
    if (ids.has(item.id)) throw new Error("brand-category-duplicate-id");
    ids.add(item.id);
  }
  const categories = normalizeBrandCategories(value);
  const labels = new Set<string>();
  for (const category of categories) {
    const key = categoryLabelKey(category.label);
    if (labels.has(key)) throw new Error("brand-category-duplicate-label");
    labels.add(key);
  }
  return categories;
}

export function getBrandCategoryLabel(id: BrandQualityCategory, categories: BrandCategoryDefinition[] = DEFAULT_BRAND_CATEGORIES): string {
  return categories.find((category) => category.id === id)?.label ?? DEFAULT_BRAND_CATEGORIES.find((category) => category.id === id)?.label ?? BRAND_CATEGORY_LABELS.unknown;
}

export function assertBrandCategoryReferences(brands: Array<{ category: BrandQualityCategory }>, categories: BrandCategoryDefinition[]): void {
  const ids = new Set(categories.map((category) => category.id));
  if (brands.some((brand) => !ids.has(brand.category))) throw new Error("brand-category-not-found");
}

export function updateBrandCategory(categories: BrandCategoryDefinition[], name: string, id?: BrandQualityCategory): BrandCategoryDefinition[] {
  const label = normalizeCategoryLabel(name);
  if (!label) throw new Error("Введіть назву категорії.");
  if (id && !categories.some((category) => category.id === id)) throw new Error("Категорію не знайдено.");
  if (categories.some((category) => category.id !== id && categoryLabelKey(category.label) === categoryLabelKey(label))) {
    throw new Error("Категорія з такою назвою вже існує.");
  }
  return id ? categories.map((category) => category.id === id ? { ...category, label } : category) :
    [...categories, { id: `custom:${globalThis.crypto.randomUUID()}`, label }];
}
