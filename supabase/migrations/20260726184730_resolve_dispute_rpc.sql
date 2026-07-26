-- Migration: resolve_dispute_rpc
-- Phase 3 of AI-assisted dispute handling.
--
-- Resolving a dispute is TWO writes: the decision record (append-only audit)
-- and the status change on `disputes`. From the browser those are two round
-- trips with no transaction around them, so a failure between them leaves a
-- resolved dispute with no audit row — which is precisely the thing Phase 1's
-- append-only table exists to prevent. One function call is one transaction,
-- so this makes them inseparable.
--
-- SECURITY INVOKER is deliberate.
--   * RLS still applies, so the admin-only policies on both tables back this up
--     rather than being bypassed.
--   * `is_admin()` is itself SECURITY DEFINER, but it keys on `auth.uid()` —
--     a JWT claim, which survives DEFINER — NOT on `current_user`, which under
--     DEFINER silently becomes the function OWNER and would therefore pass for
--     everyone. That distinction is why the 20260718020000 billing lock was
--     dead for its whole life. Calling is_admin() from here is safe; writing
--     `current_user` here would not be.
--
-- The explicit is_admin() guard is not redundant with RLS. Without it a
-- non-admin's UPDATE would simply match zero rows — no error, and the caller
-- would be told the dispute was resolved when nothing happened.

CREATE OR REPLACE FUNCTION public.resolve_dispute(
  p_dispute_id   uuid,
  p_outcome      text,
  p_reasoning    text,
  p_ai_suggestion jsonb DEFAULT NULL,
  p_overridden   boolean DEFAULT false
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid          uuid := auth.uid();
  v_blocks       boolean;
  v_decision_id  uuid;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Only an administrator can resolve a dispute'
      USING ERRCODE = '42501';
  END IF;

  IF p_outcome NOT IN ('resolved_client', 'resolved_tradie', 'resolved_split', 'dismissed') THEN
    RAISE EXCEPTION 'Invalid outcome: %', p_outcome USING ERRCODE = '22023';
  END IF;

  -- A decision with no stated reason is not auditable. Enforced here rather
  -- than only in the UI, so it holds against a direct PostgREST call too.
  IF coalesce(btrim(p_reasoning), '') = '' THEN
    RAISE EXCEPTION 'A written reason is required to resolve a dispute'
      USING ERRCODE = '22023';
  END IF;

  -- Lock the row so two admins resolving at once cannot both write a decision.
  SELECT blocks_release INTO v_blocks
  FROM public.disputes
  WHERE id = p_dispute_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Dispute not found' USING ERRCODE = 'P0002';
  END IF;

  -- `blocks_release` doubles as "still live" — it is true for exactly the
  -- statuses that are not yet a terminal outcome, and it is generated, so this
  -- check cannot drift from the status vocabulary.
  IF NOT v_blocks THEN
    RAISE EXCEPTION 'This dispute has already been resolved' USING ERRCODE = '22023';
  END IF;

  -- Audit row FIRST. If this fails, the whole transaction rolls back and the
  -- dispute stays open — the safe direction to fail in.
  INSERT INTO public.dispute_decisions
    (dispute_id, decided_by, outcome, reasoning, ai_suggestion, overridden)
  VALUES
    (p_dispute_id, v_uid, p_outcome, btrim(p_reasoning), p_ai_suggestion, coalesce(p_overridden, false))
  RETURNING id INTO v_decision_id;

  UPDATE public.disputes
     SET status      = p_outcome,
         resolution  = btrim(p_reasoning),
         resolved_by = v_uid,
         resolved_at = now(),
         updated_at  = now()
   WHERE id = p_dispute_id;

  RETURN v_decision_id;
END;
$$;

REVOKE ALL ON FUNCTION public.resolve_dispute(uuid, text, text, jsonb, boolean) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.resolve_dispute(uuid, text, text, jsonb, boolean) TO authenticated;

COMMENT ON FUNCTION public.resolve_dispute(uuid, text, text, jsonb, boolean) IS
  'Atomically record a dispute decision and apply its outcome. Admin only. '
  'Requires a written reason. Refuses to re-resolve a dispute that is already terminal.';
