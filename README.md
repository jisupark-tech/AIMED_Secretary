# AIMED Secretary

A local-first AI secretary powered by Claude Code. Inspired by [OpenClaw](https://github.com/openclaw/openclaw) architecture.

## Architecture

```
Discord / Telegram / Slack / CLI
              |
              v
    +-------------------+
    |     Gateway       |
    |  (Message Router) |
    +--------+----------+
             |
    +--------+----------+
    |      Agent        |
    |  (LLM + Skills)   |
    +--------+----------+
             |
    +--------+----------+--------+
    |        |           |       |
  Claude   Ollama     Cron   Webhook
  Code    (fallback)  Jobs   Server
    |        |           |       |
    +--------+----------+--------+
             |
    +-------------------+
    |   Session Store   |
    |     (SQLite)      |
    +-------------------+
```

## Quick Start

```bash
# Install dependencies
npm install

# Configure
cp .env.example .env
# Edit .env with your tokens (Discord, Telegram, Slack — all optional)

# Run
npm run dev
```

## LLM Providers

| Provider | Config | Cost |
|----------|--------|------|
| **Claude Code** (default) | `LLM_PROVIDER=claude-code` | Included with Max subscription |
| **Ollama** | `LLM_PROVIDER=ollama` | Free (local) |

## Channels

| Channel | Setup | Trigger |
|---------|-------|---------|
| **CLI** | Always on | Type in terminal |
| **Discord** | Set `DISCORD_TOKEN` in `.env` | DM the bot or @mention |
| **Telegram** | Set `TELEGRAM_TOKEN` in `.env` | Message the bot |
| **Slack** | Set `SLACK_*` tokens in `.env` | DM or @mention |

## Skills (Commands)

### Task Management
```
/task add <title>                     — Add a task
/task add <title> priority:high       — Add with priority (high/medium/low)
/task add <title> due:2026-03-10      — Add with due date
/tasks                                — List pending tasks
/tasks all                            — List all tasks
/task done #<id>                      — Complete a task
/task delete #<id>                    — Delete a task
```

### Reminders
```
/remind <title> at <time>             — Set a reminder
/remind <title> at <time> repeat daily
/reminders                            — List active reminders
/remind check                         — Show due reminders
/remind dismiss #<id>                 — Dismiss a reminder
```

### Reports
```
/report                               — Daily briefing
/report weekly                        — Weekly summary
```

### Other
```
/help                                 — Show all commands
/clear                                — Clear conversation
/quit                                 — Exit
```

Any other message is processed by the AI.

## Automation

### Cron Jobs
- **Reminder checker**: Runs every minute, alerts on due reminders
- **Daily briefing**: Sends task/reminder summary at 09:00

### Webhook / API

```bash
# Send a message via API
curl -X POST http://localhost:18790/api/chat \
  -H "Content-Type: application/json" \
  -d '{"message": "What are my pending tasks?"}'

# Trigger a webhook
curl -X POST http://localhost:18790/webhook \
  -H "Content-Type: application/json" \
  -d '{"event": "deploy", "payload": {"status": "success"}}'

# Health check
curl http://localhost:18790/health
```

## Project Structure

```
src/
├── core/
│   ├── types.ts        # Interfaces
│   ├── gateway.ts      # Message routing
│   ├── agent.ts        # LLM orchestration + skill dispatch
│   ├── session.ts      # SQLite conversation memory
│   ├── cron.ts         # Scheduled jobs (reminders, briefings)
│   └── webhook.ts      # HTTP webhook/API server
├── channels/
│   ├── cli.ts          # Terminal interface
│   ├── discord.ts      # Discord bot
│   ├── telegram.ts     # Telegram bot
│   └── slack.ts        # Slack bot
├── providers/
│   ├── claude-code.ts  # Claude Code CLI provider
│   └── ollama.ts       # Ollama local model provider
├── skills/
│   ├── skills-db.ts    # Shared SQLite tables
│   ├── help.ts         # Help command
│   ├── scheduler.ts    # Reminder management
│   ├── task-tracker.ts # Task/todo management
│   └── report.ts       # Report generation
├── utils/
│   └── logger.ts       # Colored logging
└── index.ts            # Entry point
```

## Roadmap

- [x] Phase 1: Core (Gateway, Agent, Session, CLI, Claude Code Provider)
- [x] Phase 2: Skills (Scheduler, Task Tracker, Report Generator)
- [x] Phase 3: Multi-Platform (Discord, Telegram, Slack)
- [x] Phase 4: Automation (Cron, Webhooks, API)
- [ ] Phase 5: Advanced (Voice, RAG, Web Dashboard)

## License

MIT
