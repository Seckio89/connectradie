# Navigability audit — would it pass the pub test?

2026-07-27 · 58 routes · static scan + live browser crawl

## Verdict

**Mostly yes, with three real failures.** The navigation skeleton is sound: every
menu destination resolves, nothing 404s, no page is a true dead end, and — the
genuine surprise — **not one page overflows horizontally at 375px**. Someone has
already done the hard mobile work.

What fails the pub test is narrower and more specific:

1. **A homeowner on a phone never saw the website.** Loading `connectradie.com`
   on any mobile browser redirected straight to a sign-in wall. Fixed — the
   redirect now triggers on "launched as an app", not on screen width.
2. **The browser tab said "ConnecTradie" on 24 of 58 routes**, including every
   SEO landing page you pay to rank. Fixed in this pass.
3. **Five checkout flows never reached the payment-confirmation page**, and one
   route through a redirect silently ate its query string. Fixed.

| Pub-test question | Score | Note |
|---|---|---|
| 1. Where am I? | **was 3/10 → now 8/10** | 24 routes had no page name; fixed |
| 2. How do I get out? | **8/10** | no true dead ends; two thin ones |
| 3. Can I find it at all? | **was 7/10 → now 9/10** | query-drops fixed; one orphan, three menu-absent |
| 4. What do I do next? | **7/10** | expired-quote page offers nothing |
| 5. Do I understand the words? | **6/10** | "Leads" vs "My Jobs" split personality |
| 6. Does it work on my phone? | **was 4/10 → now 9/10** | sign-in wall fixed; tap-target floor repaired; no overflow anywhere |

## Coverage — what was actually exercised

| | Covered | How |
|---|---|---|
| Static scan | **all 58 routes**, 524 internal links, 270 source files | `npm run check:nav` |
| Live crawl, logged out | **25 routes** × desktop 1280 + mobile 375 | browser, real render |
| Live crawl, client | **0 routes** | blocked — see below |
| Live crawl, tradie | **0 routes** | blocked — see below |
| Live crawl, admin | **0 routes** | blocked — no admin test account exists |

**The authed personas did not run.** `.env.e2e` is configured and points at a
test Supabase project, but that project is **completely unprovisioned** — zero
auth users and no `public.profiles` table at all. `npm run e2e:bootstrap` was
never successfully run against it, and per the known migration drift (313 live
versions vs 297 local files) `supabase db push` will refuse to provision it.

So everything below about `/dashboard`, `/work`, `/leads`, `/payouts`, `/settings`,
`/schedule` and the nine admin pages is **static analysis only**. The harness is
written and works; it needs credentials. To run it:

```bash
NAV_TARGET=app NAV_ALLOW_PROD=1 NAV_CLIENT_EMAIL=… NAV_CLIENT_PASSWORD=… NAV_TRADIE_EMAIL=… NAV_TRADIE_PASSWORD=… npm run audit:nav
```

The crawl only ever navigates and reads the DOM — it never clicks anything that
submits, pays, sends or deletes — so pointing it at the real backend is safe.

---

## Findings, worst first

### 1. Can I find it at all?

**F1 — Stripe return URLs landed on a redirect that drops their query string.**
✅ **Fixed**, and the underlying problem was bigger than the query string.

`src/lib/stripe.ts:96-97` and `src/lib/stripePayments.ts:100,101,121,122` built
`${origin}/jobs?payment=success&job_id=…`, but `/jobs` is
`<Navigate to="/work" replace />` and React Router does not carry a query string
through a redirect.

Investigating before fixing changed the answer twice:

1. **Nothing reads `payment` anywhere in `src/`.** There is no
   `searchParams.get('payment')` — `WorkHub` reads `tab`, `Jobs` reads `job`. So
   simply repointing at `/work` would have preserved a parameter no code
   consumes: a no-op dressed as a fix.
