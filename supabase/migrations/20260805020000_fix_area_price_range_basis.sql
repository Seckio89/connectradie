-- Migration: fix_area_price_range_basis
-- Description: Correct three defects in get_area_price_range that made the
-- anonymised market range systematically wrong.
--
-- The function is the only sanctioned cross-tradie price read on the platform
-- (RLS enforces blind quoting — "Users can view relevant quotes" lets a tradie
-- see only their own row), so it stays SECURITY DEFINER with the >= 5 sample
-- privacy floor untouched. Only the population and price basis change.
--
-- 1. WRONG PRICE BASIS. It used coalesce(firm_price, price_min), which
--    (a) ignores final_price entirely — the authoritative agreed amount on the
--    3-stage flow — and (b) falls back to the BOTTOM of an estimate range.
--    Every accepted range-quote was therefore reported at its cheapest possible
--    reading, dragging the whole market range down.
--
--    The replacement mirrors the money path exactly. accept-and-pay computes the
--    charged amount as final_price (v2) then firm_price ?? price_max, so the
--    market range now reports what was actually charged rather than a different
--    rule invented here. price_min remains only as a last resort for rows
--    predating price_max being populated.
--
-- 2. DEAD PREDICATE. status IN ('accepted','completed') — 'completed' is not a
--    legal quotes.status; quotes_status_check admits only pending,
--    site_visit_scheduled, site_visit_completed, final_submitted, accepted,
--    declined, withdrawn, expired. That half of the IN matched zero rows and
--    misled every reader into thinking completed jobs were counted.
--
-- 3. NO TIME WINDOW. The original had none, so the range averaged all history
--    forever with no recency weighting — 2026 prices would still be dragging the
--    median down in 2030. An 18-month rolling window keeps it tracking the
--    market while staying long enough to clear the 5-sample floor in thin trades.
--
-- Not changed: the +/-0.25 degree bounding box, the >= 5 privacy floor, the
-- P20/P50/P80 percentiles, SECURITY DEFINER, and the grants.

create or replace function public.get_area_price_range(
  p_trade    text,
  p_property text default null,
  p_lat      numeric default null,
  p_lng      numeric default null
)
returns table (sample_size integer, price_low numeric, price_high numeric, price_mid numeric)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_min_samples constant integer := 5;
  v_box constant numeric := 0.25;
  v_window constant interval := '18 months';
begin
  return query
  with comparable as (
    -- Mirrors accept-and-pay's agreed-price resolution: final_price wins,
    -- then firm_price, then the TOP of the range (what the client is charged),
    -- with price_min only as a floor for legacy rows.
    select coalesce(q.final_price, q.firm_price, q.price_max, q.price_min) as price
    from public.quotes q
    join public.jobs j on j.id = q.job_id
    where q.status = 'accepted'
      and q.created_at >= now() - v_window
      and coalesce(q.final_price, q.firm_price, q.price_max, q.price_min) > 0
      and lower(q.trade_category) = lower(p_trade)
      and (p_property is null or q.property_type is null or lower(q.property_type) = lower(p_property))
      and (
        p_lat is null or p_lng is null
        or (j.latitude is not null and j.longitude is not null
            and j.latitude between p_lat - v_box and p_lat + v_box
            and j.longitude between p_lng - v_box and p_lng + v_box)
      )
  ), agg as (
    select count(*)::int as n,
           percentile_cont(0.2) within group (order by price) as p20,
           percentile_cont(0.5) within group (order by price) as p50,
           percentile_cont(0.8) within group (order by price) as p80
    from comparable
  )
  select
    n,
    case when n >= v_min_samples then round(p20::numeric) end,
    case when n >= v_min_samples then round(p80::numeric) end,
    case when n >= v_min_samples then round(p50::numeric) end
  from agg;
end;
$$;

-- CREATE OR REPLACE preserves the existing ACL, but re-stated so the intended
-- exposure is visible in this migration rather than only in the original.
revoke all on function public.get_area_price_range(text, text, numeric, numeric) from public, anon;
grant execute on function public.get_area_price_range(text, text, numeric, numeric) to authenticated;
