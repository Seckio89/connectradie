-- Seed: licence_registers — the state licensing registers an admin opens to
-- confirm a tradie's licence by hand.
--
-- This file is the data source of record. The same rows are applied by
-- 20260904233142_create_licence_registers.sql so production gets them on
-- `supabase db push` (db push never runs seed files); re-run THIS file to refresh
-- URLs after they have been checked, it upserts on (state_code, register_name).
--
-- ⚠️ URL PATTERNS ARE UNVERIFIED. Every register below is recorded as its search
-- LANDING page with notes = 'manual search' — no register was confirmed to accept
-- a licence number in the URL, because the network this was written on could not
-- reach any of the state sites (all blocked at the egress proxy, 2026-09-04).
-- The brief says do not guess deep links, so none are guessed: the admin opens the
-- register and pastes the number shown on the review card. When a deep link is
-- confirmed, change lookup_url_template to include {{licence_number}} and clear
-- the 'manual search' note. Owner action item: docs/OWNER-TODO.md.
--
-- trade_categories values are the slugs from TRADE_CATEGORIES in
-- src/lib/tradeCategories.ts (what profiles.declared_trades and
-- tradie_details.trade_category actually store).

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
