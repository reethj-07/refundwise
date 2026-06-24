# RefundWise — AI Customer-Support Agent for E-Commerce Refunds

An AI agent that **approves, denies, or escalates** refund requests by reasoning over a CRM and a strict
refund policy with an LLM-driven, tool-calling agent loop — and **shows its work** in a live admin
dashboard. Decisions are never made "from vibes": the LLM interprets and communicates, but the policy
rules are enforced deterministically in code.

> **100% free stack — no paid tier anywhere.** Google Gemini (free) as the primary LLM with Groq (free)
> as an automatic fallback, Next.js, Prisma + SQLite/Turso (free), and browser-native voice. The only
> thing you provide is a free API key (Gemini and/or Groq).

---

## Contents

- [What it does](#what-it-does)
- [Quickstart](#quickstart)
- [Demo script](#demo-script)
- [Architecture](#architecture)
- [The agent loop & tools](#the-agent-loop--tools)
- [The deterministic eligibility spine](#the-deterministic-eligibility-spine)
- [The 15 seeded scenarios](#the-15-seeded-scenarios)
- [Reasoning log & live streaming](#reasoning-log--live-streaming)
- [Guardrails](#guardrails)
- [Project structure](#project-structure)
- [Deploy to Vercel (free)](#deploy-to-vercel-free)
- [Design decisions & trade-offs](#design-decisions--trade-offs)
- [What I'd do with more time](#what-id-do-with-more-time)

---

## What it does

- **Customer chat** (`/chat`): a clean chat UI (with optional voice). The agent identifies the customer,
  finds the order, checks eligibility, and returns a clear **approve / deny / escalate** verdict with the
  refund amount or the specific policy rules cited.
- **Admin dashboard** (`/admin`): a real-time, auditable timeline of **every** agent step — each model
  message, each tool call (with arguments), each tool result, and the final decision — tied to a
  conversation, with status badges and cited rules. Built for an ops person auditing the agent.
- **Voice (bonus)**: talk to the agent and hear it reply, using the browser's Web Speech API (no keys,
  behind `NEXT_PUBLIC_VOICE_ENABLED`).

---

## Quickstart

**Prerequisites:** Node 20+ (tested on 24).

```bash
# 1. Install
npm install

# 2. Configure — copy the example and add at least ONE free LLM key
cp .env.example .env.local
#   GEMINI_API_KEY  -> https://aistudio.google.com/apikey   (free)
#   GROQ_API_KEY    -> https://console.groq.com/keys        (free, used as fallback)

# 3. Create + seed the local SQLite database (one command)
npm run db:setup

# 4. Run
npm run dev
# open http://localhost:3000
```

`npm run db:setup` runs `prisma db push` → `prisma generate` → seeds the 15 customers from
`data/customers.json`. Re-run it any time to reset the data (it also refreshes the relative order dates).

**Env vars** (see `.env.example`):

| Var | Purpose |
|---|---|
| `GEMINI_API_KEY` | Primary LLM (free). At least one of Gemini/Groq is required. |
| `GROQ_API_KEY` | Fallback LLM (free). If Gemini errors/rate-limits, the agent switches automatically. |
| `GEMINI_MODEL` / `GROQ_MODEL` | Default `gemini-2.5-flash` / `llama-3.3-70b-versatile`. |
| `LLM_PRIMARY` | `gemini` (default) or `groq`. |
| `HIGH_VALUE_THRESHOLD` | Refunds ≥ this amount are escalated, never auto-approved. Default `500`. |
| `AGENT_MAX_ITERATIONS` | Hard cap on the agent loop before auto-escalation. Default `10`. |
| `DATABASE_URL` | Local SQLite (default `file:./dev.db`). |
| `TURSO_DATABASE_URL` / `TURSO_AUTH_TOKEN` | Set these to run on Turso (for Vercel). |
| `NEXT_PUBLIC_VOICE_ENABLED` | `true` to show the mic button. |

---

## Demo script

Seeded so the demo reliably produces **APPROVED, DENIED, and ESCALATED** (plus edge cases). Paste these
into `/chat` (the landing page and chat also have one-click prompts):

| Outcome | Try this |
|---|---|
| ✅ **Approved** | `Hi, I'm ava.thompson@example.com — I'd like to return the wool sweater from order ORD-1001, it didn't fit.` → **APPROVED $60** (within the 30-day window). |
| ❌ **Denied** | `This is diego.ramirez@example.com. I want a refund for order ORD-1004.` → **DENIED** (R1 — 45 days, past the window). |
| ⚠️ **Escalated** | `henry.patel@example.com here — please refund my TV from order ORD-1008.` → **ESCALATED** (R5 — $850 ≥ $500). |
| 💳 Partial refund | `liam.foster@example.com — I'd like to return just the yoga mat from order ORD-1012.` → **APPROVED $45** (one item of a 3-item order). |
| 🔒 Precedence | `olivia.reed@example.com — refund my gift card on ORD-1015.` → **DENIED** (R3 — gift cards are non-refundable, even for VIP). |
| 🕵️ Missing customer | `Hi, this is nobody@nowhere.com, I want a refund.` → the agent can't find the account and asks the customer to re-check — no other customer's data is exposed. |

While a chat runs, open **`/admin`** → click the conversation to watch the full tool-call reasoning stream
in real time (or click **"View agent reasoning"** in the chat header).

---

## Architecture

```
 Customer Chat (/chat)                         Admin Dashboard (/admin, /admin/[id])
 client: fetch -> SSE reader                   client: EventSource (poll-backed SSE)
        |  POST /api/chat                                |  GET /api/admin/stream/[id]
        v                                                v
 +--------------------------+                 +------------------------------+
 | /api/chat (Node, stream) |                 | /api/admin/* (Node, stream)  |
 |  runs the AGENT LOOP     |                 |  tails ReasoningStep by seq  |
 +-----------+--------------+                 +--------------+---------------+
             |  persists Message + ReasoningStep + Verdict   |  reads
             v                                               v
        +-------------  Prisma + SQLite / Turso  (the event bus)  -------------+
        | Customer . Order . OrderItem . Refund . Conversation . Message . Step |
        +-----------------------------------------------------------------------+
             ^  the loop calls tools
 +-----------+--------------------------------------------------+
 | AGENT: Gemini (primary) -> Groq (fallback) [provider-agnostic]|
 |   lookupCustomer . getOrder . listOrders . getRefundPolicy    |
 |   checkRefundEligibility   <- deterministic policy evaluator  |
 |   issueRefund . denyRefund . escalateToHuman  (terminal)      |
 +---------------------------------------------------------------+
```

**The database is the event bus.** The agent loop persists each reasoning step; the admin view tails new
steps by a `seq` cursor over SSE. This works identically locally and on serverless (Vercel) — no
in-memory pub/sub that would break across isolated function invocations.

---

## The agent loop & tools

A hand-rolled, provider-agnostic tool-calling loop (`src/agent/loop.ts`) — deliberately **not** an SDK
"tool runner" — so every step can be intercepted, persisted, and streamed:

1. Identify the customer (`lookupCustomer`), which **binds** them to the conversation (the authorization
   context — no other customer's data is reachable afterward).
2. Find the order (`listOrders` / `getOrder`) and read policy (`getRefundPolicy`).
3. Run `checkRefundEligibility` — the deterministic spine — for the specific order.
4. Resolve with **exactly one** terminal tool: `issueRefund` (approve), `denyRefund`, or
   `escalateToHuman`. Each persists a structured verdict (status, amount, cited rules, explanation).

The loop runs through a thin **LLM layer** (`src/lib/llm/`) that normalizes tools and messages so the same
loop works with either provider. It tries **Gemini** first and transparently falls back to **Groq** on any
error (rate-limit / 5xx / network). Each reasoning step is tagged with the provider that served it, so the
admin trace shows exactly who answered.

**Tools** (`src/agent/tools.ts` = LLM-facing schemas + Zod validation + dispatch;
`src/server/tools.ts` = the real typed implementations):

| Tool | What it does |
|---|---|
| `lookupCustomer(emailOrId)` | Find + bind the customer; returns their profile and order summaries. |
| `listOrders()` / `getOrder(orderId)` | The bound customer's orders only. |
| `getRefundPolicy(topic?)` | Returns the relevant section(s) of `data/policy.md`. |
| `checkRefundEligibility(orderId)` | **Deterministic** per-rule evaluation + recommendation. |
| `issueRefund(orderId, amount, reason)` | Approve — re-validated against policy; idempotent. |
| `denyRefund(orderId, reason, citedRuleIds)` | Deny with cited rules. |
| `escalateToHuman(reason, citedRuleIds)` | Escalate for human review. |

---

## The deterministic eligibility spine

`src/agent/eligibility.ts` is a pure function that encodes the policy in code. The LLM never decides
eligibility on its own — it calls this, and `issueRefund` **re-runs it** as defense-in-depth, so the agent
*cannot* approve an ineligible, over-threshold, or duplicate refund even if it tries.

Policy (`data/policy.md`, numbered & testable):

- **R1** Return window from delivery — standard **30d**, gold **45d**, vip **60d**.
- **R2** Final-sale items: non-refundable.
- **R3** Non-refundable categories: `perishable`, `digital`, `gift_card`.
- **R4** One refund per order.
- **R5** Refunds **>= $500** must be escalated (never auto-approved).
- **R6** Only `delivered` orders are refundable.
- **R7** Missing/invalid data -> escalate.
- **Goodwill grace**: gold/vip up to **7 days** past their window -> escalate.
- **Precedence**: hard denials (R2, R3, R4, R6) -> escalations (R5, R7, grace) -> window (R1) -> eligible.
  *(So a final-sale item is denied even if it's high-value; a gift card is denied even for a VIP.)*

You can sanity-check the spine against every seeded order:

```bash
npx tsx scripts/check-eligibility.ts
```

---

## The 15 seeded scenarios

`data/customers.json` is the source of truth — 15 profiles deliberately covering every policy branch.
Dates are stored as **day-offsets** and converted to absolute timestamps at seed time, so scenarios stay
valid whenever you seed.

| # | Customer | Tier | Scenario | Expected |
|--|--|--|--|--|
| 001 | ava.thompson | standard | In-window apparel | **APPROVE** |
| 002 | ben.carter | gold | 40 days — gold's 45-day window | **APPROVE** (loyalty) |
| 003 | chloe.nguyen | vip | 55 days — vip's 60-day window | **APPROVE** (loyalty) |
| 004 | diego.ramirez | standard | 45 days — past window | **DENY** (R1) |
| 005 | emma.wilson | standard | Final-sale item | **DENY** (R2) |
| 006 | frank.olsen | standard | Perishable (+ a digital order) | **DENY** (R3) |
| 007 | grace.kim | standard | Already refunded once | **DENY** (R4) |
| 008 | henry.patel | standard | $850 TV | **ESCALATE** (R5) |
| 009 | isla.brooks | standard | Not delivered (shipped) | **DENY** (R6) |
| 010 | jack.turner | standard | Delivered but no delivery date | **ESCALATE** (R7) |
| 011 | karen.diaz | vip | 63 days — 3 past vip window | **ESCALATE** (grace) |
| 012 | liam.foster | gold | 3-item order, return one item | **APPROVE** (partial) |
| 013 | mia.scott | standard | 3 orders, vague request | **APPROVE** after disambiguation |
| 014 | noah.green | standard | $900 **and** final sale | **DENY** (R2 beats R5) |
| 015 | olivia.reed | vip | Gift card | **DENY** (R3 beats loyalty) |

Plus an **unknown-email** test (any email not in the DB) for graceful "customer not found" handling.

---

## Reasoning log & live streaming

Every step of a resolved conversation is captured as an ordered, timestamped `ReasoningStep`
(`model_text` | `tool_call` | `tool_result` | `decision` | `error`) tied to a `conversationId`, with the
serving LLM provider recorded on model turns.

- `POST /api/chat` runs the loop and **streams** events (`step`, `assistant`, `verdict`, `done`) to the
  customer over SSE — the chat shows live "Looking up your account... / Evaluating eligibility..." status.
- `GET /api/admin/stream/[id]` tails the conversation's steps from the DB by `seq` cursor over SSE; the
  admin timeline updates live and reconnects automatically (deduping by step id).

---

## Guardrails

- **Authorization**: once `lookupCustomer` binds a customer, every tool only touches *their* data —
  no cross-customer leakage.
- **Defense-in-depth**: `issueRefund` re-evaluates policy and rejects ineligible / over-threshold /
  duplicate / over-total refunds, independent of what the LLM "decided".
- **Never auto-approve** at or above the escalation threshold, or on an ESCALATE recommendation.
- **Input validation**: all tool arguments are validated with Zod; unknown tools and malformed args
  return structured tool errors the agent can recover from.
- **Loop cap -> auto-escalate**: if the loop hits `AGENT_MAX_ITERATIONS` without resolving, it escalates.
- Secrets only in `.env.local`; never hard-coded.

---

## Project structure

```
data/policy.md                  # the authoritative, numbered refund policy
data/customers.json             # 15 seeded customers (source of truth)
prisma/schema.prisma            # Customer, Order, OrderItem, Refund, Conversation, Message, ReasoningStep
prisma/seed.ts                  # idempotent seed (day-offsets -> timestamps)
prisma.config.ts                # Prisma 7 config (datasource url)
scripts/check-eligibility.ts    # dev aid: runs the spine over every seeded order
src/
  agent/  eligibility.ts (spine) . tools.ts (schemas+zod+dispatch) . loop.ts . systemPrompt.ts
  server/ tools.ts (real tool implementations + authorization)
  lib/    db.ts (Prisma + libSQL) . llm/ (router + gemini + groq) . policy.ts . config.ts .
          types.ts . serialize.ts . sse.ts . labels.ts . utils.ts
  app/    page.tsx . chat/ . admin/ . admin/[conversationId]/ . api/chat/ . api/admin/*
  components/ ChatPanel . ConversationDetail . StepItem . Verdict . StatusBadge . MicButton . ui/*
  hooks/  useSpeech.ts (browser Web Speech)
```

---

## Deploy to Vercel (free)

Everything runs on free tiers: **Vercel Hobby** + **Turso** (free SQLite-compatible DB) + a free LLM key.

1. **Create a free Turso database** at [turso.tech](https://turso.tech) (or via the Turso CLI). Copy its
   **database URL** (`libsql://…`) and create an **auth token**.
2. **Apply the schema + seed it — no Turso CLI needed.** Put the two values in `.env.local`:
   ```
   TURSO_DATABASE_URL=libsql://…
   TURSO_AUTH_TOKEN=…
   ```
   then run:
   ```bash
   npm run db:turso
   ```
   This applies the schema to Turso over the network and seeds the 15 customers.
3. **Import the repo on Vercel** and set the project env vars: `GEMINI_API_KEY` (and/or `GROQ_API_KEY`),
   `TURSO_DATABASE_URL`, `TURSO_AUTH_TOKEN`, `NEXT_PUBLIC_VOICE_ENABLED=true`. Deploy.

> Tip: remove `TURSO_*` from `.env.local` afterwards if you want local `npm run dev` to keep using the
> local SQLite file instead of Turso.

`postinstall` runs `prisma generate`; the streaming routes set `maxDuration = 60` (within Hobby limits);
`runtime = "nodejs"` everywhere Prisma is used.

---

## Design decisions & trade-offs

- **Free LLM (Gemini -> Groq) instead of Anthropic Claude.** The brief specifies Anthropic Claude, but the
  requirement here was a zero-cost stack, and Claude has no perpetual free tier. The agent loop is
  **provider-agnostic** (`src/lib/llm/`), so reverting to Claude is a single added adapter
  (`@anthropic-ai/sdk`) plus an env var — the loop, tools, eligibility spine, and UI are unchanged.
- **Manual tool-calling loop** over an SDK tool-runner — needed to intercept and stream every step.
- **Rules in code, LLM for language.** The deterministic evaluator is the spine; the LLM communicates.
  `issueRefund` re-checks, so the model can't override policy.
- **DB-as-event-bus SSE** over in-memory pub/sub — survives serverless; ~750ms poll latency is fine for an
  ops dashboard.
- **Prisma + libSQL/Turso** — keeps a zero-config local SQLite file *and* deploys to Vercel with the same
  code; the runtime uses the libSQL driver adapter (Prisma 7 has no bundled query engine).
- **Symmetric terminal tools** (`issueRefund` / `denyRefund` / `escalateToHuman`) so all three verdicts are
  captured identically and structurally.

## What I'd do with more time

- Unit tests for the eligibility evaluator (per-rule + precedence) and an eval harness over the 15 scenarios.
- Auth for the admin dashboard.
- Token-by-token streaming of the assistant's final message (the loop currently streams step-level status).
- Richer voice (ElevenLabs / OpenAI Realtime) behind the existing flag.
- A hosted pub/sub (Upstash / Ably) for true push + multi-instance fan-out instead of DB polling.
- Extended / adaptive thinking surfaced into the reasoning log.
