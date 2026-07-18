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

// Branded, self-contained result page for the OAuth callback. The consent flow
// now runs in the system browser (Chrome Custom Tab / SFSafariViewController on
// the native app), so the user lands here rather than seeing raw JSON. Kept
// dependency-free (inline CSS) so it renders anywhere.
function resultPage(opts: { ok: boolean; title: string; message: string }): Response {
  const { ok, title, message } = opts;
  const accent = ok ? "#06D6A0" : "#E11D48";
  const icon = ok ? "&#10003;" : "!";
  const html = `<!doctype html>
<html lang="en"><head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${title}</title>
<style>
  *{box-sizing:border-box} html,body{margin:0;height:100%}
  body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;
       background:#0F1B2D;color:#0f172a;display:flex;align-items:center;justify-content:center;padding:24px}
  .card{background:#fff;border-radius:20px;max-width:380px;width:100%;padding:32px 28px;text-align:center;
        box-shadow:0 12px 40px rgba(0,0,0,.25)}
  .badge{width:64px;height:64px;border-radius:50%;background:${accent}1a;color:${accent};
         font-size:32px;line-height:64px;margin:0 auto 18px;font-weight:700}
  h1{font-size:20px;margin:0 0 8px;color:#0f172a}
  p{font-size:14px;line-height:1.55;color:#475569;margin:0 0 22px}
  .hint{font-size:13px;color:#94a3b8;margin:0}
  .btn{display:inline-block;background:${accent};color:#fff;text-decoration:none;font-weight:600;
       font-size:14px;padding:11px 22px;border-radius:12px;border:0;cursor:pointer}
  .brand{margin-top:22px;font-size:12px;color:#94a3b8;letter-spacing:.02em}
  .brand b{color:#0F1B2D}.brand b span{color:${accent}}
</style></head>
<body>
  <div class="card">
    <div class="badge">${icon}</div>
    <h1>${title}</h1>
    <p>${message}</p>
    <button class="btn" onclick="window.close()">Close</button>
    <p class="hint" style="margin-top:14px">If this doesn't close, just return to the ConnecTradie app.</p>
    <div class="brand"><b>Connec<span>Tradie</span></b></div>
  </div>
</body></html>`;
  return new Response(html, {
    status: ok ? 200 : 400,
    headers: { ...corsHeaders, "Content-Type": "text/html; charset=utf-8" },
  });
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
        return resultPage({
          ok: false,
          title: "Sign-in expired",
          message: "This Google sign-in link has expired. Please return to ConnecTradie and tap Connect again.",
        });
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
      // Scopes:
      //  - calendar.events   → read/write events (existing push-to-Google sync).
      //  - calendar.readonly → list ALL the user's calendars (calendarList) and
      //    read their events, for the Google Calendar → ConnecTradie import.
      // Both are sensitive; they go through Google verification round 2.
      authUrl.searchParams.set("scope", "https://www.googleapis.com/auth/calendar.events https://www.googleapis.com/auth/calendar.readonly");
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
      return resultPage({
        ok: false,
        title: "Couldn't connect Google",
        message: "Google declined the connection. Please return to ConnecTradie and try Connect again.",
      });
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
      return resultPage({
        ok: false,
        title: "Couldn't save the connection",
        message: "We connected to Google but couldn't finish saving it. Please return to ConnecTradie and try again.",
      });
    }

    return resultPage({
      ok: true,
      title: "Google Calendar connected",
      message: "You're all set. Return to the ConnecTradie app and tap “Load my calendars” to import your jobs.",
    });
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
