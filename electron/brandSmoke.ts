import assert from "node:assert/strict";
import { setTimeout as delay } from "node:timers/promises";
import { writeFile } from "node:fs/promises";
import type { BrowserWindow } from "electron";

/** Runs only with --smoke-test, whose profile is isolated from installed user data. */
export async function runBrandSmoke(window: BrowserWindow): Promise<void> {
  const evaluate = async (code: string) => {
    const result = await window.webContents.executeJavaScript(`(async () => {
      try { return { value: await (${code}) }; }
      catch (error) { return { error: error.stack || String(error) }; }
    })()`);
    if (result.error) throw new Error(`Brand editor UI: ${result.error}`);
    return result.value;
  };
  const inputSelector = "textarea[placeholder='Вставте скопійований прайс-лист...']";
  const outputSelector = "textarea[placeholder=\"Сформатований текст з'явиться тут...\"]";
  async function setField(selector: string, value: string) {
    await evaluate(`(() => {
      const input = document.querySelector(${JSON.stringify(selector)});
      const prototype = input instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : input instanceof HTMLSelectElement ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
      Object.getOwnPropertyDescriptor(prototype, 'value').set.call(input, ${JSON.stringify(value)});
      input.dispatchEvent(new Event(input instanceof HTMLSelectElement ? 'change' : 'input', { bubbles: true }));
    })()`);
  }
  const click = (label: string) => evaluate(`(() => {
    const button = [...document.querySelectorAll('button')].find(button =>
      [...button.childNodes].filter(node => node.nodeType === Node.TEXT_NODE).map(node => node.textContent).join('').trim() === ${JSON.stringify(label)});
    if (!button) throw new Error('Button not found: ' + ${JSON.stringify(label)});
    button.click();
  })()`);
  async function waitFor(code: string, predicate: (value: any) => boolean) {
    for (let attempt = 0; attempt < 80; attempt++) {
      const result = await evaluate(code);
      if (predicate(result)) return result;
      await delay(50);
    }
    throw new Error("Brand editor smoke condition timed out");
  }
  async function screenshot(suffix: string) {
    const prefix = process.env.FORMATTER_BRAND_SMOKE_SCREENSHOT;
    if (prefix) {
      await delay(100);
      await writeFile(`${prefix}-${suffix}.png`, (await window.webContents.capturePage()).toPNG());
    }
  }

  await setField(inputSelector, "Гальмівний диск (DF4323)\nBrembo\nГальмівний диск (DF4323)\n400 грн");
  await click("Format");
  const originalHistory = await waitFor("localStorage.getItem('formatter.history.v1')", (value) => value && value !== "[]");
  await click("Налаштування");
  await click("Бренди");
  await click("Категорії");
  await setField(".category-form input", "ОРИГІНАЛ");
  await click("Додати категорію");
  assert((await evaluate("document.querySelector('.category-editor [role=alert]')?.textContent")).includes("вже існує"));
  await setField(".category-form input", "Власний вибір");
  await click("Додати категорію");
  const customCategory = await evaluate("[...document.querySelector('.brand-toolbar select').options].find(option => option.textContent === 'Власний вибір').value");
  assert(customCategory.startsWith("custom:"));
  await click("Категорії");
  await click("Додати бренд");
  await setField(".brand-entry-form input", "Bosch");
  await click("Додати до списку");
  assert((await evaluate("document.querySelector('.brand-entry-form [role=alert]')?.textContent")).includes("вже належить"));
  await setField(".brand-entry-form input", "DW Parts");
  await setField(".brand-entry-form select", customCategory);
  await setField(".brand-entry-form input[placeholder]", "Україна");
  assert.equal(await evaluate("document.querySelector('.brand-entry-form [role=alert]')"), null, "Correcting the name must clear the old validation error");
  await screenshot("new-form");
  await click("Додати до списку");
  await click("Зберегти");
  const savedCode = "window.formatterApp.loadBrandOverrides()";
  await waitFor(savedCode, (brands) => brands.some((brand: any) => brand.displayName === "DW Parts"));
  assert((await evaluate("document.querySelector('.brand-table tbody').textContent")).includes("Власний"));
  await screenshot("new");

  await setField(".search-field input", "Brembo");
  await evaluate("document.querySelector('[aria-label=\"Змінити назву Brembo\"]').click()");
  await setField(".brand-entry-form input", "Brembo Italia");
  await setField(".brand-entry-form select", "premiumReplacement");
  await setField(".brand-entry-form input[placeholder]", "Італія");
  await screenshot("rename-form");
  await click("Застосувати");
  await click("Зберегти");
  const saved = await waitFor(savedCode, (brands) => brands.some((brand: any) => brand.baseName === "Brembo"));
  assert.equal(saved.length, 2);
  assert.equal(saved.find((brand: any) => brand.displayName === "DW Parts").category, customCategory);
  assert(saved.some((brand: any) => brand.displayName === "Brembo Italia" && brand.baseName === "Brembo" && brand.aliases.includes("Brembo")));
  assert.equal(await evaluate("document.querySelectorAll('.brand-table tbody tr').length"), 1);
  await screenshot("renamed");

  await click("Категорії");
  await evaluate("document.querySelector('[aria-label=\"Змінити назву категорії якісний замінник\"]').click()");
  await setField(".category-form input", "Перевірений замінник");
  await click("Застосувати назву");
  await evaluate("document.querySelector('[aria-label=\"Змінити назву категорії Власний вибір\"]').click()");
  await setField(".category-form input", "Особливий вибір");
  await click("Застосувати назву");
  await setField(".brand-toolbar select", customCategory);
  await setField(".search-field input", "DW Parts");
  await click("Зберегти");
  const categoryCode = "JSON.parse(localStorage.getItem('formatter.settings.v2')).settings.brandCategories";
  const savedCategories = await waitFor(categoryCode, (categories) => categories?.some((category: any) => category.id === customCategory && category.label === "Особливий вибір"));
  assert(savedCategories.some((category: any) => category.id === "premiumReplacement" && category.label === "Перевірений замінник"));
  assert.deepEqual(await evaluate(savedCode), saved, "Renaming categories must keep every brand assignment and ID");
  assert.equal(await evaluate("document.querySelector('.brand-table tbody select').selectedOptions[0].textContent"), "Особливий вибір");
  await screenshot("categories");

  await evaluate("document.querySelector('[aria-label=\"Змінити назву категорії Особливий вибір\"]').click()");
  await setField(".category-form input", "Тимчасова назва");
  await click("Застосувати назву");
  await click("Скасувати");
  assert.equal(await evaluate("document.querySelector('.brand-table tbody select').selectedOptions[0].textContent"), "Особливий вибір");
  await setField(".search-field input", "Brembo");

  await click("База");
  await setField(".search-field input", "Brembo");
  await waitFor("document.querySelector('.brand-table tbody strong')?.textContent", (value) => value === "Brembo");
  await click("Скасувати");
  await waitFor("document.querySelector('.brand-table tbody strong')?.textContent", (value) => value === "Brembo Italia");
  await setField(".search-field input", "DW Parts");
  await click("Видалити");
  await waitFor("document.querySelectorAll('.brand-table tbody tr').length", (value) => value === 0);
  await click("Скасувати");
  await waitFor("document.querySelector('.brand-table tbody strong')?.textContent", (value) => value === "DW Parts");

  const loaded = new Promise<void>((resolve) => window.webContents.once("did-finish-load", () => resolve()));
  window.webContents.reloadIgnoringCache();
  await loaded;
  await waitFor("Boolean(document.querySelector('.app-shell'))", Boolean);
  assert.deepEqual(await evaluate(savedCode), saved, "Native storage must keep custom and renamed brands");
  assert.deepEqual(await evaluate(categoryCode), savedCategories, "Reload must preserve category names and custom IDs");
  assert.equal(await evaluate("localStorage.getItem('formatter.history.v1')"), originalHistory, "Editing brands must preserve saved output");
  await click("Налаштування");
  await click("Бренди");
  await setField(".search-field input", "DW Parts");
  await waitFor("document.querySelector('.brand-table tbody')?.textContent", (value) => value?.includes("DW Parts"));
  await click("Форматер");
  await setField(inputSelector, "Гальмівний диск (DF4323)\nBrembo\nГальмівний диск (DF4323)\n400 грн\nОливний фільтр (OF1234)\nDW Parts\nОливний фільтр (OF1234)\n257 грн\n\n4\n\n1 028 грн");
  await click("Format");
  const output = await waitFor(`document.querySelector(${JSON.stringify(outputSelector)})?.value`, (value) => value?.includes("Brembo Italia") && value?.includes("DW Parts"));
  assert.equal(output, "Гальмівний диск\nBrembo Italia — 400 грн - Перевірений замінник, Італія\n\nОливний фільтр\nDW Parts — 257 грн / 1 028 грн за 4 шт - Особливий вибір, Україна");
  console.log("CATEGORY_EDITOR_SMOKE_PASSED: create, reject duplicate, rename built-in/custom, save, cancel and reload; assignments and history preserved");
  console.log("BRAND_EDITOR_SMOKE_PASSED: create, reject duplicate, rename, save, Base/Remove/Cancel, reload and format with old names; history preserved");
}
