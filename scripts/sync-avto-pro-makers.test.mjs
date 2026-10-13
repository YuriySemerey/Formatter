import { describe, expect, it } from "vitest";
import {
  buildBrandAuditReport,
  buildEntry,
  extractAvtoProMakerDetailsFromHtml,
  extractAvtoProMakerNamesFromHtml,
  findMissingMakerNames,
  mergeAvtoProDetail,
  parseSeedMakerNames
} from "./sync-avto-pro-makers.mjs";

describe("Avto.pro makers sync helpers", () => {
  it("parses the authoritative maker seed while preserving first-seen order", () => {
    expect(parseSeedMakerNames(["A-Mega", "A-N Parts", "", "A-Mega", "5`825"].join("\n"))).toEqual([
      "A-Mega",
      "A-N Parts",
      "5`825"
    ]);
  });

  it("extracts link-based and plain-text maker names from page markup", () => {
    const html = `
      <main>
        <h1>Виробники автозапчастин</h1>
        <a href="/makers/bosch/">Bosch</a>
        <div class="maker-row">GKN</div>
        <a href="https://avto.pro/makers/georg-fisher/">Georg Fisher</a>
        <span>Загрузка</span>
      </main>
    `;

    expect(extractAvtoProMakerNamesFromHtml(html)).toEqual(["Bosch", "Georg Fisher", "GKN"]);
  });

  it("audits source names against generated brand keys", () => {
    const entries = ["Bosch", "Georg Fisher", "GKN"].map((name) => buildEntry(name));

    expect(findMissingMakerNames(["Bosch", "Georg Fisher", "GKN"], entries)).toEqual([]);
    expect(findMissingMakerNames(["Bosch", "Georg Fisher", "Missing Brand"], entries)).toEqual(["Missing Brand"]);
  });

  it("extracts Avto.pro maker registration country details", () => {
    const html = `
      <main>
        <h1>Автозапчасти CTR (СТР)</h1>
        <div>Страна  Южная Корея</div>
        <div>Год основания  1960</div>
        <p>CTR - корейский производитель деталей подвески и рулевого управления.</p>
        <h2>Сравнение CTR с другими брендами</h2>
      </main>
    `;

    const details = extractAvtoProMakerDetailsFromHtml(html, "CTR");
    expect(details).toMatchObject({
      rawCountry: "Южная Корея",
      country: "Південна Корея",
      foundedYear: "1960",
      confidence: "medium"
    });

    expect(buildEntry("CTR", { avtoProUrl: "https://avto.pro/makers/ctr/", ...details })).toMatchObject({
      displayName: "CTR",
      category: "unknown",
      country: "Південна Корея",
      verification: {
        countrySources: ["avto-pro-makers", "avto-pro-maker-detail"],
        categorySources: []
      },
      details: {
        avtoProUrl: "https://avto.pro/makers/ctr/",
        rawCountry: "Южная Корея",
        foundedYear: "1960"
      }
    });
  });

  it("applies verified Avto.pro country metadata to Bcguma without assigning category", () => {
    expect(
      buildEntry("Bcguma", {
        avtoProUrl: "https://avto.pro/makers/bcguma/",
        rawCountry: "Украина",
        country: "Україна",
        confidence: "medium"
      })
    ).toMatchObject({
      displayName: "Bcguma",
      category: "unknown",
      country: "Україна",
      verification: {
        confidence: "medium",
        countrySources: ["avto-pro-makers", "avto-pro-maker-detail"],
        categorySources: []
      }
    });
  });

  it("does not overwrite cached detail metadata with empty fetch results", () => {
    expect(
      mergeAvtoProDetail(
        {
          avtoProUrl: "https://avto.pro/makers/bcguma/",
          rawCountry: "Польша",
          country: "Польща",
          confidence: "medium"
        },
        {
          avtoProUrl: "https://avto.pro/makers/bcguma/",
          rawCountry: "",
          country: "",
          confidence: "low"
        }
      )
    ).toMatchObject({
      country: "Польща",
      rawCountry: "Польша",
      confidence: "medium"
    });
  });

  it("builds an audit report for missing country, missing category and low confidence", () => {
    const entries = [
      buildEntry("Bcguma", {
        avtoProUrl: "https://avto.pro/makers/bcguma/",
        rawCountry: "Украина",
        country: "Україна",
        confidence: "medium"
      }),
      buildEntry("Achr")
    ];

    const audit = buildBrandAuditReport(["Bcguma", "Achr", "Missing Brand"], entries);
    expect(audit.totals.sourceNames).toBe(3);
    expect(audit.missingCountry).toContain("Achr");
    expect(audit.missingCategory).toContain("Bcguma");
    expect(audit.missingCategory).toContain("Achr");
    expect(audit.lowConfidence).toContain("Achr");
    expect(audit.missingCoverage).toContain("Missing Brand");
  });
});
