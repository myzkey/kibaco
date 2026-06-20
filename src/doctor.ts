import fs from "fs-extra";
import { isDockerRunning, serviceRunning } from "./docker.js";
import { getPortUsage } from "./ports.js";
import { isKibacoProxyRunning } from "./proxy-runtime.js";
import { proxyUrl, targetPort } from "./proxy.js";
import type { DoctorIssue, DoctorReport, ProxyConfig, RuntimeStatus } from "./types.js";

export async function runProxyDoctor(configPath: string, config: ProxyConfig): Promise<DoctorIssue[]> {
  return (await buildProxyDoctorReport(configPath, config)).issues;
}

export async function buildProxyDoctorReport(configPath: string, config: ProxyConfig): Promise<DoctorReport> {
  const issues: DoctorIssue[] = [{ level: "ok", code: "config_found", message: `Kibaco workspace config found at ${configPath}` }];
  const services: DoctorReport["services"] = [];
  const projects: DoctorReport["projects"] = [];

  const proxyUsage = await getPortUsage(config.proxyPort);
  if (!proxyUsage?.pid) {
    issues.push({ level: "ok", code: "proxy_port_available", message: `proxyPort ${config.proxyPort} is available.` });
  } else if (await isKibacoProxyRunning(config.proxyPort)) {
    issues.push({ level: "ok", code: "proxy_reusable", message: `Kibaco proxy is already running on port ${config.proxyPort} and can be reused.` });
  } else {
    issues.push({
      level: "error",
      code: "proxy_port_in_use",
      message: `proxyPort ${config.proxyPort} is already in use${proxyUsage.pid ? ` by ${proxyUsage.command ?? "unknown"} pid ${proxyUsage.pid}` : ""}.`,
      suggestion: `Run kibaco kill-port ${config.proxyPort} --force or change proxyPort in the Kibaco workspace config.`
    });
  }

  const servicesUsed = new Set(config.projects.flatMap((project) => project.services ?? []));
  const configuredServices = new Set(config.services.map((service) => service.name));
  for (const serviceName of servicesUsed) {
    if (!configuredServices.has(serviceName)) {
      issues.push({
        level: "error",
        code: "service_missing",
        message: `Project references missing service: ${serviceName}`,
        suggestion: "Add it to services or remove it from the project services list."
      });
    }
  }

  const dockerRunning = await isDockerRunning();
  if (config.services.length > 0) {
    issues.push(
      dockerRunning
        ? { level: "ok", code: "docker_running", message: "Docker is running." }
        : { level: "warn", code: "docker_not_running", message: "Docker is not running.", suggestion: "Start Docker Desktop or OrbStack before running service-backed projects." }
    );
  }

  for (const service of config.services) {
    if (!dockerRunning) {
      services.push({ name: service.name, status: "unknown" });
      continue;
    }
    const running = await serviceRunning(config, service);
    services.push({ name: service.name, status: running ? "running" : "stopped" });
    issues.push({
      level: running ? "ok" : "warn",
      code: running ? "service_running" : "service_stopped",
      message: `${service.name}: container is ${running ? "running" : "not running"}.`
    });
  }

  const hosts = new Set<string>();
  for (const project of config.projects) {
    if (hosts.has(project.host)) {
      issues.push({
        level: "error",
        code: "host_duplicate",
        message: `${project.name}: duplicate host ${project.host}.`,
        suggestion: "Each project host must be unique."
      });
    }
    hosts.add(project.host);

    if (await fs.pathExists(project.cwd)) {
      issues.push({ level: "ok", code: "project_cwd_exists", message: `${project.name}: cwd exists.` });
    } else {
      issues.push({
        level: "error",
        code: "project_cwd_missing",
        message: `${project.name}: cwd not found: ${project.cwd}`,
        suggestion: "Update cwd in the Kibaco workspace config."
      });
    }

    let projectStatus: RuntimeStatus = "stopped";
    const port = targetPort(project.target);
    if (port) {
      const usage = await getPortUsage(port);
      if (usage?.pid) projectStatus = "running";
      issues.push(
        usage?.pid
          ? { level: "ok", code: "target_port_listening", message: `${project.name}: target port ${port} is listening.` }
          : { level: "warn", code: "target_port_not_listening", message: `${project.name}: target port ${port} is not listening yet.` }
      );
    }

    const reachable = await targetReachable(project.target);
    if (reachable) projectStatus = "running";
    projects.push({
      name: project.name,
      status: projectStatus,
      url: proxyUrl(config, project.host),
      target: project.target
    });
    issues.push(
      reachable
        ? { level: "ok", code: "target_reachable", message: `${project.name}: target is reachable at ${project.target}.` }
        : {
            level: "warn",
            code: "target_unreachable",
            message: `${project.name}: target is not reachable at ${project.target}.`,
            suggestion: `Run kibaco dev, then open ${proxyUrl(config, project.host)}.`
          }
    );
  }

  return {
    workspace: config.workspace,
    proxyPort: config.proxyPort,
    services,
    projects,
    issues
  };
}

async function targetReachable(target: string) {
  try {
    const response = await fetch(target, { signal: AbortSignal.timeout(1000) });
    return response.status < 500;
  } catch {
    return false;
  }
}
