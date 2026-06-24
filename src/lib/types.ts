// Shared domain + transport types.

export type LoyaltyTier = "standard" | "gold" | "vip";
export type OrderStatus = "delivered" | "shipped" | "processing";
export type ConversationStatus = "OPEN" | "APPROVED" | "DENIED" | "ESCALATED";

// ---- Eligibility (the deterministic spine) ----
export type RuleStatus = "PASS" | "FAIL" | "ESCALATE" | "NA";
export interface RuleResult {
  id: string;
  label: string;
  status: RuleStatus;
  detail: string;
}
export type Recommendation = "ELIGIBLE" | "INELIGIBLE" | "ESCALATE";
export interface EligibilityResult {
  orderId: string;
  recommendation: Recommendation;
  maxRefundable: number;
  daysSinceDelivery: number | null;
  windowDays: number;
  rules: RuleResult[];
  summary: string;
}

// ---- Reasoning trace ----
export type StepType =
  | "model_text"
  | "tool_call"
  | "tool_result"
  | "decision"
  | "error";

export interface ReasoningStepDTO {
  id: string;
  seq: number;
  type: StepType;
  name: string | null;
  payload: unknown;
  provider: string | null;
  createdAt: string;
}

// ---- SSE events pushed to the customer chat client ----
export type ChatEvent =
  | { type: "conversation"; conversationId: string }
  | { type: "step"; step: ReasoningStepDTO }
  | { type: "assistant"; content: string }
  | {
      type: "verdict";
      status: ConversationStatus;
      amount: number | null;
      citedRules: string[];
      explanation: string;
    }
  | { type: "error"; message: string }
  | { type: "done" };
