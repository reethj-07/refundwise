// The agent loop — a manual Claude-style tool-calling loop (no SDK tool-runner)
// so every step (model text, tool call, tool result, decision) can be recorded
// and streamed. Provider-agnostic: each model turn goes through the LLM router
// (Gemini → Groq fallback).

import { config } from "@/lib/config";
import { generate } from "@/lib/llm";
import type { LlmMessage } from "@/lib/llm/types";
import { buildSystemPrompt } from "./systemPrompt";
import { dispatchTool, toolSchemas } from "./tools";
import { escalateToHuman, type ToolContext } from "@/server/tools";
import type { ConversationStatus } from "@/lib/types";

export type StepRecord =
  | { type: "model_text"; provider: string; content: string }
  | { type: "tool_call"; name: string; provider: string; args: unknown }
  | { type: "tool_result"; name: string; result: unknown; isError: boolean }
  | { type: "decision"; status: ConversationStatus; content: string }
  | { type: "error"; content: string };

export interface RunAgentOptions {
  conversationId: string;
  resolvedCustomerId: string | null;
  /** The conversation's current status, so a follow-up on an already-resolved
   *  conversation never re-decides or clobbers the existing verdict. */
  initialStatus: ConversationStatus;
  /** Prior turns as plain text (user/assistant). */
  history: LlmMessage[];
  userText: string;
  record: (step: StepRecord) => Promise<void>;
  signal?: AbortSignal;
}

export interface RunAgentResult {
  finalText: string;
  status: ConversationStatus;
  /** True only when this turn actually produced/changed a verdict (a terminal
   *  tool fired, or the genuine max-iterations escalation). Lets the caller avoid
   *  emitting a misleading verdict event on conversational turns. */
  resolvedThisTurn: boolean;
}

const isRecord = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === "object";

export async function runAgent(opts: RunAgentOptions): Promise<RunAgentResult> {
  const ctx: ToolContext = {
    conversationId: opts.conversationId,
    resolvedCustomerId: opts.resolvedCustomerId,
  };
  const system = buildSystemPrompt();
  const messages: LlmMessage[] = [
    ...opts.history,
    { role: "user", text: opts.userText },
  ];

  let finalText = "";

  // A conversation that's already resolved (APPROVED/DENIED/ESCALATED) is locked:
  // its verdict must never be re-decided or clobbered by a follow-up turn. An OPEN
  // conversation starts unlocked. `lockedStatus` doubles as the within-turn guard
  // that stops a SECOND terminal action from overwriting the first.
  const alreadyResolved = opts.initialStatus !== "OPEN";
  let lockedStatus: ConversationStatus | null = alreadyResolved ? opts.initialStatus : null;
  let resolvedThisTurn = false;

  // Did the loop run out of road (exhaust every iteration) rather than the model
  // ending its turn with a plain message? Only a genuine exhaustion auto-escalates.
  let exhaustedIterations = true;

  for (let iter = 0; iter < config.maxIterations; iter++) {
    const turn = await generate({ system, tools: toolSchemas, messages, signal: opts.signal });

    if (turn.note) {
      await opts.record({ type: "error", content: turn.note });
    }
    if (turn.text) {
      finalText = turn.text;
      await opts.record({ type: "model_text", provider: turn.provider, content: turn.text });
    }

    // No tool calls → the model is done talking for this turn (greeting, clarifying
    // question, "account not found", post-resolution thanks, or a stated verdict).
    if (turn.toolCalls.length === 0) {
      messages.push({ role: "assistant", text: turn.text });
      exhaustedIterations = false;
      break;
    }

    // Echo the assistant turn (text + tool calls) before the results.
    messages.push({
      role: "assistant",
      text: turn.text || undefined,
      toolCalls: turn.toolCalls,
    });

    for (const call of turn.toolCalls) {
      await opts.record({
        type: "tool_call",
        name: call.name,
        provider: turn.provider,
        args: call.args,
      });

      // Guardrail: don't let a terminal action overwrite an existing verdict —
      // whether it was set earlier this turn or in a prior turn (once resolved,
      // stays resolved).
      const isTerminalName = ["issueRefund", "denyRefund", "escalateToHuman"].includes(
        call.name,
      );
      if (lockedStatus && isTerminalName) {
        const blocked = {
          error: `Already resolved as ${lockedStatus}. No further terminal action allowed.`,
        };
        await opts.record({ type: "tool_result", name: call.name, result: blocked, isError: true });
        messages.push({
          role: "tool",
          toolCallId: call.id,
          name: call.name,
          content: JSON.stringify(blocked),
        });
        continue;
      }

      const dispatched = await dispatchTool(ctx, call.name, call.args);
      await opts.record({
        type: "tool_result",
        name: call.name,
        result: dispatched.result,
        isError: dispatched.isError,
      });
      messages.push({
        role: "tool",
        toolCallId: call.id,
        name: call.name,
        content: JSON.stringify(dispatched.result),
      });

      if (dispatched.terminal && isRecord(dispatched.result) && dispatched.result.ok) {
        lockedStatus = dispatched.result.status as ConversationStatus;
        resolvedThisTurn = true;
      }
    }
  }

  // Auto-escalate ONLY when the loop genuinely ran out of road: it burned through
  // every iteration without resolving, AND the conversation is still OPEN. A normal
  // turn that ends with a plain assistant message (greeting, clarification, "account
  // not found", post-resolution thanks) does NOT reach here, and a follow-up on an
  // already-resolved conversation is never re-decided.
  if (exhaustedIterations && !resolvedThisTurn && !alreadyResolved) {
    await opts.record({
      type: "error",
      content: "No terminal action was taken within the step limit — auto-escalating to a human.",
    });
    await escalateToHuman(ctx, {
      reason: "Routed to a human reviewer — the assistant did not reach an automated resolution.",
      citedRuleIds: [],
    });
    if (!finalText) {
      finalText =
        "I've routed your request to a human reviewer who will follow up with you shortly.";
    }
    await opts.record({ type: "decision", status: "ESCALATED", content: finalText });
    return { finalText, status: "ESCALATED", resolvedThisTurn: true };
  }

  // Only emit a decision step when this turn actually resolved something; a plain
  // conversational turn leaves the existing status untouched and emits no verdict.
  if (resolvedThisTurn && lockedStatus) {
    await opts.record({ type: "decision", status: lockedStatus, content: finalText });
    return { finalText, status: lockedStatus, resolvedThisTurn: true };
  }

  return { finalText, status: opts.initialStatus, resolvedThisTurn: false };
}
