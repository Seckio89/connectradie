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

const DEFAULT_SESSION_DURATION_HOURS = 2;
const DEFAULT_PREFERRED_TIME = "09:00:00";

function addHoursToTime(time: string, hours: number): string {
  const [h, m] = time.split(":").map(Number);
  const totalMinutes = (h + hours) * 60 + m;
  const newH = Math.min(Math.floor(totalMinutes / 60), 23);
  const newM = totalMinutes % 60;
  return `${String(newH).padStart(2, "0")}:${String(newM).padStart(2, "0")}:00`;
}

// Frequency conventions: -3 = daily, -1 = weekly, -2 = fortnightly, positive = months
function calculateNextDueDate(current: string, frequencyMonths: number): string {
  const base = new Date(current + "T00:00:00");
  if (frequencyMonths === -3) {
    base.setDate(base.getDate() + 1);
  } else if (frequencyMonths === -1) {
    base.setDate(base.getDate() + 7);
  } else if (frequencyMonths === -2) {
    base.setDate(base.getDate() + 14);
  } else if (frequencyMonths > 0) {
    // Clamp to last day of target month to prevent drift (e.g. Jan 31 + 1m = Feb 28)
    const targetDay = base.getDate();
    base.setDate(1);
    base.setMonth(base.getMonth() + frequencyMonths);
    const lastDay = new Date(base.getFullYear(), base.getMonth() + 1, 0).getDate();
    base.setDate(Math.min(targetDay, lastDay));
  }
  return base.toISOString().split("T")[0];
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

    // Verify caller is using service role key or anon key (cron/internal only)
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

    // Use AEST (UTC+10) since this is an Australian platform
    const aestOffset = 10 * 60 * 60 * 1000;
    const today = new Date(Date.now() + aestOffset).toISOString().split("T")[0];

    // Fetch all active recurring jobs where next_due_date <= today
    const { data: dueJobs, error: fetchError } = await supabase
      .from("recurring_jobs")
      .select("id, frequency_months, next_due_date, times_completed, tradie_id, preferred_time, auto_accept")
      .eq("is_active", true)
      .is("cancelled_at", null)
      .not("tradie_id", "is", null)
      .lte("next_due_date", today);

    if (fetchError) {
      console.error("Failed to fetch due jobs:", fetchError);
      return errorJson("Failed to fetch due jobs", 500);
    }

    if (!dueJobs || dueJobs.length === 0) {
      return jsonResponse({
        processed: 0,
        sessions_created: 0,
        skipped_duplicates: 0,
        errors: [],
      });
    }

    let sessionsCreated = 0;
    let skippedDuplicates = 0;
    const errors: string[] = [];

    for (const job of dueJobs) {
      try {
        const scheduledDate = job.next_due_date;

        // Check if a session already exists for this date
        const { data: existing, error: checkError } = await supabase
          .from("recurring_sessions")
          .select("id")
          .eq("recurring_job_id", job.id)
          .eq("scheduled_date", scheduledDate)
          .maybeSingle();

        if (checkError) {
          errors.push(`Job ${job.id}: failed to check duplicates — ${checkError.message}`);
          continue;
        }

        if (existing) {
          skippedDuplicates++;
        } else {
          // Auto-accept: skip confirmation step, go straight to scheduled
          const isAutoAccept = !!(job as Record<string, unknown>).auto_accept;
          const sessionStatus = isAutoAccept ? "scheduled" : "pending_confirmation";
          const confirmationDeadline = isAutoAccept
            ? null
            : new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString();

          const { data: newSession, error: insertError } = await supabase
            .from("recurring_sessions")
            .insert({
              recurring_job_id: job.id,
              scheduled_date: scheduledDate,
              status: sessionStatus,
              confirmation_deadline: confirmationDeadline,
            })
            .select("id")
            .single();

          if (insertError) {
            errors.push(`Job ${job.id}: failed to create session — ${insertError.message}`);
            continue;
          }

          sessionsCreated++;

          // Block tradie availability if auto-accepted
          if (isAutoAccept && job.tradie_id && newSession) {
            try {
              const startTime = job.preferred_time || "09:00:00";
              const [h, m] = startTime.split(":").map(Number);
              const totalMinutes = (h + DEFAULT_SESSION_DURATION_HOURS) * 60 + m;
              const endH = Math.min(Math.floor(totalMinutes / 60), 23);
              const endM = totalMinutes % 60;
              const endTime = `${String(endH).padStart(2, "0")}:${String(endM).padStart(2, "0")}:00`;

              await supabase.from("tradie_availability").upsert(
                {
                  tradie_id: job.tradie_id,
                  date: scheduledDate,
                  start_time: startTime,
                  end_time: endTime,
                  is_blocked: true,
                  reason: "recurring_job",
                },
                { onConflict: "tradie_id,date,start_time" },
              );
            } catch {
              // Non-critical
            }
          }

          // Notify tradie
          if (job.tradie_id && newSession) {
            try {
              await supabase.from("notifications").insert({
                user_id: job.tradie_id,
                type: isAutoAccept ? "recurring_job_auto_confirmed" : "recurring_job_confirmation_required",
                message: isAutoAccept
                  ? `Your recurring session on ${scheduledDate} has been auto-confirmed and added to your schedule.`
                  : `You have a recurring session on ${scheduledDate} awaiting your confirmation. Please confirm within 48 hours.`,
                metadata: {
                  recurring_job_id: job.id,
                  session_id: newSession.id,
                  next_date: scheduledDate,
                },
                read: false,
              });
            } catch {
              // Non-critical
            }
          }

          // Note: availability blocking now happens when tradie confirms the session

          // Advance next_due_date (only when session was actually created)
          const nextDue = calculateNextDueDate(scheduledDate, job.frequency_months);
          const { error: updateError } = await supabase
            .from("recurring_jobs")
            .update({ next_due_date: nextDue })
            .eq("id", job.id);

          if (updateError) {
            errors.push(`Job ${job.id}: session created but failed to advance due date — ${updateError.message}`);
          }
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        errors.push(`Job ${job.id}: unexpected error — ${msg}`);
      }
    }

    return jsonResponse({
      processed: dueJobs.length,
      sessions_created: sessionsCreated,
      skipped_duplicates: skippedDuplicates,
      errors,
    });
  } catch (err) {
    console.error("generate-recurring-sessions error:", err);
    const message = err instanceof Error ? err.message : "Internal server error";
    return errorJson(message, 500);
  }
});
