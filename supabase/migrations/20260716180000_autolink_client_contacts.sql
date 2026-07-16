-- ─────────────────────────────────────────────────────────────────────────────
-- Auto-link client_contacts to registered profiles by email.
--
-- Bug this fixes: a tradie sends a quote to an email that belongs to a real
-- ConnecTradie account, but the contact was never linked (linked_profile_id
-- stayed NULL) — so the job/quote only existed as an off-app email link and
-- never appeared in the recipient's own dashboard.
--
-- A BEFORE trigger keeps linked_profile_id in sync with the contact's email
-- (case-insensitive match against profiles.email), and a one-time backfill
-- links existing contacts. NewQuoteModal now uses linked_profile_id to set
-- jobs.client_id, so linked recipients get on-app delivery (escrow-payable).
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.link_client_contact_profile()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Recompute the link when the email is set/changed, or fill it when absent.
  -- An email pointing at no registered account clears a stale link.
  IF NEW.email IS NOT NULL AND btrim(NEW.email) <> '' THEN
    IF TG_OP = 'INSERT'
       OR NEW.email IS DISTINCT FROM OLD.email
       OR NEW.linked_profile_id IS NULL THEN
      SELECT p.id INTO NEW.linked_profile_id
      FROM public.profiles p
      WHERE lower(p.email) = lower(btrim(NEW.email))
      LIMIT 1;
    END IF;
  ELSE
    NEW.linked_profile_id := NULL;
  END IF;
  RETURN NEW;
END;
$$;

-- Trigger functions must not be user-callable (house rule).
REVOKE ALL ON FUNCTION public.link_client_contact_profile() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_link_client_contact_profile ON public.client_contacts;
CREATE TRIGGER trg_link_client_contact_profile
  BEFORE INSERT OR UPDATE OF email ON public.client_contacts
  FOR EACH ROW EXECUTE FUNCTION public.link_client_contact_profile();

-- One-time backfill for contacts created before the trigger existed.
UPDATE public.client_contacts cc
SET linked_profile_id = p.id
FROM public.profiles p
WHERE cc.linked_profile_id IS NULL
  AND cc.email IS NOT NULL
  AND lower(p.email) = lower(btrim(cc.email));

COMMENT ON FUNCTION public.link_client_contact_profile() IS
  'Keeps client_contacts.linked_profile_id in sync with the contact email (case-insensitive profiles.email match). Enables on-app delivery of quotes sent to registered users.';
