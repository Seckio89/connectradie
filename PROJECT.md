# ConnecTradie — Project Status & Roadmap

## Overview
ConnecTradie is a two-sided marketplace connecting Australian homeowners with licensed tradies. Homeowners post jobs and receive quotes; tradies manage leads, availability, and client communication.

## Tech Stack
- **Frontend:** React 18, TypeScript, Tailwind CSS, Vite, Lucide React
- **Backend:** Supabase (PostgreSQL, Auth, Realtime, Edge Functions, Storage)
- **Payments:** Stripe (subscriptions, one-time payments, Connect)
- **Integrations:** Google Calendar, Google Maps, Twilio (SMS), Resend (email)
- **PWA:** Service worker, offline sync, push notifications

## Project Structure
```
src/
├── components/          # 114 reusable UI components
│   └── profile-editor/  # Profile editing modals (bio, cover, details, portfolio)
├── contexts/            # AuthContext (Supabase auth, role detection)
├── hooks/               # 12 custom hooks (availability, dashboard jobs, toast, etc.)
├── lib/                 # 54 utility modules (stripe, reviews, subscription, notifications, etc.)
├── pages/               # 62 page components, ~63 routes registered in App.tsx
└── types/               # TypeScript types (supabase.ts — generated DB types)
supabase/
├── functions/           # 68 Edge Functions (Deno runtime)
└── migrations/          # 314 SQL migrations
```

> Counts above are file counts as of 2026-07-29. They had drifted badly (this
> block previously claimed 14 Edge Functions, 102 migrations and 25 pages), so
> re-check with `ls` rather than trusting them after a few months of changes.
> `CLAUDE.md` is the day-to-day reference for conventions and commands.

## Completed Features

### Authentication & Roles
- Email/password auth via Supabase Auth
- Three roles: client, tradie, admin
- Role-based route protection and dashboard routing
- Onboarding flow with employment type selection

### Job Management
- Job posting (urgent/scheduled, flash boost with 2hr countdown)
- Job lifecycle: pending → accepted → in_progress → completed → cancelled/declined/funded
- Job completion with notes and proof photos
- Job variations table (change orders — DB ready)

### Lead System
- Lead unlock payments ($15 for contact details, free for Pro)
- Job access payments ($2.99, free for Pro)
- Contact info redaction for locked leads
- Profile view tracking and contact gating

