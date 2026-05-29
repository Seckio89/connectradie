-- Close the notifications phishing surface.
--
-- Before: the table had an INSERT RLS policy `Authenticated users can insert
-- notifications` with `WITH CHECK (true)`. Any authenticated user could write
-- a notification row addressed to any other user — perfect for in-app
-- phishing ("Your payout failed — click here") since the message renders in
-- your own UI.
--
-- After: direct INSERT is REVOKED from anon and authenticated. The only path
-- to create a notification is the SECURITY DEFINER `create_notification` RPC,
-- which validates auth and target user existence and is the same path now
-- used by every call site in src/ (notificationService, recurringJobs, and
-- the ~15 frontend pages and components that previously inserted directly).
--
-- The "Authenticated users can insert notifications" RLS policy is also
-- dropped — keeping it would create a misleading appearance of openness even
-- though the grant revoke would block it.

REVOKE INSERT ON public.notifications FROM anon, authenticated, public;

DROP POLICY IF EXISTS "Authenticated users can insert notifications" ON public.notifications;

-- Restore EXECUTE on create_notification for authenticated callers (it was
-- locked down in the earlier security_critical_revokes migration). Now that
-- every direct INSERT is gone, this RPC IS the notification path.
GRANT EXECUTE ON FUNCTION public.create_notification(
  p_user_id uuid,
  p_title text,
  p_message text,
  p_type text,
  p_channel text,
  p_read boolean,
  p_link text,
  p_job_id uuid,
  p_metadata jsonb
) TO authenticated;
