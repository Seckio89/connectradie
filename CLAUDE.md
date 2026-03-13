# ConnecTradie

Australian two-sided marketplace — homeowners post jobs, licensed tradies bid.
Escrow via Stripe Connect (Stripe holds funds, NOT us — AFSL compliance critical).

## Stack
- React 18 · TypeScript strict · Tailwind CSS · Vite
- Supabase: PostgreSQL + 20 Edge Functions (Deno) + RLS
- Stripe Connect escrow · Google Maps API · Sentry

## Key Directories
```
src/pages/          # 38 route pages
src/components/     # 90+ components
src/hooks/          # useAvailabilitySlots, useDashboardJobs, useToast, etc.
src/lib/            # Supabase client, notifications, analytics, email templates
src/contexts/       # AuthContext.tsx
supabase/functions/ # 20 Edge Functions
supabase/migrations/# 70+ migrations — never edit existing, always add new
```

## Edge Functions (20)
cancel-subscription · check-license-expiry · create-checkout-session
create-job-deposit · create-payment-session · google-calendar-oauth
parse-invoice · pay-milestone · process-refund · release-escrow
send-email · send-sms · stripe-checkout · stripe-connect-account
stripe-connect-onboarding · stripe-webhook · sync-google-calendar
verify-abn · verify-license

## Commands
```bash
npm run dev                        # dev server
npm run build                      # production build
npx tsc --noEmit --skipLibCheck    # type check — run after every change
supabase functions serve           # local edge function test
supabase functions deploy <name>   # deploy single function
supabase gen types typescript      # regenerate DB types
supabase db push                   # apply migrations
```

## Hard Rules
- Never commit .env or expose API keys
- Stripe webhooks MUST validate signatures
- Never edit existing migrations — create new ones only
- No `any` — use types from src/types/supabase.ts
- All Supabase calls in try/catch with structured errors
- Supabase inserts: safe destructuring over `as` casts
- Tailwind only — no custom CSS

## UI Patterns
- Max-width: `max-w-5xl` (ultrawide 3440×1440)
- Tabs: `border-b-2 border-warm-500 text-warm-600` active / `border-transparent text-gray-400` inactive
- Buttons: `inline-flex px-5 py-2` — never `w-full` unless explicit
- Modals: use src/components/Modal.tsx
- Status badges: `px-3 py-1 rounded-full text-xs font-medium border`
- Job lifecycle: `pending → accepted → funded → in_progress → completed`

## Large Files — Read Fully Before Editing
- src/components/JobDetailsCard.tsx — 1413 lines
- src/components/ChatDrawer.tsx — 1054 lines
- src/pages/Settings.tsx — 1190 lines
- src/pages/TradieDashboard.tsx — 1088 lines
- src/pages/Jobs.tsx — 988 lines

## Workflow: Plan → Execute → Verify → Iterate
1. Plan — read relevant files, trace full path (UI → edge fn → DB), state plan before coding
2. Execute — types first → backend → frontend, minimal changes, follow existing patterns
3. Verify — run `npx tsc --noEmit --skipLibCheck`, fix all errors before moving on
4. Iterate — if screenshot provided, compare and fix immediately

## Business Context
- HIA-aligned milestone payment templates
- Client-side escrow release (homeowner triggers, not platform)
- AUD, Australian state licensing, ABN verification
- Competitors: hipages, Airtasker, Oneflare, ServiceSeeking

---

## ConnecTradie Design System — Always Follow These Rules

### Colours
- Primary action: teal/emerald — use Tailwind `emerald-500` (#10b981)
  for buttons, links, active states only
- Background: `gray-50` for page, `white` for cards
- Text: `gray-900` headings, `gray-600` body, `gray-400` placeholder/muted
- Borders: `gray-200` only — no heavy borders
- Status badges: use existing pill pattern only

### Layout & Spacing
- Page wrapper: `max-w-7xl mx-auto px-4 sm:px-6 lg:px-8`
- Cards: `bg-white rounded-xl shadow-sm p-6` — NOT full width unless
  it is a data table
- Card grids: `grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6`
- Stack spacing: `space-y-6` between sections
- NEVER use full-width cards for summary/info components —
  constrain with max-w-sm, max-w-md, or max-w-lg

### Typography
- Page title: `text-2xl font-bold text-gray-900`
- Section heading: `text-lg font-semibold text-gray-900`
- Body: `text-sm text-gray-600`
- Labels: `text-xs font-medium text-gray-500 uppercase tracking-wide`

### Buttons
- Primary: `bg-emerald-500 hover:bg-emerald-600 text-white px-4 py-2
  rounded-lg text-sm font-medium`
- Secondary: `border border-gray-200 text-gray-700 px-4 py-2
  rounded-lg text-sm font-medium hover:bg-gray-50`
- Destructive: `text-red-600 hover:text-red-700 text-sm font-medium`
- NEVER use full-width buttons unless inside a modal or mobile view

### Status Badges
- Use: `px-3 py-1 rounded-full text-xs font-medium`
- Active/success: `bg-emerald-100 text-emerald-700`
- Pending: `bg-amber-100 text-amber-700`
- Inactive/cancelled: `bg-gray-100 text-gray-600`
- Error: `bg-red-100 text-red-700`

### Empty States
- Icon (muted, medium size) + heading + subtext + ONE CTA button
- Container: `text-center py-12`
- Follow the pattern in TradieDashboard.tsx "No Active Jobs" empty state

### Cards — Size Rules
- Stats/summary cards: `max-w-xs` or `max-w-sm` — NEVER full width
- Info/alert cards: `max-w-md`
- Form cards: `max-w-lg`
- Content/list cards: full width is OK
- Usage bars/progress indicators: constrain to `max-w-sm`

### Modals
- Use existing ConfirmModal.tsx pattern
- Max width: `max-w-md`
- Always include: title, description, confirm button, cancel button

### Mobile
- All layouts must be responsive
- Stack to single column on mobile
- Touch targets minimum 44px height

### DO NOT
- Add heavy drop shadows (`shadow-lg` or above)
- Use colours outside the palette above
- Create full-width cards for summary information
- Add decorative borders or dividers unless they already exist nearby
- Use `text-base` or larger for body copy inside cards
- Invent new component patterns — reuse what exists in the codebase
- Modify sidebar or navigation styles
