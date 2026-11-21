import { afterEach, describe, expect, it, vi } from "vitest";
import { writeFormattedClipboard } from "./clipboard";

afterEach(() => { delete window.formatterApp; vi.unstubAllGlobals(); });

describe("clipboard destinations", () => {
  it("uses desktop IPC for the full Unicode text", async () => {
    const writeClipboard = vi.fn().mockResolvedValue(undefined);
    window.formatterApp = { writeClipboard } as unknown as NonNullable<Window["formatterApp"]>;
    await writeFormattedClipboard("Олива\nElf — 611 грн\n\nВіброгасник");
    expect(writeClipboard).toHaveBeenCalledWith("Олива\nElf — 611 грн\n\nВіброгасник");
  });

  it("offers plain text and HTML together in browser mode", async () => {
    const write = vi.fn().mockResolvedValue(undefined);
    const writeText = vi.fn();
    vi.stubGlobal("navigator", { clipboard: { write, writeText } });
    vi.stubGlobal("ClipboardItem", class { constructor(public data: Record<string, Blob>) {} });
    await writeFormattedClipboard("Група\n\nІнша");
    const item = write.mock.calls[0][0][0];
    expect(Object.keys(item.data)).toEqual(["text/plain", "text/html"]);
    const read = (blob: Blob) => new Promise((resolve) => {
      const reader = new FileReader(); reader.onload = () => resolve(reader.result); reader.readAsText(blob);
    });
    expect(await read(item.data["text/plain"])).toBe("Група\n\nІнша");
    expect(await read(item.data["text/html"])).toBe("<div>Група<br>&nbsp;<br>Інша</div>");
    expect(writeText).not.toHaveBeenCalled();
  });

  it.each(["unsupported", "rejected"])("falls back to plain text when rich copy is %s", async (mode) => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal("navigator", { clipboard: { write: vi.fn().mockRejectedValue(new Error("unsupported")), writeText } });
    vi.stubGlobal("ClipboardItem", mode === "unsupported" ? undefined : class {});
    await writeFormattedClipboard("Група\n\nІнша");
    expect(writeText).toHaveBeenCalledWith("Група\n\nІнша");
  });
});
