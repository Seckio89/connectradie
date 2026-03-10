# ConnecTradie Platform Audit Report

**Date:** 7 March 2026
**Stack:** React 18 + TypeScript + Tailwind CSS + Vite + Supabase + Stripe

---

## Platform Size

| Metric | Count |
|--------|-------|
| Pages | 40 |
| Components | 77 |
| Custom Hooks | 6 |
| Library Modules | 28 |
| Test Files | 10 |
| Database Migrations | 135 |
| Edge Functions | 20 |
| Storage Buckets | 5 |

---

## Section Completion Table

| # | Section | Score | Status | What Works | What's Missing |
|---|---------|-------|--------|------------|----------------|
| 1 | **Authentication & Onboarding** | 95% | Excellent | Email/password, Google OAuth, 2FA (TOTP), password reset, role-based onboarding, trade/employment selection | Email verification before actions, Facebook/Apple login |
| 2 | **Messaging** | 95% | Excellent | Real-time chat, unread counts, message search, failed retry, file uploads, booking requests, archive, contact redaction | Read receipts, typing indicator, emoji reactions |
| 3 | **Search & Discovery** | 93% | Excellent | 40+ trade categories, location/postcode search, advanced filters, emergency filter, saved searches, search alerts, explore page | Map view, distance sorting, recently viewed |
| 4 | **Profiles & Verification** | 92% | Strong | Public profile, portfolio gallery, cover photo, trade badges, ABN verification (ATO API), license lookup (QLD/NSW/VIC), Stripe Identity KYC, rating breakdown, reviews, profile completeness score | Periodic license re-check, insurance validation, profile view analytics |
| 5 | **Client Dashboard** | 90% | Strong | Saved tradies, recommendations, spending summary widget, recurring job reminders, activity feed, welcome guide, onboarding checklist, skeleton loaders | Spending chart, budget tracker, quick-post shortcut |
| 6 | **Tradie Dashboard** | 92% | Strong | Month calendar, jobs/messages tabs, earnings widget, quote insights, smart insights, push setup, pro pitch, bulk availability, Google Calendar sync | Weekly/daily view, revenue chart, deadline view |
| 7 | **Quoting System** | 90% | Strong | Submit quote (range + firm), blind quoting, side-by-side comparison, quote insights, site inspection option, change orders | Quote templates, auto-pricing suggestions, revision history |
| 8 | **Settings** | 90% | Strong | Profile tab, professional tab, security (password + 2FA), verification center, notification preferences, admin tools, account deletion | Dark mode, language selector, GDPR data export, connected accounts |
| 9 | **Job Management** | 88% | Good | Post lead (multi-step), browse/filter jobs, job detail modal, status management, completion modal, timeline, decline with reason, contact gating, verification gate, flash boost, emergency flag | Milestone creation UI, dispute resolution, drag-to-schedule, job tracking map |
| 10 | **Notifications** | 88% | Good | Web push (VAPID), email (HTML templates), SMS (rate-limited 10/day), in-app (database), preferences per channel, urgent lead alerts | Notification inbox page, grouping/batching, quiet hours / DND |
| 11 | **Admin Panel** | 85% | Good | KPI overview, user management (search/ban/delete), verification approval (3 tabs), payment tracking, content moderation, abuse reports | Audit logging, data export, advanced reporting, mobile card views, user impersonation |
| 12 | **Payments & Subscriptions** | 82% | Good | Stripe Checkout, lead unlock, job access, milestones, escrow release, refunds, tiered fees, payment history, CSV export, PDF receipt, Stripe Connect payouts | Payment reconciliation, idempotency keys, formal invoices, failure notifications, fee preview |
| 13 | **PWA & Offline** | 80% | Good | Service worker, cache-first assets, offline job acceptance, offline milestones, background sync, token refresh on reconnect | Offline banner, conflict resolution, queue cleanup, install prompt |
| 14 | **Team Management** | 80% | Good | Add/edit/remove members, linked employees, approve/decline requests, role badges, role permissions tab, team calendar overlay | Permission enforcement in code, time tracking, team payroll, team chat |
| 15 | **Help & Support** | 75% | Needs Work | FAQ with search + highlighting, video tutorial list, live chat widget UI, contact form, pricing page, terms/privacy | Embedded videos, live chat backend, ticket system, knowledge base, contextual help |
| 16 | **Analytics & Insights** | 72% | Needs Work | Performance insights page, analytics dashboard, quote insights widget, smart insights widget, skeleton loaders | Interactive charts, date range selector, data export, period comparison, forecasting, heatmap |

