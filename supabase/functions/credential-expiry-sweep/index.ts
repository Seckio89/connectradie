// ─────────────────────────────────────────────────────────────────────────────
// credential-expiry-sweep — daily cron.
//
//   1. Flips verified -> expired once expires_at is in the past.
//   2. Warns at 60, 30 and 7 days out.
//
// Idempotency is structural, not a time-window heuristic: every warning inserts
// (worker_credential_id, threshold_days, expires_on) into worker_credential_notifications
// with ON CONFLICT DO NOTHING, and a notification is only sent for a row that
// actually inserted. Running the sweep twice in a day therefore sends once.
// Including expires_on in the key means renewing a credential re-arms all three
// thresholds, while a same-day re-run still collides.
//
// Writes into the existing `notifications` table — no parallel notification system.
// Modelled on check-license-expiry, which does the same job for tradie licences.
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
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Origin": allowOrigin,
    "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey, X-Supabase-Api-Version",
    "Vary": "Origin",
  };
}

const THRESHOLDS = [60, 30, 7] as const;

// postgrest-js types every embedded relation as an array, even for a to-one FK
// where the runtime value is a bare object. Normalise instead of casting, so this
// is correct whichever shape actually arrives.
function one<T>(value: T | T[] | null | undefined): T | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

interface RosterRef {
  id: string;
  invite_name: string | null;
  business_owner_id: string;
  member_profile_id: string | null;
  archived_at: string | null;
}

const addDays = (base: Date, days: number) => {
  const d = new Date(base);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
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
      console.error("credential-expiry-sweep: missing environment configuration");
      return json({ error: "Server configuration error" }, 500);
    }

    const authHeader = req.headers.get("Authorization");
    if (!(await hasServiceRole(authHeader, supabaseUrl))) {
      return json({ error: "Forbidden" }, 403);
    }

    const supabase = createClient(supabaseUrl, serviceKey);
    const today = new Date();
    const todayStr = today.toISOString().slice(0, 10);

    // ── 1. Expire what has lapsed ─────────────────────────────────────────
    const { data: expiredRows, error: expireError } = await supabase
      .from("worker_credentials")
      .update({ verification_status: "expired" })
      .lt("expires_at", todayStr)
      .in("verification_status", ["verified", "pending"])
      .select("id");
    if (expireError) {
      console.error("credential-expiry-sweep: expire step failed", expireError);
      return json({ error: "Expiry step failed" }, 500);
    }
    const expiredCount = expiredRows?.length ?? 0;

    // ── 2. Warn at each threshold ─────────────────────────────────────────
    let warningsSent = 0;
    let notificationsFailed = 0;

    for (const days of THRESHOLDS) {
      const windowEnd = addDays(today, days);

      // Everything still valid but falling inside this window. Smaller thresholds
      // are subsets of larger ones; the ledger's unique key is what stops a
      // credential being warned about twice at the same threshold.
      const { data: due, error: dueError } = await supabase
        .from("worker_credentials")
        .select(`
          id,
          expires_at,
          team_member_id,
          credential_types ( label ),
          business_team_members ( id, invite_name, business_owner_id, member_profile_id, archived_at )
        `)
        .eq("verification_status", "verified")
        .gte("expires_at", todayStr)
        .lte("expires_at", windowEnd);

      if (dueError) {
        console.error(`credential-expiry-sweep: query failed at ${days}d`, dueError);
        continue;
      }

      for (const cred of due ?? []) {
        const member = one<RosterRef>(cred.business_team_members as unknown as RosterRef | RosterRef[] | null);
        if (!member || member.archived_at) continue;

        // The ledger insert IS the idempotency gate. If it conflicts, this
        // threshold has already been sent for this expiry date — skip silently.
        const { data: ledger, error: ledgerError } = await supabase
          .from("worker_credential_notifications")
          .upsert(
            { worker_credential_id: cred.id, threshold_days: days, expires_on: cred.expires_at, sent_on: todayStr },
            { onConflict: "worker_credential_id,threshold_days,expires_on", ignoreDuplicates: true },
          )
          .select("id");

        if (ledgerError) {
          console.error("credential-expiry-sweep: ledger insert failed", ledgerError);
          continue;
        }
        if (!ledger || ledger.length === 0) continue; // already warned

        const credType = one<{ label: string }>(
          cred.credential_types as unknown as { label: string } | { label: string }[] | null,
        );
        const label = credType?.label ?? "A credential";
        const workerName = member.invite_name || "a worker";
        const title = `${label} expires in ${days} days`;
        const link = `/workforce/${member.id}`;

        const recipients = [member.business_owner_id];
        if (member.member_profile_id) recipients.push(member.member_profile_id);

        for (const recipient of recipients) {
          const isWorker = recipient === member.member_profile_id;
          const { error: notifyError } = await supabase.from("notifications").insert({
            user_id: recipient,
            title,
            message: isWorker
              ? `Your ${label} expires on ${cred.expires_at}. Upload a renewal to stay compliant.`
              : `${workerName}'s ${label} expires on ${cred.expires_at}. Ask them for a renewal to keep them job-ready.`,
            type: "team",
            notification_type: "credential_expiring",
            channel: "in_app",
            read: false,
            link,
            metadata: {
              worker_credential_id: cred.id,
              team_member_id: member.id,
              threshold_days: days,
              expires_on: cred.expires_at,
            },
          });
          if (notifyError) {
            notificationsFailed++;
            console.error("credential-expiry-sweep: notification insert failed", notifyError);
          } else {
            warningsSent++;
          }
        }
      }
    }

    console.log(
      `credential-expiry-sweep: expired=${expiredCount} warnings_sent=${warningsSent} notify_failures=${notificationsFailed}`,
    );

    return json({ ok: true, expired: expiredCount, warningsSent, notificationsFailed });
  } catch (e) {
    console.error("credential-expiry-sweep: unhandled error", e);
    return json({ error: "Unexpected error" }, 500);
  }
});
