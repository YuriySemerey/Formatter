import { createClipboardContent } from "../../electron/clipboard";
import type { ClipboardEvent } from "react";

export async function writeFormattedClipboard(text: string): Promise<void> {
  if (window.formatterApp?.writeClipboard) {
    await window.formatterApp.writeClipboard(text);
    return;
  }

  if (typeof ClipboardItem !== "undefined" && navigator.clipboard.write) {
    const content = createClipboardContent(text);
    try {
      await navigator.clipboard.write([new ClipboardItem({
        "text/plain": new Blob([content.text], { type: "text/plain" }),
        "text/html": new Blob([content.html], { type: "text/html" })
      })]);
      return;
    } catch {
      // Older browsers can expose write() while rejecting HTML clipboard data.
    }
  }

  await navigator.clipboard.writeText(text);
}

export function copyFormattedSelection(event: ClipboardEvent<HTMLTextAreaElement>): void {
  const { value, selectionStart, selectionEnd } = event.currentTarget;
  if (selectionStart === selectionEnd) return;
  const content = createClipboardContent(value.slice(selectionStart, selectionEnd));
  event.clipboardData.setData("text/plain", content.text);
  event.clipboardData.setData("text/html", content.html);
  event.preventDefault();
}
