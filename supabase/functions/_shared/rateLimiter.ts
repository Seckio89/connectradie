// Rate limiting for Edge Functions.
//
// ⚠️ This was an in-process Map until 2026-07-30, and it enforced NOTHING.
// The module is re-instantiated per request, so the Map was empty every time,
// `count` never reached `maxRequests`, and this function always returned
// allowed:true. Measured against prod: public-quote deployed with a 20/min
// limit, 60 consecutive requests over one keep-alive connection returned
// 60 x 404 and zero 429s. All 54 call sites were decorative.
//
// The counter now lives in the database (public.edge_rate_limits, consumed via
// the consume_rate_limit RPC), where it survives the request and where
// concurrent callers on the same key serialise on a row lock.
//
// The name and return shape are kept ON PURPOSE. This is async now, so
// destructuring `allowed` off an un-awaited call is a type error that
// `deno check` catches. Renaming would let a missed call site compile and
// silently allow everything — precisely the bug being fixed here.
//
// FAILS OPEN. If the RPC is unreachable or errors, this logs and allows the
// request. If the database is down the calling function's next query fails
// anyway, so failing closed would trade a real outage for no security gain.

export async function checkRateLimit(
  key: string,
  maxRequests: number,
  windowMs: number,
): Promise<{ allowed: boolean; remaining: number }> {
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

  // Read from the environment rather than taking a client argument: that keeps
  // the diff at every call site to the word `await`.
  if (!supabaseUrl || !serviceKey) {
    console.error("checkRateLimit: missing SUPABASE_URL / SERVICE_ROLE_KEY");
    return { allowed: true, remaining: maxRequests };
  }

  try {
    const res = await fetch(`${supabaseUrl}/rest/v1/rpc/consume_rate_limit`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: serviceKey,
        Authorization: `Bearer ${serviceKey}`,
      },
      body: JSON.stringify({
        p_key: key,
        p_max: maxRequests,
        p_window_seconds: Math.max(1, Math.round(windowMs / 1000)),
      }),
    });

    if (!res.ok) {
      console.error(`checkRateLimit: RPC returned ${res.status}`, await res.text());
      return { allowed: true, remaining: maxRequests };
    }

    // The RPC RETURNS TABLE, so PostgREST hands back an array of one row.
    const rows = await res.json() as Array<{ allowed: boolean; remaining: number }>;
    const row = Array.isArray(rows) ? rows[0] : null;
    if (!row || typeof row.allowed !== "boolean") {
      console.error("checkRateLimit: unexpected RPC payload", rows);
      return { allowed: true, remaining: maxRequests };
    }

    return { allowed: row.allowed, remaining: row.remaining ?? 0 };
  } catch (err) {
    console.error("checkRateLimit: RPC call failed", err);
    return { allowed: true, remaining: maxRequests };
  }
}
