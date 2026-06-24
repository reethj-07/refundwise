import { prisma } from "@/lib/db";
import { parseCitedRules, stepToDTO } from "@/lib/serialize";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const c = await prisma.conversation.findUnique({
    where: { id },
    include: {
      customer: true,
      messages: { orderBy: { createdAt: "asc" } },
      steps: { orderBy: { seq: "asc" } },
    },
  });

  if (!c) return new Response("Not found", { status: 404 });

  return Response.json({
    conversation: {
      id: c.id,
      status: c.status,
      customerRef: c.customerRef,
      customerName: c.customer?.name ?? null,
      customerEmail: c.customer?.email ?? null,
      loyaltyTier: c.customer?.loyaltyTier ?? null,
      verdictAmount: c.verdictAmount,
      citedRules: parseCitedRules(c.citedRules),
      explanation: c.explanation,
      createdAt: c.createdAt.toISOString(),
      updatedAt: c.updatedAt.toISOString(),
      messages: c.messages.map((m) => ({
        id: m.id,
        role: m.role,
        content: m.content,
        createdAt: m.createdAt.toISOString(),
      })),
      steps: c.steps.map(stepToDTO),
    },
  });
}
