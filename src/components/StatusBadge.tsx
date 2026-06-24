import { Badge } from "@/components/ui/badge";
import { CheckCircle2, XCircle, AlertTriangle, CircleDot } from "lucide-react";
import type { ConversationStatus } from "@/lib/types";

const MAP = {
  OPEN: { label: "Open", variant: "info" as const, Icon: CircleDot },
  APPROVED: { label: "Approved", variant: "success" as const, Icon: CheckCircle2 },
  DENIED: { label: "Denied", variant: "danger" as const, Icon: XCircle },
  ESCALATED: { label: "Escalated", variant: "warning" as const, Icon: AlertTriangle },
};

export function StatusBadge({ status }: { status: ConversationStatus }) {
  const m = MAP[status] ?? MAP.OPEN;
  const { Icon } = m;
  return (
    <Badge variant={m.variant}>
      <Icon className="h-3.5 w-3.5" />
      {m.label}
    </Badge>
  );
}
