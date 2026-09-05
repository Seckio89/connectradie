// ─────────────────────────────────────────────────────────────────────────────
// review-licence — an admin marks a licence verified or rejected.
//
// In ONE call: set the decision, DELETE THE PHOTO from storage, NULL the path,
// stamp photo_deleted_at, write the audit log, notify the tradie. The deletion
// is here and not in a cron because "deleted when an admin has checked it" is
// what the consent screen promises; a later sweep would make that a lie for
// however long it took to run.
//
// On 'verified' the legacy profile columns are mirrored (license_verified,
// verified_trades, tradie_details.is_licensed) so the existing quote gate and
// public badges keep working without a second source of truth in the UI.
//
// Admin only: profiles.role = 'admin' OR profiles.is_admin — the same rule as
// public.is_admin(), which the review-queue SELECT policy uses.
// ─────────────────────────────────────────────────────────────────────────────

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import type { Insert, Update } from "../_shared/dbTypes.ts";
import {
  corsFor,
  jsonResponder,
  readServiceEnv,
  resolveCaller,
  serviceClient,
  UUID_RE,
} from "../_shared/verificationHttp.ts";

const BUCKET = "licence-uploads";
const DECISIONS = ["verified", "rejected"] as const;
type Decision = typeof DECISIONS[number];

export const REJECTION_REASONS = [
  "Licence number not found on the state register",
  "Licence has expired",
  "Name on licence does not match the account",
  "Licence class does not cover this trade",
  "Photo unreadable — please upload a clearer photo",
  "Other",
] as const;

