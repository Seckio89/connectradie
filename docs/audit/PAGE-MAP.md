# Page map — every screen, stripped down

Generated 2026-08-01 from `npm run check:nav -- --json` plus the persona
crawl and visual pass. This is the audit's "strip down and map" deliverable:
one row per screen, who can see it, how they get there, and its audit status.

62 routes (58 pages + 4 redirects) + 7 sub-view pages rendered inside other
routes. Verdicts: ✅ clean · ⚠ findings (see `AUDIT-REPORT-2026-08-01.md`) ·
— not independently assessed this pass.

## Public (no login)

| Route | Component | Purpose | In nav | Status |
|---|---|---|---|---|
| `/` | LandingPage → LandingV2 | main marketing page (tradie-facing) | yes | ✅ |
| `/hire` | HireLanding | homeowner marketing entry | yes | ✅ |
| `/login` · `/register` | Login / Register | auth (redirect away when signed in) | yes | ✅ |
| `/search` | Search | tradie search (empty for logged-out visitors — known profiles-RLS gap) | yes | ⚠ |
| `/tradie/:id` | PublicTradieProfile | public tradie profile (deep-link) | deep-link | ⚠ |
| `/explore` | Explore | category browse grid | landing grid | ✅ |
| `/careers` · `/careers/:id` | CareersPublic / CareerDetailPublic | live ATS (deliberately untouched) | yes | ✅ |
| `/find/:trade/:loc` · `/find/:trade` · `/find-in/:loc` · `/costs/:trade` | SEO hub pages | search-engine landing pages | SEO entry | ✅ |
| `/quote/:token` | PublicQuote | tokenised quote link emailed to client | email link | ✅ |
| `/terms` · `/privacy` | Terms / Privacy | legal (⚠ duplicated as static light-themed HTML under `public/` — decision D2) | yes | ⚠ |
| `/contact` · `/help` | Contact / HelpFAQ | support | yes | ✅ |
| `/pricing` · `/how-fees-work` | Pricing / HowFeesWork | fees ("escrow" jargon flagged on Pricing) | yes | ⚠ |
| `/payment-success` · `/payment-cancelled` | Stripe return pages | checkout redirect targets | Stripe redirect | ⚠ (unmeasurable under contrast harness — verified manually) |
| `/invoice/:paymentId` · `/tax-invoice/:invoiceId` | Invoice / TaxInvoice | receipts (tax-invoice reached only via email) | link/email | ✅ |
| `/workforce/claim` | WorkforceClaim | tokenised worker invite | SMS/email link | ✅ |
| `*` | NotFound | 404 | — | ✅ |

## Signed in — any role

| Route | Component | Purpose | Status |
|---|---|---|---|
| `/onboarding` | Onboarding | staged onboarding wizard | ✅ |
| `/dashboard` | Dashboard → ClientDashboard / TradieDashboard | role-dispatched home | ⚠ (copy) |
| `/leads` | Leads | lead feed ("lead" vs "job" wording flagged) | ⚠ |
| `/messages` | Messages | conversations incl. groups | ⚠ (mobile CSS) |
| `/settings` | Settings | account, payments, security tabs | ⚠ (copy) |
| `/notifications` | Notifications | notification list | ✅ |
| `/payments` | PaymentHistory | payment ledger | ✅ |
| `/schedule` | Schedule → SiteCalendar + Team tabs | calendar (CRASHED under contrast fixtures — investigated, fixture gap not app bug; renders fine live) | ⚠ |
| `/tracking/:jobId` | JobTracking | per-job geo/time tracking | ✅ |
| `/review/:jobId` | LeaveReview | review form ("Rate Your Experience" Title Case) | ⚠ |

## Client only

| Route | Component | Purpose | Status |
|---|---|---|---|
| `/my-trades` | MyTrades | client's engaged tradies | ✅ |
| `/projects` | Projects | job groups | ✅ |
| `/post-lead` | PostLead | post a job (42 inbound links — top CTA) | ✅ |

## Tradie only

| Route | Component | Purpose | Status |
|---|---|---|---|
| `/work` | WorkHub → Jobs + TradeCareers tabs | jobs hub (`/jobs` redirects here; Navbar still links `/jobs` — fixed in audit batch) | ⚠ |
| `/my-profile` | MyProfile | profile editor | ✅ |
| `/clients` · `/clients/:id` | Clients / ClientDetail | client book + invoicing | ✅ |
| `/workforce` · `/workforce/invite` · `/workforce/:workerId` | Workforce suite | team & compliance | ✅ |
| `/performance` | PerformanceInsights | KPIs | ⚠ (Title Case labels) |
| `/payouts` | Payouts | payout ledger + instant payout | ✅ |
| `/analytics` | AnalyticsDashboard | charts (Title Case labels; chart hex → D4) | ⚠ |
| `/calendar-import` | CalendarImport | PARKED — entry point disabled behind `{false &&}` | — |

## Admin only (owner)

`/admin/overview` · `/admin/users` · `/admin/verifications` ·
`/admin/payments` · `/admin/financials` · `/admin/moderation` ·
`/admin/custom-tasks` · `/admin/disputes` · `/admin/updates` — internal
tooling, lower copy-polish priority; Title Case labels widespread (logged,
deprioritised).

## Redirects

| From | To | Note |
|---|---|---|
| `/jobs` | `/work` | Navbar's tradie link still targets `/jobs` (audit fix) |
| `/team` | `/schedule?tab=team` | query string survives (verified) |
| `/admin` | `/admin/overview` | |
| `/verification` | `/settings` | `Verification.tsx` itself is an orphan file (baselined N11) |

## Sub-views (no own URL)

ClientDashboard, TradieDashboard (inside `/dashboard`); Jobs, TradeCareers
(tabs of `/work`); Team, SiteCalendar (tabs of `/schedule`);
Verification.tsx (orphan — nothing renders it).

## Known structural quirks (by design, don't "fix")

- Browser-tab titles come from `PAGE_TITLES`/`DYNAMIC_TITLES` in
  `src/App.tsx`; the `<SEO>` react-helmet component on ~19 pages is inert.
- 14 routes have no menu entry by design (tokenised links, Stripe returns,
  SEO entries) — the full exemption list lives in `check-navigability.mjs`.
- `/search`, `/tradie/:id`, `/find/*` render empty for logged-out visitors
  (anon sees 0 tradie rows) — tracked as the profiles-RLS work, decision D6
  territory; ordering trap documented in project notes.
