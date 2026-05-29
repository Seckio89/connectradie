-- Backfill: convert historical public-URL values to in-bucket paths so the
-- buckets can be flipped private without breaking display.
--
-- Affected columns:
--   public.profiles.documents_url   (text[]) — verification documents (bucket: documents)
--   public.jobs.images_url          (text[]) — job photos (bucket: job-attachments)
--
-- Pattern matched:
--   https://<anything>.supabase.co/storage/v1/object/public/<bucket>/<path>
--   https://<anything>.supabase.co/storage/v1/object/sign/<bucket>/<path>?token=...
--
-- Values that are already paths pass through unchanged (the regex won't match).
-- Idempotent: safe to re-run.

CREATE OR REPLACE FUNCTION public._strip_storage_url_to_path(value text, bucket text)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  public_marker text := '/storage/v1/object/public/' || bucket || '/';
  sign_marker   text := '/storage/v1/object/sign/'   || bucket || '/';
  idx int;
  remainder text;
  q int;
BEGIN
  IF value IS NULL OR length(value) = 0 THEN RETURN value; END IF;
  IF position('http' in value) <> 1 THEN RETURN value; END IF;

  idx := position(public_marker in value);
  IF idx > 0 THEN
    remainder := substring(value FROM idx + length(public_marker));
    q := position('?' in remainder);
    IF q > 0 THEN
      RETURN substring(remainder FROM 1 FOR q - 1);
    END IF;
    RETURN remainder;
  END IF;

  idx := position(sign_marker in value);
  IF idx > 0 THEN
    remainder := substring(value FROM idx + length(sign_marker));
    q := position('?' in remainder);
    IF q > 0 THEN
      RETURN substring(remainder FROM 1 FOR q - 1);
    END IF;
    RETURN remainder;
  END IF;

  RETURN value;
END;
$$;

-- profiles.documents_url (bucket: documents)
UPDATE public.profiles
SET documents_url = (
  SELECT array_agg(public._strip_storage_url_to_path(v, 'documents'))
  FROM unnest(documents_url) AS v
)
WHERE documents_url IS NOT NULL
  AND array_length(documents_url, 1) > 0
  AND EXISTS (
    SELECT 1 FROM unnest(documents_url) AS v
    WHERE v LIKE 'http%'
  );

-- jobs.images_url (bucket: job-attachments)
UPDATE public.jobs
SET images_url = (
  SELECT array_agg(public._strip_storage_url_to_path(v, 'job-attachments'))
  FROM unnest(images_url) AS v
)
WHERE images_url IS NOT NULL
  AND array_length(images_url, 1) > 0
  AND EXISTS (
    SELECT 1 FROM unnest(images_url) AS v
    WHERE v LIKE 'http%'
  );

-- Drop the helper — it served its one-time purpose. Re-add if a later
-- migration needs the same logic.
DROP FUNCTION public._strip_storage_url_to_path(text, text);
