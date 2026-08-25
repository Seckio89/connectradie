// Calling the Google Calendar API with a token that renews itself.
//
// ⚠️ WHY A WRAPPER. Every Google call in `sync-google-calendar` and
// `google-calendar-import` used one access token captured before the first
// request and never revisited. Two consequences, both of which shipped:
//
//   • A long sync outlives its own token. The export walks every slot and every
//     job, one request each; a batch that starts near the hour boundary is
//     still running when the token dies. Every call after that point 401s.
//   • Nothing noticed. The 401s landed in `if (res.ok)` branches with no else
//     (`sync-google-calendar` :632 and :686), so a sync that wrote nothing to
//     Google still returned `success: true`. That is the failure mode behind
//     215 availability slots having produced zero Google events.
//
// So: refresh once on a 401, retry that one request, and if the second attempt
// is also unauthorised, THROW. A typed throw is the point — it cannot be
// swallowed by an `if (res.ok)` that has no else branch, which is exactly how
// this class of failure stayed invisible for a month.
//
// ONLY 401 TRIGGERS A REFRESH. A 403 is a scope problem (`calendar.readonly`
// not granted yet, likely while Google verification is pending) and a 404 is a
// deleted event; refreshing fixes neither, and retrying a 403 in a loop is how
// you get rate-limited by the provider you are already failing to satisfy.
// Those, and every 5xx, are handed back to the caller untouched so it can apply
// its own judgement — `sync-google-calendar` deliberately treats a 403 on the
// conflict check as non-fatal and carries on with the export half.

import type { GoogleTokenResult } from "./googleToken.ts";

/**
 * The grant is dead: renewing produced nothing usable, or a freshly renewed
 * token was rejected. Carries the actionable message from
 * `parseGoogleTokenError` so the caller can answer the tradie with a remedy
 * rather than "Something went wrong".
 */
export class GoogleAuthExpired extends Error {
  readonly code: string;
  readonly detail: string;
  readonly needsReconnect: boolean;

  constructor(
    args: { code: string; message: string; detail: string; needsReconnect: boolean },
  ) {
    super(args.message);
    this.name = "GoogleAuthExpired";
    this.code = args.code;
    this.detail = args.detail;
    this.needsReconnect = args.needsReconnect;
  }
}

export interface GoogleSessionOptions {
  /** A token already known to be good — normally from `getGoogleAccessToken`. */
  accessToken: string;
  /**
   * Mints a new access token. In production this is `getGoogleAccessToken`
   * bound to the integration with `force: true`; in tests it is a stub.
   */
  refresh: () => Promise<GoogleTokenResult>;
  fetchImpl?: typeof fetch;
}

export interface GoogleSession {
  /** Current bearer. Exposed so a caller can persist or report on it. */
  readonly accessToken: string;
  /** Whether this session had to renew the token at least once. */
  readonly refreshed: boolean;
  /** Fetch a googleapis.com URL, renewing once on 401. */
  fetch(url: string, init?: RequestInit): Promise<Response>;
}

function withBearer(init: RequestInit | undefined, token: string): RequestInit {
  const headers = new Headers(init?.headers);
  headers.set("Authorization", `Bearer ${token}`);
  return { ...init, headers };
}

/**
 * Wrap a set of Google API calls so they share one token and renew it at most
 * once, no matter how many of them hit a 401 at the same moment.
 */
export function createGoogleSession(opts: GoogleSessionOptions): GoogleSession {
  const { refresh, fetchImpl = fetch } = opts;

  let token = opts.accessToken;
  let refreshed = false;
  // Concurrent calls that all 401 must renew ONCE between them. Without this,
  // a batch of parallel requests each posts its own refresh grant, and Google
  // rate-limits the token endpoint per client.
  let inFlight: Promise<void> | null = null;

  async function renewOnce(): Promise<void> {
    if (!inFlight) {
      inFlight = (async () => {
        const result = await refresh();
        if (!result.ok) {
          throw new GoogleAuthExpired({
            code: result.code,
            message: result.message,
            detail: result.detail,
            needsReconnect: result.needsReconnect,
          });
        }
        token = result.accessToken;
        refreshed = true;
      })();
    }
    try {
      await inFlight;
    } finally {
      inFlight = null;
    }
  }

  return {
    get accessToken() {
      return token;
    },
    get refreshed() {
      return refreshed;
    },
    async fetch(url: string, init?: RequestInit): Promise<Response> {
      const first = await fetchImpl(url, withBearer(init, token));
      if (first.status !== 401) return first;

      // Drain the rejected response. An unconsumed body is a leaked resource in
      // the edge runtime, and the text is worth having in the log.
      const firstBody = await first.text().catch(() => "");

      await renewOnce();

      const second = await fetchImpl(url, withBearer(init, token));
      if (second.status !== 401) return second;

      const secondBody = await second.text().catch(() => "");
      console.error(
        "Google rejected a freshly refreshed token",
        url.split("?")[0],
        firstBody.slice(0, 200),
        secondBody.slice(0, 200),
      );
      throw new GoogleAuthExpired({
        code: "unauthorized_after_refresh",
        message:
          "Reconnect Google Calendar — Google rejected the renewed authorisation.",
        detail: secondBody.slice(0, 300),
        needsReconnect: true,
      });
    },
  };
}
