// @vitest-environment node
import { createHash } from "node:crypto";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { extractReleaseNotes, validateReleaseVersion, verifyReleaseAssets } from "./release-assets.mjs";

const directories = [];
afterEach(async () => { await Promise.all(directories.splice(0).map((dir) => rm(dir, { recursive: true, force: true }))); });

async function fixture() {
  const directory = await mkdtemp(path.join(os.tmpdir(), "formatter-release-test-")); directories.push(directory);
  const mac = ["arm64", "x64"].flatMap((arch) => ["dmg", "zip"].map((ext) => `Formatter-0.3.0-mac-${arch}.${ext}`));
  const win = ["Formatter-0.3.0-win-x64.exe"];
  const data = Buffer.from("test installer");
  const files = (names) => names.map((url) => ({ url, size: data.length, sha512: createHash("sha512").update(data).digest("base64") }));
  await Promise.all([...mac, ...win].map(async (name) => {
    await writeFile(path.join(directory, name), data);
    if (name.endsWith("zip") || name.endsWith("exe")) await writeFile(path.join(directory, `${name}.blockmap`), "blockmap");
  }));
  await writeFile(path.join(directory, "latest.yml"), JSON.stringify({ version: "0.3.0", files: files(win) }));
  await writeFile(path.join(directory, "latest-mac.yml"), JSON.stringify({ version: "0.3.0", files: files(mac) }));
  return { directory, mac, win };
}

describe("release publication gate", () => {
  it("accepts a complete two-platform release and each platform's standalone build", async () => {
    const { directory } = await fixture();
    expect(await verifyReleaseAssets(directory, "0.3.0")).toHaveLength(10);
    expect(await verifyReleaseAssets(directory, "0.3.0", "mac")).toHaveLength(7);
    expect(await verifyReleaseAssets(directory, "0.3.0", "win")).toHaveLength(3);
  });
  it("rejects a release missing the Windows installer", async () => {
    const { directory, win } = await fixture(); await rm(path.join(directory, win[0]));
    await expect(verifyReleaseAssets(directory, "0.3.0")).rejects.toThrow("Missing");
  });
  it("rejects tampered artifacts even when all filenames are present", async () => {
    const { directory, mac } = await fixture(); await writeFile(path.join(directory, mac[1]), "tampered");
    await expect(verifyReleaseAssets(directory, "0.3.0")).rejects.toThrow("checksum/size mismatch");
  });
  it("rejects manifests that mix release versions or omit an architecture", async () => {
    const { directory } = await fixture();
    await writeFile(path.join(directory, "latest-mac.yml"), JSON.stringify({ version: "0.2.0", files: [] }));
    await expect(verifyReleaseAssets(directory, "0.3.0")).rejects.toThrow("Invalid update metadata");
  });
  it("requires matching stable tags and takes release notes from the correct changelog section", () => {
    expect(() => validateReleaseVersion("0.3.0", "v0.2.0")).toThrow();
    expect(() => validateReleaseVersion("0.3.0", "v0.3.0")).not.toThrow();
    expect(extractReleaseNotes("# Changelog\n\n## 0.3.0 - 2026-10-13\n\n- New version\n\n## 0.2.0 - 2026-07-13\n\n- Old version", "0.3.0")).toBe("- New version\n");
  });
});
