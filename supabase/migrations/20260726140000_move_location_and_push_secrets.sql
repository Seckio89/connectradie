-- Migration: move_location_and_push_secrets
-- Description:
--   PII-exposure fix (audit H1, second stage). Moves the two highest-harm
--   columns off `profiles` and into the owner-or-admin-only `profile_private`.
--
--   The live `profiles` SELECT policy is `auth.role() = 'authenticated'`, so
--   every signed-in user could read every row. Three cross-user WILDCARD embeds
--   made that concrete regardless of what any select list named:
--     src/pages/Messages.tsx:400              profile:profiles(*, is_admin)
--     src/components/ConversationSettingsModal.tsx:118  same
--     src/components/BookingRequestModal.tsx:72         profiles(*) x2
--
--   • base_latitude / base_longitude — a tradie's HOME BASE coordinates.
--     The worst item in the whole audit: not a credential, a physical-safety
--     problem. src/lib/notifications.ts:18 also read them for a whole list of
--     tradies straight from the browser.
--
--   • push_subscription — the Web Push endpoint + p256dh/auth keys.
--     src/lib/notifications.ts:288 selected it for EVERY tradie, and then used
--     it only to compute `pushEligible.length` (:309) — the function never
--     sends a push. All of that exposure bought a number.
--
--   Deliberately NOT moved in this migration: stripe_connect_account_id,
--   stripe_customer_id, stripe_identity_session_id, platform_fee_override_bps.
--   Those are ~38 call sites spread across the payment edge functions, and an
--   acct_/cus_ id is inert without the platform's secret key — a poor
--   risk/reward trade days from go-live. Tracked as remaining H1 work.

-- ── 1. profile_private gains the columns ─────────────────────────────────────
ALTER TABLE public.profile_private
  ADD COLUMN IF NOT EXISTS base_latitude     double precision,
  ADD COLUMN IF NOT EXISTS base_longitude    double precision,
  ADD COLUMN IF NOT EXISTS push_subscription jsonb;

-- ── 2. Carry the existing data across BEFORE dropping anything ───────────────
INSERT INTO public.profile_private (profile_id, base_latitude, base_longitude, push_subscription)
SELECT id, base_latitude, base_longitude, push_subscription
FROM public.profiles
WHERE base_latitude IS NOT NULL
   OR base_longitude IS NOT NULL
   OR push_subscription IS NOT NULL
ON CONFLICT (profile_id) DO UPDATE SET
  base_latitude     = EXCLUDED.base_latitude,
  base_longitude    = EXCLUDED.base_longitude,
  push_subscription = EXCLUDED.push_subscription;

-- ── 3. Admin write policies on profile_private ───────────────────────────────
--   20260725140000 gave profile_private an owner-or-admin SELECT but
--   owner-ONLY insert/update. Admin-side flows (and anything an admin has to
--   repair) would hit 42501. Closing that gap here, before more columns land.
DROP POLICY IF EXISTS "Admins can insert profile_private" ON public.profile_private;
CREATE POLICY "Admins can insert profile_private" ON public.profile_private
  FOR INSERT TO authenticated WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "Admins can update profile_private" ON public.profile_private;
CREATE POLICY "Admins can update profile_private" ON public.profile_private
  FOR UPDATE TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

-- ── 4. Public-safe presence flag for push ────────────────────────────────────
--   notifyTradiesForUrgentJob counts `push_enabled && push_subscription`. That
--   count is surfaced to the user (PostLead.tsx:561 -> setSmsResult), so the
--   semantics are preserved exactly rather than degraded to push_enabled alone.
--   Denormalised + trigger-maintained because a GENERATED column cannot read
--   another table.
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS has_push_subscription boolean NOT NULL DEFAULT false;

UPDATE public.profiles SET has_push_subscription = (push_subscription IS NOT NULL);

CREATE OR REPLACE FUNCTION public.sync_has_push_subscription()
  RETURNS trigger
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
AS $function$
BEGIN
  UPDATE public.profiles
     SET has_push_subscription = (NEW.push_subscription IS NOT NULL)
   WHERE id = NEW.profile_id;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_sync_has_push_subscription ON public.profile_private;
CREATE TRIGGER trg_sync_has_push_subscription
  AFTER INSERT OR UPDATE OF push_subscription ON public.profile_private
  FOR EACH ROW EXECUTE FUNCTION public.sync_has_push_subscription();

-- ── 5. Service-area filtering moves server-side ──────────────────────────────
--   filterTradiesByServiceArea() in src/lib/notifications.ts needs other
--   tradies' coordinates, which is precisely what must stop leaving the DB.
--   This RPC answers the question ("which of these tradies cover this point?")
--   without ever returning a coordinate. It only filters a caller-supplied id
--   list, so it discloses no membership the caller didn't already have.
--
--   Fails OPEN exactly like the JS it replaces, and that fidelity matters —
--   dropping a tradie here is a silent lead-delivery failure. Every
--   missing-data case KEEPS the tradie: no profiles row, job without
--   coordinates, tradie without coordinates. Note it is driven off
--   `unnest(p_tradie_ids)` with LEFT JOINs rather than
--   `WHERE p.id = ANY(p_tradie_ids)`, precisely so an id with no profiles row
--   survives (the JS did `if (!p ...) return true`).
--   Haversine, 6371 km earth radius, matching hooks/useGeolocation.ts.
CREATE OR REPLACE FUNCTION public.filter_tradies_by_service_area(
  p_tradie_ids uuid[],
  p_lat        double precision,
  p_lng        double precision
)
  RETURNS SETOF uuid
  LANGUAGE sql
  SECURITY DEFINER
  STABLE
  SET search_path TO 'public'
AS $function$
  SELECT t.id
  FROM unnest(p_tradie_ids) AS t(id)
  LEFT JOIN public.profiles        p  ON p.id = t.id
  LEFT JOIN public.profile_private pp ON pp.profile_id = t.id
  WHERE p.id IS NULL                                   -- no profile row -> keep
     OR p_lat IS NULL OR p_lng IS NULL                 -- job has no coords -> keep
     OR pp.base_latitude IS NULL                       -- tradie has no coords -> keep
     OR pp.base_longitude IS NULL
     OR (
          2 * 6371 * asin(sqrt(
            power(sin(radians(pp.base_latitude - p_lat) / 2), 2)
            + cos(radians(p_lat)) * cos(radians(pp.base_latitude))
              * power(sin(radians(pp.base_longitude - p_lng) / 2), 2)
          ))
        ) <= COALESCE(p.service_radius_km, 20);
$function$;

REVOKE EXECUTE ON FUNCTION public.filter_tradies_by_service_area(uuid[], double precision, double precision) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.filter_tradies_by_service_area(uuid[], double precision, double precision) TO authenticated, service_role;

-- ── 6. The DROP is deliberately NOT here ─────────────────────────────────────
--   This is the "expand" half of an expand/contract migration. The app is
--   already deployed and live: dropping profiles.base_latitude right now would
--   make the CURRENTLY-DEPLOYED frontend fail with 42703 on every Settings and
--   Onboarding save (both write the column directly), and silently disable the
--   urgent-job notify path. So the old columns stay until the new frontend is
--   live and reading/writing profile_private.
--
--   The contract half is 20260726150000_drop_moved_profile_columns.sql. Apply
--   it ONLY after the frontend that uses profile_private has been deployed.
--   Until then these columns are still world-readable and the leak is open.

COMMENT ON COLUMN public.profiles.has_push_subscription IS
  'Presence flag only. The subscription itself lives in profile_private.push_subscription.';
