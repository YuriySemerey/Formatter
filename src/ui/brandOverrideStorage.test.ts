import { describe, expect, it } from "vitest";
import {
  BROWSER_BRAND_OVERRIDES_STORAGE_KEY,
  loadBrowserBrandOverrides,
  saveBrowserBrandOverrides,
  serializeBrandOverrides
} from "./brandOverrideStorage";
import type { BrandOverride } from "../formatter/brandRegistry";

const now = "2026-07-12T10:00:00.000Z";

describe("browser brand override storage", () => {
  it("loads sanitized overrides from localStorage-compatible storage", () => {
    const storage = new MemoryStorage();
    storage.setItem(
      BROWSER_BRAND_OVERRIDES_STORAGE_KEY,
      JSON.stringify([
        {
          displayName: "CTR",
          aliases: ["СТР"],
          category: "premiumReplacement",
          country: "Південна Корея",
          updatedAt: now,
          source: "user"
        },
        {
          displayName: "Broken",
          category: "invalid",
          country: "Nowhere"
        }
      ])
    );

    expect(loadBrowserBrandOverrides(storage)).toEqual([
      {
        displayName: "CTR",
        aliases: ["СТР"],
        category: "premiumReplacement",
        country: "Південна Корея",
        isOriginal: false,
        updatedAt: now,
        source: "user"
      }
    ]);
  });

  it("saves only formatted output overrides to localStorage-compatible storage", () => {
    const storage = new MemoryStorage();
    const overrides: BrandOverride[] = [
      {
        displayName: "CTR",
        aliases: [],
        category: "valueReplacement",
        country: "Південна Корея",
        isOriginal: false,
        updatedAt: now,
        source: "user"
      }
    ];

    expect(saveBrowserBrandOverrides(overrides, storage)).toEqual(overrides);
    expect(storage.getItem(BROWSER_BRAND_OVERRIDES_STORAGE_KEY)).toBe(serializeBrandOverrides(overrides));
  });
});

class MemoryStorage implements Storage {
  private readonly values = new Map<string, string>();

  get length() {
    return this.values.size;
  }

  clear(): void {
    this.values.clear();
  }

  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }

  key(index: number): string | null {
    return Array.from(this.values.keys())[index] ?? null;
  }

  removeItem(key: string): void {
    this.values.delete(key);
  }

  setItem(key: string, value: string): void {
    this.values.set(key, value);
  }
}
