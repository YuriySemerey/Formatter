import {
  formatBrandMetadata,
  matchBrandAtTextBoundary,
  resolveUserBrandAlias,
  type BrandOverride
} from "./brandRegistry";
import type { BrandMetadataDisplayOptions } from "./types";

const CANONICAL_MOTOR_OIL_VISCOSITIES = [
  "0W-8",
  "0W-10",
  "0W-12",
  "0W-16",
  "0W-20",
  "20",
  "0W-30",
  "30",
  "0W-40",
  "5W-16",
  "5W-20",
  "5W-30",
  "5W-40",
  "5W-50",
  "5W-60",
  "10W-30",
  "10W-40",
  "10W-50",
  "10W-60",
  "15W-40",
  "15W-50",
  "20W-20",
  "20W-50",
  "20W-60"
] as const;

const MOTOR_OIL_VISCOSITY_ORDER = new Map<string, number>(
  CANONICAL_MOTOR_OIL_VISCOSITIES.map((viscosity, index) => [viscosity, index])
);
const MULTIGRADE_VISCOSITY_PATTERN = /\b(?:SAE\s*)?(\d{1,2})\s*W\s*[-–—]?\s*(\d{1,2})\b/iu;
const SAE_MONOGRADE_VISCOSITY_PATTERN = /\bSAE\s*(20|30)\b/iu;
const CONTEXTUAL_MONOGRADE_VISCOSITY_PATTERN = /\b(20|30)\b(?=\s+(?:синтетична|напівсинтетична|мінеральна)\b)/iu;

interface MotorOilViscosity {
  label: string;
  winterGrade?: number;
  hotGrade: number;
}

interface ParsedProduct {
  title: string;
  brand: string;
  price: number;
  totalPrice?: number;
  quantity?: number;
  categoryKey: string;
  heading: string;
  lineName: string;
  volumeLiters?: number;
  viscosity?: MotorOilViscosity;
  sourceOrder: number;
}

interface CategoryInfo {
  key: string;
  heading: string;
  viscosity?: MotorOilViscosity;
}

interface PriceMatch {
  value: number;
  start: number;
  end: number;
}

const PRICE_PATTERN = /(\d{1,3}(?:\s\d{3})*|\d+)\s*грн?/giu;

export function formatProductPriceList(input: string, brandOverrides: BrandOverride[] = [], options: BrandMetadataDisplayOptions = {}): string {
  const products = parseProductStream(input, brandOverrides);
  if (products.length === 0) {
    return "";
  }

  const groups = new Map<string, ParsedProduct[]>();
  const groupOrder = new Map<string, number>();

  for (const product of products) {
    const existing = groups.get(product.categoryKey) ?? [];
    existing.push(product);
    groups.set(product.categoryKey, existing);

    if (!groupOrder.has(product.categoryKey)) {
      groupOrder.set(product.categoryKey, product.sourceOrder);
    }
  }

  const firstMotorOilOrder = products.find((product) => isMotorOil(product))?.sourceOrder;

  return [...groups.entries()]
    .sort((a, b) => compareProductGroups(a, b, groupOrder, firstMotorOilOrder))
    .map(([_key, group]) => formatGroup(group, brandOverrides, options))
    .filter(Boolean)
    .join("\n\n");
}

export function parseProductStream(input: string, brandOverrides: BrandOverride[] = []): ParsedProduct[] {
  const normalized = input.replace(/\r\n?/g, "\n").replace(/\s+/g, " ").trim();
  if (!normalized) {
    return [];
  }

  const prices = findPrices(normalized);
  const products: ParsedProduct[] = [];
  let cursor = 0;
  let previousCategory: CategoryInfo | undefined;

  for (let index = 0; index < prices.length; index += 1) {
    const firstPrice = prices[index];
    const segment = normalized.slice(cursor, firstPrice.start).trim();
    if (!segment) {
      cursor = firstPrice.end;
      continue;
    }

    const priceRun = [firstPrice];
    let runIndex = index + 1;
    while (prices[runIndex] && normalized.slice(priceRun[priceRun.length - 1].end, prices[runIndex].start).trim() === "") {
      priceRun.push(prices[runIndex]);
      runIndex += 1;
    }

    const split = splitRepeatedProductSegment(segment, brandOverrides);
    const product = buildProduct(
      split.title,
      split.brand,
      firstPrice.value,
      selectTotalPrice(firstPrice.value, priceRun.slice(1).map((match) => match.value)),
      products.length,
      previousCategory
    );
    if (product) {
      products.push(product);
      previousCategory = {
        key: product.categoryKey,
        heading: product.heading,
        viscosity: product.viscosity
      };
    }

    index = runIndex - 1;
    cursor = priceRun[priceRun.length - 1].end;
  }

  return dedupeProducts(applyForwardCategoryFallback(products));
}

