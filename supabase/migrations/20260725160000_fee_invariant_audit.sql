-- Migration: fee_invariant_audit
-- Type: Reliability / monitoring
-- Description: Pricing v2.1 Phase 3 went live 2026-07-23 and changed how every
-- platform fee is computed (labour-only commission + at-cost materials
-- processing, replacing the old platform-fee + processing-fee split). No job had
-- completed post-cutover at deploy time, so the first real charges are unvalidated.
--
-- This is a daily self-check: it re-derives the invariants that must hold for any
-- v2.1 fee breakdown and records violations for review, notifying admins if any
-- are found. Deliberately implemented in the DATABASE rather than as a scheduled
-- cloud agent — the data lives here, so it needs no MCP connector, no service key
-- in a prompt, and it reuses the existing pg_cron setup.
--
-- Invariants (from _shared/pricing.calculateFeeV21 + feeContext.resolveChargeFee):
--   1. commission + materials_processing == platform_fee   (parts sum to the total)
--   2. labour_cents + materials_cents     == amount        (split reconciles)
--   3. commission <= labour_cents                          (commission is LABOUR-ONLY —
--      never charged on materials; this is the core promise of v2.1)
--   4. 0 <= platform_fee <= amount                         (sanity bound)
-- Missing/non-numeric fee metadata is itself flagged.

create table if not exists public.fee_audit_anomalies (
  id          uuid primary key default gen_random_uuid(),
  payment_id  uuid not null,
  job_id      uuid,
  reason      text not null,
  details     jsonb,
  detected_at timestamptz not null default now(),
  resolved_at timestamptz
);

-- One row per payment; also makes the daily re-scan naturally idempotent.
create unique index if not exists fee_audit_anomalies_payment_id_key
  on public.fee_audit_anomalies (payment_id);

alter table public.fee_audit_anomalies enable row level security;

drop policy if exists "Admins can view fee anomalies" on public.fee_audit_anomalies;
create policy "Admins can view fee anomalies"
  on public.fee_audit_anomalies for select to authenticated
  using (public.is_admin());

revoke all on public.fee_audit_anomalies from anon, authenticated;
grant select on public.fee_audit_anomalies to authenticated; -- still gated by RLS above

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
           nullif(p.metadata->>'commission', '')           as c_txt,
           nullif(p.metadata->>'materials_processing', '') as mp_txt,
           nullif(p.metadata->>'platform_fee', '')         as pf_txt,
           nullif(p.metadata->>'labour_cents', '')         as lab_txt,
           nullif(p.metadata->>'materials_cents', '')      as mat_txt
    from public.payments p
    where p.payment_type = 'job_funding'
      and p.metadata->>'fee_model' = 'v2.1'
      -- only charges created after the Phase 3 cutover
      and p.created_at > timestamptz '2026-07-23 10:50:00+00'
      and not exists (
        select 1 from public.fee_audit_anomalies a where a.payment_id = p.id
      )
  ),
  parsed as (
    select c.*,
           case when c_txt   ~ '^-?\d+$' then c_txt::bigint   end as commission,
           case when mp_txt  ~ '^-?\d+$' then mp_txt::bigint  end as mat_proc,
           case when pf_txt  ~ '^-?\d+$' then pf_txt::bigint  end as platform_fee,
           case when lab_txt ~ '^-?\d+$' then lab_txt::bigint end as labour,
           case when mat_txt ~ '^-?\d+$' then mat_txt::bigint end as materials
    from candidates c
  ),
  violations as (
    select payment_id, job_id,
           case
             when commission is null or mat_proc is null or platform_fee is null
                  or labour is null or materials is null
               then 'missing_or_nonnumeric_fee_metadata'
             when commission + mat_proc <> platform_fee
               then 'parts_do_not_sum_to_platform_fee'
             when labour + materials <> amount
               then 'labour_plus_materials_ne_amount'
             when commission > labour
               then 'commission_exceeds_labour'
             when platform_fee < 0 or platform_fee > amount
               then 'platform_fee_out_of_range'
           end as reason,
           jsonb_build_object(
             'amount', amount, 'commission', commission,
             'materials_processing', mat_proc, 'platform_fee', platform_fee,
             'labour_cents', labour, 'materials_cents', materials
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
-- (Same lockdown as the other maintenance fns — note PUBLIC must be revoked too,
-- since anon/authenticated inherit the implicit grant.)
revoke execute on function public.check_v21_fee_invariants() from public, anon, authenticated;

comment on function public.check_v21_fee_invariants() is
  'Daily Pricing v2.1 fee-invariant audit. Records violations in fee_audit_anomalies '
  'and notifies admins. Scheduled via pg_cron (fee-invariant-audit-daily).';
