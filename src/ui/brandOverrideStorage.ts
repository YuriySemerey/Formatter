import { sanitizeBrandOverrides, type BrandOverride } from "../formatter/brandRegistry";

export const BROWSER_BRAND_OVERRIDES_STORAGE_KEY = "formatter.avtoProBrandOverrides";

export function loadBrowserBrandOverrides(storage: Storage = window.localStorage): BrandOverride[] {
  try {
    return sanitizeBrandOverrides(JSON.parse(storage.getItem(BROWSER_BRAND_OVERRIDES_STORAGE_KEY) ?? "[]"));
  } catch {
    return [];
  }
}

export function saveBrowserBrandOverrides(overrides: BrandOverride[], storage: Storage = window.localStorage): BrandOverride[] {
  const sanitized = sanitizeBrandOverrides(overrides);
  storage.setItem(BROWSER_BRAND_OVERRIDES_STORAGE_KEY, serializeBrandOverrides(sanitized));
  return sanitized;
}

export function serializeBrandOverrides(overrides: BrandOverride[]): string {
  return `${JSON.stringify(sanitizeBrandOverrides(overrides), null, 2)}\n`;
}
