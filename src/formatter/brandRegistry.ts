import avtoProBrandCatalog from "./brandCatalog.generated.json";
import type { BrandMetadataDisplayOptions } from "./types";
import { BRAND_CATEGORY_LABELS, getBrandCategoryLabel, isBrandQualityCategory, type BrandCategoryDefinition, type BrandQualityCategory } from "../../electron/brandCategories";
export { BRAND_CATEGORY_LABELS, isBrandQualityCategory } from "../../electron/brandCategories";
export type { BrandCategoryDefinition, BrandQualityCategory } from "../../electron/brandCategories";


export type BrandVerificationConfidence = "high" | "medium" | "low";

export interface BrandRegistryEntry {
  displayName: string;
  aliases?: string[];
  category: BrandQualityCategory;
  country: string;
  isOriginal?: boolean;
  source: "avtoPro";
  verification: BrandVerification;
}

export interface BrandVerification {
  checkedAt: string;
  confidence: BrandVerificationConfidence;
  countrySources: string[];
  categorySources: string[];
  notes?: string;
}

export interface BrandOverride {
  displayName: string;
  baseName?: string;
  aliases?: string[];
  category: BrandQualityCategory;
  country: string;
  isOriginal?: boolean;
  updatedAt: string;
  source: "user";
}

export interface BrandCatalogEntry {
  id: string;
  baseName?: string;
  displayName: string;
  aliases: string[];
  category: BrandQualityCategory;
  categoryLabel: string;
  country: string;
  isOriginal: boolean;
  source: "avtoPro" | "user";
  overridden: boolean;
  updatedAt?: string;
  verification?: BrandVerification;
}

export interface ResolvedBrandInfo {
  displayName: string;
  category?: BrandQualityCategory;
  categoryLabel: string;
  country: string;
  isOriginal: boolean;
  known: boolean;
  source: "avtoPro" | "user" | "fallback";
  verification?: BrandVerification;
}

export interface BrandBoundaryMatch {
  brand: string;
  productText: string;
}

interface GeneratedBrandCatalogFile {
  source: "avto.pro";
  sourceUrl: string;
  generatedAt: string;
  sourceNames?: unknown;
  entries: GeneratedBrandCatalogEntry[];
}

interface GeneratedBrandCatalogEntry {
  displayName?: unknown;
  aliases?: unknown;
  category?: unknown;
  country?: unknown;
  isOriginal?: unknown;
  verification?: Partial<BrandVerification>;
}

export const UNKNOWN_COUNTRY_LABEL = "країна не визначена";
const BRAND_VERIFICATION_DATE = "2026-07-13";

export const BRAND_VERIFICATION_REFERENCES = [
  {
    id: "avto-pro-makers",
    label: "Avto.pro manufacturer catalog",
    url: "https://avto.pro/makers/"
  },
  {
    id: "avto-pro-maker-detail",
    label: "Avto.pro manufacturer detail page"
  }
] as const;

export const AVTO_PRO_BRAND_REGISTRY = normalizeGeneratedBrandCatalog(avtoProBrandCatalog as GeneratedBrandCatalogFile);
export const AVTO_PRO_SOURCE_NAMES = normalizeGeneratedSourceNames((avtoProBrandCatalog as GeneratedBrandCatalogFile).sourceNames);
export const BRAND_REGISTRY: BrandRegistryEntry[] = AVTO_PRO_BRAND_REGISTRY;

const AVTO_PRO_BRAND_INDEX = buildBrandIndex(AVTO_PRO_BRAND_REGISTRY);
const AVTO_PRO_SOURCE_NAME_INDEX = buildSourceNameIndex(AVTO_PRO_SOURCE_NAMES);
const AVTO_PRO_BOUNDARY_CANDIDATES = buildBoundaryCandidates(AVTO_PRO_BRAND_REGISTRY);

export function resolveBrandInfo(rawBrand: string, overrides: BrandOverride[] = [], categories?: BrandCategoryDefinition[]): ResolvedBrandInfo {
  const displayName = cleanupBrand(rawBrand);
  const override = findOverride(displayName, overrides);
  if (override) {
    return {
      displayName: override.displayName,
      category: override.category,
      categoryLabel: getBrandCategoryLabel(override.category, categories),
      country: resolveCountry(override.country),
      isOriginal: Boolean(override.isOriginal || override.category === "original"),
      known: true,
      source: "user"
    };
  }

  const entry = AVTO_PRO_BRAND_INDEX.get(normalizeBrandKey(displayName));
  if (!entry) {
    return {
      displayName,
      category: "unknown",
      categoryLabel: getBrandCategoryLabel("unknown", categories),
      country: UNKNOWN_COUNTRY_LABEL,
      isOriginal: false,
      known: false,
      source: "fallback"
    };
  }

  return {
    displayName: entry.displayName,
    category: entry.category,
    categoryLabel: getBrandCategoryLabel(entry.category, categories),
    country: resolveCountry(entry.country),
    isOriginal: Boolean(entry.isOriginal || entry.category === "original"),
    known: true,
    source: "avtoPro",
    verification: entry.verification
  };
}

