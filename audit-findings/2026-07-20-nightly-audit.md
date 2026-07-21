# Nightly Code Audit — 2026-07-20

**Repo:** Seckio89/connectradie (master @ `2ef4737`)  
**Supabase project:** `uoqygmizupdpanplpvor` (Connectradie, ap-south-1)  
**Audited:** 2026-07-20  
**Note:** GitHub MCP has read-only access — PR could not be created. Findings logged here instead.

---

## Summary

| Category | Count | Severity |
|---|---|---|
| Exposed secrets in src/ | 0 | ✅ Clean |
| `dangerouslySetInnerHTML` / `eval` in src/ | 0 | ✅ Clean |
| `console.log` in frontend src/ | 0 | ✅ Clean |
| Hardcoded passwords/tokens in src/ | 0 | ✅ Clean |
| SECURITY DEFINER functions callable by `anon` | 4 (payment-related) | 🔴 High |
| SECURITY DEFINER functions callable by `authenticated` | 20+ | ⚠️ Review |
| Unindexed foreign keys | 2 | ⚠️ Medium |
| Unused indexes | 40+ | ℹ️ Low |
| Multiple permissive policies (same role+action) | 1 table | ⚠️ Medium |
| Auth DB connection strategy | percentage-based not set | ℹ️ Low |

---

## 🔴 High-Risk: SECURITY DEFINER Functions Callable by `anon`

> **Critical:** The following functions can be called via the REST API (`/rest/v1/rpc/...`) **without any authentication**. All are `SECURITY DEFINER`, meaning they run with elevated DB privileges. Payment and billing functions should never be publicly callable.

### Functions exposed to unauthenticated users:

| Function | Risk | Why it's dangerous |
|---|---|---|
| `public.enforce_external_pay_tier()` | 🔴 HIGH | Payment tier enforcement — anon could trigger payment-related logic |
| `public.flag_offplatform_payment()` | 🔴 HIGH | Marks payments as off-platform — anon could disrupt escrow flow |
| `public.lock_profile_billing_columns()` | 🔴 HIGH | Billing lock — anon could lock billing columns |
| `public.lock_tradie_billing_columns()` | 🔴 HIGH | Billing lock — anon could lock billing columns |
| `public.get_service_worker_details(p_recurring_job_id uuid)` | ⚠️ MEDIUM | Exposes worker data without auth |
| `public.get_team_site_activity(p_since timestamp)` | ⚠️ MEDIUM | Exposes site activity without auth |
| `public.get_daily_profile_view_count(viewer_uuid uuid)` | ⚠️ LOW | May be intentional for public profiles |
| `public.has_user_engagement(user_uuid uuid)` | ⚠️ LOW | Exposes engagement data |
| `public.search_businesses_by_name(search_term text)` | ℹ️ LIKELY OK | Probably intentional for public search |

### Recommended fix (new migration required):

```sql
-- Revoke anon EXECUTE on payment/billing functions
REVOKE EXECUTE ON FUNCTION public.enforce_external_pay_tier() FROM anon;
REVOKE EXECUTE ON FUNCTION public.flag_offplatform_payment() FROM anon;
REVOKE EXECUTE ON FUNCTION public.lock_profile_billing_columns() FROM anon;
REVOKE EXECUTE ON FUNCTION public.lock_tradie_billing_columns() FROM anon;

-- Review these — revoke if not needed for public access:
REVOKE EXECUTE ON FUNCTION public.get_service_worker_details(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_team_site_activity(timestamptz) FROM anon;
```

> **Important:** `enforce_external_pay_tier`, `flag_offplatform_payment`, `lock_profile_billing_columns`, and `lock_tradie_billing_columns` all take no arguments and look like trigger functions. PostgreSQL doesn't allow calling trigger functions directly via REST, so the actual call risk may be lower — but Supabase still considers them a security advisory. Verify by checking if they `RETURN TRIGGER` before revoke. If they are trigger functions, the REVOKE is still best practice.

**Remediation guide:** https://supabase.com/docs/guides/database/database-linter?lint=0028_anon_security_definer_function_executable

---

## ⚠️ Medium: Unindexed Foreign Keys on `custom_task_suggestions`

Two foreign keys on `public.custom_task_suggestions` have no covering index — this causes sequential scans on joins:

- `custom_task_suggestions_reviewed_by_fkey` (column 9 — `reviewed_by`)
- `custom_task_suggestions_submitted_by_fkey` (column 2 — `submitted_by`)

### Recommended fix (new migration):

```sql
CREATE INDEX IF NOT EXISTS idx_cts_reviewed_by ON public.custom_task_suggestions (reviewed_by);
CREATE INDEX IF NOT EXISTS idx_cts_submitted_by ON public.custom_task_suggestions (submitted_by);
```

**Remediation guide:** https://supabase.com/docs/guides/database/database-linter?lint=0001_unindexed_foreign_keys

---

## ⚠️ Medium: Multiple Permissive SELECT Policies on `custom_task_suggestions`

`public.custom_task_suggestions` has two permissive policies for `authenticated` + `SELECT`:
- `cts_admin_read`
- `cts_read_approved`

