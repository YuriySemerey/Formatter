const { execFileSync } = require("node:child_process");
const path = require("node:path");
const { isPullRequest } = require("builder-util");
const signMacos = require("./sign-macos.cjs").default;

exports.finishAdhocSigning = async function finishAdhocSigning(context, dependencies = {}) {
  const options = context.packager.platformSpecificBuildOptions;
  if (options.identity !== "-") throw new Error("Final ad-hoc signing requires identity '-'");
  const app = path.join(context.appOutDir, `${context.packager.appInfo.productFilename}.app`);
  const sign = dependencies.sign ?? signMacos;
  const verify = dependencies.verify ?? ((app) => execFileSync("codesign", ["--verify", "--deep", "--strict", "--verbose=2", app], { stdio: "inherit" }));

  if ((dependencies.isPullRequest ?? isPullRequest)()) {
    // Builder skips all signing in PRs. Complete only the explicit keyless mode;
    // certificate signing and CSC_FOR_PULL_REQUEST remain disabled.
    await sign({
      app,
      platform: "darwin",
      type: "distribution",
      version: context.packager.config.electronVersion || undefined,
      optionsForFile: await context.packager.getOptionsForFile(app, false, options)
    });
  }
  verify(app);
};