function findPrices(input: string): PriceMatch[] {
  return [...input.matchAll(PRICE_PATTERN)].map((match) => ({
    value: Number(match[1].replace(/\s/g, "")),
    start: match.index ?? 0,
    end: (match.index ?? 0) + match[0].length
  }));
}

function selectTotalPrice(unitPrice: number, candidates: number[]) {
  return candidates.find((candidate) => candidate > unitPrice && candidate % unitPrice === 0) ?? candidates.find((candidate) => candidate > unitPrice);
}

function splitRepeatedProductSegment(segment: string, brandOverrides: BrandOverride[]) {
  const tokens = tokenize(segment);
  const maxRepeatedLength = Math.floor(tokens.length / 2);

  for (let length = maxRepeatedLength; length >= 1; length -= 1) {
    const start = tokens.slice(0, length);
    const end = tokens.slice(tokens.length - length);
    if (sameTokens(start, end)) {
      const brandTokens = tokens.slice(length, tokens.length - length);
      if (brandTokens.length > 0) {
        return {
          title: start.join(" "),
          brand: normalizeBrand(brandTokens.join(" "))
        };
      }
    }
  }

  const codeTitle = segment.match(/^(\([^)]{3,}\))\s+(.+?)\s+\1$/u);
  if (codeTitle) {
    return {
      title: codeTitle[1],
      brand: normalizeBrand(codeTitle[2])
    };
  }

  return splitWithoutRepeatedTitle(segment, brandOverrides);
}

function splitWithoutRepeatedTitle(segment: string, brandOverrides: BrandOverride[]) {
  const leadingBrandSplit = splitLeadingBrand(segment, brandOverrides);
  if (leadingBrandSplit) {
    return leadingBrandSplit;
  }

  const leadingBrandOnlyTitle = splitLeadingBrandOnlyTitle(segment);
  if (leadingBrandOnlyTitle) {
    return leadingBrandOnlyTitle;
  }

  const knownBrandSplit = matchBrandAtTextBoundary(segment, brandOverrides);
  if (knownBrandSplit?.productText) {
    return {
      title: knownBrandSplit.productText,
      brand: normalizeBrand(knownBrandSplit.brand)
    };
  }

  const tokens = tokenize(segment);
  if (tokens.length <= 1) {
    return { title: segment, brand: "Невідомий бренд" };
  }

  const possibleBrandLength = Math.min(3, Math.max(1, Math.floor(tokens.length / 3)));
  const brandTokens = tokens.slice(-possibleBrandLength);
  const titleTokens = tokens.slice(0, tokens.length - possibleBrandLength);

  return {
    title: titleTokens.join(" "),
    brand: normalizeBrand(brandTokens.join(" "))
  };
}

function splitLeadingBrandOnlyTitle(segment: string) {
  const match = cleanupSpaces(segment).match(/^(.+?)\s+([a-zа-яіїєґ0-9./-]+)\s+(\([^)]{3,}\))$/iu);
  if (!match) {
    return undefined;
  }

  const brand = normalizeBrand(match[1]);
  const titleWithoutCode = match[2];
  const normalizedBrand = normalizeComparableName(brand);
  const normalizedTitle = normalizeComparableName(titleWithoutCode);
  if (!normalizedBrand || !normalizedTitle || !normalizedBrand.includes(normalizedTitle)) {
    return undefined;
  }

  return {
    title: cleanupSpaces(`${titleWithoutCode} ${match[3]}`),
    brand
  };
}

