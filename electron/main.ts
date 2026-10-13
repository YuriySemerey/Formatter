import { app, BrowserWindow, ipcMain, clipboard, dialog, session, shell } from "electron";
import type { OpenDialogOptions, SaveDialogOptions } from "electron";
import { createUpdateService, loadWindowsUpdater, readLatestGitHubRelease } from "./updateService.js";
import { appendFile, mkdir, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { mkdirSync } from "node:fs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

interface WindowPinState {
  requested: boolean;
  applied: boolean;
  isElectron: true;
  platform: NodeJS.Platform;
  alwaysOnTop: boolean;
  error?: string;
}

type BrandQualityCategory = "original" | "premiumReplacement" | "valueReplacement" | "budgetReplacement" | "unknown";

interface BrandOverrideRecord {
  displayName: string;
  aliases?: string[];
  category: BrandQualityCategory;
  country: string;
  isOriginal?: boolean;
  updatedAt: string;
  source: "user";
}

interface AppBackupInput {
  settings: unknown;
  history: unknown;
  brandOverrides: unknown;
}

interface AppBackupFile {
  schemaVersion: 1;
  createdAt: string;
  appVersion: string;
  settings: Record<string, unknown>;
  history: BackupHistoryItem[];
  brandOverrides: BrandOverrideRecord[];
}

interface BackupHistoryItem {
  id: string;
  createdAt: string;
  output: string;
}

type TechnicalLogLevel = "info" | "warning" | "error";

const BRAND_OVERRIDE_FILE_NAME = "avto-pro-brand-overrides.json";
const BACKUP_FILE_NAME = "formatter-backup.json";
const BACKUP_SCHEMA_VERSION = 1;
const TECHNICAL_LOG_FILE_NAME = "formatter.log";
const PREVIOUS_TECHNICAL_LOG_FILE_NAME = "formatter.previous.log";
const MAX_TECHNICAL_LOG_BYTES = 2 * 1024 * 1024;
const BRAND_CATEGORIES: BrandQualityCategory[] = ["original", "premiumReplacement", "valueReplacement", "budgetReplacement", "unknown"];
const IS_SMOKE_TEST = process.argv.includes("--smoke-test");
let mainWindow: BrowserWindow | null = null;
let logWriteQueue: Promise<void> = Promise.resolve();

if (IS_SMOKE_TEST) {
  const smokeDataPath = path.join(app.getPath("temp"), `Formatter-smoke-${process.pid}`);
  mkdirSync(smokeDataPath, { recursive: true });
  app.setPath("userData", smokeDataPath);
  app.setPath("sessionData", smokeDataPath);
  app.commandLine.appendSwitch("disable-gpu");
}

function createWindow() {
  const window = new BrowserWindow({
    width: 1320,
    height: 860,
    minWidth: 1040,
    minHeight: 720,
    title: "Formatter",
    show: !IS_SMOKE_TEST,
    backgroundColor: "#f7f3ed",
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  mainWindow = window;
  window.on("closed", () => {
    if (mainWindow === window) {
      mainWindow = null;
    }
  });

  const devServerUrl = process.env.VITE_DEV_SERVER_URL;
  hardenWindow(window, devServerUrl);
  void loadRenderer(window, devServerUrl);

  return window;
}

function hardenWindow(window: BrowserWindow, devServerUrl: string | undefined) {
  window.webContents.setWindowOpenHandler(({ url }) => {
    writeTechnicalLog("warning", `Blocked renderer window request: ${url}`);
    return { action: "deny" };
  });

  window.webContents.on("will-navigate", (event, url) => {
    if (isAllowedRendererUrl(url, devServerUrl)) {
      return;
    }

    event.preventDefault();
    writeTechnicalLog("warning", `Blocked renderer navigation: ${url}`);
  });

  window.webContents.on("render-process-gone", (_event, details) => {
    writeTechnicalLog("error", `Renderer process stopped: ${details.reason} (${details.exitCode})`);
  });

  window.webContents.on("preload-error", (_event, preloadPath, error) => {
    writeTechnicalLog("error", `Preload failed (${preloadPath}): ${error.stack || error.message}`);
  });
}

function isAllowedRendererUrl(url: string, devServerUrl: string | undefined) {
  if (!devServerUrl) {
    return url.startsWith("file:") || url.startsWith("data:text/html");
  }

  try {
    return new URL(url).origin === new URL(devServerUrl).origin;
  } catch {
    return false;
  }
}

async function loadRenderer(window: BrowserWindow, devServerUrl: string | undefined) {
  try {
    if (devServerUrl) {
      await window.loadURL(devServerUrl);
    } else {
      await window.loadFile(path.join(__dirname, "../dist/index.html"));
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    writeTechnicalLog("error", `Renderer failed to load: ${message}`);
    await showRendererLoadError(window, message);
  }
}

async function showRendererLoadError(window: BrowserWindow, technicalMessage: string) {
  const html = `<!doctype html><html lang="uk"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>body{margin:0;background:#f7f3ed;color:#29231f;font:16px system-ui,sans-serif;display:grid;min-height:100vh;place-items:center}.box{max-width:560px;padding:32px;border:1px solid #d8cec2;border-radius:8px;background:#fffaf4}h1{font-size:22px;margin:0 0 12px}p{line-height:1.5;margin:0 0 8px}code{font-size:13px;word-break:break-word}</style></head><body><main class="box"><h1>Formatter не вдалося запустити</h1><p>Закрийте програму та спробуйте відкрити її знову.</p><p>Технічна причина:</p><code>${escapeHtml(technicalMessage)}</code></main></body></html>`;

  try {
    await window.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);
  } catch (error) {
    writeTechnicalLog("error", `Fallback error page failed to load: ${error instanceof Error ? error.message : String(error)}`);
  }
}

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/gu, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character] ?? character);
}

