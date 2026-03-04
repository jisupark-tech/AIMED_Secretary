# AIMED Secretary

**AI-Managed Enterprise Dashboard** — A local-first AI secretary powered by Claude Code.
Inspired by [OpenClaw](https://github.com/openclaw/openclaw) architecture.

## Architecture

```
Discord / Telegram / Slack / CLI / Dashboard
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
    +--------------+---------------+
    |        |         |           |
  Claude   Ollama    Cron      Webhook
  Code    (fallback) Jobs      Server
    |        |         |           |
    +--------+---------+-----------+
                   |
    +--------------+---------------+
    |              |               |
  Session     Knowledge        Voice
  Store       Base (RAG)       Engine
  (SQLite)                    (Whisper)
```

## Quick Start

```bash
# Install dependencies
npm install

# Configure
cp .env.example .env

# Run
npm run dev
```

Open **http://localhost:18791** for the web dashboard.

## LLM Providers

| Provider | Config | Cost |
|----------|--------|------|
| **Claude Code** (default) | `LLM_PROVIDER=claude-code` | Included with Max subscription |
| **Ollama** | `LLM_PROVIDER=ollama` | Free (local) |

## Channels

| Channel | Setup | Trigger |
|---------|-------|---------|
| **CLI** | Always on | Type in terminal |
| **Dashboard** | Always on | http://localhost:18791 |
| **Discord** | Set `DISCORD_TOKEN` | DM or @mention |
| **Telegram** | Set `TELEGRAM_TOKEN` | Message the bot |
| **Slack** | Set `SLACK_*` tokens | DM or @mention |

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

### Knowledge Base (RAG)
```
/kb ingest                            — Ingest files from ./knowledge/
/kb list                              — List all documents
/kb stats                             — Show KB statistics
/search <query>                       — Search the knowledge base
```

Place documents (.txt, .md, .json, .csv, .py, .ts, .js, .yaml) in the `./knowledge/` directory.

### Voice
```
/voice                                — Record 10s and transcribe
/voice <seconds>                      — Record custom duration
```

Requires: `brew install sox` (recording) + `brew install whisper-cpp` (transcription)

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
# Chat via API
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

### Web Dashboard

Real-time dashboard at **http://localhost:18791** with:
- Chat interface (WebSocket-powered)
- Task and reminder panels
- System status (channels, knowledge base stats)
- Activity feed

## Project Structure

```
src/
├── core/
│   ├── types.ts        # Interfaces
│   ├── gateway.ts      # Message routing
│   ├── agent.ts        # LLM orchestration + skill dispatch
│   ├── session.ts      # SQLite conversation memory
│   ├── cron.ts         # Scheduled jobs
│   ├── webhook.ts      # HTTP webhook/API server
│   ├── dashboard.ts    # Web dashboard (WebSocket + HTML)
│   ├── rag.ts          # RAG knowledge base engine
│   └── voice.ts        # Voice recording + Whisper STT
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
│   ├── report.ts       # Report generation
│   ├── knowledge.ts    # Knowledge base skill
│   └── voice.ts        # Voice input skill
├── utils/
│   └── logger.ts       # Colored logging
└── index.ts            # Entry point
knowledge/              # Place documents here for RAG
```

## Roadmap

- [x] Phase 1: Core (Gateway, Agent, Session, CLI, Claude Code Provider)
- [x] Phase 2: Skills (Scheduler, Task Tracker, Report Generator)
- [x] Phase 3: Multi-Platform (Discord, Telegram, Slack)
- [x] Phase 4: Automation (Cron, Webhooks, API)
- [x] Phase 5: Advanced (Voice, RAG, Web Dashboard)

## License

MIT