function splitLeadingBrand(segment: string, brandOverrides: BrandOverride[]) {
  const markers = [
    "Моторна олива",
    "Трансмісійна олива",
    "Гальмівна рідина",
    "Гальмівний диск",
    "Гальмівні колодки",
    "Колодки гальмівні",
    "Стійка амортизатора",
    "Амортизатор",
    "Підшипник ступиці",
    "Шарова опора",
    "Оливний фільтр",
    "Фільтр масляний",
    "Масляний фільтр",
    "Повітряний фільтр",
    "Фільтр повітряний",
    "Фільтр салону",
    "Паливний фільтр",
    "Фільтр паливний",
    "Радіатор охолодження",
    "Радіатор кондиціонера",
    "Концентрат антифризу",
    "Готовий антифриз",
    "Антифриз",
    "Акумулятор",
    "Датчик детонації",
    "Датчик рівня палива",
    "Елемент фільтруючий",
    "Напрямна гільза",
    "Подушка двигуна",
    "Подушка двигателя",
    "Насос ГПК",
    "Насос гідропідсилювача",
    "НАСОС ГИДРОУСИЛИТЕЛЯ",
    "Піввісь",
    "Трос куліси",
    "Трос ручного гальма",
    "Трос стоянкового гальма",
    "Натяжний ролик",
    "Натяжитель",
    "Кермова тяга",
    "Сайлентблок",
    "Мастило",
    "Кришка радіатора",
    "Газовий упор",
    "Вентилятор салону",
    "Вентилятор салона",
    "Ступиця колеса",
    "Маточина",
    "Перетворювач тиску",
    "Клапан регулювання тиску наддуву",
    "Поліклиновий ремінь",
    "Комплект ременя ГРМ",
    "Комплект",
    "Опора амортизатора",
    "Відбійник амортизатора",
    "Пильник амортизатора",
    "Помпа",
    "Насос водяний",
    "Насос ОЖ"
  ];

  for (const marker of markers) {
    const match = segment.match(new RegExp(`^(.+?)\\s+(${escapeRegExp(marker)}(?=\\s|\\(|$).*)$`, "iu"));
    if (match && !looksLikeProductName(match[1])) {
      return {
        title: cleanupSpaces(match[2]),
        brand: normalizeBrand(resolveUserBrandAlias(match[1], brandOverrides) ?? match[1])
      };
    }
  }

  return undefined;
}

function buildProduct(
  rawTitle: string,
  rawBrand: string,
  price: number,
  secondPrice: number | undefined,
  sourceOrder: number,
  previousCategory?: CategoryInfo
): ParsedProduct | undefined {
  const title = cleanupTitle(rawTitle);
  const brand = normalizeBrand(rawBrand);
  if (!title || !brand || price <= 0) {
    return undefined;
  }

  const totalPrice = secondPrice && secondPrice > price ? secondPrice : undefined;
  const quantity = totalPrice && totalPrice % price === 0 ? totalPrice / price : undefined;
  const category = inferCategory(title, brand, previousCategory);
  const volumeLiters = inferVolumeLiters(title);

  return {
    title,
    brand,
    price,
    totalPrice,
    quantity,
    categoryKey: category.key,
    heading: category.heading,
    lineName: inferLineName(title, category.key),
    volumeLiters,
    viscosity: category.viscosity,
    sourceOrder
  };
}

function dedupeProducts(products: ParsedProduct[]) {
  const seen = new Set<string>();
  return products.filter((product) => {
    const key = [
      product.categoryKey,
      product.brand.toLocaleLowerCase("uk"),
      product.lineName.toLocaleLowerCase("uk"),
      product.price,
      product.totalPrice ?? ""
    ].join("|");

    if (seen.has(key)) {
      return false;
    }

    seen.add(key);
    return true;
  });
}

function applyForwardCategoryFallback(products: ParsedProduct[]) {
  return products.map((product, index) => {
    if (product.categoryKey !== "misc" || !isBareCodeTitle(product.title)) {
      return product;
    }

    const nextKnown = products.slice(index + 1).find((candidate) => candidate.categoryKey !== "misc");
    if (!nextKnown) {
      return product;
    }

    return {
      ...product,
      categoryKey: nextKnown.categoryKey,
      heading: nextKnown.heading,
      lineName: inferLineName(product.title, nextKnown.categoryKey),
      viscosity: nextKnown.viscosity
    };
  });
}

function compareProductGroups(
  a: [string, ParsedProduct[]],
  b: [string, ParsedProduct[]],
  groupOrder: Map<string, number>,
  firstMotorOilOrder: number | undefined
) {
  const aProduct = a[1][0];
  const bProduct = b[1][0];
  const aIsMotorOil = Boolean(aProduct && isMotorOil(aProduct));
  const bIsMotorOil = Boolean(bProduct && isMotorOil(bProduct));
  const aOrder = aIsMotorOil && firstMotorOilOrder !== undefined ? firstMotorOilOrder : groupOrder.get(a[0])!;
  const bOrder = bIsMotorOil && firstMotorOilOrder !== undefined ? firstMotorOilOrder : groupOrder.get(b[0])!;

  if (aOrder !== bOrder) {
    return aOrder - bOrder;
  }

  if (aIsMotorOil && bIsMotorOil) {
    return compareMotorOilViscosities(aProduct.viscosity, bProduct.viscosity);
  }

  return groupOrder.get(a[0])! - groupOrder.get(b[0])!;
}

