-- Migration: create_licence_registers
-- Type: Public-read reference table
-- Description: The state licensing registers an admin opens to confirm a trade
-- licence by hand. One row per (state, register); trade_categories lists the
-- trade slugs it covers; lookup_url_template is the page to open, with
-- {{licence_number}} substituted where a register supports a deep link.
--
-- Reference data: readable by every authenticated user (the tradie's licence step
-- shows which register their state uses), writable only by service_role.
--
-- Seed data lives in supabase/seed/licence_registers.sql and is applied here too,
-- idempotently, because `supabase db push` never runs seed files. Edit the seed
-- file, not this migration, when a URL changes; then re-run the seed file.

-- ============================================================
-- 1. CREATE TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS public.licence_registers (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  state_code          TEXT NOT NULL,                 -- NSW, QLD, VIC, WA, SA, TAS, ACT, NT
  register_name       TEXT NOT NULL,                 -- e.g. 'NSW Fair Trading licence check'
  trade_categories    TEXT[] NOT NULL,               -- TRADE_CATEGORIES slugs (src/lib/tradeCategories.ts)
  lookup_url_template TEXT NOT NULL,                 -- 'https://.../?licenceNumber={{licence_number}}' or a landing page
  notes               TEXT,                          -- 'manual search' when there is no deep link
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT licence_registers_state_code_check CHECK (
    state_code IN ('NSW', 'VIC', 'QLD', 'WA', 'SA', 'TAS', 'ACT', 'NT')
  ),
  CONSTRAINT licence_registers_state_name_key UNIQUE (state_code, register_name)
);

COMMENT ON TABLE public.licence_registers IS
  'State licensing registers for manual licence confirmation — reference data, read-only for authenticated users, seeded from supabase/seed/licence_registers.sql.';
COMMENT ON COLUMN public.licence_registers.lookup_url_template IS
  'Contains {{licence_number}} where the register supports a deep link; otherwise the search landing page and notes = ''manual search''.';

-- ============================================================
-- 2. ENABLE RLS
-- ============================================================
ALTER TABLE public.licence_registers ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- 3. RLS POLICIES
-- ============================================================

-- SELECT: all authenticated users. Nothing private in a list of government URLs.
DROP POLICY IF EXISTS "licence_registers_select_all" ON public.licence_registers;
CREATE POLICY "licence_registers_select_all"
  ON public.licence_registers
  FOR SELECT
  TO authenticated
  USING (true);

-- No INSERT/UPDATE/DELETE policies for authenticated users.
-- Only service_role (seed file, migrations) can write.

-- ============================================================
-- 4. INDEXES
-- ============================================================
-- extract-licence resolves the register by state + trade membership.
CREATE INDEX IF NOT EXISTS idx_licence_registers_state_code
  ON public.licence_registers (state_code);
CREATE INDEX IF NOT EXISTS idx_licence_registers_trades
  ON public.licence_registers USING GIN (trade_categories);

