import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { WebSocketServer, type WebSocket } from "ws";
import type { Agent } from "./agent.js";
import type { Gateway } from "./gateway.js";
import type { SkillsDB } from "../skills/skills-db.js";
import type { RAGEngine } from "./rag.js";
import type { Message } from "./types.js";
import { log } from "../utils/logger.js";

export class Dashboard {
  private httpServer: ReturnType<typeof createServer> | null = null;
  private wss: WebSocketServer | null = null;
  private clients = new Set<WebSocket>();

  constructor(
    private agent: Agent,
    private gateway: Gateway,
    private skillsDb: SkillsDB,
    private rag: RAGEngine | null,
    private port: number = 18791
  ) {}

  async start() {
    this.httpServer = createServer((req, res) => {
      this.handleHTTP(req, res);
    });

    this.wss = new WebSocketServer({ server: this.httpServer });

    this.wss.on("connection", (ws) => {
      this.clients.add(ws);
      log.info("Dashboard: Client connected");

      ws.on("message", async (data) => {
        try {
          const parsed = JSON.parse(data.toString());
          await this.handleWsMessage(ws, parsed);
        } catch (err) {
          ws.send(JSON.stringify({ type: "error", message: "Invalid message" }));
        }
      });

      ws.on("close", () => {
        this.clients.delete(ws);
      });

      // Send initial state
      ws.send(JSON.stringify({
        type: "init",
        data: this.getState(),
      }));
    });

    return new Promise<void>((resolve) => {
      this.httpServer!.listen(this.port, () => {
        log.info(`Dashboard available at http://localhost:${this.port}`);
        resolve();
      });
    });
  }

  async stop() {
    for (const client of this.clients) {
      client.close();
    }
    return new Promise<void>((resolve) => {
      if (this.httpServer) {
        this.httpServer.close(() => resolve());
      } else {
        resolve();
      }
    });
  }

  broadcast(type: string, data: unknown) {
    const msg = JSON.stringify({ type, data });
    for (const client of this.clients) {
      if (client.readyState === 1) { // WebSocket.OPEN
        client.send(msg);
      }
    }
  }

  private getState() {
    const tasks = this.skillsDb.listTasks("cli-default");
    const reminders = this.skillsDb.listReminders("cli-default");
    const activity = this.skillsDb.getRecentActivity("cli-default", 20);
    const ragStats = this.rag?.getStats() || { documents: 0, chunks: 0 };
    const channels = this.gateway.listChannels();

    return {
      tasks,
      reminders,
      activity,
      ragStats,
      channels,
    };
  }

  private async handleWsMessage(ws: WebSocket, msg: { type: string; content?: string; sessionId?: string }) {
    if (msg.type === "chat") {
      const content = msg.content || "";
      const sessionId = msg.sessionId || "dashboard-default";

      const message: Message = {
        id: crypto.randomUUID(),
        sessionId,
        role: "user",
        content,
        channelId: "dashboard",
        timestamp: Date.now(),
      };

      // Broadcast user message
      this.broadcast("chat_message", { role: "user", content, sessionId });

      const response = await this.agent.processMessage(message);

      // Broadcast assistant response
      this.broadcast("chat_message", { role: "assistant", content: response, sessionId });

      // Send updated state
      ws.send(JSON.stringify({ type: "state", data: this.getState() }));
    }

    if (msg.type === "refresh") {
      ws.send(JSON.stringify({ type: "state", data: this.getState() }));
    }
  }

