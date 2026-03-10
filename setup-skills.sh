#!/bin/bash
# ConnecTradie Agent Skills Installer
# Run from your project root: bash setup-skills.sh

mkdir -p .claude/skills

cat > .claude/skills/task-router.md << 'SKILL'
---
name: task-router
description: Routes ConnecTradie dev tasks to the correct domain. Matches keywords like database, payment, component, test, deploy and breaks multi-domain tasks into ordered subtasks.
---

# Task Router — ConnecTradie

Route tasks by keyword:
- Supabase/DB: edge function, database, migration, RLS, table, schema, policy
- Stripe: payment, escrow, invoice, subscription, webhook, checkout, connect
- Frontend: component, page, form, UI, layout, tailwind, react
- Testing: test, bug, error, debug, fix, broken, failing
- DevOps: deploy, build, CI/CD, environment, production, staging

Priority order for multi-domain tasks:
1. Bugs/safety → 2. Database → 3. Payments → 4. UI → 5. Deploy

Context: React 18 + TypeScript + Tailwind + Supabase + Stripe. Two-sided marketplace for Australian homeowners and tradespeople. 19 Edge Functions. Escrow payments via Stripe Connect.
SKILL

cat > .claude/skills/edge-function-deployer.md << 'SKILL'
---
name: edge-function-deployer
description: Deploy ConnecTradie's 19 Supabase Edge Functions. Covers Deno.serve() pattern, CORS, TypeScript types, deploy commands, and troubleshooting.
---

# Edge Function Deployer

## Conventions
- All in supabase/functions/, each has index.ts + types.ts + _shared/ imports
- Use Deno.serve() (not old serve() export)
- Always include CORS headers, return typed JSON responses

## Template
```typescript
import { corsHeaders } from '../_shared/cors.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  try {
    const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
    const body = await req.json()
    return new Response(JSON.stringify({ data: result }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200
    })
  } catch (error) {
    return new Response(JSON.stringify({ error: (error as Error).message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400
    })
  }
})
```

## Functions (19)
Payments: create-payment-intent, process-escrow, release-escrow, refund-payment
Stripe: create-connect-account, stripe-webhook, create-subscription
Comms: send-notification, send-email, send-sms
Verification: verify-license, verify-abn, verify-identity
Jobs: match-tradies, calculate-quote, job-notifications
Admin: generate-report, sync-analytics, cleanup-expired

## Deploy: supabase functions deploy <name> --project-ref <ref>
## Common fixes: CORS → check OPTIONS handler, Types → use Tables<'name'>['Insert'], Auth → SERVICE_ROLE_KEY for admin ops
SKILL

cat > .claude/skills/escrow-flow.md << 'SKILL'
---
name: escrow-flow
description: ConnecTradie's escrow payment flow using Stripe Connect with manual capture. Covers hold, release, refund, disputes, and the payments database schema.
---

# Escrow Flow

## Lifecycle
Homeowner pays → Funds held (manual capture) → Tradie completes → Homeowner approves → Released to Connect account

## Status: pending → held → released → completed (or disputed/refunded/expired)

## PaymentIntent Config
- capture_method: 'manual'
- currency: 'aud'
- transfer_data.destination: tradie Connect account
- application_fee_amount: 10% platform fee
- metadata: job_id, homeowner_id, tradie_id

## Release: stripe.paymentIntents.capture(id) → update DB → notify tradie
## Refund: stripe.refunds.create({ payment_intent: id }) → update DB

## Webhooks: payment_intent.succeeded → held, payment_failed → notify, canceled → refunded, charge.dispute.created → flag

## Edge cases: 48hr dispute window, 7-day auto-refund for no-show, queue if Connect not ready
SKILL

cat > .claude/skills/component-builder.md << 'SKILL'
---
name: component-builder
description: Build React 18 + TypeScript + Tailwind components for ConnecTradie. Design system colors, component patterns, file structure, and accessibility requirements.
---

# Component Builder

## Colors
Primary: blue-600, Secondary: green-600, Warning: amber-500, Error: red-600, Bg: slate-50, Text: slate-900

## Structure
ui/ → Button, Card, Input, Badge, Modal, Skeleton
forms/ → JobPostForm, QuoteForm, ProfileEditForm, ReviewForm
layout/ → Header, Footer, Sidebar, PageWrapper
features/ → JobCard, TradieProfile, QuoteList, EscrowStatus, VerificationBadge

## Every component needs: loading (skeleton), error (message + retry), empty (icon + CTA), success states
## Mobile-first, all Tailwind utilities, TypeScript interfaces for props
## Accessibility: focus rings, labels, alt text, keyboard nav
SKILL

cat > .claude/skills/test-writer.md << 'SKILL'
---
name: test-writer
description: Write tests for ConnecTradie with Vitest + React Testing Library. Covers components, hooks, Edge Functions, RLS policies, and payment flows.
---

# Test Writer

## Stack: Vitest + React Testing Library, vi.mock() for Supabase, MSW for APIs
## Files: ComponentName.test.tsx (same dir), function-name.test.ts in __tests__/

## Priority targets:
1. Payment flows (90%+ coverage): create intent, hold, release, refund, webhooks
2. Auth (85%+): login, signup, reset, sessions, role redirects
3. Job lifecycle (80%+): post, quote, accept, complete, review
4. RLS policies: verify role access, deny cross-user, no data leaks

## Pattern: describe/it, mock supabase, test all states, fireEvent for interactions, waitFor for async
SKILL

cat > .claude/skills/deploy-checklist.md << 'SKILL'
---
name: deploy-checklist
description: ConnecTradie deployment checklist. Pre-deploy verification, deploy order, env vars, and rollback procedures.
---

# Deploy Checklist

## Pre-deploy: tsc --noEmit, eslint, vitest run, payment tests pass, env vars set, migrations applied, RLS active

## Env vars needed:
Supabase: SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY
Stripe: STRIPE_SECRET_KEY, STRIPE_PUBLISHABLE_KEY, STRIPE_WEBHOOK_SECRET
Comms: RESEND_API_KEY, TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN

## Deploy order: 1. DB migrations → 2. Edge Functions → 3. Frontend → 4. Smoke tests
## Smoke tests: signup, login, post job, submit quote, process payment, notifications
## Rollback: git revert + redeploy, or checkout previous function version
SKILL

cat > .claude/skills/rls-policy-writer.md << 'SKILL'
---
name: rls-policy-writer
description: Row Level Security policies for ConnecTradie. Multi-role access control for homeowner, tradie, and admin across all tables.
---

# RLS Policies

## Roles: homeowner (posts jobs, pays), tradie (quotes, gets paid), admin (full access)
## Naming: [table]_[role]_[action]

## Rules:
- jobs: homeowners see own, tradies see open jobs matching their trades
- quotes: tradies see own, homeowners see quotes on their jobs
- payments: own role only, service role for insert/update
- profiles: self read/edit, public can see tradie profiles
- reviews: public read, homeowners create on completed jobs

## Admin: EXISTS check on profiles.role = 'admin' for full access
## Always test: correct role succeeds, wrong role denied, no cross-user leaks
SKILL

echo ""
echo "✅ ConnecTradie skills installed!"
echo ""
echo "Created 7 skills in .claude/skills/:"
ls -1 .claude/skills/
echo ""
echo "Next: git add .claude/skills/ && git commit -m 'Add Claude agent skills'"