-- ============================================================
-- 5. SEED — identical to supabase/seed/licence_registers.sql
-- ============================================================
-- ⚠️ Every URL is a LANDING page marked 'manual search': the state sites were
-- unreachable from the network this was written on, so no deep link was
-- confirmed and, per the brief, none is guessed. See the seed file header.
INSERT INTO public.licence_registers (state_code, register_name, trade_categories, lookup_url_template, notes)
VALUES
  -- New South Wales
  ('NSW', 'NSW Fair Trading licence check',
   ARRAY['builder','bathroom-renovator','kitchen-renovator','roofer','bricklayer','waterproofing','pool-builder','demolition','scaffolder','carpenter','tiler','painter','plasterer','flooring','fencer','glazier','air-conditioning','hvac','hot-water-service','electrician','plumber','solar','fire-safety'],
   'https://verify.licence.nsw.gov.au/home',
   'manual search'),
  ('NSW', 'NSW Fair Trading security licence check',
   ARRAY['security','locksmith'],
   'https://www.police.nsw.gov.au/online_services/security_licence_check',
   'manual search'),
  ('NSW', 'NSW EPA pest management licence',
   ARRAY['pest-control'],
   'https://www.epa.nsw.gov.au/licensing-and-regulation/licensing/pesticides-licences',
   'manual search'),

  -- Queensland
  ('QLD', 'QBCC licensee search',
   ARRAY['builder','bathroom-renovator','kitchen-renovator','roofer','bricklayer','waterproofing','pool-builder','demolition','carpenter','tiler','painter','plasterer','flooring','fencer','glazier','air-conditioning','hvac','hot-water-service','plumber','solar','fire-safety','pest-control'],
   'https://www.onlineservices.qbcc.qld.gov.au/OnlineLicenceSearch/VisualElements/SearchBSALicenseeContent.aspx',
   'manual search'),
  ('QLD', 'Electrical Safety Office licence search',
   ARRAY['electrician','solar','security'],
   'https://www.worksafe.qld.gov.au/licensing-and-registrations/electrical-licences/electrical-licence-search',
   'manual search'),
  ('QLD', 'Queensland Police security licence check',
   ARRAY['security','locksmith'],
   'https://www.police.qld.gov.au/security-industry',
   'manual search'),

  -- Victoria
  ('VIC', 'Victorian Building Authority find a practitioner',
   ARRAY['builder','bathroom-renovator','kitchen-renovator','roofer','bricklayer','waterproofing','pool-builder','demolition','scaffolder','carpenter','tiler','painter','plasterer','flooring','fencer','glazier','plumber','hot-water-service','air-conditioning','hvac','fire-safety'],
   'https://www.vba.vic.gov.au/tools/find-practitioner',
   'manual search'),
  ('VIC', 'Energy Safe Victoria licence holder search',
   ARRAY['electrician','solar','security'],
   'https://www.esv.vic.gov.au/licensing-coes/electricians/find-licence-holder',
   'manual search'),

  -- Western Australia
  ('WA', 'WA Building and Energy licence search',
   ARRAY['builder','bathroom-renovator','kitchen-renovator','painter','plumber','hot-water-service','electrician','solar','air-conditioning','hvac'],
   'https://www.commerce.wa.gov.au/building-and-energy/licence-and-registration-search',
   'manual search'),

  -- South Australia
  ('SA', 'SA Consumer and Business Services licence register',
   ARRAY['builder','bathroom-renovator','kitchen-renovator','roofer','bricklayer','waterproofing','pool-builder','demolition','carpenter','tiler','painter','plasterer','flooring','fencer','glazier','plumber','hot-water-service','electrician','solar','air-conditioning','hvac','security','locksmith'],
   'https://secure.cbs.sa.gov.au/OccLicPubReg/LicenceSearch.php',
   'manual search'),

  -- Tasmania
  ('TAS', 'TAS Consumer, Building and Occupational Services licence search',
   ARRAY['builder','bathroom-renovator','kitchen-renovator','roofer','bricklayer','waterproofing','pool-builder','demolition','carpenter','tiler','painter','plasterer','flooring','fencer','glazier','plumber','hot-water-service','electrician','solar','air-conditioning','hvac','security'],
   'https://www.cbos.tas.gov.au/topics/licensing-and-registration/search-licensed-occupations',
   'manual search'),

  -- Australian Capital Territory
  ('ACT', 'Access Canberra construction occupations public register',
   ARRAY['builder','bathroom-renovator','kitchen-renovator','roofer','bricklayer','waterproofing','pool-builder','demolition','plumber','hot-water-service','electrician','solar','air-conditioning','hvac'],
   'https://www.accesscanberra.act.gov.au/s/public-registers',
   'manual search'),

  -- Northern Territory
  ('NT', 'NT Building Practitioners Board register',
   ARRAY['builder','bathroom-renovator','kitchen-renovator','roofer','bricklayer','waterproofing','pool-builder','demolition','plumber','hot-water-service','air-conditioning','hvac'],
   'https://nt.gov.au/industry/building/building-practitioners/find-a-registered-building-practitioner',
   'manual search'),
  ('NT', 'NT Electrical Workers and Contractors Licensing Board register',
   ARRAY['electrician','solar'],
   'https://nt.gov.au/industry/licences/electrical-workers-and-contractors-licences',
   'manual search')
ON CONFLICT (state_code, register_name) DO UPDATE
  SET trade_categories    = EXCLUDED.trade_categories,
      lookup_url_template = EXCLUDED.lookup_url_template,
      notes               = EXCLUDED.notes;
