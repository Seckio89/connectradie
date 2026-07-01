import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { checkRateLimit } from "../_shared/rateLimiter.ts";

function requireEnv(key: string): string {
  const val = Deno.env.get(key);
  if (!val) throw new Error(`Missing required env var: ${key}`);
  return val;
}

const corsHeaders = {
  "Access-Control-Allow-Origin": Deno.env.get("ALLOWED_ORIGIN") || "https://connectradie.com",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers":
    "Content-Type, Authorization, X-Client-Info, Apikey",
};

interface LicenseVerificationRequest {
  licenseNumber: string;
  licenseState: string;
  expiryDate: string;
}

interface LicenseAuthorityResult {
  found: boolean;
  holderName: string;
  licenseClass: string;
  status: string; // 'current' | 'suspended' | 'cancelled' etc.
  expiryDate: string | null;
}

function validateLicenseFormat(
  licenseNumber: string,
  state: string
): { valid: boolean; message: string } {
  const cleaned = licenseNumber.replace(/\s/g, "").toUpperCase();

  const stateFormats: Record<string, RegExp> = {
    NSW: /^[A-Z0-9]{6,10}$/,
    VIC: /^[A-Z0-9]{6,10}$/,
    QLD: /^[A-Z0-9]{6,10}$/,
    SA: /^[A-Z0-9]{6,10}$/,
    WA: /^[A-Z0-9]{6,10}$/,
    TAS: /^[A-Z0-9]{6,10}$/,
    NT: /^[A-Z0-9]{6,10}$/,
    ACT: /^[A-Z0-9]{6,10}$/,
  };

  const format = stateFormats[state.toUpperCase()];
  if (!format) {
    return {
      valid: false,
      message: "Invalid state code. Must be NSW, VIC, QLD, SA, WA, TAS, NT, or ACT",
    };
  }

  if (!format.test(cleaned)) {
    return {
      valid: false,
      message: `License number format invalid for ${state}. Expected 6-10 alphanumeric characters`,
    };
  }

  return { valid: true, message: "Format valid" };
}

function validateExpiryDate(expiryDate: string): {
  valid: boolean;
  message: string;
  daysUntilExpiry?: number;
} {
  const expiry = new Date(expiryDate);
  const now = new Date();

  if (isNaN(expiry.getTime())) {
    return { valid: false, message: "Invalid date format" };
  }

  if (expiry < now) {
    return { valid: false, message: "License has expired" };
  }

  const daysUntilExpiry = Math.ceil(
    (expiry.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)
  );

  if (daysUntilExpiry < 30) {
    return {
      valid: true,
      message: `License expires in ${daysUntilExpiry} days. Please renew soon.`,
      daysUntilExpiry,
    };
  }

  return {
    valid: true,
    message: "License is valid",
    daysUntilExpiry,
  };
}

async function lookupQBCC(
  licenseNumber: string,
  apiKey: string
): Promise<LicenseAuthorityResult | null> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);

    const apiUrl =
      Deno.env.get("LICENSE_API_URL_QLD") ||
      "https://api.qbcc.qld.gov.au/api/v1/licences";

    const res = await fetch(`${apiUrl}/${licenseNumber}`, {
      headers: {
        Authorization: `Bearer ${apiKey}`,
        Accept: "application/json",
      },
      signal: controller.signal,
    });

    clearTimeout(timeout);

    if (!res.ok) return null;

    const data = await res.json();

    return {
      found: true,
      holderName: data.holderName || data.name || "",
      licenseClass: data.licenseClass || data.class || "",
      status: (data.status || "").toLowerCase(),
      expiryDate: data.expiryDate || null,
    };
  } catch {
    return null;
  }
}

async function lookupNSWFairTrading(
  licenseNumber: string,
  apiKey: string
): Promise<LicenseAuthorityResult | null> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);

    const apiUrl =
      Deno.env.get("LICENSE_API_URL_NSW") ||
      "https://api.onegov.nsw.gov.au/FairTrading/licences";

    const res = await fetch(`${apiUrl}/${licenseNumber}`, {
      headers: {
        "x-api-key": apiKey,
        Accept: "application/json",
      },
      signal: controller.signal,
    });

    clearTimeout(timeout);

    if (!res.ok) return null;

    const data = await res.json();

    return {
      found: true,
      holderName: data.holderName || data.name || "",
      licenseClass: data.licenseClass || data.category || "",
      status: (data.status || "").toLowerCase(),
      expiryDate: data.expiryDate || null,
    };
  } catch {
    return null;
  }
}

