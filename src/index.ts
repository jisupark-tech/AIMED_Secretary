import { config } from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Gateway } from "./core/gateway.js";
import { Agent } from "./core/agent.js";
import { SessionStore } from "./core/session.js";
import { CronScheduler } from "./core/cron.js";
import { WebhookServer } from "./core/webhook.js";
import { Dashboard } from "./core/dashboard.js";
import { VoiceEngine } from "./core/voice.js";
import { RAGEngine } from "./core/rag.js";
import { ClaudeCodeProvider } from "./providers/claude-code.js";
import { OllamaProvider } from "./providers/ollama.js";
import { CLIChannel } from "./channels/cli.js";
import { DiscordChannel } from "./channels/discord.js";
import { TelegramChannel } from "./channels/telegram.js";
import { SlackChannel } from "./channels/slack.js";
import { SkillsDB } from "./skills/skills-db.js";
import { createSchedulerSkill } from "./skills/scheduler.js";
import { createTaskTrackerSkill } from "./skills/task-tracker.js";
import { createReportSkill } from "./skills/report.js";
import { createHelpSkill } from "./skills/help.js";
import { createKnowledgeSkill } from "./skills/knowledge.js";
import { createVoiceSkill } from "./skills/voice.js";
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

  // Core engines
  const skillsDb = new SkillsDB(sessionStore.db);
  const voiceEngine = new VoiceEngine(provider);
  const ragEngine = new RAGEngine(
    sessionStore.db,
    provider,
    process.env.KNOWLEDGE_PATH || path.join(PROJECT_ROOT, "knowledge")
  );

  // Ingest knowledge base on startup
  await ragEngine.ingestAll();

  // Register skills
  agent.registerSkill(createHelpSkill());
  agent.registerSkill(createSchedulerSkill(skillsDb));
  agent.registerSkill(createTaskTrackerSkill(skillsDb));
  agent.registerSkill(createReportSkill(skillsDb));
  agent.registerSkill(createKnowledgeSkill(ragEngine));
  agent.registerSkill(createVoiceSkill(voiceEngine));

  // Gateway
  const gateway = new Gateway();

  // --- Channels ---

  // CLI (always enabled)
  const cli = new CLIChannel();
  gateway.registerChannel(cli);

  // Discord
  if (process.env.DISCORD_TOKEN) {
    const discord = new DiscordChannel(process.env.DISCORD_TOKEN);
    gateway.registerChannel(discord);
  }

  // Telegram
  if (process.env.TELEGRAM_TOKEN) {
    const telegram = new TelegramChannel(process.env.TELEGRAM_TOKEN);
    gateway.registerChannel(telegram);
  }

  // Slack
  if (process.env.SLACK_BOT_TOKEN && process.env.SLACK_SIGNING_SECRET) {
    const slack = new SlackChannel(
      process.env.SLACK_BOT_TOKEN,
      process.env.SLACK_SIGNING_SECRET,
      process.env.SLACK_APP_TOKEN || "",
      parseInt(process.env.SLACK_PORT || "3100")
    );
    gateway.registerChannel(slack);
  }

  // Wire gateway messages to agent
  gateway.on("message", async (msg) => {
    const response = await agent.processMessage(msg);
    await gateway.sendResponse(msg.channelId, msg.sessionId, response);
  });

  // --- Automation ---

  // Cron scheduler
  const cronScheduler = new CronScheduler(gateway, skillsDb);
  cronScheduler.start();

  // Webhook server
  const webhookPort = parseInt(process.env.WEBHOOK_PORT || "18790");
  const webhookServer = new WebhookServer(agent, gateway, webhookPort);
  await webhookServer.start();

  // Dashboard
  const dashboardPort = parseInt(process.env.DASHBOARD_PORT || "18791");
  const dashboard = new Dashboard(agent, gateway, skillsDb, ragEngine, dashboardPort);
  await dashboard.start();

  // Start all channels
  await gateway.startAll();

  log.info("AIMED Secretary is ready!");
  log.info(`Channels: ${gateway.listChannels().join(", ")}`);
  log.info(`Dashboard: http://localhost:${dashboardPort}`);
  log.info(`Webhook API: http://localhost:${webhookPort}`);

  // Graceful shutdown
  const shutdown = async () => {
    log.info("Shutting down...");
    cronScheduler.stop();
    await dashboard.stop();
    await webhookServer.stop();
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
