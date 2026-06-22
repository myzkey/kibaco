import { EventEmitter } from "node:events";
import { beforeEach, describe, expect, it, vi } from "vitest";

const assertProxyPortUsable = vi.fn();
const closeProxyHandle = vi.fn();
const startOrReuseProxy = vi.fn();
const startProjectServices = vi.fn();
const getPortUsage = vi.fn();
const killPort = vi.fn();
const spawnStreamingProject = vi.fn();
const stopProcess = vi.fn();
const stopProcesses = vi.fn();
const consumeRestartRequestDetails = vi.fn();
const cleanProjectCache = vi.fn();

vi.mock("./proxy-runtime.js", () => ({
  assertProxyPortUsable,
  closeProxyHandle,
  startOrReuseProxy
}));

vi.mock("./service-runtime.js", () => ({
  startProjectServices
}));

vi.mock("./ports.js", () => ({
  getPortUsage,
  killPort
}));

vi.mock("./process.js", () => ({
  spawnStreamingProject,
  stopProcess,
  stopProcesses
}));

vi.mock("./restart.js", () => ({
  ALL_PROJECTS_RESTART: "__all__",
  consumeRestartRequestDetails
}));

vi.mock("./clean.js", () => ({
  cleanProjectCache
}));

describe("dev", () => {
  beforeEach(() => {
    assertProxyPortUsable.mockReset().mockResolvedValue(undefined);
    closeProxyHandle.mockReset().mockResolvedValue(undefined);
    startOrReuseProxy.mockReset().mockResolvedValue({ reused: false, server: {} });
    startProjectServices.mockReset().mockResolvedValue(undefined);
    getPortUsage.mockReset().mockResolvedValue(null);
    killPort.mockReset().mockResolvedValue(null);
    spawnStreamingProject.mockReset().mockImplementation(() => childProcess());
    stopProcess.mockReset();
    stopProcesses.mockReset();
    consumeRestartRequestDetails.mockReset().mockResolvedValue([]);
    cleanProjectCache.mockReset().mockResolvedValue({ project: "web", removed: [], missing: [] });
  });

  it("starts services, projects, and proxy in order", async () => {
    const calls: string[] = [];
    startProjectServices.mockImplementation(async () => calls.push("services"));
    spawnStreamingProject.mockImplementation(() => {
      calls.push("project");
      return childProcess();
    });
    startOrReuseProxy.mockImplementation(async () => {
      calls.push("proxy");
      return { reused: false, server: {} };
    });
    const { runDev } = await import("./dev.js");

    await runDev(config());

    expect(calls).toEqual(["services", "project", "proxy"]);
    expect(assertProxyPortUsable).toHaveBeenCalledWith(8080);
    expect(spawnStreamingProject).toHaveBeenCalledWith(expect.objectContaining({ name: "web" }), expect.objectContaining({ stream: false }));
    expect(closeProxyHandle).toHaveBeenCalledWith({ reused: false, server: {} });
  });

  it("fails before spawning projects when a target port is in use", async () => {
    getPortUsage.mockResolvedValue({ port: 3000, command: "node", pid: 42 });
    const { runDev } = await import("./dev.js");

    await expect(runDev(config())).rejects.toMatchObject({ code: 3 });
    expect(spawnStreamingProject).not.toHaveBeenCalled();
    expect(startOrReuseProxy).not.toHaveBeenCalled();
  });

  it("starts only selected projects", async () => {
    const { runDev } = await import("./dev.js");

    await runDev(
      {
        ...config(),
        projects: [
          config().projects[0],
          {
            name: "api",
            host: "api.localhost",
            target: "http://localhost:3001",
            command: "pnpm dev:api",
            cwd: ".",
            services: ["postgres"]
          }
        ]
      },
      { projects: ["api"] }
    );

    expect(startProjectServices).toHaveBeenCalledWith(expect.objectContaining({ projects: [expect.objectContaining({ name: "api" })] }), { print: true });
    expect(spawnStreamingProject).toHaveBeenCalledTimes(1);
    expect(spawnStreamingProject).toHaveBeenCalledWith(expect.objectContaining({ name: "api" }), expect.anything());
    expect(startOrReuseProxy).toHaveBeenCalledWith(expect.objectContaining({ projects: [expect.objectContaining({ name: "api" })] }));
  });

  it("can stream project logs when requested", async () => {
    const { runDev } = await import("./dev.js");

    await runDev(config(), { streamLogs: true });

    expect(spawnStreamingProject).toHaveBeenCalledWith(expect.objectContaining({ name: "web" }), expect.objectContaining({ stream: true }));
  });

  it("cleans caches and frees the target port for force restart requests", async () => {
    const firstChild = childProcess({ autoExit: false });
    spawnStreamingProject.mockReturnValueOnce(firstChild).mockImplementationOnce(() => childProcess());
    cleanProjectCache.mockResolvedValue({ project: "web", removed: [".next"], missing: [] });
    killPort.mockResolvedValue({ port: 3000, pid: 42, command: "node" });
    consumeRestartRequestDetails.mockResolvedValueOnce([{ projectName: "web", force: true }]).mockResolvedValue([]);
    const { runDev } = await import("./dev.js");

    const run = runDev(config());
    await new Promise((resolve) => setTimeout(resolve, 600));
    firstChild.exitCode = 0;
    firstChild.emit("exit", 0);
    await run;

    expect(stopProcess).toHaveBeenCalledWith(firstChild);
    expect(cleanProjectCache).toHaveBeenCalledWith(expect.objectContaining({ name: "web" }));
    expect(killPort).toHaveBeenCalledWith(3000);
    expect(spawnStreamingProject).toHaveBeenCalledTimes(2);
  });

  it("rejects unknown selected projects", async () => {
    const { runDev } = await import("./dev.js");
    await expect(runDev(config(), { projects: ["missing"] })).rejects.toMatchObject({ code: 6 });
  });

  it("rejects empty project config", async () => {
    const { runDev } = await import("./dev.js");
    await expect(runDev({ ...config(), projects: [] })).rejects.toThrow("No projects configured");
  });
});

function childProcess(options: { autoExit?: boolean } = {}) {
  const child = new EventEmitter() as EventEmitter & { pid: number; exitCode: number | null };
  child.pid = 1;
  child.exitCode = null;
  if (options.autoExit ?? true) {
    setTimeout(() => {
      child.exitCode = 0;
      child.emit("exit", 0);
    }, 0);
  }
  return child;
}

function config() {
  return {
    workspace: "demo",
    proxyPort: 8080,
    log: {
      maxBytes: 1024,
      maxFiles: 2
    },
    services: [],
    projects: [
      {
        name: "web",
        host: "web.localhost",
        target: "http://localhost:3000",
        command: "pnpm dev",
        cwd: ".",
        services: []
      }
    ]
  };
}
