# ConnecTradie — Pricing & Fee System Spec v2.1 (Fairness-First)

**Status:** Ready to implement — supersedes v1 and v2. This is the authoritative version.
**Target:** Claude Code (Plan → Execute → Verify → Iterate)
**Load alongside:** `connectradie-standards`, `escrow-flow`, `migration-scaffolder`, `rls-security-auditor`, `edge-function-deployer`

---

## 0. What changed from v1 and why

v1 was economically sound but failed the pub test in three places. v2 fixes them and adds the retention mechanics that match the platform's actual goal: **retain tradies and clients through fair treatment, at rates that sustain a healthy business — not maximise extraction.**

| # | v1 | v2 | Why |
|---|----|----|----|
| 1 | Commission on full job value | **Commission on labour only** | 10% on a $2,400 hot-water job where $1,600 is the unit = 30% of the tradie's actual earnings. Tradies will route big jobs off-platform. Nobody in the AU market splits materials — this is the flagship differentiator: *"We don't tax your materials."* |
| 2 | Flat rate per tier | **Loyalty rate: drops to 5% for repeat client pairs** | Solves the off-platform bypass *structurally* instead of by policing. Staying on-platform is cheaper than leaving. Retention becomes the revenue model, not a countermeasure. |
| 3 | Cap at $900, no floor | **Cap $500, floor-protected at 2.5% of labour** | v1's cap went underwater ~$41k (Stripe's % cost exceeds the capped fee; a $50k job *lost* ~$187). v2 cap can never charge less than Stripe cost + margin. |
| 4 | Contact details withheld until escrow funded | **Masked proxy contact from quote acceptance** | v1 broke quoting — you can't quote a reno without a site visit, which happens before payment. Masked numbers give the same protection without breaking the workflow. |
| 5 | Scope-change note only | **Milestone escrow for jobs ≥ $3,000 labour** | Trades work on staged payments (deposit / rough-in / completion). Unlocks the big-job segment AND resolves the Stripe capture-amount constraint from v1 §6. |
| 6 | Pro $49 | **Pro $39** | The gap Pro bridges shrank (8→5 instead of 10→7), so the price drops with it. Breakeven ~$1,300/mo of labour — attainable for most working tradies. |
| 7 *(v2.1)* | Platform absorbed Stripe processing on materials | **Card processing on materials passed through at cost (~1.93%)** | v2 had a hidden loss: Stripe charges on the *total* payment but the platform only earns on labour. On the flagship hot-water case at the repeat rate, the platform lost ~$13/job. At-cost pass-through fixes it while keeping the "no markup on materials" promise literally true. |
| 8 *(v2.1)* | GST unresolved (open decision) | **GST-registered from day one; all rates inclusive** | ConnecTradie runs as its own Pty Ltd, voluntarily GST-registered. Advertised rates are GST-inclusive; registered tradies claim the GST back, making the real cost of an 8%-inc fee **7.27%** — a published selling point, not a footnote. |

The governing rule, updated:

> **One fee, one side, one moment — the tradie, on labour, at completion, capped, and cheaper the longer you stay.**

Unchanged from v1 (still binding):
- Clients never pay a platform fee
- Quoting is free and unlimited on every tier
- Subscriptions buy a lower rate, never access
- All money moves through Stripe escrow (PM tier excepted)
- Direct-payment bypass restricted to PM tier; anti-circumvention layers per v1 §3 (with §5 masking replacing contact-withholding)

---

## 0A. How the money works — plain-English explainer

*This section is canonical copy. Use it (verbatim or lightly adapted) for the in-app "How fees work" help page, the pricing page FAQ, and onboarding. It is written for a tradie reading on a phone between jobs.*

### Following one job through the system

Sarah needs her hot water system replaced. Dave the plumber quotes **$2,400**: the unit costs **$1,600** and his labour is **$800**. He enters those as two numbers when he quotes — that's the only extra step in the whole system.

