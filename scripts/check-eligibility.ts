// Dev aid: runs the deterministic evaluator against every seeded order and
// prints the recommendation, so you can eyeball the spine against the 15
// designed scenarios. Run: npx tsx scripts/check-eligibility.ts

import { config as loadEnv } from "dotenv";
loadEnv({ path: ".env.local" });
loadEnv();

import { prisma } from "../src/lib/db";
import { evaluateEligibility } from "../src/agent/eligibility";
import type { LoyaltyTier, OrderStatus } from "../src/lib/types";

async function main() {
  const customers = await prisma.customer.findMany({
    include: { orders: { include: { items: true, refunds: true } } },
    orderBy: { customerId: "asc" },
  });

  for (const c of customers) {
    for (const o of c.orders) {
      const res = evaluateEligibility({
        orderId: o.orderId,
        loyaltyTier: c.loyaltyTier as LoyaltyTier,
        status: o.status as OrderStatus,
        isFinalSale: o.isFinalSale,
        deliveryDate: o.deliveryDate,
        orderTotal: o.orderTotal,
        items: o.items.map((i) => ({
          name: i.name,
          category: i.category,
          price: i.price,
          qty: i.qty,
        })),
        priorRefundCount: o.refunds.length,
      });
      console.log(
        `${c.customerId} ${c.loyaltyTier.padEnd(8)} ${o.orderId.padEnd(11)} -> ${res.recommendation.padEnd(11)} | ${res.summary}`,
      );
    }
  }
  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
