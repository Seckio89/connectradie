-- Migration: create_credential_types
-- Type: Public-read reference table
-- Description: The catalogue of credentials a worker can hold — tickets, checks,
-- licences and insurances. Reference data: seeded here, read by every authenticated
-- user, writable only by service_role.

-- ============================================================
-- 1. CREATE TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS public.credential_types (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code              TEXT NOT NULL UNIQUE,
  label             TEXT NOT NULL,
  category          TEXT NOT NULL,
  -- NULL means "applies to every trade". Values are the lowercase slugs from
  -- ALL_TRADES in src/lib/licensingRequirements.ts (e.g. 'electrician'), which is
  -- what profiles.declared_trades and tradie_details.trade_category actually store.
  applies_to_trades TEXT[],
  -- Deviation from the brief, which specified CHAR(3): bpchar is BLANK-PADDED, so
  -- 'WA' would round-trip to the client as 'WA ' and silently fail every JS
  -- comparison against the 2-char state codes the app already uses. TEXT + CHECK
  -- also matches the repo convention.
  state             TEXT,
  requires_expiry   BOOLEAN NOT NULL DEFAULT true,
  requires_document BOOLEAN NOT NULL DEFAULT true,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT credential_types_category_check CHECK (category IN (
    'right_to_work', 'background_check', 'safety', 'trade_licence', 'insurance'
  )),
  CONSTRAINT credential_types_state_check CHECK (
    state IS NULL OR state IN ('NSW', 'VIC', 'QLD', 'WA', 'SA', 'TAS', 'ACT', 'NT')
  )
);

COMMENT ON TABLE public.credential_types IS
  'Reference catalogue of worker credentials — read-only for authenticated users, seeded and maintained by service_role only.';
COMMENT ON COLUMN public.credential_types.applies_to_trades IS
  'NULL = applies to all trades. Otherwise lowercase trade slugs matching ALL_TRADES in src/lib/licensingRequirements.ts.';
COMMENT ON COLUMN public.credential_types.requires_document IS
  'False where collecting evidence would mean storing identity documents we deliberately do not hold (see right_to_work).';

-- ============================================================
-- 2. ENABLE RLS
-- ============================================================
ALTER TABLE public.credential_types ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- 3. RLS POLICIES
-- ============================================================

-- SELECT: every authenticated user. Reference data, no tenant scoping.
CREATE POLICY "credential_types_select_all_authenticated"
  ON public.credential_types
  FOR SELECT
  TO authenticated
  USING (true);

-- No INSERT / UPDATE / DELETE policies at all. service_role bypasses RLS, so
-- seeding still works while `authenticated` provably cannot write. Not granted to anon.

-- ============================================================
-- 4. INDEXES
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_credential_types_category ON public.credential_types (category);
CREATE INDEX IF NOT EXISTS idx_credential_types_state    ON public.credential_types (state) WHERE state IS NOT NULL;
-- Membership test for "which credentials does this trade need?"
CREATE INDEX IF NOT EXISTS idx_credential_types_trades   ON public.credential_types USING GIN (applies_to_trades);

-- ============================================================
-- 5. UPDATED_AT TRIGGER
-- ============================================================
CREATE OR REPLACE FUNCTION public.update_credential_types_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.update_credential_types_updated_at() FROM anon, authenticated, public;

DROP TRIGGER IF EXISTS trg_credential_types_updated_at ON public.credential_types;
CREATE TRIGGER trg_credential_types_updated_at
  BEFORE UPDATE ON public.credential_types
  FOR EACH ROW
  EXECUTE FUNCTION public.update_credential_types_updated_at();

-- ============================================================
-- 6. SEED — first release
-- ============================================================
-- The four all-trade rows below are the cleaning beachhead: White Card,
-- right-to-work, police check and WWCC are the entire compliance surface a
-- cleaning business needs. Everything else is additive.

INSERT INTO public.credential_types (code, label, category, applies_to_trades, state, requires_expiry, requires_document)
VALUES
  -- Safety. A White Card does not expire in any Australian jurisdiction.
  ('white_card', 'White Card (Construction Induction)', 'safety', NULL, NULL, false, true),

  -- Right to work. requires_document = FALSE is deliberate and load-bearing: we record
  -- that the check passed and when it lapses, never the visa grant notice, subclass,
  -- or any government ID number behind it.
  ('right_to_work', 'Right to Work Verified', 'right_to_work', NULL, NULL, true, false),

  -- Background checks.
  ('police_check', 'National Police Check', 'background_check', NULL, NULL, true, true),

  -- Insurance.
  ('public_liability', 'Public Liability Insurance', 'insurance', NULL, NULL, true, true)
ON CONFLICT (code) DO NOTHING;

-- Working With Children Check — a separate instrument in each state/territory.
INSERT INTO public.credential_types (code, label, category, applies_to_trades, state, requires_expiry, requires_document)
SELECT
  'wwcc_' || s,
  'Working With Children Check (' || s || ')',
  'background_check',
  NULL,
  s,
  true,
  true
FROM unnest(ARRAY['NSW', 'VIC', 'QLD', 'WA', 'SA', 'TAS', 'ACT', 'NT']) AS s
ON CONFLICT (code) DO NOTHING;

-- Per-state specialist trade licences. Both trades are in ALWAYS_LICENSED_TRADES —
-- a licence is required in every state regardless of contract value.
INSERT INTO public.credential_types (code, label, category, applies_to_trades, state, requires_expiry, requires_document)
SELECT
  t.code_prefix || '_licence_' || s,
  t.label_prefix || ' Licence (' || s || ')',
  'trade_licence',
  ARRAY[t.trade_slug],
  s,
  true,
  true
FROM unnest(ARRAY['NSW', 'VIC', 'QLD', 'WA', 'SA', 'TAS', 'ACT', 'NT']) AS s
CROSS JOIN (VALUES
  ('electrical', 'Electrical', 'electrician'),
  ('plumbing',   'Plumbing',   'plumber')
) AS t(code_prefix, label_prefix, trade_slug)
ON CONFLICT (code) DO NOTHING;
