import assert from "node:assert/strict";
import { setTimeout as delay } from "node:timers/promises";
import { clipboard, type BrowserWindow, type Data } from "electron";

/** Explicit smoke mode only; preserve the user's supported clipboard formats. */
export async function runClipboardSmoke(window: BrowserWindow): Promise<void> {
  const formats = clipboard.availableFormats();
  const supported = new Set(["text/plain", "text/html", "text/rtf", "image/png", "image/jpeg"]);
  assert(formats.every((format) => supported.has(format)), "Clipboard smoke cannot safely restore an existing custom clipboard format");
  const previous: Data = {};
  if (formats.includes("text/plain")) previous.text = clipboard.readText();
  if (formats.includes("text/html")) previous.html = clipboard.readHTML();
  if (formats.includes("text/rtf")) previous.rtf = clipboard.readRTF();
  if (formats.some((format) => format.startsWith("image/"))) previous.image = clipboard.readImage();

  const text = "Моторна олива 5W–30\nElf — 2 633 грн за 5 л\n\nВіброгасник\nINA — 2 086 грн / 4 172 грн за 2 шт\n\nБренд <текст> & ціна";
  const outputSelector = "textarea[placeholder=\"Сформатований текст з'явиться тут...\"]";
  const evaluate = (code: string) => window.webContents.executeJavaScript(code);
  async function verifyPaste(expected: string) {
    for (let attempt = 0; attempt < 40 && clipboard.readText() !== expected; attempt++) await delay(50);
    assert.equal(clipboard.readText(), expected, "Copy must keep exact plain text");
    assert(clipboard.readHTML().includes("<br>"), "Copy must supply HTML line breaks");
    await evaluate(`(() => {
      document.getElementById('clipboard-smoke-editor')?.remove();
      const editor = document.createElement('div');
      editor.id = 'clipboard-smoke-editor'; editor.contentEditable = 'true';
      document.body.append(editor); editor.focus();
    })()`);
    window.webContents.paste();
    let pasted = "";
    for (let attempt = 0; attempt < 40; attempt++) {
      pasted = await evaluate("document.getElementById('clipboard-smoke-editor').innerText");
      if (pasted) break;
      await delay(50);
    }
    assert.equal(pasted.replace(/\u00a0/gu, "").replace(/\r\n/gu, "\n"), expected, "Native rich-editor paste must preserve every group separator");
  }

  try {
    await evaluate(`(() => {
      const output = document.querySelector(${JSON.stringify(outputSelector)});
      Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set.call(output, ${JSON.stringify(text)});
      output.dispatchEvent(new Event('input', { bubbles: true }));
    })()`);
    await evaluate("[...document.querySelectorAll('button')].find(button => button.textContent.trim() === 'Copy').click()");
    await verifyPaste(text);

    const selected = text.slice(text.indexOf("Віброгасник"));
    await evaluate(`(() => {
      const output = document.querySelector(${JSON.stringify(outputSelector)});
      output.focus(); output.setSelectionRange(${text.indexOf("Віброгасник")}, ${text.length});
    })()`);
    window.webContents.copy();
    await verifyPaste(selected);
    console.log("CLIPBOARD_SMOKE_PASSED: Copy and keyboard selection preserve groups in a native rich-editor paste");
  } finally {
    try {
      await evaluate("document.getElementById('clipboard-smoke-editor')?.remove()");
    } finally {
      if (formats.length) clipboard.write(previous);
      else clipboard.clear();
    }
  }
}
