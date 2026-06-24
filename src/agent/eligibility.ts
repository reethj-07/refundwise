// The deterministic policy-rule evaluator — the spine of the system.
// The LLM interprets and communicates; these rules are enforced in code and
// re-checked inside issueRefund, so the agent can never approve an ineligible,
// over-threshold, or duplicate refund.

import { config, returnWindowFor } from "@/lib/config";
import type {
  EligibilityResult,
  LoyaltyTier,
  OrderStatus,
  Recommendation,
  RuleResult,
  RuleStatus,
} from "@/lib/types";

const MS_PER_DAY = 86_400_000;

export interface EligibilityItem {
  name: string;
  category: string;
  price: number;
  qty: number;
}

export interface EligibilityInput {
  orderId: string;
  loyaltyTier: LoyaltyTier;
  status: OrderStatus;
  isFinalSale: boolean;
  deliveryDate: Date | null;
  orderTotal: number;
  items: EligibilityItem[];
  priorRefundCount: number;
  /** Defaults to the full order total when not specified (e.g. partial refunds). */
  requestedAmount?: number;
  /** Override "now" for testing/determinism. */
  now?: Date;
}

export function evaluateEligibility(input: EligibilityInput): EligibilityResult {
  const now = input.now ?? new Date();
  const windowDays = returnWindowFor(input.loyaltyTier);
  const amount = input.requestedAmount ?? input.orderTotal;
  const threshold = config.highValueThreshold;
  const grace = config.goodwillGraceDays;

  const daysSinceDelivery = input.deliveryDate
    ? Math.floor((now.getTime() - input.deliveryDate.getTime()) / MS_PER_DAY)
    : null;

  const nonRefundableItems = input.items.filter((i) =>
    config.nonRefundableCategories.includes(i.category),
  );

  const rules: RuleResult[] = [];
  const add = (id: string, label: string, status: RuleStatus, detail: string) =>
    rules.push({ id, label, status, detail });

  // R1 — return window (tiered)
  if (daysSinceDelivery === null) {
    add("R1", `Return window (${windowDays}d, ${input.loyaltyTier})`, "NA", "No delivery date on file — cannot measure the window.");
  } else if (daysSinceDelivery <= windowDays) {
    add("R1", `Return window (${windowDays}d, ${input.loyaltyTier})`, "PASS", `Delivered ${daysSinceDelivery}d ago — within the ${windowDays}d window.`);
  } else {
    add("R1", `Return window (${windowDays}d, ${input.loyaltyTier})`, "FAIL", `Delivered ${daysSinceDelivery}d ago — past the ${windowDays}d window.`);
  }

  // R2 — final sale
  add("R2", "Final-sale item", input.isFinalSale ? "FAIL" : "PASS",
    input.isFinalSale ? "Item is marked final sale (non-refundable)." : "Not a final-sale item.");

  // R3 — non-refundable categories
  add("R3", "Refundable category", nonRefundableItems.length > 0 ? "FAIL" : "PASS",
    nonRefundableItems.length > 0
      ? `Non-refundable item(s): ${nonRefundableItems.map((i) => `${i.name} (${i.category})`).join(", ")}.`
      : "All items are in refundable categories.");

  // R4 — one refund per order
  add("R4", "One refund per order", input.priorRefundCount > 0 ? "FAIL" : "PASS",
    input.priorRefundCount > 0 ? `Order already has ${input.priorRefundCount} refund(s) on record.` : "No prior refund on this order.");

  // R5 — high-value escalation
  add("R5", `High-value escalation (≥ $${threshold})`, amount >= threshold ? "ESCALATE" : "PASS",
    amount >= threshold ? `Refund amount $${amount} is at/above the $${threshold} threshold.` : `Refund amount $${amount} is below the $${threshold} threshold.`);

  // R6 — delivery status
  add("R6", "Delivered status", input.status !== "delivered" ? "FAIL" : "PASS",
    input.status !== "delivered" ? `Order status is "${input.status}", not delivered.` : "Order is delivered.");

  // R7 — missing/invalid data
  const missingData = input.status === "delivered" && input.deliveryDate === null;
  add("R7", "Data completeness", missingData ? "ESCALATE" : "PASS",
    missingData ? "Order is delivered but has no delivery date on file." : "Required data is present.");

  // Goodwill grace (gold/vip only)
  const graceApplies =
    (input.loyaltyTier === "gold" || input.loyaltyTier === "vip") &&
    daysSinceDelivery !== null &&
    daysSinceDelivery > windowDays &&
    daysSinceDelivery <= windowDays + grace;
  add("R8", `Goodwill grace (${grace}d, gold/vip)`, graceApplies ? "ESCALATE" : "NA",
    graceApplies
      ? `${daysSinceDelivery! - windowDays}d past window but within the ${grace}d grace — needs human goodwill review.`
      : "Not applicable.");

  // Precedence: hard denials → escalations → window → eligible.
  const hardDeny =
    input.isFinalSale ||
    nonRefundableItems.length > 0 ||
    input.priorRefundCount > 0 ||
    input.status !== "delivered";

  let recommendation: Recommendation;
  let summary: string;

  if (hardDeny) {
    recommendation = "INELIGIBLE";
    const reason = rules.find((r) => ["R2", "R3", "R4", "R6"].includes(r.id) && r.status === "FAIL")!;
    summary = `INELIGIBLE — ${reason.id}: ${reason.detail}`;
  } else if (missingData) {
    recommendation = "ESCALATE";
    summary = "ESCALATE — R7: delivered order is missing its delivery date; route to a human.";
  } else if (amount >= threshold) {
    recommendation = "ESCALATE";
    summary = `ESCALATE — R5: refund amount $${amount} ≥ $${threshold} threshold.`;
  } else if (graceApplies) {
    recommendation = "ESCALATE";
    summary = `ESCALATE — R8: goodwill grace for ${input.loyaltyTier} customer ${daysSinceDelivery! - windowDays}d past window.`;
  } else if (daysSinceDelivery !== null && daysSinceDelivery > windowDays) {
    recommendation = "INELIGIBLE";
    summary = `INELIGIBLE — R1: ${daysSinceDelivery}d past the ${windowDays}d window.`;
  } else {
    recommendation = "ELIGIBLE";
    summary = `ELIGIBLE — within window; up to $${input.orderTotal} refundable.`;
  }

  return {
    orderId: input.orderId,
    recommendation,
    maxRefundable: input.orderTotal,
    daysSinceDelivery,
    windowDays,
    rules,
    summary,
  };
}
