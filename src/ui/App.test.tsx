import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { App } from "./App";
import { BROWSER_BRAND_OVERRIDES_STORAGE_KEY } from "./brandOverrideStorage";

beforeEach(() => {
  localStorage.clear();
  delete window.formatterApp;
  localStorage.setItem(BROWSER_BRAND_OVERRIDES_STORAGE_KEY, JSON.stringify([{ displayName: "Brembo", category: "premiumReplacement", country: "Італія", updatedAt: "2026-10-13T00:00:00Z", source: "user" }]));
});
afterEach(() => { cleanup(); localStorage.clear(); });

describe("metadata visibility in the application", () => {
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
