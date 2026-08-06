# The cleaner's bid calculator — what's in it, and what we took

Analysis of a post-construction cleaning "Master Bid Calculator" circulating among US
cleaning contractors on Facebook, assessed against ConnecTradie's quoting system.

**Conclusion:** the top half of the spreadsheet we already do better. The bottom half we
didn't do at all, and it's the half that matters. That half is now built, and it is
trade-agnostic.

---

## 1. The source

A screenshot of an Excel workbook titled *Hanover / York County • Post-Construction
Cleaning • Master Bid Calculator*, plus the comment thread beneath it.

The author (Mandy Leigh) describes building it herself: about 12 hours of research run
through several LLMs, cross-checked against ISSA and industry sources, compiled to a PDF,
then turned into the Excel workbook. It is not an app and she has no way to distribute it.

The top reply on the thread is *"Where did you get this calculator from? Can you send a
copy to me?"* — 1 like, and the author's answer is essentially "I can't."

That's the demand signal worth acting on: contractors want a bid tool that tells them
whether a job is actually profitable, and the state of the art on offer is an
un-shareable spreadsheet.

---

## 2. The model, transcribed

Yellow cells are inputs; everything else computes.

### §1–2 · Area

| Field | Value | Note |
|---|---|---|
| Gross square footage | 3,000 | from plans or listing |
| Conversion factor | 0.90 | Res 0.90 · Comm 0.85 · 1.00 if extensive cabinetry |
| **Cleanable square footage** | **2,700** | gross × factor |

### §3 · Phase and site conditions

Phase must match one of four names exactly. Condition multiplier is 1.00 normal,
1.15–1.25 heavy, 1.30+ for heavy dust, active trades or no utilities.

| Phase | Rate $/sq ft | Production rate (sq ft / person-hr) |
|---|---|---|
| Rough | 0.28 | 160 |
| Final | 0.55 | 90 |
| Touch-Up | 0.22 | 140 |
| 3-Phase Bundle | 0.85 | 70 |

The sheet notes these "assume higher-end wages + slower/safer production" and instructs
the user to update them from real job data — the rates are explicitly provisional.

### §4 · Base price

```
base price     = cleanable × phase rate × condition = 2,700 × 0.55 × 1.00 = $1,485.00
person-hours   = cleanable ÷ production rate        = 2,700 ÷ 90         = 30.0
minimum job value                                                         = $250.00
```

### §5 · Add-ons (entered as dollars, with guide rates)

Interior windows/sills ($8–15 per window or package) · exterior windows · high-access
>12 ft or scaffolding ($75 flat) · carpet hot-water extraction ($0.25/sq ft) · VCT strip,
seal & wax ($0.65/sq ft) · light junk hauling ($150/load) · heavy construction debris
($75/hr + dumpster) · specialty floors.

### §6 · Client-facing price

Total = base + add-ons = $1,485.00 · effective $0.55/cleanable sq ft · rounded to nearest
$10 = **$1,490.00**.

### §7 · Internal cost & margin check

This is the part that earns its keep.

```
staff base wage                          $24.00/hr
× labour burden 1.40                     $33.60/hr fully loaded
× 30 person-hours                     =  $1,008.00   labour
+ materials at 7% of labour           =     $70.56
                                      =  $1,078.56   direct costs
+ overhead recovery, 20% of direct    =  $1,294.27
+ owner/profit/growth, 25%            =  $1,617.84   ← minimum price to hit targets
quoted $1,485.00 − $1,617.84          =   −$132.84   cushion
                          STATUS: LOW – raise phase rate or add-ons
```

**A quote that reads healthy at $1,485 is about 8% underwater.** The sq-ft rate sells the
job; only §7 tells you whether you should take it.

---

## 3. The comment thread

The replies are more useful than the sheet in places.

- **Kevin Noles** (5 likes, top comment) — *"For post-construction, I'd build the bid from
  labor hours first, then add supplies, equipment, disposal, travel, payroll burden,
  insurance, and your target profit. Be careful about scope creep — spell out what is
  included, what counts as a touch-up versus an additional visit, and whether
  window/detail work is included."* Cost build-up beats rate-per-unit, and scope
  definition is where the money leaks.
- **Josh Winter** — $0.50–0.75/sq ft, more when furnished or heavily glazed (car
  dealership cited).
- **Kathy Trevathan** (25 years, Texas) — *"A lot of it depends on what state you're in and
  what they're requiring… those numbers are extremely high."* Rates are regional. Any
  published rate table is wrong somewhere.
- **Keesha Thweatt Frazier** — prices post-construction in three steps (rough, final,
  move-in), charges by sq ft. Independent confirmation of the phase structure.
- **Devon Reynolds** (dissent) — *"Commoditizing your work is how you fail at business…
  I used to measure and track everything to try and minimize variability. The underlying
  assumptions behind this behavior is wrong."*

The dissent deserves an answer rather than a dismissal, because it points at something
real. The answer is that §7 is not a commoditisation tool — it is the opposite. Knowing
your cost floor is what lets you decline work priced below it. Without the floor you have
no principled basis for refusing a race to the bottom, only a feeling.

