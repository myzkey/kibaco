import { spawn, type ChildProcess } from "node:child_process";
import { execa } from "execa";
import fs from "fs-extra";
import type { ProxyProjectConfig } from "./types.js";
import { warn } from "./output.js";

export function spawnStreamingProject(project: ProxyProjectConfig) {
  const child = spawn(project.command, {
    cwd: project.cwd,
    shell: true,
    detached: true,
    env: process.env
  });

  child.stdout?.on("data", (chunk: Buffer) => {
    process.stdout.write(prefixLines(project.name, chunk));
  });
  child.stderr?.on("data", (chunk: Buffer) => {
    process.stderr.write(prefixLines(project.name, chunk));
  });
  child.on("exit", (code, signal) => {
    warn(`${project.name} exited${code === null ? "" : ` with code ${code}`}${signal ? ` (${signal})` : ""}`);
  });

  return child;
}

export function stopProcess(child: ChildProcess) {
  if (child.killed) return;
  if (!child.pid) {
    child.kill("SIGTERM");
    return;
  }
  try {
    process.kill(-child.pid, "SIGTERM");
  } catch {
    child.kill("SIGTERM");
  }
}

export function stopProcesses(children: ChildProcess[]) {
  for (const child of children) stopProcess(child);
}

export async function waitForProcesses(children: ChildProcess[]) {
  await new Promise<void>((resolve) => {
    if (children.length === 0) {
      resolve();
      return;
    }
    let exited = 0;
    for (const child of children) {
      child.on("exit", () => {
        exited += 1;
        if (exited === children.length) resolve();
      });
    }
  });
}

export async function fileSize(filePath: string) {
  try {
    return (await fs.stat(filePath)).size;
  } catch {
    return 0;
  }
}

export async function followLogs(logFiles: string[], offsets: Map<string, number>) {
  if (logFiles.length === 1) {
    const [logFile] = logFiles;
    const offset = (offsets.get(logFile) ?? 0) + 1;
    await execa("tail", ["-c", `+${offset}`, "-f", logFile], { stdio: "inherit" });
    return;
  }

  await execa("tail", ["-n", "0", "-f", ...logFiles], { stdio: "inherit" });
}

function prefixLines(projectName: string, chunk: Buffer) {
  return chunk
    .toString()
    .split(/\r?\n/)
    .map((line, index, lines) => (index === lines.length - 1 && line === "" ? "" : `[${projectName}] ${line}`))
    .join("\n");
}
