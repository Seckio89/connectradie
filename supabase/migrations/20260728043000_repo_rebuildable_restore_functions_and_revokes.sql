-- Make this repo able to rebuild the database from scratch.
--
-- WHY THIS EXISTS
-- Provisioning a brand-new project by replaying supabase/migrations in filename
-- order failed, because these files were never the thing that actually built
-- production. Prod's migration history has 331 versions; this repo has 311
-- files, and the two sets are near mirror images -- prod's carry real clock
-- timestamps (20260322100713) while the files carry hand-rounded ones
-- (20260322100000, and one impossible 20260726260000 = hour 26). Same logical
-- migrations, different recorded order.
--
-- Replaying them surfaced two problems, both repaired here.
--
-- 1. THREE FUNCTIONS EXIST IN PRODUCTION WITH NO `CREATE` ANYWHERE IN THIS REPO.
--    create_payment_request (both overloads), is_conversation_creator and
--    notify_tradie_invoice_ready were only ever REFERENCED -- by the REVOKEs in
--    20260528210000 / 20260528220000 -- never defined. A rebuild died on those
--    REVOKEs. The definitions below are lifted verbatim from production via
--    pg_get_functiondef. Until this migration, the repo could not reconstruct
--    prod: that is a disaster-recovery gap, not a tidiness one.
--
-- 2. FIVE MIGRATIONS CANNOT REPLAY IN FILENAME ORDER. On the fresh project they
--    were marked applied rather than run:
--      20260328200000  creates a policy identical to one 20260321400000 already
--                      creates (same name, table, WITH CHECK) -- nothing lost
--      20260528210000  14 REVOKEs -- restored at the bottom of this file
--      20260528220000  10 REVOKEs -- restored at the bottom of this file
--      20260528280000  superseded wholesale by 20260726240000
--      20260726240000  create_notification hardening -- restored below
--
-- create_notification needs DROP + CREATE rather than CREATE OR REPLACE: the
-- version 20260227010000 installs has `p_type text DEFAULT 'message'`, and
-- Postgres refuses to remove a parameter default through CREATE OR REPLACE
-- (42P13). Production has no default on p_type, so this matches production.
--
-- Every statement here is idempotent, so this is a no-op against production,
-- where all of it already exists.

-- == 1. Functions that exist in production but not in this repo ==============

CREATE OR REPLACE FUNCTION public.create_payment_request(p_job_id uuid, p_amount bigint DEFAULT 0)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_payment_id uuid;
  v_job record;
  v_final_amount bigint;
  v_quote_price numeric;
BEGIN
  -- Verify job exists, belongs to calling tradie, and is completed
  SELECT id, client_id, tradie_id, status, budget_amount
  INTO v_job
  FROM jobs
  WHERE id = p_job_id;

  IF v_job IS NULL THEN
    RAISE EXCEPTION 'Job not found';
  END IF;

  IF v_job.tradie_id != auth.uid() THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  IF v_job.status != 'completed' THEN
    RAISE EXCEPTION 'Job must be completed first';
  END IF;

  -- Determine the payment amount:
  -- 1. Use provided p_amount if > 0
  -- 2. Else use job.budget_amount (converted to cents)
  -- 3. Else use accepted quote firm_price (converted to cents)
  -- 4. Else use accepted quote price_max (converted to cents)
  v_final_amount := p_amount;

  IF v_final_amount IS NULL OR v_final_amount <= 0 THEN
    IF v_job.budget_amount IS NOT NULL AND v_job.budget_amount > 0 THEN
      v_final_amount := (v_job.budget_amount * 100)::bigint;
    END IF;
  END IF;

  IF v_final_amount IS NULL OR v_final_amount <= 0 THEN
    SELECT COALESCE(firm_price, price_max, price_min)
    INTO v_quote_price
    FROM quotes
    WHERE job_id = p_job_id
      AND tradie_id = auth.uid()
      AND status = 'accepted'
    LIMIT 1;

    IF v_quote_price IS NOT NULL AND v_quote_price > 0 THEN
      v_final_amount := (v_quote_price * 100)::bigint;
    END IF;
  END IF;

  IF v_final_amount IS NULL OR v_final_amount <= 0 THEN
    v_final_amount := 0;
  END IF;

  -- Create the payment record for the client
  INSERT INTO payments (profile_id, job_id, amount, currency, status, payment_type, metadata)
  VALUES (
    v_job.client_id,
    p_job_id,
    v_final_amount,
    'aud',
    'pending',
    'job_payment',
    jsonb_build_object('tradie_id', auth.uid(), 'requested_at', now())
  )
  RETURNING id INTO v_payment_id;

  RETURN v_payment_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.create_payment_request(p_job_id uuid, p_amount integer DEFAULT 0)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_job record;
  v_payment_id uuid;
  v_amount integer;