2. **The app already has purpose-built result pages**, and they are the
   convention — `/payment-success` and `/payment-cancelled` are used by
   `approve-invoice`, `book-site-visit`, `generate-recurring-invoice` and by
   `createJobPaymentCheckout` in this very file. `PaymentSuccess` confirms the
   payment, fires `verify-payment` as a fallback for webhook lag, and returns the
   user to the dashboard. `capacitor.config` already whitelists both for native
   returns.

So the real defect was not the dropped query string — it was that five legacy
checkout flows never reached the confirmation page at all, and never fired the
webhook-lag fallback. They were the last stragglers of a migration everything
else had already completed.

All five now match the convention: `acceptAndPay`, `createJobDeposit`,
`payMilestone`, `payPriceIncrease` (`stripePayments.ts`) and
`createPaymentSession` (`stripe.ts`). `payPriceIncrease` has a `paymentId` in
scope, so it gets the full treatment including the `verify-payment` fallback.

No edge-function change was needed: the validators (`isValidRedirectUrl` /
`isAllowedRedirectUrl`) compare hostname only, not path.

**Verified by execution**, as CLAUDE.md requires for money paths: the existing
suites assert these URLs exactly — 71 payment tests pass, 605 across the repo.
One assertion I wrote was wrong (guessed `pay-increase-1`; the fixture is
`pay-orig-1`) and the suite caught it.

The landing was then confirmed in a browser against the exact URL the code now
emits: `/payment-success?session_id=cs_test_…&payment_id=…` keeps its query
string, titles correctly, renders the confirmation, and swallows a failed
`verify-payment` without stranding the user (`callEdgeFunction` throws before any
network call when there is no session — `edgeFn.ts:50`).

**Still unverified, and cannot be done from here: a real Stripe round trip.**
The production project's Stripe secret is a **LIVE key** — every
`stripe_checkout_session_id` in `payments` is `cs_live_`, four of them between
2026-07-23 and 2026-07-26, with no `cs_test_` row ever recorded. So a checkout
through the deployed edge functions is a real charge, not a test. The only safe
alternative, the `.env.e2e` project, has no schema and no users. Until one of
those changes, the Stripe-side redirect is confirmed by Stripe's contract and by
the four other flows already using these pages, not by observation.

**F2 — `/tax-invoice/:invoiceId` has zero inbound links.** 🟡 `src/App.tsx:299`

The ConnecTradie → tradie commission invoice required by ATO s.29-70. A tradie
can only reach their own tax invoice by already knowing the URL. Nothing in
`src/` links to it — not `Payouts`, not `PaymentHistory`, not `Settings`.

**F3 — Three routes exist but appear in no menu.** 🟡

| Route | Only door |
|---|---|
| `/explore` | one card on `/hire` (`CategoriesSection.tsx:141`) |
| `/how-fees-work` | `Pricing.tsx:412` + `QuoteFeeDisclosure` |
| `/calendar-import` | entry point is `{false && …}` at `Schedule.tsx:94` |

`/calendar-import` is deliberately hidden pending the Google Calendar work — that
one is fine. The other two are reachable but effectively invisible: a signed-in
tradie wondering what they're being charged cannot get to `/how-fees-work` at all.

**F4 — Once signed in, there is no route to any legal or marketing page.** 🟡

`Navbar` and `Footer` render only on `/`, `/hire`, `/careers`, `/careers/:id`.
`DashboardLayout` renders neither. So from inside the app there is no link to
`/terms`, `/privacy`, `/contact`, `/pricing`, `/hire`, `/careers`, `/explore` or
`/how-fees-work`. The only escape is the Help drawer's link to `/help`.

For a platform holding customer money under Australian consumer law, terms and
privacy being unreachable from the signed-in product is worth a look.

**F5 — `Verification.tsx` is a dead file.** 🔵 No route, no importer.

### 2. Where am I?

**F6 — 24 of 58 routes had no page name in the browser tab.** ✅ **Fixed.**

