#!/usr/bin/env node
import fs from "fs-extra";
import { Command } from "commander";
import open from "open";
import { execa } from "execa";
import { findProject, loadConfig, saveConfig, writeInitialConfig } from "./config.js";
import { runDoctor } from "./doctor.js";
import { projectLogPath } from "./paths.js";
import { getPortUsage, listListeningPorts } from "./ports.js";
import { getProjectStatus } from "./runtime.js";
import { startProject, stopProject } from "./runtime.js";
import { printJson, error as printError, ok, warn } from "./output.js";
import type { KibanConfig } from "./types.js";

const program = new Command();

program
  .name("kiban")
  .description("An AI-friendly local development stack manager.")
  .version("0.1.0");

program
  .command("init")
  .description("Create kiban.yml in the current directory.")
  .action(async () => {
    const configPath = await writeInitialConfig();
    ok(`Created ${configPath}`);
  });

program
  .command("add")
  .argument("<name>")
  .option("--path <path>")
  .option("--cmd <command>")
  .option("--port <port>")
  .option("--url <url>")
  .option("--service <name...>")
  .option("--editor <command>")
  .description("Add a project to kiban.yml. Non-interactive options are supported.")
  .action(async (name, options) => {
    const { path, config } = await loadConfig();
    if (!options.path || !options.cmd) {
      throw new Error("Non-interactive add requires --path and --cmd.");
    }
    const next: KibanConfig = {
      ...config,
      projects: [
        ...config.projects.filter((project) => project.name !== name),
        {
          name,
          path: options.path,
          command: options.cmd,
          port: options.port ? Number(options.port) : undefined,
          url: options.url,
          services: options.service ?? [],
          editor: options.editor
        }
      ]
    };
    await saveConfig(path, next);
    ok(`Added project ${name}`);
  });

program
  .command("list")
  .option("--json", "Print JSON.")
  .description("List registered projects.")
  .action(async (options) => {
    const { config } = await loadConfig();
    const rows = await Promise.all(
      config.projects.map(async (project) => ({
        name: project.name,
        ...(await getProjectStatus(project)),
        port: project.port,
        url: project.url,
        services: project.services ?? []
      }))
    );
    if (options.json) return printJson({ projects: rows });
    for (const row of rows) console.log(`${row.name}\t${row.status}\t${row.port ?? "-"}\t${row.url ?? "-"}\t${row.services.join(",")}`);
  });

program
  .command("up")
  .argument("[projects...]")
  .option("--all", "Start all projects.")
  .description("Start projects and their dependent services.")
  .action(async (names: string[], options) => {
    const { config } = await loadConfig();
    const targets = options.all ? config.projects : names.map((name) => findProject(config, name));
    if (targets.length === 0) throw new Error("Specify a project name or --all.");
    for (const project of targets) {
      const result = await startProject(config, project);
      ok(`${project.name} ${result.alreadyRunning ? "already running" : "started"}${result.pid ? ` (pid ${result.pid})` : ""}`);
    }
  });

program
  .command("down")
  .argument("<projects...>")
  .option("--with-services", "Stop dependent Docker services too.")
  .description("Stop projects.")
  .action(async (names: string[], options) => {
    const { config } = await loadConfig();
    for (const name of names) {
      const result = await stopProject(config, findProject(config, name), Boolean(options.withServices));
      ok(`${name} stopped${result.pid ? ` (pid ${result.pid})` : ""}`);
    }
  });

program
  .command("restart")
  .argument("<projects...>")
  .description("Restart projects.")
  .action(async (names: string[]) => {
    const { config } = await loadConfig();
    for (const name of names) {
      const project = findProject(config, name);
      await stopProject(config, project);
      const result = await startProject(config, project);
      ok(`${name} restarted (pid ${result.pid})`);
    }
  });

program
  .command("status")
  .option("--json", "Print JSON.")
  .description("Show project status.")
  .action(async (options) => {
    const { config } = await loadConfig();
    const projects = await Promise.all(
      config.projects.map(async (project) => ({
        name: project.name,
        ...(await getProjectStatus(project)),
        port: project.port,
        url: project.url,
        services: project.services ?? []
      }))
    );
    if (options.json) return printJson({ projects });
    for (const project of projects) console.log(`${project.name}\t${project.status}\t${project.pid ?? "-"}\t${project.port ?? "-"}\t${project.url ?? "-"}`);
  });