function compareMotorOilViscosities(a: MotorOilViscosity | undefined, b: MotorOilViscosity | undefined) {
  if (!a && !b) {
    return 0;
  }

  if (!a) {
    return 1;
  }

  if (!b) {
    return -1;
  }

  const aCanonicalOrder = MOTOR_OIL_VISCOSITY_ORDER.get(a.label);
  const bCanonicalOrder = MOTOR_OIL_VISCOSITY_ORDER.get(b.label);
  if (aCanonicalOrder !== undefined && bCanonicalOrder !== undefined) {
    return aCanonicalOrder - bCanonicalOrder;
  }

  if (aCanonicalOrder !== undefined) {
    return -1;
  }

  if (bCanonicalOrder !== undefined) {
    return 1;
  }

  return (a.winterGrade ?? Number.MAX_SAFE_INTEGER) - (b.winterGrade ?? Number.MAX_SAFE_INTEGER) || a.hotGrade - b.hotGrade;
}

function formatGroup(products: ParsedProduct[], brandOverrides: BrandOverride[], options: BrandMetadataDisplayOptions) {
  const firstProduct = products[0];
  const heading =
    firstProduct && products.length === 1 && firstProduct.categoryKey.startsWith("dynamic:")
      ? fullDynamicHeading(firstProduct.title)
      : firstProduct?.heading;
  if (!heading) {
    return "";
  }

  const lines = [...products]
    .sort((a, b) => b.price - a.price || a.sourceOrder - b.sourceOrder)
    .map((product) => formatProductLine(product, brandOverrides, options));

  return [heading, ...lines].join("\n");
}

function formatProductLine(product: ParsedProduct, brandOverrides: BrandOverride[], options: BrandMetadataDisplayOptions) {
  const label =
    isMotorOil(product) || product.categoryKey === "transmission-oil" || product.categoryKey === "battery"
      ? cleanupSpaces(`${product.brand} ${product.lineName}`.trim())
      : product.brand;

  if (product.totalPrice && product.quantity && product.quantity > 1 && isLiterProduct(product) && product.volumeLiters) {
    return withBrandMetadata(product, `${label} — ${formatPrice(product.price)} / ${formatPrice(product.totalPrice)} за ${formatNumber(
      product.quantity * product.volumeLiters
    )} л`, brandOverrides, options);
  }

  if (product.totalPrice && product.quantity && product.quantity > 1) {
    return withBrandMetadata(product, `${label} — ${formatPrice(product.price)} / ${formatPrice(product.totalPrice)} за ${product.quantity} шт`, brandOverrides, options);
  }

  if (isLiterProduct(product) && product.volumeLiters) {
    return withBrandMetadata(product, `${label} — ${formatPrice(product.price)} за ${formatNumber(product.volumeLiters)} л`, brandOverrides, options);
  }

  return withBrandMetadata(product, `${label} — ${formatPrice(product.price)}`, brandOverrides, options);
}

function withBrandMetadata(product: ParsedProduct, line: string, brandOverrides: BrandOverride[], options: BrandMetadataDisplayOptions) {
  const metadata = formatBrandMetadata(product.brand, brandOverrides, options);
  return metadata ? `${line} - ${metadata}` : line;
}

function isLiterProduct(product: ParsedProduct) {
  return (
    isMotorOil(product) ||
    product.categoryKey === "transmission-oil" ||
    product.categoryKey === "antifreeze-concentrate" ||
    product.categoryKey === "antifreeze-ready"
  );
}

function isMotorOil(product: ParsedProduct) {
  return product.categoryKey.startsWith("motor-oil:");
}

