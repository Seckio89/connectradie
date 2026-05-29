-- Server-side enforcement of the verification gate. The frontend (Leads page
-- card + SubmitQuoteModal) already blocks unverified tradies, but a trigger
-- is the only place to enforce this across every code path — including any
-- future RPC, future edge function, future bulk insert. Defence in depth.
--
-- Rule set:
--   - All quotes require the tradie to have abn_verified = true.
--   - For licensed trades (plumber, electrician, builder, roofer, bricklayer,
--     waterproofing, pool-builder, hvac, scaffolder, demolition, pest-control,
--     air-conditioning, arborist, solar, security, fire-safety, hot-water-
--     service, bathroom-renovator, kitchen-renovator), the tradie also needs
--     license_verified = true AND the trade in verified_trades[].
--   - service_role and postgres bypass this check so the existing webhooks /
--     migrations / admin scripts continue to work.

CREATE OR REPLACE FUNCTION public.enforce_tradie_verification_for_quotes()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_tradie       record;
  v_job_desc     text;
  v_trade_key    text;
  v_licensed     boolean;
  v_licensed_set text[] := ARRAY[
    'plumber','electrician','builder','roofer','bricklayer','waterproofing',
    'pool-builder','hvac','scaffolder','demolition','pest-control',
    'air-conditioning','arborist','solar','security','fire-safety',
    'hot-water-service','bathroom-renovator','kitchen-renovator'
  ];
BEGIN
  -- Bypass for service_role and postgres so server-side logic + admin work fine.
  IF current_user IN ('service_role', 'postgres', 'supabase_admin') THEN
    RETURN NEW;
  END IF;

  -- Resolve the trade from the job's description prefix ([trade]).
  SELECT description INTO v_job_desc FROM public.jobs WHERE id = NEW.job_id;
  IF v_job_desc IS NULL THEN
    -- Job missing — let the FK fail loudly instead of masking it here.
    RETURN NEW;
  END IF;

  v_trade_key := substring(v_job_desc from '^\[([^\]]+)\]');
  v_licensed := v_trade_key = ANY (v_licensed_set);

  -- Load the tradie's verification state.
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
$$;

DROP TRIGGER IF EXISTS trg_enforce_tradie_verification ON public.quotes;
CREATE TRIGGER trg_enforce_tradie_verification
  BEFORE INSERT ON public.quotes
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_tradie_verification_for_quotes();

-- Lock down EXECUTE on the trigger function so it isn't RPC-callable.
REVOKE EXECUTE ON FUNCTION public.enforce_tradie_verification_for_quotes() FROM anon, authenticated, public;
