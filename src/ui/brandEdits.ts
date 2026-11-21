import {
  getBrandCatalog, getBrandOverrideId, normalizeBrandKey, UNKNOWN_COUNTRY_LABEL,
  type BrandCatalogEntry, type BrandOverride, type BrandQualityCategory
} from "../formatter/brandRegistry";

export interface BrandEdit {
  displayName: string;
  category: BrandQualityCategory;
  country: string;
}

export function updateBrandDraft(drafts: BrandOverride[], edit: BrandEdit, entry?: BrandCatalogEntry): BrandOverride[] {
  const displayName = edit.displayName.replace(/\s+/gu, " ").trim();
  const key = normalizeBrandKey(displayName);
  if (!key) throw new Error("Введіть назву бренду з літерами або цифрами.");

  if (!entry || displayName !== entry.displayName) {
    const duplicate = getBrandCatalog(drafts).find((brand) => brand.id !== entry?.id &&
      [brand.displayName, ...brand.aliases].some((name) => normalizeBrandKey(name) === key));
    if (duplicate) throw new Error(`Ця назва вже належить бренду «${duplicate.displayName}». Змініть наявний запис або виберіть іншу назву.`);
  }

  const aliases = [...new Set([...(entry?.aliases ?? []), ...(entry && displayName !== entry.displayName ? [entry.displayName] : [])])];
  const next: BrandOverride = {
    displayName,
    ...(entry?.baseName ? { baseName: entry.baseName } : {}),
    aliases,
    category: edit.category,
    country: edit.country.replace(/\s+/gu, " ").trim() || UNKNOWN_COUNTRY_LABEL,
    isOriginal: edit.category === "original",
    updatedAt: new Date().toISOString(),
    source: "user"
  };
  const remaining = entry ? drafts.filter((override) => getBrandOverrideId(override) !== entry.id) : drafts;
  const base = entry?.baseName ? getBrandCatalog().find((brand) => brand.id === entry.id) : undefined;
  if (base && next.displayName === base.displayName && next.category === base.category &&
    next.country === base.country && next.isOriginal === base.isOriginal &&
    aliases.every((alias) => base.aliases.some((name) => normalizeBrandKey(name) === normalizeBrandKey(alias)))) {
    return remaining;
  }
  return [...remaining, next];
}