function inferCategory(title: string, brand = "", previousCategory?: CategoryInfo): CategoryInfo {
  const normalized = title.toLocaleLowerCase("uk");

  if (isBareCodeTitle(title)) {
    if (previousCategory?.key === "air-filter" && /nissan|infiniti/iu.test(brand)) {
      return {
        key: "cabin-filter",
        heading: "Фільтр салону"
      };
    }

    if (previousCategory) {
      return previousCategory;
    }

    return {
      key: "misc",
      heading: "Інше"
    };
  }

  if (isBrandOnlyTitle(title, brand)) {
    return previousCategory && previousCategory.key !== "misc"
      ? previousCategory
      : {
          key: "misc",
          heading: "Інше"
        };
  }

  if (normalized.includes("моторна олива")) {
    const viscosity = inferMotorOilViscosity(title);
    return {
      key: `motor-oil:${viscosity?.label.toLocaleLowerCase("uk") ?? "unknown"}`,
      heading: viscosity ? `Моторна олива ${viscosity.label}` : "Моторна олива, в’язкість не визначена",
      viscosity
    };
  }

  if (normalized.includes("трансмісійна олива")) {
    return {
      key: "transmission-oil",
      heading: "Трансмісійна олива"
    };
  }

  if (normalized.includes("гальмівна рідина")) {
    return {
      key: `brake-fluid:${brakeFluidHeading(title).toLocaleLowerCase("uk")}`,
      heading: brakeFluidHeading(title)
    };
  }

  if (normalized.includes("акумулятор")) {
    return {
      key: "battery",
      heading: "Акумулятор"
    };
  }

  if (normalized.includes("комплект ланцюга грм")) {
    return {
      key: "timing-chain-kit",
      heading: "Комплект ланцюга ГРМ"
    };
  }

  if (
    normalized.includes("оливний фільтр") ||
    normalized.includes("фільтр масляний") ||
    normalized.includes("масляний фільтр")
  ) {
    return {
      key: "oil-filter",
      heading: "Оливний фільтр"
    };
  }

  if (normalized.includes("паливний фільтр") || normalized.includes("фільтр паливний")) {
    return {
      key: "fuel-filter",
      heading: "Паливний фільтр"
    };
  }

  if (normalized.includes("повітряний фільтр") || normalized.includes("фільтр повітряний")) {
    return {
      key: "air-filter",
      heading: "Повітряний фільтр"
    };
  }

  if (
    normalized.includes("фільтр салону") ||
    normalized.includes("фільтра салону") ||
    normalized.includes("салонний фільтр") ||
    (normalized.includes("салону") && normalized.includes("фільтру"))
  ) {
    return {
      key: "cabin-filter",
      heading: "Фільтр салону"
    };
  }

  if (
    normalized.includes("концентрат антифризу") ||
    normalized.includes("concentrated antifreeze") ||
    normalized.includes("antifreeze/coolant")
  ) {
    return {
      key: "antifreeze-concentrate",
      heading: "Антифриз концентрат"
    };
  }

  if (normalized.includes("готовий антифриз") || normalized.includes("готовий до використання")) {
    return {
      key: "antifreeze-ready",
      heading: "Антифриз готовий до використання"
    };
  }

  if (normalized.includes("комплект ременя грм") && (normalized.includes("помпа") || normalized.includes("насос"))) {
    return {
      key: "timing-belt-water-pump-kit",
      heading: "Комплект ременя ГРМ + Насос ОЖ"
    };
  }

  if (normalized.includes("ущільнювальне кільце зливної пробки")) {
    return {
      key: "drain-plug-ring",
      heading: "Ущільнювальне кільце зливної пробки"
    };
  }

  if (
    normalized.includes("радіатор охолодження") ||
    normalized.includes("радіатор системи охолодження") ||
    /^vag\b/iu.test(normalized)
  ) {
    return {
      key: "cooling-radiator",
      heading: "Радіатор охолодження двигуна"
    };
  }

  if (normalized.includes("радіатор кондиціонера")) {
    return {
      key: "ac-radiator",
      heading: "Радіатор кондиціонера"
    };
  }

  if (
    normalized.includes("підшипник ступиці") ||
    normalized.startsWith("підшипникперед") ||
    normalized.startsWith("підшипник перед")
  ) {
    return {
      key: "wheel-hub-bearing",
      heading: "Підшипник ступиці колеса"
    };
  }

  if (normalized.includes("ступиця колеса") || normalized.includes("маточина")) {
    return {
      key: "wheel-hub",
      heading: "Маточина колеса"
    };
  }

  if (normalized.includes("перетворювач тиску системи рециркуляції")) {
    return {
      key: "egr-pressure-converter",
      heading: "Перетворювач тиску системи рециркуляції вихлопних газів"
    };
  }

  if (normalized.includes("клапан регулювання тиску наддуву")) {
    return {
      key: "boost-pressure-control-valve",
      heading: "Клапан регулювання тиску наддуву"
    };
  }

  if (normalized.includes("датчик детонації")) {
    return {
      key: "knock-sensor",
      heading: "Датчик детонації"
    };
  }

  if (normalized.includes("датчик рівня палива")) {
    return {
      key: "fuel-level-sensor",
      heading: "Датчик рівня палива"
    };
  }

  if (normalized.includes("трос куліси")) {
    return {
      key: "gear-shift-cable",
      heading: "Трос куліси"
    };
  }

  if (normalized.includes("трос ручного гальма") || normalized.includes("трос стоянкового гальма")) {
    return {
      key: "handbrake-cable",
      heading: "Трос ручного гальма"
    };
  }

  if (normalized.includes("піввісь")) {
    return {
      key: "drive-shaft",
      heading: "Піввісь"
    };
  }

  if (normalized.includes("кермова тяга")) {
    return {
      key: "tie-rod",
      heading: "Кермова тяга"
    };
  }

  if (normalized.includes("сайлентблок важеля")) {
    return {
      key: "control-arm-bushing",
      heading: "Сайлентблок важеля"
    };
  }

  if (
    normalized.includes("натяжний ролик поліклинового ременя") ||
    normalized.includes("натяжитель поликлинового ремня")
  ) {
    return {
      key: "serpentine-belt-tensioner-pulley",
      heading: "Натяжний ролик поліклинового ременя"
    };
  }

  if (normalized.includes("поліклиновий ремінь")) {
    return {
      key: "serpentine-belt",
      heading: "Поліклиновий ремінь"
    };
  }

  if (normalized.includes("шарова опора")) {
    return {
      key: "ball-joint",
      heading: "Шарова опора"
    };
  }

  if (normalized.includes("гальмівні колодки") || normalized.includes("колодки гальмівні")) {
    return {
      key: "brake-pads",
      heading: "Гальмівні колодки, комплект з 4 шт"
    };
  }

  if (normalized.includes("гальмівний диск") || normalized.includes("диск гальмівний")) {
    return {
      key: "brake-disc",
      heading: "Гальмівний диск"
    };
  }

  if (
    normalized.includes("стійка амортизатора") ||
    normalized.includes("стiйка амортизатора") ||
    normalized.startsWith("амортизатор ")
  ) {
    return {
      key: "shock-strut",
      heading: "Стійка амортизатора"
    };
  }

  if (normalized.includes("комплект") && normalized.includes("пильники") && normalized.includes("відбійники")) {
    return {
      key: "dust-boot-bump-stop-kit",
      heading: "Комплект (пильники + відбійники)"
    };
  }

  if (normalized.includes("комплект") && normalized.includes("опора") && normalized.includes("підшипник")) {
    return {
      key: "strut-mount-bearing-kit",
      heading: "Комплект (опора + підшипник)"
    };
  }

  if (normalized.includes("опора амортизатора")) {
    return {
      key: "strut-mount",
      heading: "Опора амортизатора"
    };
  }

  if (normalized.includes("відбійник амортизатора")) {
    return {
      key: "shock-bump-stop",
      heading: "Відбійник амортизатора"
    };
  }

  if (normalized.includes("пильник амортизатора")) {
    return {
      key: "shock-dust-boot",
      heading: "Пильник амортизатора"
    };
  }

  if (normalized.includes("подушка двигуна") || normalized.includes("подушка двигателя")) {
    return {
      key: "engine-mount",
      heading: "Подушка двигуна"
    };
  }

  if (
    normalized.includes("насос гпк") ||
    normalized.includes("насос гидроусилителя") ||
    normalized.includes("насос гідропідсилювача")
  ) {
    return {
      key: "power-steering-pump",
      heading: "Насос ГПК"
    };
  }

  if (normalized.includes("помпа") || normalized.includes("насос ож") || normalized.includes("насос водяний")) {
    return {
      key: "coolant-pump",
      heading: "Насос ОЖ"
    };
  }

  if (normalized.includes("кришка радіатора")) {
    return {
      key: "radiator-cap",
      heading: "Кришка радіатора"
    };
  }

  if (normalized.includes("газовий упор багажника")) {
    return {
      key: "trunk-gas-strut",
      heading: "Газовий упор багажника"
    };
  }

  if (normalized.includes("напрямна гільза") && normalized.includes("супорта")) {
    return {
      key: "brake-caliper-guide",
      heading: "Напрямна гільза супорта"
    };
  }

  if (normalized.includes("вентилятор салону") || normalized.includes("вентилятор салона")) {
    return {
      key: "cabin-fan",
      heading: "Вентилятор салону"
    };
  }

  if (normalized.includes("мастило")) {
    return {
      key: "grease",
      heading: "Мастило"
    };
  }

  return {
    key: `dynamic:${baseHeading(title).toLocaleLowerCase("uk")}`,
    heading: baseHeading(title)
  };
}

