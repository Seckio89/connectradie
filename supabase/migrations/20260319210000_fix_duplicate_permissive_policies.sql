-- Fix: Multiple permissive policies on service_invoices and service_visits
-- The ALL policy overlaps with the SELECT policy for tradies, causing Postgres
-- to evaluate both and OR them together on every SELECT query.
-- Solution: replace ALL with specific INSERT/UPDATE/DELETE policies.

-- ═══════════════════════════════════════════════════════════════════
-- service_invoices
-- ═══════════════════════════════════════════════════════════════════

-- Drop the overlapping ALL policy
DROP POLICY IF EXISTS "Tradie can manage invoices" ON public.service_invoices;

-- Keep existing: "Agreement parties can view invoices" (SELECT for client + tradie)

-- Add specific write policies for tradie only
DROP POLICY IF EXISTS "Tradie can insert invoices" ON public.service_invoices;
CREATE POLICY "Tradie can insert invoices" ON public.service_invoices
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM service_agreements sa
      WHERE sa.id = service_invoices.agreement_id
        AND sa.tradie_id = (SELECT auth.uid())
    )
  );

DROP POLICY IF EXISTS "Tradie can update invoices" ON public.service_invoices;
CREATE POLICY "Tradie can update invoices" ON public.service_invoices
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM service_agreements sa
      WHERE sa.id = service_invoices.agreement_id
        AND sa.tradie_id = (SELECT auth.uid())
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM service_agreements sa
      WHERE sa.id = service_invoices.agreement_id
        AND sa.tradie_id = (SELECT auth.uid())
    )
  );

DROP POLICY IF EXISTS "Tradie can delete invoices" ON public.service_invoices;
CREATE POLICY "Tradie can delete invoices" ON public.service_invoices
  FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM service_agreements sa
      WHERE sa.id = service_invoices.agreement_id
        AND sa.tradie_id = (SELECT auth.uid())
    )
  );

-- ═══════════════════════════════════════════════════════════════════
-- service_visits
-- ═══════════════════════════════════════════════════════════════════

-- Drop the overlapping ALL policy
DROP POLICY IF EXISTS "Tradie can manage visits" ON public.service_visits;

-- Keep existing: "Agreement parties can view visits" (SELECT for client + tradie)

-- Add specific write policies for tradie only
DROP POLICY IF EXISTS "Tradie can insert visits" ON public.service_visits;
CREATE POLICY "Tradie can insert visits" ON public.service_visits
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM service_agreements sa
      WHERE sa.id = service_visits.agreement_id
        AND sa.tradie_id = (SELECT auth.uid())
    )
  );

DROP POLICY IF EXISTS "Tradie can update visits" ON public.service_visits;
CREATE POLICY "Tradie can update visits" ON public.service_visits
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM service_agreements sa
      WHERE sa.id = service_visits.agreement_id
        AND sa.tradie_id = (SELECT auth.uid())
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM service_agreements sa
      WHERE sa.id = service_visits.agreement_id
        AND sa.tradie_id = (SELECT auth.uid())
    )
  );

DROP POLICY IF EXISTS "Tradie can delete visits" ON public.service_visits;
CREATE POLICY "Tradie can delete visits" ON public.service_visits
  FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM service_agreements sa
      WHERE sa.id = service_visits.agreement_id
        AND sa.tradie_id = (SELECT auth.uid())
    )
  );
