import type { UpdateState } from "./updateTypes.js";

export const UPDATE_REPOSITORY = "YuriySemerey/Formatter";
export const LATEST_RELEASE_API = `https://api.github.com/repos/${UPDATE_REPOSITORY}/releases/latest`;

interface UpdateInfo { version: string }

// The small adapter keeps Electron and network operations out of service tests.
export interface NativeUpdater {
  autoDownload: boolean;
  autoInstallOnAppQuit: boolean;
  allowPrerelease: boolean;
  allowDowngrade: boolean;
  on(event: "checking-for-update", listener: () => void): unknown;
  on(event: "update-available" | "update-not-available" | "update-downloaded", listener: (info: UpdateInfo) => void): unknown;
  on(event: "download-progress", listener: (progress: { percent: number }) => void): unknown;
  on(event: "error", listener: (error: Error) => void): unknown;
  checkForUpdates(): Promise<{ updateInfo: UpdateInfo } | null>;
  downloadUpdate(): Promise<string[]>;
  quitAndInstall(isSilent?: boolean, isForceRunAfter?: boolean): void;
}

interface ServiceOptions {
  enabled: boolean;
  platform: string;
  arch: string;
  version: string;
  loadNativeUpdater: () => Promise<NativeUpdater>;
  readLatestRelease: () => Promise<unknown | null>;
  openExternal: (url: string) => Promise<void>;
  confirmInstall: () => Promise<boolean>;
  onState: (state: UpdateState) => void;
  log: (level: "info" | "warning" | "error", message: string) => void;
}

export async function readLatestGitHubRelease(): Promise<unknown | null> {
  const response = await fetch(LATEST_RELEASE_API, {
    headers: { Accept: "application/vnd.github+json", "User-Agent": "Formatter" },
    signal: AbortSignal.timeout(15_000)
  });
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`GitHub HTTP ${response.status}`);
  return response.json();
}

export async function loadWindowsUpdater(): Promise<NativeUpdater> {
  // Lazy loading also prevents Electron's updater from starting in dev/smoke mode.
  const module = await import("electron-updater");
  const updater = module.default?.autoUpdater ?? module.autoUpdater;
  if (!updater || typeof updater.checkForUpdates !== "function") {
    throw new Error("electron-updater is not available");
  }
  return updater as NativeUpdater;
}

export function stableVersion(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const match = value.match(/^v?((?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*))$/u);
  if (!match || match[1].split(".").some((part) => !Number.isSafeInteger(Number(part)))) return undefined;
  return match[1];
}

export function isNewerVersion(candidate: string, current: string): boolean {
  const next = stableVersion(candidate);
  const previous = stableVersion(current);
  if (!next || !previous) return false;
  const left = next.split(".").map(Number);
  const right = previous.split(".").map(Number);
  for (let index = 0; index < 3; index++) {
    if (left[index] !== right[index]) return left[index] > right[index];
  }
  return false;
}

export function macInstallerFromRelease(value: unknown, arch: string): { version: string; url: string } | null {
  if (!value || typeof value !== "object") throw new Error("Invalid GitHub release");
  const release = value as { tag_name?: unknown; draft?: unknown; prerelease?: unknown; assets?: unknown };
  if (release.draft || release.prerelease) return null;
  const version = stableVersion(release.tag_name);
  if (!version || !Array.isArray(release.assets) || (arch !== "arm64" && arch !== "x64")) {
    throw new Error("Invalid release version or architecture");
  }
  const name = `Formatter-${version}-mac-${arch}.dmg`;
  const expectedUrl = `https://github.com/${UPDATE_REPOSITORY}/releases/download/v${version}/${name}`;
  const asset = release.assets.find((item: unknown) => {
    return Boolean(item && typeof item === "object" && (item as { name?: unknown }).name === name);
  }) as { browser_download_url?: unknown } | undefined;
  if (!asset || asset.browser_download_url !== expectedUrl) throw new Error("Matching Mac installer is missing");
  return { version, url: expectedUrl };
}