**1. Sarah accepts and pays $2,400 into escrow.**
She pays the quote price. Nothing added, no platform fee, no surcharge — clients never pay us anything. Her money sits in escrow, which means Dave is guaranteed to get paid the moment the job's done. No invoicing, no chasing, no "cheque's in the mail".

**2. Dave does the job. Sarah confirms it's done.**

**3. The money is released, and it splits like this:**

| | |
|---|---|
| Job total | $2,400.00 |
| Our fee — 8% of Dave's **labour** only (inc GST) | −$64.00 |
| Card processing on materials — at cost, ~1.93% | −$30.88 |
| **Dave receives** | **$2,305.12** |

**4. Next job with Sarah, Dave's fee drops to 5%.**
Same job again next year: fee is $40, not $64. The longer you keep a client, the less you pay. Forever.

### Why each line is what it is

**Why only on labour?** Because the $1,600 unit isn't Dave's income — he bought it and passed it through. Platforms that charge commission on the full job value take $240 from this job; $192 of that is a tax on a box Dave bought at the plumbing supplier. We think that's wrong, so we don't do it.

**What's the 1.93% on materials then?** Card processing. When Sarah pays $2,400 by card, the card network charges a fee on all of it — that's true everywhere, including on the EFTPOS machine in your van. We pass that cost through on the materials portion at exactly what it costs us, with no markup, and we show it as its own line so you can see we're not hiding margin in it. On labour, it's already covered inside our fee.

**Why does the fee include GST?** All our prices include GST, no surprises at the bottom of the bill. If you're GST-registered (most of you are), you claim that GST back on your BAS — so the 8% fee really costs you **7.27%**. We give you a tax invoice for every fee automatically.

**Is there a maximum?** Yes — the fee is capped at **$500 per job** ($400 on Pro). A big renovation doesn't mean an unlimited bill.

**What's never charged, on any tier:** quoting (unlimited, free), seeing jobs, messaging clients, getting paid on standard 2-day payout, and disputes. If you don't win the job, you pay nothing at all.

### The whole model in one sentence

> **One fee, one side, one moment: 8% of your labour when the job completes — capped, GST claimable, nothing on materials, and cheaper every job you keep with the same client.**

---

## 1. The fee model

### 1.1 Labour / materials split

Every quote is submitted as two components:

```
quote_labour_cents     — tradie's labour, commission applies
quote_materials_cents  — materials at cost, NO commission, passed through escrow untouched
```

- Both components are held in escrow together and released together (or per-milestone, §6).
- Commission is calculated on `labour_cents` only.
- Materials require a one-line description (e.g. "Rheem 250L electric HWS — $1,540"). Not itemised receipts — tradies won't do it and it isn't needed.

**Abuse guard (light-touch, trust-first):**
- If `materials_cents / total > 0.75`, show the tradie a soft confirm: "Materials are more than 75% of this quote — just checking that's right."
- Flag ratios > 0.85 to the admin dashboard for pattern review (repeated outliers per tradie, not per job).
- Do **not** block, do not demand receipts, do not auto-penalise. The platform's premise is fair treatment; treat misclassification as a pattern problem for review, not a per-job accusation. A tradie systematically gaming the split gets a conversation, then removal — not an algorithm.

### 1.2 Rates

All rates and prices **include GST**. Registered tradies claim the GST component back as an input credit (effective cost of the 8% rate: 7.27%).

| | Free | Pro — $39/mo | PM — $149/mo ($119 annual) |
|---|---|---|---|
| Commission on **labour** (inc GST) | 8% | 5% | 3% |
| **Repeat-client rate** (same tradie + client pair, 2nd job onward) | 5% | 4% | 3% |
| Commission on materials | 0% | 0% | 0% |
| Card processing on materials — **at cost, no markup** | ~1.93% | ~1.93% | ~1.93% |
| Cap per job (commission only) | $500 | $400 | $270 |
| Cap floor | max(cap-check, 2.5% of labour) | same | same |
| Minimum fee | $5 | $5 | $5 |
| Quoting | Free, unlimited | Free, unlimited | — |

