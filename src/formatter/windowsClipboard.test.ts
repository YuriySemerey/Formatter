import { describe, expect, it } from "vitest";
import { formatProductPriceList, parseProductStream } from "./productPriceList";

const noMetadata = { showBrandCountry: false, showBrandCategory: false };
const format = (input: string) => formatProductPriceList(input, [], noMetadata);

// Transcribed from the reported Windows screenshots, including separate quantity cells.
const mounts = `Опора амортизатора (18481)
Febi
Опора амортизатора (18481)
1 646 грн

1

1 646 грн
Опора амортизатора (rc05475)
RAISO
Опора амортизатора (rc05475)
1 154 грн

1

1 154 грн`;

const bushings = `Сайлентблок важеля (23144ap)
Applus
Сайлентблок важеля (23144ap)
1 199 грн

1

1 199 грн
Сайлентблок важеля (23145ap)
Applus
Сайлентблок важеля (23145ap)
545 грн

2

1 090 грн
Сайлентблок важеля (24375ap)
Applus
Сайлентблок важеля (24375ap)
1 221 грн

1

1 221 грн`;

describe("Windows copied cart quantities and totals", () => {
  it.each(["\n", "\r\n", "\r", "\t"])("keeps quantity and subtotal cells attached to their products (%j)", (separator) => {
    expect(format(mounts.replace(/\n+/g, separator))).toBe("Опора амортизатора\nFebi — 1 646 грн\nRAISO — 1 154 грн");
    expect(parseProductStream(mounts.replace(/\n+/g, separator))).toHaveLength(2);
  });

  it("groups the screenshot's bushings without turning quantity 2 or its subtotal into another product", () => {
    expect(format(bushings)).toBe(`Сайлентблок важеля
Applus — 1 221 грн
Applus — 1 199 грн
Applus — 545 грн / 1 090 грн за 2 шт`);
    expect(parseProductStream(bushings)).toHaveLength(3);
  });

  it("keeps a code-only first item with the following sensor and accepts truncated currency", () => {
    const input = `(8201000764)
Renault / Dacia
(8201000764)
3 949 грн

1

3 949 грн
Датчик тиску вихлопних газів (173118)
Febi
Датчик тиску вихлопних газів (173118)
2 214 грн

1

2 214 гр`;
    expect(format(input)).toBe("Датчик тиску вихлопних газів\nRenault / Dacia — 3 949 грн\nFebi — 2 214 грн");
    expect(parseProductStream(input)).toHaveLength(2);
  });

  it("does not concatenate quantity 1 with a three-digit subtotal", () => {
    const input = "Датчик температури охолоджувальної рідини (32510)\nFebi\nДатчик температури охолоджувальної рідини (32510)\n351 грн\n\n1\n\n351 грн";
    expect(parseProductStream(input)).toMatchObject([{ brand: "Febi", price: 351, quantity: 1 }]);
    expect(format(input)).toBe("Датчик температури охолоджувальної рідини\nFebi — 351 грн");
  });

  it("uses the second copied unit price and its matching subtotal", () => {
    const input = "Свічка запалювання (OE136/T10)\nChampion\nСвічка запалювання (OE136/T10)\n343 грн\n257 грн\n\n4\n\n1 372 грн\n1 028 грн";
    expect(format(input)).toBe("Свічка запалювання\nChampion — 257 грн / 1 028 грн за 4 шт");
    expect(parseProductStream(input)).toMatchObject([{ brand: "Champion", price: 257, quantity: 4, totalPrice: 1028 }]);
    expect(format(input.replace(/\n+/g, "\t"))).toBe(format(input));
    expect(format(input.replace(/\n+/g, " "))).toBe(format(input));
  });

  it("uses the second price for a single-item row with two price columns", () => {
    const input = "Свічка запалювання (OE136/T10)\nChampion\nСвічка запалювання (OE136/T10)\n343 грн\n257 грн\n1\n343 грн\n257 грн";
    expect(format(input)).toBe("Свічка запалювання\nChampion — 257 грн");
    expect(format(input.replace(/\n+/g, " "))).toBe(format(input));
  });

  it("keeps the second subtotal column even when the cart has a rounding adjustment", () => {
    const input = "Свічка запалювання (OE136/T10)\nChampion\nСвічка запалювання (OE136/T10)\n343 грн\n257 грн\n4\n1 371 грн\n1 027 грн";
    expect(format(input)).toBe("Свічка запалювання\nChampion — 257 грн / 1 027 грн за 4 шт");
  });

  it("preserves nonbreaking-space thousands and tab-separated quantity cells", () => {
    expect(format("Шарова опора (TC837)\tApplus\tШарова опора (TC837)\t701 грн\t2\t1\u202f402 грн")).toBe("Шарова опора\nApplus — 701 грн / 1 402 грн за 2 шт");
  });

  it("keeps explicit quantity when the copied subtotal includes a rounding adjustment", () => {
    expect(format("Гальмівний диск (DF4323)\nBrembo\nГальмівний диск (DF4323)\n701 грн\n2\n1 401 грн")).toBe("Гальмівний диск\nBrembo — 701 грн / 1 401 грн за 2 шт");
  });

  it("reads amounts with cents instead of matching only the decimal suffix", () => {
    expect(format("Свічка запалювання (OE136/T10)\nChampion\nСвічка запалювання (OE136/T10)\n120,15 грн\n4 шт.\n480,60 грн")).toBe("Свічка запалювання\nChampion — 120,15 грн / 480,6 грн за 4 шт");
    expect(format("Гальмівний диск Brembo Гальмівний диск 120.15 грн 480.60 грн")).toBe("Гальмівний диск\nBrembo — 120,15 грн / 480,6 грн за 4 шт");
  });

  it("uses explicit quantity to calculate a missing subtotal without consuming the next product", () => {
    const input = "Шарова опора (TC837)\nApplus\nШарова опора (TC837)\n701 грн\n2\nОливний фільтр (100487)\nFebi\nОливний фільтр (100487)\n351 грн\n3";
    expect(format(input)).toBe("Шарова опора\nApplus — 701 грн / 1 402 грн за 2 шт\n\nОливний фільтр\nFebi — 351 грн / 1 053 грн за 3 шт");
  });

  it("does not infer products from isolated quantities and totals in a partial selection", () => {
    expect(format("701 грн\n\n2\n\n1 402 грн\n" + mounts)).toBe("Опора амортизатора\nFebi — 1 646 грн\nRAISO — 1 154 грн");
    expect(format("2\n1 402 грн")).toBe("");
  });

  it("retains liter totals with explicit quantities", () => {
    const title = "Моторна олива Line 5W-40 синтетична 5 л";
    expect(format(`${title}\nBrand X\n${title}\n1 500 грн\n2\n3 000 грн`)).toBe("Моторна олива 5W-40\nBrand X Line — 1 500 грн / 3 000 грн за 10 л");
  });

  it("deduplicates the same offer pasted with and without an explicit single-item quantity", () => {
    const item = "Шарова опора (TC837) Applus Шарова опора (TC837) 701 грн 701 грн";
    const withQuantity = "Шарова опора (TC837)\nApplus\nШарова опора (TC837)\n701 грн\n1\n701 грн";
    expect(format(`${item}\n${withQuantity}`)).toBe("Шарова опора\nApplus — 701 грн");
  });
});
