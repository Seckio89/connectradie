import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

function requireEnv(key: string): string {
  const val = Deno.env.get(key);
  if (!val) throw new Error(`Missing required env var: ${key}`);
  return val;
}

const corsHeaders = {
  "Access-Control-Allow-Origin": Deno.env.get("ALLOWED_ORIGIN") || "*",
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

// Frequency conventions: -1 = weekly, -2 = fortnightly, positive = months
function calculateNextDueDate(current: string, frequencyMonths: number): string {
  const base = new Date(current);
  if (frequencyMonths === -1) {
    base.setDate(base.getDate() + 7);
  } else if (frequencyMonths === -2) {
    base.setDate(base.getDate() + 14);
  } else if (frequencyMonths > 0) {
    base.setMonth(base.getMonth() + frequencyMonths);
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

    const today = new Date().toISOString().split("T")[0];

    // Fetch all active recurring jobs where next_due_date <= today
    const { data: dueJobs, error: fetchError } = await supabase
      .from("recurring_jobs")
      .select("id, frequency_months, next_due_date, times_completed")
      .eq("is_active", true)
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
          // Insert the session
          const { error: insertError } = await supabase
            .from("recurring_sessions")
            .insert({
              recurring_job_id: job.id,
              scheduled_date: scheduledDate,
              status: "scheduled",
            });

          if (insertError) {
            errors.push(`Job ${job.id}: failed to create session — ${insertError.message}`);
            continue;
          }

          sessionsCreated++;
        }

        // Advance next_due_date and increment times_completed
        const nextDue = calculateNextDueDate(scheduledDate, job.frequency_months);
        const { error: updateError } = await supabase
          .from("recurring_jobs")
          .update({
            next_due_date: nextDue,
            times_completed: (job.times_completed ?? 0) + 1,
          })
          .eq("id", job.id);

        if (updateError) {
          errors.push(`Job ${job.id}: session created but failed to advance due date — ${updateError.message}`);
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
