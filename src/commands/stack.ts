import type { Command } from "commander";
import { loadProxyConfig } from "../config.js";
import { runProxyDoctor } from "../doctor.js";
import { printJson, error as printError, ok, warn } from "../output.js";

export function registerStackCommands(program: Command) {
  program
    .command("doctor")
    .option("--json", "Print JSON.")
    .description("Check config, ports, Docker services, and targets.")
    .action(async (options) => {
      const issues = await loadProxyConfig().then(({ path, config }) => runProxyDoctor(path, config));
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
}
