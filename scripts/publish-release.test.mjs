// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import { publishRelease } from "./publish-release.mjs";

const sha = "a".repeat(40);
const context = { repository: "YuriySemerey/Formatter", version: "0.3.0", ref: "refs/heads/release/v0.3.0", event: "push", sha, macos: "success", windows: "success" };
const assets = [
  { name: "Formatter-0.3.0-win-x64.exe", size: 123, digest: "sha256:windows" },
  { name: "latest.yml", size: 45, digest: "sha256:metadata" }
];

function fixture({ tag, release, uploaded = [], uploadError, corruptUpload = false, changeTagOnUpload = false } = {}) {
  const state = { tag, release, uploaded: uploaded.map((asset) => ({ ...asset })), writes: [] };
  const client = {
    request: vi.fn(async (resource, method = "GET", body) => {
      if (method !== "GET") state.writes.push({ resource, method, body });
      if (resource.startsWith("/git/ref/")) return state.tag ? { object: state.tag } : null;
      if (resource.startsWith("/git/tags/")) return { object: { type: "commit", sha } };
      if (resource.startsWith("/releases/tags/")) return state.release?.draft ? null : state.release ?? null;
      if (resource.startsWith("/releases?")) return state.release ? [state.release] : [];
      if (resource === "/git/refs") { state.tag = { type: "commit", sha: body.sha }; return { object: state.tag }; }
      if (resource === "/releases") {
        state.release = { ...body, id: 7, html_url: "https://github.com/YuriySemerey/Formatter/releases/tag/v0.3.0" };
        return state.release;
      }
      if (resource.startsWith("/releases/assets/") && method === "DELETE") {
        state.uploaded = state.uploaded.filter((asset) => asset.id !== Number(resource.split("/").at(-1)));
        return null;
      }
      if (resource.includes("/assets?")) return state.uploaded;
      if (resource === "/releases/7") {
        if (method === "PATCH") Object.assign(state.release, body);
        return state.release;
      }
      throw new Error(`Unexpected fake request: ${method} ${resource}`);
    }),
    upload: vi.fn(async (_release, asset) => {
      if (uploadError) throw new Error(uploadError);
      state.uploaded.push({ ...asset, id: state.uploaded.length + 10, state: "uploaded", digest: corruptUpload ? "sha256:wrong" : asset.digest });
      if (changeTagOnUpload) state.tag = { type: "commit", sha: "b".repeat(40) };
    })
  };
  return { state, client };
}

describe("release branch publication", () => {
  it("creates the exact tag and publishes only after every asset is verified", async () => {
    const { client, state } = fixture();
    const result = await publishRelease(context, assets, "Release notes", client);
    expect(state.tag.sha).toBe(sha);
    expect(state.writes[0]).toEqual({ resource: "/git/refs", method: "POST", body: { ref: "refs/tags/v0.3.0", sha } });
    expect(client.upload).toHaveBeenCalledTimes(assets.length);
    expect(result.draft).toBe(false);
    expect(state.writes.at(-1)).toMatchObject({ method: "PATCH", body: { draft: false, make_latest: "true" } });
  });

  it.each([
    { ref: "refs/heads/main" }, { event: "workflow_dispatch" }, { macos: "failure" }, { windows: "cancelled" },
    { ref: "refs/heads/release/v0.3.1" }, { repository: "someone/Formatter" }, { sha: "main" }
  ])("rejects an ineligible publication before any API request: %j", async (override) => {
    const { client } = fixture();
    await expect(publishRelease({ ...context, ...override }, assets, "Notes", client)).rejects.toThrow();
    expect(client.request).not.toHaveBeenCalled();
  });

  it("preserves a tag pointing to another commit", async () => {
    const { client, state } = fixture({ tag: { type: "commit", sha: "b".repeat(40) } });
    await expect(publishRelease(context, assets, "Notes", client)).rejects.toThrow("another commit");
    expect(state.writes).toHaveLength(0);
  });

  it.each([false, true])("does not alter a published release or a different-commit draft (draft=%s)", async (draft) => {
    const { client, state } = fixture({ tag: { type: "commit", sha }, release: { id: 7, tag_name: "v0.3.0", draft, target_commitish: draft ? "b".repeat(40) : sha } });
    await expect(publishRelease(context, assets, "Notes", client)).rejects.toThrow("unpublished draft");
    expect(state.writes).toHaveLength(0);
    expect(client.upload).not.toHaveBeenCalled();
  });

  it("finds a same-commit draft in the release list and resumes without reuploading matching assets", async () => {
    const { client, state } = fixture({ tag: { type: "commit", sha }, release: { id: 7, tag_name: "v0.3.0", draft: true, target_commitish: sha }, uploaded: [{ ...assets[0], id: 10, state: "uploaded" }] });
    await publishRelease(context, assets, "Notes", client);
    expect(client.upload).toHaveBeenCalledTimes(1);
    expect(client.upload.mock.calls[0][1].name).toBe("latest.yml");
    expect(state.writes.some((write) => write.method === "DELETE")).toBe(false);
  });

  it("replaces a mismatched asset only in the same-commit unpublished draft", async () => {
    const { client, state } = fixture({ tag: { type: "commit", sha }, release: { id: 7, tag_name: "v0.3.0", draft: true, target_commitish: sha }, uploaded: [{ ...assets[0], id: 10, state: "uploaded", digest: "sha256:previous-build" }] });
    await publishRelease(context, assets, "Notes", client);
    expect(state.writes.filter((write) => write.method === "DELETE")).toEqual([{ resource: "/releases/assets/10", method: "DELETE", body: undefined }]);
    expect(state.release.draft).toBe(false);
  });

  it("leaves failed uploads unpublished", async () => {
    const { client, state } = fixture({ uploadError: "Network failure" });
    await expect(publishRelease(context, assets, "Notes", client)).rejects.toThrow("Network failure");
    expect(state.release.draft).toBe(true);
    expect(state.writes.some((write) => write.method === "PATCH")).toBe(false);
  });

  it("leaves corrupt server digests unpublished", async () => {
    const { client, state } = fixture({ corruptUpload: true });
    await expect(publishRelease(context, assets, "Notes", client)).rejects.toThrow("SHA-256");
    expect(state.release.draft).toBe(true);
  });

  it("stops if the tag changes during upload", async () => {
    const { client, state } = fixture({ changeTagOnUpload: true });
    await expect(publishRelease(context, assets, "Notes", client)).rejects.toThrow("changed during upload");
    expect(state.release.draft).toBe(true);
  });

  it("supports an existing annotated tag at the exact commit", async () => {
    const { client, state } = fixture({ tag: { type: "tag", sha: "c".repeat(40) } });
    await publishRelease({ ...context, ref: "refs/tags/v0.3.0" }, assets, "Notes", client);
    expect(state.writes.some((write) => write.resource === "/git/refs")).toBe(false);
    expect(state.release.draft).toBe(false);
  });

  it("does not delete unexpected draft attachments or expose them publicly", async () => {
    const { client, state } = fixture({ tag: { type: "commit", sha }, release: { id: 7, tag_name: "v0.3.0", draft: true, target_commitish: sha }, uploaded: [{ id: 10, name: "debug.log", size: 10 }] });
    await expect(publishRelease(context, assets, "Notes", client)).rejects.toThrow("unexpected assets");
    expect(state.writes).toHaveLength(0);
    expect(state.release.draft).toBe(true);
  });
});
