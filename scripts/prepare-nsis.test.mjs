import { describe, expect, it } from "vitest";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import beforeBuild from "./prepare-nsis.cjs";
const { patchNsisTemplate, unsafeBlock, safeBlock } = beforeBuild;
const require = createRequire(import.meta.url);

describe("NSIS installer path safety backport", () => {
  it("removes the unsafe fixed-size Shell pointer read from the pinned template", async () => {
    const file = path.join(path.dirname(require.resolve("app-builder-lib/package.json")), "templates/nsis/multiUser.nsh");
    const original = await readFile(file, "utf8");
    const patched = patchNsisTemplate(original);
    expect(patched).not.toContain("*$2(&w${NSIS_MAX_STRLEN}");
    expect(patched).toContain("KERNEL32::lstrcpynW");
    expect(patched).toContain('ReadRegStr $perUserInstallationFolder HKCU');
    expect(patched).toContain('StrCpy $INSTDIR $perUserInstallationFolder');
    expect(patched).toContain('StrCpy $0 "$LocalAppData\\Programs"');
  });
  it("can be applied repeatedly for multiple Windows test builds", () => {
    const once = patchNsisTemplate(unsafeBlock);
    expect(patchNsisTemplate(once)).toBe(once);
    expect(once).toBe(safeBlock);
  });
  it("rejects an unknown or ambiguous dependency template", () => {
    expect(() => patchNsisTemplate("unexpected template")).toThrow();
    expect(() => patchNsisTemplate(unsafeBlock + "\n" + unsafeBlock)).toThrow();
  });
  it("leaves macOS builds on their normal dependency handling path", async () => {
    expect(await beforeBuild({ platform: { nodeName: "darwin" } })).toBe(true);
  });
});
