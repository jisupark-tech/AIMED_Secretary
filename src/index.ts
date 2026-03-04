import { config } from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Gateway } from "./core/gateway.js";
import { Agent } from "./core/agent.js";
import { SessionStore } from "./core/session.js";
import { ClaudeCodeProvider } from "./providers/claude-code.js";
import { OllamaProvider } from "./providers/ollama.js";
import { CLIChannel } from "./channels/cli.js";
import { SkillsDB } from "./skills/skills-db.js";
import { createSchedulerSkill } from "./skills/scheduler.js";
import { createTaskTrackerSkill } from "./skills/task-tracker.js";
import { createReportSkill } from "./skills/report.js";
import { log, setLogLevel } from "./utils/logger.js";
import type { LLMProvider, LogLevel } from "./core/types.js";

// Load .env
config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, "..");

async function createProvider(): Promise<LLMProvider> {
  const providerName = process.env.LLM_PROVIDER || "claude-code";

  if (providerName === "ollama") {
    const provider = new OllamaProvider(
      process.env.OLLAMA_HOST || "http://localhost:11434",
      process.env.OLLAMA_MODEL || "qwen2.5"
    );
    if (await provider.isAvailable()) {
      return provider;
    }
    log.warn("Ollama not available, falling back to Claude Code");
  }

  const provider = new ClaudeCodeProvider(
    process.env.CLAUDE_CLI_PATH || "claude"
  );

  if (await provider.isAvailable()) {
    return provider;
  }

  throw new Error(
    "No LLM provider available. Install Claude Code CLI or run Ollama."
  );
}

async function main() {
  setLogLevel((process.env.LOG_LEVEL as LogLevel) || "info");

  console.log();
  log.info("AIMED Secretary starting...");

  // Database
  const dbPath = process.env.DB_PATH || path.join(PROJECT_ROOT, "data", "aimed.db");
  const sessionStore = new SessionStore(dbPath);

  // LLM Provider
  const provider = await createProvider();
  log.info(`LLM Provider: ${provider.name}`);

  // Agent
  const agent = new Agent(provider, sessionStore);

  // Skills
  const skillsDb = new SkillsDB(sessionStore.db);
  agent.registerSkill(createSchedulerSkill(skillsDb));
  agent.registerSkill(createTaskTrackerSkill(skillsDb));
  agent.registerSkill(createReportSkill(skillsDb));

  // Gateway
  const gateway = new Gateway();

  // CLI Channel
  const cli = new CLIChannel();
  gateway.registerChannel(cli);

  // Wire gateway messages to agent
  gateway.on("message", async (msg) => {
    const response = await agent.processMessage(msg);
    await gateway.sendResponse(msg.channelId, msg.sessionId, response);
  });

  // Start
  await gateway.startAll();

  // Graceful shutdown
  const shutdown = async () => {
    log.info("Shutting down...");
    await gateway.stopAll();
    sessionStore.close();
    process.exit(0);
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

main().catch((err) => {
  log.error("Fatal error:", err);
  process.exit(1);
});
