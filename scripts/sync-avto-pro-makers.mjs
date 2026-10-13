import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");
const generatedCatalogPath = path.join(rootDir, "src/formatter/brandCatalog.generated.json");
const generatedAuditPath = path.join(rootDir, "src/formatter/brandCatalog.audit.generated.json");
const detailCachePath = path.join(rootDir, "scripts/cache/avto-pro-maker-details.json");
const makerSeedPath = path.join(rootDir, "scripts/data/avto-pro-maker-names.seed.txt");

const AVTO_PRO_MAKERS_URL = "https://avto.pro/makers/";
const AVTO_PRO_MAKER_DETAIL_SOURCE_ID = "avto-pro-maker-detail";
const GENERATED_AT = "2026-07-12";
const UNKNOWN_COUNTRY = "країна не визначена";
const UNKNOWN_CATEGORY = "unknown";
const REQUEST_TIMEOUT_MS = 8000;
const MAX_DETAIL_CONCURRENCY = 6;
const ARG_SET = new Set(process.argv.slice(2));
const OFFLINE_MODE = ARG_SET.has("--offline");
const SKIP_DETAILS = ARG_SET.has("--skip-details");
const REFRESH_DETAILS = ARG_SET.has("--refresh-details") || ARG_SET.has("--full-details");

const FALLBACK_DETAIL_METADATA = new Map([
  [
    "Bcguma",
    {
      avtoProUrl: "https://avto.pro/makers/bcguma/",
      rawCountry: "Украина",
      country: "Україна",
      foundedYear: "1998",
      descriptionNote:
        "Avto.pro describes BCGUMA as a Ukrainian trademark with rubber technical products from factories in Bila Tserkva, focused on the secondary market and budget-constrained buyers.",
      confidence: "medium"
    }
  ],
  [
    "CTR",
    {
      avtoProUrl: "https://avto.pro/makers/ctr/",
      rawCountry: "Южная Корея",
      country: "Південна Корея",
      foundedYear: "1960",
      descriptionNote:
        "Avto.pro describes CTR as a Korean suspension and steering parts maker with conveyor supplies to Hyundai/Kia and a price segment between budget analogs and original parts.",
      confidence: "medium"
    }
  ]
]);

function normalizeBrandKey(value) {
  return cleanupText(value)
    .toLocaleLowerCase("uk")
    .replace(/&/gu, "and")
    .replace(/\+/gu, "plus")
    .replace(/[^a-zа-яіїєґ0-9]+/giu, "")
    .trim();
}

function cleanupText(value) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

export function brandKeys(displayName, aliases = []) {
  return [displayName, ...aliases].map(normalizeBrandKey).filter(Boolean);
}

function decodeHtml(value) {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, "\"")
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

function stripTags(value) {
  return decodeHtml(value.replace(/<[^>]*>/g, " ")).replace(/\s+/g, " ").trim();
}

function htmlToLines(html) {
  return decodeHtml(
    html
      .replace(/<script\b[^>]*>[\s\S]*?<\/script>/giu, " ")
      .replace(/<style\b[^>]*>[\s\S]*?<\/style>/giu, " ")
      .replace(/<[^>]+>/gu, "\n")
  )
    .split(/\n+/u)
    .map((line) => line.trim())
    .filter(Boolean);
}

