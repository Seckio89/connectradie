-- Close the residual phishing surface on create_notification.
--
-- The earlier lockdown migration revoked direct INSERT on the notifications
-- table and routed all sites through the SECURITY DEFINER create_notification
-- RPC. But the RPC only validated that the caller was authenticated and the
-- target user existed — it did NOT check that the caller was permitted to
-- notify the target. Result: any logged-in user could still spam any other
-- user's notification feed (e.g. fake "Your payout failed" messages).
--
-- This migration replaces the function body with a relationship predicate:
-- the caller may notify the target only when at least one of the following
-- legitimate relationships holds (every notification site in src/ falls into
-- one of these):
--
--   1. Self-notify (caller IS the target).
--   2. Caller is an admin.
--   3. There's a shared job (p_job_id):
--        a. Caller is the job's client — they may notify any user about it
--           (clients legitimately push notifications to invited/saved tradies).
--        b. Caller is the job's assigned tradie OR a tradie with a quote on
--           the job, AND the target is the job's client.
--   4. There's a shared recurring_job (p_metadata->>'recurring_job_id'):
--        Both caller and target are the client/tradie of that recurring job
--        (covers supply restock alerts and recurring-service updates).
--   5. There's a shared conversation (p_metadata->>'conversation_id'):
--        Both caller and target are participants (covers chat new_message).
--
-- All other cases RAISE — no silent drop. If a future code path needs a new
-- relationship type, extend the predicate explicitly rather than relaxing it.
--
-- The function also stamps the caller's uid into metadata.sender_id so audits
-- and any "From <user>" UI work cleanly; bypass for service_role/postgres
-- (cron jobs, admin scripts) so server-originated notifications still flow.

CREATE OR REPLACE FUNCTION public.create_notification(
  p_user_id   uuid,
  p_title     text,
  p_message   text,
  p_type      text,
  p_channel   text  DEFAULT 'in_app',
  p_read      boolean DEFAULT false,
  p_link      text  DEFAULT NULL,
  p_job_id    uuid  DEFAULT NULL,
  p_metadata  jsonb DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_caller        uuid := auth.uid();
  v_id            uuid;
  v_recur_id      uuid;
  v_conv_id       uuid;
  v_is_authorized boolean := false;
  v_final_meta    jsonb;
BEGIN
  -- service_role / postgres / supabase_admin (cron, edge functions, admin
  -- scripts) bypass the relationship check. They authenticate via the
  -- service key and must already trust their own callers.
  IF current_user IN ('service_role', 'postgres', 'supabase_admin') THEN
    v_is_authorized := true;
  ELSE
    IF v_caller IS NULL THEN
      RAISE EXCEPTION 'Not authenticated'
        USING ERRCODE = '42501';
    END IF;
  END IF;

  -- Target must exist (covers typos and stale ids).
  IF NOT EXISTS (SELECT 1 FROM auth.users WHERE id = p_user_id) THEN
    RAISE EXCEPTION 'Target user does not exist'
      USING ERRCODE = '23514';
  END IF;

  -- ── Relationship checks (skipped if already authorized as service role) ──
  IF NOT v_is_authorized THEN
    -- 1. Self-notify.
    IF v_caller = p_user_id THEN
      v_is_authorized := true;
    END IF;

    -- 2. Admin.
    IF NOT v_is_authorized AND EXISTS (
      SELECT 1 FROM public.profiles WHERE id = v_caller AND role = 'admin'
    ) THEN
      v_is_authorized := true;
    END IF;

    -- 3. Shared job (via p_job_id).
    IF NOT v_is_authorized AND p_job_id IS NOT NULL THEN
      IF EXISTS (
        SELECT 1 FROM public.jobs j
        WHERE j.id = p_job_id
          AND (
            -- Caller owns the job — can notify anyone about it.
            j.client_id = v_caller
            OR (
              -- Caller is a tradie on the job; target is the client.
              j.client_id = p_user_id
              AND (
                j.tradie_id = v_caller
                OR EXISTS (
                  SELECT 1 FROM public.quotes q
                  WHERE q.job_id = j.id AND q.tradie_id = v_caller
                )
              )
            )
          )
      ) THEN
        v_is_authorized := true;
      END IF;
    END IF;

    -- 4. Shared recurring_job (via metadata.recurring_job_id).
    IF NOT v_is_authorized AND p_metadata IS NOT NULL
       AND p_metadata ? 'recurring_job_id' THEN
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

    -- 5. Shared conversation (via metadata.conversation_id).
    IF NOT v_is_authorized AND p_metadata IS NOT NULL
       AND p_metadata ? 'conversation_id' THEN
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
              HINT = 'Notifications can only be sent between users with a shared job, recurring service, conversation, or to oneself.';
    END IF;
  END IF;

  -- Stamp the sender so audits and any "From <user>" UI work. Bypass when
  -- there is no auth.uid() (service-role contexts).
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
$$;

-- Grants stay the same — authenticated may call (re-granted in the
-- 20260528270000 lockdown migration). Tighten anon explicitly to be sure.
REVOKE EXECUTE ON FUNCTION public.create_notification(
  uuid, text, text, text, text, boolean, text, uuid, jsonb
) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.create_notification(
  uuid, text, text, text, text, boolean, text, uuid, jsonb
) TO authenticated;
