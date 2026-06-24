"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Bot, User, Send, RefreshCw, ExternalLink, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Verdict } from "@/components/Verdict";
import { MicButton } from "@/components/MicButton";
import { useSpeech } from "@/hooks/useSpeech";
import { friendlyTool } from "@/lib/labels";
import { cn } from "@/lib/utils";
import type { ChatEvent, ConversationStatus } from "@/lib/types";

interface ChatMsg {
  id: string;
  role: "user" | "assistant";
  content: string;
}
interface VerdictState {
  status: ConversationStatus;
  amount: number | null;
  citedRules: string[];
  explanation: string;
}

const VOICE_ENABLED = process.env.NEXT_PUBLIC_VOICE_ENABLED === "true";

const DEMO_PROMPTS = [
  "Hi, I'm ava.thompson@example.com — I'd like to return the wool sweater from order ORD-1001, it didn't fit.",
  "This is diego.ramirez@example.com. I want a refund for order ORD-1004.",
  "henry.patel@example.com here — please refund my TV from order ORD-1008.",
  "liam.foster@example.com — I'd like to return just the yoga mat from order ORD-1012.",
];

export function ChatPanel() {
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [activity, setActivity] = useState<string | null>(null);
  const [verdict, setVerdict] = useState<VerdictState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const { supported, listening, listen, stop, speak } = useSpeech();

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, activity, verdict, error]);

  async function send(text: string, fromVoice = false) {
    const trimmed = text.trim();
    if (!trimmed || loading) return;
    setError(null);
    setVerdict(null);
    setInput("");
    setMessages((m) => [...m, { id: crypto.randomUUID(), role: "user", content: trimmed }]);
    setLoading(true);
    setActivity("Thinking…");

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: trimmed, conversationId }),
      });
      if (!res.ok || !res.body) {
        const j = await res.json().catch(() => null);
        throw new Error(j?.error ?? `Request failed (${res.status})`);
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let assistantText = "";

      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const chunks = buffer.split("\n\n");
        buffer = chunks.pop() ?? "";
        for (const chunk of chunks) {
          const dataLine = chunk.split("\n").find((l) => l.startsWith("data: "));
          if (!dataLine) continue;
          let ev: ChatEvent;
          try {
            ev = JSON.parse(dataLine.slice(6)) as ChatEvent;
          } catch {
            continue;
          }
          if (ev.type === "conversation") setConversationId(ev.conversationId);
          else if (ev.type === "step") {
            if (ev.step.type === "tool_call") setActivity(friendlyTool(ev.step.name ?? ""));
            else if (ev.step.type === "model_text") setActivity("Reasoning…");
          } else if (ev.type === "assistant") {
            assistantText = ev.content;
            setMessages((m) => [
              ...m,
              { id: crypto.randomUUID(), role: "assistant", content: ev.content },
            ]);
          } else if (ev.type === "verdict") {
            setVerdict({
              status: ev.status,
              amount: ev.amount,
              citedRules: ev.citedRules,
              explanation: ev.explanation,
            });
          } else if (ev.type === "error") {
            setError(ev.message);
          }
        }
      }
      if (fromVoice && assistantText) speak(assistantText);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong.");
    } finally {
      setLoading(false);
      setActivity(null);
    }
  }

  function onMic() {
    if (listening) {
      stop();
      return;
    }
    listen((text) => {
      setInput(text);
      void send(text, true);
    });
  }

  function reset() {
    setMessages([]);
    setConversationId(null);
    setVerdict(null);
    setError(null);
    setInput("");
  }

  const empty = messages.length === 0;

  return (
    <div className="mx-auto flex h-[calc(100vh-3.5rem)] max-w-3xl flex-col px-4">
      {/* sub-header */}
      <div className="flex items-center gap-2 py-3">
        <div>
          <h1 className="text-sm font-semibold text-slate-900">Refund support</h1>
          <p className="text-xs text-slate-500">
            Chat with the AI agent to request a refund.
          </p>
        </div>
        <div className="ml-auto flex items-center gap-2">
          {conversationId && (
            <Link
              href={`/admin/${conversationId}`}
              target="_blank"
              className="inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-100"
            >
              View agent reasoning <ExternalLink className="h-3.5 w-3.5" />
            </Link>
          )}
          <Button variant="ghost" size="sm" onClick={reset} disabled={loading}>
            <RefreshCw className="h-3.5 w-3.5" /> New chat
          </Button>
        </div>
      </div>

      {/* messages */}
      <div ref={scrollRef} className="scroll-thin flex-1 space-y-4 overflow-y-auto py-4">
        {empty && (
          <div className="mx-auto max-w-md py-10 text-center">
            <div className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-indigo-600 text-white">
              <Bot className="h-6 w-6" />
            </div>
            <h2 className="mt-4 font-semibold text-slate-900">How can I help with your refund?</h2>
            <p className="mt-1 text-sm text-slate-500">
              Tell me your email or customer ID and which order you&apos;d like to return. Try one of these:
            </p>
            <div className="mt-4 grid gap-2 text-left">
              {DEMO_PROMPTS.map((p) => (
                <button
                  key={p}
                  onClick={() => send(p)}
                  className="rounded-lg border border-slate-200 bg-white p-3 text-left text-sm text-slate-600 shadow-sm transition hover:border-indigo-300 hover:bg-indigo-50"
                >
                  {p}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((m) => (
          <div
            key={m.id}
            className={cn("flex gap-3 fade-up", m.role === "user" && "flex-row-reverse")}
          >
            <div
              className={cn(
                "grid h-8 w-8 shrink-0 place-items-center rounded-full",
                m.role === "user" ? "bg-slate-200 text-slate-600" : "bg-indigo-600 text-white",
              )}
            >
              {m.role === "user" ? <User className="h-4 w-4" /> : <Bot className="h-4 w-4" />}
            </div>
            <div
              className={cn(
                "max-w-[80%] whitespace-pre-wrap rounded-2xl px-4 py-2.5 text-sm leading-relaxed",
                m.role === "user"
                  ? "bg-indigo-600 text-white"
                  : "border border-slate-200 bg-white text-slate-800 shadow-sm",
              )}
            >
              {m.content}
            </div>
          </div>
        ))}

        {loading && (
          <div className="flex gap-3 fade-up">
            <div className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-indigo-600 text-white">
              <Bot className="h-4 w-4" />
            </div>
            <div className="flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm text-slate-500 shadow-sm">
              <Loader2 className="h-4 w-4 animate-spin text-indigo-500" />
              {activity ?? "Working…"}
            </div>
          </div>
        )}

        {verdict && (
          <div className="fade-up pl-11">
            <Verdict {...verdict} />
          </div>
        )}

        {error && (
          <div className="fade-up rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        )}
      </div>

      {/* composer */}
      <div className="border-t border-slate-200 py-3">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void send(input);
          }}
          className="flex items-center gap-2"
        >
          <Input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Type your refund request…"
            disabled={loading}
          />
          {VOICE_ENABLED && supported && (
            <MicButton listening={listening} onClick={onMic} disabled={loading} />
          )}
          <Button type="submit" size="icon" disabled={loading || !input.trim()}>
            <Send className="h-4 w-4" />
          </Button>
        </form>
        {VOICE_ENABLED && !supported && (
          <p className="mt-1.5 text-center text-xs text-slate-400">
            Voice input isn&apos;t supported in this browser (try Chrome).
          </p>
        )}
      </div>
    </div>
  );
}
