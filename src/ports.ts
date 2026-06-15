import net from "node:net";
import { execa } from "execa";

export type PortUsage = {
  port: number;
  pid?: number;
  command?: string;
  raw?: string;
};

export async function isPortAvailable(port: number, host = "127.0.0.1") {
  return new Promise<boolean>((resolve) => {
    const server = net.createServer();
    server.once("error", (error: NodeJS.ErrnoException) => {
      resolve(error.code !== "EADDRINUSE");
    });
    server.once("listening", () => {
      server.close(() => resolve(true));
    });
    server.listen(port, host);
  });
}

export async function getPortUsage(port: number): Promise<PortUsage | null> {
  try {
    const { stdout } = await execa("lsof", ["-nP", "-iTCP", `-sTCP:LISTEN`]);
    const line = stdout
      .split("\n")
      .slice(1)
      .find((item) => item.includes(`:${port} `) || item.endsWith(`:${port}`));
    if (!line) return null;
    const parts = line.trim().split(/\s+/);
    return { port, command: parts[0], pid: Number(parts[1]), raw: line };
  } catch {
    return null;
  }
}

export async function listListeningPorts(): Promise<PortUsage[]> {
  try {
    const { stdout } = await execa("lsof", ["-nP", "-iTCP", "-sTCP:LISTEN"]);
    const rows: Array<PortUsage | null> = stdout
      .split("\n")
      .slice(1)
      .map((line) => {
        const parts = line.trim().split(/\s+/);
        const match = line.match(/:(\d+)\s+\(LISTEN\)|:(\d+)$/);
        const port = Number(match?.[1] ?? match?.[2]);
        return Number.isFinite(port) ? { port, command: parts[0], pid: Number(parts[1]), raw: line } : null;
      });
    return rows.filter((item): item is PortUsage => item !== null);
  } catch {
    return [];
  }
}