export function formatBrandMetadata(rawBrand: string, overrides: BrandOverride[] = [], options: BrandMetadataDisplayOptions = {}) {
  const brand = resolveBrandInfo(rawBrand, overrides, options.brandCategories);
  return [
    options.showBrandCategory !== false ? brand.categoryLabel : "",
    options.showBrandCountry !== false ? brand.country : ""
  ].filter(Boolean).join(", ");
}

export function resolveUserBrandAlias(rawBrand: string, overrides: BrandOverride[] = []) {
  return findOverride(cleanupBrand(rawBrand), overrides)?.displayName;
}

export function matchBrandAtTextBoundary(value: string, overrides: BrandOverride[] = []): BrandBoundaryMatch | undefined {
  const text = cleanupBrand(value);
  if (!text) {
    return undefined;
  }

  const sanitizedOverrides = sanitizeBrandOverrides(overrides);
  const candidates = mergeBoundaryCandidates(buildOverrideBoundaryCandidates(sanitizedOverrides), AVTO_PRO_BOUNDARY_CANDIDATES);
  const lowerText = text.toLocaleLowerCase("uk");

  for (const candidate of candidates) {
    const lowerName = candidate.matchName.toLocaleLowerCase("uk");
    if (lowerText.startsWith(`${lowerName} `)) {
      return {
        brand: candidate.displayName,
        productText: cleanupBrand(text.slice(candidate.matchName.length))
      };
    }

    if (lowerText.endsWith(` ${lowerName}`)) {
      return {
        brand: candidate.displayName,
        productText: cleanupBrand(text.slice(0, text.length - candidate.matchName.length))
      };
    }
  }

  return undefined;
}

export function getBrandCatalog(overrides: BrandOverride[] = [], categories?: BrandCategoryDefinition[]): BrandCatalogEntry[] {
  const sanitizedOverrides = sanitizeBrandOverrides(overrides);
  const baseOverrides = new Map(sanitizedOverrides.flatMap((override) => {
    const base = baseEntryForOverride(override);
    return base ? [[base.displayName, override] as const] : [];
  }));

  const avtoProEntries = AVTO_PRO_BRAND_REGISTRY.map((entry) => {
    const override = baseOverrides.get(entry.displayName);

    const category = override?.category ?? entry.category;
    const country = override ? resolveCountry(override.country) : resolveCountry(entry.country);
    const isOriginal = override?.isOriginal ?? Boolean(entry.isOriginal || category === "original");
    const aliases = mergeAliases(
      entry.aliases, sourceNameAliasesFor(entry.displayName, entry.aliases), override?.aliases,
      override && override.displayName !== entry.displayName ? [entry.displayName] : []
    );

    return {
      id: `base:${normalizeBrandKey(entry.displayName)}`,
      baseName: entry.displayName,
      displayName: override?.displayName ?? entry.displayName,
      aliases,
      category,
      categoryLabel: getBrandCategoryLabel(category, categories),
      country,
      isOriginal,
      source: override ? "user" : "avtoPro",
      overridden: Boolean(override),
      updatedAt: override?.updatedAt,
      verification: entry.verification
    } satisfies BrandCatalogEntry;
  });

  const customEntries = sanitizedOverrides.filter((override) => !baseEntryForOverride(override)).map((override) => ({
    ...override,
    id: `user:${normalizeBrandKey(override.displayName)}`,
    aliases: override.aliases ?? [],
    categoryLabel: getBrandCategoryLabel(override.category, categories),
    isOriginal: Boolean(override.isOriginal || override.category === "original"),
    overridden: true
  } satisfies BrandCatalogEntry));
  return [...avtoProEntries, ...customEntries];
}

