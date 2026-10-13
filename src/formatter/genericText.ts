import type { GenericFormatOptions } from "./types";

export function formatGenericText(input: string, options: GenericFormatOptions): string {
  let text = input;

  if (options.normalizeLineEndings) {
    text = text.replace(/\r\n?/g, "\n");
  }

  if (options.convertTabsToSpaces) {
    text = text.replace(/\t/g, " ".repeat(Math.max(1, options.tabWidth)));
  }

  if (options.findText) {
    const escaped = escapeRegExp(options.findText);
    const flags = options.caseSensitiveSearch ? "g" : "gi";
    text = text.replace(new RegExp(escaped, flags), options.replaceText);
  }

  let lines = text.split("\n");

  if (options.trimLines) {
    lines = lines.map((line) => line.trim());
  }

  if (options.collapseSpaces) {
    lines = lines.map((line) => line.replace(/[ ]{2,}/g, " "));
  }

  if (options.collapseEmptyLines) {
    const max = Math.max(0, options.maxEmptyLines);
    let emptyCount = 0;
    lines = lines.filter((line) => {
      if (line.length === 0) {
        emptyCount += 1;
        return emptyCount <= max;
      }
      emptyCount = 0;
      return true;
    });
  }

  if (options.dedupeLines) {
    const seen = new Set<string>();
    lines = lines.filter((line) => {
      if (seen.has(line)) {
        return false;
      }
      seen.add(line);
      return true;
    });
  }

  if (options.sortLines) {
    lines = [...lines].sort((a, b) => a.localeCompare(b, "uk"));
  }

  text = lines.join("\n");
  text = applyCaseMode(text, options.caseMode);

  if (options.addLineNumbers) {
    text = text
      .split("\n")
      .map((line, index) => `${index + 1}. ${line}`)
      .join("\n");
  }

  return text.trim();
}

function applyCaseMode(text: string, mode: GenericFormatOptions["caseMode"]) {
  switch (mode) {
    case "lower":
      return text.toLocaleLowerCase("uk");
    case "upper":
      return text.toLocaleUpperCase("uk");
    case "sentence":
      return text
        .toLocaleLowerCase("uk")
        .replace(/(^|[.!?]\s+)(\p{L})/gu, (_match, prefix: string, letter: string) => {
          return `${prefix}${letter.toLocaleUpperCase("uk")}`;
        });
    case "title":
      return text
        .toLocaleLowerCase("uk")
        .replace(/(^|\s)(\p{L})/gu, (_match, prefix: string, letter: string) => {
          return `${prefix}${letter.toLocaleUpperCase("uk")}`;
        });
    default:
      return text;
  }
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
