import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response(
      JSON.stringify({ error: "Method not allowed" }),
      { status: 405, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!supabaseUrl || !supabaseServiceKey) {
      return new Response(
        JSON.stringify({ error: "Server configuration error" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(
        JSON.stringify({ error: "Missing Authorization header" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const token = authHeader.slice(7);
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { data: callerProfile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .maybeSingle();

    if (callerProfile?.role !== "admin") {
      return new Response(
        JSON.stringify({ error: "Forbidden: admin access required" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const today = new Date().toISOString().split("T")[0];

    const { data: expiredTradies, error: queryError } = await supabase
      .from("profiles")
      .select("id, full_name, license_expiry")
      .eq("role", "tradie")
      .eq("verification_status", "verified")
      .lt("license_expiry", today);

    if (queryError) {
      return new Response(
        JSON.stringify({ error: queryError.message }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!expiredTradies || expiredTradies.length === 0) {
      return new Response(
        JSON.stringify({ processed: 0, message: "No expired licenses found" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    let processed = 0;
    const errors: string[] = [];

    for (const tradie of expiredTradies) {
      const { error: profileError } = await supabase
        .from("profiles")
        .update({ verification_status: "expired" })
        .eq("id", tradie.id);

      if (profileError) {
        errors.push(`Profile update failed for ${tradie.id}: ${profileError.message}`);
        continue;
      }

      const { error: tradieError } = await supabase
        .from("tradie_details")
        .update({ is_verified: false })
        .eq("profile_id", tradie.id);

      if (tradieError) {
        errors.push(`Tradie details update failed for ${tradie.id}: ${tradieError.message}`);
      }

      const expiryDate = tradie.license_expiry
        ? new Date(tradie.license_expiry).toLocaleDateString("en-AU", {
            day: "numeric",
            month: "long",
            year: "numeric",
          })
        : "an unknown date";

      const { error: notifError } = await supabase.from("notifications").insert({
        user_id: tradie.id,
        title: "License Expired",
        message: `URGENT: Your trade license expired on ${expiryDate}. You have been unverified and cannot accept new jobs. Please upload your renewed license in Settings to continue working.`,
        type: "license_expiry",
        metadata: { license_expiry: tradie.license_expiry },
      });

      if (notifError) {
        errors.push(`Notification insert failed for ${tradie.id}: ${notifError.message}`);
      }

      processed++;
    }

    return new Response(
      JSON.stringify({
        processed,
        total_found: expiredTradies.length,
        errors: errors.length > 0 ? errors : undefined,
        message: `Processed ${processed} expired license(s)`,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "Internal server error";
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
