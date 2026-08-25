// Deno tests for the renew-once-on-401 Google API wrapper.
//
//   deno test supabase/functions/_shared/googleApi.test.ts
//
// The behaviour under test is a balance. Refresh too eagerly and a 403 (a scope
// that has not been granted yet) turns into a refresh loop against the provider
// already refusing you. Refresh not at all — which is what shipped — and a sync
// that outlives its own token 401s its way through the whole batch while
// reporting success.

import { strictEqual, ok, rejects } from "node:assert/strict";
import { createGoogleSession, GoogleAuthExpired } from "./googleApi.ts";
import type { GoogleTokenResult } from "./googleToken.ts";

const URL_UNDER_TEST = "https://www.googleapis.com/calendar/v3/users/me/calendarList";

function okToken(accessToken: string): GoogleTokenResult {
  return {
    ok: true,
    accessToken,
    expiresInSeconds: 3600,
    refreshed: true,
    refreshTokenRotated: false,
  };
}

const DEAD_GRANT: GoogleTokenResult = {
  ok: false,
  reason: "refused",
  code: "invalid_grant",
  message: "Reconnect Google Calendar — Google no longer accepts the saved authorisation.",
  detail: '{"error":"invalid_grant"}',
  needsReconnect: true,
};

/** Replays the given statuses in order, recording the bearer each call carried. */
function stubFetch(statuses: number[]) {
  const bearers: string[] = [];
  let i = 0;
  const impl = ((_url: string | URL | Request, init?: RequestInit) => {
    bearers.push(new Headers(init?.headers).get("Authorization") ?? "");
    const status = statuses[Math.min(i, statuses.length - 1)];
    i++;
    return Promise.resolve(new Response(status === 200 ? "{}" : "denied", { status }));
  }) as unknown as typeof fetch;
  return { bearers, impl, calls: () => i };
}

Deno.test("a successful call refreshes nothing", async () => {
  const { impl, calls, bearers } = stubFetch([200]);
  let refreshes = 0;

  const session = createGoogleSession({
    accessToken: "ya29.first",
    refresh: () => {
      refreshes++;
      return Promise.resolve(okToken("ya29.second"));
    },
    fetchImpl: impl,
  });

  const res = await session.fetch(URL_UNDER_TEST);

  strictEqual(res.status, 200);
  strictEqual(calls(), 1);
  strictEqual(refreshes, 0);
  strictEqual(bearers[0], "Bearer ya29.first");
  strictEqual(session.refreshed, false);
});

Deno.test("a 401 refreshes once and retries with the NEW bearer", async () => {
  const { impl, calls, bearers } = stubFetch([401, 200]);
  let refreshes = 0;

  const session = createGoogleSession({
    accessToken: "ya29.expired",
    refresh: () => {
      refreshes++;
      return Promise.resolve(okToken("ya29.renewed"));
    },
    fetchImpl: impl,
  });

  const res = await session.fetch(URL_UNDER_TEST);

  strictEqual(res.status, 200);
  strictEqual(calls(), 2, "exactly one retry");
  strictEqual(refreshes, 1);
  strictEqual(bearers[0], "Bearer ya29.expired");
  strictEqual(bearers[1], "Bearer ya29.renewed", "the retry must carry the renewed token");
  strictEqual(session.accessToken, "ya29.renewed");
  strictEqual(session.refreshed, true);
});

Deno.test("a 401 whose refresh is refused throws instead of returning", async () => {
  // A typed throw is the point: it cannot be swallowed by an `if (res.ok)` with
  // no else branch, which is how this failure stayed invisible for a month.
  const { impl, calls } = stubFetch([401]);

  const session = createGoogleSession({
    accessToken: "ya29.expired",
    refresh: () => Promise.resolve(DEAD_GRANT),
    fetchImpl: impl,
  });

  await rejects(
    () => session.fetch(URL_UNDER_TEST),
    (err: unknown) => {
      ok(err instanceof GoogleAuthExpired);
      strictEqual(err.code, "invalid_grant");
      strictEqual(err.needsReconnect, true);
      return true;
    },
  );
  strictEqual(calls(), 1, "no retry once the grant is known dead");
});

Deno.test("a second 401 after a good refresh gives up rather than looping", async () => {
  const { impl, calls } = stubFetch([401, 401]);
  let refreshes = 0;

  const session = createGoogleSession({
    accessToken: "ya29.expired",
    refresh: () => {
      refreshes++;
      return Promise.resolve(okToken("ya29.renewed"));
    },
    fetchImpl: impl,
  });

  await rejects(
    () => session.fetch(URL_UNDER_TEST),
    (err: unknown) => {
      ok(err instanceof GoogleAuthExpired);
      strictEqual(err.code, "unauthorized_after_refresh");
      return true;
    },
  );
  strictEqual(calls(), 2, "exactly one retry, then stop");
  strictEqual(refreshes, 1);
});

for (const status of [403, 404, 429, 500]) {
  Deno.test(`a ${status} is returned to the caller unretried`, async () => {
    // 403 in particular: that is a scope not yet granted, which no amount of
    // refreshing fixes, and sync deliberately treats it as non-fatal.
    const { impl, calls } = stubFetch([status]);
    let refreshes = 0;

    const session = createGoogleSession({
      accessToken: "ya29.first",
      refresh: () => {
        refreshes++;
        return Promise.resolve(okToken("ya29.second"));
      },
      fetchImpl: impl,
    });

    const res = await session.fetch(URL_UNDER_TEST);

    strictEqual(res.status, status);
    strictEqual(calls(), 1);
    strictEqual(refreshes, 0);
  });
}

Deno.test("concurrent 401s renew the token only once between them", async () => {
  // Without a shared in-flight promise every parallel request posts its own
  // refresh grant, and Google rate-limits the token endpoint per client.
  let served = 0;
  const impl = ((_url: string | URL | Request, init?: RequestInit) => {
    const bearer = new Headers(init?.headers).get("Authorization");
    served++;
    return Promise.resolve(
      new Response("{}", { status: bearer === "Bearer ya29.renewed" ? 200 : 401 }),
    );
  }) as unknown as typeof fetch;

  let refreshes = 0;
  const session = createGoogleSession({
    accessToken: "ya29.expired",
    refresh: async () => {
      refreshes++;
      await new Promise((r) => setTimeout(r, 5));
      return okToken("ya29.renewed");
    },
    fetchImpl: impl,
  });

  const results = await Promise.all([
    session.fetch(URL_UNDER_TEST),
    session.fetch(URL_UNDER_TEST),
    session.fetch(URL_UNDER_TEST),
  ]);

  for (const res of results) strictEqual(res.status, 200);
  strictEqual(refreshes, 1, "three concurrent 401s, one refresh");
  strictEqual(served, 6, "three first attempts plus three retries");
});

Deno.test("the caller's own headers survive the retry", async () => {
  const seen: (string | null)[] = [];
  let i = 0;
  const impl = ((_url: string | URL | Request, init?: RequestInit) => {
    const headers = new Headers(init?.headers);
    seen.push(headers.get("Content-Type"));
    i++;
    return Promise.resolve(new Response("{}", { status: i === 1 ? 401 : 200 }));
  }) as unknown as typeof fetch;

  const session = createGoogleSession({
    accessToken: "ya29.expired",
    refresh: () => Promise.resolve(okToken("ya29.renewed")),
    fetchImpl: impl,
  });

  await session.fetch(URL_UNDER_TEST, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: "{}",
  });

  strictEqual(seen[0], "application/json");
  strictEqual(seen[1], "application/json", "the retry must not drop the caller's headers");
});
