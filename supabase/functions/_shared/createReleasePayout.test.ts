// Deno tests for createReleasePayout — the one way a release turns into a payout.
//
//   deno test --allow-env --allow-net --allow-read supabase/functions/_shared/createReleasePayout.test.ts
//
// The gap this closes: planReleasePayout and canFallBackToStandard were already
// tested as pure functions, but the orchestrator that CALLS them — the single
// primitive shared by release-escrow, auto-release-payments and the recurring
// bank-payout stage — had no coverage at all. Its pure inputs were verified and
// its behaviour was not.
//
// What matters here is the contract stated at the top of instantPayout.ts:
// instant is strictly an ENHANCEMENT, so a release must never fail because
// instant failed. Every test below is a way that promise could break — a lookup
// that throws, a rail that rejects, a platform outage — and the assertion is
// always the same: the tradie still gets paid, exactly once, for the full
// amount.
//
// The one exception is the ambiguous failure. A network error or timeout might
// mean Stripe DID create the instant payout, so falling back there would pay the
// tradie twice. That case must propagate, and the test asserts the second payout
// is never attempted.
//
// node:assert rather than jsr:@std/assert so this runs with no network access.
import { strictEqual as assertEquals, ok as assert } from "node:assert/strict";
import { createReleasePayout } from "./instantPayout.ts";

const TRADIE = "11111111-1111-1111-1111-111111111111";
const ACCOUNT = "acct_test_1";
const BASE_KEY = "release_payout_pay_1";

/** A $1000 release. Comfortably above the free tier's $20 instant floor. */
const AMOUNT = 100_000;

// Free tier: 150 bps, $2.00 minimum → fee $15.00, so instant requests $985.00.
const FREE_FEE = 1_500;
const FREE_NET = AMOUNT - FREE_FEE;

// ─────────────────────────────────────────────────────────────────────────────
// Fakes. Both dependencies are already injected as arguments, so nothing here
// needs to patch a module — the fakes just have to answer the same query chains
// the real collaborators use.
// ─────────────────────────────────────────────────────────────────────────────

type Row = Record<string, unknown> | null;
interface QueryResult {
  data: Row;
  error: null;
}

/** Only the slice of the PostgREST builder these code paths actually call. */
interface Builder {
  select(): Builder;
  eq(): Builder;
  neq(): Builder;
  in(): Builder;
  is(): Builder;
  not(): Builder;
  order(): Builder;
  limit(): Builder;
  gte(): Builder;
  lte(): Builder;
  update(): Builder;
  insert(): Builder;
  delete(): Builder;
  upsert(value: unknown): Promise<{ data: null; error: null }>;
  maybeSingle(): Promise<QueryResult>;
  single(): Promise<QueryResult>;
  then<T>(res: (v: QueryResult) => T, rej?: (e: unknown) => T): Promise<T>;
}

interface FakeSupabase {
  from(table: string): Builder;
}

interface FakeOpts {
  /** Row returned by maybeSingle() for a given table. */
  rows?: Record<string, Row>;
  /** Table whose maybeSingle() should reject, to simulate a lookup failure. */
  failOn?: string;
  /** Records every upsert so the platform-outage flag can be asserted. */
  upserts?: Array<{ table: string; value: unknown }>;
}

function fakeSupabase(opts: FakeOpts = {}): FakeSupabase {
  const { rows = {}, failOn, upserts } = opts;

  const build = (table: string): Builder => {
    const result = (): Promise<QueryResult> =>
      failOn === table
        ? Promise.reject(new Error(`lookup failed: ${table}`))
        : Promise.resolve({ data: rows[table] ?? null, error: null });

    const builder: Builder = {
      select: () => builder,
      eq: () => builder,
      neq: () => builder,
      in: () => builder,
      is: () => builder,
      not: () => builder,
      order: () => builder,
      limit: () => builder,
      gte: () => builder,
      lte: () => builder,
      update: () => builder,
      insert: () => builder,
      delete: () => builder,
      upsert: (value: unknown) => {
        upserts?.push({ table, value });
        return Promise.resolve({ data: null, error: null });
      },
      maybeSingle: result,
      single: result,
      // Awaitable mid-chain, the way a list query is.
      then: (res, rej) => result().then(res, rej),
    };
    return builder;
  };

  return { from: build };
}

interface PayoutParams {
  amount: number;
  currency?: string;
  method?: string;
  description?: string;
  metadata?: Record<string, string>;
}
interface PayoutOpts {
  stripeAccount: string;
  idempotencyKey: string;
}
interface StripeCall {
  params: PayoutParams;
  opts: PayoutOpts;
}
interface FakeStripe {
  calls: StripeCall[];
  payouts: { create(params: PayoutParams, opts: PayoutOpts): Promise<unknown> };
}

