# ConnecTradie — Project Status & Roadmap

## Overview
ConnecTradie is a two-sided marketplace web app connecting Australian homeowners with licensed tradies (tradespeople). Homeowners post jobs and receive quotes; tradies manage leads, availability, and client communication.

## Tech Stack
- **Frontend:** React 18, TypeScript, Tailwind CSS, Vite
- **Backend:** Supabase (PostgreSQL, Auth, Realtime, Edge Functions, Storage)
- **Payments:** Stripe (Connect, Checkout, Escrow)
- **Testing:** Vitest + jsdom
- **Hosting:** Vercel (or similar)

## Project Structure
```
src/
├── __tests__/           # Test suite (expansion.test.ts, setup.ts)
├── components/          # 65+ reusable UI components
│   └── profile-editor/  # Profile editing modals
├── contexts/            # AuthContext (Supabase auth)
├── hooks/               # Custom hooks (geolocation, etc.)
├── lib/                 # 20+ utility modules & services
├── pages/               # 30+ page components
├── sql/                 # Database migrations
├── styles/              # CSS (mobile-responsive.css)
└── types/               # TypeScript types (database.ts)
```

## Feature Status — All Tiers

### ✅ TIER 1 — Revenue & Trust
| Feature | Status | Files | Notes |
|---------|--------|-------|-------|
| Stripe Payments — Pro subscriptions | ✅ Done | `lib/stripe.ts`, `lib/subscription.ts` | Checkout sessions, Connect onboarding, training mode |
| Stripe Payments — Job deposits & escrow | ✅ Done | `lib/stripePayments.ts` | Deposits, milestone payments, escrow release, refunds |
| Stripe Payments — Fee calculator | ✅ Done | `lib/stripePayments.ts` | 10% free tier, 0% pro, Stripe fee calc, tradie payout calc |
| Payment History page | ✅ Done | `pages/PaymentHistory.tsx` | Summary cards, filters, transaction table, tradie payout status |
| Reviews — Full system | ✅ Done | `lib/reviewSystem.ts` | Submit, respond, stats, Top Rated badge, pending reviews, report |
| Reviews — Verified job only | ✅ Done | `lib/reviewSystem.ts` | Only completed jobs can be reviewed, duplicate prevention |
| Reviews — Tradie response | ✅ Done | `lib/reviewSystem.ts` | One response per review, timestamped |
| Reviews — Top Rated badge | ✅ Done | `lib/reviewSystem.ts` | ≥5 reviews, ≥4.5 avg, ≥80% response rate |
| Reviews — Tags & categories | ✅ Done | `lib/reviewSystem.ts` | 10 tags: punctual, quality, communication, etc. |
| Identity verification — KYC | ✅ Done | `lib/identityVerification.ts` | Document upload, verification levels (none→premium) |
| Identity verification — ABN | ✅ Done | `lib/identityVerification.ts` | 11-digit format + checksum validation, API integration ready |
| Identity verification — Licenses | ✅ Done | `lib/identityVerification.ts` | State-based license verification, expiry tracking |
| Identity verification — Badges | ✅ Done | `lib/identityVerification.ts` | Identity, Licensed, Insured, Police Check badges |
| Identity verification — Expiry alerts | ✅ Done | `lib/identityVerification.ts` | Alerts for licenses expiring within 30 days |

### ✅ TIER 2 — Growth & Retention
| Feature | Status | Files | Notes |
|---------|--------|-------|-------|
| Email/SMS — Template system | ✅ Done | `lib/emailTemplates.ts` | 18 templates covering all user events |
| Email/SMS — Preference management | ✅ Done | `lib/emailTemplates.ts`, `components/NotificationPreferences.tsx` | Per-category opt-in/out, toggle UI |
| Email/SMS — Trigger helpers | ✅ Done | `lib/emailTemplates.ts` | `notifyNewLead`, `notifyQuoteReceived`, `notifyMessageReceived`, `sendReviewReminder` |
| Email/SMS — Batch send | ✅ Done | `lib/emailTemplates.ts` | Parallel send with success/fail tracking |
| SEO — Meta tags manager | ✅ Done | `lib/seoUtils.ts` | `setSEOMeta()` for title, description, OG, Twitter Card, robots |
| SEO — JSON-LD structured data | ✅ Done | `lib/seoUtils.ts` | LocalBusiness, Service, JobPosting, Breadcrumb, FAQ schemas |
| SEO — Page presets | ✅ Done | `lib/seoUtils.ts` | Pre-configured SEO for home, search, explore, register |
| SEO — Sitemap definitions | ✅ Done | `lib/seoUtils.ts` | 8 pages with priority and change frequency |
| Search — Geolocation | ✅ Done | `hooks/useGeolocation.ts` | GPS, reverse geocode, distance calc, session cache |
| Search — Distance sorting | ✅ Done | `hooks/useGeolocation.ts` | Haversine formula, `sortByDistance()`, AU capital coords |
| Search — Saved searches | ✅ Done | `lib/savedSearches.ts` | Save/load/delete, alert toggle, Supabase-backed |
| Search — Filter builder | ✅ Done | `lib/savedSearches.ts` | Trade category, postcode, rating, verified, insured, emergency, sort |
| Search — Recent searches | ✅ Done | `lib/savedSearches.ts` | localStorage-backed, deduplicated, max 10 |
| Mobile responsive — CSS audit | ✅ Done | `styles/mobile-responsive.css` | Touch targets, form zoom fix, tables→cards, modals→sheets |
| Mobile responsive — Safe areas | ✅ Done | `styles/mobile-responsive.css` | Notched phone support, print styles |

