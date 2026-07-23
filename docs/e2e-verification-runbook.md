# E2E Verification Runbook

How to prove the Pricing v2.1 money path actually works, end to end, against real
Stripe — without touching production.

**Why this exists:** every check so far (types, unit tests, code review) is
static. Not one real payment has ever run through the v2.1 fee model. This is the
only thing that proves it.

---

## What a green run proves

| Assertion | Why it matters |
|---|---|
| `fee_model === "v2.1"` | You're testing the **deployed cutover**, not stale code. Without this the whole run can pass green against the old V2 functions. |
| commission + materials processing = total | The split reconciles |
| materials processing ≤ ~1.93% of materials | The "at cost, no markup" promise is **published** — a markup would be a trust and compliance problem |
| `platform_fee` stored as a **number** | A string there is silently read as `0` by release-escrow, paying out the **full amount undeducted** |
| Hot-water case nets **$2,305.12** | The flagship worked example in the spec |
| Duplicate release → `409` | The double-transfer guard (§8.3) |
| Refund writes `status='refunded'` | The refund-DB-failure bug (§8.3) |

---

## Prerequisites

- A **separate** Supabase project (free tier is fine). The harness **refuses to
  run against production** — prod uses live Stripe keys, so a run there would
  create real charges, payouts and refunds.
- Stripe **test-mode** keys (`sk_test_…`).
- `psql`, to load the schema dump.
  *Not installed?* Either install the PostgreSQL client tools, or paste the dump
  into the Supabase dashboard **SQL Editor** instead (Database → SQL Editor).

---

# Part A — one-time setup

## 1. Create the test project

Supabase dashboard → New project. Then from **Project Settings**, collect:

- Project ref (e.g. `abcdefghijklmnop`)
- Project URL → `https://<ref>.supabase.co`
- **anon** key and **service_role** key (Settings → API)
- Database connection string (Settings → Database)

## 2. Load the schema — ⚠️ do NOT use `supabase db push`

**This is the step that will bite you.** Production has dozens of migrations that
exist in the database but have **no local file** (schema was changed outside the
migration flow over months). Your local migrations alone will **not** reproduce
production, so a project built from them is missing columns and the E2E fails for
reasons that have nothing to do with pricing.

Dump production's real schema and load that:

```bash
# Dump prod (this repo is already linked to prod)
npx supabase db dump --linked -f prod-schema.sql --schema public

# Load into the TEST project
psql "<TEST_DB_CONNECTION_STRING>" -f prod-schema.sql
```

No `psql`? Open `prod-schema.sql`, paste into the test project's SQL Editor and
run it. Split into chunks if it times out.

> The dump is schema-only — it contains no production rows.

## 3. Set the test project's secrets

```bash
npx supabase secrets set --project-ref <TEST_REF> \
  STRIPE_SECRET_KEY=sk_test_... \
  STRIPE_WEBHOOK_SECRET=whsec_PLACEHOLDER \
  ALLOWED_ORIGIN=http://localhost:5173
```

`STRIPE_WEBHOOK_SECRET` gets its real value in step 5.

## 4. Deploy the edge functions to the test project

```bash
npx supabase functions deploy --project-ref <TEST_REF>
```

Deploying everything is simplest; the v2.1 charge paths are what matter.

## 5. Point a Stripe **test-mode** webhook at it

Stripe dashboard (**test mode**) → Developers → Webhooks → Add endpoint:

- URL: `https://<TEST_REF>.functions.supabase.co/stripe-webhook`
- Events: `checkout.session.completed`, `payment_intent.succeeded`

Copy the signing secret (`whsec_…`) and re-run step 3 with the real value.

**Skip this and the harness hangs** at `payment … never reached status='completed'`
— the webhook is what flips the payment.

## 6. Bootstrap the test data

```bash
export E2E_SUPABASE_URL=https://<TEST_REF>.supabase.co
export E2E_SUPABASE_SERVICE_KEY=<test service_role key>
export E2E_STRIPE_SECRET_KEY=sk_test_...

node scripts/e2e-seed.mjs --bootstrap
```

Creates the client auth user, the tradie (profile + `tradie_details`), and a
Stripe **test** Connect account with `onboarding_complete` set.

> **Likely one-time hiccup:** the Connect account may need **transfers enabled**
> in the Stripe test dashboard before a destination charge will settle. If the run
> later fails at release with a capability error, that's the cause — enable it
> once and carry on.

---

# Part B — every run

## 7. Mint a fresh quote (~2 seconds)

```bash
node scripts/e2e-seed.mjs --quote
```

**Required every time.** The E2E *consumes* its quote — by the end it's accepted,
funded, released and refunded — and the harness derives its Stripe idempotency
keys from the quote id, so reusing one returns the original, long-expired
Checkout session instead of a new one.

It prints the `E2E_QUOTE_ID` to export.

## 8. Run it

```bash
export E2E_SUPABASE_ANON_KEY=<test anon key>
export E2E_FUNCTIONS_BASE=https://<TEST_REF>.functions.supabase.co
export E2E_CLIENT_EMAIL=e2e-client@test.local
export E2E_CLIENT_PASSWORD=e2e-password-123
export E2E_QUOTE_ID=<printed in step 7>
export E2E_ASSERT_HOTWATER=1

node connectradie-e2e.mjs
```

### Steady state, after setup

```bash
node scripts/e2e-seed.mjs --quote && node connectradie-e2e.mjs
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

---

## Troubleshooting

| Symptom | Cause |
|---|---|
| `REFUSING TO RUN … PRODUCTION project` | Working as designed. Use the test ref. |
| `REFUSING TO RUN … not a test key` | `sk_live` in `E2E_STRIPE_SECRET_KEY`. |
| `fee_model is '(absent)'` | Functions on the test project **predate the cutover** — redo step 4. This is the check earning its keep. |
| `never reached status='completed'` | Webhook not configured or wrong `whsec` — step 5. |
| Capability / `transfers` error at release | Enable transfers on the test Connect account (see step 6). |
| `column … does not exist` | Schema didn't reproduce — you used `db push` instead of the dump (step 2). |
| `Invalid supabaseUrl` | An `E2E_*` var is unset. |

---

## Known gap this run will expose

The refund step leaves a `platform_fee_charges` row with **no offsetting
adjustment note**, because `process-refund` doesn't emit one yet. The schema
supports it (`kind='adjustment'`, `adjusts_invoice_id`) but nothing writes it.

That's the test doing its job — a real gap surfacing rather than a false green.
Under AU rules an issued tax invoice can't be edited or deleted, so a refunded
commission must be offset by an adjustment note.

---

## Housekeeping

```bash
node scripts/e2e-seed.mjs --reset
```

Clears accumulated test jobs/quotes/payments/fee rows. Optional — leftovers are
harmless (test project, Stripe test mode, no cost) but they pile up.

Stripe test-mode objects are deliberately left alone: they cost nothing and
preserve the audit trail.
