import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.4";
import { checkRateLimit } from "../_shared/rateLimiter.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": Deno.env.get("ALLOWED_ORIGIN") || "https://connectradie.com",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

interface TokenResponse {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
  token_type: string;
}

// ── Signed OAuth state ───────────────────────────────────────────────────────
// The callback arrives from Google with NO auth header, so the state param is
// the only claim of user identity. A bare user ID is forgeable (anyone could
// bind their Google account to another tradie's calendar integration), so we
// HMAC-sign it: state = "<userId>.<expiresAtMs>.<hmac(userId.expiresAtMs)>".
// Verified with constant-time crypto.subtle.verify at the callback.
const STATE_TTL_MS = 10 * 60 * 1000; // consent flow must complete within 10 min

function stateKeyMaterial(): string {
  // Dedicated secret preferred; service-role key as fallback so the flow keeps
  // working before OAUTH_STATE_SECRET is provisioned. Both are server-only.
  return Deno.env.get("OAUTH_STATE_SECRET") || Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
}

async function stateHmacKey(usages: KeyUsage[]): Promise<CryptoKey> {
  return await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(stateKeyMaterial()),
    { name: "HMAC", hash: "SHA-256" },
    false,
    usages,
  );
}

async function signState(userId: string): Promise<string> {
  const payload = `${userId}.${Date.now() + STATE_TTL_MS}`;
  const key = await stateHmacKey(["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payload));
  const sigHex = Array.from(new Uint8Array(sig)).map((b) => b.toString(16).padStart(2, "0")).join("");
  return `${payload}.${sigHex}`;
}

// Returns the userId when the state is authentic and unexpired, else null.
async function verifyState(state: string): Promise<string | null> {
  const parts = state.split(".");
  if (parts.length !== 3) return null;
  const [userId, expStr, sigHex] = parts;
  const exp = Number(expStr);
  if (!userId || !Number.isFinite(exp) || Date.now() > exp) return null;
  if (!/^[0-9a-f]+$/.test(sigHex) || sigHex.length % 2 !== 0) return null;
  const sig = new Uint8Array(sigHex.match(/.{2}/g)!.map((h) => parseInt(h, 16)));
  const key = await stateHmacKey(["verify"]);
  const ok = await crypto.subtle.verify("HMAC", key, sig, new TextEncoder().encode(`${userId}.${exp}`));
  return ok ? userId : null;
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

    const url = new URL(req.url);
    const code = url.searchParams.get("code");
    const state = url.searchParams.get("state");
    const action = url.searchParams.get("action");

    // OAuth callback from Google — no auth header (browser redirect with ?code=)
    // User identity comes from the SIGNED state param, verified below.
    let callbackUserId: string | null = null;
    let authedUser: { id: string; email?: string } | null = null;
    if (code && state) {
      // Callback path: the state must be authentic (HMAC) and unexpired —
      // otherwise anyone could bind their Google account to another tradie.
      callbackUserId = await verifyState(state);
      if (!callbackUserId) {
        return new Response(
          JSON.stringify({ error: "Invalid or expired sign-in state. Please reconnect Google Calendar from Settings." }),
          { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    } else {
      // All other requests (initiation, disconnect) require auth
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

      const token = authHeader.replace("Bearer ", "");
      const { data: { user: authUser }, error: userError } = await supabaseClient.auth.getUser(token);

      if (userError || !authUser) {
        return new Response(
          JSON.stringify({ error: "Unauthorized" }),
          {
            status: 401,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          }
        );
      }

      // Local to this request — a globalThis stash here would race across
      // concurrent requests in the same isolate.
      authedUser = authUser;

      const { allowed } = checkRateLimit(`${authUser.id}-google-calendar-oauth`, 15, 60000);
      if (!allowed) {
        return new Response(
          JSON.stringify({ error: "Rate limit exceeded. Please try again later." }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    // For initiation/disconnect, use the authenticated user.
    // For the OAuth callback, use the identity proven by the signed state.
    const user = callbackUserId ? { id: callbackUserId } : authedUser;

    // Handle OAuth initiation
    if (action === "initiate") {
      const clientId = Deno.env.get("GOOGLE_CLIENT_ID");
      const redirectUri = `${Deno.env.get("SUPABASE_URL")}/functions/v1/google-calendar-oauth`;

      if (!clientId) {
        return new Response(
          JSON.stringify({ error: "Google Calendar not configured" }),
          {
            status: 500,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          }
        );
      }

      const authUrl = new URL("https://accounts.google.com/o/oauth2/v2/auth");
      authUrl.searchParams.set("client_id", clientId);
      authUrl.searchParams.set("redirect_uri", redirectUri);
      authUrl.searchParams.set("response_type", "code");
      // Narrowest scope that covers our use: read/write EVENTS on the user's
      // calendars. We never touch calendar-list settings or other calendars, so
      // the broader auth/calendar scope isn't needed (and it slows Google's
      // sensitive-scope verification). We address the user's primary calendar by
      // the literal id "primary", which the events API accepts.
      authUrl.searchParams.set("scope", "https://www.googleapis.com/auth/calendar.events");
      authUrl.searchParams.set("access_type", "offline");
      authUrl.searchParams.set("prompt", "consent");
      authUrl.searchParams.set("state", await signState(user!.id));

      return new Response(
        JSON.stringify({ authUrl: authUrl.toString() }),
        {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Handle OAuth callback
    if (!code || !state) {
      return new Response(
        JSON.stringify({ error: "Missing code or state parameter" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // State authenticity + expiry already verified above (verifyState) —
    // `user.id` is the proven owner of this consent flow.

    const clientId = Deno.env.get("GOOGLE_CLIENT_ID");
    const clientSecret = Deno.env.get("GOOGLE_CLIENT_SECRET");
    const redirectUri = `${Deno.env.get("SUPABASE_URL")}/functions/v1/google-calendar-oauth`;

    if (!clientId || !clientSecret) {
      return new Response(
        JSON.stringify({ error: "Google Calendar not configured" }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Exchange code for tokens
    const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
        grant_type: "authorization_code",
      }),
    });

    if (!tokenResponse.ok) {
      const error = await tokenResponse.text();
      return new Response(
        JSON.stringify({ error: "Failed to exchange code for tokens", details: error }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const tokens: TokenResponse = await tokenResponse.json();

    // Calculate token expiry
    const expiresAt = new Date(Date.now() + tokens.expires_in * 1000);

    // Address the primary calendar by the literal alias "primary". Fetching the
    // real calendar id via calendarList would require the broader auth/calendar
    // scope; the events API accepts "primary" and it maps to whichever calendar
    // is primary for this account, so no extra scope is needed.
    const calendarId = "primary";

    // Store integration in database
    const { error: dbError } = await supabaseClient
      .from("calendar_integrations")
      .upsert({
        tradie_id: callbackUserId,
        provider: "google",
        access_token: tokens.access_token,
        refresh_token: tokens.refresh_token || null,
        token_expires_at: expiresAt.toISOString(),
        calendar_id: calendarId,
        sync_enabled: true,
        last_synced_at: null,
      }, {
        onConflict: "tradie_id,provider",
      });

    if (dbError) {
      return new Response(
        JSON.stringify({ error: "Failed to save integration", details: dbError.message }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    return new Response(
      JSON.stringify({
        success: true,
        message: "Google Calendar connected successfully",
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
