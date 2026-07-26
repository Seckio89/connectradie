-- Migration: revive_create_notification_predicate
-- Description:
--   Audit M1 + M2, shipped together because they are inseparable.
--
--   create_notification opened with:
--       IF current_user IN ('service_role','postgres','supabase_admin') THEN
--         v_is_authorized := true;
--   inside a SECURITY DEFINER function. current_user is the OWNER there, so this
--   was ALWAYS TRUE and the entire relationship predicate below it — every
--   branch, and the closing RAISE 42501 — was unreachable.
--
--   PROVED BY EXECUTION, not inference: as a non-admin, targeting an unrelated
--   user, with p_job_id NULL and no metadata, the call was ALLOWED. So M1 was
--   worse than the audit recorded: not "anyone can notify anyone via a throwaway
--   job" but anyone can notify anyone, full stop.
--
--   And M2's premise was FALSE. The six call sites the audit said were failing
--   with 42501 were not failing — nothing blocked them. Reviving the guard is
--   what would CREATE that failure, because the employer<->employee branch
--   genuinely was missing. Fixing M1 alone would have dead-ended new-tradie
--   onboarding. Hence one migration.
--
--   Three changes:
--     1. Service-role detection via the JWT role claim instead of current_user.
--        Internal callers (triggers/cron with no JWT at all) are still allowed —
--        anon does NOT hold EXECUTE on this function, so that is not a hole.
--     2. The shared-job branch is now two-sided in BOTH arms. The old first arm
--        was bare `j.client_id = v_caller` with no constraint on p_user_id.
--     3. New employer<->employee branch, in both directions, with NO
--        employer_status filter — the onboarding join notifies the employer while
--        still pending_approval, which is precisely when it is needed.
--
--   Verified against production in rolled-back transactions:
--     attack (no relationship)              BLOCKED 42501   (was ALLOWED)
--     M1 throwaway-job, unrelated target    BLOCKED 42501   (the actual hole)
--     self-notify                           ALLOWED
--     shared job, client -> tradie          ALLOWED
--     employee -> employer (pending)        ALLOWED  (onboarding join)
--     employer -> employee                  ALLOWED  (Team approve/decline/remove)

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
