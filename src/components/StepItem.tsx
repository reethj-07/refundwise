"use client";

import {
  Bot,
  Wrench,
  CheckCircle2,
  XCircle,
  BadgeCheck,
  AlertTriangle,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { friendlyTool, providerLabel } from "@/lib/labels";
import { formatTime, cn } from "@/lib/utils";
import type { ReasoningStepDTO } from "@/lib/types";

function Json({ value }: { value: unknown }) {
  return (
    <pre className="scroll-thin mt-1.5 max-h-56 overflow-auto rounded-md bg-slate-50 p-2.5 text-[11px] leading-relaxed text-slate-600">
      {JSON.stringify(value, null, 2)}
    </pre>
  );
}

export function StepItem({ step }: { step: ReasoningStepDTO }) {
  const payload = (step.payload ?? {}) as Record<string, unknown>;

  let Icon = Bot;
  let iconWrap = "bg-slate-100 text-slate-500";
  let title = "";
  let body: React.ReactNode = null;

  if (step.type === "model_text") {
    Icon = Bot;
    iconWrap = "bg-indigo-100 text-indigo-600";
    title = "Agent reasoning";
    body = <p className="mt-1 whitespace-pre-wrap text-sm text-slate-700">{String(payload.content ?? "")}</p>;
  } else if (step.type === "tool_call") {
    Icon = Wrench;
    iconWrap = "bg-violet-100 text-violet-600";
    title = `Tool call · ${step.name}`;
    body = (
      <>
        <p className="mt-0.5 text-xs text-slate-500">{friendlyTool(step.name ?? "")}</p>
        <Json value={payload.args ?? {}} />
      </>
    );
  } else if (step.type === "tool_result") {
    const isError = payload.isError === true;
    Icon = isError ? XCircle : CheckCircle2;
    iconWrap = isError ? "bg-red-100 text-red-600" : "bg-emerald-100 text-emerald-600";
    title = `Tool result · ${step.name}`;
    body = <Json value={payload.result ?? {}} />;
  } else if (step.type === "decision") {
    Icon = BadgeCheck;
    iconWrap = "bg-slate-900 text-white";
    title = `Decision · ${String(payload.status ?? "")}`;
    body = <p className="mt-1 text-sm text-slate-700">{String(payload.content ?? "")}</p>;
  } else if (step.type === "error") {
    Icon = AlertTriangle;
    iconWrap = "bg-amber-100 text-amber-600";
    title = "Note";
    body = <p className="mt-1 text-sm text-amber-700">{String(payload.content ?? "")}</p>;
  }

  return (
    <div className="fade-up flex gap-3">
      <div className="flex flex-col items-center">
        <div className={cn("grid h-7 w-7 shrink-0 place-items-center rounded-full", iconWrap)}>
          <Icon className="h-3.5 w-3.5" />
        </div>
        <div className="mt-1 w-px flex-1 bg-slate-200" />
      </div>
      <div className="min-w-0 flex-1 pb-4">
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold text-slate-700">{title}</span>
          {step.provider && (
            <Badge variant="violet" className="px-1.5 py-0">
              {providerLabel(step.provider)}
            </Badge>
          )}
          <span className="ml-auto text-[10px] tabular-nums text-slate-400">
            {formatTime(step.createdAt)}
          </span>
        </div>
        {body}
      </div>
    </div>
  );
}
