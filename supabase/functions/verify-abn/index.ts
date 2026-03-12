import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

function requireEnv(key: string): string {
  const val = Deno.env.get(key);
  if (!val) throw new Error(`Missing required env var: ${key}`);
  return val;
}

const corsHeaders = {
  "Access-Control-Allow-Origin": Deno.env.get("ALLOWED_ORIGIN") || "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers":
    "Content-Type, Authorization, X-Client-Info, Apikey",
};

const ABN_WEIGHTS = [10, 1, 3, 5, 7, 9, 11, 13, 15, 17, 19];

function validateAbnChecksum(abn: string): boolean {
  if (!/^\d{11}$/.test(abn)) return false;

  const digits = abn.split("").map(Number);
  digits[0] -= 1;

  const sum = digits.reduce((acc, d, i) => acc + d * ABN_WEIGHTS[i], 0);
  return sum % 89 === 0;
}

interface AbrResponse {
  Abn: string;
  AbnStatus: string;
  AbnStatusEffectiveFrom: string;
  EntityName: string;
  EntityTypeCode: string;
  EntityTypeName: string;
  BusinessName: string[];
  Gst: string;
  Message: string;
}

async function lookupAbrApi(
  abn: string,
  guid: string
): Promise<AbrResponse | null> {
  try {
    const url = `https://abr.business.gov.au/json/AbnDetails.aspx?abn=${abn}&callback=abrCallback&guid=${guid}`;
    const res = await fetch(url, {
      headers: { Accept: "text/plain" },
    });

    if (!res.ok) return null;

    const text = await res.text();
    const jsonStr = text.replace(/^abrCallback\(/, "").replace(/\)$/, "");
    const data: AbrResponse = JSON.parse(jsonStr);

    if (data.Message && data.Message.length > 0) return null;

    return data;
  } catch {
    return null;
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    console.log('Authorization header present:', !!authHeader);

    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: "Missing authorization header" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    let supabaseUrl: string, supabaseAnonKey: string, supabaseServiceRoleKey: string;
    try {
      supabaseUrl = requireEnv("SUPABASE_URL");
      supabaseAnonKey = requireEnv("SUPABASE_ANON_KEY");
      supabaseServiceRoleKey = requireEnv("SUPABASE_SERVICE_ROLE_KEY");
    } catch (e) {
      console.error(e);
      return new Response(
        JSON.stringify({ error: "Server configuration error" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabase = createClient(
      supabaseUrl,
      supabaseAnonKey,
      { global: { headers: { Authorization: authHeader } } }
    );

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    console.log('User fetch result:', { hasUser: !!user, error: userError });

    if (!user) {
      return new Response(
        JSON.stringify({
          error: "Unauthorized",
          details: userError?.message || "Failed to authenticate user"
        }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { abn } = await req.json();
    if (!abn || typeof abn !== "string") {
      return new Response(
        JSON.stringify({ error: "ABN is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const cleaned = abn.replace(/\s/g, "");

    if (cleaned.length !== 11) {
      return new Response(
        JSON.stringify({
          valid: false,
          message: "ABN must be exactly 11 digits",
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!validateAbnChecksum(cleaned)) {
      return new Response(
        JSON.stringify({
          valid: false,
          message: "Invalid ABN - checksum validation failed",
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    let entityName = "";
    let abnStatus = "Active";
    let entityType = "";
    let apiVerified = false;

    const abrGuid = Deno.env.get("ABR_GUID");
    if (abrGuid) {
      const abrData = await lookupAbrApi(cleaned, abrGuid);
      if (abrData) {
        apiVerified = true;
        abnStatus = abrData.AbnStatus;
        entityName =
          abrData.EntityName ||
          (abrData.BusinessName && abrData.BusinessName.length > 0
            ? abrData.BusinessName[0]
            : "");
        entityType = abrData.EntityTypeName || "";

        if (abnStatus !== "Active") {
          return new Response(
            JSON.stringify({
              valid: false,
              message: `ABN is registered but status is "${abnStatus}". Only active ABNs are accepted.`,
              entityName,
              abnStatus,
            }),
            { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
      }
    }

    const serviceRoleClient = createClient(
      supabaseUrl,
      supabaseServiceRoleKey
    );

    await serviceRoleClient
      .from("profiles")
      .update({
        abn_number: cleaned,
        abn_entity_name: entityName || null,
        abn_verified: true,
      })
      .eq("id", user.id);

    return new Response(
      JSON.stringify({
        valid: true,
        entityName,
        abnStatus,
        entityType,
        apiVerified,
        message: apiVerified
          ? `ABN verified via Australian Business Register`
          : `ABN checksum valid`,
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
