import fs from "fs-extra";
import type { Command } from "commander";
import { execa } from "execa";
import { findProject, findProxyConfig, loadConfig, loadProxyConfig, saveConfig } from "../config.js";
import { runDoctor, runProxyDoctor } from "../doctor.js";
import { printJson, error as printError, ok, warn } from "../output.js";
import { projectLogPath } from "../paths.js";
import { fileSize, followLogs } from "../process.js";
import { getProjectStatus, startProject, stopProject } from "../runtime.js";
import type { KibanConfig } from "../types.js";

export function registerStackCommands(program: Command) {
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

  registerUpCommand(program, "up", "Start projects and their dependent services.");

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
      const proxyConfigPath = await findProxyConfig();
      const issues = proxyConfigPath
        ? await loadProxyConfig().then(({ path, config }) => runProxyDoctor(path, config))
        : await loadConfig().then(({ path, config }) => runDoctor(path, config));
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
    .command("edit")
    .argument("<project>")
    .description("Open a project in an editor.")
    .action(async (name) => {
      const { config } = await loadConfig();
      const project = findProject(config, name);
      await execa(project.editor ?? "code", [project.path], { stdio: "inherit" });
    });

  registerUpCommand(program, "start", "Alias for up.");

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
}

function registerUpCommand(program: Command, commandName: string, description: string) {
  program
    .command(commandName)
    .argument("[projects...]")
    .option("--all", "Start all projects.")
    .option("-d, --detach", "Start projects in the background without following logs.")
    .option("--follow", "Follow project logs after starting. This is the default unless --detach is used.")
    .description(description)
    .action(async (names: string[], options) => {
      const { config } = await loadConfig();
      const targets = options.all ? config.projects : names.map((name) => findProject(config, name));
      if (targets.length === 0) throw new Error("Specify a project name or --all.");
      const logFiles: string[] = [];
      const logOffsets = new Map<string, number>();
      for (const project of targets) {
        const logFile = project.logFile ?? projectLogPath(project.name);
        logOffsets.set(logFile, await fileSize(logFile));
        const result = await startProject(config, project);
        ok(`${project.name} ${result.alreadyRunning ? "already running" : "started"}${result.pid ? ` (pid ${result.pid})` : ""}`);
        logFiles.push(result.logFile ?? logFile);
      }
      if (!options.detach || options.follow) await followLogs(logFiles, logOffsets);
    });
}
