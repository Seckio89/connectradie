/*
  # Make tradie_id nullable and add leads browsing policy

  1. Modified Tables
    - `jobs`
      - `tradie_id` changed from NOT NULL to nullable (allows unassigned leads)

  2. Security Changes
    - New SELECT policy: "Tradies can browse pending leads"
      - Allows authenticated tradies to see pending jobs where tradie_id IS NULL
      - This enables the lead marketplace where tradies discover new work

  3. Important Notes
    - Existing jobs with tradie_id set are unaffected
    - Only pending jobs without a tradie assigned are visible to all tradies
    - Clients can still only see their own jobs via existing policy
*/

ALTER TABLE jobs ALTER COLUMN tradie_id DROP NOT NULL;

CREATE POLICY "Tradies can browse pending leads"
  ON jobs FOR SELECT
  TO authenticated
  USING (
    tradie_id IS NULL
    AND status = 'pending'
    AND EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'tradie'
    )
  );
