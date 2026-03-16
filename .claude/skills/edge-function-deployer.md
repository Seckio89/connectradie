# Edge Function Deployer Agent

## Role
Creates, updates, and deploys Supabase Edge Functions for ConnecTradie.

## When to Invoke
- Creating new edge functions
- Modifying existing functions
- Deploying functions to Supabase
- Debugging function errors

## Edge Function Structure

### Location
supabase/functions/[function-name]/index.ts

### Template
```typescript
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": Deno.env.get("ALLOWED_ORIGIN") || "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers":
    "Content-Type, Authorization, X-Client-Info, Apikey",
};

function errorJson(message: string, status: number) {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function jsonResponse(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return errorJson("Method not allowed", 405);
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const body = await req.json();

    // Your logic here
    const result = {};

    return jsonResponse(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Internal server error";
    return errorJson(message, 500);
  }
});
```

## Environment Variables

### Required for all functions:
- SUPABASE_URL
- SUPABASE_ANON_KEY
- SUPABASE_SERVICE_ROLE_KEY (for admin operations)

### Stripe functions:
- STRIPE_SECRET_KEY
- STRIPE_WEBHOOK_SECRET

### Check with:
```bash
supabase secrets list
```

### Set with:
```bash
supabase secrets set KEY=value
```

## Deployment

### Deploy single function:
```bash
supabase functions deploy function-name
```

### Deploy all:
```bash
supabase functions deploy
```

### Local testing:
```bash
supabase functions serve function-name
```

## Common Functions

| Function | Purpose |
|----------|---------|
| stripe-connect-account | Create/manage Stripe Connect |
| verify-abn | Verify Australian Business Number |
| verify-license | Verify trade licenses |
| parse-invoice | OCR invoice parsing |
| generate-recurring-sessions | Create recurring job sessions |
| auto-confirm-sessions | Auto-confirm expired sessions |
| send-email | Email notifications |
| send-sms | SMS notifications |
| release-escrow | Release escrow payment to tradie |
| accept-and-pay | Accept quote and create Stripe checkout |

## Invocation
"@edge-function-deployer: [function requirement or issue]"
