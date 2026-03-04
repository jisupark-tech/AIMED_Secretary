import cron from "node-cron";
import type { SkillsDB } from "../skills/skills-db.js";
import type { Gateway } from "./gateway.js";
import { log } from "../utils/logger.js";

export class CronScheduler {
  private jobs: cron.ScheduledTask[] = [];

  constructor(
    private gateway: Gateway,
    private skillsDb: SkillsDB
  ) {}

  start() {
    // Check reminders every minute
    const reminderJob = cron.schedule("* * * * *", () => {
      this.checkReminders();
    });
    this.jobs.push(reminderJob);
    log.info("Cron: Reminder checker started (every minute)");

    // Daily briefing at 9:00 AM
    const dailyBriefing = cron.schedule("0 9 * * *", () => {
      this.sendDailyBriefing();
    });
    this.jobs.push(dailyBriefing);
    log.info("Cron: Daily briefing scheduled (09:00)");
  }

  stop() {
    for (const job of this.jobs) {
      job.stop();
    }
    this.jobs = [];
  }

  private checkReminders() {
    const now = new Date().toISOString();

    // Check all active sessions for due reminders
    // For now, check the CLI default session
    const sessions = ["cli-default"];

    for (const sessionId of sessions) {
      const due = this.skillsDb.getDueReminders(sessionId, now);
      if (due.length === 0) continue;

      for (const reminder of due) {
        const msg = `Reminder: "${reminder.title}" (set for ${reminder.remind_at})`;
        log.info(`Cron reminder triggered: ${reminder.title}`);

        // Determine channel from session ID
        const channelId = sessionId.split("-")[0];
        this.gateway.sendResponse(channelId, sessionId, msg);

        // Handle repeat or dismiss
        if (reminder.repeat === "daily") {
          const next = new Date();
          next.setDate(next.getDate() + 1);
          this.skillsDb.dismissReminder(sessionId, reminder.id);
          this.skillsDb.addReminder(
            sessionId,
            reminder.title,
            next.toISOString(),
            "daily"
          );
        } else if (reminder.repeat === "weekly") {
          const next = new Date();
          next.setDate(next.getDate() + 7);
          this.skillsDb.dismissReminder(sessionId, reminder.id);
          this.skillsDb.addReminder(
            sessionId,
            reminder.title,
            next.toISOString(),
            "weekly"
          );
        } else {
          this.skillsDb.dismissReminder(sessionId, reminder.id);
        }
      }
    }
  }

  private sendDailyBriefing() {
    const sessions = ["cli-default"];

    for (const sessionId of sessions) {
      const tasks = this.skillsDb.listTasks(sessionId, "pending");
      const reminders = this.skillsDb.listReminders(sessionId);

      if (tasks.length === 0 && reminders.length === 0) continue;

      const lines: string[] = ["Good morning! Here's your daily briefing:"];

      if (tasks.length > 0) {
        lines.push(`\nPending tasks: ${tasks.length}`);
        for (const t of tasks.slice(0, 5)) {
          const due = t.due_date ? ` (due: ${t.due_date})` : "";
          lines.push(`  - ${t.title}${due}`);
        }
        if (tasks.length > 5) lines.push(`  ... and ${tasks.length - 5} more`);
      }

      if (reminders.length > 0) {
        lines.push(`\nUpcoming reminders: ${reminders.length}`);
        for (const r of reminders.slice(0, 5)) {
          lines.push(`  - "${r.title}" at ${r.remind_at}`);
        }
      }

      const channelId = sessionId.split("-")[0];
      this.gateway.sendResponse(channelId, sessionId, lines.join("\n"));
    }
  }
}
