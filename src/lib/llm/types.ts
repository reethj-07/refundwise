// Provider-agnostic LLM interface. The agent loop only knows these types; the
// Gemini and Groq adapters translate to/from each vendor's wire format.

import type { LlmProviderName } from "@/lib/config";

export interface LlmTool {
  name: string;
  description: string;
  parameters: Record<string, unknown>; // JSON Schema
}

export interface LlmToolCall {
  id: string;
  name: string;
  args: Record<string, unknown>;
}

export type LlmMessage =
  | { role: "user"; text: string }
  | { role: "assistant"; text?: string; toolCalls?: LlmToolCall[] }
  | { role: "tool"; toolCallId: string; name: string; content: string };

export interface LlmTurn {
  provider: LlmProviderName;
  text: string;
  toolCalls: LlmToolCall[];
  /** Set when a fallback occurred, for the reasoning trace. */
  note?: string;
}

export interface LlmGenerateInput {
  system: string;
  tools: LlmTool[];
  messages: LlmMessage[];
  signal?: AbortSignal;
}

export interface LlmProvider {
  name: LlmProviderName;
  available: boolean;
  generate(input: LlmGenerateInput): Promise<LlmTurn>;
}
