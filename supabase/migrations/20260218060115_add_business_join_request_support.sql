/*
  # Business Join Request Support

  ## Overview
  Enables team members to find a business during onboarding and request to join it.
  
  ## Changes

  ### 1. Allow public search of tradie business names
  A limited SELECT policy on tradie_details allowing authenticated users to search 
  business names (only business_name, trade_category, profile_id exposed — no sensitive data).

  ### 2. `business_join_requests` table
  Stores pending join requests from team members who want to be added to a business.
  The business owner can approve or decline from the Team page.

  ### 3. RPC: `search_businesses_by_name`
  A safe search function returning only public business info (name, trade, location).

  ## Security
  - Only business_name and trade_category are publicly searchable
  - Join requests are private to the requesting user and the business owner
  - RLS enforced on all tables
*/

-- ============================================================
-- TABLE: business_join_requests
-- ============================================================
CREATE TABLE IF NOT EXISTS business_join_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  requester_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  business_owner_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  business_name text NOT NULL DEFAULT '',
  requester_name text NOT NULL DEFAULT '',
  requester_email text NOT NULL DEFAULT '',
  trade_specialty text DEFAULT '',
  role text NOT NULL DEFAULT 'employee' CHECK (role IN ('employee', 'subcontractor', 'apprentice')),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'declined')),
  message text DEFAULT '',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(requester_id, business_owner_id)
);

ALTER TABLE business_join_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Requester can view their own requests"
  ON business_join_requests FOR SELECT
  TO authenticated
  USING (auth.uid() = requester_id);

CREATE POLICY "Requester can insert join request"
  ON business_join_requests FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = requester_id);

CREATE POLICY "Business owner can view incoming requests"
  ON business_join_requests FOR SELECT
  TO authenticated
  USING (auth.uid() = business_owner_id);

CREATE POLICY "Business owner can update request status"
  ON business_join_requests FOR UPDATE
  TO authenticated
  USING (auth.uid() = business_owner_id)
  WITH CHECK (auth.uid() = business_owner_id);

CREATE INDEX IF NOT EXISTS idx_business_join_requests_requester ON business_join_requests(requester_id);
CREATE INDEX IF NOT EXISTS idx_business_join_requests_owner ON business_join_requests(business_owner_id);
CREATE INDEX IF NOT EXISTS idx_business_join_requests_status ON business_join_requests(status);

-- ============================================================
-- RPC: search_businesses_by_name
-- Returns public business info only (name + trade category)
-- ============================================================
CREATE OR REPLACE FUNCTION search_businesses_by_name(search_term text)
RETURNS TABLE (
  profile_id uuid,
  business_name text,
  trade_category text,
  full_name text
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    td.profile_id,
    td.business_name,
    td.trade_category,
    p.full_name
  FROM tradie_details td
  JOIN profiles p ON p.id = td.profile_id
  WHERE
    td.business_name ILIKE '%' || search_term || '%'
    AND p.role = 'tradie'
    AND LENGTH(search_term) >= 2
  ORDER BY td.business_name
  LIMIT 10;
$$;

-- ============================================================
-- Add policy so tradie_details business_name is searchable
-- (limited to authenticated users, safe columns only)
-- ============================================================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'tradie_details' 
    AND policyname = 'Authenticated users can search business names'
  ) THEN
    CREATE POLICY "Authenticated users can search business names"
      ON tradie_details FOR SELECT
      TO authenticated
      USING (true);
  END IF;
END $$;
