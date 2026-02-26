/*
  # Fix RLS Part 2b - invoices and invoice_line_items
*/

-- invoices
DROP POLICY IF EXISTS "Users can view own invoices" ON public.invoices;
DROP POLICY IF EXISTS "Users can view invoices for their jobs" ON public.invoices;
DROP POLICY IF EXISTS "Users can create invoices" ON public.invoices;
DROP POLICY IF EXISTS "Users can update own invoices" ON public.invoices;
DROP POLICY IF EXISTS "Users can delete own invoices" ON public.invoices;

CREATE POLICY "Users can view own invoices" ON public.invoices
  FOR SELECT TO authenticated
  USING (created_by = (select auth.uid()));

CREATE POLICY "Users can view invoices for their jobs" ON public.invoices
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.jobs j
      WHERE j.id = job_id AND (j.client_id = (select auth.uid()) OR j.tradie_id = (select auth.uid()))
    )
  );

CREATE POLICY "Users can create invoices" ON public.invoices
  FOR INSERT TO authenticated
  WITH CHECK (created_by = (select auth.uid()));

CREATE POLICY "Users can update own invoices" ON public.invoices
  FOR UPDATE TO authenticated
  USING (created_by = (select auth.uid()))
  WITH CHECK (created_by = (select auth.uid()));

CREATE POLICY "Users can delete own invoices" ON public.invoices
  FOR DELETE TO authenticated
  USING (created_by = (select auth.uid()));

-- invoice_line_items
DROP POLICY IF EXISTS "Users can view line items for their invoices" ON public.invoice_line_items;
DROP POLICY IF EXISTS "Users can view line items for job-linked invoices" ON public.invoice_line_items;
DROP POLICY IF EXISTS "Users can create line items for own invoices" ON public.invoice_line_items;
DROP POLICY IF EXISTS "Users can update line items for own invoices" ON public.invoice_line_items;
DROP POLICY IF EXISTS "Users can delete line items for own invoices" ON public.invoice_line_items;

CREATE POLICY "Users can view line items for their invoices" ON public.invoice_line_items
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.invoices i WHERE i.id = invoice_id AND i.created_by = (select auth.uid())));

CREATE POLICY "Users can view line items for job-linked invoices" ON public.invoice_line_items
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.invoices i JOIN public.jobs j ON j.id = i.job_id
      WHERE i.id = invoice_id AND (j.client_id = (select auth.uid()) OR j.tradie_id = (select auth.uid()))
    )
  );

CREATE POLICY "Users can create line items for own invoices" ON public.invoice_line_items
  FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM public.invoices i WHERE i.id = invoice_id AND i.created_by = (select auth.uid())));

CREATE POLICY "Users can update line items for own invoices" ON public.invoice_line_items
  FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.invoices i WHERE i.id = invoice_id AND i.created_by = (select auth.uid())))
  WITH CHECK (EXISTS (SELECT 1 FROM public.invoices i WHERE i.id = invoice_id AND i.created_by = (select auth.uid())));

CREATE POLICY "Users can delete line items for own invoices" ON public.invoice_line_items
  FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.invoices i WHERE i.id = invoice_id AND i.created_by = (select auth.uid())));