### Quote System
- Blind quoting (tradies can't see competitor quotes)
- Two-stage quotes (range estimate → firm price after site inspection)
- Side-by-side quote comparison view
- Quote insights widget (analytics)
- Max 5 quotes per job (configurable)

### Real-Time Messaging
- Conversations with real-time Supabase subscriptions
- Booking request integration within messages
- Conversation settings and permissions
- File attachment support

### Tradie Profiles
- Public-facing profile: bio, portfolio gallery, cover photo
- Verified/licensed/insured badges, trade badges
- Ratings and reviews display
- Service radius, emergency availability, team size
- Hourly rate, call-out fee, qualifications
- Full profile editing (bio, cover, details, portfolio modals)

### Availability & Calendar
- Calendar-based availability scheduling (morning/midday/afternoon slots)
- Bulk scheduling tool (Pro)
- Google Calendar OAuth sync (Pro)
- Site calendar with team assignments (Pro)

### Review & Rating System
- 1–5 star rating with optional comment (ReviewModal)
- "Leave a Review" button on completed jobs
- Review display (ReviewsList) on public profiles
- Rating aggregation view (RatingBreakdown — star distribution chart)
- Rating-based filtering in search (3+, 4+, 5+)
- Database: reviews table + tradie_ratings view + RLS policies

### Payments (Stripe)
- Pro subscriptions: $45/month or $432/year (20% discount)
- One-time payments: lead unlock ($15) + job access ($2.99) + 2% processing fee
- Stripe Connect onboarding for tradie payouts
- Webhook processing (subscription sync, payment completion)
- Training mode for test payments (bypasses Stripe)
- Payment duplicate prevention
- Subscription cancellation flow

### Subscription System (Pro Tier)
- Free tier: 5 job accepts/month, 3 lead unlocks/month, 1 trade category
- Pro tier: unlimited accepts, unlimited unlocks, zero service fees
- 14 gated features: Google Calendar, invoices, milestones, bulk availability, team management, site calendar, analytics, profile boost, etc.
- ProFeatureGate, UpgradeBanner, ProBadgeButton components

### Invoice System
- Invoice creation modal with line items
- GST (10%) calculation
- Business details (ABN, address, phone, email)
- Status tracking: draft → sent → paid
- Linked to jobs, milestones, and subcontractors

### Project Management
- Group related jobs into projects
- Project status: active/completed/cancelled/ongoing
- Date change requests
- Milestone-based staged payments (DB + partial UI)

### Team Management
- Add employees and subcontractors
- Team member status (active/pending_approval/rejected)
- Employer-employee relationships

### Recruitment
- Post vacancies (apprentice/qualified/senior roles)
- Browse and apply for vacancies
- Application tracking
- Stats: open positions, apprenticeships, senior roles

### Performance Insights
- Quote win rate, total quotes, average job value
- Profile views, revenue tracking, completed jobs
- Top trades, suburbs, attributes
- Focus areas for improvement

### Verification System
- License format validation (per Australian state: NSW, VIC, QLD, SA, WA, TAS, NT, ACT)
- ABN checksum validation (mod 89) + ABR lookup
- Admin verification center (approve/reject with reasons)
- Status tracking: unverified → pending → verified/rejected/expired

### Notifications
- Push notifications (service worker + VAPID)
- SMS (Twilio) with rate limiting (10/day per number)
- Email (Resend) with branded HTML template
- In-app notification routing
- Notification type tracking and metadata

### Service Reminders
- Auto-created on job completion based on trade category intervals
- Retention engine for recurring maintenance

### Search & Discovery
- 40+ trade categories with subcategories
- Filters: trade type, location/postcode, rating, contractor type, availability
- Verified/licensed/insured badges
- Distance-based filtering (service radius)
- Saved tradie list on client dashboard

### PWA & Offline
- Service worker with stale-while-revalidate caching
- IndexedDB sync queue for offline actions
- Background sync with token refresh
- Push notification handling
- Web manifest for home screen install

### Admin
- Verification center: review pending tradies, approve/reject
- Search by name, email, ABN, license number
- Training mode toggle

### Other
- Landing page (hero, features, how-it-works, categories, for-tradies)
- Static pages: Terms, Privacy, Contact
- Settings: profile, password, notifications, verification
- Skeleton loaders, empty states, tooltips, error boundary
- Lazy-loaded routes with Suspense

## Where the live backlog actually lives

The numbered roadmap that used to sit here went stale (it still said "no
tests exist" and "no CI/CD pipeline" long after both shipped — see
`.github/workflows/ci.yml` and the 25+ test files). The backlog is now
maintained in three living documents instead of here:

1. **`AUDIT-REPORT-<latest date>.md`** (repo root) — open audit findings,
   severity-ranked. This is the defect backlog.
2. **`docs/governance/DECISIONS-PENDING.md`** — every significant (Tier B)
   change awaiting the owner's approval, with pros/cons. This is the
   decision backlog. Its companion `docs/governance/CHANGE-POLICY.md`
   defines what needs approval and what doesn't.
3. **`docs/growth/RECOMMENDATIONS.md`** — improvement/feature ideas from the
   weekly growth scan, ranked by expected impact. This is the feature
   backlog (and the "feature-gap list" other docs refer to).

Go-live sequencing lives in `docs/GO-LIVE-RUNBOOK.md`; the owner's personal
steps in `docs/OWNER-TODO.md`; how any bug becomes a fix in
`docs/governance/PATCH-RUNBOOK.md`.

## Key Files
| File | Purpose |
|------|---------|
| `src/App.tsx` | Router, auth guards, lazy-loaded route definitions |
| `src/contexts/AuthContext.tsx` | Auth state, user profile, tradie details, role detection |
| `src/pages/TradieDashboard.tsx` | Main tradie dashboard |
| `src/pages/ClientDashboard.tsx` | Main client dashboard |
| `src/lib/supabase.ts` | Supabase client initialization |
| `src/lib/stripe.ts` | Stripe checkout, payments, Connect, cancellation |
| `src/lib/subscription.ts` | Tier logic, feature gating, limits |
| `src/lib/reviews.ts` | Review queries, rating aggregation |
| `src/types/database.ts` | TypeScript interfaces for all DB tables |

## Commands
```bash
npm run dev      # Start dev server (Vite)
npm run build    # Production build
npm run preview  # Preview production build
```
