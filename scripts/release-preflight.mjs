import { access, readFile } from "node:fs/promises";
import path from "node:path";
import { load } from "js-yaml";

const root = process.cwd();
const requiredFiles = [
  "build/icon.icns",
  "build/icon.ico",
  "dist/index.html",
  "dist-electron/main.js",
  "dist-electron/preload.cjs",
  "dist-electron/updateService.js",
  "scripts/release-assets.mjs",
  "scripts/windows-update-smoke.mjs",
  "scripts/windows-update-test-main.cjs",
  "electron-builder.yml",
  ".github/workflows/build-installers.yml",
  "CHANGELOG.md"
];

function fail(message) {
  throw new Error(`Release preflight failed: ${message}`);
}

async function readJson(relativePath) {
  return JSON.parse(await readFile(path.join(root, relativePath), "utf8"));
}

for (const relativePath of requiredFiles) {
  try {
    await access(path.join(root, relativePath));
  } catch {
    fail(`missing ${relativePath}`);
  }
}

const packageJson = await readJson("package.json");
const packageLock = await readJson("package-lock.json");
const lockRoot = packageLock.packages?.[""];
const expectedBuilderVersion = packageJson.devDependencies?.["electron-builder"];

if (expectedBuilderVersion !== "26.0.12") {
  fail("package.json must pin electron-builder to 26.0.12");
}

if (lockRoot?.devDependencies?.["electron-builder"] !== expectedBuilderVersion) {
  fail("package-lock.json is not synchronized with package.json; run npm install with registry access");
}

if (packageJson.version !== packageLock.version || packageJson.version !== lockRoot?.version) {
  fail("package.json and package-lock.json versions must match");
}

const lockedBuilder = packageLock.packages?.["node_modules/electron-builder"];
if (lockedBuilder?.version !== expectedBuilderVersion) {
  fail("package-lock.json does not contain electron-builder 26.0.12");
}

const installedBuilder = await readJson("node_modules/electron-builder/package.json").catch(() => null);
if (installedBuilder?.version !== expectedBuilderVersion) {
  fail("electron-builder 26.0.12 is not installed; run npm ci");
}

const updaterVersion = "6.6.2";
if (packageJson.dependencies?.["electron-updater"] !== updaterVersion || lockRoot?.dependencies?.["electron-updater"] !== updaterVersion || packageLock.packages?.["node_modules/electron-updater"]?.version !== updaterVersion) {
  fail("electron-updater 6.6.2 must be synchronized in package.json and package-lock.json");
}
const installedUpdater = await readJson("node_modules/electron-updater/package.json").catch(() => null);
if (installedUpdater?.version !== updaterVersion) fail("electron-updater 6.6.2 is not installed; run npm ci");
if (JSON.stringify(Object.entries(packageJson.dependencies).sort()) !== JSON.stringify(Object.entries(lockRoot.dependencies).sort())) {
  fail("runtime dependencies in package.json and package-lock.json must match");
}

const indexHtml = await readFile(path.join(root, "dist/index.html"), "utf8");
if (/\b(?:src|href)=["']\/assets\//u.test(indexHtml)) {
  fail("dist/index.html contains absolute /assets paths");
}
if (!/\b(?:src|href)=["']\.\/assets\//u.test(indexHtml)) {
  fail("dist/index.html does not contain relative ./assets paths");
}
if (!indexHtml.includes("Content-Security-Policy")) {
  fail("dist/index.html does not contain a production Content Security Policy");
}

const compiledMain = await readFile(path.join(root, "dist-electron/main.js"), "utf8");
if (!compiledMain.includes('"preload.cjs"')) {
  fail("compiled Electron main does not reference preload.cjs");
}
if (!compiledMain.includes("requestSingleInstanceLock") || !compiledMain.includes("onBeforeRequest")) {
  fail("compiled Electron main is missing single-instance or production network hardening");
}

const compiledPreload = await readFile(path.join(root, "dist-electron/preload.cjs"), "utf8");
for (const bridgeMethod of ["getAppInfo", "exportBackup", "importBackup", "openTechnicalLog", "getUpdateState", "checkForUpdates", "downloadUpdate", "installUpdate", "onUpdateState"]) {
  if (!compiledPreload.includes(bridgeMethod)) {
    fail(`compiled preload is missing ${bridgeMethod}`);
  }
}

const builderConfig = await readFile(path.join(root, "electron-builder.yml"), "utf8");
const buildWorkflow = await readFile(path.join(root, ".github/workflows/build-installers.yml"), "utf8");
if (!/^afterSign:\s+scripts\/notarize-macos\.cjs\s*$/mu.test(builderConfig)) {
  fail("afterSign must be configured at the top level of electron-builder.yml");
}
if (!/^appId:\s+com\.dw\.formatter\s*$/mu.test(builderConfig) || !/^productName:\s+Formatter\s*$/mu.test(builderConfig)) {
  fail("appId and productName must remain stable for offline upgrades");
}
const config = load(builderConfig);
if (config.publish?.provider !== "github" || config.publish.owner !== "YuriySemerey" || config.publish.repo !== "Formatter" || config.publish.releaseType !== "release") {
  fail("GitHub update provider must target YuriySemerey/Formatter stable releases");
}
if (config.mac?.identity !== null) fail("macOS builds must use the agreed unsigned/manual-update mode");
for (const script of ["pack", "dist:mac", "dist:win"]) {
  if (!packageJson.scripts?.[script]?.includes("--publish never")) fail(`${script} must not publish from local builds`);
}
if (!packageJson.author) {
  fail("package.json must contain author metadata");
}
const workflow = load(buildWorkflow);
const publish = workflow.jobs?.publish;
if (!buildWorkflow.includes("npm run smoke:electron") || !publish?.needs?.includes("macos") || !publish.needs.includes("windows")) {
  fail("release publication must wait for verified macOS and Windows builds");
}
if (!publish.if?.includes("startsWith(github.ref, 'refs/tags/v')") || !publish.if.includes("github.event_name == 'push'") || publish.permissions?.contents !== "write" || workflow.on?.push?.branches) {
  fail("only a version tag may publish a release; ordinary pushes must not publish");
}
if (!buildWorkflow.includes("release-assets.mjs release") || !buildWorkflow.includes("--draft") || !buildWorkflow.includes("--draft=false --latest")) {
  fail("workflow must validate complete assets and publish a fully uploaded draft");
}
if (!buildWorkflow.includes("node scripts/windows-update-smoke.mjs")) {
  fail("Windows CI must verify a native update and persistence between installed versions");
}
const compiledUpdates = await readFile(path.join(root, "dist-electron/updateService.js"), "utf8");
if (!compiledUpdates.includes("YuriySemerey/Formatter") || !compiledUpdates.includes("autoDownload = false") || !compiledUpdates.includes("autoInstallOnAppQuit = false")) {
  fail("compiled update service must use the agreed repository and require user actions");
}

const changelog = await readFile(path.join(root, "CHANGELOG.md"), "utf8");
if (!changelog.includes(`## ${packageJson.version}`)) {
  fail(`CHANGELOG.md does not contain version ${packageJson.version}`);
}

const nodeMajor = Number(process.versions.node.split(".")[0]);
if (nodeMajor < 22 || nodeMajor >= 25) {
  fail(`Node ${process.versions.node} is unsupported; use Node 22, 23, or 24`);
}

console.log("Release preflight passed: dependencies, assets, Electron IPC, update provider, and tag-only publication are valid.");
