import { describe, expect, it } from "vitest";
import { formatBrandMetadata, resolveBrandInfo } from "./brandRegistry";
import { formatProductPriceList } from "./productPriceList";

const sampleInput = `Моторна олива Emperol 5W-40 синтетична 5 л Kroon Oil Моторна олива Emperol 5W-40 синтетична 5 л 1 592 грн 1 592 грн Моторна олива Super 3000 X1 5W-40 синтетична 5 л Mobil Моторна олива Super 3000 X1 5W-40 синтетична 5 л 1 448 грн 1 448 грн Моторна олива Quartz 9000 Energy 5W-40 синтетична 5 л Total Моторна олива Quartz 9000 Energy 5W-40 синтетична 5 л 1 421 грн 1 421 грн Моторна олива Top Tec 4100 5W-40 синтетична 5 л Liqui Moly Моторна олива Top Tec 4100 5W-40 синтетична 5 л 3 018 грн 3 018 грн Моторна олива A3/B4 5W-40 синтетична 5 л Nissan Моторна олива A3/B4 5W-40 синтетична 5 л 1 638 грн 1 638 грн Моторна олива 8100 X-Cess gen2 5W-40 синтетична 5 л Motul Моторна олива 8100 X-Cess gen2 5W-40 синтетична 5 л 2 623 грн 2 623 грн Оливний фільтр (1520900Q0F) Nissan / Infiniti Оливний фільтр (1520900Q0F) 590 грн 590 грн Оливний фільтр (HU10002Z) Mann Оливний фільтр (HU10002Z) 501 грн 501 грн Оливний фільтр (L441) Purflux Оливний фільтр (L441) 458 грн 458 грн Оливний фільтр (100487) Febi Оливний фільтр (100487) 321 грн 321 грн Оливний фільтр (F026407231) Bosch Оливний фільтр (F026407231) 308 грн 308 грн Оливний фільтр (WL7506) WIX Filters Оливний фільтр (WL7506) 254 грн 254 грн Фільтр масляний Renault Megane III-IV, Dokker, Duster, Lodgy, Logan II, Sandero II, 0.9-1.6, 12- (foe968d) Shafer Фільтр масляний Renault Megane III-IV, Dokker, Duster, Lodgy, Logan II, Sandero II, 0.9-1.6, 12- (foe968d) 205 грн 205 грн Повітряний фільтр (165464BA1B) Nissan / Infiniti Повітряний фільтр (165464BA1B) 1 220 грн 1 220 грн Повітряний фільтр (C 25 040) Mann Повітряний фільтр (C 25 040) 754 грн 754 грн Повітряний фільтр (A1713) Purflux Повітряний фільтр (A1713) 685 грн 685 грн Повітряний фільтр (f026400561) Bosch Повітряний фільтр (f026400561) 620 грн 620 грн Повітряний фільтр (E533L) Hengst Filter Повітряний фільтр (E533L) 533 грн 533 грн Повітряний фільтр (ADN12287) Blue Print Повітряний фільтр (ADN12287) 463 грн 463 грн Повітряний фільтр (WA9788) WIX Filters Повітряний фільтр (WA9788) 407 грн 407 грн Повітряний фільтр (50014729) Kolbenschmidt Повітряний фільтр (50014729) 343 грн 343 грн Повітряний фільтр (A141787) Denckermann Повітряний фільтр (A141787) 318 грн 318 грн Повітряний фільтр (sx4138) Shafer Повітряний фільтр (sx4138) 187 грн 187 грн (272774em0a) Nissan / Infiniti (272774em0a) 954 грн 954 грн Фільтр салону (CU 25 003) Mann Фільтр салону (CU 25 003) 895 грн 895 грн Фільтр салону (1987435057) Bosch Фільтр салону (1987435057) 680 грн 680 грн Фільтр салону (50014783) Kolbenschmidt Фільтр салону (50014783) 367 грн 367 грн Фільтр салону (N1341035) Nipparts Фільтр салону (N1341035) 363 грн 363 грн Фільтр салону (ADN12539) Blue Print Фільтр салону (ADN12539) 321 грн 321 грн Фільтр салону (AH482) Purflux Фільтр салону (AH482) 288 грн 288 грн Фільтр салону (wp931) Wunder Фільтр салону (wp931) 190 грн 190 грн Ущільнювальне кільце зливної пробки (1102600QAB) Nissan / Infiniti Ущільнювальне кільце зливної пробки (1102600QAB) 45 грн 45 грн Ущільнювальне кільце зливної пробки (813.052) Elring Ущільнювальне кільце зливної пробки (813.052) 12 грн 12 гр
vag (5wa121251h) VAG vag (5wa121251h) 11 397 грн 11 397 грн Радіатор охолодження двигуна (65302) Nissens Радіатор охолодження двигуна (65302) 6 485 грн 6 485 грн Радіатор охолодження двигуна (58437) NRF Радіатор охолодження двигуна (58437) 6 452 грн 6 452 грн Радіатор охолодження двигуна (r12380) SATO tech Радіатор охолодження двигуна (r12380) 4 252 грн 4 252 грн Радіатор охолодження двигуна (11211829501) Vika Радіатор охолодження двигуна (11211829501) 4 018 грн 4 018 грн Радіатор охолодження Skoda Octavia A7 (13-)/ VW Tiguan (16-) 1.8T, 2.0T (P72136) TANGUN (p72136) TanGun Радіатор охолодження Skoda Octavia A7 (13-)/ VW Tiguan (16-) 1.8T, 2.0T (P72136) TANGUN (p72136) 3 394 грн 3 394 грн Радіатор охолодження двигуна (606645) Nissens Радіатор охолодження двигуна (606645) 5 985 грн 11 970 грн Радіатор охолодження двигуна (550271) NRF Радіатор охолодження двигуна (550271) 5 321 грн 10 642 грн радіатор системи охолодження (30121491) AND радіатор системи охолодження (30121491) 4 982 грн 9 964 грн Радіатор охолодження двигуна (11211858801) Vika Радіатор охолодження двигуна (11211858801) 3 149 грн 6 298 гр`;

