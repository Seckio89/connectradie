// ─────────────────────────────────────────────────────────────────────────────
// credential-verify — the only writer of worker_credentials' verification fields.
//
// verification_status / verified_at / verified_by are blocked for every non-
// service_role caller by a column-level BEFORE trigger
// (enforce_worker_credential_verification_fields). A policy alone could not do it:
// the owning business already holds UPDATE on the row, so the row predicate passes
// and they could otherwise mark their own worker "verified".
//
// For this release verification is MANUAL / admin-triggered. The state machine is
// built; no third-party screening API is integrated.
// ─────────────────────────────────────────────────────────────────────────────

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.4";
import { hasServiceRole } from "../_shared/serviceAuth.ts";

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

// Terminal states cannot be re-decided; 'expired' is owned by the sweep, not by a
// human reviewer, so it is not an accepted decision here.
const DECISIONS = ["pending", "verified", "rejected"];
const TRANSITIONS: Record<string, string[]> = {
  unverified: ["pending", "verified", "rejected"],
  pending:    ["verified", "rejected"],
  rejected:   ["pending", "verified"],
  verified:   ["rejected"],
  expired:    ["pending", "verified"],
};

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
      console.error("credential-verify: missing environment configuration");
      return json({ error: "Server configuration error" }, 500);
    }

    // Capability probe, not a string compare — a byte-shape check like
    // startsWith("Bearer ey") passes every signed-in user's JWT.
    const authHeader = req.headers.get("Authorization");
    if (!(await hasServiceRole(authHeader, supabaseUrl))) {
      return json({ error: "Forbidden" }, 403);
    }

    let body: Record<string, unknown>;
    try {
      body = await req.json();
    } catch {
      return json({ error: "Invalid JSON body" }, 400);
    }

    const credentialId = typeof body.workerCredentialId === "string" ? body.workerCredentialId.trim() : "";
    const decision     = typeof body.decision === "string" ? body.decision : "";
    const actorId      = typeof body.actorId === "string" && body.actorId ? body.actorId : null;
    const note         = typeof body.note === "string" ? body.note.slice(0, 500) : null;

    if (!/^[0-9a-f-]{36}$/i.test(credentialId)) return json({ error: "workerCredentialId must be a uuid" }, 400);
    if (!DECISIONS.includes(decision))          return json({ error: `decision must be one of ${DECISIONS.join(", ")}` }, 400);

    const supabase = createClient(supabaseUrl, serviceKey);

    const { data: current, error: readError } = await supabase
      .from("worker_credentials")
      .select("id, team_member_id, verification_status")
      .eq("id", credentialId)
      .maybeSingle();
    if (readError) {
      console.error("credential-verify: read failed", readError);
      return json({ error: "Could not read the credential" }, 500);
    }
    if (!current) return json({ error: "Credential not found" }, 404);

    const from = current.verification_status ?? "unverified";
    if (from === decision) {
      return json({ ok: true, unchanged: true, verificationStatus: from });
    }
    if (!(TRANSITIONS[from] ?? []).includes(decision)) {
      return json({ error: `Cannot move a credential from '${from}' to '${decision}'` }, 409);
    }

    const nowIso = new Date().toISOString();
    const isDecided = decision === "verified" || decision === "rejected";

    const { data: updated, error: updateError } = await supabase
      .from("worker_credentials")
      .update({
        verification_status: decision,
        verified_at: isDecided ? nowIso : null,
        verified_by: isDecided ? actorId : null,
      })
      .eq("id", credentialId)
      .eq("verification_status", from) // optimistic lock against a concurrent decision
      .select("id, verification_status, verified_at")
      .maybeSingle();

    if (updateError) {
      console.error("credential-verify: update failed", updateError);
      return json({ error: "Could not record the decision" }, 500);
    }
    if (!updated) {
      return json({ error: "Credential changed while being reviewed. Reload and try again." }, 409);
    }

    // Audit trail — actor and timestamp, per the compliance constraint.
    // admin_audit_log's RLS gates on role='admin' literally, so the service-role
    // path here is the only one that can write it.
    try {
      await supabase.from("admin_audit_log").insert({
        admin_id: actorId,
        action: "credential_verification_decision",
        target_type: "worker_credential",
        target_id: credentialId,
        details: {
          from,
          to: decision,
          team_member_id: current.team_member_id,
          note,
          decided_at: nowIso,
        },
      });
    } catch (e) {
      console.error("credential-verify: audit write failed", e);
    }

    console.log(`credential-verify: credential=${credentialId} ${from} -> ${decision} actor=${actorId ?? "system"}`);

    return json({ ok: true, verificationStatus: updated.verification_status, verifiedAt: updated.verified_at });
  } catch (e) {
    console.error("credential-verify: unhandled error", e);
    return json({ error: "Unexpected error" }, 500);
  }
});
