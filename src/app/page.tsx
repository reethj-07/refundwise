import Link from "next/link";
import {
  MessageSquare,
  LayoutDashboard,
  ShieldCheck,
  Wrench,
  ScrollText,
  Sparkles,
} from "lucide-react";
import { Header } from "@/components/Header";
import { Badge } from "@/components/ui/badge";

const STEPS = [
  {
    Icon: MessageSquare,
    title: "Customer chats",
    body: "The customer describes their refund request in natural language (or by voice).",
  },
  {
    Icon: Wrench,
    title: "Agent calls tools",
    body: "The LLM dynamically looks up the customer & order, then runs a deterministic eligibility check.",
  },
  {
    Icon: ScrollText,
    title: "Policy decides",
    body: "Rules are enforced in code — approve, deny, or escalate — never from vibes.",
  },
  {
    Icon: ShieldCheck,
    title: "Everything is audited",
    body: "Each tool call, result, and decision streams live to the admin dashboard.",
  },
];

export default function Home() {
  return (
    <>
      <Header />
      <main className="mx-auto max-w-5xl px-4">
        {/* hero */}
        <section className="py-14 text-center">
          <Badge variant="info" className="mx-auto">
            <Sparkles className="h-3.5 w-3.5" /> AI customer-support agent
          </Badge>
          <h1 className="mx-auto mt-4 max-w-2xl text-4xl font-bold tracking-tight text-slate-900 sm:text-5xl">
            Refund decisions, grounded in policy — not vibes.
          </h1>
          <p className="mx-auto mt-4 max-w-xl text-lg text-slate-600">
            RefundWise reasons over a CRM and a strict refund policy with an LLM-driven agent loop,
            then approves, denies, or escalates — and shows its work.
          </p>
          <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
            <Link
              href="/chat"
              className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-5 py-3 font-medium text-white shadow-sm transition hover:bg-indigo-700"
            >
              <MessageSquare className="h-4 w-4" /> Open customer chat
            </Link>
            <Link
              href="/admin"
              className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-5 py-3 font-medium text-slate-700 shadow-sm transition hover:bg-slate-50"
            >
              <LayoutDashboard className="h-4 w-4" /> Admin dashboard
            </Link>
          </div>
        </section>

        {/* how it works */}
        <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {STEPS.map(({ Icon, title, body }, i) => (
            <div key={title} className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex items-center gap-2">
                <span className="grid h-8 w-8 place-items-center rounded-lg bg-indigo-50 text-indigo-600">
                  <Icon className="h-4 w-4" />
                </span>
                <span className="text-xs font-semibold text-slate-400">0{i + 1}</span>
              </div>
              <h3 className="mt-3 font-semibold text-slate-900">{title}</h3>
              <p className="mt-1 text-sm text-slate-600">{body}</p>
            </div>
          ))}
        </section>

        {/* demo cheat sheet */}
        <section className="my-12 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="font-semibold text-slate-900">Try the demo</h2>
          <p className="mt-1 text-sm text-slate-600">
            15 seeded customers cover every policy branch. A few to try in the{" "}
            <Link href="/chat" className="font-medium text-indigo-600 hover:underline">
              chat
            </Link>
            :
          </p>
          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            {[
              {
                tag: "Approved",
                variant: "success" as const,
                who: "ava.thompson@example.com",
                ask: "Return the sweater on ORD-1001 — within the window.",
              },
              {
                tag: "Denied",
                variant: "danger" as const,
                who: "diego.ramirez@example.com",
                ask: "Refund ORD-1004 — 45 days out, past the window (R1).",
              },
              {
                tag: "Escalated",
                variant: "warning" as const,
                who: "henry.patel@example.com",
                ask: "Refund the $850 TV on ORD-1008 — high value (R5).",
              },
            ].map((d) => (
              <div key={d.who} className="rounded-lg border border-slate-200 p-4">
                <Badge variant={d.variant}>{d.tag}</Badge>
                <p className="mt-2 font-mono text-xs text-slate-500">{d.who}</p>
                <p className="mt-1 text-sm text-slate-700">{d.ask}</p>
              </div>
            ))}
          </div>
        </section>

        <footer className="pb-12 text-center text-xs text-slate-400">
          Free-tier stack · Gemini → Groq fallback · Next.js · Prisma + libSQL/Turso · browser voice
        </footer>
      </main>
    </>
  );
}
