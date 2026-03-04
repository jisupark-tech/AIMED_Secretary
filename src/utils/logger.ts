import chalk from "chalk";
import type { LogLevel } from "../core/types.js";

const LEVELS: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

let currentLevel: LogLevel = "info";

export function setLogLevel(level: LogLevel) {
  currentLevel = level;
}

function shouldLog(level: LogLevel): boolean {
  return LEVELS[level] >= LEVELS[currentLevel];
}

function timestamp(): string {
  return new Date().toISOString().slice(11, 19);
}

export const log = {
  debug(msg: string, ...args: unknown[]) {
    if (shouldLog("debug"))
      console.log(chalk.gray(`[${timestamp()}] DBG ${msg}`), ...args);
  },
  info(msg: string, ...args: unknown[]) {
    if (shouldLog("info"))
      console.log(chalk.blue(`[${timestamp()}] INF ${msg}`), ...args);
  },
  warn(msg: string, ...args: unknown[]) {
    if (shouldLog("warn"))
      console.log(chalk.yellow(`[${timestamp()}] WRN ${msg}`), ...args);
  },
  error(msg: string, ...args: unknown[]) {
    if (shouldLog("error"))
      console.log(chalk.red(`[${timestamp()}] ERR ${msg}`), ...args);
  },
};
