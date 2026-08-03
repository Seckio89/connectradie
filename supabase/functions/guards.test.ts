// Guard-clause tests for the money and auth Edge Functions.
//
//   npx deno@2 test --allow-env --allow-net --allow-read supabase/functions/guards.test.ts
//
// Audit finding #1: the 74 function entry points had e2e coverage of the happy
// money path and nothing on their REFUSALS. e2e drives the flow that works; the
// branches that say no are exactly the ones it never reaches, and they are the
// ones that matter — a deleted auth check does not fail an e2e run, it passes
// it faster.
//
// These call the real exported handler with a fabricated Request and assert the
// real Response. No mocking, no source scanning.
//
// SCOPE, stated honestly: this covers the guards that fire BEFORE the function
// touches Postgres or Stripe — CORS preflight, method rejection, and the
// missing-credential refusal. Ownership (403) and state-machine (409) refusals
// need real rows to refuse against, which is what the e2e harnesses in
// scripts/e2e-*.mjs already do. What is checked here is the layer nothing else
// checks.
//
// Why this works at all: each handler is exported and only self-serves under
// `if (import.meta.main)`, so importing the module does not start a server.
// That pattern was proven against the deployed runtime before it was applied to
// any money function — health was converted, deployed, and probed first.

import { assert, assertEquals } from "jsr:@std/assert@1";

// Must be set BEFORE the modules load: stripe-webhook builds its Stripe and
// Supabase clients at module scope, so a static import would throw first.
// Values are deliberately fake — every assertion below is on a path that
// returns before any of them is used to reach the network.
Deno.env.set("SUPABASE_URL", "https://example.supabase.co");
Deno.env.set("SUPABASE_SERVICE_ROLE_KEY", "test-service-role-key");
Deno.env.set("STRIPE_SECRET_KEY", "sk_test_not_a_real_key");
Deno.env.set("STRIPE_WEBHOOK_SECRET", "whsec_not_a_real_secret");
Deno.env.set("ALLOWED_ORIGIN", "https://connectradie.com");

type Handler = (req: Request) => Promise<Response>;

async function load(fn: string): Promise<Handler> {
  const mod = await import(`./${fn}/index.ts`);
  assert(typeof mod.handler === "function", `${fn} does not export a handler`);
  return mod.handler as Handler;
}

const post = (body: unknown = {}, headers: Record<string, string> = {}) =>
  new Request("https://edge.test/fn", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify(body),
  });

/**
 * Every function that moves money or acts on a user's behalf.
 *
 * stripe-webhook is deliberately absent: it authenticates by signature, not by
 * a bearer token, and gets its own test below.
 */
const AUTHED = [
  "release-escrow",
  "process-refund",
  "accept-and-pay",
  "instant-payout",
  "pay-milestone",
  "approve-variation",
  "decline-variation",
  "pay-price-increase",
  "resolve-dispute-split",
  "create-payment-session",
];

for (const fn of AUTHED) {
  Deno.test(`${fn}: refuses a POST with no Authorization header`, async () => {
    const handler = await load(fn);
    const res = await handler(post({ jobId: "00000000-0000-0000-0000-000000000000" }));
    await res.body?.cancel();

    assertEquals(
      res.status,
      401,
      `${fn} let an unauthenticated POST through with ${res.status} — this is the ` +
        `check that stands between an anonymous caller and someone else's money`,
    );
  });

  Deno.test(`${fn}: refuses a non-POST method`, async () => {
    const handler = await load(fn);
    const res = await handler(new Request("https://edge.test/fn", { method: "GET" }));
    await res.body?.cancel();
    assertEquals(res.status, 405, `${fn} accepted a GET`);
  });

  Deno.test(`${fn}: answers the CORS preflight without a wildcard origin`, async () => {
    const handler = await load(fn);
    const res = await handler(new Request("https://edge.test/fn", { method: "OPTIONS" }));
    await res.body?.cancel();

    assertEquals(res.status, 200, `${fn} did not answer OPTIONS`);

    const origin = res.headers.get("Access-Control-Allow-Origin");
    assert(origin, `${fn} sent no Access-Control-Allow-Origin on the preflight`);
    assert(
      origin !== "*",
      `${fn} allows ANY origin — a wildcard here lets any site call it with a ` +
        `user's credentials`,
    );
  });
}

// ── stripe-webhook ──────────────────────────────────────────────────────────
// The one function with no user to authenticate. Its entire security model is
// that Stripe signed the payload, so the signature check IS the auth check.

Deno.test("stripe-webhook: refuses a payload with no stripe-signature header", async () => {
  const handler = await load("stripe-webhook");
  const res = await handler(post({ type: "payment_intent.succeeded", data: { object: {} } }));
  await res.body?.cancel();

  assertEquals(
    res.status,
    400,
    "an unsigned webhook was not rejected — anyone who knows the URL could " +
      "forge a payment_intent.succeeded and fund a job for free",
  );
});

Deno.test("stripe-webhook: refuses a forged signature", async () => {
  const handler = await load("stripe-webhook");
  const res = await handler(
    post({ type: "payment_intent.succeeded", data: { object: {} } }, {
      "stripe-signature": "t=1,v1=deadbeef",
    }),
  );
  await res.body?.cancel();

  assert(
    res.status >= 400,
    `a webhook with a junk signature returned ${res.status} — constructEvent ` +
      `must reject it`,
  );
});

Deno.test("stripe-webhook: refuses a non-POST method", async () => {
  const handler = await load("stripe-webhook");
  const res = await handler(new Request("https://edge.test/fn", { method: "GET" }));
  await res.body?.cancel();
  assertEquals(res.status, 405);
});
