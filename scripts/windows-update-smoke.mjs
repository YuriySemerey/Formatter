// Native NSIS update test on a disposable GitHub Windows runner.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { createReadStream } from "node:fs";
import { cp, mkdir, mkdtemp, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { build, Platform, Arch } from "electron-builder";
import { extractFile, uncache } from "@electron/asar";
import { load } from "js-yaml";

assert.equal(process.platform, "win32", "Run this test on Windows");
assert(process.env.CI, "Run this test on a disposable CI runner");
const root = process.cwd();
const current = JSON.parse(await readFile("package.json", "utf8"));
const temp = await mkdtemp(path.join(os.tmpdir(), "Formatter-update-"));
const staging = path.join(temp, "electron");
const harness = path.join(temp, "harness");
const baselineOutput = path.join(temp, "baseline");
const installDir = path.join(temp, "installed");
const reportPath = path.join(temp, "report.json");
const requests = [];
const server = createServer(async (request, response) => {
  try {
    const filename = decodeURIComponent(new URL(request.url, "http://127.0.0.1").pathname).slice(1);
    assert(filename && !filename.includes("/") && !filename.includes("\\") && !filename.includes(".."));
    const file = path.join(root, "release", filename);
    const info = await stat(file);
    if (filename.endsWith(".exe")) {
      const report = JSON.parse(await readFile(reportPath, "utf8"));
      assert.equal(report.phase, "checked", "Installer download must follow an explicit download call");
    }
    requests.push(filename);
    response.writeHead(200, { "Content-Length": info.size, "Content-Type": "application/octet-stream" });
    createReadStream(file).pipe(response);
  } catch (error) { response.writeHead(404); response.end(String(error)); }
});
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const feed = `http://127.0.0.1:${server.address().port}/`;
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
function run(file, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(file, args, { stdio: "inherit", ...options });
    const timer = setTimeout(() => { child.kill(); reject(new Error(`${file} timed out`)); }, 180_000);
    child.on("error", (error) => { clearTimeout(timer); reject(error); });
    child.on("exit", (code) => { clearTimeout(timer); code === 0 ? resolve() : reject(new Error(`${file} exited ${code}`)); });
  });
}
const quotePowerShell = (value) => `'${value.replaceAll("'", "''")}'`;
async function install(file) {
  const command = `$p=Start-Process -FilePath ${quotePowerShell(file)} -ArgumentList @('/S',${quotePowerShell(`/D=${installDir}`)}) -Wait -PassThru; exit $p.ExitCode`;
  await run("powershell.exe", ["-NoProfile", "-NonInteractive", "-EncodedCommand", Buffer.from(command, "utf16le").toString("base64")]);
}
async function connectRenderer(port) {
  for (let attempt = 0; attempt < 150; attempt++) {
    try {
      const targets = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
      const page = targets.find((target) => target.type === "page" && target.url.startsWith("file:") && target.webSocketDebuggerUrl);
      if (page) {
        const socket = new WebSocket(page.webSocketDebuggerUrl);
        await new Promise((resolve, reject) => { socket.addEventListener("open", resolve, { once: true }); socket.addEventListener("error", reject, { once: true }); });
        let id = 0;
        const pending = new Map();
        socket.addEventListener("message", (event) => {
          const message = JSON.parse(event.data);
          const response = pending.get(message.id);
          if (response) { pending.delete(message.id); message.error ? response.reject(new Error(JSON.stringify(message.error))) : response.resolve(message.result); }
        });
        return {
          socket,
          async evaluate(expression) {
            const result = await new Promise((resolve, reject) => {
              const requestId = ++id;
              const timer = setTimeout(() => { pending.delete(requestId); reject(new Error("Renderer evaluation timed out")); }, 15_000);
              pending.set(requestId, { resolve: (result) => { clearTimeout(timer); resolve(result); }, reject: (error) => { clearTimeout(timer); reject(error); } });
              socket.send(JSON.stringify({ id: requestId, method: "Runtime.evaluate", params: { expression, awaitPromise: true, returnByValue: true } }));
            });
            if (result.exceptionDetails) throw new Error(JSON.stringify(result.exceptionDetails));
            return result.result.value;
          }
        };
      }
    } catch { /* Electron may still be starting. */ }
    await pause(200);
  }
  throw new Error("Updated renderer did not start");
}

