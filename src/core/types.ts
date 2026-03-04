// Core types for AIMED Secretary

export interface Message {
  id: string;
  sessionId: string;
  role: "user" | "assistant" | "system";
  content: string;
  channelId: string;
  timestamp: number;
  metadata?: Record<string, unknown>;
}

export interface Session {
  id: string;
  channelId: string;
  userId: string;
  createdAt: number;
  lastActiveAt: number;
}

export interface LLMRequest {
  messages: Array<{ role: string; content: string }>;
  systemPrompt?: string;
  maxTokens?: number;
}

export interface LLMResponse {
  content: string;
  usage?: {
    inputTokens?: number;
    outputTokens?: number;
  };
}

export interface LLMProvider {
  name: string;
  generate(request: LLMRequest): Promise<LLMResponse>;
  generateStream?(request: LLMRequest): AsyncGenerator<string>;
  isAvailable(): Promise<boolean>;
}

export interface Channel {
  name: string;
  start(): Promise<void>;
  stop(): Promise<void>;
  onMessage(handler: (msg: Message) => Promise<void>): void;
  sendResponse(sessionId: string, content: string): Promise<void>;
}

export interface Skill {
  name: string;
  description: string;
  trigger: RegExp | ((msg: Message) => boolean);
  execute(msg: Message, context: SkillContext): Promise<string>;
}

export interface SkillContext {
  session: Session;
  history: Message[];
  llm: LLMProvider;
}

export type LogLevel = "debug" | "info" | "warn" | "error";