export function extractAvtoProMakerNamesFromHtml(html) {
  const linkNames = [...html.matchAll(/<a\b[^>]*href=["'][^"']*\/makers\/[^"']*["'][^>]*>(.*?)<\/a>/giu)].map((match) =>
    stripTags(match[1])
  );
  const textNames = htmlToLines(html).filter(isLikelyMakerName);

  return dedupeNames([...linkNames, ...textNames]);
}

export function buildAvtoProMakerUrl(displayName) {
  return new URL(`${makeAvtoProSlug(displayName)}/`, AVTO_PRO_MAKERS_URL).toString();
}

export function makeAvtoProSlug(displayName) {
  return cleanupText(displayName)
    .toLocaleLowerCase("uk")
    .replace(/&/gu, "and")
    .replace(/\+/gu, "-")
    .replace(/[()']/gu, "")
    .replace(/[^a-zа-яіїєґ0-9]+/giu, "-")
    .replace(/^-+|-+$/gu, "");
}

export function extractAvtoProMakerDetailsFromHtml(html, displayName = "") {
  const lines = htmlToLines(html);
  const joined = lines.join("\n");
  const rawCountry = extractLabeledValue(joined, "Страна");
  const foundedYear = extractLabeledValue(joined, "Год основания");
  const country = translateCountry(rawCountry);
  const descriptionNote = extractDescriptionNote(lines, displayName);

  return {
    rawCountry,
    country,
    foundedYear,
    descriptionNote,
    confidence: country ? "medium" : "low"
  };
}

export function parseSeedMakerNames(rawText) {
  return dedupeNames(String(rawText ?? "").split(/\r?\n/u));
}

async function loadSeedMakerNames() {
  const rawText = await readFile(makerSeedPath, "utf8");
  const names = parseSeedMakerNames(rawText);
  if (names.length === 0) {
    throw new Error("Avto.pro maker seed is empty.");
  }

  return names;
}

async function loadAvtoProMakerNames() {
  const seedNames = await loadSeedMakerNames();

  if (OFFLINE_MODE) {
    return { names: seedNames, live: false, source: "seed" };
  }

  try {
    const response = await fetch(AVTO_PRO_MAKERS_URL, {
      headers: {
        "accept-language": "uk-UA,uk;q=0.9,en;q=0.8",
        "user-agent": "Mozilla/5.0 (compatible; product-price-formatter/0.1)"
      }
    });
    const html = await response.text();
    const names = extractAvtoProMakerNamesFromHtml(html);

    return { names: seedNames, live: names.length >= 200, source: "seed" };
  } catch {
    return { names: seedNames, live: false, source: "seed" };
  }
}

async function loadAvtoProMakerDetails(makerNames, enabled) {
  const fallbackDetails = new Map(
    [...FALLBACK_DETAIL_METADATA.entries()].map(([name, detail]) => [normalizeBrandKey(name), detail])
  );
  const cachedDetails = await readDetailCache();
  const details = new Map([...cachedDetails, ...fallbackDetails]);

  if (!enabled || SKIP_DETAILS || OFFLINE_MODE) {
    return details;
  }

  await runLimited(makerNames, MAX_DETAIL_CONCURRENCY, async (displayName) => {
    const key = normalizeBrandKey(displayName);
    const avtoProUrl = buildAvtoProMakerUrl(displayName);

    try {
      const html = await fetchText(avtoProUrl);
      const parsed = extractAvtoProMakerDetailsFromHtml(html, displayName);
      if (parsed.rawCountry || parsed.foundedYear || parsed.descriptionNote) {
        details.set(key, mergeAvtoProDetail(details.get(key), {
          avtoProUrl,
          ...parsed
        }));
      }
    } catch {
      // Detail pages are best-effort. Keep generated catalog usable when Avto.pro throttles or blocks requests.
    }
  });

  await writeDetailCache(makerNames, details);
  return details;
}

async function readDetailCache() {
  try {
    const raw = await readFile(detailCachePath, "utf8");
    const parsed = JSON.parse(raw);
    const entries = Array.isArray(parsed?.entries) ? parsed.entries : [];
    const details = new Map();

    for (const entry of entries) {
      const displayName = cleanupText(entry.displayName);
      const key = normalizeBrandKey(displayName || entry.key);
      const detail = normalizeDetail(entry);
      if (key && detail) {
        details.set(key, detail);
      }
    }

    return details;
  } catch {
    return new Map();
  }
}

async function writeDetailCache(makerNames, details) {
  const entries = makerNames
    .map((displayName) => {
      const key = normalizeBrandKey(displayName);
      const detail = normalizeDetail(details.get(key));
      return detail
        ? {
            displayName,
            key,
            ...detail
          }
        : undefined;
    })
    .filter(Boolean);

  const cache = {
    source: "avto.pro",
    sourceUrl: AVTO_PRO_MAKERS_URL,
    generatedAt: GENERATED_AT,
    entries
  };

  await mkdir(path.dirname(detailCachePath), { recursive: true });
  await writeFile(detailCachePath, `${JSON.stringify(cache, null, 2)}\n`, "utf8");
}

async function fetchText(url) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        "accept-language": "uk-UA,uk;q=0.9,ru;q=0.8,en;q=0.7",
        "user-agent": "Mozilla/5.0 (compatible; product-price-formatter/0.1)"
      }
    });

    if (!response.ok) {
      throw new Error(`http-${response.status}`);
    }

    return await response.text();
  } finally {
    clearTimeout(timeout);
  }
}