/**
 * `outcomes` is consulted per call: an Error is thrown, anything else resolves.
 * Undefined means "succeed with a generated payout".
 */
function fakeStripe(outcomes: Array<unknown> = []): FakeStripe {
  const calls: StripeCall[] = [];
  return {
    calls,
    payouts: {
      create: (params: PayoutParams, opts: PayoutOpts) => {
        calls.push({ params, opts });
        const outcome = outcomes[calls.length - 1];
        if (outcome instanceof Error) return Promise.reject(outcome);
        return Promise.resolve(outcome ?? { id: `po_${calls.length}` });
      },
    },
  };
}

/** A Stripe rejection carrying a deterministic code, the shape Stripe sends. */
function stripeError(code: string) {
  return Object.assign(new Error(`instant payout rejected: ${code}`), {
    raw: { code, message: `instant payout rejected: ${code}` },
  });
}

const release = (
  stripe: FakeStripe,
  supabase: FakeSupabase,
  amountCents = AMOUNT,
) =>
  createReleasePayout({
    stripe,
    supabase,
    tradieId: TRADIE,
    connectAccountId: ACCOUNT,
    amountCents,
    idempotencyKeyBase: BASE_KEY,
    metadata: { job_id: "job-1", payment_id: "pay-1" },
  });

const INSTANT = { tradie_details: { payout_speed_preference: "instant" } };

// ─────────────────────────────────────────────────────────────────────────────

Deno.test("no instant preference: the full amount goes out on the standard rail", async () => {
  const stripe = fakeStripe();
  const out = await release(
    stripe,
    fakeSupabase({ rows: { tradie_details: { payout_speed_preference: "standard" } } }),
  );

  assertEquals(stripe.calls.length, 1);
  assertEquals(stripe.calls[0].params.amount, AMOUNT, "a standard release must pay the whole amount");
  assertEquals(stripe.calls[0].params.method, undefined, "standard payouts must not set method");
  assertEquals(stripe.calls[0].opts.idempotencyKey, BASE_KEY, "standard uses the unsuffixed key");
  assertEquals(out.method, "standard");
  assertEquals(out.feeCents, 0, "a standard payout is free");
  assertEquals(out.instantFellBack, false);
});

Deno.test("an instant preference requests the amount NET of the fee", async () => {
  const stripe = fakeStripe();
  const out = await release(stripe, fakeSupabase({ rows: INSTANT }));

  assertEquals(stripe.calls.length, 1);
  assertEquals(
    stripe.calls[0].params.amount,
    FREE_NET,
    "Stripe takes the instant fee from the same balance, and rejects a payout " +
      "where amount + fee exceeds it — so the request must already be net",
  );
  assertEquals(stripe.calls[0].params.method, "instant");
  assertEquals(stripe.calls[0].opts.idempotencyKey, `${BASE_KEY}:instant`);
  assertEquals(stripe.calls[0].params.metadata?.instant_fee_cents, String(FREE_FEE));
  assertEquals(stripe.calls[0].params.metadata?.payout_speed, "instant");
  assertEquals(out.method, "instant");
  assertEquals(out.feeCents, FREE_FEE);
  assertEquals(out.instantFellBack, false);
});

Deno.test("a failed preference lookup still pays the tradie, on the standard rail", async () => {
  const stripe = fakeStripe();
  const out = await release(stripe, fakeSupabase({ failOn: "tradie_details" }));

  assertEquals(stripe.calls.length, 1);
  assertEquals(
    stripe.calls[0].params.amount,
    AMOUNT,
    "resolving a PREFERENCE must never cost the tradie their release",
  );
  assertEquals(stripe.calls[0].opts.idempotencyKey, BASE_KEY);
  assertEquals(out.method, "standard");
  assertEquals(out.instantFellBack, false);
});

Deno.test("a deterministic instant rejection falls back to the FULL standard payout", async () => {
  const stripe = fakeStripe([stripeError("instant_payouts_unsupported")]);
  const out = await release(stripe, fakeSupabase({ rows: INSTANT }));

  assertEquals(stripe.calls.length, 2, "the release must be retried on the standard rail");
  assertEquals(stripe.calls[0].params.amount, FREE_NET, "the instant attempt was net of the fee");
  assertEquals(
    stripe.calls[1].params.amount,
    AMOUNT,
    "the fallback pays the WHOLE amount — no instant fee was ever collected",
  );
  assertEquals(out.method, "standard");
  assertEquals(out.feeCents, 0, "a payout that fell back must not be billed an instant fee");
  assertEquals(out.instantFellBack, true);
});

