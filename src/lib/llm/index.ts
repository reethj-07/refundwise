// LLM router: tries the primary provider, transparently falls back to the other
// on any error (rate limit, 5xx, timeout, network). Each returned turn is tagged
// with the provider that actually served it.

import { config } from "@/lib/config";
import { createGeminiProvider } from "./gemini";
import { createGroqProvider } from "./groq";
import type { LlmGenerateInput, LlmProvider, LlmTurn } from "./types";

export type { LlmMessage, LlmTool, LlmTurn, LlmToolCall } from "./types";

let cached: LlmProvider[] | null = null;

function orderedProviders(): LlmProvider[] {
  if (cached) return cached;
  const gemini = createGeminiProvider();
  const groq = createGroqProvider();
  const primary = config.llmPrimary === "groq" ? groq : gemini;
  const secondary = config.llmPrimary === "groq" ? gemini : groq;
  cached = [primary, secondary].filter((p) => p.available);
  return cached;
}

export function llmConfigured(): boolean {
  return orderedProviders().length > 0;
}

export function configuredProviderNames(): string[] {
  return orderedProviders().map((p) => p.name);
}

export async function generate(input: LlmGenerateInput): Promise<LlmTurn> {
  const providers = orderedProviders();
  if (providers.length === 0) {
    throw new Error(
      "No LLM provider configured. Add GEMINI_API_KEY and/or GROQ_API_KEY to .env.local (both are free).",
    );
  }

  let lastError: unknown;
  for (let i = 0; i < providers.length; i++) {
    const provider = providers[i];
    try {
      const turn = await provider.generate(input);
      if (i > 0) {
        turn.note = `${providers[0].name} failed; served by ${provider.name} (fallback).`;
      }
      return turn;
    } catch (err) {
      lastError = err;
      // fall through to the next provider
    }
  }
  throw new Error(
    `All LLM providers failed. Last error: ${
      lastError instanceof Error ? lastError.message : String(lastError)
    }`,
  );
}