function runSmokeTest(window: BrowserWindow) {
  const timeout = setTimeout(() => {
    console.error("ELECTRON_SMOKE_FAILED: timed out while loading the production renderer");
    app.exit(1);
  }, 15_000);

  window.webContents.once("did-fail-load", (_event, errorCode, errorDescription) => {
    clearTimeout(timeout);
    console.error(`ELECTRON_SMOKE_FAILED: ${errorCode} ${errorDescription}`);
    app.exit(1);
  });

  window.webContents.once("did-finish-load", async () => {
    try {
      const result = await window.webContents.executeJavaScript(`(() => ({
        rootPresent: Boolean(document.getElementById("root")),
        hasFormatterUi: Boolean(document.querySelector(".app-shell")),
        hasFormatterApp: typeof window.formatterApp === "object",
        hasAlwaysOnTop: typeof window.formatterApp?.setAlwaysOnTop === "function",
        hasBrandOverrides: typeof window.formatterApp?.loadBrandOverrides === "function",
        hasBackup: typeof window.formatterApp?.exportBackup === "function" && typeof window.formatterApp?.importBackup === "function",
        hasAppInfo: typeof window.formatterApp?.getAppInfo === "function",
        hasTechnicalLog: typeof window.formatterApp?.openTechnicalLog === "function",
        hasUpdates: typeof window.formatterApp?.getUpdateState === "function" && typeof window.formatterApp?.checkForUpdates === "function" && typeof window.formatterApp?.downloadUpdate === "function" && typeof window.formatterApp?.installUpdate === "function" && typeof window.formatterApp?.onUpdateState === "function"
      }))()`);

      if (
        !result.rootPresent ||
        !result.hasFormatterUi ||
        !result.hasFormatterApp ||
        !result.hasAlwaysOnTop ||
        !result.hasBrandOverrides ||
        !result.hasBackup ||
        !result.hasAppInfo ||
        !result.hasTechnicalLog ||
        !result.hasUpdates
      ) {
        throw new Error(`renderer/preload check failed: ${JSON.stringify(result)}`);
      }

      const updateState = await window.webContents.executeJavaScript("window.formatterApp.getUpdateState()");
      if (updateState.status !== "unavailable") throw new Error("Smoke test must not enable network updates");

      clearTimeout(timeout);
      console.log("ELECTRON_SMOKE_PASSED: production renderer and preload IPC are available");
      app.exit(0);
    } catch (error) {
      clearTimeout(timeout);
      console.error(`ELECTRON_SMOKE_FAILED: ${error instanceof Error ? error.message : String(error)}`);
      app.exit(1);
    }
  });
}

function getBrandOverridesPath() {
  return path.join(app.getPath("userData"), BRAND_OVERRIDE_FILE_NAME);
}

