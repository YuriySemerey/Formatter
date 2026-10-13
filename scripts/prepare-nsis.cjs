// Backport the MIT-licensed electron-builder NSIS fix while keeping 26.0.12 pinned.
// https://github.com/electron-userland/electron-builder/pull/9769
const { readFile, writeFile } = require("node:fs/promises");
const path = require("node:path");

const unsafeBlock = [
  "      System::Store S",
  "      # Win7 has a per-user programfiles known folder and this can be a non-default location",
  "      System::Call 'SHELL32::SHGetKnownFolderPath(g \"${FOLDERID_UserProgramFiles}\", i ${KF_FLAG_CREATE}, p 0, *p .r2)i.r1'",
  "      ${If} $1 == 0",
  "        System::Call '*$2(&w${NSIS_MAX_STRLEN} .s)'",
  "        StrCpy $0 $1",
  "        System::Call 'OLE32::CoTaskMemFree(p r2)'",
  "      ${endif}",
  "      System::Store L"
].join("\n");
const safeBlock = [
  "      Push $1",
  "      Push $2",
  "      # UserProgramFiles can be redirected; copy the Shell-allocated string safely",
  "      StrCpy $2 0",
  "      System::Call 'SHELL32::SHGetKnownFolderPath(g \"${FOLDERID_UserProgramFiles}\", i ${KF_FLAG_CREATE}, p 0, *p .r2)i.r1'",
  "      ${If} $1 == 0",
  "        System::Call 'KERNEL32::lstrcpynW(w .r0, p r2, i ${NSIS_MAX_STRLEN})p'",
  "      ${endif}",
  "      ${If} $2 != 0",
  "        System::Call 'OLE32::CoTaskMemFree(p r2)'",
  "      ${endif}",
  "      Pop $2",
  "      Pop $1"
].join("\n");

function patchNsisTemplate(source) {
  const text = source.replaceAll("\r\n", "\n");
  const oldCount = text.split(unsafeBlock).length - 1;
  const newCount = text.split(safeBlock).length - 1;
  if (oldCount === 0 && newCount === 1) return text;
  if (oldCount !== 1 || newCount !== 0) throw new Error("Unexpected NSIS template; review the backport before building");
  return text.replace(unsafeBlock, safeBlock);
}

async function beforeBuild(context) {
  if (context.platform.nodeName !== "win32") return true;
  const packagePath = require.resolve("app-builder-lib/package.json");
  const metadata = JSON.parse(await readFile(packagePath, "utf8"));
  if (metadata.version !== "26.0.12") throw new Error("Review the NSIS backport when updating electron-builder");
  const templatePath = path.join(path.dirname(packagePath), "templates/nsis/multiUser.nsh");
  const original = await readFile(templatePath, "utf8");
  const patched = patchNsisTemplate(original);
  if (patched !== original) {
    await writeFile(`${templatePath}.formatter-original`, original, { flag: "wx" }).catch((error) => {
      if (error.code !== "EEXIST") throw error;
    });
    await writeFile(templatePath, patched);
  }
  console.log("NSIS UserProgramFiles bounded-copy backport verified (electron-builder 26.0.12).");
  return true;
}
module.exports = beforeBuild;
module.exports.patchNsisTemplate = patchNsisTemplate;
module.exports.unsafeBlock = unsafeBlock;
module.exports.safeBlock = safeBlock;
