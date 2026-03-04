import type { Skill, Message, SkillContext } from "../core/types.js";
import type { RAGEngine } from "../core/rag.js";

export function createKnowledgeSkill(rag: RAGEngine): Skill {
  return {
    name: "knowledge",
    description: "Search and manage the knowledge base",
    trigger: /^\/(kb|knowledge|docs|search)\b/i,

    async execute(msg: Message, _context: SkillContext): Promise<string> {
      const input = msg.content.trim();

      // /kb stats
      if (/^\/(kb|knowledge)\s+stats\s*$/i.test(input)) {
        const stats = rag.getStats();
        return `Knowledge Base:\n  Documents: ${stats.documents}\n  Chunks: ${stats.chunks}`;
      }

      // /kb list
      if (/^\/(kb|knowledge)\s+list\s*$/i.test(input)) {
        const docs = rag.listDocuments();
        if (docs.length === 0) return "No documents in knowledge base.\nAdd files to ./knowledge/ and run /kb ingest";
        const lines = docs.map((d) => `  - ${d.source} (${d.title})`);
        return `Documents:\n${lines.join("\n")}`;
      }

      // /kb ingest
      if (/^\/(kb|knowledge)\s+ingest\s*$/i.test(input)) {
        const count = await rag.ingestAll();
        return count > 0
          ? `Ingested ${count} documents into knowledge base.`
          : "No documents found. Add files to ./knowledge/ directory.";
      }

      // /kb search <query> or /search <query>
      const searchMatch = input.match(/^\/(kb|knowledge|search|docs)\s+(?:search\s+)?(.+)/i);
      if (searchMatch) {
        const query = searchMatch[2].trim();
        if (query === "stats" || query === "list" || query === "ingest") {
          // Already handled above
          return "";
        }

        const answer = await rag.query(query);
        if (!answer) return "No relevant documents found for your query.";
        return answer;
      }

      return [
        "Knowledge Base commands:",
        "  /kb ingest             — Ingest files from ./knowledge/",
        "  /kb list               — List all documents",
        "  /kb stats              — Show KB statistics",
        "  /kb search <query>     — Search the knowledge base",
        "  /search <query>        — Search (shortcut)",
        "",
        "Supported files: .txt, .md, .json, .csv, .ts, .js, .py, .yaml",
        "Place files in the ./knowledge/ directory.",
      ].join("\n");
    },
  };
}
