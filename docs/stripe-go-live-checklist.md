# Stripe: Test → Live (Go-Live) Checklist — ConnecTradie

Switching real payments on. **Escrow via Stripe Connect — Stripe holds funds, not
us (AFSL-sensitive). Real money moves once this is done. Do it deliberately.**

## ✅ Code audit (2026-07): already live-ready — NO code changes needed
- All edge functions read `STRIPE_SECRET_KEY` from `Deno.env.get()` — no hardcoded keys anywhere in production source (`cs_test_…` only appears in `__tests__` mocks).
- Connect account IDs are read per-tradie from `profiles.stripe_connect_account_id`; every charge is guarded on `stripe_connect_onboarding_complete` → a tradie without a live Connect account is rejected (409), never mischarged.
- `stripe-webhook` validates signatures (`constructEventAsync` + `STRIPE_WEBHOOK_SECRET`).
- Publishable key + Pro price IDs are env-driven (`VITE_STRIPE_*`).

So going live = swapping secrets/keys + Stripe-account setup. **No deploy of new code logic required** (you still redeploy functions so they pick up new secrets).

---

## 0. Prerequisites — do NOT skip
- [ ] **Prove the full payment flow in TEST mode** on the real Play-signed build first: accept-&-pay → escrow → **release**, plus an off-app invoice payment. Confirm the webhook marks things paid and the payout reaches the tradie's (test) Connect account.
- [ ] **Activate your Stripe account for live** (Stripe Dashboard → Activate): business details, representative, and a **payout bank account**. "Sandbox" = not activated. Connect must be enabled on the live account.

## 1. Swap the SECRET key (server) — you do this, I can't handle keys
- [ ] Supabase → Edge Function secrets: set `STRIPE_SECRET_KEY` = your `sk_live_…` (Dashboard → Project Settings → Edge Functions secrets, or `supabase secrets set`).
- [ ] Redeploy the Stripe-touching functions so they read the new secret (or redeploy all): `accept-and-pay`, `approve-invoice`, `invoice-contact`, `release-escrow`, `process-refund`, `auto-release-payments`, `auto-release-recurring-payouts`, `stripe-connect-account`, `stripe-connect-onboarding`, `stripe-webhook`, `create-*`, `pay-milestone`, `book-site-visit`, etc. (Simplest: redeploy the whole fleet.)

## 2. Swap the PUBLISHABLE key + price IDs (frontend) — build-time!
⚠️ Vite bakes `VITE_*` at **build time**. Local `.env` only affects local builds — **production reads Vercel env vars**, so you MUST update Vercel and redeploy.
- [ ] Vercel → Project → Settings → Environment Variables (Production):
  - `VITE_STRIPE_PUBLISHABLE_KEY` = `pk_live_…`
  - `VITE_STRIPE_PRO_PRICE_ID` = live monthly price id
  - `VITE_STRIPE_PRO_ANNUAL_PRICE_ID` = live annual price id
- [ ] Create the **live-mode** Pro products/prices in Stripe first (test price IDs do not work live) and use those ids above.
- [ ] **Redeploy on Vercel** so the new publishable key/price ids are baked in.
- [ ] (Optional) mirror the same values into local `.env` for parity.

## 3. Live webhook + signing secret
- [ ] Stripe Dashboard (LIVE mode) → Developers → Webhooks → Add endpoint:
  - URL: `https://uoqygmizupdpanplpvor.supabase.co/functions/v1/stripe-webhook`
  - Events the code handles — subscribe to these (or "all events" to be safe):
    `checkout.session.completed`, `payment_intent.succeeded`, `payment_intent.payment_failed`,
    `account.updated`, `payout.failed`, `payout.canceled`, `transfer.reversed`,
    `setup_intent.succeeded`, `setup_intent.setup_failed`, `mandate.updated`,
    `invoice.payment_failed`, `charge.dispute.created`,
    `identity.verification_session.verified`, `identity.verification_session.requires_input`.
- [ ] Copy the endpoint's **live** signing secret (`whsec_…`) → Supabase secret `STRIPE_WEBHOOK_SECRET`.
- [ ] Redeploy `stripe-webhook`. (`stripe-webhook` is `verify_jwt=false` — keep it that way; it authenticates via the Stripe signature.)

## 4. Connect re-onboarding
- [ ] Your existing `stripe_connect_account_id` values are **test-mode** (`acct_…` test). In live mode every tradie must onboard a **real** Connect account (bank + ID verification) via the in-app Payouts → Stripe flow (`stripe-connect-onboarding`). Until `stripe_connect_onboarding_complete` is true on the live account, charges to that tradie are correctly blocked.
- [ ] Re-onboard your own test tradie (William) live before testing a real payment.

## 5. First live transaction — verify before announcing
- [ ] Do **one small real payment** end-to-end (e.g. a $1–5 invoice): pay → confirm `checkout.session.completed` fires on the LIVE webhook → row marked paid → escrow → release → funds land on the tradie's live Connect balance/payout.
- [ ] Check Stripe Dashboard (live) shows the charge, the application fee, and the transfer.
- [ ] Refund it if it was purely a test.

## 6. Rollback
- [ ] Keep your `sk_test`/`pk_test`/test `whsec` values saved. If something's wrong, set the secrets back to test values + redeploy to revert instantly (no code change).

---

### Quick status
| Item | State |
|---|---|
| Payment code live-ready | ✅ audited, no changes needed |
| Test-mode flow proven end-to-end | ⏳ do first |
| Stripe account activated (live) | ⏳ your Stripe dashboard |
| Live secret/publishable/price/webhook keys | ⏳ you swap (I can't handle keys) |
| Live Connect onboarding | ⏳ per tradie |
| First live transaction verified | ⏳ before announcing |
