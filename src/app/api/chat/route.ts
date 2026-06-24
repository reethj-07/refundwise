import type { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { runAgent, type StepRecord } from "@/agent/loop";
import { llmConfigured } from "@/lib/llm";
import type { LlmMessage } from "@/lib/llm/types";
import type { ChatEvent, ConversationStatus } from "@/lib/types";
import { parseCitedRules, stepToDTO } from "@/lib/serialize";
import { sseData, sseHeaders } from "@/lib/sse";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

function stepFields(step: StepRecord): {
  name: string | null;
  provider: string | null;
  payload: unknown;
} {
  switch (step.type) {
    case "model_text":
      return { name: null, provider: step.provider, payload: { content: step.content } };
    case "tool_call":
      return { name: step.name, provider: step.provider, payload: { args: step.args } };
    case "tool_result":
      return { name: step.name, provider: null, payload: { result: step.result, isError: step.isError } };
    case "decision":
      return { name: null, provider: null, payload: { status: step.status, content: step.content } };
    case "error":
      return { name: null, provider: null, payload: { content: step.content } };
  }
}

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as {
    message?: string;
    conversationId?: string;
  };
  const message = (body.message ?? "").toString().trim();

  if (!message) {
    return Response.json({ error: "A message is required." }, { status: 400 });
  }
  if (!llmConfigured()) {
    return Response.json(
      {
        error:
          "No LLM provider is configured. Add a free GEMINI_API_KEY (and/or GROQ_API_KEY) to .env.local.",
      },
      { status: 503 },
    );
  }

  // Find or create the conversation.
  let conversation = body.conversationId
    ? await prisma.conversation.findUnique({
        where: { id: body.conversationId },
        include: { messages: { orderBy: { createdAt: "asc" } } },
      })
    : null;
  if (!conversation) {
    conversation = await prisma.conversation.create({
      data: {},
      include: { messages: { orderBy: { createdAt: "asc" } } },
    });
  }
  const conversationId = conversation.id;
  const boundCustomerId = conversation.customerId ?? null;
  const initialStatus = (conversation.status ?? "OPEN") as ConversationStatus;

  const history: LlmMessage[] = conversation.messages.map((m) =>
    m.role === "assistant"
      ? { role: "assistant", text: m.content }
      : { role: "user", text: m.content },
  );

  await prisma.message.create({
    data: { conversationId, role: "user", content: message },
  });

  let seq = await prisma.reasoningStep.count({ where: { conversationId } });
  const encoder = new TextEncoder();

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let closed = false;
      const send = (ev: ChatEvent) => {
        if (!closed) controller.enqueue(encoder.encode(sseData(ev)));
      };

      const record = async (step: StepRecord) => {
        const { name, provider, payload } = stepFields(step);
        const row = await prisma.reasoningStep.create({
          data: {
            conversationId,
            seq: seq++,
            type: step.type,
            name,
            payload: JSON.stringify(payload),
            provider,
          },
        });
        send({ type: "step", step: stepToDTO(row) });
      };

      send({ type: "conversation", conversationId });

      try {
        const result = await runAgent({
          conversationId,
          resolvedCustomerId: boundCustomerId,
          initialStatus,
          history,
          userText: message,
          record,
          signal: req.signal,
        });

        await prisma.message.create({
          data: { conversationId, role: "assistant", content: result.finalText },
        });
        send({ type: "assistant", content: result.finalText });

        // Only push a verdict when this turn actually decided something. A
        // conversational turn (greeting, clarification, post-resolution thanks)
        // leaves the stored verdict untouched, so re-emitting it would be misleading.
        if (result.resolvedThisTurn) {
          const convo = await prisma.conversation.findUnique({ where: { id: conversationId } });
          send({
            type: "verdict",
            status: (convo?.status ?? result.status) as ConversationStatus,
            amount: convo?.verdictAmount ?? null,
            citedRules: parseCitedRules(convo?.citedRules ?? null),
            explanation: convo?.explanation ?? result.finalText,
          });
        }
      } catch (err) {
        send({ type: "error", message: err instanceof Error ? err.message : String(err) });
      } finally {
        send({ type: "done" });
        closed = true;
        try {
          controller.close();
        } catch {
          /* already closed */
        }
      }
    },
  });

  return new Response(stream, { headers: sseHeaders });
}
