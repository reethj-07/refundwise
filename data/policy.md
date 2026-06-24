# RefundWise Refund Policy

**Version 1.0 — effective immediately. This document is authoritative.** The support agent must ground
every approve / deny / escalate decision in the specific rules below. Rules are enforced deterministically
in code (`checkRefundEligibility`); the agent interprets and communicates them but may not override them.

All monetary amounts are in USD. "Today" means the current date at the time of the request. The return
window is measured in whole days from the order's **delivery date** to today.

---

## R1 — Return window (by loyalty tier)

A refund request must be made within the return window, measured from the delivery date:

| Loyalty tier | Return window |
| ------------ | ------------- |
| `standard`   | **30 days**   |
| `gold`       | **45 days**   |
| `vip`        | **60 days**   |

If the order was delivered more than the tier's window ago, it is **outside the window** and not eligible
for a standard refund (but see *Goodwill grace* below for gold/vip).

## R2 — Final-sale items

Items marked **final sale** are **non-refundable**, with no exceptions for any loyalty tier. If an order
is flagged final sale, deny the refund.

## R3 — Non-refundable categories

Items in these categories are **non-refundable** regardless of window or loyalty tier:

- `perishable` (e.g. food, flowers)
- `digital` (e.g. downloads, software licenses, e-gift content)
- `gift_card`

## R4 — One refund per order

Each order may be refunded **at most once**. If the order already has a prior refund on record, deny any
further refund for that order.

## R5 — High-value escalation

Any refund whose amount is **greater than or equal to $500** must be **escalated to a human reviewer**.
The agent must **never** auto-approve a refund at or above this threshold, even if every other rule passes.

## R6 — Delivery status

Only orders with status **`delivered`** are eligible for a refund. Orders that are still `processing` or
`shipped` have not completed delivery and must be denied (the customer can request a refund once delivered,
or report a delivery problem for human review).

## R7 — Missing or invalid data

If required data is missing or the order cannot be found — for example, no delivery date is on file, or the
order ID does not exist for this customer — the agent must **escalate to a human** rather than guess.

## R8 — Goodwill grace (gold/vip)

For `gold` and `vip` customers whose order is **up to 7 days past** their return window (R1), the request is
**escalated** for a goodwill review — it is *not* auto-approved. Beyond 7 days past the window, deny under R1.
This grace does not apply to `standard` customers.

---

## Loyalty tiers & goodwill grace

- Standard, gold, and vip differ only by the return window in **R1**.
- **Goodwill grace (R8):** for `gold` and `vip` customers whose order is **up to 7 days past** their return
  window, the request is **escalated** for a goodwill review (it is *not* auto-approved). Beyond 7 days past
  the window, deny under R1.

## Refund amount (full vs partial)

- A **full refund** equals the order total.
- A **partial refund** is allowed when the customer only wants to return specific item(s): the refundable
  amount is the sum of `price × quantity` for the returned items. A partial refund may never exceed the
  order total, and the order is still considered "refunded" for the purposes of R4.

## Decision precedence

Evaluate in this order; the first matching outcome wins:

1. **Hard denials** — R2 (final sale), R3 (non-refundable category), R4 (already refunded), R6 (not
   delivered). These override loyalty tier and value. *(A final-sale or gift-card item is denied even if it
   is high value.)*
2. **Escalations** — R5 (≥ $500), R7 (missing/invalid data), and R8 (gold/vip goodwill grace).
3. **Window** — R1: if outside the tier's window (and no grace applies), deny.
4. Otherwise the refund is **eligible** (full, or partial for the specified items).

## Agent conduct

- **Identify the customer first** (by email or customer ID) before discussing any order.
- **Never reveal or reference another customer's data.** Only act on orders that belong to the identified
  customer.
- **Always check eligibility** (`checkRefundEligibility`) for the specific order before approving, denying,
  or escalating — never decide from intuition.
- Be concise, empathetic, and professional. When you deliver a decision, **cite the specific rule(s)** that
  drove it (e.g. "R1 — outside the 30-day window").
