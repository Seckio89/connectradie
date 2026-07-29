-- Cancellation policy: agreed terms, recorded before the job starts.
--
-- Scope is deliberately narrow. This records WHAT was agreed and THAT both
-- sides agreed to it. It moves no money and calculates no fees. Escrow still
-- refunds in full on cancellation, and any argument about costs already
-- incurred goes through the existing dispute flow, which has a human in it.
--
-- That restraint is the point. Deducting a cancellation fee from escrowed
-- client money is the platform deciding who keeps someone else's funds, which
-- is exactly the AFSL exposure the escrow model exists to avoid. If tiered
-- automatic fees are ever wanted, they need their own design and their own
-- legal read — not an extension bolted onto this.
--
-- Two tables:
--   cancellation_policies        — the versioned platform catalogue
--   job_cancellation_agreements  — what a specific job agreed to, frozen
--
-- The snapshot matters. Editing the policy later must never retroactively
-- change the terms a live job was agreed under, so the full text is copied
-- onto the agreement at acceptance time.

-- ── cancellation_policies ───────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.cancellation_policies (
    id uuid NOT NULL DEFAULT gen_random_uuid()
  , version integer NOT NULL
  , summary text NOT NULL
  , terms text NOT NULL
  -- Informational only. Nothing enforces it; it tells both sides what notice
  -- is expected before the other party is reasonably out of pocket.
  , notice_hours integer NOT NULL DEFAULT 24
  , is_current boolean NOT NULL DEFAULT false
  , effective_from timestamp with time zone NOT NULL DEFAULT now()
  , created_at timestamp with time zone NOT NULL DEFAULT now()
  , CONSTRAINT cancellation_policies_pkey PRIMARY KEY (id)
  , CONSTRAINT cancellation_policies_version_key UNIQUE (version)
  , CONSTRAINT cancellation_policies_notice_hours_check CHECK (notice_hours >= 0)
);

-- At most one current policy. A partial unique index is the cheapest way to
-- make "two current policies" unrepresentable rather than merely discouraged.
CREATE UNIQUE INDEX IF NOT EXISTS idx_cancellation_policies_one_current
  ON public.cancellation_policies ((is_current)) WHERE (is_current = true);

ALTER TABLE public.cancellation_policies ENABLE ROW LEVEL SECURITY;

-- Readable by everyone including anon: the terms are shown before signup and
-- on the marketing site. There is nothing private in them.
DROP POLICY IF EXISTS "Anyone can read cancellation policies" ON public.cancellation_policies;
CREATE POLICY "Anyone can read cancellation policies" ON public.cancellation_policies
  FOR SELECT USING (true);

DROP POLICY IF EXISTS "Admins manage cancellation policies" ON public.cancellation_policies;
CREATE POLICY "Admins manage cancellation policies" ON public.cancellation_policies
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.profiles
             WHERE profiles.id = (SELECT auth.uid()) AND profiles.role = 'admin'::text)
  ) WITH CHECK (
    EXISTS (SELECT 1 FROM public.profiles
             WHERE profiles.id = (SELECT auth.uid()) AND profiles.role = 'admin'::text)
  );

-- ── job_cancellation_agreements ─────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.job_cancellation_agreements (
    id uuid NOT NULL DEFAULT gen_random_uuid()
  , job_id uuid NOT NULL
  , policy_id uuid NOT NULL
  -- Frozen at acceptance. Never read the live policy text for a job that
  -- already has an agreement.
  , terms_snapshot text NOT NULL
  , policy_version integer NOT NULL
  , client_accepted_at timestamp with time zone
  , tradie_accepted_at timestamp with time zone
  , created_at timestamp with time zone NOT NULL DEFAULT now()
  , updated_at timestamp with time zone NOT NULL DEFAULT now()
  , CONSTRAINT job_cancellation_agreements_pkey PRIMARY KEY (id)
  , CONSTRAINT job_cancellation_agreements_job_id_key UNIQUE (job_id)
  , CONSTRAINT job_cancellation_agreements_job_id_fkey
      FOREIGN KEY (job_id) REFERENCES public.jobs(id) ON DELETE CASCADE
  , CONSTRAINT job_cancellation_agreements_policy_id_fkey
      FOREIGN KEY (policy_id) REFERENCES public.cancellation_policies(id)
);

CREATE INDEX IF NOT EXISTS idx_job_cancellation_agreements_policy_id
  ON public.job_cancellation_agreements USING btree (policy_id);

ALTER TABLE public.job_cancellation_agreements ENABLE ROW LEVEL SECURITY;

-- SELECT only. Both parties can read what was agreed on their own job.
--
-- There is deliberately no INSERT or UPDATE policy. If either party could
-- write the row directly they could stamp the OTHER side's acceptance —
-- recording consent that was never given, on the one record whose whole job is
-- to prove consent. Writes go through accept_cancellation_terms() below, which
-- can only ever set the caller's own column.
DROP POLICY IF EXISTS "Job parties read their cancellation agreement" ON public.job_cancellation_agreements;
CREATE POLICY "Job parties read their cancellation agreement" ON public.job_cancellation_agreements
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.jobs
       WHERE jobs.id = job_cancellation_agreements.job_id
         AND ((SELECT auth.uid()) IN (jobs.client_id, jobs.tradie_id))
    )
    OR EXISTS (SELECT 1 FROM public.profiles
                WHERE profiles.id = (SELECT auth.uid()) AND profiles.role = 'admin'::text)
  );

