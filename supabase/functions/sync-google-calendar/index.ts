import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.4";
import { checkRateLimit } from "../_shared/rateLimiter.ts";
import { jobEventWindow, planConflictChanges } from "../_shared/calendarConflicts.ts";
import { getGoogleAccessToken, type IntegrationPatch } from "../_shared/googleToken.ts";
import { createGoogleSession, GoogleAuthExpired } from "../_shared/googleApi.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": Deno.env.get("ALLOWED_ORIGIN") || "https://connectradie.com",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 200,
      headers: corsHeaders,
    });
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    // Get authorization header
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: "Missing authorization header" }),
        {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Verify JWT and get user
    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: userError } = await supabaseClient.auth.getUser(token);

    if (userError || !user) {
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const { allowed } = await checkRateLimit(`${user.id}-sync-google-calendar`, 15, 60000);
    if (!allowed) {
      return new Response(
        JSON.stringify({ error: "Rate limit exceeded. Please try again later." }),
        { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Get calendar integration
    const { data: integration, error: integrationError } = await supabaseClient
      .from("calendar_integrations")
      .select("*")
      .eq("tradie_id", user.id)
      .eq("provider", "google")
      .eq("sync_enabled", true)
      .maybeSingle();

    if (integrationError) {
      return new Response(
        JSON.stringify({ error: "Failed to fetch integration", details: integrationError.message }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    if (!integration) {
      return new Response(
        JSON.stringify({ error: "No Google Calendar integration found" }),
        {
          status: 404,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // The body is read BEFORE any token work so `action=refresh` can exercise
    // the refresh grant on its own.
    let body: Record<string, unknown> = {};
    try { body = await req.json(); } catch { /* no body — normal sync */ }
    const deleteEventIds = Array.isArray(body.deleteEventIds) ? body.deleteEventIds as string[] : [];

    const persistToken = async (patch: IntegrationPatch): Promise<void> => {
      const { error } = await supabaseClient
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

    const clientId = Deno.env.get("GOOGLE_CLIENT_ID");
    const clientSecret = Deno.env.get("GOOGLE_CLIENT_SECRET");
    if (!clientId || !clientSecret) {
      return new Response(
        JSON.stringify({ error: "Google Calendar not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const tokenFor = (force: boolean) =>
      getGoogleAccessToken({ integration, clientId, clientSecret, persist: persistToken, force });

    // ── action=refresh: prove the refresh grant works, in about a second ──
    //
    // Refresh could previously only be exercised by connecting, waiting out the
    // access token's full hour, and pressing Sync — so the one thing that kept
    // breaking was the one thing nobody could check. This forces the exact grant
    // that fails and reports what Google said, touching neither the calendar nor
    // last_synced_at. It returns no token material.
    if (body.action === "refresh") {
      const forced = await tokenFor(true);
      if (!forced.ok) {
        return new Response(
          JSON.stringify({
            ok: false,
            error: forced.message,
            code: forced.code,
            detail: forced.detail,
            needsReconnect: forced.needsReconnect,
          }),
          { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      return new Response(
        JSON.stringify({
          ok: true,
          message: "Google renewed access.",
          expiresInSeconds: forced.expiresInSeconds,
          refreshTokenRotated: forced.refreshTokenRotated,
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const googleToken = await tokenFor(false);
    if (!googleToken.ok) {
      return new Response(
        JSON.stringify({
          error: googleToken.message,
          code: googleToken.code,
          detail: googleToken.detail,
          needsReconnect: googleToken.needsReconnect,
        }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Every Google call below goes through this session: it renews once on a 401
    // and THROWS GoogleAuthExpired if the renewed token is refused too. The throw
    // is the point — an `if (res.ok)` with no else branch cannot swallow it.
    const google = createGoogleSession({
      accessToken: googleToken.accessToken,
      refresh: () => tokenFor(true),
    });

    // A sync that wrote nothing must not report success. That is exactly how 215
    // availability slots produced zero Google events without anyone noticing.
    let googleErrors = 0;

    // A 404 from Google means the user already deleted it by hand — that is the
    // desired end state, so count it as removed rather than as a failure.
    const deleteGoogleEvent = async (eventId: string): Promise<boolean> => {
      try {
        const delRes = await google.fetch(
          `https://www.googleapis.com/calendar/v3/calendars/${integration.calendar_id}/events/${eventId}`,
          { method: "DELETE" }
        );
        if (delRes.ok || delRes.status === 404) return true;
        // Was a bare `return false`: a delete Google refused looked identical to
        // one it was never asked to do, and the caller reported success either way.
        console.error(`Google event delete failed for ${eventId}:`, delRes.status, (await delRes.text()).slice(0, 200));
        googleErrors++;
        return false;
      } catch (e) {
        if (e instanceof GoogleAuthExpired) throw e;
        console.error(`Google event delete threw for ${eventId}:`, e);
        googleErrors++;
        return false;
      }
    };

    if (deleteEventIds.length > 0) {
      let deleted = 0;
      let failedDeletes = 0;
      for (const eventId of deleteEventIds) {
        if (await deleteGoogleEvent(eventId)) deleted++;
        else failedDeletes++;
      }
      // useAvailabilitySlots fires this and discards the body, so the count only
      // reaches anyone through the log — but a silent partial failure here leaves
      // an event in Google for a slot that no longer exists.
      if (failedDeletes > 0) {
        console.error(`Deleted ${deleted} of ${deleteEventIds.length} calendar event(s); ${failedDeletes} failed`);
      }
      return new Response(
        JSON.stringify({
          success: failedDeletes === 0,
          message: `Deleted ${deleted} calendar event(s)`,
          deleted,
          failed: failedDeletes,
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ── UNSYNC: remove everything ConnecTradie pushed into Google ──────
    // Scoped strictly to event ids WE created and stored — we never scan the
    // user's calendar or match on title, so nothing they own can be deleted.
    // The Google connection itself is left intact: pressing Sync again re-pushes.
    if (body.action === "unsync") {
      const [{ data: slotRows }, { data: jobRows }] = await Promise.all([
        supabaseClient
          .from("availability_slots")
          .select("id, calendar_event_id")
          .eq("tradie_id", user.id)
          .not("calendar_event_id", "is", null),
        supabaseClient
          .from("jobs")
          .select("id, calendar_event_id")
          .eq("tradie_id", user.id)
          .not("calendar_event_id", "is", null),
      ]);

      let removed = 0;
      let failed = 0;
      const clearedSlotIds: string[] = [];
      const clearedJobIds: string[] = [];

      for (const row of slotRows ?? []) {
        if (await deleteGoogleEvent(row.calendar_event_id)) {
          clearedSlotIds.push(row.id);
          removed++;
        } else failed++;
      }
      for (const row of jobRows ?? []) {
        if (await deleteGoogleEvent(row.calendar_event_id)) {
          clearedJobIds.push(row.id);
          removed++;
        } else failed++;
      }

      // Only clear the pointer for events actually gone from Google, so a retry
      // can still find whichever ones failed instead of orphaning them.
      if (clearedSlotIds.length > 0) {
        await supabaseClient
          .from("availability_slots")
          .update({ calendar_event_id: null })
          .in("id", clearedSlotIds);
      }
      if (clearedJobIds.length > 0) {
        await supabaseClient
          .from("jobs")
          .update({ calendar_event_id: null })
          .in("id", clearedJobIds);
      }

      // ── RECLAIM: events we created but never recorded ────────────────
      // calendar_event_id has never persisted (0 rows set, database-wide), so
      // every past sync re-exported the same slots and created fresh duplicates.
      // Deleting strictly by stored id therefore finds nothing. Sweep the
      // calendar for events that are unmistakably ours and remove those too.
      //
      // "Unmistakably ours" means the extendedProperties stamp we now write, or
      // — for the untracked backlog — an EXACT legacy marker. Never a fuzzy or
      // free-text match: a user's own event must never be a candidate.
      const isOurs = (ev: Record<string, unknown>): boolean => {
        const ext = ev.extendedProperties as { private?: Record<string, string> } | undefined;
        if (ext?.private?.connectradie) return true;
        const summary = typeof ev.summary === "string" ? ev.summary : "";
        const description = typeof ev.description === "string" ? ev.description : "";
        if (summary === "✅ Available — ConnecTradie") return true;
        if (summary.startsWith("🔧 ") && description.startsWith("ConnecTradie job")) return true;
        return false;
      };

      // Bound the work: an earlier sync already took 47s, and there may be
      // hundreds of duplicates. Delete up to MAX_DELETES per call and report
      // what is left so the caller can run it again — never truncate silently.
      const MAX_DELETES = 150;
      const listFrom = integration.created_at
        ? new Date(integration.created_at).toISOString()
        : new Date(Date.now() - 365 * 24 * 60 * 60 * 1000).toISOString();
      const listTo = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString();

      let pageToken: string | undefined;
      let remaining = 0;
      let scanned = 0;
      let pages = 0;

      do {
        const listUrl = new URL(
          `https://www.googleapis.com/calendar/v3/calendars/${integration.calendar_id}/events`
        );
        listUrl.searchParams.set("timeMin", listFrom);
        listUrl.searchParams.set("timeMax", listTo);
        listUrl.searchParams.set("singleEvents", "true");
        listUrl.searchParams.set("maxResults", "250");
        if (pageToken) listUrl.searchParams.set("pageToken", pageToken);

        const listRes = await google.fetch(listUrl.toString());
        if (!listRes.ok) {
          console.error("Unsync: failed to list events", listRes.status, await listRes.text());
          break;
        }
        const listData = await listRes.json();
        const items: Record<string, unknown>[] = listData.items || [];
        scanned += items.length;
        pageToken = listData.nextPageToken;
        pages++;

        for (const ev of items) {
          if (!isOurs(ev)) continue;
          const evId = ev.id as string;
          if (!evId) continue;
          if (removed + failed >= MAX_DELETES) { remaining++; continue; }
          if (await deleteGoogleEvent(evId)) removed++;
          else failed++;
        }
        // Stop paging once the budget is spent; the caller will run again.
      } while (pageToken && pages < 20 && removed + failed < MAX_DELETES);

      // More pages may hold more of ours — flag that this wasn't the whole job.
      if (pageToken && removed + failed >= MAX_DELETES) remaining = Math.max(remaining, 1);

      console.log(`Unsync: scanned ${scanned} events, removed ${removed}, failed ${failed}, remaining ${remaining}`);

      return new Response(
        JSON.stringify({ success: true, removed, failed, remaining, scanned }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // The window every read and export below shares.
    const timeMin = new Date().toISOString();
    const timeMax = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();

    // ── CONFLICTS: make a clashing slot unbookable, without deleting it ──
    //
    // Read across ALL the tradie's calendars, not just the one the integration
    // is bound to (calendar_id is always the literal "primary"), because a
    // tradie whose real commitments live on a second calendar would otherwise
    // look free. calendar.readonly already covers this; no new scope.
    //
    // Via FreeBusy rather than events.list per calendar, for three reasons:
    //
    //  1. Two API calls total (calendarList + freeBusy, batched 50 ids at a
    //     time) regardless of how many calendars they have, against 1+N.
    //  2. It returns busy INTERVALS and no titles. availability_slots is
    //     SELECT-readable by every authenticated user, so a design that handled
    //     event summaries at all would be one mistake away from publishing a
    //     tradie's private calendar to every client. We never receive them.
    //  3. FreeBusy ignores events marked transparent, and the availability
    //     blocks we export carry transparency:"transparent". So the events WE
    //     push cannot come back to us as busy. That is what killed this feature
    //     on 2026-06-13 — the export's own "✅ Available — ConnecTradie" blocks
    //     read back as conflicts and the sync deleted the tradie's entire
    //     availability. Here it is impossible by construction rather than
    //     suppressed by matching on a title the tradie can edit.
    //
    // Exported JOB events are opaque and do read as busy. That is correct — a
    // booked job is a real commitment.
    //
    // Nothing here deletes a slot. See the migration for why that line is not
    // one this system crosses.

    // Birthdays and public holidays are all-day noise that would mark whole
    // days busy. Everything else the tradie keeps is fair game.
    const SKIP_CALENDAR_SUFFIXES = [
      "#holiday@group.v.calendar.google.com",
      "#contacts@group.v.calendar.google.com",
    ];
    const FREEBUSY_BATCH = 50;

    const busyIntervals: { start: number; end: number }[] = [];
    let calendarsChecked = 0;
    let conflictsChecked = true;
    let conflictReason = "";

    try {
      // 1. Every calendar this account can see.
      const calendarIds: string[] = [];
      let calPageToken: string | undefined;
      let calPages = 0;
      do {
        const calUrl = new URL("https://www.googleapis.com/calendar/v3/users/me/calendarList");
        calUrl.searchParams.set("maxResults", "250");
        if (calPageToken) calUrl.searchParams.set("pageToken", calPageToken);

        const calRes = await google.fetch(calUrl.toString());
        if (!calRes.ok) {
          throw new Error(`calendarList ${calRes.status}: ${(await calRes.text()).slice(0, 200)}`);
        }
        const calData = await calRes.json();
        for (const cal of calData.items ?? []) {
          const id = cal?.id;
          if (typeof id !== "string") continue;
          if (SKIP_CALENDAR_SUFFIXES.some((suffix) => id.endsWith(suffix))) continue;
          // `selected` is the tradie's own "show me this one" tick in Google.
          // Respect it, but never drop the primary calendar on its strength.
          if (cal.primary !== true && cal.selected === false) continue;
          calendarIds.push(id);
        }
        calPageToken = calData.nextPageToken;
        calPages++;
      } while (calPageToken && calPages < 10);

      // 2. Their busy intervals, in batches — freeBusy takes at most 50 ids.
      for (let i = 0; i < calendarIds.length; i += FREEBUSY_BATCH) {
        const batch = calendarIds.slice(i, i + FREEBUSY_BATCH);
        const fbRes = await google.fetch("https://www.googleapis.com/calendar/v3/freeBusy", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ timeMin, timeMax, items: batch.map((id) => ({ id })) }),
        });
        if (!fbRes.ok) {
          throw new Error(`freeBusy ${fbRes.status}: ${(await fbRes.text()).slice(0, 200)}`);
        }
        const fbData = await fbRes.json();
        for (const [calId, entry] of Object.entries(fbData.calendars ?? {})) {
          const cal = entry as { busy?: { start: string; end: string }[]; errors?: unknown[] };
          // A single unreadable calendar must not sink the whole check — but
          // say so, because a silently skipped calendar is a missed conflict.
          if (cal.errors?.length) {
            console.warn(`freeBusy: skipped calendar ${calId}`, JSON.stringify(cal.errors).slice(0, 200));
            continue;
          }
          calendarsChecked++;
          for (const b of cal.busy ?? []) {
            const start = new Date(b.start).getTime();
            const end = new Date(b.end).getTime();
            if (Number.isNaN(start) || Number.isNaN(end)) continue;
            busyIntervals.push({ start, end });
          }
        }
      }
    } catch (e) {
      // A dead grant is NOT the non-fatal case — it takes the export half down
      // too, and reporting it as "we could not check for clashes" hides the one
      // fault the tradie can act on.
      if (e instanceof GoogleAuthExpired) throw e;
      // Non-fatal, deliberately. A 403 here means calendar.readonly has not been
      // granted (likely while Google verification is still pending), and the
      // export half of this sync still works. Killing the whole request would
      // take a working feature down with a pending one. The caller is told the
      // conflict check did not run rather than being left to assume it passed.
      conflictsChecked = false;
      conflictReason = e instanceof Error ? e.message : "unknown";
      console.error("Conflict check failed (export continues):", conflictReason);
    }

    let conflictCount = 0;
    let slotsBlocked = 0;
    let slotsCleared = 0;

    if (conflictsChecked) {
      // Every slot in the window, in whatever state — deliberately unfiltered.
      //
      // planConflictChanges needs all three groups: open slots that might newly
      // clash, slots we blocked that might now be released, and booked slots,
      // whose clashes are counted and reported but never acted on. Filtering to
      // the first two here would make conflictCount disagree with what the
      // tradie can see, and a status filter is a place to get a rule wrong
      // twice. The window is 30 days of one tradie's slots; reading all of them
      // costs nothing.
      const { data: slotRows, error: slotErr } = await supabaseClient
        .from("availability_slots")
        .select("id, start_time, end_time, status, calendar_event_id, external_conflict_at")
        .eq("tradie_id", user.id)
        .gte("start_time", timeMin)
        .lte("start_time", timeMax);

      if (slotErr) {
        conflictsChecked = false;
        conflictReason = slotErr.message;
        console.error("Conflict check: could not read slots:", slotErr.message);
      } else {
        // The decision itself lives in _shared/calendarConflicts.ts so it can be
        // executed by a test — supabase/functions/ is outside `npm run
        // typecheck` and Deno's checker cannot reach jsr from CI's sandbox, so
        // inlining it here would leave the one rule that must not be wrong with
        // no coverage at all. See the file header for the 2026-06-13 incident
        // these rules exist to prevent repeating.
        const { conflictCount: clashing, toBlock, toRelease, toUnstamp } =
          planConflictChanges(slotRows ?? [], busyIntervals);
        conflictCount = clashing;

        // A slot we had advertised in Google leaves a green "Available" block
        // sitting on top of a real commitment once we block it here. Remove the
        // event — strictly by the id we stored, never by scanning, exactly as
        // the unsync path does. Deleting OUR event is the safe direction; it is
        // the reverse (Google deciding a slot dies) that broke this in June.
        const pointersCleared: string[] = [];
        for (const slot of toBlock) {
          if (!slot.calendar_event_id) continue;
          if (await deleteGoogleEvent(slot.calendar_event_id)) pointersCleared.push(slot.id);
        }

        if (toBlock.length > 0) {
          const { error } = await supabaseClient
            .from("availability_slots")
            .update({ status: "blocked", external_conflict_at: new Date().toISOString() })
            .in("id", toBlock.map((s) => s.id));
          if (error) console.error("Failed to block conflicting slots:", error.message);
          else slotsBlocked = toBlock.length;
        }

        if (pointersCleared.length > 0) {
          const { error } = await supabaseClient
            .from("availability_slots")
            .update({ calendar_event_id: null })
            .in("id", pointersCleared);
          if (error) console.error("Failed to clear calendar_event_id on blocked slots:", error.message);
        }

        if (toRelease.length > 0) {
          const { error } = await supabaseClient
            .from("availability_slots")
            .update({ status: "available", external_conflict_at: null })
            .in("id", toRelease);
          if (error) console.error("Failed to release cleared slots:", error.message);
          else slotsCleared = toRelease.length;
        }

        if (toUnstamp.length > 0) {
          // Stamp is stale but the slot has moved on (booked, or manually
          // blocked since). Drop the stamp without touching its state.
          const { error } = await supabaseClient
            .from("availability_slots")
            .update({ external_conflict_at: null })
            .in("id", toUnstamp);
          if (error) console.error("Failed to clear stale conflict stamps:", error.message);
        }
      }
    }

    // ── EXPORT: Push ConnecTradie jobs to Google Calendar ──────────────
    // Fetch upcoming scheduled jobs for this tradie and create Google
    // Calendar events for any that don't already have a calendar_event_id.
    let jobsExported = 0;
    let exportFailures = 0;
    try {
      // Idempotence guard, built once and used by BOTH export loops below.
      // jobs.calendar_event_id has never persisted either, so without this the
      // job export re-creates every upcoming job's event on every sync, exactly
      // as the slot export did. Keyed by start time, per kind, so an
      // availability block never suppresses a job event at the same hour.
      //
      // The window runs a year forward because the job query has no upper bound
      // on scheduled_date — a 30-day window would miss a job further out and
      // duplicate it.
      const existingStarts = { availability: new Set<string>(), job: new Set<string>() };
      try {
        const dedupTo = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString();
        let dedupToken: string | undefined;
        let dedupPages = 0;
        do {
          const dedupUrl = new URL(
            `https://www.googleapis.com/calendar/v3/calendars/${integration.calendar_id}/events`
          );
          dedupUrl.searchParams.set("timeMin", timeMin);
          dedupUrl.searchParams.set("timeMax", dedupTo);
          dedupUrl.searchParams.set("singleEvents", "true");
          dedupUrl.searchParams.set("maxResults", "250");
          if (dedupToken) dedupUrl.searchParams.set("pageToken", dedupToken);

          const dedupRes = await google.fetch(dedupUrl.toString());
          if (!dedupRes.ok) {
            // Breaking here silently means every slot looks un-exported and gets
            // duplicated. Say so rather than filling the calendar twice over.
            console.error("Dedup listing failed:", dedupRes.status, (await dedupRes.text()).slice(0, 200));
            googleErrors++;
            break;
          }
          const dedupData = await dedupRes.json();
          for (const ev of dedupData.items || []) {
            const start = ev.start?.dateTime;
            if (!start) continue;
            const iso = new Date(start).toISOString();
            const ext = ev.extendedProperties?.private?.connectradie;
            const summary = typeof ev.summary === "string" ? ev.summary : "";
            if (ext === "availability" || summary === "✅ Available — ConnecTradie") {
              existingStarts.availability.add(iso);
            } else if (ext === "job" || summary.startsWith("🔧 ")) {
              existingStarts.job.add(iso);
            }
          }
          dedupToken = dedupData.nextPageToken;
          dedupPages++;
        } while (dedupToken && dedupPages < 10);
      } catch (e) {
        if (e instanceof GoogleAuthExpired) throw e;
        console.error("Could not list existing events for dedup:", e);
        googleErrors++;
      }

      const { data: upcomingJobs } = await supabaseClient
        .from("jobs")
        .select("id, title, description, scheduled_date, start_time, location_address, status")
        .eq("tradie_id", user.id)
        .in("status", ["accepted", "funded", "in_progress"])
        .not("scheduled_date", "is", null)
        .gte("scheduled_date", new Date().toISOString().split("T")[0])
        .is("calendar_event_id", null);

      let jobsSkipped = 0;
      let jobsFailed = 0;
      for (const job of upcomingJobs || []) {
        try {
          const category = job.description?.match(/^\[([^\]]+)\]/)?.[1]?.replace(/_/g, " ") || "";
          const summary = job.title || category || "ConnecTradie Job";
          // Shared with the dashboard's "you have a job booked then" label,
          // which rebuilds this window to attribute a blocked slot to the job.
          const { startDateTime, endDateTime } = jobEventWindow(job.scheduled_date, job.start_time);

          if (existingStarts.job.has(new Date(startDateTime).toISOString())) { jobsSkipped++; continue; }

          const eventBody = {
            summary: `🔧 ${summary}`,
            description: `ConnecTradie job\n${job.description?.replace(/^\[[^\]]+\]\s*/, "") || ""}\n\nStatus: ${job.status}`,
            start: { dateTime: startDateTime, timeZone: "Australia/Sydney" },
            end: { dateTime: endDateTime, timeZone: "Australia/Sydney" },
            location: job.location_address || undefined,
            colorId: "10",
            // Stamp so cleanup can identify our events without depending on the
            // title, which the tradie can edit in Google.
            extendedProperties: { private: { connectradie: "job" } },
          };

          const createRes = await google.fetch(
            `https://www.googleapis.com/calendar/v3/calendars/${integration.calendar_id}/events`,
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(eventBody),
            }
          );

          if (createRes.ok) {
            const created = await createRes.json();
            // The result of this write-back was previously discarded, which is
            // why a total failure to persist went unnoticed long enough to fill
            // the calendar with duplicates. Log it.
            const { error: backErr } = await supabaseClient
              .from("jobs")
              .update({ calendar_event_id: created.id })
              .eq("id", job.id);
            if (backErr) console.error(`calendar_event_id write-back failed for job ${job.id}:`, backErr.message, backErr.details, backErr.hint);
            jobsExported++;
          } else {
            // There was no else here at all. A rejected create fell straight
            // through and the sync still answered success.
            console.error(`Google event create failed for job ${job.id}:`, createRes.status, (await createRes.text()).slice(0, 200));
            googleErrors++;
            jobsFailed++;
          }
        } catch (e) {
          if (e instanceof GoogleAuthExpired) throw e;
          console.error(`Failed to export job ${job.id} to Google Calendar:`, e);
          googleErrors++;
          jobsFailed++;
        }
      }

      // Also export availability slots as "Available" events
      const { data: slotsToExport } = await supabaseClient
        .from("availability_slots")
        .select("id, start_time, end_time, calendar_event_id")
        .eq("tradie_id", user.id)
        .eq("status", "available")
        .gte("start_time", timeMin)
        .lte("start_time", timeMax)
        .is("calendar_event_id", null);

      let slotsExported = 0;
      let slotsSkipped = 0;
      let slotsFailed = 0;
      for (const slot of slotsToExport || []) {
        try {
          if (existingStarts.availability.has(new Date(slot.start_time).toISOString())) { slotsSkipped++; continue; }
          const slotBody = {
            summary: "✅ Available — ConnecTradie",
            description: "Open availability slot on ConnecTradie",
            start: { dateTime: slot.start_time, timeZone: "Australia/Sydney" },
            end: { dateTime: slot.end_time, timeZone: "Australia/Sydney" },
            colorId: "2",
            transparency: "transparent",
            extendedProperties: { private: { connectradie: "availability" } },
          };

          const createRes = await google.fetch(
            `https://www.googleapis.com/calendar/v3/calendars/${integration.calendar_id}/events`,
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(slotBody),
            }
          );

          if (createRes.ok) {
            const created = await createRes.json();
            const { error: backErr } = await supabaseClient
              .from("availability_slots")
              .update({ calendar_event_id: created.id })
              .eq("id", slot.id);
            if (backErr) console.error(`calendar_event_id write-back failed for slot ${slot.id}:`, backErr.message, backErr.details, backErr.hint);
            slotsExported++;
          } else {
            console.error(`Google event create failed for slot ${slot.id}:`, createRes.status, (await createRes.text()).slice(0, 200));
            googleErrors++;
            slotsFailed++;
          }
        } catch (e) {
          if (e instanceof GoogleAuthExpired) throw e;
          console.error(`Failed to export slot ${slot.id}:`, e);
          googleErrors++;
          slotsFailed++;
        }
      }

      if (slotsSkipped > 0 || jobsSkipped > 0) {
        console.log(`Export: skipped ${slotsSkipped} slot(s) and ${jobsSkipped} job(s) already present in Google`);
      }
      jobsExported += slotsExported;
      exportFailures = jobsFailed + slotsFailed;
    } catch (exportErr) {
      if (exportErr instanceof GoogleAuthExpired) throw exportErr;
      console.error("Export to Google Calendar failed:", exportErr);
      googleErrors++;
    }

    // Update last synced timestamp
    await supabaseClient
      .from("calendar_integrations")
      .update({
        last_synced_at: new Date().toISOString(),
      })
      .eq("id", integration.id);

    return new Response(
      JSON.stringify({
        // Conditional, not a literal. Before this, a sync whose every Google
        // write was refused still answered "Calendar synced successfully".
        success: googleErrors === 0,
        message: googleErrors === 0
          ? "Calendar synced successfully"
          : "Calendar synced, but Google rejected some changes.",
        // `slotsRemoved` is deliberately gone rather than kept at 0. It was a
        // hardcoded literal that the dashboard still rendered as "N conflicting
        // slot(s) removed", so every sync claimed to have removed nothing while
        // conflictCount went unread. Removing the field forces the caller to be
        // updated rather than to keep printing a number that means nothing.
        conflictsChecked,
        conflictReason: conflictsChecked ? undefined : conflictReason,
        calendarsChecked,
        conflictCount,
        slotsBlocked,
        slotsCleared,
        jobsExported,
        exportFailures,
        googleErrors,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    // The grant died mid-sync. Answer with the remedy rather than "Internal
    // server error" — this is the one failure a tradie can actually act on, and
    // it is precisely the one that used to disappear into a swallowed 401.
    if (error instanceof GoogleAuthExpired) {
      return new Response(
        JSON.stringify({
          error: error.message,
          code: error.code,
          detail: error.detail,
          needsReconnect: error.needsReconnect,
        }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    return new Response(
      JSON.stringify({
        error: "Internal server error",
        details: error instanceof Error ? error.message : "Unknown error",
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