export function createUpdateService(options: ServiceOptions) {
  const available = options.enabled && (options.platform === "win32" || options.platform === "darwin");
  const mode: UpdateState["mode"] = !available ? "unavailable" : options.platform === "win32" ? "automatic" : "manual";
  let state: UpdateState = {
    status: available ? "idle" : "unavailable",
    mode,
    currentVersion: options.version,
    message: available ? "Натисніть кнопку, щоб перевірити нову версію." : "Оновлення доступні у встановленій версії для macOS або Windows."
  };
  let busy = false;
  let nativePromise: Promise<NativeUpdater> | undefined;
  let manualUrl: string | undefined;

  function setState(patch: Partial<UpdateState>) {
    state = { ...state, ...patch };
    options.onState({ ...state });
    if (patch.status && patch.status !== "downloading") {
      options.log(patch.status === "error" ? "error" : "info", `Updates: ${state.status} ${state.availableVersion ?? ""}`);
    }
  }

  function fail(error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    const noRelease = (state.status === "checking" || state.status === "no-release") && /404|No published versions|No latest release|Unable to find latest version on GitHub/iu.test(message);
    setState({
      status: noRelease ? "no-release" : "error",
      downloadPercent: undefined,
      message: noRelease ? "Перший реліз ще не опубліковано." : "Не вдалося виконати оновлення. Перевірте інтернет і спробуйте ще раз."
    });
    options.log("error", `Update operation failed: ${message.slice(0, 500)}`);
  }

  function snapshot(): UpdateState { return { ...state }; }

  async function native() {
    if (!nativePromise) {
      nativePromise = options.loadNativeUpdater().then((updater) => {
        updater.autoDownload = false;
        updater.autoInstallOnAppQuit = false;
        updater.allowPrerelease = false;
        updater.allowDowngrade = false;
        updater.on("update-available", (info) => {
          if (!stableVersion(info.version) || !isNewerVersion(info.version, options.version)) {
            setState({ status: "up-to-date", message: "Встановлено актуальну версію.", availableVersion: undefined });
            return;
          }
          setState({ status: "available", availableVersion: info.version, message: `Доступна версія ${info.version}.` });
        });
        updater.on("update-not-available", () => setState({ status: "up-to-date", availableVersion: undefined, message: "Встановлено актуальну версію." }));
        updater.on("download-progress", (progress) => {
          if (state.status === "downloading" && Number.isFinite(progress.percent)) {
            setState({ downloadPercent: Math.min(100, Math.max(0, progress.percent)) });
          }
        });
        updater.on("update-downloaded", (info) => setState({ status: "downloaded", availableVersion: info.version, downloadPercent: 100, message: "Оновлення завантажено. Можна перезапустити програму." }));
        updater.on("error", fail);
        return updater;
      }).catch((error) => {
        nativePromise = undefined;
        throw error;
      });
    }
    return nativePromise;
  }

  return {
    getState: snapshot,
    async check(): Promise<UpdateState> {
      if (!available || busy || state.status === "downloaded" || state.status === "installing") return { ...state };
      busy = true;
      manualUrl = undefined;
      setState({ status: "checking", availableVersion: undefined, downloadPercent: undefined, message: "Перевіряю оновлення…" });
      try {
        if (mode === "manual") {
          const release = await options.readLatestRelease();
          if (release === null) {
            setState({ status: "no-release", message: "Перший реліз ще не опубліковано." });
          } else {
            const info = release as { tag_name?: unknown; draft?: unknown; prerelease?: unknown };
            const version = stableVersion(info?.tag_name);
            if (info?.draft || info?.prerelease) {
              setState({ status: "up-to-date", message: "Встановлено актуальну версію." });
            } else if (!version) {
              throw new Error("Invalid GitHub release version");
            } else if (!isNewerVersion(version, options.version)) {
              setState({ status: "up-to-date", message: "Встановлено актуальну версію." });
            } else {
              const installer = macInstallerFromRelease(release, options.arch);
              if (!installer) throw new Error("Matching Mac installer is missing");
              manualUrl = installer.url;
              setState({ status: "available", availableVersion: installer.version, message: `Доступна версія ${installer.version}. Завантажте інсталятор і встановіть його поверх поточної версії.` });
            }
          }
        } else {
          const result = await (await native()).checkForUpdates();
          if (state.status === "checking") {
            const version = result?.updateInfo.version;
            setState(version && isNewerVersion(version, options.version)
              ? { status: "available", availableVersion: version, message: `Доступна версія ${version}.` }
              : { status: "up-to-date", message: "Встановлено актуальну версію." });
          }
        }
      } catch (error) { fail(error); }
      finally { busy = false; }
      return { ...state };
    },
    async download(): Promise<UpdateState> {
      if (!available || busy || state.status !== "available") return { ...state };
      busy = true;
      try {
        if (mode === "manual") {
          if (!manualUrl) throw new Error("Missing installer URL");
          setState({ status: "opening-download", message: "Відкриваю завантаження інсталятора…" });
          await options.openExternal(manualUrl);
          setState({ status: "manual-install", message: "Завантаження відкрито в браузері. Закрийте Formatter та встановіть нову версію поверх поточної." });
        } else {
          setState({ status: "downloading", downloadPercent: 0, message: "Завантажую оновлення…" });
          await (await native()).downloadUpdate();
          if (snapshot().status === "downloading") {
            setState({ status: "downloaded", downloadPercent: 100, message: "Оновлення завантажено. Можна перезапустити програму." });
          }
        }
      } catch (error) { fail(error); }
      finally { busy = false; }
      return { ...state };
    },
    async install(): Promise<UpdateState> {
      if (mode !== "automatic" || busy || state.status !== "downloaded") return { ...state };
      busy = true;
      try {
        if (await options.confirmInstall()) {
          const updater = await native();
          setState({ status: "installing", message: "Перезапускаю програму для встановлення оновлення…" });
          updater.quitAndInstall(false, true);
        }
      } catch (error) { fail(error); }
      finally { busy = false; }
      return { ...state };
    }
  };
}
