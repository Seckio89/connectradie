# Platform Audit Report — 2026-07-01

**Method:** Static analysis (`tsc`, ESLint over `src/`), live Supabase advisors (security + performance) against project `uoqygmizupdpanplpvor`, and migration/secret review. Payments and edge-function internals were assessed via advisors and prior scans, not a full line-by-line re-review this run — see notes. Low-risk lint fixes were committed to branch `auto-fixes/2026-07-01`.

## Summary

| Dimension | Score | Weight | Weighted | Status |
|-----------|-------|--------|----------|--------|
| Security & Auth | 85% | 25% | 21.3% | 🟡 |
| Payments & Stripe | 85% | 25% | 21.3% | 🟡 |
| Database & RLS | 90% | 20% | 18.0% | 🟢 |
| TypeScript Safety | 95% | 10% | 9.5% | 🟢 |
| UI & Design System | 90% | 5% | 4.5% | 🟢 |
| Navigation | 90% | 5% | 4.5% | 🟢 |
| Test Coverage | 65% | 10% | 6.5% | 🔴 |
| **Overall** | **~85.6%** | | | 🟡 |

## Detailed results

### Security & Auth — 85% 🟡
No CRITICAL/HIGH findings. No exposed secrets in `src/`; `.env` git-ignored and untracked; service-role key referenced only in edge functions. Live advisors report **no** ERROR-level lints. WARN-level items lower the score: 5 public buckets allow file listing, and several `SECURITY DEFINER` RPCs are callable by `anon`/`authenticated`. See findings #1, #2.

### Payments & Stripe — 85% 🟡
No new criticals surfaced. `stripe-webhook` runs with `verify_jwt = false` by design and performs its own signature verification (standard pattern). Not exhaustively re-audited per-function this run. Code-quality issues flagged in payment files (`Payouts.tsx` unused-expressions, `PaymentHistory.tsx` unused vars + stray `console.info`) are logged, not auto-fixed, per policy. See findings #3, #5, #6.

### Database & RLS — 90% 🟢
RLS enabled across public tables (no advisor ERRORs). **No missing foreign-key indexes.** Counter-finding: 47 indexes are reported **unused** — candidates for removal (schema change; not auto-applied). See finding #10.

### TypeScript Safety — 95% 🟢
`tsc --noEmit --skipLibCheck` passes with 0 errors. Only one `: any` match in the codebase, and it's inside a comment (not a real type).

### UI & Design System — 90% 🟢
Spot checks align with the design system (emerald/secondary palette, Tailwind-only, card/badge patterns). No systemic deviations found this run.

### Navigation — 90% 🟢
No dead nav links surfaced in static review. `App.tsx:34` has an unused `Jobs` binding (routing area) left untouched pending review.

### Test Coverage — 65% 🔴
14 test/spec files against 222 source files. Many edge functions and critical flows (escrow release, payment lifecycle) lack visible coverage. Recommend prioritizing E2E for auth, search, and the job lifecycle.

## Top findings

1. **[MEDIUM]** 5 public storage buckets allow listing all files (advisor 0025).
2. **[MEDIUM]** `SECURITY DEFINER` RPCs callable by anon/authenticated incl. `delete_user_account`, `employer_*_member` (advisor 0029).
3. **[MEDIUM]** `Payouts.tsx` interpolates a user template into `innerHTML`/`<img src>` for PDF export — validate/escape.
4. **[MEDIUM]** 46 `react-hooks/exhaustive-deps` warnings — review individually; unsafe to bulk-fix.
5. **[LOW→infra]** 47 unused DB indexes — review for removal to cut write overhead.

## Recommendations

**This sprint:** confirm authorization inside the `SECURITY DEFINER` RPCs (esp. `delete_user_account`, `employer_*_member`); tighten the public-bucket SELECT policies; validate the `Payouts.tsx` PDF template input.
**Next sprint:** raise test coverage on payment/escrow flows; work through the `exhaustive-deps` warnings; clean remaining dead code (finding #7) and payment-file lint (#6).
**Backlog:** review the 47 unused indexes; add `.gitattributes` (`* text=auto`) to fix mixed line endings; switch Supabase Auth to percentage-based connection allocation.

## Score trend
Prior reports exist (`AUDIT-REPORT-2026-06-12.md`, `PLATFORM-AUDIT-REPORT.md`). The source is in solid shape — earlier cycles cleared most low-hanging fruit; this run removed the remaining safe lint debt and surfaced storage/RPC hardening as the main open items.

## Next recommended action
Confirm internal authorization on the anon/authenticated-callable `SECURITY DEFINER` functions — the highest-leverage security item.
