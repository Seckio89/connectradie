-- Migration: dispute_ai_handling_schema
-- Phase 1 of AI-assisted dispute handling. Schema only — nothing user-visible.
-- Its job is to make the later phases additive instead of surgical.
--
-- ─────────────────────────────────────────────────────────────────────────────
-- THE DANGEROUS PART, AND WHY THIS MIGRATION IS SHAPED THE WAY IT IS
-- ─────────────────────────────────────────────────────────────────────────────
-- `auto-release-payments/index.ts` hard-codes the set of dispute statuses that
-- freeze a payout:
--
--     .in("status", ["open", "under_review"])
--
-- Adding new statuses without updating that literal is silent and expensive:
-- a job sitting in a brand-new `platform_review` state would NOT match, so the
-- next cron tick would release its escrow to the tradie while the dispute was
-- still live. Nothing errors. No test fails. The money is simply gone.
--
-- So the blocking set stops being a literal in TypeScript and becomes a column.
-- `blocks_release` is GENERATED, so the CHECK constraint and the release query
-- physically cannot drift apart, and the partial unique index below is rebuilt
-- on the same column — meaning "one live dispute per job" and "which disputes
-- freeze money" can never disagree either.
--
-- Cost, stated plainly: changing the generated expression later means DROP +
-- ADD, which rewrites the table and drops the dependent index. That must be one
-- transaction. On this table it is milliseconds.
--
-- ─────────────────────────────────────────────────────────────────────────────
-- DECISIONS
-- ─────────────────────────────────────────────────────────────────────────────
--  * Statuses are ADDED, not replaced. All six existing states stay valid, so
--    no live row is rewritten and no frontend status literal has to change in
--    lockstep with this migration.
--  * The 5-hour auto-release window is NOT touched. Extending it changes when
--    every tradie on the platform gets paid; that is its own decision.
--  * `opened_at` is deliberately NOT added — `created_at` already is it. A
--    second column meaning the same thing is just an invitation to disagree.
--  * Deadline VALUES are set by whoever creates the dispute, not by a column
--    default, so the interval lives in one place in application code.

-- ═════════════════════════════════════════════════════════════════════════════
-- 1. disputes — new states, new columns
-- ═════════════════════════════════════════════════════════════════════════════

ALTER TABLE public.disputes DROP CONSTRAINT IF EXISTS disputes_status_check;
ALTER TABLE public.disputes ADD CONSTRAINT disputes_status_check
  CHECK (status IN (
    -- existing, unchanged
    'open', 'under_review',
    'resolved_client', 'resolved_tradie', 'resolved_split', 'dismissed',
    -- new: the two live stages of the assisted flow
    'direct_resolution',   -- parties are talking; platform has not stepped in
    'platform_review'      -- escalated; awaiting a human decision
  ));

ALTER TABLE public.disputes
  ADD COLUMN IF NOT EXISTS dispute_type text NOT NULL DEFAULT 'other',
  ADD COLUMN IF NOT EXISTS respond_by timestamptz,
  ADD COLUMN IF NOT EXISTS platform_review_by timestamptz;

ALTER TABLE public.disputes DROP CONSTRAINT IF EXISTS disputes_dispute_type_check;
ALTER TABLE public.disputes ADD CONSTRAINT disputes_dispute_type_check
  CHECK (dispute_type IN (
    'work_quality',        -- done, but not to standard
    'incomplete_work',     -- not finished
    'scope_disagreement',  -- argument about what was agreed
    'pricing',             -- argument about the amount
    'no_show',             -- tradie did not attend
    'damage',              -- property damage
    'other'                -- catch-all; the default, so existing rows stay valid
  ));

COMMENT ON COLUMN public.disputes.respond_by IS
  'Deadline for the other party to respond before the dispute escalates.';
COMMENT ON COLUMN public.disputes.platform_review_by IS
  'Deadline for the platform to reach a decision once escalated.';

-- The single source of truth for "does this dispute freeze the payout".
-- Read by auto-release-payments; never enumerate statuses in application code.
ALTER TABLE public.disputes
  ADD COLUMN blocks_release boolean
  GENERATED ALWAYS AS (
    status IN ('open', 'under_review', 'direct_resolution', 'platform_review')
  ) STORED;

COMMENT ON COLUMN public.disputes.blocks_release IS
  'GENERATED. True while the dispute must stop auto-release. auto-release-payments '
  'filters on this column so the status vocabulary and the release query cannot drift.';

CREATE INDEX IF NOT EXISTS idx_disputes_blocks_release
  ON public.disputes (job_id) WHERE blocks_release;

-- Rebuild the one-live-dispute-per-job index onto the generated column so it
-- automatically covers the two new blocking states.
DROP INDEX IF EXISTS public.disputes_one_open_per_job;
CREATE UNIQUE INDEX disputes_one_open_per_job
  ON public.disputes (job_id) WHERE blocks_release;

