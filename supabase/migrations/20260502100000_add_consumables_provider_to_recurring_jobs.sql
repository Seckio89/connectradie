-- Disambiguate the supplies model: who's responsible for household consumables
-- (toilet paper, soap, dish liquid, etc.)? The tradie's working equipment
-- (vacuum, mop, chemicals) is implicit — that's just what trades bring — so the
-- only real question for the client is whether the tradie should restock the
-- household stuff and bill it back, or whether the client keeps it stocked.

ALTER TABLE recurring_jobs
  ADD COLUMN IF NOT EXISTS consumables_provider TEXT NOT NULL DEFAULT 'client'
    CHECK (consumables_provider IN ('client', 'tradie_billed'));

COMMENT ON COLUMN recurring_jobs.consumables_provider IS
  'Who provides household consumables (toilet paper, soap, etc.). ''client'' (default): client keeps them stocked. ''tradie_billed'': tradie buys and bills back via invoice. Tradie always brings their own working equipment regardless.';
