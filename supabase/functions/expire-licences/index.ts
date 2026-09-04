// ─────────────────────────────────────────────────────────────────────────────
// expire-licences — daily cron (17:30 UTC, see 20260904233145).
//
//   1. verified rows with expiry_date < today -> 'expired'; the tradie is told
//      to upload the renewed licence. If they have no other current verified
//      licence, profiles.license_verified is cleared so the quote gate closes.
//   2. Safety net: every photo older than 30 days whose row is NOT awaiting
//      review is deleted from storage and its row stamped photo_deleted_at.
//      Orphan objects with no row at all (an upload that never reached
//      extract-licence) are deleted on the same rule.
//
// review-licence deletes on decision; this exists so nothing can outlive the
// retention the privacy policy states, whatever else goes wrong.
//
// Auth: the cron presents the service-role key; hasServiceRole probes it. A
// signed-in admin may also run it by hand.
// ─────────────────────────────────────────────────────────────────────────────

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { hasServiceRole } from "../_shared/serviceAuth.ts";
import type { Insert, Update } from "../_shared/dbTypes.ts";
import {
  corsFor,
  jsonResponder,
  readServiceEnv,
  resolveCaller,
  serviceClient,
} from "../_shared/verificationHttp.ts";

const BUCKET = "licence-uploads";
const PHOTO_RETENTION_DAYS = 30;
const MAX_FOLDERS_PER_RUN = 500;

