/*
  # Create stripe_orders table

  ## Summary
  Creates a table to store completed one-time Stripe payment sessions.
  This is required for the stripe-webhook edge function to record
  non-subscription checkout completions.

  ## New Tables
  - `stripe_orders`
    - `id` (uuid, primary key)
    - `checkout_session_id` (text, unique) — Stripe checkout session ID
    - `payment_intent_id` (text) — Stripe payment intent ID
    - `customer_id` (text) — Stripe customer ID
    - `amount_subtotal` (bigint) — subtotal in smallest currency unit
    - `amount_total` (bigint) — total in smallest currency unit
    - `currency` (text) — ISO currency code (e.g. "aud")
    - `payment_status` (text) — Stripe payment status
    - `status` (text) — internal order status, defaults to "completed"
    - `created_at` (timestamptz)

  ## Security
  - RLS enabled; only service role can insert (webhook uses service role key)
  - Authenticated users can read their own orders by matching stripe_customer_id
    via their profile
*/

CREATE TABLE IF NOT EXISTS stripe_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  checkout_session_id text UNIQUE NOT NULL,
  payment_intent_id text,
  customer_id text NOT NULL,
  amount_subtotal bigint,
  amount_total bigint,
  currency text,
  payment_status text,
  status text NOT NULL DEFAULT 'completed',
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS stripe_orders_customer_id_idx ON stripe_orders (customer_id);
CREATE INDEX IF NOT EXISTS stripe_orders_checkout_session_id_idx ON stripe_orders (checkout_session_id);

ALTER TABLE stripe_orders ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own orders"
  ON stripe_orders
  FOR SELECT
  TO authenticated
  USING (
    customer_id IN (
      SELECT stripe_customer_id FROM profiles
      WHERE id = auth.uid()
      AND stripe_customer_id IS NOT NULL
    )
  );
