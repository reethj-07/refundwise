// LLM-facing tool registry: one provider-agnostic JSON Schema per tool, a Zod
// schema for runtime validation, and a dispatcher with guardrails (unknown tool,
// bad arguments, thrown errors). The LLM layer converts `parameters` to each
// provider's function-declaration format.

import { z } from "zod";
import type { ToolContext } from "@/server/tools";
import * as impl from "@/server/tools";

export interface ToolDef {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
  zod: z.ZodTypeAny;
  /** True for the three resolving tools that set the final verdict. */
  terminal: boolean;
  handler: (ctx: ToolContext, args: unknown) => Promise<unknown>;
}

const obj = (
  properties: Record<string, unknown>,
  required: string[] = [],
): Record<string, unknown> => ({ type: "object", properties, required });

const str = (description: string) => ({ type: "string", description });

export const tools: ToolDef[] = [
  {
    name: "lookupCustomer",
    description:
      "Identify the customer by email or customer ID. Call this FIRST, before discussing any order. Returns the customer profile and a summary of their orders. Required before any other tool will return data.",
    parameters: obj({ emailOrId: str("The customer's email address or customer ID (e.g. CUST-001).") }, ["emailOrId"]),
    zod: z.object({ emailOrId: z.string().min(1) }),
    terminal: false,
    handler: (ctx, a) => impl.lookupCustomer(ctx, a as { emailOrId: string }),
  },
  {
    name: "listOrders",
    description:
      "List all orders for the identified customer (id, status, total, dates, items). Call this when the customer hasn't given a specific order ID or you need to choose among several orders.",
    parameters: obj({}),
    zod: z.object({}),
    terminal: false,
    handler: (ctx) => impl.listOrders(ctx),
  },
  {
    name: "getOrder",
    description:
      "Fetch full details for one of the identified customer's orders by order ID. Only returns orders that belong to this customer.",
    parameters: obj({ orderId: str("The order ID, e.g. ORD-1001.") }, ["orderId"]),
    zod: z.object({ orderId: z.string().min(1) }),
    terminal: false,
    handler: (ctx, a) => impl.getOrder(ctx, a as { orderId: string }),
  },
  {
    name: "getRefundPolicy",
    description:
      "Retrieve the refund policy text. Pass an optional topic (e.g. 'window', 'final sale', 'high value', 'category', 'grace') to get the most relevant section(s); omit it for the full policy.",
    parameters: obj({ topic: str("Optional topic to focus on (e.g. 'return window', 'final sale').") }),
    zod: z.object({ topic: z.string().optional() }),
    terminal: false,
    handler: (ctx, a) => impl.getRefundPolicy(ctx, a as { topic?: string }),
  },
  {
    name: "checkRefundEligibility",
    description:
      "Run the deterministic policy evaluator for one order. Returns a per-rule pass/fail/escalate breakdown, an overall recommendation (ELIGIBLE | INELIGIBLE | ESCALATE) and the maximum refundable amount. You MUST call this for the specific order before issuing, denying, or escalating.",
    parameters: obj({ orderId: str("The order ID to evaluate, e.g. ORD-1001.") }, ["orderId"]),
    zod: z.object({ orderId: z.string().min(1) }),
    terminal: false,
    handler: (ctx, a) => impl.checkRefundEligibility(ctx, a as { orderId: string }),
  },
  {
    name: "issueRefund",
    description:
      "APPROVE and record a refund for an eligible order. For a FULL refund, set amount to the order total and omit items. For a PARTIAL refund (the customer returns only some items), pass the returned items as { itemId, qty } using the itemId values from the order details, and set amount to the exact sum of price×qty of those items. Re-validated against policy: rejected if the order is ineligible, already refunded, the order total or amount is at/above the escalation threshold (escalate instead), or the amount doesn't match the full total / the specified returned items.",
    parameters: obj(
      {
        orderId: str("The order ID to refund."),
        amount: { type: "number", description: "Refund amount in USD: the order total for a full refund, or the sum of price×qty of the returned items for a partial." },
        reason: str("Short customer-facing reason / note for the refund."),
        items: {
          type: "array",
          description: "For a PARTIAL refund only: the returned items. Omit for a full refund.",
          items: obj(
            {
              itemId: str("The itemId of a returned item, taken from the order details."),
              qty: { type: "integer", description: "How many of this item are being returned (≤ the quantity on the order)." },
            },
            ["itemId", "qty"],
          ),
        },
      },
      ["orderId", "amount", "reason"],
    ),
    zod: z.object({
      orderId: z.string().min(1),
      amount: z.number().positive(),
      reason: z.string().min(1),
      items: z.array(z.object({ itemId: z.string().min(1), qty: z.number().int().positive() })).optional(),
    }),
    terminal: true,
    handler: (ctx, a) =>
      impl.issueRefund(ctx, a as { orderId: string; amount: number; reason: string; items?: { itemId: string; qty: number }[] }),
  },
  {
    name: "denyRefund",
    description:
      "DENY a refund request. Use when the eligibility check is INELIGIBLE. Cite the specific failing rule id(s) (e.g. R1, R2).",
    parameters: obj(
      {
        orderId: str("The order ID being denied (if known)."),
        reason: str("Clear, empathetic customer-facing explanation of the denial."),
        citedRuleIds: { type: "array", items: { type: "string" }, description: "Policy rule id(s) that drove the denial, e.g. ['R1']." },
      },
      ["reason"],
    ),
    zod: z.object({
      orderId: z.string().optional(),
      reason: z.string().min(1),
      citedRuleIds: z.array(z.string()).optional(),
    }),
    terminal: true,
    handler: (ctx, a) => impl.denyRefund(ctx, a as { orderId?: string; reason: string; citedRuleIds?: string[] }),
  },
  {
    name: "escalateToHuman",
    description:
      "ESCALATE to a human reviewer. Use when the eligibility check is ESCALATE (high value, missing data, or goodwill grace), or when data is ambiguous. Cite the relevant rule id(s).",
    parameters: obj(
      {
        reason: str("Why this needs a human (customer-facing tone)."),
        citedRuleIds: { type: "array", items: { type: "string" }, description: "Relevant policy rule id(s), e.g. ['R5']." },
      },
      ["reason"],
    ),
    zod: z.object({ reason: z.string().min(1), citedRuleIds: z.array(z.string()).optional() }),
    terminal: true,
    handler: (ctx, a) => impl.escalateToHuman(ctx, a as { reason: string; citedRuleIds?: string[] }),
  },
];

