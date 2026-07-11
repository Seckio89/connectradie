import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.4";

/*
  geofence-event — receives native background-geolocation geofence crossings.

  The @transistorsoft/capacitor-background-geolocation plugin POSTs here directly
  from NATIVE code (its built-in HTTP layer), so events land even when the app is
  fully closed — no WebView involved. Because a Supabase JWT would be long expired
  by the time a background event fires, auth is a per-device opaque token
  (X-Geofence-Token) resolved to a tradie via device_geofence_tokens.

  Deploy WITHOUT JWT verification (custom token auth):
    supabase functions deploy geofence-event --no-verify-jwt

  Payload (transistorsoft default, httpRootProperty="location"):
    { "location": <record> }              // single
    { "location": [ <record>, ... ] }     // batchSync
  Each record: { coords:{latitude,longitude}, timestamp, geofence:{ identifier,
  action:"ENTER"|"EXIT"|"DWELL", extras:{ job_id, quote_id } } }
*/

const corsHeaders = {
  "Access-Control-Allow-Origin": Deno.env.get("ALLOWED_ORIGIN") || "https://connectradie.com",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey, X-Geofence-Token",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

interface GeofenceRecord {
  coords?: { latitude?: number; longitude?: number };
  timestamp?: string;
  geofence?: {
    identifier?: string;
    action?: string;
    extras?: { job_id?: string; quote_id?: string };
  };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 200, headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!supabaseUrl || !serviceKey) return json({ error: "Server configuration error" }, 500);

    // --- Auth: per-device geofence token ---
    const deviceToken = req.headers.get("X-Geofence-Token");
    if (!deviceToken) return json({ error: "Missing X-Geofence-Token" }, 401);

    const supabase = createClient(supabaseUrl, serviceKey);

    const { data: tokenRow, error: tokenError } = await supabase
      .from("device_geofence_tokens")
      .select("tradie_id")
      .eq("token", deviceToken)
      .maybeSingle();

    if (tokenError || !tokenRow) return json({ error: "Invalid device token" }, 401);
    const tradieId = tokenRow.tradie_id as string;

    // Best-effort touch of last_used_at (non-critical).
    supabase
      .from("device_geofence_tokens")
      .update({ last_used_at: new Date().toISOString() })
      .eq("token", deviceToken)
      .then(() => {}, () => {});

    // --- Parse payload ---
    let body: { location?: GeofenceRecord | GeofenceRecord[] };
    try {
      body = await req.json();
    } catch {
      return json({ error: "Invalid JSON body" }, 400);
    }

    const raw = body.location;
    const records: GeofenceRecord[] = Array.isArray(raw) ? raw : raw ? [raw] : [];
    if (records.length === 0) return json({ received: 0 });

    let recorded = 0;

    for (const rec of records) {
      const gf = rec.geofence;
      if (!gf) continue; // plain location ping, not a geofence crossing
      const action = gf.action;
      if (action !== "ENTER" && action !== "EXIT") continue; // ignore DWELL

      const jobId = gf.extras?.job_id;
      const quoteId = gf.extras?.quote_id ?? gf.identifier;
      if (!jobId) continue; // can't attribute without a job

      // Guard against STALE geofences: if a job has ended/cancelled but its
      // geofence hasn't been removed from the device yet (device only reconciles
      // on next app-open), silently drop the crossing rather than logging a
      // bogus arrival. Fetched once here and reused by the arrival-notify path.
      const { data: job } = await supabase
        .from("jobs")
        .select("status, client_id, title, description")
        .eq("id", jobId)
        .maybeSingle();
      if (!job) continue;
      if (["completed", "cancelled", "declined"].includes(job.status as string)) {
        continue; // terminal job — geofence is stale, ignore
      }

      const occurredAt = rec.timestamp || new Date().toISOString();
      const lat = rec.coords?.latitude ?? null;
      const lng = rec.coords?.longitude ?? null;

      const { error: insertError } = await supabase.from("site_visit_events").insert({
        tradie_id: tradieId,
        job_id: jobId,
        quote_id: quoteId ?? null,
        action,
        occurred_at: occurredAt,
        latitude: lat,
        longitude: lng,
      });

      if (insertError) {
        console.error("geofence-event: insert failed", insertError);
        continue;
      }
      recorded++;

      // On arrival, notify the client AND the arriving worker's contractor (the
      // "first contractor" who assigned them) — but only once per visit window
      // (a GPS bounce in/out shouldn't spam), and only recipients who haven't
      // muted "site arrival" alerts.
      if (action === "ENTER") {
        try {
          const sixHoursAgo = new Date(Date.now() - 6 * 60 * 60 * 1000).toISOString();
          const { count } = await supabase
            .from("site_visit_events")
            .select("id", { count: "exact", head: true })
            .eq("job_id", jobId)
            .eq("tradie_id", tradieId)
            .eq("action", "ENTER")
            .gte("occurred_at", sixHoursAgo);

          // count includes the row we just inserted; >1 means a recent prior ENTER.
          if ((count ?? 1) <= 1) {
            const { data: worker } = await supabase
              .from("profiles")
              .select("full_name, employer_id, employer_status")
              .eq("id", tradieId)
              .maybeSingle();

            const tradieName = worker?.full_name || "Your tradie";
            const jobTitle = job.title
              || job.description?.match(/^\[([^\]]+)\]/)?.[1]?.replace(/_/g, " ")
              || "your job";

            // Client + the worker's ACTIVE employer, de-duplicated.
            const employerId =
              worker?.employer_status === "active" && worker?.employer_id ? worker.employer_id : null;
            const recipientIds = [job.client_id, employerId]
              .filter((id): id is string => !!id)
              .filter((id, i, arr) => arr.indexOf(id) === i);

            if (recipientIds.length) {
              // Respect each recipient's mute preference.
              const { data: prefs } = await supabase
                .from("profiles")
                .select("id, notify_site_arrival")
                .in("id", recipientIds);
              const muted = new Set(
                (prefs ?? []).filter((p) => p.notify_site_arrival === false).map((p) => p.id),
              );
              const rows = recipientIds
                .filter((id) => !muted.has(id))
                .map((id) => ({
                  user_id: id,
                  type: "site_arrival",
                  title: "Tradie arrived on site",
                  message: id === job.client_id
                    ? `${tradieName} has arrived at the site for ${jobTitle}.`
                    : `${tradieName} has arrived on site for ${jobTitle}.`,
                  job_id: jobId,
                  metadata: { quote_id: quoteId ?? null, tradie_id: tradieId },
                  read: false,
                }));
              if (rows.length) await supabase.from("notifications").insert(rows);
            }
          }
        } catch (notifyErr) {
          console.warn("geofence-event: arrival notify failed", notifyErr);
        }
      }
    }

    return json({ received: records.length, recorded });
  } catch (err) {
    console.error("Error in geofence-event:", err);
    return json({ error: "An internal error occurred" }, 500);
  }
});
