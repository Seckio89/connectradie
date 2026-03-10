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
