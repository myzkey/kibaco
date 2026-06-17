import path from "node:path";
import os from "node:os";
import fs from "fs-extra";
import { afterEach, describe, expect, it } from "vitest";
import { projectLogPath } from "./paths.js";
import { writeProjectLog } from "./process.js";

describe("process logs", () => {
  const originalKibanHome = process.env.KIBAN_HOME;

  afterEach(() => {
    if (originalKibanHome === undefined) delete process.env.KIBAN_HOME;
    else process.env.KIBAN_HOME = originalKibanHome;
  });

  it("writes project logs as text and jsonl under the workspace", async () => {
    process.env.KIBAN_HOME = await fs.mkdtemp(path.join(os.tmpdir(), "kiban-logs-"));

    writeProjectLog("demo", "web", "stdout", "ready\n", { maxBytes: 1024, maxFiles: 2 });

    await expect(fs.readFile(projectLogPath("demo", "web"), "utf8")).resolves.toContain("stdout ready");
    const jsonl = await fs.readFile(projectLogPath("demo", "web", "jsonl"), "utf8");
    expect(JSON.parse(jsonl.trim())).toEqual(
      expect.objectContaining({
        project: "web",
        stream: "stdout",
        line: "ready"
      })
    );
  });

  it("rotates project logs when they exceed max bytes", async () => {
    process.env.KIBAN_HOME = await fs.mkdtemp(path.join(os.tmpdir(), "kiban-logs-"));

    writeProjectLog("demo", "api", "stderr", "first line\n", { maxBytes: 60, maxFiles: 2 });
    writeProjectLog("demo", "api", "stderr", "second line with enough bytes to rotate\n", { maxBytes: 60, maxFiles: 2 });

    await expect(fs.pathExists(projectLogPath("demo", "api"))).resolves.toBe(true);
    await expect(fs.pathExists(`${projectLogPath("demo", "api")}.1`)).resolves.toBe(true);
  });
});
