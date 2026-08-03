-- Make jobs.budget_amount server-only on UPDATE.
--
-- Applied to production 2026-08-03 via MCP apply_migration (this file is the
-- repo record; the live ledger already carries version 20260803035934). The
-- SECURITY INVOKER correction below landed as a separate ledger entry,
-- 20260803040207, and is folded in here so a rebuild from this file alone
-- reproduces production.
--
-- The companion migration (20260803035919) stopped a client marking a variation
-- 'approved' without paying. This closes the other half of the same hole:
-- jobs_update_participant_or_tradie_contact lets the job's client UPDATE the
-- jobs row with no column restriction, so they could simply raise
-- budget_amount themselves and skip the variation entirely. The job is then
-- worth more than has been funded — precisely the state escrow exists to
-- prevent, and an AFSL problem, not just a bookkeeping one.
--
-- WHY A TRIGGER AND NOT A COLUMN GRANT
--
-- job_variations could be locked down with REVOKE UPDATE because no app role
-- should write it at all. That does not transfer here: `authenticated` needs
-- UPDATE on jobs for ordinary work, and jobs has 57 columns. Doing this with
-- REVOKE + GRANT UPDATE (col) would mean carrying a ~50-column allowlist
-- forever, where every future migration that adds a client-writable column
-- breaks silently until someone remembers to grant it. Wrong trade.
--
-- WHY A DENY-LIST OF ROLES, NOT AN ALLOW-LIST
--
-- Triggers fire for EVERY role, service_role included, so this has to let the
-- edge functions through. Under PostgREST current_user is the role from the
-- JWT, so naming the two browser roles is exact. An allow-list naming only
-- service_role would have been wrong: migrations and MCP connect as `postgres`,
-- so it would have locked out this file's own successors.
--
-- WHAT IS DELIBERATELY STILL ALLOWED
--
--  • INSERT. A budget on a 'pending' job is an advertised figure with no money
--    attached. All three legitimate browser writers insert at that status:
--    ClientServicesTab.tsx, ChatDrawer.tsx, recurringJobs.ts.
--  • Every server-side raise: applyPriceAdjustment on a settled variation,
--    adjust-quote-price, and the rest of the edge functions.
--
-- Scope note: this is UPDATE-only and status-agnostic. A search of src/ for
-- `.update({ … budget_amount … })` returns no matches at any status, so
-- narrowing to funded/in_progress/completed would add a condition that never
-- changes an outcome while leaving 'pending'→'accepted' open. Admins are not
-- exempted either — no admin screen edits this column, so an exemption would
-- widen the hole for nothing. If one is ever needed, it belongs in an edge
-- function on the service role.

-- SECURITY INVOKER, and that is load-bearing.
--
-- This was written SECURITY DEFINER first, copying the convention of the other
-- trigger functions on this table, and it was completely inert: inside a
-- SECURITY DEFINER function current_user is the function OWNER (postgres), so
-- `current_user IN ('authenticated','anon')` is never true and every browser
-- UPDATE sailed through. Caught by executing the probe rather than reading the
-- code — impersonating the job's own client with SET ROLE authenticated plus a
-- JWT claim raised the budget by $5000.
--
-- Invoker is also just correct: this function reads NEW/OLD and raises. It
-- needs no privileges of its own, and as invoker current_user is the caller's
-- role, which is the entire question being asked. Verified live afterwards:
-- authenticated → 42501, service_role → allowed, postgres → allowed.
CREATE OR REPLACE FUNCTION public.freeze_job_budget_amount()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
-- SET search_path is required by 20260226110121_fix_function_search_path_security,
-- which applies to invoker functions too.
SET search_path TO 'public'
AS $$
BEGIN
  IF current_user IN ('authenticated', 'anon') THEN
    -- 42501 = insufficient_privilege. PostgREST maps it to 403; without an
    -- explicit ERRCODE this surfaces as an opaque 500.
    RAISE EXCEPTION
      'A job''s budget can only change by approving a variation or adjusting the quote.'
      USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;

-- Column-scoped with a WHEN clause so it only fires on a real change, matching
-- trg_relocate_access_instructions — the existing BEFORE ... UPDATE OF trigger
-- on this same table.
DROP TRIGGER IF EXISTS trg_freeze_job_budget_amount ON public.jobs;
CREATE TRIGGER trg_freeze_job_budget_amount
  BEFORE UPDATE OF budget_amount ON public.jobs
  FOR EACH ROW
  WHEN (OLD.budget_amount IS DISTINCT FROM NEW.budget_amount)
  EXECUTE FUNCTION public.freeze_job_budget_amount();
