# Platform Audit Report — 2026-06-12

## Summary

| Dimension | Score | Weight | Weighted Contribution | Status |
|-----------|-------|--------|----------------------|--------|
| Security & Auth | 86.5% | 25% | 21.6% | 🟡 |
| Payments & Stripe | 50.0% | 25% | 12.5% | 🔴 |
| Database & RLS | 89.3% | 20% | 17.9% | 🟡 |
| TypeScript Safety | 86.0% | 10% | 8.6% | 🟡 |
| UI & Design System | 57.0% | 5% | 2.9% | 🔴 |
| Navigation | 90.0% | 5% | 4.5% | 🟢 |
| Test Coverage | 7.0% | 10% | 0.7% | 🔴 |
| **Overall** | **68.6%** | | | 🔴 |

---

## Detailed Check Results

### Security & Auth (86.5% — 🟡)

| Check | Weight | Result | File(s) | Notes |
|-------|--------|--------|---------|-------|
| Bearer token via `getUser()` | CRITICAL (3x) | ✅ | All 53 functions | 14 skip `getUser()` but are cron/service-role/webhook functions using `SUPABASE_SERVICE_ROLE_KEY`. All 39 user-facing functions properly call `auth.getUser()`. |
| CORS handler (no wildcard) | MAJOR (2x) | ⚠️ | `stripe-checkout/index.ts` L14 | All functions have CORS with `ALLOWED_ORIGIN`. However `stripe-checkout` uses `Access-Control-Allow-Headers: '*'` (wildcard). |
| Input validation | CRITICAL (3x) | ✅ | All functions | All validate inputs with `if (!field)` checks. No schema validation library (zod/joi) — ad-hoc but functional. |
| Structured error responses | MINOR (1x) | ✅ | All 53 functions | Every function returns `JSON.stringify({ error: ... })` on error paths. |
| No hardcoded secrets | CRITICAL (3x) | ✅ | All files | Zero hardcoded keys. All secrets via `Deno.env.get()`. |
| Rate limiting | MAJOR (2x) | ❌ | 49 of 53 functions | Shared `_shared/rateLimiter.ts` exists but only 4 functions use it. Payment endpoints, delete-user, and 43 others lack rate limiting. |
| Stripe webhook sig validation | CRITICAL (3x) | ✅ | `stripe-webhook/index.ts` L31,47 | Uses `stripe.webhooks.constructEventAsync()` with signature header. |
| RLS enabled all tables | CRITICAL (3x) | ✅ | 47 migration files | Every CREATE TABLE has corresponding ENABLE ROW LEVEL SECURITY. |
| No USING(true) on sensitive SELECT | CRITICAL (3x) | ⚠️ | Various | `USING(true)` on public catalog data (tradie_details, reviews, portfolio_images) is acceptable. Conversations policy was fixed in migration `20260216080452`. |
| auth.uid() in policies | CRITICAL (3x) | ✅ | All user-scoped policies | Write/update/delete policies consistently use `auth.uid()`. |

### Payments & Stripe (50.0% — 🔴)

| Check | Weight | Result | File(s) | Notes |
|-------|--------|--------|---------|-------|
| Webhook signature validation | CRITICAL (3x) | ✅ | `stripe-webhook/index.ts` L31-55 | Correct implementation with `constructEventAsync()`. |
| Idempotency keys | CRITICAL (3x) | ⚠️ | Most payment functions | All accept client-supplied `idempotencyKey` except `stripe-checkout/index.ts` which has none. Not enforced server-side. |
| Amount validation (positive, AUD) | CRITICAL (3x) | ✅ | All payment functions | Validates `amount > 0`, uses `currency: "aud"`, amounts `Math.round()`-ed. |
| Escrow: platform never holds funds | CRITICAL (3x) | ❌ | create-job-deposit, create-job-payment-checkout, accept-and-pay, pay-milestone | **Custodial escrow pattern.** Payments collected to platform account, later transferred via `stripe.transfers.create()`. Should use destination charges with `transfer_data`. |
| Client-initiated release only | CRITICAL (3x) | ❌ | `auto-release-payments/index.ts` | Cron job auto-releases escrow after 48 hours with no client action. Bypasses client consent. |
| Fee calculations via `application_fee_amount` | MAJOR (2x) | ⚠️ | Mixed | Newer functions use `application_fee_amount` correctly. Older core job-funding flow uses manual `stripe.transfers.create()` with arithmetic. |
| No orphaned records | MAJOR (2x) | ✅ | All payment functions | Failed Stripe sessions properly handled. Webhook handler is idempotent with status guards. |
| AFSL compliance language | CRITICAL (3x) | ❌ | stripe-webhook L780,798; accept-and-pay L520; pay-price-increase L246 | Messages say "Funds are held securely in escrow" — implies custodial fund-holding, requires AFSL. |

### Database & RLS (89.3% — 🟡)

