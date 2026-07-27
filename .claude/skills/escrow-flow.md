---
name: escrow-flow
description: How ConnecTradie actually holds and releases money — Stripe Connect destination charges, manual payouts, v2.1 fees, refunds, disputes and split release. Read this before touching any money path.
---

# Escrow Flow

**Last verified against the code 2026-07-27.** Claims below cite the file that
proves them. If you change a money path, update this file in the same PR — the
previous version of this document described a system that was never built
(manual capture, a flat 10% fee, a `held` status, a 48-hour window). Following
it would have produced wrong code on every point.

## The one thing to understand first

**These are Stripe DESTINATION charges. The money is in the TRADIE's Connect
balance from the moment the client pays.** The platform never holds it — that is
the AFSL position and it is not negotiable.

At payment time Stripe splits the charge:

```
C       = base + GST + processing_fee      ← what the client is charged
appFee  = platform_fee + processing_fee    ← application_fee_amount, kept by us
balance = C − appFee                       ← lands in the tradie's account
```

Escrow works because **Connect accounts are on a MANUAL payout schedule**
(`stripe-connect-onboarding/index.ts:126`), so funds sit in the tradie's balance
instead of sweeping to their bank. `stripe-payout-settings` actively refuses to
change it — that refusal *is* the escrow mechanism.

**So "release" is a PAYOUT, not a capture.** `release-escrow/index.ts:248` calls
`stripe.payouts.create({...}, { stripeAccount })`.

A **legacy custodial flow** also exists (`metadata.flow !== 'destination'`):
funds in the platform balance, released via `transfers.create` with
`source_transaction`. New code should handle it or refuse it explicitly — never
half-support it.

## Statuses

`payments.status` CHECK: `pending | completed | failed | refunded | released`.

**There is no `held`.** `completed` means collected and sitting in the tradie's
balance. `released` means a payout was created.

`refunded` and `released` are TERMINAL — `reconcile-payments` refuses to
downgrade them, because a Stripe PaymentIntent stays `succeeded` after a refund
and would otherwise re-open a closed payment and pay money back out.

`payments.payment_type`: `lead_unlock | job_access | job_funding | job_payment |
price_adjustment | recurring_invoice`. **Escrow is `job_funding`.**

## Auto-release

`auto-release-payments`, cron every 6 hours. Releases when
`jobs.completed_at <= now() - RELEASE_WINDOW_HOURS` (**5 hours**, not 48) and the
payment is `job_funding` + `completed`. It skips any job with a live dispute.

## Fees — v2.1, never hardcode a rate

Not a flat 10%. Tiered, capped, with a per-profile override. Always go through
`_shared/pricing.ts` and `_shared/feeContext.ts` (`resolveChargeFee`), which
handle the tier, the repeat-client rate, the **job-level cap** (splitting a job
across instalments must collect the same total as charging it once) and
`profiles.platform_fee_override_bps` (the platform owner is 0%).

Commission is recorded for tax invoicing by `recordFeeCharge` — best-effort by
design; it never throws, so paperwork cannot fail a payout that already moved.

## Refunds

`process-refund`. On destination charges it MUST pass `reverse_transfer: true` +
`refund_application_fee: true`, or the refund comes out of the platform instead
of the tradie.

Full refund = `amount + GST + processing_fee`. A client cannot self-refund once
release is actioned or the job is complete — that routes to a dispute. Admins
keep full refund power (Admin → Payments).

## Disputes

**`disputes.blocks_release` is a GENERATED column and the ONLY thing that may
decide whether a payout is frozen.** Never write `.in("status", [...])` against
disputes in application code: adding a status to the CHECK without also updating
such a literal silently releases disputed escrow — no error, no failing test.

Resolving goes through the `resolve_dispute()` RPC, which writes the append-only
decision row and the status change in one transaction. Raising a dispute
requires real escrow (`job_has_platform_escrow()`): a `job_funding` payment at
`completed` or `released`.

### Split release

`resolve-dispute-split` refunds part to the client and pays the tradie the rest.
Two rules, both load-bearing:

1. **Refund FIRST, then pay out.** The refund reverses money out of the tradie's
   balance; pay out first and the reversal fails or drives them negative.
2. **Resolve the dispute LAST.** Resolving clears `blocks_release`, which lets
   auto-release pick the job up — if the split hasn't finished, it pays out the
   FULL amount. The split also writes `status='released'` so nothing can
   double-pay.

Stripe reverses both sides of a partial refund proportionally, so commission on
the released portion falls out for free. Don't compute those fees by hand.

## ⚠ Settlement: the payout usually cannot run immediately

The tradie's balance is **pending** until the original charge settles (~2
business days on AU cards). Release opens 5 hours after completion, so a prompt
release or split normally finds **$0.00 available** and the payout fails with
"insufficient funds". Measured on a real account: `$0.00 available / $64.90
pending`, three days after a $70.00 charge.

This is expected, not a bug. Handle it:

- pre-flight `stripe.balance.retrieve({ stripeAccount })` and **defer** rather
  than fail;
- rely on the retry sweep in `auto-release-payments`, which completes deferred
  split payouts once funds clear.

Never report a deferral as an error — it trains people to ignore real ones.

## Idempotency keys are DERIVED, never caller-supplied

A key the caller controls is not idempotency: omit it and a retry double-pays;
vary it and Stripe treats it as a new request.

| Operation | Key |
|---|---|
| Release payout | `release_payout_${paymentId}` |
| Full refund | `refund_${paymentId}` |
| Split refund leg | `dispute_split_refund_${disputeId}` |
| Split payout leg | `dispute_split_payout_${disputeId}` |

The split keys are deliberately DISTINCT from `release_payout_` — that one is
already bound to the full amount, so reusing it with a different amount makes
Stripe reject.

## Before you ship a money change

`npm run typecheck` · `npm run check:columns` (the only column-level check edge
functions get) · `npm run check:edge-docs` · `npm run build` · `npm run test:run`

Then verify by execution against the database — a rolled-back probe that proves
the guard actually blocks. Re-reading your own diff is not verification.
