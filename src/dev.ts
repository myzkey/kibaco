import { spawnStreamingProject, stopProcesses, waitForProcesses } from "./process.js";
import { getPortUsage } from "./ports.js";
import { targetPort } from "./proxy.js";
import { assertProxyPortUsable, closeProxyHandle, startOrReuseProxy } from "./proxy-runtime.js";
import { startProjectServices } from "./service-runtime.js";
import { kibanError } from "./errors.js";
import type { ProxyConfig } from "./types.js";

export async function runDev(config: ProxyConfig) {
  if (config.projects.length === 0) throw new Error("No projects configured in kiban.config.json.");

  console.log("Kiban dev starting...");
  console.log("");

  await assertProxyPortUsable(config.proxyPort);
  await startProjectServices(config, { print: true });
  await assertProjectTargetPortsAvailable(config);

  console.log("");
  console.log("Projects:");
  const children = config.projects.map((project) => {
    console.log(`  ${project.name.padEnd(14)} ${project.command}`);
    return spawnStreamingProject(project);
  });

  const proxyHandle = await startOrReuseProxy(config);
  const shutdown = async (code: number) => {
    stopProcesses(children);
    await closeProxyHandle(proxyHandle);
    process.exit(code);
  };

  process.once("SIGINT", () => {
    void shutdown(130);
  });
  process.once("SIGTERM", () => {
    void shutdown(143);
  });

  await waitForProcesses(children);
  await closeProxyHandle(proxyHandle);
}

async function assertProjectTargetPortsAvailable(config: ProxyConfig) {
  for (const project of config.projects) {
    const port = targetPort(project.target);
    if (!port) continue;
    const usage = await getPortUsage(port);
    if (!usage?.pid) continue;
    throw kibanError(
      `${project.name}: target port ${port} is already in use by ${usage.command ?? "unknown"} pid ${usage.pid}. ` +
        `Stop it or run \`kiban kill-port ${port} --force\`.`,
      3
    );
  }
}