| Check | Weight | Result | File(s) | Notes |
|-------|--------|--------|---------|-------|
| RLS enabled on all tables | CRITICAL (3x) | ✅ | All 70 tables | Every table has ENABLE ROW LEVEL SECURITY. |
| CRUD policies per table | CRITICAL (3x) | ⚠️ | 3 tables incomplete | 3 admin/service tables have SELECT-only policies (acceptable for audit logs). |
| No permissive write policies | CRITICAL (3x) | ⚠️ | `contact_messages`, notifications | `contact_messages` INSERT open to anon (intentional for contact form). Notification INSERT repeatedly re-opened then locked down in `20260528270000`. |
| FK columns indexed | MAJOR (2x) | ✅ | `20260218131710`, `20260223103028` | Two dedicated FK-index migrations cover all foreign keys comprehensively. |
| Composite indexes | MINOR (1x) | ✅ | Multiple migrations | Good coverage: notifications(user_id, read), messages(conversation_id, created_at), recurring_jobs(next_due_date). |
| No N+1 in Edge Functions | MAJOR (2x) | ⚠️ | send-scheduled-notifications, generate-auto-invoices | 2-3 functions with clear N+1 patterns. Others pre-fetch correctly (send-lead-reminders is exemplary). |

### TypeScript Safety (86.0% — 🟡)

| Check | Weight | Result | File(s) | Notes |
|-------|--------|--------|---------|-------|
| `tsc --noEmit` clean | MAJOR (2x) | ✅ | Project-wide | 0 errors. Clean compile. |
| No `: any` / `as any` | MAJOR (2x) | ✅ | `src/` | Only 1 false positive in a comment string. No actual `any` annotations. |
| Types from database.ts | MINOR (1x) | ✅ | `src/types/database.ts` | 37,901-line types file, widely imported across 20+ components. |
| Supabase calls in try/catch | MAJOR (2x) | ⚠️ | Various | 721 `.from()` calls vs 358 try blocks. Hooks/contexts have good coverage; some page-level components rely on optional chaining instead. |

### UI & Design System (57.0% — 🔴)

| Check | Weight | Result | File(s) | Notes |
|-------|--------|--------|---------|-------|
| Max-width constraint | MINOR (1x) | ⚠️ | Dashboard.tsx, LandingPage.tsx | Most pages use max-w-5xl/7xl. Dashboard and LandingPage missing (LandingPage full-width by design). |
| Card pattern | MINOR (1x) | ✅ | Consistent | `bg-white rounded-xl shadow-sm` used across cards. Padding varies contextually. |
| Button pattern | MINOR (1x) | ✅ | Consistent | `inline-flex px-5 py-2.5 rounded-lg/xl` used consistently. |
| Status badges | MINOR (1x) | ⚠️ | Various | Sizing varies (px-2 to px-3, py-0.5 to py-1.5). Some use font-semibold vs font-medium. |
| No custom CSS | MINOR (1x) | ❌ | `src/index.css` (1,532 lines), `src/styles/mobile-responsive.css` (245 lines) | 1,777 lines of custom CSS plus 50 inline styles in Payouts.tsx alone. |
| Emerald for action/success | MINOR (1x) | ✅ | 430 emerald references | Consistently used for success states and primary actions. |
| Empty states | MINOR (1x) | ✅ | `EmptyState` component | Dedicated component imported in 20 locations. |

### Navigation (90.0% — 🟢)

| Check | Weight | Result | File(s) | Notes |
|-------|--------|--------|---------|-------|
| All routes reachable | MAJOR (2x) | ✅ | App.tsx, DashboardLayout.tsx, Navbar.tsx | All routes reachable from sidebar and top nav for all roles. |
| No orphaned routes | MINOR (1x) | ⚠️ | `/jobs` route | Defined but zero inbound links. Appears superseded by `/work` (WorkHub). Candidate for removal. |
| No dead links | MAJOR (2x) | ✅ | All nav components | All `to=` and `navigate()` destinations map to defined routes. |

### Test Coverage (7.0% — 🔴)

| Check | Weight | Result | File(s) | Notes |
|-------|--------|--------|---------|-------|
| Test files vs source files | MINOR (1x) | ❌ | 10 test files / 189 source files | 5.3% coverage ratio. |
| Untested Edge Functions | MAJOR (2x) | ❌ | 55 Edge Functions, 0 tests | Critical payment flows (accept-and-pay, stripe-webhook, release-escrow, process-refund) completely untested. |
| Untested pages/components | MINOR (1x) | ❌ | ~95% untested | Only 2 component tests (EmptyState, TradieCard). No page-level tests. |
| E2E critical flows | MAJOR (2x) | ⚠️ | 3 E2E spec files | Cover auth, public pages, search. Missing: job posting, messaging, payments, admin, onboarding, booking. Smoke-level only. |

---

## All Findings (Severity-Ranked)

