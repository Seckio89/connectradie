// ─────────────────────────────────────────────────────────────────────────────
// Instant-payout quote: how much of the Connect balance can be sent instantly,
// what the instant fee is, and whether it should be offered at all.
//
// Split out of instant-payout/index.ts so the arithmetic can be tested. It had
// no coverage, and it was offering deals like "$3.50 available, $2.00 fee, you
// receive $1.50" — a 57% effective rate — because eligibility only asked
// whether the net was above zero.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * The instant fee may never exceed 1/MAX_FEE_SHARE_DIVISOR of the payout.
 * With the standard $2 minimum fee this puts the floor at $20.
 *
 * The percentage fee can't breach this on its own (1.5% ≪ 10%); the flat
 * minimum can, and on small balances it dominates completely.
 */
export const MAX_FEE_SHARE_DIVISOR = 10;

export interface InstantPayoutInput {
  /** Cleared AUD balance in the tradie's Connect account. */
  availableCents: number;
  /** Still settling inside Stripe — not payable yet, but explains "no funds". */
  pendingCents: number;
  /** Client money in the balance that is still held in escrow. */
  escrowReserveCents: number;
  feeBps: number;
  feeMinCents: number;
  /** Whether an instant-capable external account is attached. */
  instantCapable: boolean;
}

export type InstantPayoutReason =
  | "no_instant_method"
  | "escrow_held"
  | "funds_pending"
  | "no_funds"
  | "below_minimum"
  | "below_fee";

export interface InstantPayoutQuote {
  /** Cleared funds that are genuinely the tradie's, i.e. available less escrow. */
  payoutBaseCents: number;
  feeCents: number;
  netCents: number;
  /** Smallest base we will offer an instant payout on. */
  minBaseCents: number;
  eligible: boolean;
  reason: InstantPayoutReason | null;
}

export function computeInstantPayout(input: InstantPayoutInput): InstantPayoutQuote {
  const { availableCents, pendingCents, escrowReserveCents, feeBps, feeMinCents, instantCapable } = input;

  const payoutBaseCents = Math.max(0, availableCents - escrowReserveCents);
  const feeCents = payoutBaseCents > 0
    ? Math.max(feeMinCents, Math.round((payoutBaseCents * feeBps) / 10000))
    : 0;
  const netCents = Math.max(0, payoutBaseCents - feeCents);
  const minBaseCents = feeMinCents * MAX_FEE_SHARE_DIVISOR;

  let reason: InstantPayoutReason | null = null;
  if (!instantCapable) {
    reason = "no_instant_method";
  } else if (payoutBaseCents <= 0) {
    // Distinguish "held in escrow" from "no money": telling a tradie who can
    // see a funded job that they have "no available funds" reads as a bug.
    if (escrowReserveCents > 0) reason = "escrow_held";
    else if (pendingCents > 0) reason = "funds_pending";
    else reason = "no_funds";
  } else if (payoutBaseCents < minBaseCents) {
    reason = "below_minimum";
  } else if (netCents <= 0) {
    // Only reachable if a tier is configured with no minimum fee at all.
    reason = "below_fee";
  }

  return { payoutBaseCents, feeCents, netCents, minBaseCents, eligible: reason === null, reason };
}

// ─────────────────────────────────────────────────────────────────────────────
// Stripe instant-payout failures
//
// A tradie hit this in production:
//
//   "You have exceeded your daily volume limit of $0.00 aud for Instant Payouts
//    across your connected accounts. Please contact us at
//    https://support.stripe.com/contact/email for assistance."
//
// The $0.00 is the tell — the PLATFORM has no AUD instant-payout allowance.
// That limit is a Stripe entitlement across all connected accounts, there is no
// API to read it, and no tradie can do anything about it. Showing them Stripe's
// message sends them to Stripe support for a problem that is ours.
// ─────────────────────────────────────────────────────────────────────────────

export type InstantFailureScope = "platform" | "account" | "unknown";

/**
 * Which instant-payout failures are platform-wide (nobody can use the feature)
 * versus specific to this tradie's payout method.
 */
