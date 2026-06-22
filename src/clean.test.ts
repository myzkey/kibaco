import fs from "fs-extra";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { cleanProjectCache, projectCacheDirectories, projectHasStaleCache } from "./clean.js";

describe("clean", () => {
  it("infers and removes framework cache directories", async () => {
    const cwd = await fs.mkdtemp(path.join(os.tmpdir(), "kibaco-clean-"));
    await fs.writeJson(path.join(cwd, "package.json"), { dependencies: { next: "15.0.0" } });
    await fs.ensureDir(path.join(cwd, ".next"));
    await fs.ensureDir(path.join(cwd, "node_modules", ".cache"));

    const result = await cleanProjectCache(project(cwd));

    expect(result.removed).toEqual(expect.arrayContaining([".next", "node_modules/.cache"]));
    await expect(fs.pathExists(path.join(cwd, ".next"))).resolves.toBe(false);
  });

  it("uses configured cache directories", async () => {
    const cwd = await fs.mkdtemp(path.join(os.tmpdir(), "kibaco-clean-"));

    await expect(projectCacheDirectories({ ...project(cwd), cacheDirs: [".custom-cache"] })).resolves.toContain(".custom-cache");
  });

  it("detects stale cache directories", async () => {
    const cwd = await fs.mkdtemp(path.join(os.tmpdir(), "kibaco-clean-"));
    await fs.writeJson(path.join(cwd, "package.json"), { dependencies: { next: "15.0.0" } });
    await fs.ensureDir(path.join(cwd, ".next"));
    await fs.writeFile(path.join(cwd, "page.tsx"), "export default function Page() { return null; }");
    const old = new Date(Date.now() - 60_000);
    await fs.utimes(path.join(cwd, ".next"), old, old);

    await expect(projectHasStaleCache(project(cwd))).resolves.toEqual(expect.objectContaining({ directory: ".next" }));
  });
});

function project(cwd: string) {
  return {
    name: "web",
    host: "web.localhost",
    target: "http://localhost:3000",
    command: "pnpm dev",
    cwd,
    services: []
  };
}