export function sanitizeBrandOverrides(value: unknown): BrandOverride[] {
  if (!Array.isArray(value)) {
    return [];
  }

  const seen = new Set<string>();
  const seenNames = new Set<string>();
  const sanitized: BrandOverride[] = [];

  for (const item of value) {
    if (!item || typeof item !== "object") {
      continue;
    }

    const candidate = item as Partial<BrandOverride>;
    const displayName = cleanupBrand(String(candidate.displayName ?? ""));
    const category = candidate.category;
    const country = resolveCountry(candidate.country);
    if (!displayName || !isBrandQualityCategory(category)) {
      continue;
    }

    const aliases = Array.isArray(candidate.aliases)
      ? candidate.aliases.map((alias) => cleanupBrand(String(alias))).filter(Boolean)
      : [];
    const key = normalizeBrandKey(displayName);
    const baseName = typeof candidate.baseName === "string" ? cleanupBrand(candidate.baseName) : "";
    const base = AVTO_PRO_BRAND_INDEX.get(normalizeBrandKey(baseName || displayName));
    const identity = base ? `base:${normalizeBrandKey(base.displayName)}` : `user:${key}`;
    if (!key || seen.has(identity) || seenNames.has(key) || (baseName && !base)) {
      continue;
    }

    seen.add(identity);
    seenNames.add(key);
    sanitized.push({
      displayName,
      ...(baseName && base ? { baseName: base.displayName } : {}),
      aliases,
      category,
      country,
      isOriginal: Boolean(candidate.isOriginal || category === "original"),
      updatedAt: typeof candidate.updatedAt === "string" && candidate.updatedAt ? candidate.updatedAt : new Date().toISOString(),
      source: "user"
    });
  }

  return sanitized;
}

export function normalizeBrandKey(value: string) {
  return cleanupBrand(value)
    .toLocaleLowerCase("uk")
    .replace(/&/gu, "and")
    .replace(/\+/gu, "plus")
    .replace(/[^a-zа-яіїєґ0-9]+/giu, "")
    .trim();
}

export function getBrandOverrideId(override: BrandOverride): string {
  const base = baseEntryForOverride(override);
  return base ? `base:${normalizeBrandKey(base.displayName)}` : `user:${normalizeBrandKey(override.displayName)}`;
}

function normalizeGeneratedBrandCatalog(catalog: GeneratedBrandCatalogFile): BrandRegistryEntry[] {
  if (!catalog || !Array.isArray(catalog.entries)) {
    return [];
  }

  const seen = new Set<string>();
  const entries: BrandRegistryEntry[] = [];

  for (const item of catalog.entries) {
    const displayName = cleanupBrand(String(item.displayName ?? ""));
    const category = isBrandQualityCategory(item.category) ? item.category : "unknown";
    const country = resolveCountry(item.country);
    const aliases = Array.isArray(item.aliases) ? item.aliases.map((alias) => cleanupBrand(String(alias))).filter(Boolean) : [];
    const key = normalizeBrandKey(displayName);
    if (!displayName || !key || seen.has(key)) {
      continue;
    }

    seen.add(key);
    entries.push({
      displayName,
      aliases,
      category,
      country,
      isOriginal: Boolean(item.isOriginal || category === "original"),
      source: "avtoPro",
      verification: normalizeGeneratedVerification(item.verification, category, country)
    });
  }

  return entries;
}

function normalizeGeneratedSourceNames(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  const seen = new Set<string>();
  const names: string[] = [];
  for (const item of value) {
    const name = cleanupBrand(String(item ?? ""));
    const key = normalizeBrandKey(name);
    if (!name || !key || seen.has(key)) {
      continue;
    }

    seen.add(key);
    names.push(name);
  }

  return names;
}

function normalizeGeneratedVerification(
  verification: Partial<BrandVerification> | undefined,
  category: BrandQualityCategory,
  country: string
): BrandVerification {
  const confidence = isBrandVerificationConfidence(verification?.confidence)
    ? verification.confidence
    : country === UNKNOWN_COUNTRY_LABEL
      ? "low"
      : "medium";

  return {
    checkedAt: typeof verification?.checkedAt === "string" && verification.checkedAt ? verification.checkedAt : BRAND_VERIFICATION_DATE,
    confidence,
    countrySources: normalizeSourceIds(verification?.countrySources, ["avto-pro-makers"]),
    categorySources: normalizeSourceIds(verification?.categorySources, category === "unknown" ? [] : ["avto-pro-makers"]),
    notes:
      typeof verification?.notes === "string" && verification.notes
        ? verification.notes
        : "Avto.pro is the only built-in manufacturer source; category is user-editable."
  };
}

