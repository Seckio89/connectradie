# Three-Stage Quote Flow — State Machine & Implementation Reference

**Status:** design doc, partially implemented (backend foundation deployed). UI surface pending.

This document is the single source of truth for the `flow_version = 2` quote flow.
Every transition, side effect, cross-cutting rule, and edge case decision lives
here. UI, edge functions, and tests should all be checkable against this spec.

The legacy `flow_version = 1` flow (single-step "Deposit & Book Site Visit") is
**unchanged** and continues to coexist on existing jobs.

---

## 1. Glossary

The terminology choices below are deliberate — they map onto Australian Consumer
Law (ACL) definitions and matter for compliance.

| Term | Definition | Binding? |
|---|---|---|
| **Estimate** | Initial price submission from a tradie. May be a range (`price_min` / `price_max`) or a single number (`firm_price`). Conditional on later refinement (typically a site visit). | **No** |
| **Site visit** | Inspection by the tradie at the client's premises. No money moves. Address is shared with that tradie at this point. | N/A |
| **Final quote** | Tradie's binding offer after any required site visit. `final_price` is set; `final_valid_until` should be set. | **Yes** |
| **Acceptance** | Client picks one final quote → contract formed → Stripe escrow lands. Other quotes on the job auto-reject. | Terminal |
| **Quote** (legal) | Strictly the binding `final_submitted` row. The `pending` row is an *estimate* in ACL terms, even though the table is named `quotes`. UI must use the right word per state. | — |

---

## 2. Job-level flag

```
jobs.flow_version   smallint NOT NULL DEFAULT 1
  1 = legacy single-step accept-and-pay flow
  2 = 3-stage estimate / site visit / final quote / pay flow
```

`flow_version` is set at job creation and **never changes** during the job's
life. It governs which edge functions are valid for the job's quotes.

---

## 3. Quote states (flow_version = 2)

| Status | Meaning | Terminal? |
|---|---|---|
| `pending` | Initial estimate submitted. Awaiting client action. | No |
| `site_visit_scheduled` | Client has booked the site visit. Address now visible to this tradie. | No |
| `site_visit_completed` | Tradie has marked the visit done. Awaiting their final quote. | No |
| `final_submitted` | Binding final quote in (`final_price` set). Awaiting client decision before `final_valid_until`. | No |
| `accepted` | Client picked this quote. Escrow lands here. Job advances to `accepted`/`funded`. | **Yes** |
| `declined` | Client picked another tradie's quote, or explicitly declined this one. | **Yes** |
| `withdrawn` | Tradie pulled out of their own quote at any pre-acceptance stage. | **Yes** |
| `expired` | `final_valid_until` passed without acceptance. | **Yes** |

The legacy flow_version=1 only uses `pending`, `accepted`, plus implicit cancellation.

---

## 4. State transition table

> Notation: **Q** = the quote row, **J** = its parent job, **F** = `J.flow_version`.
> All transitions assume `F = 2` unless noted.

