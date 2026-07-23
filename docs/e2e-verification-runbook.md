# E2E Verification — Step by Step

Proves the Pricing v2.1 money path actually works against real Stripe, without
touching production.

**Why bother:** every check so far is static — types, unit tests, code review.
Not one real payment has ever run through the v2.1 fee model. This is the only
thing that proves it.

---

## The short version

```bash
cp .env.e2e.example .env.e2e     # fill it in
npm run e2e:doctor               # tells you the next thing to do — repeat until green
npm run e2e:run
```

**`npm run e2e:doctor` is the whole guide.** It checks everything in order and
prints the single next action. If you only remember one command, remember that
one. The steps below are what it will walk you through.

---

## Setup — do these once

### ☐ 1. Create a test Supabase project

Free tier is fine. From **Project Settings → API**, copy the project URL, the
**anon** key and the **service_role** key.

> Production is on live Stripe keys, so a run there would create real charges,
> payouts and refunds. Every script here refuses to run against it.

### ☐ 2. Fill in the config

```bash
cp .env.e2e.example .env.e2e
```

Open `.env.e2e` and paste in the values from step 1 plus a Stripe **test** key
(`sk_test_…`, from Stripe → toggle **Test mode** → Developers → API keys).

`.env.e2e` is gitignored. You never need to `export` anything — every script
reads this file.

### ☐ 3. Load the schema

```bash
npx supabase db dump --linked -f prod-schema.sql --schema public
psql "<TEST_DB_CONNECTION_STRING>" -f prod-schema.sql
```

> ⚠️ **Do not use `supabase db push`.** Production has migrations that exist in
> the database with no local file, so local migrations will not reproduce it —
> you'd get missing columns and failures that have nothing to do with pricing.
>
> No `psql`? Paste `prod-schema.sql` into the test project's **SQL Editor**.
> The dump is schema-only: no production rows.

### ☐ 4. Set the test project's secrets

```bash
npx supabase secrets set --project-ref <TEST_REF> \
  STRIPE_SECRET_KEY=sk_test_... \
  STRIPE_WEBHOOK_SECRET=whsec_PLACEHOLDER \
  ALLOWED_ORIGIN=http://localhost:5173
```

### ☐ 5. Deploy the functions there

```bash
npx supabase functions deploy --project-ref <TEST_REF>
```

### ☐ 6. Add a Stripe test webhook

Stripe (**test mode**) → Developers → Webhooks → Add endpoint:

- **URL:** `https://<TEST_REF>.functions.supabase.co/stripe-webhook`
- **Events:** `checkout.session.completed`, `payment_intent.succeeded`

Copy the signing secret and re-run step 4 with the real `whsec_…`.

> Skip this and the run hangs at *"never reached status='completed'"* — the
> webhook is what flips the payment.

### ☐ 7. Create the test accounts

```bash
npm run e2e:bootstrap
```

Creates the client, the tradie, and a Stripe **test** Connect account.

> If a later run fails at release with a *capability* error, enable **transfers**
> on that Connect account in the Stripe test dashboard. One-time click.
> `e2e:doctor` warns you about this before you hit it.

---

## Every run

### ☐ 8. Mint a fresh quote

```bash
npm run e2e:quote
```

Copy the printed id into `.env.e2e` as `E2E_QUOTE_ID`.

> Needed **every time**. The run consumes its quote — by the end it's accepted,
> funded, released and refunded — and Stripe idempotency keys are derived from
> the quote id, so reusing one returns the original expired checkout session.

### ☐ 9. Run it

```bash
npm run e2e:doctor   # confirm green
npm run e2e:run
```

---

## What green looks like

```
✅ accept-and-pay → paymentId …
✅ checkout completed with test card 4242
✅ webhook set payment completed …
✅ fee_model=v2.1 — running against the deployed cutover
✅ split recorded: commission $64.00 + materials processing $30.88 = $94.88
✅ platform_fee stored as a number (release-escrow reads it correctly)
✅ release-escrow → payout …
✅ hot-water split verified ($2,305.12 to tradie)
✅ duplicate release blocked (409) — no double payout
✅ refund wrote status='refunded' to DB
✅ E2E green.
```

### What each line is actually protecting you from

| Check | The failure it catches |
|---|---|
| `fee_model=v2.1` | Testing stale code. Without it the whole run passes green against the old V2 functions and proves nothing. |
| commission + processing reconcile | A split that doesn't add up |
| processing ≤ ~1.93% | A markup on materials — "at cost" is a **published** promise |
| `platform_fee` is a number | A string is read as `0`, paying out the **full amount undeducted** |
| nets $2,305.12 | The spec's flagship worked example |
| duplicate release → 409 | The double-transfer bug (§8.3) |
| refund → `status='refunded'` | The refund-DB-failure bug (§8.3) |

---

## Commands

| Command | What it does |
|---|---|
| `npm run e2e:doctor` | Checks setup, names the next action |
| `npm run e2e:bootstrap` | One-time: client, tradie, Connect account |
| `npm run e2e:quote` | Fresh quote — before every run |
| `npm run e2e:run` | The E2E itself |
| `npm run e2e:reset` | Clears accumulated test rows (optional) |

---

## If something breaks

`npm run e2e:doctor` diagnoses most of it. Otherwise:

| Symptom | Cause |
|---|---|
| `REFUSING TO RUN … PRODUCTION` | Working as designed — use the test ref |
| `REFUSING TO RUN … not a test key` | `sk_live` in `E2E_STRIPE_SECRET_KEY` |
| `fee_model is '(absent)'` | Test project's functions predate the cutover — redo step 5 |
| `never reached status='completed'` | Webhook missing or wrong `whsec` — step 6 |
| capability / `transfers` error | Enable transfers on the Connect account — step 7 |
| `column … does not exist` | Schema didn't reproduce — you used `db push` instead of the dump (step 3) |
| quote `status="accepted"` | Already used — `npm run e2e:quote` again |

---

## One known gap it will expose

The refund step leaves a `platform_fee_charges` row with **no offsetting
adjustment note**, because `process-refund` doesn't emit one yet. The schema
supports it (`kind='adjustment'`, `adjusts_invoice_id`); nothing writes it.

That's the test doing its job — a real gap surfacing rather than a false green.
Under AU rules an issued tax invoice can't be edited or deleted, so a refunded
commission must be offset by an adjustment note.
