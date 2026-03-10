import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": Deno.env.get("ALLOWED_ORIGIN") || "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

interface CalendarEvent {
  id: string;
  summary: string;
  start: { dateTime?: string; date?: string };
  end: { dateTime?: string; date?: string };
  status: string;
}

interface TokenResponse {
  access_token: string;
  expires_in: number;
  refresh_token?: string;
}

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

    let accessToken = integration.access_token;

    // Check if token needs refresh
    const now = new Date();
    const expiresAt = new Date(integration.token_expires_at);

    if (now >= expiresAt && integration.refresh_token) {
      // Refresh the token
      const clientId = Deno.env.get("GOOGLE_CLIENT_ID");
      const clientSecret = Deno.env.get("GOOGLE_CLIENT_SECRET");

      if (!clientId || !clientSecret) {
        return new Response(
          JSON.stringify({ error: "Google Calendar not configured" }),
          {
            status: 500,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          }
        );
      }

      const refreshResponse = await fetch("https://oauth2.googleapis.com/token", {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({
          client_id: clientId,
          client_secret: clientSecret,
          refresh_token: integration.refresh_token,
          grant_type: "refresh_token",
        }),
      });

      if (!refreshResponse.ok) {
        return new Response(
          JSON.stringify({ error: "Failed to refresh access token" }),
          {
            status: 500,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          }
        );
      }

      const tokens: TokenResponse = await refreshResponse.json();
      accessToken = tokens.access_token;
      const newExpiresAt = new Date(Date.now() + tokens.expires_in * 1000);

      // Update stored tokens
      await supabaseClient
        .from("calendar_integrations")
        .update({
          access_token: accessToken,
          token_expires_at: newExpiresAt.toISOString(),
        })
        .eq("id", integration.id);
    }

    // Fetch events from Google Calendar (next 30 days)
    const timeMin = new Date().toISOString();
    const timeMax = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();

    const eventsUrl = new URL(`https://www.googleapis.com/calendar/v3/calendars/${integration.calendar_id}/events`);
    eventsUrl.searchParams.set("timeMin", timeMin);
    eventsUrl.searchParams.set("timeMax", timeMax);
    eventsUrl.searchParams.set("singleEvents", "true");
    eventsUrl.searchParams.set("orderBy", "startTime");

    const eventsResponse = await fetch(eventsUrl.toString(), {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });

    if (!eventsResponse.ok) {
      return new Response(
        JSON.stringify({ error: "Failed to fetch calendar events" }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const eventsData = await eventsResponse.json();
    const events: CalendarEvent[] = eventsData.items || [];

    // Get existing availability slots for the next 30 days
    const { data: existingSlots } = await supabaseClient
      .from("availability_slots")
      .select("*")
      .eq("tradie_id", user.id)
      .gte("start_time", timeMin)
      .lte("start_time", timeMax)
      .eq("status", "available");

    let slotsToDelete: string[] = [];
    let conflictCount = 0;

    // Check for conflicts between calendar events and availability slots
    if (existingSlots) {
      for (const slot of existingSlots) {
        const slotStart = new Date(slot.start_time);
        const slotEnd = new Date(slot.end_time);

        for (const event of events) {
          // Skip all-day events
          if (!event.start.dateTime || !event.end.dateTime) continue;

          const eventStart = new Date(event.start.dateTime);
          const eventEnd = new Date(event.end.dateTime);

          // Check if event overlaps with slot
          if (eventStart < slotEnd && eventEnd > slotStart) {
            slotsToDelete.push(slot.id);
            conflictCount++;
            break;
          }
        }
      }
    }

    // Delete conflicting slots
    if (slotsToDelete.length > 0) {
      await supabaseClient
        .from("availability_slots")
        .delete()
        .in("id", slotsToDelete);
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
        success: true,
        message: "Calendar synced successfully",
        eventsFound: events.length,
        slotsRemoved: slotsToDelete.length,
        conflictCount,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error) {
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
