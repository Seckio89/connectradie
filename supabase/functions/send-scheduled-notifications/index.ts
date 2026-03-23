import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

function requireEnv(key: string): string {
  const val = Deno.env.get(key);
  if (!val) throw new Error(`Missing required env var: ${key}`);
  return val;
}

const corsHeaders = {
  "Access-Control-Allow-Origin": Deno.env.get("ALLOWED_ORIGIN") || "https://connectradie.com.au",
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

    // Service role auth only
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return errorJson("Missing Authorization header", 401);
    }
    const token = authHeader.slice(7);
    if (token !== supabaseServiceKey) {
      return errorJson("Forbidden — service role only", 403);
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);
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

    return jsonResponse(results);
  } catch (err) {
    console.error("send-scheduled-notifications error:", err);
    const message = err instanceof Error ? err.message : "Internal server error";
    return errorJson(message, 500);
  }
});
