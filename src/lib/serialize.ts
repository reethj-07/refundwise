import type { ReasoningStepDTO, StepType, ConversationStatus } from "@/lib/types";

export interface StepRow {
  id: string;
  seq: number;
  type: string;
  name: string | null;
  payload: string;
  provider: string | null;
  createdAt: Date;
}

export function stepToDTO(s: StepRow): ReasoningStepDTO {
  let payload: unknown = s.payload;
  try {
    payload = JSON.parse(s.payload);
  } catch {
    /* leave as raw string */
  }
  return {
    id: s.id,
    seq: s.seq,
    type: s.type as StepType,
    name: s.name,
    payload,
    provider: s.provider,
    createdAt: s.createdAt.toISOString(),
  };
}

export function parseCitedRules(raw: string | null): string[] {
  if (!raw) return [];
  try {
    const v = JSON.parse(raw);
    return Array.isArray(v) ? v.map(String) : [];
  } catch {
    return [];
  }
}

export interface ConversationSummary {
  id: string;
  status: ConversationStatus;
  customerRef: string | null;
  customerName: string | null;
  verdictAmount: number | null;
  citedRules: string[];
  firstMessage: string | null;
  stepCount: number;
  messageCount: number;
  createdAt: string;
  updatedAt: string;
}
