import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

/*
  send-lead-reminders — hourly cron that nudges tradies who haven't quoted on a
  lead they were shown. Three escalation steps:

    24h since shown — in-app + push notification ("still got an unquoted lead")
    48h since shown — in-app + push + email with "Still interested?" deep link
    72h since shown — auto-pass (sets passed_at='auto_no_response'), SMS to tradie
                      as last-call, and notify the client only if no other tradie
                      has quoted yet (so they can adjust expectations)

  We use ±1h windows on the 24/48 buckets because the cron runs hourly. The 72h
  auto-pass is open-ended (>= 72h) so a missed cron tick won't leak stale leads
  forever. Each impression carries reminder_24h_sent_at / reminder_48h_sent_at
  guards so we never double-send if a tick re-runs or windows overlap.
*/

const corsHeaders = {
  "Access-Control-Allow-Origin": Deno.env.get("ALLOWED_ORIGIN") || "https://connectradie.com",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

function errorJson(message: string, status: number) {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function jsonResponse(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

const HOUR_MS = 60 * 60 * 1000;

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 200, headers: corsHeaders });
  if (req.method !== "POST") return errorJson("Method not allowed", 405);

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!supabaseUrl || !supabaseServiceKey) return errorJson("Server configuration error", 500);

    const authHeader = req.headers.get("Authorization");
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY");
    const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : "";
    if (token !== supabaseServiceKey && token !== supabaseAnonKey) {
      return errorJson("Unauthorized", 401);
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    const now = new Date();
    const nowMs = now.getTime();

    // Pull every still-pending impression (no manual or auto pass yet).
    // We fetch broadly and branch in JS — keeps the SQL simple and lets us
    // join in job/quote state cleanly.
    const { data: impressions, error: impErr } = await supabase
      .from("lead_impressions")
      .select("id, job_id, tradie_id, shown_at, reminder_24h_sent_at, reminder_48h_sent_at")
      .is("passed_at", null);

    if (impErr) {
      console.error("[lead-reminders] Failed to fetch impressions:", impErr);
      return errorJson("Failed to fetch impressions", 500);
    }

    if (!impressions || impressions.length === 0) {
      return jsonResponse({ nudged_24h: 0, nudged_48h: 0, auto_passed: 0, skipped: 0 });
    }

    // Pre-fetch the jobs and quotes referenced so we don't N+1.
    const jobIds = Array.from(new Set(impressions.map((i: { job_id: string }) => i.job_id)));
    const { data: jobs } = await supabase
      .from("jobs")
      .select("id, status, deleted_at, archived_at, title, location_address, description, client_id")
      .in("id", jobIds);

    const jobMap = new Map<string, {
      id: string; status: string; deleted_at: string | null; archived_at: string | null;
      title: string; location_address: string | null; description: string; client_id: string;
    }>(
      (jobs ?? []).map((j) => [j.id, j as never]),
    );

    const { data: quotes } = await supabase
      .from("quotes")
      .select("job_id, tradie_id")
      .in("job_id", jobIds);

    const quotedSet = new Set<string>(
      (quotes ?? []).map((q: { job_id: string; tradie_id: string }) => `${q.job_id}:${q.tradie_id}`),
    );

    let nudged24h = 0;
    let nudged48h = 0;
    let autoPassed = 0;
    let skipped = 0;
    const errors: string[] = [];

    for (const imp of impressions as Array<{
      id: string; job_id: string; tradie_id: string; shown_at: string;
      reminder_24h_sent_at: string | null; reminder_48h_sent_at: string | null;
    }>) {
      try {
        const job = jobMap.get(imp.job_id);

        // Skip if the lead is no longer actionable.
        if (!job || job.status !== "pending" || job.deleted_at || job.archived_at) {
          skipped++;
          continue;
        }

        // Skip if the tradie already quoted (any status — pending/accepted/declined/withdrawn).
        if (quotedSet.has(`${imp.job_id}:${imp.tradie_id}`)) {
          skipped++;
          continue;
        }

        const shownMs = new Date(imp.shown_at).getTime();
        const hoursSinceShown = (nowMs - shownMs) / HOUR_MS;

        const titleLine = job.title || "your lead";
        const suburb = (job.location_address || "").split(",").slice(-2, -1)[0]?.trim() || "your area";

        // ── 72h auto-pass ────────────────────────────────────────────────
        if (hoursSinceShown >= 72) {
          await supabase
            .from("lead_impressions")
            .update({ passed_at: now.toISOString(), pass_reason: "auto_no_response" })
            .eq("id", imp.id);

          // Last-call SMS to the tradie — they get one chance to come back via
          // a fresh quote modal link if they want. Best-effort; failure here
          // shouldn't block the auto-pass.
          await supabase.functions.invoke("send-sms", {
            body: {
              userId: imp.tradie_id,
              message: `ConnecTradie: We've removed "${titleLine}" from your leads after 3 days no reply. Still interested? Reply YES or check the app.`,
            },
          }).catch((e) => console.warn("[lead-reminders] SMS auto-pass failed:", e));

          // Notify the client only if no one has quoted yet — avoids "a tradie
          // declined" anxiety when they already have offers on the table.
          const quoteCountForJob = (quotes ?? []).filter(
            (q: { job_id: string }) => q.job_id === imp.job_id,
          ).length;
          if (quoteCountForJob === 0) {
            await supabase.from("notifications").insert({
              user_id: job.client_id,
              type: "lead_no_response",
              title: "Still finding tradies for your job",
              message: `One tradie passed on "${titleLine}" without quoting. We're still showing it to others.`,
              metadata: { job_id: imp.job_id },
              read: false,
            });
          }

          autoPassed++;
          continue;
        }

        // ── 48h reminder (47-49h window) ─────────────────────────────────
        if (hoursSinceShown >= 47 && hoursSinceShown < 49 && !imp.reminder_48h_sent_at) {
          await supabase.from("notifications").insert({
            user_id: imp.tradie_id,
            type: "lead_reminder_48h",
            title: "Still interested?",
            message: `"${titleLine}" in ${suburb} expires in 24h. Tap to quote or pass.`,
            metadata: { job_id: imp.job_id, link: `/work?lead=${imp.job_id}` },
            read: false,
          });

          // Email with the deep link — only the 48h step gets email; SMS waits
          // until the 72h last-call so we don't drown tradies in channels.
          await supabase.functions.invoke("send-email", {
            body: {
              userId: imp.tradie_id,
              subject: "Still interested in this lead?",
              html: `<p>Hi,</p><p>You haven't responded to <strong>${titleLine}</strong> in ${suburb}. The lead auto-expires in 24 hours.</p><p><a href="${Deno.env.get("SITE_URL") || "https://connectradie.com"}/work?lead=${imp.job_id}">Open the quote modal</a> or pass to clear it.</p>`,
            },
          }).catch((e) => console.warn("[lead-reminders] 48h email failed:", e));

          await supabase
            .from("lead_impressions")
            .update({ reminder_48h_sent_at: now.toISOString() })
            .eq("id", imp.id);

          nudged48h++;
          continue;
        }

        // ── 24h reminder (23-25h window) ─────────────────────────────────
        if (hoursSinceShown >= 23 && hoursSinceShown < 25 && !imp.reminder_24h_sent_at) {
          await supabase.from("notifications").insert({
            user_id: imp.tradie_id,
            type: "lead_reminder_24h",
            title: "Lead waiting for your quote",
            message: `"${titleLine}" in ${suburb} — tradies who quote in the first 24h win 80% of jobs.`,
            metadata: { job_id: imp.job_id, link: `/work?lead=${imp.job_id}` },
            read: false,
          });

          await supabase
            .from("lead_impressions")
            .update({ reminder_24h_sent_at: now.toISOString() })
            .eq("id", imp.id);

          nudged24h++;
          continue;
        }

        skipped++;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error(`[lead-reminders] Error on impression ${imp.id}:`, msg);
        errors.push(msg);
      }
    }

    console.log(`[lead-reminders] Done. 24h:${nudged24h} 48h:${nudged48h} autoPass:${autoPassed} skipped:${skipped} errors:${errors.length}`);

    return jsonResponse({
      nudged_24h: nudged24h,
      nudged_48h: nudged48h,
      auto_passed: autoPassed,
      skipped,
      errors: errors.length,
    });
  } catch (err) {
    console.error("[lead-reminders] Fatal:", err);
    return errorJson(err instanceof Error ? err.message : "Internal error", 500);
  }
});