function inferMotorOilViscosity(title: string): MotorOilViscosity | undefined {
  const multigrade = title.match(MULTIGRADE_VISCOSITY_PATTERN);
  if (multigrade) {
    const winterGrade = Number(multigrade[1]);
    const hotGrade = Number(multigrade[2]);
    return {
      label: `${winterGrade}W-${hotGrade}`,
      winterGrade,
      hotGrade
    };
  }

  const monograde = title.match(SAE_MONOGRADE_VISCOSITY_PATTERN) ?? title.match(CONTEXTUAL_MONOGRADE_VISCOSITY_PATTERN);
  if (!monograde) {
    return undefined;
  }

  const hotGrade = Number(monograde[1]);
  return {
    label: String(hotGrade),
    hotGrade
  };
}

function stripMotorOilViscosity(title: string) {
  const withoutMultigrade = title.replace(MULTIGRADE_VISCOSITY_PATTERN, " ");
  if (withoutMultigrade !== title) {
    return withoutMultigrade;
  }

  const withoutSaeMonograde = title.replace(SAE_MONOGRADE_VISCOSITY_PATTERN, " ");
  return withoutSaeMonograde !== title
    ? withoutSaeMonograde
    : title.replace(CONTEXTUAL_MONOGRADE_VISCOSITY_PATTERN, " ");
}

