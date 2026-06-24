// Groq adapter (fallback). OpenAI-compatible chat completions + tool calling.

import Groq from "groq-sdk";
import { config } from "@/lib/config";
import type {
  LlmGenerateInput,
  LlmMessage,
  LlmProvider,
  LlmToolCall,
  LlmTurn,
} from "./types";

type GroqMessage = Groq.Chat.Completions.ChatCompletionMessageParam;
type GroqTool = Groq.Chat.Completions.ChatCompletionTool;

function toMessages(system: string, messages: LlmMessage[]): GroqMessage[] {
  const out: GroqMessage[] = [{ role: "system", content: system }];
  for (const m of messages) {
    if (m.role === "user") {
      out.push({ role: "user", content: m.text });
    } else if (m.role === "assistant") {
      out.push({
        role: "assistant",
        content: m.text || "",
        ...(m.toolCalls?.length
          ? {
              tool_calls: m.toolCalls.map((tc) => ({
                id: tc.id,
                type: "function" as const,
                function: { name: tc.name, arguments: JSON.stringify(tc.args) },
              })),
            }
          : {}),
      });
    } else {
      out.push({ role: "tool", tool_call_id: m.toolCallId, content: m.content });
    }
  }
  return out;
}

function parseArgs(raw: string | undefined): Record<string, unknown> {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

export function createGroqProvider(): LlmProvider {
  const apiKey = config.groq.apiKey;
  let client: Groq | null = null;
  const groq = () => (client ??= new Groq({ apiKey }));

  return {
    name: "groq",
    available: !!apiKey,
    async generate(input: LlmGenerateInput): Promise<LlmTurn> {
      const tools: GroqTool[] = input.tools.map((t) => ({
        type: "function",
        function: { name: t.name, description: t.description, parameters: t.parameters },
      }));

      const res = await groq().chat.completions.create(
        {
          model: config.groq.model,
          messages: toMessages(input.system, input.messages),
          tools,
          tool_choice: "auto",
        },
        { signal: input.signal },
      );

      const msg = res.choices[0]?.message;
      const rawCalls = (msg?.tool_calls ?? []) as {
        id: string;
        function?: { name: string; arguments: string };
      }[];
      const toolCalls: LlmToolCall[] = rawCalls.map((tc) => ({
        id: tc.id,
        name: tc.function?.name ?? "",
        args: parseArgs(tc.function?.arguments),
      }));

      return { provider: "groq", text: msg?.content ?? "", toolCalls };
    },
  };
}
