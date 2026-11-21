import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { App } from "./App";
import { BROWSER_BRAND_OVERRIDES_STORAGE_KEY } from "./brandOverrideStorage";

beforeEach(() => {
  localStorage.clear();
  delete window.formatterApp;
  localStorage.setItem(BROWSER_BRAND_OVERRIDES_STORAGE_KEY, JSON.stringify([{ displayName: "Brembo", category: "premiumReplacement", country: "Італія", updatedAt: "2026-10-13T00:00:00Z", source: "user" }]));
});
afterEach(() => { cleanup(); localStorage.clear(); vi.unstubAllGlobals(); });

describe("copying output with group separation", () => {
  const text = "Олива 5W–30\nElf — 611 грн\n\nВіброгасник\nINA — 2 086 грн / 4 172 грн за 2 шт";

  it("copies the current edited result through Copy", async () => {
    const writeClipboard = vi.fn().mockResolvedValue(undefined);
    window.formatterApp = { writeClipboard } as unknown as NonNullable<Window["formatterApp"]>;
    render(<App />);
    fireEvent.change(screen.getByPlaceholderText("Сформатований текст з'явиться тут..."), { target: { value: text } });
    fireEvent.click(screen.getByRole("button", { name: "Copy" }));
    await waitFor(() => expect(writeClipboard).toHaveBeenCalledWith(text));
    expect(screen.getByText("Скопійовано")).toBeInTheDocument();
  });

  it("copies a saved history entry without changing its separators", async () => {
    const entry = { id: "saved", createdAt: "2026-11-21T00:00:00Z", output: text };
    localStorage.setItem("formatter.history.v1", JSON.stringify([entry]));
    const writeClipboard = vi.fn().mockResolvedValue(undefined);
    window.formatterApp = { writeClipboard } as unknown as NonNullable<Window["formatterApp"]>;
    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: /Історія/u }));
    fireEvent.click(screen.getByTitle("Скопіювати"));
    await waitFor(() => expect(writeClipboard).toHaveBeenCalledWith(text));
    expect(JSON.parse(localStorage.getItem("formatter.history.v1")!)).toEqual([entry]);
  });

  it("puts both formats on the keyboard-copy event for only the selected result", () => {
    render(<App />);
    const output = screen.getByPlaceholderText("Сформатований текст з'явиться тут...") as HTMLTextAreaElement;
    fireEvent.change(output, { target: { value: text } });
    output.setSelectionRange(0, text.indexOf("\nINA"));
    const setData = vi.fn();
    expect(fireEvent.copy(output, { clipboardData: { setData } })).toBe(false);
    expect(setData).toHaveBeenCalledWith("text/plain", "Олива 5W–30\nElf — 611 грн\n\nВіброгасник");
    expect(setData).toHaveBeenCalledWith("text/html", "<div>Олива 5W–30<br>Elf — 611 грн<br>&nbsp;<br>Віброгасник</div>");
  });

  it("leaves the clipboard alone for an empty output or empty selection", () => {
    const writeClipboard = vi.fn();
    window.formatterApp = { writeClipboard } as unknown as NonNullable<Window["formatterApp"]>;
    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: "Copy" }));
    expect(writeClipboard).not.toHaveBeenCalled();
    const setData = vi.fn();
    expect(fireEvent.copy(screen.getByPlaceholderText("Сформатований текст з'явиться тут..."), { clipboardData: { setData } })).toBe(true);
    expect(setData).not.toHaveBeenCalled();
  });

  it("reports failure instead of claiming that Copy succeeded", async () => {
    window.formatterApp = { writeClipboard: vi.fn().mockRejectedValue(new Error("clipboard unavailable")) } as unknown as NonNullable<Window["formatterApp"]>;
    render(<App />);
    fireEvent.change(screen.getByPlaceholderText("Сформатований текст з'явиться тут..."), { target: { value: text } });
    fireEvent.click(screen.getByRole("button", { name: "Copy" }));
    expect(await screen.findByText("Не вдалося скопіювати текст. Спробуйте ще раз.")).toBeInTheDocument();
    expect(screen.queryByText("Скопійовано")).not.toBeInTheDocument();
  });
});

describe("metadata visibility in the application", () => {
  it("formats a Windows cart with quantities through the real Format button and preserves brand edits", () => {
    render(<App />);
    const input = "Гальмівний диск (DF4323)\r\nBrembo\r\nГальмівний диск (DF4323)\r\n2 756 грн\r\n2 306 грн\r\n\r\n2\r\n\r\n5 512 грн\r\n4 612 грн";
    fireEvent.change(screen.getByPlaceholderText("Вставте скопійований прайс-лист..."), { target: { value: input } });
    fireEvent.click(screen.getByRole("button", { name: "Format" }));
    const expected = "Гальмівний диск\nBrembo — 2 306 грн / 4 612 грн за 2 шт - якісний замінник, Італія";
    expect(screen.getByPlaceholderText("Сформатований текст з'явиться тут...")).toHaveValue(expected);
    expect(JSON.parse(localStorage.getItem("formatter.history.v1")!)[0].output).toBe(expected);
    expect(JSON.parse(localStorage.getItem(BROWSER_BRAND_OVERRIDES_STORAGE_KEY)!)[0].country).toBe("Італія");
  });

  it("keeps existing output/history until Format, persists switches, and restores them on restart", () => {
    const view = render(<App />);
    fireEvent.change(screen.getByPlaceholderText("Вставте скопійований прайс-лист..."), { target: { value: "Гальмівний диск (DF4323) Brembo Гальмівний диск (DF4323) 2 306 грн" } });
    fireEvent.click(screen.getByRole("button", { name: "Format" }));
    const previous = "Гальмівний диск\nBrembo — 2 306 грн - якісний замінник, Італія";
    expect(screen.getByPlaceholderText("Сформатований текст з'явиться тут...")).toHaveValue(previous);
    fireEvent.click(screen.getByRole("button", { name: "Налаштування" }));
    const country = screen.getByRole("switch", { name: "Показувати країну" });
    const category = screen.getByRole("switch", { name: "Показувати категорію" });
    expect(country).toBeChecked(); expect(category).toBeChecked();
    fireEvent.click(country); expect(category).toBeChecked();
    fireEvent.click(category);
    expect(JSON.parse(localStorage.getItem("formatter.history.v1")!)[0].output).toBe(previous);
    fireEvent.click(screen.getByRole("button", { name: "Форматер" }));
    expect(screen.getByPlaceholderText("Сформатований текст з'явиться тут...")).toHaveValue(previous);
    fireEvent.click(screen.getByRole("button", { name: "Format" }));
    expect(screen.getByPlaceholderText("Сформатований текст з'явиться тут...")).toHaveValue("Гальмівний диск\nBrembo — 2 306 грн");
    expect(JSON.parse(localStorage.getItem("formatter.history.v1")!).map((item: { output: string }) => item.output)).toEqual(["Гальмівний диск\nBrembo — 2 306 грн", previous]);
    view.unmount(); render(<App />);
    expect(screen.getByPlaceholderText("Вставте скопійований прайс-лист...")).toHaveValue("");
    fireEvent.click(screen.getByRole("button", { name: "Налаштування" }));
    expect(screen.getByRole("switch", { name: "Показувати країну" })).not.toBeChecked();
    expect(screen.getByRole("switch", { name: "Показувати категорію" })).not.toBeChecked();
  });
});
