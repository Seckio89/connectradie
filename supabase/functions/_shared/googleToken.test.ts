// Deno tests for the Google access-token refresh path.
//
//   deno test supabase/functions/_shared/googleToken.test.ts
//
// This is the path the pre-filming checklist called the blocker: every refresh
// in the logs had failed, and the only syncs that ever worked ran inside the
// access token's first hour, which never exercises refresh at all. Nothing here
// could be asserted before, because the refresh read the clock and the network
// directly — so proving it worked meant connecting, waiting an hour, and
// pressing sync. These tests are that hour, made deterministic.
//
// The two failures that matter must stay OPPOSITE: invalid_grant means
// reconnect, invalid_client means fix the secret and do NOT reconnect. Collapse
// them and a tradie with a wrong secret is sent round a loop that cannot
// terminate. That is asserted explicitly below.

import { strictEqual, deepStrictEqual, ok } from "node:assert/strict";
import {
  getGoogleAccessToken,
  REFRESH_SKEW_MS,
  type IntegrationPatch,
  type StoredIntegration,
} from "./googleToken.ts";

const CLIENT_ID = "client-id.apps.googleusercontent.com";
// Placeholder-shaped on purpose: a fixture that looks like a real GOCSPX-…
// secret trips check:secrets on every run. The leak assertion below only
// needs a distinctive string to search for.
const CLIENT_SECRET = "fake-client-secret-never-log-this";
const STORED_REFRESH = "1//0-stored-refresh-token";

const NOW = Date.parse("2026-08-25T08:00:00.000Z");

function integration(over: Partial<StoredIntegration> = {}): StoredIntegration {
  return {
    id: "int-1",
    access_token: "ya29.stored-access-token",
    refresh_token: STORED_REFRESH,
    // An hour out by default — comfortably outside the skew window.
    token_expires_at: new Date(NOW + 60 * 60 * 1000).toISOString(),
    ...over,
  };
}

/** Records every patch, so a test can assert what was written AND what wasn't. */
function spyPersist() {
  const patches: IntegrationPatch[] = [];
  return {
    patches,
    persist: (patch: IntegrationPatch) => {
      patches.push(patch);
      return Promise.resolve();
    },
  };
}

/** A fetch stub that records its calls and never touches the network. */
function stubFetch(response: () => Response) {
  const calls: { url: string; body: string }[] = [];
  const impl = ((url: string | URL | Request, init?: RequestInit) => {
    const body = init?.body instanceof URLSearchParams ? init.body.toString() : "";
    calls.push({ url: String(url), body });
    return Promise.resolve(response());
  }) as unknown as typeof fetch;
  return { calls, impl };
}

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

Deno.test("a token outside the skew window is returned without calling Google", async () => {
  const { calls, impl } = stubFetch(() => jsonResponse(200, {}));
  const { patches, persist } = spyPersist();

  const result = await getGoogleAccessToken({
    integration: integration(),
    clientId: CLIENT_ID,
    clientSecret: CLIENT_SECRET,
    persist,
    now: NOW,
    fetchImpl: impl,
  });

  ok(result.ok);
  strictEqual(result.accessToken, "ya29.stored-access-token");
  strictEqual(result.refreshed, false);
  strictEqual(calls.length, 0, "must not call Google when the stored token is good");
  strictEqual(patches.length, 0, "must not write to the row when nothing changed");
});

Deno.test("a token expiring inside the skew window is refreshed early", async () => {
  // Two minutes of life left. The OLD check was `now >= expiresAt`, which let
  // this through and then ran a whole batch of Google calls on a token that
  // died mid-flight.
  const { calls, impl } = stubFetch(() =>
    jsonResponse(200, { access_token: "ya29.fresh", expires_in: 3600 })
  );
  const { persist } = spyPersist();

  const result = await getGoogleAccessToken({
    integration: integration({
      token_expires_at: new Date(NOW + 2 * 60 * 1000).toISOString(),
    }),
    clientId: CLIENT_ID,
    clientSecret: CLIENT_SECRET,
    persist,
    now: NOW,
    fetchImpl: impl,
  });

  ok(result.ok);
  strictEqual(result.accessToken, "ya29.fresh");
  strictEqual(result.refreshed, true);
  strictEqual(calls.length, 1);
  ok(REFRESH_SKEW_MS > 2 * 60 * 1000, "the skew buffer is what makes this refresh");
});

