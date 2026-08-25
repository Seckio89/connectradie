// Deno tests for reading Google's OAuth token-endpoint failures.
//
//   deno test supabase/functions/_shared/googleTokenError.test.ts
//
// These strings are a contract, not copy. CALENDAR_SETUP.md's troubleshooting
// section is indexed by them verbatim, and the invalid_grant / invalid_client
// pair must keep pointing at OPPOSITE remedies — reconnect versus fix the
// secret. Collapsing them is what sends a tradie round a loop that cannot
// terminate, which is the reason this module exists at all.

import { strictEqual, ok } from "node:assert/strict";
import { parseGoogleTokenError } from "./googleTokenError.ts";

Deno.test("invalid_grant tells the tradie to reconnect", () => {
  const { code, message } = parseGoogleTokenError(
    '{"error":"invalid_grant","error_description":"Token has been expired or revoked."}',
  );
  strictEqual(code, "invalid_grant");
  strictEqual(
    message,
    "Reconnect Google Calendar — Google no longer accepts the saved authorisation.",
  );
});

Deno.test("invalid_client points at the secret, never at reconnecting", () => {
  const { code, message } = parseGoogleTokenError('{"error":"invalid_client"}');
  strictEqual(code, "invalid_client");
  strictEqual(
    message,
    "Google rejected this app's credentials. Check GOOGLE_CLIENT_SECRET before reconnecting.",
  );
  ok(!message.startsWith("Reconnect"), "reconnecting cannot fix a wrong secret");
});

Deno.test("unauthorized_client is read as a credentials problem too", () => {
  const { code, message } = parseGoogleTokenError('{"error":"unauthorized_client"}');
  strictEqual(code, "unauthorized_client");
  ok(message.includes("GOOGLE_CLIENT_SECRET"));
});

Deno.test("invalid_scope asks for the calendar permission specifically", () => {
  const { message } = parseGoogleTokenError('{"error":"invalid_scope"}');
  strictEqual(message, "Reconnect Google Calendar and grant calendar access.");
});

Deno.test("an unrecognised code still names a remedy", () => {
  const { code, message } = parseGoogleTokenError('{"error":"slow_down"}');
  strictEqual(code, "slow_down");
  strictEqual(message, "Reconnect Google Calendar — Google refused the token request.");
});

Deno.test("a body with no error field reads as unknown", () => {
  const { code, message } = parseGoogleTokenError('{"error_description":"nope"}');
  strictEqual(code, "unknown");
  ok(message.length > 0);
});

Deno.test("a non-JSON body does not throw", () => {
  // Google occasionally answers with an HTML error page from a proxy. The raw
  // body still has to reach the log and the caller still needs a usable message.
  const { code, detail } = parseGoogleTokenError("<html><body>502 Bad Gateway</body></html>");
  strictEqual(code, "unknown");
  ok(detail.includes("502"));
});

Deno.test("detail is truncated so an error page cannot flood a log or a column", () => {
  const { detail } = parseGoogleTokenError("x".repeat(5000));
  strictEqual(detail.length, 300);
});

Deno.test("no message ever apologises or says something went wrong", () => {
  for (
    const code of [
      "invalid_grant",
      "invalid_client",
      "unauthorized_client",
      "invalid_scope",
      "anything_else",
    ]
  ) {
    const { message } = parseGoogleTokenError(JSON.stringify({ error: code }));
    ok(!/sorry|something went wrong/i.test(message), `${code} must name the fault and the fix`);
  }
});
