import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": Deno.env.get("ALLOWED_ORIGIN") || "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Content-Type": "application/json",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!supabaseUrl || !supabaseKey) {
      return new Response(JSON.stringify({ status: "unhealthy", error: "Missing configuration" }), {
        status: 503, headers: corsHeaders,
      });
    }

    const supabase = createClient(supabaseUrl, supabaseKey);
    const { error } = await supabase.from("profiles").select("id").limit(1);

    if (error) {
      return new Response(JSON.stringify({ status: "unhealthy", error: "Database unreachable" }), {
        status: 503, headers: corsHeaders,
      });
    }

    return new Response(JSON.stringify({
      status: "healthy",
      timestamp: new Date().toISOString(),
      version: "1.0.0",
    }), { status: 200, headers: corsHeaders });
  } catch (err) {
    return new Response(JSON.stringify({ status: "unhealthy", error: String(err) }), {
      status: 503, headers: corsHeaders,
    });
  }
});
