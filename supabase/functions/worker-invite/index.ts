// ─────────────────────────────────────────────────────────────────────────────
// worker-invite — a tradie business invites someone onto its roster.
//
// Creates (or re-issues an invite on) a business_team_members row in 'invited'
// status and dispatches a single-use, time-limited claim token by email and/or SMS.
// Only the SHA-256 hash of the token is stored; the raw token exists only inside
// the outbound message and is never returned in the HTTP response.
//
// Rate limiting is DB-backed on purpose. _shared/rateLimiter.ts is an in-process
// Map that does not survive across Deno isolates — fine for cheap endpoints, not
// for one that spends money on email and SMS.
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

const TOKEN_TTL_DAYS = 14;
const MAX_INVITES_PER_HOUR = 20;

const EMPLOYMENT_TYPES = ["employee_full_time", "employee_part_time", "employee_casual", "subcontractor"];
const ROSTER_ROLES = ["employee", "subcontractor", "apprentice"];

const toHex = (buf: ArrayBuffer) =>
  Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");

async function sha256Hex(value: string): Promise<string> {
  return toHex(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)));
}

function newToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  // base64url — safe to drop straight into a query string.
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
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
      console.error("worker-invite: missing environment configuration");
      return json({ error: "Server configuration error" }, 500);
    }

    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) return json({ error: "Missing Authorization header" }, 401);

    const supabase = createClient(supabaseUrl, serviceKey);
    const { data: { user }, error: authError } = await supabase.auth.getUser(authHeader.slice(7));
    if (authError || !user) return json({ error: "Unauthorized" }, 401);

    // ── Input validation at the boundary ──────────────────────────────────
    let body: Record<string, unknown>;
    try {
      body = await req.json();
    } catch {
      return json({ error: "Invalid JSON body" }, 400);
    }

    const teamMemberId   = typeof body.teamMemberId === "string" ? body.teamMemberId.trim() : "";
    const fullName       = typeof body.fullName === "string" ? body.fullName.trim() : "";
    const email          = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
    const mobile         = typeof body.mobile === "string" ? body.mobile.trim() : "";
    const employmentType = typeof body.employmentType === "string" ? body.employmentType : "employee_full_time";
    const rosterRole     = typeof body.role === "string" ? body.role : "employee";
    const tradeSpecialty = typeof body.tradeSpecialty === "string" ? body.tradeSpecialty.trim() : "";
    const startedAt      = typeof body.startedAt === "string" && body.startedAt ? body.startedAt : null;

    if (!teamMemberId && !fullName) return json({ error: "A name is required" }, 400);
    if (fullName.length > 200)      return json({ error: "Name is too long" }, 400);
    if (!email && !mobile)          return json({ error: "An email address or mobile number is required" }, 400);
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return json({ error: "That email address is not valid" }, 400);
    if (mobile && !/^[0-9+()\s-]{6,20}$/.test(mobile))      return json({ error: "That mobile number is not valid" }, 400);
    if (!EMPLOYMENT_TYPES.includes(employmentType)) return json({ error: "Unknown employment type" }, 400);
    if (!ROSTER_ROLES.includes(rosterRole))         return json({ error: "Unknown role" }, 400);
    if (startedAt && !/^\d{4}-\d{2}-\d{2}$/.test(startedAt)) return json({ error: "Start date must be YYYY-MM-DD" }, 400);

    // ── Caller must be a tradie business ──────────────────────────────────
    const { data: callerProfile, error: profileError } = await supabase
      .from("profiles").select("role, full_name").eq("id", user.id).maybeSingle();
    if (profileError) {
      console.error("worker-invite: profile lookup failed", profileError);
      return json({ error: "Could not verify your account" }, 500);
    }
    if (callerProfile?.role !== "tradie") {
      return json({ error: "Only trade businesses can invite workers" }, 403);
    }

    // ── DB-backed rate limit, scoped to the inviting business ─────────────
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const { count: recentInvites, error: countError } = await supabase
      .from("business_team_members")
      .select("id", { count: "exact", head: true })
      .eq("business_owner_id", user.id)
      .gt("invited_at", oneHourAgo);
    if (countError) {
      console.error("worker-invite: rate-limit count failed", countError);
      return json({ error: "Could not process the invite" }, 500);
    }
    if ((recentInvites ?? 0) >= MAX_INVITES_PER_HOUR) {
      return json({ error: "Too many invites sent in the last hour. Please try again later." }, 429);
    }

    // ── Mint the claim token ──────────────────────────────────────────────
    const rawToken = newToken();
    const tokenHash = await sha256Hex(rawToken);
    const expiresAt = new Date(Date.now() + TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000).toISOString();

    const invitePayload = {
      invite_name: fullName,
      invite_email: email || null,
      invite_phone: mobile || "",
      role: rosterRole,
      employment_type: employmentType,
      trade_specialty: tradeSpecialty,
      started_at: startedAt,
      status: "invited",
      invited_at: new Date().toISOString(),
      claim_token_hash: tokenHash,
      claim_token_expires_at: expiresAt,
      claim_token_used_at: null,
    };

    let memberId = teamMemberId;

    if (teamMemberId) {
      // Re-issuing an invite on an existing roster row. Scoped to the caller's
      // own business so one business cannot re-issue against another's worker.
      const { data: updated, error: updateError } = await supabase
        .from("business_team_members")
        .update(invitePayload)
        .eq("id", teamMemberId)
        .eq("business_owner_id", user.id)
        .is("archived_at", null)
        .select("id, invite_name, invite_email, invite_phone")
        .maybeSingle();
      if (updateError) {
        console.error("worker-invite: re-issue failed", updateError);
        return json({ error: "Could not re-send the invite" }, 500);
      }
      if (!updated) return json({ error: "Worker not found" }, 404);
      memberId = updated.id;
    } else {
      const { data: inserted, error: insertError } = await supabase
        .from("business_team_members")
        .insert({ ...invitePayload, business_owner_id: user.id })
        .select("id")
        .single();
      if (insertError) {
        console.error("worker-invite: insert failed", insertError);
        return json({ error: "Could not create the worker record" }, 500);
      }
      memberId = inserted.id;
    }

    // ── Dispatch ──────────────────────────────────────────────────────────
    const siteUrl = Deno.env.get("SITE_URL") || "https://connectradie.com";
    const claimUrl = `${siteUrl}/workforce/claim?token=${encodeURIComponent(rawToken)}`;
    const businessName = callerProfile?.full_name || "A trade business";

    let emailSent = false;
    let smsSent = false;

    if (email) {
      try {
        const res = await fetch(`${supabaseUrl}/functions/v1/send-email`, {
          method: "POST",
          headers: { "Content-Type": "application/json", "Authorization": `Bearer ${serviceKey}` },
          body: JSON.stringify({
            to: email,
            subject: `${businessName} has added you to their team on ConnecTradie`,
            body:
              `Hi ${fullName || "there"},\n\n${businessName} has added you to their team on ConnecTradie. ` +
              `Accept the invite to manage your own tickets, licences and certificates in one place.\n\n` +
              `Accept your invite: ${claimUrl}\n\n` +
              `This link works once and expires in ${TOKEN_TTL_DAYS} days. If you weren't expecting this, ignore this email.`,
            notificationType: "worker_invite",
          }),
        });
        emailSent = res.ok;
        if (!res.ok) console.error("worker-invite: send-email returned", res.status);
      } catch (e) {
        console.error("worker-invite: send-email failed", e);
      }
    }

    if (mobile) {
      try {
        const res = await fetch(`${supabaseUrl}/functions/v1/send-sms`, {
          method: "POST",
          headers: { "Content-Type": "application/json", "Authorization": `Bearer ${serviceKey}` },
          body: JSON.stringify({
            to: mobile,
            body: `${businessName} has added you to their team on ConnecTradie. Accept your invite: ${claimUrl}`,
            notificationType: "worker_invite",
          }),
        });
        smsSent = res.ok;
        if (!res.ok) console.error("worker-invite: send-sms returned", res.status);
      } catch (e) {
        console.error("worker-invite: send-sms failed", e);
      }
    }

    console.log(
      `worker-invite: business=${user.id} member=${memberId} email_sent=${emailSent} sms_sent=${smsSent}`,
    );

    // The raw token is deliberately absent from this response.
    return json({ ok: true, teamMemberId: memberId, emailSent, smsSent });
  } catch (e) {
    console.error("worker-invite: unhandled error", e);
    return json({ error: "Unexpected error" }, 500);
  }
});
