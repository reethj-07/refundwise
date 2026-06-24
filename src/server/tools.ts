// Backend tool implementations. Each is a real, typed function the agent can
// call. Authorization is enforced here: once lookupCustomer binds a customer to
// the conversation, every other tool only touches that customer's data — no
// cross-customer leakage. issueRefund re-runs the deterministic evaluator as
// defense-in-depth so the agent can never approve an ineligible / over-threshold
// / duplicate refund, regardless of what the LLM "decides".

import { prisma } from "@/lib/db";
import { config } from "@/lib/config";
import { getPolicy } from "@/lib/policy";
import { evaluateEligibility } from "@/agent/eligibility";
import type { LoyaltyTier, OrderStatus } from "@/lib/types";

export interface ToolContext {
  conversationId: string;
  /** Internal Customer.id, set once lookupCustomer succeeds. */
  resolvedCustomerId: string | null;
}

const DAY = 86_400_000;
const daysSince = (d: Date | null): number | null =>
  d ? Math.floor((Date.now() - d.getTime()) / DAY) : null;

type OrderWithRels = {
  orderId: string;
  orderTotal: number;
  orderDate: Date;
  deliveryDate: Date | null;
  status: string;
  isFinalSale: boolean;
  items: { name: string; category: string; price: number; qty: number }[];
  refunds: { amount: number; reason: string; kind: string; createdAt: Date }[];
};

function orderSummary(o: OrderWithRels) {
  return {
    orderId: o.orderId,
    status: o.status,
    orderTotal: o.orderTotal,
    orderDate: o.orderDate.toISOString().slice(0, 10),
    deliveryDate: o.deliveryDate ? o.deliveryDate.toISOString().slice(0, 10) : null,
    daysSinceDelivery: daysSince(o.deliveryDate),
    isFinalSale: o.isFinalSale,
    alreadyRefunded: o.refunds.some((r) => r.kind === "issued"),
    items: o.items.map((i) => ({
      name: i.name,
      category: i.category,
      price: i.price,
      qty: i.qty,
    })),
  };
}

async function findOwnedOrder(ctx: ToolContext, orderId: string) {
  if (!ctx.resolvedCustomerId) return null;
  return prisma.order.findFirst({
    where: { orderId: orderId.trim(), customerId: ctx.resolvedCustomerId },
    include: { items: true, refunds: true, customer: true },
  });
}

// ── lookupCustomer ───────────────────────────────────────────────────────────
export async function lookupCustomer(
  ctx: ToolContext,
  args: { emailOrId: string },
) {
  const q = args.emailOrId.trim();
  const customer = await prisma.customer.findFirst({
    where: {
      OR: [{ email: q.toLowerCase() }, { customerId: q }, { customerId: q.toUpperCase() }],
    },
    include: { orders: { include: { items: true, refunds: true } } },
  });

  if (!customer) {
    return {
      found: false,
      message: `No customer found for "${args.emailOrId}". Politely ask the customer to double-check their email address or customer ID.`,
    };
  }

  // Bind the customer to this conversation (authorization context).
  ctx.resolvedCustomerId = customer.id;
  await prisma.conversation.update({
    where: { id: ctx.conversationId },
    data: { customerId: customer.id, customerRef: args.emailOrId },
  });

  return {
    found: true,
    customer: {
      customerId: customer.customerId,
      name: customer.name,
      email: customer.email,
      loyaltyTier: customer.loyaltyTier,
      accountCreatedAt: customer.accountCreatedAt.toISOString().slice(0, 10),
      orderCount: customer.orders.length,
      orders: customer.orders.map(orderSummary),
    },
  };
}

// ── listOrders ───────────────────────────────────────────────────────────────
export async function listOrders(ctx: ToolContext, _args: Record<string, never>) {
  if (!ctx.resolvedCustomerId) {
    return { error: "Identify the customer first with lookupCustomer." };
  }
  const orders = await prisma.order.findMany({
    where: { customerId: ctx.resolvedCustomerId },
    include: { items: true, refunds: true },
    orderBy: { orderDate: "desc" },
  });
  return { orders: orders.map(orderSummary) };
}

// ── getOrder ─────────────────────────────────────────────────────────────────
export async function getOrder(ctx: ToolContext, args: { orderId: string }) {
  if (!ctx.resolvedCustomerId) {
    return { error: "Identify the customer first with lookupCustomer." };
  }
  const order = await findOwnedOrder(ctx, args.orderId);
  if (!order) {
    return {
      found: false,
      message: `No order "${args.orderId}" found for this customer. Ask them to confirm the order ID, or use listOrders.`,
    };
  }
  return { found: true, order: orderSummary(order) };
}

// ── getRefundPolicy ──────────────────────────────────────────────────────────
export async function getRefundPolicy(
  _ctx: ToolContext,
  args: { topic?: string },
) {
  return { topic: args.topic ?? "full policy", policy: getPolicy(args.topic) };
}

