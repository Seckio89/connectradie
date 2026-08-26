// ─────────────────────────────────────────────────────────────────────────────
// refresh-calendar-tokens — six-hourly cron heartbeat for Google Calendar.
//
// WHY THIS EXISTS. Token refresh used to run only when a person acted: a sync,
// an import, or the dashboard's "Test connection" button. A connection nobody
// touched was never exercised, so a dead authorisation (Google's 7-day expiry
// while the OAuth consent screen sat in "Testing", a revocation at
// myaccount.google.com) surfaced only when a tradie next pressed something —
// which for the 2026-08-20 breakage meant it surfaced never, and the proof that
// refresh worked at all depended on someone remembering to press Test on day 8.
//
// This sweep exercises the refresh grant for every enabled integration on a
// schedule. All the interesting behaviour lives in _shared/googleToken.ts and
// is already unit-tested there: a token still comfortably inside its life is
// left alone (zero Google calls), an expiring one is renewed, a rotated refresh
// token is persisted, and every outcome is written to the row —
// last_refresh_ok_at on success; last_refresh_error* and needs_reconnect on a
// failure that reconnecting would actually fix. The dashboard reads
// needs_reconnect and flips its button to "Reconnect Google Calendar" on its
// own, so a dead connection announces itself instead of waiting to be found.
//
// WHAT THIS DELIBERATELY DOES NOT DO:
//   - Touch rows already flagged needs_reconnect. No server-side retry can
//     revive a dead grant — only the tradie re-consenting mints a new one — and
//     hammering Google's token endpoint with known-dead grants is how a client
//     gets rate-limited. Reconnecting clears the flag, which re-enrols the row.
//   - Sync anything. No calendar reads, no event writes, and last_synced_at is
//     never stamped here. This is a credential heartbeat, nothing more.
//   - Notify more than once. The notification inserts only on the transition
//     into needs_reconnect (the row was healthy this run and is not now), so a
//     connection that stays dead does not nag four times a day.
//
// AUTH. Driven by pg_cron presenting the service-role key as a Bearer token —
// same shape as credential-expiry-sweep. verify_jwt stays true (pinned in
// config.toml as documentation), and hasServiceRole probes the presented key
// against an admin-only API, so neither the anon key nor a signed-in user's JWT
// can trigger a fleet-wide sweep.
// ─────────────────────────────────────────────────────────────────────────────

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.4";
import { hasServiceRole } from "../_shared/serviceAuth.ts";
import { getGoogleAccessToken, type IntegrationPatch } from "../_shared/googleToken.ts";
import type { Insert } from "../_shared/dbTypes.ts";

const ALLOWED_ORIGINS = [
  Deno.env.get("ALLOWED_ORIGIN") || "https://connectradie.com",
];
function corsFor(req: Request) {
  const origin = req.headers.get("Origin") || "";
  const allowOrigin = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Origin": allowOrigin,
    "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
    "Vary": "Origin",
  };
}

interface HeartbeatRow {
  id: string;
  tradie_id: string;
  access_token: string;
  refresh_token: string | null;
  token_expires_at: string;
}

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
    const clientId = Deno.env.get("GOOGLE_CLIENT_ID");
    const clientSecret = Deno.env.get("GOOGLE_CLIENT_SECRET");
    if (!supabaseUrl || !serviceKey) {
      console.error("refresh-calendar-tokens: missing environment configuration");
      return json({ error: "Server configuration error" }, 500);
    }
    if (!clientId || !clientSecret) {
      // Without credentials no refresh can succeed; answering 200 here would be
      // a heartbeat that reports a pulse it never took.
      console.error("refresh-calendar-tokens: GOOGLE_CLIENT_ID/SECRET not configured");
      return json({ error: "Google Calendar not configured" }, 500);
    }

    if (!(await hasServiceRole(req.headers.get("Authorization"), supabaseUrl))) {
      return json({ error: "Service role required" }, 401);
    }

    const supabase = createClient(supabaseUrl, serviceKey);

    const { data: rows, error: readError } = await supabase
      .from("calendar_integrations")
      .select("id, tradie_id, access_token, refresh_token, token_expires_at")
      .eq("provider", "google")
      .eq("sync_enabled", true)
      .eq("needs_reconnect", false);

    if (readError) {
      console.error("refresh-calendar-tokens: failed to read integrations:", readError.message);
      return json({ error: "Failed to read integrations" }, 500);
    }

    const integrations = (rows ?? []) as HeartbeatRow[];
    let refreshed = 0;
    let stillFresh = 0;
    let newlyDead = 0;
    let transientErrors = 0;

    // Sequential on purpose. The fleet is small, each refresh is one HTTPS
    // round-trip, and Google rate-limits its token endpoint per client — a
    // parallel burst is exactly the shape that trips it.
    for (const integration of integrations) {
      const persist = async (patch: IntegrationPatch): Promise<void> => {
        const { error } = await supabase
          .from("calendar_integrations")
          .update(patch)
          .eq("id", integration.id);
        if (error) {
          console.error(
            `refresh-calendar-tokens: write failed for integration ${integration.id}:`,
            error.message,
          );
        }
      };

      try {
        const result = await getGoogleAccessToken({
          integration,
          clientId,
          clientSecret,
          persist,
        });

        if (result.ok) {
          if (result.refreshed) refreshed++;
          else stillFresh++;
          continue;
        }

        if (result.needsReconnect) {
          // This row was healthy when selected (the query filters
          // needs_reconnect = false), so this is the TRANSITION into dead —
          // the one moment worth a notification. Subsequent runs skip the row.
          newlyDead++;
          console.error(
            `refresh-calendar-tokens: integration ${integration.id} needs reconnect (${result.code})`,
          );
          const notification: Insert<"notifications"> = {
            user_id: integration.tradie_id,
            title: "Reconnect Google Calendar",
            message:
              "Google no longer accepts the saved authorisation, so calendar sync has stopped. Reconnect from your dashboard to start it again.",
            type: "system",
            notification_type: "calendar_reconnect",
            channel: "in_app",
            read: false,
            link: "/dashboard",
          };
          const { error: notifyError } = await supabase.from("notifications").insert(notification);
          if (notifyError) {
            console.error(
              `refresh-calendar-tokens: could not notify tradie ${integration.tradie_id}:`,
              notifyError.message,
            );
          }
        } else {
          // invalid_client, a 5xx, an HTML proxy page. The row records the code;
          // the next run retries. Not a reconnect matter, so no notification.
          transientErrors++;
          console.error(
            `refresh-calendar-tokens: refresh refused for integration ${integration.id} (${result.code})`,
          );
        }
      } catch (err) {
        transientErrors++;
        console.error(
          `refresh-calendar-tokens: unexpected failure for integration ${integration.id}:`,
          err,
        );
      }
    }

    console.info(
      `refresh-calendar-tokens: ${integrations.length} checked — ${refreshed} refreshed, ${stillFresh} still fresh, ${newlyDead} newly dead, ${transientErrors} transient`,
    );

    return json({
      checked: integrations.length,
      refreshed,
      stillFresh,
      newlyDead,
      transientErrors,
    });
  } catch (err) {
    console.error("refresh-calendar-tokens error:", err);
    return json({ error: err instanceof Error ? err.message : "Internal error" }, 500);
  }
});
