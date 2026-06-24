import { prisma } from "@/lib/db";
import { parseCitedRules, type ConversationSummary } from "@/lib/serialize";
import type { ConversationStatus } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const conversations = await prisma.conversation.findMany({
    orderBy: { updatedAt: "desc" },
    include: {
      customer: true,
      messages: { orderBy: { createdAt: "asc" }, take: 1 },
      _count: { select: { steps: true, messages: true } },
    },
  });

  const data: ConversationSummary[] = conversations.map((c) => ({
    id: c.id,
    status: c.status as ConversationStatus,
    customerRef: c.customerRef,
    customerName: c.customer?.name ?? null,
    verdictAmount: c.verdictAmount,
    citedRules: parseCitedRules(c.citedRules),
    firstMessage: c.messages[0]?.content ?? null,
    stepCount: c._count.steps,
    messageCount: c._count.messages,
    createdAt: c.createdAt.toISOString(),
    updatedAt: c.updatedAt.toISOString(),
  }));

  return Response.json({ conversations: data });
}
