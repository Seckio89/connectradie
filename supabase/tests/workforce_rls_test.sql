-- ─────────────────────────────────────────────────────────────────────────────
-- Workforce & Compliance — RLS and write-guard tests.
--
-- Run against a database with the workforce migrations applied. Each block is
-- self-contained, creates its own fixtures, and ends with RAISE EXCEPTION so the
-- whole transaction rolls back — nothing is left behind and it is safe to run
-- against production.
--
-- The assertion is the RAISE message. Read it; every field must match the
-- EXPECTED line above the block.
--
-- Set these two to any real profiles.id values before running:
--   :owner_a  — a tradie profile that will own the roster
--   :user_b   — any other profile, used as worker then as stranger
--
-- Run:
--   psql "$DATABASE_URL" -v owner_a="'<uuid>'" -v user_b="'<uuid>'" \
--        -f supabase/tests/workforce_rls_test.sql
--
-- The technique matters: SET LOCAL ROLE authenticated + set_config of
-- request.jwt.claims is what PostgREST does per request, so policies and
-- SECURITY INVOKER triggers see exactly what they would in production. Testing
-- as the table owner would bypass RLS entirely and prove nothing.
-- ─────────────────────────────────────────────────────────────────────────────

\set ON_ERROR_STOP off

-- ═════════════════════════════════════════════════════════════════════════════
-- TEST 1 — Cross-business isolation, both policy branches, and soft delete.
--
-- EXPECTED: worker_sees_own_cred=1 | stranger_workers=0 stranger_creds=0
--           | owner_workers=1 owner_creds=1 | owner_sees_archived=0
-- ═════════════════════════════════════════════════════════════════════════════
DO $$
DECLARE
  v_a uuid := :owner_a;
  v_b uuid := :user_b;
  v_tm uuid; v_ct uuid; v_cred uuid;
  n_b_workers int; n_b_creds int; n_a_workers int; n_a_creds int;
  n_worker_self_creds int; n_arch int;
BEGIN
  SELECT id INTO v_ct FROM public.credential_types WHERE code = 'white_card';

  INSERT INTO public.business_team_members (business_owner_id, member_profile_id, invite_name, role, status)
  VALUES (v_a, v_b, 'Probe Worker', 'employee', 'active') RETURNING id INTO v_tm;
  INSERT INTO public.worker_credentials (team_member_id, credential_type_id, reference_number)
  VALUES (v_tm, v_ct, 'PROBE-X') RETURNING id INTO v_cred;

  -- (a) The WORKER branch of the policy: user_b is on the roster.
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_b, 'role','authenticated')::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  SELECT count(*) INTO n_worker_self_creds FROM public.worker_credentials WHERE id = v_cred;
  EXECUTE 'RESET ROLE';

  -- Detach user_b — they are now a stranger to business A.
  UPDATE public.business_team_members SET member_profile_id = NULL WHERE id = v_tm;

  -- (b) STRANGER must see nothing, on either table.
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_b, 'role','authenticated')::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  SELECT count(*) INTO n_b_workers FROM public.business_team_members WHERE id = v_tm;
  SELECT count(*) INTO n_b_creds   FROM public.worker_credentials    WHERE id = v_cred;
  EXECUTE 'RESET ROLE';

  -- (c) OWNER branch must still work.
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_a, 'role','authenticated')::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  SELECT count(*) INTO n_a_workers FROM public.business_team_members WHERE id = v_tm;
  SELECT count(*) INTO n_a_creds   FROM public.worker_credentials    WHERE id = v_cred;
  EXECUTE 'RESET ROLE';

  -- (d) Archived rows drop out even for the owner.
  UPDATE public.business_team_members SET archived_at = now() WHERE id = v_tm;
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_a, 'role','authenticated')::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  SELECT count(*) INTO n_arch FROM public.business_team_members WHERE id = v_tm;
  EXECUTE 'RESET ROLE';

  RAISE EXCEPTION
    'TEST 1: worker_sees_own_cred=% | stranger_workers=% stranger_creds=% | owner_workers=% owner_creds=% | owner_sees_archived=%',
    n_worker_self_creds, n_b_workers, n_b_creds, n_a_workers, n_a_creds, n_arch;
END $$;

-- ═════════════════════════════════════════════════════════════════════════════
-- TEST 2 — The verification fields are system-managed.
--
-- The owning business already holds UPDATE on this row, so RLS alone cannot stop
-- them setting verification_status='verified' on their own worker. This proves
-- the COLUMN-level trigger is what blocks it: the same caller, in the same
-- statement pair, is refused on the verification fields but allowed on a factual
-- field of the same row.
--
-- EXPECTED: verify_blocked=t | factual_update_allowed=t
--           | err=verification_status, verified_at and verified_by are system-managed...
-- ═════════════════════════════════════════════════════════════════════════════
DO $$
DECLARE
  v_owner uuid := :owner_a;
  v_tm uuid; v_ct uuid; v_cred uuid;
  v_blocked boolean := false; v_msg text := ''; v_rows int := -1;
  v_legit_ok boolean := false;