---

## 4. Gap analysis against ConnecTradie

### Already ours, and better

`supabase/functions/estimate-quote/index.ts` splits responsibility deliberately: the AI
estimates only physical work (hours, materials, confidence, whether a site visit is
needed), and the function computes money deterministically from the tradie's own
economics. It has photo and video vision, per-trade heuristic coefficients as a fallback,
their last six accepted quotes as pricing anchors, credit metering, and anonymised area
market ranges via `get_area_price_range()`.

Against that, §1–6 of the spreadsheet is a step backwards. There was nothing to take.

### The gaps, before this change

| Spreadsheet element | ConnecTradie | |
|---|---|---|
| Staff **wage** as distinct from charge rate | one `hourly_rate`, publicly advertised | gap |
| Labour burden multiplier | — | gap |
| Overhead recovery | — | gap |
| Owner/profit/growth as its own layer | folded into one 15% `marginPct` | gap |
| **Minimum viable price** | — | **the gap** |
| **Cushion + verdict** | — | **the gap** |
| Minimum job value floor | — | gap |
| Tradie-editable production rates | hardcoded in the edge function | gap |
| Condition multiplier as a number | fixed chips (×1.5 / ×1.7) | gap |
| Add-on catalogue with guide rates | — | gap |
| Gross→cleanable conversion | — | cleaning-specific |
| Rough/Final/Touch-Up phases | — | cleaning-specific |
| Persisting any of the cost basis | `applyResult()` discarded everything | architectural |

The root problem: `tradie_details.hourly_rate` is a **charge-out** rate — it renders on
`PublicTradieProfile.tsx` as "Hourly Rate $X/hr" — and the estimator applied a 15% margin
on top of it. No code path anywhere checked that the charge rate covered wage, burden and
overhead. **There was no cost floor in the product.**

---

## 5. What was built

The §7 cost chain, and nothing above it.

- `src/lib/costModel.ts` — `checkMargin()`, pure, cents and percentages only. Reproduces
  the worksheet's own example to the cent (see `costModel.test.ts`).
- `tradie_cost_settings` — the tradie's private wage, burden, overhead, profit target and
  minimum job value. Owner-only RLS.
- `quote_cost_snapshots` — what the numbers were when a quote went out.
- `MarginCheckPanel` + `CostBasisFields`, mounted in the estimator, `SubmitQuoteModal`,
  and Settings → Professional.

Two adjustments the spreadsheet doesn't have to make, and we do:

1. **Compare against ex-GST.** GST is collected for the ATO, not income. Comparing a
   GST-inclusive total against a cost floor overstates the cushion by 10% for every
   registered tradie — on its own enough to turn a loss green.
2. **Net off platform commission.** Commission is charged on labour only under pricing
   v2.1. A free-tier tradie pays 800 bps of labour, so a 10% cushion computed gross is a
   loss once netted. `calculatePlatformFee` is reused so the figure can't disagree with
   what is actually charged.

The second is the part no offline calculator can do, and the strongest argument for this
living in the product rather than in an emailed `.xlsx`.

### Two placement decisions worth recording

**Not on `tradie_details`.** That table is read by `PublicTradieProfile.tsx`. A wage or
profit target stored there would be published to the open web.

