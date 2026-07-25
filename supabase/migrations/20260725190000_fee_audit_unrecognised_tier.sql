-- Migration: fee_audit_unrecognised_tier
-- Type: Monitoring — extends the daily Pricing v2.1 fee audit
--
-- Adds one rule: flag a payment whose tradie sits on a subscription_tier value
-- the fee resolvers do not recognise.
--
-- WHY. `resolveTradieTier` (supabase/functions/_shared/pricing.ts) maps a raw
-- tier string to a fee schedule and falls back to 'free' for anything it does
-- not know. That fallback is deliberate — Free is the HIGHEST rate, so a config
-- gap can only over-collect for the platform, never silently under-bill a job.
-- But it is also silent, and silence is how the 2026-07-24 override overcharge
-- went undiagnosed.
--
-- The realistic drift is someone widening the tradie_details.subscription_tier
-- CHECK (to sell a new plan) without teaching the resolvers about it. Every
-- tradie on that new plan would then quietly be charged Free rates. This makes
-- that visible on the first payment instead of at reconciliation.
--
-- Deliberately NOT enforced in the money path: throwing there would fail live
-- charges over a config problem. Same visible-rather-than-silent approach as
-- `override_lookup_failed`.
--
-- The rule sits LAST in the CASE so genuine arithmetic violations still take
-- precedence on a given payment (fee_audit_anomalies holds one row per payment).

create or replace function public.check_v21_fee_invariants()
  returns integer
  language plpgsql
  security definer
  set search_path to 'public'
as $function$
declare
  v_new int := 0;
begin
  with candidates as (
    select p.id as payment_id, p.job_id, p.amount,
           j.tradie_id,
           pr.platform_fee_override_bps                    as current_override,
           td.subscription_tier                            as current_tier,
           nullif(p.metadata->>'commission', '')           as c_txt,
           nullif(p.metadata->>'materials_processing', '') as mp_txt,
           nullif(p.metadata->>'platform_fee', '')         as pf_txt,
           nullif(p.metadata->>'labour_cents', '')         as lab_txt,
           nullif(p.metadata->>'materials_cents', '')      as mat_txt,
           nullif(p.metadata->>'fee_rate_bps', '')         as rate_txt
    from public.payments p
    join public.jobs j on j.id = p.job_id
    left join public.profiles pr on pr.id = j.tradie_id
    left join public.tradie_details td on td.profile_id = j.tradie_id
    where p.payment_type = 'job_funding'
      and p.metadata->>'fee_model' = 'v2.1'
      and p.created_at > timestamptz '2026-07-23 07:00:00+00'
      and not exists (
        select 1 from public.fee_audit_anomalies a where a.payment_id = p.id
      )
  ),
  parsed as (
    select c.*,
           case when c_txt    ~ '^-?\d+$' then c_txt::bigint    end as commission,
           case when mp_txt   ~ '^-?\d+$' then mp_txt::bigint   end as mat_proc,
           case when pf_txt   ~ '^-?\d+$' then pf_txt::bigint   end as platform_fee,
           case when lab_txt  ~ '^-?\d+$' then lab_txt::bigint  end as labour,
           case when mat_txt  ~ '^-?\d+$' then mat_txt::bigint  end as materials,
           case when rate_txt ~ '^-?\d+$' then rate_txt::bigint end as rate_bps
    from candidates c
  ),
  violations as (
    select payment_id, job_id,
           case
             -- The tradie holds an override but it was not the rate applied.
             -- A 0 bps override MUST produce zero commission.
             when current_override is not null and rate_bps is not null
                  and rate_bps <> current_override
               then 'override_not_applied'
             when current_override = 0 and commission is not null and commission > 0
               then 'zero_override_but_commission_charged'
             when commission is null or mat_proc is null or platform_fee is null
               then 'missing_or_nonnumeric_fee_metadata'
             when commission + mat_proc <> platform_fee
               then 'parts_do_not_sum_to_platform_fee'
             when labour is not null and materials is not null
                  and labour + materials <> amount
               then 'labour_plus_materials_ne_amount'
             when labour is not null and commission > labour
               then 'commission_exceeds_labour'
             when platform_fee < 0 or platform_fee > amount
               then 'platform_fee_out_of_range'
             -- NEW: config drift. NULL is legitimate (no tradie_details row, or
             -- an unset tier — both resolve to Free by design), so only a
             -- non-null value the resolvers don't know is flagged.
             when current_tier is not null
                  and current_tier not in (
                    'free', 'pro', 'pro_plus', 'business',
                    'pm', 'pm_starter', 'pm_pro', 'pm_enterprise'
                  )
               then 'tradie_on_unrecognised_tier'
           end as reason,
           jsonb_build_object(
             'amount', amount, 'commission', commission,
             'materials_processing', mat_proc, 'platform_fee', platform_fee,
             'labour_cents', labour, 'materials_cents', materials,
             'fee_rate_bps', rate_bps, 'tradie_current_override_bps', current_override,
             'tradie_current_tier', current_tier
           ) as details
    from parsed
  )
  insert into public.fee_audit_anomalies (payment_id, job_id, reason, details)
  select payment_id, job_id, reason, details
  from violations
  where reason is not null
  on conflict (payment_id) do nothing;

  get diagnostics v_new = row_count;

  if v_new > 0 then
    insert into public.notifications (user_id, title, message, type, notification_type, metadata)
    select pr.id,
           'Fee check: ' || v_new || ' payment(s) need review',
           'The daily Pricing v2.1 fee audit found ' || v_new ||
             ' payment(s) whose fee breakdown failed an invariant. Review public.fee_audit_anomalies.',
           'system', 'FEE_AUDIT',
           jsonb_build_object('anomaly_count', v_new)
    from public.profiles pr
    where pr.is_admin = true;
  end if;

  return v_new;
end
$function$;

-- SECURITY DEFINER maintenance function: never callable from the client.
-- PUBLIC must be revoked too — anon/authenticated inherit the implicit grant.
revoke execute on function public.check_v21_fee_invariants() from public, anon, authenticated;

comment on function public.check_v21_fee_invariants() is
  'Daily Pricing v2.1 fee-invariant audit. Records violations in fee_audit_anomalies '
  'and notifies admins. Also flags tradies sitting on a subscription_tier the fee '
  'resolvers do not recognise. Scheduled via pg_cron (fee-invariant-audit-daily).';
