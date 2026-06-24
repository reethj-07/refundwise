// Dev aid: drives runAgent through multi-turn conversations exactly like the
// chat route does (history reconstruction, bound customer, current status), then
// prints the stored verdict after each turn. Lets us reproduce/verify the
// auto-escalate bugs without a browser. Run: npx tsx scripts/agent-sim.ts [scenario]
import { config as loadEnv } from "dotenv";
loadEnv({ path: ".env.local" });
loadEnv();

// Dynamic imports AFTER env is loaded (ESM hoists static imports, which would
// evaluate src/lib/config before dotenv populated process.env).
async function main() {
  const { prisma } = await import("../src/lib/db");
  const { runAgent } = await import("../src/agent/loop");
  type StepRecord = import("../src/agent/loop").StepRecord;
  type LlmMessage = import("../src/lib/llm/types").LlmMessage;
  type ConversationStatus = import("../src/lib/types").ConversationStatus;

  async function turn(conversationId: string | null, message: string) {
    let conversation = conversationId
      ? await prisma.conversation.findUnique({
          where: { id: conversationId },
          include: { messages: { orderBy: { createdAt: "asc" } } },
        })
      : null;
    if (!conversation) {
      conversation = await prisma.conversation.create({
        data: {},
        include: { messages: { orderBy: { createdAt: "asc" } } },
      });
    }
    const cid = conversation.id;
    const history: LlmMessage[] = conversation.messages.map((m) =>
      m.role === "assistant"
        ? { role: "assistant", text: m.content }
        : { role: "user", text: m.content },
    );
    await prisma.message.create({ data: { conversationId: cid, role: "user", content: message } });

    const record: (step: StepRecord) => Promise<void> = async () => {};
    const result = await runAgent({
      conversationId: cid,
      resolvedCustomerId: conversation.customerId ?? null,
      initialStatus: conversation.status as ConversationStatus,
      history,
      userText: message,
      record,
    });
    await prisma.message.create({ data: { conversationId: cid, role: "assistant", content: result.finalText } });

    const convo = await prisma.conversation.findUnique({ where: { id: cid } });
    console.log(`\n  > USER: ${message}`);
    console.log(`  < BOT:  ${result.finalText.replace(/\s+/g, " ").slice(0, 180)}`);
    console.log(
      `  = DB:   status=${convo?.status} amount=${convo?.verdictAmount ?? "null"} citedRules=${convo?.citedRules ?? "[]"} (runAgent returned ${result.status})`,
    );
    return cid;
  }

  const scenario = process.argv[2] ?? "all";

  if (scenario === "bug1" || scenario === "all") {
    console.log("\n=== BUG-1: APPROVED then 'thank you' must stay APPROVED ===");
    const c = await turn(null, "Hi, I'm chloe.nguyen@example.com and I'd like a refund for order ORD-1003.");
    await turn(c, "thank you so much!");
  }

  if (scenario === "bug2" || scenario === "all") {
    console.log("\n=== BUG-2: diego ORD-1004 must DENY (R1), no spurious escalation ===");
    for (let i = 0; i < 5; i++) {
      await turn(null, "Hi, this is diego.ramirez@example.com — please refund order ORD-1004.");
    }
  }

  if (scenario === "bug5clar" || scenario === "all") {
    console.log("\n=== BUG-5a: mia vague request must ask which order, stay OPEN ===");
    await turn(null, "Hi, I'm mia.scott@example.com and I want a refund.");
  }

  if (scenario === "bug5unknown" || scenario === "all") {
    console.log("\n=== BUG-5b: unknown customer must refuse gracefully, stay OPEN ===");
    await turn(null, "Hello, my email is nobody@nowhere.com, I want a refund.");
  }

  if (scenario === "henry" || scenario === "all") {
    console.log("\n=== R5: henry ORD-1008 must ESCALATE ===");
    await turn(null, "Hi, I'm henry.patel@example.com, please refund ORD-1008 ($850 TV).");
  }

  if (scenario === "liam" || scenario === "all") {
    console.log("\n=== Partial: liam ORD-1012 return just the $45 yoga mat ===");
    await turn(null, "Hi, liam.foster@example.com here. I want to return just the Cork Yoga Mat from ORD-1012 for a refund.");
  }

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
