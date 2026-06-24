"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ArrowLeft, User, Bot, Radio } from "lucide-react";
import { StatusBadge } from "@/components/StatusBadge";
import { StepItem } from "@/components/StepItem";
import { Verdict } from "@/components/Verdict";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { ReasoningStepDTO, ConversationStatus } from "@/lib/types";

interface DetailMessage {
  id: string;
  role: string;
  content: string;
  createdAt: string;
}
interface Detail {
  id: string;
  status: ConversationStatus;
  customerRef: string | null;
  customerName: string | null;
  customerEmail: string | null;
  loyaltyTier: string | null;
  verdictAmount: number | null;
  citedRules: string[];
  explanation: string | null;
  createdAt: string;
  updatedAt: string;
  messages: DetailMessage[];
  steps: ReasoningStepDTO[];
}

export function ConversationDetail({ id }: { id: string }) {
  const [detail, setDetail] = useState<Detail | null>(null);
  const [steps, setSteps] = useState<ReasoningStepDTO[]>([]);
  const [live, setLive] = useState(false);
  const stepIds = useRef<Set<string>>(new Set());
  const timelineRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    const mergeSteps = (incoming: ReasoningStepDTO[]) => {
      const fresh = incoming.filter((s) => !stepIds.current.has(s.id));
      if (fresh.length === 0) return;
      fresh.forEach((s) => stepIds.current.add(s.id));
      setSteps((prev) => [...prev, ...fresh].sort((a, b) => a.seq - b.seq));
    };

    async function loadDetail() {
      const res = await fetch(`/api/admin/conversations/${id}`, { cache: "no-store" });
      if (!res.ok || cancelled) return;
      const { conversation } = (await res.json()) as { conversation: Detail };
      if (cancelled) return;
      setDetail(conversation);
      mergeSteps(conversation.steps);
    }

    void loadDetail();

    const es = new EventSource(`/api/admin/stream/${id}`);
    es.onopen = () => setLive(true);
    es.onmessage = (e) => {
      try {
        const ev = JSON.parse(e.data) as
          | { type: "step"; step: ReasoningStepDTO }
          | { type: "verdict" }
          | { type: "done" }
          | { type: "error"; message: string };
        if (ev.type === "step") mergeSteps([ev.step]);
        else if (ev.type === "verdict") void loadDetail();
        else if (ev.type === "done") {
          void loadDetail();
          es.close();
          setLive(false);
        }
      } catch {
        /* ignore */
      }
    };
    es.onerror = () => setLive(false); // EventSource auto-reconnects

    return () => {
      cancelled = true;
      es.close();
    };
  }, [id]);

  useEffect(() => {
    timelineRef.current?.scrollTo({ top: timelineRef.current.scrollHeight, behavior: "smooth" });
  }, [steps]);

  if (!detail) {
    return (
      <div className="mx-auto max-w-6xl px-4 py-10 text-sm text-slate-500">Loading conversation…</div>
    );
  }

  const resolved = detail.status !== "OPEN";
  const customerLabel =
    detail.customerName ?? detail.customerRef ?? "Unidentified customer";

  return (
    <div className="mx-auto max-w-6xl px-4 py-5">
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <Link
          href="/admin"
          className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-sm text-slate-600 hover:bg-slate-100"
        >
          <ArrowLeft className="h-4 w-4" /> All conversations
        </Link>
        <StatusBadge status={detail.status} />
        {live && detail.status === "OPEN" && (
          <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-600">
            <Radio className="h-3.5 w-3.5 animate-pulse" /> Live
          </span>
        )}
        <div className="ml-auto text-right">
          <div className="text-sm font-medium text-slate-800">{customerLabel}</div>
          <div className="text-xs text-slate-500">
            {detail.customerEmail ?? detail.customerRef ?? "—"}
            {detail.loyaltyTier && (
              <Badge variant="outline" className="ml-2 capitalize">
                {detail.loyaltyTier}
              </Badge>
            )}
          </div>
        </div>
      </div>

      {resolved && (
        <div className="mb-5">
          <Verdict
            status={detail.status}
            amount={detail.verdictAmount}
            citedRules={detail.citedRules}
            explanation={detail.explanation ?? ""}
          />
        </div>
      )}

      <div className="grid gap-5 lg:grid-cols-2">
        {/* Transcript */}
        <Card className="flex flex-col">
          <div className="border-b border-slate-100 px-4 py-3 text-sm font-semibold text-slate-700">
            Conversation
          </div>
          <div className="scroll-thin max-h-[65vh] space-y-3 overflow-y-auto p-4">
            {detail.messages.length === 0 && (
              <p className="text-sm text-slate-400">No messages yet.</p>
            )}
            {detail.messages.map((m) => (
              <div
                key={m.id}
                className={cn("flex gap-2.5", m.role === "user" && "flex-row-reverse")}
              >
                <div
                  className={cn(
                    "grid h-7 w-7 shrink-0 place-items-center rounded-full",
                    m.role === "user" ? "bg-slate-200 text-slate-600" : "bg-indigo-600 text-white",
                  )}
                >
                  {m.role === "user" ? <User className="h-3.5 w-3.5" /> : <Bot className="h-3.5 w-3.5" />}
                </div>
                <div
                  className={cn(
                    "max-w-[82%] whitespace-pre-wrap rounded-2xl px-3.5 py-2 text-sm",
                    m.role === "user"
                      ? "bg-indigo-600 text-white"
                      : "border border-slate-200 bg-white text-slate-800",
                  )}
                >
                  {m.content}
                </div>
              </div>
            ))}
          </div>
        </Card>

        {/* Reasoning timeline */}
        <Card className="flex flex-col">
          <div className="flex items-center gap-2 border-b border-slate-100 px-4 py-3 text-sm font-semibold text-slate-700">
            Agent reasoning
            <Badge variant="outline" className="ml-auto">
              {steps.length} steps
            </Badge>
          </div>
          <div ref={timelineRef} className="scroll-thin max-h-[65vh] overflow-y-auto p-4">
            {steps.length === 0 ? (
              <p className="text-sm text-slate-400">No reasoning steps yet.</p>
            ) : (
              steps.map((s) => <StepItem key={s.id} step={s} />)
            )}
          </div>
        </Card>
      </div>
    </div>
  );
}
