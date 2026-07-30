-- Durable rate-limit counters for Edge Functions.
--
-- Audit finding #4 (AUDIT-REPORT-2026-07-30.md). _shared/rateLimiter.ts kept
-- its counters in a module-level Map. That module is re-instantiated per
-- request, so the Map was empty every time and checkRateLimit always returned
-- allowed:true. Measured against prod: public-quote deployed with a 20/min
-- limit, 60 consecutive requests over one keep-alive connection returned
-- 60 x 404 and zero 429s. Every one of the 54 call sites was affected.
--
-- The counter has to outlive the request, so it lives here.

CREATE TABLE IF NOT EXISTS public.edge_rate_limits (
  key          text PRIMARY KEY,
  window_start timestamptz NOT NULL DEFAULT now(),
  count        integer     NOT NULL DEFAULT 0
);

-- Deliberately NO policies. service_role bypasses RLS and is the only caller;
-- anon and authenticated are denied outright. Same deny-all shape as
-- stripe_webhook_events.
ALTER TABLE public.edge_rate_limits ENABLE ROW LEVEL SECURITY;

-- Supports the cleanup sweep below.
CREATE INDEX IF NOT EXISTS idx_edge_rate_limits_window_start
  ON public.edge_rate_limits (window_start);

-- Atomically consume one unit against `p_key` and report whether it was
-- allowed.
--
-- The INSERT ... ON CONFLICT DO UPDATE takes a row lock, so concurrent callers
-- on the same key serialise. That is the whole point, and the thing an
-- in-process Map could never do however it was written.
--
-- The window is FIXED, not sliding: a caller can burst across a boundary (up to
-- 2x the ceiling straddling the reset). Accepted — it is the same semantics the
-- original code intended, and a sliding window costs a second table.
CREATE OR REPLACE FUNCTION public.consume_rate_limit(
  p_key            text,
  p_max            integer,
  p_window_seconds integer
)
RETURNS TABLE (allowed boolean, remaining integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_now   timestamptz := now();
  v_count integer;
BEGIN
  IF p_key IS NULL OR p_max IS NULL OR p_window_seconds IS NULL
     OR p_max < 1 OR p_window_seconds < 1 THEN
    RAISE EXCEPTION 'consume_rate_limit: invalid arguments';
  END IF;

  INSERT INTO edge_rate_limits AS l (key, window_start, count)
  VALUES (p_key, v_now, 1)
  ON CONFLICT (key) DO UPDATE
    SET count = CASE
          WHEN l.window_start < v_now - make_interval(secs => p_window_seconds)
          THEN 1
          ELSE l.count + 1
        END,
        window_start = CASE
          WHEN l.window_start < v_now - make_interval(secs => p_window_seconds)
          THEN v_now
          ELSE l.window_start
        END
  RETURNING l.count INTO v_count;

  allowed   := v_count <= p_max;
  remaining := GREATEST(0, p_max - v_count);
  RETURN NEXT;
END;
$$;

-- Repo convention for SECURITY DEFINER functions: no user role may execute it.
-- Only the service role, which is the only thing that ever calls it.
REVOKE EXECUTE ON FUNCTION public.consume_rate_limit(text, integer, integer)
  FROM anon, authenticated, public;
GRANT  EXECUTE ON FUNCTION public.consume_rate_limit(text, integer, integer)
  TO service_role;

-- Rows are worthless once their window has passed. Daily sweep; SQL-only, so no
-- Vault secret and no HTTP call.
SELECT cron.schedule(
  'cleanup-edge-rate-limits',
  '20 15 * * *',
  $$DELETE FROM public.edge_rate_limits WHERE window_start < now() - interval '1 hour'$$
);
