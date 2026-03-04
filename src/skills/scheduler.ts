import type { Skill, Message, SkillContext } from "../core/types.js";
import type { SkillsDB } from "./skills-db.js";

export function createSchedulerSkill(db: SkillsDB): Skill {
  return {
    name: "scheduler",
    description: "Manage reminders and schedules",
    trigger: /^\/(remind|reminder|schedule|reminders)\b/i,

    async execute(msg: Message, context: SkillContext): Promise<string> {
      const input = msg.content.trim();
      const sessionId = msg.sessionId;

      // /reminders — list all
      if (/^\/(reminders|reminder list)\s*$/i.test(input)) {
        return listReminders(db, sessionId);
      }

      // /remind dismiss <id>
      const dismissMatch = input.match(/^\/remind(?:er)?\s+dismiss\s+#?(\d+)/i);
      if (dismissMatch) {
        const id = parseInt(dismissMatch[1]);
        const ok = db.dismissReminder(sessionId, id);
        return ok ? `Reminder #${id} dismissed.` : `Reminder #${id} not found.`;
      }

      // /remind <title> at <time>
      const addMatch = input.match(/^\/remind(?:er)?\s+(.+?)\s+at\s+(.+?)(?:\s+repeat\s+(.+))?$/i);
      if (addMatch) {
        const [, title, time, repeat] = addMatch;
        const id = db.addReminder(sessionId, title, time, repeat);
        let response = `Reminder #${id} set: "${title}" at ${time}`;
        if (repeat) response += ` (repeat: ${repeat})`;
        return response;
      }

      // /remind check — show due reminders
      if (/^\/remind(?:er)?\s+check\s*$/i.test(input)) {
        const now = new Date().toISOString();
        const due = db.getDueReminders(sessionId, now);
        if (due.length === 0) return "No reminders due right now.";
        const lines = due.map((r) => `  #${r.id} "${r.title}" (was due: ${r.remind_at})`);
        return `Due reminders:\n${lines.join("\n")}`;
      }

      return [
        "Scheduler commands:",
        "  /remind <title> at <time>       — Set a reminder",
        "  /remind <title> at <time> repeat <daily|weekly>",
        "  /reminders                      — List active reminders",
        "  /remind check                   — Show due reminders",
        "  /remind dismiss #<id>           — Dismiss a reminder",
      ].join("\n");
    },
  };
}

function listReminders(db: SkillsDB, sessionId: string): string {
  const reminders = db.listReminders(sessionId);
  if (reminders.length === 0) return "No active reminders.";

  const lines = reminders.map(
    (r) => `  #${r.id} "${r.title}" — ${r.remind_at}${r.repeat ? ` (${r.repeat})` : ""}`
  );
  return `Active reminders:\n${lines.join("\n")}`;
}
