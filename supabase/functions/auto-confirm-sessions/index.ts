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

    // Caller has already passed Supabase JWT verification (verify_jwt=true).
    // Defence-in-depth: require the bearer be a JWT (starts with 'ey').
    // We deliberately do NOT byte-compare against env var — the auto-injected
    // SUPABASE_SERVICE_ROLE_KEY can drift from the vault-stored secret used by
    // pg_cron after key rotations, and that mismatch silently 401'd everything.
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ey")) {
      return errorJson("Unauthorized", 401);
    }

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

    let autoConfirmed = 0;
    const errors: string[] = [];

    for (const session of (expiredSessions ?? [])) {
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

    // ─── AUTO-COMPLETE: Mark past scheduled sessions as completed ───
    // Includes today's sessions where end_time has already passed
    let autoCompleted = 0;
    let awaitingTradieConfirmation = 0;
    try {
      // Use AEST (UTC+10) since this is an Australian platform
      const aestOffset = 10 * 60 * 60 * 1000;
      const nowDate = new Date(Date.now() + aestOffset);
      const today = nowDate.toISOString().split("T")[0];

      const { data: candidateSessions, error: pastError } = await supabase
        .from("recurring_sessions")
        .select(`
          id,
          recurring_job_id,
          scheduled_date,
          start_time,
          end_time,
          recurring_job:recurring_jobs!recurring_sessions_recurring_job_id_fkey(
            client_id,
            tradie_id,
            trade_category,
            service_subtype,
            preferred_time
          )
        `)
        .eq("status", "scheduled")
        .lte("scheduled_date", today);

      // Resolve each tradie's auto_complete_sessions preference up front so we
      // don't query profiles in a tight per-session loop. Tradies who opt out
      // get their sessions parked in 'awaiting_completion' for manual sign-off.
      const tradieIds = Array.from(new Set(
        (candidateSessions ?? [])
          .map((s) => (s.recurring_job as { tradie_id?: string | null } | null)?.tradie_id)
          .filter((id): id is string => !!id),
      ));
      const autoCompletePrefs = new Map<string, boolean>();
      if (tradieIds.length > 0) {
        const { data: tradiePrefs } = await supabase
          .from("profiles")
          .select("id, auto_complete_sessions")
          .in("id", tradieIds);
        for (const t of tradiePrefs ?? []) {
          // Default true — preserves legacy behaviour for any pre-migration tradie.
          autoCompletePrefs.set(t.id, t.auto_complete_sessions ?? true);
        }
      }

      // Filter: past dates always qualify; today's sessions only if end_time has passed
      const pastSessions = (candidateSessions ?? []).filter((s: { scheduled_date: string; start_time: string | null; end_time: string | null; recurring_job: { client_id: string; preferred_time: string | null } | null }) => {
        if (s.scheduled_date < today) return true;
        // Today's session — check if end_time has passed
        const startTime = s.start_time || s.recurring_job?.preferred_time || null;
        const endTime = s.end_time || (startTime ? (() => {
          const [h, m] = startTime.split(":").map(Number);
          const total = (h + DEFAULT_SESSION_DURATION_HOURS) * 60 + m;
          const eH = Math.min(Math.floor(total / 60), 23);
          const eM = total % 60;
          return `${String(eH).padStart(2, "0")}:${String(eM).padStart(2, "0")}:00`;
        })() : null);
        if (!endTime) return false; // No time set — don't auto-complete today's session
        const [h, m] = endTime.split(":").map(Number);
        const endDate = new Date(nowDate);
        endDate.setHours(h, m, 0, 0);
        return nowDate >= endDate;
      });

      // Split: tradies opted in → auto-complete now; opted out → park in
      // 'awaiting_completion' and ping the tradie to confirm manually.
      const sessionsToAutoComplete = pastSessions.filter((s) => {
        const tradieId = (s.recurring_job as { tradie_id?: string | null } | null)?.tradie_id;
        if (!tradieId) return true;
        return autoCompletePrefs.get(tradieId) ?? true;
      });
      const sessionsAwaitingTradie = pastSessions.filter((s) => {
        const tradieId = (s.recurring_job as { tradie_id?: string | null } | null)?.tradie_id;
        if (!tradieId) return false;
        return !(autoCompletePrefs.get(tradieId) ?? true);
      });

      // ── Branch A: tradie opted out — flip to 'awaiting_completion' once. ──
      // We only want to notify on the first transition; sessions already in
      // awaiting_completion are skipped by the .eq('status','scheduled') filter
      // above, so this insert won't double-fire on subsequent cron runs.
      if (sessionsAwaitingTradie.length > 0) {
        const awaitingIds = sessionsAwaitingTradie.map((s: { id: string }) => s.id);
        const { error: awaitingErr } = await supabase
          .from("recurring_sessions")
          .update({ status: "awaiting_completion" })
          .in("id", awaitingIds);
        if (!awaitingErr) {
          awaitingTradieConfirmation = awaitingIds.length;
          const awaitNotifs = sessionsAwaitingTradie.flatMap((s) => {
            const job = s.recurring_job as { client_id: string; tradie_id: string | null; trade_category: string; service_subtype: string | null } | null;
            if (!job?.tradie_id) return [];
            const tradeLabel = (job.service_subtype || job.trade_category)
              .replace(/_/g, " ")
              .replace(/\b\w/g, (c: string) => c.toUpperCase());
            const dateLabel = new Date(s.scheduled_date + "T00:00:00").toLocaleDateString("en-AU", { weekday: "short", day: "numeric", month: "short" });
            return [{
              user_id: job.tradie_id,
              type: "session_awaiting_completion",
              title: "Confirm session completion",
              message: `Did you finish your ${tradeLabel} visit on ${dateLabel}? Tap to mark it complete so the client can be invoiced.`,
              metadata: { recurring_job_id: s.recurring_job_id, session_date: s.scheduled_date },
              read: false,
            }];
          });
          if (awaitNotifs.length > 0) {
            try { await supabase.from("notifications").insert(awaitNotifs); } catch { /* non-critical */ }
          }
        } else {
          console.error("[auto-confirm] Failed to mark sessions awaiting_completion:", awaitingErr);
        }
      }

      if (!pastError && sessionsToAutoComplete.length > 0) {
        const ids = sessionsToAutoComplete.map((s: { id: string }) => s.id);
        const { error: completeError } = await supabase
          .from("recurring_sessions")
          .update({ status: "completed" })
          .in("id", ids);

        if (!completeError) {
          autoCompleted = ids.length;
          console.log(`[auto-confirm] Auto-completed ${autoCompleted} past sessions`);

          // Update times_completed on each recurring job
          const jobCounts = new Map<string, number>();
          for (const s of sessionsToAutoComplete) {
            jobCounts.set(s.recurring_job_id, (jobCounts.get(s.recurring_job_id) || 0) + 1);
          }
          for (const [jobId, count] of jobCounts) {
            try {
              await supabase.rpc("increment_times_completed", { job_id: jobId, amount: count });
            } catch {
              // Fallback: direct update (awaited to avoid fire-and-forget)
              try {
                const { data: rj } = await supabase
                  .from("recurring_jobs")
                  .select("times_completed")
                  .eq("id", jobId)
                  .maybeSingle();
                if (rj) {
                  await supabase
                    .from("recurring_jobs")
                    .update({ times_completed: (rj.times_completed || 0) + count })
                    .eq("id", jobId);
                }
              } catch (fallbackErr) {
                console.error(`Failed to update times_completed for job ${jobId}:`, fallbackErr);
              }
            }
          }

          // Notify both tradie and client about auto-completed sessions
          const completionNotifications: {
            user_id: string;
            type: string;
            title: string;
            message: string;
            metadata: Record<string, string>;
            read: boolean;
          }[] = [];

          for (const s of sessionsToAutoComplete) {
            const job = s.recurring_job as {
              client_id: string;
              tradie_id: string | null;
              trade_category: string;
              service_subtype: string | null;
            } | null;

            if (!job) continue;

            const tradeLabel = (job.service_subtype || job.trade_category)
              .replace(/_/g, " ")
              .replace(/\b\w/g, (c: string) => c.toUpperCase());

            const dateLabel = new Date(
              s.scheduled_date + "T00:00:00",
            ).toLocaleDateString("en-AU", {
              weekday: "short",
              day: "numeric",
              month: "short",
            });

            // Notify tradie
            if (job.tradie_id) {
              completionNotifications.push({
                user_id: job.tradie_id,
                type: "session_completed",
                title: "Visit Auto-Completed",
                message: `Your ${tradeLabel} session on ${dateLabel} has been automatically marked as completed.`,
                metadata: {
                  recurring_job_id: s.recurring_job_id,
                  session_date: s.scheduled_date,
                },
                read: false,
              });
            }

            // Notify client
            completionNotifications.push({
              user_id: job.client_id,
              type: "session_completed",
              title: "Visit Completed",
              message: `Your ${tradeLabel} service visit on ${dateLabel} has been completed.`,
              metadata: {
                recurring_job_id: s.recurring_job_id,
                session_date: s.scheduled_date,
              },
              read: false,
            });
          }

          if (completionNotifications.length > 0) {
            try {
              await supabase.from("notifications").insert(completionNotifications);
            } catch {
              // Non-critical
            }
          }
        } else {
          console.error("[auto-confirm] Failed to auto-complete sessions:", completeError);
        }
      }
    } catch (err) {
      console.error("[auto-confirm] Auto-complete error:", err);
    }

    return jsonResponse({
      auto_confirmed: autoConfirmed,
      auto_completed: autoCompleted,
      awaiting_tradie_confirmation: awaitingTradieConfirmation,
      total_expired: (expiredSessions ?? []).length,
      errors,
    });
  } catch (err) {
    console.error("auto-confirm-sessions error:", err);
    const message =
      err instanceof Error ? err.message : "Internal server error";
    return errorJson(message, 500);
  }
});
