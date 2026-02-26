/*
  # Create Invoices System

  1. New Tables
    - `invoices`
      - `id` (uuid, primary key)
      - `created_by` (uuid, references auth.users) - user who created the invoice
      - `job_id` (uuid, references jobs) - optional link to a job
      - `milestone_id` (uuid, references job_milestones) - optional link to a milestone
      - `milestone_subcontractor_id` (uuid, references milestone_subcontractors) - optional link
      - `business_name` (text) - issuing business name
      - `business_abn` (text) - ABN of the issuing business
      - `business_address` (text) - address of issuing business
      - `business_phone` (text) - phone of issuing business
      - `business_email` (text) - email of issuing business
      - `invoice_number` (text) - invoice number / reference
      - `invoice_date` (date) - date of invoice
      - `due_date` (date) - payment due date
      - `bill_to_name` (text) - who the invoice is addressed to
      - `bill_to_address` (text) - billing address
      - `subtotal` (numeric) - sum of line items before GST
      - `gst_amount` (numeric) - GST amount
      - `total_amount` (numeric) - total including GST
      - `notes` (text) - additional notes
      - `status` (text) - draft, sent, paid
      - `created_at` (timestamptz)
      - `updated_at` (timestamptz)

    - `invoice_line_items`
      - `id` (uuid, primary key)
      - `invoice_id` (uuid, references invoices)
      - `description` (text) - line item description
      - `quantity` (numeric) - quantity
      - `unit_price` (numeric) - price per unit
      - `amount` (numeric) - total for this line item
      - `sort_order` (integer) - display order
      - `created_at` (timestamptz)

  2. Security
    - Enable RLS on both tables
    - Users can CRUD their own invoices
    - Users can view invoices linked to their jobs
*/

CREATE TABLE IF NOT EXISTS invoices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_by uuid NOT NULL REFERENCES auth.users(id),
  job_id uuid REFERENCES jobs(id) ON DELETE SET NULL,
  milestone_id uuid REFERENCES job_milestones(id) ON DELETE SET NULL,
  milestone_subcontractor_id uuid REFERENCES milestone_subcontractors(id) ON DELETE SET NULL,
  business_name text NOT NULL DEFAULT '',
  business_abn text DEFAULT '',
  business_address text DEFAULT '',
  business_phone text DEFAULT '',
  business_email text DEFAULT '',
  invoice_number text NOT NULL DEFAULT '',
  invoice_date date NOT NULL DEFAULT CURRENT_DATE,
  due_date date,
  bill_to_name text DEFAULT '',
  bill_to_address text DEFAULT '',
  subtotal numeric NOT NULL DEFAULT 0 CHECK (subtotal >= 0),
  gst_amount numeric NOT NULL DEFAULT 0 CHECK (gst_amount >= 0),
  total_amount numeric NOT NULL DEFAULT 0 CHECK (total_amount >= 0),
  notes text DEFAULT '',
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'sent', 'paid')),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE invoices ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own invoices"
  ON invoices FOR SELECT
  TO authenticated
  USING (auth.uid() = created_by);

CREATE POLICY "Users can view invoices for their jobs"
  ON invoices FOR SELECT
  TO authenticated
  USING (
    job_id IN (
      SELECT id FROM jobs WHERE client_id = auth.uid() OR tradie_id = auth.uid()
    )
  );

CREATE POLICY "Users can create invoices"
  ON invoices FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = created_by);

CREATE POLICY "Users can update own invoices"
  ON invoices FOR UPDATE
  TO authenticated
  USING (auth.uid() = created_by)
  WITH CHECK (auth.uid() = created_by);

CREATE POLICY "Users can delete own invoices"
  ON invoices FOR DELETE
  TO authenticated
  USING (auth.uid() = created_by);

CREATE TABLE IF NOT EXISTS invoice_line_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id uuid NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  description text NOT NULL DEFAULT '',
  quantity numeric NOT NULL DEFAULT 1 CHECK (quantity > 0),
  unit_price numeric NOT NULL DEFAULT 0 CHECK (unit_price >= 0),
  amount numeric NOT NULL DEFAULT 0 CHECK (amount >= 0),
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE invoice_line_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view line items for their invoices"
  ON invoice_line_items FOR SELECT
  TO authenticated
  USING (
    invoice_id IN (
      SELECT id FROM invoices WHERE created_by = auth.uid()
    )
  );

CREATE POLICY "Users can view line items for job-linked invoices"
  ON invoice_line_items FOR SELECT
  TO authenticated
  USING (
    invoice_id IN (
      SELECT i.id FROM invoices i
      JOIN jobs j ON j.id = i.job_id
      WHERE j.client_id = auth.uid() OR j.tradie_id = auth.uid()
    )
  );

CREATE POLICY "Users can create line items for own invoices"
  ON invoice_line_items FOR INSERT
  TO authenticated
  WITH CHECK (
    invoice_id IN (
      SELECT id FROM invoices WHERE created_by = auth.uid()
    )
  );

CREATE POLICY "Users can update line items for own invoices"
  ON invoice_line_items FOR UPDATE
  TO authenticated
  USING (
    invoice_id IN (
      SELECT id FROM invoices WHERE created_by = auth.uid()
    )
  )
  WITH CHECK (
    invoice_id IN (
      SELECT id FROM invoices WHERE created_by = auth.uid()
    )
  );

CREATE POLICY "Users can delete line items for own invoices"
  ON invoice_line_items FOR DELETE
  TO authenticated
  USING (
    invoice_id IN (
      SELECT id FROM invoices WHERE created_by = auth.uid()
    )
  );
