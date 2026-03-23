import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { PRICING_CONFIG, calculateTradieFees, calculatePMFees, TradieTier, PMTier, FeeBreakdown } from "../_shared/pricing.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": Deno.env.get("ALLOWED_ORIGIN") || "https://connectradie.com.au",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers":
    "Content-Type, Authorization, X-Client-Info, Apikey",
};

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const body = await req.json() as {
      jobValue: number;
      tier: string;
      userType?: "tradie" | "pm";
    };

    const { jobValue, tier, userType = "tradie" } = body;

    if (typeof jobValue !== "number" || jobValue <= 0) {
      return new Response(JSON.stringify({ error: "jobValue must be a positive number" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!tier) {
      return new Response(JSON.stringify({ error: "tier is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let breakdown: FeeBreakdown;

    if (userType === "pm") {
      const validPMTiers: PMTier[] = ["pm_starter", "pm_pro", "pm_enterprise"];
      if (!validPMTiers.includes(tier as PMTier)) {
        return new Response(JSON.stringify({ error: `Invalid PM tier: ${tier}` }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      breakdown = calculatePMFees(jobValue, tier as PMTier);
    } else {
      const validTradieTiers: TradieTier[] = ["free", "pro", "pro_plus"];
      if (!validTradieTiers.includes(tier as TradieTier)) {
        return new Response(JSON.stringify({ error: `Invalid tradie tier: ${tier}` }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      breakdown = calculateTradieFees(jobValue, tier as TradieTier);
    }

    return new Response(JSON.stringify(breakdown), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Internal server error";
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