function brakeFluidHeading(title: string) {
  const normalized = title.toLocaleLowerCase("uk");
  const dotMatch = title.match(/\bdot\s*\d+(?:[.,]\d+)?\b/iu)?.[0]?.replace(/\s+/g, " ");
  const prefix = normalized.includes("lv") ? "Гальмівна рідина LV" : "Гальмівна рідина";
  return cleanupSpaces([prefix, dotMatch?.toLocaleUpperCase("uk")].filter(Boolean).join(" "));
}

function transmissionOilHeading(title: string) {
  return cleanupSpaces(
    title
      .replace(/(?:^|\s)(?:синтетична|напівсинтетична|мінеральна)(?=\s|$)/giu, " ")
      .replace(/(?:^|\s)\d+(?:[.,]\d+)?\s*л(?=\s|$)/giu, " ")
      .replace(/\([^)]*\)/gu, " ")
  );
}

function inferLineName(title: string, categoryKey: string) {
  if (categoryKey === "transmission-oil") {
    return cleanupSpaces(
      title
        .replace(/трансмісійна олива/giu, " ")
        .replace(/(?:^|\s)(?:синтетична|напівсинтетична|мінеральна)(?=\s|$)/giu, " ")
        .replace(/(?:^|\s)\d+(?:[.,]\d+)?\s*л(?=\s|$)/giu, " ")
        .replace(/\([^)]*\)/gu, " ")
    );
  }

  if (categoryKey === "battery") {
    return batteryLineName(title);
  }

  if (!categoryKey.startsWith("motor-oil:")) {
    return "";
  }

  return cleanupSpaces(
    stripMotorOilViscosity(title)
      .replace(/моторна олива/giu, " ")
      .replace(/(?:^|\s)(?:синтетична|напівсинтетична|мінеральна)(?=\s|$)/giu, " ")
      .replace(/(?:^|\s)\d+(?:[.,]\d+)?\s*л(?=\s|$)/giu, " ")
      .replace(/\([^)]*\)/gu, " ")
  );
}

function batteryLineName(title: string) {
  const withoutCategory = cleanupSpaces(title.replace(/(?:^|\s)акумулятор(?=\s|$)/giu, " ").replace(/\([^)]*\)/gu, " "));
  const tokens = tokenize(withoutCategory);
  if (tokens.length > 1 && isLikelyBatteryArticle(tokens[tokens.length - 1])) {
    tokens.pop();
  }

  return tokens.join(" ");
}

function isLikelyBatteryArticle(token: string) {
  const normalized = token.replace(/^[,;]+|[,;]+$/gu, "");
  if (!/\d/u.test(normalized) || normalized.length < 5) {
    return false;
  }

  if (/^(?:6|12|24)V?$/iu.test(normalized) || /^(?:AGM|EFB|GEL|START|STOP)$/iu.test(normalized)) {
    return false;
  }

  if (/^(?:CT|СТ)-?\d{2,3}-?[LR]?$/iu.test(normalized) || /^\d{1,3}(?:AH|АЧ|А·ГОД)$/iu.test(normalized)) {
    return false;
  }

  return /^[A-ZА-ЯІЇЄҐ0-9._/-]+$/iu.test(normalized);
}

function inferVolumeLiters(title: string) {
  const match = title.match(/(?:^|\s)(\d+(?:[.,]\d+)?)\s*л(?=\s|$)/iu);
  return match ? Number(match[1].replace(",", ".")) : undefined;
}

function isBareCodeTitle(title: string) {
  return /^\([^)]{3,}\)$/u.test(title.trim());
}

