-- ─────────────────────────────────────────────────────────────────────────────
-- Booking a slot: make it work, and make a calendar clash refuse it.
--
-- THE BUG THIS FIXES. AvailabilityCalendar.tsx ran, as the CLIENT:
--
--   update availability_slots set status='booked', booked_by=<me> where id=...
--
-- but the UPDATE policy is `tradie_id = auth.uid()`. The client is not the
-- tradie, so it matched zero rows. PostgREST does not error on zero rows and the
-- call site never checked, so the page announced success and the slot stayed
-- open for the next client to take. Production bears this out exactly: 215
-- availability_slots, 215 of them 'available', 0 booked, 0 with booked_by set —
-- no slot has ever been successfully booked.
--
-- WHY AN RPC AND NOT A POLICY. A permissive UPDATE policy cannot express this.
-- WITH CHECK only sees the finished row, so a policy allowing
-- (status='booked' AND booked_by=auth.uid()) would also let a client shift
-- start_time or end_time on a stranger's slot in the same statement. It also
-- cannot lock, so two clients reading 'available' at the same moment would both
-- proceed. SELECT ... FOR UPDATE inside a definer function fixes both: the
-- column set is fixed by the function body, and concurrent callers serialise on
-- the row.
--
-- The identity comes from auth.uid() inside the function and is never a
-- parameter. 20260807053007 is the migration that had to go round every definer
-- RPC taking a caller-supplied identity and close it; this one does not open a
-- new one.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.book_availability_slot(p_slot_id uuid)
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_caller uuid := (SELECT auth.uid());
  v_slot   public.availability_slots%ROWTYPE;
BEGIN
  IF v_caller IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'not_signed_in');
  END IF;

  -- The lock is the point. Without it two clients both read 'available' and
  -- both go on to book.
  SELECT * INTO v_slot
  FROM public.availability_slots
  WHERE id = p_slot_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'not_found');
  END IF;

  IF v_slot.tradie_id = v_caller THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'own_slot');
  END IF;

  -- The calendar refusal. A slot the sync blocked because the tradie is
  -- committed elsewhere is not bookable by a client, whatever a stale page
  -- thinks it can see.
  IF v_slot.external_conflict_at IS NOT NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'calendar_conflict');
  END IF;

  IF v_slot.status IS DISTINCT FROM 'available' THEN
    RETURN jsonb_build_object(
      'ok', false,
      'reason', CASE WHEN v_slot.status = 'booked' THEN 'already_booked' ELSE 'unavailable' END
    );
  END IF;

  IF v_slot.start_time <= now() THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'in_the_past');
  END IF;

  UPDATE public.availability_slots
     SET status = 'booked',
         booked_by = v_caller
   WHERE id = p_slot_id;

  RETURN jsonb_build_object('ok', true, 'slot_id', p_slot_id);
END;
$function$;

REVOKE ALL ON FUNCTION public.book_availability_slot(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.book_availability_slot(uuid) TO authenticated;

COMMENT ON FUNCTION public.book_availability_slot(uuid) IS
  'Claims an availability slot for the calling client, atomically. Refuses a slot that is not available, is in the past, belongs to the caller, or carries external_conflict_at (a Google Calendar clash). Identity is auth.uid() and is never a parameter.';

-- ─────────────────────────────────────────────────────────────────────────────
-- Releasing a claim.
--
-- Claim-then-create means the claim can outlive a failed job insert. The client
-- cannot undo it — the UPDATE policy is the tradie's — so without this a
-- half-finished booking would strand the slot as booked forever. Scoped to a
-- claim the caller actually holds.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.release_availability_slot(p_slot_id uuid)
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_caller uuid := (SELECT auth.uid());
  v_rows   integer;
BEGIN
  IF v_caller IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'not_signed_in');
  END IF;

  UPDATE public.availability_slots
     SET status = 'available',
         booked_by = NULL
   WHERE id = p_slot_id
     AND booked_by = v_caller
     AND status = 'booked'
     -- Never release a slot a job is already hanging off. Cancelling a real
     -- booking is the tradie's decline path, not this.
     AND NOT EXISTS (SELECT 1 FROM public.jobs j WHERE j.slot_id = p_slot_id);

  GET DIAGNOSTICS v_rows = ROW_COUNT;
  RETURN jsonb_build_object('ok', v_rows > 0);
