import fs from "fs-extra";
import os from "node:os";
import path from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

const isDockerRunning = vi.fn();
const serviceRunning = vi.fn();
const getPortUsage = vi.fn();
const isKibanProxyRunning = vi.fn();

vi.mock("./docker.js", () => ({
  isDockerRunning,
  serviceRunning
}));

vi.mock("./ports.js", () => ({
  getPortUsage,
  isPortAvailable: vi.fn()
}));

vi.mock("./proxy-runtime.js", () => ({
  isKibanProxyRunning
}));

describe("doctor", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    isDockerRunning.mockReset().mockResolvedValue(true);
    serviceRunning.mockReset().mockResolvedValue(false);
    getPortUsage.mockReset().mockResolvedValue(null);
    isKibanProxyRunning.mockReset().mockResolvedValue(false);
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));
  });

  it("reports proxy config health and target warnings", async () => {
    const cwd = await fs.mkdtemp(path.join(os.tmpdir(), "kiban-doctor-"));
    const { runProxyDoctor } = await import("./doctor.js");

    const issues = await runProxyDoctor(path.join(cwd, "kiban.config.json"), {
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

  it("reports reusable Kiban proxy and missing service references", async () => {
    const cwd = await fs.mkdtemp(path.join(os.tmpdir(), "kiban-doctor-"));
    getPortUsage.mockImplementation(async (port: number) => (port === 8080 ? { port, command: "node", pid: 42 } : null));
    isKibanProxyRunning.mockResolvedValue(true);
    const { runProxyDoctor } = await import("./doctor.js");

    const issues = await runProxyDoctor(path.join(cwd, "kiban.config.json"), {
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
});