### ✅ TIER 3 — Competitive Advantage
| Feature | Status | Files | Notes |
|---------|--------|-------|-------|
| Job tracking timeline | ✅ Done | `components/JobTimeline.tsx` | Visual progress: Posted→Quoted→Accepted→Funded→In Progress→Completed→Reviewed |
| Job tracking — Compact mode | ✅ Done | `components/JobTimeline.tsx` | Inline dot indicator for list views |
| Instant quoting — Standard rates | ✅ Done | `components/InstantQuoteWidget.tsx` | Tradies set rates, clients see ballpark pricing |
| Instant quoting — Suggested services | ✅ Done | `components/InstantQuoteWidget.tsx` | Per-trade suggestions (plumber, electrician, builder, painter, landscaper) |
| Instant quoting — Edit mode | ✅ Done | `components/InstantQuoteWidget.tsx` | Full CRUD for rates, materials toggle, hours estimate |
| Photo documentation — Upload | ✅ Done | `components/PhotoDocumentation.tsx` | Before/during/after stages, multi-upload, compression |
| Photo documentation — Portfolio auto-add | ✅ Done | `components/PhotoDocumentation.tsx` | 'After' photos auto-added to portfolio, toggle per photo |
| Photo documentation — Before/after slider | ✅ Done | `components/PhotoDocumentation.tsx` | `BeforeAfterComparison` component with draggable slider |
| Photo documentation — Viewer | ✅ Done | `components/PhotoDocumentation.tsx` | Full-screen viewer, captions, navigation |
| Recurring jobs — Creation | ✅ Done | `lib/recurringJobs.ts` | Frequency, auto-remind, reminder days config |
| Recurring jobs — Suggestions | ✅ Done | `lib/recurringJobs.ts` | Auto-suggest after job completion based on trade category |
| Recurring jobs — Default frequencies | ✅ Done | `lib/recurringJobs.ts` | Plumber 12mo, lawn 1mo, painter 60mo, etc. |
| Recurring jobs — Due reminders | ✅ Done | `lib/recurringJobs.ts` | Email + in-app notifications, configurable lead time |
| Recurring jobs — Mark completed | ✅ Done | `lib/recurringJobs.ts` | Resets next due date, increments completion counter |
| Analytics — Full dashboard | ✅ Done | `pages/AnalyticsDashboard.tsx` | Revenue, jobs, win rate, rating KPIs |
| Analytics — Revenue/jobs charts | ✅ Done | `pages/AnalyticsDashboard.tsx` | Monthly bar charts with hover tooltips |
| Analytics — Quote performance | ✅ Done | `lib/analyticsService.ts`, `pages/AnalyticsDashboard.tsx` | Win rate, price range conversion, quote counts |
| Analytics — Response metrics | ✅ Done | `lib/analyticsService.ts`, `pages/AnalyticsDashboard.tsx` | Avg/median response time, by day of week |
| Analytics — Client retention | ✅ Done | `lib/analyticsService.ts`, `pages/AnalyticsDashboard.tsx` | Repeat rate, top clients, avg jobs/client |
| Analytics — Seasonal trends | ✅ Done | `lib/analyticsService.ts`, `pages/AnalyticsDashboard.tsx` | Monthly heat map, high season detection |
| Analytics — Insights & tips | ✅ Done | `pages/AnalyticsDashboard.tsx` | Context-aware suggestions based on metrics |