function isBrandOnlyTitle(title: string, brand: string) {
  const normalizedTitle = normalizeComparableName(title.replace(/\([^)]*\)/g, " "));
  const normalizedBrand = normalizeComparableName(brand);
  if (!normalizedTitle || !normalizedBrand || normalizedTitle === "vag" || looksLikeProductName(title)) {
    return false;
  }

  return normalizedTitle === normalizedBrand || normalizedTitle.includes(normalizedBrand) || normalizedBrand.includes(normalizedTitle);
}

function normalizeComparableName(value: string) {
  return value
    .toLocaleLowerCase("uk")
    .replace(/[^a-zа-яіїєґ0-9]+/giu, "")
    .trim();
}

function baseHeading(title: string) {
  const withoutCode = title.replace(/\([^)]*\)/g, " ").replace(/\bпомпа\b/giu, "Насос ОЖ");
  const words = cleanupSpaces(withoutCode).split(" ").filter(Boolean).slice(0, 4);
  return words.length > 0 ? words.join(" ") : "Інше";
}

function fullDynamicHeading(title: string) {
  const withoutArticle = title
    .replace(/\s+\((?=[^)]*\d)[a-zа-яіїєґ0-9 ._/-]{3,}\)\s*$/iu, " ")
    .replace(/\bпомпа\b/giu, "Насос ОЖ");
  return cleanupSpaces(withoutArticle) || "Інше";
}

function looksLikeProductName(value: string) {
  const normalized = value.toLocaleLowerCase("uk");
  return (
    normalized.includes("акумулятор") ||
    normalized.includes("олива") ||
    normalized.includes("рідина") ||
    normalized.includes("фільтр") ||
    normalized.includes("фільтру") ||
    normalized.includes("антифриз") ||
    normalized.includes("диск") ||
    normalized.includes("колод") ||
    normalized.includes("амортизатор") ||
    normalized.includes("підшипник") ||
    normalized.includes("ступиц") ||
    normalized.includes("маточин") ||
    normalized.includes("опора") ||
    normalized.includes("комплект") ||
    normalized.includes("ремінь") ||
    normalized.includes("датчик") ||
    normalized.includes("трос") ||
    normalized.includes("піввісь") ||
    normalized.includes("кермова тяга") ||
    normalized.includes("сайлентблок") ||
    normalized.includes("ролик") ||
    normalized.includes("натяжитель") ||
    normalized.includes("мастило") ||
    normalized.includes("кришка радіатора") ||
    normalized.includes("газовий упор") ||
    normalized.includes("напрямна гільза") ||
    normalized.includes("вентилятор салон") ||
    normalized.includes("подушка двиг") ||
    normalized.includes("перетворювач") ||
    normalized.includes("клапан") ||
    normalized.includes("радіатор") ||
    normalized.includes("помпа") ||
    normalized.includes("насос") ||
    normalized.includes("насос ож")
  );
}

function cleanupTitle(value: string) {
  return cleanupSpaces(value.replace(/\s+TANGUN$/iu, ""));
}

function normalizeBrand(value: string) {
  let cleaned = cleanupSpaces(value.replace(/\s+TANGUN$/iu, ""));
  const duplicatedCatalogBrand = cleaned.match(/^(.+?)\s+\([^)]{3,}\)\s+(.+)$/u);
  if (
    duplicatedCatalogBrand &&
    (duplicatedCatalogBrand[2].toLocaleLowerCase("uk").startsWith(duplicatedCatalogBrand[1].toLocaleLowerCase("uk")) ||
      duplicatedCatalogBrand[2].includes("/"))
  ) {
    cleaned = cleanupSpaces(duplicatedCatalogBrand[2]);
  }

  if (/^vag$/iu.test(cleaned)) {
    return "VAG";
  }

  if (/^tangun$/iu.test(cleaned)) {
    return "TanGun";
  }

  if (/^and$/iu.test(cleaned)) {
    return "AND";
  }

  return cleaned;
}

function formatPrice(value: number) {
  return `${formatNumber(value)} грн`;
}

function formatNumber(value: number) {
  return new Intl.NumberFormat("uk-UA", {
    maximumFractionDigits: 2
  })
    .format(value)
    .replace(/\u00a0/g, " ");
}

function tokenize(value: string) {
  return cleanupSpaces(value).split(" ").filter(Boolean);
}

function sameTokens(a: string[], b: string[]) {
  return a.length === b.length && a.every((token, index) => token.toLocaleLowerCase("uk") === b[index].toLocaleLowerCase("uk"));
}

function cleanupSpaces(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
