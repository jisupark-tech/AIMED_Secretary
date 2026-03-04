import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import type { Agent } from "./agent.js";
import type { Message } from "./types.js";
import type { Gateway } from "./gateway.js";
import { log } from "../utils/logger.js";

export class WebhookServer {
  private server: ReturnType<typeof createServer> | null = null;

  constructor(
    private agent: Agent,
    private gateway: Gateway,
    private port: number = 18790
  ) {}

  async start() {
    this.server = createServer(async (req, res) => {
      if (req.method === "POST" && req.url === "/webhook") {
        await this.handleWebhook(req, res);
      } else if (req.method === "POST" && req.url === "/api/chat") {
        await this.handleChat(req, res);
      } else if (req.method === "GET" && req.url === "/health") {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ status: "ok", timestamp: Date.now() }));
      } else {
        res.writeHead(404);
        res.end("Not Found");
      }
    });

    return new Promise<void>((resolve) => {
      this.server!.listen(this.port, () => {
        log.info(`Webhook server listening on port ${this.port}`);
        resolve();
      });
    });
  }

  async stop() {
    return new Promise<void>((resolve) => {
      if (this.server) {
        this.server.close(() => resolve());
      } else {
        resolve();
      }
    });
  }

  private async handleWebhook(req: IncomingMessage, res: ServerResponse) {
    try {
      const body = await readBody(req);
      const data = JSON.parse(body);

      log.info(`Webhook received: ${data.event || "unknown"}`);

      // Create a message from the webhook
      const sessionId = data.sessionId || "webhook-default";
      const content = data.message || `Webhook event: ${data.event}\n${JSON.stringify(data.payload || {}, null, 2)}`;

      const msg: Message = {
        id: crypto.randomUUID(),
        sessionId,
        role: "user",
        content,
        channelId: "webhook",
        timestamp: Date.now(),
        metadata: { source: "webhook", event: data.event },
      };

      const response = await this.agent.processMessage(msg);

      // If a target channel is specified, forward the response
      if (data.targetChannel && data.targetSessionId) {
        await this.gateway.sendResponse(
          data.targetChannel,
          data.targetSessionId,
          response
        );
      }

      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ ok: true, response }));
    } catch (err) {
      log.error("Webhook error:", err);
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ ok: false, error: "Internal error" }));
    }
  }

  private async handleChat(req: IncomingMessage, res: ServerResponse) {
    try {
      const body = await readBody(req);
      const data = JSON.parse(body);

      if (!data.message) {
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ ok: false, error: "message is required" }));
        return;
      }

      const msg: Message = {
        id: crypto.randomUUID(),
        sessionId: data.sessionId || "api-default",
        role: "user",
        content: data.message,
        channelId: "api",
        timestamp: Date.now(),
      };

      const response = await this.agent.processMessage(msg);

      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ ok: true, response }));
    } catch (err) {
      log.error("Chat API error:", err);
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ ok: false, error: "Internal error" }));
    }
  }
}

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (chunk) => (body += chunk));
    req.on("end", () => resolve(body));
    req.on("error", reject);
  });
}