let updatedProcess;
let renderer;
try {
  await mkdir(staging, { recursive: true });
  await mkdir(harness, { recursive: true });
  await cp(path.join(root, "scripts/windows-update-test-main.cjs"), path.join(harness, "update-test-main.cjs"));
  await cp(path.join(root, "dist-electron"), staging, { recursive: true });
  const servicePath = path.join(staging, "updateService.js");
  let service = await readFile(servicePath, "utf8");
  const marker = "    return updater;\n}\nexport function stableVersion";
  assert.equal(service.split(marker).length, 2, "Updater adapter changed; revise the test injection");
  service = service.replace(marker, `
    updater.setFeedURL({provider:'generic',url:${JSON.stringify(feed)}});
    updater.disableDifferentialDownload = true;
    updater.installDirectory = process.env.FORMATTER_UPDATE_TEST_INSTALL_DIR;
    const originalInstall = updater.quitAndInstall.bind(updater);
    updater.quitAndInstall = (isSilent, isForceRunAfter) => {
      const fs = require('node:fs');
      const report = JSON.parse(fs.readFileSync(process.env.FORMATTER_UPDATE_TEST_REPORT,'utf8'));
      if (isSilent !== false || isForceRunAfter !== true) throw new Error('Unexpected production install arguments');
      fs.writeFileSync(process.env.FORMATTER_UPDATE_TEST_REPORT,JSON.stringify({...report,installRequested:true,isSilent,isForceRunAfter}));
      originalInstall(true,false); // Silent installation is used only to automate CI.
    };
    return updater;\n}\nexport function stableVersion`);
  // The compiled service is ESM, so use the fs module from a dynamic import.
  service = service.replace("const fs = require('node:fs');", "const fs = testFs;");
  service = "import * as testFs from 'node:fs';\n" + service;
  await writeFile(servicePath, service);
  const config = load(await readFile("electron-builder.yml", "utf8"));
  // An explicit config file avoids merging the production file globs with the
  // staged test files, which would package the original update service twice.
  const testConfigPath = path.join(temp, "test-builder.json");
  await writeFile(testConfigPath, JSON.stringify({
    ...config,
    directories: { ...config.directories, output: baselineOutput },
    extraMetadata: { version: "0.2.99", main: "update-test-main.cjs" },
    publish: { provider: "generic", url: feed },
    files: ["dist/**/*", "package.json", { from: staging, to: "dist-electron" }, { from: harness, to: "." }]
  }, null, 2));
  await build({
    targets: Platform.WINDOWS.createTarget("nsis", Arch.x64),
    publish: "never",
    config: testConfigPath
  });
  const testArchive = path.join(baselineOutput, "win-unpacked/resources/app.asar");
  const packagedService = extractFile(testArchive, "dist-electron/updateService.js").toString();
  assert(packagedService.includes(feed) && packagedService.includes("originalInstall(true,false)"), "The temporary installer must contain the test feed and installer automation");
  await install(path.join(baselineOutput, "Formatter-0.2.99-win-x64.exe"));
  const executable = path.join(installDir, "Formatter.exe");
  const env = { ...process.env, FORMATTER_UPDATE_TEST_REPORT: reportPath, FORMATTER_UPDATE_TEST_INSTALL_DIR: installDir, FORMATTER_UPDATE_TEST_TARGET_VERSION: current.version };
  await run(executable, ["--update-test-prepare"], { env });
  const prepared = JSON.parse(await readFile(reportPath, "utf8"));
  assert.equal(prepared.version, "0.2.99");
  assert.equal(prepared.phase, "prepared");
  await run(executable, ["--update-test-upgrade"], { env });
  const upgraded = JSON.parse(await readFile(reportPath, "utf8"));
  assert.equal(upgraded.installRequested, true);
  assert(upgraded.states.includes("downloading") && upgraded.states.includes("downloaded"));
  assert(requests.includes("latest.yml") && requests.includes(`Formatter-${current.version}-win-x64.exe`));
  let installed;
  for (let attempt = 0; attempt < 300; attempt++) {
    try {
      const archive = path.join(installDir, "resources/app.asar");
      uncache(archive);
      installed = JSON.parse(extractFile(archive, "package.json").toString());
      if (installed.version === current.version) break;
    } catch { /* NSIS may still be replacing the archive. */ }
    await pause(200);
  }
  assert.equal(installed?.version, current.version, "NSIS must replace the installed application");
  assert.equal(installed.main, current.main, "The final app must use the unmodified production entry point");
  await pause(1_000);
  const portReservation = createServer();
  await new Promise((resolve) => portReservation.listen(0, "127.0.0.1", resolve));
  const port = portReservation.address().port;
  await new Promise((resolve) => portReservation.close(resolve));
  updatedProcess = spawn(executable, [`--remote-debugging-port=${port}`, "--disable-gpu"], { stdio: "inherit" });
  renderer = await connectRenderer(port);
  let saved;
  for (let attempt = 0; attempt < 100; attempt++) {
    saved = await renderer.evaluate(`(async () => window.formatterApp && document.querySelector('.app-shell') ? ({app:await window.formatterApp.getAppInfo(),settings:JSON.parse(localStorage.getItem('formatter.settings.v2'))?.settings,history:JSON.parse(localStorage.getItem('formatter.history.v1')),brands:await window.formatterApp.loadBrandOverrides()}) : null)()`);
    if (saved) break;
    await pause(100);
  }
  assert.equal(saved?.app.version, current.version);
  assert.equal(saved.settings.showBrandCountry, false);
  assert.equal(saved.settings.showBrandCategory, true);
  assert.equal(saved.settings.darkMode, true);
  assert.equal(saved.history[0].output, "Saved before update");
  assert.equal(saved.brands[0].country, "Test country");
  await mkdir("artifacts", { recursive: true });
  await writeFile("artifacts/windows-update-test.json", JSON.stringify({ from: "0.2.99", to: current.version, upgraded, saved, requests }, null, 2));
  console.log("WINDOWS_UPDATE_SMOKE_PASSED: explicit download, native NSIS upgrade, and persisted settings/history/brands verified");
} finally {
  renderer?.socket.close();
  updatedProcess?.kill();
  await new Promise((resolve) => server.close(resolve));
}