export function classifyInstantFailure(code: string | null | undefined): InstantFailureScope {
  switch (code) {
    // Volume or count limit across all our connected accounts.
    case "instant_payouts_limit_exceeded":
    case "instant_payouts_config_disabled":
    case "instant_payouts_currency_disabled":
      return "platform";
    // This particular card/bank can't receive an instant payout.
    case "instant_payouts_unsupported":
      return "account";
    default:
      return "unknown";
  }
}

/**
 * Our own words for a failed instant payout. Never Stripe's: the disclosed net
 * was never charged, the money is still on its way on the free schedule, and
 * the tradie must not be pointed at Stripe support for a platform entitlement.
 */
export function instantFailureMessage(scope: InstantFailureScope): string {
  if (scope === "platform") {
    return "Instant payouts aren't available on ConnecTradie right now. Nothing has been charged — " +
      "your balance is still on its way to your bank on the standard schedule, free of charge.";
  }
  if (scope === "account") {
    return "This payout account can't receive instant payouts. Add an instant-eligible debit card or " +
      "bank account in Bank Settings — nothing has been charged.";
  }
  return "Could not send the instant payout. Nothing has been charged and your balance is unaffected.";
}

/** How long a known platform failure suppresses the offer before we re-probe. */
export const INSTANT_UNAVAILABLE_TTL_MS = 12 * 60 * 60 * 1000;

/**
 * Stripe's daily limits reset each day, and the limit may be raised at any time,
 * so a recorded failure has to expire — otherwise the feature stays switched off
 * forever after one bad day and needs a deploy to come back.
 */
export function isUnavailableFlagFresh(checkedAt: unknown, nowMs: number): boolean {
  if (typeof checkedAt !== "string") return false;
  const ts = Date.parse(checkedAt);
  if (!Number.isFinite(ts)) return false;
  return nowMs - ts < INSTANT_UNAVAILABLE_TTL_MS;
}

// ─────────────────────────────────────────────────────────────────────────────
// Honouring tradie_details.payout_speed_preference on release
//
// THE CONSTRAINT: release-escrow and auto-release-payments create the SAME
// payout under the SAME deterministic idempotency key (`release_payout_<id>`),
// because a homeowner approving while the cron runs is a real race. Stripe
// rejects an idempotent replay whose parameters differ, so the two callers must
// never disagree about whether a payout is instant or how much it is for.
//
// That is why this is a PURE function of the preference, the amount and the tier
// config — never of the live Stripe balance, which differs between the two
// moments. Everything here is deterministic and both callers reach the same
// answer.
// ─────────────────────────────────────────────────────────────────────────────

export interface ReleasePayoutPlanInput {
  /** tradie_details.payout_speed_preference. Anything but "instant" → standard. */
  preference: string | null | undefined;
  /** What a standard payout for this release would be, in cents. */
  amountCents: number;
  feeBps: number;
  feeMinCents: number;
  /** A known-fresh platform failure (see the app_settings flag). */
  platformInstantDown: boolean;
}

export interface ReleasePayoutPlan {
  method: "standard" | "instant";
  /** The amount to REQUEST. Reduced by the fee when instant — Stripe takes the
   *  fee from the balance and rejects a payout where amount + fee exceeds it. */
  payoutCents: number;
  feeCents: number;
  /** Appended to the idempotency key so an instant attempt and a standard
   *  fallback can never collide on one key. */
  idempotencySuffix: string;
  /** Why instant was declined, for logging. null when instant is planned. */
  declineReason: "not_requested" | "platform_down" | "below_minimum" | "fee_exceeds_amount" | null;
}

function standardPlan(amountCents: number, declineReason: ReleasePayoutPlan["declineReason"]): ReleasePayoutPlan {
  return { method: "standard", payoutCents: amountCents, feeCents: 0, idempotencySuffix: "", declineReason };
}

