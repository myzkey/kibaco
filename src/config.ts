import path from "node:path";
import crypto from "node:crypto";
import readline from "node:readline/promises";
import fs from "fs-extra";
import {
  proxyConfigSchema,
  type ProxyConfig,
  type ProxyProjectConfig,
  type ServiceConfig
} from "./types.js";
import { ensureKibanDirs, expandHome, workspaceIndexFile, workspacesDir } from "./paths.js";

export class ConfigError extends Error {
  code = 2;
}

type WorkspaceIndex = {
  workspaces: Array<{
    root: string;
    configPath: string;
    workspace: string;
  }>;
};

export async function findProxyConfig(startDir = process.cwd()): Promise<string | null> {
  return (await findProxyWorkspace(startDir))?.configPath ?? null;
}

export async function loadProxyConfig(startDir = process.cwd()): Promise<{ path: string; config: ProxyConfig }> {
  const workspace = await findProxyWorkspace(startDir);
  if (!workspace) throw new ConfigError("Kiban workspace not found. Run `kiban init` from the workspace root first.");

  const raw = await fs.readFile(workspace.configPath, "utf8");
  const parsed = JSON.parse(raw) as unknown;
  const result = proxyConfigSchema.safeParse(parsed);
  if (!result.success) {
    throw new ConfigError(`Invalid Kiban workspace config: ${result.error.issues.map((issue) => issue.message).join(", ")}`);
  }

  return { path: workspace.configPath, config: normalizeProxyConfig(result.data, workspace.root) };
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

export type InitialProxyConfigAnswers = {
  workspace?: string;
  proxyPort?: number;
  projectName?: string;
  host?: string;
  target?: string;
  command?: string;
  cwd?: string;
};

export async function writeInitialProxyConfig(_targetPath?: string, answers: InitialProxyConfigAnswers = {}, rootDir = process.cwd()) {
  const root = await resolveWorkspaceRoot(rootDir);
  const existing = await findProxyWorkspace(root);
  if (existing?.root === root) throw new ConfigError(`Kiban workspace already exists for ${root}.`);

  const config = await buildInitialProxyConfig(answers);
  const configPath = workspaceConfigPath(root, config.workspace);
  await fs.ensureDir(path.dirname(configPath));
  await fs.writeJson(configPath, config, { spaces: 2 });
  await registerProxyWorkspace({ root, configPath, workspace: config.workspace });
  return configPath;
}

export async function buildInitialProxyConfig(answers: InitialProxyConfigAnswers = {}): Promise<ProxyConfig> {
  const defaults = {
    workspace: "default",
    proxyPort: 8080,
    projectName: "web",
    host: "web.localhost",
    target: "http://localhost:3000",
    command: "pnpm dev",
    cwd: "."
  };

  const resolved = process.stdin.isTTY && process.stdout.isTTY && Object.keys(answers).length === 0 ? await askInitialProxyConfig(defaults) : answers;
  return proxyConfigSchema.parse({
    workspace: resolved.workspace ?? defaults.workspace,
    proxyPort: resolved.proxyPort ?? defaults.proxyPort,
    services: [],
    projects: [
      {
        name: resolved.projectName ?? defaults.projectName,
        host: resolved.host ?? defaults.host,
        target: resolved.target ?? defaults.target,
        command: resolved.command ?? defaults.command,
        cwd: resolved.cwd ?? defaults.cwd,
        services: []
      }
    ]
  });
}

async function askInitialProxyConfig(defaults: Required<InitialProxyConfigAnswers>) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  try {
    const ask = async (label: string, fallback: string) => {
      const value = (await rl.question(`${label} (${fallback}): `)).trim();
      return value || fallback;
    };
    const proxyPortValue = await ask("Proxy port", String(defaults.proxyPort));
    return {
      workspace: await ask("Workspace", defaults.workspace),
      proxyPort: Number(proxyPortValue),
      projectName: await ask("Project name", defaults.projectName),
      host: await ask("Host", defaults.host),
      target: await ask("Target URL", defaults.target),
      command: await ask("Command", defaults.command),
      cwd: await ask("Working directory", defaults.cwd)
    };
  } finally {
    rl.close();
  }
}

async function findProxyWorkspace(startDir = process.cwd()) {
  const current = await resolveWorkspaceRoot(startDir);
  const index = await readWorkspaceIndex();
  const matches = index.workspaces
    .filter((workspace) => current === workspace.root || current.startsWith(`${workspace.root}${path.sep}`))
    .sort((a, b) => b.root.length - a.root.length);
  for (const workspace of matches) {
    if (await fs.pathExists(workspace.configPath)) return workspace;
  }
  return null;
}

async function registerProxyWorkspace(entry: WorkspaceIndex["workspaces"][number]) {
  const index = await readWorkspaceIndex();
  const workspaces = [entry, ...index.workspaces.filter((workspace) => workspace.root !== entry.root)];
  await ensureKibanDirs();
  await fs.writeJson(workspaceIndexFile(), { workspaces }, { spaces: 2 });
}

async function readWorkspaceIndex(): Promise<WorkspaceIndex> {
  await ensureKibanDirs();
  if (!(await fs.pathExists(workspaceIndexFile()))) return { workspaces: [] };
  const raw = (await fs.readJson(workspaceIndexFile())) as Partial<WorkspaceIndex>;
  return {
    workspaces: (raw.workspaces ?? []).map((workspace) => ({
      root: path.resolve(workspace.root),
      configPath: path.resolve(workspace.configPath),
      workspace: workspace.workspace
    }))
  };
}

async function resolveWorkspaceRoot(value: string) {
  const resolved = path.resolve(value);
  try {
    return await fs.realpath(resolved);
  } catch {
    return resolved;
  }
}

function workspaceConfigPath(root: string, workspace: string) {
  const hash = crypto.createHash("sha1").update(root).digest("hex").slice(0, 10);
  const slug = workspace.replace(/[^a-zA-Z0-9_.-]/g, "-") || "default";
  return path.join(workspacesDir(), `${slug}-${hash}`, "config.json");
}

export function findProxyProject(config: ProxyConfig, name: string): ProxyProjectConfig {
  return findNamed(config.projects, name, "Project", 6);
}

export function findProxyService(config: ProxyConfig, name: string): ServiceConfig {
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
