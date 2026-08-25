import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.4";
import type { Insert } from "../_shared/dbTypes.ts";
import { checkRateLimit } from "../_shared/rateLimiter.ts";
import { getGoogleAccessToken, type IntegrationPatch } from "../_shared/googleToken.ts";
import { createGoogleSession, GoogleAuthExpired } from "../_shared/googleApi.ts";

/*
  google-calendar-import — one-time Google Calendar → ConnecTradie import.

    action: "calendars"  → list ALL the user's calendars (id, name, colour) so
                           they can pick which to import and map each to a team
                           member. Needs the calendar.readonly scope.
    action: "import"     → given { calendars: [{ id, summary, color, teamMemberId }],
                           timeMin, timeMax } pull every event from each calendar
                           and upsert it into imported_calendar_visits. Dedup is
                           by (business_owner_id, google_event_id), so re-running
                           updates existing rows instead of creating duplicates.

  Reuses the token stored by google-calendar-oauth in calendar_integrations,
  refreshing it when expired. Deploy with gateway JWT verification (default).
*/

const ALLOWED_ORIGINS = [
  Deno.env.get("ALLOWED_ORIGIN") || "https://connectradie.com",
  "http://localhost:5173",
  "http://localhost:4173",
  "http://127.0.0.1:5173",
];
function corsFor(req: Request) {
  const origin = req.headers.get("Origin") || "";
  const allow = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    "Access-Control-Allow-Origin": allow,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
    "Vary": "Origin",
  };
}

interface GEvent {
  id: string;
  status?: string;
  summary?: string;
  description?: string;
  location?: string;
  start?: { dateTime?: string; date?: string };
  end?: { dateTime?: string; date?: string };
}

