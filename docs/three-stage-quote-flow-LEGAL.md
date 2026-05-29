# Three-Stage Quote Flow — Legal Review One-Pager

**Audience:** Australian commercial lawyer with marketplace / fintech /
consumer-law experience.
**Status of the platform:** ConnecTradie — two-sided marketplace, Stripe Connect
escrow already in place, AFSL position previously reviewed.
**This change:** restructuring the quoting flow from a single "deposit and book"
step into a 3-stage flow that defers contract formation to the moment the client
chooses their tradie. Backend foundation is built; UI and T&Cs are not yet
shipped pending this review.

---

## 1. What we're building (90-second summary)

**Today.** Client posts job → tradies submit quotes (some flagged "needs site
visit") → client clicks **Deposit & Book Site Visit** on a single tradie →
escrow deposit lands → tradie visits → final price may be adjusted post-deposit
via a separate flow.

**The problem.** Three quotes are requested but the client is forced to commit
money to one tradie *before* any of them has done their site visit or given a
binding final price. This conflates "estimate" and "quote" in ACL terms, and
it's commercially unattractive — the client can't actually compare three finals.

**The proposed 3-stage flow** (Australian-law-aware):

| Stage | What happens | Money moves? | Legal name |
|---|---|---|---|
| 1 | Tradie submits **estimate** (range or single, may be conditional on site visit) | No | Estimate |
| 2 | Client books site visits with the tradies who need one | No (or refundable fee — see Q2 below) | Inspection |
| 3 | Tradie submits **binding final quote** with validity period | No | Quote |
| 4 | Client picks one final → contract formed → escrow lands via Stripe | Yes | Acceptance / contract |

Other quotes on the same job auto-reject when one is accepted, and those tradies
are notified ("the client went with someone else").

---

## 2. Compliance posture we've designed against

The implementation has been built with these in mind. Each is flagged for your
confirmation, not as a substitute for it.

| Area | Position | What needs your sign-off |
|---|---|---|
| **AFSL** | Stripe Connect holds escrow; the platform never holds funds. Deferring the deposit from stage 1 to stage 4 doesn't change who holds money or when — it only changes the *contract-formation moment*. | Confirm the timing shift doesn't reopen the AFSL analysis. |
| **ACL — estimate vs quote (s18)** | Stage-1 submissions are labelled and treated as **estimates**. Stage-3 submissions are labelled and treated as **quotes** (binding). UI copy is being structured to match. | Review the UI copy strings (TBD — list to be shared with mockups). |
| **ACL — unfair contract terms** | All non-trivial T&C language (site-visit fee, non-circumvention, dispute, validity period) is being deferred to you. No clauses have been drafted internally. | Draft / review §4 clauses below. |
| **State trade licensing** | Cleaning (current main category) is below all thresholds. For residential building work above state thresholds (NSW $5k written contract / $20k major works + HBCF; VIC, QLD analogues), the existing platform contract layer continues to apply unchanged — no new licensing surface is introduced by this change. | Confirm we're not inadvertently triggering anything by *deferring* the contract to stage 4. |
| **Privacy (APPs)** | Address is shared with the tradie at stage 2 (site-visit booking), not stage 1 (estimate). A one-line consent notice fires at the booking click. | Approve the notice text (see §4.4). |
| **Cooling-off** | Doesn't apply to most platform jobs (solicited consumer agreements). For major domestic building work the state cooling-off period (e.g. NSW 5 business days after contract signing) still applies post-stage-4 — unchanged from today. | Confirm. |
| **GST / ABN representations** | Final quote (stage 3) carries tradie's ABN + GST treatment. Deposit invoice (stage 4) references the locked final price. | Confirm the invoice format is compliant. |

---

## 3. What is *not* changing (so you can park these)

- The Stripe Connect escrow mechanism and AFSL position.
- The verification of tradie ABN / licence / insurance (existing).
- The dispute resolution flow (existing `disputed` invoice path, admin
  escalation).
- The recurring-services billing flow (Ongoing Services) — uses a different
  contract pattern and is out of scope here.
- Existing in-flight jobs created before this change — they continue on the
  legacy single-step flow (governed by `jobs.flow_version = 1`).

---

## 4. Clauses we need you to draft / review

### 4.1 Estimate vs quote — UI copy strings

Specific strings used at each stage (to be provided with mockups). The
distinction must be visible to the client at every relevant screen:

- "**Estimate** from <Tradie> — subject to site visit"
- "**Final quote** from <Tradie> — valid until DD MMM"
- "By tapping Accept & Pay, you agree to engage <Tradie> for $X at the final
  quoted price." *(consider whether this single sentence is sufficient or whether
  a separate written-contract step is required at certain trade categories /
  price points)*

