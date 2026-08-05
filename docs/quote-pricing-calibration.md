# Pricing calibration: does the margin check agree with the Australian market?

Follow-on to `quote-calculator-analysis.md`. That report explained what was built; this
one tests it against real 2026 Australian rates and answers the question that prompted
it — *what price wins the quote?*

**Headline:** the model is arithmetically sound and the calibration is defensible, but it
grades most of the advertised hourly cleaning market as unviable. That is a finding about
the market, not a bug. The single most useful result is unrelated to the defaults: on
identical work, quoting **per m² instead of per hour is worth ~$912 on one 200 m² job**.

---

## 1. The question that can't be answered

The ask was a formula that wins the quote 100% of the time. There isn't one, for two
reasons worth separating.

**It isn't only about price.** Win rate turns on reviews, response latency, availability,
photos, licence status, and whether the client already had someone in mind. Price is one
input. The only price that wins every time is one at or below cost — which is exactly
what the margin check exists to prevent. *Win every quote* and *clear your costs* are
opposing objectives; you can max either, not both.

The coherent version of the question is **expected value**:

```
EV(price) = P(win | price) × cushion(price)
```

Maximise that and you make the most money over a year, which is what "winning" should
mean.

**We cannot fit `P(win | price)` today.** The canonical optimal-markup models —
[Friedman (1956)](https://www.researchgate.net/publication/332263270_Bidding_Strategy_Using_Friedman_Model_for_Building_Construction_Project_in_Banjarbaru_Indonesia)
and [Gates (1967)](https://www.researchgate.net/publication/43474832_Gates'_Bidding_Model)
— both calibrate from competitors' past bids. Production currently holds:

| | |
|---|---|
| Quotes, all time | **9** |
| Tradies | **1** |
| Jobs with more than one quote | **0** |
| Declines | **0** |
| Mean accepted price | $20 (test data) |

There is not one observed instance of a tradie winning or losing against another. Any
"optimal markup" produced from this would be invented numbers wearing a formula — worse
than no answer, because it would look authoritative while being arbitrary.

**And the prize is smaller than it sounds.** From the same literature: *"contractor
expected value is not very sensitive to markup, or its method of selection."* The EV
curve is flat near its peak. Getting the cost floor right is worth more than optimising
the markup on top of it — which is fortunate, because the floor is the part we *can* do.

---

## 2. Market calibration

Persona: an Australian cleaner. Wage $34/h, burden 30%, overhead 20%, profit 20% — the
shipped defaults. Loaded cost **$44.20/h**. Free-tier commission applied. All bands are
researched 2026 rates; sources at the end.

| Segment | Market band | low | mid | high | break-even |
|---|---|---|---|---|---|
| Commercial cleaning, hourly (national) | $35–65/h | ✗ below | ✗ below | ✗ below | **$76.10/h** |
| Commercial cleaning, hourly (Syd/Melb) | $50–80/h | ✗ below | ✗ below | ✓ healthy | $76.10/h |
| Bond clean, 2 bed | $280–450 flat | ✗ below | ✗ below | ✓ healthy | $84.28/h |
| Bond clean, 3 bed | $350–650 flat | ✗ below | ✗ below | ✓ healthy | $84.28/h |
| Builders clean, hourly | $50–75/h | ✗ below | ✗ below | ✗ below | $84.27/h |
| Builders clean, per m² | $8–16/m² | ✗ below | ✓ healthy | ✓ healthy | $80.22/h |

Reproduce with `npx vitest run src/lib/__tests__/costModelMarket.test.ts`.

### 2.1 The commodity band fails, and loosening the targets cannot fix it

A 4-hour commercial clean at the $50/h national mid:

```
revenue                     $200.00
loaded labour (4h × $44.20) $176.80
platform fee (8% of labour)  $16.00
left over                     $7.20   — 3.6% of revenue
```

Even at **0% overhead and 0% profit** that job grades *thin*, not healthy. The gap is not
in the targets; it is in the ratio. A $50/h charge-out against a $44.20/h loaded cost is a
**1.13× multiplier**, and commission takes most of what remains.

Holding the 20/20 target and solving for wage instead:

| Wage | Verdict at $50/h | Cushion |
|---|---|---|
| $34/h | below | −$70.59 |
| $30/h | below | −$40.64 |
| $28/h | below | −$25.66 |
| $26/h | below | −$10.69 |
| $24/h | thin | +$4.29 |
| $22/h | healthy | +$19.26 |

The $50/h market rate only supports a 20/20 target at a wage around **$22/h** — below the
Indeed AU average for a cleaner, and at or under award minimums for most classifications.

**Read that carefully before concluding the model is wrong.** It says a *staffed* cleaning
business cannot pay $34/h and charge $50/h. That is consistent with how the segment
actually operates: owner-operators, who take their income *as* the margin rather than as
a wage on top of it. For a solo operator the correct configuration is a lower profit
target, or the wage set to what they want to earn with profit near zero — not the
employer defaults.

### 2.2 The basis is worth more than the rate

The most actionable result in this exercise. One 200 m² builders clean, 23.8 person-hours,
both figures at researched market mid:

| Quoted as | Price | Effective | Verdict |
|---|---|---|---|
| $62.50/h (hourly basis) | $1,488.10 | $62.50/h | ✗ below |
| $12/m² (area basis) | $2,400.00 | $100.80/h | ✓ healthy |
| **Difference** | **$911.90** | +61% | |

Same work, same market, same day — the market advertises builders cleans on both bases,
and one is worth 61% more than the other. **A cleaner quoting builders work hourly is
leaving roughly $900 per job on the table.** No markup optimisation available anywhere
comes close to that, and it needs no win-rate data to act on.

This is what the source spreadsheet was groping toward with its per-sq-ft phase table, and
it is the strongest argument for eventually building the per-unit rate layer that was
scoped out of the first pass.

### 2.3 Commission moves the break-even, modestly

Break-even to *healthy* on the 4-hour commercial clean: **$76.10/h** on free tier vs
**$73.70/h** on pro — a $2.40/h difference. Real, but an order of magnitude smaller than
the basis effect above.

---

## 3. The defaults: recommendation, not applied

Per the decision taken when this work was scoped, the shipped 20% / 20% defaults are
**unchanged**. The recommendation:

- **Do not lower them to make the commodity band pass.** They are correct for a staffed
  business, and lowering them would bake the market's own underpricing into the product —
  the precise failure the original Facebook thread was about.
- **Do distinguish solo operators from employers in the copy.** The wage field help text
  currently says "your own drawing if you work solo", which is right, but a solo operator
  entering $34/h *and* keeping a 20% profit target is double-counting their own income.
  A one-line hint under the profit field would fix it. Cheap, and worth doing.
- **Revisit once real quotes accumulate.** With a live corpus the defaults can be checked
  against what tradies on this platform actually charge, rather than against published
  cost guides.

---

## 4. What was blocking the data — now fixed

The exploration found the capture broken in ways that would have made a win-rate model
unfittable even after volume arrived. Fixed in this pass:

| Defect | Effect | Fix |
|---|---|---|
| `SubmitQuoteModal` never wrote `trade_category` | `get_area_price_range` matches on it, so **the entire on-app quote corpus was invisible** to the market range | Populate from `tradeType` |
| `accepted_at` NULL on every 3-stage win | Trigger guards on `OLD.status='pending'`; v2 goes `final_submitted → accepted`, so it never fired. No win timestamp | Set explicitly in `accept-and-pay` |
| Cascade declines recorded status only | "Lost to a competitor" — the **dependent variable** — was unlabelled and recoverable only by inference | Set `declined_at` + `decline_reason='cascade'` |
| `get_area_price_range` used `coalesce(firm_price, price_min)` | Took the **bottom** of every range and ignored `final_price`. Measured understatement of the median: **$300 on $600 — 100%** | Mirror the money path: `final_price → firm_price → price_max` |
| Same function filtered `status IN ('accepted','completed')` | `'completed'` is not a legal `quotes.status`; that half matched nothing | Dropped |
| Same function had no time window | Unbounded history, no recency — 2026 prices would still drag the median in 2030 | 18-month rolling window |
| `AnalyticsDashboard.conversionByRange` bounds in cents, `quoteAmount()` in dollars | Every quote fell in the first bucket. The **only** price-vs-conversion view in the app reported one bar | Bounds in dollars |

Rollback safety: the revert path in `accept-and-pay` now also clears `accepted_at`,
`declined_at` and `decline_reason`, so a failed acceptance does not leave a phantom win or
phantom competitive losses behind.

---

## 5. Still broken — separate tickets

Not fixed here; both actively mislead tradies today.

1. **`SubmitQuoteModal` "price guidance from similar quotes"** queries `quotes` with no
   trade filter and no geo filter, and under RLS a tradie can only read their own rows. So
   the "market hint" is **the tradie's own average**, presented as market context. It
   should use `get_area_price_range`, which exists and is now correct.
2. **`SmartInsightsWidget`** asserts a tradie's win rate is "above average for your area"
   with no area comparison performed anywhere in the component.

---

## 6. When optimal-markup pricing becomes possible

Not at n=5. Friedman and Gates both estimate a distribution of competitor bids per
trade-and-area; that needs **tens of competitive bids within a comparable segment** before
the fit means anything, and the segment is the binding constraint — 200 quotes spread over
12 trades and 20 suburbs is still thin everywhere.

Practical sequencing:

1. **Now.** Cost floor only, which is what ships. It needs no market data and it is the
   part with the larger payoff.
2. **At ~30–50 accepted quotes in one trade-and-area.** `get_area_price_range` starts
   returning real percentiles (it needs 5, but 5 is a privacy floor, not a statistical
   one). Show the tradie where their price sits in the band. Descriptive, not prescriptive.
3. **At a few hundred competitive quotes with recorded outcomes.** Fit `P(win | price)`.
   The win/loss capture fixed above is the prerequisite — without `decline_reason='cascade'`
   there is no clean label to regress on.
4. **Then, and only then**, expected-value markup — while remembering the flat-EV result
   that caps how much it can be worth.

One asset already exists for step 3 and is worth noting: `quote_cost_snapshots` stores the
tradie's cost basis at quote time. Cost moves independently of client demand, which makes
it a **cost-shifter instrument** — the standard way to identify price elasticity causally
rather than just observing that expensive jobs and won jobs correlate. That table was
built for a different reason and turns out to be the hard-to-get half of a future
elasticity estimate.

---

## Sources

- [Commercial cleaning cost in Australia, 2026](https://commercialcleaning.au/how-much-does-workplace-cleaning-cost-in-australia/) — hourly bands
- [Commercial cleaning rates per m²](https://cleaningsuperboss.com.au/blog/commercial-cleaning-rates-per-square-metre-in-australia/)
- [Cleaner earnings in Australia, 2026](https://www.upcover.com/blog/how-much-can-a-home-cleaner-earn-in-australia) — wage baseline
- [Bond cleaning cost, 2026 price guide](https://servicetasker.com.au/cost-guides/how-much-does-bond-cleaning-cost)
- [Builders clean cost Sydney, 2026](https://www.onexdone.com.au/blog/builders-clean-cost-sydney-2026/) — per-m² bands
- [Builders clean Melbourne, 2026](https://buildclean.com.au/how-much-does-a-builders-clean-cost-in-melbourne-in-2026/)
- [Cleaning award rates, Australia 2026](https://commercialcleaning.au/cleaning-award-rates-pay-guide-for-commercial-australia/)
- [Friedman bidding model](https://www.researchgate.net/publication/332263270_Bidding_Strategy_Using_Friedman_Model_for_Building_Construction_Project_in_Banjarbaru_Indonesia)
- [Gates' bidding model](https://www.researchgate.net/publication/43474832_Gates'_Bidding_Model)
- [Simulating the winning bid: optimum markup estimation](https://www.sciencedirect.com/science/article/abs/pii/S0926580511001750)
