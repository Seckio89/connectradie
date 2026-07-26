-- Migration: fix_enforce_tradie_verification_caller_check
-- Description:
--   The licensing gate on quote submission had never once run.
--
--   enforce_tradie_verification_for_quotes() is a BEFORE INSERT trigger on
--   quotes (confirmed attached in pg_trigger) that opened with:
--       IF current_user IN ('service_role','postgres','supabase_admin') THEN
--         RETURN NEW;
--   inside a SECURITY DEFINER function. current_user is the function OWNER
--   there, so that was ALWAYS true and the trigger returned immediately every
--   time. Every check below it was unreachable:
--     - ABN verification required before quoting
--     - contractor licence required for ~19 licensed trades
--     - licence endorsed for that specific trade
--
--   PROVED BY EXECUTION before the change: an unverified tradie (no ABN, no
--   licence, no endorsement) inserted a quote on an [electrician] job under
--   SET LOCAL ROLE authenticated and it was ALLOWED. For a marketplace whose
--   product is verified licensed tradies that is a compliance and safety
--   exposure, and until C1 landed this morning it compounded with users being
--   able to self-award license_verified.
--
--   Third instance of this dead-guard pattern found today, after the two
--   billing-lock triggers and create_notification.
--
--   SECURITY DEFINER IS KEPT DELIBERATELY, reversing an earlier suggestion of
--   switching to INVOKER. This function READS jobs and profiles. Under INVOKER
--   those reads become subject to RLS as the quoting tradie, and the
--   "IF v_job_desc IS NULL THEN RETURN NEW" below fails OPEN - an RLS miss
--   would silently re-disable the gate, invisibly. Only the caller-identity
--   test changes, matching the pattern shipped in 20260726240000.
--
--   Verified after, in one rolled-back transaction:
--     no ABN, [electrician]                       BLOCKED 23514
--     ABN ok / no licence, [electrician]          BLOCKED 23514
--     licence endorsed plumber only               BLOCKED 23514
--     fully verified, [electrician]               ALLOWED
--     [Cleaner] with ABN only (unlicensed trade)  ALLOWED
--     service_role, unverified, fresh job         ALLOWED (edge fns unaffected)

CREATE OR REPLACE FUNCTION public.enforce_tradie_verification_for_quotes()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_tradie       record;
  v_job_desc     text;
  v_trade_key    text;
  v_licensed     boolean;
  v_jwt_role     text := '';
  v_licensed_set text[] := ARRAY[
    'plumber','electrician','builder','roofer','bricklayer','waterproofing',
    'pool-builder','hvac','scaffolder','demolition','pest-control',
    'air-conditioning','arborist','solar','security','fire-safety',
    'hot-water-service','bathroom-renovator','kitchen-renovator'
  ];
BEGIN
  BEGIN
    v_jwt_role := COALESCE(current_setting('request.jwt.claims', true)::jsonb->>'role', '');
  EXCEPTION WHEN OTHERS THEN
    v_jwt_role := '';
  END;

  -- Edge functions (service_role) bypass, as before.
  IF v_jwt_role = 'service_role' THEN
    RETURN NEW;
  END IF;
  -- Internal callers with no JWT at all: triggers, cron, psql as postgres.
  IF auth.uid() IS NULL AND v_jwt_role = '' THEN
    RETURN NEW;
  END IF;

  SELECT description INTO v_job_desc FROM public.jobs WHERE id = NEW.job_id;
  IF v_job_desc IS NULL THEN
    RETURN NEW;
  END IF;

  v_trade_key := substring(v_job_desc from '^\[([^\]]+)\]');
  v_licensed := v_trade_key = ANY (v_licensed_set);

  SELECT abn_verified, license_verified, verified_trades
    INTO v_tradie
    FROM public.profiles
   WHERE id = NEW.tradie_id;

  IF v_tradie IS NULL THEN
    RAISE EXCEPTION 'Tradie profile not found' USING ERRCODE = '23514';
  END IF;

  IF NOT COALESCE(v_tradie.abn_verified, false) THEN
    RAISE EXCEPTION 'ABN verification required before submitting a quote'
      USING ERRCODE = '23514', HINT = 'Complete ABN verification in the Verification Center.';
  END IF;

  IF v_licensed THEN
    IF NOT COALESCE(v_tradie.license_verified, false) THEN
      RAISE EXCEPTION 'Contractor licence verification required for %', v_trade_key
        USING ERRCODE = '23514', HINT = 'Add and verify your contractor licence in the Verification Center.';
    END IF;
    IF NOT (COALESCE(v_tradie.verified_trades, ARRAY[]::text[]) @> ARRAY[v_trade_key]) THEN
      RAISE EXCEPTION 'Your licence is not endorsed for %', v_trade_key
        USING ERRCODE = '23514', HINT = 'Update your licence to include this trade.';
    END IF;
  END IF;

  RETURN NEW;
END;
$function$;
