import { useState } from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { CategoryEditor } from "./CategoryEditor";
import { DEFAULT_BRAND_CATEGORIES } from "../../electron/brandCategories";

afterEach(cleanup);
function Harness() {
  const [categories, setCategories] = useState(DEFAULT_BRAND_CATEGORIES);
  return <><CategoryEditor categories={categories} onChange={setCategories} /><output data-testid="categories">{JSON.stringify(categories)}</output></>;
}

describe("category editor", () => {
  it("creates a category and renames it with the same ID", () => {
    render(<Harness />);
    fireEvent.change(screen.getByLabelText("Назва категорії"), { target: { value: "Власний вибір" } });
    fireEvent.click(screen.getByRole("button", { name: "Додати категорію" }));
    const added = JSON.parse(screen.getByTestId("categories").textContent!);
    fireEvent.click(screen.getByRole("button", { name: "Змінити назву категорії Власний вибір" }));
    fireEvent.change(screen.getByLabelText("Назва категорії"), { target: { value: "Особливий вибір" } });
    fireEvent.click(screen.getByRole("button", { name: "Застосувати назву" }));
    expect(JSON.parse(screen.getByTestId("categories").textContent!).at(-1)).toEqual({ id: added.at(-1).id, label: "Особливий вибір" });
  });

  it("shows duplicate validation and clears it when the name is corrected", () => {
    render(<Harness />);
    fireEvent.change(screen.getByLabelText("Назва категорії"), { target: { value: "ОРИГІНАЛ" } });
    fireEvent.click(screen.getByRole("button", { name: "Додати категорію" }));
    expect(screen.getByRole("alert")).toHaveTextContent("вже існує");
    fireEvent.change(screen.getByLabelText("Назва категорії"), { target: { value: "Інша" } });
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("cancels renaming a built-in category without changing definitions", () => {
    render(<Harness />);
    fireEvent.click(screen.getByRole("button", { name: "Змінити назву категорії оригінал" }));
    fireEvent.change(screen.getByLabelText("Назва категорії"), { target: { value: "OEM" } });
    fireEvent.click(screen.getByRole("button", { name: "Скасувати перейменування" }));
    expect(JSON.parse(screen.getByTestId("categories").textContent!)).toEqual(DEFAULT_BRAND_CATEGORIES);
  });
});