`PAGE_TITLES` was keyed on exact `location.pathname`, so every route with an id
or slug in it fell through to the bare string `ConnecTradie`. Confirmed live
before the fix: `/find/plumber`, `/costs/plumber`, `/tradie/…`, `/invoice/…`,
`/payment-success` and the whole `/find-in/` hierarchy all read `ConnecTradie`.

That the SEO landing pages were included makes it more than cosmetic — those
pages exist to be found in search results, and their tab and history entry were
anonymous.

**F7 — react-helmet-async is inert.** 🟡 `src/components/SEO.tsx`

Nineteen pages render `<SEO title=… description=…>`. `HelmetProvider` is
correctly mounted in `src/main.tsx:66`. But helmet's output never reaches the
document: a full load of `/pricing` keeps `index.html`'s static title
(*"Find Licensed Tradies Near You…"*) and its static meta description, not the
page's own. Verified in the browser.

This changes what the F6 fix had to be. The first attempt let the `<SEO>` pages
own their titles and RouteTracker skip them — which, because helmet is dead,
handed all nineteen the homepage's title instead. Reverted. **RouteTracker is now
the single source of truth**, with slug-aware patterns, and a comment says why.
Helmet needs its own investigation; when it is fixed, the two mechanisms will
collide again.

**F8 — `/login` has no `<h1>`.** 🟡 Confirmed live at both viewports. Every other
public page has exactly one.

**F9 — Breadcrumbs were labelled for routes that no longer exist.** ✅ **Fixed.**

`ROUTE_LABELS` still carried `jobs` and `team`, both now redirect-only, and
labelled `/my-trades` "My Trades" while the sidebar said "Saved Tradies". Ten
segments actually in use (`clients`, `financials`, `custom-tasks`, `updates`,
`tracking`, `invoice`, `review`, …) had no label at all and fell back to a
capitalised URL slug.

Breadcrumbs render on six admin pages only, and only ever on two-segment routes
(`segments.length <= 1` returns null) — so `/work`, `/leads`, `/payouts` and the
rest of the app have no breadcrumb at all. That is a design gap, not a bug, and
is left alone.

### 3. What do I do next?

**F10 — An expired quote link is a full stop.** 🟡 `src/pages/PublicQuote.tsx`

Live: `/quote/<bad-token>` renders 35 characters — *"Quote unavailable / This quote
link is not valid or has expired."* — with no heading element, no next step, and
no link other than the logo. This is a link tradies email to homeowners, so the
person hitting it is a paying customer at the moment their link went stale. There
is nothing offering to contact the tradie or find another one.

**F11 — `/invoice/:id` and `/payment-success` render zero links.** 🔵

Both have a back button, so neither is a true dead end, but both are one browser
quirk away from being one.

### 4. Do I understand the words?

**F12 — The same thing is called two things.** ✅ **Partly fixed.**

`/leads` is "My Jobs" in the client sidebar and "Leads" in the breadcrumb.
`/post-lead` is "Post a Job" in the menu and "Post Lead" in the breadcrumb.
`/analytics` is "My Stats" in the sidebar and "Analytics" everywhere else. The
breadcrumb labels are now aligned to the sidebar's wording, which is the name
people learn first.

The underlying split remains: the URLs say *lead*, the interface says *job*. A
homeowner posts a job. "Lead" is what a salesperson calls it. Renaming routes is
out of scope here, but it is the single biggest vocabulary inconsistency in the
product.

**F13 — Jargon in headings and buttons.** 🔵 "Lead" in 8 headings/buttons
(`UnlockLeadModal.tsx:58` and others); "escrow" in 1 (`Pricing.tsx:419`).
One instance of "escrow" on a pricing page is defensible — it is a term of art
the page then explains.

### 5. Does it work on my phone?

**F14 — The mobile homepage was a sign-in wall.** ✅ **Fixed.** `src/pages/LandingPage.tsx`

