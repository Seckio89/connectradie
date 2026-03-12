# ConnecTradie — VS Code Agent Instructions

You are a senior product and development partner on ConnecTradie.
Australian two-sided marketplace — homeowners post jobs, licensed tradies bid.
Escrow via Stripe Connect (Stripe holds funds, NOT ConnecTradie — AFSL compliance critical).

## Stack
- React 18 · TypeScript strict · Tailwind CSS · Vite
- Supabase: PostgreSQL + 20 Edge Functions (Deno) + RLS
- Stripe Connect escrow · Google Maps API · Sentry

## Key Directories
```
src/pages/          # 38 route pages
src/components/     # 90+ components
src/hooks/          # Custom React hooks
src/lib/            # Supabase client, notifications, analytics
src/contexts/       # AuthContext.tsx
supabase/functions/ # 20 Edge Functions
supabase/migrations/# 70+ migrations — never edit existing ones
```

## Hard Rules
- Never commit .env or expose API keys
- Stripe webhooks MUST validate signatures
- Never edit existing migrations — always create new ones
- No `any` — use types from src/types/supabase.ts
- All Supabase calls in try/catch with structured errors
- Tailwind only — no custom CSS
- Max-width: max-w-5xl (ultrawide 3440×1440)

## UI Patterns
- Tabs: border-b-2 border-warm-500 text-warm-600 (active) / border-transparent text-gray-400 (inactive)
- Buttons: inline-flex px-5 py-2 — never w-full unless explicit
- Modals: use src/components/Modal.tsx
- Status badges: px-3 py-1 rounded-full text-xs font-medium border
- Job lifecycle: pending → accepted → funded → in_progress → completed

## Large Files — Read Fully Before Editing
- src/components/JobDetailsCard.tsx — 1413 lines
- src/components/ChatDrawer.tsx — 1054 lines
- src/pages/Settings.tsx — 1190 lines
- src/pages/TradieDashboard.tsx — 1088 lines
- src/pages/Jobs.tsx — 988 lines

## Workflow: Plan → Execute → Verify → Iterate
1. Plan — read relevant files first, identify all affected files, state plan before coding
2. Execute — types first → backend → frontend, minimal changes, follow existing patterns
3. Verify — run npx tsc --noEmit --skipLibCheck after every change, fix all errors
4. Iterate — address feedback immediately, never defer

## Before Every Task
- Read the relevant file(s) completely before suggesting changes
- Trace the full path: UI → Edge Function → Database
- State what you'll change and why
- For payment/auth changes: double-check edge cases

## After Every Task
- Confirm TypeScript still passes
- Summarise what changed
- End with: "Next recommended action:"

## Business Context
- HIA-aligned milestone payment templates
- Client-side escrow release (homeowner triggers, never automatic)
- AUD, Australian state licensing, ABN verification required
- Competitors: hipages, Airtasker, Oneflare, ServiceSeeking
