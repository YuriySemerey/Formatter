// Bootstrap included only in the temporary 0.2.99 CI installer.
// The production 0.3.0 installer never includes this file or the feed override.
const { app, BrowserWindow, dialog } = require("electron");
const fs = require("node:fs");
const assert = require("node:assert/strict");
const reportPath = process.env.FORMATTER_UPDATE_TEST_REPORT;
if (!reportPath || !process.env.CI || process.platform !== "win32") throw new Error("Windows CI only");
app.commandLine.appendSwitch("disable-gpu");
dialog.showMessageBox = async () => ({ response: 0, checkboxChecked: false });
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
function report(value) { fs.writeFileSync(reportPath, JSON.stringify(value, null, 2)); }

(async () => {
  await import("./dist-electron/main.js");
  await app.whenReady();
  let window;
  for (let attempt = 0; attempt < 100; attempt++) {
    window = BrowserWindow.getAllWindows()[0];
    if (window && !window.webContents.isLoadingMainFrame()) {
      const ready = await window.webContents.executeJavaScript("Boolean(document.querySelector('.app-shell') && window.formatterApp)");
      if (ready) break;
    }
    await pause(100);
  }
  assert(window, "Formatter window must load");
  await pause(200);
  const evaluate = (expression) => window.webContents.executeJavaScript(expression);
  if (process.argv.includes("--update-test-prepare")) {
    await evaluate(`(async () => {
      localStorage.setItem('formatter.settings.v2', JSON.stringify({schemaVersion:2,settings:{showBrandCountry:false,showBrandCategory:true,darkMode:true}}));
      localStorage.setItem('formatter.history.v1', JSON.stringify([{id:'update-test',createdAt:'2026-10-13T00:00:00.000Z',output:'Saved before update'}]));
      await window.formatterApp.saveBrandOverrides([{displayName:'CI Brand',country:'Test country',category:'premiumReplacement',source:'user',updatedAt:'2026-10-13T00:00:00.000Z'}]);
    })()`);
    report({ phase: "prepared", userData: app.getPath("userData"), version: app.getVersion() });
    app.quit();
    return;
  }
  const saved = await evaluate(`(async () => ({settings:JSON.parse(localStorage.getItem('formatter.settings.v2')).settings,history:JSON.parse(localStorage.getItem('formatter.history.v1')),brands:await window.formatterApp.loadBrandOverrides()}))()`);
  assert.equal(saved.settings.showBrandCountry, false);
  assert.equal(saved.settings.showBrandCategory, true);
  assert.equal(saved.history[0].output, "Saved before update");
  assert.equal(saved.brands[0].country, "Test country");
  await evaluate("window.updateTestStates=[]; window.formatterApp.onUpdateState(state=>window.updateTestStates.push(state.status));");
  const checked = await evaluate("window.formatterApp.checkForUpdates()");
  assert.equal(checked.status, "available");
  assert.equal(checked.availableVersion, process.env.FORMATTER_UPDATE_TEST_TARGET_VERSION);
  report({ phase: "checked", version: app.getVersion(), checked });
  const downloaded = await evaluate("window.formatterApp.downloadUpdate()");
  assert.equal(downloaded.status, "downloaded");
  assert.equal(downloaded.downloadPercent, 100);
  const states = await evaluate("window.updateTestStates");
  assert(states.includes("downloading") && states.includes("downloaded"));
  report({ phase: "downloaded", version: app.getVersion(), checked, downloaded, states });
  await evaluate("window.formatterApp.installUpdate()");
})().catch((error) => {
  console.error(error);
  report({ phase: "failed", error: error.stack });
  app.exit(1);
});