export const handler = async (req: Request): Promise<Response> => {
  const cors = corsFor(req);
  const json = jsonResponder(cors);

  if (req.method === "OPTIONS") return new Response(null, { status: 200, headers: cors });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const env = readServiceEnv();
  if (!env) {
    console.error("review-licence: missing SUPABASE_URL / SERVICE_ROLE_KEY");
    return json({ error: "Server configuration error" }, 500);
  }
  const admin = serviceClient(env);

  const caller = await resolveCaller(req.headers.get("Authorization"), admin);
  if (!caller) return json({ error: "Unauthorized" }, 401);
  if (!caller.isAdmin) return json({ error: "Forbidden" }, 403);

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid JSON body" }, 400);
  }

  const id = typeof body.verification_id === "string" ? body.verification_id.trim() : "";
  const decision = typeof body.decision === "string" ? body.decision : "";
  const reason = typeof body.rejection_reason === "string" ? body.rejection_reason.trim().slice(0, 500) : "";

  if (!UUID_RE.test(id)) return json({ error: "verification_id must be a uuid" }, 400);
  if (!(DECISIONS as readonly string[]).includes(decision)) return json({ error: "decision must be 'verified' or 'rejected'" }, 400);
  if (decision === "rejected" && !reason) return json({ error: "A rejection needs a reason — the tradie sees it." }, 400);

  const { data: current, error: readError } = await admin
    .from("licence_verifications")
    .select("id, user_id, status, storage_path, trade_category, state_code, licence_number, licence_holder_name, licence_class, expiry_date")
    .eq("id", id)
    .maybeSingle();
  if (readError) {
    console.error("review-licence: read failed", readError);
    return json({ error: "Couldn't load the licence." }, 500);
  }
  if (!current) return json({ error: "Not found" }, 404);
  if (current.status !== "awaiting_review") {
    return json({ error: `This licence is ${current.status}, not awaiting review.` }, 409);
  }

  const nowIso = new Date().toISOString();

  // ── 1. Delete the photo FIRST. If this fails, no decision is recorded: a row
  //       that says "decided" while the evidence still exists is the one state
  //       this function must never produce.
  let photoDeleted = false;
  if (current.storage_path) {
    const { error: rmError } = await admin.storage.from(BUCKET).remove([current.storage_path]);
    if (rmError) {
      console.error("review-licence: photo delete failed", rmError);
      return json({ error: "The licence photo couldn't be deleted, so the decision wasn't saved. Try again." }, 500);
    }
    photoDeleted = true;
  }

  // ── 2. Record the decision (optimistic lock on status).
  const patch: Update<"licence_verifications"> = {
    status: decision as Decision,
    reviewed_by: caller.id,
    reviewed_at: nowIso,
    rejection_reason: decision === "rejected" ? reason : null,
    storage_path: null,
    photo_deleted_at: current.storage_path ? nowIso : null,
  };
  const { data: updated, error: updateError } = await admin
    .from("licence_verifications")
    .update(patch)
    .eq("id", id)
    .eq("status", "awaiting_review")
    .select("id, status, reviewed_at, photo_deleted_at")
    .maybeSingle();
  if (updateError) {
    console.error("review-licence: update failed", updateError);
    return json({ error: "The photo was deleted but the decision couldn't be saved. Reload and decide again." }, 500);
  }
  if (!updated) return json({ error: "Someone else decided this licence a moment ago. Reload." }, 409);

  // ── 3. Mirror onto the legacy profile columns the app already gates on.
  if (decision === "verified") {
    const { data: profile } = await admin
      .from("profiles")
      .select("verified_trades")
      .eq("id", current.user_id)
      .maybeSingle();
    const verifiedTrades = Array.from(new Set([...(profile?.verified_trades ?? []), current.trade_category]));
    const profilePatch: Update<"profiles"> = {
      license_verified: true,
      license_number: current.licence_number,
      license_state: current.state_code,
      license_expiry: current.expiry_date,
      license_class: current.licence_class,
      license_holder_name: current.licence_holder_name,
      verified_trades: verifiedTrades,
      verification_status: "verified",
      rejection_reason: null,
    };
    const { error: profileError } = await admin.from("profiles").update(profilePatch).eq("id", current.user_id);
    if (profileError) console.error("review-licence: profile mirror failed", profileError);
    const tdPatch: Update<"tradie_details"> = { is_licensed: true, is_verified: true };
    const { error: tdError } = await admin.from("tradie_details").update(tdPatch).eq("profile_id", current.user_id);
    if (tdError) console.error("review-licence: tradie_details mirror failed", tdError);
  }

  // ── 4. Audit trail — admin_audit_log's RLS gates on role='admin' literally,
  //       so the service-role path here is the one that works for is_admin flags.
  const audit: Insert<"admin_audit_log"> = {
    admin_id: caller.id,
    action: "licence_verification_decision",
    target_type: "licence_verification",
    target_id: id,
    details: {
      decision,
      rejection_reason: decision === "rejected" ? reason : null,
      tradie_id: current.user_id,
      trade_category: current.trade_category,
      state_code: current.state_code,
      photo_deleted: photoDeleted,
      decided_at: nowIso,
    },
  };
  const { error: auditError } = await admin.from("admin_audit_log").insert(audit);
  if (auditError) console.error("review-licence: audit write failed", auditError);

  // ── 5. Tell the tradie.
  const notification: Insert<"notifications"> = decision === "verified"
    ? {
      user_id: current.user_id,
      title: "Licence verified",
      message: `Your ${current.state_code} ${current.trade_category.replace(/-/g, " ")} licence has been verified. The photo you uploaded has been deleted.`,
      type: "licence_verification",
      link: "/settings?tab=verification",
      metadata: { verification_id: id, decision },
    }
    : {
      user_id: current.user_id,
      title: "Licence not verified",
      message: `We couldn't verify your ${current.state_code} licence: ${reason}. Upload it again from Settings → Get verified. The photo you uploaded has been deleted.`,
      type: "licence_verification",
      link: "/settings?tab=verification",
      metadata: { verification_id: id, decision, rejection_reason: reason },
    };
  const { error: notifyError } = await admin.from("notifications").insert(notification);
  if (notifyError) console.error("review-licence: notification failed", notifyError);

  console.log(`review-licence: id=${id} -> ${decision} by ${caller.id} photo_deleted=${photoDeleted}`);
  return json({ ok: true, verification: updated, photo_deleted: photoDeleted });
};

if (import.meta.main) Deno.serve(handler);
