-- Merge overlapping permissive RLS policies.
--
-- Audit finding #8 (AUDIT-REPORT-2026-07-30.md), Supabase advisor lint
-- 0006_multiple_permissive_policies. Where two PERMISSIVE policies cover the
-- same table/role/command, Postgres evaluates BOTH on every row of every query
-- and ORs the results. One policy with an OR'd predicate is equivalent and is
-- evaluated once.
--
-- ── This must not change who can do what ───────────────────────────────────
-- Permissive policies OR their USING clauses together, and separately OR their
-- WITH CHECK clauses together — the two halves are not required to come from
-- the same policy. So folding `a` and `b` into `a OR b` in each half is exactly
-- equivalent, which is what makes this safe to do mechanically.
--
-- Behaviour was recorded before and after by simulating each principal
-- (SET LOCAL role + request.jwt.claims) and counting visible/updatable rows:
--
--   principal   cancel visible  cancel updatable  private visible  updatable
--   admin              1               1                 2             2
--   non-admin          1               0                 1             1
--
-- ⚠️ Deliberately NOT changed: `cancellation_policies` identifies an admin with
-- an inline `profiles.role = 'admin'` test, whereas every other table here uses
-- is_admin(), which is broader — it also accepts `profiles.is_admin = true`.
-- The platform owner holds is_admin=true while keeping role='tradie', so the
-- owner cannot currently write this table. That is a real inconsistency, but
-- widening who may edit the legal cancellation terms is an authorisation
-- decision, not a performance refactor, so the predicate is preserved verbatim
-- and the discrepancy is raised separately.

-- ── cancellation_policies ───────────────────────────────────────────────────
-- The overlap here is not two policies of the same shape: a FOR ALL admin
-- policy also covers SELECT, colliding with the public read. Postgres has no
-- "ALL except SELECT", so the write commands are spelled out and SELECT is left
-- to the single public policy.
DROP POLICY IF EXISTS "Admins manage cancellation policies" ON public.cancellation_policies;

CREATE POLICY "Admins insert cancellation policies"
  ON public.cancellation_policies FOR INSERT TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.profiles
    WHERE profiles.id = (SELECT auth.uid()) AND profiles.role = 'admin'
  ));

CREATE POLICY "Admins update cancellation policies"
  ON public.cancellation_policies FOR UPDATE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.profiles
    WHERE profiles.id = (SELECT auth.uid()) AND profiles.role = 'admin'
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.profiles
    WHERE profiles.id = (SELECT auth.uid()) AND profiles.role = 'admin'
  ));

CREATE POLICY "Admins delete cancellation policies"
  ON public.cancellation_policies FOR DELETE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.profiles
    WHERE profiles.id = (SELECT auth.uid()) AND profiles.role = 'admin'
  ));

-- ── custom_task_suggestions ─────────────────────────────────────────────────
-- Two SELECT policies for `authenticated`: admins see everything, everyone sees
-- approved rows.
DROP POLICY IF EXISTS cts_admin_read ON public.custom_task_suggestions;
DROP POLICY IF EXISTS cts_read_approved ON public.custom_task_suggestions;

CREATE POLICY cts_read
  ON public.custom_task_suggestions FOR SELECT TO authenticated
  USING (status = 'approved' OR public.is_admin());

-- ── profile_private ─────────────────────────────────────────────────────────
-- Owner-or-admin, split across two policies for INSERT and again for UPDATE.
-- The SELECT policy on this table was already written as a single OR'd policy
-- ("Owner or admin can view private profile data") — this brings the write
-- paths onto that same shape.
DROP POLICY IF EXISTS "Admins can insert profile_private" ON public.profile_private;
DROP POLICY IF EXISTS "Owner can insert own private profile data" ON public.profile_private;

CREATE POLICY "Owner or admin can insert private profile data"
  ON public.profile_private FOR INSERT TO authenticated
  WITH CHECK (profile_id = (SELECT auth.uid()) OR public.is_admin());

DROP POLICY IF EXISTS "Admins can update profile_private" ON public.profile_private;
DROP POLICY IF EXISTS "Owner can update own private profile data" ON public.profile_private;

CREATE POLICY "Owner or admin can update private profile data"
  ON public.profile_private FOR UPDATE TO authenticated
  USING (profile_id = (SELECT auth.uid()) OR public.is_admin())
  WITH CHECK (profile_id = (SELECT auth.uid()) OR public.is_admin());