BEGIN
  SELECT id INTO v_ct FROM public.credential_types WHERE code = 'white_card';

  INSERT INTO public.business_team_members (business_owner_id, invite_name, role, status)
  VALUES (v_owner, 'RLS Probe Worker', 'employee', 'active') RETURNING id INTO v_tm;
  INSERT INTO public.worker_credentials (team_member_id, credential_type_id, reference_number)
  VALUES (v_tm, v_ct, 'PROBE-1') RETURNING id INTO v_cred;

  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_owner, 'role','authenticated')::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';

  BEGIN
    UPDATE public.worker_credentials
       SET verification_status = 'verified', verified_at = now(), verified_by = v_owner
     WHERE id = v_cred;
    GET DIAGNOSTICS v_rows = ROW_COUNT;
  EXCEPTION WHEN others THEN
    v_blocked := true; v_msg := SQLERRM;
  END;

  BEGIN
    UPDATE public.worker_credentials SET reference_number = 'PROBE-2' WHERE id = v_cred;
    GET DIAGNOSTICS v_rows = ROW_COUNT;
    v_legit_ok := (v_rows = 1);
  EXCEPTION WHEN others THEN
    v_legit_ok := false;
  END;

  EXECUTE 'RESET ROLE';
  RAISE EXCEPTION 'TEST 2: verify_blocked=% | factual_update_allowed=% | err=%',
    v_blocked, v_legit_ok, v_msg;
END $$;

-- ═════════════════════════════════════════════════════════════════════════════
-- TEST 3 — service_role can write the verification fields; the expiry-sweep
--          ledger is idempotent; a renewal re-arms the thresholds.
--
-- EXPECTED: service_role_wrote=verified verified_at_set=t
--           | ledger_run1=1 run2=0 | after_renewal_total=2
-- ═════════════════════════════════════════════════════════════════════════════
DO $$
DECLARE
  v_owner uuid := :owner_a;
  v_tm uuid; v_ct uuid; v_cred uuid;
  v_status text; v_verified_at timestamptz;
  n_first int; n_second int; n_total int;
  v_exp date := (current_date + 30);
BEGIN
  SELECT id INTO v_ct FROM public.credential_types WHERE code = 'police_check';

  INSERT INTO public.business_team_members (business_owner_id, invite_name, role, status)
  VALUES (v_owner, 'Sweep Probe', 'employee', 'active') RETURNING id INTO v_tm;
  INSERT INTO public.worker_credentials (team_member_id, credential_type_id, expires_at)
  VALUES (v_tm, v_ct, v_exp) RETURNING id INTO v_cred;

  -- credential-verify's write path.
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_owner, 'role','service_role')::text, true);
  EXECUTE 'SET LOCAL ROLE service_role';
  UPDATE public.worker_credentials
     SET verification_status = 'verified', verified_at = now(), verified_by = v_owner
   WHERE id = v_cred;
  SELECT verification_status, verified_at INTO v_status, v_verified_at
    FROM public.worker_credentials WHERE id = v_cred;
  EXECUTE 'RESET ROLE';

  -- Sweep idempotency: the ledger insert IS the gate.
  INSERT INTO public.worker_credential_notifications (worker_credential_id, threshold_days, expires_on)
  VALUES (v_cred, 30, v_exp) ON CONFLICT DO NOTHING;
  GET DIAGNOSTICS n_first = ROW_COUNT;

  INSERT INTO public.worker_credential_notifications (worker_credential_id, threshold_days, expires_on)
  VALUES (v_cred, 30, v_exp) ON CONFLICT DO NOTHING;
  GET DIAGNOSTICS n_second = ROW_COUNT;

  -- A renewal (new expiry) must re-arm the same threshold.
  INSERT INTO public.worker_credential_notifications (worker_credential_id, threshold_days, expires_on)
  VALUES (v_cred, 30, v_exp + 365) ON CONFLICT DO NOTHING;

  SELECT count(*) INTO n_total FROM public.worker_credential_notifications
   WHERE worker_credential_id = v_cred;

  RAISE EXCEPTION 'TEST 3: service_role_wrote=% verified_at_set=% | ledger_run1=% run2=% | after_renewal_total=%',
    v_status, (v_verified_at IS NOT NULL), n_first, n_second, n_total;
END $$;
