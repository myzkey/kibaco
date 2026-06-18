import { EventEmitter } from "node:events";
import http from "node:http";
import { PassThrough } from "node:stream";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createProxyHandler, proxyUrl, targetPort } from "./proxy.js";
import type { ProxyConfig } from "./types.js";

const config: ProxyConfig = {
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

describe("proxy", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("formats proxy URLs", () => {
    expect(proxyUrl(config, "web.localhost")).toBe("http://web.localhost:8080");
    expect(proxyUrl({ ...config, proxyPort: 80 }, "web.localhost")).toBe("http://web.localhost");
  });

  it("extracts target ports", () => {
    expect(targetPort("http://localhost:3000")).toBe(3000);
    expect(targetPort("https://example.com")).toBe(443);
    expect(targetPort("not a url")).toBeUndefined();
  });

  it("responds to proxy health checks", () => {
    const response = fakeResponse();
    createProxyHandler(config)(fakeRequest("/__kibaco/proxy-health", "web.localhost:8080"), response);

    expect(response.statusCode).toBe(200);
    expect(response.headers["x-kibaco-proxy"]).toBe("1");
    expect(JSON.parse(response.body)).toEqual({ ok: true, proxyPort: 8080 });
  });

  it("returns 404 for an unknown host", () => {
    const response = fakeResponse();
    createProxyHandler(config)(fakeRequest("/", "missing.localhost:8080"), response);

    expect(response.statusCode).toBe(404);
    expect(response.body).toContain("No kibaco project matched host");
  });

  it("forwards matching hosts to the target", () => {
    const requestSpy = vi.spyOn(http, "request").mockImplementation((options, callback) => {
      const targetResponse = new PassThrough() as PassThrough & { statusCode: number; headers: Record<string, string> };
      targetResponse.statusCode = 201;
      targetResponse.headers = { "content-type": "text/plain" };
      const targetRequest = new PassThrough() as PassThrough & { on: (event: string, listener: (...args: unknown[]) => void) => PassThrough };
      queueMicrotask(() => {
        callback?.(targetResponse);
        targetResponse.end("proxied");
      });
      return targetRequest as unknown as http.ClientRequest;
    });
    const response = fakeResponse();

    createProxyHandler(config)(fakeRequest("/hello", "web.localhost:8080"), response);

    expect(requestSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        hostname: "localhost",
        port: "3000",
        path: "/hello",
        headers: expect.objectContaining({
          host: "localhost:3000",
          "x-forwarded-host": "web.localhost:8080"
        })
      }),
      expect.any(Function)
    );
    return new Promise<void>((resolve) => {
      setTimeout(() => {
        expect(response.statusCode).toBe(201);
        expect(response.headers["x-kibaco-proxy"]).toBe("1");
        expect(response.body).toBe("proxied");
        resolve();
      }, 0);
    });
  });
});

function fakeRequest(url: string, host: string) {
  const request = new PassThrough() as PassThrough & { url: string; method: string; headers: Record<string, string> };
  request.url = url;
  request.method = "GET";
  request.headers = { host };
  queueMicrotask(() => request.end());
  return request as unknown as http.IncomingMessage;
}

function fakeResponse() {
  const emitter = new EventEmitter() as EventEmitter & {
    statusCode?: number;
    headers: Record<string, string | number | string[]>;
    body: string;
    writeHead: (statusCode: number, headers?: Record<string, string | number | string[]>) => void;
    write: (chunk: string | Buffer) => void;
    end: (chunk?: string | Buffer) => void;
  };
  emitter.headers = {};
  emitter.body = "";
  emitter.writeHead = (statusCode, headers = {}) => {
    emitter.statusCode = statusCode;
    emitter.headers = headers;
  };
  emitter.write = (chunk) => {
    emitter.body += chunk.toString();
  };
  emitter.end = (chunk) => {
    if (chunk) emitter.write(chunk);
    emitter.emit("finish");
  };
  return emitter as unknown as http.ServerResponse & { statusCode?: number; headers: Record<string, string | number | string[]>; body: string };
}
