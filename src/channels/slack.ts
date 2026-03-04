import { App } from "@slack/bolt";
import type { Channel, Message } from "../core/types.js";
import { log } from "../utils/logger.js";

export class SlackChannel implements Channel {
  name = "slack";
  private app: App;
  private messageHandler: ((msg: Message) => Promise<void>) | null = null;
  private responseContexts = new Map<
    string,
    { channelId: string; threadTs?: string }
  >();

  constructor(
    private token: string,
    private signingSecret: string,
    private appToken: string,
    private port = 3100
  ) {
    this.app = new App({
      token: this.token,
      signingSecret: this.signingSecret,
      appToken: this.appToken,
      socketMode: !!this.appToken,
      port: this.port,
    });
  }

  onMessage(handler: (msg: Message) => Promise<void>) {
    this.messageHandler = handler;
  }

  async start() {
    // Listen to direct messages
    this.app.message(async ({ message, say }) => {
      if (message.subtype) return; // Ignore edits, joins, etc.
      const m = message as { text?: string; user?: string; ts?: string; channel?: string; thread_ts?: string };
      if (!m.text || !m.user) return;

      const sessionId = `slack-${m.channel}-${m.user}`;

      const msg: Message = {
        id: m.ts || crypto.randomUUID(),
        sessionId,
        role: "user",
        content: m.text,
        channelId: this.name,
        timestamp: parseFloat(m.ts || "0") * 1000,
        metadata: {
          slackChannel: m.channel,
          userId: m.user,
          threadTs: m.thread_ts,
        },
      };

      this.responseContexts.set(sessionId, {
        channelId: m.channel!,
        threadTs: m.thread_ts || m.ts,
      });

      if (this.messageHandler) {
        await this.messageHandler(msg);
      }
    });

    // Listen to app mentions in channels
    this.app.event("app_mention", async ({ event }) => {
      const sessionId = `slack-${event.channel}-${event.user}`;
      const text = event.text.replace(/<@[A-Z0-9]+>/g, "").trim();

      if (!text) return;

      const msg: Message = {
        id: event.ts,
        sessionId,
        role: "user",
        content: text,
        channelId: this.name,
        timestamp: parseFloat(event.ts) * 1000,
        metadata: {
          slackChannel: event.channel,
          userId: event.user,
          threadTs: event.thread_ts,
        },
      };

      this.responseContexts.set(sessionId, {
        channelId: event.channel,
        threadTs: event.thread_ts || event.ts,
      });

      if (this.messageHandler) {
        await this.messageHandler(msg);
      }
    });

    await this.app.start();
    log.info(`Slack bot started on port ${this.port}`);
  }

  async stop() {
    await this.app.stop();
  }

  async sendResponse(sessionId: string, content: string) {
    const ctx = this.responseContexts.get(sessionId);
    if (!ctx) {
      log.warn(`No response context for session: ${sessionId}`);
      return;
    }

    await this.app.client.chat.postMessage({
      token: this.token,
      channel: ctx.channelId,
      text: content,
      thread_ts: ctx.threadTs,
    });
  }
}
