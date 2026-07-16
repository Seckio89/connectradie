# Launch-Day Smoke Checklist

One pass through every money path and core flow on **production** (`https://connectradie.com`),
run **on launch day before announcing**, then a lighter monitoring loop for the first 48 h.

- Full run: ~45–60 min. Sections are ordered so a failure stops you as early as possible.
- Use the real test accounts: **William Magson** (tradie, `cee4e052-…`) and **Tess Magson** (client).
- Real cards only in live mode — keep amounts small ($5–10) and **refund at the end** (Section 9).
- Emails: send only to your own test inboxes.
- Related docs: `stripe-go-live-checklist.md`, `android-release-checklist.md`.

Mark each item: ✅ pass · ❌ fail (stop or note) · ➖ skipped.

---

## 0 · Pre-flight (infra green before touching the app)

| # | Check | Where | Expect |
|---|---|---|---|
| 0.1 | Latest master deployed | Vercel → Deployments | Newest commit hash matches `origin/master`, status Ready |
| 0.2 | Edge functions healthy | Supabase → Edge Functions | All ACTIVE; no crash-loop in recent logs for `stripe-webhook`, `accept-and-pay`, `send-email` |
| 0.3 | Live Stripe webhook | Stripe Dashboard (LIVE) → Developers → Webhooks | Endpoint = `…/functions/v1/stripe-webhook`, enabled, 0 recent failures; events include `checkout.session.completed`, `payment_intent.succeeded`, `account.updated`, `payout.failed` |
| 0.4 | Live keys are a matched pair | Stripe → API keys | Both `sk_live_…` (Supabase secret) and `pk_live_…` (Vercel) from account `…51SzxZ` |
| 0.5 | William's Connect account live | Supabase → profiles | `stripe_connect_account_id` = live `acct_…`, `stripe_connect_onboarding_complete = true` |
| 0.6 | Sentry receiving | Sentry → project | Events arriving from prod (or trigger a test error) |
| 0.7 | CSP still report-only | Response headers on `connectradie.com` | Header is `Content-Security-Policy-Report-Only` (don't enforce on launch day) |
| 0.8 | DNS + TLS | Browser | `https://connectradie.com` loads with valid cert; `www` redirects if configured |

---

## 1 · Public / logged-out surface

| # | Check | Expect |
|---|---|---|
| 1.1 | Landing page loads, no console errors | Hero renders, CTAs work |
| 1.2 | /pricing | Three tiers render from live `pricing_tiers` data; calculator works |
| 1.3 | SEO/legal pages | /privacy (incl. Google Limited Use section), /terms load |
| 1.4 | Sign-up (fresh email) | Account created → staged onboarding (welcome screen, not full dashboard) |
| 1.5 | Google sign-in | Completes; consent screen shows (branding may still say Supabase URL until Google verifies — known, not a blocker) |
| 1.6 | Login as William (test tradie) | Dashboard loads: no stale "Ongoing Services", correct job cards |

---

## 2 · THE money path #1 — on-app escrow (client pays, tradie released)

Run as **Tess (client)** + **William (tradie)**. Small real amount.

| # | Step | Expect |
|---|---|---|
| 2.1 | Tess posts a small job (or reuse a pending one) | Job visible to tradie; geo-scoped notification fires |
| 2.2 | William quotes it | Tess sees the quote |
| 2.3 | Tess clicks **Accept & Pay** → real card | Stripe Checkout (live) completes; redirected to /payment-success |
| 2.4 | Webhook flips job | Job status → `funded`/`in_progress` within ~1 min; both parties notified (in-app + email) |
| 2.5 | Stripe Dashboard check | Payment intent succeeded; **destination charge** to William's `acct_…` with the expected `application_fee_amount` |
| 2.6 | William marks complete → Tess **Approve & Release** | `release-escrow` succeeds; payout created from Connect balance |
| 2.7 | Payouts page (William) | Transaction listed with correct net amount |

> ❗ If 2.4 doesn't flip: check Stripe webhook delivery attempts first, then `stripe-webhook` logs. Don't retry payment.

---

## 3 · THE money path #2 — off-app quote → invoice

Run as **William** against an off-app client contact (your own test email).

| # | Step | Expect |
|---|---|---|
| 3.1 | Clients → New quote (use the Pricing Helper once — counts AI usage) | Estimate returns; counter shows "N/10 free estimates this month" |
| 3.2 | Send Quote | "Quote sent" + tradie confirmation email lands; client email has working link |
| 3.3 | Open quote link **logged out** | PublicQuote page: business name unclipped, logo, scope bullets only (NO internal notes/assumptions) |
| 3.4 | Share the link to yourself by SMS/RCS | Preview shows ConnecTradie icon + "Quote from …" (OG proxy), not the cartoon hero |
| 3.5 | Accept the quote | Success state; William gets accept notification + email |
| 3.6 | Send invoice from ClientDetail → pay with real card | Destination charge lands; webhook marks invoice `paid`; payout_status = `transferred` |
| 3.7 | External-payment mode (mark invoice paid manually) | Shows in earnings/Payouts as external |

---

## 4 · AI estimates + monetisation

| # | Step | Expect |
|---|---|---|
| 4.1 | Pricing Helper estimate (with a photo) | Line-item breakdown; usage counter decremented |
| 4.2 | Duration/days/multi-visit fields | Entered hours override AI hours; visits multiply total; "Available to visit: …" goes to client scope only |
| 4.3 | (Optional, costs $4.99) Buy an Estimate Pack | Checkout completes → notification "20 bonus credits added" → counter shows "(X monthly + Y pack credits)" |
| 4.4 | If NOT selling subscriptions yet | "Go Pro" upsell links to /pricing without crashing (Settings subscription modal shows friendly message, not a raw price-ID error) |

---

## 5 · Recurring services

| # | Step | Expect |
|---|---|---|
| 5.1 | Send a recurring quote (weekly, 2 visits/cycle, per-visit price) | Scope shows cadence + visit days; internal notes show pricing basis |
| 5.2 | Accept it → service appears | Ongoing Services card shows correct per-visit rate |
| 5.3 | **End the service** | Toast "Ongoing service cancelled"; card disappears from Dashboard AND Work Hub after refresh (the July-16 fix — verify explicitly) |

---

## 6 · Comms & misc

| # | Check | Expect |
|---|---|---|
| 6.1 | In-app notifications bell | Events from sections 2–5 all present, readable |
| 6.2 | Email deliverability | All emails above arrived (check spam); links point to `connectradie.com` |
| 6.3 | Chat between Tess ↔ William | Messages deliver both ways; off-platform-payment phrases get flagged (anti-circumvention) |
| 6.4 | Calendar/Schedule | Sessions from section 5 appear on the right dates |

---

## 7 · Mobile pass (375 px — real phone or devtools)

| # | Check | Expect |
|---|---|---|
| 7.1 | Landing, Dashboard, Jobs, Clients | No horizontal scroll; cards centred (Clients empty state!); touch targets ≥ 44 px |
| 7.2 | New Quote modal + Pricing Helper | All new fields usable; dropdowns not clipped |
| 7.3 | PublicQuote on mobile | Business name wraps, no clipping |
| 7.4 | Stripe Checkout on mobile | Completes and returns correctly |

> Known footgun: `mobile-responsive.css` global `!important` rules — if anything looks off ONLY on mobile, check there first.

---

## 8 · Post-checks (30–60 min after the run)

| # | Check | Expect |
|---|---|---|
| 8.1 | Stripe webhook deliveries | All events 200; zero retries pending |
| 8.2 | Supabase logs (`stripe-webhook`, `estimate-quote`, `send-email`) | No unexpected errors |
| 8.3 | Sentry | No new error groups from the smoke run |
| 8.4 | CSP violation reports | Nothing unexpected (feeds the enforce decision next week) |
| 8.5 | DB spot-check | `payments` rows have fee audit fields; no rows stuck in intermediate status; `payout_status` not stuck at `held_*` |

---

## 9 · Cleanup

- [ ] **Refund** the real charges from sections 2–3 (Stripe Dashboard → Payments → Refund).
- [ ] Cancel/complete the smoke-test jobs, quotes, invoices, and recurring service so real users don't see them.
- [ ] Delete the fresh sign-up account from 1.4 (Settings → delete, or admin).
- [ ] Note anything ❌/➖ with a one-line cause in this file's margin or an issue.

---

## First 48 h monitoring loop (2–3× per day)

1. Stripe: payments succeeded vs failed; webhook failures = 0; any disputes.
2. Sentry: new error groups.
3. Supabase: edge-function error rates; `recurring_invoices.payout_status` for stuck `held_*`.
4. Signups: new profiles appearing; onboarding_stage progressing.
5. Emails: Resend dashboard for bounces/complaints.

## If something is badly broken (quick reference)

- **Frontend bug** → Vercel → Deployments → *Promote previous deployment* (instant rollback).
- **Edge function bug** → redeploy previous version: `npx --no-install supabase functions deploy <name> --project-ref uoqygmizupdpanplpvor` from the last good commit.
- **Payments misbehaving** → Stripe Dashboard → disable the webhook endpoint is NOT the fix (events queue+retry); instead fix-forward or roll back the function. Money already in Connect balances is safe.
- **Stop-the-world** → Vercel: enable a maintenance page / password protection; Stripe keeps state, nothing is lost.
