import Database from "better-sqlite3";
import { log } from "../utils/logger.js";

export class SkillsDB {
  private db: Database.Database;

  constructor(db: Database.Database) {
    this.db = db;
    this.initSchema();
  }

  private initSchema() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS tasks (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        session_id TEXT NOT NULL,
        title TEXT NOT NULL,
        description TEXT,
        priority TEXT DEFAULT 'medium',
        status TEXT DEFAULT 'pending',
        due_date TEXT,
        created_at INTEGER NOT NULL,
        completed_at INTEGER
      );

      CREATE TABLE IF NOT EXISTS reminders (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        session_id TEXT NOT NULL,
        title TEXT NOT NULL,
        remind_at TEXT NOT NULL,
        repeat TEXT,
        status TEXT DEFAULT 'active',
        created_at INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS activity_log (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        session_id TEXT NOT NULL,
        action TEXT NOT NULL,
        detail TEXT,
        created_at INTEGER NOT NULL
      );
    `);
    log.debug("Skills schema initialized");
  }

  // --- Tasks ---
  addTask(sessionId: string, title: string, priority = "medium", dueDate?: string, description?: string): number {
    const result = this.db.prepare(
      "INSERT INTO tasks (session_id, title, description, priority, due_date, created_at) VALUES (?, ?, ?, ?, ?, ?)"
    ).run(sessionId, title, description ?? null, priority, dueDate ?? null, Date.now());
    this.logActivity(sessionId, "task_added", title);
    return result.lastInsertRowid as number;
  }

  listTasks(sessionId: string, status?: string): TaskRow[] {
    if (status) {
      return this.db.prepare(
        "SELECT * FROM tasks WHERE session_id = ? AND status = ? ORDER BY created_at DESC"
      ).all(sessionId, status) as TaskRow[];
    }
    return this.db.prepare(
      "SELECT * FROM tasks WHERE session_id = ? AND status != 'deleted' ORDER BY created_at DESC"
    ).all(sessionId) as TaskRow[];
  }

  completeTask(sessionId: string, taskId: number): boolean {
    const result = this.db.prepare(
      "UPDATE tasks SET status = 'done', completed_at = ? WHERE id = ? AND session_id = ?"
    ).run(Date.now(), taskId, sessionId);
    if (result.changes > 0) {
      this.logActivity(sessionId, "task_completed", `Task #${taskId}`);
      return true;
    }
    return false;
  }

  deleteTask(sessionId: string, taskId: number): boolean {
    const result = this.db.prepare(
      "UPDATE tasks SET status = 'deleted' WHERE id = ? AND session_id = ?"
    ).run(taskId, sessionId);
    return result.changes > 0;
  }

  // --- Reminders ---
  addReminder(sessionId: string, title: string, remindAt: string, repeat?: string): number {
    const result = this.db.prepare(
      "INSERT INTO reminders (session_id, title, remind_at, repeat, created_at) VALUES (?, ?, ?, ?, ?)"
    ).run(sessionId, title, remindAt, repeat ?? null, Date.now());
    this.logActivity(sessionId, "reminder_added", `${title} at ${remindAt}`);
    return result.lastInsertRowid as number;
  }

  listReminders(sessionId: string): ReminderRow[] {
    return this.db.prepare(
      "SELECT * FROM reminders WHERE session_id = ? AND status = 'active' ORDER BY remind_at ASC"
    ).all(sessionId) as ReminderRow[];
  }

  dismissReminder(sessionId: string, reminderId: number): boolean {
    const result = this.db.prepare(
      "UPDATE reminders SET status = 'dismissed' WHERE id = ? AND session_id = ?"
    ).run(reminderId, sessionId);
    return result.changes > 0;
  }

  getDueReminders(sessionId: string, now: string): ReminderRow[] {
    return this.db.prepare(
      "SELECT * FROM reminders WHERE session_id = ? AND status = 'active' AND remind_at <= ? ORDER BY remind_at ASC"
    ).all(sessionId, now) as ReminderRow[];
  }

  // --- Activity Log ---
  logActivity(sessionId: string, action: string, detail?: string) {
    this.db.prepare(
      "INSERT INTO activity_log (session_id, action, detail, created_at) VALUES (?, ?, ?, ?)"
    ).run(sessionId, action, detail ?? null, Date.now());
  }

  getRecentActivity(sessionId: string, limit = 20): ActivityRow[] {
    return this.db.prepare(
      "SELECT * FROM activity_log WHERE session_id = ? ORDER BY created_at DESC LIMIT ?"
    ).all(sessionId, limit) as ActivityRow[];
  }

  getActivitySince(sessionId: string, since: number): ActivityRow[] {
    return this.db.prepare(
      "SELECT * FROM activity_log WHERE session_id = ? AND created_at >= ? ORDER BY created_at ASC"
    ).all(sessionId, since) as ActivityRow[];
  }
}

export interface TaskRow {
  id: number;
  session_id: string;
  title: string;
  description: string | null;
  priority: string;
  status: string;
  due_date: string | null;
  created_at: number;
  completed_at: number | null;
}

export interface ReminderRow {
  id: number;
  session_id: string;
  title: string;
  remind_at: string;
  repeat: string | null;
  status: string;
  created_at: number;
}

export interface ActivityRow {
  id: number;
  session_id: string;
  action: string;
  detail: string | null;
  created_at: number;
}
