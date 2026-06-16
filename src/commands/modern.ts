import type { Command } from "commander";
import open from "open";
import { findConfig, findProxyConfig, findProxyProject, loadConfig, loadProxyConfig, writeInitialProxyConfig } from "../config.js";
import { runDev } from "../dev.js";
import { assertProxyPortAvailable } from "../proxy-runtime.js";
import { getServiceStatuses, startServices, stopServices } from "../service-runtime.js";
import { listListeningPorts } from "../ports.js";
import { proxyUrl, startProxy, targetPort } from "../proxy.js";
import { getProjectStatus } from "../runtime.js";
import { printJson, ok } from "../output.js";

export function registerModernCommands(program: Command) {
  program
    .command("init")
    .description("Create kiban.config.json in the current directory.")
    .action(async () => {
      const configPath = await writeInitialProxyConfig();
      ok(`Created ${configPath}`);
    });

  program
    .command("list")
    .option("--json", "Print JSON.")
    .description("List registered projects.")
    .action(async (options) => {
      if (await findProxyConfig()) {
        const { config } = await loadProxyConfig();
        const rows = config.projects.map((project) => ({
          name: project.name,
          host: proxyUrl(config, project.host),
          target: project.target,
          command: project.command,
          cwd: project.cwd,
          services: project.services ?? []
        }));
        if (options.json) return printJson({ workspace: config.workspace, proxyPort: config.proxyPort, services: config.services, projects: rows });
        for (const row of rows) {
          console.log(`${row.name}`);
          console.log(`  host: ${row.host}`);
          console.log(`  target: ${row.target}`);
          console.log(`  command: ${row.command}`);
          if (row.services.length > 0) console.log(`  services: ${row.services.join(", ")}`);
        }
        return;
      }

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
    .command("dev")
    .description("Run all commands from kiban.config.json and stream their output.")
    .action(async () => {
      const { config } = await loadProxyConfig();
      await runDev(config);
    });

  registerServicesCommand(program);

  program
    .command("ports")
    .option("--json", "Print JSON.")
    .description("List local listening ports and match registered projects.")
    .action(async (options) => {
      const proxyConfig = (await findProxyConfig()) ? (await loadProxyConfig()).config : null;
      const ymlConfig = !proxyConfig && (await findConfig()) ? (await loadConfig()).config : null;
      const usages = await listListeningPorts();
      const rows = usages.map((usage) => ({
        ...usage,
        registeredProject:
          proxyConfig?.projects.find((project) => targetPort(project.target) === usage.port)?.name ??
          ymlConfig?.projects.find((project) => project.port === usage.port)?.name
      }));
      if (options.json) return printJson({ ports: rows });
      for (const row of rows) console.log(`${row.port}\t${row.command ?? "-"}\t${row.pid ?? "-"}\t${row.registeredProject ?? "-"}`);
    });

  program
    .command("proxy")
    .description("Start the local HTTP reverse proxy from kiban.config.json.")
    .action(async () => {
      const { config } = await loadProxyConfig();
      await assertProxyPortAvailable(config.proxyPort);
      const server = await startProxy(config);
      ok(`Proxy listening on http://localhost:${config.proxyPort}`);
      for (const project of config.projects) {
        console.log(`${proxyUrl(config, project.host)} -> ${project.target}`);
      }

      const close = () => {
        server.close(() => process.exit(0));
      };
      process.once("SIGINT", close);
      process.once("SIGTERM", close);
    });

  program
    .command("open")
    .argument("<project>")
    .description("Open a project URL in the browser.")
    .action(async (name) => {
      if (await findProxyConfig()) {
        const { config } = await loadProxyConfig();
        const project = findProxyProject(config, name);
        const url = proxyUrl(config, project.host);
        await open(url);
        ok(`Opened ${url}`);
        return;
      }

      const { findProject } = await import("../config.js");
      const { config } = await loadConfig();
      const project = findProject(config, name);
      if (!project.url) throw new Error(`${name} has no url configured.`);
      await open(project.url);
      ok(`Opened ${project.url}`);
    });
}

function registerServicesCommand(program: Command) {
  const servicesCommand = program.command("services").description("Manage Docker services from kiban.config.json.");

  servicesCommand
    .command("up")
    .argument("[services...]")
    .description("Start Docker services from kiban.config.json.")
    .action(async (names: string[]) => {
      const { config } = await loadProxyConfig();
      const targets = names.length > 0 ? names : config.services.map((service) => service.name);
      if (targets.length === 0) throw new Error("No services configured in kiban.config.json.");
      await startServices(config, targets, { print: true });
    });

  servicesCommand
    .command("down")
    .argument("[services...]")
    .description("Stop Docker services from kiban.config.json.")
    .action(async (names: string[]) => {
      const { config } = await loadProxyConfig();
      const targets = names.length > 0 ? names : config.services.map((service) => service.name);
      if (targets.length === 0) throw new Error("No services configured in kiban.config.json.");
      await stopServices(config, targets);
      for (const name of targets) ok(`Stopped service ${name}`);
    });

  servicesCommand
    .command("status")
    .option("--json", "Print JSON.")
    .description("Show Docker service status from kiban.config.json.")
    .action(async (options) => {
      const { config } = await loadProxyConfig();
      const rows = await getServiceStatuses(config);
      if (options.json) return printJson({ services: rows });
      for (const row of rows) {
        console.log(`${row.name}\t${row.running ? "running" : "stopped"}\t${row.container}\t${row.ports.join(",")}`);
      }
    });
}