**Not as a column on `quotes`.** `quotes` carries a client-side SELECT policy ("Clients
can view quotes on their jobs"), and RLS is row-level — a client who can see the row can
read every column on it. A cost snapshot there would hand the client the tradie's margin
percentage, materials markup and cost floor: their entire negotiating position. Verified
by probe: owner sees their row, another authenticated user sees 0, anon sees 0.

### Advisory, never gating

A `below` verdict disables nothing, blocks no submit, and raises no confirmation. No field
is required. Wage unset means no verdict — no banner, no nag, no onboarding step. A tradie
may have good reasons to take a job at a loss: a foot in the door with a builder, a quiet
fortnight. The panel exists so that choice is deliberate rather than accidental.

Australian context is delivered as **information, not enforcement**. Awards get a mention
and a Fair Work link in the wage field's help text; superannuation, workers' compensation,
payroll tax and leave loading are named as what the burden percentage should cover. No
rate tables, no validation, no warnings. Award rates vary by classification level, casual
versus permanent, and penalty rates — asserting a floor would be industrial-relations
advice this platform is not placed to give, and would be red tape on top.

---

## 6. Is it practicable for other trades?

Yes. In three layers.

**Layer 1 — universal.** Wage → burden → direct cost → overhead → profit → minimum viable
price is ordinary contracting cost accounting. It is identical for a sparky, a painter and
a landscaper, and `costModel.ts` contains no trade vocabulary at all. Every field label is
standard: base hourly wage, labour burden, overhead recovery, profit target, minimum job
value.

**Layer 2 — any measured trade.** *Adjusted quantity ÷ production rate = hours.* Only the
units and the staging names change. The existing heuristic in `estimate-quote` already
encodes coefficients for most of these.

| Trade | Measured quantity | Rate unit | Staging (the "phase" analogue) |
|---|---|---|---|
| Cleaning | m² floor | m²/person-hr | Rough / final / move-in |
| Painting | m² net paintable (deduct openings) | m²/hr per coat | Prep / undercoat / topcoat |
| Flooring & tiling | m² + waste factor | m²/hr | Prep / lay / grout & seal |
| Fencing | lineal m | lm/hr | Post set / rail / infill |
| Electrical | points, circuits | points/hr | **Rough-in / fit-off** |
| Plumbing & gas | fixtures | fixtures/hr | **Rough-in / fit-off** |
| Landscaping | m² | m²/hr | Prep / install / handover |
| Concreting | m² (+ m³) | m²/hr | Form / pour / finish |
| Rendering | m² | m²/hr | Scratch / float / topcoat |
| Carpentry | lineal m or item count | varies | — |
| Handyman, emergency, break-fix | none — unknown until on site | n/a | n/a → site-visit flow |

Note that rough-in / fit-off in electrical and plumbing is structurally the same idea as
the cleaner's rough / final / touch-up. Even the phase concept mostly generalises.

**Layer 3 — cleaning-only.** The gross→cleanable conversion factor and sq-ft-per-person-hour
production rates. Not built.

One detail for whoever builds Layer 2: the conversion factor generalises in *both*
directions. Cleaning deducts cabinetry (0.85–0.90), painting deducts window and door
openings, but flooring *adds* a waste factor (~1.10). Do not constrain it to ≤ 1.0.

Where it doesn't fit: emergency callouts and diagnostic break-fix, where scope is unknown
until arrival. The existing `needsSiteVisit` and three-stage site-visit flow already covers
that case and should keep it.

---

## 7. Australian adaptation

Straight unit conversion of the sheet's rates (1 m² = 10.764 sq ft):

| Phase | Sheet | Metric | Production |
|---|---|---|---|
| Rough | $0.28/sq ft | $3.01/m² | 14.9 m²/person-hr |
| Final | $0.55/sq ft | $5.92/m² | 8.4 m²/person-hr |
| Touch-Up | $0.22/sq ft | $2.37/m² | 13.0 m²/person-hr |
| 3-Phase Bundle | $0.85/sq ft | $9.15/m² | 6.5 m²/person-hr |

These remain US labour-market figures. Australian cleaning wages under the Cleaning
Services Award sit well above the sheet's $24 base, and Kathy Trevathan's point about
regional variance applies at least as strongly here.

Burden: the sheet's 1.40 is a US number. The AU default shipped is **1.30**, built from
superannuation 12%, state workers' compensation, state payroll tax, and four weeks' leave
with 17.5% loading. It is a starting point, overridable, and not validated against
anything.

Other substitutions: sq ft → m² and lineal metres; OSHA 10 → White Card (Construction
Induction); ISSA → BSCAA for local benchmarks; GST 10% with the $75k registration
threshold, already handled via `profiles.is_gst_registered`. Cleaning is not a licensed
trade in Australia, which the `LICENSED_TRADES` list in `estimate-quote` already gets
right.

---

## 8. Going global

Cheap seams, taken now:

1. **No Australian concept in any column name** — `labour_burden_pct`, not `super_pct`.
   Locale detail lives in help text, which is a copy change.
2. **`costModel.ts` knows nothing of currency or measurement system.** Cents and
   percentages only, so it ports unchanged.

Load-bearing assumptions, flagged and deliberately not touched:

- **GST is hardcoded** as `subtotal * 0.1` in both `estimate-quote/index.ts` and
  `computePrice` in `QuoteEstimator.tsx`. NZ is 15%, UK VAT 20%, Singapore 9%, and most US
  states levy nothing on services. This is the most invasive single assumption in the
  pricing path. The margin engine sidesteps it by consuming the ex-GST subtotal, so this
  change didn't need to touch it — but it is first in line for a second country.
- **Currency** is `$` literals and `toLocaleString('en-AU')` across the money helpers.
  Display is the easy half.

**The calculator is not what makes going global hard.** The real work is Stripe Connect
country-by-country onboarding and capabilities, multi-currency escrow and payouts,
per-jurisdiction tax, and licence verification — `verify-abn` and `verify-license` are
structurally Australia-only. Quoting work should not be mistaken for progress on
internationalisation.

---

## 9. Deliberately not built

- Cleaning phase rates and the gross→cleanable conversion factor
- A persisted add-on catalogue with guide rates
- Making the heuristic's production coefficients tradie-editable
- Reviving the dead `standard_rates` table
- Any change to `estimate-quote` — the margin check is a pure function of hours and
  private settings, so the edge function never needs to know about it, which keeps the
  whole change client-side and off the money path
- Any platform-published per-trade rate benchmark. Kathy Trevathan's point is the
  practical objection; publishing pricing guidance across a marketplace of competing
  contractors is the other one.