BEGIN
  -- Get the job details
  SELECT id, client_id, tradie_id, description, budget_amount, status
  INTO v_job
  FROM jobs
  WHERE id = p_job_id;

  IF v_job IS NULL THEN
    RAISE EXCEPTION 'Job not found';
  END IF;

  -- Only the assigned tradie can request payment
  IF v_job.tradie_id != auth.uid() THEN
    RAISE EXCEPTION 'Only the assigned tradie can request payment';
  END IF;

  -- Job must be completed
  IF v_job.status != 'completed' THEN
    RAISE EXCEPTION 'Job must be completed before requesting payment';
  END IF;

  -- Use provided amount, or fall back to job budget (dollars -> cents)
  v_amount := p_amount;
  IF v_amount = 0 AND v_job.budget_amount IS NOT NULL THEN
    v_amount := (v_job.budget_amount * 100)::integer;
  END IF;

  -- Create payment record for the client (they see it as a pending payment)
  INSERT INTO payments (profile_id, job_id, payment_type, amount, currency, status, metadata)
  VALUES (
    v_job.client_id,
    p_job_id,
    'job_payment',
    v_amount,
    'aud',
    'pending',
    jsonb_build_object(
      'tradie_id', v_job.tradie_id,
      'requested_by', auth.uid(),
      'requested_at', now(),
      'description', v_job.description
    )
  )
  RETURNING id INTO v_payment_id;

  RETURN v_payment_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.is_conversation_creator(conv_id uuid, user_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM conversations WHERE id = conv_id AND created_by = user_id
  );
$function$;

CREATE OR REPLACE FUNCTION public.notify_tradie_invoice_ready()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  rj_record RECORD;
  service_label TEXT;
  client_label TEXT;
BEGIN
  -- Only fire when status transitions INTO completed or extra
  IF NEW.status NOT IN ('completed', 'extra') THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'UPDATE' AND OLD.status IS NOT DISTINCT FROM NEW.status THEN
    RETURN NEW;
  END IF;

  -- Look up parent recurring job; skip if auto-invoice, inactive, or unassigned
  SELECT rj.id, rj.tradie_id, rj.auto_invoice, rj.is_active, rj.service_subtype,
         rj.trade_category, p.full_name AS client_name
    INTO rj_record
    FROM recurring_jobs rj
    LEFT JOIN profiles p ON p.id = rj.client_id
   WHERE rj.id = NEW.recurring_job_id;

  IF NOT FOUND OR rj_record.tradie_id IS NULL THEN
    RETURN NEW;
  END IF;
  IF rj_record.auto_invoice IS TRUE OR rj_record.is_active IS NOT TRUE THEN
    RETURN NEW;
  END IF;

  -- Idempotency: do not double-notify for the same session
  IF EXISTS (
    SELECT 1 FROM notifications
     WHERE user_id = rj_record.tradie_id
       AND type = 'invoice_ready'
       AND metadata->>'session_id' = NEW.id::text
  ) THEN
    RETURN NEW;
  END IF;

  service_label := COALESCE(NULLIF(rj_record.service_subtype, ''), NULLIF(rj_record.trade_category, ''), 'Recurring service');
  client_label := COALESCE(NULLIF(rj_record.client_name, ''), 'your client');

  INSERT INTO notifications (user_id, title, message, type, link, metadata)
  VALUES (
    rj_record.tradie_id,
    'Invoice ready to send',
    service_label || ' for ' || client_label || ' is complete - review and send the invoice to get paid.',
    'invoice_ready',
    '/work?tab=services',
    jsonb_build_object('recurring_job_id', rj_record.id, 'session_id', NEW.id)
  );

  RETURN NEW;
END;
$function$;

-- == 2. create_notification: hardened predicate (from 20260726240000) ========
-- DROP first -- see the 42P13 note in the header.

DROP FUNCTION IF EXISTS public.create_notification(uuid, text, text, text, text, boolean, text, uuid, jsonb);

