-- get_daily_profile_view_count took an arbitrary viewer_uuid and ran as
-- SECURITY DEFINER, so any signed-in user could read any other user's daily
-- profile-view count via /rest/v1/rpc/. Low severity — it is a counter, not
-- content — but it is a real cross-user read, and the Supabase security linter
-- flags the function as authenticated-executable.
--
-- The parameter is kept rather than dropped so no caller has to change:
-- src/pages/Search.tsx:171 is the only production caller and it already passes
-- its own user.id, so its behaviour is identical. A probe for someone else's id
-- now returns 0 instead of their real count.
CREATE OR REPLACE FUNCTION public.get_daily_profile_view_count(viewer_uuid uuid)
RETURNS integer
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT COALESCE(COUNT(*)::integer, 0)
  FROM profile_views
  WHERE viewer_id = viewer_uuid
    AND viewer_uuid = auth.uid()
    AND viewed_at >= CURRENT_DATE
    AND viewed_at < CURRENT_DATE + INTERVAL '1 day';
$function$;