---

## Infrastructure & Security Scores

| Area | Score | Status | Details |
|------|-------|--------|---------|
| **Database Schema** | 90% | Strong | 135 migrations, RLS on all tables, proper indexes, comprehensive job/payment lifecycle |
| **Edge Functions** | 80% | Good | 20 functions covering payments, verification, email, SMS, calendar. Missing: rate limiting, idempotency |
| **Test Coverage** | 65% | Needs Work | 10 test files, good unit tests for business logic. Missing: E2E, integration, component tests |
| **Security Hardening** | 70% | Needs Work | RLS enabled, JWT auth, webhook signatures. Missing: CORS restriction, rate limiting, audit logs |
| **Mobile Responsiveness** | 85% | Good | Tailwind responsive classes, collapsible sidebar. Missing: admin mobile card views, calendar squeeze |
| **Error Handling** | 82% | Good | ErrorBoundary, SectionErrorBoundary, try/catch. Missing: centralized logging, offline indicators |

---

## Overall Platform Score: 84%

```
Authentication    [=================== ] 95%
Messaging         [=================== ] 95%
Search            [==================  ] 93%
Profiles          [==================  ] 92%
Tradie Dashboard  [==================  ] 92%
Client Dashboard  [==================  ] 90%
Quoting           [==================  ] 90%
Settings          [==================  ] 90%
Job Management    [=================   ] 88%
Notifications     [=================   ] 88%
Admin Panel       [=================   ] 85%
Payments          [================    ] 82%
PWA & Offline     [================    ] 80%
Team Management   [================    ] 80%
Help & Support    [===============     ] 75%
Analytics         [==============      ] 72%
```

---

## Recommendations Explained

### CRITICAL - Must fix before production scale

---

#### 1. Fix CORS on all edge functions
**Current Problem:** Every Supabase edge function returns `Access-Control-Allow-Origin: *`, which means any website on the internet can make API requests to your backend. An attacker could build a page that calls your payment or SMS endpoints from their own domain.

**What to do:** Change the CORS header in every edge function from `*` to your actual domain (e.g., `https://connectradie.com.au`). This ensures only your frontend can talk to your backend.

**Impact:** Prevents cross-site request forgery and API abuse.
**Effort:** Low - find and replace in 20 edge function files.

---

#### 2. Add idempotency keys to payment functions
**Current Problem:** If a user clicks "Pay" and their internet drops mid-request, the browser may retry the request automatically. Without idempotency, Stripe could charge them twice for the same job because each request looks like a new payment.

**What to do:** Generate a unique `idempotency_key` (UUID) on the client before each payment request. Pass it to the edge function, which forwards it to `stripe.paymentIntents.create({ idempotencyKey })`. Stripe will recognize the duplicate and return the original result instead of charging again.

**Impact:** Prevents double-charging customers.
**Effort:** Medium - update client-side payment calls + 4-5 edge functions.

---

#### 3. Add rate limiting on auth and payment endpoints
**Current Problem:** There's no limit on how many times someone can call your login, register, or payment endpoints per minute. An attacker could brute-force passwords (trying thousands of passwords per second) or spam your SMS endpoint (costing you money per message).

