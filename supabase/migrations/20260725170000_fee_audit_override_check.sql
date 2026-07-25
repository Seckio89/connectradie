-- Migration: fee_audit_override_check
-- Type: Monitoring — extends 20260725160000_fee_invariant_audit
-- Description: Adds an override-consistency rule to the daily fee audit.
--
-- Motivating incident: a $70 charge on 2026-07-24 08:22 UTC was billed the
-- standard Pro min-fee ($5.00 commission) even though the tradie holds
-- platform_fee_override_bps = 0 (which must yield ZERO commission). An identical
-- code path charged $0.00 correctly on 2026-07-23 09:09 — both AFTER the Phase 3
-- deploy (2026-07-23 07:00), same tradie, same override, no migration ever
-- resetting the column. calculateFeeV21 and the accept-and-pay call site are both
-- correct on inspection, so the override value did not reach the calculation; the
-- root cause could NOT be established after the fact because the applied rate was
-- never recorded on the payment.
--
-- accept-and-pay now stamps fee_rate_bps / override_bps_applied / labour_cents /
-- materials_cents, and these rules compare them against the tradie's CURRENT
-- override so a recurrence surfaces within 24h instead of by archaeology:
--   • override_not_applied                  — rate applied <> tradie's override
--   • zero_override_but_commission_charged  — 0 bps override yet commission > 0
--
-- The cutover bound also moves 10:50 -> 07:00 UTC (the real accept-and-pay deploy
-- time), so the audit covers every post-Phase-3 charge rather than missing ~4h.
-- Function body is defined in this migration; see 20260725160000 for the table.

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
           nullif(p.metadata->>'commission', '')           as c_txt,
           nullif(p.metadata->>'materials_processing', '') as mp_txt,
           nullif(p.metadata->>'platform_fee', '')         as pf_txt,
           nullif(p.metadata->>'labour_cents', '')         as lab_txt,
           nullif(p.metadata->>'materials_cents', '')      as mat_txt,
           nullif(p.metadata->>'fee_rate_bps', '')         as rate_txt
    from public.payments p
    join public.jobs j on j.id = p.job_id
    left join public.profiles pr on pr.id = j.tradie_id
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
           end as reason,
           jsonb_build_object(
             'amount', amount, 'commission', commission,
             'materials_processing', mat_proc, 'platform_fee', platform_fee,
             'labour_cents', labour, 'materials_cents', materials,
             'fee_rate_bps', rate_bps, 'tradie_current_override_bps', current_override
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

revoke execute on function public.check_v21_fee_invariants() from public, anon, authenticated;
