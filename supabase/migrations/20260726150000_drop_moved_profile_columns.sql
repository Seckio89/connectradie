-- Migration: drop_moved_profile_columns
-- Description:
--   The "contract" half of 20260726140000_move_location_and_push_secrets.sql.
--
--   ⚠ DO NOT APPLY UNTIL THE FRONTEND USING profile_private IS DEPLOYED.
--
--   The currently-deployed app writes profiles.base_latitude/base_longitude
--   directly (src/pages/Settings.tsx, src/pages/Onboarding.tsx,
--   src/components/onboarding/OnboardingWelcome.tsx) and reads
--   profiles.push_subscription (src/lib/notifications.ts). Dropping these
--   before that code ships turns every Settings/Onboarding save into a
--   PostgREST 42703.
--
--   Until this runs, base_latitude / base_longitude / push_subscription remain
--   readable by any signed-in user — the H1 leak is only fully closed here.
--
--   Data was copied to profile_private by the expand migration. Re-run the copy
--   first so anything written to the old columns in the interim is not lost.

INSERT INTO public.profile_private (profile_id, base_latitude, base_longitude, push_subscription)
SELECT id, base_latitude, base_longitude, push_subscription
FROM public.profiles
WHERE base_latitude IS NOT NULL
   OR base_longitude IS NOT NULL
   OR push_subscription IS NOT NULL
ON CONFLICT (profile_id) DO UPDATE SET
  base_latitude     = COALESCE(EXCLUDED.base_latitude,     public.profile_private.base_latitude),
  base_longitude    = COALESCE(EXCLUDED.base_longitude,    public.profile_private.base_longitude),
  push_subscription = COALESCE(EXCLUDED.push_subscription, public.profile_private.push_subscription);

ALTER TABLE public.profiles
  DROP COLUMN IF EXISTS base_latitude,
  DROP COLUMN IF EXISTS base_longitude,
  DROP COLUMN IF EXISTS push_subscription;