  private handleHTTP(req: IncomingMessage, res: ServerResponse) {
    const url = req.url || "/";

    // API endpoints
    if (url === "/api/state" && req.method === "GET") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify(this.getState()));
      return;
    }

    // Serve static files
    if (url === "/" || url === "/index.html") {
      res.writeHead(200, { "Content-Type": "text/html" });
      res.end(this.getIndexHTML());
      return;
    }

    res.writeHead(404);
    res.end("Not Found");
  }

  private getIndexHTML(): string {
    return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>AIMED Secretary</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  :root {
    --bg: #0f1117; --surface: #1a1d27; --border: #2a2d3a;
    --text: #e1e4ed; --text-dim: #8b8fa3; --accent: #6c5ce7;
    --green: #00b894; --red: #e17055; --yellow: #fdcb6e;
  }
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: var(--bg); color: var(--text); height: 100vh; display: flex; flex-direction: column; }
  header { background: var(--surface); border-bottom: 1px solid var(--border); padding: 12px 24px; display: flex; align-items: center; gap: 12px; }
  header h1 { font-size: 18px; font-weight: 600; }
  header .status { font-size: 12px; color: var(--green); display: flex; align-items: center; gap: 4px; }
  header .status::before { content: ''; width: 6px; height: 6px; background: var(--green); border-radius: 50%; }
  main { flex: 1; display: grid; grid-template-columns: 1fr 320px; overflow: hidden; }

  /* Chat Panel */
  .chat { display: flex; flex-direction: column; border-right: 1px solid var(--border); }
  .messages { flex: 1; overflow-y: auto; padding: 16px; display: flex; flex-direction: column; gap: 12px; }
  .msg { max-width: 80%; padding: 10px 14px; border-radius: 12px; font-size: 14px; line-height: 1.5; white-space: pre-wrap; word-break: break-word; }
  .msg.user { background: var(--accent); align-self: flex-end; border-bottom-right-radius: 4px; }
  .msg.assistant { background: var(--surface); border: 1px solid var(--border); align-self: flex-start; border-bottom-left-radius: 4px; }
  .input-bar { padding: 12px 16px; border-top: 1px solid var(--border); display: flex; gap: 8px; }
  .input-bar input { flex: 1; background: var(--surface); border: 1px solid var(--border); color: var(--text); padding: 10px 14px; border-radius: 8px; font-size: 14px; outline: none; }
  .input-bar input:focus { border-color: var(--accent); }
  .input-bar button { background: var(--accent); color: white; border: none; padding: 10px 20px; border-radius: 8px; cursor: pointer; font-size: 14px; }
  .input-bar button:hover { opacity: 0.9; }

  /* Sidebar */
  .sidebar { background: var(--surface); overflow-y: auto; padding: 16px; display: flex; flex-direction: column; gap: 16px; }
  .panel { background: var(--bg); border: 1px solid var(--border); border-radius: 8px; padding: 12px; }
  .panel h3 { font-size: 13px; color: var(--text-dim); text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 8px; }
  .panel-item { font-size: 13px; padding: 6px 0; border-bottom: 1px solid var(--border); display: flex; justify-content: space-between; }
  .panel-item:last-child { border: none; }
  .badge { font-size: 11px; padding: 2px 6px; border-radius: 4px; }
  .badge.high { background: rgba(225,112,85,0.2); color: var(--red); }
  .badge.medium { background: rgba(253,203,110,0.2); color: var(--yellow); }
  .badge.low { background: rgba(0,184,148,0.2); color: var(--green); }
  .badge.done { background: rgba(0,184,148,0.2); color: var(--green); }
  .stat { display: flex; justify-content: space-between; padding: 4px 0; font-size: 13px; }
  .stat-value { color: var(--accent); font-weight: 600; }

  @media (max-width: 768px) {
    main { grid-template-columns: 1fr; }
    .sidebar { display: none; }
  }
