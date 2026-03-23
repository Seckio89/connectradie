import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": Deno.env.get("ALLOWED_ORIGIN") || "https://connectradie.com.au",
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
    const now = new Date().toISOString();

    // --- Phase 1: Check for newly expired licenses ---
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

    let processed = 0;
    const errors: string[] = [];

    if (expiredTradies && expiredTradies.length > 0) {
      for (const tradie of expiredTradies) {
        const { error: profileError } = await supabase
          .from("profiles")
          .update({
            verification_status: "expired",
            last_license_check: now,
            license_check_count: (tradie as Record<string, unknown>).license_check_count
              ? Number((tradie as Record<string, unknown>).license_check_count) + 1
              : 1,
          })
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
    }

    // --- Phase 2: Periodic re-verification of currently verified licenses ---
    // Re-check verified tradies who have a license_number and haven't been checked
    // in the last 30 days (or have never been checked).
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

    const { data: reverifyTradies, error: reverifyQueryError } = await supabase
      .from("profiles")
      .select("id, full_name, license_number, license_expiry, last_license_check, license_check_count")
      .eq("role", "tradie")
      .eq("verification_status", "verified")
      .not("license_number", "is", null)
      .or(`last_license_check.is.null,last_license_check.lt.${thirtyDaysAgo}`);

    let reverified = 0;
    let revoked = 0;

    if (reverifyQueryError) {
      errors.push(`Re-verification query failed: ${reverifyQueryError.message}`);
    } else if (reverifyTradies && reverifyTradies.length > 0) {
      for (const tradie of reverifyTradies) {
        // Simulated license authority check:
        // A real implementation would call QLD/NSW/VIC license authority APIs here.
        // For now, we check if the license_expiry date has passed.
        const licenseStillValid = tradie.license_expiry
          ? new Date(tradie.license_expiry) >= new Date()
          : true; // If no expiry date set, assume valid

        const newCheckCount = (tradie.license_check_count || 0) + 1;

        if (!licenseStillValid) {
          // License has expired -- revoke verification
          const { error: revokeError } = await supabase
            .from("profiles")
            .update({
              verification_status: "expired",
              last_license_check: now,
              license_check_count: newCheckCount,
            })
            .eq("id", tradie.id);

          if (revokeError) {
            errors.push(`Re-verification revoke failed for ${tradie.id}: ${revokeError.message}`);
            continue;
          }

          await supabase
            .from("tradie_details")
            .update({ is_verified: false })
            .eq("profile_id", tradie.id);

          const expiryDate = tradie.license_expiry
            ? new Date(tradie.license_expiry).toLocaleDateString("en-AU", {
                day: "numeric",
                month: "long",
                year: "numeric",
              })
            : "an unknown date";

          await supabase.from("notifications").insert({
            user_id: tradie.id,
            title: "License Re-Verification Failed",
            message: `Your trade license (${tradie.license_number}) expired on ${expiryDate}. Your verified status has been revoked. Please renew your license and re-upload it in Settings.`,
            type: "license_reverification",
            metadata: {
              license_number: tradie.license_number,
              license_expiry: tradie.license_expiry,
              check_count: newCheckCount,
            },
          });

          revoked++;
        } else {
          // License still valid -- update tracking fields
          const { error: trackError } = await supabase
            .from("profiles")
            .update({
              last_license_check: now,
              license_check_count: newCheckCount,
            })
            .eq("id", tradie.id);

          if (trackError) {
            errors.push(`Re-verification tracking update failed for ${tradie.id}: ${trackError.message}`);
          }

          reverified++;
        }
      }
    }

    return new Response(
      JSON.stringify({
        processed,
        total_expired_found: expiredTradies?.length || 0,
        reverified,
        revoked,
        total_rechecked: (reverifyTradies?.length || 0),
        errors: errors.length > 0 ? errors : undefined,
        message: `Processed ${processed} expired license(s), re-verified ${reverified} license(s), revoked ${revoked} license(s)`,
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
