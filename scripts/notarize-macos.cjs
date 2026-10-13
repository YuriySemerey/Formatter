const { execFileSync } = require("node:child_process");
const { rmSync } = require("node:fs");
const path = require("node:path");

exports.default = async function notarizeMacos(context) {
  if (process.platform !== "darwin") {
    return;
  }

  const appleId = process.env.APPLE_ID;
  const applePassword = process.env.APPLE_APP_SPECIFIC_PASSWORD;
  const appleTeamId = process.env.APPLE_TEAM_ID;

  if (!appleId || !applePassword || !appleTeamId) {
    console.warn("macOS notarization skipped: APPLE_ID, APPLE_APP_SPECIFIC_PASSWORD, or APPLE_TEAM_ID is missing.");
    return;
  }

  const appName = `${context.packager.appInfo.productFilename}.app`;
  const appPath = path.join(context.appOutDir, appName);
  const archivePath = path.join(context.outDir, `${context.packager.appInfo.productFilename}-notarization.zip`);

  try {
    execFileSync("ditto", ["-c", "-k", "--keepParent", appPath, archivePath], { stdio: "inherit" });
    execFileSync("xcrun", [
      "notarytool",
      "submit",
      archivePath,
      "--apple-id",
      appleId,
      "--password",
      applePassword,
      "--team-id",
      appleTeamId,
      "--wait"
    ], { stdio: "inherit" });
  } finally {
    rmSync(archivePath, { force: true });
  }

  execFileSync("xcrun", ["stapler", "staple", appPath], { stdio: "inherit" });
};
