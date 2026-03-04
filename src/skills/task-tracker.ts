import type { Skill, Message, SkillContext } from "../core/types.js";
import type { SkillsDB } from "./skills-db.js";

const PRIORITY_ICONS: Record<string, string> = {
  high: "[!]",
  medium: "[-]",
  low: "[ ]",
};

export function createTaskTrackerSkill(db: SkillsDB): Skill {
  return {
    name: "task-tracker",
    description: "Manage tasks and todos",
    trigger: /^\/(task|todo|tasks|todos)\b/i,

    async execute(msg: Message, context: SkillContext): Promise<string> {
      const input = msg.content.trim();
      const sessionId = msg.sessionId;

      // /tasks — list all pending
      if (/^\/(tasks?|todos?)\s*$/i.test(input)) {
        return listTasks(db, sessionId);
      }

      // /tasks all — list all including done
      if (/^\/(tasks?|todos?)\s+all\s*$/i.test(input)) {
        return listTasks(db, sessionId, undefined);
      }

      // /task done <id>
      const doneMatch = input.match(/^\/(task|todo)\s+done\s+#?(\d+)/i);
      if (doneMatch) {
        const id = parseInt(doneMatch[2]);
        const ok = db.completeTask(sessionId, id);
        return ok ? `Task #${id} marked as done.` : `Task #${id} not found.`;
      }

      // /task delete <id>
      const deleteMatch = input.match(/^\/(task|todo)\s+delete\s+#?(\d+)/i);
      if (deleteMatch) {
        const id = parseInt(deleteMatch[2]);
        const ok = db.deleteTask(sessionId, id);
        return ok ? `Task #${id} deleted.` : `Task #${id} not found.`;
      }

      // /task add <title> [priority:high|medium|low] [due:YYYY-MM-DD]
      const addMatch = input.match(/^\/(task|todo)\s+add\s+(.+)/i);
      if (addMatch) {
        let text = addMatch[2];

        // Extract priority
        let priority = "medium";
        const priMatch = text.match(/\bpriority:(high|medium|low)\b/i);
        if (priMatch) {
          priority = priMatch[1].toLowerCase();
          text = text.replace(priMatch[0], "").trim();
        }

        // Extract due date
        let dueDate: string | undefined;
        const dueMatch = text.match(/\bdue:(\S+)\b/i);
        if (dueMatch) {
          dueDate = dueMatch[1];
          text = text.replace(dueMatch[0], "").trim();
        }

        const title = text.trim();
        if (!title) return "Please provide a task title.";

        const id = db.addTask(sessionId, title, priority, dueDate);
        let response = `Task #${id} added: "${title}" [${priority}]`;
        if (dueDate) response += ` due ${dueDate}`;
        return response;
      }

      return [
        "Task Tracker commands:",
        "  /task add <title>                     — Add a task",
        "  /task add <title> priority:high       — Add with priority (high/medium/low)",
        "  /task add <title> due:2026-03-10      — Add with due date",
        "  /tasks                                — List pending tasks",
        "  /tasks all                            — List all tasks",
        "  /task done #<id>                      — Mark task as done",
        "  /task delete #<id>                    — Delete a task",
      ].join("\n");
    },
  };
}

function listTasks(db: SkillsDB, sessionId: string, status?: string): string {
  const tasks = status !== undefined ? db.listTasks(sessionId, status) : db.listTasks(sessionId);
  if (tasks.length === 0) return "No tasks found.";

  const lines = tasks.map((t) => {
    const icon = PRIORITY_ICONS[t.priority] || "[-]";
    const statusTag = t.status === "done" ? " (done)" : "";
    const due = t.due_date ? ` due:${t.due_date}` : "";
    return `  ${icon} #${t.id} ${t.title}${due}${statusTag}`;
  });

  return `Tasks:\n${lines.join("\n")}`;
}
