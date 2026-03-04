import type { Skill, Message, SkillContext } from "../core/types.js";
import type { SkillsDB } from "./skills-db.js";

export function createReportSkill(db: SkillsDB): Skill {
  return {
    name: "report",
    description: "Generate activity and task reports",
    trigger: /^\/(report|summary|briefing)\b/i,

    async execute(msg: Message, context: SkillContext): Promise<string> {
      const input = msg.content.trim();
      const sessionId = msg.sessionId;

      // /report weekly
      if (/^\/(report|summary)\s+weekly\s*$/i.test(input)) {
        return generateReport(db, sessionId, 7, "Weekly");
      }

      // /report or /report daily (default)
      if (/^\/(report|summary|briefing)(\s+daily)?\s*$/i.test(input)) {
        return generateReport(db, sessionId, 1, "Daily");
      }

      return [
        "Report commands:",
        "  /report           — Daily briefing",
        "  /report daily     — Daily briefing",
        "  /report weekly    — Weekly summary",
      ].join("\n");
    },
  };
}

function generateReport(db: SkillsDB, sessionId: string, days: number, label: string): string {
  const since = Date.now() - days * 24 * 60 * 60 * 1000;
  const now = new Date().toISOString();

  // Tasks summary
  const allTasks = db.listTasks(sessionId);
  const pendingTasks = allTasks.filter((t) => t.status === "pending");
  const doneTasks = allTasks.filter((t) => t.status === "done" && (t.completed_at ?? 0) >= since);
  const overdueTasks = pendingTasks.filter((t) => t.due_date && t.due_date < now.slice(0, 10));

  // Reminders
  const reminders = db.listReminders(sessionId);
  const dueReminders = db.getDueReminders(sessionId, now);

  // Activity
  const activity = db.getActivitySince(sessionId, since);

  const sections: string[] = [];

  sections.push(`=== ${label} Report ===`);
  sections.push(`Generated: ${new Date().toLocaleString()}`);
  sections.push("");

  // Task overview
  sections.push(`Tasks:`);
  sections.push(`  Pending: ${pendingTasks.length}`);
  sections.push(`  Completed (${label.toLowerCase()}): ${doneTasks.length}`);
  if (overdueTasks.length > 0) {
    sections.push(`  Overdue: ${overdueTasks.length}`);
    for (const t of overdueTasks) {
      sections.push(`    [!] #${t.id} ${t.title} (due: ${t.due_date})`);
    }
  }

  // Completed tasks
  if (doneTasks.length > 0) {
    sections.push("");
    sections.push("Completed:");
    for (const t of doneTasks) {
      sections.push(`  [x] #${t.id} ${t.title}`);
    }
  }

  // Upcoming reminders
  if (reminders.length > 0) {
    sections.push("");
    sections.push("Upcoming reminders:");
    for (const r of reminders.slice(0, 5)) {
      sections.push(`  #${r.id} "${r.title}" — ${r.remind_at}`);
    }
  }

  if (dueReminders.length > 0) {
    sections.push("");
    sections.push("Due now:");
    for (const r of dueReminders) {
      sections.push(`  [!] #${r.id} "${r.title}" (was due: ${r.remind_at})`);
    }
  }

  // Activity summary
  sections.push("");
  sections.push(`Activity (${activity.length} actions):`);
  const actionCounts = new Map<string, number>();
  for (const a of activity) {
    actionCounts.set(a.action, (actionCounts.get(a.action) ?? 0) + 1);
  }
  for (const [action, count] of actionCounts) {
    sections.push(`  ${action}: ${count}`);
  }

  return sections.join("\n");
}