function formatWithoutBrandMetadata(input: string) {
  return formatProductPriceList(input).replace(
    / - (?:оригінал|якісний замінник|ціна \/ якість|бюджетний|категорія не визначена), [^\n]+/gu,
    ""
  );
}

describe("brand registry", () => {
  it("resolves Avto.pro brands without assigning categories automatically", () => {
    expect(resolveBrandInfo("Bcguma")).toMatchObject({
      displayName: "Bcguma",
      category: "unknown",
      categoryLabel: "категорія не визначена",
      country: "Україна",
      known: true
    });
  });

  it("formats override and unknown brand metadata", () => {
    expect(
      formatBrandMetadata("Brembo", [
        {
          displayName: "Brembo",
          aliases: [],
          category: "premiumReplacement",
          country: "Італія",
          isOriginal: false,
          updatedAt: "2026-07-12T10:00:00.000Z",
          source: "user"
        }
      ])
    ).toBe("якісний замінник, Італія");
    expect(formatBrandMetadata("Unknown Test Brand")).toBe("категорія не визначена, країна не визначена");
  });
});

describe("formatProductPriceList", () => {
  it("appends brand category and country to formatted lines", () => {
    const overrides = [
      {
        displayName: "Brembo",
        aliases: [],
        category: "premiumReplacement" as const,
        country: "Італія",
        isOriginal: false,
        updatedAt: "2026-07-12T10:00:00.000Z",
        source: "user" as const
      },
      {
        displayName: "VAG",
        aliases: [],
        category: "original" as const,
        country: "Німеччина",
        isOriginal: true,
        updatedAt: "2026-07-12T10:00:00.000Z",
        source: "user" as const
      }
    ];

    expect(
      formatProductPriceList("Гальмівний диск (DF4323) Brembo Гальмівний диск (DF4323) 2 306 грн 4 612 грн", overrides)
    ).toBe(`Гальмівний диск
Brembo — 2 306 грн / 4 612 грн за 2 шт - якісний замінник, Італія`);

    expect(formatProductPriceList("Оливний фільтр (5wa121251h) VAG Оливний фільтр (5wa121251h) 11 397 грн 11 397 грн", overrides))
      .toBe(`Оливний фільтр
VAG — 11 397 грн - оригінал, Німеччина`);
  });

  it("formats the provided copied product stream", () => {
    expect(formatWithoutBrandMetadata(sampleInput)).toBe(`Моторна олива 5W-40
Liqui Moly Top Tec 4100 — 3 018 грн за 5 л
Motul 8100 X-Cess gen2 — 2 623 грн за 5 л
Nissan A3/B4 — 1 638 грн за 5 л
Kroon Oil Emperol — 1 592 грн за 5 л
Mobil Super 3000 X1 — 1 448 грн за 5 л
Total Quartz 9000 Energy — 1 421 грн за 5 л

Оливний фільтр
Nissan / Infiniti — 590 грн
Mann — 501 грн
Purflux — 458 грн
Febi — 321 грн
Bosch — 308 грн
WIX Filters — 254 грн
Shafer — 205 грн

Повітряний фільтр
Nissan / Infiniti — 1 220 грн
Mann — 754 грн
Purflux — 685 грн
Bosch — 620 грн
Hengst Filter — 533 грн
Blue Print — 463 грн
WIX Filters — 407 грн
Kolbenschmidt — 343 грн
Denckermann — 318 грн
Shafer — 187 грн

Фільтр салону
Nissan / Infiniti — 954 грн
Mann — 895 грн
Bosch — 680 грн
Kolbenschmidt — 367 грн
Nipparts — 363 грн
Blue Print — 321 грн
Purflux — 288 грн
Wunder — 190 грн

Ущільнювальне кільце зливної пробки
Nissan / Infiniti — 45 грн
Elring — 12 грн

Радіатор охолодження двигуна
VAG — 11 397 грн
Nissens — 6 485 грн
NRF — 6 452 грн
Nissens — 5 985 грн / 11 970 грн за 2 шт
NRF — 5 321 грн / 10 642 грн за 2 шт
AND — 4 982 грн / 9 964 грн за 2 шт
SATO tech — 4 252 грн
Vika — 4 018 грн
TanGun — 3 394 грн
Vika — 3 149 грн / 6 298 грн за 2 шт`);
  });

  it("keeps unknown product groups dynamic", () => {
    const output = formatWithoutBrandMetadata(
      "Гальмівна рідина DOT 4 1 л Brand X Гальмівна рідина DOT 4 1 л 300 грн 300 грн"
    );

    expect(output).toBe("Гальмівна рідина DOT 4\nBrand X — 300 грн");
  });

  it("normalizes brake pads, struts, and kit variants from copied names", () => {
    const output = formatWithoutBrandMetadata(
      [
        "Гальмівні колодки Volvo Гальмівні колодки 3 524 грн 3 524 грн",
        "Колодки гальмівні диск. перед. RAISO Колодки гальмівні диск. перед. 915 грн 915 грн",
        "Стійка амортизатора (310 016) Sachs Стійка амортизатора (310 016) 4 202 грн 8 404 грн",
        "Амортизатор передній Vito 96-03 (rs310016) RAISO Амортизатор передній Vito 96-03 (rs310016) 1 969 грн 3 938 грн",
        "Комплект (пильники + відбійники) (11-14640001) Meyle Комплект (пильники + відбійники) (11-14640001) 750 грн 750 грн",
        "Комплект (опора + підшипник) (SM5499) Kayaba Комплект (опора + підшипник) (SM5499) 2 210 грн 4 420 грн",
        "Опора амортизатора переднього Vito 638 96-03 (з підш.) (rc02268) RAISO Опора амортизатора переднього Vito 638 96-03 (з підш.) (rc02268) 1 187 грн 2 374 грн"
      ].join(" ")
    );

    expect(output).toBe(`Гальмівні колодки, комплект з 4 шт
Volvo — 3 524 грн
RAISO — 915 грн

Стійка амортизатора
Sachs — 4 202 грн / 8 404 грн за 2 шт
RAISO — 1 969 грн / 3 938 грн за 2 шт

Комплект (пильники + відбійники)
Meyle — 750 грн

Комплект (опора + підшипник)
Kayaba — 2 210 грн / 4 420 грн за 2 шт

Опора амортизатора
RAISO — 1 187 грн / 2 374 грн за 2 шт`);
  });

  it("keeps code-only products in the previous category instead of forcing cabin filters", () => {
    const output = formatWithoutBrandMetadata(
      [
        "Шарова опора (TC837) Delphi Шарова опора (TC837) 592 грн 592 грн",
        "(203030) Solgy (203030) 544 грн 544 грн",
        "Підшипник ступиці колеса (VKBA 3531) SKF Підшипник ступиці колеса (VKBA 3531) 1 515 грн 1 515 грн",
        "(301045) Optimal (301045) 1 309 грн 1 309 грн"
      ].join(" ")
    );

    expect(output).toBe(`Шарова опора
Delphi — 592 грн
Solgy — 544 грн

Підшипник ступиці колеса
SKF — 1 515 грн
Optimal — 1 309 грн`);
  });

  it("normalizes reversed filter names and transmission oils", () => {
    const output = formatWithoutBrandMetadata(
      [
        "Трансмісійна олива SP Matic 4026 синтетична 1 л Kroon Oil Трансмісійна олива SP Matic 4026 синтетична 1 л 470 грн 3 760 грн",
        "Трансмісійна олива ATF VI синтетична 1 л Motul Трансмісійна олива ATF VI синтетична 1 л 686 грн 5 488 грн",
        "Трансмісійна олива ATF III-H синтетична 1 л Meyle Трансмісійна олива ATF III-H синтетична 1 л 483 грн 3 864 грн",
        "Фільтр повітряний Jaguar X-Type 2.1/2.5/3.0 (01-09) Shafer Фільтр повітряний Jaguar X-Type 2.1/2.5/3.0 (01-09) 288 грн 288 грн",
        "Повітряний фільтр (f026400758) Bosch Повітряний фільтр (f026400758) 788 грн 788 грн",
        "Змінний елемент фільтра салону, вугільний (Blue Print) Blue Print Змінний елемент фільтра салону, вугільний (Blue Print) 491 грн 491 грн",
        "Фільтр салону вугільний (wp9337) WIX Filters Фільтр салону вугільний (wp9337) 460 грн 460 грн",
        "Фільтр масляний Renault Trafic, Vivaro, 1.6DCI (foe3891d) Shafer Фільтр масляний Renault Trafic, Vivaro, 1.6DCI (foe3891d) 162 грн 162 грн"
      ].join(" ")
    );

    expect(output).toBe(`Трансмісійна олива
Motul ATF VI — 686 грн / 5 488 грн за 8 л
Meyle ATF III-H — 483 грн / 3 864 грн за 8 л
Kroon Oil SP Matic 4026 — 470 грн / 3 760 грн за 8 л

Повітряний фільтр
Bosch — 788 грн
Shafer — 288 грн

Фільтр салону
Blue Print — 491 грн
WIX Filters — 460 грн

Оливний фільтр
Shafer — 162 грн`);
  });

  it("renames pump headings to coolant pump", () => {
    const output = formatWithoutBrandMetadata(
      [
        "Помпа Renault / Dacia Помпа 3 123 грн 3 123 грн",
        "Помпа INA Помпа 2 554 грн 2 554 грн"
      ].join(" ")
    );

    expect(output).toBe(`Насос ОЖ
Renault / Dacia — 3 123 грн
INA — 2 554 грн`);
  });

  it("normalizes fuel filters into one heading", () => {
    const output = formatWithoutBrandMetadata(
      [
        "ФІЛЬТР ПАЛИВНИЙ ДИЗЕЛЬНИЙ (164004350r) Renault / Dacia ФІЛЬТР ПАЛИВНИЙ ДИЗЕЛЬНИЙ (164004350r) 3 151 грн 3 151 грн",
        "Паливний фільтр (fcs922) Purflux Паливний фільтр (fcs922) 3 180 грн 3 180 грн",
        "Паливний фільтр (f026402378) Bosch Паливний фільтр (f026402378) 1 779 грн 1 779 грн"
      ].join(" ")
    );

    expect(output).toBe(`Паливний фільтр
Purflux — 3 180 грн
Renault / Dacia — 3 151 грн
Bosch — 1 779 грн`);
  });

  it("splits antifreeze into concentrate and ready-to-use sections", () => {
    const output = formatWithoutBrandMetadata(
      [
        "Концентрат антифризу Yellow Concentrated Antifreeze/Coolant жовтий 3.78 л Ford Концентрат антифризу Yellow Concentrated Antifreeze/Coolant жовтий 3.78 л 1 701 грн 3 402 грн",
        "Концентрат антифризу Premium Longlife Nissan/Renault OAT жовтий 5 л MPM Концентрат антифризу Premium Longlife Nissan/Renault OAT жовтий 5 л 1 895 грн 1 895 грн",
        "Готовий антифриз Premium Longlife Nissan/Renault жовтий -40 °C 5 л MPM Готовий антифриз Premium Longlife Nissan/Renault жовтий -40 °C 5 л 1 394 грн 1 394 грн",
        "Готовий антифриз Premium Longlife Nissan/Renault жовтий -40 °C 1 л MPM Готовий антифриз Premium Longlife Nissan/Renault жовтий -40 °C 1 л 424 грн 424 грн"
      ].join(" ")
    );

    expect(output).toBe(`Антифриз концентрат
MPM — 1 895 грн за 5 л
Ford — 1 701 грн / 3 402 грн за 7,56 л

Антифриз готовий до використання
MPM — 1 394 грн за 5 л
MPM — 424 грн за 1 л`);
  });

  it("extracts a leading brand for motor oil without moving descriptors into the brand", () => {
    const output = formatWithoutBrandMetadata(
      [
        "Kroon Oil Моторна олива Specialsynth MSP 5W-40 синтетична 5 л 1 826 грн",
        "Моторна олива Pace EVO C3 5W-40 5 л AVISTA Моторна олива Pace EVO C3 5W-40 5 л 1 495 грн 1 495 грн",
        "Моторна олива 8100 X-Clean 5W-40 синтетична 5 л Motul Моторна олива 8100 X-Clean 5W-40 синтетична 5 л 2 392 грн 2 392 грн"
      ].join(" ")
    );

    expect(output).toBe(`Моторна олива 5W-40
Motul 8100 X-Clean — 2 392 грн за 5 л
Kroon Oil Specialsynth MSP — 1 826 грн за 5 л
AVISTA Pace EVO C3 — 1 495 грн за 5 л`);
  });

  it("groups timing chain kits together despite engine details in the title", () => {
    const output = formatWithoutBrandMetadata(
      [
        "Комплект ланцюга ГРМ 2,3dci Renault Master III (130C13666R) Renault (130C13666R) Renault / Dacia Комплект ланцюга ГРМ 2,3dci Renault Master III (130C13666R) 9 081 грн 9 081 грн",
        "Комплект ланцюга ГРМ (37999) Febi Комплект ланцюга ГРМ (37999) 6 495 грн 6 495 грн"
      ].join(" ")
    );

    expect(output).toBe(`Комплект ланцюга ГРМ
Renault / Dacia — 9 081 грн
Febi — 6 495 грн`);
  });

  it("extracts a leading brand when the copied item has no repeated title", () => {
    const output = formatWithoutBrandMetadata(
      [
        "TRW Гальмівний диск (DF4323) 2 756 грн 5 512 грн",
        "Bosch Гальмівний диск (0 986 479 037) 2 334 грн 4 668 грн",
        "Meyle Гальмівний диск (115 521 1086) 2 199 грн 4 398 грн"
      ].join(" ")
    );

    expect(output).toBe(`Гальмівний диск
TRW — 2 756 грн / 5 512 грн за 2 шт
Bosch — 2 334 грн / 4 668 грн за 2 шт
Meyle — 2 199 грн / 4 398 грн за 2 шт`);
  });

  it("normalizes brake fluids by DOT family", () => {
    const output = formatWithoutBrandMetadata(
      [
        "Гальмівна рідина Synthetic DOT 4 1 л Ferodo Гальмівна рідина Synthetic DOT 4 1 л 345 грн 345 грн",
        "Гальмівна рідина DOT 4 1 л Brembo Гальмівна рідина DOT 4 1 л 268 грн 268 грн",
        "Гальмівна рідина DOT 4 1 л TRW Гальмівна рідина DOT 4 1 л 325 грн 325 грн",
        "Гальмівна рідина LV DOT 4 ABS ESP ASR 1 л Alpine Гальмівна рідина LV DOT 4 ABS ESP ASR 1 л 397 грн 397 грн"
      ].join(" ")
    );

    expect(output).toBe(`Гальмівна рідина DOT 4
Ferodo — 345 грн
TRW — 325 грн
Brembo — 268 грн

Гальмівна рідина LV DOT 4
Alpine — 397 грн`);
  });

  it("uses misc for brand-only titles instead of making the brand a heading", () => {
    expect(formatWithoutBrandMetadata("starline (1212805) Starline starline (1212805) 354 грн 354 грн")).toBe(`Інше
Starline — 354 грн`);
  });

  it("normalizes AC radiators into one heading", () => {
    const output = formatWithoutBrandMetadata(
      [
        "Радіатор кондиціонера (35979) Nissens Радіатор кондиціонера (35979) 6 358 грн 6 358 грн",
        "Радіатор кондиціонера (35979) NRF Радіатор кондиціонера (35979) 5 935 грн 5 935 грн",
        "Радіатор кондиціонера Sorento 2.5 (06-) AT, MT (P22223) TANGUN (p22223) TanGun Радіатор кондиціонера Sorento 2.5 (06-) AT, MT (P22223) TANGUN (p22223) 3 070 грн 3 070 грн"
      ].join(" ")
    );

    expect(output).toBe(`Радіатор кондиціонера
Nissens — 6 358 грн
NRF — 5 935 грн
TanGun — 3 070 грн`);
  });

  it("normalizes hubs separately from hub bearings", () => {
    const output = formatWithoutBrandMetadata(
      [
        "Підшипник ступиці колеса (VKBA 3531) SKF Підшипник ступиці колеса (VKBA 3531) 1 515 грн 1 515 грн",
        "Ступиця колеса (2501-5005) Profit Ступиця колеса (2501-5005) 2 744 грн 2 744 грн",
        "МаточиназадняChevroletEvanda,Epica,Lacetti,02-,ABS+ (sh19005) Shafer МаточиназадняChevroletEvanda,Epica,Lacetti,02-,ABS+ (sh19005) 2 348 грн 2 348 грн"
      ].join(" ")
    );

    expect(output).toBe(`Підшипник ступиці колеса
SKF — 1 515 грн

Маточина колеса
Profit — 2 744 грн
Shafer — 2 348 грн`);
  });

  it("keeps brand-only items in the previous known category", () => {
    const output = formatWithoutBrandMetadata(
      [
        "Перетворювач тиску системи рециркуляції вихлопних газів (3512027050) Hyundai / Kia Перетворювач тиску системи рециркуляції вихлопних газів (3512027050) 2 617 грн 2 617 грн",
        "era (555300a) ERA era (555300a) 1 875 грн 1 875 грн",
        "Клапан регулювання тиску наддуву (ENT830016) Engitech Клапан регулювання тиску наддуву (ENT830016) 1 196 грн 1 196 грн"
      ].join(" ")
    );

    expect(output).toBe(`Перетворювач тиску системи рециркуляції вихлопних газів
Hyundai / Kia — 2 617 грн
ERA — 1 875 грн

Клапан регулювання тиску наддуву
Engitech — 1 196 грн`);
  });

  it("separates timing belt kits with coolant pump from standalone pumps", () => {
    const output = formatWithoutBrandMetadata(
      [
        "Комплект ременя ГРМ + помпа (CT1077WP2) Contitech Комплект ременя ГРМ + помпа (CT1077WP2) 6 399 грн 6 399 грн",
        "Комплект ременя ГРМ + помпа (vkmc052601) SKF Комплект ременя ГРМ + помпа (vkmc052601) 5 415 грн 5 415 грн",
        "Насос водяний CHEVROLET AVEO 08- (RIDER) (rd15010009) Rider Насос водяний CHEVROLET AVEO 08- (RIDER) (rd15010009) 839 грн 839 грн"
      ].join(" ")
    );

    expect(output).toBe(`Комплект ременя ГРМ + Насос ОЖ
Contitech — 6 399 грн
SKF — 5 415 грн

Насос ОЖ
Rider — 839 грн`);
  });

  it("normalizes additional headings from brand-first copied rows", () => {
    const output = formatWithoutBrandMetadata(
      [
        "BGA Подушка двигуна (mt7926) 1 524 грн 1 524 грн",
        "Подушка двигуна нижня (30199236) AND Подушка двигуна нижня (30199236) 1 025 грн 1 025 грн",
        "MSG Насос ГПК 6 275 грн 6 275 грн",
        "Q-Fix НАСОС ГИДРОУСИЛИТЕЛЯ 4 087 грн 4 087 грн",
        "SsangYong Датчик детонації (1611533628) 1 380 грн 1 380 грн",
        "Датчик детонації (9.3010) Facet Датчик детонації (9.3010) 810 грн 810 грн",
        "TrakMotive Піввісь (300471) 3 403 грн 6 806 грн",
        "Піввісь (98793) Asam Піввісь (98793) 4 501 грн 9 002 грн",
        "Applus Кермова тяга (32057ap) 587 грн 1 174 грн",
        "Meyle Сайлентблок важеля (100 407 0054) 214 грн 428 грн",
        "Stabilus Газовий упор багажника (7628LW) 558 грн 1 116 грн",
        "Autofren Seinsa Напрямна гільза скоби гальмівного супорта (D7126C) 330 грн 330 грн"
      ].join(" ")
    );

    expect(output).toBe(`Подушка двигуна
BGA — 1 524 грн
AND — 1 025 грн

Насос ГПК
MSG — 6 275 грн
Q-Fix — 4 087 грн

Датчик детонації
SsangYong — 1 380 грн
Facet — 810 грн

Піввісь
Asam — 4 501 грн / 9 002 грн за 2 шт
TrakMotive — 3 403 грн / 6 806 грн за 2 шт

Кермова тяга
Applus — 587 грн / 1 174 грн за 2 шт

Сайлентблок важеля
Meyle — 214 грн / 428 грн за 2 шт

Газовий упор багажника
Stabilus — 558 грн / 1 116 грн за 2 шт

Напрямна гільза супорта
Autofren Seinsa — 330 грн`);
  });

  it("normalizes filters, pulleys, radiator caps, batteries, grease, and cabin fans", () => {
    const output = formatWithoutBrandMetadata(
      [
        "AF5008a Елемент фільтруючийповітряний салону (CHEVROLET Lacetti DAEWOO Nubira II) (af5008a) Alpha Filter AF5008a Елемент фільтруючийповітряний салону (CHEVROLET Lacetti DAEWOO Nubira II) (af5008a) 203 грн 203 грн",
        "ПідшипникпереднійNissanX-TrailT30,MaximaA33-A34,PrimeraP12,00-,(43x43x76) (sh16862) Shafer ПідшипникпереднійNissanX-TrailT30,MaximaA33-A34,PrimeraP12,00-,(43x43x76) (sh16862) 560 грн 1 120 грн",
        "Натяжний ролик поліклинового ременя (T38214) Gates Натяжний ролик поліклинового ременя (T38214) 2 094 грн 2 094 грн",
        "Michelin Натяжитель поликлинового ремня VAG 1 289 грн 1 289 грн",
        "Кришка радіатора (RC0040) Calorstat by Vernet Кришка радіатора (RC0040) 362 грн 362 грн",
        "Акумулятор 6 CT-50-R Excell EB500 Exide Акумулятор 6 CT-50-R Excell EB500 2 903 грн 2 903 грн",
        "Мастило Pro-Line Injector and Glow Plug Grease напівсинтетичне 20 мл Liqui Moly Мастило Pro-Line Injector and Glow Plug Grease напівсинтетичне 20 мл 306 грн 306 грн",
        "Hyundai / Kia Вентилятор салону (971093E000) 4 342 грн 4 342 грн",
        "Вентилятор салона (35820062) AND Вентилятор салона (35820062) 2 189 грн 2 189 грн"
      ].join(" ")
    );

    expect(output).toBe(`Фільтр салону
Alpha Filter — 203 грн

Підшипник ступиці колеса
Shafer — 560 грн / 1 120 грн за 2 шт

Натяжний ролик поліклинового ременя
Gates — 2 094 грн
Michelin — 1 289 грн

Кришка радіатора
Calorstat by Vernet — 362 грн

Акумулятор
Exide 6 CT-50-R Excell — 2 903 грн

Мастило
Liqui Moly — 306 грн

Вентилятор салону
Hyundai / Kia — 4 342 грн
AND — 2 189 грн`);
  });

  it("uses later valid total prices when copied rows contain extra price values", () => {
    const output = formatWithoutBrandMetadata(
      "Гальмівний диск (17525) A.B.S. Гальмівний диск (17525) 1 714 грн 1 695 грн 3 428 грн 3 390 грн"
    );

    expect(output).toBe(`Гальмівний диск
A.B.S. — 1 714 грн / 3 428 грн за 2 шт`);
  });

  it("keeps code-only rows under misc or the next known category without code headings", () => {
    expect(
      formatWithoutBrandMetadata(
        "(MR503462) Mitsubishi (MR503462) 3 607 грн 3 607 грн Датчик рівня палива (q2120352) Q-Fix Датчик рівня палива (q2120352) 902 грн 902 грн"
      )
    ).toBe(`Датчик рівня палива
Mitsubishi — 3 607 грн
Q-Fix — 902 грн`);

    expect(
      formatWithoutBrandMetadata(
        "Nissan / Infiniti nissan (e43025na0d) 10 042 грн 10 042 грн nissan (e43035na0d) Nissan / Infiniti nissan (e43035na0d) 14 021 грн 14 021 грн"
      )
    ).toBe(`Інше
Nissan / Infiniti — 14 021 грн
Nissan / Infiniti — 10 042 грн`);
  });

  it("creates a separate section for every supported motor-oil viscosity in canonical order", () => {
    const viscosities = [
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
    ];
    const input = [...viscosities]
      .reverse()
      .map((viscosity, index) => {
        const titleViscosity = viscosity === "20" || viscosity === "30" ? `SAE ${viscosity}` : viscosity;
        const title = `Моторна олива Line ${titleViscosity} синтетична 1 л`;
        const price = 100 + index;
        return `${title} Brand${index} ${title} ${price} грн ${price} грн`;
      })
      .join(" ");

    const headings = formatWithoutBrandMetadata(input)
      .split("\n\n")
      .map((section) => section.split("\n")[0]);

    expect(headings).toEqual(viscosities.map((viscosity) => `Моторна олива ${viscosity}`));
  });

  it("normalizes motor-oil viscosity spelling and does not confuse a 20-liter volume with SAE 20", () => {
    const variants = ["5W-30", "5w30", "5 W 30", "5W–30", "SAE 5W-30"];
    const inputs = variants.map((viscosity, index) => {
      const title = `Моторна олива Line${index} ${viscosity} синтетична 1 л`;
      return `${title} Brand${index} ${title} ${500 + index} грн ${500 + index} грн`;
    });
    const unknownTitle = "Моторна олива No Grade синтетична 20 л";
    inputs.push(`${unknownTitle} Unknown Brand ${unknownTitle} 900 грн 900 грн`);

    const output = formatWithoutBrandMetadata(inputs.join(" "));
    expect(output.match(/^Моторна олива 5W-30$/gmu)).toHaveLength(1);
    expect(output).toContain("Моторна олива, в’язкість не визначена");
    expect(output).not.toContain("Моторна олива 20\nUnknown Brand");
  });

  it("groups different oil bases under the same viscosity and sorts that section by price", () => {
    const output = formatWithoutBrandMetadata(
      [
        "Моторна олива Synthetic Line 5W-40 синтетична 5 л Brand A Моторна олива Synthetic Line 5W-40 синтетична 5 л 1 200 грн 1 200 грн",
        "Моторна олива Semi Line 5W-40 напівсинтетична 5 л Brand B Моторна олива Semi Line 5W-40 напівсинтетична 5 л 1 500 грн 1 500 грн"
      ].join(" ")
    );

    expect(output).toBe(`Моторна олива 5W-40
Brand B Semi Line — 1 500 грн за 5 л
Brand A Synthetic Line — 1 200 грн за 5 л`);
  });

  it("sorts future multigrade viscosities numerically after the canonical list", () => {
    const output = formatWithoutBrandMetadata(
      [
        "Моторна олива Future C 25W-70 синтетична 1 л Brand C Моторна олива Future C 25W-70 синтетична 1 л 300 грн 300 грн",
        "Моторна олива Future B 2W-25 синтетична 1 л Brand B Моторна олива Future B 2W-25 синтетична 1 л 200 грн 200 грн",
        "Моторна олива Future A 2W-15 синтетична 1 л Brand A Моторна олива Future A 2W-15 синтетична 1 л 100 грн 100 грн"
      ].join(" ")
    );

    expect(output.split("\n\n").map((section) => section.split("\n")[0])).toEqual([
      "Моторна олива 2W-15",
      "Моторна олива 2W-25",
      "Моторна олива 25W-70"
    ]);
  });

  it("keeps full battery names while removing their trailing articles", () => {
    const output = formatWithoutBrandMetadata(
      [
        "Акумулятор 6 СТ-70-R Dynamic AGM 570901076 Varta Акумулятор 6 СТ-70-R Dynamic AGM 570901076 8 065 грн 8 065 грн",
        "Акумулятор 6 СТ-72-R AGM EK720 Exide Акумулятор 6 СТ-72-R AGM EK720 6 395 грн 6 395 грн",
        "Акумулятор 6 СТ-70-R S5 0092S5A080 Bosch Акумулятор 6 СТ-70-R S5 0092S5A080 7 606 грн 7 606 грн",
        "Акумулятор 6 СТ-70-R AGM Start Stop YBX9096 Yuasa Акумулятор 6 СТ-70-R AGM Start Stop YBX9096 7 928 грн 7 928 грн",
        "Акумулятор 6 СТ-70-R AGM 213070 TAB Акумулятор 6 СТ-70-R AGM 213070 7 791 грн 7 791 грн",
        "Акумулятор 6 СТ-70-R AGM A57012 ERA Акумулятор 6 СТ-70-R AGM A57012 7 165 грн 7 165 грн",
        "Акумулятор 6 СТ-70-R BASL70AGM Starline Акумулятор 6 СТ-70-R BASL70AGM 6 010 грн 6 010 грн"
      ].join(" ")
    );

    expect(output).toBe(`Акумулятор
Varta 6 СТ-70-R Dynamic AGM — 8 065 грн
Yuasa 6 СТ-70-R AGM Start Stop — 7 928 грн
TAB 6 СТ-70-R AGM — 7 791 грн
Bosch 6 СТ-70-R S5 — 7 606 грн
ERA 6 СТ-70-R AGM — 7 165 грн
Exide 6 СТ-72-R AGM — 6 395 грн
Starline 6 СТ-70-R — 6 010 грн`);
  });

  it("does not remove a valid trailing battery characteristic when there is no article", () => {
    expect(
      formatWithoutBrandMetadata("Акумулятор 6 СТ-70-R AGM Varta Акумулятор 6 СТ-70-R AGM 5 000 грн 5 000 грн")
    ).toBe(`Акумулятор
Varta 6 СТ-70-R AGM — 5 000 грн`);
  });

  it("formats a single product as an article-free heading plus manufacturer and price", () => {
    const multiline = `Febi
Трос ручного гальма (109236)
1 255 грн
1 255 грн`;
    const flat = "Febi Трос ручного гальма (109236) 1 255 грн 1 255 грн";
    const expected = `Трос ручного гальма
Febi — 1 255 грн`;

    expect(formatWithoutBrandMetadata(multiline)).toBe(expected);
    expect(formatWithoutBrandMetadata(flat)).toBe(expected);
    expect(formatWithoutBrandMetadata("Трос ручного гальма (109236) Febi 1 255 грн 1 255 грн")).toBe(expected);
  });

  it("uses the full article-free title for a single dynamic product", () => {
    expect(
      formatWithoutBrandMetadata("Febi Незвичайний регулятор тиску гальмівної системи (109236) 1 255 грн 1 255 грн")
    ).toBe(`Незвичайний регулятор тиску гальмівної системи
Febi — 1 255 грн`);
  });

  it("uses a user alias to split the brand from a single product", () => {
    const output = formatProductPriceList("My Febi Трос ручного гальма (109236) 1 255 грн 1 255 грн", [
      {
        displayName: "Febi",
        aliases: ["My Febi"],
        category: "valueReplacement",
        country: "Німеччина",
        isOriginal: false,
        updatedAt: "2026-07-13T10:00:00.000Z",
        source: "user"
      }
    ]);

    expect(output).toBe(`Трос ручного гальма
Febi — 1 255 грн - ціна / якість, Німеччина`);
  });
});