-- ═════════════════════════════════════════════════════════════════════════════
-- 2. Append-only enforcement
-- ═════════════════════════════════════════════════════════════════════════════
-- Postgres has no true immutability, so this is BUILT, not declared.
--
-- RLS alone is not enough: the service role bypasses RLS entirely, so policies
-- would protect these tables from everyone EXCEPT the edge functions most able
-- to damage them. Triggers fire for the service role too, which is the point.
--
-- SECURITY INVOKER is deliberate and load-bearing. A guard that runs as DEFINER
-- and checks caller identity passes everyone — that exact defect has been found
-- four times in this codebase, most recently in a billing lock that had never
-- once executed. This function needs no elevated read, so there is no reason to
-- make it DEFINER.
--
-- Honest limit: a table owner can still ALTER TABLE ... DISABLE TRIGGER. This
-- stops application code and stray SQL, not a determined superuser.

CREATE OR REPLACE FUNCTION public.reject_append_only_mutation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
BEGIN
  RAISE EXCEPTION '% is append-only; % is not permitted', TG_TABLE_NAME, TG_OP
    USING ERRCODE = '42501';
END;
$$;

-- ═════════════════════════════════════════════════════════════════════════════
-- 3. dispute_evidence_summaries — AI output, with its provenance
-- ═════════════════════════════════════════════════════════════════════════════
-- Provenance columns are NOT NULL and live in the same row as the summary, so a
-- summary that cannot be audited cannot be written at all.

CREATE TABLE IF NOT EXISTS public.dispute_evidence_summaries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  dispute_id uuid NOT NULL REFERENCES public.disputes(id) ON DELETE CASCADE,
  summary jsonb NOT NULL,
  -- provenance (spec item 5)
  model text NOT NULL,
  prompt_version text NOT NULL,
  raw_input jsonb NOT NULL,
  raw_output text NOT NULL,   -- text, not jsonb: a model reply may not parse
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_dispute_evidence_summaries_dispute_id
  ON public.dispute_evidence_summaries (dispute_id);

ALTER TABLE public.dispute_evidence_summaries ENABLE ROW LEVEL SECURITY;

-- Admin read only. Deliberately NOT visible to the disputing parties in Phase 1
-- — showing a user an AI's read of their own dispute is a separate decision.
DROP POLICY IF EXISTS "Admins can view evidence summaries" ON public.dispute_evidence_summaries;
CREATE POLICY "Admins can view evidence summaries" ON public.dispute_evidence_summaries
  FOR SELECT TO authenticated
  USING (public.is_admin());

-- No INSERT/UPDATE/DELETE policy for authenticated at all. The edge function
-- writes with the service role.
REVOKE ALL ON public.dispute_evidence_summaries FROM anon, authenticated;
GRANT SELECT ON public.dispute_evidence_summaries TO authenticated;

DROP TRIGGER IF EXISTS dispute_evidence_summaries_append_only ON public.dispute_evidence_summaries;
CREATE TRIGGER dispute_evidence_summaries_append_only
  BEFORE UPDATE OR DELETE ON public.dispute_evidence_summaries
  FOR EACH ROW EXECUTE FUNCTION public.reject_append_only_mutation();

-- ═════════════════════════════════════════════════════════════════════════════
-- 4. dispute_decisions — the human decision record
-- ═════════════════════════════════════════════════════════════════════════════
-- `overridden` is what makes the AI auditable: it records that a human saw the
-- suggestion and went the other way.

CREATE TABLE IF NOT EXISTS public.dispute_decisions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  dispute_id uuid NOT NULL REFERENCES public.disputes(id) ON DELETE CASCADE,
  decided_by uuid NOT NULL REFERENCES public.profiles(id),
  outcome text NOT NULL CHECK (outcome IN (
    'resolved_client', 'resolved_tradie', 'resolved_split', 'dismissed'
  )),
  reasoning text NOT NULL,
  ai_suggestion jsonb,                            -- null when no summary existed
  overridden boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_dispute_decisions_dispute_id
  ON public.dispute_decisions (dispute_id);
CREATE INDEX IF NOT EXISTS idx_dispute_decisions_decided_by
  ON public.dispute_decisions (decided_by);

ALTER TABLE public.dispute_decisions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins can view dispute decisions" ON public.dispute_decisions;
CREATE POLICY "Admins can view dispute decisions" ON public.dispute_decisions
  FOR SELECT TO authenticated
  USING (public.is_admin());

-- An admin records their own decision. `decided_by` is pinned to the caller so
-- one admin cannot file a decision under another's name.
DROP POLICY IF EXISTS "Admins can record dispute decisions" ON public.dispute_decisions;
CREATE POLICY "Admins can record dispute decisions" ON public.dispute_decisions
  FOR INSERT TO authenticated
  WITH CHECK (public.is_admin() AND decided_by = (SELECT auth.uid()));

-- No UPDATE or DELETE policy, and the grant is withheld as well as the policy.
REVOKE ALL ON public.dispute_decisions FROM anon, authenticated;
GRANT SELECT, INSERT ON public.dispute_decisions TO authenticated;

DROP TRIGGER IF EXISTS dispute_decisions_append_only ON public.dispute_decisions;
CREATE TRIGGER dispute_decisions_append_only
  BEFORE UPDATE OR DELETE ON public.dispute_decisions
  FOR EACH ROW EXECUTE FUNCTION public.reject_append_only_mutation();

-- Note on ON DELETE CASCADE above: both audit tables die with their dispute,
-- which dies with its job. That is required — jobs already cascade into
-- disputes (20260321100000) and the account-deletion path depends on it, so
-- RESTRICT here would break user deletion. The audit is immutable, not
-- indestructible. Worth knowing before anyone relies on it for a chargeback.
