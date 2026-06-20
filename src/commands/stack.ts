import type { Command } from "commander";
import { loadProxyConfig } from "../config.js";
import { buildProxyDoctorReport } from "../doctor.js";
import { printJson, error as printError, ok, warn } from "../output.js";

export function registerStackCommands(program: Command) {
  program
    .command("doctor")
    .option("--json", "Print JSON.")
    .description("Check config, ports, Docker services, and targets.")
    .action(async (options) => {
      const report = await loadProxyConfig().then(({ path, config }) => buildProxyDoctorReport(path, config));
      if (options.json) {
        printJson(report);
        if (report.issues.some((issue) => issue.level === "error")) process.exitCode = 1;
        return;
      }
      for (const issue of report.issues) {
        const message = `${issue.message}${issue.suggestion ? ` Suggestion: ${issue.suggestion}` : ""}`;
        if (issue.level === "ok") ok(message);
        else if (issue.level === "warn") warn(message);
        else printError(message);
      }
      if (report.issues.some((issue) => issue.level === "error")) process.exitCode = 1;
    });
}