export const toolByName = new Map(tools.map((t) => [t.name, t]));

export const toolSchemas = tools.map((t) => ({
  name: t.name,
  description: t.description,
  parameters: t.parameters,
}));

export interface DispatchResult {
  name: string;
  result: unknown;
  isError: boolean;
  terminal: boolean;
}

export async function dispatchTool(
  ctx: ToolContext,
  name: string,
  rawArgs: unknown,
): Promise<DispatchResult> {
  const tool = toolByName.get(name);
  if (!tool) {
    return {
      name,
      result: { error: `Unknown tool "${name}". Available tools: ${tools.map((t) => t.name).join(", ")}.` },
      isError: true,
      terminal: false,
    };
  }

  const parsed = tool.zod.safeParse(rawArgs ?? {});
  if (!parsed.success) {
    return {
      name,
      result: {
        error: `Invalid arguments for ${name}: ${parsed.error.issues
          .map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`)
          .join("; ")}`,
      },
      isError: true,
      terminal: false,
    };
  }

  try {
    const result = await tool.handler(ctx, parsed.data);
    const r = result as Record<string, unknown> | null;
    const isError = !!r && ("error" in r || r.ok === false || r.found === false);
    return { name, result, isError, terminal: tool.terminal && !isError };
  } catch (e) {
    return {
      name,
      result: { error: `Tool ${name} failed: ${(e as Error).message}` },
      isError: true,
      terminal: false,
    };
  }
}
