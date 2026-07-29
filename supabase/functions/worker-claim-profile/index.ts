// ─────────────────────────────────────────────────────────────────────────────
// worker-claim-profile — a worker accepts a roster invite and binds their login.
//
// The token is single-use and time-limited. Single-use is enforced atomically by
// putting `claim_token_used_at IS NULL` in the UPDATE's own WHERE clause, so two
// concurrent replays cannot both win.
//
// ⚠️ This function deliberately does NOT touch profiles.role. The existing
// employer_approve_member RPC force-sets role='tradie' (20260705110000:29), which
// permanently strips a client of their client role. Claiming a roster invite is not
// a reason to change who someone is on the marketplace.
// ─────────────────────────────────────────────────────────────────────────────

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.4";

const ALLOWED_ORIGINS = [
  Deno.env.get("ALLOWED_ORIGIN") || "https://connectradie.com",
  "http://localhost:5173",
  "http://localhost:4173",
  "http://127.0.0.1:5173",
];
function corsFor(req: Request) {
  const origin = req.headers.get("Origin") || "";
  const allowOrigin = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    "Access-Control-Allow-Origin": allowOrigin,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey, X-Supabase-Api-Version",
    "Vary": "Origin",
  };
}

const toHex = (buf: ArrayBuffer) =>
  Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");

async function sha256Hex(value: string): Promise<string> {
  return toHex(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)));
}

Deno.serve(async (req: Request) => {
  const cors = corsFor(req);
  const json = (payload: unknown, status = 200) =>
    new Response(JSON.stringify(payload), {
      status,
      headers: { ...cors, "Content-Type": "application/json" },
    });

  if (req.method === "OPTIONS") return new Response(null, { status: 200, headers: cors });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!supabaseUrl || !serviceKey) {
      console.error("worker-claim-profile: missing environment configuration");
      return json({ error: "Server configuration error" }, 500);
    }

    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) return json({ error: "Missing Authorization header" }, 401);

    const supabase = createClient(supabaseUrl, serviceKey);
    const { data: { user }, error: authError } = await supabase.auth.getUser(authHeader.slice(7));
    if (authError || !user) return json({ error: "Please sign in to accept this invite" }, 401);

    let body: Record<string, unknown>;
    try {
      body = await req.json();
    } catch {
      return json({ error: "Invalid JSON body" }, 400);
    }

    const token = typeof body.token === "string" ? body.token.trim() : "";
    if (!token || token.length > 256) return json({ error: "Invalid invite link" }, 400);

    const tokenHash = await sha256Hex(token);
    const nowIso = new Date().toISOString();

    // Look the invite up first so we can distinguish "already used" and "expired"
    // from "never existed" in the message the worker sees.
    const { data: invite, error: lookupError } = await supabase
      .from("business_team_members")
      .select("id, business_owner_id, member_profile_id, invite_name, claim_token_used_at, claim_token_expires_at, archived_at")
      .eq("claim_token_hash", tokenHash)
      .maybeSingle();
    if (lookupError) {
      console.error("worker-claim-profile: lookup failed", lookupError);
      return json({ error: "Could not process this invite" }, 500);
    }
    if (!invite || invite.archived_at) {
      return json({ error: "This invite link is not valid." }, 404);
    }
    if (invite.claim_token_used_at) {
      return json({ error: "This invite link has already been used." }, 409);
    }
    if (!invite.claim_token_expires_at || new Date(invite.claim_token_expires_at).getTime() < Date.now()) {
      return json({ error: "This invite link has expired. Ask the business to send a new one." }, 410);
    }
    if (invite.member_profile_id && invite.member_profile_id !== user.id) {
      return json({ error: "This invite belongs to a different account." }, 403);
    }
    if (invite.business_owner_id === user.id) {
      return json({ error: "You cannot accept your own invite." }, 400);
    }

    // Atomic single-use claim: `claim_token_used_at IS NULL` is part of the WHERE,
    // so a replayed request updates zero rows rather than re-claiming.
    const { data: claimed, error: claimError } = await supabase
      .from("business_team_members")
      .update({
        member_profile_id: user.id,
        status: "active",
        joined_at: nowIso,
        claim_token_used_at: nowIso,
        claim_token_hash: null,
        claim_token_expires_at: null,
      })
      .eq("id", invite.id)
      .is("claim_token_used_at", null)
      .is("archived_at", null)
      .select("id, business_owner_id")
      .maybeSingle();

    if (claimError) {
      // uq_business_team_owner_member UNIQUE (business_owner_id, member_profile_id)
      if ((claimError as { code?: string }).code === "23505") {
        return json({ error: "You are already on this business's team." }, 409);
      }
      console.error("worker-claim-profile: claim failed", claimError);
      return json({ error: "Could not accept this invite" }, 500);
    }
    if (!claimed) {
      return json({ error: "This invite link has already been used." }, 409);
    }

    // Backfill started_at only when the business did not set one.
    await supabase
      .from("business_team_members")
      .update({ started_at: nowIso.slice(0, 10) })
      .eq("id", claimed.id)
      .is("started_at", null);

    // Tell the business their invite landed.
    try {
      await supabase.from("notifications").insert({
        user_id: claimed.business_owner_id,
        title: "Worker joined your team",
        message: `${invite.invite_name || "A worker"} has accepted your invite and joined your team.`,
        type: "team",
        notification_type: "worker_claimed",
        channel: "in_app",
        read: false,
        link: `/workforce/${claimed.id}`,
        metadata: { team_member_id: claimed.id },
      });
    } catch (e) {
      console.error("worker-claim-profile: owner notification failed", e);
    }

    console.log(`worker-claim-profile: member=${claimed.id} claimed_by=${user.id}`);

    // NOTE: profiles.role is intentionally untouched. See the header.
    return json({ ok: true, teamMemberId: claimed.id });
  } catch (e) {
    console.error("worker-claim-profile: unhandled error", e);
    return json({ error: "Unexpected error" }, 500);
  }
});
