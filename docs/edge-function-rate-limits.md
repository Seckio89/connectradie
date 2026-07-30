# Edge Function rate limiting — inventory

Built 2026-07-30 to close audit finding #4. Covers all 74 functions in
`supabase/functions/`. If you add a function, add a row.

## How it works, and how we know it works

Counters live in `public.edge_rate_limits` and are consumed through the
`consume_rate_limit(key, max, window_seconds)` RPC (migration
`20260730121507_edge_rate_limits`). `_shared/rateLimiter.ts` calls that RPC over
PostgREST using the service-role key from the environment, so **no call site
passes a client** — the call is just `await checkRateLimit(key, max, windowMs)`.

`INSERT ... ON CONFLICT DO UPDATE` takes a row lock, so concurrent callers on
the same key serialise. The window is **fixed, not sliding**: a caller can burst
across a boundary, up to 2× the ceiling straddling the reset. Accepted — a
sliding window costs a second table, and the fixed window is what the original
code intended anyway.

**It fails open.** If the RPC is unreachable or errors, `checkRateLimit` logs
and allows the request. If the database is down the calling function's next
query fails regardless, so failing closed would trade a real outage for no
security gain.

### Proof, on prod

`public-quote` carries a 20/min limit keyed on the quote token. Sixty
consecutive requests with the same junk token over one keep-alive connection:

| | Before (in-process `Map`) | After (DB-backed) |
|---|---|---|
| HTTP 404 (allowed through) | 60 | **20** |
| HTTP 429 (limited) | **0** | **40** |

The window-reset branch was proven separately by ageing a live counter's
`window_start` past the boundary and consuming again: `allowed: true`,
`remaining: 19` — the count resets rather than locking the key out.

### What this replaced

Until 2026-07-30 `checkRateLimit` kept its counters in a **module-level `Map`**.
That module is re-instantiated per request, so the `Map` was empty every time,
`count` never reached `maxRequests`, and it returned `allowed: true` forever.
The same 60-request probe returned 60 × 404 and zero 429s. Every one of the 50
call sites was decorative, including `release-escrow` and `instant-payout`.

Four functions — `create-checkout-session`, `create-payment-session`,
`send-email`, `send-sms` — carried their own byte-identical private copy of that
Map. They now import the shared helper. **Do not reintroduce a local copy.**

`worker-invite` had it right all along, and its header comment understated it:

> Rate limiting is DB-backed on purpose. `_shared/rateLimiter.ts` is an
> in-process Map that does not survive across Deno isolates — fine for cheap
> endpoints, not for one that spends money on email and SMS.

It was not fine for cheap endpoints either. It did nothing. Its own DB-backed
cap (and `sms_send_log`) remain valid — they count domain rows in a window,
which is stricter than the generic counter and worth keeping where it exists.

## Reachability classes

| Class | Meaning | Needs a limiter? |
|---|---|---|
| `cron` | Invoked only by a pg_cron schedule | No — no user reach |
| `webhook` | Called by Stripe, gated by signature | No — forgery is the threat, and signatures answer it |
| `internal` | Called only by another Edge Function | No |
| `manual` | Admin/operator-triggered, not wired to any UI | No |
| `user` | Reachable from `src/` with a user's JWT | **Yes** |
| `public` | Reachable with no user JWT | **Yes**, and in-process is not enough |

## The 14 cron functions

`auto-confirm-sessions` · `auto-release-payments` ·
`auto-release-recurring-payouts` · `check-license-expiry` ·
`credential-expiry-sweep` · `generate-auto-invoices` ·
`generate-recurring-sessions` · `issue-fee-invoices` · `payout-reconciliation` ·
`reconcile-payments` · `send-invoice-reminders` · `send-lead-reminders` ·
`send-recurring-reminders` · `send-scheduled-notifications`

All confirmed against `cron.job` on the live database, not inferred from names.
No limiter: the only caller is the scheduler, and limiting it would mean
throttling ourselves.

## Not user-reachable

| Function | Class | Why no limiter |
|---|---|---|
| `stripe-webhook` | webhook | `constructEvent` signature validation is the gate |
| `health` | public | Returns a static liveness response, touches nothing |
| `csp-report` | public | Browsers POST violation reports unprompted; write-only sink |
| `charge-becs-invoice` | internal | Called only by `generate-auto-invoices` and `generate-recurring-invoice` |
| `credential-verify` | manual | Admin-triggered; the only writer of the verification fields |
| `migrate-payout-schedules` | manual | One-off operator migration |
| `analyse-description-keywords` | manual | Offline keyword analysis |

## Protected by something stronger than the shared limiter

| Function | Mechanism |
|---|---|
| `access-pin` | 5-attempt lockout with email reset, DB-backed |
| `worker-invite` | Per-business hourly invite cap, counted in the DB |

## Limited with `checkRateLimit`

50 call sites across 50 functions, all enforcing. The 39 that already had it are
not listed individually — grep
`checkRateLimit` in `supabase/functions/`. `release-escrow:61` is the canonical
call shape.

Added 2026-07-30 (the eleven gaps this inventory found):

| Function | Key | Per min | Rationale |
|---|---|---|---|
| `instant-payout` | user id | 5 | Money out; same ceiling as `release-escrow` |
| `buy-estimate-pack` | user id | 5 | Creates Stripe Checkout sessions |
| `dispute-evidence-summary` | user id | 5 | Paid model call. Service-role callers (internal trigger) deliberately exempt |
| `google-calendar-import` | user id | 5 | Spends Google API quota |
| `invoice-contact` | user id | 10 | Sends email |
| `generate-recurring-invoice` | user id | 10 | State change, creates invoices |
| `estimate-quote` | user id | 10 | Real control is the `ai_estimate_usage` meter; this bounds pre-meter CPU |
| `worker-claim-profile` | user id | 10 | Bounds invite-token guessing per account |
| `mark-invoice-paid` | user id | 20 | State change, no spend |
| ⚠ `public-quote` | quote token | 20 | **No caller identity** — public by design. See below |
| ⚠ `geofence-event` | device token | 120 | Generous ceiling, not a throttle — crossings are bursty and `batchSync` posts a backlog after signal returns |

### ⚠ The two without a user identity

`public-quote` is open by design: an off-app client opens their quote link from
any browser, so the unguessable `quotes.public_token` is the security boundary,
not the origin or a JWT. There is no caller identity, so the limit keys on the
token — which now genuinely caps abuse of *one* token but still does nothing
about someone spraying many random ones. The token is a UUID, so guessing is not
the practical risk; unbounded volume across many keys is.

**Open follow-up: per-IP limiting for `public-quote`.** It needs a decision on
extracting the client IP from `x-forwarded-for` behind Supabase's proxy, which
is why it is not in this change.

`geofence-event` authenticates with a per-device opaque token. Same caveat,
lower exposure: an invalid token is rejected before any write.

## Known gap, not fixed here

`send-invoice-approval-nudge` **has no caller anywhere** — not in `cron.job`,
not in `src/`, not in another Edge Function. It is deployed and reachable but
nothing invokes it. Decide whether to wire it up or delete it; do not leave it
in this state indefinitely.
