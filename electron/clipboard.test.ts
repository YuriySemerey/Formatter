import { describe, expect, it } from "vitest";
import { createClipboardContent } from "./clipboard";

describe("formatted clipboard content", () => {
  it("keeps product groups separated without relying on CSS or empty blocks", () => {
    const text = "Моторна олива 5W–30\nElf — 2 633 грн за 5 л\nFord — 438 грн за 1 л\n\nВіброгасник\nINA — 2 086 грн / 4 172 грн за 2 шт\n\nНатягувач ременя ГРМ\nSNR — 1 836 грн";
    const content = createClipboardContent(text);
    expect(content.text).toBe(text);
    const target = document.createElement("div");
    target.innerHTML = content.html;
    expect(target.querySelectorAll("br")).toHaveLength(8);
    expect(target.textContent?.match(/\u00a0/gu)).toHaveLength(2);
    // Model an editor that drops empty nodes: spacer lines remain real text.
    expect(content.html.split("<br>").every((line) => line.length > 0)).toBe(true);
    target.querySelectorAll("br").forEach((br) => br.replaceWith("\n"));
    expect(target.textContent?.replace(/\u00a0/gu, "")).toBe(text);
  });

  it.each(["\n", "\r\n", "\r"])("handles %j line endings and consecutive blank lines", (ending) => {
    const text = ["Група", "Ціна — 257 грн / 1 028 грн за 4 шт", "", "", "Наступна група", ""].join(ending);
    const content = createClipboardContent(text);
    expect(content.text).toBe(text);
    expect(content.html).toBe("<div>Група<br>Ціна — 257 грн / 1 028 грн за 4 шт<br>&nbsp;<br>&nbsp;<br>Наступна група<br>&nbsp;</div>");
  });

  it("treats user input as text, including markup, links and quotes", () => {
    const text = 'Бренд <img src=x onerror="alert(1)"> & <a href="https://example.com">ціна</a>\n\n\'Олива\'';
    const content = createClipboardContent(text);
    const target = document.createElement("div");
    target.innerHTML = content.html;
    expect(target.querySelector("img, a, script")).toBeNull();
    target.querySelectorAll("br").forEach((br) => br.replaceWith("\n"));
    expect(target.textContent?.replace(/\u00a0/gu, "")).toBe(text);
    expect(content.text).toBe(text);
  });
});
