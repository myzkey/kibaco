import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import http from "node:http";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const cliPath = path.join(repoRoot, "dist", "cli.js");
const exampleDir = path.join(repoRoot, "examples", "local-http");

const proxyPort = await findFreePort();
const targetPort = await findFreePort();
const workDir = await fs.mkdtemp(path.join(os.tmpdir(), "kiban-smoke-"));

let child;
try {
  await fs.copyFile(path.join(exampleDir, "server.mjs"), path.join(workDir, "server.mjs"));
  await fs.writeFile(
    path.join(workDir, "kiban.config.json"),
    `${JSON.stringify(
      {
        workspace: "smoke",
        proxyPort,
        projects: [
          {
            name: "web",
            host: "web.localhost",
            target: `http://localhost:${targetPort}`,
            command: "node server.mjs",
            cwd: "."
          }
        ]
      },
      null,
      2
    )}\n`
  );

  child = spawn(process.execPath, [cliPath, "dev"], {
    cwd: workDir,
    env: { ...process.env, PORT: String(targetPort) },
    stdio: ["ignore", "pipe", "pipe"]
  });

  const output = collectOutput(child);
  await waitForOutput(output, `listening on http://127.0.0.1:${proxyPort}`, child);

  const response = await requestWithRetry({
    hostname: "127.0.0.1",
    port: proxyPort,
    path: "/smoke",
    headers: { host: `web.localhost:${proxyPort}` }
  });
  const body = JSON.parse(response.body);
  if (response.statusCode < 200 || response.statusCode >= 300 || body.ok !== true || body.path !== "/smoke") {
    throw new Error(`Unexpected smoke response: ${JSON.stringify(body)}`);
  }

  console.log(`OK local-http smoke passed on proxy port ${proxyPort}`);
} finally {
  if (child && !child.killed) {
    child.kill("SIGINT");
    await waitForExit(child, 3000).catch(() => child.kill("SIGTERM"));
  }
  await fs.rm(workDir, { force: true, recursive: true });
}

function findFreePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      server.close(() => {
        if (!address || typeof address === "string") reject(new Error("Could not allocate a free port."));
        else resolve(address.port);
      });
    });
  });
}

function collectOutput(process) {
  const chunks = [];
  process.stdout.on("data", (chunk) => chunks.push(chunk.toString()));
  process.stderr.on("data", (chunk) => chunks.push(chunk.toString()));
  return {
    text: () => chunks.join("")
  };
}

async function waitForOutput(output, expected, process) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < 10_000) {
    if (output.text().includes(expected)) return;
    if (process.exitCode !== null) throw new Error(`kiban dev exited early:\n${output.text()}`);
    await delay(50);
  }
  throw new Error(`Timed out waiting for "${expected}". Output:\n${output.text()}`);
}

async function requestWithRetry(options) {
  const startedAt = Date.now();
  let lastError;
  while (Date.now() - startedAt < 10_000) {
    try {
      return await httpRequest(options);
    } catch (error) {
      lastError = error;
      await delay(100);
    }
  }
  throw lastError ?? new Error(`Timed out fetching ${options.hostname}:${options.port}${options.path}`);
}

function httpRequest(options) {
  return new Promise((resolve, reject) => {
    const request = http.request(options, (response) => {
      const chunks = [];
      response.on("data", (chunk) => chunks.push(chunk));
      response.on("end", () => {
        resolve({
          statusCode: response.statusCode ?? 0,
          body: Buffer.concat(chunks).toString("utf8")
        });
      });
    });
    request.once("error", reject);
    request.end();
  });
}

function waitForExit(process, timeoutMs) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error("Timed out waiting for child process exit.")), timeoutMs);
    process.once("exit", () => {
      clearTimeout(timeout);
      resolve();
    });
  });
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
