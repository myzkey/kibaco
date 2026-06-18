import type http from "node:http";
import { kibacoError } from "./errors.js";
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
  if (await isKibacoProxyRunning(port)) return;
  throw proxyPortConflictError(port, usage.command, usage.pid);
}

export async function startOrReuseProxy(config: ProxyConfig): Promise<ProxyHandle> {
  const usage = await getPortUsage(config.proxyPort);
  if (usage?.pid) {
    if (await isKibacoProxyRunning(config.proxyPort)) {
      console.log("");
      console.log("Proxy:");
      console.log(`  reusing existing Kibaco proxy on http://127.0.0.1:${config.proxyPort}`);
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

export async function isKibacoProxyRunning(port: number) {
  try {
    const response = await fetch(`http://127.0.0.1:${port}/__kibaco/proxy-health`, {
      headers: { host: `kibaco.localhost:${port}` }
    });
    return response.ok && response.headers.get("x-kibaco-proxy") === "1";
  } catch {
    return false;
  }
}

function proxyPortConflictError(port: number, command?: string, pid?: number) {
  return kibacoError(
    `Port ${port} is already in use${pid ? ` by ${command ?? "unknown"} pid ${pid}` : ""}.\n` +
      "Stop the existing process or change proxyPort in the Kibaco workspace config.\n" +
      `You can run:\n  kibaco kill-port ${port} --force`,
    3
  );
}
