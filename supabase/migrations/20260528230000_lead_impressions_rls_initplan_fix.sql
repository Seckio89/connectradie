-- Performance: wrap auth.uid() in (SELECT auth.uid()) inside lead_impressions
-- RLS policies. Without the SELECT wrapper, Postgres treats auth.uid() as
-- volatile and re-evaluates it for every row scanned. With the wrapper, the
-- planner caches the result for the whole query. The effect is small per row
-- but compounds linearly with row count — lead_impressions is high-write so
-- this matters at scale.
--
-- See: https://supabase.com/docs/guides/database/postgres/row-level-security#call-functions-with-select
--
-- DROP + CREATE is the only way to change a policy expression in Postgres.

DROP POLICY IF EXISTS "Tradies read own impressions"   ON public.lead_impressions;
DROP POLICY IF EXISTS "Tradies update own impressions" ON public.lead_impressions;
DROP POLICY IF EXISTS "Tradies upsert own impressions" ON public.lead_impressions;

CREATE POLICY "Tradies read own impressions"
  ON public.lead_impressions
  FOR SELECT
  TO authenticated
  USING ((SELECT auth.uid()) = tradie_id);

CREATE POLICY "Tradies update own impressions"
  ON public.lead_impressions
  FOR UPDATE
  TO authenticated
  USING ((SELECT auth.uid()) = tradie_id)
  WITH CHECK ((SELECT auth.uid()) = tradie_id);

CREATE POLICY "Tradies upsert own impressions"
  ON public.lead_impressions
  FOR INSERT
  TO authenticated
  WITH CHECK ((SELECT auth.uid()) = tradie_id);
