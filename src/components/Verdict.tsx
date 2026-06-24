import { CheckCircle2, XCircle, AlertTriangle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { formatUSD, cn } from "@/lib/utils";
import type { ConversationStatus } from "@/lib/types";

interface VerdictProps {
  status: ConversationStatus;
  amount: number | null;
  citedRules: string[];
  explanation: string;
}

const THEME = {
  APPROVED: {
    ring: "border-emerald-200 bg-emerald-50",
    title: "text-emerald-800",
    Icon: CheckCircle2,
    iconColor: "text-emerald-600",
    label: "Refund approved",
  },
  DENIED: {
    ring: "border-red-200 bg-red-50",
    title: "text-red-800",
    Icon: XCircle,
    iconColor: "text-red-600",
    label: "Refund denied",
  },
  ESCALATED: {
    ring: "border-amber-200 bg-amber-50",
    title: "text-amber-800",
    Icon: AlertTriangle,
    iconColor: "text-amber-600",
    label: "Escalated to a human",
  },
  OPEN: {
    ring: "border-slate-200 bg-slate-50",
    title: "text-slate-800",
    Icon: AlertTriangle,
    iconColor: "text-slate-500",
    label: "In progress",
  },
};

export function Verdict({ status, amount, citedRules, explanation }: VerdictProps) {
  const t = THEME[status] ?? THEME.OPEN;
  const { Icon } = t;
  return (
    <div className={cn("rounded-xl border p-4", t.ring)}>
      <div className="flex items-center gap-2">
        <Icon className={cn("h-5 w-5", t.iconColor)} />
        <span className={cn("font-semibold", t.title)}>{t.label}</span>
        {status === "APPROVED" && amount != null && (
          <span className="ml-auto text-lg font-bold text-emerald-700">{formatUSD(amount)}</span>
        )}
      </div>
      {explanation && <p className="mt-2 text-sm text-slate-700">{explanation}</p>}
      {citedRules.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {citedRules.map((r) => (
            <Badge key={r} variant="outline">
              {r}
            </Badge>
          ))}
        </div>
      )}
    </div>
  );
}
