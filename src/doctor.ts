import fs from "fs-extra";
import { execa } from "execa";
import { isDockerRunning, serviceRunning } from "./docker.js";
import { getPortUsage, isPortAvailable } from "./ports.js";
import { isKibanProxyRunning } from "./proxy-runtime.js";
import { proxyUrl, targetPort } from "./proxy.js";
import type { DoctorIssue, KibanConfig, ProxyConfig } from "./types.js";

export async function runDoctor(configPath: string, config: KibanConfig): Promise<DoctorIssue[]> {
  const issues: DoctorIssue[] = [
    { level: "ok", code: "config_found", message: `kiban.yml found at ${configPath}` }
  ];

  const dockerRunning = await isDockerRunning();
  issues.push(
    dockerRunning
      ? { level: "ok", code: "docker_running", message: "Docker is running." }
      : { level: "warn", code: "docker_not_running", message: "Docker is not running.", suggestion: "Start Docker Desktop or OrbStack." }
  );

  for (const project of config.projects) {
    if (await fs.pathExists(project.path)) {
      issues.push({ level: "ok", code: "project_path_exists", message: `${project.name}: project path exists.` });
    } else {
      issues.push({
        level: "error",
        code: "project_path_missing",
        message: `${project.name}: project path not found: ${project.path}`,
        suggestion: "Update the project path in kiban.yml."
      });
    }

    if (project.port) {
      const available = await isPortAvailable(project.port);
      if (available) {
        issues.push({ level: "ok", code: "port_available", message: `${project.name}: port ${project.port} is available.` });
      } else {
        const usage = await getPortUsage(project.port);
        issues.push({
          level: "error",
          code: "port_in_use",
          message: `${project.name}: port ${project.port} is already in use${usage?.pid ? ` by ${usage.command} pid ${usage.pid}` : ""}.`,
          suggestion: `Run kiban kill-port ${project.port} or change the port in kiban.yml.`
        });
      }
    }

    if (!(await fs.pathExists(`${project.path}/.env.local`))) {
      issues.push({ level: "warn", code: "env_local_missing", message: `${project.name}: .env.local not found.` });
    }
  }

  for (const service of config.services) {
    if (dockerRunning) {
      const running = await serviceRunning(config, service);
      issues.push({
        level: running ? "ok" : "warn",
        code: running ? "service_running" : "service_stopped",
        message: `${service.name}: container is ${running ? "running" : "not running"}.`
      });
      try {
        await execa("docker", ["image", "inspect", service.image]);
        issues.push({ level: "ok", code: "docker_image_exists", message: `${service.name}: Docker image exists.` });
      } catch {
        issues.push({
          level: "warn",
          code: "docker_image_missing",
          message: `${service.name}: Docker image is not available locally: ${service.image}`,
          suggestion: `Run docker pull ${service.image}.`
        });
      }
    }
  }

  return issues;
}

export async function runProxyDoctor(configPath: string, config: ProxyConfig): Promise<DoctorIssue[]> {
  const issues: DoctorIssue[] = [{ level: "ok", code: "config_found", message: `kiban.config.json found at ${configPath}` }];

  const proxyUsage = await getPortUsage(config.proxyPort);
  if (!proxyUsage?.pid) {
    issues.push({ level: "ok", code: "proxy_port_available", message: `proxyPort ${config.proxyPort} is available.` });
  } else if (await isKibanProxyRunning(config.proxyPort)) {
    issues.push({ level: "ok", code: "proxy_reusable", message: `Kiban proxy is already running on port ${config.proxyPort} and can be reused.` });
  } else {
    issues.push({
      level: "error",
      code: "proxy_port_in_use",
      message: `proxyPort ${config.proxyPort} is already in use${proxyUsage.pid ? ` by ${proxyUsage.command ?? "unknown"} pid ${proxyUsage.pid}` : ""}.`,
      suggestion: `Run kiban kill-port ${config.proxyPort} --force or change proxyPort in kiban.config.json.`
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
    if (!dockerRunning) continue;
    const running = await serviceRunning(config, service);
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
        suggestion: "Update cwd in kiban.config.json."
      });
    }

    const port = targetPort(project.target);
    if (port) {
      const usage = await getPortUsage(port);
      issues.push(
        usage?.pid
          ? { level: "ok", code: "target_port_listening", message: `${project.name}: target port ${port} is listening.` }
          : { level: "warn", code: "target_port_not_listening", message: `${project.name}: target port ${port} is not listening yet.` }
      );
    }

    const reachable = await targetReachable(project.target);
    issues.push(
      reachable
        ? { level: "ok", code: "target_reachable", message: `${project.name}: target is reachable at ${project.target}.` }
        : {
            level: "warn",
            code: "target_unreachable",
            message: `${project.name}: target is not reachable at ${project.target}.`,
            suggestion: `Run kiban dev, then open ${proxyUrl(config, project.host)}.`
          }
    );
  }

  return issues;
}

async function targetReachable(target: string) {
  try {
    const response = await fetch(target, { signal: AbortSignal.timeout(1000) });
    return response.status < 500;
  } catch {
    return false;
  }
}