Deno.test("force refreshes even when the stored token is still good", async () => {
  // This is what `action=refresh` uses: it exercises the exact grant that fails,
  // on demand, instead of waiting out the access token's hour.
  const { calls, impl } = stubFetch(() =>
    jsonResponse(200, { access_token: "ya29.forced", expires_in: 3600 })
  );
  const { persist } = spyPersist();

  const result = await getGoogleAccessToken({
    integration: integration(),
    clientId: CLIENT_ID,
    clientSecret: CLIENT_SECRET,
    persist,
    now: NOW,
    force: true,
    fetchImpl: impl,
  });

  ok(result.ok);
  strictEqual(result.refreshed, true);
  strictEqual(result.expiresInSeconds, 3600);
  strictEqual(calls.length, 1);
});

Deno.test("a refresh that returns no refresh_token leaves the stored one alone", async () => {
  // Google normally returns none. Writing null over the stored token would make
  // the row permanently unrenewable.
  const { impl } = stubFetch(() =>
    jsonResponse(200, { access_token: "ya29.fresh", expires_in: 3600 })
  );
  const { patches, persist } = spyPersist();

  const result = await getGoogleAccessToken({
    integration: integration({ token_expires_at: new Date(NOW - 1000).toISOString() }),
    clientId: CLIENT_ID,
    clientSecret: CLIENT_SECRET,
    persist,
    now: NOW,
    fetchImpl: impl,
  });

  ok(result.ok);
  strictEqual(result.refreshTokenRotated, false);
  strictEqual(patches.length, 1);
  ok(!("refresh_token" in patches[0]), "must not write refresh_token at all");
  strictEqual(patches[0].access_token, "ya29.fresh");
  strictEqual(patches[0].last_refresh_ok_at, new Date(NOW).toISOString());
  strictEqual(patches[0].needs_reconnect, false);
  strictEqual(patches[0].last_refresh_error_code, null);
});

Deno.test("a rotated refresh_token IS persisted", async () => {
  // google-calendar-import dropped this. The rotated token is the only one that
  // will work next time, so dropping it strands the integration.
  const { impl } = stubFetch(() =>
    jsonResponse(200, {
      access_token: "ya29.fresh",
      refresh_token: "1//0-rotated",
      expires_in: 3600,
    })
  );
  const { patches, persist } = spyPersist();

  const result = await getGoogleAccessToken({
    integration: integration({ token_expires_at: new Date(NOW - 1000).toISOString() }),
    clientId: CLIENT_ID,
    clientSecret: CLIENT_SECRET,
    persist,
    now: NOW,
    fetchImpl: impl,
  });

  ok(result.ok);
  strictEqual(result.refreshTokenRotated, true);
  strictEqual(patches[0].refresh_token, "1//0-rotated");
});

Deno.test("invalid_grant asks for a reconnect and records why", async () => {
  const { impl } = stubFetch(() =>
    jsonResponse(400, { error: "invalid_grant", error_description: "Token has been expired or revoked." })
  );
  const { patches, persist } = spyPersist();

  const result = await getGoogleAccessToken({
    integration: integration({ token_expires_at: new Date(NOW - 1000).toISOString() }),
    clientId: CLIENT_ID,
    clientSecret: CLIENT_SECRET,
    persist,
    now: NOW,
    fetchImpl: impl,
  });

  ok(!result.ok);
  strictEqual(result.reason, "refused");
  strictEqual(result.code, "invalid_grant");
  strictEqual(result.needsReconnect, true);
  strictEqual(
    result.message,
    "Reconnect Google Calendar — Google no longer accepts the saved authorisation.",
  );
  strictEqual(patches.length, 1);
  strictEqual(patches[0].needs_reconnect, true);
  strictEqual(patches[0].last_refresh_error_code, "invalid_grant");
  strictEqual(patches[0].last_refresh_error_at, new Date(NOW).toISOString());
  // A failed refresh must never look like a successful one.
  ok(!("access_token" in patches[0]));
  ok(!("last_refresh_ok_at" in patches[0]));
});

Deno.test("invalid_client does NOT ask for a reconnect", async () => {
  // The whole point of keeping these two apart. Reconnecting cannot fix a wrong
  // secret — the reconnect fails identically — so prompting for one is a loop
  // with no exit.
  const { impl } = stubFetch(() => jsonResponse(401, { error: "invalid_client" }));
  const { patches, persist } = spyPersist();

  const result = await getGoogleAccessToken({
    integration: integration({ token_expires_at: new Date(NOW - 1000).toISOString() }),
    clientId: CLIENT_ID,
    clientSecret: CLIENT_SECRET,
    persist,
    now: NOW,
    fetchImpl: impl,
  });

  ok(!result.ok);
  strictEqual(result.code, "invalid_client");
  strictEqual(result.needsReconnect, false);
  strictEqual(
    result.message,
    "Google rejected this app's credentials. Check GOOGLE_CLIENT_SECRET before reconnecting.",
  );
  strictEqual(patches[0].last_refresh_error_code, "invalid_client");
  ok(!("needs_reconnect" in patches[0]), "must not flag a row a reconnect cannot fix");
});

