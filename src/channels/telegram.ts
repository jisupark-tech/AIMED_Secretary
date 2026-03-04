import { Bot } from "grammy";
import type { Channel, Message } from "../core/types.js";
import { log } from "../utils/logger.js";

export class TelegramChannel implements Channel {
  name = "telegram";
  private bot: Bot;
  private messageHandler: ((msg: Message) => Promise<void>) | null = null;
  private chatContexts = new Map<string, number>();

  constructor(private token: string) {
    this.bot = new Bot(token);
  }

  onMessage(handler: (msg: Message) => Promise<void>) {
    this.messageHandler = handler;
  }

  async start() {
    this.bot.on("message:text", async (ctx) => {
      const text = ctx.message.text;
      if (!text) return;

      const chatId = ctx.chat.id;
      const sessionId = `telegram-${chatId}`;

      const msg: Message = {
        id: String(ctx.message.message_id),
        sessionId,
        role: "user",
        content: text,
        channelId: this.name,
        timestamp: ctx.message.date * 1000,
        metadata: {
          chatId,
          userId: ctx.from?.id,
          username: ctx.from?.username,
          firstName: ctx.from?.first_name,
        },
      };

      // Store chat ID for response
      this.chatContexts.set(sessionId, chatId);

      // Show typing
      try {
        await ctx.replyWithChatAction("typing");
      } catch {}

      if (this.messageHandler) {
        await this.messageHandler(msg);
      }
    });

    // Start polling
    this.bot.start({
      onStart: (info) => {
        log.info(`Telegram bot started: @${info.username}`);
      },
    });
  }

  async stop() {
    await this.bot.stop();
  }

  async sendResponse(sessionId: string, content: string) {
    const chatId = this.chatContexts.get(sessionId);
    if (!chatId) {
      log.warn(`No chat context for session: ${sessionId}`);
      return;
    }

    // Telegram has a 4096 char limit
    const chunks = splitMessage(content, 4096);
    for (const chunk of chunks) {
      await this.bot.api.sendMessage(chatId, chunk);
    }
  }
}

function splitMessage(text: string, maxLen: number): string[] {
  if (text.length <= maxLen) return [text];
  const chunks: string[] = [];
  let remaining = text;
  while (remaining.length > 0) {
    if (remaining.length <= maxLen) {
      chunks.push(remaining);
      break;
    }
    let splitAt = remaining.lastIndexOf("\n", maxLen);
    if (splitAt === -1 || splitAt < maxLen / 2) splitAt = maxLen;
    chunks.push(remaining.slice(0, splitAt));
    remaining = remaining.slice(splitAt).trimStart();
  }
  return chunks;
}