function getTechnicalLogPath() {
  return path.join(app.getPath("userData"), "logs", TECHNICAL_LOG_FILE_NAME);
}

function getPreviousTechnicalLogPath() {
  return path.join(app.getPath("userData"), "logs", PREVIOUS_TECHNICAL_LOG_FILE_NAME);
}

async function readBrandOverrides() {
  try {
    const raw = await readTextWithRecovery(getBrandOverridesPath());
    return validateBrandOverrides(JSON.parse(raw));
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") {
      return [];
    }

    throw error;
  }
}

async function writeBrandOverrides(overrides: unknown) {
  const validated = validateBrandOverrides(overrides);
  await writeTextAtomic(getBrandOverridesPath(), `${JSON.stringify(validated, null, 2)}\n`);
  return validated;
}

async function writeTextAtomic(filePath: string, contents: string) {
  await mkdir(path.dirname(filePath), { recursive: true });
  const temporaryPath = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  const recoveryPath = `${filePath}.recovery`;

  try {
    await writeFile(temporaryPath, contents, "utf8");
    try {
      await rename(temporaryPath, filePath);
    } catch (error) {
      if (!isReplaceFileError(error)) {
        throw error;
      }

      await rm(recoveryPath, { force: true });
      let hasRecoveryFile = false;
      try {
        await rename(filePath, recoveryPath);
        hasRecoveryFile = true;
      } catch (moveError) {
        if (!isMissingFileError(moveError)) {
          throw moveError;
        }
      }

      try {
        await rename(temporaryPath, filePath);
        await rm(recoveryPath, { force: true });
      } catch (replacementError) {
        if (hasRecoveryFile) {
          await rename(recoveryPath, filePath).catch(() => undefined);
        }
        throw replacementError;
      }
    }
  } finally {
    await rm(temporaryPath, { force: true }).catch(() => undefined);
  }
}

async function readTextWithRecovery(filePath: string) {
  const recoveryPath = `${filePath}.recovery`;
  try {
    const contents = await readFile(filePath, "utf8");
    await rm(recoveryPath, { force: true }).catch(() => undefined);
    return contents;
  } catch (error) {
    if (!isMissingFileError(error)) {
      throw error;
    }

    const contents = await readFile(recoveryPath, "utf8");
    await rename(recoveryPath, filePath);
    return contents;
  }
}

function isReplaceFileError(error: unknown) {
  if (!error || typeof error !== "object" || !("code" in error)) {
    return false;
  }

  return error.code === "EEXIST" || error.code === "EPERM" || error.code === "EACCES";
}

function writeTechnicalLog(level: TechnicalLogLevel, message: string) {
  const safeMessage = cleanupText(message).slice(0, 4_000);
  if (!safeMessage) {
    return;
  }

  logWriteQueue = logWriteQueue
    .then(async () => {
      const logPath = getTechnicalLogPath();
      await mkdir(path.dirname(logPath), { recursive: true });
      await rotateTechnicalLog(logPath);
      await appendFile(logPath, `${new Date().toISOString()} ${level.toUpperCase()} ${safeMessage}\n`, "utf8");
    })
    .catch((error) => {
      console.error(`Failed to write technical log: ${error instanceof Error ? error.message : String(error)}`);
    });
}

async function rotateTechnicalLog(logPath: string) {
  try {
    const details = await stat(logPath);
    if (details.size < MAX_TECHNICAL_LOG_BYTES) {
      return;
    }

    await rm(getPreviousTechnicalLogPath(), { force: true });
    await rename(logPath, getPreviousTechnicalLogPath());
  } catch (error) {
    if (!isMissingFileError(error)) {
      throw error;
    }
  }
}

function isMissingFileError(error: unknown) {
  return Boolean(error && typeof error === "object" && "code" in error && error.code === "ENOENT");
}

