# Platform Audit Report — 2026-08-22

Full 7-dimension audit of `master` at `af884e6`, run at the owner's request with
**live production verification** and a **54-agent adversarial money-path
deep-hunt** on top of the standard checklist. Every money/auth finding below was
either verified by reading the cited source directly or survived independent
adversarial verification (the deep-hunt confirmed **22 findings, refuted 0**).
Baseline for comparison is the 08-03 nightly (94.3%). 83 commits have landed
since 08-01; the fleet is now **76 edge functions** (77 deployed — see the
orphan) and **353** migrations.

## Read this first

This audit scores **69% 🔴**, against 94.3% 🟢 three weeks ago. **Nothing
regressed** — several things improved (lint backlog cleared, double-title fixed,
escrow copy fixed, two IDOR RPC oracles closed). The number fell because the
depth rose: this cycle read **every edge function end to end** and ran
**adversarial finders across the money paths**, and that surfaced a large body
of pre-existing HIGH/CRITICAL integrity gaps the surface-level nightly checklist
scored as passing. The 94.3% and the 69% measure the same code at different
depths.

**The money paths are the story.** There is **1 CRITICAL and ~14 HIGH**
money/auth defects, most of them in escrow, payouts, refunds, and recurring
BECS billing. Several are directly exploitable by an ordinary user against the
platform or a counterparty. This needs owner attention before the platform
should be considered production-solid.

