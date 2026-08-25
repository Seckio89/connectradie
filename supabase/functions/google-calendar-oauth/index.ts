import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.4";
import { checkRateLimit } from "../_shared/rateLimiter.ts";
import type { Insert } from "../_shared/dbTypes.ts";
import { parseGoogleTokenError } from "../_shared/googleTokenError.ts";

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

// The OAuth callback runs in the system browser (Chrome Custom Tab /
// SFSafariViewController). Supabase's functions domain force-serves responses as
// text/plain with nosniff, so HTML returned here shows as raw source. Instead we
// redirect to a static confirmation page on our own domain (Vercel serves it as
// real HTML), which renders correctly and needs no auth.
const APP_ORIGIN = Deno.env.get("ALLOWED_ORIGIN") || "https://connectradie.com";
function resultRedirect(status: "ok" | "expired" | "failed" | "noconsent"): Response {
  return Response.redirect(`${APP_ORIGIN}/calendar-connected?status=${status}`, 302);
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
        return resultRedirect("expired");
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

      const { allowed } = await checkRateLimit(`${authUser.id}-google-calendar-oauth`, 15, 60000);
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
      // Scopes:
      //  - calendar.events   → read/write events (existing push-to-Google sync).
      //  - calendar.readonly → list ALL the user's calendars (calendarList) and
      //    read their events, for the Google Calendar → ConnecTradie import.
      // Both are sensitive; they go through Google verification round 2.
      authUrl.searchParams.set("scope", "https://www.googleapis.com/auth/calendar.events https://www.googleapis.com/auth/calendar.readonly");
      authUrl.searchParams.set("access_type", "offline");
      authUrl.searchParams.set("prompt", "consent");
      // Carry forward anything the tradie has already granted, so a re-consent
      // cannot come back NARROWER than the grant it replaces.
      authUrl.searchParams.set("include_granted_scopes", "true");
      authUrl.searchParams.set("state", await signState(user!.id));

      return new Response(
        JSON.stringify({ authUrl: authUrl.toString() }),
        {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Handle disconnect.
    //
    // Two comments in this file have claimed since launch that disconnect is
    // handled here. It never was — no branch matched it, so the request fell
    // through to the callback path and died on "Missing code or state". No
    // frontend called it, so nothing surfaced, and a tradie whose refresh token
    // Google had revoked was stuck: the dashboard only offers Connect when no
    // integration row exists, and nothing could remove that row.
    if (action === "disconnect") {
      const { data: integration } = await supabaseClient
        .from("calendar_integrations")
        .select("id, refresh_token, access_token")
        .eq("tradie_id", user!.id)
        .eq("provider", "google")
        .maybeSingle();

      if (!integration) {
        // Already gone. Disconnecting nothing is the desired end state, so this
        // succeeds rather than erroring — the caller wants "not connected".
        return new Response(
          JSON.stringify({ success: true, alreadyDisconnected: true }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Best-effort revoke at Google, so the grant disappears from the tradie's
      // account permissions too. Never blocks the disconnect: if Google has
      // already revoked the token this returns 400, which is the very state the
      // tradie is trying to clear.
      const revokeToken = integration.refresh_token || integration.access_token;
      if (revokeToken) {
        try {
          const revokeRes = await fetch("https://oauth2.googleapis.com/revoke", {
            method: "POST",
            headers: { "Content-Type": "application/x-www-form-urlencoded" },
            body: new URLSearchParams({ token: revokeToken }),
          });
          if (!revokeRes.ok) {
            console.warn("Google revoke returned", revokeRes.status, (await revokeRes.text()).slice(0, 200));
          }
        } catch (revokeErr) {
          console.warn("Google revoke request failed:", revokeErr);
        }
      }

      const { error: deleteError } = await supabaseClient
        .from("calendar_integrations")
        .delete()
        .eq("id", integration.id);

      if (deleteError) {
        console.error("Disconnect delete failed:", deleteError.message, deleteError.details);
        return new Response(
          JSON.stringify({ error: "Could not disconnect Google Calendar. Try again." }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      return new Response(
        JSON.stringify({ success: true }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
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
      // The callback answers with a redirect, so this log is the only place the
      // reason survives. Response body only — the request above carries
      // client_secret and must never be logged.
      const { code, detail } = parseGoogleTokenError(await tokenResponse.text());
      console.error(
        "Google code exchange failed",
        tokenResponse.status,
        code,
        detail
      );
      return resultRedirect("failed");
    }

    const tokens: TokenResponse = await tokenResponse.json();

    // Calculate token expiry
    const expiresAt = new Date(Date.now() + tokens.expires_in * 1000);

    // Address the primary calendar by the literal alias "primary". Fetching the
    // real calendar id via calendarList would require the broader auth/calendar
    // scope; the events API accepts "primary" and it maps to whichever calendar
    // is primary for this account, so no extra scope is needed.
    const calendarId = "primary";

    // verifyState is what proves who this callback belongs to, and it redirects
    // on failure — so this is unreachable. Assert it as a guard rather than with
    // `!`, because the row this identifies is the one holding the tradie's
    // Google credentials, and a null here would upsert it onto nobody.
    if (!callbackUserId) {
      console.error("OAuth callback reached the token exchange with no verified user");
      return resultRedirect("failed");
    }

    // ⚠️ THE REFRESH TOKEN IS THE WHOLE INTEGRATION. Without one, this row is
    // good for exactly one hour and can never be renewed.
    //
    // This upsert used to write `refresh_token: tokens.refresh_token || null`.
    // Google returns a refresh token on a FIRST consent, but a re-consent it
    // decides to auto-approve can come back without one — and that `|| null`
    // then wrote NULL over the working token already stored, bricking a healthy
    // integration in one click. Keep what we have unless Google gives us better.
    const { data: existing } = await supabaseClient
      .from("calendar_integrations")
      .select("refresh_token")
      .eq("tradie_id", callbackUserId)
      .eq("provider", "google")
      .maybeSingle();

    const newRefreshToken = tokens.refresh_token || null;
    const keptRefreshToken = existing?.refresh_token ?? null;
    const haveRefreshToken = Boolean(newRefreshToken || keptRefreshToken);

    const payload: Insert<"calendar_integrations"> = {
      tradie_id: callbackUserId,
      provider: "google",
      access_token: tokens.access_token,
      token_expires_at: expiresAt.toISOString(),
      calendar_id: calendarId,
      sync_enabled: true,
      last_synced_at: null,
      // No refresh token anywhere means this connection cannot outlive the hour.
      // Say so in the row rather than letting the next sync discover it.
      needs_reconnect: !haveRefreshToken,
      last_refresh_error_code: haveRefreshToken ? null : "no_refresh_token",
      last_refresh_error: haveRefreshToken ? null : "Google returned no refresh token at consent",
      last_refresh_error_at: haveRefreshToken ? null : new Date().toISOString(),
      // Only write the key when we actually have a new one — omitting it leaves
      // the stored token untouched on an update.
      ...(newRefreshToken ? { refresh_token: newRefreshToken } : {}),
    };

    const { error: dbError } = await supabaseClient
      .from("calendar_integrations")
      .upsert(payload, { onConflict: "tradie_id,provider" });

    if (dbError) {
      console.error("Failed to store calendar integration", dbError.message);
      return resultRedirect("failed");
    }

    if (!haveRefreshToken) {
      console.error(
        `Google consent for ${callbackUserId} returned no refresh token and none was stored — the connection cannot be renewed`,
      );
      return resultRedirect("noconsent");
    }

    return resultRedirect("ok");
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
