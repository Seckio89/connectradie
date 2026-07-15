-- Progressive onboarding: reveal the dashboard in stages instead of all at once.
--   1 = brand new (no basic info)      → welcome screen
--   2 = basic info done                → simplified 2-card dashboard
--   3 = first key action done          → full dashboard + getting-started card
--   4 = fully onboarded                → full dashboard, no card
-- The staged flow runs AFTER the existing /onboarding wizard (which sets role,
-- trade and onboarding_completed); it only governs the dashboard experience.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS onboarding_stage integer NOT NULL DEFAULT 1;

-- Backfill: existing users who already finished onboarding or have any real
-- activity are fully onboarded — never drop them back into the staged flow.
UPDATE public.profiles p
SET onboarding_stage = 4
WHERE onboarding_stage = 1
  AND (
    p.onboarding_completed = true
    OR EXISTS (SELECT 1 FROM public.jobs j WHERE j.tradie_id = p.id OR j.client_id = p.id)
    OR EXISTS (SELECT 1 FROM public.client_contacts c WHERE c.owner_id = p.id)
    OR EXISTS (SELECT 1 FROM public.availability_slots a WHERE a.tradie_id = p.id)
  );

COMMENT ON COLUMN public.profiles.onboarding_stage IS
  'Progressive onboarding stage (1 welcome, 2 simplified, 3 almost-there, 4 full). Governs the dashboard reveal.';