Scoring note: a partially-passing check is credited at 0.5 this cycle (vs the
nightly's binary pass/fail), so absolute numbers are not directly comparable to
the trend line. The findings are what matter.

## Summary

| Dimension | Score | Weight | Contribution | Status | vs 08-03 |
|-----------|-------|--------|--------------|--------|----------|
| Security & Auth | 75% | 25% | 18.8% | 🟡 | ▼ 100 |
| Payments & Stripe | 52% | 25% | 13.0% | 🔴 | ▼ 100 |
| Database & RLS | 88% | 20% | 17.6% | 🟡 | ▼ 92.9 |
| TypeScript Safety | 79% | 10% | 7.9% | 🟡 | ▼ 100 |
| UI & Design System | 50% | 5% | 2.5% | 🔴 | ▼ 71.4 |
| Navigation | 86% | 5% | 4.3% | 🟡 | ▼ 100 |
| Test Coverage | 50% | 10% | 5.0% | 🔴 | ▼ 71.4 |
| **Overall** | **69%** | | | 🔴 | ▼ 94.3 |

## What was actually run

| Instrument | Result |
|---|---|
| `npm run typecheck` / `typecheck:edge` | ✅ 0 errors / 76 of 76 |
| `npm run test:run` | ✅ 40 files, **1027 tests** pass (was 958/33) |
| `npm run lint` | ✅ **0 errors**, 54 warnings — **closes #21** |
| `check:columns` · `check:migrations` · `check:cron-auth` · `check:nav:ci` · `check:ink` · `check:tokens` · `check:edge-docs` · `check:secrets` · `check:sinks` | ✅ clean, 0 new vs baseline |
| `check:edge-drift` | ✅ 27/27 deployed money functions match `origin/master` |
| `check:deps` | ⚠️ **broken** — reports "no output" while `npm audit` shows **2 moderate** |
| `check:drift` · `check:ledger` | ⚠️ skipped (no `SUPABASE_ACCESS_TOKEN`) |
| `check:contrast` | ⚠️ 33 surfaces, **0 AA failures**; 18 app routes unmeasured (redirect to /login) |
| Live prod (read-only): RLS, advisors, HTTP probes, logs | ✅ run |
| **Adversarial deep-hunt** (54 agents, perspective-diverse finders + 2 refuters/finding) | ✅ **22 confirmed, 1 plausible, 0 refuted** |

## CRITICAL

**C1 · `charge-becs-invoice` never checks invoice status.** The function loads
the invoice without selecting `status` and goes straight to a confirmed
off-session BECS bank debit. The status enum includes `disputed`, `cancelled`,
`paid`, `processing`; the state filter lives only in the cron caller, not in the
function that moves money — and the function is a deployed endpoint the invoice's
tradie can invoke with their own JWT. A client disputes their $800 invoice
(cron skips it); the tradie POSTs `charge-becs-invoice` and the client's bank is
debited $800 despite the active dispute. A previously-paid invoice re-submitted
after the ~24h Stripe idempotency window mints a second debit.
`charge-becs-invoice/index.ts:88`. *(Debiting a bank account against a disputed
invoice is AFSL-sensitive; fix before anything else on the BECS path.)*

## HIGH — money integrity

**H1 · `release-escrow` never checks `disputes.blocks_release`.** The
client-clicked release path contains zero references to the disputes table
(grep-confirmed, independently verified twice). The ratified policy makes
`blocks_release` the *only* payout-freeze decider, but only the cron consults it.
Two failure modes: (a) any release during an open dispute flips the funding row
to `released`, so `resolve-dispute-split` then finds no completed row and 409s —
the dispute is permanently stuck and the tradie is paid in full; (b) racing a
release against an admin split fires a full payout under `release_payout_<id>`
and the split leg under a *different* key `dispute_split_payout_<disputeId>`, so
both settle and the account is over-drained from pooled escrow. **A cardholder
can raise a chargeback and immediately Approve & Release — direct, unrecoverable
platform loss.** `release-escrow/index.ts`.

**H2 · `verify-payment` marks any invoice paid with an unrelated cheap session.**
The session-to-invoice binding runs only `if (invoice.stripe_checkout_session_id)`;
NULL-session invoices (BECS/most recurring) accept **any** caller-supplied paid
session with **no amount check**. A homeowner uses a $4.99 estimate-pack session
to mark an arbitrarily large invoice `paid`; the tradie sees paid and is never
transferred the money. `verify-payment/index.ts:102`.

**H3 · Resumed checkout charges the estimate, not the binding `final_price`.**
For a `flow_version=2` quote, the `final_price` override and the site-visit-fee
credit are both gated on `!alreadyAccepted`. On a resumed accept (status already
`accepted`) both are skipped and the amount falls back to `firm_price ?? price_max`
— the estimate ceiling, never the binding final price `submit-final-quote` wrote.
A client (or the job's own client re-POSTing the accepted `quoteId`) funds
$3,000 of a $5,000 job; `budget_amount` still says $5,000. Symmetric overcharge
if `final_price < price_max`. `accept-and-pay/index.ts:210`.

**H4 · `process-refund` refunds one payment but cancels the whole job.** It
refunds exactly the passed `paymentId`, then unconditionally cancels the entire
job and tells both parties funds were "returned in full." Paid variations
(completed `price_adjustment` children) and extra milestone `job_funding` rows —
destination charges already in the tradie's balance — are neither refunded nor
released (the cron only scans `completed` jobs, and this one is now `cancelled`).
The client is told they got everything back while $500 of variation money stays
with the tradie for cancelled work. Client-reachable pre-completion.
`process-refund/index.ts:290`.

**H5 · Price decrease leaves `metadata.gst` stale → escrow over-pays refunded
GST.** A price reduction refunds the client the GST on the delta but never
rewrites `metadata.gst`, which both release paths add to the destination payout.
The tradie is paid out the GST already refunded to the client (drawn from other
jobs' pooled escrow), or the payout is stranded on a balance pre-flight. A later
full refund also 500s because `process-refund` sums the stale GST beyond the PI's
refundable amount. GST-registered tradies only. `adjust-quote-price:293`,
`approve-price-reduction:282`.

**H6 · Settled `price_adjustment` after parent release is stranded forever.**
The code deliberately accepts variation money that lands after the release
window lapses ("settled money outranks the clock") — but only the budget is
handled, not the payout. If the parent auto-releases while the child is still
`pending`, nothing ever pays the child: the cron scans `job_funding` only,
`release-escrow` 400s on a released parent, and `escrowReserve` counts the child
as reserve so `sweep-connect-balance` withholds exactly that amount permanently.
Client charged; tradie never receives it. `stripe-webhook/index.ts:967`.

**H7 · Escrow reserve permanently counts paid-out recurring invoices.**
`fetchEscrowReserveCents` has no `payment_type` filter and counts every
`recurring_invoice` row as still-held escrow — but that row is never stamped with
`payout_id`/`released` (payout is tracked on `recurring_invoices` instead). Every
recurring invoice a tradie was ever paid accretes into their reserve, so
`sweep-connect-balance` (the new PR #268 cron) computes `free = available −
reserve ≤ 0` and skips them forever, and `instant-payout` shows $0. The
stranded-balance bug the sweep was built to fix is reintroduced through its
reserve. `_shared/escrowReserve.ts:187`.

**H8 · `create-job-deposit` trusts the deposit amount from the client.** Only
`typeof === "number" && > 0`; never compared to the quote/budget, then charged as
the `job_funding` escrow row that auto-starts the job. Client funds $1, job goes
`in_progress`, tradie works against near-empty escrow.
`create-job-deposit/index.ts:87`.

**H9 · `pay-milestone` can charge a milestone repeatedly.** Nothing ever flips a
milestone out of `status='approved'` after payment (grep-confirmed), and there is
no server-side dedupe. A double-click or retry charges the client twice for one
milestone; both land as `job_funding` and both release. `pay-milestone:103`.

**H10 · Recurring invoices can bill the same sessions repeatedly.**
`billingPeriodStart/End` come from the request body, sessions are never marked
invoiced, and the only dedupe is an exact match on `billing_period_start`. A
tradie invoices `Aug 1–14`, then `Jul 31–14`; the second passes the guard and —
on the BECS path — immediately debits the client again for the same sessions with
no approval step. `generate-recurring-invoice/index.ts:126`.

**H11 · BECS "failure" fallback to card can double-charge.** When the BECS debit
appears to fail, the flow mints a card checkout link — but the debit may already
be in flight, so the client can pay both. `generate-recurring-invoice`
(BECS→card fallback path).

**H12 · `charge-becs-invoice` cross-account bank debit.** The mandate is loaded
purely by the caller-supplied `recurringJobId`, ownership is enforced only on the
*invoice*, and the invoice is never checked to belong to that recurring job. An
attacker-tradie with a large invoice on their own service and knowledge of a
victim's `recurring_job_id` debits the **victim client's** bank account and routes
the funds to their own Connect account. Mitigated only by needing the victim's
UUID (not exposed by this endpoint) — but the authorization defect is real and
CRITICAL-class. `charge-becs-invoice/index.ts:76`.

**H13 · `create-job-payment-checkout` frozen-fee write is unchecked.** If the
post-session update that writes the frozen `platform_fee` fails, the client pays,
release-escrow's `typeof === "number"` guard reads the fee as absent, and the
tradie is paid the **full amount** — platform loses its commission.
`create-job-payment-checkout/index.ts:305`.

## HIGH — authorization & revenue

**H14 · Lead-unlock $15 paywall is bypassable.** The `connections` INSERT policy
is `WITH CHECK (auth.uid() = tradie_id)` — it checks ownership, never payment.
The frontend inserts the row directly, and contact-reveal keys entirely off this
table. Any authenticated free-tier tradie runs one `supabase.from('connections').insert(...)`
in the console and unlocks any client's contact details for $0 (the row even
defaults `amount_paid = 15.00`, so it looks paid). `20260110111119_add_connections_table.sql:37`.

**H15 · `send-sms` lets any user send arbitrary SMS to any number.** After a
bare `getUser`, `to`/`body` go straight to Twilio with no recipient-ownership
check; the rate limit is per-destination-number and rotating numbers bypasses it.
Toll fraud and brand-impersonation phishing on the platform's Twilio — the exact
abuse `send-email` was locked down for. `send-sms/index.ts:68`.

## Selected MEDIUM (full list in the table)

- **Four cron functions accept the public anon key** (`generate-recurring-sessions`,
  `send-invoice-reminders`, `send-lead-reminders`, `send-recurring-reminders`) — a
  real auth bypass (source-confirmed) on service functions; blast radius is
  session/notification spam and DB load, not money or PII, hence MEDIUM. Fix =
  `hasServiceRole`.
- **Client `price_adjustment` sums are anchored differently** in the two release
  paths (`parent_payment_id` vs `job_id`) — on a multi-funding job a race pays the
  adjustment twice.
- **`checkout.session.completed` swallows all errors then ACKs 200**, defeating the
  documented webhook-retry design — an estimate-pack purchase can take the money
  and never grant credits with no retry.
- **`payment_intent.succeeded` job_funding fallback never advances job status** —
  if `checkout.session.completed` is never delivered, the job strands at `accepted`
  with money captured and no self-heal.
- **`geofence-event` has no tradie↔job authorization** — records site visits and
  fires "tradie arrived" notifications for any job (IDOR).
- **Contact-info redaction is client-side only** — full message text and sender
  email are shipped to the browser regardless of payment.
- **`calculate-job-fees` serves the retired V2 + processing-fee model** — every
  number it shows disagrees with what `resolveChargeFee` actually charges.
- **`access-pin` reset code** uses `Math.random()` with no attempt limit
  (brute-forceable PIN reset unlocking gate/alarm codes).
- **Client-supplied Stripe `priceId`** with no server allow-list
  (`create-checkout-session`, `stripe-checkout`) — self-subscribe to Pro at an
  unintended price.
- **`tradie_details` readable by every authenticated user** via `SELECT
  USING(true)` (acute PII already split to `profile_private`); **`client_errors`**
  allows unbounded anon INSERT.
- **Dispute split touches only the newest `job_funding` row**; siblings release in
  full on close.
- **Public FAQ says escrow auto-releases after 48h** (real window is 5h) and that
  the *client* marks the job complete (ratified policy: the *tradie* does).
- **Dead marketing nav anchors** `/#for-tradies`, `/#how-it-works` (no target
  elements).
- **`font-ct-mono` rule unimplemented on every money screen** (design-system
  HIGH, dimension-local); amber used decoratively; booked slots rendered rose.
- **62 of 75 edge functions have no handler-level test**; `auto-release-payments`
  excluded from the guard suite; 1 of 65 pages tested.

## Evidence by dimension

**Payments & Stripe — 52% 🔴.** The foundations pass outright and are genuinely
solid: escrow is destination-charge only (Stripe holds funds, never the
platform), webhook signatures validate with an event-id dedupe table, and AFSL
copy attributes custody to Stripe. Everything else fails under adversarial
inspection: the release path skips `blocks_release` (H1), amounts are
client-trusted (H8), idempotency is missing or wrongly-anchored across multiple
paths (H9, H10, M-double-anchor), GST/fee accounting drifts on reductions and
adjustments (H5, H13), and there are at least three ways for collected money to
strand permanently (H6, H7, PI-fallback). The ratified `RELEASE_WINDOW_HOURS = 5`
is in sync across both files and the auto-release policy is correctly implemented
on the cron.

**Security & Auth — 75% 🟡.** RLS enabled on all 109 tables, no hardcoded
secrets, webhook signatures validate, CORS holds against a hostile origin, and
the previously-flagged IDOR RPC oracles are fixed. Deductions: the cross-account
bank debit (H12), the lead-unlock paywall bypass (H14), `send-sms` (H15), the
anon-key cron bypass, the `geofence-event` IDOR, partial input validation (money
inputs accept NaN via `typeof`-only checks), and several functions still
identifying the service role by byte-compare or unverified JWT-role claim rather
than the `hasServiceRole` probe.

**Database & RLS — 88% 🟡.** All tables RLS-enabled, `auth.uid()` used correctly
(no `current_user` in any policy), FK/composite indexes well covered. Deductions:
`client_errors` unbounded anon INSERT, `tradie_details` authenticated-read, the
`connections` paywall-RLS gap (H14), two dead admin gates (`app_settings`,
`system_settings` keyed to identities no account holds), and a `notifications`
INSERT policy that regressed to `WITH CHECK(true)` four times before its final
lockdown.

**TypeScript — 79% 🟡.** Hard rules met (`typecheck` 0, `src/` free of explicit
`any`). Deductions are quality-layer: four data-heavy pages hand-roll row types
via `as unknown as`, several reads swallow `.error`, and `_shared/instantPayout.ts`
plus five helpers carry `any` on money paths (edge functions get no typecheck).

**UI & Design System — 50% 🔴.** Mechanical checks pass (`check:ink`,
`check:tokens`; hex only in exemptions). The judgment layer fails: `font-ct-mono`
is unimplemented on every money figure, the semantic colour rule is diluted
(decorative amber, booked-slots-as-rose), nested dim tints appear in banners, and
three components inject inline `<style>` keyframes with no `prefers-reduced-motion`
guard. #28 (double-title) and #29 (Pricing escrow heading) are **fixed**.

**Navigation — 86% 🟡.** All routes reachable, role-gating consistent, #28
resolved. One real defect: two of four marketing nav links (`/#for-tradies`,
`/#how-it-works`) point at element ids that exist nowhere.

**Test Coverage — 50% 🔴.** Substance improved (1027 tests) but 62/75 edge
functions and 64/65 pages have no test, and the guard suite omits
`auto-release-payments`. E2E covers the critical flows but never asserts a
successful login in the default suite.

## Live verification (read-only, production)

- **RLS:** 109/109 tables enabled; `USING(true)` writes only on `service_role`
  (except `client_errors`); permissive SELECT only on public tables (+
  `tradie_details`).
- **HTTP probes:** `stripe-webhook` unsigned → 400; `release-escrow` /
  `instant-payout` no-auth → 401; `mark-invoice-paid` / `send-email`
  (`verify_jwt=false`) → 401 via in-function guard; hostile-origin preflight
  returns the allow-listed origin, not reflected.
- **Advisors:** 4 deny-all service tables (intentional), ~32 `authenticated`
  SECURITY DEFINER RPCs (ratified pattern; the IDOR-oracle cases already fixed —
  deep-hunt confirmed the flagged ones are correctly guarded), ~57 unused indexes
  (#11), 2 multiple-permissive-policies, auth pool absolute (#12).
- **Edge fleet:** 77 deployed vs 76 in the repo. Orphan `debug-anthropic` (410
  stub, self-commented "safe to delete"). No recent 5xx in logs.

## All findings (severity-ranked)

| # | Sev | Dimension | File | Finding |
|---|-----|-----------|------|---------|
| C1 | CRITICAL | Payments | charge-becs-invoice:88 | No invoice-status check → disputed/cancelled/paid invoice bank-debited |
| H1 | HIGH | Payments | release-escrow | Manual release never checks `blocks_release`; chargeback→release→loss / stuck dispute |
| H2 | HIGH | Payments | verify-payment:102 | Invoice markable paid with an unrelated cheap session; no amount check |
| H3 | HIGH | Payments | accept-and-pay:210 | Resumed checkout charges estimate, not binding `final_price` |
| H4 | HIGH | Payments | process-refund:290 | Refunds one payment, cancels whole job, strands paid variations/milestones |
| H5 | HIGH | Payments | adjust-quote-price:293 | Price decrease leaves `metadata.gst` stale → over-pays refunded GST |
| H6 | HIGH | Payments | stripe-webhook:967 | `price_adjustment` settling after parent release stranded forever |
| H7 | HIGH | Payments | _shared/escrowReserve.ts:187 | Reserve counts paid-out recurring invoices → collapses sweep + instant-payout |
| H8 | HIGH | Payments | create-job-deposit:87 | Deposit `amount` trusted from client → fund $1, auto-start job |
| H9 | HIGH | Payments | pay-milestone:103 | Milestone never marked paid + no dedupe → repeat charges |
| H10 | HIGH | Payments | generate-recurring-invoice:126 | Caller billing period + no session claim → re-bill/re-debit same sessions |
| H11 | HIGH | Payments | generate-recurring-invoice | BECS failure→card fallback can double-charge |
| H12 | HIGH | Security | charge-becs-invoice:76 | Caller `recurringJobId` not bound to invoice → cross-account bank debit |
| H13 | HIGH | Payments | create-job-payment-checkout:305 | Unchecked frozen-fee write → release pays full amount |
| H14 | HIGH | Security/DB | connections RLS | Lead-unlock $15 paywall bypass — INSERT requires no payment proof |
| H15 | HIGH | Security | send-sms:68 | Any user sends arbitrary SMS to any number |
| H16 | HIGH | UI | money screens | `font-ct-mono` rule unimplemented on every dollar figure |
| H17 | HIGH | Tests | supabase/functions | 62/75 edge functions untested; auto-release-payments excluded from guards |
| M1 | MED | Security | 4 cron functions | Public anon key accepted as authorization (non-money blast radius) |
| M2 | MED | Payments | auto-release-payments:281 | Child sums anchored differently in two release paths → double-pay on race |
| M3 | MED | Payments | stripe-webhook:1716 | `checkout.session.completed` swallows errors, ACKs 200 → no retry |
| M4 | MED | Payments | stripe-webhook:923 | PI-succeeded fallback never advances job status → job stranded at `accepted` |
| M5 | MED | Payments | instant-payout | Ignores negative pending balance → extract ahead of a settling refund |
| M6 | MED | Security | geofence-event | Records visits / fires notifications for any job — no tradie↔job authz |
| M7 | MED | Security | Messages.tsx:795 | Contact redaction client-side only; full text + sender email shipped |
| M8 | MED | Payments | calculate-job-fees | Serves retired V2+processing-fee model; numbers disagree with real charge |
| M9 | MED | Payments | generate-auto-invoices | No unique constraint on (recurring_job_id, billing_period_start) |
| M10 | MED | Payments | resolve-dispute-split:127 | Split touches only newest job_funding row; siblings release in full |
| M11 | MED | Security | access-pin:190/214 | PIN reset code `Math.random()` + no attempt limit |
| M12 | MED | Security | create-checkout-session / stripe-checkout | Client-supplied Stripe `priceId`, no allow-list |
| M13 | MED | Payments | stripe-webhook:1272 | `checkout.session.completed` update has no status filter → resurrect terminal rows |
| M14 | MED | Payments | accept-and-pay:286 | Stale pending session never expired → double-charge window |
| M15 | MED | Database | tradie_details | Readable by every authenticated user via `SELECT USING(true)` |
| M16 | MED | Database | notifications | INSERT `WITH CHECK(true)` regressed 4× before final lockdown |
| M17 | MED | Payments | stripe-connect-account:146 | `onboarding_complete` set from `details_submitted`; never reset false |
| M18 | MED | Payments | pay-price-increase:276 | Adjustment children carry no commission split → commission with no tax invoice |
| M19 | MED | UI | ChatDrawer / TradieDashboard | Decorative amber; booked slots in rose; nested dim tints |
| M20 | MED | Copy | FAQ / seoContent | States 48h auto-release (real 5h) and client-marks-complete (tradie does) |
| M21 | MED | Navigation | Navbar:40 / Footer:14 | Dead hash anchors (no target elements) |
| M22 | MED | Tests | src/pages | 1 of 65 pages tested; guard suite covers only pre-DB refusals |
| L1–L20 | LOW/INFO | mixed | — | Discovery view exposes exact postcode; `accept_cancellation_terms` authz; legacy custodial release omits GST; AI meter read-then-spend; service-role byte-compare / unverified JWT-role (5 fns); weak redirect validation (5 fns); `verify-license`/`verify-abn` `*_verified` on format alone; raw `err.message` to clients; `mark-invoice-paid` accepts cancelled; hand-rolled types; inline `<style>`; `check:deps` broken; `debug-anthropic` orphan; unused indexes (#11); auth pool (#12); `UnlockLeadModal` "lead" (#30) |

Confirmed-healthy this cycle (deep-hunt): the #286 AI-credit fix holds (no path
spends a credit when the AI didn't run); the advisor-flagged SECURITY DEFINER
RPCs and the deny-all RLS table are correctly guarded. Closed since 08-03: **#21**
lint, **#28** double-title, **#29** Pricing escrow heading, the two IDOR RPC
oracles.

## Recommendations (prioritised)

### Critical — before production-solid
1. **C1** — enforce invoice status inside `charge-becs-invoice` (reject unless
   chargeable; reject if a PI already exists) and restrict user-JWT callers to
   the homeowner.
2. **H12** — bind the BECS mandate to the invoice (`invoice.recurring_job_id ===
   recurringJobId`, or drop the body param). Cross-account debit is the worst-case.
3. **H1** — mirror the cron's `blocks_release` check in `release-escrow`. The one
   finding with a direct chargeback→loss path.
4. **H2, H14** — bind/amount-check `verify-payment`; gate `connections` creation
   behind a server-verified payment. Both are trivially exploitable revenue/fraud.

### High — this sprint
5. The remaining money HIGHs: deposit amount (H8), milestone/BECS double-charge
   (H9, H10, H11), stranded funds (H6, H7), stale-GST (H5), unchecked fee-freeze
   (H13), resumed-checkout price (H3), whole-job refund (H4).
6. `send-sms` lockdown (H15); anon-key cron bypass (M1); `geofence-event` authz
   (M6); contact redaction server-side (M7).
7. Start edge-function guard tests where the money is; wire `guards.test.ts` into
   CI (H17).

### Medium / Low
8. Client-supplied `priceId` allow-list (M12); dispute-split sibling handling
   (M10); `tradie_details` read scoping (M15); the two dead admin gates; the FAQ
   copy (M20); dead nav anchors (M21); `font-ct-mono` money pass (H16).
9. Fix `check:deps` so vuln scanning runs; delete `debug-anthropic`; the LOW
   cleanups.

## Score trend

| Date | Overall | Note |
|---|---|---|
| 2026-08-01 | 89.7% 🟡 | deeper copy/CSS instruments |
| 2026-08-02 | 93.3% 🟢 | 13 fix PRs |
| 2026-08-03 | 94.3% 🟢 | Navigation #9 closed |
| **2026-08-22** | **69% 🔴** | **live + 54-agent adversarial money-path deep-hunt; partial-credit scoring — not directly comparable** |

The number fell because the depth rose. No dimension regressed in code; the
adversarial pass saw what the nightly checklist cannot.

## Next recommended action

Fix `charge-becs-invoice` (C1 + H12) and `release-escrow` (H1) first — those are
the paths where an ordinary or insider actor can cause an unauthorized bank debit
or a direct, unrecoverable platform loss today. Then work down the money HIGHs.
All of these are Tier B under `docs/governance/CHANGE-POLICY.md` and need owner
sign-off before any code lands.

---

*Findings were produced unfiltered, then severity- and Tier-classified in a
separate pass. Money/auth HIGHs were verified against source directly or by
independent adversarial verification (deep-hunt: 22 confirmed, 0 refuted).
Report-only — no code was changed. The escrow-release-on-client-inaction policy
is ratified and was scored as conforming, not as a defect.*
