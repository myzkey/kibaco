import type http from "node:http";
import { kibanError } from "./errors.js";
import { getPortUsage } from "./ports.js";
import { proxyUrl, startProxy } from "./proxy.js";
import type { ProxyConfig } from "./types.js";

export type ProxyHandle = {
  reused: boolean;
  server?: http.Server;
};

export async function assertProxyPortAvailable(port: number) {
  const usage = await getPortUsage(port);
  if (!usage?.pid) return;
  throw proxyPortConflictError(port, usage.command, usage.pid);
}

export async function assertProxyPortUsable(port: number) {
  const usage = await getPortUsage(port);
  if (!usage?.pid) return;
  if (await isKibanProxyRunning(port)) return;
  throw proxyPortConflictError(port, usage.command, usage.pid);
}

export async function startOrReuseProxy(config: ProxyConfig): Promise<ProxyHandle> {
  const usage = await getPortUsage(config.proxyPort);
  if (usage?.pid) {
    if (await isKibanProxyRunning(config.proxyPort)) {
      console.log("");
      console.log("Proxy:");
      console.log(`  reusing existing Kiban proxy on http://127.0.0.1:${config.proxyPort}`);
      printProxyUrls(config);
      return { reused: true };
    }

    throw proxyPortConflictError(config.proxyPort, usage.command, usage.pid);
  }

  const server = await startProxy(config);
  console.log("");
  console.log("Proxy:");
  console.log(`  listening on http://127.0.0.1:${config.proxyPort}`);
  printProxyUrls(config);
  return { reused: false, server };
}

export async function closeProxyHandle(handle: ProxyHandle) {
  if (handle.reused || !handle.server) return;
  await new Promise<void>((resolve) => {
    handle.server?.close(() => resolve());
  });
}

export function printProxyUrls(config: ProxyConfig) {
  console.log("");
  console.log("URLs:");
  for (const project of config.projects) {
    console.log(`  ${proxyUrl(config, project.host).padEnd(34)} -> ${project.target}`);
  }
  console.log("");
}

export async function isKibanProxyRunning(port: number) {
  try {
    const response = await fetch(`http://127.0.0.1:${port}/__kiban/proxy-health`, {
      headers: { host: `kiban.localhost:${port}` }
    });
    return response.ok && response.headers.get("x-kiban-proxy") === "1";
  } catch {
    return false;
  }
}

function proxyPortConflictError(port: number, command?: string, pid?: number) {
  return kibanError(
    `Port ${port} is already in use${pid ? ` by ${command ?? "unknown"} pid ${pid}` : ""}.\n` +
      "Stop the existing process or change proxyPort in kiban.config.json.\n" +
      `You can run:\n  kiban kill-port ${port} --force`,
    3
  );
}