function validateBrandOverrides(value: unknown): BrandOverrideRecord[] {
  if (!Array.isArray(value)) {
    throw new Error("brand-overrides-must-be-array");
  }

  const seen = new Set<string>();
  return value.map((item) => {
    if (!item || typeof item !== "object") {
      throw new Error("brand-override-must-be-object");
    }

    const candidate = item as Partial<BrandOverrideRecord>;
    const displayName = cleanupText(candidate.displayName);
    const country = cleanupText(candidate.country);
    const category = candidate.category;

    if (!displayName || !country || !BRAND_CATEGORIES.includes(category as BrandQualityCategory)) {
      throw new Error("brand-override-has-invalid-fields");
    }

    const key = normalizeBrandKey(displayName);
    if (!key || seen.has(key)) {
      throw new Error("brand-override-duplicate-brand");
    }

    seen.add(key);

    return {
      displayName,
      aliases: Array.isArray(candidate.aliases) ? candidate.aliases.map(cleanupText).filter(Boolean) : [],
      category: category as BrandQualityCategory,
      country,
      isOriginal: Boolean(candidate.isOriginal || category === "original"),
      updatedAt: typeof candidate.updatedAt === "string" && candidate.updatedAt ? candidate.updatedAt : new Date().toISOString(),
      source: "user"
    };
  });
}

function createBackupFile(value: unknown): AppBackupFile {
  if (!isRecord(value)) {
    throw new Error("backup-input-must-be-object");
  }

  const input = value as unknown as AppBackupInput;
  return {
    schemaVersion: BACKUP_SCHEMA_VERSION,
    createdAt: new Date().toISOString(),
    appVersion: app.getVersion(),
    settings: validateBackupSettings(input.settings),
    history: validateBackupHistory(input.history),
    brandOverrides: validateBrandOverrides(input.brandOverrides)
  };
}

function validateBackupFile(value: unknown): AppBackupFile {
  if (!isRecord(value) || value.schemaVersion !== BACKUP_SCHEMA_VERSION) {
    throw new Error("backup-schema-is-not-supported");
  }

  return {
    schemaVersion: BACKUP_SCHEMA_VERSION,
    createdAt: cleanupText(value.createdAt) || new Date().toISOString(),
    appVersion: cleanupText(value.appVersion) || "unknown",
    settings: validateBackupSettings(value.settings),
    history: validateBackupHistory(value.history),
    brandOverrides: validateBrandOverrides(value.brandOverrides)
  };
}

function validateBackupSettings(value: unknown) {
  if (!isRecord(value)) {
    throw new Error("backup-settings-must-be-object");
  }

  return value;
}