### ✅ TIER 4 — Scale & Operations
| Feature | Status | Files | Notes |
|---------|--------|-------|-------|
| Admin panel — Overview dashboard | ✅ Done | `pages/AdminDashboard.tsx` | 8 KPI cards, quick actions |
| Admin panel — User management | ✅ Done | `pages/AdminDashboard.tsx` | Search, filter by role, verify/reject, view details |
| Admin panel — Verification queue | ✅ Done | `pages/AdminDashboard.tsx` | Pending count badge, approve/reject workflow |
| Admin panel — Dispute resolution | ✅ Done | `pages/AdminDashboard.tsx` | Priority levels, resolve/dismiss actions |
| Admin panel — Platform analytics | ✅ Done | `pages/AdminDashboard.tsx` | Conversion rate, engagement, growth, health bars |
| Admin panel — Platform settings | ✅ Done | `pages/AdminDashboard.tsx` | Training mode, maintenance mode, registration toggle, fee config |
| Testing — Vitest config | ✅ Done | `vitest.config.ts`, `__tests__/setup.ts` | jsdom environment, Supabase mocks, storage mocks |
| Testing — Payment tests | ✅ Done | `__tests__/expansion.test.ts` | Fee calc, payout, constants validation |
| Testing — Rate limiter tests | ✅ Done | `__tests__/expansion.test.ts` | Rate limiting, spam detection, fake review detection |
| Testing — SEO tests | ✅ Done | `__tests__/expansion.test.ts` | Schema generation, presets, sitemap validation |
| Testing — Verification tests | ✅ Done | `__tests__/expansion.test.ts` | ABN format, checksum, invalid input |
| Testing — Accessibility tests | ✅ Done | `__tests__/expansion.test.ts` | ARIA labels, contrast ratio, price labels |
| Testing — Geolocation tests | ✅ Done | `__tests__/expansion.test.ts` | AU coords, distance sorting, missing coords |
| Testing — Search tests | ✅ Done | `__tests__/expansion.test.ts` | Recent searches, dedup, limits |
| Rate limiting | ✅ Done | `lib/rateLimiter.ts` | Per-action limits (jobs, quotes, messages, login, search) |
| Abuse detection — Spam | ✅ Done | `lib/rateLimiter.ts` | URL count, caps ratio, spam keywords, repeated chars |
| Abuse detection — Fake reviews | ✅ Done | `lib/rateLimiter.ts` | Account age, timing, review count, short reviews |
| Abuse detection — Contact scraping | ✅ Done | `lib/rateLimiter.ts` | View count thresholds with severity levels |
| Abuse reporting | ✅ Done | `lib/rateLimiter.ts` | User reports, auto-escalation for critical |
| Accessibility — Focus management | ✅ Done | `lib/accessibility.ts` | `useFocusTrap`, `useKeyboardNav`, skip to content |
| Accessibility — Screen reader | ✅ Done | `lib/accessibility.ts` | `announce()`, `LiveRegion`, `SrOnly` components |
| Accessibility — Motion/contrast | ✅ Done | `lib/accessibility.ts` | `useReducedMotion`, `useHighContrast`, `meetsContrastRatio` |
| Accessibility — ARIA helpers | ✅ Done | `lib/accessibility.ts` | Rating, status, price labels, heading level manager |
| Accessibility — CSS | ✅ Done | `styles/mobile-responsive.css` | focus-visible, reduced-motion, forced-colors, WCAG touch targets |

### Database
| Migration | Status | File | Tables |
|-----------|--------|------|--------|
| Expansion migration | ✅ Done | `sql/expansion_migration.sql` | payments, standard_rates, job_photos, recurring_jobs, saved_searches, email_preferences, abuse_reports |
| RLS policies | ✅ Done | `sql/expansion_migration.sql` | All 7 new tables have row-level security |
| Profile extensions | ✅ Done | `sql/expansion_migration.sql` | rejection_reason, insurance_policy, abn_verified, license_verified, license_expiry, documents_url, is_emergency_available |
| Review extensions | ✅ Done | `sql/expansion_migration.sql` | tradie_response, helpful_count, photos, tags |
| Update triggers | ✅ Done | `sql/expansion_migration.sql` | Auto updated_at on payments, rates, recurring, email_preferences |

### Routing
| Route | Page | Guard | Status |
|-------|------|-------|--------|
| `/analytics` | AnalyticsDashboard | Tradie only | ✅ Wired |
| `/payments` | PaymentHistory | Authenticated | ✅ Wired |
| `/admin` | AdminDashboard | Admin only | ✅ Wired |
| All existing routes | — | — | ✅ Preserved |