</style>
</head>
<body>
  <header>
    <h1>AIMED Secretary</h1>
    <div class="status" id="status">Connected</div>
  </header>
  <main>
    <div class="chat">
      <div class="messages" id="messages"></div>
      <div class="input-bar">
        <input type="text" id="input" placeholder="Type a message or /command..." autofocus>
        <button id="send">Send</button>
      </div>
    </div>
    <div class="sidebar" id="sidebar">
      <div class="panel" id="tasks-panel">
        <h3>Tasks</h3>
        <div id="tasks-list"><span style="color:var(--text-dim);font-size:13px">No tasks</span></div>
      </div>
      <div class="panel" id="reminders-panel">
        <h3>Reminders</h3>
        <div id="reminders-list"><span style="color:var(--text-dim);font-size:13px">No reminders</span></div>
      </div>
      <div class="panel">
        <h3>System</h3>
        <div id="system-stats"></div>
      </div>
      <div class="panel">
        <h3>Recent Activity</h3>
        <div id="activity-list"></div>
      </div>
    </div>
  </main>
<script>
const ws = new WebSocket(\`ws://\${location.host}\`);
const messagesEl = document.getElementById('messages');
const inputEl = document.getElementById('input');
const statusEl = document.getElementById('status');

ws.onopen = () => { statusEl.textContent = 'Connected'; statusEl.style.color = 'var(--green)'; };
ws.onclose = () => { statusEl.textContent = 'Disconnected'; statusEl.style.color = 'var(--red)'; };

ws.onmessage = (e) => {
  const msg = JSON.parse(e.data);
  if (msg.type === 'init' || msg.type === 'state') updateState(msg.data);
  if (msg.type === 'chat_message') addMessage(msg.data.role, msg.data.content);
};

function send() {
  const text = inputEl.value.trim();
  if (!text) return;
  inputEl.value = '';
  ws.send(JSON.stringify({ type: 'chat', content: text }));
}

document.getElementById('send').onclick = send;
inputEl.onkeydown = (e) => { if (e.key === 'Enter') send(); };

function addMessage(role, content) {
  const div = document.createElement('div');
  div.className = 'msg ' + role;
  div.textContent = content;
  messagesEl.appendChild(div);
  messagesEl.scrollTop = messagesEl.scrollHeight;
}

function updateState(state) {
  // Tasks
  const tasksEl = document.getElementById('tasks-list');
  if (state.tasks?.length > 0) {
    tasksEl.innerHTML = state.tasks
      .filter(t => t.status !== 'deleted')
      .map(t => \`<div class="panel-item"><span>\${t.title}</span><span class="badge \${t.priority}">\${t.status === 'done' ? 'done' : t.priority}</span></div>\`)
      .join('');
  } else {
    tasksEl.innerHTML = '<span style="color:var(--text-dim);font-size:13px">No tasks</span>';
  }

  // Reminders
  const remindersEl = document.getElementById('reminders-list');
  if (state.reminders?.length > 0) {
    remindersEl.innerHTML = state.reminders
      .map(r => \`<div class="panel-item"><span>\${r.title}</span><span style="color:var(--text-dim);font-size:12px">\${r.remind_at}</span></div>\`)
      .join('');
  } else {
    remindersEl.innerHTML = '<span style="color:var(--text-dim);font-size:13px">No reminders</span>';
  }

  // System stats
  document.getElementById('system-stats').innerHTML = \`
    <div class="stat"><span>Channels</span><span class="stat-value">\${state.channels?.join(', ') || 'cli'}</span></div>
    <div class="stat"><span>KB Documents</span><span class="stat-value">\${state.ragStats?.documents || 0}</span></div>
    <div class="stat"><span>KB Chunks</span><span class="stat-value">\${state.ragStats?.chunks || 0}</span></div>
  \`;

  // Activity
  const actEl = document.getElementById('activity-list');
  if (state.activity?.length > 0) {
    actEl.innerHTML = state.activity.slice(0, 8)
      .map(a => \`<div class="panel-item"><span>\${a.action}</span><span style="color:var(--text-dim);font-size:12px">\${new Date(a.created_at).toLocaleTimeString()}</span></div>\`)
      .join('');
  } else {
    actEl.innerHTML = '<span style="color:var(--text-dim);font-size:13px">No activity</span>';
  }
}
</script>
</body>
</html>`;
  }
}
