-- Migration: deactivate_pm_tier_and_decouple_escrow_gate
-- Type: Correctness / consumer-law exposure
--
-- Two related problems, both stemming from the Property Manager tier being
-- advertised before it was buildable.
--
-- (1) /pricing advertises PM at $149/mo — 3% of labour, capped $270 — but the
--     tier is UNSELLABLE and UNCHARGEABLE:
--       • no Stripe price exists for it (pricing_tiers.stripe_price_id_* are all
--         NULL; only VITE_STRIPE_PRO_PRICE_ID is configured)
--       • no checkout path selects it
--       • stripe-webhook's syncCustomerFromStripe is the ONLY code that writes a
--         tier, and it is hardcoded to `isActive ? 'pro' : 'free'`
--       • the literal 'pm' violates the CHECK on BOTH tier columns
--     So a property manager signing up via that card is charged the Free
--     schedule (8%, cap $500) instead of the advertised 3%/$270. Deactivate the
--     row so the card stops rendering. KEEP the row — it holds the correct
--     schedule for when PM ships.
--
-- (2) `profiles.subscription_tier` is never written by any running code (billing
--     writes tradie_details.subscription_tier), so it is 'free' for every paying
--     Pro tradie. enforce_external_pay_tier nevertheless branches on it to decide
--     whether a tradie may set a client to external/direct pay. Because the
--     column can never hold a pm_* value, that branch is dead and everyone is
--     coerced to escrow — fail-closed, and correct.
--
--     This migration keeps that behaviour EXACTLY but removes the dead tier
--     coupling, leaving `external_pay_allowed` as the single entitlement. When PM
--     ships, granting direct pay becomes a data change during provisioning
--     rather than another trigger edit that would have to re-derive the tier from
--     the right column.
--
--     ⚠️ Escrow must stay forced. Verified after applying: inserting a
--     client_contacts row with payment_method='external' for a non-grandfathered
--     tradie still comes back as 'stripe'.

-- ── 1. Stop advertising PM ───────────────────────────────────────────────────
update public.pricing_tiers
   set is_active = false,
       updated_at = now()
 where id = 'pm';

comment on column public.pricing_tiers.is_active is
  'Whether the tier renders on /pricing AND is offered for purchase. PM is false '
  'until it has a Stripe price and the webhook can write its tier.';

-- ── 2. Decouple the direct-pay gate from the dead column ─────────────────────
create or replace function public.enforce_external_pay_tier()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_allowed boolean;
begin
  if new.payment_method = 'external' then
    select p.external_pay_allowed
      into v_allowed
      from public.profiles p
     where p.id = new.owner_id;

    -- `external_pay_allowed` is now the ONLY entitlement. Previously this also
    -- admitted profiles.subscription_tier IN ('pm_starter','pm_pro',
    -- 'pm_enterprise') — a column nothing writes, so that branch never fired.
    -- Behaviour is unchanged; the dead coupling is gone.
    if not coalesce(v_allowed, false) then
      new.payment_method := 'stripe'; -- coerce to escrow rather than fail the insert
    end if;
  end if;
  return new;
end;
$$;

comment on function public.enforce_external_pay_tier() is
  'Coerces client_contacts.payment_method to ''stripe'' (escrow) unless the owner '
  'holds profiles.external_pay_allowed. Escrow is the default; direct pay is an '
  'explicit, billing/admin-granted entitlement.';

-- Trigger binding is unchanged, but re-assert it so the function swap can never
-- leave the table ungated.
drop trigger if exists trg_enforce_external_pay_tier on public.client_contacts;
create trigger trg_enforce_external_pay_tier
  before insert or update of payment_method on public.client_contacts
  for each row execute function public.enforce_external_pay_tier();

-- ── 3. Mark the dead column so nothing reads it again ────────────────────────
comment on column public.profiles.subscription_tier is
  'NOT AUTHORITATIVE. Billing writes tradie_details.subscription_tier; this column '
  'is never updated by running code and is ''free'' for every paying tradie. '
  'Retained for history only — do NOT read it for fees, gating or entitlements.';