Deno.serve(async (req: Request) => {
  const cors = corsFor(req);
  const json = (b: unknown, status = 200) =>
    new Response(JSON.stringify(b), { status, headers: { ...cors, "Content-Type": "application/json" } });

  if (req.method === "OPTIONS") return new Response(null, { status: 200, headers: cors });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceKey);

    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) return json({ error: "Missing authorization" }, 401);
    const { data: { user }, error: authErr } = await supabase.auth.getUser(authHeader.slice(7));
    if (authErr || !user) return json({ error: "Unauthorized" }, 401);

    // Spends Google Calendar API quota.
    const { allowed } = await checkRateLimit(`${user.id}-google-calendar-import`, 5, 60000);
    if (!allowed) return json({ error: "Rate limit exceeded. Please try again later." }, 429);

    // --- Google access token (from google-calendar-oauth), refreshed if stale ---
    const { data: integration } = await supabase
      .from("calendar_integrations")
      .select("*")
      .eq("tradie_id", user.id)
      .eq("provider", "google")
      .maybeSingle();
    if (!integration) return json({ error: "Connect Google Calendar first." }, 404);

    const clientId = Deno.env.get("GOOGLE_CLIENT_ID");
    const clientSecret = Deno.env.get("GOOGLE_CLIENT_SECRET");
    if (!clientId || !clientSecret) return json({ error: "Google not configured" }, 500);

    const persistToken = async (patch: IntegrationPatch): Promise<void> => {
      const { error } = await supabase
        .from("calendar_integrations")
        .update(patch)
        .eq("id", integration.id);
      if (error) {
        console.error("calendar_integrations token write failed:", error.message);
        return;
      }
      // Keep the in-memory row in step with what was just stored, so a second
      // refresh in this same request uses a ROTATED token rather than the one it
      // replaced — which Google would refuse as invalid_grant.
      Object.assign(integration, patch);
    };

    const tokenFor = (force: boolean) =>
      getGoogleAccessToken({ integration, clientId, clientSecret, persist: persistToken, force });

    // Shared with sync-google-calendar. This function used to carry its own copy
    // of the refresh grant which persisted ONLY the access token — so the first
    // time Google rotated the refresh token, the new one was thrown away and the
    // integration became unrenewable. One implementation, one behaviour.
    const googleToken = await tokenFor(false);
    if (!googleToken.ok) {
      return json({
        error: googleToken.message,
        code: googleToken.code,
        detail: googleToken.detail,
        needsReconnect: googleToken.needsReconnect,
      }, 401);
    }

    const google = createGoogleSession({
      accessToken: googleToken.accessToken,
      refresh: () => tokenFor(true),
    });
    const gFetch = (url: string) => google.fetch(url);

    const body = await req.json().catch(() => ({}));
    const action = body.action as string;

    // ---- List calendars ----
    if (action === "calendars") {
      const res = await gFetch("https://www.googleapis.com/calendar/v3/users/me/calendarList?minAccessRole=reader");
      if (!res.ok) {
        const detail = await res.text();
        // 403 usually = the calendar.readonly scope isn't granted yet.
        return json({ error: "Couldn't list calendars. Reconnect Google Calendar and grant calendar access.", detail: detail.slice(0, 300) }, res.status === 403 ? 403 : 502);
      }
      const data = await res.json();
      const calendars = (data.items || []).map((c: Record<string, unknown>) => ({
        id: c.id,
        summary: c.summaryOverride || c.summary,
        backgroundColor: c.backgroundColor,
        primary: !!c.primary,
        accessRole: c.accessRole,
      }));
      return json({ calendars });
    }

    // ---- Import events from the selected calendars ----
    if (action === "import") {
      const calendars = Array.isArray(body.calendars) ? body.calendars as Array<{ id: string; summary?: string; color?: string; teamMemberId?: string | null }> : [];
      if (!calendars.length) return json({ error: "No calendars selected" }, 400);
      const timeMin = typeof body.timeMin === "string" ? body.timeMin : new Date(Date.now() - 365 * 864e5).toISOString();
      const timeMax = typeof body.timeMax === "string" ? body.timeMax : new Date(Date.now() + 365 * 864e5).toISOString();

      let total = 0, skipped = 0;
      const byCalendar: Record<string, number> = {};

      for (const cal of calendars) {
        let pageToken: string | undefined;
        // Annotated, not `Record<string, unknown>[]`: the annotation is what
        // makes every key column-checked. See ../_shared/dbTypes.ts.
        const rows: Insert<"imported_calendar_visits">[] = [];
        do {
          const u = new URL(`https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(cal.id)}/events`);
          u.searchParams.set("timeMin", timeMin);
          u.searchParams.set("timeMax", timeMax);
          u.searchParams.set("singleEvents", "true");
          u.searchParams.set("maxResults", "2500");
          u.searchParams.set("showDeleted", "false");
          if (pageToken) u.searchParams.set("pageToken", pageToken);
          const res = await gFetch(u.toString());
          if (!res.ok) { skipped++; break; }
          const data = await res.json();
          for (const ev of (data.items || []) as GEvent[]) {
            if (ev.status === "cancelled" || !ev.id) { skipped++; continue; }
            const startsAt = ev.start?.dateTime || (ev.start?.date ? `${ev.start.date}T00:00:00Z` : null);
            if (!startsAt) { skipped++; continue; }
            const allDay = !ev.start?.dateTime && !!ev.start?.date;
            const endsAt = ev.end?.dateTime || (ev.end?.date ? `${ev.end.date}T00:00:00Z` : null);
            rows.push({
              business_owner_id: user.id,
              team_member_id: cal.teamMemberId || null,
              google_calendar_id: cal.id,
              google_event_id: ev.id,
              title: (ev.summary || "").slice(0, 500),
              description: ev.description ? ev.description.slice(0, 5000) : null,
              location: ev.location ? ev.location.slice(0, 500) : null,
              starts_at: startsAt,
              ends_at: endsAt,
              all_day: allDay,
              color: cal.color || null,
              source_calendar: cal.summary || null,
              updated_at: new Date().toISOString(),
            });
          }
          pageToken = data.nextPageToken;
        } while (pageToken);

        if (rows.length) {
          // Upsert in chunks — dedup on (business_owner_id, google_event_id).
          for (let i = 0; i < rows.length; i += 500) {
            const chunk = rows.slice(i, i + 500);
            const { error } = await supabase
              .from("imported_calendar_visits")
              .upsert(chunk, { onConflict: "business_owner_id,google_event_id" });
            if (error) { console.error("upsert failed", error); return json({ error: "Failed to save imported events", detail: error.message }, 500); }
          }
        }
        byCalendar[cal.summary || cal.id] = rows.length;
        total += rows.length;
      }

      return json({ imported: total, skipped, byCalendar });
    }

    return json({ error: "Unknown action" }, 400);
  } catch (err) {
    // A dead grant is actionable; "Internal error" is not.
    if (err instanceof GoogleAuthExpired) {
      return json({
        error: err.message,
        code: err.code,
        detail: err.detail,
        needsReconnect: err.needsReconnect,
      }, 401);
    }
    console.error("google-calendar-import error", err);
    return json({ error: err instanceof Error ? err.message : "Internal error" }, 500);
  }
});
