const { execFileSync } = require("node:child_process");
const { signAsync } = require("@electron/osx-sign");

// electron-builder 26.0.12 needs a custom signer for a certificate-free identity.
exports.default = async function signMacos(options) {
  if (process.platform !== "darwin") throw new Error("macOS signing requires macOS");
  const originalOptionsForFile = options.optionsForFile;
  await signAsync({
    ...options,
    identity: "-",
    identityValidation: false,
    preAutoEntitlements: false,
    gatekeeperAssess: false,
    // This osx-sign version uses an invalid --strict=true for boolean true.
    // Its default still verifies with --strict; verify explicitly below as well.
    strictVerify: undefined,
    optionsForFile: (file) => ({ ...originalOptionsForFile(file), timestamp: "none" })
  });
  execFileSync("codesign", ["--verify", "--deep", "--strict", "--verbose=2", options.app], { stdio: "inherit" });
  console.log(`MAC_ADHOC_SIGNATURE_VERIFIED: ${options.app}`);
};
