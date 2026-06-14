import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

/*
  send-invoice-reminders — daily cron that emails tradies who have completed
  recurring sessions on manual-mode jobs but haven't sent the invoice yet.

  Filters:
    - recurring_jobs.auto_invoice = false (auto-mode jobs are handled by
      generate-auto-invoices cron)
    - recurring_jobs.is_active = true and cancelled_at IS NULL
    - recurring_sessions.status IN ('completed','extra')
    - Session date not already covered by an existing sent/overdue/paid
      recurring_invoice billing period

  Tradie-level dedup: profiles.last_invoice_reminder_email_at must be NULL or
  older than 24h. The email summarises ALL pending sessions across the tradie's
  manual jobs in one message, then stamps last_invoice_reminder_email_at.
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

const DAY_MS = 24 * 60 * 60 * 1000;

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
    let authorized = token === supabaseServiceKey || token === supabaseAnonKey;
    if (!authorized && token) {
      try {
        const payload = JSON.parse(atob(token.split(".")[1] ?? ""));
        if (payload?.role === "service_role" || payload?.role === "anon") authorized = true;
      } catch { /* not a valid JWT */ }
    }
    if (!authorized) {
      return errorJson("Unauthorized", 401);
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // 1. All active manual-mode recurring jobs
    const { data: manualJobs, error: jobsErr } = await supabase
      .from("recurring_jobs")
      .select("id, tradie_id, agreed_price, service_subtype, trade_category, client_id")
      .eq("auto_invoice", false)
      .eq("is_active", true)
      .is("cancelled_at", null)
      .not("tradie_id", "is", null);
    if (jobsErr) return errorJson(jobsErr.message, 500);
    if (!manualJobs || manualJobs.length === 0) {
      return jsonResponse({ tradies_emailed: 0, reason: "no_manual_jobs" });
    }

    const jobIds = manualJobs.map((j) => j.id);
    const jobsById = new Map(manualJobs.map((j) => [j.id, j]));

    // 2. Sessions that are completed/extra
    const { data: sessions, error: sessErr } = await supabase
      .from("recurring_sessions")
      .select("id, recurring_job_id, scheduled_date, extra_cost, supply_cost")
      .in("recurring_job_id", jobIds)
      .in("status", ["completed", "extra"]);
    if (sessErr) return errorJson(sessErr.message, 500);
    if (!sessions || sessions.length === 0) {
      return jsonResponse({ tradies_emailed: 0, reason: "no_completed_sessions" });
    }

    // 3. Existing invoices that already cover some of those session dates
    const { data: invoices, error: invErr } = await supabase
      .from("recurring_invoices")
      .select("recurring_job_id, billing_period_start, billing_period_end")
      .in("recurring_job_id", jobIds)
      .in("status", ["sent", "overdue", "paid"]);
    if (invErr) return errorJson(invErr.message, 500);

    const invoicesByJob = new Map<string, { start: string; end: string }[]>();
    (invoices ?? []).forEach((inv) => {
      const arr = invoicesByJob.get(inv.recurring_job_id) ?? [];
      arr.push({ start: inv.billing_period_start, end: inv.billing_period_end });
      invoicesByJob.set(inv.recurring_job_id, arr);
    });

    // 4. Group uninvoiced sessions by tradie
    type Pending = { count: number; total: number; oldest: string };
    const byTradie = new Map<string, Pending>();
    sessions.forEach((s) => {
      const periods = invoicesByJob.get(s.recurring_job_id) ?? [];
      const covered = periods.some((p) => s.scheduled_date >= p.start && s.scheduled_date <= p.end);
      if (covered) return;
      const job = jobsById.get(s.recurring_job_id);
      if (!job || !job.tradie_id) return;
      const agreed = Number(job.agreed_price) || 0;
      const extra = Number(s.extra_cost) || 0;
      const supplies = Number(s.supply_cost) || 0;
      const cur = byTradie.get(job.tradie_id) ?? { count: 0, total: 0, oldest: s.scheduled_date };
      cur.count += 1;
      cur.total += agreed + extra + supplies;
      if (s.scheduled_date < cur.oldest) cur.oldest = s.scheduled_date;
      byTradie.set(job.tradie_id, cur);
    });

    if (byTradie.size === 0) {
      return jsonResponse({ tradies_emailed: 0, reason: "all_sessions_covered" });
    }

    // 5. Pull tradie profiles + dedup check
    const tradieIds = [...byTradie.keys()];
    const { data: tradies, error: tradiesErr } = await supabase
      .from("profiles")
      .select("id, email, full_name, last_invoice_reminder_email_at")
      .in("id", tradieIds);
    if (tradiesErr) return errorJson(tradiesErr.message, 500);

    const now = Date.now();
    const results: Array<{ tradie_id: string; status: string; count?: number; total?: number }> = [];

    for (const tradie of tradies ?? []) {
      const pending = byTradie.get(tradie.id);
      if (!pending) continue;

      // Dedup: skip if we sent in the last 24h
      if (tradie.last_invoice_reminder_email_at) {
        const lastSent = new Date(tradie.last_invoice_reminder_email_at).getTime();
        if (now - lastSent < DAY_MS) {
          results.push({ tradie_id: tradie.id, status: "skipped_recent" });
          continue;
        }
      }

      if (!tradie.email) {
        results.push({ tradie_id: tradie.id, status: "skipped_no_email" });
        continue;
      }

      const oldestDate = new Date(pending.oldest + "T00:00:00").toLocaleDateString("en-AU", {
        day: "numeric", month: "short", year: "numeric",
      });
      const subject = `${pending.count} invoice${pending.count === 1 ? "" : "s"} ready to send`;
      const body = `Hi ${tradie.full_name || "there"},\n\n`
        + `You have ${pending.count} completed session${pending.count === 1 ? "" : "s"} `
        + `(~$${pending.total.toLocaleString()}) waiting to be invoiced. The oldest is from ${oldestDate}.\n\n`
        + `Until you send the invoice, the client can't pay you. Open the app, head to Work Hub → Ongoing Services, `
        + `and hit "Send Invoice" on each service to get paid.`;

      try {
        const emailRes = await fetch(`${supabaseUrl}/functions/v1/send-email`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${supabaseServiceKey}`,
          },
          body: JSON.stringify({
            to: tradie.email,
            subject,
            body,
            notificationType: "invoice_reminder",
            metadata: { pending_count: pending.count, pending_total: pending.total },
          }),
        });

        if (!emailRes.ok) {
          results.push({ tradie_id: tradie.id, status: "email_failed" });
          continue;
        }

        await supabase
          .from("profiles")
          .update({ last_invoice_reminder_email_at: new Date().toISOString() })
          .eq("id", tradie.id);

        results.push({
          tradie_id: tradie.id, status: "sent",
          count: pending.count, total: pending.total,
        });
      } catch (err) {
        console.error(`[invoice-reminders] send failed for ${tradie.id}:`, err);
        results.push({ tradie_id: tradie.id, status: "exception" });
      }
    }

    const tradies_emailed = results.filter((r) => r.status === "sent").length;
    return jsonResponse({ tradies_emailed, considered: results.length, results });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("[send-invoice-reminders] fatal:", err);
    return errorJson(message, 500);
  }
});
