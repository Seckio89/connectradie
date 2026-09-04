// ─────────────────────────────────────────────────────────────────────────────
// verify-abn — automatic ABN check against the Australian Business Register.
//
//   1. Normalise (11 digits) and validate the mod-89 checksum locally. Nothing
//      leaves this function for an ABN that cannot be real.
//   2. Ask the ABR JSON lookup (AbnDetails) with ABR_GUID, 5-second timeout.
//   3. Compare the name the tradie claimed with the entity name and every
//      registered business name (case-, punctuation- and Pty-Ltd-insensitive).
//   4. verified = Active AND name match · review = Active, no match · failed =
//      Cancelled or not found.
//   5. Upsert business_verifications (one row per user). A trigger mirrors the
//      outcome onto profiles.abn_verified, which the quote gate reads.
//
// Auth: the caller's own profile, or an admin passing user_id. Rate limit
// 5 / user / hour. Idempotent: re-running updates the same row.
//
// Fails CLOSED when the register cannot be reached: no ABR_GUID, timeout or a
// non-200 all return 503 and write nothing. The previous version marked the ABN
// verified on checksum alone in that case, which is not a verification.
// ─────────────────────────────────────────────────────────────────────────────

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { checkRateLimit } from "../_shared/rateLimiter.ts";
import type { Insert } from "../_shared/dbTypes.ts";
import {
  businessNameMatches,
  classifyAbnResult,
  isValidAbnChecksum,
  normaliseAbn,
} from "../_shared/abnVerification.ts";
import {
  corsFor,
  jsonResponder,
  readServiceEnv,
  resolveCaller,
  serviceClient,
  UUID_RE,
} from "../_shared/verificationHttp.ts";

const ABR_TIMEOUT_MS = 5_000;
const RATE_LIMIT_PER_HOUR = 5;

export interface AbrDetails {
  Abn: string;
  AbnStatus: string;              // 'Active' | 'Cancelled'
  AbnStatusEffectiveFrom: string;
  EntityName: string;
  EntityTypeCode: string;
  EntityTypeName: string;
  BusinessName: string[];
  Gst: string;                    // effective-from date, or '' when not registered
  AddressState: string;
  AddressPostcode: string;
  Message: string;                // non-empty when not found / error
}

export type AbrLookup = (abn: string) => Promise<{ kind: "found"; details: AbrDetails } | { kind: "not_found" } | { kind: "unavailable"; reason: string }>;

/**
 * ABR "JSON" endpoint. It answers JSONP — `callback({...})` — so the wrapper is
 * stripped before parsing. Endpoint per abr.business.gov.au/json documentation.
 */
export function abrJsonLookup(guid: string, fetchImpl: typeof fetch = fetch): AbrLookup {
  return async (abn) => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), ABR_TIMEOUT_MS);
    try {
      const url = `https://abr.business.gov.au/json/AbnDetails.aspx?abn=${abn}&callback=abrCallback&guid=${encodeURIComponent(guid)}`;
      const res = await fetchImpl(url, { headers: { Accept: "text/plain" }, signal: controller.signal });
      if (!res.ok) return { kind: "unavailable", reason: `ABR returned ${res.status}` };
      const text = await res.text();
      const jsonStr = text.trim().replace(/^abrCallback\(/, "").replace(/\)\s*;?$/, "");
      const details = JSON.parse(jsonStr) as AbrDetails;
      if (details.Message && details.Message.length > 0) {
        // ABR uses Message for both "no record" and "invalid GUID". Only the
        // former is a verification outcome; the latter is our misconfiguration.
        if (/guid|not authori|access denied/i.test(details.Message)) {
          return { kind: "unavailable", reason: details.Message };
        }
        return { kind: "not_found" };
      }
      if (!details.Abn) return { kind: "not_found" };
      return { kind: "found", details };
    } catch (err) {
      const reason = err instanceof Error && err.name === "AbortError" ? "ABR timed out" : "ABR unreachable";
      return { kind: "unavailable", reason };
    } finally {
      clearTimeout(timer);
    }
  };
}

interface Deps {
  lookup?: AbrLookup;
}

