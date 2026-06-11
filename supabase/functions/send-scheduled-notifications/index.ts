import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

function requireEnv(key: string): string {
  const val = Deno.env.get(key);
  if (!val) throw new Error(`Missing required env var: ${key}`);
  return val;
}

const corsHeaders = {
  "Access-Control-Allow-Origin": Deno.env.get("ALLOWED_ORIGIN") || "https://connectradie.com",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers":
    "Content-Type, Authorization, X-Client-Info, Apikey",
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

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return errorJson("Method not allowed", 405);
  }

  try {
    let supabaseUrl: string, supabaseServiceKey: string;
    try {
      supabaseUrl = requireEnv("SUPABASE_URL");
      supabaseServiceKey = requireEnv("SUPABASE_SERVICE_ROLE_KEY");
    } catch (e) {
      console.error(e);
      return errorJson("Server configuration error", 500);
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Caller has already passed Supabase JWT verification (verify_jwt=true).
    // Defence-in-depth: require the bearer be a JWT (starts with 'ey').
    // We deliberately do NOT byte-compare against env var — the auto-injected
    // SUPABASE_SERVICE_ROLE_KEY can drift from the vault-stored secret used by
    // pg_cron after key rotations, and that mismatch silently 401'd everything.
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ey")) {
      return errorJson("Unauthorized", 401);
    }

    const now = new Date();
    const nowIso = now.toISOString();

    const results = {
      day_before_sent: 0,
      two_hour_sent: 0,
      auto_started: 0,
      errors: [] as string[],
    };

    // ─── 1. DAY-BEFORE REMINDERS ─────────────────────────────
    // Find jobs scheduled for tomorrow that haven't had their reminder sent.
    const tomorrow = new Date(now);
    tomorrow.setDate(tomorrow.getDate() + 1);
    const tomorrowDate = tomorrow.toISOString().split("T")[0];

    const { data: tomorrowJobs, error: tmErr } = await supabase
      .from("jobs")
      .select("id, title, description, scheduled_date, scheduled_time, location_address, client_id, tradie_id")
      .in("status", ["accepted", "funded", "in_progress"])
      .eq("scheduled_date", tomorrowDate)
      .is("day_before_notification_sent", null);

    if (tmErr) {
      results.errors.push(`day_before fetch: ${tmErr.message}`);
    }

    for (const job of tomorrowJobs ?? []) {
      try {
        const category = (job.description as string)?.match(/^\[([^\]]+)\]/)?.[1]?.replace(/_/g, " ") || "";
        const jobTitle = job.title || category || "your job";
        const suburb = (job.location_address as string)?.split(",")[0]?.trim() || "";

        const notifications = [];

        // Notify client
        if (job.client_id) {
          notifications.push({
            user_id: job.client_id,
            type: "job_reminder_day_before",
            title: "Job Tomorrow",
            message: `Reminder: Your tradie is coming tomorrow for ${jobTitle}${suburb ? ` at ${suburb}` : ""}.`,
            job_id: job.id,
            metadata: { scheduled_date: tomorrowDate },
            read: false,
          });
        }

        // Notify tradie
        if (job.tradie_id) {
          notifications.push({
            user_id: job.tradie_id,
            type: "job_reminder_day_before",
            title: "Job Tomorrow",
            message: `Tomorrow: ${jobTitle}${suburb ? ` at ${suburb}` : ""}.`,
            job_id: job.id,
            metadata: { scheduled_date: tomorrowDate },
            read: false,
          });
        }

        if (notifications.length > 0) {
          await supabase.from("notifications").insert(notifications);
        }

        await supabase
          .from("jobs")
          .update({ day_before_notification_sent: nowIso })
          .eq("id", job.id);

        results.day_before_sent++;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        results.errors.push(`day_before job ${job.id}: ${msg}`);
      }
    }

    // ─── 2. TWO-HOUR REMINDERS ───────────────────────────────
    // Find jobs scheduled for today with a scheduled_time within the 2-hour window.
    const todayDate = now.toISOString().split("T")[0];

    const { data: todayJobs, error: tdErr } = await supabase
      .from("jobs")
      .select("id, title, description, scheduled_time, client_id, tradie_id")
      .in("status", ["accepted", "funded", "in_progress"])
      .eq("scheduled_date", todayDate)
      .is("two_hour_notification_sent", null)
      .not("scheduled_time", "is", null);

    if (tdErr) {
      results.errors.push(`two_hour fetch: ${tdErr.message}`);
    }

    for (const job of todayJobs ?? []) {
      try {
        if (!job.scheduled_time) continue;

        // Parse scheduled_time (TIME column, e.g., "09:00:00" or ISO timestamp)
        let jobHour: number;
        let jobMinute: number;

        const timeStr = job.scheduled_time as string;
        if (timeStr.includes("T")) {
          // ISO timestamp
          const d = new Date(timeStr);
          jobHour = d.getHours();
          jobMinute = d.getMinutes();
        } else {
          // TIME string like "09:00:00"
          const parts = timeStr.split(":").map(Number);
          jobHour = parts[0];
          jobMinute = parts[1] ?? 0;
        }

        const jobTime = new Date(now);
        jobTime.setHours(jobHour, jobMinute, 0, 0);

        const hoursUntil = (jobTime.getTime() - now.getTime()) / (1000 * 60 * 60);

        // Send if job is 1.5 to 2.5 hours away (buffer for hourly cron)
        if (hoursUntil < 1.5 || hoursUntil > 2.5) continue;

        const category = (job.description as string)?.match(/^\[([^\]]+)\]/)?.[1]?.replace(/_/g, " ") || "";
        const jobTitle = job.title || category || "your job";

        // Notify client only (tradie knows they're coming)
        if (job.client_id) {
          await supabase.from("notifications").insert({
            user_id: job.client_id,
            type: "job_reminder_two_hours",
            title: "Arriving Soon",
            message: `Heads up: Your tradie will arrive in about 2 hours for ${jobTitle}.`,
            job_id: job.id,
            metadata: { scheduled_time: job.scheduled_time },
            read: false,
          });
        }

        await supabase
          .from("jobs")
          .update({ two_hour_notification_sent: nowIso })
          .eq("id", job.id);

        results.two_hour_sent++;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        results.errors.push(`two_hour job ${job.id}: ${msg}`);
      }
    }

    // ─── 3. AUTO-START FUNDED JOBS ON/PAST SCHEDULED DATE ────
    // Transition funded → in_progress automatically.
    const { data: fundedJobs, error: fsErr } = await supabase
      .from("jobs")
      .select("id")
      .eq("status", "funded")
      .lte("scheduled_date", todayDate);

    if (fsErr) {
      results.errors.push(`auto_start fetch: ${fsErr.message}`);
    }

    for (const job of fundedJobs ?? []) {
      try {
        await supabase
          .from("jobs")
          .update({ status: "in_progress" })
          .eq("id", job.id);

        results.auto_started++;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        results.errors.push(`auto_start job ${job.id}: ${msg}`);
      }
    }

    // ─── 4. QUOTE REQUEST REMINDERS (24h) ─────────────────────
    // Remind tradies who were invited to quote but haven't responded.
    const reminderCutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const { data: staleInvites, error: invErr } = await supabase
      .from("notifications")
      .select("id, user_id, metadata, created_at")
      .eq("type", "new_job")
      .is("read_at", null)
      .lt("created_at", reminderCutoff);

    if (invErr) {
      results.errors.push(`quote_reminder fetch: ${invErr.message}`);
    }

    let quoteReminders = 0;
    for (const invite of staleInvites ?? []) {
      try {
        const meta = invite.metadata as Record<string, unknown> | null;
        if (!meta?.invited || meta?.reminder_sent) continue;

        const jobId = meta.job_id as string;
        if (!jobId) continue;

        // Check job is still pending with no quotes from this tradie
        const { data: job } = await supabase
          .from("jobs")
          .select("id, title, status")
          .eq("id", jobId)
          .eq("status", "pending")
          .maybeSingle();

        if (!job) continue;

        // Check tradie hasn't already quoted
        const { data: existingQuote } = await supabase
          .from("quotes")
          .select("id")
          .eq("job_id", jobId)
          .eq("tradie_id", invite.user_id)
          .maybeSingle();

        if (existingQuote) continue;

        // Send reminder
        const jobTitle = job.title || "a job";
        await supabase.from("notifications").insert({
          user_id: invite.user_id,
          type: "quote_reminder",
          title: "Quote Reminder",
          message: `You were invited to quote on ${jobTitle}. The client is still waiting for your response.`,
          metadata: { job_id: jobId },
          read: false,
        });

        // Mark original invite so we don't remind again
        await supabase
          .from("notifications")
          .update({ metadata: { ...meta, reminder_sent: true } })
          .eq("id", invite.id);

        quoteReminders++;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        results.errors.push(`quote_reminder: ${msg}`);
      }
    }

    // ─── 5. AUTO-DISMISS NOTIFICATIONS FOR TAKEN JOBS ────────
    // When a job is accepted/funded, mark other tradies' new_lead/new_job notifications as read.
    const { data: takenJobs, error: takenErr } = await supabase
      .from("jobs")
      .select("id")
      .in("status", ["accepted", "funded", "in_progress", "completed"])
      .not("tradie_id", "is", null);

    if (takenErr) {
      results.errors.push(`auto_dismiss fetch: ${takenErr.message}`);
    }

    let dismissed = 0;
    if (takenJobs && takenJobs.length > 0) {
      const takenJobIds = takenJobs.map(j => j.id);

      // Find unread new_lead/new_job notifications for these jobs
      const { data: staleNotifs, error: staleErr } = await supabase
        .from("notifications")
        .select("id, metadata")
        .in("type", ["new_lead", "new_job"])
        .is("read_at", null);

      if (staleErr) {
        results.errors.push(`auto_dismiss stale fetch: ${staleErr.message}`);
      }

      for (const notif of staleNotifs ?? []) {
        const meta = notif.metadata as Record<string, unknown> | null;
        const notifJobId = meta?.job_id as string;
        if (notifJobId && takenJobIds.includes(notifJobId)) {
          await supabase
            .from("notifications")
            .update({ read_at: nowIso })
            .eq("id", notif.id);
          dismissed++;
        }
      }
    }

    return jsonResponse({ ...results, quote_reminders: quoteReminders, dismissed });
  } catch (err) {
    console.error("send-scheduled-notifications error:", err);
    const message = err instanceof Error ? err.message : "Internal server error";
    return errorJson(message, 500);
  }
});