END;
$function$;

REVOKE ALL ON FUNCTION public.release_availability_slot(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.release_availability_slot(uuid) TO authenticated;

COMMENT ON FUNCTION public.release_availability_slot(uuid) IS
  'Undoes a claim made by book_availability_slot when the booking that followed it failed. Only releases a slot the caller booked, that is still booked, and that no job references.';

-- ─────────────────────────────────────────────────────────────────────────────
-- The backstop.
--
-- book_availability_slot is the path the app takes; this catches everything
-- that does not. jobs.slot_id can be set by any client with a PostgREST call,
-- and ChatDrawer has always set it without marking the slot at all.
--
-- Kept narrow on purpose, a week out from launch: it only ever looks at rows
-- where slot_id is set, and today NO job in production carries one, so there is
-- nothing existing it can reject.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.enforce_slot_bookable()
  RETURNS trigger
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_caller uuid := (SELECT auth.uid());
  v_slot   public.availability_slots%ROWTYPE;
BEGIN
  IF NEW.slot_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- Cron and the Edge Functions run as service_role with no auth.uid(). They
  -- are trusted callers and must not be caught by a client-facing guard.
  IF public.is_service_role() THEN
    RETURN NEW;
  END IF;

  SELECT * INTO v_slot
  FROM public.availability_slots
  WHERE id = NEW.slot_id;

  -- No such slot: let the foreign key be the thing that says so.
  IF NOT FOUND THEN
    RETURN NEW;
  END IF;

  -- The tradie's own diary is their business — they may book over their own
  -- Google commitment if they choose. A client may not.
  IF v_slot.tradie_id = v_caller THEN
    RETURN NEW;
  END IF;

  IF v_slot.external_conflict_at IS NOT NULL THEN
    RAISE EXCEPTION 'That time is no longer free — the tradie has a commitment in their calendar then. Pick another time.'
      USING ERRCODE = '23514';
  END IF;

  -- 'available' covers the tradie-accepts-first flow, where the job row exists
  -- before the slot is marked. booked_by = caller covers the client flow, which
  -- claims the slot first and then creates the job against it.
  IF v_slot.status = 'available' OR v_slot.booked_by = v_caller THEN
    RETURN NEW;
  END IF;

  RAISE EXCEPTION 'That time has already been taken. Pick another time.'
    USING ERRCODE = '23514';
END;
$function$;

REVOKE ALL ON FUNCTION public.enforce_slot_bookable() FROM public, anon, authenticated;

DROP TRIGGER IF EXISTS enforce_slot_bookable ON public.jobs;
CREATE TRIGGER enforce_slot_bookable
  BEFORE INSERT OR UPDATE OF slot_id ON public.jobs
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_slot_bookable();

-- Verified by execution against the live database before this file was written,
-- as role `authenticated` with a real auth.uid(), then rolled back / cleaned up
-- (215 slots, all available, 0 jobs with slot_id — the exact pre-test state):
--
--   book:    calendar_conflict / in_the_past / not_found / own_slot /
--            already_booked all refused; happy path booked with
--            booked_by = the caller. That last assertion had never once
--            passed in this database before.
--   release: refused for a caller who does not hold the claim; ok for one who does.
--   trigger: conflicted slot rejected on INSERT and on UPDATE OF slot_id;
--            another caller's claim rejected; the caller's own claim accepted;
--            a still-available slot accepted; slot_id IS NULL untouched.
--   grants:  anon cannot execute either RPC; authenticated cannot execute the
--            trigger function.
--
-- get_advisors adds only the WARN every one of the existing definer functions
-- already carries (authenticated can call it — which is the point). No ERROR.
