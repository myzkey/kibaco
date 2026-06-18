import fs from "fs-extra";
import { ensureKibacoDirs, projectPidPath, STATE_FILE } from "./paths.js";
import type { KibacoState } from "./types.js";

const emptyState: KibacoState = { projects: {} };

export async function readState(): Promise<KibacoState> {
  await ensureKibacoDirs();
  if (!(await fs.pathExists(STATE_FILE))) return emptyState;
  return { ...emptyState, ...(await fs.readJson(STATE_FILE)) };
}

export async function writeState(state: KibacoState) {
  await ensureKibacoDirs();
  await fs.writeJson(STATE_FILE, state, { spaces: 2 });
}

export async function readPid(projectName: string): Promise<number | undefined> {
  const pidFile = projectPidPath(projectName);
  if (!(await fs.pathExists(pidFile))) return undefined;
  const raw = (await fs.readFile(pidFile, "utf8")).trim();
  const pid = Number(raw);
  return Number.isFinite(pid) ? pid : undefined;
}

export async function writePid(projectName: string, pid: number) {
  await ensureKibacoDirs();
  await fs.writeFile(projectPidPath(projectName), String(pid));
}

export async function removePid(projectName: string) {
  await fs.remove(projectPidPath(projectName));
}

export function isProcessAlive(pid: number) {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}
