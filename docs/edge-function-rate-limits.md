# Edge Function rate limiting — inventory

Built 2026-07-30 to close audit finding #4. Covers all 74 functions in
`supabase/functions/`. If you add a function, add a row.

## Read this first: `checkRateLimit` does not work in production

**Measured, not assumed.** On 2026-07-30, `public-quote` was deployed with a
limit of 20 requests per 60 s keyed on the quote token, then sent **60
consecutive requests with the same token over one keep-alive connection**.

Result: **60 × HTTP 404, zero 429s.** The limiter never fired. A second run of
30 gave the same result. Every response carried a distinct
`x-deno-execution-id`, consistent with each request getting a fresh execution
context.

`_shared/rateLimiter.ts` keeps its counters in a **module-level `Map`**. If that
module is re-instantiated per request, the `Map` is empty every time, `count`
never reaches `maxRequests`, and `checkRateLimit` returns `allowed: true`
forever. That is exactly what the measurement shows.

**This applies to all 50 functions that call it, not just the eleven added
below.** The 39 that already had `checkRateLimit` have never been rate limited
in production either. Treat every `checkRateLimit` call in this repo as
decorative until the limiter is made durable.

`worker-invite` was right, and its header comment understates it:

> Rate limiting is DB-backed on purpose. `_shared/rateLimiter.ts` is an
> in-process Map that does not survive across Deno isolates — fine for cheap
> endpoints, not for one that spends money on email and SMS.

It is not fine for cheap endpoints either. It does nothing.

### The fix

Rate limiting has to live in the database. Two patterns already exist here:

- **Count domain rows in a window** — `worker-invite` counts
  `business_team_members` rows created in the last hour; `sms_send_log` does the
  same for SMS. Works where the function already writes a row.
- **A dedicated counter table** — needed where there is no such row
  (`public-quote` viewing a quote writes nothing). No generic
  `edge_rate_limits` table exists yet. Building one, with a `SECURITY DEFINER`
  RPC that atomically increments and returns the count, is the outstanding work.

The eleven `checkRateLimit` calls added below are kept deliberately: they record
the intended key and ceiling for each endpoint, and they start working the day
the limiter is backed by the database. They are not protection today.

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

## Declaring a limit with `checkRateLimit`

⚠ Read the section at the top: these calls do not currently enforce anything.
They document the intended key and ceiling.

The 39 that already had it are not listed individually — grep
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
not the origin or a JWT. There is no caller identity to key on, so the declared
limit keys on the token — which caps abuse of *one known token* and does nothing
about someone spraying random ones. The token is a UUID, so guessing is not the
practical risk; unbounded request volume is. **This is the first endpoint to
move onto a DB-backed limiter** — it is both fully public and the one this
inventory used to prove the in-process limiter is inert.

`geofence-event` authenticates with a per-device opaque token. Same caveat,
lower exposure: an invalid token is rejected before any write.

## Known gap, not fixed here

`send-invoice-approval-nudge` **has no caller anywhere** — not in `cron.job`,
not in `src/`, not in another Edge Function. It is deployed and reachable but
nothing invokes it. Decide whether to wire it up or delete it; do not leave it
in this state indefinitely.
