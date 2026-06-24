// Google Gemini adapter (primary). Uses @google/genai v2 function calling.

import { GoogleGenAI } from "@google/genai";
import type { Content, FunctionDeclaration, Part } from "@google/genai";
import { config } from "@/lib/config";
import type {
  LlmGenerateInput,
  LlmMessage,
  LlmProvider,
  LlmToolCall,
  LlmTurn,
} from "./types";

function toResponseObject(content: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(content);
    return parsed && typeof parsed === "object"
      ? (parsed as Record<string, unknown>)
      : { result: parsed };
  } catch {
    return { result: content };
  }
}

function toContents(messages: LlmMessage[]): Content[] {
  const contents: Content[] = [];
  for (const m of messages) {
    if (m.role === "user") {
      contents.push({ role: "user", parts: [{ text: m.text }] });
    } else if (m.role === "assistant") {
      const parts: Part[] = [];
      if (m.text) parts.push({ text: m.text });
      for (const tc of m.toolCalls ?? []) {
        parts.push({ functionCall: { id: tc.id, name: tc.name, args: tc.args } });
      }
      if (parts.length === 0) parts.push({ text: "" });
      contents.push({ role: "model", parts });
    } else {
      contents.push({
        role: "user",
        parts: [
          {
            functionResponse: {
              id: m.toolCallId,
              name: m.name,
              response: toResponseObject(m.content),
            },
          },
        ],
      });
    }
  }
  return contents;
}

export function createGeminiProvider(): LlmProvider {
  const apiKey = config.gemini.apiKey;
  let client: GoogleGenAI | null = null;
  const ai = () => (client ??= new GoogleGenAI({ apiKey }));

  return {
    name: "gemini",
    available: !!apiKey,
    async generate(input: LlmGenerateInput): Promise<LlmTurn> {
      const functionDeclarations: FunctionDeclaration[] = input.tools.map((t) => ({
        name: t.name,
        description: t.description,
        parametersJsonSchema: t.parameters,
      }));

      const res = await ai().models.generateContent({
        model: config.gemini.model,
        contents: toContents(input.messages),
        config: {
          systemInstruction: input.system,
          tools: [{ functionDeclarations }],
          abortSignal: input.signal,
        },
      });

      const toolCalls: LlmToolCall[] = (res.functionCalls ?? []).map((c, i) => ({
        id: c.id ?? `${c.name ?? "fn"}_${i}`,
        name: c.name ?? "",
        args: (c.args ?? {}) as Record<string, unknown>,
      }));

      return { provider: "gemini", text: res.text ?? "", toolCalls };
    },
  };
}
