const { contextBridge, ipcRenderer } = require("electron") as typeof import("electron");
import type { UpdateState } from "./updateTypes.js" with { "resolution-mode": "import" };

contextBridge.exposeInMainWorld("formatterApp", {
  writeClipboard: (text: string) => ipcRenderer.invoke("clipboard:writeText", text),
  setAlwaysOnTop: (enabled: boolean) => ipcRenderer.invoke("window:setAlwaysOnTop", enabled),
  loadBrandOverrides: () => ipcRenderer.invoke("brands:loadOverrides"),
  saveBrandOverrides: (overrides: unknown) => ipcRenderer.invoke("brands:saveOverrides", overrides),
  exportBrandOverrides: (overrides: unknown) => ipcRenderer.invoke("brands:exportOverrides", overrides),
  importBrandOverrides: () => ipcRenderer.invoke("brands:importOverrides"),
  getAppInfo: () => ipcRenderer.invoke("app:getInfo"),
  getUpdateState: () => ipcRenderer.invoke("updates:getState"),
  checkForUpdates: () => ipcRenderer.invoke("updates:check"),
  downloadUpdate: () => ipcRenderer.invoke("updates:download"),
  installUpdate: () => ipcRenderer.invoke("updates:install"),
  onUpdateState: (listener: (state: UpdateState) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, state: UpdateState) => listener(state);
    ipcRenderer.on("updates:state", handler);
    return () => { ipcRenderer.removeListener("updates:state", handler); };
  },
  exportBackup: (input: unknown) => ipcRenderer.invoke("backup:export", input),
  importBackup: () => ipcRenderer.invoke("backup:import"),
  appendTechnicalLog: (level: "info" | "warning" | "error", message: string) => ipcRenderer.invoke("logs:append", level, message),
  openTechnicalLog: () => ipcRenderer.invoke("logs:openFile"),
  clearTechnicalLog: () => ipcRenderer.invoke("logs:clearFile")
});