program
  .command("logs")
  .argument("<project>")
  .option("--follow", "Follow logs.")
  .option("--json", "Print JSON.")
  .description("Show project logs.")
  .action(async (name, options) => {
    const { config } = await loadConfig();
    const project = findProject(config, name);
    const logFile = project.logFile ?? projectLogPath(project.name);
    if (options.json) return printJson({ project: name, logFile, content: (await fs.pathExists(logFile)) ? await fs.readFile(logFile, "utf8") : "" });
    if (options.follow) {
      await execa("tail", ["-f", logFile], { stdio: "inherit" });
      return;
    }
    if (await fs.pathExists(logFile)) console.log(await fs.readFile(logFile, "utf8"));
    else warn(`No log file found for ${name}: ${logFile}`);
  });

program
  .command("doctor")
  .option("--json", "Print JSON.")
  .description("Inspect configuration and local environment.")
  .action(async (options) => {
    const { path, config } = await loadConfig();
    const issues = await runDoctor(path, config);
    if (options.json) {
      printJson({ issues });
      if (issues.some((issue) => issue.level === "error")) process.exitCode = 1;
      return;
    }
    for (const issue of issues) {
      const message = `${issue.message}${issue.suggestion ? ` Suggestion: ${issue.suggestion}` : ""}`;
      if (issue.level === "ok") ok(message);
      else if (issue.level === "warn") warn(message);
      else printError(message);
    }
    if (issues.some((issue) => issue.level === "error")) process.exitCode = 1;
  });

program
  .command("ports")
  .option("--json", "Print JSON.")
  .description("List local listening ports and match registered projects.")
  .action(async (options) => {
    const { config } = await loadConfig();
    const usages = await listListeningPorts();
    const rows = usages.map((usage) => ({
      ...usage,
      registeredProject: config.projects.find((project) => project.port === usage.port)?.name
    }));
    if (options.json) return printJson({ ports: rows });
    for (const row of rows) console.log(`${row.port}\t${row.command ?? "-"}\t${row.pid ?? "-"}\t${row.registeredProject ?? "-"}`);
  });

program
  .command("kill-port")
  .argument("<port>")
  .option("--force", "Skip confirmation.")
  .description("Kill the process listening on a port.")
  .action(async (portValue, options) => {
    const port = Number(portValue);
    const usage = await getPortUsage(port);
    if (!usage?.pid) throw new Error(`No process found on port ${port}.`);
    if (!options.force) throw new Error(`Refusing to kill pid ${usage.pid} without --force.`);
    process.kill(usage.pid, "SIGTERM");
    ok(`Killed pid ${usage.pid} on port ${port}`);
  });

program
  .command("open")
  .argument("<project>")
  .description("Open a project URL in the browser.")
  .action(async (name) => {
    const { config } = await loadConfig();
    const project = findProject(config, name);
    if (!project.url) throw new Error(`${name} has no url configured.`);
    await open(project.url);
    ok(`Opened ${project.url}`);
  });

program
  .command("edit")
  .argument("<project>")
  .description("Open a project in an editor.")
  .action(async (name) => {
    const { config } = await loadConfig();
    const project = findProject(config, name);
    await execa(project.editor ?? "code", [project.path], { stdio: "inherit" });
  });

program
  .command("start")
  .argument("[projects...]")
  .option("--all", "Start all projects.")
  .description("Alias for up.")
  .action(async (names: string[], options) => {
    const { config } = await loadConfig();
    const targets = options.all ? config.projects : names.map((name) => findProject(config, name));
    if (targets.length === 0) throw new Error("Specify a project name or --all.");
    for (const project of targets) {
      const result = await startProject(config, project);
      ok(`${project.name} ${result.alreadyRunning ? "already running" : "started"}${result.pid ? ` (pid ${result.pid})` : ""}`);
    }
  });

program
  .command("stop")
  .argument("<projects...>")
  .option("--with-services", "Stop dependent Docker services too.")
  .description("Alias for down.")
  .action(async (names: string[], options) => {
    const { config } = await loadConfig();
    for (const name of names) {
      const result = await stopProject(config, findProject(config, name), Boolean(options.withServices));
      ok(`${name} stopped${result.pid ? ` (pid ${result.pid})` : ""}`);
    }
  });

program.parseAsync().catch((err: Error & { code?: number }) => {
  printError(err.message);
  process.exit(err.code ?? 1);
});
