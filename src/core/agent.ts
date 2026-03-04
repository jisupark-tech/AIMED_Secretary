import type { Message, LLMProvider, LLMRequest, Skill, SkillContext } from "./types.js";
import type { SessionStore } from "./session.js";
import { log } from "../utils/logger.js";

const SYSTEM_PROMPT = `You are AIMED Secretary, a helpful AI assistant.
You assist users with tasks, answer questions, and help manage their work.
Be concise, professional, and proactive. If you can take action, do so.
Always respond in the same language the user uses.`;

export class Agent {
  private skills: Skill[] = [];

  constructor(
    private provider: LLMProvider,
    private sessionStore: SessionStore
  ) {}

  registerSkill(skill: Skill) {
    this.skills.push(skill);
    log.info(`Skill registered: ${skill.name}`);
  }

  async processMessage(msg: Message): Promise<string> {
    // Ensure session exists
    this.sessionStore.ensureSession(msg.sessionId, msg.channelId, msg.sessionId);

    // Save user message
    this.sessionStore.saveMessage(msg);

    // Check if any skill should handle this
    for (const skill of this.skills) {
      const shouldTrigger =
        skill.trigger instanceof RegExp
          ? skill.trigger.test(msg.content)
          : skill.trigger(msg);

      if (shouldTrigger) {
        log.info(`Skill triggered: ${skill.name}`);
        const session = this.sessionStore.getSession(msg.sessionId)!;
        const history = this.sessionStore.getHistory(msg.sessionId);
        const context: SkillContext = {
          session,
          history,
          llm: this.provider,
        };
        try {
          const result = await skill.execute(msg, context);
          this.saveAssistantMessage(msg, result);
          return result;
        } catch (err) {
          log.error(`Skill ${skill.name} failed:`, err);
          // Fall through to normal LLM processing
        }
      }
    }

    // Normal LLM processing
    const history = this.sessionStore.getHistory(msg.sessionId, 50);
    const request: LLMRequest = {
      systemPrompt: SYSTEM_PROMPT,
      messages: history.map((m) => ({
        role: m.role,
        content: m.content,
      })),
    };

    try {
      const response = await this.provider.generate(request);
      this.saveAssistantMessage(msg, response.content);
      return response.content;
    } catch (err) {
      const errorMsg = `Sorry, I encountered an error: ${err instanceof Error ? err.message : "Unknown error"}`;
      log.error("LLM generation failed:", err);
      return errorMsg;
    }
  }

  private saveAssistantMessage(originalMsg: Message, content: string) {
    const assistantMsg: Message = {
      id: crypto.randomUUID(),
      sessionId: originalMsg.sessionId,
      role: "assistant",
      content,
      channelId: originalMsg.channelId,
      timestamp: Date.now(),
    };
    this.sessionStore.saveMessage(assistantMsg);
  }
}
