import type { LLMProvider, LLMRequest, LLMResponse } from "../core/types.js";
import { log } from "../utils/logger.js";

export class OllamaProvider implements LLMProvider {
  name = "ollama";

  constructor(
    private host = "http://localhost:11434",
    private model = "qwen2.5"
  ) {}

  async isAvailable(): Promise<boolean> {
    try {
      const res = await fetch(`${this.host}/api/tags`);
      if (res.ok) {
        log.info(`Ollama available at ${this.host}`);
        return true;
      }
      return false;
    } catch {
      return false;
    }
  }

  async generate(request: LLMRequest): Promise<LLMResponse> {
    const messages = [];

    if (request.systemPrompt) {
      messages.push({ role: "system", content: request.systemPrompt });
    }

    messages.push(
      ...request.messages.map((m) => ({
        role: m.role,
        content: m.content,
      }))
    );

    const res = await fetch(`${this.host}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: this.model,
        messages,
        stream: false,
      }),
    });

    if (!res.ok) {
      throw new Error(`Ollama API error: ${res.status} ${res.statusText}`);
    }

    const data = (await res.json()) as {
      message: { content: string };
      eval_count?: number;
      prompt_eval_count?: number;
    };

    return {
      content: data.message.content,
      usage: {
        inputTokens: data.prompt_eval_count,
        outputTokens: data.eval_count,
      },
    };
  }

  async *generateStream(request: LLMRequest): AsyncGenerator<string> {
    const messages = [];

    if (request.systemPrompt) {
      messages.push({ role: "system", content: request.systemPrompt });
    }

    messages.push(
      ...request.messages.map((m) => ({
        role: m.role,
        content: m.content,
      }))
    );

    const res = await fetch(`${this.host}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: this.model,
        messages,
        stream: true,
      }),
    });

    if (!res.ok) {
      throw new Error(`Ollama API error: ${res.status} ${res.statusText}`);
    }

    const reader = res.body?.getReader();
    if (!reader) throw new Error("No response body");

    const decoder = new TextDecoder();
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      const text = decoder.decode(value, { stream: true });
      for (const line of text.split("\n").filter(Boolean)) {
        const parsed = JSON.parse(line) as { message?: { content: string } };
        if (parsed.message?.content) {
          yield parsed.message.content;
        }
      }
    }
  }
}