export function planReleasePayout(input: ReleasePayoutPlanInput): ReleasePayoutPlan {
  const { preference, amountCents, feeBps, feeMinCents, platformInstantDown } = input;

  // "ask" means "ask me per payout" — that IS the button on the Payouts page.
  // An unattended release has nobody to ask, so it stays standard and free.
  if (preference !== "instant") return standardPlan(amountCents, "not_requested");
  if (platformInstantDown) return standardPlan(amountCents, "platform_down");

  const minBaseCents = feeMinCents * MAX_FEE_SHARE_DIVISOR;
  if (amountCents < minBaseCents) return standardPlan(amountCents, "below_minimum");

  const feeCents = Math.max(feeMinCents, Math.round((amountCents * feeBps) / 10000));
  const payoutCents = amountCents - feeCents;
  if (payoutCents <= 0) return standardPlan(amountCents, "fee_exceeds_amount");

  return { method: "instant", payoutCents, feeCents, idempotencySuffix: ":instant", declineReason: null };
}

/**
 * Whether a failed instant payout may be retried as a standard one.
 *
 * ONLY for deterministic rejections. A network error or timeout might mean the
 * instant payout actually succeeded, and retrying under a different idempotency
 * key would pay the tradie twice — so those must leave the payment retryable
 * instead, exactly as the release paths already handle a failed payout.
 */
export function canFallBackToStandard(err: unknown): boolean {
  const e = err as { type?: string; code?: string; raw?: { type?: string; code?: string } } | null;
  const code = e?.raw?.code ?? e?.code ?? null;
  const type = e?.raw?.type ?? e?.type ?? null;
  if (code && classifyInstantFailure(code) !== "unknown") return true;
  // Stripe rejected the request outright — it never created a payout.
  return type === "invalid_request_error";
}

/**
 * The tradie's instant fee config, from the tier they are actually charged on.
 * Shared so a release path and the instant-payout button can never quote
 * different rates for the same tradie.
 */
// deno-lint-ignore no-explicit-any
type SupabaseLike = any;

export async function resolveInstantFeeConfig(
  supabase: SupabaseLike,
  tradieId: string,
): Promise<{ feeBps: number; feeMinCents: number }> {
  try {
    const { data: sub } = await supabase
      .from("tradie_subscriptions")
      .select("tier_id, status, grace_until")
      .eq("profile_id", tradieId)
      .neq("status", "canceled")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    let tierId = "free";
    if (sub && (sub.tier_id === "pro" || sub.tier_id === "pm")) {
      if (sub.status === "active") tierId = sub.tier_id;
      else if (sub.status === "past_due" && sub.grace_until && new Date(sub.grace_until) > new Date()) {
        tierId = sub.tier_id;
      }
    }

    const { data: tier } = await supabase
      .from("pricing_tiers")
      .select("instant_payout_bps, instant_payout_min_cents")
      .eq("id", tierId)
      .maybeSingle();

    return {
      feeBps: tier?.instant_payout_bps ?? 150,
      feeMinCents: tier?.instant_payout_min_cents ?? 200,
    };
  } catch {
    return { feeBps: 150, feeMinCents: 200 };
  }
}

/** app_settings key recording whether the platform can do instant payouts. */
export const INSTANT_STATUS_KEY = "instant_payouts_status";

/** Records a platform-wide instant-payout failure so nothing offers it again
 *  until the record goes stale. Never throws — this is bookkeeping on an error
 *  path and must not mask the original failure. */
export async function recordPlatformInstantFailure(
  supabase: SupabaseLike,
  code: string | null,
  detail: string | null,
): Promise<void> {
  try {
    await supabase.from("app_settings").upsert(
      {
        key: INSTANT_STATUS_KEY,
        value: { available: false, code, detail, checked_at: new Date().toISOString() },
      },
      { onConflict: "key" },
    );
  } catch (e) {
    console.error("Could not record instant payout status:", e);
  }
}

/** Reads the platform flag. Any doubt resolves to "not down" — a release must
 *  never be blocked by this lookup; the worst case is one failed instant
 *  attempt that falls back to standard. */
