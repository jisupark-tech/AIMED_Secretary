import Database from "better-sqlite3";
import type { Message, Session } from "./types.js";
import { log } from "../utils/logger.js";

export class SessionStore {
  readonly db: Database.Database;

  constructor(dbPath: string) {
    this.db = new Database(dbPath);
    this.db.pragma("journal_mode = WAL");
    this.initSchema();
    log.info(`Database opened: ${dbPath}`);
  }

  private initSchema() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS sessions (
        id TEXT PRIMARY KEY,
        channel_id TEXT NOT NULL,
        user_id TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        last_active_at INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS messages (
        id TEXT PRIMARY KEY,
        session_id TEXT NOT NULL,
        role TEXT NOT NULL,
        content TEXT NOT NULL,
        channel_id TEXT NOT NULL,
        timestamp INTEGER NOT NULL,
        metadata TEXT,
        FOREIGN KEY (session_id) REFERENCES sessions(id)
      );

      CREATE INDEX IF NOT EXISTS idx_messages_session
        ON messages(session_id, timestamp);
    `);
  }

  ensureSession(sessionId: string, channelId: string, userId: string): Session {
    const existing = this.getSession(sessionId);
    if (existing) {
      const now = Date.now();
      this.db
        .prepare("UPDATE sessions SET last_active_at = ? WHERE id = ?")
        .run(now, sessionId);
      return { ...existing, lastActiveAt: now };
    }

    const now = Date.now();
    const session: Session = {
      id: sessionId,
      channelId,
      userId,
      createdAt: now,
      lastActiveAt: now,
    };

    this.db
      .prepare(
        "INSERT INTO sessions (id, channel_id, user_id, created_at, last_active_at) VALUES (?, ?, ?, ?, ?)"
      )
      .run(session.id, session.channelId, session.userId, session.createdAt, session.lastActiveAt);

    log.debug(`Session created: ${sessionId}`);
    return session;
  }

  getSession(sessionId: string): Session | null {
    const row = this.db
      .prepare("SELECT * FROM sessions WHERE id = ?")
      .get(sessionId) as Record<string, unknown> | undefined;

    if (!row) return null;

    return {
      id: row.id as string,
      channelId: row.channel_id as string,
      userId: row.user_id as string,
      createdAt: row.created_at as number,
      lastActiveAt: row.last_active_at as number,
    };
  }

  saveMessage(msg: Message) {
    this.db
      .prepare(
        "INSERT INTO messages (id, session_id, role, content, channel_id, timestamp, metadata) VALUES (?, ?, ?, ?, ?, ?, ?)"
      )
      .run(
        msg.id,
        msg.sessionId,
        msg.role,
        msg.content,
        msg.channelId,
        msg.timestamp,
        msg.metadata ? JSON.stringify(msg.metadata) : null
      );
  }

  getHistory(sessionId: string, limit = 50): Message[] {
    const rows = this.db
      .prepare(
        "SELECT * FROM messages WHERE session_id = ? ORDER BY timestamp ASC LIMIT ?"
      )
      .all(sessionId, limit) as Record<string, unknown>[];

    return rows.map((row) => ({
      id: row.id as string,
      sessionId: row.session_id as string,
      role: row.role as Message["role"],
      content: row.content as string,
      channelId: row.channel_id as string,
      timestamp: row.timestamp as number,
      metadata: row.metadata ? JSON.parse(row.metadata as string) : undefined,
    }));
  }

  clearSession(sessionId: string) {
    this.db.prepare("DELETE FROM messages WHERE session_id = ?").run(sessionId);
    this.db.prepare("DELETE FROM sessions WHERE id = ?").run(sessionId);
    log.info(`Session cleared: ${sessionId}`);
  }

  close() {
    this.db.close();
  }
}
