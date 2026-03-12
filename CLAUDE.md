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
