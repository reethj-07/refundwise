// Seeds the database from data/customers.json (the source of truth).
// Day-offsets are converted to absolute timestamps relative to seed time, so the
// scenarios stay valid whenever you (re-)seed. Idempotent: wipes and recreates.
//
// Run with: npm run db:seed   (or as part of: npm run db:setup)

import { config as loadEnv } from "dotenv";
loadEnv({ path: ".env.local" });
loadEnv();

import { readFileSync } from "node:fs";
import path from "node:path";
import { prisma } from "../src/lib/db";

const DAY = 86_400_000;
const now = Date.now();
const daysAgo = (n: number) => new Date(now - n * DAY);

interface RawItem {
  name: string;
  category: string;
  price: number;
  qty: number;
}
interface RawOrder {
  orderId: string;
  orderDateDaysAgo: number;
  deliveryDateDaysAgo: number | null;
  status: string;
  isFinalSale: boolean;
  items: RawItem[];
  priorRefunds?: { amount: number; reason: string }[];
}
interface RawCustomer {
  customerId: string;
  name: string;
  email: string;
  loyaltyTier: string;
  accountCreatedDaysAgo: number;
  orders: RawOrder[];
}

async function main() {
  const file = path.resolve(process.cwd(), "data", "customers.json");
  const { customers } = JSON.parse(readFileSync(file, "utf8")) as {
    customers: RawCustomer[];
  };

  // Idempotent reseed — wipe in FK-safe order.
  await prisma.reasoningStep.deleteMany();
  await prisma.message.deleteMany();
  await prisma.conversation.deleteMany();
  await prisma.refund.deleteMany();
  await prisma.orderItem.deleteMany();
  await prisma.order.deleteMany();
  await prisma.customer.deleteMany();

  for (const c of customers) {
    await prisma.customer.create({
      data: {
        customerId: c.customerId,
        name: c.name,
        email: c.email.toLowerCase(),
        loyaltyTier: c.loyaltyTier,
        accountCreatedAt: daysAgo(c.accountCreatedDaysAgo),
        orders: {
          create: c.orders.map((o) => ({
            orderId: o.orderId,
            orderTotal: o.items.reduce((s, i) => s + i.price * i.qty, 0),
            orderDate: daysAgo(o.orderDateDaysAgo),
            deliveryDate:
              o.deliveryDateDaysAgo == null ? null : daysAgo(o.deliveryDateDaysAgo),
            status: o.status,
            isFinalSale: o.isFinalSale,
            items: {
              create: o.items.map((i) => ({
                name: i.name,
                category: i.category,
                price: i.price,
                qty: i.qty,
              })),
            },
            refunds: {
              create: (o.priorRefunds ?? []).map((r) => ({
                amount: r.amount,
                reason: r.reason,
                kind: "prior",
              })),
            },
          })),
        },
      },
    });
  }

  const [customerCount, orderCount, itemCount, refundCount] = await Promise.all([
    prisma.customer.count(),
    prisma.order.count(),
    prisma.orderItem.count(),
    prisma.refund.count(),
  ]);

  console.log(
    `✅ Seeded ${customerCount} customers, ${orderCount} orders, ${itemCount} items, ${refundCount} prior refund(s).`,
  );
  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error("Seed failed:", e);
  await prisma.$disconnect();
  process.exit(1);
});
