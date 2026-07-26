-- Migration: public_profile_derived_columns
-- Description:
--   PII-exposure fix (audit H1, first stage).
--
--   The tradie search fetched raw PII for EVERY tradie in the result set and
--   then displayed almost none of it:
--     src/pages/Search.tsx:213         → id, full_name, email, phone, address, …
--     src/pages/PublicTradieProfile.tsx:72 → same
--
--   30 tradies per page, and the live `profiles` SELECT policy is
--   `auth.role() = 'authenticated'`, so any signed-in account could page the
--   whole directory and read every tradie's email, phone and street address
--   straight off the network tab. Of those three:
--     • `email`   was never referenced at all — pure over-fetch.
--     • `address` was only ever fed to extractSuburb() for a suburb chip.
--     • `phone`   was only ever tested for truthiness ("Contact via chat" and
--                 a profile-completeness point in searchRanking.ts:153).
--
--   So none of the raw values need to leave the database. These two GENERATED
--   columns expose exactly the derived facts the UI actually uses.
--
--   Generated (not backfilled) on purpose: `profiles.suburb` already exists but
--   is written only by the onboarding path — src/pages/Settings.tsx:379 updates
--   `address` WITHOUT touching `suburb`, so a backfilled column would silently
--   go stale the first time someone edited their address. A STORED generated
--   column is recomputed by Postgres on every write and cannot drift.
--
--   This does NOT fix the underlying row policy (any signed-in user can still
--   read every profile row) — that is the remaining part of H1.

-- SQL port of extractSuburb() from src/lib/contactGating.ts:12-34. Kept
-- deliberately literal, including the 0-based → 1-based index shift:
--   JS parts[len-2] → SQL p[len-1];  JS parts[len-3] → SQL p[len-2].
CREATE OR REPLACE FUNCTION public.extract_suburb(addr text)
  RETURNS text
  LANGUAGE sql
  IMMUTABLE
  SET search_path TO 'public'
AS $function$
  SELECT CASE
    WHEN addr IS NULL OR btrim(addr) = '' THEN ''
    ELSE (
      SELECT CASE
        WHEN array_length(p, 1) >= 2 THEN
          CASE
            WHEN p[array_length(p, 1) - 1] ~ '^[A-Z]{2,3}\s+\d{4}$'
                 AND array_length(p, 1) >= 3
              THEN p[array_length(p, 1) - 2]
            ELSE p[array_length(p, 1) - 1]
          END
        ELSE COALESCE(
          btrim((regexp_match(
            addr,
            '(.+?)\s+(?:NSW|VIC|QLD|SA|WA|TAS|NT|ACT)\s+\d{4}',
            'i'
          ))[1]),
          p[1]
        )
      END
      FROM (
        SELECT array(
          SELECT btrim(x) FROM unnest(string_to_array(addr, ',')) AS x
        ) AS p
      ) parts
    )
  END;
$function$;

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS public_suburb text
    GENERATED ALWAYS AS (public.extract_suburb(address)) STORED;

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS has_phone boolean
    GENERATED ALWAYS AS (phone IS NOT NULL AND phone <> '') STORED;

COMMENT ON COLUMN public.profiles.public_suburb IS
  'Derived suburb for public display. Select this instead of `address` in any cross-user query.';
COMMENT ON COLUMN public.profiles.has_phone IS
  'Whether a phone number is on file. Select this instead of `phone` when only presence is needed.';
