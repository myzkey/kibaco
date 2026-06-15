import fs from "fs-extra";
import { execa } from "execa";
import { isDockerRunning, serviceRunning } from "./docker.js";
import { getPortUsage, isPortAvailable } from "./ports.js";
import type { DoctorIssue, KibanConfig } from "./types.js";

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
