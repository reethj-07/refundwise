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
  /** Prior turns as plain text (user/assistant). */
  history: LlmMessage[];
  userText: string;
  record: (step: StepRecord) => Promise<void>;
  signal?: AbortSignal;
}

export interface RunAgentResult {
  finalText: string;
  status: ConversationStatus;
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
  let resolved: ConversationStatus | null = null;

  for (let iter = 0; iter < config.maxIterations; iter++) {
    const turn = await generate({ system, tools: toolSchemas, messages, signal: opts.signal });

    if (turn.note) {
      await opts.record({ type: "error", content: turn.note });
    }
    if (turn.text) {
      finalText = turn.text;
      await opts.record({ type: "model_text", provider: turn.provider, content: turn.text });
    }

    // No tool calls → the model is done talking for this turn.
    if (turn.toolCalls.length === 0) {
      messages.push({ role: "assistant", text: turn.text });
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

      // Guardrail: don't let a second terminal action overwrite the verdict.
      const isTerminalName = ["issueRefund", "denyRefund", "escalateToHuman"].includes(
        call.name,
      );
      if (resolved && isTerminalName) {
        const blocked = {
          error: `Already resolved as ${resolved}. No further terminal action allowed.`,
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
        resolved = dispatched.result.status as ConversationStatus;
      }
    }
  }

  // Guardrail: if the loop ended without a terminal action, auto-escalate.
  if (!resolved) {
    await opts.record({
      type: "error",
      content: "No terminal action was taken within the step limit — auto-escalating to a human.",
    });
    await escalateToHuman(ctx, {
      reason: "Routed to a human reviewer — the assistant did not reach an automated resolution.",
      citedRuleIds: [],
    });
    resolved = "ESCALATED";
    if (!finalText) {
      finalText =
        "I've routed your request to a human reviewer who will follow up with you shortly.";
    }
  }

  await opts.record({ type: "decision", status: resolved, content: finalText });
  return { finalText, status: resolved };
}