async function runLimited(items, concurrency, worker) {
  let index = 0;
  const workers = Array.from({ length: Math.max(1, Math.min(concurrency, items.length)) }, async () => {
    while (index < items.length) {
      const currentIndex = index;
      index += 1;
      await worker(items[currentIndex], currentIndex);
    }
  });

  await Promise.all(workers);
}

function extractLabeledValue(text, label) {
  const escapedLabel = label.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
  const pattern = new RegExp(`${escapedLabel}\\s+([^\\n]+)`, "iu");
  const match = text.match(pattern);
  return cleanupText(match?.[1] ?? "");
}

function translateCountry(rawCountry) {
  const country = cleanupText(rawCountry);
  if (!country) {
    return "";
  }

  return countryTranslations().get(country.toLocaleLowerCase("uk")) ?? country;
}

function countryTranslations() {
  return new Map([
    ["южная корея", "Південна Корея"],
    ["південна корея", "Південна Корея"],
    ["корея", "Південна Корея"],
    ["германия", "Німеччина"],
    ["німеччина", "Німеччина"],
    ["италия", "Італія"],
    ["італія", "Італія"],
    ["сша", "США"],
    ["япония", "Японія"],
    ["японія", "Японія"],
    ["франция", "Франція"],
    ["франція", "Франція"],
    ["великобритания", "Велика Британія"],
    ["велика британія", "Велика Британія"],
    ["польша", "Польща"],
    ["польща", "Польща"],
    ["китай", "Китай"],
    ["испания", "Іспанія"],
    ["іспанія", "Іспанія"],
    ["нидерланды", "Нідерланди"],
    ["нідерланди", "Нідерланди"],
    ["дания", "Данія"],
    ["данія", "Данія"],
    ["швеция", "Швеція"],
    ["швеція", "Швеція"],
    ["бельгия", "Бельгія"],
    ["бельгія", "Бельгія"],
    ["турция", "Туреччина"],
    ["туреччина", "Туреччина"],
    ["тайвань", "Тайвань"],
    ["чехия", "Чехія"],
    ["чехія", "Чехія"],
    ["украина", "Україна"],
    ["україна", "Україна"],
    ["венгрия", "Угорщина"],
    ["угорщина", "Угорщина"],
    ["румыния", "Румунія"],
    ["румунія", "Румунія"],
    ["литва", "Литва"],
    ["литва", "Литва"],
    ["словения", "Словенія"],
    ["словенія", "Словенія"],
    ["таиланд", "Таїланд"],
    ["таїланд", "Таїланд"],
    ["бразилия", "Бразилія"],
    ["бразилія", "Бразилія"]
  ]);
}

function extractDescriptionNote(lines, displayName) {
  const text = lines.join(" ");
  const name = cleanupText(displayName);
  const startIndex = name ? text.toLocaleLowerCase("uk").indexOf(name.toLocaleLowerCase("uk")) : -1;
  const searchableText = startIndex >= 0 ? text.slice(startIndex) : text;
  const stopMatch = searchableText.search(/Сравнение|Последние добавленные|Запчасти\s+[A-ZА-ЯІЇЄҐ0-9]/iu);
  const description = cleanupText((stopMatch > 0 ? searchableText.slice(0, stopMatch) : searchableText).replace(/\s+/g, " "));
  const sentences = description.match(/[^.!?]+[.!?]/gu) ?? [];

  return cleanupText((sentences.length > 0 ? sentences.slice(0, 3).join(" ") : description).slice(0, 700));
}

export function dedupeNames(names) {
  const seen = new Set();
  const result = [];

  for (const rawName of names) {
    const name = cleanupText(rawName);
    const key = normalizeBrandKey(name);
    if (!name || !key || seen.has(key)) {
      continue;
    }

    seen.add(key);
    result.push(name);
  }

  return result;
}