Deno.test("a transient failure records the error but does not nag for a reconnect", async () => {
  const { impl } = stubFetch(() => new Response("<html>502 Bad Gateway</html>", { status: 502 }));
  const { patches, persist } = spyPersist();

  const result = await getGoogleAccessToken({
    integration: integration({ token_expires_at: new Date(NOW - 1000).toISOString() }),
    clientId: CLIENT_ID,
    clientSecret: CLIENT_SECRET,
    persist,
    now: NOW,
    fetchImpl: impl,
  });

  ok(!result.ok);
  strictEqual(result.code, "unknown", "a non-JSON body must not throw");
  strictEqual(result.needsReconnect, false);
  ok(!("needs_reconnect" in patches[0]));
});

Deno.test("an expired token with no refresh_token fails instead of being used", async () => {
  // The old guard skipped the refresh entirely here and carried on with the
  // dead access token, whereupon every Google call 401'd into a swallowed error
  // and the sync reported success.
  const { calls, impl } = stubFetch(() => jsonResponse(200, {}));
  const { patches, persist } = spyPersist();

  const result = await getGoogleAccessToken({
    integration: integration({
      refresh_token: null,
      token_expires_at: new Date(NOW - 1000).toISOString(),
    }),
    clientId: CLIENT_ID,
    clientSecret: CLIENT_SECRET,
    persist,
    now: NOW,
    fetchImpl: impl,
  });

  ok(!result.ok);
  strictEqual(result.reason, "no_refresh_token");
  strictEqual(result.needsReconnect, true);
  strictEqual(calls.length, 0, "nothing to send — do not call Google");
  strictEqual(patches[0].needs_reconnect, true);
  strictEqual(patches[0].last_refresh_error_code, "no_refresh_token");
});

Deno.test("an unparseable expiry fails closed and refreshes", async () => {
  const { calls, impl } = stubFetch(() =>
    jsonResponse(200, { access_token: "ya29.fresh", expires_in: 3600 })
  );
  const { persist } = spyPersist();

  const result = await getGoogleAccessToken({
    integration: integration({ token_expires_at: "not-a-timestamp" }),
    clientId: CLIENT_ID,
    clientSecret: CLIENT_SECRET,
    persist,
    now: NOW,
    fetchImpl: impl,
  });

  ok(result.ok);
  strictEqual(calls.length, 1, "a timestamp we cannot read is not evidence of a live token");
});

Deno.test("a 200 with no access_token is treated as a refusal", async () => {
  const { impl } = stubFetch(() => jsonResponse(200, { expires_in: 3600 }));
  const { persist } = spyPersist();

  const result = await getGoogleAccessToken({
    integration: integration({ token_expires_at: new Date(NOW - 1000).toISOString() }),
    clientId: CLIENT_ID,
    clientSecret: CLIENT_SECRET,
    persist,
    now: NOW,
    fetchImpl: impl,
  });

  ok(!result.ok, "must never hand back an undefined bearer");
  strictEqual(result.code, "no_access_token");
});

Deno.test("the grant is sent exactly as Google requires, and no credential escapes", async () => {
  const { calls, impl } = stubFetch(() =>
    jsonResponse(400, { error: "invalid_grant", error_description: "bad" })
  );
  const { patches, persist } = spyPersist();

  const logged: string[] = [];
  const realError = console.error;
  console.error = (...args: unknown[]) => void logged.push(args.map(String).join(" "));
  try {
    const result = await getGoogleAccessToken({
      integration: integration({ token_expires_at: new Date(NOW - 1000).toISOString() }),
      clientId: CLIENT_ID,
      clientSecret: CLIENT_SECRET,
      persist,
      now: NOW,
      fetchImpl: impl,
    });

    // The request itself is a correct RFC 6749 refresh grant.
    const sent = new URLSearchParams(calls[0].body);
    strictEqual(calls[0].url, "https://oauth2.googleapis.com/token");
    deepStrictEqual(
      [...sent.keys()].sort(),
      ["client_id", "client_secret", "grant_type", "refresh_token"],
    );
    strictEqual(sent.get("grant_type"), "refresh_token");
    strictEqual(sent.get("refresh_token"), STORED_REFRESH);

    // 🔒 Nothing that went OUT may come back in a log, a message or the row.
    const exposed = [logged.join(" "), JSON.stringify(patches), JSON.stringify(result)].join(" ");
    ok(!exposed.includes(CLIENT_SECRET), "client_secret must never be logged or stored");
    ok(!exposed.includes(STORED_REFRESH), "refresh_token must never be logged or stored");
  } finally {
    console.error = realError;
  }
});