| # | From | To | Trigger | Preconditions | Side effects |
|---|---|---|---|---|---|
| T1 | `pending` | `site_visit_scheduled` | Client books site visit | `Q.requires_site_inspection = true`. User is `J.client_id`. | Set `site_visit_scheduled_at = now()`. Notify tradie. Reveal `J.location_address` to tradie. |
| T2 | `pending` | `final_submitted` | Tradie submits binding quote (fast path) | `Q.requires_site_inspection = false`. Tradie sets `final_price` > 0 and `final_valid_until`. | Set `final_submitted_at = now()`. Notify client. |
| T3 | `pending` | `withdrawn` | Tradie withdraws estimate | Tradie owns the quote. | Notify client (only if client has seen it; soft-notify). |
| T4 | `pending` | `declined` | Client declines this estimate | Client owns the job. | Notify tradie. |
| T5 | `site_visit_scheduled` | `site_visit_completed` | Tradie marks visit done | Tradie owns the quote. `site_visit_scheduled_at` is set. | Set `site_visit_completed_at = now()`. Notify client. |
| T6 | `site_visit_scheduled` | `pending` | Client reschedules (cancels visit, keeps tradie) | Client owns the job. | Clear `site_visit_scheduled_at`. Notify tradie. (Address remains visible — once seen, can't be un-shared; flagged in the lawyer one-pager.) |
| T7 | `site_visit_scheduled` | `withdrawn` | Tradie pulls out after agreeing to visit | Tradie owns the quote. | Notify client. |
| T8 | `site_visit_scheduled` | `declined` | Client cancels & moves on | Client owns the job. | Notify tradie. |
| T9 | `site_visit_completed` | `final_submitted` | Tradie submits binding quote | `Q.site_visit_completed_at` is set. Tradie sets `final_price` > 0 and `final_valid_until`. | Set `final_submitted_at = now()`. Notify client. |
| T10 | `site_visit_completed` | `withdrawn` | Tradie pulls out after visit | Tradie owns the quote. | Notify client. |
| T11 | `final_submitted` | `accepted` | Client accepts & pays | `final_valid_until >= today`. Stripe checkout completes. | **`accept-and-pay`** runs full escrow flow. **Cascade-decline all other non-terminal quotes on the same job (see §5.1).** Job → `accepted` → `funded`. |
| T12 | `final_submitted` | `withdrawn` | Tradie revokes their final before acceptance | Tradie owns the quote. | Notify client. |
| T13 | `final_submitted` | `declined` | Auto: client accepted a different quote on the same job | Cascade from T11 on a sibling quote. | Notify tradie ("Thanks for quoting — the client went with someone else."). |
| T14 | `final_submitted` | `expired` | `final_valid_until` passed without acceptance | Server-side check on read or via cron (see §5.4). | Notify tradie (optional). |

### 4.1 Transitions that DO NOT exist (intentional)

| Attempted | Reason it's blocked |
|---|---|
| any → `pending` | (except T6) Re-opening a terminal quote is not allowed. Tradie can submit a new quote. |
| `accepted` → anything | Acceptance is terminal. Job lifecycle (`accepted → funded → in_progress → completed`) handles the rest. |
| `final_submitted` ↔ `final_submitted` (edit) | Submitted finals are **locked** under ACL anti-misleading. To change, tradie withdraws (T12) and submits a new quote. |
| skip from `pending` directly to `accepted` (when `F=2`) | Blocked by `accept-and-pay` guard. Tradie must submit final first. |

---

## 5. Cross-cutting rules

### 5.1 Cascade-decline on acceptance

When `accept-and-pay` flips quote A → `accepted`:

```sql
UPDATE quotes
SET status = 'declined'
WHERE job_id = <A.job_id>
  AND id <> <A.id>
  AND status IN ('pending', 'site_visit_scheduled', 'site_visit_completed', 'final_submitted');
```

Each declined tradie gets a notification: "Thanks for quoting — the client went
with another tradie this time."

### 5.2 Address visibility

| Quote status | Tradie sees |
|---|---|
| `pending` (estimate) | Suburb only (`location_address.split(',')[0]`). |
| `site_visit_scheduled` and later | Full `jobs.location_address`. |
| Terminal states except `accepted` | Suburb only (history). |
| `accepted` | Full address (active job). |

UI enforces this in `JobDetailModal`, `JobManagementModal`, `QuoteComparisonView`,
and anywhere tradies see job details. Backend does not currently RLS this —
**flagged as a hardening item in §7**.

### 5.3 Job cancellation cascade

When `jobs.status` → `cancelled` or `declined`:

```sql
UPDATE quotes
SET status = 'withdrawn'
WHERE job_id = <J.id>
  AND status IN ('pending', 'site_visit_scheduled', 'site_visit_completed', 'final_submitted');
```

(Choice of `withdrawn` over `declined` reflects that the job — not the tradie's
quote — went away. Notifications can be customised.)

### 5.4 Expiry enforcement

`final_valid_until` is a date. Enforcement options, in order of preference:

1. **Server-side check on accept** *(MVP — required)*. `accept-and-pay` returns
   `409` if `final_valid_until < today`. The quote stays as `final_submitted`
   in the DB until a sweep runs.
2. **Display gate in the UI** *(MVP — required)*. Quotes with expired
   `final_valid_until` render as "Expired" and the Accept button is disabled.
3. **Nightly sweep cron** *(post-MVP)*. A function flips
   `final_submitted` → `expired` for all rows past validity.

MVP ships with (1) and (2); (3) is a follow-up to keep the DB clean.

### 5.5 Final price vs estimate range — ACL anti-misleading

The tradie's `final_price` may differ from `price_min`/`price_max`. Rules:

- **No hard limit.** A higher final price is legitimate if discovered at site
  visit (concealed damage, harder access, etc.).
- **UI must show the original estimate range alongside the final** so the client
  has full context. Render the delta clearly: "Estimate: $600–$1000 · Final: $1200
  (+$200 above range)".
- **If `final_price > price_max * 1.25`**, the UI shows a yellow advisory:
  "Final is significantly above the estimate range. The tradie should explain
  why." Not blocking — the client decides. The tradie's `message` field is the
  natural place for the explanation; UI should prompt for it on final submission.
- This is documented behavior — not legal advice. Sign-off in lawyer one-pager.

### 5.6 No-site-visit fast path

If the tradie's initial estimate has `requires_site_inspection = false` and a
`firm_price`, the submission step can write `status = 'final_submitted'`
directly (T2) with `final_price = firm_price` and a default
`final_valid_until = created_at + 14 days`. This collapses stages 1–3 into a
single tradie action when no visit is needed.

The UI distinguishes this in the quote card: "Final quote — no site visit
required."

### 5.7 Quote lock

Once `final_submitted_at` is set, the following columns are **immutable** for
that row:

- `firm_price`, `price_min`, `price_max`
- `final_price`
- `final_valid_until`
- `includes_materials`
- `estimated_duration`
- `proposed_start_date`
- `message`

Implementation: a Postgres trigger (post-MVP) or, for MVP, enforced in edge
functions and UI. To "edit" a submitted final, the tradie withdraws (T12) and
creates a new quote.

---

## 6. Field invariants per state

| Field | `pending` | `site_visit_scheduled` | `site_visit_completed` | `final_submitted` | `accepted` |
|---|---|---|---|---|---|
| `price_min`, `price_max` | required | required | required | required | required |
| `firm_price` | optional | optional | optional | optional | optional |
| `final_price` | null | null | null | **required (>0)** | required |
| `requires_site_inspection` | set | set & true | set & true | set | set |
| `site_visit_scheduled_at` | null | **set** | set | set | set |
| `site_visit_completed_at` | null | null | **set** | set if visit was req. | set if visit was req. |
| `final_submitted_at` | null | null | null | **set** | set |
| `final_valid_until` | null | null | null | **required** | required (snapshot) |
| `accepted_at` | null | null | null | null | **set** |

A migration follow-up could add CHECK constraints encoding these invariants.
MVP enforces them in edge functions; the data model permits stricter constraints
later.

---

## 7. Hardening items (post-MVP)

Listed here so they're not forgotten:

1. **RLS for address visibility.** Currently UI-enforced. Add an RLS policy or
   a view that hides `jobs.location_address` for tradies whose only quote on
   the job is in `pending` status.
2. **Postgres trigger for quote-lock.** Reject updates to locked columns
   on rows where `final_submitted_at IS NOT NULL`.
3. **Nightly expiry sweep cron.** §5.4 option (3).
4. **CHECK constraints** for the invariants in §6.
5. **State-transition audit log.** `quote_state_transitions` table (or use
   existing `audit_logs` if present) to record every status change with actor
   + timestamp. Critical for disputes and ACL accountability.
6. **Site-visit deposit (refundable).** Optional layer added later for
   disintermediation defense — see lawyer one-pager.

---

## 8. Co-existence with flow_version = 1

The legacy flow continues for any job created before this change (`flow_version
= 1` by default). Key compatibility points:

| Concern | flow_version=1 (legacy) | flow_version=2 (3-stage) |
|---|---|---|
| Estimate submission | Tradie submits quote, status `pending` | Same. |
| Client action on `pending` | Click "Deposit & Book Site Visit" → `accept-and-pay` accepts the pending quote and lands escrow. | Client clicks "Book Site Visit" → `book-site-visit` flips to `site_visit_scheduled`. **No money moves.** |
| Final price changes | Handled post-deposit via `adjust-quote-price` (existing). | Handled pre-deposit at `final_submitted` (new). `adjust-quote-price` is unused on v2 jobs. |
| Acceptance | Quote in `pending` or `accepted`. | Quote must be `final_submitted` (or `accepted` for resumption). Guard in `accept-and-pay` enforces this. |
| Address sharing | At deposit acceptance. | At site-visit booking. |

`adjust-quote-price` remains live for in-flight v1 jobs. Once all v1 jobs drain,
it can be retired.

---

## 9. Implementation status

| Piece | State |
|---|---|
| Migration (columns + `flow_version`) | ✅ Applied to live DB |
| `book-site-visit` edge function | ✅ Deployed (v1, verify_jwt:true) |
| `accept-and-pay` guards | ✅ Deployed (v28) — `final_submitted` accepted, `pending` rejected on v2 jobs |
| `submit-final-quote` edge function | ⏳ Not yet built (needs §5.5 advisory logic) |
| Cascade-decline on accept (§5.1) | ⏳ Not in `accept-and-pay` yet |
| TS types regeneration | ⏳ |
| Quote-card UI (5 status variants) | ⏳ |
| Client compare-finals view | ⏳ |
| Tradie-side submit-final UI | ⏳ |
| Expiry check on accept (§5.4 #1) | ⏳ |
| Expiry display gate (§5.4 #2) | ⏳ |
| Cancellation cascade (§5.3) | ⏳ — needs a trigger or call site in the job-cancel path |
| Lawyer one-pager | ⏳ |

Hardening items (§7) are all post-MVP.

---

## 10. Open product questions

These do not block implementation but should be answered before launch:

1. **Site-visit deposit** — yes/no, refundable, who pays? See lawyer one-pager.
2. **Tradie non-circumvention clause** — duration (6 vs 12 months), enforcement
   posture.
3. **Default `final_valid_until`** — 14 days? 30? Per-trade?
4. **No-show policy** — what happens if the tradie books a visit and doesn't
   show? Manual report → ticket, for MVP.
5. **Re-quote allowed?** After a quote is `expired` or `withdrawn`, can the
   same tradie submit a new quote on the same job? Default: yes, unlimited.

---

## 11. Operational edge cases (not state-machine concerns)

Listed for completeness; do not change transitions.

1. **Tradie books a visit and no-shows.** Manual report → support ticket → admin
   can flip the quote to `withdrawn` and add the tradie to a watch list. No
   automated detection in MVP.
2. **Client books multiple site visits and feels overwhelmed.** UI shows a
   visible counter ("2 of 3 site visits booked") so they're never surprised.
3. **Tradie takes >7 days in `site_visit_completed` to submit final.** A reminder
   notification fires at 48h (reuse the `send-invoice-approval-nudge` pattern).
   No auto-state-change in MVP.
4. **Tradie submits final without filling `final_valid_until`.** Backend
   defaults to `created_at + 14 days` (configurable per trade later).
5. **Client signed in as the wrong account.** All client-side mutations check
   `auth.uid() = jobs.client_id`. Existing pattern; no new code needed.
6. **`max_quotes` reached on the job.** Existing behavior — new quote
   submissions blocked at the post-lead stage. Unchanged.
7. **Tradie's licence expires between estimate and acceptance.** Existing
   `check-license-expiry` cron flags it; UI shows the warning at the
   compare-finals stage so the client sees the risk before clicking accept.
8. **GST status change between estimate and acceptance.** `final_price` is
   binding; the GST/processing-fee calculation in `accept-and-pay` uses the
   tradie's *current* GST status at acceptance time, matching v1 behaviour.
9. **Repeat client + tradie pair.** No special handling — Ongoing Services
   feature already covers recurring work and bypasses the quote flow entirely
   for that case.
