# AIMED Secretary

A local-first AI secretary powered by Claude Code. Inspired by [OpenClaw](https://github.com/openclaw/openclaw) architecture.

## Architecture

```
Channels (CLI / Discord / Telegram / Slack)
                    |
                    v
         +-------------------+
         |     Gateway       |
         |  (Message Router) |
         +--------+----------+
                  |
                  v
         +-------------------+
         |      Agent        |
         |  (LLM + Skills)   |
         +--------+----------+
                  |
         +--------+----------+
         |   LLM Provider    |
         | Claude Code (local)|
         | Ollama (fallback)  |
         +-------------------+
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

# Run
npm run dev
```

## LLM Providers

| Provider | Config | Cost |
|----------|--------|------|
| **Claude Code** (default) | `LLM_PROVIDER=claude-code` | Included with Max subscription |
| **Ollama** | `LLM_PROVIDER=ollama` | Free (local) |

## Project Structure

```
src/
├── core/
│   ├── types.ts        # Interfaces (Message, Session, LLMProvider, Channel, Skill)
│   ├── gateway.ts      # Message routing between channels and agent
│   ├── agent.ts        # LLM orchestration and skill dispatch
│   └── session.ts      # SQLite conversation memory
├── channels/
│   └── cli.ts          # Terminal chat interface
├── providers/
│   ├── claude-code.ts  # Claude Code CLI provider
│   └── ollama.ts       # Ollama local model provider
├── skills/             # Extensible skill plugins (Phase 2)
├── utils/
│   └── logger.ts       # Colored logging
└── index.ts            # Entry point
```

## Commands

| Command | Description |
|---------|-------------|
| `npm run dev` | Start in development mode |
| `npm run build` | Build for production |
| `npm start` | Run production build |

## CLI Commands

| Command | Description |
|---------|-------------|
| `/clear` | Clear conversation |
| `/quit` | Exit |

## Roadmap

- [x] Phase 1: Core (Gateway, Agent, Session, CLI, Claude Code Provider)
- [ ] Phase 2: Skills (Scheduler, Task Tracker, Report Generator)
- [ ] Phase 3: Multi-Platform (Discord, Telegram, Slack)
- [ ] Phase 4: Automation (Cron, Webhooks, Email)
- [ ] Phase 5: Advanced (Voice, RAG, Dashboard)

## License

MIT
