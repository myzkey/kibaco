import path from "node:path";
import fs from "fs-extra";
import YAML from "yaml";
import {
  kibanConfigSchema,
  proxyConfigSchema,
  type KibanConfig,
  type ProjectConfig,
  type ProxyConfig,
  type ProxyProjectConfig,
  type ServiceConfig
} from "./types.js";
import { expandHome } from "./paths.js";

export class ConfigError extends Error {
  code = 2;
}

export async function findConfig(startDir = process.cwd()): Promise<string | null> {
  const localConfig = await findFileUpwards("kiban.yml", startDir);
  if (localConfig) return localConfig;
  const homeConfig = expandHome("~/.kiban/kiban.yml");
  return (await fs.pathExists(homeConfig)) ? homeConfig : null;
}

export async function findProxyConfig(startDir = process.cwd()): Promise<string | null> {
  return findFileUpwards("kiban.config.json", startDir);
}

async function findFileUpwards(fileName: string, startDir = process.cwd()): Promise<string | null> {
  let current = path.resolve(startDir);
  while (true) {
    const candidate = path.join(current, fileName);
    if (await fs.pathExists(candidate)) return candidate;
    const parent = path.dirname(current);
    if (parent === current) break;
    current = parent;
  }
  return null;
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

export async function loadProxyConfig(startDir = process.cwd()): Promise<{ path: string; config: ProxyConfig }> {
  const configPath = await findProxyConfig(startDir);
  if (!configPath) throw new ConfigError("kiban.config.json not found. Run `kiban init` first.");

  const raw = await fs.readFile(configPath, "utf8");
  const parsed = JSON.parse(raw) as unknown;
  const result = proxyConfigSchema.safeParse(parsed);
  if (!result.success) {
    throw new ConfigError(`Invalid kiban.config.json: ${result.error.issues.map((issue) => issue.message).join(", ")}`);
  }

  return { path: configPath, config: normalizeProxyConfig(result.data, path.dirname(configPath)) };
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

export function normalizeProxyConfig(config: ProxyConfig, baseDir = process.cwd()): ProxyConfig {
  return {
    ...config,
    projects: config.projects.map((project) => ({
      ...project,
      cwd: path.resolve(baseDir, expandHome(project.cwd))
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

export async function writeInitialProxyConfig(targetPath = path.join(process.cwd(), "kiban.config.json")) {
  if (await fs.pathExists(targetPath)) {
    throw new ConfigError("kiban.config.json already exists. Refusing to overwrite it.");
  }

  const content = {
    workspace: "default",
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
  await fs.writeJson(targetPath, content, { spaces: 2 });
  return targetPath;
}

export async function saveConfig(configPath: string, config: KibanConfig) {
  await fs.writeFile(configPath, YAML.stringify(config));
}

export function findProject(config: KibanConfig, name: string): ProjectConfig {
  return findNamed(config.projects, name, "Project", 6);
}

export function findProxyProject(config: ProxyConfig, name: string): ProxyProjectConfig {
  return findNamed(config.projects, name, "Project", 6);
}

export function findProxyService(config: ProxyConfig, name: string): ServiceConfig {
  return findNamed(config.services, name, "Service", 7);
}

export function findService(config: KibanConfig, name: string): ServiceConfig {
  return findNamed(config.services, name, "Service", 7);
}

function findNamed<T extends { name: string }>(items: T[], name: string, label: string, code: number): T {
  const item = items.find((entry) => entry.name === name);
  if (!item) {
    const error = new Error(`${label} not found: ${name}`) as Error & { code: number };
    error.code = code;
    throw error;
  }
  return item;
}
