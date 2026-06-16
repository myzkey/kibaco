import { beforeEach, describe, expect, it, vi } from "vitest";

const getPortUsage = vi.fn();
const startProxy = vi.fn();

vi.mock("./ports.js", () => ({
  getPortUsage
}));

vi.mock("./proxy.js", async () => {
  const actual = await vi.importActual<typeof import("./proxy.js")>("./proxy.js");
  return {
    ...actual,
    startProxy
  };
});

describe("proxy-runtime", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    getPortUsage.mockReset();
    startProxy.mockReset();
  });

  it("allows an available proxy port", async () => {
    getPortUsage.mockResolvedValue(null);
    const { assertProxyPortUsable } = await import("./proxy-runtime.js");
    await expect(assertProxyPortUsable(8080)).resolves.toBeUndefined();
  });

  it("throws a helpful error when another process uses the proxy port", async () => {
    getPortUsage.mockResolvedValue({ port: 8080, command: "node", pid: 123 });
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("no proxy")));
    const { assertProxyPortUsable } = await import("./proxy-runtime.js");

    await expect(assertProxyPortUsable(8080)).rejects.toMatchObject({
      code: 3,
      message: expect.stringContaining("kiban kill-port 8080 --force")
    });
  });

  it("reuses an existing Kiban proxy", async () => {
    getPortUsage.mockResolvedValue({ port: 8080, command: "node", pid: 123 });
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        headers: new Headers({ "x-kiban-proxy": "1" })
      })
    );
    const { startOrReuseProxy } = await import("./proxy-runtime.js");

    const handle = await startOrReuseProxy(config());

    expect(handle).toEqual({ reused: true });
    expect(startProxy).not.toHaveBeenCalled();
  });

  it("starts and closes a new proxy when the port is free", async () => {
    const close = vi.fn((callback: () => void) => callback());
    getPortUsage.mockResolvedValue(null);
    startProxy.mockResolvedValue({ close });
    const { closeProxyHandle, startOrReuseProxy } = await import("./proxy-runtime.js");

    const handle = await startOrReuseProxy(config());
    await closeProxyHandle(handle);

    expect(handle.reused).toBe(false);
    expect(startProxy).toHaveBeenCalled();
    expect(close).toHaveBeenCalled();
  });
});

function config() {
  return {
    workspace: "demo",
    proxyPort: 8080,
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
