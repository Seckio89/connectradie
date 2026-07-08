/*
  # Jobs for off-app clients + shareable quote tokens

  1. `jobs`
    - New `client_contact_id` (uuid, FK client_contacts, nullable) — set when a job
      belongs to a tradie's CRM contact who ISN'T a ConnecTradie user.
    - `client_id` is now NULLABLE (was NOT NULL). A job belongs to EITHER a platform
      user (`client_id`) OR an off-app contact (`client_contact_id`) — enforced by a
      CHECK so a job can never have neither.

  2. `quotes`
    - `public_token` (uuid, nullable, unique) — unguessable token for the public
      "view & accept quote" page used when quoting an off-app client by email.
    - `sent_to_email` (text) — where the quote link was emailed.

  3. Security
    - New permissive RLS policy lets a tradie fully manage jobs tied to their OWN
      client contacts (tradie_id = auth.uid() AND the contact is theirs). Existing
      client-posting policies are unaffected (policies are OR'd).
    - The public quote page reads via a service-role edge function (token lookup),
      so no anonymous RLS is added here.
*/

-- jobs: off-app client support
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS client_contact_id uuid REFERENCES client_contacts(id) ON DELETE SET NULL;
ALTER TABLE jobs ALTER COLUMN client_id DROP NOT NULL;

ALTER TABLE jobs DROP CONSTRAINT IF EXISTS jobs_client_or_contact_check;
ALTER TABLE jobs ADD CONSTRAINT jobs_client_or_contact_check
  CHECK (client_id IS NOT NULL OR client_contact_id IS NOT NULL);

CREATE INDEX IF NOT EXISTS idx_jobs_client_contact
  ON jobs(client_contact_id) WHERE client_contact_id IS NOT NULL;

-- quotes: shareable public token for off-app email quotes
ALTER TABLE quotes ADD COLUMN IF NOT EXISTS public_token uuid;
ALTER TABLE quotes ADD COLUMN IF NOT EXISTS sent_to_email text;
CREATE UNIQUE INDEX IF NOT EXISTS idx_quotes_public_token
  ON quotes(public_token) WHERE public_token IS NOT NULL;

-- A tradie may manage jobs they created for their own CRM contacts.
DROP POLICY IF EXISTS "Tradies manage jobs for own contacts" ON jobs;
CREATE POLICY "Tradies manage jobs for own contacts"
  ON jobs
  FOR ALL
  TO authenticated
  USING (
    tradie_id = (select auth.uid())
    AND client_contact_id IN (SELECT id FROM client_contacts WHERE owner_id = (select auth.uid()))
  )
  WITH CHECK (
    tradie_id = (select auth.uid())
    AND client_contact_id IN (SELECT id FROM client_contacts WHERE owner_id = (select auth.uid()))
  );
