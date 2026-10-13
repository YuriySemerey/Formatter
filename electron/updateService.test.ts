// @vitest-environment node
import { EventEmitter } from "node:events";
import { describe, expect, it, vi } from "vitest";
import { createUpdateService, isNewerVersion, macInstallerFromRelease, readLatestGitHubRelease, UPDATE_REPOSITORY, type NativeUpdater } from "./updateService";
import type { UpdateState } from "./updateTypes";

function release(version = "0.4.0") {
  return {
    tag_name: `v${version}`, draft: false, prerelease: false,
    assets: ["arm64", "x64"].map((arch) => ({
      name: `Formatter-${version}-mac-${arch}.dmg`,
      browser_download_url: `https://github.com/${UPDATE_REPOSITORY}/releases/download/v${version}/Formatter-${version}-mac-${arch}.dmg`
    }))
  };
}

function harness(platform = "win32", enabled = true) {
  const emitter = new EventEmitter();
  const updater = Object.assign(emitter, {
    autoDownload: true, autoInstallOnAppQuit: true, allowPrerelease: true, allowDowngrade: true,
    checkForUpdates: vi.fn(async () => {
      emitter.emit("update-available", { version: "0.4.0" });
      return { updateInfo: { version: "0.4.0" } };
    }),
    downloadUpdate: vi.fn(async () => {
      emitter.emit("download-progress", { percent: 52.4 });
      emitter.emit("update-downloaded", { version: "0.4.0" });
      return ["installer.exe"];
    }),
    quitAndInstall: vi.fn()
  });
  const states: UpdateState[] = [];
  const options = {
    platform, enabled, version: "0.3.0", arch: "arm64",
    loadNativeUpdater: vi.fn(async () => updater as unknown as NativeUpdater),
    readLatestRelease: vi.fn(async (): Promise<unknown | null> => release()),
    openExternal: vi.fn(async () => {}), confirmInstall: vi.fn(async () => true),
    onState: (state: UpdateState) => states.push(state), log: vi.fn()
  };
  return { updater, emitter, options, states, service: createUpdateService(options) };
}

