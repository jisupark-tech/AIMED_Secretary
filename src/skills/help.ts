import type { Skill, Message, SkillContext } from "../core/types.js";

export function createHelpSkill(): Skill {
  return {
    name: "help",
    description: "Show available commands and skills",
    trigger: /^\/(help|commands|skills)\s*$/i,

    async execute(_msg: Message, _context: SkillContext): Promise<string> {
      return [
        "=== AIMED Secretary ===",
        "",
        "Task Management:",
        "  /task add <title>                 — Add a task",
        "  /task add <title> priority:high   — Add with priority",
        "  /task add <title> due:2026-03-10  — Add with due date",
        "  /tasks                            — List pending tasks",
        "  /tasks all                        — List all tasks",
        "  /task done #<id>                  — Complete a task",
        "  /task delete #<id>                — Delete a task",
        "",
        "Reminders:",
        "  /remind <title> at <time>         — Set a reminder",
        "  /remind <title> at <time> repeat daily",
        "  /reminders                        — List active reminders",
        "  /remind check                     — Show due reminders",
        "  /remind dismiss #<id>             — Dismiss a reminder",
        "",
        "Reports:",
        "  /report                           — Daily briefing",
        "  /report weekly                    — Weekly summary",
        "",
        "Other:",
        "  /help                             — Show this help",
        "  /clear                            — Clear conversation",
        "  /quit                             — Exit",
        "",
        "Any other message is sent to the AI for a response.",
      ].join("\n");
    },
  };
}
