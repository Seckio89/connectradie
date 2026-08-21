-- ─────────────────────────────────────────────────────────────────────────────
-- availability_slots.external_conflict_at — records that the Google Calendar
-- sync blocked this slot because the tradie is committed elsewhere at that time.
--
-- WHY A MARKER AND NOT A DELETE. On 2026-06-13 the sync did delete conflicting
-- slots (7373a89 removed it eight minutes after acb26b0 introduced it). The
-- export had just started pushing every available slot into Google as
-- "✅ Available — ConnecTradie"; the conflict check then read those events back,
-- saw them overlapping the slots that created them, and deleted the tradie's
-- entire availability. Deletion was ripped out rather than trust a fuzzy title
-- match on a summary the tradie can edit in Google. That reasoning still holds:
-- nothing in this system may delete a slot based on what it read out of Google.
--
-- Marking is the reversible form of the same intent. The sync flips a
-- conflicting slot to status='blocked' and stamps this column; when the Google
-- event goes away the next sync clears the stamp and returns it to 'available'.
-- Worst case is recoverable by pressing Sync again.
--
-- WHY status IS ALSO FLIPPED rather than filtering on this column alone: every
-- client-facing read already filters `.eq('status','available')`
-- (AvailabilityCalendar, BookingRequestModal). Reusing status means a blocked
-- slot disappears from the booking surface with no read site changed, so there
-- is no call site left behind still offering it.
--
-- The column is what keeps a sync-block distinguishable from a tradie's own
-- manual block. The sync only ever blocks slots that are currently 'available',
-- and only ever unblocks slots where this column is set — so a manual block is
-- never cleared by a sync, and a sync-block is never mistaken for one.
--
-- NOT stored here, deliberately: the Google event's title. This table is
-- SELECT-readable by every authenticated user ("View and manage availability
-- slots", qual `true`), because clients must see a tradie's availability to
-- book it. Persisting an event summary would publish every tradie's private
-- calendar to every client on the platform. The sync reads busy intervals via
-- the FreeBusy API, which returns no titles at all, so there is nothing to leak.
-- ─────────────────────────────────────────────────────────────────────────────

alter table public.availability_slots
  add column if not exists external_conflict_at timestamptz;

-- The sync's clear pass looks up "slots I previously blocked for this tradie".
-- Partial, because the set is small and transient relative to the table.
create index if not exists idx_availability_slots_external_conflict
  on public.availability_slots (tradie_id)
  where external_conflict_at is not null;

comment on column public.availability_slots.external_conflict_at is
  'Set by sync-google-calendar when this slot was blocked because it overlaps a busy interval on one of the tradie''s Google calendars; NULL otherwise. Distinguishes a sync-block (which the next sync may clear) from the tradie''s own manual block (which it must never touch). Never carries the event title — this table is world-readable to authenticated users.';
