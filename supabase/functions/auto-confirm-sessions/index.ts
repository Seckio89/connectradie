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

const DEFAULT_SESSION_DURATION_HOURS = 2;

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

    const now = new Date().toISOString();

    // Find all pending_confirmation sessions past their deadline
    const { data: expiredSessions, error: fetchError } = await supabase
      .from("recurring_sessions")
      .select(`
        id,
        recurring_job_id,
        scheduled_date,
        recurring_job:recurring_jobs!recurring_sessions_recurring_job_id_fkey(
          client_id,
          tradie_id,
          trade_category,
          service_subtype,
          preferred_time
        )
      `)
      .eq("status", "pending_confirmation")
      .lt("confirmation_deadline", now);

    if (fetchError) {
      console.error("Failed to fetch expired sessions:", fetchError);
      return errorJson("Failed to fetch expired sessions", 500);
    }

    if (!expiredSessions || expiredSessions.length === 0) {
      return jsonResponse({ auto_confirmed: 0, errors: [] });
    }

    let autoConfirmed = 0;
    const errors: string[] = [];

    for (const session of expiredSessions) {
      try {
        // Auto-confirm the session
        const { error: updateError } = await supabase
          .from("recurring_sessions")
          .update({ status: "scheduled", confirmation_deadline: null })
          .eq("id", session.id);

        if (updateError) {
          errors.push(
            `Session ${session.id}: failed to auto-confirm — ${updateError.message}`,
          );
          continue;
        }

        autoConfirmed++;

        const job = session.recurring_job as {
          client_id: string;
          tradie_id: string | null;
          trade_category: string;
          service_subtype: string | null;
          preferred_time: string | null;
        } | null;

        if (!job) continue;

        const tradeLabel = (job.service_subtype || job.trade_category)
          .replace(/_/g, " ")
          .replace(/\b\w/g, (c: string) => c.toUpperCase());

        const dateLabel = new Date(
          session.scheduled_date + "T00:00:00",
        ).toLocaleDateString("en-AU", {
          weekday: "short",
          day: "numeric",
          month: "short",
        });

        // Block tradie availability now
        if (job.tradie_id) {
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
                date: session.scheduled_date,
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

        // Notify both parties
        const notifications = [];

        if (job.tradie_id) {
          notifications.push({
            user_id: job.tradie_id,
            type: "recurring_job_auto_confirmed",
            message: `Your ${tradeLabel} session on ${dateLabel} was auto-confirmed (no response within 48 hours).`,
            metadata: {
              recurring_job_id: session.recurring_job_id,
              session_date: session.scheduled_date,
            },
            read: false,
          });
        }

        notifications.push({
          user_id: job.client_id,
          type: "recurring_job_auto_confirmed",
          message: `${tradeLabel} session on ${dateLabel} has been auto-confirmed with your tradie.`,
          metadata: {
            recurring_job_id: session.recurring_job_id,
            session_date: session.scheduled_date,
          },
          read: false,
        });

        if (notifications.length > 0) {
          try {
            await supabase.from("notifications").insert(notifications);
          } catch {
            // Non-critical
          }
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        errors.push(`Session ${session.id}: unexpected error — ${msg}`);
      }
    }

    return jsonResponse({
      auto_confirmed: autoConfirmed,
      total_expired: expiredSessions.length,
      errors,
    });
  } catch (err) {
    console.error("auto-confirm-sessions error:", err);
    const message =
      err instanceof Error ? err.message : "Internal server error";
    return errorJson(message, 500);
  }
});
