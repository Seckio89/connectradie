/*
  # Client contacts (tradie CRM for on- and off-app clients)

  1. New table `client_contacts`
    - A tradie's own address book of clients — including people who are NOT
      ConnecTradie users. Lets a tradie record previous/off-app clients, quote
      them by email, and assign workers to their jobs.
    - `owner_id` (uuid, FK profiles) — the tradie who owns this contact.
    - name / email / phone / address / suburb / state / postcode.
    - `latitude` / `longitude` — geocoded address (for service-area + geofencing).
    - `notes` (text) — freeform.
    - `linked_profile_id` (uuid, nullable) — set if the contact later signs up,
      so their off-app history can be connected to their real account.

  2. Security (RLS)
    - A tradie may fully manage ONLY their own contacts (owner_id = auth.uid()).
    - Contact PII is private to the owning tradie. (Assigned workers never read
      this table — they see gated job info, per the contact-gating decision.)

  3. Notes
    - Partial unique index prevents duplicate contacts by email per owner.
    - updated_at is maintained by the app on edit.
*/

CREATE TABLE IF NOT EXISTS client_contacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  full_name text NOT NULL,
  email text,
  phone text,
  address text,
  suburb text,
  state text,
  postcode text,
  latitude double precision,
  longitude double precision,
  notes text,
  linked_profile_id uuid REFERENCES profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_client_contacts_owner ON client_contacts(owner_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_client_contacts_owner_email
  ON client_contacts(owner_id, lower(email))
  WHERE email IS NOT NULL AND email <> '';

ALTER TABLE client_contacts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Owners manage own client contacts" ON client_contacts;
CREATE POLICY "Owners manage own client contacts"
  ON client_contacts
  FOR ALL
  TO authenticated
  USING (owner_id = (select auth.uid()))
  WITH CHECK (owner_id = (select auth.uid()));
