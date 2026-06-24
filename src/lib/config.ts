// Central configuration, read from environment with safe defaults.
// Server-only: do not import from client components (reads non-public env vars).

function num(v: string | undefined, fallback: number): number {
  if (v === undefined || v.trim() === "") return fallback;
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

export type LlmProviderName = "gemini" | "groq";

export const config = {
  /** Refunds at or above this amount must be escalated (never auto-approved). */
  highValueThreshold: num(process.env.HIGH_VALUE_THRESHOLD, 500),
  /** Hard cap on agent loop iterations before auto-escalation. */
  maxIterations: num(process.env.AGENT_MAX_ITERATIONS, 10),

  gemini: {
    apiKey: process.env.GEMINI_API_KEY ?? "",
    model: process.env.GEMINI_MODEL || "gemini-2.5-flash",
  },
  groq: {
    apiKey: process.env.GROQ_API_KEY ?? "",
    model: process.env.GROQ_MODEL || "llama-3.3-70b-versatile",
  },
  llmPrimary: ((process.env.LLM_PRIMARY || "gemini").toLowerCase() as LlmProviderName),

  // Policy constants (kept in sync with data/policy.md).
  returnWindowDays: { standard: 30, gold: 45, vip: 60 } as Record<string, number>,
  goodwillGraceDays: 7,
  nonRefundableCategories: ["perishable", "digital", "gift_card"] as readonly string[],
} as const;

export function returnWindowFor(tier: string): number {
  return config.returnWindowDays[tier] ?? config.returnWindowDays.standard;
}
