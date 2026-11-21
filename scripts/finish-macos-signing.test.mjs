import { createRequire } from "node:module";
import path from "node:path";
import os from "node:os";
import { describe, expect, it, vi } from "vitest";
const { finishAdhocSigning } = createRequire(import.meta.url)("./finish-macos-signing.cjs");

function fixture() {
  const options = { identity: "-", hardenedRuntime: true, entitlements: "build/entitlements.mac.plist" };
  const optionsForFile = () => ({ hardenedRuntime: true, entitlements: options.entitlements });
  return { context: { appOutDir: path.join(os.tmpdir(), "test-app"), packager: { platformSpecificBuildOptions: options, appInfo: { productFilename: "Formatter" }, config: {}, getOptionsForFile: vi.fn().mockResolvedValue(optionsForFile) } }, optionsForFile };
}

describe("final certificate-free Mac signing", () => {
  it("completes builder-skipped PR signatures before verification using the configured entitlements", async () => {
    const { context, optionsForFile } = fixture();
    const order = [];
    const sign = vi.fn(async () => { order.push("sign"); });
    const verify = vi.fn(() => { order.push("verify"); });
    await finishAdhocSigning(context, { isPullRequest: () => true, sign, verify });
    const app = path.join(context.appOutDir, "Formatter.app");
    expect(sign).toHaveBeenCalledWith({ app, platform: "darwin", type: "distribution", version: undefined, optionsForFile });
    expect(context.packager.getOptionsForFile).toHaveBeenCalledWith(app, false, context.packager.platformSpecificBuildOptions);
    expect(order).toEqual(["sign", "verify"]);
  });

  it("verifies ordinary builds without signing them a second time", async () => {
    const { context } = fixture(); const sign = vi.fn(); const verify = vi.fn();
    await finishAdhocSigning(context, { isPullRequest: () => false, sign, verify });
    expect(sign).not.toHaveBeenCalled(); expect(verify).toHaveBeenCalledWith(path.join(context.appOutDir, "Formatter.app"));
  });

  it("fails if strict verification fails instead of claiming success", async () => {
    const { context } = fixture();
    await expect(finishAdhocSigning(context, { isPullRequest: () => false, verify: () => { throw new Error("invalid signature"); } })).rejects.toThrow("invalid signature");
  });

  it("does not use this PR path for certificate identities", async () => {
    const { context } = fixture(); context.packager.platformSpecificBuildOptions.identity = "Developer ID Application";
    const sign = vi.fn(); const verify = vi.fn();
    await expect(finishAdhocSigning(context, { isPullRequest: () => true, sign, verify })).rejects.toThrow("requires identity '-'");
    expect(sign).not.toHaveBeenCalled(); expect(verify).not.toHaveBeenCalled();
  });
});
