import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { readFile, readdir, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { load } from "js-yaml";

export function validateReleaseVersion(version, tag) {
  if (!/^(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)$/u.test(version) || tag !== `v${version}`) {
    throw new Error(`Release tag ${tag} must match package version v${version}`);
  }
}

export function extractReleaseNotes(changelog, version) {
  const lines = changelog.split(/\r?\n/u);
  const start = lines.findIndex((line) => line.startsWith(`## ${version} - `));
  if (start < 0) throw new Error(`Missing changelog entry for ${version}`);
  const endOffset = lines.slice(start + 1).findIndex((line) => line.startsWith("## "));
  const end = endOffset < 0 ? lines.length : start + 1 + endOffset;
  return `${lines.slice(start + 1, end).join("\n").trim()}\n`;
}

async function sha512(file) {
  const hash = createHash("sha512");
  for await (const chunk of createReadStream(file)) hash.update(chunk);
  return hash.digest("base64");
}

export async function verifyReleaseAssets(directory, version, platform = "all") {
  validateReleaseVersion(version, `v${version}`);
  if (!["all", "mac", "win"].includes(platform)) throw new Error("Unsupported release platform");
  const names = await readdir(directory);
  const mac = ["arm64", "x64"].flatMap((arch) => ["dmg", "zip"].map((ext) => `Formatter-${version}-mac-${arch}.${ext}`));
  const win = [`Formatter-${version}-win-x64.exe`];
  const expected = platform === "mac" ? mac : platform === "win" ? win : [...mac, ...win];
  const manifests = platform === "mac" ? ["latest-mac.yml"] : platform === "win" ? ["latest.yml"] : ["latest-mac.yml", "latest.yml"];
  const blockmaps = expected.filter((name) => name.endsWith(".zip") || name.endsWith(".exe")).map((name) => `${name}.blockmap`);
  for (const name of [...expected, ...manifests, ...blockmaps]) {
    if (!names.includes(name) || (await stat(path.join(directory, name))).size === 0) {
      throw new Error(`Missing or empty release asset: ${name}`);
    }
  }
  for (const name of manifests) {
    const metadata = load(await readFile(path.join(directory, name), "utf8"));
    if (!metadata || metadata.version !== version || !Array.isArray(metadata.files) || !metadata.files.length) {
      throw new Error(`Invalid update metadata: ${name}`);
    }
    const allowed = name === "latest.yml" ? win : mac;
    const referenced = new Set();
    for (const file of metadata.files) {
      const filename = typeof file.url === "string" ? decodeURIComponent(file.url) : "";
      if (!allowed.includes(filename)) throw new Error(`Unexpected update asset: ${filename}`);
      const assetPath = path.join(directory, filename);
      const details = await stat(assetPath);
      if (typeof file.sha512 !== "string" || file.sha512 !== await sha512(assetPath) || (file.size !== undefined && file.size !== details.size)) {
        throw new Error(`Update asset checksum/size mismatch: ${filename}`);
      }
      referenced.add(filename);
    }
    const required = name === "latest.yml" ? win : mac.filter((file) => file.endsWith(".zip"));
    if (required.some((file) => !referenced.has(file))) throw new Error(`Incomplete update metadata: ${name}`);
  }
  return names.filter((name) => expected.includes(name) || manifests.includes(name) || expected.some((file) => name === `${file}.blockmap`)).sort();
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const args = process.argv.slice(2);
  const pkg = JSON.parse(await readFile("package.json", "utf8"));
  if (args[0] === "--check-version") {
    if (process.env.GITHUB_REF?.startsWith("refs/tags/")) validateReleaseVersion(pkg.version, process.env.GITHUB_REF_NAME);
    console.log(`Release version verified: ${pkg.version}`);
  } else if (args[0] === "--notes") {
    validateReleaseVersion(pkg.version, args[1]);
    await writeFile(args[2], extractReleaseNotes(await readFile("CHANGELOG.md", "utf8"), pkg.version));
  } else if (args[0] === "--platform") {
    const files = await verifyReleaseAssets("release", pkg.version, args[1]);
    console.log(`Release assets verified (${files.length} files): ${files.join(", ")}`);
  } else {
    const files = await verifyReleaseAssets(args[0] ?? "release", args[1] ?? pkg.version, args[2] ?? "all");
    console.log(`Release assets verified (${files.length} files): ${files.join(", ")}`);
  }
}
