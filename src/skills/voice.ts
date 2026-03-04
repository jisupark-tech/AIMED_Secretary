import type { Skill, Message, SkillContext } from "../core/types.js";
import type { VoiceEngine } from "../core/voice.js";

export function createVoiceSkill(voice: VoiceEngine): Skill {
  return {
    name: "voice",
    description: "Voice recording and transcription",
    trigger: /^\/(voice|record|listen)\b/i,

    async execute(msg: Message, context: SkillContext): Promise<string> {
      const input = msg.content.trim();

      // /voice <duration> or /record <duration>
      const durationMatch = input.match(/^\/(voice|record|listen)\s+(\d+)\s*$/i);
      const duration = durationMatch ? parseInt(durationMatch[2]) : 10;

      if (duration > 120) {
        return "Maximum recording duration is 120 seconds.";
      }

      try {
        const text = await voice.recordAndTranscribe(duration);
        if (!text.trim()) {
          return "No speech detected. Try again.";
        }

        // Process the transcribed text as a message to the agent
        const response = await context.llm.generate({
          messages: [
            ...context.history.map((m) => ({ role: m.role, content: m.content })),
            { role: "user", content: text },
          ],
          systemPrompt: "You are AIMED Secretary. The user spoke the following via voice input. Respond naturally.",
        });

        return `[Voice] "${text}"\n\n${response.content}`;
      } catch (err) {
        const error = err instanceof Error ? err.message : "Unknown error";
        return `Voice recording failed: ${error}\n\nRequirements:\n  brew install sox        — for recording\n  brew install whisper-cpp — for transcription`;
      }
    },
  };
}