**Materials processing pass-through:** Stripe charges the platform on the full payment amount, but commission applies to labour only. The card-processing cost on the materials portion is deducted from the tradie payout *at actual cost* (`materials_processing_bps`, platform config, set to Stripe's effective inc-GST rate — 193 bps at launch, updated if Stripe reprices). It is **never** marked up, is disclosed as "card processing at cost" on every quote and payout breakdown, and is excluded from the commission cap. This keeps every job margin-positive, including materials-heavy repeat jobs, without breaking the "we don't take a cut of materials" promise — the platform takes nothing; Stripe's cost simply isn't absorbed by the platform on the tradie's behalf.

**Repeat-client definition:** a `(tradie_profile_id, client_profile_id)` pair with ≥1 prior job in `status = 'completed'` and payment `released`. Checked at fee-calculation time, server-side. Disputed/refunded jobs don't count.

**Why these numbers hold up:**
- 8% on labour-only is a *lower effective rate* than v1's 10%-on-everything for any job with materials, and equal for labour-only jobs. Nobody is worse off than v1; most are better off.
- The 8→5 loyalty drop makes the bypass economics upside down: leaving the platform to save 5% costs the tradie escrow protection, the review record, and the client's payment guarantee. Staying is the rational move.
- 2.5% floor > Stripe's ~2.2% all-in cost. No job can lose money.

### 1.3 Fee calculation (replaces v1 §5 module)

Same file, same rule — `supabase/functions/_shared/pricing.ts` is the **only** place a fee is computed.

```ts
export interface FeeInput {
  labourCents: number;
  materialsCents: number;
  tier: PricingTier;
  isRepeatClient: boolean;
  /** Platform config, NOT per-tier. Stripe's effective inc-GST rate in bps (193 at launch). */
  materialsProcessingBps: number;
}

export interface FeeBreakdown {
  commissionCents: number;          // platform's earnings (GST-inclusive)
  gstComponentCents: number;        // 1/11th of commission — for the tax invoice, not an extra charge
  materialsProcessingCents: number; // at-cost card processing on materials; not platform revenue
  totalDeductionCents: number;      // commission + materialsProcessing
  rateApplied: number;              // bps actually used
  rateType: "standard" | "repeat_client";
  wasCapped: boolean;
  floorApplied: boolean;            // true if 2.5% floor overrode the cap
  labourCents: number;
  materialsCents: number;
  netToTradieCents: number;         // labour + materials − totalDeduction
}

export function calculatePlatformFee(input: FeeInput): FeeBreakdown {
  const { labourCents, materialsCents, tier, isRepeatClient, materialsProcessingBps } = input;

  if (!Number.isInteger(labourCents) || labourCents < 0) throw new Error("INVALID_LABOUR");
  if (!Number.isInteger(materialsCents) || materialsCents < 0) throw new Error("INVALID_MATERIALS");

  const rateBps = isRepeatClient ? tier.repeat_rate_bps : tier.rate_bps;
  const raw = Math.round((labourCents * rateBps) / 10000);

  // Cap, but never below the floor (2.5% of labour) — cap cannot go underwater
  const floorCents = Math.round((labourCents * tier.cap_floor_bps) / 10000);
  const capped = Math.min(raw, Math.max(tier.fee_cap_cents, floorCents));

  const minFee = Math.min(tier.min_fee_cents, labourCents);
  const commissionCents = Math.max(capped, minFee);

  // At-cost card processing on the materials portion. Excluded from the cap.
  const materialsProcessingCents = Math.round((materialsCents * materialsProcessingBps) / 10000);

  const totalDeductionCents = commissionCents + materialsProcessingCents;

  return {
    commissionCents,
    gstComponentCents: Math.round(commissionCents / 11),
    materialsProcessingCents,
    totalDeductionCents,
    rateApplied: rateBps,
    rateType: isRepeatClient ? "repeat_client" : "standard",
    wasCapped: capped < raw,
    floorApplied: floorCents > tier.fee_cap_cents && capped === floorCents,
    labourCents,
    materialsCents,
    netToTradieCents: labourCents + materialsCents - totalDeductionCents,
  };
}
```

**Stripe integration note:** `application_fee_amount` at release = `totalDeductionCents`. The commission and the materials-processing components are separated in `payments` records and on the tradie's payout breakdown — never blended into one opaque number.

### 1.4 Required test cases (acceptance criteria)

All cases assume `materialsProcessingBps = 193`. "Mat. proc." = at-cost card processing on materials (round(materials × 1.93%)).

| Labour | Materials | Tier | Repeat? | Commission | Mat. proc. | Total deduction | Note |
|--------|-----------|------|---------|-----------|------------|-----------------|------|
| $800 | $1,600 | free | no | $64.00 | $30.88 | $94.88 | the hot-water case. v1 charged $240 commission; v2 lost margin here |
| $800 | $1,600 | free | yes | $40.00 | $30.88 | $70.88 | repeat rate; **margin-positive in v2.1** (v2 lost ~$13) |
| $50 | $0 | free | no | $5.00 | $0 | $5.00 | min fee (=10%; acceptable at this size) |
| $30 | $0 | free | no | $3.00 | $0 | $3.00 | min fee never exceeds labour |
| $1,000 | $0 | free | no | $80.00 | $0 | $80.00 | |
| $1,000 | $400 | free | no | $80.00 | $7.72 | $87.72 | the average-job reference case |
| $1,000 | $0 | free | yes | $50.00 | $0 | $50.00 | |
| $6,250 | $0 | free | no | $500.00 | $0 | $500.00 | exactly at cap |
| $10,000 | $2,000 | free | no | $500.00 | $38.60 | $538.60 | cap applies to commission only; mat. proc. excluded from cap |
| $25,000 | $10,000 | free | no | **$625.00** | $193.00 | $818.00 | floor active: 2.5% of $25k > $500 cap. v1 lost money here |
| $50,000 | $0 | free | no | $1,250.00 | $0 | $1,250.00 | floor scales; never underwater |
| $1,000 | $0 | pro | no | $50.00 | $0 | $50.00 | |
| $1,000 | $500 | pro | yes | $40.00 | $9.65 | $49.65 | |
| $10,000 | $0 | pm | no | $270.00 | $0 | $270.00 | PM cap |
| $0 | $500 | free | no | $0 | $9.65 | $9.65 | materials-only job: no commission (min fee ≤ labour = 0); processing still at cost |

GST component assertions (for tax-invoice generation, not extra charges):
- commission $80.00 → `gstComponentCents` = $7.27
- commission $64.00 → `gstComponentCents` = $5.82

Property invariants:
- `commissionCents ≥ 0`, integer, deterministic; same for `materialsProcessingCents`
- `commissionCents ≤ labourCents` always (commission can never consume materials)
- `materialsProcessingCents ≤ materialsCents` always
- commission never < 2.5% of labour once above min-fee territory, and materials processing is at cost ⇒ **no job loses the platform money on any input**
- repeat total deduction ≤ standard total deduction for identical inputs, on every tier
- `gstComponentCents = round(commissionCents / 11)` for every case

---

## 2. Data model changes

### 2.1 `pricing_tiers` (replaces v1 seed)

```sql
create table pricing_tiers (
  id                         text primary key,
  name                       text not null,
  monthly_price_cents        integer not null default 0,
  annual_monthly_price_cents integer,
  rate_bps                   integer not null,
  repeat_rate_bps            integer not null,
  fee_cap_cents              integer not null,
  cap_floor_bps              integer not null default 250,
  min_fee_cents              integer not null default 500,
  instant_payout_bps         integer not null default 150,
  instant_payout_min_cents   integer not null default 200,
  team_seats                 integer,
  direct_payment_allowed     boolean not null default false,
  active                     boolean not null default true,
  created_at                 timestamptz not null default now(),
  updated_at                 timestamptz not null default now(),
  constraint rate_sane   check (rate_bps between 0 and 2000),
  constraint repeat_sane check (repeat_rate_bps between 0 and rate_bps),
  constraint floor_sane  check (cap_floor_bps between 0 and rate_bps)
);

-- RLS identical to v1: public read of active tiers, service-role writes only.

insert into pricing_tiers
  (id, name, monthly_price_cents, annual_monthly_price_cents,
   rate_bps, repeat_rate_bps, fee_cap_cents, team_seats, direct_payment_allowed)
values
  ('free', 'Free',             0,     null,  800, 500, 50000, null, false),
  ('pro',  'Pro',              3900,  null,  500, 400, 40000, null, false),
  ('pm',   'Property Manager', 14900, 11900, 300, 300, 27000, 10,   true);
```

### 2.2 Quote and payment columns

```sql
alter table quotes
  add column labour_cents            integer,
  add column materials_cents         integer not null default 0,
  add column materials_description   text;
-- Backfill existing quotes: labour_cents = amount, materials = 0.
-- Then set labour_cents not null.

alter table payments
  add column labour_cents               integer,
  add column materials_cents            integer,
  add column commission_cents           integer,
  add column gst_component_cents        integer,
  add column materials_processing_cents integer,
  add column materials_processing_bps   integer,
  add column fee_rate_type              text check (fee_rate_type in ('standard','repeat_client')),
  add column fee_floor_applied          boolean not null default false;
-- v1 audit columns (fee_tier_id, fee_rate_bps, fee_was_capped, fee_calculated_at) retained.
-- platform_fee (existing column) = commission_cents + materials_processing_cents.

-- Platform-level config (service-role writes only, public read not required):
create table platform_config (
  key        text primary key,
  value_int  integer,
  updated_at timestamptz not null default now()
);
insert into platform_config (key, value_int) values ('materials_processing_bps', 193);
-- Update this value if and only if Stripe reprices. It must always equal actual cost —
-- the "at cost, no markup" claim is a published promise, and marking it up silently
-- would be an ACL problem as well as a trust one.
```

### 2.3 Repeat-client lookup

No new table. Server-side check at fee time:

```sql
-- exists: prior completed+released job for this pair
select exists (
  select 1 from jobs j
  join payments p on p.job_id = j.id
  where j.tradie_id = $1 and j.client_id = $2
    and j.status = 'completed' and p.status = 'released'
    and j.id <> $3  -- exclude the current job
);
```

Index to support it:
```sql
create index idx_jobs_pair_completed on jobs (tradie_id, client_id) where status = 'completed';
```

---

## 3. Masked contact (replaces v1 §3.2 contact-withholding)

v1 withheld contact details until escrow funded. **That breaks quoting** — site visits precede payment on any non-trivial job. Replace with masking:

1. On quote acceptance (pre-payment), open a proxy channel:
   - **Phone:** Twilio Proxy (or equivalent) number pair — each party dials a platform number that bridges to the other's real number. Real numbers never displayed.
   - **In-app messaging:** already exists; remains primary.
2. Real contact details are revealed **after first escrow funding for the pair** — at that point they have a transacting relationship and hiding numbers is theatre.
3. Message-flagging from v1 §3.3 stays as-is (flag, don't block).
4. Site visits are scheduled through the app (creates a record) but require no payment.

New table:

```sql
create table contact_proxies (
  id             uuid primary key default gen_random_uuid(),
  job_id         uuid references jobs(id) not null,
  tradie_id      uuid references profiles(id) not null,
  client_id      uuid references profiles(id) not null,
  proxy_number   text,
  provider_sid   text,
  status         text not null default 'active' check (status in ('active','expired','released')),
  created_at     timestamptz not null default now(),
  expires_at     timestamptz
);
create index idx_contact_proxies_job on contact_proxies(job_id);
alter table contact_proxies enable row level security;
create policy "proxy_parties_read" on contact_proxies for select to authenticated
  using (tradie_id = auth.uid() or client_id = auth.uid());
```

Cost note: proxy numbers cost real money (~$6/number/mo + usage on Twilio AU). Pool and recycle numbers; expire proxies 30 days after job completion. If cost is prohibitive pre-launch, ship in-app messaging + flagging only, and add voice proxy at Phase 6.

---

## 4. Milestone escrow (jobs ≥ $3,000 labour)

Solves two problems at once: trades work on staged payments, and Stripe cannot capture more than originally authorised (v1 §6's unsolved constraint).

### Model
```sql
create table job_milestones (
  id               uuid primary key default gen_random_uuid(),
  job_id           uuid references jobs(id) not null,
  sequence         integer not null,
  title            text not null,               -- "Deposit", "Rough-in", "Completion"
  labour_cents     integer not null,
  materials_cents  integer not null default 0,
  status           text not null default 'pending'
    check (status in ('pending','funded','released','disputed','cancelled')),
  stripe_payment_intent_id text unique,
  funded_at        timestamptz,
  released_at      timestamptz,
  created_at       timestamptz not null default now(),
  unique (job_id, sequence)
);
create index idx_milestones_job on job_milestones(job_id);
-- RLS: job parties read; writes via edge functions only.
```

### Rules
1. Tradie proposes milestones at quote time (templates per trade: Deposit 10–20% / Rough-in / Completion). Client accepts as part of quote acceptance.
2. **Each milestone is its own PaymentIntent** — funded before its stage begins, released on client approval of that stage. This is what makes scope changes tractable: a variation is simply a new milestone with its own escrow deposit. No capture-amount gymnastics.
3. **Fee treatment:** the platform fee is calculated on the job's **total labour** (so the cap and repeat-rate apply to the whole job, not per-milestone), then apportioned pro-rata across milestones by labour share, deducted at each release via `application_fee_amount`.
   - Recompute total-job fee if a variation milestone is added; apply the delta to remaining milestones.
   - Property to test: sum of per-milestone fees = fee on total labour, ±1c rounding, with the rounding remainder on the final milestone.
4. Deposit milestone is capped at 20% of total, matching NSW home building contract norms for jobs over $20k (flag: confirm current NSW Fair Trading deposit caps before launch — this is a compliance point, not a style choice).
5. Single-milestone path (jobs < $3,000) is just the existing flow — no behaviour change.

---

## 5. UI requirements (delta from v1 §10)

### Quote form
Two amount fields, not one:
> **Your labour:** $______  ← *"Our fee only ever applies to this"*
> **Materials at cost:** $______ + one-line description ← *"We take nothing on materials — just card processing at cost (~1.93%)"*

Show live, server-computed: "You'll receive **$X** if you win — fee $Y (Z% of labour, inc GST) + $W card processing on materials (at cost)."

### Pricing page — the fairness pitch, with the real numbers
Headline: **"We don't tax your materials. And the longer you stay, the less you pay."**

Worked example block (the hot-water job):
> $2,400 hot water system replacement — $1,600 unit + $800 labour.
> On hipages-style full-value commission: up to $240 in fees.
> On ConnecTradie: **$64.** Repeat client? **$40.**

Calculator inputs: typical monthly labour, typical materials share, % repeat clients → recommends Free or Pro honestly (recommends Free below ~$1,300/mo labour).

Show the loyalty rate prominently to *clients* too: "Your tradie's fee drops after your first job together" — it tells clients the platform rewards the relationship rather than farming it.

### "How fees work" help page
Build as a static in-app page using §0A verbatim (Sarah/Dave walkthrough, the split table, the FAQ answers, the one-sentence summary). Link it from: the quote form's fee line, every payout breakdown, and the pricing page. The payout breakdown's line items must use the same wording as §0A ("Our fee — 8% of your labour (inc GST)", "Card processing on materials — at cost") so what tradies read in the explainer is literally what they see on their money.

### Tradie dashboard
Add a "Loyalty savings" line: cumulative fees saved via repeat-client rate. Make the retention economics visible — it's the reason to stay.

---

## 6. What v2.1 revenue looks like (for planning — do not overstate)

Per $1,000 of labour released: $80 gross commission (free tier) / $50 (repeat or Pro). Stripe's processing on the labour portion (~$20/$1,000) comes out of the commission; processing on materials is passed through at cost and is margin-neutral. GST remittance: 1/11th of commission goes to the ATO, offset by input credits on Stripe fees and infra. Net margin on commission ≈ **4.5–5.5% of labour GMV blended** after GST.

Sustainability reference (not a promise): ~$120k monthly labour GMV ≈ $5.5–6.5k net commission; each Pro subscriber adds ~$32 net after GST. Fixed platform costs (Supabase, hosting, proxy numbers, APIs, warmup transfers at ~$1.35/new tradie) budget: $500–1,000/mo at launch scale.

---

## 7. Implementation order (revised)

| Phase | Work | Gate |
|-------|------|------|
| **1** | v1 §2–3: bypass restriction + flagging (with §3 masking replacing withholding) | Bypass verified closed via direct API call |
| **2** | §2 migrations, §1.3 fee module + full §1.4 test suite | All tests green incl. floor + repeat cases |
| **3** | Labour/materials split in quote flow + escrow release with new fee | E2E job in Stripe **test keys** (see §8 note): split quote → deposit → release → correct fee split incl. materials processing; hot-water case verified |
| **4** | Repeat-client rate + subscriptions/webhooks (v1 §7, Pro at $39) + §7B payout warmup & schedule config | Repeat rate applies only after a genuine completed+released prior job; tier unforgeable client-side; new account passes §7B acceptance |
| **5** | Pricing page + calculator + disclosure | Calculator recommends Free when Free is cheaper |
| **6** | Milestone escrow (≥$3k) | Multi-milestone job E2E; per-milestone fees sum to total-labour fee |
| **7** | Contact proxy, instant payout (v1 §8), boost (v1 §9) | All opt-in, disclosed, never default |

---

## 7A. GST & entity structure (RESOLVED — was open decision 1)

**Decision:** ConnecTradie operates as its own Pty Ltd, separate from the cleaning business, and is **voluntarily GST-registered from day one.** (The cleaning business exceeds $75k and is GST-registered; separation gives ConnecTradie its own books, its own liability boundary around escrow funds, and clean GST treatment. Entity setup, Stripe account, bank account, and Supabase billing all sit under the new company before launch.)

Implementation consequences:

1. **All advertised rates and prices are GST-inclusive.** No exclusive-price display anywhere. The pricing page states: *"All fees include GST. GST-registered tradies claim this back — an 8% fee really costs you 7.27%."*
2. **Tax invoices are auto-generated** for every commission charged: PDF or emailed invoice per released payment (or a monthly consolidated invoice — tradie's choice, monthly default), showing commission ex-GST, GST component (`gst_component_cents`), and total. Must include ConnecTradie's ABN and the words "Tax Invoice". Subscription charges likewise (Stripe Billing handles this natively — enable AU tax settings with inclusive pricing).
3. **The fee calculation does not change.** `gst_component_cents = round(commission / 11)` is a reporting decomposition of an inclusive amount, not an addition.
4. **Materials processing pass-through** is disclosed at cost; its GST treatment on the platform's BAS is an accountant question — record it separately (`materials_processing_cents`) precisely so the accountant can classify it without archaeology.
5. **No `gst_registered` toggle.** Registered day one means no dual-mode logic, no repricing event later.

*(Confirm with the accountant: agent/facilitator treatment — the platform's GST turnover is its fees, not job values — and the BAS classification of the processing pass-through. Both are standard marketplace positions; neither blocks the build.)*

---

## 7B. Payout speed (new — tradies must never feel the 7-day hold)

Stripe's timeline for AU Express accounts: a one-time ~7-day review on the account's **first** payout (clock starts at first charge), then ~2 business days standard thereafter, with instant payout (minutes, incl. weekends) unlocked once the first payout clears. Three requirements so no tradie ever waits 7+ days for a real job:

1. **Burn the first-payout hold at onboarding, not on the first job.** Immediately after a tradie completes Stripe Connect onboarding, trigger a nominal platform-funded charge-and-transfer (e.g. $1, marked as an onboarding verification credit — the tradie keeps it) to that account. This starts the 7-day clock while they're still setting up their profile and getting licence-verified. By the time they win their first job, the hold is already spent and the first real payout moves at the standard ~2-day speed. Implement as part of the onboarding-complete webhook handler; record it in a `payout_warmups` table (profile_id, charge_id, transfer_id, warmed_at) so it runs exactly once per account. Cost: ~$1.35/tradie (the $1 + Stripe's minimum fee) — treat as a customer-acquisition cost line.
2. **Set the payout schedule explicitly.** On account creation, set `settings.payouts.schedule = { interval: 'daily', delay_days: 'minimum' }`. Never rely on Stripe's default. One config call in the Connect onboarding function; assert it in the nightly audit.
3. **"Secured" UI state.** From the moment escrow is funded, the tradie's job view and payout screen show: **"$X secured — released to you on completion."** The pitch is not payout speed alone; it is certainty. The comparison a tradie lives with is 30–60 days of invoicing and chasing, not 2 days vs instant. The funded-escrow state must be visually distinct (and reassuring) everywhere the job appears.

Instant payout itself is unchanged from v1 §8: opt-in, 1.5% min $2, fully disclosed against the free 2-day alternative, never the default.

Acceptance: a newly onboarded tradie account has (a) a completed warmup transfer, (b) a daily/minimum payout schedule verifiable via the API, and (c) their first real-job payout arriving on the standard schedule, not the first-payout hold.

---

## 8. Open decisions (carried + new)

1. ~~GST~~ **Resolved — see §7A.**
2. **Founder tier** for William's cleaning clients (carried): recommend a `founder` tier row at 0% over a per-profile override column.
3. **⚠️ Environment keys (new, urgent):** the deployed app is currently running **live** Stripe keys — a real $5.48 charge, real Connect account, and real payouts exist as of 17 July 2026. Before Phase 1: audit which env vars hold `sk_live`/`pk_live` vs `sk_test`/`pk_test` across Supabase Edge Function secrets, frontend build config, and mobile builds; establish a test-key environment for all development and E2E work; reserve live keys for deliberate smoke tests only. No further live transactions until the known refund-DB-failure and double-transfer bugs are fixed.
4. **NSW deposit caps** for milestone jobs: confirm current Fair Trading rules before Phase 6.
5. **Repeat-rate scope:** currently pair-based (this tradie + this client). Alternative: tradie-level volume discount. Pair-based is recommended — it rewards the relationship, which is the anti-bypass mechanism; volume discounts reward size, which isn't the goal.
6. **Twilio proxy cost** vs launch budget: acceptable to defer voice proxy to Phase 7 and launch with in-app messaging + flagging only.

---

## 9. Definition of done (v2 additions to v1 §13)

- [ ] Fee is computed on labour only; materials pass through untouched in every path
- [ ] Repeat-client rate applies iff a prior completed+released job exists for the pair, checked server-side
- [ ] Floor guarantees no job's fee < 2.5% of labour (above min-fee territory); $25k-labour test case passes
- [ ] Sum of milestone fees equals total-labour fee ±1c
- [ ] No contact detail is displayed pre-funding; proxy or in-app channels work pre-payment
- [ ] Quote form captures labour + materials separately with live net-to-tradie display
- [ ] Calculator recommends Free when Free is cheaper
- [ ] Materials processing is deducted at exactly `platform_config.materials_processing_bps`, shown separately on every quote/payout breakdown, never capped into or blended with commission
- [ ] `gst_component_cents` recorded on every commission; tax invoice generated per release (or monthly consolidated) with ABN and "Tax Invoice" wording
- [ ] All prices displayed anywhere in the product are GST-inclusive
- [ ] No job input can produce a platform loss (property test across labour × materials grid)
- [ ] Every onboarded tradie account: warmup transfer completed once, payout schedule = daily/minimum (API-verified), funded-escrow "secured" state shown on job and payout views
- [ ] All v1 §13 items still hold
