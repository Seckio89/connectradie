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

    // Service role auth only — reject user JWTs
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return errorJson("Missing Authorization header", 401);
    }

    const token = authHeader.slice(7);
    if (token !== supabaseServiceKey) {
      return errorJson("Forbidden — service role only", 403);
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Tomorrow's date (sessions scheduled for tomorrow)
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const tomorrowStr = tomorrow.toISOString().split("T")[0];

    // Fetch all scheduled sessions for tomorrow, with recurring job details
    const { data: sessions, error: fetchError } = await supabase
      .from("recurring_sessions")
      .select(`
        id,
        scheduled_date,
        recurring_job_id,
        recurring_job:recurring_jobs!recurring_sessions_recurring_job_id_fkey(
          id,
          client_id,
          tradie_id,
          trade_category,
          preferred_time,
          location
        )
      `)
      .eq("status", "scheduled")
      .eq("scheduled_date", tomorrowStr);

    if (fetchError) {
      console.error("Failed to fetch tomorrow's sessions:", fetchError);
      return errorJson("Failed to fetch sessions", 500);
    }

    if (!sessions || sessions.length === 0) {
      return jsonResponse({
        reminders_sent: 0,
        sessions_checked: 0,
        errors: [],
      });
    }

    let remindersSent = 0;
    const errors: string[] = [];

    for (const session of sessions) {
      const job = session.recurring_job as {
        id: string;
        client_id: string;
        tradie_id: string | null;
        trade_category: string;
        preferred_time: string | null;
        location: string | null;
      } | null;

      if (!job) {
        errors.push(`Session ${session.id}: missing recurring job data`);
        continue;
      }

      const tradeLabel = job.trade_category
        .replace(/_/g, " ")
        .replace(/\b\w/g, (c: string) => c.toUpperCase());

      const timeLabel = job.preferred_time
        ? job.preferred_time.slice(0, 5)
        : "scheduled time";

      const dateLabel = new Date(tomorrowStr + "T00:00:00").toLocaleDateString(
        "en-AU",
        { weekday: "long", day: "numeric", month: "long" },
      );

      // Notify homeowner
      const { error: clientNotifError } = await supabase
        .from("notifications")
        .insert({
          user_id: job.client_id,
          title: "Session Tomorrow",
          message: `Reminder: Your ${tradeLabel} session is scheduled for ${dateLabel} at ${timeLabel}.`,
          type: "session_reminder",
          read: false,
          metadata: {
            session_id: session.id,
            recurring_job_id: job.id,
            scheduled_date: tomorrowStr,
            trade_category: job.trade_category,
          },
        });

      if (clientNotifError) {
        errors.push(
          `Session ${session.id}: failed to notify homeowner — ${clientNotifError.message}`,
        );
      } else {
        remindersSent++;
      }

      // Notify tradie (if assigned)
      if (job.tradie_id) {
        const locationNote = job.location ? ` at ${job.location}` : "";
        const { error: tradieNotifError } = await supabase
          .from("notifications")
          .insert({
            user_id: job.tradie_id,
            title: "Session Tomorrow",
            message: `Reminder: ${tradeLabel} session${locationNote} is scheduled for ${dateLabel} at ${timeLabel}.`,
            type: "session_reminder",
            read: false,
            metadata: {
              session_id: session.id,
              recurring_job_id: job.id,
              scheduled_date: tomorrowStr,
              trade_category: job.trade_category,
            },
          });

        if (tradieNotifError) {
          errors.push(
            `Session ${session.id}: failed to notify tradie — ${tradieNotifError.message}`,
          );
        } else {
          remindersSent++;
        }
      }
    }

    return jsonResponse({
      reminders_sent: remindersSent,
      sessions_checked: sessions.length,
      errors: errors.length > 0 ? errors : undefined,
    });
  } catch (err) {
    console.error("send-recurring-reminders error:", err);
    const message = err instanceof Error ? err.message : "Internal server error";
    return errorJson(message, 500);
  }
});
