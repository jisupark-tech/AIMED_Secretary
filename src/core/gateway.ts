import { EventEmitter } from "eventemitter3";
import type { Message, Channel } from "./types.js";
import { log } from "../utils/logger.js";

interface GatewayEvents {
  message: (msg: Message) => void;
  response: (sessionId: string, content: string) => void;
}

export class Gateway extends EventEmitter<GatewayEvents> {
  private channels = new Map<string, Channel>();

  registerChannel(channel: Channel) {
    this.channels.set(channel.name, channel);

    channel.onMessage(async (msg) => {
      log.info(`[${channel.name}] Message from ${msg.sessionId}: ${msg.content.slice(0, 80)}`);
      this.emit("message", msg);
    });

    log.info(`Channel registered: ${channel.name}`);
  }

  async sendResponse(channelId: string, sessionId: string, content: string) {
    const channel = this.channels.get(channelId);
    if (!channel) {
      log.error(`Channel not found: ${channelId}`);
      return;
    }
    await channel.sendResponse(sessionId, content);
    this.emit("response", sessionId, content);
  }

  async startAll() {
    for (const [name, channel] of this.channels) {
      try {
        await channel.start();
        log.info(`Channel started: ${name}`);
      } catch (err) {
        log.error(`Failed to start channel ${name}:`, err);
      }
    }
  }

  async stopAll() {
    for (const [name, channel] of this.channels) {
      try {
        await channel.stop();
        log.info(`Channel stopped: ${name}`);
      } catch (err) {
        log.error(`Failed to stop channel ${name}:`, err);
      }
    }
  }

  getChannel(name: string): Channel | undefined {
    return this.channels.get(name);
  }

  listChannels(): string[] {
    return Array.from(this.channels.keys());
  }
}
