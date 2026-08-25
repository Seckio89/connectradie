// Getting a usable Google access token for a stored calendar integration.
//
// ⚠️ WHY THIS IS SHARED AND INJECTABLE. `sync-google-calendar` and
// `google-calendar-import` each carried their own copy of the refresh grant,
// and the copies had already drifted: sync preserved a rotated refresh token,
// import silently dropped it (`google-calendar-import/index.ts:103-106`), which
// would strand the integration the first time Google rotated one. Neither could
// be tested, because both read the clock and the network directly. One
// implementation with `now`, `fetchImpl` and `persist` passed in is what makes
// the refresh path assertable without waiting an hour or touching Google.
//
// THE THREE BEHAVIOURS THAT WERE WRONG BEFORE:
//
//   1. No skew buffer. The old check was `now >= expiresAt`, so a sync starting
//      a second before expiry passed the gate and then ran its whole batch of
//      Google calls on a token that died mid-flight. Google's access tokens
//      last exactly 3600s and `token_expires_at` is computed from OUR clock at
//      exchange time, so the two are never quite aligned. Refresh early.
//
//   2. `refresh_token IS NULL` was a shrug, not a failure. The old guard read
//      `if (now >= expiresAt && integration.refresh_token)` — an integration
//      with no saved refresh token fell straight past it and carried on with a
//      long-dead access token, whereupon every Google call 401'd into a
//      swallowed error and the sync reported success. There is nothing to renew
//      in that state; say so.
//
//   3. A rotated refresh token could be dropped. Google usually returns no
//      `refresh_token` on a refresh, so the stored one must survive — but when
//      it DOES return one, that is the only copy that will work next time.
//      Both cases are handled here, once.
//
// 🔒 CREDENTIAL DISCIPLINE. The request body sent to Google's token endpoint
// carries `client_secret` and the refresh token. It is never logged, never
// returned, and never persisted. Only Google's RESPONSE body reaches
// `parseGoogleTokenError`, and those bodies are `{error, error_description}`.
// See `_shared/googleTokenError.ts`.

import { parseGoogleTokenError } from "./googleTokenError.ts";
import type { Update } from "./dbTypes.ts";

/** Refresh this long before the token actually expires. */
export const REFRESH_SKEW_MS = 5 * 60 * 1000;

/** Google's documented access-token life, used only if it omits `expires_in`. */
const DEFAULT_EXPIRES_IN = 3600;

const TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token";

/** The columns of `calendar_integrations` this module reads. */
export interface StoredIntegration {
  id: string;
  access_token: string;
  refresh_token: string | null;
  token_expires_at: string;
}

/** A patch for the integration row. Annotated so excess columns fail to compile. */
export type IntegrationPatch = Update<"calendar_integrations">;

export type GoogleTokenResult =
  | {
    ok: true;
    accessToken: string;
    /** Seconds of life left on the token being returned. */
    expiresInSeconds: number;
    /** False when the stored token was still good and no call to Google was made. */
    refreshed: boolean;
    /** True when Google issued a NEW refresh token and it was persisted. */
    refreshTokenRotated: boolean;
  }
  | {
    ok: false;
    /** `no_refresh_token`: nothing to renew with. `refused`: Google said no. */
    reason: "no_refresh_token" | "refused";
    /** Google's machine-readable code, or `no_refresh_token`. */
    code: string;
    /** Safe to show a tradie — names what failed and what to do. */
    message: string;
    detail: string;
    /** True only when reconnecting can actually fix it. */
    needsReconnect: boolean;
  };

export interface GetGoogleAccessTokenOptions {
  integration: StoredIntegration;
  clientId: string;
  clientSecret: string;
  /** Writes a patch to this integration's row. Injected so tests can spy. */
  persist: (patch: IntegrationPatch) => Promise<void>;
  /** Epoch ms. Injected so tests need no fake clock. */
  now?: number;
  skewMs?: number;
  /** Refresh even if the stored token still looks good. Powers `action=refresh`. */
  force?: boolean;
  fetchImpl?: typeof fetch;
}

interface GoogleTokenResponse {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
}

/**
 * Reconnecting mints a new refresh token, so it is the fix for a dead or absent
 * authorisation — and it is NOT the fix for anything else. `invalid_client`
 * means `GOOGLE_CLIENT_SECRET` does not match the OAuth client, and a reconnect
 * fails the same way, so telling a tradie to reconnect sends them round a loop
 * that cannot terminate. A transient 5xx or an HTML proxy page (`unknown`) must
 * not nag them either — the next sync will simply work.
 */
