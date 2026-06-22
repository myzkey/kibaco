import fs from "fs-extra";
import path from "node:path";
import { cacheDir } from "./paths.js";
import { packageVersion } from "./version.js";

const REGISTRY_LATEST_URL = "https://registry.npmjs.org/kibaco/latest";
const DEFAULT_CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const DEFAULT_TIMEOUT_MS = 800;

type UpdateCache = {
  checkedAt: string;
  latestVersion: string;
};

type RegistryLatestResponse = {
  version?: string;
};

type Fetcher = (url: string, init?: RequestInit) => Promise<Response>;

type CheckUpdateOptions = {
  currentVersion?: string;
  now?: Date;
  cacheFile?: string;
  cacheTtlMs?: number;
  timeoutMs?: number;
  fetcher?: Fetcher;
};

export type UpdateNotice = {
  currentVersion: string;
  latestVersion: string;
};

export async function notifyIfUpdateAvailable(options: CheckUpdateOptions = {}) {
  if (isUpdateCheckDisabled()) return;
  const notice = await checkForUpdate(options);
  if (!notice) return;
  process.stderr.write(
    `Update available: kibaco ${notice.currentVersion} -> ${notice.latestVersion}\n` +
      `Run: npm install -g kibaco@latest\n`
  );
}

export async function checkForUpdate(options: CheckUpdateOptions = {}): Promise<UpdateNotice | null> {
  const currentVersion = options.currentVersion ?? packageVersion();
  const latestVersion = await latestPackageVersion(options);
  if (!latestVersion || compareVersions(latestVersion, currentVersion) <= 0) return null;
  return { currentVersion, latestVersion };
}

async function latestPackageVersion(options: CheckUpdateOptions) {
  const now = options.now ?? new Date();
  const cacheFile = options.cacheFile ?? updateCheckCacheFile();
  const cacheTtlMs = options.cacheTtlMs ?? DEFAULT_CACHE_TTL_MS;
  const cached = await readCache(cacheFile);
  if (cached && now.getTime() - Date.parse(cached.checkedAt) < cacheTtlMs) return cached.latestVersion;

  const latestVersion = await fetchLatestVersion(options.fetcher ?? fetch, options.timeoutMs ?? DEFAULT_TIMEOUT_MS);
  if (!latestVersion) return cached?.latestVersion;

  await writeCache(cacheFile, { checkedAt: now.toISOString(), latestVersion });
  return latestVersion;
}

async function fetchLatestVersion(fetcher: Fetcher, timeoutMs: number) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetcher(REGISTRY_LATEST_URL, { signal: controller.signal });
    if (!response.ok) return null;
    const body = (await response.json()) as RegistryLatestResponse;
    return typeof body.version === "string" ? body.version : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

async function readCache(cacheFile: string) {
  try {
    const cache = (await fs.readJson(cacheFile)) as Partial<UpdateCache>;
    if (typeof cache.checkedAt !== "string" || typeof cache.latestVersion !== "string") return null;
    return cache as UpdateCache;
  } catch {
    return null;
  }
}

async function writeCache(cacheFile: string, cache: UpdateCache) {
  try {
    await fs.ensureDir(path.dirname(cacheFile));
    await fs.writeJson(cacheFile, cache);
  } catch {
    // Update checks should never block the requested CLI command.
  }
}

function updateCheckCacheFile() {
  return path.join(cacheDir(), "update-check.json");
}

function isUpdateCheckDisabled() {
  return ["1", "true", "yes"].includes(String(process.env.KIBACO_DISABLE_UPDATE_CHECK ?? "").toLowerCase());
}

export function compareVersions(left: string, right: string) {
  const leftParts = parseVersion(left);
  const rightParts = parseVersion(right);
  for (let index = 0; index < 3; index += 1) {
    const diff = leftParts.numbers[index] - rightParts.numbers[index];
    if (diff !== 0) return diff;
  }
  if (leftParts.prerelease === rightParts.prerelease) return 0;
  if (!leftParts.prerelease) return 1;
  if (!rightParts.prerelease) return -1;
  return leftParts.prerelease.localeCompare(rightParts.prerelease);
}

function parseVersion(version: string) {
  const [main, prerelease] = version.replace(/^v/, "").split("-", 2);
  const numbers = main.split(".").map((part) => Number.parseInt(part, 10));
  return {
    numbers: [numbers[0] || 0, numbers[1] || 0, numbers[2] || 0],
    prerelease
  };
}
