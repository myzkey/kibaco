import path from "node:path";
import os from "node:os";
import fs from "fs-extra";
import { afterEach, describe, expect, it } from "vitest";
import { proxyConfigSchema } from "./types.js";
import { buildInitialProxyConfig, findProxyConfig, loadProxyConfig, normalizeProxyConfig, writeInitialProxyConfig } from "./config.js";

describe("kiban config", () => {
  const originalKibanHome = process.env.KIBAN_HOME;

  afterEach(() => {
    if (originalKibanHome === undefined) delete process.env.KIBAN_HOME;
    else process.env.KIBAN_HOME = originalKibanHome;
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

  it("infers defaults from a local server file", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "kiban-infer-"));
    await fs.writeFile(
      path.join(root, "server.mjs"),
      'server.listen(Number(process.env.PORT ?? 43110), "127.0.0.1");\n'
    );

    const config = await buildInitialProxyConfig({}, root);

    expect(config.workspace).toBe(path.basename(root));
    expect(config.projects[0]).toEqual(
      expect.objectContaining({
        name: "web",
        host: "web.localhost",
        target: "http://localhost:43110",
        command: "node server.mjs",
        cwd: "."
      })
    );
  });

  it("infers defaults from package scripts", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "kiban-infer-"));
    await fs.writeJson(path.join(root, "package.json"), {
      name: "@demo/admin-app",
      scripts: {
        dev: "vite --host 127.0.0.1"
      }
    });

    const config = await buildInitialProxyConfig({}, root);

    expect(config.projects[0]).toEqual(
      expect.objectContaining({
        name: "admin-app",
        host: "admin-app.localhost",
        target: "http://localhost:5173",
        command: "pnpm dev"
      })
    );
  });

  it("stores workspace config outside the project and resolves from child directories", async () => {
    process.env.KIBAN_HOME = await fs.mkdtemp(path.join(os.tmpdir(), "kiban-home-"));
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "kiban-config-"));
    const nested = path.join(root, "apps", "web");
    await fs.ensureDir(nested);
    const configPath = await writeInitialProxyConfig(
      undefined,
      {
        workspace: "demo",
        proxyPort: 8088,
        projectName: "web",
        host: "web.localhost",
        target: "http://localhost:3000",
        command: "pnpm dev",
        cwd: "apps/web"
      },
      root
    );
    await fs.writeJson(configPath, {
      workspace: "demo",
      proxyPort: 8088,
      services: [],
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

    await expect(fs.pathExists(path.join(root, "kiban.config.json"))).resolves.toBe(false);
    await expect(findProxyConfig(nested)).resolves.toBe(configPath);
    const loaded = await loadProxyConfig(nested);
    expect(loaded.config.workspace).toBe("demo");
    await expect(fs.realpath(loaded.config.projects[0]?.cwd ?? "")).resolves.toBe(await fs.realpath(nested));
  });
});
