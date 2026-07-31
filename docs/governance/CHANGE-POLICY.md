# Change policy — what gets fixed without asking, and what needs the owner

Ratified 2026-08-01 by the owner (William Magson). This is the permission model
every agent and contributor follows when changing ConnecTradie. Classification
is mechanical: check the change against the path and category lists below. If
a change matches **any** Tier B trigger, the whole change is Tier B.

## Tier A — permitted without pre-approval

Fix it on a branch, prove it, open a PR. **The owner clicks merge** — nothing
reaches the live site without that click (Vercel deploys `master` on merge).

Categories:

- Copy and wording (sentence case, error messages, empty states, button↔toast
  verb consistency — per the v2 interface-copy rules in `CLAUDE.md`)
- Alignment, spacing, and styling **within** existing design-system rules
  (`ct-` tokens, radius scale, type scale — never new visual decisions)
- Dead links, wrong link targets, broken redirects, missing/duplicated page
  titles
- Measured contrast failures, fixed with the prescribed token pairings
- Documentation updates
- Test additions (files under `src/**/__tests__/`, `*.test.ts(x)`, `e2e/`)

Tier A changes must NOT touch:

- `supabase/functions/` (any money, auth, or notification handler)
- `supabase/migrations/` (schema, RLS)
- `src/contexts/AuthContext.tsx`
- `src/lib/releaseWindow.ts` (and its twin constant in
  `supabase/functions/auto-release-payments/index.ts`)
- `vercel.json` headers (CSP, rewrites)
- Route structure in `src/App.tsx` beyond correcting a link target or title
- `src/styles/mobile-responsive.css` beyond a single-selector fix for a
  confirmed regression (dismantling it is Tier B)

Every Tier A change still runs `npm run typecheck` and — if it touched any
query — `npm run check:columns`, plus the checker for its bug class (see
`PATCH-RUNBOOK.md`).

## Tier B — owner approval required, with pros and cons

No code until the owner approves the item in
[DECISIONS-PENDING.md](DECISIONS-PENDING.md). Each entry gives a plain-English
what/why, pros, cons, risk of doing nothing, effort, and a recommendation.

Triggers (any one is sufficient):

- Money paths: Stripe, escrow, payouts, fees, refunds, invoicing amounts
- Auth, session handling, or anything crossing a user boundary
- RLS policies, migrations, schema of any kind
- Navigation restructures, route additions/deletions, page deletions
- CSP or security-header changes (including report-only → enforce)
- Dismantling or restructuring `mobile-responsive.css`
- New features or anything that changes what a user sees mid-flow
- Third-party integrations, new dependencies, spending money
- Anything the classifier is unsure about — unsure means Tier B

## Not bugs — do not "fix"

- **Escrow release on client inaction** is ratified policy, not a defect
  (see the escrow release policy in `CLAUDE.md`; finding #2 in
  `AUDIT-REPORT-2026-07-30.md`). A generic "client-initiated release only"
  audit check fails against this and the check is wrong.
- The 7 deliberate typecheck exclusions (see `project_typecheck_debt` notes) —
  e.g. siteGeofence, where the runtime is correct.
- The `ct-` prefix and the three colour-literal exemptions listed in
  `CLAUDE.md` (print/PDF/email HTML generators, Stripe Elements iframe,
  third-party brand marks).

## Audit conduct

Per `CLAUDE.md`: audits report **everything** found, unfiltered. Severity
ranking and Tier classification happen in a separate pass after the full list
exists. No self-review passes, no verification subagents.