| # | Severity | Dimension | File | Finding | Recommendation |
|---|----------|-----------|------|---------|----------------|
| 1 | CRITICAL | Payments | create-job-deposit, accept-and-pay, pay-milestone, create-job-payment-checkout | **Custodial escrow pattern**: Payments collected to platform account, later manually transferred. Platform temporarily holds client funds. | Migrate to destination charges with `transfer_data` + `application_fee_amount`. Funds route directly to tradie's Connect account; platform retains only its fee. |
| 2 | CRITICAL | Payments | auto-release-payments/index.ts | **Auto-release bypasses client consent**: Cron job releases escrow after 48 hours with no client action. | Require explicit client approval before releasing funds, or at minimum send a notification with opt-out period. |
| 3 | CRITICAL | Payments | stripe-webhook L780,798; accept-and-pay L520; pay-price-increase L246 | **AFSL-problematic language**: "Funds are held securely in escrow" implies custodial fund-holding requiring an AFSL. | Replace with "Payment confirmed. Funds will be released to your tradie when you approve the work." |
| 4 | CRITICAL | Tests | All 55 Edge Functions | **Zero Edge Function tests**: Payment flows, identity verification, BECS processing completely untested. | Add integration tests for stripe-webhook, release-escrow, process-refund, create-job-deposit at minimum. |
| 5 | MAJOR | Security | 49 of 53 functions | **Rate limiting missing**: Shared rateLimiter.ts exists but only 4 functions use it. Payment and destructive endpoints unprotected. | Import and apply `rateLimiter.ts` to all user-facing Edge Functions, prioritising payment and delete endpoints. |
| 6 | MAJOR | Payments | stripe-checkout/index.ts | **No idempotency key**: Subscription checkout lacks idempotency, risking duplicate sessions on retry. | Accept and pass idempotency key like other payment functions. |
| 7 | MAJOR | Payments | Mixed functions | **Dual fee architecture**: Newer functions use `application_fee_amount` correctly; older core flow uses manual `stripe.transfers.create()`. | Unify on destination charges for all payment flows. |
| 8 | MAJOR | Database | send-scheduled-notifications, generate-auto-invoices | **N+1 query patterns**: 2-3 functions issue per-row queries in loops instead of bulk-fetching. | Pre-fetch related data into Maps/Sets before loops (follow send-lead-reminders pattern). |
| 9 | MAJOR | Security | stripe-checkout/index.ts L14 | **CORS Allow-Headers wildcard**: `'Access-Control-Allow-Headers': '*'` weakens CORS. | Restrict to `authorization, x-client-info, apikey, content-type`. |
| 10 | MEDIUM | TypeScript | Various pages | **Incomplete try/catch**: 721 Supabase calls vs 358 try blocks. Page-level components use optional chaining instead of error handling. | Wrap all Supabase calls in try/catch, especially in page components that render user data. |
| 11 | MEDIUM | UI | src/index.css, mobile-responsive.css, Payouts.tsx | **1,777 lines custom CSS + 50 inline styles**: Undermines Tailwind-only design system. | Migrate custom CSS to Tailwind utility classes. Refactor Payouts.tsx inline styles. |
| 12 | LOW | Navigation | App.tsx | **Orphaned `/jobs` route**: Defined but unreachable. Superseded by `/work`. | Remove route or redirect to `/work`. |
| 13 | LOW | UI | Various | **Badge inconsistency**: Sizing varies (px-2/px-3, py-0.5/py-1.5), font-weight differs. | Standardise to `px-3 py-1 rounded-full text-xs font-medium`. |

---

## Recommendations (Prioritised)

### Critical — fix before deploy
1. **Migrate escrow to destination charges** — Eliminate custodial fund-holding by routing payments directly to tradie Connect accounts with `application_fee_amount`. This resolves findings #1, #3, and #7 simultaneously.
2. **Remove or gate auto-release** — Require client approval before fund release, or add a notification-based opt-out period.
3. **Fix AFSL language** — Replace "held in escrow" with compliant wording across all notification messages.

### High — this sprint
4. **Apply rate limiting** to all Edge Functions (import existing `rateLimiter.ts`).
5. **Add idempotency key** to `stripe-checkout/index.ts`.
6. **Fix N+1 queries** in `send-scheduled-notifications` and `generate-auto-invoices`.
7. **Fix CORS wildcard** in `stripe-checkout/index.ts`.

### Medium — next sprint
8. **Add Edge Function integration tests** starting with payment flows.
9. **Wrap remaining Supabase calls** in try/catch at page level.
10. **Migrate custom CSS** to Tailwind utilities.

### Low — backlog
11. Remove orphaned `/jobs` route.
12. Standardise badge styling.
13. Consider adopting Zod for input validation across Edge Functions.

---

## Score Trend

No previous audit reports found in the repository for comparison. This is the baseline audit.

---

## Next Recommended Action

**Migrate the escrow payment flow to Stripe destination charges.** This single change resolves the three most critical findings (custodial escrow, AFSL language, dual fee architecture) and eliminates the platform's biggest legal and financial risk. Start with `create-job-deposit` and `pay-milestone` as they handle the highest payment volume.