PostgreSQL evaluates ALL permissive policies per query — both fire on every SELECT. Merge them into a single policy:

```sql
-- Drop the two existing policies and replace with one combined policy
DROP POLICY cts_admin_read ON public.custom_task_suggestions;
DROP POLICY cts_read_approved ON public.custom_task_suggestions;

CREATE POLICY cts_select ON public.custom_task_suggestions
  FOR SELECT TO authenticated
  USING (
    status = 'approved'
    OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );
```

**Remediation guide:** https://supabase.com/docs/guides/database/database-linter?lint=0006_multiple_permissive_policies

---

## ℹ️ Low: Unused Indexes (40+)

Supabase identifies 40+ indexes that have never been queried. These consume write overhead and storage with no read benefit. Since the app is recently launched and some features are new, most of these may simply not have been exercised yet — hold off on dropping until traffic patterns stabilize (2–4 weeks of production load).

Indexes to monitor and consider dropping after verification:

**On `conversations`:**
- `idx_conversations_recurring_job_id`
- `conversations_job_id_idx`

**On `jobs`:**
- `idx_jobs_deleted_at`
- `idx_jobs_coords`

**On `recurring_invoices`:**
- `idx_recurring_invoices_payout_held`
- `idx_recurring_invoices_marked_paid_by`
- `idx_recurring_invoices_approved_by`
- `idx_recurring_invoices_disputed_by`
- `idx_recurring_invoices_resolved_by`

**On `profiles`:**
- `idx_profiles_employer_id`
- `idx_profiles_base_coords`

**On `invoices`:**
- `idx_invoices_milestone_id`
- `idx_invoices_milestone_subcontractor_id`

...and 27 more across `service_description_raw`, `service_description_keywords`, `saved_payment_methods`, `platform_recommendations`, `admin_audit_log`, `ai_estimate_usage`, `client_contacts`, `time_entries`, `service_agreements`, `disputes`, `service_visits`, `message_flags`, `platform_updates`, `user_update_reads`, `tradie_subscriptions`, `milestone_subcontractors`, `typing_indicators`, `imported_calendar_visits`, `estimate_packs`, `reviews`, `app_settings`, `custom_task_suggestions`.

---

## ℹ️ Low: Auth DB Connection Strategy

Auth is configured with an absolute connection limit (10) rather than percentage-based. This means upgrading the Supabase instance size won't automatically scale Auth connections.

**Fix:** In Supabase Dashboard → Project Settings → Database → Auth connection pooling, switch to percentage-based allocation.

**Remediation:** https://supabase.com/docs/guides/deployment/going-into-prod

---

## ✅ Clean — No Action Required

- **Exposed Stripe keys:** All `sk_live_`/`sk_test_` references are in docs and `.env.example` (placeholders only). No secrets in `src/`.
- **`dangerouslySetInnerHTML`:** Not used in any source file. The `innerHTML` usage in invoice printing is safe (JSX-rendered, confirmed in prior audit).
- **`eval(`:** Not present anywhere in `src/`.
- **`console.log` in frontend:** Zero occurrences in `src/`. Edge function logs are expected and acceptable.
- **TypeScript `any`:** No `as any` casts found in `src/`. The `as unknown as ...` in `serviceWorker.ts` is a necessary narrowing for a non-standard browser API.
- **SUPABASE_SERVICE_ROLE in client:** Not found in `src/`.
- **Hardcoded passwords/secrets:** None found.
- **TODO/FIXME/HACK in src/:** None found.
- **RLS coverage:** All tables confirmed to have RLS enabled (verified in 2026-07-01 prior audit).

---

## Recent Commits (since last audit)

| Date | Commit | Summary |
|---|---|---|
| 2026-07-19 | `2ef4737` | fix(help): remove empty "Quick tips" section |
| 2026-07-19 | `143589f` | fix(help): guard Quick tips on tips.length > 0 |
| 2026-07-19 | `f20fe39` | fix(messages): tidy header layout |
| 2026-07-19 | `0c85e1f` | feat(tracking): job geo-tracking screen + geofence notification nav |
| 2026-07-19 | `5233560` | feat(location): pre-permission explainer, security warning help, first-use toast |

All recent commits are UI/UX improvements — no new security surface introduced.

---

## Action Items (Priority Order)

1. **[HIGH — do now]** Create a migration to `REVOKE EXECUTE` on `enforce_external_pay_tier`, `flag_offplatform_payment`, `lock_profile_billing_columns`, and `lock_tradie_billing_columns` from the `anon` role. Verify first whether they are trigger functions (`RETURN TRIGGER`) — if so, the revoke is still good practice even if the REST call would fail anyway.

2. **[MEDIUM]** Create a migration adding indexes on `custom_task_suggestions.reviewed_by` and `custom_task_suggestions.submitted_by`.

3. **[MEDIUM]** Consolidate the two `custom_task_suggestions` SELECT policies into one.

4. **[LOW — after 2–4 weeks production traffic]** Review unused indexes and drop those that remain unused.

5. **[LOW]** Switch Auth DB connection strategy to percentage-based in Supabase Dashboard.