export async function isPlatformInstantDown(supabase: SupabaseLike, nowMs: number): Promise<boolean> {
  try {
    const { data } = await supabase
      .from("app_settings")
      .select("value")
      .eq("key", INSTANT_STATUS_KEY)
      .maybeSingle();
    const value = (data?.value ?? null) as { available?: boolean; checked_at?: string } | null;
    return value?.available === false && isUnavailableFlagFresh(value?.checked_at, nowMs);
  } catch {
    return false;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// createReleasePayout — the one way a release turns into a payout.
//
// Shared by release-escrow and auto-release-payments so the two racing callers
// behave identically (see the idempotency note on planReleasePayout), and by
// the recurring bank-payout stage.
//
// Instant is strictly an ENHANCEMENT. A release must never fail because instant
// failed: any deterministic rejection falls straight back to a standard payout
// for the full amount. The tradie always gets paid.
// ─────────────────────────────────────────────────────────────────────────────

export interface CreateReleasePayoutArgs {
  // deno-lint-ignore no-explicit-any
  stripe: any;
  supabase: SupabaseLike;
  tradieId: string;
  connectAccountId: string;
  /** What a standard payout for this release would be, in cents. */
  amountCents: number;
  currency?: string;
  metadata?: Record<string, string>;
  /** Suffixed for the instant attempt so it can't collide with the fallback. */
  idempotencyKeyBase: string;
  description?: string;
}

export interface ReleasePayoutOutcome {
  // deno-lint-ignore no-explicit-any
  payout: any;
  method: "standard" | "instant";
  /** The instant fee Stripe collects. 0 for standard payouts. */
  feeCents: number;
  /** Set when instant was attempted and rejected — the payout is standard. */
  instantFellBack: boolean;
}

export async function createReleasePayout(args: CreateReleasePayoutArgs): Promise<ReleasePayoutOutcome> {
  const {
    stripe, supabase, tradieId, connectAccountId, amountCents,
    currency = "aud", metadata = {}, idempotencyKeyBase, description,
  } = args;

  const createStandard = async () => {
    const payout = await stripe.payouts.create(
      { amount: amountCents, currency, ...(description ? { description } : {}), metadata },
      { stripeAccount: connectAccountId, idempotencyKey: idempotencyKeyBase },
    );
    return { payout, method: "standard" as const, feeCents: 0, instantFellBack: false };
  };

  // Resolving the preference must never block a release. Any failure here means
  // a standard payout — the free, always-available path.
  let plan: ReleasePayoutPlan;
  try {
    const [{ data: details }, feeConfig, platformInstantDown] = await Promise.all([
      supabase.from("tradie_details").select("payout_speed_preference").eq("profile_id", tradieId).maybeSingle(),
      resolveInstantFeeConfig(supabase, tradieId),
      isPlatformInstantDown(supabase, Date.now()),
    ]);
    plan = planReleasePayout({
      preference: details?.payout_speed_preference ?? null,
      amountCents,
      feeBps: feeConfig.feeBps,
      feeMinCents: feeConfig.feeMinCents,
      platformInstantDown,
    });
  } catch (e) {
    console.warn("Could not resolve payout speed preference — defaulting to standard:", e);
    return await createStandard();
  }

  if (plan.method === "standard") return await createStandard();

  try {
    const payout = await stripe.payouts.create(
      {
        amount: plan.payoutCents,
        currency,
        method: "instant",
        ...(description ? { description } : {}),
        metadata: { ...metadata, instant_fee_cents: String(plan.feeCents), payout_speed: "instant" },
      },
      {
        stripeAccount: connectAccountId,
        idempotencyKey: `${idempotencyKeyBase}${plan.idempotencySuffix}`,
      },
    );
    return { payout, method: "instant", feeCents: plan.feeCents, instantFellBack: false };
  } catch (err) {
    const code = (err as { raw?: { code?: string }; code?: string })?.raw?.code ??
      (err as { code?: string })?.code ?? null;

    // Might have succeeded (network/timeout) — a second payout under the plain
    // key would pay the tradie TWICE. Surface it and let the caller keep the
    // payment retryable, exactly as it already does for a failed payout.
    if (!canFallBackToStandard(err)) throw err;

    console.warn(`Instant release payout rejected (${code}) — falling back to standard.`);
    if (classifyInstantFailure(code) === "platform") {
      await recordPlatformInstantFailure(
        supabase,
        code,
        (err as { raw?: { message?: string } })?.raw?.message ?? null,
      );
    }
    const fallback = await createStandard();
    return { ...fallback, instantFellBack: true };
  }
}
