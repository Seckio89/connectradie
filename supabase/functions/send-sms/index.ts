import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
const rateLimitStore = new Map<string, { count: number; resetAt: number }>();
function checkRateLimit(
  key: string, maxRequests: number, windowMs: number,
): { allowed: boolean; remaining: number } {
  const now = Date.now();
  const entry = rateLimitStore.get(key);
  if (!entry || now > entry.resetAt) {
    rateLimitStore.set(key, { count: 1, resetAt: now + windowMs });
    return { allowed: true, remaining: maxRequests - 1 };
  }
  if (entry.count >= maxRequests) return { allowed: false, remaining: 0 };
  entry.count++;
  return { allowed: true, remaining: maxRequests - entry.count };
}

const corsHeaders = {
  "Access-Control-Allow-Origin": Deno.env.get("ALLOWED_ORIGIN") || "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers":
    "Content-Type, Authorization, X-Client-Info, Apikey",
};

const DAILY_SMS_LIMIT = 10;

interface SmsRequest {
  to: string;
  body: string;
  notificationType?: string;
}

Deno.serve(async (req: Request) => {
  try {
    if (req.method === "OPTIONS") {
      return new Response(null, { status: 200, headers: corsHeaders });
    }

    if (req.method !== "POST") {
      return new Response(
        JSON.stringify({ error: "Method not allowed" }),
        { status: 405, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Authenticate the caller
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(
        JSON.stringify({ error: "Missing Authorization header" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    const supabaseAuth = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );
    const { data: { user }, error: authError } = await supabaseAuth.auth.getUser(authHeader.slice(7));
    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const requiredEnvVars = ['TWILIO_ACCOUNT_SID', 'TWILIO_AUTH_TOKEN', 'TWILIO_PHONE_NUMBER', 'SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY'];
    for (const envVar of requiredEnvVars) {
      if (!Deno.env.get(envVar)) {
        return new Response(JSON.stringify({ error: `Missing required configuration: ${envVar}` }), {
          status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }
    }

    const twilioSid = Deno.env.get("TWILIO_ACCOUNT_SID")!;
    const twilioAuth = Deno.env.get("TWILIO_AUTH_TOKEN")!;
    const twilioFrom = Deno.env.get("TWILIO_PHONE_NUMBER")!;

    const { to, body, notificationType }: SmsRequest = await req.json();

    if (!to || !body) {
      return new Response(
        JSON.stringify({ error: "Missing required fields: to, body" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const normalised = to.startsWith("+") ? to : `+61${to.replace(/^0/, "")}`;

    // Rate limit: 10 requests per minute per phone number
    const rateLimitKey = `${normalised}-send-sms`;
    const { allowed, remaining } = checkRateLimit(rateLimitKey, 10, 60000);
    if (!allowed) {
      return new Response(
        JSON.stringify({ error: "Rate limit exceeded. Please try again later." }),
        {
          status: 429,
          headers: { ...corsHeaders, "Content-Type": "application/json", "X-RateLimit-Remaining": "0" },
        },
      );
    }

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const oneDayAgo = new Date(Date.now() - 86_400_000).toISOString();
    const { count, error: countError } = await supabaseAdmin
      .from("sms_send_log")
      .select("*", { count: "exact", head: true })
      .eq("phone_number", normalised)
      .gte("sent_at", oneDayAgo);

    if (!countError && (count ?? 0) >= DAILY_SMS_LIMIT) {
      return new Response(
        JSON.stringify({
          error: "Daily SMS limit reached",
          details: `This number has received ${count} messages in the last 24 hours. Limit is ${DAILY_SMS_LIMIT}.`,
        }),
        { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const twilioUrl = `https://api.twilio.com/2010-04-01/Accounts/${twilioSid}/Messages.json`;
    const credentials = btoa(`${twilioSid}:${twilioAuth}`);

    const formBody = new URLSearchParams({
      To: normalised,
      From: twilioFrom,
      Body: body,
    });

    const twilioResponse = await fetch(twilioUrl, {
      method: "POST",
      headers: {
        Authorization: `Basic ${credentials}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: formBody.toString(),
    });

    const twilioData = await twilioResponse.json();

    if (!twilioResponse.ok) {
      return new Response(
        JSON.stringify({
          error: "SMS delivery failed",
          details: "SMS could not be delivered. Please try again later.",
        }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    await supabaseAdmin.from("sms_send_log").insert({
      phone_number: normalised,
      notification_type: notificationType || null,
    });

    return new Response(
      JSON.stringify({
        success: true,
        sid: twilioData.sid,
        status: twilioData.status,
        notificationType,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    return new Response(
      JSON.stringify({
        error: "Internal server error",
        details: err instanceof Error ? err.message : "Unknown error",
      }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
