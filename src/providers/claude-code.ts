import { spawn } from "node:child_process";
import type { LLMProvider, LLMRequest, LLMResponse } from "../core/types.js";
import { log } from "../utils/logger.js";

export class ClaudeCodeProvider implements LLMProvider {
  name = "claude-code";
  private cliPath: string;
  private cleanEnv: Record<string, string>;

  constructor(cliPath = "claude") {
    this.cliPath = cliPath;
    // Remove CLAUDECODE env var to allow spawning from within a Claude Code session
    const env = { ...process.env };
    delete env.CLAUDECODE;
    this.cleanEnv = env as Record<string, string>;
  }

  async isAvailable(): Promise<boolean> {
    return new Promise((resolve) => {
      const proc = spawn(this.cliPath, ["--version"], {
        stdio: ["ignore", "pipe", "pipe"],
      });

      let output = "";
      proc.stdout.on("data", (data) => (output += data.toString()));

      proc.on("close", (code) => {
        if (code === 0) {
          log.info(`Claude Code available: ${output.trim()}`);
          resolve(true);
        } else {
          resolve(false);
        }
      });

      proc.on("error", () => resolve(false));
    });
  }

  async generate(request: LLMRequest): Promise<LLMResponse> {
    const prompt = this.buildPrompt(request);

    return new Promise((resolve, reject) => {
      // Use claude CLI in print mode (-p) for non-interactive use
      const args = ["--print", prompt];

      if (request.systemPrompt) {
        args.unshift("--system-prompt", request.systemPrompt);
      }

      log.debug(`Spawning: ${this.cliPath} ${args[0]}`);

      const proc = spawn(this.cliPath, args, {
        stdio: ["ignore", "pipe", "pipe"],
        env: this.cleanEnv,
      });

      let stdout = "";
      let stderr = "";

      proc.stdout.on("data", (data) => (stdout += data.toString()));
      proc.stderr.on("data", (data) => (stderr += data.toString()));

      proc.on("close", (code) => {
        if (code === 0) {
          resolve({
            content: stdout.trim(),
          });
        } else {
          log.error(`Claude Code exited with code ${code}: ${stderr}`);
          reject(new Error(`Claude Code failed (exit ${code}): ${stderr}`));
        }
      });

      proc.on("error", (err) => {
        log.error("Failed to spawn Claude Code:", err);
        reject(new Error(`Failed to spawn Claude Code: ${err.message}`));
      });
    });
  }

  async *generateStream(request: LLMRequest): AsyncGenerator<string> {
    const prompt = this.buildPrompt(request);
    const args = ["--print", prompt];

    if (request.systemPrompt) {
      args.unshift("--system-prompt", request.systemPrompt);
    }

    const proc = spawn(this.cliPath, args, {
      stdio: ["ignore", "pipe", "pipe"],
      env: this.cleanEnv,
    });

    for await (const chunk of proc.stdout) {
      yield chunk.toString();
    }
  }

  private buildPrompt(request: LLMRequest): string {
    // Build conversation context as a single prompt for CLI mode
    const conversationParts: string[] = [];

    for (const msg of request.messages) {
      if (msg.role === "user") {
        conversationParts.push(`User: ${msg.content}`);
      } else if (msg.role === "assistant") {
        conversationParts.push(`Assistant: ${msg.content}`);
      }
    }

    // The last message is the current user input
    // For single-turn, just return the content
    if (request.messages.length === 1) {
      return request.messages[0].content;
    }

    // For multi-turn, include conversation history
    return conversationParts.join("\n\n") + "\n\nAssistant:";
  }
}