describe("update service", () => {
  it.each(["win32", "darwin", "linux"])("does not contact network/updater in dev or smoke mode (%s)", async (platform) => {
    const h = harness(platform, false);
    await h.service.check(); await h.service.download(); await h.service.install();
    expect(h.service.getState().status).toBe("unavailable");
    expect(h.options.loadNativeUpdater).not.toHaveBeenCalled();
    expect(h.options.readLatestRelease).not.toHaveBeenCalled();
  });

  it("checks and downloads Windows updates only on request, then installs only after confirmation", async () => {
    const h = harness();
    expect(h.options.loadNativeUpdater).not.toHaveBeenCalled();
    expect((await h.service.check()).status).toBe("available");
    expect(h.updater.autoDownload).toBe(false);
    expect(h.updater.autoInstallOnAppQuit).toBe(false);
    expect(h.updater.allowPrerelease).toBe(false);
    expect(h.updater.allowDowngrade).toBe(false);
    expect(h.updater.downloadUpdate).not.toHaveBeenCalled();
    expect((await h.service.download()).status).toBe("downloaded");
    expect(h.states).toEqual(expect.arrayContaining([expect.objectContaining({ status: "downloading", downloadPercent: 52.4 })]));
    expect(h.updater.quitAndInstall).not.toHaveBeenCalled();
    expect((await h.service.install()).status).toBe("installing");
    expect(h.options.confirmInstall).toHaveBeenCalledOnce();
    expect(h.updater.quitAndInstall).toHaveBeenCalledWith(false, true);
  });

  it("keeps a downloaded update ready when restart is canceled", async () => {
    const h = harness(); h.options.confirmInstall.mockResolvedValue(false);
    await h.service.check(); await h.service.download();
    expect((await h.service.install()).status).toBe("downloaded");
    expect(h.updater.quitAndInstall).not.toHaveBeenCalled();
  });

  it("blocks download/install before a newer version is available", async () => {
    const h = harness(); await h.service.download(); await h.service.install();
    expect(h.options.loadNativeUpdater).not.toHaveBeenCalled();
    expect(h.options.confirmInstall).not.toHaveBeenCalled();
  });

  it("collapses simultaneous checks and simultaneous downloads", async () => {
    const h = harness();
    await Promise.all([h.service.check(), h.service.check()]);
    expect(h.updater.checkForUpdates).toHaveBeenCalledOnce();
    await Promise.all([h.service.download(), h.service.download()]);
    expect(h.updater.downloadUpdate).toHaveBeenCalledOnce();
  });

  it("reports no update and prevents downgrades", async () => {
    const h = harness();
    h.updater.checkForUpdates.mockImplementation(async () => {
      h.emitter.emit("update-available", { version: "0.2.0" });
      return { updateInfo: { version: "0.2.0" } };
    });
    expect((await h.service.check()).status).toBe("up-to-date");
    await h.service.download(); expect(h.updater.downloadUpdate).not.toHaveBeenCalled();
  });

  it("reports a first-release 404 and recovers on retry", async () => {
    const h = harness();
    h.updater.checkForUpdates.mockRejectedValueOnce(new Error("GitHub HTTP 404"));
    expect((await h.service.check()).status).toBe("no-release");
    expect((await h.service.check()).status).toBe("available");
  });

  it("keeps no-release state when the native updater both emits and rejects the same error", async () => {
    const h = harness(); h.updater.checkForUpdates.mockImplementation(async () => {
      const error = new Error("No published versions on GitHub");
      h.emitter.emit("error", error); throw error;
    });
    expect((await h.service.check()).status).toBe("no-release");
  });

  it("treats a missing download as an error rather than claiming no releases exist", async () => {
    const h = harness(); await h.service.check();
    h.updater.downloadUpdate.mockRejectedValueOnce(new Error("HTTP 404"));
    expect((await h.service.download()).status).toBe("error");
  });

  it("handles failed downloads without installing or remaining busy", async () => {
    const h = harness(); await h.service.check();
    h.updater.downloadUpdate.mockRejectedValueOnce(new Error("connection lost"));
    expect((await h.service.download()).status).toBe("error");
    await h.service.install(); expect(h.updater.quitAndInstall).not.toHaveBeenCalled();
    expect((await h.service.check()).status).toBe("available");
    expect((await h.service.download()).status).toBe("downloaded");
  });

  it("clears failed lazy initialization so the next check can retry", async () => {
    const h = harness(); h.options.loadNativeUpdater.mockRejectedValueOnce(new Error("initialization failed"));
    expect((await h.service.check()).status).toBe("error");
    expect((await h.service.check()).status).toBe("available");
  });

  it("opens only the matching Mac DMG and never starts native installation", async () => {
    const h = harness("darwin");
    expect((await h.service.check()).status).toBe("available");
    expect((await h.service.download()).status).toBe("manual-install");
    expect(h.options.openExternal).toHaveBeenCalledWith(`https://github.com/${UPDATE_REPOSITORY}/releases/download/v0.4.0/Formatter-0.4.0-mac-arm64.dmg`);
    await h.service.install();
    expect(h.options.loadNativeUpdater).not.toHaveBeenCalled();
    expect(h.options.confirmInstall).not.toHaveBeenCalled();
  });

  it("reports no Mac release, offline errors, and recovers after them", async () => {
    const h = harness("darwin");
    h.options.readLatestRelease.mockResolvedValueOnce(null).mockRejectedValueOnce(new Error("offline"));
    expect((await h.service.check()).status).toBe("no-release");
    expect((await h.service.check()).status).toBe("error");
    expect((await h.service.check()).status).toBe("available");
  });

  it("does not require installers for an older or current Mac release", async () => {
    const h = harness("darwin");
    h.options.readLatestRelease.mockResolvedValue({ ...release("0.3.0"), assets: [] });
    expect((await h.service.check()).status).toBe("up-to-date");
  });

  it("handles missing Mac assets and browser failures without native updater", async () => {
    const h = harness("darwin");
    h.options.readLatestRelease.mockResolvedValueOnce({ ...release(), assets: [] });
    expect((await h.service.check()).status).toBe("error");
    await h.service.check(); h.options.openExternal.mockRejectedValueOnce(new Error("browser unavailable"));
    expect((await h.service.download()).status).toBe("error");
    expect(h.options.loadNativeUpdater).not.toHaveBeenCalled();
  });

  it.each(["arm64", "x64"])("selects the %s installer and rejects external asset URLs", (arch) => {
    expect(macInstallerFromRelease(release(), arch)?.url).toContain(`mac-${arch}.dmg`);
    const bad = release(); bad.assets.forEach((asset) => { asset.browser_download_url = "https://example.com/install.dmg"; });
    expect(() => macInstallerFromRelease(bad, arch)).toThrow();
  });

  it("compares stable versions numerically and rejects prereleases or malformed versions", () => {
    expect(isNewerVersion("0.10.0", "0.9.9")).toBe(true);
    expect(isNewerVersion("1.0.0", "0.99.0")).toBe(true);
    expect(isNewerVersion("0.3.0", "0.3.0")).toBe(false);
    expect(isNewerVersion("0.4.0-beta.1", "0.3.0")).toBe(false);
    expect(isNewerVersion("04.0.0", "0.3.0")).toBe(false);
  });

  it("queries the fixed public GitHub API, treats 404 as no release, and rejects failures", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce({ status: 404 }).mockResolvedValueOnce({ status: 503, ok: false });
    vi.stubGlobal("fetch", fetchMock);
    try {
      expect(await readLatestGitHubRelease()).toBeNull();
      await expect(readLatestGitHubRelease()).rejects.toThrow("503");
      expect(fetchMock.mock.calls[0][0]).toBe(`https://api.github.com/repos/${UPDATE_REPOSITORY}/releases/latest`);
      expect(fetchMock.mock.calls[0][1].signal).toBeInstanceOf(AbortSignal);
    } finally { vi.unstubAllGlobals(); }
  });
});