// ── checkRefundEligibility (the spine) ───────────────────────────────────────
export async function checkRefundEligibility(
  ctx: ToolContext,
  args: { orderId: string },
) {
  if (!ctx.resolvedCustomerId) {
    return { error: "Identify the customer first with lookupCustomer." };
  }
  const order = await findOwnedOrder(ctx, args.orderId);
  if (!order) {
    return {
      found: false,
      message: `No order "${args.orderId}" found for this customer.`,
    };
  }
  const result = evaluateEligibility({
    orderId: order.orderId,
    loyaltyTier: order.customer.loyaltyTier as LoyaltyTier,
    status: order.status as OrderStatus,
    isFinalSale: order.isFinalSale,
    deliveryDate: order.deliveryDate,
    orderTotal: order.orderTotal,
    items: order.items.map((i) => ({
      name: i.name,
      category: i.category,
      price: i.price,
      qty: i.qty,
    })),
    priorRefundCount: order.refunds.length,
  });
  return { found: true, eligibility: result };
}

// ── issueRefund (APPROVE) — guarded ──────────────────────────────────────────
export async function issueRefund(
  ctx: ToolContext,
  args: { orderId: string; amount: number; reason: string },
) {
  if (!ctx.resolvedCustomerId) {
    return { ok: false, error: "Identify the customer first with lookupCustomer." };
  }
  const order = await findOwnedOrder(ctx, args.orderId);
  if (!order) {
    return { ok: false, error: `No order "${args.orderId}" found for this customer.` };
  }

  // Defense-in-depth: re-evaluate against the requested amount.
  const evalResult = evaluateEligibility({
    orderId: order.orderId,
    loyaltyTier: order.customer.loyaltyTier as LoyaltyTier,
    status: order.status as OrderStatus,
    isFinalSale: order.isFinalSale,
    deliveryDate: order.deliveryDate,
    orderTotal: order.orderTotal,
    items: order.items.map((i) => ({
      name: i.name,
      category: i.category,
      price: i.price,
      qty: i.qty,
    })),
    priorRefundCount: order.refunds.length,
    requestedAmount: args.amount,
  });

  if (order.refunds.some((r) => r.kind === "issued")) {
    return { ok: false, error: "This order has already been refunded (R4: one refund per order)." };
  }
  if (args.amount <= 0) {
    return { ok: false, error: "Refund amount must be positive." };
  }
  if (args.amount > order.orderTotal) {
    return {
      ok: false,
      error: `Amount $${args.amount} exceeds the order total $${order.orderTotal}.`,
    };
  }
  if (args.amount >= config.highValueThreshold) {
    return {
      ok: false,
      error: `Amount $${args.amount} is at/above the $${config.highValueThreshold} threshold (R5) and must be escalated, not auto-approved.`,
      mustEscalate: true,
    };
  }
  if (evalResult.recommendation !== "ELIGIBLE") {
    return {
      ok: false,
      error: `Order is not eligible for an automatic refund. ${evalResult.summary}`,
      recommendation: evalResult.recommendation,
    };
  }

  const refund = await prisma.refund.create({
    data: { orderId: order.id, amount: args.amount, reason: args.reason, kind: "issued" },
  });

  const citedRules = evalResult.rules
    .filter((r) => r.status === "PASS")
    .map((r) => r.id);

  await prisma.conversation.update({
    where: { id: ctx.conversationId },
    data: {
      status: "APPROVED",
      verdictAmount: args.amount,
      citedRules: JSON.stringify(citedRules),
      explanation: args.reason,
    },
  });

  return {
    ok: true,
    status: "APPROVED",
    refundId: refund.id,
    orderId: order.orderId,
    amount: args.amount,
    citedRules,
  };
}

// ── denyRefund (DENY) ────────────────────────────────────────────────────────
export async function denyRefund(
  ctx: ToolContext,
  args: { orderId?: string; reason: string; citedRuleIds?: string[] },
) {
  await prisma.conversation.update({
    where: { id: ctx.conversationId },
    data: {
      status: "DENIED",
      citedRules: JSON.stringify(args.citedRuleIds ?? []),
      explanation: args.reason,
    },
  });
  return { ok: true, status: "DENIED", orderId: args.orderId, citedRules: args.citedRuleIds ?? [] };
}

// ── escalateToHuman (ESCALATE) ───────────────────────────────────────────────
export async function escalateToHuman(
  ctx: ToolContext,
  args: { reason: string; citedRuleIds?: string[] },
) {
  await prisma.conversation.update({
    where: { id: ctx.conversationId },
    data: {
      status: "ESCALATED",
      citedRules: JSON.stringify(args.citedRuleIds ?? []),
      explanation: args.reason,
    },
  });
  return { ok: true, status: "ESCALATED", citedRules: args.citedRuleIds ?? [] };
}
