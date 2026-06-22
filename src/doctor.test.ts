import fs from "fs-extra";
import os from "node:os";
import path from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

const isDockerRunning = vi.fn();
const serviceRunning = vi.fn();
const getPortUsage = vi.fn();
const isKibacoProxyRunning = vi.fn();

vi.mock("./docker.js", () => ({
  isDockerRunning,
  serviceRunning
}));

vi.mock("./ports.js", () => ({
  getPortUsage,
  isPortAvailable: vi.fn()
}));

vi.mock("./proxy-runtime.js", () => ({
  isKibacoProxyRunning
}));

describe("doctor", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    isDockerRunning.mockReset().mockResolvedValue(true);
    serviceRunning.mockReset().mockResolvedValue(false);
    getPortUsage.mockReset().mockResolvedValue(null);
    isKibacoProxyRunning.mockReset().mockResolvedValue(false);
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));
  });

  it("reports proxy config health and target warnings", async () => {
    const cwd = await fs.mkdtemp(path.join(os.tmpdir(), "kibaco-doctor-"));
    const { runProxyDoctor } = await import("./doctor.js");

    const issues = await runProxyDoctor(path.join(cwd, "config.json"), {
      workspace: "demo",
      proxyPort: 8080,
      services: [],
      projects: [
        {
          name: "web",
          host: "web.localhost",
          target: "http://localhost:3000",
          command: "pnpm dev",
          cwd,
          services: []
        }
      ]
    });

    expect(issues).toEqual(expect.arrayContaining([expect.objectContaining({ code: "proxy_port_available" }), expect.objectContaining({ code: "project_cwd_exists" })]));
    expect(issues).toEqual(expect.arrayContaining([expect.objectContaining({ code: "target_unreachable", level: "warn" })]));
  });

  it("reports reusable Kibaco proxy and missing service references", async () => {
    const cwd = await fs.mkdtemp(path.join(os.tmpdir(), "kibaco-doctor-"));
    getPortUsage.mockImplementation(async (port: number) => (port === 8080 ? { port, command: "node", pid: 42 } : null));
    isKibacoProxyRunning.mockResolvedValue(true);
    const { runProxyDoctor } = await import("./doctor.js");

    const issues = await runProxyDoctor(path.join(cwd, "config.json"), {
      workspace: "demo",
      proxyPort: 8080,
      services: [],
      projects: [
        {
          name: "web",
          host: "web.localhost",
          target: "http://localhost:3000",
          command: "pnpm dev",
          cwd,
          services: ["postgres"]
        }
      ]
    });

    expect(issues).toEqual(expect.arrayContaining([expect.objectContaining({ code: "proxy_reusable" }), expect.objectContaining({ code: "service_missing", level: "error" })]));
  });

  it("builds an AI-friendly structured report", async () => {
    const cwd = await fs.mkdtemp(path.join(os.tmpdir(), "kibaco-doctor-"));
    serviceRunning.mockResolvedValue(true);
    getPortUsage.mockImplementation(async (port: number) => (port === 3000 ? { port, command: "node", pid: 42 } : null));
    const { buildProxyDoctorReport } = await import("./doctor.js");

    const report = await buildProxyDoctorReport(path.join(cwd, "config.json"), {
      workspace: "demo",
      proxyPort: 8080,
      services: [
        {
          name: "postgres",
          image: "postgres:16",
          ports: ["5432:5432"]
        }
      ],
      projects: [
        {
          name: "web",
          host: "web.localhost",
          target: "http://localhost:3000",
          command: "pnpm dev",
          cwd,
          services: ["postgres"]
        }
      ]
    });

    expect(report).toEqual(
      expect.objectContaining({
        workspace: "demo",
        proxyPort: 8080,
        services: [{ name: "postgres", status: "running" }],
        projects: [
          {
            name: "web",
            status: "running",
            url: "http://web.localhost:8080",
            target: "http://localhost:3000"
          }
        ],
        issues: expect.arrayContaining([expect.objectContaining({ code: "service_running" })])
      })
    );
  });

  it("warns when a framework cache is older than source files", async () => {
    const cwd = await fs.mkdtemp(path.join(os.tmpdir(), "kibaco-doctor-"));
    await fs.writeJson(path.join(cwd, "package.json"), { dependencies: { next: "15.0.0" } });
    await fs.ensureDir(path.join(cwd, ".next"));
    await fs.writeFile(path.join(cwd, "page.tsx"), "export default function Page() { return null; }");
    const old = new Date(Date.now() - 60_000);
    await fs.utimes(path.join(cwd, ".next"), old, old);
    const { runProxyDoctor } = await import("./doctor.js");

    const issues = await runProxyDoctor(path.join(cwd, "config.json"), {
      workspace: "demo",
      proxyPort: 8080,
      services: [],
      projects: [
        {
          name: "web",
          host: "web.localhost",
          target: "http://localhost:3000",
          command: "pnpm dev",
          cwd,
          services: []
        }
      ]
    });

    expect(issues).toEqual(expect.arrayContaining([expect.objectContaining({ code: "cache_stale", level: "warn" })]));
  });
});
