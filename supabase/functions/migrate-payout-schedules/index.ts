import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import Stripe from "npm:stripe@14.21.0";

/**
 * ONE-TIME MIGRATION: Update existing tradie Connect accounts to manual payouts.
 *
 * This supports the destination-charge migration. With destination charges,
 * funds route to the tradie's Stripe balance immediately at payment time.
 * Manual payouts ensure the platform controls when funds reach the tradie's
 * bank — replacing the old "escrow hold" without ConnecTradie holding funds.
 *
 * Run once via: supabase functions invoke migrate-payout-schedules
 * Auth: requires service-role key (no user auth — admin/cron only)
 *
 * Safe to re-run — skips accounts already on manual payouts.
 */

function requireEnv(key: string): string {
  const val = Deno.env.get(key);
  if (!val) throw new Error(`Missing required env var: ${key}`);
  return val;
}

const corsHeaders = {
  "Access-Control-Allow-Origin": Deno.env.get("ALLOWED_ORIGIN") || "https://connectradie.com",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers":
    "Content-Type, Authorization, X-Client-Info, Apikey",
};

function jsonResponse(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  try {
    const supabaseUrl = requireEnv("SUPABASE_URL");
    const supabaseServiceKey = requireEnv("SUPABASE_SERVICE_ROLE_KEY");
    const stripeSecretKey = requireEnv("STRIPE_SECRET_KEY");

    // Auth: accept service-role key or verify user is admin
    const authHeader = req.headers.get("Authorization");
    if (authHeader?.startsWith("Bearer ")) {
      const token = authHeader.slice(7);
      const supabase = createClient(supabaseUrl, supabaseServiceKey);
      const { data: { user }, error: authError } = await supabase.auth.getUser(token);
      if (authError || !user) {
        return jsonResponse({ error: "Unauthorized" }, 401);
      }
      // Check admin role
      const { data: profile } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", user.id)
        .maybeSingle();
      if (profile?.role !== "admin") {
        return jsonResponse({ error: "Admin access required" }, 403);
      }
    }

    const stripe = new Stripe(stripeSecretKey, { apiVersion: "2023-10-16" });
    const adminClient = createClient(supabaseUrl, supabaseServiceKey);

    // Fetch all tradies with a connected Stripe account
    const { data: tradies, error: fetchError } = await adminClient
      .from("profiles")
      .select("id, full_name, email, stripe_connect_account_id, stripe_connect_onboarding_complete")
      .eq("role", "tradie")
      .not("stripe_connect_account_id", "is", null);

    if (fetchError) {
      console.error("Failed to fetch tradie profiles:", fetchError);
      return jsonResponse({ error: "Failed to fetch tradie profiles" }, 500);
    }

    if (!tradies || tradies.length === 0) {
      return jsonResponse({
        message: "No tradie accounts found to migrate",
        updated: 0,
        skipped: 0,
        failed: 0,
      });
    }

    console.log(`Found ${tradies.length} tradie(s) with Connect accounts`);

    const results = {
      updated: [] as string[],
      skipped: [] as string[],
      failed: [] as { accountId: string; name: string; error: string }[],
    };

    for (const tradie of tradies) {
      const accountId = tradie.stripe_connect_account_id;
      const name = tradie.full_name || tradie.email || tradie.id;

      try {
        // Retrieve current account to check existing payout schedule
        const account = await stripe.accounts.retrieve(accountId);

        if (!account || account.deleted) {
          results.failed.push({
            accountId,
            name,
            error: "Account deleted or not found on Stripe",
          });
          console.warn(`Skipping ${name} (${accountId}): account deleted/not found`);
          continue;
        }

        // Check if already on manual payouts
        const currentInterval = account.settings?.payouts?.schedule?.interval;
        if (currentInterval === "manual") {
          results.skipped.push(accountId);
          console.log(`Skipping ${name} (${accountId}): already on manual payouts`);
          continue;
        }

        // Update to manual payouts
        await stripe.accounts.update(accountId, {
          settings: {
            payouts: {
              schedule: { interval: "manual" as const },
            },
          },
        });

        results.updated.push(accountId);
        console.log(
          `Updated ${name} (${accountId}): ${currentInterval} → manual`
        );
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        results.failed.push({ accountId, name, error: message });
        console.error(`Failed to update ${name} (${accountId}):`, message);
      }
    }

    const summary = {
      message: "Migration complete",
      total: tradies.length,
      updated: results.updated.length,
      skipped: results.skipped.length,
      failed: results.failed.length,
      details: {
        updated: results.updated,
        skipped: results.skipped,
        failed: results.failed,
      },
    };

    console.log("Migration summary:", JSON.stringify(summary, null, 2));

    return jsonResponse(summary);
  } catch (err) {
    console.error("Migration failed:", err);
    const message = err instanceof Error ? err.message : "Internal server error";
    return jsonResponse({ error: message }, 500);
  }
});
