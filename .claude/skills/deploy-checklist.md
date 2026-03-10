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
