/*
  # Track when a recurring invoice's funds landed in the tradie's balance

  `transferred_at` records WHEN a recurring invoice's payout_status became
  'transferred' (funds reached the tradie's Stripe balance via a destination
  charge or a swept transfer). The bank-payout stage of
  auto-release-recurring-payouts can gate on this instead of paid_at, so an
  invoice that reaches 'transferred' after the payout-fix cutover — e.g. a
  tradie who onboarded late — is still paid through to the bank, while
  historical invoices (transferred_at NULL) are never re-paid.
*/

ALTER TABLE recurring_invoices ADD COLUMN IF NOT EXISTS transferred_at timestamptz;