export function makeHandler(deps: Deps = {}) {
  return async (req: Request): Promise<Response> => {
    const cors = corsFor(req);
    const json = jsonResponder(cors);

    if (req.method === "OPTIONS") return new Response(null, { status: 200, headers: cors });
    if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

    const env = readServiceEnv();
    if (!env) {
      console.error("verify-abn: missing SUPABASE_URL / SERVICE_ROLE_KEY");
      return json({ error: "Server configuration error" }, 500);
    }
    const admin = serviceClient(env);

    const caller = await resolveCaller(req.headers.get("Authorization"), admin);
    if (!caller) return json({ error: "Unauthorized" }, 401);

    let body: Record<string, unknown>;
    try {
      body = await req.json();
    } catch {
      return json({ error: "Invalid JSON body" }, 400);
    }

    // Whose ABN? Own by default; an admin may re-check another tradie.
    let targetUserId = caller.id;
    if (typeof body.user_id === "string" && body.user_id !== caller.id) {
      if (!caller.isAdmin) return json({ error: "Forbidden" }, 403);
      if (!UUID_RE.test(body.user_id)) return json({ error: "user_id must be a uuid" }, 400);
      targetUserId = body.user_id;
    }

    const { allowed } = await checkRateLimit(`${caller.id}-verify-abn`, RATE_LIMIT_PER_HOUR, 60 * 60 * 1000);
    if (!allowed) {
      return json({ error: "You've checked an ABN 5 times this hour. Wait a bit and try again." }, 429);
    }

    const abn = normaliseAbn(typeof body.abn === "string" ? body.abn : "");
    if (abn.length !== 11) return json({ error: "An ABN is 11 digits." }, 400);
    if (!isValidAbnChecksum(abn)) return json({ error: "That isn't a valid ABN — check the digits and try again." }, 400);

    // Claimed name: what was sent, else the business name on file, else the
    // profile name (sole traders often register under their own name).
    let claimed = typeof body.claimed_business_name === "string" ? body.claimed_business_name.trim() : "";
    if (!claimed) {
      const { data: td } = await admin.from("tradie_details").select("business_name").eq("profile_id", targetUserId).maybeSingle();
      claimed = td?.business_name?.trim() || "";
    }
    if (!claimed) {
      const { data: p } = await admin.from("profiles").select("full_name").eq("id", targetUserId).maybeSingle();
      claimed = p?.full_name?.trim() || "";
    }
    if (!claimed) return json({ error: "Enter your business name so it can be matched against the register." }, 400);
    claimed = claimed.slice(0, 200);

    const guid = Deno.env.get("ABR_GUID");
    const lookup = deps.lookup ?? (guid ? abrJsonLookup(guid) : null);
    if (!lookup) {
      console.error("verify-abn: ABR_GUID is not set");
      return json({ error: "ABN lookup isn't configured yet. Try again later or contact support." }, 503);
    }

    const result = await lookup(abn);
    if (result.kind === "unavailable") {
      console.error("verify-abn: ABR unavailable:", result.reason);
      return json({ error: "The ABN register didn't answer in time. Try again in a minute." }, 503);
    }

    const details = result.kind === "found" ? result.details : null;
    const businessNames = details?.BusinessName?.filter((n) => typeof n === "string" && n.trim()) ?? [];
    const entityName = details?.EntityName?.trim() || null;
    const abnStatus = details ? (details.AbnStatus || "Unknown") : "NotFound";
    const nameMatch = details ? businessNameMatches(claimed, [entityName, ...businessNames]) : false;
    const status = classifyAbnResult(abnStatus, nameMatch);

    const row: Insert<"business_verifications"> = {
      user_id: targetUserId,
      abn,
      abn_status: abnStatus,
      entity_name: entityName,
      business_names: businessNames,
      entity_type: details?.EntityTypeName?.trim() || null,
      gst_registered: !!(details?.Gst && details.Gst.trim()),
      abr_state: details?.AddressState?.trim() || null,
      abr_postcode: details?.AddressPostcode?.trim() || null,
      claimed_business_name: claimed,
      name_match: nameMatch,
      status,
      checked_at: new Date().toISOString(),
    };

    const { data: saved, error: upsertError } = await admin
      .from("business_verifications")
      .upsert(row, { onConflict: "user_id" })
      .select("id, status, abn_status, entity_name, business_names, entity_type, gst_registered, name_match, abr_state, abr_postcode, checked_at")
      .single();
    if (upsertError || !saved) {
      console.error("verify-abn: upsert failed", upsertError);
      return json({ error: "The check ran but the result couldn't be saved. Try again." }, 500);
    }

    console.log(`verify-abn: user=${targetUserId} abn=${abn} status=${status} match=${nameMatch}`);
    return json({ ok: true, ...saved });
  };
}

export const handler = makeHandler();

if (import.meta.main) Deno.serve(handler);