function normalizeSourceIds(value: unknown, fallback: string[]) {
  const ids = Array.isArray(value) ? value.map((source) => cleanupBrand(String(source))).filter(Boolean) : [];
  return Array.from(new Set(ids.length > 0 ? ids : fallback));
}

function isBrandVerificationConfidence(value: unknown): value is BrandVerificationConfidence {
  return value === "high" || value === "medium" || value === "low";
}

function buildBrandIndex(entries: BrandRegistryEntry[]) {
  const index = new Map<string, BrandRegistryEntry>();
  for (const entry of entries) {
    index.set(normalizeBrandKey(entry.displayName), entry);
    for (const alias of entry.aliases ?? []) {
      index.set(normalizeBrandKey(alias), entry);
    }
  }

  return index;
}

interface BrandBoundaryCandidate {
  displayName: string;
  matchName: string;
}

function buildBoundaryCandidates(entries: BrandRegistryEntry[]) {
  return mergeBoundaryCandidates(
    entries.flatMap((entry) =>
      [entry.displayName, ...(entry.aliases ?? [])].map((matchName) => ({
        displayName: entry.displayName,
        matchName
      }))
    )
  );
}

function buildOverrideBoundaryCandidates(overrides: BrandOverride[]) {
  return overrides.flatMap((override) => {
    const base = baseEntryForOverride(override);
    return [override.displayName, ...(override.aliases ?? []), ...(base ? [base.displayName, ...(base.aliases ?? [])] : [])].map((matchName) => ({
      displayName: override.displayName,
      matchName
    }));
  });
}

function mergeBoundaryCandidates(...groups: BrandBoundaryCandidate[][]) {
  const seen = new Set<string>();
  return groups
    .flat()
    .map((candidate) => ({
      displayName: cleanupBrand(candidate.displayName),
      matchName: cleanupBrand(candidate.matchName)
    }))
    .filter((candidate) => {
      const key = candidate.matchName.toLocaleLowerCase("uk");
      if (!candidate.displayName || !candidate.matchName || seen.has(key)) {
        return false;
      }

      seen.add(key);
      return true;
    })
    .sort((a, b) => b.matchName.length - a.matchName.length || a.matchName.localeCompare(b.matchName, "uk"));
}

function buildSourceNameIndex(sourceNames: string[]) {
  const index = new Map<string, string[]>();
  for (const sourceName of sourceNames) {
    const key = normalizeBrandKey(sourceName);
    if (!key) {
      continue;
    }

    const names = index.get(key) ?? [];
    names.push(sourceName);
    index.set(key, names);
  }

  return index;
}

function sourceNameAliasesFor(displayName: string, aliases: string[] = []) {
  const result: string[] = [];
  const displayNameLower = cleanupBrand(displayName).toLocaleLowerCase("uk");
  for (const key of brandKeys(displayName, aliases)) {
    result.push(...(AVTO_PRO_SOURCE_NAME_INDEX.get(key) ?? []).filter((name) => cleanupBrand(name).toLocaleLowerCase("uk") !== displayNameLower));
  }

  return result;
}

function mergeAliases(...aliasGroups: Array<string[] | undefined>) {
  const aliases: string[] = [];
  const seen = new Set<string>();
  for (const alias of aliasGroups.flatMap((group) => group ?? [])) {
    const cleanAlias = cleanupBrand(alias);
    const key = normalizeBrandKey(cleanAlias);
    if (!cleanAlias || !key || seen.has(key)) {
      continue;
    }

    seen.add(key);
    aliases.push(cleanAlias);
  }

  return aliases;
}

function findOverride(rawBrand: string, overrides: BrandOverride[]) {
  const normalized = normalizeBrandKey(rawBrand);
  const base = AVTO_PRO_BRAND_INDEX.get(normalized);
  return sanitizeBrandOverrides(overrides).find((override) =>
    brandKeys(override.displayName, override.aliases).includes(normalized) ||
    (base && baseEntryForOverride(override) === base)
  );
}

function baseEntryForOverride(override: BrandOverride) {
  return AVTO_PRO_BRAND_INDEX.get(normalizeBrandKey(override.baseName || override.displayName));
}

function resolveCountry(value: unknown) {
  return cleanupBrand(String(value ?? "")) || UNKNOWN_COUNTRY_LABEL;
}

function brandKeys(displayName: string, aliases: string[] = []) {
  return [displayName, ...aliases].map(normalizeBrandKey).filter(Boolean);
}

function cleanupBrand(value: string) {
  return value.replace(/\s+/g, " ").trim();
}
