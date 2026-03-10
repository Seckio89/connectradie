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
