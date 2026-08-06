-- Backfill trade_category on historical accepted quotes, and stop implausible
-- prices forming a market range.
--
-- #257 pointed SubmitQuoteModal at get_area_price_range instead of the tradie's
-- own quotes, but it shipped dormant: no accepted quote carried trade_category,
-- so every call returned sample_size 0 and the panel never rendered.
--
-- Backfilling alone was measured before being trusted, and it is not safe on its
-- own. All 8 accepted quotes are [Cleaner], so the backfill clears the 5-sample
-- floor — and the prices are 1, 70, 1, 10, 1, 50, 10, 2, which are test amounts.
-- Simulated in a rolled-back transaction, that produced:
--
--   sample_size=8 | range=$1-$34 | typically=$6
--
-- i.e. "Market range for cleaner in this area: $1–$34" shown to a real tradie —
-- the same defect #257 removed, now wearing an anonymised-aggregate badge. So
-- the floor ships with the backfill, not after it.
--
-- The filename version matches the version production recorded for this
-- migration (supabase_migrations.schema_migrations), rather than a hand-rounded
-- stamp. See #256 and #258 — the repo and the ledger have to agree.

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Backfill
-- ─────────────────────────────────────────────────────────────────────────────
-- jobs has no category column; the trade is the "[Category]" prefix on the
-- description. lower() is the mapping to the canonical TRADE_CATEGORIES value
-- (src/lib/tradeCategories.ts) — 'Cleaner' -> 'cleaner', which is also what
-- tradie_details.trade_category holds and what SubmitQuoteModal passes to the
-- RPC, so the read matches the write.
--
-- ⚠ This mapping is lower(), not a lookup. It is correct for every single-word
-- trade, and WRONG for the hyphenated ones — 'Pest Control' would become
-- 'pest control', not 'pest-control'. None exist in the data today and the
-- WHERE only touches rows whose description carries a prefix, so this is safe
-- as written. Anyone re-running this shape of backfill once a hyphenated trade
-- has quotes needs a real lookup table instead.
UPDATE quotes q
SET trade_category = lower(substring(j.description from '^\[([^\]]+)\]'))
FROM jobs j
WHERE j.id = q.job_id
  AND q.status = 'accepted'
  AND q.trade_category IS NULL
  AND substring(j.description from '^\[([^\]]+)\]') IS NOT NULL;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Price floor
-- ─────────────────────────────────────────────────────────────────────────────
-- Body carried forward verbatim from the definition read out of production with
-- pg_get_functiondef. The only changes are v_min_price and the one predicate
-- using it.
CREATE OR REPLACE FUNCTION public.get_area_price_range(
  p_trade text,
  p_property text DEFAULT NULL::text,
  p_lat numeric DEFAULT NULL::numeric,
  p_lng numeric DEFAULT NULL::numeric
)
RETURNS TABLE(sample_size integer, price_low numeric, price_high numeric, price_mid numeric)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
declare
  v_min_samples constant integer := 5;
  v_box constant numeric := 0.25;
  v_window constant interval := '18 months';
  v_min_price constant numeric := 50;
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
      -- Below this is not a real job — a call-out fee alone clears it. Without
      -- it, seeded and test rows priced at a dollar or two form a "market
      -- range" that reads authoritative and is worthless.
      and coalesce(q.final_price, q.firm_price, q.price_max, q.price_min) >= v_min_price
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
$function$;

-- CREATE OR REPLACE preserves the existing ACL; re-assert it so a rebuild from
-- migrations lands on the same grants as production.
REVOKE EXECUTE ON FUNCTION public.get_area_price_range(text, text, numeric, numeric) FROM anon;