**What to do:** Add a rate limiter to edge functions. For example: max 5 login attempts per minute per IP, max 10 SMS per day per phone number (the SMS limiter exists in `rateLimiter.ts` on the client, but it's not enforced server-side). Use Supabase's built-in rate limiting or implement a token-bucket algorithm.

**Impact:** Prevents brute-force attacks and API abuse.
**Effort:** Medium - add middleware to edge functions.

---

#### 4. Add payment reconciliation cron job
**Current Problem:** Your `payments` table and Stripe's records can fall out of sync. For example, if a Stripe webhook fails to deliver (network issue, server restart), a successful Stripe charge might never update your database. The customer is charged but the system shows "pending."

**What to do:** Create a scheduled edge function (cron) that runs daily. It queries Stripe for all payments in the last 48 hours and compares them against your `payments` table. Any mismatches get corrected automatically, and an alert is sent to the admin.

**Impact:** Ensures financial records are always accurate.
**Effort:** Medium - new edge function + Supabase cron trigger.

---

#### 5. Wire up Sentry error monitoring
**Current Problem:** `@sentry/react` is installed as a dependency and the DSN environment variable exists, but Sentry isn't actually initialized in the app. When users encounter errors in production, you have no way to know about it unless they report it manually.

**What to do:** Add `Sentry.init({ dsn: import.meta.env.VITE_SENTRY_DSN })` in your app entry point. Wrap the app in `Sentry.ErrorBoundary`. This captures all unhandled errors, network failures, and performance metrics automatically and sends them to your Sentry dashboard.

**Impact:** You'll know about production errors within minutes instead of days.
**Effort:** Low - ~10 lines of code in `main.tsx`.

---

### HIGH - Should do soon for user experience and quality

---

#### 6. Add E2E tests for critical user flows
**Current Problem:** You have good unit tests for individual functions (fees, reviews, redaction), but no tests that simulate a real user clicking through the app. If someone changes the Register page and breaks the flow, you won't know until a real user complains.

**What to do:** Add Playwright or Cypress. Write tests for the 3 most critical flows: (1) Register -> Onboard -> Post Job, (2) Tradie views lead -> Unlocks -> Submits quote, (3) Client accepts quote -> Payment -> Review. Run them in CI on every pull request.

**Impact:** Catches breaking changes before they reach production.
**Effort:** High - Playwright setup + 3-5 test suites (~2-3 days).

---

#### 7. Add interactive charts to Analytics Dashboard
**Current Problem:** The Analytics page shows numbers in cards (e.g., "Revenue: $4,200") but no visual charts. Users can't see trends over time, compare months, or spot patterns. For tradies trying to grow their business, this makes the data much less useful.

**What to do:** Add `recharts` or `chart.js` library. Add a line chart for monthly revenue, a bar chart for quotes sent vs won, and a pie chart for revenue by trade category. Use the data already being fetched - just visualize it.

**Impact:** Makes analytics actionable instead of just informational.
**Effort:** Medium - install chart library + 3-4 chart components.

---

#### 8. Add unified notification inbox page
**Current Problem:** Notifications come via push, email, SMS, and in-app, but there's no single page where users can see all their notifications in one place. The bell icon in the header shows a count but there's no dedicated inbox to review, mark as read, or take action on past notifications.

**What to do:** Create a `/notifications` page that queries the `notifications` table. Show a chronological list grouped by date, with read/unread status, action links (e.g., "View Job", "Reply to Message"), and a "Mark all as read" button. Add it to the sidebar navigation.

**Impact:** Users stop missing important notifications.
**Effort:** Medium - new page + sidebar link.

---

#### 9. Build formal dispute resolution flow
**Current Problem:** When a client is unhappy with work quality or a tradie feels they weren't paid fairly, there's no formal process. The refund button exists but there's no mediation, evidence submission, or admin review workflow. This is critical for a platform handling real money.

**What to do:** Create a dispute system: (1) Either party opens a dispute on a completed job, (2) Both parties submit evidence (photos, messages, timeline), (3) Admin reviews and makes a ruling, (4) Funds are held in escrow during dispute, (5) Resolution is recorded. Add a `disputes` table and a dispute modal.

**Impact:** Builds trust in the platform. Required for handling real payments at scale.
**Effort:** High - new DB table, edge function, admin UI, user-facing modal.

---

#### 10. Add milestone creation UI
**Current Problem:** The database has a complete `job_milestones` table with status tracking and payment fields, and there's a view to see milestones, but there's no UI for clients or tradies to actually create milestones when setting up a job. This is a half-finished feature.

**What to do:** Add a "Split into Milestones" section to the job detail/quote flow. Allow the tradie to define milestones (name, amount, due date) when submitting a quote, and the client to approve them. Each milestone triggers a separate payment when marked complete.

**Impact:** Enables staged payments for large jobs (very common in trades).
**Effort:** Medium - new modal + integration with existing quote flow.

---

### MEDIUM - Improve user experience and maintainability

---

#### 11. Add dark mode toggle
**Current Problem:** The entire platform uses a light theme only. Many users (especially tradies checking their phone at night) prefer dark mode. It's a modern UX expectation and improves accessibility for light-sensitive users.

**What to do:** Define dark color variants in `tailwind.config.js`. Add a `dark:` class prefix to key components. Add a toggle in Settings that saves preference to `localStorage` and applies `class="dark"` to the HTML root.

**Impact:** Better accessibility and user comfort.
**Effort:** Medium - theme definition + updating key components.

---

#### 12. Add offline mode banner
**Current Problem:** The app has excellent offline support (queues actions, replays on reconnect), but the user has no idea they're offline. They might submit a quote thinking it went through, not knowing it's queued. There's no visual indicator of connection status.

**What to do:** Add a `useOnlineStatus` hook that listens to `navigator.onLine` and `window` online/offline events. When offline, show a yellow banner at the top: "You're offline. Actions will be saved and sent when you're back online." Remove it when connectivity returns.

**Impact:** Users understand why things seem slow or pending.
**Effort:** Low - small hook + banner component.

---

#### 13. Centralize trade categories
**Current Problem:** The list of 40+ trade categories (Plumber, Electrician, Carpenter, etc.) is hardcoded as arrays in at least 5 different files: Search.tsx, Onboarding.tsx, PostLead.tsx, Explore.tsx, and others. If you add a new trade, you need to update every file manually, and they can fall out of sync.

**What to do:** Create a single `src/lib/tradeCategories.ts` file that exports the master list. Import it everywhere. Even better, move it to a `trade_categories` database table so it can be managed by admins without code deploys.

**Impact:** Prevents bugs from inconsistent category lists.
**Effort:** Low - extract to shared file + find/replace imports.

---

#### 14. Add admin audit logging
**Current Problem:** When an admin deletes a user, approves a license, or bans an account, there's no record of who did it and when. If something goes wrong (e.g., a user claims they were wrongfully banned), there's no audit trail to investigate.

**What to do:** Create an `admin_audit_log` table with columns: `admin_id`, `action`, `target_type`, `target_id`, `details`, `created_at`. Insert a row every time an admin performs a significant action. Add a read-only "Audit Log" tab in the admin panel.

**Impact:** Accountability and compliance (important for financial platforms).
**Effort:** Medium - new table, insert calls in admin functions, log viewer page.

---

#### 15. Mobile card views for admin tables
**Current Problem:** The admin pages (Users, Payments, Verifications) display data in wide HTML tables. On mobile devices, these tables require horizontal scrolling and are hard to use. Admins checking the platform from their phone have a poor experience.

**What to do:** Add responsive breakpoints: on screens < 768px, render each row as a stacked card instead of a table row. Use Tailwind's `hidden md:table-cell` and `md:hidden` patterns to swap between card and table layouts.

**Impact:** Admins can manage the platform from any device.
**Effort:** Medium - restyle 4-5 admin pages.

---

#### 16. Embed actual video tutorials
**Current Problem:** The Help/FAQ page has a "Video Tutorials" section with 4 tutorial entries (title, description, duration), but they're just static cards with a play icon. Clicking them does nothing because there are no actual video URLs or embedded players.

**What to do:** Record or source tutorial videos (screen recordings work fine). Upload to YouTube/Vimeo. Replace the static cards with an embedded video player (iframe or react-player). Prioritize: "Getting Started", "Posting Your First Job", "Setting Up Availability", "Getting Paid."

**Impact:** Visual learners can actually use the tutorials.
**Effort:** Low (code) + Medium (content creation).

---

#### 17. Add date range selector to Analytics
**Current Problem:** The Analytics Dashboard and Performance Insights pages show fixed-period stats (all time, this month) but users can't select a custom date range. A tradie can't ask "How did I do in January?" or "Compare Q1 vs Q2."

**What to do:** Add a date range picker component (two date inputs or a calendar range picker). Pass the selected range to the data queries. Add preset buttons: "Last 7 days", "This Month", "Last 3 Months", "This Year", "Custom."

**Impact:** Makes analytics useful for business planning.
**Effort:** Low - date inputs + query parameter changes.

---

#### 18. Add periodic license re-verification
**Current Problem:** License verification is a one-time check. A tradie's license could expire or be suspended after verification, and the platform would still show them as "verified." Clients trust this badge when hiring.

**What to do:** Create a Supabase cron function (already have `check-license-expiry` edge function) that runs weekly. It re-queries the license authority APIs (QLD, NSW, VIC) for all verified tradies. If a license is expired/suspended, update the profile status to "expired" and notify the tradie.

**Impact:** Ensures the "verified" badge always means currently valid.
**Effort:** Medium - enhance existing cron + notification logic.

---

### LOW - Polish and future features

---

#### 19. Add read receipts and typing indicators
**Current Problem:** In the messaging system, you can't tell if the other person has read your message or is currently typing a reply. This leads to uncertainty - did they see my quote? Are they responding?

**What to do:** For read receipts: update the message `read_at` timestamp when the recipient views it, and show a small "Seen" indicator. For typing: use Supabase Realtime's presence feature to broadcast typing state. Show "John is typing..." below the message input.

**Impact:** Makes messaging feel more responsive and professional.
**Effort:** Medium - realtime presence + UI updates.

---

#### 20. Add map view for search results
**Current Problem:** Search results are displayed as a list of cards. Users can't visualize where tradies are located relative to their home. For location-dependent services, a map is much more intuitive than reading suburb names.

**What to do:** Add a toggle between "List" and "Map" views on the Search page. Use the existing `@react-google-maps/api` dependency (already installed) to render pins for each tradie. Clicking a pin shows the tradie card. Filter pins as search filters change.

**Impact:** Better discovery experience for location-based searches.
**Effort:** High - Google Maps integration, pin rendering, click handlers.

---

#### 21. Add GDPR data export
**Current Problem:** Under Australian Privacy Act and GDPR (if serving EU users), users have the right to download all personal data the platform holds about them. Currently there's no way for users to export their data.

**What to do:** Add a "Download My Data" button in Settings. When clicked, query all tables for the user's data (profile, jobs, messages, payments, reviews). Package it as a JSON or ZIP file and trigger a download. Include a "this may take a moment" loading state.

**Impact:** Legal compliance and user trust.
**Effort:** Medium - query all user tables, format as JSON, download.

---

#### 22. Add quote templates for tradies
**Current Problem:** Every time a tradie submits a quote, they write the description from scratch. For tradies who do similar work repeatedly (e.g., hot water system replacement), this is repetitive and time-consuming.

**What to do:** Add a "My Templates" section in tradie settings. A tradie can save quote templates with pre-filled description, price range, and estimated duration. When submitting a quote, they can select a template as a starting point and customize it.

**Impact:** Saves tradies time, increases quote submission rate.
**Effort:** Medium - new DB table, template CRUD, integration with quote modal.

---

#### 23. Add weekly/daily calendar views
**Current Problem:** The Tradie Dashboard calendar only shows a month view. For a busy tradie with multiple jobs per day, the month view is too zoomed out. You can't see time slots, job details, or plan your day effectively.

**What to do:** Add tab buttons for "Day / Week / Month" above the calendar. The day view shows hourly time slots with jobs/availability. The week view shows 7 columns. Keep month as default but let users switch.

**Impact:** Better daily planning for busy tradies.
**Effort:** Medium - two new calendar view components.

---

#### 24. Add i18n (internationalization) support
**Current Problem:** Everything is hardcoded in English. If ConnecTradie expands to non-English-speaking markets (or serves multilingual communities in Australia), there's no translation framework.

**What to do:** Install `react-i18next`. Extract all user-facing strings into translation JSON files. Add a language selector in Settings. Start with English and add languages as needed.

**Impact:** Opens the platform to non-English markets.
**Effort:** High - extract hundreds of strings, translation files, testing.

---

#### 25. Add team time tracking and payroll
**Current Problem:** The Team page lets you manage members and see roles, but there's no way to track hours worked or process payments to team members. For a tradie business with employees, this means they need separate software for timesheet management.

**What to do:** Add a "Log Hours" feature per team member. Members can submit timesheets (date, hours, job). The business owner approves and sees a weekly/monthly summary. Optionally integrate with payroll APIs (Xero, MYOB) for Australian businesses.

**Impact:** Makes ConnecTradie a one-stop business tool for trade businesses.
**Effort:** High - timesheet DB, approval flow, summary views, API integrations.

---

## Summary

| Priority | Count | Key Theme |
|----------|-------|-----------|
| **Critical** | 5 | Security and data integrity |
| **High** | 5 | User trust and quality assurance |
| **Medium** | 8 | UX improvements and maintainability |
| **Low** | 7 | Polish and feature expansion |
| **Total** | **25** | |

The platform is at **84% overall completion** - strong core features with gaps primarily in security hardening, analytics visualization, and support infrastructure. The 5 critical items should be addressed before scaling to production traffic.