```
was:  shouldSkipLanding = isNativePlatform || isMobile   // isMobile = innerWidth < 768
now:  shouldSkipLanding = useIsAppLaunch()               // native shell, or installed PWA
```

Verified live before: at 375px a fresh load of `/` landed on `/login`; at 1280px
the same load rendered the full marketing page. So every homeowner arriving on a
phone — including from the `/find` and `/costs` pages that exist to acquire
exactly those homeowners — hit a login form instead of the pitch.

The old comment was right that `Capacitor.isNativePlatform()` is the reliable
check and viewport width cannot be trusted; the code then used width anyway. The
fix drops width entirely and asks the question the redirect actually cares about:
**was this launched as an app, or opened in a browser tab?**

`manifest.webmanifest` sets `"display": "standalone"` and `"start_url": "/"`, so
simply deleting the width check would have made every installed-PWA launch open
into the marketing page. The new hook therefore also treats an installed PWA as
an app launch — `display-mode: standalone | fullscreen | minimal-ui`, plus
`navigator.standalone` for iOS home-screen apps, which predate `display-mode`.

Two things improved as a side effect: a browser tab no longer waits on the auth
spinner before rendering the marketing page, and the native/PWA path is unchanged.

Verified after: 375px browser tab → stays on `/`, renders the landing page, h1
present, correct title, **no horizontal overflow**, two sign-in links still on
screen. `display-mode` reported `browser`. Zero console errors across eight route
transitions.

**F15 — Tap targets.** ✅ **Fixed — but the original finding was wrong.**

**Correction.** This audit first reported 376 sub-44px targets on `/explore`, 33
on `/find/plumber`, 23 on `/careers` and so on. **Those numbers were an artifact
of the measurement.** `mobile-responsive.css:84-95` already sets a global 44px
floor, gated on `@media (pointer: coarse)`. The measurement was taken in a
desktop browser resized to 375px, which does not match `pointer: coarse`, so none
of the floor applied. Re-measured with the coarse rules genuinely in effect, the
public pages report **zero** undersized targets — before any of the fixes below.

The `/explore` chips are the clearest example: they look like 34px from their
padding, but they are flex items, CSS blockifies flex items, so `min-height`
applies and they are 44px on a phone. They were never broken.

Two lessons, both now written into the CSS: **never measure tap targets from a
resized desktop window**, and `min-height` is inert on a non-replaced inline box.

**What was actually broken** — four defects in the CSS itself, none of which the
flawed measurement would ever have surfaced, all affecting real phones:

| Defect | Was | Now |
|---|---|---|
| `:532` deleted the floor for **every** `button.rounded-full` — all pills and icon buttons had no minimum at all | `min-height: unset !important` on any rounded-full button | scoped to `[role="switch"]`; a pill now measures 44px, a switch track keeps its 24px shape |
| the halo meant to compensate ended in `pointer-events: none` | inert — no taps, no visual styling, did nothing | deleted |
| sidebar nav items, via `!important` that beat the floor | `min-height: 40px !important` | `44px` |
| supply +/- grid, in a rule whose own comment claimed 44px | `min-width/height: 36px !important` | `44px` |
| calendar day cells | `min-width: 0` took the whole floor down | `min-width: 0` kept (seven 44px columns do not fit 375px), `min-height: 44px` restored |

Plus one genuine component defect the floor structurally cannot reach: **footer
links**. `<li><a>` in a plain block container is a true inline box at 20px, and
`min-height` does nothing to it. Verified by counterfactual — stripping the fix
in the live DOM returns them to `display: inline` at 20px. Now `block py-2.5`,
measuring 44px; the `space-y-3` was dropped so the visual rhythm is close to
unchanged (columns grow ~52px).

