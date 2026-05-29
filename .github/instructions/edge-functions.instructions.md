---
description: "Enforces security and coding standards when editing Supabase Edge Functions (Deno). Covers auth, CORS, error handling, Stripe validation, and input sanitisation."
applyTo: "supabase/functions/**"
---

# Edge Function Standards

Follow these rules when creating or editing any Supabase Edge Function.

## Auth

Every user-initiated endpoint MUST:
1. Extract Bearer token from `Authorization` header
2. Validate via `supabase.auth.getUser(token)`
3. Return 401 with `{ error: 'Unauthorized' }` if validation fails
4. Check user role when the endpoint is role-restricted

```typescript
const authHeader = req.headers.get('Authorization');
if (!authHeader?.startsWith('Bearer ')) {
  return new Response(JSON.stringify({ error: 'Unauthorized' }), {
    status: 401,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}
const token = authHeader.replace('Bearer ', '');
const { data: { user }, error: authError } = await supabase.auth.getUser(token);
if (authError || !user) {
  return new Response(JSON.stringify({ error: 'Unauthorized' }), {
    status: 401,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}
```

Exception: Stripe webhook endpoints validate via `stripe.webhooks.constructEventAsync` instead.

## CORS

Use this exact pattern at the top of every function:

```typescript
const corsHeaders = {
  'Access-Control-Allow-Origin': Deno.env.get('ALLOWED_ORIGIN') || 'https://connectradie.com.au',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Client-Info, Apikey',
};
```

- Handle OPTIONS preflight: `return new Response(null, { status: 200, headers: corsHeaders })`
- Reject non-POST methods: `return new Response('Method not allowed', { status: 405, headers: corsHeaders })`
- Include `corsHeaders` in ALL responses (including errors)
- NEVER use `'*'` for `Access-Control-Allow-Origin`

## Error Handling

- Wrap all Supabase and Stripe API calls in try/catch
- Return structured JSON errors: `{ error: string, details?: string }`
- Log errors with context: `console.error('FunctionName: description', error)`
- NEVER expose stack traces, internal IDs, or secrets in error responses
- Use specific HTTP status codes: 400 (bad input), 401 (unauthed), 403 (forbidden), 404 (not found), 500 (internal)

```typescript
try {
  // operation
} catch (error) {
  console.error('FunctionName: operation failed', error);
  return new Response(
    JSON.stringify({ error: 'Operation failed' }),
    { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
  );
}
```

## Input Validation

- Validate all request body fields before use
- Check required fields exist and have correct types
- Validate UUIDs match the expected format
- NEVER trust client-supplied amounts for payments — compute server-side
- NEVER use string interpolation in SQL — use parameterised queries or `.rpc()`

## Stripe

- Webhook handlers MUST validate signatures — never skip `constructEventAsync`
- Include idempotency keys on transfer and refund calls
- All amounts in AUD (currency: `'aud'`)
- Use `_shared/pricing.ts` for fee calculations — never hardcode
- Stripe metadata must include `job_id`, `user_id`, `payment_type`

## Supabase Client

- Create with `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` (server-side only)
- NEVER return or log the service role key
- Use `.select('column1, column2')` — avoid `select('*')` when possible
- Always check `.error` on Supabase responses before using `.data`

## TypeScript

- No `any` type — use types from `src/types/supabase.ts` or define inline interfaces
- Use `Deno.env.get()` for environment variables with `!` assertion only for required vars
- Import Stripe and Supabase from npm specifiers: `npm:stripe@14.21.0`, `npm:@supabase/supabase-js@2.49.1`