async function lookupVBA(
  licenseNumber: string,
  apiKey: string
): Promise<LicenseAuthorityResult | null> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);

    const apiUrl =
      Deno.env.get("LICENSE_API_URL_VIC") ||
      "https://api.vba.vic.gov.au/v1/practitioners";

    const res = await fetch(`${apiUrl}/${licenseNumber}`, {
      headers: {
        Authorization: `Bearer ${apiKey}`,
        Accept: "application/json",
      },
      signal: controller.signal,
    });

    clearTimeout(timeout);

    if (!res.ok) return null;

    const data = await res.json();

    return {
      found: true,
      holderName: data.holderName || data.practitionerName || "",
      licenseClass: data.licenseClass || data.registrationClass || "",
      status: (data.status || "").toLowerCase(),
      expiryDate: data.expiryDate || null,
    };
  } catch {
    return null;
  }
}

function lookupLicenseAuthority(
  licenseNumber: string,
  state: string
): Promise<{ result: LicenseAuthorityResult | null; apiVerified: boolean }> {
  const stateConfig: Record<
    string,
    {
      envVar: string;
      lookupFn: (
        ln: string,
        key: string
      ) => Promise<LicenseAuthorityResult | null>;
    }
  > = {
    QLD: { envVar: "LICENSE_API_KEY_QLD", lookupFn: lookupQBCC },
    NSW: { envVar: "LICENSE_API_KEY_NSW", lookupFn: lookupNSWFairTrading },
    VIC: { envVar: "LICENSE_API_KEY_VIC", lookupFn: lookupVBA },
  };

  const config = stateConfig[state.toUpperCase()];
  if (!config) {
    return Promise.resolve({ result: null, apiVerified: false });
  }

  const apiKey = Deno.env.get(config.envVar);
  if (!apiKey) {
    return Promise.resolve({ result: null, apiVerified: false });
  }

  return config.lookupFn(licenseNumber, apiKey).then((result) => ({
    result,
    apiVerified: result !== null,
  }));
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
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


    if (!user) {
      return new Response(
        JSON.stringify({
          error: "Unauthorized",
          details: userError?.message || "Failed to authenticate user",
        }),
        {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const { allowed } = checkRateLimit(`${user.id}-verify-license`, 15, 60000);
    if (!allowed) {
      return new Response(
        JSON.stringify({ error: "Rate limit exceeded. Please try again later." }),
        { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { licenseNumber, licenseState, expiryDate } =
      (await req.json()) as LicenseVerificationRequest;

    if (!licenseNumber || typeof licenseNumber !== "string") {
      return new Response(
        JSON.stringify({ error: "License number is required" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    if (!licenseState || typeof licenseState !== "string") {
      return new Response(
        JSON.stringify({ error: "License state is required" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    if (!expiryDate || typeof expiryDate !== "string") {
      return new Response(
        JSON.stringify({ error: "Expiry date is required" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const formatValidation = validateLicenseFormat(licenseNumber, licenseState);
    if (!formatValidation.valid) {
      return new Response(
        JSON.stringify({
          valid: false,
          message: formatValidation.message,
        }),
        {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const expiryValidation = validateExpiryDate(expiryDate);
    if (!expiryValidation.valid) {
      return new Response(
        JSON.stringify({
          valid: false,
          message: expiryValidation.message,
        }),
        {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const cleaned = licenseNumber.replace(/\s/g, "").toUpperCase();

    // Attempt authority lookup (gated by env var per state)
    const { result: authorityResult, apiVerified } =
      await lookupLicenseAuthority(cleaned, licenseState);

    // If authority says license is not current/active, reject
    if (authorityResult && !["current", "active"].includes(authorityResult.status)) {
      return new Response(
        JSON.stringify({
          valid: false,
          message: `License found but status is "${authorityResult.status}". Only current/active licenses are accepted.`,
          holderName: authorityResult.holderName,
          licenseClass: authorityResult.licenseClass,
          apiVerified: true,
        }),
        {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const serviceRoleClient = createClient(
      supabaseUrl,
      supabaseServiceRoleKey
    );

    await serviceRoleClient
      .from("profiles")
      .update({
        license_number: cleaned,
        license_state: licenseState.toUpperCase(),
        license_expiry: expiryDate,
        license_verified: true,
        license_holder_name: authorityResult?.holderName || null,
        license_api_verified: apiVerified,
        license_class: authorityResult?.licenseClass || null,
      })
      .eq("id", user.id);

    const verificationMessage = expiryValidation.daysUntilExpiry && expiryValidation.daysUntilExpiry < 30
      ? expiryValidation.message
      : apiVerified
        ? `License verified via ${licenseState.toUpperCase()} Licensing Authority`
        : "License format and expiry validated";

    return new Response(
      JSON.stringify({
        valid: true,
        message: verificationMessage,
        daysUntilExpiry: expiryValidation.daysUntilExpiry,
        licenseNumber: cleaned,
        licenseState: licenseState.toUpperCase(),
        apiVerified,
        holderName: authorityResult?.holderName || null,
        licenseClass: authorityResult?.licenseClass || null,
        note: apiVerified
          ? `Verified via ${licenseState.toUpperCase()} Licensing Authority API`
          : "Format validation only. Real-time verification with licensing authority not available.",
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Internal server error";
    console.error("License verification error:", message);
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
