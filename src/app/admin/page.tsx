import Link from "next/link";
import { ArrowRight, Inbox } from "lucide-react";
import { prisma } from "@/lib/db";
import { Header } from "@/components/Header";
import { StatusBadge } from "@/components/StatusBadge";
import { Badge } from "@/components/ui/badge";
import { parseCitedRules } from "@/lib/serialize";
import { formatUSD } from "@/lib/utils";
import type { ConversationStatus } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function AdminPage() {
  const rows = await prisma.conversation.findMany({
    orderBy: { updatedAt: "desc" },
    include: {
      customer: true,
      messages: { orderBy: { createdAt: "asc" }, take: 1 },
      _count: { select: { steps: true } },
    },
  });

  return (
    <>
      <Header active="admin" />
      <div className="mx-auto max-w-6xl px-4 py-6">
        <div className="mb-5 flex items-end justify-between">
          <div>
            <h1 className="text-xl font-semibold text-slate-900">Conversations</h1>
            <p className="text-sm text-slate-500">
              Audit every refund decision and its full agent reasoning trace.
            </p>
          </div>
          <Badge variant="outline">{rows.length} total</Badge>
        </div>

        {rows.length === 0 ? (
          <div className="rounded-xl border border-dashed border-slate-300 bg-white p-12 text-center">
            <div className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-slate-100 text-slate-400">
              <Inbox className="h-6 w-6" />
            </div>
            <p className="mt-3 font-medium text-slate-700">No conversations yet</p>
            <p className="mt-1 text-sm text-slate-500">
              Start one in the{" "}
              <Link href="/chat" className="font-medium text-indigo-600 hover:underline">
                customer chat
              </Link>
              .
            </p>
          </div>
        ) : (
          <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                    <th className="px-4 py-3 font-medium">Status</th>
                    <th className="px-4 py-3 font-medium">Customer</th>
                    <th className="px-4 py-3 font-medium">Request</th>
                    <th className="px-4 py-3 font-medium">Verdict</th>
                    <th className="px-4 py-3 font-medium">Steps</th>
                    <th className="px-4 py-3 font-medium">Updated</th>
                    <th className="px-4 py-3" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {rows.map((c) => {
                    const cited = parseCitedRules(c.citedRules);
                    return (
                      <tr key={c.id} className="transition-colors hover:bg-slate-50">
                        <td className="px-4 py-3">
                          <StatusBadge status={c.status as ConversationStatus} />
                        </td>
                        <td className="px-4 py-3">
                          <div className="font-medium text-slate-800">
                            {c.customer?.name ?? "—"}
                          </div>
                          <div className="text-xs text-slate-400">
                            {c.customerRef ?? c.customer?.email ?? "unidentified"}
                          </div>
                        </td>
                        <td className="max-w-xs px-4 py-3">
                          <p className="truncate text-slate-600">
                            {c.messages[0]?.content ?? "—"}
                          </p>
                        </td>
                        <td className="px-4 py-3">
                          {c.status === "APPROVED" && c.verdictAmount != null ? (
                            <span className="font-medium text-emerald-700">
                              {formatUSD(c.verdictAmount)}
                            </span>
                          ) : cited.length > 0 ? (
                            <span className="text-xs text-slate-500">{cited.join(", ")}</span>
                          ) : (
                            <span className="text-slate-300">—</span>
                          )}
                        </td>
                        <td className="px-4 py-3 tabular-nums text-slate-500">{c._count.steps}</td>
                        <td className="px-4 py-3 text-xs text-slate-400">
                          {new Date(c.updatedAt).toLocaleString("en-US", {
                            month: "short",
                            day: "numeric",
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <Link
                            href={`/admin/${c.id}`}
                            className="inline-flex items-center gap-1 font-medium text-indigo-600 hover:underline"
                          >
                            View <ArrowRight className="h-3.5 w-3.5" />
                          </Link>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </>
  );
}