Deno.test("the instant attempt and its fallback can never collide on one key", async () => {
  const stripe = fakeStripe([stripeError("instant_payouts_unsupported")]);
  await release(stripe, fakeSupabase({ rows: INSTANT }));

  const [instantKey, fallbackKey] = stripe.calls.map((c) => c.opts.idempotencyKey);
  assertEquals(instantKey, `${BASE_KEY}:instant`);
  assertEquals(fallbackKey, BASE_KEY);
  assert(
    instantKey !== fallbackKey,
    "Stripe rejects an idempotent replay whose parameters differ. Reusing one " +
      "key for a $985 instant attempt and a $1000 standard fallback would make " +
      "the fallback fail and strand the release",
  );
});

Deno.test("a platform-scope failure is recorded so nothing offers instant again", async () => {
  const upserts: Array<{ table: string; value: unknown }> = [];
  const stripe = fakeStripe([stripeError("instant_payouts_limit_exceeded")]);
  const out = await release(stripe, fakeSupabase({ rows: INSTANT, upserts }));

  const flag = upserts.find((u) => u.table === "app_settings");
  assert(flag, "a platform-wide outage must be written to app_settings");
  const value = (flag.value as { value: { available: boolean; code: string } }).value;
  assertEquals(value.available, false);
  assertEquals(value.code, "instant_payouts_limit_exceeded");

  // And the release itself still completes.
  assertEquals(out.method, "standard");
  assertEquals(out.instantFellBack, true);
});

Deno.test("an account-scope failure is NOT recorded as a platform outage", async () => {
  const upserts: Array<{ table: string; value: unknown }> = [];
  const stripe = fakeStripe([stripeError("instant_payouts_unsupported")]);
  await release(stripe, fakeSupabase({ rows: INSTANT, upserts }));

  assertEquals(
    upserts.filter((u) => u.table === "app_settings").length,
    0,
    "one tradie's unsupported debit card must not switch instant off for everyone",
  );
});

Deno.test("an ambiguous failure is never retried — that would pay the tradie twice", async () => {
  // No code, no invalid_request_error type: a timeout or dropped connection.
  // Stripe may or may not have created the payout.
  const stripe = fakeStripe([new Error("socket hang up")]);

  let threw = false;
  try {
    await release(stripe, fakeSupabase({ rows: INSTANT }));
  } catch {
    threw = true;
  }

  assert(threw, "an ambiguous instant failure must propagate, leaving the payment retryable");
  assertEquals(
    stripe.calls.length,
    1,
    "a second payout under a different key would pay the tradie TWICE if the " +
      "first one actually landed",
  );
});

Deno.test("a fresh platform-outage flag keeps the release on the standard rail", async () => {
  const stripe = fakeStripe();
  const out = await release(
    stripe,
    fakeSupabase({
      rows: {
        ...INSTANT,
        app_settings: { value: { available: false, checked_at: new Date().toISOString() } },
      },
    }),
  );

  assertEquals(stripe.calls.length, 1, "instant must not even be attempted while the platform is down");
  assertEquals(stripe.calls[0].params.amount, AMOUNT);
  assertEquals(stripe.calls[0].params.method, undefined);
  assertEquals(out.method, "standard");
  assertEquals(out.feeCents, 0);
});

Deno.test("a stale outage flag does not suppress instant forever", async () => {
  const stale = new Date(Date.now() - 13 * 60 * 60 * 1000).toISOString();
  const stripe = fakeStripe();
  const out = await release(
    stripe,
    fakeSupabase({
      rows: { ...INSTANT, app_settings: { value: { available: false, checked_at: stale } } },
    }),
  );

  assertEquals(
    out.method,
    "instant",
    "Stripe's limits reset daily — one bad day must not disable the feature until a deploy",
  );
});

Deno.test("the tradie's own tier config is what the release charges", async () => {
  const stripe = fakeStripe();
  const out = await release(
    stripe,
    fakeSupabase({
      rows: {
        ...INSTANT,
        tradie_subscriptions: { tier_id: "pro", status: "active", grace_until: null },
        pricing_tiers: { instant_payout_bps: 100, instant_payout_min_cents: 100 },
      },
    }),
  );

  // 100 bps of $1000 = $10.00, above the $1.00 minimum.
  assertEquals(out.feeCents, 1_000, "a pro tier must be charged its own rate, not the free-tier default");
  assertEquals(stripe.calls[0].params.amount, AMOUNT - 1_000);
});

Deno.test("a release below the instant floor stays standard and free", async () => {
  // Free tier minimum is $2.00, and the fee may never exceed a tenth of the
  // payout — so anything under $20.00 is not offered instant.
  const stripe = fakeStripe();
  const out = await release(stripe, fakeSupabase({ rows: INSTANT }), 1_500);

  assertEquals(stripe.calls[0].params.amount, 1_500);
  assertEquals(stripe.calls[0].params.method, undefined);
  assertEquals(out.method, "standard");
  assertEquals(out.feeCents, 0);
});
