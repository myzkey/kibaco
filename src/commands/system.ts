import type { Command } from "commander";
import { getPortUsage } from "../ports.js";
import { ok } from "../output.js";

export function registerSystemCommands(program: Command) {
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
}