-- ── accept_cancellation_terms ───────────────────────────────────────────────

-- SECURITY DEFINER so it can write a table with no user-facing write policy.
--
-- Caller identity comes from auth.uid(), NOT current_user. Under SECURITY
-- DEFINER current_user is the function owner, so a current_user guard would
-- pass for everyone — that mistake has shipped in this codebase before.
CREATE OR REPLACE FUNCTION public.accept_cancellation_terms(p_job_id uuid)
RETURNS public.job_cancellation_agreements
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_caller  uuid := auth.uid();
  v_job     public.jobs%ROWTYPE;
  v_policy  public.cancellation_policies%ROWTYPE;
  v_row     public.job_cancellation_agreements%ROWTYPE;
  v_is_client boolean;
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '28000';
  END IF;

  SELECT * INTO v_job FROM public.jobs WHERE id = p_job_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Job not found' USING ERRCODE = 'P0002';
  END IF;

  -- A tradie agrees to the terms when they QUOTE, which is before they are
  -- assigned to the job — at that point jobs.tradie_id is still null. Checking
  -- only tradie_id would make it impossible for a tradie to ever accept in
  -- time, so a tradie holding a quote on the job counts too.
  IF v_caller = v_job.client_id THEN
    v_is_client := true;
  ELSIF v_caller = v_job.tradie_id
     OR EXISTS (SELECT 1 FROM public.quotes q
                 WHERE q.job_id = p_job_id AND q.tradie_id = v_caller) THEN
    v_is_client := false;
  ELSE
    RAISE EXCEPTION 'Only the client or a quoting tradie on this job can accept its terms'
      USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_policy
    FROM public.cancellation_policies
   WHERE is_current = true
   LIMIT 1;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'No current cancellation policy is configured'
      USING ERRCODE = 'P0002';
  END IF;

  -- First acceptance creates the agreement and freezes the terms. Later
  -- acceptances attach to that snapshot, so both parties are provably agreeing
  -- to the same text even if the catalogue moved on in between.
  INSERT INTO public.job_cancellation_agreements AS a
    (job_id, policy_id, terms_snapshot, policy_version,
     client_accepted_at, tradie_accepted_at)
  VALUES
    (p_job_id, v_policy.id, v_policy.terms, v_policy.version,
     CASE WHEN v_is_client THEN now() END,
     CASE WHEN v_is_client THEN NULL ELSE now() END)
  ON CONFLICT (job_id) DO UPDATE
    SET client_accepted_at = CASE
          WHEN v_is_client THEN COALESCE(a.client_accepted_at, now())
          ELSE a.client_accepted_at END,
        tradie_accepted_at = CASE
          WHEN v_is_client THEN a.tradie_accepted_at
          ELSE COALESCE(a.tradie_accepted_at, now()) END,
        updated_at = now()
  RETURNING * INTO v_row;

  RETURN v_row;
END;
$$;

REVOKE ALL ON FUNCTION public.accept_cancellation_terms(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.accept_cancellation_terms(uuid) TO authenticated;

-- ── Seed v1 ─────────────────────────────────────────────────────────────────
--
-- Plain-language and deliberately modest: it describes what the platform
-- actually does today. It promises no automatic fee, because there isn't one.
--
-- NEEDS A LEGAL READ before go-live. This is engineering copy describing
-- current system behaviour, not reviewed consumer-contract wording.

INSERT INTO public.cancellation_policies (version, summary, terms, notice_hours, is_current)
SELECT
  1,
  'Either side can cancel before work starts. Money held in escrow is returned in full. Costs already incurred are settled between you, with our dispute process if you can''t agree.',
  E'Cancelling a job\n\n'
  'Either the client or the tradie can cancel a job before work starts.\n\n'
  'Money you have paid into escrow has not gone to the tradie. If the job is '
  'cancelled before any payment has been released, it is returned to you in '
  'full. We do not deduct a cancellation fee, and neither side can charge the '
  'other one through the platform automatically.\n\n'
  'Payments already released for completed stages stay released. Those stages '
  'were signed off as finished, and cancelling the rest of the job does not '
  'undo them.\n\n'
  'Giving notice\n\n'
  'Please give at least 24 hours notice where you can. A tradie who has '
  'turned down other work, bought materials or travelled to site may be out '
  'of pocket, and the same is true in reverse for a client who has taken time '
  'off or moved out of a property.\n\n'
  'If costs have already been incurred\n\n'
  'If one side believes they are genuinely out of pocket, raise it with the '
  'other side first. If you cannot agree, either of you can open a dispute '
  'and we will look at the evidence from both sides before anything is '
  'decided. Money stays in escrow until that is resolved.\n\n'
  'These terms are shown to both sides before the job starts, and the version '
  'you agreed to is recorded against the job. Changing this policy later does '
  'not change the terms of a job already underway.',
  24,
  true
WHERE NOT EXISTS (SELECT 1 FROM public.cancellation_policies WHERE version = 1);
