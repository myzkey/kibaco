import chalk from "chalk";

export function printJson(value: unknown) {
  console.log(JSON.stringify(value, null, 2));
}

export function ok(message: string) {
  console.log(chalk.green("OK"), message);
}

export function warn(message: string) {
  console.log(chalk.yellow("WARN"), message);
}

export function error(message: string) {
  console.error(chalk.red("ERROR"), message);
}
