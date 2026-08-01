-- D6 (audit finding #10) — tighten public reads, zero-behaviour-change proven.
-- Applied to production 2026-08-01 via MCP apply_migration (this file is the
-- repo record; the live ledger already carries version 20260801100807).
--
-- platform_config: was SELECTable by anon + authenticated ("Anyone can read
-- platform config", qual true). Verified 2026-08-01: no client-side code reads
-- it (src/ greps clean; only generated types + tests mention it), and every
-- real reader is an edge function passing a SERVICE-ROLE client to
-- feeContext.getMaterialsProcessingBps — service role bypasses RLS and grants,
-- so dropping app-role access cannot touch the money path. Fee configuration
-- is server business; scrapers don't need our basis points.
drop policy if exists "Anyone can read platform config" on public.platform_config;
revoke select on public.platform_config from anon, authenticated;

-- tradie_details: anon held a table-level SELECT grant but NO anon policy —
-- zero rows were visible, the grant was dead weight. It was also a trap: any
-- future anon SELECT policy would have instantly exposed every column
-- (subscription_tier, payout_speed_preference, ...). Revoking it makes
-- opening anon access a deliberate two-step (policy + explicit grant) for the
-- profiles-RLS project, which owns the real column-split design.
revoke select on public.tradie_details from anon;