export function buildEntry(displayName, detailInput) {
  const fallbackDetail = FALLBACK_DETAIL_METADATA.get(displayName);
  const detail = normalizeDetail(detailInput ?? fallbackDetail);
  const country = detail?.country ?? UNKNOWN_COUNTRY;
  const confidence = country === UNKNOWN_COUNTRY ? "low" : "medium";
  const details = detail
    ? {
        avtoProUrl: detail.avtoProUrl,
        rawCountry: detail.rawCountry,
        foundedYear: detail.foundedYear,
        descriptionNote: detail.descriptionNote
      }
    : undefined;
  const countrySources = country === UNKNOWN_COUNTRY ? ["avto-pro-makers"] : ["avto-pro-makers", AVTO_PRO_MAKER_DETAIL_SOURCE_ID];

  const entry = {
    displayName,
    aliases: [],
    category: "unknown",
    country,
    isOriginal: false,
    verification: {
      checkedAt: GENERATED_AT,
      confidence,
      countrySources,
      categorySources: [],
      notes: detail
        ? "Avto.pro maker detail page confirms country; category is user-editable."
        : "Avto.pro confirms the manufacturer name; country was not confirmed from detail page and category is user-editable."
    }
  };

  if (details) {
    entry.details = details;
  }

  return entry;
}

function normalizeDetail(detail) {
  if (!detail || typeof detail !== "object") {
    return undefined;
  }

  const rawCountry = cleanupText(detail.rawCountry);
  const translatedCountry = cleanupText(detail.country) || translateCountry(rawCountry);
  const foundedYear = cleanupText(detail.foundedYear);
  const descriptionNote = cleanupText(detail.descriptionNote);
  const confidence = translatedCountry ? "medium" : "low";
  const avtoProUrl = cleanupText(detail.avtoProUrl);

  if (!rawCountry && !translatedCountry && !foundedYear && !descriptionNote) {
    return undefined;
  }

  return {
    avtoProUrl,
    rawCountry,
    country: translatedCountry,
    foundedYear,
    descriptionNote,
    confidence
  };
}

export function mergeAvtoProDetail(existingDetail, incomingDetail) {
  const existing = normalizeDetail(existingDetail);
  const incoming = normalizeDetail(incomingDetail);

  if (!incoming) {
    return existing;
  }

  if (!existing) {
    return incoming;
  }

  return {
    avtoProUrl: incoming.avtoProUrl || existing.avtoProUrl,
    rawCountry: incoming.rawCountry || existing.rawCountry,
    country: incoming.country || existing.country,
    foundedYear: incoming.foundedYear || existing.foundedYear,
    descriptionNote: incoming.descriptionNote || existing.descriptionNote,
    confidence: strongerConfidence(existing.confidence, incoming.confidence)
  };
}

function strongerConfidence(left, right) {
  const rank = { low: 0, medium: 1, high: 2 };
  return rank[right] > rank[left] ? right : left;
}

export function findMissingMakerNames(sourceNames, entries, baseKeys = new Set()) {
  const representedKeys = new Set(baseKeys);
  for (const entry of entries) {
    for (const key of brandKeys(entry.displayName, entry.aliases)) {
      representedKeys.add(key);
    }
  }

  return sourceNames.filter((name) => !representedKeys.has(normalizeBrandKey(name)));
}

