import { Client, GatewayIntentBits, Events } from "discord.js";
import type { Channel, Message } from "../core/types.js";
import { log } from "../utils/logger.js";

export class DiscordChannel implements Channel {
  name = "discord";
  private client: Client;
  private messageHandler: ((msg: Message) => Promise<void>) | null = null;
  private pendingResponses = new Map<string, import("discord.js").Message>();

  constructor(private token: string) {
    this.client = new Client({
      intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.DirectMessages,
        GatewayIntentBits.MessageContent,
      ],
    });
  }

  onMessage(handler: (msg: Message) => Promise<void>) {
    this.messageHandler = handler;
  }

  async start() {
    this.client.on(Events.MessageCreate, async (discordMsg) => {
      // Ignore bot messages
      if (discordMsg.author.bot) return;

      // Respond to DMs or when mentioned
      const isMentioned = discordMsg.mentions.has(this.client.user!);
      const isDM = !discordMsg.guild;

      if (!isDM && !isMentioned) return;

      let content = discordMsg.content;
      // Remove bot mention from content
      if (isMentioned && this.client.user) {
        content = content.replace(new RegExp(`<@!?${this.client.user.id}>`, "g"), "").trim();
      }

      if (!content) return;

      const sessionId = isDM
        ? `discord-dm-${discordMsg.author.id}`
        : `discord-${discordMsg.channelId}`;

      const msg: Message = {
        id: discordMsg.id,
        sessionId,
        role: "user",
        content,
        channelId: this.name,
        timestamp: discordMsg.createdTimestamp,
        metadata: {
          userId: discordMsg.author.id,
          username: discordMsg.author.username,
          guildId: discordMsg.guild?.id,
        },
      };

      // Store reference for response
      this.pendingResponses.set(sessionId, discordMsg);

      // Show typing indicator
      try {
        await discordMsg.channel.sendTyping();
      } catch {}

      if (this.messageHandler) {
        await this.messageHandler(msg);
      }
    });

    this.client.on(Events.ClientReady, (c) => {
      log.info(`Discord bot logged in as ${c.user.tag}`);
    });

    await this.client.login(this.token);
  }

  async stop() {
    await this.client.destroy();
  }

  async sendResponse(sessionId: string, content: string) {
    const originalMsg = this.pendingResponses.get(sessionId);
    if (!originalMsg) {
      log.warn(`No pending Discord message for session: ${sessionId}`);
      return;
    }

    // Discord has a 2000 char limit — split if needed
    const chunks = splitMessage(content, 2000);
    for (const chunk of chunks) {
      await originalMsg.reply(chunk);
    }

    this.pendingResponses.delete(sessionId);
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
    // Try to split at newline
    let splitAt = remaining.lastIndexOf("\n", maxLen);
    if (splitAt === -1 || splitAt < maxLen / 2) splitAt = maxLen;
    chunks.push(remaining.slice(0, splitAt));
    remaining = remaining.slice(splitAt).trimStart();
  }
  return chunks;
}
