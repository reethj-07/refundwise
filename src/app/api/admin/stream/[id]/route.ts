import type { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { parseCitedRules, stepToDTO } from "@/lib/serialize";
import type { ChatEvent, ConversationStatus } from "@/lib/types";
import { sseComment, sseData, sseHeaders, sleep } from "@/lib/sse";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Live admin tail. The DB is the event bus: poll ReasoningStep by a seq cursor
// and push new rows. Works identically locally and on serverless (no shared
// memory). The client (EventSource) dedupes by step id on reconnect.
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const encoder = new TextEncoder();

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let closed = false;
      const send = (ev: ChatEvent | string) => {
        if (closed) return;
        controller.enqueue(
          encoder.encode(typeof ev === "string" ? ev : sseData(ev)),
        );
      };
      const close = () => {
        if (closed) return;
        closed = true;
        clearInterval(heartbeat);
        try {
          controller.close();
        } catch {
          /* already closed */
        }
      };

      const heartbeat = setInterval(() => send(sseComment("hb")), 15_000);
      req.signal.addEventListener("abort", close);

      let cursor = -1;
      const deadline = Date.now() + 55_000; // stay under maxDuration; client reconnects

      try {
        while (!closed && Date.now() < deadline) {
          const steps = await prisma.reasoningStep.findMany({
            where: { conversationId: id, seq: { gt: cursor } },
            orderBy: { seq: "asc" },
          });
          for (const s of steps) {
            cursor = s.seq;
            send({ type: "step", step: stepToDTO(s) });
          }

          const convo = await prisma.conversation.findUnique({ where: { id } });
          if (!convo) {
            send({ type: "error", message: "Conversation not found." });
            break;
          }
          if (convo.status !== "OPEN" && steps.length === 0) {
            send({
              type: "verdict",
              status: convo.status as ConversationStatus,
              amount: convo.verdictAmount ?? null,
              citedRules: parseCitedRules(convo.citedRules),
              explanation: convo.explanation ?? "",
            });
            send({ type: "done" });
            break;
          }
          await sleep(750);
        }
      } finally {
        close();
      }
    },
  });

  return new Response(stream, { headers: sseHeaders });
}