### 4.2 Site-visit handling — optional refundable fee

We've left this configurable per tradie offer. Three options on the table:

a. **Free site visits.** Simplest. Tradie's call-out time is uncompensated until
   the deal is won. No money flows pre-acceptance.
b. **Tradie-paid lead fee.** Small fee ($5–20) tradie pays the platform per
   site-visit booking they accept. Secures platform revenue regardless of
   whether the job stays on-platform. ("Thumbtack model.")
c. **Client-paid refundable site-visit fee.** $20–50 from client, refunded if
   the client picks that tradie or the visit is cancelled.

Need your view on (c) — refundability terms and unfair-contract-terms regime
implications. Our default if undecided: **(a) free**, with **non-circumvention**
(§4.3) as the disintermediation defense.

### 4.3 Tradie non-circumvention clause

When a tradie accepts a lead from the platform, they agree not to:
- Solicit or accept work from that specific client off-platform for **N months**
  (need your view on 6 vs 12 vs 24); or
- Share contact details outside the platform's messaging channel for the
  duration of the lead's quoting window.

Enforcement posture we plan: account suspension, lost rating/badges,
no platform-paid lead routing. Not punitive damages. Need your view on
enforceability and recommended duration.

### 4.4 Privacy notice at site-visit booking

Triggered on the "Book site visit" button. Draft:

> By booking this site visit, you confirm that **<Tradie Name>** will receive
> your address (<address>) and contact details for the purpose of arranging the
> inspection. Their use is limited to this engagement under our Privacy Policy.

Need your sign-off on text + the question of whether further APP 5 notification
language is required.

### 4.5 Validity period for final quotes

Default we're proposing: **14 days** unless tradie sets otherwise. Reasonable
under ACL? Need your view, especially for trades where prices move (timber,
metals).

### 4.6 Quote-lock language

Once a tradie submits a *final* quote, the price is locked. To change it, they
must withdraw and submit a new quote. This is enforced in our backend.

Need T&C language confirming this is binding and how withdrawal/re-quoting is
characterised.

### 4.7 Cancellation language

Client-side T&C for cancelling at each stage:

- Pre-site-visit (`pending` or `site_visit_scheduled`): free.
- Post-site-visit pre-acceptance (`site_visit_completed`, `final_submitted`):
  free — no money has moved.
- Post-acceptance (`accepted` / `funded` / `in_progress`): existing escrow
  refund / dispute flow applies — unchanged.

---

## 5. Open business decisions (your input welcome)

These are commercial calls but legal context matters:

1. **Site-visit fee** — see §4.2. Default leans (a) free + non-circumvention.
2. **Non-circumvention duration** — 6 / 12 / 24 months.
3. **Final-quote validity default** — 14 days proposed.
4. **What happens to the *un*chosen tradies' estimates after acceptance?** —
   Currently we auto-reject and notify. Need T&C language reflecting this.
5. **Site-visit no-show by tradie** — currently a manual support ticket;
   considered whether a documented "no-show = quote withdrawn" should be in T&Cs.

---

## 6. What we'd like out of the legal review

1. ✍️ Drafted T&C clauses for §4.1, §4.3, §4.4, §4.5, §4.6, §4.7.
2. ✅ Sign-off (or required changes) on the compliance positions in §2.
3. 💬 Your view on §5 business decisions where law is relevant.
4. 📋 Any issues you spot that we haven't asked about.

---

## 7. Documents and code references

For your reference; not required reading:

- **Full design doc:** `docs/three-stage-quote-flow.md` — state machine, every
  transition, edge cases.
- **Existing AFSL / Stripe Connect setup:** the platform's prior legal review
  (held by the business) covered the current escrow mechanism. The 3-stage
  change does not alter who holds funds or when Stripe charges.
- **Migration applied:** `supabase/migrations/20260516120000_add_three_stage_quote_flow.sql`
  — adds `jobs.flow_version` flag (defaults to 1, current behaviour) plus
  per-quote site-visit and final-quote tracking columns.
- **Edge functions affected:** `book-site-visit` (new — no money), `accept-and-pay`
  (tightened — only accepts `final_submitted` on flow_version=2 jobs).

---

*Prepared by: William Magson, ConnecTradie. Last updated: 2026-05-16. Not legal
advice; written to be reviewed by qualified Australian commercial counsel.*
