-- Tidy the two genuinely-safe SECURITY DEFINER advisor WARNs:
--  - notify_matching_tradies_new_vacancy / notify_service_assignment are
--    trigger-only functions and should never be callable via RPC. The triggers
--    still fire — a trigger runs the function as the table owner regardless of
--    these EXECUTE grants.
--  - get_my_time_entries is worker-only; anon never needs it (keep authenticated).
--
-- Note: functions carry a default EXECUTE grant to PUBLIC, so revoking `anon`
-- alone is a no-op (anon inherits via PUBLIC). Revoke PUBLIC, then re-grant the
-- role that should keep access.
REVOKE EXECUTE ON FUNCTION public.notify_matching_tradies_new_vacancy() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.notify_service_assignment()          FROM PUBLIC, anon, authenticated;

REVOKE EXECUTE ON FUNCTION public.get_my_time_entries(date, date)      FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.get_my_time_entries(date, date)      TO authenticated;