CREATE OR REPLACE FUNCTION public.create_notification(p_user_id uuid, p_title text, p_message text, p_type text, p_channel text DEFAULT 'in_app'::text, p_read boolean DEFAULT false, p_link text DEFAULT NULL::text, p_job_id uuid DEFAULT NULL::uuid, p_metadata jsonb DEFAULT NULL::jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_caller        uuid := auth.uid();
  v_id            uuid;
  v_recur_id      uuid;
  v_conv_id       uuid;
  v_is_authorized boolean := false;
  v_jwt_role      text := '';
  v_final_meta    jsonb;
BEGIN
  BEGIN
    v_jwt_role := COALESCE(current_setting('request.jwt.claims', true)::jsonb->>'role', '');
  EXCEPTION WHEN OTHERS THEN
    v_jwt_role := '';
  END;

  IF v_jwt_role = 'service_role' THEN
    v_is_authorized := true;
  ELSIF v_caller IS NULL AND v_jwt_role = '' THEN
    v_is_authorized := true;
  ELSIF v_caller IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '42501';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM auth.users WHERE id = p_user_id) THEN
    RAISE EXCEPTION 'Target user does not exist' USING ERRCODE = '23514';
  END IF;

  IF NOT v_is_authorized THEN
    IF v_caller = p_user_id THEN
      v_is_authorized := true;
    END IF;

    IF NOT v_is_authorized AND EXISTS (
      SELECT 1 FROM public.profiles WHERE id = v_caller AND (role = 'admin' OR is_admin = true)
    ) THEN
      v_is_authorized := true;
    END IF;

    IF NOT v_is_authorized AND p_job_id IS NOT NULL THEN
      IF EXISTS (
        SELECT 1 FROM public.jobs j
        WHERE j.id = p_job_id
          AND (
            (
              j.client_id = v_caller
              AND (
                j.tradie_id = p_user_id
                OR EXISTS (SELECT 1 FROM public.quotes q WHERE q.job_id = j.id AND q.tradie_id = p_user_id)
              )
            )
            OR (
              j.client_id = p_user_id
              AND (
                j.tradie_id = v_caller
                OR EXISTS (SELECT 1 FROM public.quotes q WHERE q.job_id = j.id AND q.tradie_id = v_caller)
              )
            )
          )
      ) THEN
        v_is_authorized := true;
      END IF;
    END IF;

    IF NOT v_is_authorized THEN
      IF EXISTS (
        SELECT 1 FROM public.profiles emp
        WHERE (emp.id = v_caller   AND emp.employer_id = p_user_id)
           OR (emp.id = p_user_id AND emp.employer_id = v_caller)
      ) THEN
        v_is_authorized := true;
      END IF;
    END IF;

    IF NOT v_is_authorized AND p_metadata IS NOT NULL AND p_metadata ? 'recurring_job_id' THEN
      BEGIN
        v_recur_id := (p_metadata->>'recurring_job_id')::uuid;
      EXCEPTION WHEN invalid_text_representation THEN
        v_recur_id := NULL;
      END;
      IF v_recur_id IS NOT NULL AND EXISTS (
        SELECT 1 FROM public.recurring_jobs rj
        WHERE rj.id = v_recur_id
          AND (
            (rj.client_id = v_caller AND (rj.tradie_id = p_user_id OR rj.tradie_id IS NULL))
            OR (rj.tradie_id = v_caller AND rj.client_id = p_user_id)
          )
      ) THEN
        v_is_authorized := true;
      END IF;
    END IF;

    IF NOT v_is_authorized AND p_metadata IS NOT NULL AND p_metadata ? 'conversation_id' THEN
      BEGIN
        v_conv_id := (p_metadata->>'conversation_id')::uuid;
      EXCEPTION WHEN invalid_text_representation THEN
        v_conv_id := NULL;
      END;
      IF v_conv_id IS NOT NULL AND EXISTS (
        SELECT 1
          FROM public.conversation_participants cp_caller
          JOIN public.conversation_participants cp_target
            ON cp_target.conversation_id = cp_caller.conversation_id
         WHERE cp_caller.conversation_id = v_conv_id
           AND cp_caller.user_id = v_caller
           AND cp_target.user_id = p_user_id
           AND cp_caller.left_at IS NULL
           AND cp_target.left_at IS NULL
      ) THEN
        v_is_authorized := true;
      END IF;
    END IF;

    IF NOT v_is_authorized THEN
      RAISE EXCEPTION 'Caller is not permitted to notify target user'
        USING ERRCODE = '42501',
              HINT = 'Notifications can only be sent between users with a shared job, recurring service, conversation, employment relationship, or to oneself.';
    END IF;
  END IF;

  v_final_meta := COALESCE(p_metadata, '{}'::jsonb);
  IF v_caller IS NOT NULL THEN
    v_final_meta := v_final_meta || jsonb_build_object('sender_id', v_caller::text);
  END IF;

  INSERT INTO public.notifications (
    user_id, title, message, type, channel, read, link, job_id, metadata
  )
  VALUES (
    p_user_id, p_title, p_message, p_type, p_channel, p_read, p_link, p_job_id, v_final_meta
  )
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$function$;


GRANT EXECUTE ON FUNCTION public.create_notification(uuid, text, text, text, text, boolean, text, uuid, jsonb) TO authenticated, service_role;

-- == 3. REVOKEs from the two migrations that could not replay ================
-- Trigger-only and privileged functions must not be directly executable by
-- anon or authenticated. Re-applying an existing REVOKE is a no-op.

REVOKE EXECUTE ON FUNCTION public.flip_job_to_three_stage_flow() FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.handle_quote_acceptance()       FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.handle_new_user()               FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.auto_complete_ended_projects()  FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.delete_old_declined_jobs()      FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.auto_assign_project_to_job()    FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.create_payment_request(p_job_id uuid, p_amount bigint)  FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.create_payment_request(p_job_id uuid, p_amount integer) FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.delete_user_account()                FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.employer_approve_member(member_id uuid) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.employer_decline_member(member_id uuid) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.employer_remove_member(member_id uuid)  FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.is_admin()                          FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.is_tradie_verified(p_user_id uuid)  FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.decrement_quote_count()           FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.increment_quote_count()           FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.notify_client_new_quote()         FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.notify_employer_new_application() FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.notify_tradie_invoice_ready()     FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.notify_tradies_on_new_job()       FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.schedule_reminder_on_completion() FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.notify_approaching_reminders()    FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.get_user_conversation_ids(uid uuid)               FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.is_conversation_creator(conv_id uuid, user_id uuid) FROM anon, public;
