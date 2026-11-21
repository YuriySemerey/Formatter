// Verify the actual distributed bundles, not just the development Electron binary.
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";

assert.equal(process.platform, "darwin", "Run the packaged Mac verification on macOS");
const execute = promisify(execFile);
const run = (file, args) => execute(file, args, { timeout: 90_000, maxBuffer: 2_000_000 });
const pkg = JSON.parse(await readFile("package.json", "utf8"));
const output = path.resolve(process.argv[2] ?? "release");
const temp = await mkdtemp(path.join(os.tmpdir(), "Formatter-mac-package-"));
const results = [];

async function verify(app, arch, source) {
  await run("codesign", ["--verify", "--deep", "--strict", "--verbose=2", app]);
  const signature = await run("codesign", ["-dv", "--verbose=4", app]);
  assert(signature.stderr.includes("Identifier=com.dw.formatter"));
  assert(signature.stderr.includes("Signature=adhoc"));
  assert(signature.stderr.includes("Sealed Resources version=2"));
  const binary = path.join(app, "Contents/MacOS/Formatter");
  const actualArch = (await run("lipo", ["-archs", binary])).stdout.trim();
  assert.equal(actualArch, arch === "x64" ? "x86_64" : "arm64");
  const version = (await run("plutil", ["-extract", "CFBundleShortVersionString", "raw", "-o", "-", path.join(app, "Contents/Info.plist")])).stdout.trim();
  assert.equal(version, pkg.version);
  let smokePassed = false;
  if (arch === process.arch) {
    const smoke = await run(binary, ["--smoke-test", "--clipboard-smoke-test", "--brand-smoke-test"]);
    assert(smoke.stdout.includes("CLIPBOARD_SMOKE_PASSED"), `Native clipboard paste did not pass: ${source}`);
    assert(smoke.stdout.includes("BRAND_EDITOR_SMOKE_PASSED"), `Native brand editor did not pass: ${source}`);
    assert(smoke.stdout.includes("CATEGORY_EDITOR_SMOKE_PASSED"), `Native category editor did not pass: ${source}`);
    assert(smoke.stdout.includes("ELECTRON_SMOKE_PASSED"), smoke.stderr);
    smokePassed = true;
  }
  results.push({ source, arch, version, signatureVerified: true, smokePassed });
  console.log(`MAC_PACKAGE_VERIFIED: ${source}, ${arch}, signature valid, native smoke=${smokePassed}`);
}

try {
  for (const arch of ["arm64", "x64"]) {
    const name = `Formatter-${pkg.version}-mac-${arch}`;
    const mount = path.join(temp, `${arch}-mounted`);
    await mkdir(mount);
    await run("hdiutil", ["verify", path.join(output, `${name}.dmg`)]);
    await run("hdiutil", ["attach", "-readonly", "-nobrowse", "-mountpoint", mount, path.join(output, `${name}.dmg`)]);
    try {
      const mountedApp = path.join(mount, "Formatter.app");
      await run("codesign", ["--verify", "--deep", "--strict", mountedApp]);
      const installed = path.join(temp, `${arch}-installed/Formatter.app`);
      await run("ditto", [mountedApp, installed]);
      await verify(installed, arch, "dmg");
    } finally {
      await run("hdiutil", ["detach", mount]);
    }
    const unzipped = path.join(temp, `${arch}-zip`);
    await mkdir(unzipped);
    await run("ditto", ["-x", "-k", path.join(output, `${name}.zip`), unzipped]);
    await verify(path.join(unzipped, "Formatter.app"), arch, "zip");
  }
  await mkdir("artifacts", { recursive: true });
  await writeFile("artifacts/macos-package-test.json", JSON.stringify({ version: pkg.version, signing: "adhoc", notarized: false, results }, null, 2));
  console.log("MAC_PACKAGE_SMOKE_PASSED: DMG installation copies and ZIP bundles have valid signatures; native architecture launches");
} finally {
  await rm(temp, { recursive: true, force: true });
}
