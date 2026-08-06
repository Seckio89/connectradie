// Reading Google's OAuth token-endpoint failures.
//
// ⚠️ Until 2026-08-03 all three calendar functions threw this response away.
// `sync-google-calendar` returned a flat "Failed to refresh access token",
// `google-calendar-import` a flat "token refresh failed", and
// `google-calendar-oauth` redirected to ?status=failed with nothing logged.
//
// That cost six days. A tradie's sync broke on 28 July and the only signal
// anywhere — app, logs, database — was a message that named no cause and no
// remedy. The two failures that actually happen need OPPOSITE responses:
//
//   invalid_grant   the refresh token is dead (revoked, expired, consent
//                   withdrawn). No server-side fix exists — the tradie must
//                   reconnect, which mints a new one.
//   invalid_client  GOOGLE_CLIENT_SECRET does not match the OAuth client.
//                   Reconnecting cannot help; the secret has to be corrected
//                   first, or the reconnect fails the same way.
//
// Telling a tradie to reconnect when the secret is wrong sends them round a
// loop that cannot terminate, so the distinction is the whole point.
//
// 🔒 Pass the RESPONSE body only. The request body sent to this endpoint
// carries client_secret and refresh_token; it must never reach a log. Google's
// error responses are {error, error_description} and hold no credentials.

export interface GoogleTokenError {
  /** Google's machine-readable code, e.g. "invalid_grant". "unknown" if absent. */
  code: string;
  /** Message naming what the reader should do next. Safe to show a user. */
  message: string;
  /** Truncated raw body, for the response payload. Never a credential. */
  detail: string;
}

/**
 * Turn a failed token-endpoint response body into a code plus an actionable
 * message. `body` is the raw text of the RESPONSE — see the warning above.
 */
export function parseGoogleTokenError(body: string): GoogleTokenError {
  let code = "unknown";
  try {
    const parsed = JSON.parse(body);
    if (parsed && typeof parsed.error === "string") code = parsed.error;
  } catch {
    // Google occasionally answers with non-JSON (an HTML error page from a
    // proxy, say). The raw body still goes to the log and the caller still
    // gets a usable message, so this is not worth failing over.
  }

  return { code, message: messageFor(code), detail: body.slice(0, 300) };
}

function messageFor(code: string): string {
  switch (code) {
    case "invalid_grant":
      return "Reconnect Google Calendar — Google no longer accepts the saved authorisation.";
    case "invalid_client":
    case "unauthorized_client":
      return "Google rejected this app's credentials. Check GOOGLE_CLIENT_SECRET before reconnecting.";
    case "invalid_scope":
      return "Reconnect Google Calendar and grant calendar access.";
    default:
      return "Reconnect Google Calendar — Google refused the token request.";
  }
}
