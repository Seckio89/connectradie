-- cancellation_policies: identify an admin the same way every other table does.
--
-- Raised while merging the overlapping permissive policies
-- (20260731070129, audit finding #8) and deliberately left alone there, because
-- widening who may edit legal terms is an authorisation decision rather than a
-- performance refactor.
--
-- These three policies tested `profiles.role = 'admin'` inline. Everything else
-- in the schema uses public.is_admin(), which also accepts
-- `profiles.is_admin = true`. The platform owner holds is_admin = true while
-- keeping role = 'tradie' on purpose — so that the owner still appears to
-- clients as an ordinary Pro tradie — which meant the owner was silently locked
-- out of this one table.
--
-- Measured before the change (SET LOCAL role + request.jwt.claims, counting
-- updatable rows):
--
--   owner   williammagson@gmail.com   role=tradie  is_admin=true  -> 0   ← the bug
--   admin   admin@connectradie.com    role=admin                  -> 1
--   ordinary user                                                 -> 0
--
-- SAFETY: editing a policy row cannot change an agreement already made.
-- job_cancellation_agreements stores terms_snapshot and policy_version next to
-- policy_id, so every job carries a frozen copy of what the two parties
-- actually agreed to. A policy edit only affects agreements recorded after it.
--
-- Bare is_admin(), not (SELECT is_admin()): the surrounding predicates wrap
-- auth.uid() in a scalar subquery for the InitPlan optimisation, but that buys
-- nothing for a function declared without a volatility marker — is_admin() is
-- VOLATILE by default and the planner will not hoist it. Bare also matches how
-- every other policy in the schema calls it. Marking is_admin() STABLE is the
-- real optimisation and belongs in its own change, since it affects every
-- policy that calls it.
--
-- SELECT is untouched: reading the terms stays public, which the signed-out
-- terms page depends on.

DROP POLICY IF EXISTS "Admins insert cancellation policies" ON public.cancellation_policies;
CREATE POLICY "Admins insert cancellation policies"
  ON public.cancellation_policies FOR INSERT TO authenticated
  WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "Admins update cancellation policies" ON public.cancellation_policies;
CREATE POLICY "Admins update cancellation policies"
  ON public.cancellation_policies FOR UPDATE TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "Admins delete cancellation policies" ON public.cancellation_policies;
CREATE POLICY "Admins delete cancellation policies"
  ON public.cancellation_policies FOR DELETE TO authenticated
  USING (public.is_admin());
