// Client-safe presentation helpers (no server imports).

export const TOOL_LABELS: Record<string, string> = {
  lookupCustomer: "Looking up your account",
  listOrders: "Reviewing your orders",
  getOrder: "Pulling up your order",
  getRefundPolicy: "Checking the refund policy",
  checkRefundEligibility: "Evaluating eligibility against policy",
  issueRefund: "Processing your refund",
  denyRefund: "Finalizing the decision",
  escalateToHuman: "Escalating to a human specialist",
};

export function friendlyTool(name: string): string {
  return TOOL_LABELS[name] ?? name;
}

export function providerLabel(p?: string | null): string {
  if (p === "gemini") return "Gemini";
  if (p === "groq") return "Groq";
  return p ?? "";
}
