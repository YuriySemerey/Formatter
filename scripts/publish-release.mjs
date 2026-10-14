import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { extractReleaseNotes, releaseTagFromRef, verifyReleaseAssets } from "./release-assets.mjs";

const repository = "YuriySemerey/Formatter";

export function publicationTag(context) {
  if (context.repository !== repository || context.event !== "push" || !/^[a-f0-9]{40}$/u.test(context.sha)) {
    throw new Error("Publication requires a repository push at an exact commit");
  }
  if (context.macos !== "success" || context.windows !== "success") throw new Error("Both platform builds must succeed before publication");
  const tag = releaseTagFromRef(context.version, context.ref);
  if (!tag) throw new Error("Only a version tag or release branch may publish");
  return tag;
}

function assetMatches(remote, local) {
  return remote.state === "uploaded" && remote.size === local.size && remote.digest === local.digest;
}

async function tagCommit(client, object) {
  for (let depth = 0; object?.type === "tag" && depth < 8; depth++) {
    object = (await client.request(`/git/tags/${object.sha}`)).object;
  }
  if (object?.type !== "commit") throw new Error("Version tag does not resolve to a commit");
  return object.sha;
}

async function findRelease(client, tag) {
  const published = await client.request(`/releases/tags/${tag}`);
  if (published) return published;
  // The tag endpoint only guarantees published releases; list drafts with the workflow token.
  for (let page = 1; ; page++) {
    const releases = await client.request(`/releases?per_page=100&page=${page}`);
    const release = releases.find((entry) => entry.tag_name === tag);
    if (release) return release;
    if (releases.length < 100) return null;
  }
}

export async function publishRelease(context, assets, notes, client) {
  const tag = publicationTag(context);
  const refPath = `/git/ref/tags/${tag}`;
  const existingTag = await client.request(refPath);
  if (existingTag && await tagCommit(client, existingTag.object) !== context.sha) throw new Error("Existing version tag points to another commit; it will not be overwritten");
  let release = await findRelease(client, tag);
  if (release && (!release.draft || release.target_commitish !== context.sha)) {
    throw new Error("Only an unpublished draft for this exact commit may be resumed");
  }
  if (!existingTag) await client.request("/git/refs", "POST", { ref: `refs/tags/${tag}`, sha: context.sha });
  if (!release) {
    release = await client.request("/releases", "POST", {
      tag_name: tag, target_commitish: context.sha, name: `Formatter ${tag}`, body: notes, draft: true, prerelease: false
    });
  }
  let uploaded = await client.request(`/releases/${release.id}/assets?per_page=100`);
  const allowedNames = new Set(assets.map((asset) => asset.name));
  if (uploaded.some((asset) => !allowedNames.has(asset.name))) throw new Error("Draft contains unexpected assets; it will remain unpublished");
  for (const asset of assets) {
    const existing = uploaded.find((entry) => entry.name === asset.name);
    if (existing && assetMatches(existing, asset)) continue;
    // Replacement is limited to the verified unpublished draft at this exact commit.
    if (existing) await client.request(`/releases/assets/${existing.id}`, "DELETE");
    await client.upload(release, asset);
  }
  uploaded = await client.request(`/releases/${release.id}/assets?per_page=100`);
  if (uploaded.length !== assets.length || assets.some((asset) => !uploaded.some((entry) => entry.name === asset.name && assetMatches(entry, asset)))) {
    throw new Error("Uploaded asset sizes or SHA-256 digests do not match; draft will remain unpublished");
  }
  const current = await client.request(`/releases/${release.id}`);
  if (!current.draft || current.target_commitish !== context.sha || await tagCommit(client, (await client.request(refPath)).object) !== context.sha) {
    throw new Error("Release or tag changed during upload; publication stopped");
  }
  return client.request(`/releases/${release.id}`, "PATCH", { draft: false, prerelease: false, make_latest: "true" });
}

function githubClient(token) {
  if (!token) throw new Error("GitHub Actions publication token is missing");
  const headers = { Authorization: `Bearer ${token}`, Accept: "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28" };
  async function responseJson(response, allowMissing = false) {
    if (allowMissing && response.status === 404) return null;
    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(`GitHub publication failed (${response.status}): ${error.message ?? response.statusText}`);
    }
    return response.status === 204 ? null : response.json();
  }
  return {
    async request(resource, method = "GET", body) {
      return responseJson(await fetch(`https://api.github.com/repos/${repository}${resource}`, {
        method, headers: body ? { ...headers, "Content-Type": "application/json" } : headers, redirect: "error", signal: AbortSignal.timeout(30_000),
        ...(body ? { body: JSON.stringify(body) } : {})
      }), method === "GET");
    },
    async upload(release, asset) {
      const url = new URL(release.upload_url.replace(/\{.*$/u, ""));
      if (url.origin !== "https://uploads.github.com" || url.pathname !== `/repos/${repository}/releases/${release.id}/assets`) throw new Error("Unexpected release upload destination");
      url.searchParams.set("name", asset.name);
      console.log(`Uploading ${asset.name} (${asset.size} bytes)`);
      return responseJson(await fetch(url, {
        method: "POST", headers: { ...headers, "Content-Type": "application/octet-stream", "Content-Length": String(asset.size) },
        body: createReadStream(asset.file), duplex: "half", redirect: "error", signal: AbortSignal.timeout(300_000)
      }));
    }
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const pkg = JSON.parse(await readFile("package.json", "utf8"));
  const lock = JSON.parse(await readFile("package-lock.json", "utf8"));
  if (pkg.version !== lock.version || pkg.version !== lock.packages?.[""]?.version) throw new Error("Package and lock versions must match");
  const context = {
    repository: process.env.GITHUB_REPOSITORY, event: process.env.GITHUB_EVENT_NAME,
    ref: process.env.GITHUB_REF, sha: process.env.GITHUB_SHA, version: pkg.version,
    macos: process.env.RELEASE_MACOS_RESULT, windows: process.env.RELEASE_WINDOWS_RESULT
  };
  publicationTag(context);
  const names = await verifyReleaseAssets("release", pkg.version);
  const notes = extractReleaseNotes(await readFile("CHANGELOG.md", "utf8"), pkg.version);
  const assets = [];
  for (const name of names) {
    const file = path.resolve("release", name);
    const hash = createHash("sha256");
    for await (const chunk of createReadStream(file)) hash.update(chunk);
    const size = (await stat(file)).size;
    if (!size) throw new Error(`Empty release asset: ${name}`);
    assets.push({ name, file, size, digest: `sha256:${hash.digest("hex")}` });
  }
  const release = await publishRelease(context, assets, notes, githubClient(process.env.GH_TOKEN));
  console.log(`Published complete release: ${release.html_url}`);
}
