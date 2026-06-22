import fs from "fs-extra";
import path from "node:path";
import type { ProxyProjectConfig } from "./types.js";

export type CleanResult = {
  project: string;
  removed: string[];
  missing: string[];
};

type PackageJson = {
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
};

const sourceExtensions = new Set([".js", ".jsx", ".ts", ".tsx", ".mjs", ".cjs", ".css", ".scss", ".sass", ".md", ".mdx", ".json"]);
const ignoredSourceDirs = new Set([".git", ".next", ".vite", ".docusaurus", "build", "dist", "node_modules", ".turbo", ".cache"]);

export async function cleanProjectCaches(projects: ProxyProjectConfig[]) {
  const results: CleanResult[] = [];
  for (const project of projects) {
    results.push(await cleanProjectCache(project));
  }
  return results;
}

export async function cleanProjectCache(project: ProxyProjectConfig): Promise<CleanResult> {
  const directories = await projectCacheDirectories(project);
  const result: CleanResult = { project: project.name, removed: [], missing: [] };
  for (const directory of directories) {
    const absolute = path.resolve(project.cwd, directory);
    if (!isSafeCachePath(project.cwd, absolute)) continue;
    if (await fs.pathExists(absolute)) {
      await fs.remove(absolute);
      result.removed.push(path.relative(project.cwd, absolute) || ".");
    } else {
      result.missing.push(path.relative(project.cwd, absolute) || ".");
    }
  }
  return result;
}

export async function projectCacheDirectories(project: ProxyProjectConfig) {
  const configured = [...(project.cacheDirs ?? []), ...(project.cache_dirs ?? [])];
  return [...new Set([...configured, ...(await inferProjectCacheDirs(project.cwd))])];
}

export async function projectHasStaleCache(project: ProxyProjectConfig) {
  const directories = await projectCacheDirectories(project);
  const sourceMtime = await newestSourceMtime(project.cwd);
  if (!sourceMtime) return null;

  for (const directory of directories) {
    const absolute = path.resolve(project.cwd, directory);
    if (!isSafeCachePath(project.cwd, absolute) || !(await fs.pathExists(absolute))) continue;
    const cacheMtime = (await fs.stat(absolute)).mtimeMs;
    if (sourceMtime > cacheMtime) {
      return {
        directory: path.relative(project.cwd, absolute) || ".",
        sourceMtime,
        cacheMtime
      };
    }
  }
  return null;
}

async function inferProjectCacheDirs(cwd: string) {
  const packageJson = await readPackageJson(cwd);
  const deps = { ...(packageJson?.dependencies ?? {}), ...(packageJson?.devDependencies ?? {}) };
  const dirs = ["node_modules/.cache"];

  if (deps.next || (await fs.pathExists(path.join(cwd, "next.config.js"))) || (await fs.pathExists(path.join(cwd, "next.config.mjs")))) {
    dirs.push(".next");
  }
  if (deps.vite || (await fs.pathExists(path.join(cwd, "vite.config.ts"))) || (await fs.pathExists(path.join(cwd, "vite.config.js")))) {
    dirs.push("dist", ".vite", "node_modules/.vite");
  }
  if (deps["@docusaurus/core"] || (await fs.pathExists(path.join(cwd, "docusaurus.config.js"))) || (await fs.pathExists(path.join(cwd, "docusaurus.config.ts")))) {
    dirs.push(".docusaurus", "build");
  }

  return dirs;
}

async function readPackageJson(cwd: string) {
  try {
    return (await fs.readJson(path.join(cwd, "package.json"))) as PackageJson;
  } catch {
    return null;
  }
}

function isSafeCachePath(cwd: string, absolute: string) {
  const root = path.resolve(cwd);
  const relative = path.relative(root, absolute);
  return relative.length > 0 && !relative.startsWith("..") && !path.isAbsolute(relative);
}

async function newestSourceMtime(cwd: string) {
  let newest = 0;
  await walkSources(cwd, async (filePath) => {
    const stats = await fs.stat(filePath);
    newest = Math.max(newest, stats.mtimeMs);
  });
  return newest > 0 ? newest : null;
}

async function walkSources(directory: string, visit: (filePath: string) => Promise<void>) {
  if (!(await fs.pathExists(directory))) return;
  for (const entry of await fs.readdir(directory, { withFileTypes: true })) {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      if (ignoredSourceDirs.has(entry.name)) continue;
      await walkSources(entryPath, visit);
      continue;
    }
    if (entry.isFile() && sourceExtensions.has(path.extname(entry.name))) await visit(entryPath);
  }
}
