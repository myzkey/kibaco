import path from "node:path";
import os from "node:os";
import fs from "fs-extra";
import { describe, expect, it } from "vitest";
import { kibanConfigSchema, proxyConfigSchema } from "./types.js";
import { buildInitialProxyConfig, findProxyConfig, loadProxyConfig, normalizeConfig, normalizeProxyConfig } from "./config.js";

describe("kiban config", () => {
  it("parses a minimal config", () => {
    const config = kibanConfigSchema.parse({ workspace: "demo" });
    expect(config.projects).toEqual([]);
    expect(config.services).toEqual([]);
  });

  it("expands project home paths", () => {
    const config = normalizeConfig(
      kibanConfigSchema.parse({
        workspace: "demo",
        projects: [{ name: "web", path: "~/web", command: "pnpm dev" }]
      })
    );
    expect(config.projects[0]?.path).not.toBe("~/web");
  });

  it("parses a minimal proxy config", () => {
    const config = proxyConfigSchema.parse({});
    expect(config.workspace).toBe("default");
    expect(config.proxyPort).toBe(8080);
    expect(config.projects).toEqual([]);
    expect(config.services).toEqual([]);
  });

  it("resolves proxy project cwd relative to the config directory", () => {
    const config = normalizeProxyConfig(
      proxyConfigSchema.parse({
        projects: [
          {
            name: "web",
            host: "web.localhost",
            target: "http://localhost:3000",
            command: "pnpm dev",
            cwd: "apps/web"
          }
        ]
      }),
      "/repo"
    );

    expect(config.projects[0]?.cwd).toBe(path.resolve("/repo/apps/web"));
  });

  it("builds an initial proxy config from answers", async () => {
    const config = await buildInitialProxyConfig({
      workspace: "demo",
      proxyPort: 30080,
      projectName: "api",
      host: "api.localhost",
      target: "http://localhost:8787",
      command: "pnpm dev:api",
      cwd: "apps/api"
    });

    expect(config.workspace).toBe("demo");
    expect(config.proxyPort).toBe(30080);
    expect(config.projects[0]).toEqual(
      expect.objectContaining({
        name: "api",
        host: "api.localhost",
        target: "http://localhost:8787",
        command: "pnpm dev:api",
        cwd: "apps/api"
      })
    );
  });

  it("finds and loads kiban.config.json from parent directories", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "kiban-config-"));
    const nested = path.join(root, "apps", "web");
    await fs.ensureDir(nested);
    await fs.writeJson(path.join(root, "kiban.config.json"), {
      workspace: "demo",
      proxyPort: 8088,
      projects: [
        {
          name: "web",
          host: "web.localhost",
          target: "http://localhost:3000",
          command: "pnpm dev",
          cwd: "apps/web"
        }
      ]
    });

    await expect(findProxyConfig(nested)).resolves.toBe(path.join(root, "kiban.config.json"));
    const loaded = await loadProxyConfig(nested);
    expect(loaded.config.workspace).toBe("demo");
    expect(loaded.config.projects[0]?.cwd).toBe(nested);
  });
});