## File Summary — New Files Created

### Services (src/lib/)
| File | Lines | Purpose |
|------|-------|---------|
| `stripePayments.ts` | ~200 | Deposits, milestones, escrow, fees |
| `reviewSystem.ts` | ~280 | Full review lifecycle, stats, badges |
| `identityVerification.ts` | ~240 | KYC, ABN, licenses, badges, expiry |
| `emailTemplates.ts` | ~260 | 18 templates, preferences, triggers |
| `seoUtils.ts` | ~230 | Meta tags, JSON-LD, sitemap |
| `savedSearches.ts` | ~170 | Saved searches, filters, recent |
| `recurringJobs.ts` | ~280 | Recurring jobs, reminders, suggestions |
| `analyticsService.ts` | ~320 | Full business analytics |
| `rateLimiter.ts` | ~250 | Rate limits, spam/abuse detection |
| `accessibility.ts` | ~200 | WCAG utilities, ARIA, focus |

### Components (src/components/)
| File | Lines | Purpose |
|------|-------|---------|
| `JobTimeline.tsx` | ~200 | Visual job progress tracker |
| `InstantQuoteWidget.tsx` | ~310 | Standard rate display + editor |
| `PhotoDocumentation.tsx` | ~350 | Before/after photos, viewer, portfolio |
| `NotificationPreferences.tsx` | ~150 | Email preference toggles |

### Pages (src/pages/)
| File | Lines | Purpose |
|------|-------|---------|
| `AnalyticsDashboard.tsx` | ~320 | Tradie business analytics |
| `PaymentHistory.tsx` | ~200 | Payment transaction history |
| `AdminDashboard.tsx` | ~420 | Full admin control panel |

### Hooks (src/hooks/)
| File | Lines | Purpose |
|------|-------|---------|
| `useGeolocation.ts` | ~170 | GPS, reverse geocode, distance |

### Other
| File | Lines | Purpose |
|------|-------|---------|
| `sql/expansion_migration.sql` | ~230 | All new database tables + RLS |
| `styles/mobile-responsive.css` | ~280 | Mobile audit fixes + accessibility |
| `__tests__/expansion.test.ts` | ~400 | 50+ unit tests across all services |
| `__tests__/setup.ts` | ~80 | Test mocks for Supabase, storage, fetch |
| `vitest.config.ts` | ~25 | Test runner configuration |

**Total new code: ~5,500+ lines across 20 files**

## Previously Completed Features
- Landing page with hero, features, how-it-works, categories
- Auth: Login, Register, Onboarding (Supabase Auth)
- Role-based dashboards (TradieDashboard 1071 lines, ClientDashboard)
- Tradie profiles, public pages, portfolio, trade badges
- Availability calendar with bulk scheduling
- Job management, quote system, comparison view
- Pro subscription with feature gating
- Real-time messaging (ChatDrawer, Messages)
- Push notifications, notification router
- Contact gating and redaction for non-Pro
- Admin verifications page
- Site calendar, team page, trade careers
- Performance insights, smart insights widget

## Known Issues / Tech Debt
- TradieDashboard (73K/1730 lines) is the largest file — could use further decomposition
- `database.ts` types may need sync with new migration tables
- Google Calendar sync is partially implemented
- Offline sync (`offlineSync.ts`) needs testing
- Edge Functions need deployment for: send-email, verify-abn, verify-license, create-job-deposit, pay-milestone, release-escrow, process-refund
- Storage buckets `job-photos` and `verification-documents` need creation in Supabase dashboard

## Commands
```bash
npm run dev          # Start dev server (Vite)
npm run build        # Production build
npm run preview      # Preview production build
npx vitest run       # Run tests
npx vitest           # Run tests in watch mode
npx vitest --coverage # Run tests with coverage
```

## Integration Checklist
Before going live, complete these steps:
- [ ] Run `sql/expansion_migration.sql` in Supabase SQL editor
- [ ] Create storage buckets: `job-photos` (public), `verification-documents` (private)
- [ ] Deploy Edge Functions for email, ABN, license verification
- [ ] Configure Stripe webhooks for payment status updates
- [ ] Set environment variables: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, Stripe keys
- [ ] Import `mobile-responsive.css` in `index.css` or `App.tsx`
- [ ] Add `<SkipToContent />` from accessibility.ts to App layout
- [ ] Call `setSEOMeta()` on each page component mount
- [ ] Test all payment flows in Stripe test mode
- [ ] Run full test suite: `npx vitest run`
