// Dev aid: exercises issueRefund's server-side guard directly (bypassing the LLM)
// to prove defense-in-depth — cross-customer scoping, idempotency (R4), INELIGIBLE
// override rejection, and the partial-amount / high-value gaps. Run:
//   npx tsx scripts/guard-test.ts
import { config as loadEnv } from "dotenv";
loadEnv({ path: ".env.local" });
loadEnv();

async function main() {
  const { prisma } = await import("../src/lib/db");
  const { issueRefund } = await import("../src/server/tools");
  type ToolContext = import("../src/server/tools").ToolContext;

  const idOf = async (customerId: string) =>
    (await prisma.customer.findFirst({ where: { customerId } }))!.id;
  const itemsOf = async (orderId: string) => {
    const o = await prisma.order.findFirst({ where: { orderId }, include: { items: true } });
    return o!.items;
  };

  const ctxFor = async (customerId: string): Promise<ToolContext> => {
    const convo = await prisma.conversation.create({ data: {} });
    return { conversationId: convo.id, resolvedCustomerId: await idOf(customerId) };
  };

  const show = (label: string, r: { ok?: boolean }, wantOk: boolean) => {
    const pass = !!r.ok === wantOk;
    console.log(`  [${pass ? "PASS" : "FAIL"}] ${label}\n         -> ${JSON.stringify(r).slice(0, 180)}`);
    if (!pass) process.exitCode = 1;
  };

  console.log("\n=== issueRefund guard (defense-in-depth) ===");

  // #3 — partial $499 on the high-value $850 ORD-1008 must be REJECTED/escalated.
  {
    const ctx = await ctxFor("CUST-008");
    const tvItems = await itemsOf("ORD-1008");
    const r = await issueRefund(ctx, {
      orderId: "ORD-1008",
      amount: 499,
      reason: "partial",
      items: [{ itemId: tvItems[0].id, qty: 1 }],
    });
    show("$499 partial on high-value ORD-1008 → rejected (mustEscalate)", r, false);
  }

  // #3 — arbitrary partial amount NOT tied to any item subset must be rejected.
  {
    const ctx = await ctxFor("CUST-001");
    const r = await issueRefund(ctx, { orderId: "ORD-1001", amount: 37, reason: "arbitrary partial" });
    show("$37 arbitrary partial (no items) on $60 ORD-1001 → rejected", r, false);
  }

  // #3 — legitimate partial: liam returns the $45 Cork Yoga Mat from ORD-1012.
  {
    const ctx = await ctxFor("CUST-012");
    const items = await itemsOf("ORD-1012");
    const mat = items.find((i) => i.name.includes("Yoga Mat"))!;
    const r = await issueRefund(ctx, {
      orderId: "ORD-1012",
      amount: 45,
      reason: "Returned Cork Yoga Mat",
      items: [{ itemId: mat.id, qty: 1 }],
    });
    show("$45 yoga-mat partial on ORD-1012 → APPROVED", r, true);
  }

  // Full refund still works (chloe ORD-1003, $130).
  {
    const ctx = await ctxFor("CUST-003");
    const r = await issueRefund(ctx, { orderId: "ORD-1003", amount: 130, reason: "Full refund" });
    show("$130 full refund on ORD-1003 → APPROVED", r, true);
  }

  console.log("\n=== Regression guardrails (must still hold) ===");

  // Cross-customer refusal: diego's ctx may not touch henry's order.
  {
    const ctx = await ctxFor("CUST-004");
    const r = await issueRefund(ctx, { orderId: "ORD-1008", amount: 100, reason: "cross-customer" });
    show("cross-customer: diego issuing on henry's ORD-1008 → refused", r, false);
  }

  // Idempotency R4: ORD-1007 already has a prior refund.
  {
    const ctx = await ctxFor("CUST-007");
    const r = await issueRefund(ctx, { orderId: "ORD-1007", amount: 110, reason: "double refund" });
    show("R4: second refund on already-refunded ORD-1007 → rejected", r, false);
  }

  // INELIGIBLE override: ORD-1004 is past window (R1) — must reject even if asked.
  {
    const ctx = await ctxFor("CUST-004");
    const r = await issueRefund(ctx, { orderId: "ORD-1004", amount: 80, reason: "override attempt" });
    show("INELIGIBLE override: full refund on out-of-window ORD-1004 → rejected", r, false);
  }

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