Five toggle switches gained `role="switch"` + `aria-checked`
(`NotificationsTab` ×3, `SiteCheckInSetting`, `NewQuoteModal`). There were **zero**
uses of `role="switch"` in the codebase before this — so it is a real screen-reader
improvement, not just a CSS hook.

**Deliberately not touched:** `HireHeroSection.tsx:66`, a `<button>` inline
mid-sentence inside a `<p>`. WCAG 2.5.5/2.5.8 exempt inline links in running
text, and forcing 44px would break the paragraph's line flow.

**Not verified:** the authenticated pages. The sidebar-nav, supply-grid and
calendar fixes are the ones that matter most there and could not be exercised
without credentials — see the coverage note at the top.

**F16 — No horizontal overflow anywhere.** ✅ Every one of the 16 pages measured
at 375px had `scrollWidth <= innerWidth`. Worth stating plainly: the mobile CSS
is doing its job.

**F17 — `/search` is nearly empty when logged out.** 🟡 162 characters of visible
text, 3 links. This matches the known RLS state where anonymous visitors see zero
tradie rows — so `/search`, `/tradie/:id` and the `/find/*` pages show a search
interface with nothing in it. Tracked separately under the profiles RLS work; noted
here because it is what a logged-out visitor actually sees.

---

## What changed in this pass

| File | Change |
|---|---|
| `src/App.tsx` | RouteTracker matches slug/id routes by pattern; 13 static titles added, 4 dead keys removed; `/find/pest-control/sydney-nsw-2000` now titles as *"Pest Control in Sydney NSW"* |
| `src/components/Breadcrumbs.tsx` | dead `jobs`/`team` labels removed, 10 missing segments added, wording aligned to the sidebar |
| `src/components/DashboardLayout.tsx` | `/admin/custom-tasks` added to `adminNavItems` — it was route-complete but menu-absent |
| `src/pages/LandingPage.tsx` | the landing-page skip now keys off app-launch (native shell / installed PWA) instead of viewport width, so phone browsers get the marketing site |
| `src/styles/mobile-responsive.css` | four tap-target defects fixed: the `rounded-full` floor deletion scoped to `[role="switch"]`, the inert halo deleted, and the 40px / 36px / `min-width: 0` shrink rules restored to 44px. No sub-44px floor remains in the file |
| `src/components/Footer.tsx` | column and bottom-bar links `block py-2.5` / `py-3` — they were true inline boxes at 20px, which `min-height` cannot affect |
| `NotificationsTab.tsx`, `SiteCheckInSetting.tsx`, `NewQuoteModal.tsx` | `role="switch"` + `aria-checked` on the five real toggle tracks |
| `scripts/check-navigability.mjs` | new — `npm run check:nav` |
| `playwright.nav.config.ts`, `e2e/navigability.spec.ts`, `e2e/nav-auth.setup.ts` | new — `npm run audit:nav` |

Verified: `npm run typecheck` clean, `npm run check:columns` clean, title
behaviour confirmed in the browser across static, dynamic and SEO routes.

Scanner went from 6 errors / 26 warnings / 25 info to **0 errors / 4 warnings /
9 info**.

## Needs its own ticket

- [ ] **F7** — react-helmet-async produces no output; 19 pages ship the homepage's meta
- [ ] **F2** — give `/tax-invoice/:invoiceId` an entry point from Payouts
- [ ] **F15 follow-up** — re-run the tap-target measurement on the authenticated pages once credentials exist; the sidebar-nav, supply-grid and calendar fixes are unverified
- [ ] **F10** — give the expired-quote page somewhere to go
- [ ] **F4** — put legal/marketing links in the signed-in footer
- [ ] **F8** — add an `<h1>` to `/login`
- [ ] **F12** — decide whether the product says "lead" or "job", then say it everywhere
- [ ] **F5** — delete `src/pages/Verification.tsx`
- [ ] Provision the e2e test project so the authed crawl can run unattended

## Re-running

```bash
npm run check:nav
```
