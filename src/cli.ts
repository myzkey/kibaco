#!/usr/bin/env node
import { Command } from "commander";
import { registerModernCommands } from "./commands/modern.js";
import { registerStackCommands } from "./commands/stack.js";
import { registerSystemCommands } from "./commands/system.js";
import { error as printError } from "./output.js";

const program = new Command();

program
  .name("kiban")
  .description("An AI-friendly local development stack manager.")
  .version("0.1.0");

registerModernCommands(program);
registerStackCommands(program);
registerSystemCommands(program);

program.parseAsync().catch((err: Error & { code?: number }) => {
  printError(err.message);
  process.exit(typeof err.code === "number" ? err.code : 1);
});