function reconnectFixes(code: string): boolean {
  return code === "invalid_grant" || code === "no_refresh_token";
}

/**
 * Return an access token that is good right now, refreshing first if needed.
 *
 * Never returns a token it believes to be expired: the caller can use the
 * result without re-checking the clock.
 */
export async function getGoogleAccessToken(
  opts: GetGoogleAccessTokenOptions,
): Promise<GoogleTokenResult> {
  const {
    integration,
    clientId,
    clientSecret,
    persist,
    now = Date.now(),
    skewMs = REFRESH_SKEW_MS,
    force = false,
    fetchImpl = fetch,
  } = opts;

  // An unparseable expiry fails CLOSED — refresh rather than trust it. A stored
  // timestamp we cannot read is not evidence that the token is alive.
  const expiresAtMs = Date.parse(integration.token_expires_at);
  const stillGood = Number.isFinite(expiresAtMs) && now < expiresAtMs - skewMs;

  if (stillGood && !force) {
    return {
      ok: true,
      accessToken: integration.access_token,
      expiresInSeconds: Math.floor((expiresAtMs - now) / 1000),
      refreshed: false,
      refreshTokenRotated: false,
    };
  }

  if (!integration.refresh_token) {
    // Nothing to renew with. Flagging the row is the whole point: before this,
    // the caller carried on with the dead access token and reported success.
    const message =
      "Reconnect Google Calendar — there's no saved authorisation left to renew.";
    await persist({
      needs_reconnect: true,
      last_refresh_error_code: "no_refresh_token",
      last_refresh_error: "no refresh_token stored for this integration",
      last_refresh_error_at: new Date(now).toISOString(),
    });
    return {
      ok: false,
      reason: "no_refresh_token",
      code: "no_refresh_token",
      message,
      detail: "no refresh_token stored for this integration",
      needsReconnect: true,
    };
  }

  const response = await fetchImpl(TOKEN_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    // 🔒 Carries client_secret and the refresh token. Never log this.
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: integration.refresh_token,
      grant_type: "refresh_token",
    }),
  });

  if (!response.ok) {
    // Response body only — see the credential note at the top of this file.
    const { code, message, detail } = parseGoogleTokenError(await response.text());
    const needsReconnect = reconnectFixes(code);
    console.error("Google token refresh failed", response.status, code, detail);

    await persist({
      last_refresh_error_code: code,
      last_refresh_error: detail,
      last_refresh_error_at: new Date(now).toISOString(),
      ...(needsReconnect ? { needs_reconnect: true } : {}),
    });

    return { ok: false, reason: "refused", code, message, detail, needsReconnect };
  }

  const tokens: GoogleTokenResponse = await response.json();
  const accessToken = tokens.access_token;

  if (!accessToken) {
    // A 200 with no token is not a success. Treat it like a refusal rather than
    // returning `undefined` for the caller to send to Google as a bearer.
    const detail = "token endpoint returned 200 with no access_token";
    console.error("Google token refresh failed", response.status, "no_access_token", detail);
    await persist({
      last_refresh_error_code: "no_access_token",
      last_refresh_error: detail,
      last_refresh_error_at: new Date(now).toISOString(),
    });
    return {
      ok: false,
      reason: "refused",
      code: "no_access_token",
      message: "Reconnect Google Calendar — Google refused the token request.",
      detail,
      needsReconnect: false,
    };
  }

  const expiresInSeconds = Number.isFinite(tokens.expires_in)
    ? Number(tokens.expires_in)
    : DEFAULT_EXPIRES_IN;
  const rotated = typeof tokens.refresh_token === "string" && tokens.refresh_token.length > 0;

  // Google normally returns NO refresh_token here, and writing null over the
  // stored one would leave the row unrenewable — so only write it when one
  // actually came back. When one does, it is the only copy that will work next
  // time, which is the bug this fixes in google-calendar-import.
  await persist({
    access_token: accessToken,
    token_expires_at: new Date(now + expiresInSeconds * 1000).toISOString(),
    ...(rotated ? { refresh_token: tokens.refresh_token } : {}),
    last_refresh_ok_at: new Date(now).toISOString(),
    needs_reconnect: false,
    last_refresh_error_code: null,
    last_refresh_error: null,
    last_refresh_error_at: null,
  });

  return {
    ok: true,
    accessToken,
    expiresInSeconds,
    refreshed: true,
    refreshTokenRotated: rotated,
  };
}
