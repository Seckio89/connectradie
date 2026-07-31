# Decisions pending — the owner's yes/no list

This is the only place you (the owner) ever have to say yes or no. Each item
is a Tier B change under [CHANGE-POLICY.md](CHANGE-POLICY.md): nothing here
gets built until you tick a box. Tick it in this file, or just tell Claude
"approve D3" / "reject D3" in chat.

When an item is decided, it moves to the **Decided** section at the bottom
with the date.

**Template for new entries:**

> **What:** one sentence, plain English.
> **Why it matters:** what breaks or is risked today.
> **Pros / Cons / Risk if we don't / Effort / Recommendation.**
> **Owner decision:** [ ] approve · [ ] reject · [ ] ask me later

---

## D1 — Turn on GitHub branch protection for `master`

**What:** A 2-minute GitHub setting so nothing can merge to `master` (and
therefore deploy to the live site) until the automated checks pass.
**Why it matters:** Today Vercel deploys the moment anything lands on
`master` — the checks run at the same time as the deploy instead of gating
it. A broken change can go live before the red X appears.
**Pros:** Biggest safety win available; free; makes every future PR safer;
you already merge PRs by hand, so nothing about your routine changes.
**Cons:** A genuinely urgent hotfix waits ~5–8 minutes for CI. That's the
whole cost.
**Risk if we don't:** A bad merge deploys instantly to real users.
**Effort:** 2 minutes, owner-only (click-path in `docs/OWNER-TODO.md`).
**Recommendation:** Approve.
**Owner decision:** [ ] approve · [ ] reject · [ ] ask me later

## D2 — Static `/terms` and `/privacy` HTML pages: redirect them to the app

**What:** The site has two copies of Terms and Privacy — the dark in-app pages
and old light-themed standalone HTML files (`public/terms/index.html`,
`public/privacy/index.html`). Replace the old ones with redirects to the app
pages.
**Why it matters:** Two copies of legal text will drift apart. If a lawyer
updates one and not the other, users can be shown outdated terms.
**Pros:** Kills the drift risk permanently; one source of truth; the old
pages don't match the brand (light theme).
**Cons:** Anyone who bookmarked the old URL gets a redirect hop (harmless);
legal pages then require the app's JavaScript to view.
**Risk if we don't:** Outdated legal text shown to users — a real liability
for an escrow platform.
**Effort:** Small (agent does it; one PR).
**Recommendation:** Approve.
**Owner decision:** [ ] approve · [ ] reject · [ ] ask me later

## D3 — Retire `mobile-responsive.css` page by page (after launch)

**What:** A 1,080-line file of forced style overrides patches the mobile
layout of ~30 screens. It regularly breaks *new* screens by accident because
its rules latch onto anything that looks similar. Plan: move each patch into
the page it belongs to, one page at a time, with screenshots.
**Why it matters:** It's the single biggest source of "mystery" mobile bugs.
**Pros:** Mobile bugs stop appearing out of nowhere; each page owns its own
layout; easier for any future developer.
**Cons:** Slow, careful work across ~30 screens; each step needs mobile
re-testing; small regression risk per step (mitigated by screenshots + the
checks).
**Risk if we don't:** Every new screen risks silent mobile breakage; the file
keeps growing.
**Effort:** Large, spread over weeks; safe to defer until after launch.
**Recommendation:** Approve, scheduled after go-live.
**Owner decision:** [ ] approve · [ ] reject · [ ] ask me later

## D4 — Move chart colours onto design tokens (audit finding #7)

**What:** 8 files still carry hard-coded hex colours (mostly chart palettes).
Bind them to the design tokens using the pattern already proven in
`AdminFinancials.tsx` (`src/lib/themeTokens.ts`).
**Pros:** Closes the last open MEDIUM audit finding; future palette changes
propagate automatically.
**Cons:** Charts need visual re-checking after the swap.
**Risk if we don't:** Charts drift from the brand palette whenever tokens
change.
**Effort:** Small–medium (one PR).
**Recommendation:** Approve.
**Owner decision:** [ ] approve · [ ] reject · [ ] ask me later

## D5 — Merge overlapping database access policies (audit finding #8)

**What:** Two tables (`cancellation_policies`, `profile_private`) have
overlapping permission rules. Merging them makes the database marginally
faster and the security posture easier to reason about.
**Pros:** Cleaner security model; small performance gain; closes a MEDIUM
finding.
**Cons:** Touching access rules always carries risk — needs the full
migration verification ritual (staging first, RLS proof).
**Risk if we don't:** None immediate; audit debt.
**Effort:** Small, but high-care (money-adjacent tier).
**Recommendation:** Approve, batched with the next migration.
**Owner decision:** [ ] approve · [ ] reject · [ ] ask me later

## D6 — Tighten two publicly readable tables (audit finding #10)

**What:** `tradie_details` and `platform_config` are readable without login.
Some of that is intentional (public tradie profiles need it); the question is
whether every column in them should be public.
**Pros:** Less data exposed to scrapers/competitors.
**Cons:** Over-tightening breaks the public search/profile pages for
logged-out visitors (already a known weak spot); needs a column-by-column
review, not a blanket flip.
**Risk if we don't:** Low — no secrets are in these tables today.
**Effort:** Medium (column audit + migration).
**Recommendation:** Defer until the profiles-RLS work (already planned as
"NEXT UP" in project notes) — do them together, in the right order.
**Owner decision:** [ ] approve · [ ] reject · [ ] ask me later

## D7 — Nightly code-audit task: turn it on?

**What:** A scheduled agent that runs the full checker suite every night and
notifies you **only** when something newly regresses. Silent when green.
**Pros:** Regressions caught within a day, not at the next audit; silent
unless something's wrong.
**Cons:** One more thing running; occasional false-alarm notification.
**Risk if we don't:** Regressions accumulate between manual audits.
**Effort:** Already written (`Scheduled/nightly-code-audit/SKILL.md`) — just
needs registering.
**Recommendation:** Approve.
**Owner decision:** [ ] approve · [ ] reject · [ ] ask me later

---

## Decided

*(nothing yet — decided items move here with the date and outcome)*
