import path from "node:path";
import os from "node:os";
import fs from "fs-extra";
import { afterEach, describe, expect, it, vi } from "vitest";
import { checkForUpdate, compareVersions, notifyIfUpdateAvailable } from "./update-notifier.js";

describe("update notifier", () => {
  const originalDisableUpdateCheck = process.env.KIBACO_DISABLE_UPDATE_CHECK;

  afterEach(() => {
    if (originalDisableUpdateCheck === undefined) delete process.env.KIBACO_DISABLE_UPDATE_CHECK;
    else process.env.KIBACO_DISABLE_UPDATE_CHECK = originalDisableUpdateCheck;
    vi.restoreAllMocks();
  });

  it("compares semantic versions numerically", () => {
    expect(compareVersions("0.0.10", "0.0.3")).toBeGreaterThan(0);
    expect(compareVersions("1.0.0", "1.0.0-beta.1")).toBeGreaterThan(0);
    expect(compareVersions("0.1.0", "0.2.0")).toBeLessThan(0);
  });

  it("returns an update notice when npm latest is newer", async () => {
    const cacheFile = await tempCacheFile();
    const fetcher = vi.fn().mockResolvedValue(jsonResponse({ version: "0.0.4" }));

    await expect(checkForUpdate({ currentVersion: "0.0.3", cacheFile, fetcher })).resolves.toEqual({
      currentVersion: "0.0.3",
      latestVersion: "0.0.4"
    });
    await expect(fs.readJson(cacheFile)).resolves.toEqual(expect.objectContaining({ latestVersion: "0.0.4" }));
  });

  it("uses a fresh cached latest version before hitting the registry", async () => {
    const cacheFile = await tempCacheFile();
    await fs.writeJson(cacheFile, {
      checkedAt: "2026-06-22T00:00:00.000Z",
      latestVersion: "0.0.5"
    });
    const fetcher = vi.fn();

    await expect(
      checkForUpdate({
        currentVersion: "0.0.3",
        cacheFile,
        fetcher,
        now: new Date("2026-06-22T12:00:00.000Z")
      })
    ).resolves.toEqual({ currentVersion: "0.0.3", latestVersion: "0.0.5" });
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("falls back to stale cache when the registry check fails", async () => {
    const cacheFile = await tempCacheFile();
    await fs.writeJson(cacheFile, {
      checkedAt: "2026-06-20T00:00:00.000Z",
      latestVersion: "0.0.5"
    });

    await expect(
      checkForUpdate({
        currentVersion: "0.0.3",
        cacheFile,
        fetcher: vi.fn().mockRejectedValue(new Error("offline")),
        now: new Date("2026-06-22T12:00:00.000Z")
      })
    ).resolves.toEqual({ currentVersion: "0.0.3", latestVersion: "0.0.5" });
  });

  it("does not print when update checks are disabled", async () => {
    process.env.KIBACO_DISABLE_UPDATE_CHECK = "1";
    const write = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    const fetcher = vi.fn().mockResolvedValue(jsonResponse({ version: "9.9.9" }));

    await notifyIfUpdateAvailable({ currentVersion: "0.0.3", cacheFile: await tempCacheFile(), fetcher });

    expect(fetcher).not.toHaveBeenCalled();
    expect(write).not.toHaveBeenCalled();
  });

  it("prints a short stderr notice when an update is available", async () => {
    const write = vi.spyOn(process.stderr, "write").mockImplementation(() => true);

    await notifyIfUpdateAvailable({
      currentVersion: "0.0.3",
      cacheFile: await tempCacheFile(),
      fetcher: vi.fn().mockResolvedValue(jsonResponse({ version: "0.0.4" }))
    });

    expect(write).toHaveBeenCalledWith(expect.stringContaining("Update available: kibaco 0.0.3 -> 0.0.4"));
  });
});

async function tempCacheFile() {
  return path.join(await fs.mkdtemp(path.join(os.tmpdir(), "kibaco-update-")), "update-check.json");
}

function jsonResponse(body: unknown) {
  return {
    ok: true,
    json: async () => body
  } as Response;
}