export const handler = async (req: Request): Promise<Response> => {
  const cors = corsFor(req);
  const json = jsonResponder(cors);

  if (req.method === "OPTIONS") return new Response(null, { status: 200, headers: cors });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const env = readServiceEnv();
  if (!env) {
    console.error("expire-licences: missing SUPABASE_URL / SERVICE_ROLE_KEY");
    return json({ error: "Server configuration error" }, 500);
  }
  const admin = serviceClient(env);

  const authHeader = req.headers.get("Authorization");
  if (!(await hasServiceRole(authHeader, env.supabaseUrl))) {
    const caller = await resolveCaller(authHeader, admin);
    if (!caller) return json({ error: "Unauthorized" }, 401);
    if (!caller.isAdmin) return json({ error: "Forbidden" }, 403);
  }

  const now = new Date();
  const todayStr = now.toISOString().slice(0, 10);
  const cutoffIso = new Date(now.getTime() - PHOTO_RETENTION_DAYS * 24 * 60 * 60 * 1000).toISOString();
  const errors: string[] = [];

  // ── 1. Expire lapsed verified licences ───────────────────────────────────
  const { data: lapsed, error: lapsedError } = await admin
    .from("licence_verifications")
    .select("id, user_id, trade_category, state_code, expiry_date")
    .eq("status", "verified")
    .lt("expiry_date", todayStr);
  if (lapsedError) {
    console.error("expire-licences: lapsed query failed", lapsedError);
    return json({ error: "Expiry query failed" }, 500);
  }

  let expired = 0;
  for (const row of lapsed ?? []) {
    const patch: Update<"licence_verifications"> = { status: "expired" };
    const { error: upError } = await admin
      .from("licence_verifications")
      .update(patch)
      .eq("id", row.id)
      .eq("status", "verified");
    if (upError) {
      errors.push(`expire ${row.id}: ${upError.message}`);
      continue;
    }
    expired++;

    // Any other current verified licence left for this tradie?
    const { count } = await admin
      .from("licence_verifications")
      .select("id", { count: "exact", head: true })
      .eq("user_id", row.user_id)
      .eq("status", "verified");
    if ((count ?? 0) === 0) {
      const profilePatch: Update<"profiles"> = { license_verified: false, verification_status: "expired" };
      const { error: pErr } = await admin.from("profiles").update(profilePatch).eq("id", row.user_id);
      if (pErr) errors.push(`profile ${row.user_id}: ${pErr.message}`);
      const tdPatch: Update<"tradie_details"> = { is_licensed: false };
      await admin.from("tradie_details").update(tdPatch).eq("profile_id", row.user_id);
    }

    const expiryLabel = row.expiry_date
      ? new Date(row.expiry_date + "T00:00:00Z").toLocaleDateString("en-AU", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" })
      : "recently";
    const notification: Insert<"notifications"> = {
      user_id: row.user_id,
      title: "Licence expired",
      message: `Your ${row.state_code} ${row.trade_category.replace(/-/g, " ")} licence expired on ${expiryLabel}. Upload your renewed licence from Settings → Get verified to keep quoting on licensed work.`,
      type: "licence_expiry",
      link: "/settings?tab=verification",
      metadata: { verification_id: row.id, expiry_date: row.expiry_date },
    };
    const { error: nErr } = await admin.from("notifications").insert(notification);
    if (nErr) errors.push(`notify ${row.user_id}: ${nErr.message}`);
  }

  // ── 2. Photo retention safety net ────────────────────────────────────────
  // 2a. Rows that still point at a photo, older than the retention window, and
  //     not sitting in the review queue.
  const { data: overdue, error: overdueError } = await admin
    .from("licence_verifications")
    .select("id, storage_path")
    .not("storage_path", "is", null)
    .neq("status", "awaiting_review")
    .lt("created_at", cutoffIso);
  if (overdueError) errors.push(`overdue query: ${overdueError.message}`);

  let photosDeleted = 0;
  const overduePaths = (overdue ?? []).map((r) => r.storage_path).filter((p): p is string => !!p);
  if (overduePaths.length > 0) {
    const { error: rmError } = await admin.storage.from(BUCKET).remove(overduePaths);
    if (rmError) {
      errors.push(`remove overdue: ${rmError.message}`);
    } else {
      photosDeleted += overduePaths.length;
      const patch: Update<"licence_verifications"> = { storage_path: null, photo_deleted_at: now.toISOString() };
      const { error: stampError } = await admin
        .from("licence_verifications")
        .update(patch)
        .in("id", (overdue ?? []).map((r) => r.id));
      if (stampError) errors.push(`stamp overdue: ${stampError.message}`);
    }
  }

  // 2b. Orphans: objects in the bucket older than the window that no
  //     awaiting_review row references. Folders are user ids.
  const { data: keep } = await admin
    .from("licence_verifications")
    .select("storage_path")
    .eq("status", "awaiting_review")
    .not("storage_path", "is", null);
  const protectedPaths = new Set((keep ?? []).map((k) => k.storage_path as string));

  let orphansDeleted = 0;
  const { data: folders, error: listError } = await admin.storage.from(BUCKET).list("", { limit: MAX_FOLDERS_PER_RUN });
  if (listError) {
    errors.push(`list root: ${listError.message}`);
  } else {
    for (const folder of folders ?? []) {
      if (!folder.name || folder.id) continue; // files at root are not ours; folders have no id
      const { data: files, error: fErr } = await admin.storage.from(BUCKET).list(folder.name, { limit: 100 });
      if (fErr) {
        errors.push(`list ${folder.name}: ${fErr.message}`);
        continue;
      }
      const stale = (files ?? [])
        .filter((f) => f.created_at && f.created_at < cutoffIso)
        .map((f) => `${folder.name}/${f.name}`)
        .filter((p) => !protectedPaths.has(p));
      if (stale.length === 0) continue;
      const { error: rmErr } = await admin.storage.from(BUCKET).remove(stale);
      if (rmErr) {
        errors.push(`remove ${folder.name}: ${rmErr.message}`);
        continue;
      }
      orphansDeleted += stale.length;
      // If any of these still had a row pointing at them, stamp it.
      const patch: Update<"licence_verifications"> = { storage_path: null, photo_deleted_at: now.toISOString() };
      await admin.from("licence_verifications").update(patch).in("storage_path", stale);
    }
  }

  console.log(`expire-licences: expired=${expired} photos_deleted=${photosDeleted} orphans_deleted=${orphansDeleted} errors=${errors.length}`);
  return json({ ok: errors.length === 0, expired, photos_deleted: photosDeleted, orphans_deleted: orphansDeleted, errors: errors.length ? errors : undefined });
};

if (import.meta.main) Deno.serve(handler);
