import path from "node:path";
import os from "node:os";
import fs from "fs-extra";
import { afterEach, describe, expect, it } from "vitest";
import { consumeRestartRequestDetails, consumeRestartRequests, requestProjectRestart } from "./restart.js";

describe("restart requests", () => {
  const originalKibacoHome = process.env.KIBACO_HOME;

  afterEach(() => {
    if (originalKibacoHome === undefined) delete process.env.KIBACO_HOME;
    else process.env.KIBACO_HOME = originalKibacoHome;
  });

  it("stores and consumes restart requests by workspace", async () => {
    process.env.KIBACO_HOME = await fs.mkdtemp(path.join(os.tmpdir(), "kibaco-restart-"));

    await requestProjectRestart("demo", "web");

    await expect(consumeRestartRequests("other")).resolves.toEqual([]);
    await expect(consumeRestartRequests("demo")).resolves.toEqual(["web"]);
    await expect(consumeRestartRequests("demo")).resolves.toEqual([]);
  });

  it("stores force restart requests", async () => {
    process.env.KIBACO_HOME = await fs.mkdtemp(path.join(os.tmpdir(), "kibaco-restart-"));

    await requestProjectRestart("demo", "web", { force: true });

    await expect(consumeRestartRequestDetails("demo")).resolves.toEqual([{ projectName: "web", force: true }]);
  });
});
