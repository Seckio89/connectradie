-- Migration: create_worker_credential_exemptions
-- Type: Participant tier, business-write only
-- Description: Lets a business declare that a seeded credential does not apply to
-- one of its workers.
--
-- Why this exists: the credential_types seed is a TRADE-LEVEL DEFAULT, not a
-- determination. The platform cannot know whether a given cleaner works on
-- construction sites (White Card) or around children (WWCC). Before this table the
-- roster showed permanent red badges for requirements that may not exist for that
-- business at all — and an indicator that cries wolf is worth nothing on the day
-- something genuinely expires.
--
-- Reversible by design: delete the row to start tracking the credential again.

CREATE TABLE IF NOT EXISTS public.worker_credential_exemptions (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_member_id     UUID NOT NULL REFERENCES public.business_team_members(id) ON DELETE CASCADE,
  credential_type_id UUID NOT NULL REFERENCES public.credential_types(id) ON DELETE CASCADE,
  reason             TEXT,
  created_by         UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT worker_credential_exemptions_unique UNIQUE (team_member_id, credential_type_id)
);

COMMENT ON TABLE public.worker_credential_exemptions IS
  'A business declaring that a seeded credential does not apply to one of its workers. The seeded credential_types set is a trade-level DEFAULT, not a determination - the platform cannot know whether a given cleaner works on construction sites (White Card) or around children (WWCC). Without this, the roster shows permanent red badges for requirements that may not exist, and the compliance indicator is ignored. Reversible: delete the row to track it again.';
COMMENT ON COLUMN public.worker_credential_exemptions.created_by IS
  'Who made the call. The business decides what its workers need, not the platform and not the worker.';

ALTER TABLE public.worker_credential_exemptions ENABLE ROW LEVEL SECURITY;

-- SELECT: the owning business and the worker themselves. The worker can see that
-- a requirement was waived; only the business can waive it.
CREATE POLICY "worker_credential_exemptions_select_business_or_worker"
  ON public.worker_credential_exemptions
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.business_team_members btm
      WHERE btm.id = worker_credential_exemptions.team_member_id
        AND btm.archived_at IS NULL
        AND (
          btm.business_owner_id = (SELECT auth.uid())
          OR btm.member_profile_id = (SELECT auth.uid())
        )
    )
  );

-- INSERT / DELETE: the owning business only. A worker must not be able to exempt
-- themselves from a check their employer requires.
CREATE POLICY "worker_credential_exemptions_insert_business"
  ON public.worker_credential_exemptions
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.business_team_members btm
      WHERE btm.id = worker_credential_exemptions.team_member_id
        AND btm.archived_at IS NULL
        AND btm.business_owner_id = (SELECT auth.uid())
    )
  );

CREATE POLICY "worker_credential_exemptions_delete_business"
  ON public.worker_credential_exemptions
  FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.business_team_members btm
      WHERE btm.id = worker_credential_exemptions.team_member_id
        AND btm.business_owner_id = (SELECT auth.uid())
    )
  );

-- No UPDATE policy: an exemption is created or removed, never edited.

-- The unique constraint indexes (team_member_id, credential_type_id), covering
-- team_member_id as a leading-column prefix. The other two FKs need their own.
CREATE INDEX IF NOT EXISTS idx_worker_credential_exemptions_credential_type_id
  ON public.worker_credential_exemptions (credential_type_id);
CREATE INDEX IF NOT EXISTS idx_worker_credential_exemptions_created_by
  ON public.worker_credential_exemptions (created_by) WHERE created_by IS NOT NULL;