function validateBackupHistory(value: unknown): BackupHistoryItem[] {
  if (!Array.isArray(value)) {
    throw new Error("backup-history-must-be-array");
  }

  return value.slice(0, 2).map((item) => {
    if (!isRecord(item)) {
      throw new Error("backup-history-item-must-be-object");
    }

    const id = cleanupText(item.id);
    const createdAt = cleanupText(item.createdAt);
    const output = typeof item.output === "string" ? item.output.trim() : "";
    if (!id || !createdAt || !output) {
      throw new Error("backup-history-item-has-invalid-fields");
    }

    return { id, createdAt, output };
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function normalizeBrandKey(value: string) {
  return cleanupText(value)
    .toLocaleLowerCase("uk")
    .replace(/&/gu, "and")
    .replace(/\+/gu, "plus")
    .replace(/[^a-zа-яіїєґ0-9]+/giu, "")
    .trim();
}

function cleanupText(value: unknown) {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim() : "";
}

function applyAlwaysOnTop(targetWindow: BrowserWindow, enabled: boolean): WindowPinState {
  const requested = Boolean(enabled);

  try {
    if (requested) {
      targetWindow.setAlwaysOnTop(true, "screen-saver", 1);
      targetWindow.setVisibleOnAllWorkspaces(true, {
        visibleOnFullScreen: true,
        skipTransformProcessType: true
      });
      targetWindow.show();
      targetWindow.moveTop();
      targetWindow.focus();

      if (process.platform === "darwin") {
        app.focus({ steal: true });
      }
    } else {
      targetWindow.setAlwaysOnTop(false);
      targetWindow.setVisibleOnAllWorkspaces(false);
    }

    const alwaysOnTop = targetWindow.isAlwaysOnTop();
    return {
      requested,
      applied: requested ? alwaysOnTop : !alwaysOnTop,
      isElectron: true,
      platform: process.platform,
      alwaysOnTop
    };
  } catch (error) {
    return {
      requested,
      applied: false,
      isElectron: true,
      platform: process.platform,
      alwaysOnTop: targetWindow.isAlwaysOnTop(),
      error: error instanceof Error ? error.message : "unknown-error"
    };
  }
}

function installProductionNetworkGuard() {
  if (process.env.VITE_DEV_SERVER_URL) {
    return;
  }

  session.defaultSession.webRequest.onBeforeRequest(
    { urls: ["http://*/*", "https://*/*"] },
    (details, callback) => {
      writeTechnicalLog("warning", `Blocked production network request: ${details.url}`);
      callback({ cancel: true });
    }
  );
}

function focusMainWindow() {
  if (!mainWindow) {
    return;
  }

  if (mainWindow.isMinimized()) {
    mainWindow.restore();
  }
  mainWindow.show();
  mainWindow.moveTop();
  mainWindow.focus();
}

process.on("uncaughtExceptionMonitor", (error) => {
  writeTechnicalLog("error", `Uncaught exception: ${error.stack || error.message}`);
});

process.on("unhandledRejection", (reason) => {
  const message = reason instanceof Error ? reason.stack || reason.message : String(reason);
  writeTechnicalLog("error", `Unhandled rejection: ${message}`);
  console.error(reason);
});

const hasSingleInstanceLock = app.requestSingleInstanceLock();
if (!hasSingleInstanceLock) {
  app.quit();
} else {
  app.on("second-instance", () => {
    writeTechnicalLog("warning", "A second Formatter instance was blocked");
    focusMainWindow();
  });

app.whenReady().then(() => {
  app.setAppUserModelId("com.dw.formatter");
  installProductionNetworkGuard();
  writeTechnicalLog("info", `Formatter ${app.getVersion()} started (${process.platform} ${process.arch})`);

  const updates = createUpdateService({
    enabled: app.isPackaged && !IS_SMOKE_TEST && !process.env.VITE_DEV_SERVER_URL,
    platform: process.platform,
    arch: process.arch,
    version: app.getVersion(),
    loadNativeUpdater: loadWindowsUpdater,
    readLatestRelease: readLatestGitHubRelease,
    openExternal: (url) => shell.openExternal(url),
    confirmInstall: async () => {
      const options = {
        type: "question" as const,
        title: "Оновлення Formatter",
        message: "Перезапустити Formatter та встановити оновлення?",
        detail: "Незбережений вхідний текст буде втрачено. Налаштування, історія та правки брендів збережуться.",
        buttons: ["Оновити й перезапустити", "Скасувати"],
        defaultId: 1,
        cancelId: 1
      };
      const result = mainWindow ? await dialog.showMessageBox(mainWindow, options) : await dialog.showMessageBox(options);
      return result.response === 0;
    },
    onState: (state) => {
      if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send("updates:state", state);
    },
    log: writeTechnicalLog
  });
  function validateUpdateSender(event: Electron.IpcMainInvokeEvent) {
    if (event.sender !== mainWindow?.webContents || event.senderFrame !== event.sender.mainFrame) {
      throw new Error("untrusted-update-sender");
    }
  }
  ipcMain.handle("updates:getState", (event) => { validateUpdateSender(event); return updates.getState(); });
  ipcMain.handle("updates:check", (event) => { validateUpdateSender(event); return updates.check(); });
  ipcMain.handle("updates:download", (event) => { validateUpdateSender(event); return updates.download(); });
  ipcMain.handle("updates:install", (event) => { validateUpdateSender(event); return updates.install(); });

  ipcMain.handle("clipboard:writeText", (_event, text: string) => {
    clipboard.writeText(text);
  });

  ipcMain.handle("window:setAlwaysOnTop", (event, enabled: boolean) => {
    const targetWindow = BrowserWindow.fromWebContents(event.sender);
    if (!targetWindow) {
      return {
        requested: Boolean(enabled),
        applied: false,
        isElectron: true,
        platform: process.platform,
        alwaysOnTop: false,
        error: "window-not-found"
      } satisfies WindowPinState;
    }

    return applyAlwaysOnTop(targetWindow, Boolean(enabled));
  });

  ipcMain.handle("brands:loadOverrides", async () => {
    return readBrandOverrides();
  });

  ipcMain.handle("brands:saveOverrides", async (_event, overrides: unknown) => {
    return writeBrandOverrides(overrides);
  });

  ipcMain.handle("brands:exportOverrides", async (event, overrides: unknown) => {
    const targetWindow = BrowserWindow.fromWebContents(event.sender);
    const saveOptions: SaveDialogOptions = {
      title: "Експорт бази правок брендів",
      defaultPath: BRAND_OVERRIDE_FILE_NAME,
      filters: [{ name: "JSON", extensions: ["json"] }]
    };
    const result = targetWindow ? await dialog.showSaveDialog(targetWindow, saveOptions) : await dialog.showSaveDialog(saveOptions);

    if (result.canceled || !result.filePath) {
      return { canceled: true };
    }

    const validated = validateBrandOverrides(overrides);
    await writeTextAtomic(result.filePath, `${JSON.stringify(validated, null, 2)}\n`);
    return { canceled: false, filePath: result.filePath };
  });

  ipcMain.handle("brands:importOverrides", async (event) => {
    const targetWindow = BrowserWindow.fromWebContents(event.sender);
    const openOptions: OpenDialogOptions = {
      title: "Імпорт бази правок брендів",
      properties: ["openFile"],
      filters: [{ name: "JSON", extensions: ["json"] }]
    };
    const result = targetWindow ? await dialog.showOpenDialog(targetWindow, openOptions) : await dialog.showOpenDialog(openOptions);

    if (result.canceled || result.filePaths.length === 0) {
      return { canceled: true, overrides: [] };
    }

    const filePath = result.filePaths[0];
    const raw = await readFile(filePath, "utf8");
    const overrides = await writeBrandOverrides(JSON.parse(raw));
    return { canceled: false, filePath, overrides };
  });

  ipcMain.handle("app:getInfo", () => ({
    name: app.getName(),
    version: app.getVersion(),
    platform: process.platform,
    arch: process.arch
  }));

  ipcMain.handle("backup:export", async (event, input: unknown) => {
    const targetWindow = BrowserWindow.fromWebContents(event.sender);
    const saveOptions: SaveDialogOptions = {
      title: "Експорт резервної копії Formatter",
      defaultPath: BACKUP_FILE_NAME,
      filters: [{ name: "JSON", extensions: ["json"] }]
    };
    const result = targetWindow ? await dialog.showSaveDialog(targetWindow, saveOptions) : await dialog.showSaveDialog(saveOptions);
    if (result.canceled || !result.filePath) {
      return { canceled: true };
    }

    const backup = createBackupFile(input);
    await writeTextAtomic(result.filePath, `${JSON.stringify(backup, null, 2)}\n`);
    writeTechnicalLog("info", `Backup exported: ${result.filePath}`);
    return { canceled: false, filePath: result.filePath };
  });

  ipcMain.handle("backup:import", async (event) => {
    const targetWindow = BrowserWindow.fromWebContents(event.sender);
    const openOptions: OpenDialogOptions = {
      title: "Імпорт резервної копії Formatter",
      properties: ["openFile"],
      filters: [{ name: "JSON", extensions: ["json"] }]
    };
    const result = targetWindow ? await dialog.showOpenDialog(targetWindow, openOptions) : await dialog.showOpenDialog(openOptions);
    if (result.canceled || result.filePaths.length === 0) {
      return { canceled: true };
    }

    const filePath = result.filePaths[0];
    const backup = validateBackupFile(JSON.parse(await readFile(filePath, "utf8")));
    writeTechnicalLog("info", `Backup imported: ${filePath}`);
    return { canceled: false, filePath, backup };
  });

  ipcMain.handle("logs:append", (_event, level: TechnicalLogLevel, message: string) => {
    if (level !== "info" && level !== "warning" && level !== "error") {
      throw new Error("invalid-log-level");
    }

    writeTechnicalLog(level, message);
  });

  ipcMain.handle("logs:openFile", async () => {
    writeTechnicalLog("info", "Technical log opened from settings");
    await logWriteQueue;
    const logPath = getTechnicalLogPath();
    const openError = await shell.openPath(logPath);
    if (openError) {
      shell.showItemInFolder(logPath);
    }

    return { filePath: logPath, error: openError || undefined };
  });

  ipcMain.handle("logs:clearFile", async () => {
    await logWriteQueue;
    await writeTextAtomic(getTechnicalLogPath(), "");
    await rm(getPreviousTechnicalLogPath(), { force: true });
    return { filePath: getTechnicalLogPath() };
  });

  const window = createWindow();
  if (IS_SMOKE_TEST) {
    runSmokeTest(window);
  }

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

  app.on("window-all-closed", () => {
    if (process.platform !== "darwin") {
      app.quit();
    }
  });
}
