// Claiming an availability slot.
//
// Both booking entry points (AvailabilityCalendar and ChatDrawer) go through
// book_availability_slot rather than writing to availability_slots directly.
// The direct write they used to do could never have worked: it ran as the
// client, and the UPDATE policy on that table is `tradie_id = auth.uid()`, so
// it matched zero rows — and PostgREST does not error on zero rows.

/**
 * What book_availability_slot / release_availability_slot return.
 *
 * Both are jsonb, so the generated types can only say `Json`. This is the shape
 * the migration actually builds, asserted once here rather than at each call
 * site.
 */
export type SlotClaimResult = { ok: boolean; reason?: string; slot_id?: string };

/**
 * Why a slot could not be claimed, in words the client can act on.
 *
 * Design rule: say what failed and how to fix it, never "something went wrong",
 * and never apologise. `calendar_conflict` is the one that matters most — the
 * tradie's Google Calendar says they are committed then, and the sync had
 * already blocked the slot before this client tapped it.
 */
export function bookingRefusalMessage(reason: string | undefined): string {
  switch (reason) {
    case 'calendar_conflict':
      return 'That time is no longer free — this tradie has a commitment in their calendar then. Pick another time.';
    case 'already_booked':
      return 'Someone just booked that time. Pick another slot.';
    case 'unavailable':
      return 'That time is no longer available. Pick another slot.';
    case 'in_the_past':
      return 'That time has already passed. Pick a slot in the future.';
    case 'not_found':
      return 'That slot no longer exists. Refresh and pick another time.';
    case 'own_slot':
      return 'You cannot book your own availability.';
    case 'not_signed_in':
      return 'Sign in again to book this time.';
    default:
      return 'That time could not be booked. Pick another slot.';
  }
}
