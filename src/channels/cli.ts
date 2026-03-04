import * as readline from "node:readline";
import chalk from "chalk";
import type { Channel, Message } from "../core/types.js";
import { log } from "../utils/logger.js";

export class CLIChannel implements Channel {
  name = "cli";
  private rl: readline.Interface | null = null;
  private messageHandler: ((msg: Message) => Promise<void>) | null = null;
  private sessionId = "cli-default";

  onMessage(handler: (msg: Message) => Promise<void>) {
    this.messageHandler = handler;
  }

  async start() {
    this.rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });

    console.log(chalk.cyan.bold("\n  AIMED Secretary"));
    console.log(chalk.gray("  Type your message. Commands: /clear, /quit\n"));

    this.prompt();

    this.rl.on("line", async (input) => {
      const trimmed = input.trim();
      if (!trimmed) {
        this.prompt();
        return;
      }

      // Handle commands
      if (trimmed === "/quit" || trimmed === "/exit") {
        console.log(chalk.gray("\n  Goodbye!\n"));
        process.exit(0);
      }

      if (trimmed === "/clear") {
        console.clear();
        console.log(chalk.cyan.bold("\n  AIMED Secretary"));
        console.log(chalk.gray("  Session cleared.\n"));
        this.prompt();
        return;
      }

      if (!this.messageHandler) {
        this.prompt();
        return;
      }

      const msg: Message = {
        id: crypto.randomUUID(),
        sessionId: this.sessionId,
        role: "user",
        content: trimmed,
        channelId: this.name,
        timestamp: Date.now(),
      };

      // Show thinking indicator
      process.stdout.write(chalk.gray("  Thinking..."));

      try {
        await this.messageHandler(msg);
      } catch (err) {
        log.error("CLI message handling failed:", err);
        console.log(chalk.red("\n  Error processing message."));
      }
    });

    this.rl.on("close", () => {
      console.log(chalk.gray("\n  Goodbye!\n"));
      process.exit(0);
    });
  }

  async stop() {
    this.rl?.close();
  }

  async sendResponse(_sessionId: string, content: string) {
    // Clear the "Thinking..." line
    readline.clearLine(process.stdout, 0);
    readline.cursorTo(process.stdout, 0);

    // Print response with formatting
    const lines = content.split("\n");
    for (const line of lines) {
      console.log(chalk.green(`  ${line}`));
    }
    console.log();

    this.prompt();
  }

  private prompt() {
    process.stdout.write(chalk.white.bold("  You > "));
  }
}