export function buildBrandAuditReport(sourceNames, entries, baseSummaries) {
  const generatedSummaries = buildGeneratedSummaryIndex(entries);
  const records = sourceNames.map((sourceName) => {
    const sourceKey = normalizeBrandKey(sourceName);
    const summary = generatedSummaries.get(sourceKey);
    const country = cleanupText(summary?.country) || UNKNOWN_COUNTRY;
    const category = cleanupText(summary?.category) || UNKNOWN_CATEGORY;
    const countrySources = Array.isArray(summary?.countrySources) ? summary.countrySources : [];
    const categorySources = Array.isArray(summary?.categorySources) ? summary.categorySources : [];

    return {
      sourceName,
      displayName: summary?.displayName ?? sourceName,
      source: summary?.source ?? "missing",
      country,
      category,
      confidence: summary?.confidence ?? "low",
      hasAvtoProDetailCountry: country !== UNKNOWN_COUNTRY && countrySources.includes(AVTO_PRO_MAKER_DETAIL_SOURCE_ID),
      missingCountry: !country || country === UNKNOWN_COUNTRY,
      missingCategory: category === UNKNOWN_CATEGORY,
      lowConfidence: (summary?.confidence ?? "low") === "low",
      countrySources,
      categorySources
    };
  });

  const missingCoverage = records.filter((record) => record.source === "missing").map((record) => record.sourceName);
  const missingCountry = records.filter((record) => record.missingCountry).map((record) => record.sourceName);
  const missingCategory = records.filter((record) => record.missingCategory).map((record) => record.sourceName);
  const lowConfidence = records.filter((record) => record.lowConfidence).map((record) => record.sourceName);

  return {
    generatedAt: GENERATED_AT,
    source: "avto.pro",
    sourceUrl: AVTO_PRO_MAKERS_URL,
    totals: {
      sourceNames: sourceNames.length,
      represented: records.filter((record) => record.source !== "missing").length,
      generatedEntries: entries.length,
      countryFromAvtoProDetail: records.filter((record) => record.hasAvtoProDetailCountry).length,
      missingCountry: missingCountry.length,
      missingCategory: missingCategory.length,
      lowConfidence: lowConfidence.length,
      missingCoverage: missingCoverage.length
    },
    missingCoverage,
    missingCountry,
    missingCategory,
    lowConfidence,
    conflicts: [],
    records
  };
}

function buildGeneratedSummaryIndex(entries) {
  const index = new Map();

  for (const entry of entries) {
    const summary = {
      displayName: entry.displayName,
      aliases: entry.aliases ?? [],
      category: entry.category,
      country: entry.country,
      source: "avtoPro",
      confidence: entry.verification?.confidence ?? "low",
      countrySources: entry.verification?.countrySources ?? [],
      categorySources: entry.verification?.categorySources ?? []
    };

    for (const key of brandKeys(entry.displayName, entry.aliases)) {
      index.set(key, summary);
    }
  }

  return index;
}

function isLikelyMakerName(value) {
  const name = cleanupText(value);
  if (!name || name.length < 2 || name.length > 64) {
    return false;
  }

  if (/^\d+$/u.test(name) || /https?:|www\.|@|грн|\{|\}|\[|\]|©/iu.test(name)) {
    return false;
  }

  if (/виробник|виробники|автозапчаст|каталог|пошук|загрузка|cookies|увійти|реєстрац|кошик|головна|запчастини|мова|країна/iu.test(name)) {
    return false;
  }

  return /^[\p{L}\p{N}][\p{L}\p{N}\s./&+()'\-–]+$/u.test(name);
}

async function main() {
  const makerResult = await loadAvtoProMakerNames();
  const makerNames = dedupeNames(makerResult.names);
  const detailByKey = await loadAvtoProMakerDetails(makerNames, makerResult.live || REFRESH_DETAILS);
  const entries = makerNames.map((displayName) => buildEntry(displayName, detailByKey.get(normalizeBrandKey(displayName))));
  const missingMakerNames = findMissingMakerNames(makerNames, entries);

  const catalog = {
    source: "avto.pro",
    sourceUrl: AVTO_PRO_MAKERS_URL,
    generatedAt: GENERATED_AT,
    totalSourceNames: makerNames.length,
    sourceNames: makerNames,
    entries
  };
  const audit = buildBrandAuditReport(makerNames, entries);

  await writeFile(generatedCatalogPath, `${JSON.stringify(catalog, null, 2)}\n`, "utf8");
  await writeFile(generatedAuditPath, `${JSON.stringify(audit, null, 2)}\n`, "utf8");
  console.log(`Generated ${entries.length} Avto.pro brand entries from ${makerNames.length} source names.`);
  console.log(
    `Audit: ${audit.totals.missingCountry} without country, ${audit.totals.missingCategory} without category, ${audit.totals.lowConfidence} low confidence.`
  );
  if (missingMakerNames.length > 0) {
    console.warn(`Missing Avto.pro maker coverage: ${missingMakerNames.join(", ")}`);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
