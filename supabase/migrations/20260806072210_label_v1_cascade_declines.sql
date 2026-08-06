-- Label v1 cascade declines, so a loss can be told from a client's decision.
--
-- WHY THIS FILE EXISTS
-- This migration is ALREADY APPLIED to production, under this exact version
-- (20260806072210). It was applied directly and never committed, so the repo
-- carried no `CREATE` for the current definition of handle_quote_acceptance().
-- The newest definition in this repo is in
-- 20260223103028_fix_unindexed_fks_rls_perf_and_cleanup.sql, whose cascade
-- UPDATE sets only `status = 'declined', updated_at = now()`.
--
-- That gap is not cosmetic. Replaying this repo into a fresh database — the
-- disaster-recovery path — would rebuild the trigger WITHOUT the labelling, and
-- every v1 cascade decline would land indistinguishable from a client
-- explicitly declining the quote. The win-rate work added in #241 reads
-- decline_reason to tell those two apart, so it would be silently wrong on
-- every v1 job in the rebuilt database while looking correct in production.
--
-- The body below is lifted verbatim from
-- supabase_migrations.schema_migrations, so applying this file is a no-op
-- against production and reproduces production anywhere else.
--
-- The v2 (three-stage) path does not go through this trigger: a flow_version=2
-- quote moves final_submitted -> accepted, and the guard here fires only on
-- OLD.status = 'pending'. accept-and-pay labels the v2 cascade itself.

CREATE OR REPLACE FUNCTION public.handle_quote_acceptance()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.status = 'accepted' AND OLD.status = 'pending' THEN
    NEW.accepted_at = now();

    UPDATE jobs
    SET tradie_id = NEW.tradie_id,
        status = 'accepted',
        quoting_status = 'awarded'
    WHERE id = NEW.job_id;

    UPDATE quotes
    SET status = 'declined',
        declined_at = now(),
        decline_reason = 'cascade',
        updated_at = now()
    WHERE job_id = NEW.job_id
      AND id != NEW.id
      AND status = 'pending';
  END IF;

  NEW.updated_at = now();
  RETURN NEW;
END;
$function$;

-- SECURITY DEFINER trigger function: never directly callable by a client.
REVOKE EXECUTE ON FUNCTION public.handle_quote_acceptance() FROM anon, authenticated, public;
