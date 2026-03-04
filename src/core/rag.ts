import { readFileSync, readdirSync, statSync, existsSync, mkdirSync } from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import type { LLMProvider } from "./types.js";
import { log } from "../utils/logger.js";

interface DocChunk {
  id: number;
  source: string;
  content: string;
  chunk_index: number;
}

export class RAGEngine {
  private db: Database.Database;
  private knowledgePath: string;

  constructor(
    db: Database.Database,
    private provider: LLMProvider,
    knowledgePath?: string
  ) {
    this.db = db;
    this.knowledgePath = knowledgePath || path.join(process.cwd(), "knowledge");

    if (!existsSync(this.knowledgePath)) {
      mkdirSync(this.knowledgePath, { recursive: true });
    }

    this.initSchema();
  }

  private initSchema() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS documents (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        source TEXT NOT NULL UNIQUE,
        title TEXT,
        content TEXT NOT NULL,
        ingested_at INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS chunks (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        doc_id INTEGER NOT NULL,
        source TEXT NOT NULL,
        content TEXT NOT NULL,
        chunk_index INTEGER NOT NULL,
        keywords TEXT,
        FOREIGN KEY (doc_id) REFERENCES documents(id)
      );

      CREATE INDEX IF NOT EXISTS idx_chunks_source ON chunks(source);
    `);
    log.debug("RAG schema initialized");
  }

  // Ingest all files from knowledge directory
  async ingestAll(): Promise<number> {
    if (!existsSync(this.knowledgePath)) return 0;

    const files = this.walkDir(this.knowledgePath);
    let count = 0;

    for (const file of files) {
      try {
        await this.ingestFile(file);
        count++;
      } catch (err) {
        log.error(`Failed to ingest ${file}:`, err);
      }
    }

    log.info(`RAG: Ingested ${count} documents from ${this.knowledgePath}`);
    return count;
  }

  async ingestFile(filePath: string): Promise<void> {
    const ext = path.extname(filePath).toLowerCase();
    const supported = [".txt", ".md", ".json", ".csv", ".log", ".ts", ".js", ".py", ".yaml", ".yml", ".toml"];

    if (!supported.includes(ext)) {
      log.debug(`Skipping unsupported file: ${filePath}`);
      return;
    }

    const content = readFileSync(filePath, "utf-8");
    if (!content.trim()) return;

    const relativePath = path.relative(this.knowledgePath, filePath);
    const title = path.basename(filePath, ext);

    // Upsert document
    this.db.prepare(`
      INSERT INTO documents (source, title, content, ingested_at)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(source) DO UPDATE SET content = ?, ingested_at = ?
    `).run(relativePath, title, content, Date.now(), content, Date.now());

    const doc = this.db.prepare("SELECT id FROM documents WHERE source = ?").get(relativePath) as { id: number };

    // Delete old chunks
    this.db.prepare("DELETE FROM chunks WHERE doc_id = ?").run(doc.id);

    // Chunk and store
    const chunks = this.chunkText(content);
    const insert = this.db.prepare(
      "INSERT INTO chunks (doc_id, source, content, chunk_index, keywords) VALUES (?, ?, ?, ?, ?)"
    );

    for (let i = 0; i < chunks.length; i++) {
      const keywords = this.extractKeywords(chunks[i]);
      insert.run(doc.id, relativePath, chunks[i], i, keywords.join(","));
    }

    log.debug(`Ingested: ${relativePath} (${chunks.length} chunks)`);
  }

  // Search knowledge base using keyword matching
  search(query: string, limit = 5): DocChunk[] {
    const queryWords = this.extractKeywords(query);

    if (queryWords.length === 0) return [];

    // Build search: match any keyword in content or keywords field
    const conditions = queryWords.map(() => "(content LIKE ? OR keywords LIKE ?)");
    const params: string[] = [];
    for (const word of queryWords) {
      params.push(`%${word}%`, `%${word}%`);
    }

    const sql = `
      SELECT id, source, content, chunk_index
      FROM chunks
      WHERE ${conditions.join(" OR ")}
      LIMIT ?
    `;

    return this.db.prepare(sql).all(...params, limit) as DocChunk[];
  }

  // RAG-augmented query: search docs then ask LLM with context
  async query(question: string): Promise<string> {
    const relevant = this.search(question, 5);

    if (relevant.length === 0) {
      return "";  // No relevant docs found, let normal LLM handle it
    }

    const context = relevant
      .map((c) => `[Source: ${c.source}]\n${c.content}`)
      .join("\n\n---\n\n");

    const response = await this.provider.generate({
      systemPrompt: `You are AIMED Secretary. Answer the user's question based on the following knowledge base documents. If the documents don't contain relevant information, say so. Cite sources when possible.`,
      messages: [{
        role: "user",
        content: `Knowledge base context:\n\n${context}\n\n---\n\nQuestion: ${question}`,
      }],
    });

    return response.content;
  }

  getStats(): { documents: number; chunks: number } {
    const docs = this.db.prepare("SELECT COUNT(*) as count FROM documents").get() as { count: number };
    const chunks = this.db.prepare("SELECT COUNT(*) as count FROM chunks").get() as { count: number };
    return { documents: docs.count, chunks: chunks.count };
  }

  listDocuments(): Array<{ source: string; title: string }> {
    return this.db.prepare("SELECT source, title FROM documents ORDER BY source").all() as Array<{ source: string; title: string }>;
  }

  private chunkText(text: string, maxChunkSize = 1000, overlap = 200): string[] {
    const chunks: string[] = [];
    const lines = text.split("\n");
    let currentChunk = "";

    for (const line of lines) {
      if (currentChunk.length + line.length > maxChunkSize && currentChunk.length > 0) {
        chunks.push(currentChunk.trim());
        // Keep overlap from end of previous chunk
        const words = currentChunk.split(" ");
        const overlapWords = words.slice(-Math.floor(overlap / 5));
        currentChunk = overlapWords.join(" ") + "\n" + line;
      } else {
        currentChunk += (currentChunk ? "\n" : "") + line;
      }
    }

    if (currentChunk.trim()) {
      chunks.push(currentChunk.trim());
    }

    return chunks;
  }

  private extractKeywords(text: string): string[] {
    const stopWords = new Set([
      "the", "a", "an", "is", "are", "was", "were", "be", "been", "being",
      "have", "has", "had", "do", "does", "did", "will", "would", "could",
      "should", "may", "might", "shall", "can", "need", "must", "to", "of",
      "in", "for", "on", "with", "at", "by", "from", "as", "into", "about",
      "that", "this", "these", "those", "it", "its", "and", "or", "but",
      "not", "no", "if", "then", "than", "so", "up", "out", "what", "which",
      "who", "how", "when", "where", "why", "all", "each", "every", "both",
      "i", "me", "my", "we", "our", "you", "your", "he", "she", "they",
    ]);

    return text
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, " ")
      .split(/\s+/)
      .filter((w) => w.length > 2 && !stopWords.has(w))
      .slice(0, 20);
  }

  private walkDir(dir: string): string[] {
    const files: string[] = [];
    for (const entry of readdirSync(dir)) {
      const full = path.join(dir, entry);
      if (entry.startsWith(".")) continue;
      const stat = statSync(full);
      if (stat.isDirectory()) {
        files.push(...this.walkDir(full));
      } else {
        files.push(full);
      }
    }
    return files;
  }
}
