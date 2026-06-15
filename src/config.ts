import path from "node:path";
import fs from "fs-extra";
import YAML from "yaml";
import { kibanConfigSchema, type KibanConfig, type ProjectConfig, type ServiceConfig } from "./types.js";
import { expandHome } from "./paths.js";

export class ConfigError extends Error {
  code = 2;
}

export async function findConfig(startDir = process.cwd()): Promise<string | null> {
  let current = path.resolve(startDir);
  while (true) {
    const candidate = path.join(current, "kiban.yml");
    if (await fs.pathExists(candidate)) return candidate;
    const parent = path.dirname(current);
    if (parent === current) break;
    current = parent;
  }

  const homeConfig = expandHome("~/.kiban/kiban.yml");
  return (await fs.pathExists(homeConfig)) ? homeConfig : null;
}

export async function loadConfig(startDir = process.cwd()): Promise<{ path: string; config: KibanConfig }> {
  const configPath = await findConfig(startDir);
  if (!configPath) throw new ConfigError("kiban.yml not found. Run `kiban init` first.");

  const raw = await fs.readFile(configPath, "utf8");
  const parsed = YAML.parse(raw) ?? {};
  const result = kibanConfigSchema.safeParse(parsed);
  if (!result.success) {
    throw new ConfigError(`Invalid kiban.yml: ${result.error.issues.map((issue) => issue.message).join(", ")}`);
  }

  return { path: configPath, config: normalizeConfig(result.data) };
}

export function normalizeConfig(config: KibanConfig): KibanConfig {
  return {
    ...config,
    projects: config.projects.map((project) => ({
      ...project,
      path: expandHome(project.path)
    }))
  };
}

export async function writeInitialConfig(targetPath = path.join(process.cwd(), "kiban.yml")) {
  if (await fs.pathExists(targetPath)) {
    throw new ConfigError("kiban.yml already exists. Refusing to overwrite it.");
  }

  const content = YAML.stringify({
    workspace: "default",
    projects: [],
    services: []
  });
  await fs.writeFile(targetPath, content);
  return targetPath;
}

export async function saveConfig(configPath: string, config: KibanConfig) {
  await fs.writeFile(configPath, YAML.stringify(config));
}

export function findProject(config: KibanConfig, name: string): ProjectConfig {
  const project = config.projects.find((item) => item.name === name);
  if (!project) {
    const error = new Error(`Project not found: ${name}`) as Error & { code: number };
    error.code = 6;
    throw error;
  }
  return project;
}

export function findService(config: KibanConfig, name: string): ServiceConfig {
  const service = config.services.find((item) => item.name === name);
  if (!service) {
    const error = new Error(`Service not found: ${name}`) as Error & { code: number };
    error.code = 7;
    throw error;
  }
  return service;
}
